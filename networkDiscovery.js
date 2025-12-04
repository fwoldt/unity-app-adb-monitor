import { execSync, exec } from "child_process";
import { CONFIG } from "./config.js";
import logger from "./logger.js";
import { ADB_COMMANDS } from "./adbCommands.js";

const connectedDevices = new Set();

function parseIpRange(ipRange) {
  // Parse format like "192.168.44.1-254" 
  const parts = ipRange.split('-');
  if (parts.length !== 2) {
    throw new Error(`Invalid IP range format: ${ipRange}. Use format like "192.168.44.1-254"`);
  }
  
  const startIp = parts[0].trim();
  const endLastOctet = parseInt(parts[1].trim(), 10);
  
  const ipParts = startIp.split('.');
  if (ipParts.length !== 4) {
    throw new Error(`Invalid IP format: ${startIp}`);
  }
  
  const startLastOctet = parseInt(ipParts[3], 10);
  if (isNaN(startLastOctet) || isNaN(endLastOctet)) {
    throw new Error(`Invalid range: ${ipRange}`);
  }
  
  const ips = [];
  const baseIp = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
  
  for (let i = startLastOctet; i <= endLastOctet; i++) {
    ips.push(`${baseIp}.${i}`);
  }
  
  logger.debug(`Parsed IP range ${ipRange}: ${ips.length} addresses (${ips[0]} to ${ips[ips.length-1]})`);
  return ips;
}

function checkPort(ip, port, timeout = 2000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);
    
    socket.connect(port, ip, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

async function scanForDevices() {
  if (!CONFIG.NETWORK_DISCOVERY.enabled) {
    return [];
  }
  
  logger.info(`Scanning network range: ${CONFIG.NETWORK_DISCOVERY.ipRange} on port ${CONFIG.NETWORK_DISCOVERY.adbPort}`);
  
  try {
    const ips = parseIpRange(CONFIG.NETWORK_DISCOVERY.ipRange);
    logger.debug(`Scanning ${ips.length} IP addresses in parallel`);
    
    const results = await Promise.allSettled(
      ips.map(async (ip) => {
        const isOpen = await checkPort(ip, CONFIG.NETWORK_DISCOVERY.adbPort, CONFIG.NETWORK_DISCOVERY.connectionTimeout);
        if (isOpen) {
          logger.debug(`Port scan success: ${ip}:${CONFIG.NETWORK_DISCOVERY.adbPort}`);
          return `${ip}:${CONFIG.NETWORK_DISCOVERY.adbPort}`;
        }
        return null;
      })
    );
    
    const availableDevices = results
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);
    
    logger.info(`Found ${availableDevices.length} potential ADB devices: ${availableDevices.join(', ')}`);
    return availableDevices;
  } catch (error) {
    logger.error(`Network scan failed: ${error.message}`);
    return [];
  }
}

async function connectToDevice(deviceAddress) {
  try {
    logger.info(`Attempting to connect to device: ${deviceAddress}`);
    const result = execSync(`adb connect ${deviceAddress}`, { timeout: 10000 });
    const output = result.toString().trim();
    
    if (output.includes('connected') || output.includes('already connected')) {
      logger.info(`Successfully connected to ${deviceAddress}: ${output}`);
      connectedDevices.add(deviceAddress);
      return true;
    } else {
      logger.warn(`Failed to connect to ${deviceAddress}: ${output}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error connecting to ${deviceAddress}: ${error.message}`);
    return false;
  }
}

async function discoverAndConnectDevices() {
  const availableDevices = await scanForDevices();
  const connectionPromises = [];
  
  for (const deviceAddress of availableDevices) {
    if (!connectedDevices.has(deviceAddress)) {
      connectionPromises.push(connectToDevice(deviceAddress));
    } else {
      logger.debug(`Device ${deviceAddress} already connected, skipping`);
    }
  }
  
  if (connectionPromises.length > 0) {
    await Promise.allSettled(connectionPromises);
  }
  
  // Verify current ADB connections
  try {
    const adbDevices = execSync(ADB_COMMANDS.DEVICES).toString();
    const currentDevices = adbDevices.split('\n')
      .slice(1)
      .filter(line => line.trim())
      .map(line => line.split('\t')[0])
      .filter(Boolean);
    
    // Update connected devices set
    connectedDevices.clear();
    currentDevices.forEach(device => {
      if (device.includes(':')) { // Network device
        connectedDevices.add(device);
      }
    });
    
    logger.info(`Current ADB devices: ${currentDevices.join(', ')}`);
  } catch (error) {
    logger.error(`Failed to check ADB devices: ${error.message}`);
  }
}

let discoveryInterval = null;

export function startNetworkDiscovery() {
  if (!CONFIG.NETWORK_DISCOVERY.enabled) {
    logger.info('Network discovery is disabled');
    return;
  }
  
  if (discoveryInterval) {
    logger.warn('Network discovery already running');
    return;
  }
  
  logger.info(`Starting network discovery with ${CONFIG.NETWORK_DISCOVERY.discoveryInterval}s interval`);
  
  // Run initial discovery
  discoverAndConnectDevices();
  
  // Set up periodic discovery
  discoveryInterval = setInterval(() => {
    discoverAndConnectDevices();
  }, CONFIG.NETWORK_DISCOVERY.discoveryInterval * 1000);
}

export function stopNetworkDiscovery() {
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
    logger.info('Network discovery stopped');
  }
}

export function getConnectedNetworkDevices() {
  return Array.from(connectedDevices);
}