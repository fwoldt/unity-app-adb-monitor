import { CONFIG } from "./config.js";
import logger from "./logger.js";
import { execSync } from "child_process";
import net from "net";

// Test function to debug network discovery
function parseIpRange(ipRange) {
  const [baseIp, range] = ipRange.split('-');
  if (!baseIp || !range) {
    throw new Error(`Invalid IP range format: ${ipRange}. Use format like "192.168.44.1-254"`);
  }
  
  const ipParts = baseIp.split('.');
  if (ipParts.length !== 4) {
    throw new Error(`Invalid IP format: ${baseIp}`);
  }
  
  const [start, end] = range.includes('-') ? range.split('-').map(Number) : [Number(range), Number(range)];
  if (isNaN(start) || isNaN(end)) {
    throw new Error(`Invalid range: ${range}`);
  }
  
  const ips = [];
  for (let i = start; i <= end; i++) {
    ips.push(`${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.${i}`);
  }
  
  return ips;
}

function checkPort(ip, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    const timer = setTimeout(() => {
      socket.destroy();
      logger.debug(`Timeout: ${ip}:${port}`);
      resolve(false);
    }, timeout);
    
    socket.connect(port, ip, () => {
      clearTimeout(timer);
      socket.destroy();
      logger.info(`SUCCESS: ${ip}:${port} is open`);
      resolve(true);
    });
    
    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      logger.debug(`Error on ${ip}:${port}: ${err.code}`);
      resolve(false);
    });
  });
}

async function testDiscovery() {
  logger.info('Testing network discovery...');
  logger.info(`IP Range: ${CONFIG.NETWORK_DISCOVERY.ipRange}`);
  logger.info(`ADB Port: ${CONFIG.NETWORK_DISCOVERY.adbPort}`);
  
  try {
    const ips = parseIpRange(CONFIG.NETWORK_DISCOVERY.ipRange);
    logger.info(`Testing ${ips.length} IP addresses`);
    
    // Test more IPs to find all 20 devices
    const testIps = [];
    for (let i = 1; i <= 50; i++) {
      testIps.push(`192.168.44.${i}`);
    }
    console.log(`\n=== Testing IPs 1-50 for ADB port ${CONFIG.NETWORK_DISCOVERY.adbPort} ===`);
    
    const foundDevices = [];
    
    // Test all IPs in parallel for speed
    console.log('Testing all IPs in parallel...');
    const results = await Promise.allSettled(
      testIps.map(async (ip) => {
        const isOpen = await checkPort(ip, CONFIG.NETWORK_DISCOVERY.adbPort, 3000);
        if (isOpen) {
          console.log(`🎯 FOUND: ${ip}:${CONFIG.NETWORK_DISCOVERY.adbPort}`);
          foundDevices.push(ip);
          return { ip, open: true };
        }
        return { ip, open: false };
      })
    );
    
    console.log(`\n=== SCAN COMPLETE ===`);
    console.log(`Found ${foundDevices.length} devices with open port ${CONFIG.NETWORK_DISCOVERY.adbPort}:`);
    foundDevices.forEach(ip => console.log(`  - ${ip}:${CONFIG.NETWORK_DISCOVERY.adbPort}`));
    
    // Try to connect to all found devices
    if (foundDevices.length > 0) {
      console.log(`\n=== Connecting to ${foundDevices.length} devices ===`);
      for (const ip of foundDevices) {
        try {
          const result = execSync(`adb connect ${ip}:${CONFIG.NETWORK_DISCOVERY.adbPort}`, { timeout: 10000 });
          console.log(`${ip}: ${result.toString().trim()}`);
        } catch (error) {
          console.log(`${ip}: FAILED - ${error.message}`);
        }
      }
    }
    
    // Also test if we can ping these IPs
    console.log(`\n=== Ping test ===`);
    for (const ip of testIps.slice(0, 2)) {
      try {
        const result = execSync(`ping -c 1 -W 1 ${ip}`, { timeout: 3000 });
        console.log(`Ping ${ip}: SUCCESS`);
      } catch (error) {
        console.log(`Ping ${ip}: FAILED`);
      }
    }
    
    // Check current ADB devices
    try {
      const devices = execSync('adb devices').toString();
      logger.info(`Current ADB devices:\n${devices}`);
    } catch (error) {
      logger.error(`Failed to check ADB devices: ${error.message}`);
    }
    
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
  }
}

testDiscovery();