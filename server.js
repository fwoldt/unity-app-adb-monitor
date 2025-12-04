import express from "express";
import cors from "cors";
import { execSync, spawn } from "child_process";
import { WebSocketServer } from 'ws';
import http from 'http';
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import fsPromises from "fs/promises";
import { CONFIG } from "./config.js";
import { UI_TESTS, TEST_ENDPOINTS, TEST_UTILS } from "./tests.config.js";
import logger from './logger.js';
import { exec } from "child_process";
import { promisify } from "util";
import { ADB_COMMANDS } from "./adbCommands.js";
import { LineBuffer } from "./LineBuffer.js";
import { logStreamManager } from "./LogStreamManager.js";
import { telegramNotifier } from "./TelegramNotifier.js";
import { dumpUI, findElementByBounds, tapElement, runTestScenario } from "./uiAutomation.js";
import { startNetworkDiscovery, stopNetworkDiscovery, getConnectedNetworkDevices } from "./networkDiscovery.js";
import { deviceManager } from "./deviceManager.js";
import { cxtBoxManager } from "./cxtBoxManager.js";
const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json()); // Parse JSON request bodies

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE = CONFIG.PACKAGE;
const SERVICE_NAME = CONFIG.SERVICE_NAME;
const REFRESH_INTERVAL = CONFIG.REFRESH_INTERVAL;

let previousStatus = {};
const logcatProcesses = {}; // track logcat processes per device
const lineBuffers = {}; // line buffers per device

function adbExec(cmd) {
  try { 
    return execSync(cmd).toString().trim(); 
  } catch (err) {
    logger.error(`ADB command failed: ${cmd}`);
    logger.error(`Error details: ${err.message}`);
    if (err.stderr) {
      logger.error(`stderr: ${err.stderr.toString()}`);
    }
    if (err.stdout) {
      logger.debug(`stdout: ${err.stdout.toString()}`);
    }
    logger.error(`Exit code: ${err.status || 'unknown'}`);
    return ""; 
  }
}

async function adbExecAsync(cmd) {
  try {
    const { stdout } = await execAsync(cmd);
    return stdout.toString().trim();
  } catch (err) {
    // Don't log errors for pidof commands - they fail when no process is found (normal behavior)
    if (cmd.includes('pidof')) {
      logger.debug(`pidof returned no result for: ${cmd}`);
    } else {
      logger.error(`ADB command failed: ${cmd}`);
      logger.error(`Error details: ${err.message}`);
      if (err.stderr) {
        logger.error(`stderr: ${err.stderr.toString()}`);
      }
    }
    
    // Return stdout even if command "failed" (e.g., pidof returns exit code 1 when no process found)
    if (err.stdout) {
      return err.stdout.toString().trim();
    }
    return "";
  }
}

function getDevices() {
  const output = adbExec(ADB_COMMANDS.DEVICES);
  const lines = output.split("\n").slice(1).filter(l => l.trim());
  return Array.isArray(lines) ? lines.map(line => line.split("\t")[0]).filter(Boolean) : [];
}

async function getDeviceName(deviceId) {
  const [manufacturer, model, androidVersion] = await Promise.all([
    adbExecAsync(ADB_COMMANDS.GETPROP(deviceId, "ro.product.manufacturer")),
    adbExecAsync(ADB_COMMANDS.GETPROP(deviceId, "ro.product.model")),
    adbExecAsync(ADB_COMMANDS.GETPROP(deviceId, "ro.build.version.release"))
  ]);
  
  const deviceName = `${manufacturer} ${model}`.trim() || deviceId;
  const androidVer = androidVersion.trim();
  
  if (androidVer) {
    return `${deviceName} (Android ${androidVer})`;
  }
  
  return deviceName;
}

async function getMacAddress(deviceId) {
  try {
    const macOutput = await adbExecAsync(ADB_COMMANDS.MAC_ADDRESS(deviceId));
    const macMatch = macOutput.match(/link\/ether\s+([a-fA-F0-9:]{17})/);
    return macMatch ? macMatch[1] : null;
  } catch (error) {
    logger.debug(`Failed to get MAC address for ${deviceId}: ${error.message}`);
    return null;
  }
}

function elapsedTimeToTimestamp(etime) {
  let days=0, hours=0, minutes=0, seconds=0;
  let daySplit = etime.split("-");
  let timePart = daySplit.length===2 ? daySplit[1] : daySplit[0];
  if(daySplit.length===2) days=parseInt(daySplit[0]);
  const parts = timePart.split(":").map(p=>parseInt(p));
  if(parts.length===3){hours=parts[0];minutes=parts[1];seconds=parts[2];}
  else if(parts.length===2){hours=0;minutes=parts[0];seconds=parts[1];}
  else{hours=0;minutes=0;seconds=parts[0];}
  const totalMs = ((days*24+hours)*60+minutes)*60*1000 + seconds*1000;
  return new Date(Date.now()-totalMs).toLocaleString();
}

function formatMemoryMB(kb) {
  if (kb === null || kb === undefined) return null;
  const mb = kb / 1024;
  if (mb >= 1000) {
    return (mb / 1024).toFixed(1); // Return just the number for GB
  } else if (mb >= 100) {
    return Math.round(mb).toString(); // Return just the number for MB ≥ 100
  } else {
    return mb.toFixed(1); // Return just the number for MB < 100
  }
}

async function getServiceStatus(deviceId) {
  // First check if the main app package is running via pidof
  const pidofOutput = await adbExecAsync(ADB_COMMANDS.PIDOF(deviceId, PACKAGE));
  const packageRunning = pidofOutput && pidofOutput.trim() !== '';
  
  if (!packageRunning) {
    logger.debug(`Package ${PACKAGE} not running on device ${deviceId}`);
    return { running: false, serviceCheckFailed: true, reason: 'package_not_running' };
  }
  
  // Package is running, now check service details
  const cmd = `adb -s ${deviceId} shell "dumpsys activity services ${SERVICE_NAME}"`;
  const output = await adbExecAsync(cmd);
  
  // Check if service is specifically registered and running
  if (output && output.includes('ServiceRecord')) {
    // Service is registered, check if it's running
    const appMatch = output.match(/app=ProcessRecord\{[^\s]+\s+(\d+):/);
    const serviceRunning = !!appMatch;
    
    if (serviceRunning) {
      // Service is running, extract details
      const pid = appMatch[1];
      
      // Extract package name and timing info
      const packageMatch = output.match(/packageName=([^\s]+)/);
      const packageName = packageMatch ? packageMatch[1] : PACKAGE;
      const createTimeMatch = output.match(/createTime=([^\s]+)/);
      const lastActivityMatch = output.match(/lastActivity=([^\s]+)/);
      const restartTimeMatch = output.match(/restartTime=([^\s]+)/);
      
      // Get memory info
      let pss = null, rss = null;
      try {
        const memInfoRaw = await adbExecAsync(ADB_COMMANDS.MEMINFO(deviceId, packageName));
        
        // Parse Android meminfo format: "TOTAL   193018   111536    72312       86"
        const totalMatch = memInfoRaw.match(/TOTAL\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (totalMatch) {
          pss = parseInt(totalMatch[1]); // First number is PSS Total
          // Private Dirty + Private Clean could be considered as RSS equivalent
          const privateDirty = parseInt(totalMatch[2]);
          const privateClean = parseInt(totalMatch[3]); 
          rss = privateDirty + privateClean; // Approximate RSS
        }
        
        logger.debug(`Memory for ${packageName}: PSS=${pss}KB, RSS=${rss}KB`);
      } catch (memError) {
        logger.debug(`Memory info failed for ${packageName}: ${memError.message}`);
      }
      
      return { 
        running: true, 
        pid, 
        pss: formatMemoryMB(pss),
        rss: formatMemoryMB(rss),
        serviceName: SERVICE_NAME,
        packageName,
        createTime: createTimeMatch ? createTimeMatch[1] : null,
        lastActivity: lastActivityMatch ? lastActivityMatch[1] : null,
        restartTime: restartTimeMatch ? restartTimeMatch[1] : null,
        serviceCheckFailed: false, 
        reason: 'service_running' 
      };
    } else {
      logger.debug(`Service ${SERVICE_NAME} registered but not running on device ${deviceId}`);
    }
  } else {
    logger.debug(`Service ${SERVICE_NAME} not registered on device ${deviceId}, but package is running`);
  }
  
  // Service not running or not registered, but package is running
  // Return as running with package PID and get memory info
  const pids = pidofOutput.trim().split('\n').filter(p => p.trim());
  const pid = pids[0];
  
  // Get memory info using the package name
  let pss = null, rss = null;
  try {
    const memInfoRaw = await adbExecAsync(ADB_COMMANDS.MEMINFO(deviceId, PACKAGE));
    
    // Parse Android meminfo format: "TOTAL   193018   111536    72312       86"
    const totalMatch = memInfoRaw.match(/TOTAL\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (totalMatch) {
      pss = parseInt(totalMatch[1]); // First number is PSS Total
      // Private Dirty + Private Clean could be considered as RSS equivalent
      const privateDirty = parseInt(totalMatch[2]);
      const privateClean = parseInt(totalMatch[3]); 
      rss = privateDirty + privateClean; // Approximate RSS
    }
    
    logger.debug(`Memory for ${PACKAGE}: PSS=${pss}KB, RSS=${rss}KB`);
  } catch (memError) {
    logger.debug(`Memory info failed for ${PACKAGE}: ${memError.message}`);
  }
  
  // Try to get process start time as alternative to service createTime
  let processStartTime = null;
  try {
    const psCmd = ADB_COMMANDS.PS(deviceId, pid);
    const psOutput = await adbExecAsync(psCmd);
    // Extract ETIME (elapsed time) from ps output 
    const etimeMatch = psOutput.match(/(\d+:\d+:\d+|\d+:\d+|-\d+:\d+:\d+)/);
    if (etimeMatch) {
      processStartTime = `Process uptime: ${etimeMatch[1]}`;
    }
  } catch (psError) {
    logger.debug(`Process time failed: ${psError.message}`);
  }

  return { 
    running: true, 
    pid,
    pss: formatMemoryMB(pss),
    rss: formatMemoryMB(rss),
    serviceName: SERVICE_NAME,
    packageName: PACKAGE,
    createTime: processStartTime,
    lastActivity: 'Package mode - no service data',
    restartTime: null,
    serviceCheckFailed: true,
    reason: 'package_running_service_unknown'
  };
}

async function getAppVersion(deviceId){
  const output = await adbExecAsync(ADB_COMMANDS.PACKAGE_INFO(deviceId, PACKAGE));
  const codeMatch = output.match(/versionCode=(\d+)\b/);
  const nameMatch = output.match(/versionName=([\S]+)/);
  return { versionCode: codeMatch ? parseInt(codeMatch[1]) : null, versionName: nameMatch ? nameMatch[1] : null };
}

// Crash log filename
function getDeviceCrashLogFile(deviceId){
  const safeId = deviceId.replace(/[:\/\\?%*|"<>]/g,"_");
  return path.join(__dirname, `${safeId}-crash-log.txt`);
}

// App log filename
function getDeviceAppLogFile(deviceId){
  const safeId = deviceId.replace(/[:\/\\?%*|"<>]/g,"_");
  return path.join(__dirname, `${safeId}-app-log.txt`);
}

// Apply log filter based on configuration
function shouldLogLine(line) {
  if (!line || line.trim() === '') return false;
  
  const filterConfig = CONFIG.LOG_FILTER;
  
  // Check if line matches the filter pattern
  let matchesPattern = false;
  if (filterConfig.useRegex) {
    try {
      const regex = new RegExp(filterConfig.pattern, 'i');
      matchesPattern = regex.test(line);
    } catch (err) {
      logger.error(`Invalid regex pattern: ${filterConfig.pattern}`);
      matchesPattern = line.includes(filterConfig.pattern);
    }
  } else {
    matchesPattern = line.includes(filterConfig.pattern);
  }
  
  // Check additional tags
  if (!matchesPattern && filterConfig.tags.length > 0) {
    matchesPattern = filterConfig.tags.some(tag => line.includes(tag));
  }
  
  // Check log level if pattern matches
  if (matchesPattern && filterConfig.minLevel !== 'V') {
    const levels = ['V', 'D', 'I', 'W', 'E', 'F'];
    const minLevelIndex = levels.indexOf(filterConfig.minLevel);
    
    // Extract log level from line (format: "11-11 10:00:01.234 D/Tag: message")
    const levelMatch = line.match(/\s([VDIWEF])\//);
    if (levelMatch) {
      const lineLevel = levelMatch[1];
      const lineLevelIndex = levels.indexOf(lineLevel);
      if (lineLevelIndex !== -1 && lineLevelIndex < minLevelIndex) {
        return false;
      }
    }
  }
  
  return matchesPattern;
}

// Format log line with timestamp
function formatLogLine(line) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${line}`;
}

// Start logcat for device and append filtered logs
function startLogcat(deviceId){
  if(logcatProcesses[deviceId]) return; // already running
  
  logger.info(`Starting logcat for device ${deviceId}`);
  const pid = adbExec(`adb -s ${deviceId} shell pidof ${PACKAGE}`);
  if(!pid) {
    logger.warn(`Cannot start logcat for ${deviceId}: app not running (no PID)`);
    return;
  }

  // Store the PID we're monitoring
  const monitoringPid = pid;
  logger.info(`Monitoring ${deviceId} with PID ${monitoringPid}`);

  // Note: Using --pid means logcat will stop capturing if app restarts with new PID
  // The /status endpoint will detect the restart and create a new logcat process
  const logProcess = spawn("adb", [
    "-s", deviceId, 
    "logcat",
    "-v", "time", // Include timestamps
    "--pid=" + monitoringPid
  ]);
  
  const lineBuffer = new LineBuffer();
  lineBuffers[deviceId] = lineBuffer;
  
  const file = getDeviceAppLogFile(deviceId);
  
  // Store PID for monitoring
  logProcess.monitoredPid = monitoringPid;

  logProcess.stdout.on("data", async (data) => {
    try {
      const lines = lineBuffer.push(data.toString());
      const filteredLines = lines.filter(shouldLogLine);
      
      if (filteredLines.length > 0) {
        logger.debug(`Processing ${filteredLines.length} log lines for device ${deviceId}`);
        const formattedLines = filteredLines.map(formatLogLine).join('\n') + '\n';
        
        // Use async stream writing
        await logStreamManager.writeToStream(deviceId, file, formattedLines);
      }
    } catch (err) {
      logger.error(`Error processing logcat data for ${deviceId}: ${err.message}`);
    }
  });
  
  logProcess.stderr.on("data", data => {
    logger.error(`Logcat stderr [${deviceId}]: ${data.toString().trim()}`);
  });
  
  logProcess.on("close", async (code) => {
    logger.info(`Logcat process for ${deviceId} exited with code ${code}`);
    
    // Flush any remaining buffered data
    if (lineBuffers[deviceId]) {
      const remaining = lineBuffers[deviceId].flush();
      if (remaining && shouldLogLine(remaining)) {
        try {
          await logStreamManager.writeToStream(deviceId, file, formatLogLine(remaining) + '\n');
        } catch (err) {
          logger.error(`Error writing final buffer for ${deviceId}: ${err.message}`);
        }
      }
      delete lineBuffers[deviceId];
    }
    
    // Close the stream
    await logStreamManager.closeStream(deviceId);
    delete logcatProcesses[deviceId];
  });
  
  logProcess.on("error", (err) => {
    logger.error(`Logcat process error for ${deviceId}: ${err.message}`);
    delete logcatProcesses[deviceId];
    delete lineBuffers[deviceId];
  });
  
  logcatProcesses[deviceId] = logProcess;
}

// Stop logcat for device
async function stopLogcat(deviceId) {
  const logProcess = logcatProcesses[deviceId];
  if (!logProcess) return;
  
  logger.info(`Stopping logcat for device ${deviceId}`);
  
  return new Promise((resolve) => {
    logProcess.once('close', () => {
      resolve();
    });
    
    // Kill the process
    logProcess.kill('SIGTERM');
    
    // Force kill after timeout
    setTimeout(() => {
      if (logcatProcesses[deviceId]) {
        logProcess.kill('SIGKILL');
      }
    }, 5000);
  });
}

// Write crash log entry with error handling and send Telegram notification
async function writeCrashLog(deviceId, deviceName, event, deviceInfo = {}) {
  const logFile = getDeviceCrashLogFile(deviceId);
  const entry = `[${new Date().toISOString()}] Service ${SERVICE_NAME} ${event} on ${deviceName}\n`;
  try {
    await fsPromises.appendFile(logFile, entry, 'utf8');
    logger.info(`Crash log entry written for ${deviceId}: ${event}`);
    
    // Send Telegram notification with anti-spam protection
    const notifyResult = await telegramNotifier.notify(deviceId, deviceName, { ...deviceInfo, event });
    if (notifyResult.success) {
      logger.info(`Telegram alert sent for ${event} on ${deviceName} on attempt ${notifyResult.attempt}`);
    } else if (notifyResult.reason === 'cooldown') {
      logger.info(`Telegram alert skipped for ${event} on ${deviceName} (cooldown: ${notifyResult.remainingSeconds}s remaining)`);
    } else if (notifyResult.reason === 'send_failed') {
      logger.error(`Telegram alert failed for ${event} on ${deviceName}: ${notifyResult.error}`);
    }
  } catch (err) {
    logger.error(`Failed to write crash log for ${deviceId}: ${err.message}`);
  }
}

// Status endpoint
app.get("/status", async (req, res) => {
  try {
    const devices = getDevices();
    const statusPromises = devices.map(async (id) => {
      const deviceName = await getDeviceName(id);
      const deviceIP = id.includes(":") ? id.split(":")[0] : id;
      const [serviceStatus, appVersion, macAddress] = await Promise.all([
        getServiceStatus(id),
        getAppVersion(id),
        getMacAddress(id)
      ]);
      const deviceInfo = { ...serviceStatus, ...appVersion, device: id, name: deviceName, ip: deviceIP, macAddress };

      const prev = previousStatus[id];

      // SERVICE CHECK FAILED - log if service is not running
      if (deviceInfo.serviceCheckFailed && (!prev || !prev.serviceCheckFailed)) {
        await writeCrashLog(id, deviceName, `SERVICE_CHECK_FAILED - ${SERVICE_NAME} not active or command failed`);
        logger.warn(`Service ${SERVICE_NAME} check failed for ${deviceName} (${id})`);
      }

      // STOPPED - only log if we have previous state and it was running
      if (prev && prev.running && !deviceInfo.running) {
        await writeCrashLog(id, deviceName, 'STOPPED', deviceInfo);
        
        // Stop logcat process
        await stopLogcat(id);
      }

      // STARTED - send notification when app starts
      if (prev && !prev.running && deviceInfo.running) {
        await writeCrashLog(id, deviceName, 'STARTED', deviceInfo);
      }

      previousStatus[id] = deviceInfo;

      // Ensure logcat is running if app is running
      if (deviceInfo.running) {
        const logcatProcess = logcatProcesses[id];
        
        // Start logcat if not running
        if (!logcatProcess) {
          startLogcat(id);
        } 
        // Restart logcat if PID changed (app restarted)
        else if (logcatProcess.monitoredPid && logcatProcess.monitoredPid !== deviceInfo.pid) {
          logger.warn(`PID changed for ${id} (${logcatProcess.monitoredPid} → ${deviceInfo.pid}). Restarting logcat...`);
          await stopLogcat(id);
          startLogcat(id);
        }
      }

      return deviceInfo;
    });

    const statuses = await Promise.all(statusPromises);
    res.json(statuses);
  } catch (err) {
    logger.error(`Error in /status endpoint: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Screenshot cache
const screenshotCache = new Map();

// Helper function to wake device and take screenshot
async function wakeAndScreenshot(deviceId) {
  try {
    logger.debug(`Waking device and taking screenshot: ${deviceId}`);
    
    // Check if screen is already on
    try {
      const powerState = execSync(ADB_COMMANDS.CHECK_SCREEN_STATE(deviceId), { timeout: 3000 }).toString();
      const isScreenOn = powerState.includes('ON') || powerState.includes('state=ON');
      
      if (!isScreenOn) {
        logger.debug(`Screen is off, waking device: ${deviceId}`);
        // Wake up the device
        execSync(ADB_COMMANDS.WAKE_SCREEN(deviceId), { timeout: 3000 });
        
        // Wait a moment for the screen to turn on
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to unlock with swipe (works for most unlocked devices)
        try {
          execSync(ADB_COMMANDS.SWIPE_UNLOCK(deviceId), { timeout: 3000 });
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (unlockError) {
          logger.debug(`Swipe unlock failed (may not be needed): ${unlockError.message}`);
        }
      }
    } catch (powerError) {
      logger.debug(`Could not check power state, trying to wake anyway: ${powerError.message}`);
      // If we can't check power state, just try to wake
      try {
        execSync(ADB_COMMANDS.WAKE_SCREEN(deviceId), { timeout: 3000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (wakeError) {
        logger.debug(`Wake command failed: ${wakeError.message}`);
      }
    }
    
    // Take screenshot
    const screenshot = execSync(ADB_COMMANDS.SCREENSHOT(deviceId), { 
      encoding: 'buffer',
      timeout: 10000 
    });
    
    return screenshot;
    
  } catch (error) {
    logger.error(`Wake and screenshot failed for ${deviceId}: ${error.message}`);
    throw error;
  }
}

// Screenshot endpoint
app.get("/screenshot/:deviceId", async (req, res) => {
  const { deviceId } = req.params;
  const { wake = 'true' } = req.query; // Allow disabling wake with ?wake=false
  
  if (!CONFIG.SCREENSHOTS.enabled) {
    return res.status(404).send("Screenshots disabled");
  }
  
  try {
    // Check cache first
    const cacheKey = deviceId;
    const cached = screenshotCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONFIG.SCREENSHOTS.cacheDuration * 1000) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', `public, max-age=${CONFIG.SCREENSHOTS.cacheDuration}`);
      return res.send(cached.data);
    }
    
    let screenshot;
    
    if (wake === 'true') {
      // Wake device and take screenshot
      screenshot = await wakeAndScreenshot(deviceId);
    } else {
      // Take screenshot without waking
      logger.debug(`Taking screenshot without wake for device: ${deviceId}`);
      screenshot = execSync(ADB_COMMANDS.SCREENSHOT(deviceId), { 
        encoding: 'buffer',
        timeout: 10000 
      });
    }
    
    // Cache the screenshot
    screenshotCache.set(cacheKey, {
      data: screenshot,
      timestamp: Date.now()
    });
    
    // Clean old cache entries (keep only last 50 screenshots)
    if (screenshotCache.size > 50) {
      const entries = Array.from(screenshotCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, entries.length - 50);
      toDelete.forEach(([key]) => screenshotCache.delete(key));
    }
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', `public, max-age=${CONFIG.SCREENSHOTS.cacheDuration}`);
    res.send(screenshot);
    
  } catch (error) {
    logger.error(`Screenshot failed for ${deviceId}: ${error.message}`);
    res.status(500).send(`Screenshot failed: ${error.message}`);
  }
});

// Serve dashboard and logs
app.use(express.static(__dirname));
app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"index.html")));

// Crash logs endpoint
app.get("/logs/:deviceId", async (req,res)=>{
  const file = getDeviceCrashLogFile(req.params.deviceId);
  try { res.send(await fsPromises.readFile(file,"utf-8") || "No crash logs available."); }
  catch { res.status(404).send("No crash logs available."); }
});

// App logs endpoint (filtered by "ExpoPowService")
app.get("/applogs/:deviceId", async (req,res)=>{
  const file = getDeviceAppLogFile(req.params.deviceId);
  try { 
    const content = await fsPromises.readFile(file,"utf-8");
    res.send(content || "No app logs containing 'ExpoPowService' found."); 
  }
  catch { res.status(404).send("No app logs available."); }
});

// Restart app endpoint
app.post('/restart-app', (req, res) => {
  const deviceId = req.query.deviceId;

  if (!deviceId) {
    return res.status(400).json({ message: 'Device ID is required.' });
  }

  try {
    // First, force stop the app
    const forceStopCmd = ADB_COMMANDS.FORCE_STOP(deviceId, PACKAGE);
    logger.info(`Force stopping app on ${deviceId}: ${forceStopCmd}`);
    adbExec(forceStopCmd);
    
    // Then, start the app
    const startCmd = ADB_COMMANDS.START_APP(deviceId, PACKAGE);
    logger.info(`Starting app on ${deviceId}: ${startCmd}`);
    adbExec(startCmd);
    
    res.json({ message: `App on device ${deviceId} restarted successfully.` });
  } catch (error) {
    logger.error(`Failed to restart app on ${deviceId}: ${error.message}`);
    res.status(500).json({ message: 'Failed to restart app.', error: error.message });
  }
});

// Device Management Endpoints (Unity Forum Commands)

// Set battery to 100%
app.post('/device/:deviceId/battery-100', (req, res) => {
  try {
    const { deviceId } = req.params;
    logger.info(`Setting battery to 100% on device: ${deviceId}`);
    
    const result = adbExec(ADB_COMMANDS.SET_BATTERY_100(deviceId));
    res.json({ message: 'Battery set to 100%', deviceId, output: result });
  } catch (error) {
    logger.error(`Battery set failed for ${deviceId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Reset battery
app.post('/device/:deviceId/battery-reset', (req, res) => {
  try {
    const { deviceId } = req.params;
    logger.info(`Resetting battery on device: ${deviceId}`);
    
    const result = adbExec(ADB_COMMANDS.RESET_BATTERY(deviceId));
    res.json({ message: 'Battery reset', deviceId, output: result });
  } catch (error) {
    logger.error(`Battery reset failed for ${deviceId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Unity stop
app.post('/device/:deviceId/unity-stop', (req, res) => {
  try {
    const { deviceId } = req.params;
    logger.info(`Stopping Unity app on device: ${deviceId}`);
    
    const result = adbExec(ADB_COMMANDS.UNITY_STOP(deviceId, PACKAGE));
    res.json({ message: 'Unity app stopped', deviceId, output: result });
  } catch (error) {
    logger.error(`Unity stop failed for ${deviceId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Unity restart (stop + start)
app.post('/device/:deviceId/unity-restart', (req, res) => {
  try {
    const { deviceId } = req.params;
    logger.info(`Restarting Unity app on device: ${deviceId}`);
    
    // Force stop first
    adbExec(ADB_COMMANDS.FORCE_STOP(deviceId, PACKAGE));
    
    // Wait a moment then start
    setTimeout(() => {
      const result = adbExec(ADB_COMMANDS.START_APP(deviceId, PACKAGE));
      res.json({ message: 'Unity app restarted', deviceId, output: result });
    }, 1000);
    
  } catch (error) {
    logger.error(`Unity restart failed for ${deviceId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Set standard resolution
app.post('/device/:deviceId/set-resolution', (req, res) => {
  try {
    const { deviceId } = req.params;
    const { width = 1080, height = 2220, density = 420, fontScale = 1.1 } = req.body;
    logger.info(`Setting resolution on device: ${deviceId} to ${width}x${height}`);
    
    const result = adbExec(ADB_COMMANDS.SET_RESOLUTION(deviceId, width, height, density, fontScale));
    res.json({ 
      message: 'Resolution set', 
      deviceId, 
      resolution: `${width}x${height}`,
      density,
      fontScale,
      output: result 
    });
  } catch (error) {
    logger.error(`Resolution set failed for ${deviceId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Reboot device
app.post('/device/:deviceId/reboot', (req, res) => {
  try {
    const { deviceId } = req.params;
    logger.info(`Rebooting device: ${deviceId}`);
    
    const result = adbExec(ADB_COMMANDS.DEVICE_REBOOT(deviceId));
    res.json({ message: 'Device reboot initiated', deviceId, output: result });
  } catch (error) {
    logger.error(`Device reboot failed for ${deviceId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Uninstall Unity app
app.post('/device/:deviceId/uninstall-unity', (req, res) => {
  try {
    const { deviceId } = req.params;
    logger.info(`Uninstalling Unity app on device: ${deviceId}`);
    
    const result = adbExec(ADB_COMMANDS.UNINSTALL_UNITY(deviceId, PACKAGE));
    res.json({ message: 'Unity app uninstalled', deviceId, output: result });
  } catch (error) {
    logger.error(`Unity uninstall failed for ${deviceId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Batch operations for all devices
app.post('/devices/batch/:action', async (req, res) => {
  try {
    const { action } = req.params;
    const devices = getDevices();
    
    if (devices.length === 0) {
      return res.status(400).json({ error: 'No devices connected' });
    }
    
    logger.info(`Running batch ${action} on ${devices.length} devices`);
    const results = [];
    
    for (const deviceId of devices) {
      try {
        let result;
        switch (action) {
          case 'battery-100':
            result = adbExec(ADB_COMMANDS.SET_BATTERY_100(deviceId));
            break;
          case 'unity-stop':
            result = adbExec(ADB_COMMANDS.UNITY_STOP(deviceId, PACKAGE));
            break;
          case 'unity-restart':
            adbExec(ADB_COMMANDS.FORCE_STOP(deviceId, PACKAGE));
            await new Promise(resolve => setTimeout(resolve, 1000));
            result = adbExec(ADB_COMMANDS.START_APP(deviceId, PACKAGE));
            break;
          case 'set-resolution':
            result = adbExec(ADB_COMMANDS.SET_RESOLUTION(deviceId));
            break;
          case 'reboot':
            result = adbExec(ADB_COMMANDS.DEVICE_REBOOT(deviceId));
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        
        results.push({ deviceId, success: true, output: result });
      } catch (error) {
        results.push({ deviceId, success: false, error: error.message });
      }
    }
    
    res.json({ 
      action,
      devicesProcessed: devices.length,
      results 
    });
    
  } catch (error) {
    logger.error(`Batch operation failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.use((req, res, next) => {
  req.headers['userId'] = 'default-user-id'; // Replace with dynamic user ID logic if needed
  next();
});

// Device management endpoints

// Get all devices from CSV
app.get('/devices/list', async (req, res) => {
  try {
    const devices = deviceManager.readDevices();
    res.json({ devices });
  } catch (err) {
    logger.error(`Error getting device list: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Scan for new devices and update status
app.post('/devices/scan', async (req, res) => {
  try {
    const result = await deviceManager.addNewDevices();
    res.json({
      newDevices: result.newDevices,
      totalDevices: result.allDevices.length,
      message: `Found ${result.newDevices.length} new devices`
    });
  } catch (err) {
    logger.error(`Error scanning devices: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Scan for CXT boxes in IP range
app.post('/boxes/scan', async (req, res) => {
  try {
    const { ipRange = '192.168.44', startIP = 1, endIP = 254, port = 22223 } = req.body;
    logger.info(`Starting box scan: ${ipRange}.${startIP}-${endIP}:${port}`);
    
    const foundBoxes = await cxtBoxManager.scanBoxes(ipRange, startIP, endIP, port);
    
    res.json({
      foundBoxes,
      totalFound: foundBoxes.length,
      message: `Found ${foundBoxes.length} CXT boxes in range ${ipRange}.${startIP}-${endIP}:${port}`
    });
  } catch (err) {
    logger.error(`Error scanning boxes: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Connect to all discovered boxes
app.post('/boxes/connect-all', async (req, res) => {
  try {
    const connectedBoxes = await cxtBoxManager.connectToAllBoxes();
    
    res.json({
      connectedBoxes,
      totalConnected: connectedBoxes.length,
      message: `Connected to ${connectedBoxes.length} CXT boxes`
    });
  } catch (err) {
    logger.error(`Error connecting to boxes: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get box status
app.get('/boxes/status', (req, res) => {
  try {
    const status = cxtBoxManager.getBoxStatus();
    res.json(status);
  } catch (err) {
    logger.error(`Error getting box status: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Update device status (online/offline)
app.post('/devices/update-status', async (req, res) => {
  try {
    const devices = await deviceManager.updateDeviceStatus();
    const onlineCount = devices.filter(d => d.status === 'online').length;
    const offlineCount = devices.filter(d => d.status === 'offline').length;
    
    res.json({
      devices,
      summary: {
        total: devices.length,
        online: onlineCount,
        offline: offlineCount
      }
    });
  } catch (err) {
    logger.error(`Error updating device status: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Update Unity data for a device
app.post('/devices/:deviceId/unity', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { unityLicense, unityEmail } = req.body;
    
    const success = deviceManager.updateUnityData(deviceId, unityLicense, unityEmail);
    
    if (success) {
      res.json({ 
        message: 'Unity data updated successfully',
        deviceId,
        unityLicense: unityLicense || 'unchanged',
        unityEmail: unityEmail || 'unchanged'
      });
    } else {
      res.status(404).json({ error: 'Device not found', deviceId });
    }
  } catch (err) {
    logger.error(`Error updating Unity data: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Update box name for a device
app.post('/devices/:deviceId/box', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { boxName } = req.body;
    
    const success = deviceManager.updateBoxName(deviceId, boxName);
    
    if (success) {
      res.json({ 
        message: 'Box name updated successfully',
        deviceId,
        boxName: boxName || 'unchanged'
      });
    } else {
      res.status(404).json({ error: 'Device not found', deviceId });
    }
  } catch (err) {
    logger.error(`Error updating box name: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get devices grouped by box
app.get('/devices/grouped', (req, res) => {
  try {
    const grouped = deviceManager.getDevicesByBox();
    res.json(grouped);
  } catch (err) {
    logger.error(`Error getting grouped devices: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Bulk update multiple devices
app.post('/devices/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array is required and must not be empty' });
    }
    
    const result = deviceManager.updateMultipleDevices(updates);
    
    res.json({
      message: `Successfully updated ${result.updatedCount} out of ${result.totalRequested} devices`,
      updatedCount: result.updatedCount,
      totalRequested: result.totalRequested,
      success: true
    });
  } catch (err) {
    logger.error(`Error bulk updating devices: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get missing/offline devices
app.get('/devices/missing', (req, res) => {
  try {
    const missingDevices = deviceManager.getMissingDevices();
    res.json({ 
      missingDevices,
      count: missingDevices.length
    });
  } catch (err) {
    logger.error(`Error getting missing devices: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Download devices.csv file
app.get('/devices/download', (req, res) => {
  try {
    const filePath = path.resolve('./devices.csv');
    
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="devices.csv"');
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'CSV file not found' });
    }
  } catch (err) {
    logger.error(`Error downloading CSV file: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// CXT Box Management endpoints

// Get box status and devices
app.get('/cxt/boxes/status', (req, res) => {
  try {
    const boxStatus = cxtBoxManager.getBoxStatus();
    res.json({ boxes: boxStatus });
  } catch (err) {
    logger.error(`Error getting CXT box status: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Connect to all CXT boxes
app.post('/cxt/boxes/connect', async (req, res) => {
  try {
    const connectedBoxes = await cxtBoxManager.connectToAllBoxes();
    res.json({ 
      message: `Connected to ${connectedBoxes.length} boxes`,
      connectedBoxes: connectedBoxes.map(box => box.name)
    });
  } catch (err) {
    logger.error(`Error connecting to CXT boxes: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get all devices from CXT boxes
app.get('/cxt/devices', (req, res) => {
  try {
    const devices = cxtBoxManager.getAllDevices();
    res.json({ devices });
  } catch (err) {
    logger.error(`Error getting CXT devices: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Send CXT command to device
app.post('/cxt/devices/:deviceId/command', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { action, params } = req.body;
    
    let result = false;
    
    switch (action) {
      case 'screenshot':
        result = await cxtBoxManager.takeScreenshot(deviceId);
        break;
      case 'tap':
        result = await cxtBoxManager.sendTap(deviceId, params.x, params.y);
        break;
      case 'text':
        result = await cxtBoxManager.sendText(deviceId, params.text);
        break;
      default:
        return res.status(400).json({ error: 'Unknown action', action });
    }
    
    res.json({ 
      success: result,
      message: result ? 'Command sent successfully' : 'Failed to send command'
    });
  } catch (err) {
    logger.error(`Error sending CXT command: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Telegram notification endpoints

// Get Telegram status and configuration
app.get('/telegram/status', (req, res) => {
  try {
    res.json(telegramNotifier.getStatus());
  } catch (err) {
    logger.error(`Error getting Telegram status: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get notification history
app.get('/telegram/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
      history: telegramNotifier.getHistory(limit),
      total: telegramNotifier.notificationHistory.length
    });
  } catch (err) {
    logger.error(`Error getting notification history: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get global cooldown status
app.get('/telegram/cooldown', (req, res) => {
  try {
    res.json(telegramNotifier.getCooldownStatus());
  } catch (err) {
    logger.error(`Error getting cooldown status: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get message buffer status
app.get('/telegram/buffer', (req, res) => {
  try {
    res.json(telegramNotifier.getBufferStatus());
  } catch (err) {
    logger.error(`Error getting buffer status: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Send test notification
app.post('/telegram/test', async (req, res) => {
  try {
    const deviceId = req.body?.deviceId || req.query?.deviceId || 'test-device';
    const deviceName = req.body?.deviceName || req.query?.deviceName || 'Test Device';
    
    const result = await telegramNotifier.sendTestNotification(deviceId, deviceName);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(result.reason === 'disabled' ? 503 : 500).json(result);
    }
  } catch (err) {
    logger.error(`Error sending test notification: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Clear global cooldown
app.post('/telegram/clear-cooldown', (req, res) => {
  try {
    const existed = telegramNotifier.clearCooldown();
    
    res.json({
      success: true,
      existed,
      message: existed ? 'Global cooldown cleared' : 'No cooldown was active'
    });
  } catch (err) {
    logger.error(`Error clearing cooldown: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Clear message buffer
app.post('/telegram/clear-buffer', (req, res) => {
  try {
    const count = telegramNotifier.clearBuffer();
    
    res.json({
      success: true,
      count,
      message: `Cleared ${count} buffered message(s)`
    });
  } catch (err) {
    logger.error(`Error clearing buffer: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Manually flush buffer
app.post('/telegram/flush', async (req, res) => {
  try {
    const result = await telegramNotifier.manualFlush();
    
    res.json({
      success: true,
      ...result,
      message: `Flushed ${result.flushed} message(s): ${result.success} sent, ${result.failed} failed`
    });
  } catch (err) {
    logger.error(`Error flushing buffer: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// UI Automation endpoints

// Dump UI hierarchy for a device
app.get('/ui-test/dump/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const xmlContent = dumpUI(deviceId);
    
    res.set('Content-Type', 'text/xml');
    res.send(xmlContent);
  } catch (err) {
    logger.error(`Error dumping UI for device ${req.params.deviceId}: ${err.message}`);
    res.status(500).json({ error: 'Failed to dump UI', message: err.message });
  }
});

// Run a UI test on a device
app.post('/ui-test/run/:deviceId/:testName', async (req, res) => {
  try {
    const { deviceId, testName } = req.params;
    
    // Find test scenario by name
    const testScenario = UI_TESTS.find(t => t.name === testName);
    
    if (!testScenario) {
      return res.status(404).json({ 
        error: 'Test not found', 
        message: `No test found with name: ${testName}`,
        availableTests: UI_TESTS.map(t => t.name)
      });
    }
    
    // Run the test
    const result = await runTestScenario(deviceId, testScenario);
    
    res.json(result);
  } catch (err) {
    logger.error(`Error running UI test: ${err.message}`);
    res.status(500).json({ error: 'Failed to run UI test', message: err.message });
  }
});

// Get list of available UI tests
app.get('/ui-test/list', (req, res) => {
  res.json({
    tests: UI_TESTS.map(t => ({
      name: t.name,
      description: t.description,
      tapBounds: t.tapBounds,
      expectedElementsCount: t.expectedElements?.length || 0
    }))
  });
});

// Create HTTP server and WebSocket server
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Store active scrcpy streams
const scrcpyStreams = new Map(); // deviceId -> { process, clients }

// WebSocket connection handler
wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const deviceId = url.searchParams.get('device');
  
  if (!deviceId) {
    ws.close(1000, 'Device ID required');
    return;
  }
  
  logger.info(`WebSocket connection for device ${deviceId}`);
  
  // Add client to stream
  if (!scrcpyStreams.has(deviceId)) {
    startScrcpyStream(deviceId);
  }
  
  const stream = scrcpyStreams.get(deviceId);
  if (stream) {
    stream.clients.add(ws);
    
    ws.on('close', () => {
      stream.clients.delete(ws);
      // Stop stream if no clients left
      if (stream.clients.size === 0) {
        stopScrcpyStream(deviceId);
      }
    });
  }
});

// Start enhanced screenshot stream for device
function startScrcpyStream(deviceId) {
  logger.info(`Starting enhanced screenshot stream for ${deviceId}`);
  
  const clients = new Set();
  let streamInterval;
  
  // Function to capture and send screenshot
  const captureAndSend = async () => {
    try {
      // Use execSync with binary data for screenshot
      const screenshot = execSync(ADB_COMMANDS.SCREENSHOT(deviceId), { 
        encoding: null,  // Get raw binary data
        timeout: 5000 
      });
      
      if (screenshot && screenshot.length > 0 && clients.size > 0) {
        // Send binary PNG data directly
        clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(screenshot);
          }
        });
      }
    } catch (err) {
      logger.debug(`Screenshot capture failed for ${deviceId}: ${err.message}`);
    }
  };
  
  // Start high-frequency screenshot streaming (10 FPS)
  streamInterval = setInterval(captureAndSend, 100);
  
  scrcpyStreams.set(deviceId, {
    process: { kill: () => clearInterval(streamInterval) },
    clients: clients,
    interval: streamInterval
  });
  
  logger.info(`Enhanced screenshot stream started for ${deviceId} at 10 FPS`);
}

// Stop enhanced screenshot stream for device  
function stopScrcpyStream(deviceId) {
  const stream = scrcpyStreams.get(deviceId);
  if (stream) {
    logger.info(`Stopping enhanced screenshot stream for ${deviceId}`);
    if (stream.interval) {
      clearInterval(stream.interval);
    }
    if (stream.process && stream.process.kill) {
      stream.process.kill();
    }
    scrcpyStreams.delete(deviceId);
  }
}

const server = httpServer.listen(3000, ()=>{
  logger.info(`ADB Monitor running at http://localhost:3000`);
  logger.info(`WebSocket server running for scrcpy streams`);
  logger.info(`Monitoring package: ${PACKAGE}`);
  logger.info(`Log filter pattern: ${CONFIG.LOG_FILTER.pattern} (regex: ${CONFIG.LOG_FILTER.useRegex})`);
  if (CONFIG.LOG_FILTER.tags.length > 0) {
    logger.info(`Additional log tags: ${CONFIG.LOG_FILTER.tags.join(', ')}`);
  }
  
  // Log Telegram status
  const telegramStatus = telegramNotifier.getStatus();
  if (telegramStatus.enabled) {
    logger.info(`Telegram notifications: ENABLED (cooldown: ${telegramStatus.cooldownMinutes} min)`);
  } else if (telegramStatus.configured) {
    logger.warn(`Telegram notifications: CONFIGURED but DISABLED (set ENABLE_TELEGRAM=true)`);
  } else {
    logger.info(`Telegram notifications: DISABLED (not configured)`);
  }
  
  // Start network discovery if enabled
  if (CONFIG.NETWORK_DISCOVERY.enabled) {
    logger.info(`Network discovery: ENABLED for range ${CONFIG.NETWORK_DISCOVERY.ipRange}:${CONFIG.NETWORK_DISCOVERY.adbPort}`);
    logger.info(`Discovery interval: ${CONFIG.NETWORK_DISCOVERY.discoveryInterval}s`);
    startNetworkDiscovery();
  } else {
    logger.info('Network discovery: DISABLED');
  }
});

// Screen mirroring endpoints
app.get('/mirror/:deviceId/screen-size', async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const output = await adbExecAsync(ADB_COMMANDS.GET_SCREEN_SIZE(deviceId));
    const sizeMatch = output.match(/Physical size: (\d+)x(\d+)/);
    
    if (sizeMatch) {
      res.json({ 
        width: parseInt(sizeMatch[1]), 
        height: parseInt(sizeMatch[2]) 
      });
    } else {
      res.json({ width: 1080, height: 1920 }); // fallback
    }
  } catch (err) {
    logger.error(`Failed to get screen size for ${req.params.deviceId}: ${err.message}`);
    res.status(500).json({ error: 'Failed to get screen size' });
  }
});

app.post('/mirror/:deviceId/tap', async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const { x, y } = req.body;
    
    if (!x || !y) {
      return res.status(400).json({ error: 'x and y coordinates required' });
    }
    
    await adbExecAsync(ADB_COMMANDS.TAP(deviceId, x, y));
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to tap on ${req.params.deviceId}: ${err.message}`);
    res.status(500).json({ error: 'Failed to send tap' });
  }
});

app.post('/mirror/:deviceId/swipe', async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const { x1, y1, x2, y2, duration } = req.body;
    
    if (!x1 || !y1 || !x2 || !y2) {
      return res.status(400).json({ error: 'Start and end coordinates required' });
    }
    
    await adbExecAsync(ADB_COMMANDS.SWIPE(deviceId, x1, y1, x2, y2, duration || 300));
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to swipe on ${req.params.deviceId}: ${err.message}`);
    res.status(500).json({ error: 'Failed to send swipe' });
  }
});

app.post('/mirror/:deviceId/key', async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const { keycode } = req.body;
    
    if (!keycode) {
      return res.status(400).json({ error: 'keycode required' });
    }
    
    await adbExecAsync(ADB_COMMANDS.KEY_EVENT(deviceId, keycode));
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to send key event to ${req.params.deviceId}: ${err.message}`);
    res.status(500).json({ error: 'Failed to send key event' });
  }
});

app.post('/mirror/:deviceId/text', async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'text required' });
    }
    
    // Escape special characters for shell
    const escapedText = text.replace(/['"\\]/g, '\\$&');
    await adbExecAsync(ADB_COMMANDS.TEXT_INPUT(deviceId, escapedText));
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to send text to ${req.params.deviceId}: ${err.message}`);
    res.status(500).json({ error: 'Failed to send text' });
  }
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Stop all scrcpy streams
    for (const deviceId of scrcpyStreams.keys()) {
      stopScrcpyStream(deviceId);
    }
    logger.info('All scrcpy streams stopped');
    
    // Stop network discovery
    stopNetworkDiscovery();
    logger.info('Network discovery stopped');
    
    // Stop all logcat processes
    const stopPromises = Object.keys(logcatProcesses).map(deviceId => stopLogcat(deviceId));
    await Promise.all(stopPromises);
    logger.info('All logcat processes stopped');
    
    // Close all log streams
    await logStreamManager.closeAllStreams();
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
