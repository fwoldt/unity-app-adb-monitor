import { CONFIG } from "./config.js";
import { ADB_COMMANDS } from "./adbCommands.js";
import { execSync } from "child_process";
import logger from "./logger.js";

// Copy the exact function from server.js
function adbExec(command) {
  try {
    const result = execSync(command, { timeout: 15000 });
    return result.toString();
  } catch (err) {
    logger.error(`ADB command failed: ${command}`);
    logger.error(`Error details: ${err.message}`);
    if (err.stdout) {
      logger.debug(`stdout: ${err.stdout.toString()}`);
    }
    logger.error(`Exit code: ${err.code || 'unknown'}`);
    return "";
  }
}

async function adbExecAsync(command) {
  return new Promise((resolve) => {
    try {
      const result = execSync(command, { timeout: 15000 });
      resolve(result.toString());
    } catch (err) {
      logger.debug(`Async ADB command failed: ${command} - ${err.message}`);
      resolve("");
    }
  });
}

// Test the exact getServiceStatus function logic
async function debugServiceStatus() {
  const deviceId = "192.168.44.41:5555";
  const PACKAGE = CONFIG.PACKAGE;
  const SERVICE_NAME = CONFIG.SERVICE_NAME;
  
  console.log(`\n=== Debugging getServiceStatus for ${deviceId} ===`);
  console.log(`Package: ${PACKAGE}`);
  console.log(`Service: ${SERVICE_NAME}`);
  
  try {
    // Step 1: Check pidof (same as function)
    console.log('\n1. Checking pidof...');
    const pidofOutput = await adbExecAsync(ADB_COMMANDS.PIDOF(deviceId, PACKAGE));
    console.log(`PIDOF result: "${pidofOutput.trim()}"`);
    const packageRunning = pidofOutput && pidofOutput.trim() !== '';
    console.log(`Package running: ${packageRunning}`);
    
    if (!packageRunning) {
      console.log('❌ Function would return: { running: false, reason: "package_not_running" }');
      return;
    }
    
    // Step 2: Check service (same as function)
    console.log('\n2. Checking service...');
    const cmd = `adb -s ${deviceId} shell "dumpsys activity services ${SERVICE_NAME}"`;
    console.log(`Service command: ${cmd}`);
    const output = await adbExecAsync(cmd);
    console.log(`Service output length: ${output.length} chars`);
    console.log(`Service output preview: "${output.substring(0, 200)}..."`);
    
    // Check service conditions
    const hasServiceRecord = output && output.includes('ServiceRecord');
    console.log(`Has ServiceRecord: ${hasServiceRecord}`);
    
    if (hasServiceRecord) {
      console.log('✅ Service found, checking if running...');
      const appMatch = output.match(/app=ProcessRecord\{[^\s]+\s+(\d+):/);
      const serviceRunning = !!appMatch;
      console.log(`Service running: ${serviceRunning}`);
      
      if (serviceRunning) {
        console.log('✅ Function would return service running with details');
        return;
      } else {
        console.log('⚠️ Service registered but not running');
      }
    } else {
      console.log('⚠️ Service not registered');
    }
    
    // Step 3: Fallback to package (same as function)
    console.log('\n3. Fallback to package PID...');
    const pids = pidofOutput.trim().split('\n').filter(p => p.trim());
    const pid = pids[0];
    console.log(`Using PID: ${pid}`);
    
    // Get memory info
    console.log('\n4. Getting memory info...');
    try {
      const memInfoRaw = await adbExecAsync(ADB_COMMANDS.MEMINFO(deviceId, PACKAGE));
      console.log(`Memory info length: ${memInfoRaw.length} chars`);
      console.log(`Memory preview: "${memInfoRaw.substring(0, 200)}..."`);
      
      const pssMatch = memInfoRaw.match(/TOTAL PSS:\s+(\d+)/);
      const rssMatch = memInfoRaw.match(/TOTAL RSS:\s+(\d+)/);
      const pss = pssMatch ? parseInt(pssMatch[1]) : null;
      const rss = rssMatch ? parseInt(rssMatch[1]) : null;
      
      console.log(`PSS: ${pss}, RSS: ${rss}`);
      
      console.log('\n✅ Function should return:');
      console.log(JSON.stringify({
        running: true,
        pid,
        pss,
        rss,
        serviceName: SERVICE_NAME,
        packageName: PACKAGE,
        createTime: null,
        lastActivity: null,
        restartTime: null,
        serviceCheckFailed: true,
        reason: 'package_running_service_unknown'
      }, null, 2));
      
    } catch (memError) {
      console.log(`Memory info failed: ${memError.message}`);
    }
    
  } catch (error) {
    console.error(`Debug failed: ${error.message}`);
  }
}

debugServiceStatus();