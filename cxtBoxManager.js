import WebSocket from 'ws';
import logger from './logger.js';

export class CXTBoxManager {
  constructor(boxConfig = []) {
    this.boxes = new Map();
    this.devices = new Map(); // deviceId -> boxName mapping
    this.deviceMACs = new Map(); // MAC -> boxName mapping
    
    // Default box configurations
    this.defaultBoxes = boxConfig.length > 0 ? boxConfig : [
      { name: 'Box-1', host: '127.0.0.1', port: 22223 },
      // Add more boxes as needed
    ];
    
    this.initializeBoxes();
  }

  initializeBoxes() {
    this.defaultBoxes.forEach(config => {
      this.addBox(config.name, config.host, config.port);
    });
  }

  addBox(name, host = '127.0.0.1', port = 22223) {
    const boxInfo = {
      name,
      host,
      port,
      connected: false,
      devices: [],
      ws: null,
      reconnectTimer: null
    };
    
    this.boxes.set(name, boxInfo);
    logger.info(`Added CXT box: ${name} at ${host}:${port}`);
    
    return boxInfo;
  }

  async connectToBox(boxName) {
    const box = this.boxes.get(boxName);
    if (!box) {
      throw new Error(`Box ${boxName} not found`);
    }

    if (box.ws && box.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${box.host}:${box.port}`;
      logger.info(`Connecting to CXT box ${boxName} at ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        box.ws = ws;
        box.connected = true;
        logger.info(`Connected to CXT box ${boxName}`);
        
        // Request device list
        this.requestDeviceList(boxName);
        resolve();
      });

      ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          this.handleBoxResponse(boxName, response);
        } catch (error) {
          logger.error(`Failed to parse CXT response from ${boxName}: ${error.message}`);
        }
      });

      ws.on('error', (error) => {
        logger.error(`CXT box ${boxName} connection error: ${error.message}`);
        box.connected = false;
        reject(error);
      });

      ws.on('close', () => {
        box.connected = false;
        box.ws = null;
        logger.warn(`CXT box ${boxName} disconnected`);
        
        // Schedule reconnection
        if (box.reconnectTimer) clearTimeout(box.reconnectTimer);
        box.reconnectTimer = setTimeout(() => {
          this.connectToBox(boxName).catch(err => 
            logger.error(`Failed to reconnect to ${boxName}: ${err.message}`)
          );
        }, 5000);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          reject(new Error(`Connection timeout for ${boxName}`));
        }
      }, 10000);
    });
  }

  requestDeviceList(boxName) {
    const command = {
      action: "GetDeviceList",
      comm: {}
    };
    
    this.sendCommand(boxName, command);
  }

  sendCommand(boxName, command) {
    const box = this.boxes.get(boxName);
    if (!box || !box.ws || box.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`Cannot send command to ${boxName}: not connected`);
      return false;
    }

    try {
      box.ws.send(JSON.stringify(command));
      logger.debug(`Sent command to ${boxName}:`, command);
      return true;
    } catch (error) {
      logger.error(`Failed to send command to ${boxName}: ${error.message}`);
      return false;
    }
  }

  handleBoxResponse(boxName, response) {
    const box = this.boxes.get(boxName);
    if (!box) return;

    switch (response.action) {
      case 'GetDeviceList':
        if (response.devices) {
          box.devices = response.devices;
          logger.info(`Got ${response.devices.length} devices from ${boxName}`);
          
          // Update device -> box mapping
          response.devices.forEach(device => {
            if (device.deviceId) {
              this.devices.set(device.deviceId, boxName);
            }
            if (device.mac) {
              this.deviceMACs.set(device.mac, boxName);
            }
          });
        }
        break;
        
      default:
        logger.debug(`Unknown response from ${boxName}:`, response);
    }
  }

  getBoxForDevice(deviceId) {
    return this.devices.get(deviceId) || 'Unknown';
  }

  getBoxForDeviceByMAC(mac) {
    return this.deviceMACs.get(mac) || 'Unknown';
  }

  getAllDevices() {
    const allDevices = [];
    this.boxes.forEach((box, boxName) => {
      if (box.devices) {
        box.devices.forEach(device => {
          allDevices.push({
            ...device,
            boxName: boxName
          });
        });
      }
    });
    return allDevices;
  }

  async connectToAllBoxes() {
    const connections = Array.from(this.boxes.keys()).map(boxName => 
      this.connectToBox(boxName).catch(err => {
        logger.error(`Failed to connect to ${boxName}: ${err.message}`);
        return null;
      })
    );
    
    await Promise.allSettled(connections);
    
    const connectedBoxes = Array.from(this.boxes.values()).filter(box => box.connected);
    logger.info(`Connected to ${connectedBoxes.length}/${this.boxes.size} CXT boxes`);
    
    return connectedBoxes;
  }

  getBoxStatus() {
    const status = {};
    this.boxes.forEach((box, name) => {
      status[name] = {
        connected: box.connected,
        deviceCount: box.devices ? box.devices.length : 0,
        host: box.host,
        port: box.port
      };
    });
    return status;
  }

  // Enhanced device operations via CXT API
  async takeScreenshot(deviceId) {
    const boxName = this.getBoxForDevice(deviceId);
    if (boxName === 'Unknown') {
      throw new Error(`Device ${deviceId} not found in any box`);
    }

    const command = {
      action: "TakeScreenshot",
      comm: {
        deviceIds: deviceId
      }
    };

    return this.sendCommand(boxName, command);
  }

  async sendTap(deviceId, x, y) {
    const boxName = this.getBoxForDevice(deviceId);
    if (boxName === 'Unknown') {
      throw new Error(`Device ${deviceId} not found in any box`);
    }

    const command = {
      action: "SendTap",
      comm: {
        deviceIds: deviceId,
        x: x,
        y: y
      }
    };

    return this.sendCommand(boxName, command);
  }

  async sendText(deviceId, text) {
    const boxName = this.getBoxForDevice(deviceId);
    if (boxName === 'Unknown') {
      throw new Error(`Device ${deviceId} not found in any box`);
    }

    const command = {
      action: "SendText",
      comm: {
        deviceIds: deviceId,
        text: text
      }
    };

    return this.sendCommand(boxName, command);
  }

  async scanBoxes(ipRange = '192.168.44', startIP = 1, endIP = 254, port = 22223) {
    logger.info(`Scanning for CXT boxes in range ${ipRange}.${startIP}-${endIP}:${port}`);
    const foundBoxes = [];
    const scanPromises = [];
    
    for (let i = startIP; i <= endIP; i++) {
      const host = `${ipRange}.${i}`;
      const scanPromise = this.testBoxConnection(host, port)
        .then(isBox => {
          if (isBox) {
            const boxName = `Box-${host.replace(/\./g, '-')}`;
            logger.info(`Found CXT box at ${host}:${port}`);
            foundBoxes.push({ name: boxName, host, port });
            
            // Add to our boxes if not already present
            if (!this.boxes.has(boxName)) {
              this.addBox(boxName, host, port);
            }
          }
        })
        .catch(err => {
          // Silent fail for connection attempts
        });
      
      scanPromises.push(scanPromise);
      
      // Batch in groups of 10 to avoid overwhelming the network
      if (scanPromises.length >= 10) {
        await Promise.allSettled(scanPromises.splice(0, 10));
      }
    }
    
    // Wait for remaining scans
    if (scanPromises.length > 0) {
      await Promise.allSettled(scanPromises);
    }
    
    logger.info(`Box scan complete. Found ${foundBoxes.length} CXT boxes`);
    return foundBoxes;
  }

  async testBoxConnection(host, port, timeout = 3000) {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://${host}:${port}`);
      
      const timeoutId = setTimeout(() => {
        ws.close();
        resolve(false);
      }, timeout);
      
      ws.on('open', () => {
        clearTimeout(timeoutId);
        ws.close();
        resolve(true);
      });
      
      ws.on('error', () => {
        clearTimeout(timeoutId);
        resolve(false);
      });
      
      ws.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  disconnect() {
    this.boxes.forEach((box, name) => {
      if (box.reconnectTimer) {
        clearTimeout(box.reconnectTimer);
      }
      if (box.ws) {
        box.ws.close();
      }
    });
    logger.info('Disconnected from all CXT boxes');
  }
}

// Create a global instance
export const cxtBoxManager = new CXTBoxManager();