import express from "express";
import cors from "cors";
import { execSync, spawn } from "child_process";
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
const execAsync = promisify(exec);

const app = express();
app.use(cors());

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
    logger.error(`ADB command failed: ${cmd}`);
    logger.error(`Error details: ${err.message}`);
    if (err.stderr) {
      logger.error(`stderr: ${err.stderr.toString()}`);
    }
    if (err.stdout) {
      logger.debug(`stdout: ${err.stdout.toString()}`);
    }
    logger.error(`Exit code: ${err.code || 'unknown'}`);
    return "";
  }
}

function getDevices() {
  const output = adbExec(ADB_COMMANDS.DEVICES);
  const lines = output.split("\n").slice(1).filter(l => l.trim());
  return Array.isArray(lines) ? lines.map(line => line.split("\t")[0]).filter(Boolean) : [];
}

async function getDeviceName(deviceId) {
  const [manufacturer, model] = await Promise.all([
    adbExecAsync(ADB_COMMANDS.GETPROP(deviceId, "ro.product.manufacturer")),
    adbExecAsync(ADB_COMMANDS.GETPROP(deviceId, "ro.product.model"))
  ]);
  return `${manufacturer} ${model}`.trim() || deviceId;
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

async function getServiceStatus(deviceId) {
  // Get full dumpsys output for the specific service
  const cmd = `adb -s ${deviceId} shell "dumpsys activity services ${SERVICE_NAME}"`;
  const output = await adbExecAsync(cmd);
  
  // Return early if no output or command failed
  if (!output || output.trim() === '') {
    logger.debug(`No service info for ${SERVICE_NAME} on device ${deviceId}`);
    return { running: false, serviceCheckFailed: true };
  }
  
  // Check if service record exists (output starts with "ACTIVITY MANAGER SERVICES")
  if (!output.includes('ACTIVITY MANAGER SERVICES')) {
    logger.debug(`Invalid dumpsys output for ${SERVICE_NAME} on device ${deviceId}`);
    return { running: false, serviceCheckFailed: true };
  }
  
  // Check if service is registered (has ServiceRecord)
  if (!output.includes('ServiceRecord')) {
    logger.debug(`Service ${SERVICE_NAME} not found on device ${deviceId}`);
    return { running: false, serviceCheckFailed: true };
  }
  
  // Check if service is running by looking for app=ProcessRecord in output
  // Format: app=ProcessRecord{HASH PID:PROCESSNAME/UID}
  const appMatch = output.match(/app=ProcessRecord\{[^\s]+\s+(\d+):/);
  const running = !!appMatch;
  
  if (!running) {
    logger.debug(`Service ${SERVICE_NAME} exists but not running (no ProcessRecord) on device ${deviceId}`);
    return { running: false, serviceCheckFailed: true };
  }
  
  // Extract PID from ProcessRecord
  const pid = appMatch[1];
  
  // Extract package name
  const packageMatch = output.match(/packageName=([^\s]+)/);
  const packageName = packageMatch ? packageMatch[1] : null;
  
  // Extract service timing information
  const createTimeMatch = output.match(/createTime=([^\s]+)/);
  const lastActivityMatch = output.match(/lastActivity=([^\s]+)/);
  const restartTimeMatch = output.match(/restartTime=([^\s]+)/);
  
  const createTime = createTimeMatch ? createTimeMatch[1] : null;
  const lastActivity = lastActivityMatch ? lastActivityMatch[1] : null;
  const restartTime = restartTimeMatch ? restartTimeMatch[1] : null;
  
  // Get memory info using the package name
  let pss = null, rss = null;
  if (pid && packageName) {
    const memInfoRaw = await adbExecAsync(ADB_COMMANDS.MEMINFO(deviceId, packageName));
    const pssMatch = memInfoRaw.match(/TOTAL PSS:\s+(\d+)/);
    const rssMatch = memInfoRaw.match(/TOTAL RSS:\s+(\d+)/);
    if (pssMatch) pss = parseInt(pssMatch[1]);
    if (rssMatch) rss = parseInt(rssMatch[1]);
  }

  return { 
    running: true, 
    pid, 
    pss, 
    rss, 
    serviceName: SERVICE_NAME,
    packageName,
    createTime,
    lastActivity,
    restartTime,
    serviceCheckFailed: false 
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
      const [serviceStatus, appVersion] = await Promise.all([
        getServiceStatus(id),
        getAppVersion(id)
      ]);
      const deviceInfo = { ...serviceStatus, ...appVersion, device: id, name: deviceName, ip: deviceIP };

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

app.use((req, res, next) => {
  req.headers['userId'] = 'default-user-id'; // Replace with dynamic user ID logic if needed
  next();
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

const server = app.listen(3000, ()=>{
  logger.info(`ADB Monitor running at http://localhost:3000`);
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

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
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
