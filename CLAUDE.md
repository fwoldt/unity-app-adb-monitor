# Claude Code Configuration

This file contains configuration and context for optimal Claude Code usage.

## Project Overview
Unity ADB Monitor - A comprehensive web-based Android device management system with CXT PhoneFarm Box integration.

## Commands

### Development
```bash
npm start          # Start development server
npm run dev        # Alternative dev command
node server.js     # Direct server start
```

### Testing
```bash
npm test          # Run tests (if configured)
npm run lint      # Code linting
npm run typecheck # Type checking
```

### Windows Setup
```bash
setup-windows.bat     # Complete Windows setup
install-adb.bat       # ADB installation helper
QUICK-START.bat       # Interactive menu
start-server.bat      # Start server (generated)
```

### Project Management
```bash
# Device scanning and management
curl -X POST http://localhost:3000/devices/scan
curl -X POST http://localhost:3000/devices/update-status
curl http://localhost:3000/devices

# CXT Box management  
curl -X POST http://localhost:3000/boxes/scan -d '{"ipRange":"192.168.44","startIP":1,"endIP":50}'
curl -X POST http://localhost:3000/boxes/connect-all
curl http://localhost:3000/boxes/status

# Bulk updates
curl -X POST http://localhost:3000/devices/bulk-update -H "Content-Type: application/json" -d '{"updates":[{"deviceId":"192.168.44.45:5555","boxName":"Box-1","unityLicense":"UL-123"}]}'
```

## Architecture

### Backend (Node.js/Express)
- `server.js` - Main server with WebSocket support
- `deviceManager.js` - Device management and CSV operations
- `cxtBoxManager.js` - CXT PhoneFarm Box WebSocket API integration
- `adbCommands.js` - Android Debug Bridge command definitions
- `config.js` - Application configuration

### Frontend (Vanilla HTML/CSS/JS)
- `index.html` - Main web interface with device management
- WebSocket connection for real-time updates
- Responsive design with device screenshots
- Modal-based device management with bulk operations

### Data Storage
- `devices.csv` - Primary device database
- CSV structure: `deviceId,mac,boxName,unityLicense,unityEmail,lastSeen,status`
- Automatic file watching and cache reloading

## Key Features

### Device Management
- ✅ Real-time device scanning via ADB
- ✅ MAC address detection and storage  
- ✅ Device status tracking (online/offline)
- ✅ Screenshot capture and live view
- ✅ Batch operations (reboot, Unity control)

### CXT PhoneFarm Integration  
- ✅ WebSocket API connection to CXT boxes
- ✅ Automatic device-to-box mapping
- ✅ Box discovery via IP range scanning
- ✅ Real-time box status monitoring

### Data Management
- ✅ Editable device properties (box name, Unity license, email)
- ✅ Bulk save functionality for all devices
- ✅ Grouped view by box name
- ✅ CSV export/import capabilities
- ✅ Automatic data persistence

### Web Interface
- ✅ Responsive design for all screen sizes
- ✅ Real-time screenshot updates
- ✅ Modal-based device management
- ✅ Batch operation controls
- ✅ CXT box management interface

## Development Notes

### Recent Updates
- Added box name editing functionality
- Implemented bulk save for all device data
- Fixed JSON parsing errors in save operations
- Added CXT box grouping and management
- Enhanced error handling and user feedback

### Code Structure
- ES6 modules with import/export
- Async/await pattern for API calls
- WebSocket for real-time communication  
- Express.js REST API with proper error handling
- CSV-based data storage with file watching

### Dependencies
- `express` - Web server framework
- `ws` - WebSocket implementation
- `cors` - Cross-origin resource sharing
- `child_process` - ADB command execution

## Troubleshooting

### Common Issues
1. **ADB not found** - Run `install-adb.bat` on Windows or install Android SDK Platform Tools
2. **Devices not detected** - Check USB debugging is enabled on devices
3. **CXT boxes not connecting** - Ensure CXT Group Control software is running on boxes
4. **Port conflicts** - Use `PORT=3001 npm start` to use different port

### Windows Specific
- Use provided batch scripts for easy setup
- Ensure Node.js is installed with PATH option
- Run scripts as administrator if needed
- Check Windows Defender/antivirus settings

### Debug Commands
```bash
# Check ADB connectivity
adb devices

# Test device connection
adb -s DEVICE_ID shell echo "test"

# Check server logs
tail -f logs/app.log

# Test CXT box connection
node test-cxt-connection.js
```

## File Structure
```
unity-app-adb-monitor/
├── server.js              # Main server
├── deviceManager.js       # Device management
├── cxtBoxManager.js       # CXT box integration  
├── index.html            # Web interface
├── devices.csv           # Device database
├── config.js             # Configuration
├── package.json          # Dependencies
├── CLAUDE.md             # This file
├── README-WINDOWS.md     # Windows setup guide
├── setup-windows.bat     # Windows setup script
└── docs/                 # Additional documentation
```

## API Endpoints

### Device Management
- `GET /devices` - List all devices
- `GET /devices/grouped` - Devices grouped by box
- `POST /devices/scan` - Scan for new devices
- `POST /devices/update-status` - Update device status
- `POST /devices/bulk-update` - Update multiple devices
- `POST /devices/:id/unity` - Update Unity data for device
- `POST /devices/:id/box` - Update box name for device

### CXT Box Management
- `GET /boxes/status` - Get box connection status
- `POST /boxes/scan` - Scan for boxes in IP range
- `POST /boxes/connect-all` - Connect to all discovered boxes

### Utility
- `GET /screenshot/:deviceId` - Get device screenshot
- `GET /devices/download` - Download devices CSV
- `WebSocket /` - Real-time updates and screenshots

## Performance Notes
- Device scanning is batched to avoid network flooding
- Screenshots are cached and rate-limited
- CSV operations use file watching for efficiency
- WebSocket connections are managed per client
- Background processes are properly cleaned up

## Security Considerations
- ADB commands are sanitized and validated
- WebSocket connections are rate-limited
- File operations are restricted to project directory
- No sensitive data is logged or exposed
- CSV files contain only device management data