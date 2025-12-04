# Unity App ADB Monitor

Web dashboard for monitoring Android apps across multiple ADB devices. Shows service status, memory usage, logs, and allows app restarts.

## Prerequisites

### Install ADB (Android Debug Bridge)

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install android-tools-adb
```

**Alternative (if android-tools-adb not available):**
```bash
sudo apt install adb
```

**Manual installation:**
```bash
# Download Android SDK Platform Tools
wget https://dl.google.com/android/repository/platform-tools-latest-linux.zip
unzip platform-tools-latest-linux.zip
sudo mv platform-tools/adb /usr/local/bin/

# Verify installation
adb version
```

## Quick Start
```powershell
npm install
node server.js
# Open http://localhost:3000
```

## Main Features
- Monitor Android service status across all connected devices
- View PID, memory (PSS/RSS), and timing info
- Restart app with one click
- Auto-refresh status display
- Optional Telegram alerts

## Key Configuration
```powershell
$env:PACKAGE = "io.unitynodes.unityapp"
$env:SERVICE_NAME = "io.unitynodes.unityapp/expo.modules.pow.PowService"
$env:LOG_LEVEL = "debug"  # For troubleshooting
node server.js
```

Common settings:
| Variable | Default | Purpose |
|----------|---------|---------|
| PACKAGE | io.unitynodes.unityapp | Package to monitor |
| SERVICE_NAME | io.unitynodes.unityapp/expo.modules.pow.PowService | Full service name |
| REFRESH_INTERVAL | 60 | Refresh interval (seconds) |
| LOG_FILTER_PATTERN | ExpoPowService | Filter logcat by pattern |
| ENABLE_TELEGRAM | false | Enable notifications |
| ENABLE_NETWORK_DISCOVERY | false | Enable automatic device discovery |
| NETWORK_IP_RANGE | 192.168.44.1-254 | IP range to scan for ADB devices |

## Telegram Alerts (Optional)
```powershell
$env:ENABLE_TELEGRAM = "true"
$env:TELEGRAM_BOT_TOKEN = "your_token"
$env:TELEGRAM_CHAT_ID = "your_chat_id"
```

## Network Device Discovery (Optional)
Automatically discover and connect to ADB devices on your network:
```bash
# Enable network discovery
export ENABLE_NETWORK_DISCOVERY=true
export NETWORK_IP_RANGE="192.168.44.1-254"
export DISCOVERY_INTERVAL=300  # seconds
node server.js
```

---
Monitor only authorized devices.
