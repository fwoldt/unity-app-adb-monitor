# Telegram Notifications - Quick Reference

⚠️ **Important Change:** Cooldown is now **GLOBAL** (not per-device)
- Messages are **buffered** during cooldown
- All buffered messages are sent **in batch** when cooldown expires

## Quick Start

```bash
# 1. Install (already done)
npm install node-telegram-bot-api

# 2. Configure
ENABLE_TELEGRAM=true
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# 3. Start
npm start

# 4. Test
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/test"
```

## Configuration Variables

```bash
ENABLE_TELEGRAM=true                    # Enable notifications
TELEGRAM_BOT_TOKEN=123456:ABC...        # From @BotFather
TELEGRAM_CHAT_ID=123456789              # Your chat/channel ID
NOTIFICATION_COOLDOWN=300000            # 5 minutes GLOBAL cooldown (in ms)
TELEGRAM_MAX_RETRIES=3                  # Retry attempts
TELEGRAM_RETRY_DELAY=2000               # 2 seconds between retries
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/telegram/status` | Get configuration & global status |
| GET | `/telegram/history?limit=50` | Get notification history |
| GET | `/telegram/cooldown` | Get global cooldown status |
| GET | `/telegram/buffer` | Get buffered messages |
| POST | `/telegram/test` | Send test notification (bypasses cooldown) |
| POST | `/telegram/flush` | Manually flush buffered messages |
| POST | `/telegram/clear-cooldown` | Clear global cooldown |
| POST | `/telegram/clear-buffer` | Clear message buffer |

## PowerShell Examples

```powershell
# Check status
Invoke-WebRequest -Uri "http://localhost:3000/telegram/status" | ConvertFrom-Json

# Send test
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/test"

# View history
Invoke-WebRequest -Uri "http://localhost:3000/telegram/history?limit=10" | ConvertFrom-Json

# Check global cooldown
Invoke-WebRequest -Uri "http://localhost:3000/telegram/cooldown" | ConvertFrom-Json

# Check buffered messages
Invoke-WebRequest -Uri "http://localhost:3000/telegram/buffer" | ConvertFrom-Json

# Manually flush buffer (send all buffered messages now)
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/flush" | ConvertFrom-Json

# Clear global cooldown
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/clear-cooldown" | ConvertFrom-Json

# Clear message buffer
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/clear-buffer" | ConvertFrom-Json
```

## How It Works (Global Cooldown + Buffering)

```
App Stops → Status Poll Detects → Check Global Cooldown
                                        ↓
                                   ┌────────────────┐
                                   │ Cooldown OFF?  │
                                   └────┬───────┬───┘
                                    YES │       │ NO
                                        ↓       ↓
                      1. Flush buffer (if any)  Add to buffer
                      2. Send current message   (deduplicated)
                      3. Start cooldown timer
```

## Anti-Spam Protection (Global)

- ✅ **Single global cooldown** for all devices
- ✅ **Message buffering** during cooldown
- ✅ **Automatic deduplication** (updates existing buffer entries)
- ✅ **Batch sending** when cooldown expires
- ✅ 5-minute cooldown (configurable)

**Example Scenario:**
```
10:00:00 - Device A stops → Send immediately ✅ [Cooldown starts]
10:01:00 - Device B stops → Buffer 📋 (cooldown active)
10:02:00 - Device C stops → Buffer 📋 (cooldown active)
10:03:00 - Device A stops again → Update buffer entry 📝
10:05:01 - Device D stops → Cooldown expired!
           → Flush buffer: Send A, B, C messages 📨📨📨
           → Send D message 📨
           → Restart cooldown ⏱️
```

**Benefits:**
- No message spam even with many devices
- No messages lost (all buffered)
- Batched delivery reduces notification noise
- Updates prevent duplicate alerts for same device

## Notification Message

```
🚨 App Stopped Alert

📱 Device: Samsung Galaxy S21
🔢 Device ID: 192.168.1.100:5555
📦 Package: com.unitynetwork.unityapp
📌 Version: 1.0.5 (105)
⏰ Time: 2024-11-11T10:05:30.123Z

ℹ️ The monitored application has stopped running on this device.
```

## Setup Steps (Brief)

1. **Create bot:** Talk to @BotFather → `/newbot`
2. **Get token:** Copy token from BotFather
3. **Get chat ID:** 
   - Private: Use @userinfobot
   - Group: Add bot, get ID from API
   - Channel: Make bot admin, get ID from API
4. **Configure:** Set environment variables
5. **Test:** POST to `/telegram/test`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "DISABLED (not configured)" | Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID |
| "CONFIGURED but DISABLED" | Set ENABLE_TELEGRAM=true |
| "Unauthorized" | Check bot token is correct |
| "chat not found" | Start bot / Add to group / Make admin |
| No notifications | Check cooldown status |
| "Too Many Requests" | Increase NOTIFICATION_COOLDOWN |

## Logs to Check

```powershell
# Startup status
Get-Content app.log | Select-String "Telegram"

# Notification attempts
Get-Content app.log | Select-String "Telegram alert"

# Errors
Get-Content app.log | Select-String "Telegram.*error" -CaseSensitive:$false
```

## Status Responses

**Enabled & Working:**
```json
{
  "enabled": true,
  "configured": true,
  "cooldownType": "global",
  "cooldownMinutes": 5,
  "lastNotification": "2025-11-11T10:00:00.000Z",
  "remainingCooldownSeconds": 180,
  "canNotify": false,
  "bufferedMessages": 3,
  "totalNotifications": 10,
  "successfulNotifications": 10,
  "failedNotifications": 0
}
```

**Buffer Status:**
```json
{
  "size": 3,
  "messages": [
    {
      "deviceId": "192.168.1.100:5555",
      "deviceName": "Device A",
      "firstSeen": "2025-11-11T10:01:00.000Z",
      "lastSeen": "2025-11-11T10:03:00.000Z"
    },
    {
      "deviceId": "192.168.1.101:5555",
      "deviceName": "Device B",
      "firstSeen": "2025-11-11T10:02:00.000Z",
      "lastSeen": "2025-11-11T10:02:00.000Z"
    }
  ]
}
```

**Not Configured:**
```json
{
  "enabled": false,
  "configured": false,
  "botTokenSet": false,
  "chatIdSet": false
}
```

## Common Chat IDs

- **Private chat:** Positive number (e.g., `123456789`)
- **Group chat:** Negative number (e.g., `-987654321`)
- **Channel:** Starts with `-100` (e.g., `-1001234567890`)
- **Public channel:** Username (e.g., `@mychannel`)

## Rate Limits

- Telegram allows ~30 messages/second per bot
- With 5-min cooldown: Max 12 messages/hour per device
- 100 devices: Max 1200 messages/hour = 20/minute
- **Well within limits** ✅

## Files Created/Modified

| File | Purpose |
|------|---------|
| `TelegramNotifier.js` | Main notification logic |
| `config.js` | Configuration (updated) |
| `server.js` | Integration & endpoints (updated) |
| `TELEGRAM_SETUP.md` | Detailed setup guide |
| `TELEGRAM_PLAN.md` | Implementation plan |

## Environment Variable Template

```bash
# Copy to .env file
ENABLE_TELEGRAM=true
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
NOTIFICATION_COOLDOWN=300000
```

## Security Checklist

- [ ] Bot token not in source control
- [ ] Using .env file or environment variables
- [ ] .env added to .gitignore
- [ ] Bot permissions limited to minimum needed
- [ ] Using private channel/group (not public)
- [ ] Team members have access to notification channel

---

**For full setup instructions, see:** `TELEGRAM_SETUP.md`
