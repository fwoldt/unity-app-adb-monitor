import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ADB_COMMANDS } from './adbCommands.js';
import logger from './logger.js';
import { cxtBoxManager } from './cxtBoxManager.js';

const CSV_FILE = './devices.csv';

// CSV structure: deviceId,mac,boxName,unityLicense,unityEmail,lastSeen,status
const CSV_HEADERS = 'deviceId,mac,boxName,unityLicense,unityEmail,lastSeen,status';

export class DeviceManager {
  constructor() {
    this.deviceCache = [];
    this.lastModified = null;
    this.ensureCSVExists();
    this.setupFileWatcher();
  }

  ensureCSVExists() {
    if (!fs.existsSync(CSV_FILE)) {
      fs.writeFileSync(CSV_FILE, CSV_HEADERS + '\n');
      logger.info('Created devices.csv file');
    }
    this.refreshCache();
  }

  setupFileWatcher() {
    try {
      fs.watchFile(CSV_FILE, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          logger.info('devices.csv file changed, reloading cache');
          this.refreshCache();
        }
      });
      logger.info('File watcher setup for devices.csv');
    } catch (error) {
      logger.error(`Failed to setup file watcher: ${error.message}`);
    }
  }

  refreshCache() {
    try {
      const stats = fs.statSync(CSV_FILE);
      this.lastModified = stats.mtime;
      this.deviceCache = this.readDevicesFromFile();
      logger.debug(`Device cache refreshed with ${this.deviceCache.length} devices`);
    } catch (error) {
      logger.error(`Failed to refresh device cache: ${error.message}`);
      this.deviceCache = [];
    }
  }

  readDevices() {
    // Check if file was modified externally
    try {
      const stats = fs.statSync(CSV_FILE);
      if (!this.lastModified || stats.mtime > this.lastModified) {
        this.refreshCache();
      }
    } catch (error) {
      logger.debug(`Could not check file stats: ${error.message}`);
    }
    
    return [...this.deviceCache]; // Return copy of cache
  }

  readDevicesFromFile() {
    try {
      const content = fs.readFileSync(CSV_FILE, 'utf8');
      const lines = content.trim().split('\n').slice(1); // Skip header
      
      return lines.filter(line => line.trim()).map(line => {
        const [deviceId, mac, boxName, unityLicense, unityEmail, lastSeen, status] = line.split(',');
        return {
          deviceId: deviceId || '',
          mac: mac || '',
          boxName: boxName || '',
          unityLicense: unityLicense || '',
          unityEmail: unityEmail || '',
          lastSeen: lastSeen || '',
          status: status || 'unknown'
        };
      });
    } catch (error) {
      logger.error(`Failed to read devices.csv: ${error.message}`);
      return [];
    }
  }

  writeDevices(devices) {
    try {
      const csvContent = CSV_HEADERS + '\n' + devices.map(device => 
        `${device.deviceId},${device.mac},${device.boxName || ''},${device.unityLicense || ''},${device.unityEmail || ''},${device.lastSeen},${device.status}`
      ).join('\n');
      
      fs.writeFileSync(CSV_FILE, csvContent);
      logger.info(`Updated devices.csv with ${devices.length} devices`);
      
      // Update cache immediately after writing
      this.deviceCache = [...devices];
      this.lastModified = fs.statSync(CSV_FILE).mtime;
    } catch (error) {
      logger.error(`Failed to write devices.csv: ${error.message}`);
    }
  }

  async getDeviceMAC(deviceId) {
    try {
      const output = execSync(ADB_COMMANDS.MAC_ADDRESS(deviceId), { 
        timeout: 10000,
        encoding: 'utf8' 
      });
      
      const macMatch = output.match(/link\/ether\s+([a-f0-9:]{17})/i);
      return macMatch ? macMatch[1] : '';
    } catch (error) {
      logger.debug(`Failed to get MAC for ${deviceId}: ${error.message}`);
      return '';
    }
  }

  async detectBoxName(deviceId) {
    try {
      // First check if CXT box manager has this device (from WebSocket API)
      const boxName = cxtBoxManager.getBoxForDevice(deviceId);
      if (boxName !== 'Unknown') {
        logger.debug(`Found device ${deviceId} in CXT box: ${boxName}`);
        return boxName;
      }
      
      // Try to match by MAC address if CXT API didn't work
      const mac = await this.getDeviceMAC(deviceId);
      if (mac) {
        const boxByMac = cxtBoxManager.getBoxForDeviceByMAC(mac);
        if (boxByMac !== 'Unknown') {
          logger.debug(`Found device ${deviceId} by MAC ${mac} in box: ${boxByMac}`);
          return boxByMac;
        }
      }
      
      // Fallback: Check if it's an emulator
      try {
        const serialOutput = execSync(`adb -s ${deviceId} shell getprop ro.serialno`, {
          timeout: 5000,
          encoding: 'utf8'
        }).trim();
        
        if (serialOutput.match(/^emulator-/)) {
          return 'Emulator';
        }
      } catch (serialError) {
        logger.debug(`Could not get serial for ${deviceId}: ${serialError.message}`);
      }
      
      // If no CXT box found, mark as unassigned
      logger.debug(`Device ${deviceId} not found in any CXT box, marking as unassigned`);
      return 'Unassigned';
      
    } catch (error) {
      logger.debug(`Failed to detect box for ${deviceId}: ${error.message}`);
      return 'Unknown';
    }
  }

  async scanCurrentDevices() {
    try {
      const output = execSync(ADB_COMMANDS.DEVICES, { timeout: 15000, encoding: 'utf8' });
      const deviceLines = output.split('\n')
        .filter(line => line.includes('\tdevice'))
        .map(line => line.split('\t')[0].trim());
      
      const currentDevices = [];
      
      for (const deviceId of deviceLines) {
        logger.info(`Scanning device: ${deviceId}`);
        const mac = await this.getDeviceMAC(deviceId);
        
        // Try to detect box name via CXT API
        const boxName = await this.detectBoxName(deviceId);
        
        currentDevices.push({
          deviceId,
          mac,
          boxName: boxName || '',
          unityLicense: '',
          unityEmail: '',
          lastSeen: new Date().toISOString(),
          status: 'online'
        });
      }
      
      return currentDevices;
    } catch (error) {
      logger.error(`Failed to scan devices: ${error.message}`);
      return [];
    }
  }

  updateDeviceStatus() {
    const savedDevices = this.readDevices();
    const currentTime = new Date().toISOString();
    
    // Mark all devices as offline initially
    savedDevices.forEach(device => {
      device.status = 'offline';
    });
    
    return this.scanCurrentDevices().then(currentDevices => {
      // Update status and lastSeen for online devices
      currentDevices.forEach(currentDevice => {
        const existingDevice = savedDevices.find(d => 
          d.deviceId === currentDevice.deviceId || 
          (d.mac && currentDevice.mac && d.mac === currentDevice.mac)
        );
        
        if (existingDevice) {
          existingDevice.status = 'online';
          existingDevice.lastSeen = currentTime;
          existingDevice.deviceId = currentDevice.deviceId; // Update device ID if changed
          if (currentDevice.mac && !existingDevice.mac) {
            existingDevice.mac = currentDevice.mac; // Add MAC if missing
          }
          if (currentDevice.boxName && !existingDevice.boxName) {
            existingDevice.boxName = currentDevice.boxName; // Add box name if missing
          }
        } else {
          // New device found
          savedDevices.push(currentDevice);
        }
      });
      
      this.writeDevices(savedDevices);
      return savedDevices;
    });
  }

  addNewDevices() {
    return this.scanCurrentDevices().then(currentDevices => {
      const savedDevices = this.readDevices();
      const newDevices = [];
      
      currentDevices.forEach(currentDevice => {
        const exists = savedDevices.find(d => 
          d.deviceId === currentDevice.deviceId || 
          (d.mac && currentDevice.mac && d.mac === currentDevice.mac)
        );
        
        if (!exists) {
          newDevices.push(currentDevice);
          savedDevices.push(currentDevice);
        }
      });
      
      if (newDevices.length > 0) {
        this.writeDevices(savedDevices);
        logger.info(`Added ${newDevices.length} new devices`);
      }
      
      return { newDevices, allDevices: savedDevices };
    });
  }

  updateUnityData(deviceId, unityLicense, unityEmail) {
    const devices = this.readDevices();
    const device = devices.find(d => d.deviceId === deviceId);
    
    if (device) {
      device.unityLicense = unityLicense || device.unityLicense;
      device.unityEmail = unityEmail || device.unityEmail;
      this.writeDevices(devices);
      logger.info(`Updated Unity data for device ${deviceId}`);
      return true;
    }
    
    return false;
  }

  updateBoxName(deviceId, boxName) {
    const devices = this.readDevices();
    const device = devices.find(d => d.deviceId === deviceId);
    
    if (device) {
      device.boxName = boxName || device.boxName;
      this.writeDevices(devices);
      logger.info(`Updated box name for device ${deviceId} to ${boxName}`);
      return true;
    }
    
    return false;
  }

  updateMultipleDevices(updates) {
    const devices = this.readDevices();
    let updatedCount = 0;
    
    updates.forEach(update => {
      const device = devices.find(d => d.deviceId === update.deviceId);
      if (device) {
        if (update.unityLicense !== undefined) {
          device.unityLicense = update.unityLicense;
        }
        if (update.unityEmail !== undefined) {
          device.unityEmail = update.unityEmail;
        }
        if (update.boxName !== undefined) {
          device.boxName = update.boxName;
        }
        updatedCount++;
      }
    });
    
    if (updatedCount > 0) {
      this.writeDevices(devices);
      logger.info(`Bulk updated ${updatedCount} devices`);
    }
    
    return { updatedCount, totalRequested: updates.length };
  }

  getDevicesByBox() {
    const devices = this.readDevices();
    const grouped = {};
    
    devices.forEach(device => {
      const boxName = device.boxName || 'Unassigned';
      if (!grouped[boxName]) {
        grouped[boxName] = [];
      }
      grouped[boxName].push(device);
    });
    
    return grouped;
  }

  getDeviceByMac(mac) {
    const devices = this.readDevices();
    return devices.find(d => d.mac === mac);
  }

  getMissingDevices() {
    const devices = this.readDevices();
    return devices.filter(d => d.status === 'offline');
  }

  getOnlineDevices() {
    const devices = this.readDevices();
    return devices.filter(d => d.status === 'online');
  }

  cleanup() {
    try {
      fs.unwatchFile(CSV_FILE);
      logger.info('File watcher cleaned up for devices.csv');
    } catch (error) {
      logger.error(`Failed to cleanup file watcher: ${error.message}`);
    }
  }
}

export const deviceManager = new DeviceManager();