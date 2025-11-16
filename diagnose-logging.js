#!/usr/bin/env node
// Diagnostic script to check logging issues

import { execSync } from 'child_process';
import { CONFIG } from './config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE = CONFIG.PACKAGE;

console.log('=== ADB Logging Diagnostics ===\n');

// 1. Check connected devices
console.log('1. Connected Devices:');
try {
  const devices = execSync('adb devices').toString();
  console.log(devices);
} catch (err) {
  console.error('Error getting devices:', err.message);
}

// 2. Check if app is running
console.log('\n2. App Process Status:');
try {
  const devicesOutput = execSync('adb devices').toString();
  const deviceLines = devicesOutput.split('\n').slice(1).filter(l => l.trim());
  
  deviceLines.forEach(line => {
    const deviceId = line.split('\t')[0];
    if (!deviceId) return;
    
    try {
      const pid = execSync(`adb -s ${deviceId} shell pidof ${PACKAGE}`).toString().trim();
      console.log(`  Device ${deviceId}: App running with PID ${pid}`);
      
      // Check if there are recent logs
      const logcat = execSync(`adb -s ${deviceId} shell "logcat -d --pid=${pid} | tail -20"`).toString();
      console.log(`  Recent logs (last 20 lines):`);
      console.log(logcat.split('\n').slice(0, 5).join('\n'));
      console.log(`  ... (${logcat.split('\n').length} total lines)\n`);
      
      // Check for ExpoPowService
      const filtered = execSync(`adb -s ${deviceId} shell "logcat -d --pid=${pid} | grep ExpoPowService | tail -5"`).toString();
      console.log(`  Lines containing "ExpoPowService" (last 5):`);
      console.log(filtered || '  (none found)');
      
    } catch (err) {
      console.log(`  Device ${deviceId}: App NOT running (no PID)`);
    }
  });
} catch (err) {
  console.error('Error checking app status:', err.message);
}

// 3. Check log files
console.log('\n3. Local Log Files:');
try {
  const logFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('-app-log.txt'));
  
  if (logFiles.length === 0) {
    console.log('  No app log files found');
  } else {
    logFiles.forEach(file => {
      const stats = fs.statSync(path.join(__dirname, file));
      const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const lastLine = lines[lines.length - 1] || '(empty)';
      
      console.log(`  ${file}:`);
      console.log(`    Size: ${stats.size} bytes`);
      console.log(`    Lines: ${lines.length}`);
      console.log(`    Modified: ${stats.mtime.toISOString()}`);
      console.log(`    Last entry: ${lastLine.substring(0, 100)}...`);
      console.log();
    });
  }
} catch (err) {
  console.error('Error reading log files:', err.message);
}

// 4. Test filter pattern
console.log('\n4. Filter Configuration:');
console.log(`  Pattern: "${CONFIG.LOG_FILTER.pattern}"`);
console.log(`  Use Regex: ${CONFIG.LOG_FILTER.useRegex}`);
console.log(`  Tags: [${CONFIG.LOG_FILTER.tags.join(', ')}]`);
console.log(`  Min Level: ${CONFIG.LOG_FILTER.minLevel}`);

// 5. Recommendations
console.log('\n5. Recommendations:');
console.log('  - Check if app is actively logging to logcat');
console.log('  - Verify "ExpoPowService" appears in logcat output');
console.log('  - Consider using LOG_LEVEL=debug to see filter activity');
console.log('  - Check if app crashed/restarted (new PID breaks logcat)');
console.log('\n=== End Diagnostics ===');
