import TelegramBot from 'node-telegram-bot-api';
import logger from './logger.js';
import { CONFIG } from './config.js';

/**
 * Manages Telegram notifications with global cooldown and message buffering
 * Messages are buffered during cooldown and sent in batch when cooldown expires
 */
export class TelegramNotifier {
  constructor() {
    this.config = CONFIG.TELEGRAM;
    this.bot = null;
    this.lastNotificationTime = null; // Global cooldown timestamp
    this.messageBuffer = []; // Buffer for messages during cooldown
    this.notificationHistory = []; // Array of notification objects
    this.isEnabled = this.config.enabled && this.config.botToken && this.config.chatId;
    this.isSending = false; // Flag to prevent concurrent sends
    
    if (this.isEnabled) {
      this.initializeBot();
    } else if (this.config.enabled) {
      logger.warn('Telegram notifications enabled but missing botToken or chatId');
    }
  }

  initializeBot() {
    try {
      this.bot = new TelegramBot(this.config.botToken, { polling: false });
      logger.info('Telegram bot initialized successfully');
      logger.info(`Notification cooldown: ${this.config.notificationCooldown / 60000} minutes`);
    } catch (err) {
      logger.error(`Failed to initialize Telegram bot: ${err.message}`);
      this.isEnabled = false;
    }
  }

  /**
   * Check if global cooldown period has passed
   * @returns {boolean} True if notifications can be sent
   */
  canNotify() {
    if (!this.isEnabled) return false;
    if (!this.lastNotificationTime) return true;
    
    const elapsed = Date.now() - this.lastNotificationTime;
    return elapsed >= this.config.notificationCooldown;
  }

  /**
   * Get remaining global cooldown time in seconds
   * @returns {number} Remaining seconds
   */
  getRemainingCooldown() {
    if (!this.lastNotificationTime) return 0;
    
    const elapsed = Date.now() - this.lastNotificationTime;
    const remaining = this.config.notificationCooldown - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /**
   * Add message to buffer
   * @param {string} deviceId - Device identifier
   * @param {string} deviceName - Human-readable device name
   * @param {object} deviceInfo - Device information object
   */
  addToBuffer(deviceId, deviceName, deviceInfo) {
    // Check if device already in buffer (avoid duplicates)
    const existingIndex = this.messageBuffer.findIndex(msg => msg.deviceId === deviceId);
    
    if (existingIndex >= 0) {
      // Update existing entry with latest info
      this.messageBuffer[existingIndex] = {
        deviceId,
        deviceName,
        deviceInfo,
        firstSeen: this.messageBuffer[existingIndex].firstSeen,
        lastSeen: new Date().toISOString()
      };
      logger.debug(`Updated buffered message for ${deviceId} (${deviceName})`);
    } else {
      // Add new entry
      this.messageBuffer.push({
        deviceId,
        deviceName,
        deviceInfo,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      });
      logger.info(`Buffered notification for ${deviceId} (${deviceName}) - buffer size: ${this.messageBuffer.length}`);
    }
  }

  /**
   * Flush all buffered messages
   * @returns {Promise<object>} Result object with flush statistics
   */
  async flushBuffer() {
    if (this.messageBuffer.length === 0) {
      return { flushed: 0, success: 0, failed: 0 };
    }

    if (this.isSending) {
      logger.warn('Flush already in progress, skipping');
      return { flushed: 0, success: 0, failed: 0, reason: 'already_sending' };
    }

    this.isSending = true;
    const messagesToSend = [...this.messageBuffer];
    this.messageBuffer = []; // Clear buffer
    
    logger.info(`Flushing ${messagesToSend.length} buffered notifications`);
    
    let successCount = 0;
    let failedCount = 0;

    for (const msg of messagesToSend) {
      const result = await this.sendNotification(msg.deviceId, msg.deviceName, msg.deviceInfo, msg.firstSeen);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
      
      // Small delay between messages to avoid rate limiting
      if (messagesToSend.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.isSending = false;
    this.lastNotificationTime = Date.now(); // Update global cooldown
    
    logger.info(`Flush complete: ${successCount} sent, ${failedCount} failed`);
    return { 
      flushed: messagesToSend.length, 
      success: successCount, 
      failed: failedCount 
    };
  }

  /**
   * Format notification message
   * @param {string} deviceId - Device identifier
   * @param {string} deviceName - Human-readable device name
   * @param {object} deviceInfo - Device information object
   * @param {string} firstSeen - ISO timestamp when first detected (optional)
   * @returns {string} Formatted message
   */
  formatMessage(deviceId, deviceName, deviceInfo, firstSeen = null) {
    const timestamp = new Date().toISOString();
    const event = deviceInfo.event || 'STOPPED';
    
    // Determine alert icon and title based on event
    let icon, title, statusMessage;
    if (event === 'STARTED') {
      icon = '✅';
      title = 'App Started Alert';
      statusMessage = 'The monitored application has started running on this device.';
    } else if (event === 'STOPPED') {
      icon = '🚨';
      title = 'App Stopped Alert';
      statusMessage = 'The monitored application has stopped running on this device.';
    } else {
      icon = '⚠️';
      title = 'App Status Alert';
      statusMessage = `Event: ${event}`;
    }
    
    let message = `${icon} *${title}*\n\n` +
           `📱 *Device:* ${deviceName}\n` +
           `🔢 *Device ID:* \`${deviceId}\`\n` +
           `📦 *Package:* ${CONFIG.PACKAGE}\n` +
           `⏰ *Detected:* ${firstSeen || timestamp}\n`;
    
    // Add version info if available
    if (deviceInfo.versionName) {
      message += `📌 *Version:* ${deviceInfo.versionName} (${deviceInfo.versionCode || 'N/A'})\n`;
    }
    
    message += `\n` +
           `ℹ️ ${statusMessage}`;
    
    return message;
  }

  /**
   * Send notification immediately with retry logic (internal method)
   * @param {string} deviceId - Device identifier
   * @param {string} deviceName - Human-readable device name
   * @param {object} deviceInfo - Device information object
   * @param {string} firstSeen - ISO timestamp when first detected (optional)
   * @returns {Promise<object>} Result object with success status
   */
  async sendNotification(deviceId, deviceName, deviceInfo, firstSeen = null) {
    const message = this.formatMessage(deviceId, deviceName, deviceInfo, firstSeen);
    
    // Try sending with retries
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.bot.sendMessage(this.config.chatId, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });

        // Success - update tracking
        this.notificationHistory.push({
          deviceId,
          deviceName,
          timestamp: new Date().toISOString(),
          success: true,
          attempt
        });

        logger.info(`Telegram notification sent for ${deviceId} (${deviceName}) on attempt ${attempt}`);
        return { success: true, attempt };

      } catch (err) {
        logger.error(`Telegram send attempt ${attempt}/${this.config.maxRetries} failed: ${err.message}`);
        
        if (attempt < this.config.maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        } else {
          // All retries failed
          this.notificationHistory.push({
            deviceId,
            deviceName,
            timestamp: new Date().toISOString(),
            success: false,
            error: err.message
          });
          
          return { success: false, reason: 'send_failed', error: err.message };
        }
      }
    }
  }

  /**
   * Handle notification request with global cooldown and buffering
   * @param {string} deviceId - Device identifier
   * @param {string} deviceName - Human-readable device name
   * @param {object} deviceInfo - Device information object
   * @returns {Promise<object>} Result object with success status
   */
  async notify(deviceId, deviceName, deviceInfo) {
    if (!this.isEnabled) {
      logger.debug('Telegram notifications disabled, skipping');
      return { success: false, reason: 'disabled' };
    }

    if (!this.canNotify()) {
      // Cooldown active - buffer the message
      const remaining = this.getRemainingCooldown();
      this.addToBuffer(deviceId, deviceName, deviceInfo);
      logger.debug(`Global cooldown active (${remaining}s remaining) - message buffered`);
      return { success: false, reason: 'cooldown', remainingSeconds: remaining, buffered: true };
    }

    // Cooldown expired - flush any buffered messages first
    if (this.messageBuffer.length > 0) {
      const flushResult = await this.flushBuffer();
      logger.info(`Flushed buffer before new notification: ${flushResult.flushed} messages`);
    }

    // Send the current notification
    const result = await this.sendNotification(deviceId, deviceName, deviceInfo);
    
    if (result.success) {
      this.lastNotificationTime = Date.now(); // Update global cooldown
    }
    
    return result;
  }

  /**
   * Send test notification (bypasses cooldown)
   * @param {string} deviceId - Device identifier
   * @param {string} deviceName - Human-readable device name
   * @returns {Promise<object>} Result object with success status
   */
  async sendTestNotification(deviceId = 'test-device', deviceName = 'Test Device') {
    if (!this.isEnabled) {
      return { success: false, reason: 'disabled', message: 'Telegram notifications are not enabled or configured' };
    }

    const message = `🧪 *Test Notification*\n\n` +
                   `This is a test notification from ADB Monitor.\n\n` +
                   `📱 *Device:* ${deviceName}\n` +
                   `🔢 *ID:* \`${deviceId}\`\n` +
                   `📦 *Package:* ${CONFIG.PACKAGE}\n` +
                   `⏰ *Time:* ${new Date().toISOString()}\n\n` +
                   `✅ If you received this, Telegram notifications are working correctly!`;

    try {
      await this.bot.sendMessage(this.config.chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
      
      logger.info('Test notification sent successfully');
      return { success: true, message: 'Test notification sent' };
    } catch (err) {
      logger.error(`Test notification failed: ${err.message}`);
      return { success: false, error: err.message, message: `Failed to send: ${err.message}` };
    }
  }

  /**
   * Get notification history (last N entries)
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Array of notification history objects
   */
  getHistory(limit = 50) {
    return this.notificationHistory.slice(-limit);
  }

  /**
   * Get global cooldown status
   * @returns {object} Global cooldown status
   */
  getCooldownStatus() {
    return {
      isGlobal: true,
      lastNotification: this.lastNotificationTime ? new Date(this.lastNotificationTime).toISOString() : null,
      lastNotificationTimestamp: this.lastNotificationTime,
      remainingSeconds: this.getRemainingCooldown(),
      canNotify: this.canNotify(),
      bufferedMessages: this.messageBuffer.length,
      buffer: this.messageBuffer.map(msg => ({
        deviceId: msg.deviceId,
        deviceName: msg.deviceName,
        firstSeen: msg.firstSeen,
        lastSeen: msg.lastSeen
      }))
    };
  }

  /**
   * Get buffer status
   * @returns {object} Buffer information
   */
  getBufferStatus() {
    return {
      size: this.messageBuffer.length,
      messages: this.messageBuffer.map(msg => ({
        deviceId: msg.deviceId,
        deviceName: msg.deviceName,
        firstSeen: msg.firstSeen,
        lastSeen: msg.lastSeen
      }))
    };
  }

  /**
   * Clear global cooldown (admin override)
   */
  clearCooldown() {
    const existed = this.lastNotificationTime !== null;
    this.lastNotificationTime = null;
    logger.info(`Global cooldown cleared (existed: ${existed})`);
    return existed;
  }

  /**
   * Clear message buffer
   * @returns {number} Number of messages cleared
   */
  clearBuffer() {
    const count = this.messageBuffer.length;
    this.messageBuffer = [];
    logger.info(`Message buffer cleared (${count} messages)`);
    return count;
  }

  /**
   * Manually trigger buffer flush (admin action)
   * @returns {Promise<object>} Flush result
   */
  async manualFlush() {
    logger.info('Manual buffer flush triggered');
    const result = await this.flushBuffer();
    return result;
  }

  /**
   * Get configuration and status
   * @returns {object} Status information
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      configured: !!(this.config.botToken && this.config.chatId),
      botTokenSet: !!this.config.botToken,
      chatIdSet: !!this.config.chatId,
      cooldownType: 'global',
      cooldownMinutes: this.config.notificationCooldown / 60000,
      cooldownSeconds: this.config.notificationCooldown / 1000,
      lastNotification: this.lastNotificationTime ? new Date(this.lastNotificationTime).toISOString() : null,
      remainingCooldownSeconds: this.getRemainingCooldown(),
      canNotify: this.canNotify(),
      bufferedMessages: this.messageBuffer.length,
      totalNotifications: this.notificationHistory.length,
      successfulNotifications: this.notificationHistory.filter(n => n.success).length,
      failedNotifications: this.notificationHistory.filter(n => !n.success).length
    };
  }
}

// Singleton instance
export const telegramNotifier = new TelegramNotifier();
