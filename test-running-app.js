import { execSync } from "child_process";
import { CONFIG } from "./config.js";
import { ADB_COMMANDS } from "./adbCommands.js";
import logger from "./logger.js";

async function testRunningApp() {
  // Test a specific device that shows Unity running on screen
  const testDeviceId = "192.168.44.41:5555"; // Adjust this to your device
  
  console.log(`\n=== Testing Unity App Status on ${testDeviceId} ===`);
  console.log(`Package: ${CONFIG.PACKAGE}`);
  console.log(`Service: ${CONFIG.SERVICE_NAME}`);
  
  try {
    // 1. Check pidof for the package
    console.log('\n1. Testing PIDOF command...');
    try {
      const pidofCmd = ADB_COMMANDS.PIDOF(testDeviceId, CONFIG.PACKAGE);
      console.log(`Command: ${pidofCmd}`);
      const pidofOutput = execSync(pidofCmd, { timeout: 5000 }).toString();
      console.log(`PIDOF Output: "${pidofOutput.trim()}"`);
      console.log(`Has PID: ${pidofOutput && pidofOutput.trim() !== ''}`);
    } catch (pidofError) {
      console.log(`PIDOF Error: ${pidofError.message}`);
    }
    
    // 2. Check with ps command to see all processes
    console.log('\n2. Checking PS for Unity processes...');
    try {
      const psCmd = `adb -s ${testDeviceId} shell ps | grep -i unity`;
      console.log(`Command: ${psCmd}`);
      const psOutput = execSync(psCmd, { timeout: 5000 }).toString();
      console.log(`PS Output:\n${psOutput}`);
    } catch (psError) {
      console.log(`PS Error: ${psError.message}`);
    }
    
    // 3. Check for any process with the package name
    console.log('\n3. Checking for any process containing package name...');
    try {
      const psPackageCmd = `adb -s ${testDeviceId} shell ps | grep ${CONFIG.PACKAGE}`;
      console.log(`Command: ${psPackageCmd}`);
      const psPackageOutput = execSync(psPackageCmd, { timeout: 5000 }).toString();
      console.log(`Package PS Output:\n${psPackageOutput}`);
    } catch (psPackageError) {
      console.log(`Package PS Error: ${psPackageError.message}`);
    }
    
    // 4. Check current foreground app
    console.log('\n4. Checking foreground app...');
    try {
      const foregroundCmd = `adb -s ${testDeviceId} shell dumpsys activity activities | grep -i "ResumedActivity"`;
      console.log(`Command: ${foregroundCmd}`);
      const foregroundOutput = execSync(foregroundCmd, { timeout: 5000 }).toString();
      console.log(`Foreground Output:\n${foregroundOutput}`);
    } catch (foregroundError) {
      console.log(`Foreground check failed: ${foregroundError.message}`);
    }
    
    // 5. Check all running packages/applications
    console.log('\n5. Checking running applications...');
    try {
      const runningCmd = `adb -s ${testDeviceId} shell pm list packages -e | grep -i unity`;
      console.log(`Command: ${runningCmd}`);
      const runningOutput = execSync(runningCmd, { timeout: 5000 }).toString();
      console.log(`Running packages:\n${runningOutput}`);
    } catch (runningError) {
      console.log(`Running packages check failed: ${runningError.message}`);
    }
    
    // 6. Check if package is installed at all
    console.log('\n6. Checking if package is installed...');
    try {
      const installedCmd = `adb -s ${testDeviceId} shell pm list packages | grep ${CONFIG.PACKAGE}`;
      console.log(`Command: ${installedCmd}`);
      const installedOutput = execSync(installedCmd, { timeout: 5000 }).toString();
      console.log(`Installed package:\n${installedOutput}`);
    } catch (installedError) {
      console.log(`Installed check failed: ${installedError.message}`);
    }
    
    // 7. Try alternative process checking
    console.log('\n7. Alternative process check with pgrep-like...');
    try {
      const altCmd = `adb -s ${testDeviceId} shell "ps -A | grep -i unity"`;
      console.log(`Command: ${altCmd}`);
      const altOutput = execSync(altCmd, { timeout: 5000 }).toString();
      console.log(`Alternative PS Output:\n${altOutput}`);
    } catch (altError) {
      console.log(`Alternative PS failed: ${altError.message}`);
    }
    
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
  }
}

testRunningApp();