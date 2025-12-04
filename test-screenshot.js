import { execSync } from "child_process";
import { ADB_COMMANDS } from "./adbCommands.js";
import logger from "./logger.js";
import fs from "fs";

async function testScreenshot() {
  // Get first available device
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
  console.log(`Testing screenshot with device: ${deviceId}`);
  
  try {
    // Check power state
    console.log('\n1. Checking power state...');
    try {
      const powerState = execSync(ADB_COMMANDS.CHECK_SCREEN_STATE(deviceId), { timeout: 3000 }).toString();
      console.log(`Power state: ${powerState.trim()}`);
    } catch (error) {
      console.log(`Could not check power state: ${error.message}`);
    }
    
    // Wake device
    console.log('\n2. Waking device...');
    try {
      execSync(ADB_COMMANDS.WAKE_SCREEN(deviceId), { timeout: 3000 });
      console.log('Wake command sent');
      
      // Wait for screen to turn on
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try swipe unlock
      console.log('Attempting swipe unlock...');
      execSync(ADB_COMMANDS.SWIPE_UNLOCK(deviceId), { timeout: 3000 });
      console.log('Swipe unlock sent');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`Wake/unlock error: ${error.message}`);
    }
    
    // Take screenshot
    console.log('\n3. Taking screenshot...');
    const screenshot = execSync(ADB_COMMANDS.SCREENSHOT(deviceId), { 
      encoding: 'buffer',
      timeout: 10000 
    });
    
    console.log(`Screenshot taken: ${screenshot.length} bytes`);
    
    // Save to file for inspection
    fs.writeFileSync(`screenshot-${deviceId.replace(':', '-')}.png`, screenshot);
    console.log(`Screenshot saved to: screenshot-${deviceId.replace(':', '-')}.png`);
    
  } catch (error) {
    console.error(`Screenshot test failed: ${error.message}`);
  }
}

testScreenshot();