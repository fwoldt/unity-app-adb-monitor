# Unity App ADB Monitor

Web dashboard for monitoring Android apps across multiple ADB devices. Shows service status, memory usage, logs, and allows app restarts.

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

## Telegram Alerts (Optional)
```powershell
$env:ENABLE_TELEGRAM = "true"
$env:TELEGRAM_BOT_TOKEN = "your_token"
$env:TELEGRAM_CHAT_ID = "your_chat_id"
```

---
Monitor only authorized devices.
