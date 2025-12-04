import { execSync } from "child_process";
import { CONFIG } from "./config.js";
import { ADB_COMMANDS } from "./adbCommands.js";

async function testServiceStatus() {
  // Get first device
  const devices = execSync(ADB_COMMANDS.DEVICES).toString()
    .split('\n')
    .slice(1)
    .filter(line => line.trim())
    .map(line => line.split('\t')[0])
    .filter(Boolean);
    
  if (devices.length === 0) {
    console.log('No devices found');
    return;
  }
  
  const deviceId = devices[0];
  console.log(`Testing service status on device: ${deviceId}`);
  console.log(`Package: ${CONFIG.PACKAGE}`);
  console.log(`Service: ${CONFIG.SERVICE_NAME}`);
  
  try {
    // Check if package is running via pidof
    console.log('\n1. Checking package PID via pidof...');
    try {
      const pidOutput = execSync(ADB_COMMANDS.PIDOF(deviceId, CONFIG.PACKAGE), { timeout: 5000 }).toString().trim();
      console.log(`Package PIDs: ${pidOutput || 'None'}`);
      
      if (pidOutput) {
        const pids = pidOutput.split('\n').filter(p => p.trim());
        console.log(`Found ${pids.length} process(es) for ${CONFIG.PACKAGE}`);
      }
    } catch (error) {
      console.log(`Pidof failed: ${error.message}`);
    }
    
    // Check service via dumpsys
    console.log('\n2. Checking service via dumpsys...');
    try {
      const cmd = `adb -s ${deviceId} shell dumpsys activity services ${CONFIG.SERVICE_NAME}`;
      const output = execSync(cmd, { timeout: 10000 }).toString();
      
      console.log(`Service dumpsys output length: ${output.length} chars`);
      console.log('\n--- Service Output Sample (first 500 chars) ---');
      console.log(output.substring(0, 500));
      console.log('--- End Sample ---\n');
      
      // Check various status indicators
      const hasServiceRecord = output.includes('ServiceRecord');
      const hasProcessRecord = output.match(/app=ProcessRecord\{[^\s]+\s+(\d+):/);
      const hasActivity = output.includes('ACTIVITY MANAGER SERVICES');
      
      console.log(`Has ACTIVITY MANAGER SERVICES: ${hasActivity}`);
      console.log(`Has ServiceRecord: ${hasServiceRecord}`);
      console.log(`Has ProcessRecord: ${!!hasProcessRecord}`);
      
      if (hasProcessRecord) {
        console.log(`Process PID from ServiceRecord: ${hasProcessRecord[1]}`);
      }
      
      // Check for alternative status indicators
      const isCreated = output.includes('created=');
      const isRunning = output.includes('executing=') || output.includes('started=true');
      const packageMatch = output.match(/packageName=([^\s]+)/);
      
      console.log(`Service created: ${isCreated}`);
      console.log(`Service running indicators: ${isRunning}`);
      console.log(`Package name: ${packageMatch ? packageMatch[1] : 'Not found'}`);
      
    } catch (error) {
      console.log(`Service check failed: ${error.message}`);
    }
    
    // Try alternative: Check all services
    console.log('\n3. Checking all services for package...');
    try {
      const allServicesCmd = `adb -s ${deviceId} shell dumpsys activity services | grep -A 5 -B 5 ${CONFIG.PACKAGE}`;
      const allOutput = execSync(allServicesCmd, { timeout: 10000 }).toString();
      console.log('Services containing package name:');
      console.log(allOutput || 'None found');
    } catch (error) {
      console.log(`All services check failed: ${error.message}`);
    }
    
    // Check if package processes exist
    console.log('\n4. Checking package processes...');
    try {
      const psCmd = `adb -s ${deviceId} shell ps | grep ${CONFIG.PACKAGE}`;
      const psOutput = execSync(psCmd, { timeout: 5000 }).toString();
      console.log('Package processes:');
      console.log(psOutput || 'None found');
    } catch (error) {
      console.log(`PS check failed: ${error.message}`);
    }
    
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
  }
}

testServiceStatus();