import { execSync } from "child_process";
import { CONFIG } from "./config.js";
import { ADB_COMMANDS } from "./adbCommands.js";
import logger from "./logger.js";

// Test both sync and async versions
function adbExec(command) {
  try {
    const result = execSync(command, { timeout: 15000 });
    return result.toString();
  } catch (err) {
    logger.error(`ADB command failed: ${command}`);
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

function testBothMethods() {
  const deviceId = "192.168.44.41:5555";
  const packageName = CONFIG.PACKAGE;
  
  console.log(`Testing both adbExec methods for ${deviceId}`);
  console.log(`Package: ${packageName}\n`);
  
  // Test sync version
  console.log('=== Testing SYNC adbExec ===');
  try {
    const syncCmd = ADB_COMMANDS.PIDOF(deviceId, packageName);
    console.log(`Command: ${syncCmd}`);
    const syncResult = adbExec(syncCmd);
    console.log(`Sync result: "${syncResult}"`);
    console.log(`Sync result trimmed: "${syncResult.trim()}"`);
    console.log(`Sync isEmpty: ${syncResult.trim() === ''}`);
    console.log(`Sync packageRunning: ${syncResult && syncResult.trim() !== ''}`);
  } catch (error) {
    console.log(`Sync error: ${error.message}`);
  }
  
  // Test with raw execSync directly
  console.log('\n=== Testing RAW execSync ===');
  try {
    const rawCmd = ADB_COMMANDS.PIDOF(deviceId, packageName);
    console.log(`Command: ${rawCmd}`);
    const rawResult = execSync(rawCmd, { timeout: 15000 }).toString();
    console.log(`Raw result: "${rawResult}"`);
    console.log(`Raw result trimmed: "${rawResult.trim()}"`);
    console.log(`Raw packageRunning: ${rawResult && rawResult.trim() !== ''}`);
  } catch (rawError) {
    console.log(`Raw execSync error: ${rawError.message}`);
    if (rawError.stdout) {
      console.log(`Raw stdout: "${rawError.stdout.toString()}"`);
    }
  }
  
  // Test direct adb command to verify device connectivity
  console.log('\n=== Testing device connectivity ===');
  try {
    const connectTest = execSync(`adb -s ${deviceId} shell echo "connected"`, { timeout: 5000 }).toString();
    console.log(`Connection test: "${connectTest.trim()}"`);
  } catch (connError) {
    console.log(`Connection error: ${connError.message}`);
  }
}

testBothMethods();