# Unity App ADB Monitor (Simplified)

Monitors an Android app across all connected `adb` devices, logs start/stop events, collects filtered logcat output, and can send optional Telegram alerts.

## What It Does
- Lists devices and checks if the target package is running.
- Records lifecycle events: `STARTED`, `STOPPED`, `PID_CHECK_FAILED`.
- Writes two per‑device files: crash log (events) and app log (filtered lines).
- Restarts logcat automatically if the app PID changes.
- Optional Telegram notifications with a global cooldown and buffering.

## Quick Start
```powershell
npm install
$env:PACKAGE = "com.unitynetwork.unityapp"  # or your package
node server.js
# Open http://localhost:3000
```

## Minimal Config (env vars)
| Var | Purpose | Default |
|-----|---------|---------|
| PACKAGE | Package to monitor | com.unitynetwork.unityapp |
| LOG_FILTER_PATTERN | Log line match pattern | ExpoPowService |
| ENABLE_TELEGRAM | Enable Telegram alerts | false |
| TELEGRAM_BOT_TOKEN | Bot token | (empty) |
| TELEGRAM_CHAT_ID | Chat / channel id | (empty) |
| NOTIFICATION_COOLDOWN | Global cooldown ms | 300000 |

Set any variable with `$env:NAME = "value"` before `node server.js`.

## Core Endpoints
| Method | Path | Use |
|--------|------|-----|
| GET | /status | Current state per device |
| GET | /logs/:deviceId | Crash log events |
| GET | /applogs/:deviceId | Filtered app log |
| POST | /restart-app?deviceId=ID | Restart monitored app |
| GET | /telegram/status | Telegram status |
| POST | /telegram/test | Test alert |

## Telegram (Optional)
Enable by setting `ENABLE_TELEGRAM=true`, plus bot token & chat id. Alerts change icon/title for STARTED vs STOPPED. During cooldown, events are buffered then flushed in batch.

## Files Generated
`<device>-crash-log.txt` – lifecycle events.
`<device>-app-log.txt` – filtered logcat lines.

## Restart Example
```powershell
Invoke-RestMethod -Method POST "http://localhost:3000/restart-app?deviceId=DEVICE_ID"
```

## Basic Troubleshooting
| Issue | Fix |
|-------|-----|
| No devices | Check `adb devices` output / connections |
| Wrong package | Set `PACKAGE` env var correctly |
| No Telegram alerts | Verify token, chat id, enabled flag |
| Many PID_CHECK_FAILED | App not installed / package mismatch |

## Extend Ideas
- Add battery stats endpoint (`dumpsys batterystats`).
- Rotate logs by size.
- Add WebSocket for live updates.

## Test Snippets
```powershell
Invoke-RestMethod http://localhost:3000/status | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/telegram/status | ConvertTo-Json
```

---
Use responsibly; monitor only apps/devices you are authorized to access.
