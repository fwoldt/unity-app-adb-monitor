# Telegram Notifications Setup Guide

## Overview
This guide will help you set up Telegram notifications for the ADB Monitor application. You'll receive alerts when your monitored app stops running on any device.

⚠️ **Important:** This system uses **global cooldown with message buffering**:
- One cooldown timer for **all devices** (default: 5 minutes)
- Messages during cooldown are **buffered** (not lost)
- All buffered messages are **sent together** when cooldown expires
- Duplicate device alerts are **automatically deduplicated** in the buffer

---

## Step 1: Create a Telegram Bot

### 1.1 Open Telegram
Open the Telegram app on your phone or desktop, or use https://web.telegram.org

### 1.2 Find BotFather
Search for `@BotFather` in Telegram (this is the official bot for creating bots)

### 1.3 Create New Bot
1. Send `/newbot` to BotFather
2. Choose a name for your bot (e.g., "ADB Monitor Alerts")
3. Choose a username (must end with 'bot', e.g., `adb_monitor_alerts_bot`)

### 1.4 Get Your Bot Token
BotFather will reply with a message containing your bot token:
```
Use this token to access the HTTP API:
123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

**⚠️ IMPORTANT:** Keep this token secret! Anyone with this token can control your bot.

**Save this token** - you'll need it for configuration.

---

## Step 2: Get Your Chat ID

You need to tell the bot where to send messages. This can be:
- A private chat with you
- A group chat
- A channel

### Option A: Private Chat (Simplest)

1. **Find your bot** - Search for your bot's username in Telegram
2. **Start the conversation** - Click "Start" or send `/start`
3. **Get your Chat ID**:

**Method 1 - Using a Helper Bot:**
   - Search for `@userinfobot` in Telegram
   - Send it any message
   - It will reply with your User ID (this is your Chat ID)
   - Example: `Id: 123456789`

**Method 2 - Using API:**
   ```bash
   # Replace YOUR_BOT_TOKEN with your actual token
   curl https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
   
   Or in PowerShell:
   ```powershell
   Invoke-WebRequest -Uri "https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates"
   ```
   
   Look for `"chat":{"id":123456789` in the response.

### Option B: Group Chat

1. **Create a group** (or use existing one)
2. **Add your bot** to the group as a member
3. **Send a message** in the group mentioning your bot: `@your_bot_name hello`
4. **Get the Chat ID** using the API method above
   - Group IDs are **negative numbers** (e.g., `-1001234567890`)

### Option C: Channel

1. **Create a channel** (or use existing one)
2. **Make your bot an administrator** of the channel:
   - Go to channel info → Administrators → Add Administrator
   - Add your bot
3. **Get the Channel ID**:
   - Channel IDs start with `-100` (e.g., `-1001234567890`)
   - Send a message to the channel
   - Use the API method above to get updates
   
**Alternative for Public Channels:**
   - If your channel has a public username like `@mychannel`
   - You can use `@mychannel` directly as the chat ID

---

## Step 3: Configure the Application

### 3.1 Set Environment Variables

#### Windows (PowerShell):
```powershell
$env:ENABLE_TELEGRAM="true"
$env:TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
$env:TELEGRAM_CHAT_ID="123456789"

npm start
```

#### Windows (Command Prompt):
```cmd
set ENABLE_TELEGRAM=true
set TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
set TELEGRAM_CHAT_ID=123456789

npm start
```

#### Linux/Mac:
```bash
export ENABLE_TELEGRAM=true
export TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
export TELEGRAM_CHAT_ID="123456789"

npm start
```

### 3.2 Using .env File (Recommended)

Create a `.env` file in the project root:

```bash
# Telegram Configuration
ENABLE_TELEGRAM=true
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# Optional: Customize GLOBAL cooldown (default: 300000 = 5 minutes)
# Messages during cooldown are buffered and sent in batch when cooldown expires
NOTIFICATION_COOLDOWN=300000

# Optional: Retry settings
TELEGRAM_MAX_RETRIES=3
TELEGRAM_RETRY_DELAY=2000
```

Then install dotenv and load it in your app:
```bash
npm install dotenv
```

Add to the top of `server.js`:
```javascript
import 'dotenv/config';
```

---

## Step 4: Test the Configuration

### 4.1 Start the Server
```bash
npm start
```

### 4.2 Check Startup Logs
You should see:
```
[INFO]: Telegram bot initialized successfully
[INFO]: Notification cooldown: 5 minutes
[INFO]: Telegram notifications: ENABLED (cooldown: 5 min)
```

### 4.3 Check Status Endpoint
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/telegram/status" | ConvertFrom-Json
```

Expected response:
```json
{
  "enabled": true,
  "configured": true,
  "botTokenSet": true,
  "chatIdSet": true,
  "cooldownMinutes": 5,
  "cooldownSeconds": 300,
  "activeDevices": 0,
  "totalNotifications": 0,
  "successfulNotifications": 0,
  "failedNotifications": 0
}
```

### 4.4 Send Test Notification
```powershell
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/test"
```

You should receive a test message in Telegram:
```
🧪 Test Notification

This is a test notification from ADB Monitor.

📱 Device: Test Device
🔢 ID: test-device
📦 Package: com.unitynetwork.unityapp
⏰ Time: 2024-11-11T10:00:00.000Z

✅ If you received this, Telegram notifications are working correctly!
```

---

## Configuration Options

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_TELEGRAM` | No | `false` | Enable/disable notifications |
| `TELEGRAM_BOT_TOKEN` | Yes* | - | Bot token from BotFather |
| `TELEGRAM_CHAT_ID` | Yes* | - | Target chat/channel ID |
| `NOTIFICATION_COOLDOWN` | No | `300000` | **GLOBAL** cooldown in milliseconds (5 min) |
| `TELEGRAM_MAX_RETRIES` | No | `3` | Retry attempts on failure |
| `TELEGRAM_RETRY_DELAY` | No | `2000` | Delay between retries (ms) |

*Required when `ENABLE_TELEGRAM=true`

**Note:** The cooldown is **global across all devices**. During cooldown, messages are buffered and sent together when cooldown expires.

### Cooldown Examples

```bash
# 1 minute cooldown
NOTIFICATION_COOLDOWN=60000

# 10 minutes cooldown
NOTIFICATION_COOLDOWN=600000

# 30 minutes cooldown
NOTIFICATION_COOLDOWN=1800000

# 1 hour cooldown
NOTIFICATION_COOLDOWN=3600000
```

---

## API Endpoints

### GET /telegram/status
Get Telegram configuration status

**Example:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/telegram/status"
```

### GET /telegram/history
Get notification history

**Example:**
```powershell
# Get last 50 notifications (default)
Invoke-WebRequest -Uri "http://localhost:3000/telegram/history"

# Get last 10 notifications
Invoke-WebRequest -Uri "http://localhost:3000/telegram/history?limit=10"
```

### GET /telegram/cooldown
Get global cooldown status

**Example:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/telegram/cooldown"
```

**Response:**
```json
{
  "isGlobal": true,
  "lastNotification": "2025-11-11T10:00:00.000Z",
  "remainingSeconds": 180,
  "canNotify": false,
  "bufferedMessages": 3,
  "buffer": [
    {
      "deviceId": "192.168.1.100:5555",
      "deviceName": "Device A",
      "firstSeen": "2025-11-11T10:01:00.000Z",
      "lastSeen": "2025-11-11T10:03:00.000Z"
    }
  ]
}
```

### GET /telegram/buffer
Get buffered messages (queued during cooldown)

**Example:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/telegram/buffer"
```

### POST /telegram/test
Send test notification (bypasses cooldown)

**Example:**
```powershell
# Basic test
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/test"

# With custom device info
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/test?deviceId=my-device&deviceName=My Device"
```

### POST /telegram/flush
Manually flush buffered messages (send all now)

**Example:**
```powershell
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/flush"
```

**Response:**
```json
{
  "success": true,
  "flushed": 3,
  "success": 3,
  "failed": 0,
  "message": "Flushed 3 message(s): 3 sent, 0 failed"
}
```

### POST /telegram/clear-cooldown
Clear global cooldown (admin override)

**Example:**
```powershell
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/clear-cooldown"
```

### POST /telegram/clear-buffer
Clear message buffer without sending

**Example:**
```powershell
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/telegram/clear-buffer"
```

---

## Notification Format

When an app stops, you'll receive:

```
🚨 App Stopped Alert

📱 Device: Samsung Galaxy S21
🔢 Device ID: 192.168.1.100:5555
📦 Package: com.unitynetwork.unityapp
📌 Version: 1.0.5 (105)
⏰ Time: 2024-11-11T10:05:30.123Z

ℹ️ The monitored application has stopped running on this device.
```

---

## Troubleshooting

### Issue: "Telegram notifications: DISABLED (not configured)"

**Cause:** Missing bot token or chat ID

**Solution:**
1. Check that `TELEGRAM_BOT_TOKEN` is set
2. Check that `TELEGRAM_CHAT_ID` is set
3. Verify environment variables are loaded: `node -e "console.log(process.env.TELEGRAM_BOT_TOKEN)"`

### Issue: "Telegram notifications: CONFIGURED but DISABLED"

**Cause:** `ENABLE_TELEGRAM` not set to `true`

**Solution:**
```bash
ENABLE_TELEGRAM=true npm start
```

### Issue: Test notification fails with "Unauthorized"

**Cause:** Invalid bot token

**Solution:**
1. Verify token is correct (no extra spaces)
2. Get a new token from @BotFather if needed: `/token`

### Issue: Test notification fails with "Bad Request: chat not found"

**Cause:** Invalid chat ID or bot not started

**Solution:**
1. **For private chats:** Open bot and click "Start" first
2. **For groups:** Make sure bot is added as member
3. **For channels:** Make sure bot is administrator
4. Verify chat ID is correct (negative for groups/channels)

### Issue: Test notification fails with "Forbidden: bot was blocked by the user"

**Cause:** User blocked the bot

**Solution:**
1. Open the bot conversation
2. Unblock the bot
3. Send `/start` to the bot

### Issue: Not receiving notifications for app stops

**Possible causes:**
1. **Cooldown active** - Check cooldown status:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:3000/telegram/cooldown"
   ```

2. **App not actually stopping** - Check crash logs:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:3000/logs/YOUR_DEVICE_ID"
   ```

3. **Notification failed** - Check `app.log`:
   ```powershell
   Get-Content app.log -Tail 50 | Select-String "Telegram"
   ```

### Issue: Getting "Too Many Requests" errors

**Cause:** Hit Telegram rate limits (rare with 5-minute cooldown)

**Solution:**
1. Increase `NOTIFICATION_COOLDOWN`
2. Reduce number of monitored devices
3. Wait and retry - rate limits are temporary

---

## Security Best Practices

### 1. Protect Your Bot Token
```bash
# ❌ DON'T commit to git
git add .env  # NEVER do this!

# ✅ DO add to .gitignore
echo ".env" >> .gitignore
```

### 2. Use Environment Variables in Production
```bash
# ✅ Set on server/container
export TELEGRAM_BOT_TOKEN="..."
```

### 3. Limit Bot Permissions
- Only give bot the minimum permissions needed
- For channels: Only "Post Messages" permission required

### 4. Use Private Channels
- Don't use public groups for sensitive monitoring data
- Create a private channel for alerts

### 5. Rotate Tokens Regularly
If token is compromised:
1. Go to @BotFather
2. Send `/revoke`
3. Select your bot
4. Get new token
5. Update configuration

---

## Advanced Configuration

### Multiple Chat Targets (Future Enhancement)

To send to multiple chats, modify `config.js`:
```javascript
TELEGRAM: {
  chatIds: process.env.TELEGRAM_CHAT_IDS?.split(',') || [],
  // ... other config
}
```

Then set:
```bash
TELEGRAM_CHAT_IDS="123456789,-1001234567890"
```

### Custom Message Format

Edit `TelegramNotifier.js` → `formatMessage()` to customize:

```javascript
formatMessage(deviceId, deviceName, deviceInfo) {
  return `🚨 ALERT\n` +
         `Device: ${deviceName}\n` +
         `Status: App Stopped\n` +
         `Time: ${new Date().toISOString()}`;
}
```

### Conditional Notifications

Add logic to only notify for specific devices:

```javascript
// In server.js, modify notification call:
if (deviceName.includes('Production')) {
  await telegramNotifier.notify(id, deviceName, deviceInfo);
}
```

---

## Production Checklist

- [ ] Bot token secured (not in source control)
- [ ] Chat ID configured correctly
- [ ] Test notification sent successfully
- [ ] Cooldown period appropriate for your needs
- [ ] Monitoring `app.log` for Telegram errors
- [ ] Bot has necessary permissions (channel admin, etc.)
- [ ] Fallback alerting method configured
- [ ] Team members added to notification channel
- [ ] Documentation shared with team

---

## FAQ

**Q: Can I use the same bot for multiple servers?**  
A: Yes, each server instance can use the same bot token and chat ID.

**Q: Can I send to multiple channels?**  
A: Currently supports one chat ID. For multiple targets, you'll need to modify the code (see Advanced Configuration).

**Q: What happens if Telegram is down?**  
A: Notifications will fail but app monitoring continues. Failures are logged in `app.log`.

**Q: Can I get notifications for app starts too?**  
A: Yes, modify `server.js` to also notify on `STARTED` events.

**Q: How many devices can I monitor?**  
A: No hard limit. With 5-minute cooldown, even 100 devices won't hit rate limits.

**Q: Can I customize the message format?**  
A: Yes, edit the `formatMessage()` method in `TelegramNotifier.js`.

---

## Support Resources

- **Telegram Bot API Documentation:** https://core.telegram.org/bots/api
- **BotFather Commands:** Send `/help` to @BotFather
- **node-telegram-bot-api:** https://github.com/yagop/node-telegram-bot-api

---

**Setup Complete!** 🎉

You should now receive Telegram notifications when your monitored app stops running on any device, with automatic spam protection.
