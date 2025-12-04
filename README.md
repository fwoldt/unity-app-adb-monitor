# 📱 Unity ADB Monitor

A comprehensive web-based Android device management system with CXT PhoneFarm Box integration for Unity development workflows.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-blue.svg)](https://github.com/nodejs/node)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🚀 Quick Start

### Linux/macOS
```bash
npm install
npm start
```

### Windows
```batch
setup-windows.bat
```

Open http://localhost:3000 in your browser.

## 📋 Features

### 🎮 Device Management
- **Real-time Device Scanning** - Automatic discovery of Android devices via ADB
- **Live Screenshots** - Real-time device screen capture and display
- **Device Status Tracking** - Online/offline monitoring with timestamps
- **MAC Address Detection** - Automatic hardware identification
- **Batch Operations** - Execute commands on multiple devices simultaneously

### 📦 CXT PhoneFarm Integration
- **WebSocket API Connection** - Real-time communication with CXT boxes
- **Automatic Box Discovery** - Network scanning for PhoneFarm boxes
- **Device-to-Box Mapping** - Automatic assignment of devices to boxes
- **Box Status Monitoring** - Real-time connection and device count tracking

### 💾 Data Management
- **CSV-Based Database** - Persistent device information storage
- **Editable Device Properties** - Box names, Unity licenses, email addresses
- **Bulk Save Operations** - Update multiple devices simultaneously
- **Grouped Views** - Organize devices by PhoneFarm box
- **Export/Import** - CSV download and data backup

### 🌐 Web Interface
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Real-time Updates** - WebSocket-based live data refresh
- **Modal Management** - Intuitive device management interface
- **Visual Feedback** - Status indicators and success/error messages

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │    │   Node.js API   │    │  Android Devices│
│                 │    │                 │    │                 │
│ • Device List   │◄──►│ • Express Server│◄──►│ • ADB Commands  │
│ • Screenshots   │    │ • WebSocket     │    │ • Screenshots   │
│ • Management    │    │ • Device Manager│    │ • Status        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │
                               ▼
                       ┌─────────────────┐
                       │  CXT PhoneFarm  │
                       │     Boxes       │
                       │ • WebSocket API │
                       │ • Device Control│
                       └─────────────────┘
```

## 📁 Project Structure

```
unity-app-adb-monitor/
├── server.js              # Main Express server with WebSocket
├── deviceManager.js       # Device management and CSV operations
├── cxtBoxManager.js       # CXT PhoneFarm Box integration
├── adbCommands.js         # Android Debug Bridge commands
├── config.js             # Application configuration
├── index.html            # Main web interface
├── devices.csv           # Device database
├── package.json          # Node.js dependencies
├── CLAUDE.md             # Claude Code configuration
├── README-WINDOWS.md     # Windows setup guide
├── setup-windows.bat     # Windows automated setup
└── docs/                 # Additional documentation
```

## 🛠️ Installation

### Prerequisites
- **Node.js 18+** - [Download](https://nodejs.org)
- **Android SDK Platform Tools** - For ADB support
- **CXT Group Control Software** - For PhoneFarm Box integration

### Setup Steps

1. **Clone/Download Project**
   ```bash
   git clone <repository-url>
   cd unity-app-adb-monitor
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Setup ADB (Android Debug Bridge)**
   - Download Android SDK Platform Tools
   - Add to system PATH
   - Test with `adb devices`

4. **Start Server**
   ```bash
   npm start
   ```

5. **Open Web Interface**
   - Navigate to http://localhost:3000
   - Click "Scan New Devices" to begin

### Windows Quick Setup
For Windows users, use the automated setup:
```batch
setup-windows.bat
```
This script will:
- ✅ Check Node.js installation
- ✅ Verify ADB availability  
- ✅ Install dependencies
- ✅ Create convenience scripts
- ✅ Start the server

## 🎯 Usage

### Device Management

1. **Scan Devices**
   - Click "🔍 Scan New Devices" to discover connected Android devices
   - Devices appear with status, MAC address, and last seen time

2. **View Screenshots**
   - Click on any device tile to see live screenshot
   - Screenshots update automatically every few seconds

3. **Manage Device Data**
   - Click "📋 Device List" to open management modal
   - Edit box names, Unity licenses, and email addresses
   - Use "💾 Save All Data" to save all changes at once

4. **Group by Box**
   - Click "📦 Group by Box" to see devices organized by PhoneFarm box
   - Each box shows device count and connection status

### CXT PhoneFarm Integration

1. **Scan for Boxes**
   - Click "🔍 Scan Boxes" 
   - Enter IP range (e.g., 192.168.44)
   - System will discover CXT boxes automatically

2. **Connect to Boxes**
   - Click "🔗 Connect All" to establish WebSocket connections
   - Monitor connection status with "📊 Box Status"

3. **Device Mapping**
   - Devices are automatically mapped to boxes via MAC address
   - Manual box assignment available in device management

### Batch Operations

- **🔋 Battery 100%** - Set all devices to 100% battery simulation
- **⏹️ Stop Unity** - Close Unity application on all devices  
- **🔄 Restart Unity** - Restart Unity application
- **📱 Set Resolution** - Configure screen resolution
- **⚡ Reboot All** - Restart all connected devices

## 🔧 Configuration

### Environment Variables
```bash
PORT=3000                    # Server port
ADB_PATH=/path/to/adb       # Custom ADB path
LOG_LEVEL=info              # Logging level
CXT_DEFAULT_PORT=22223      # CXT box WebSocket port
```

### Device CSV Structure
```csv
deviceId,mac,boxName,unityLicense,unityEmail,lastSeen,status
192.168.44.45:5555,a0:c9:a0:b5:99:dd,Box-3,UL-123456789,test@unity.com,2025-12-04T13:37:14.240Z,online
```

### CXT Box Configuration
- Ensure CXT Group Control software is running on boxes
- WebSocket API must be accessible on port 22223
- Boxes should be on the same network as the monitoring system

## 🌐 API Reference

### Device Endpoints
```http
GET    /devices                 # List all devices
GET    /devices/grouped         # Devices grouped by box
POST   /devices/scan           # Scan for new devices
POST   /devices/update-status  # Update device status
POST   /devices/bulk-update    # Update multiple devices
POST   /devices/:id/unity      # Update Unity data
POST   /devices/:id/box        # Update box name
GET    /devices/download       # Download CSV
```

### CXT Box Endpoints
```http
GET    /boxes/status           # Box connection status
POST   /boxes/scan            # Scan for boxes
POST   /boxes/connect-all     # Connect to all boxes
```

### WebSocket Events
```javascript
// Real-time screenshot updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'screenshot') {
    updateDeviceImage(data.deviceId, data.image);
  }
};
```

## 🐛 Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| **ADB not found** | Install Android SDK Platform Tools, add to PATH |
| **Devices not detected** | Enable USB debugging, check cable connection |
| **CXT boxes not connecting** | Ensure CXT Group Control software is running |
| **Port 3000 in use** | Use `PORT=3001 npm start` |
| **Screenshots not updating** | Check device screen timeout settings |

### Debug Commands
```bash
# Check ADB connectivity
adb devices

# Test device connection  
adb -s DEVICE_ID shell echo "Connected"

# Restart ADB server
adb kill-server && adb start-server

# Test CXT box connection
node test-cxt-connection.js

# Check server logs
tail -f logs/app.log
```

## 🔐 Security Notes

- ADB commands are validated and sanitized
- WebSocket connections are rate-limited
- No sensitive data is exposed in logs
- File operations are restricted to project directory
- CXT box connections use secure WebSocket protocols

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [CXT Factory](https://www.cxtfactory.com/) for PhoneFarm Box hardware
- Android SDK Platform Tools team
- Node.js and Express.js communities
- WebSocket libraries and contributors

## 📞 Support

- 📖 **Documentation**: See `/docs` folder
- 🐛 **Issues**: Open GitHub issues for bug reports
- 💬 **Discussions**: Use GitHub discussions for questions
- 📧 **Contact**: [Your contact information]

---

**⚡ Built for Unity developers who need reliable Android device management at scale.**