import fs from 'fs';
import fsPromises from 'fs/promises';
import logger from './logger.js';
import { CONFIG } from './config.js';

/**
 * LogStreamManager - Manages file write streams with error handling and cleanup
 */
export class LogStreamManager {
  constructor() {
    this.streams = new Map(); // deviceId -> { stream, bytesWritten, lastCheck }
    this.pendingWrites = new Map(); // deviceId -> Promise[]
  }

  /**
   * Get or create a write stream for a device
   * @param {string} deviceId - Device identifier
   * @param {string} filePath - Path to log file
   * @returns {fs.WriteStream} Write stream
   */
  getStream(deviceId, filePath) {
    if (!this.streams.has(deviceId)) {
      const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
      stream.setMaxListeners(CONFIG.MAX_STREAM_LISTENERS);
      
      stream.on('error', (err) => {
        logger.error(`Write stream error for device ${deviceId}: ${err.message}`);
        this.closeStream(deviceId);
      });

      stream.on('close', () => {
        logger.info(`Write stream closed for device ${deviceId}`);
        this.streams.delete(deviceId);
      });

      this.streams.set(deviceId, {
        stream,
        bytesWritten: 0,
        lastCheck: Date.now(),
        filePath
      });

      logger.info(`Created write stream for device ${deviceId}: ${filePath}`);
    }

    return this.streams.get(deviceId).stream;
  }

  /**
   * Write data to stream with error handling
   * @param {string} deviceId - Device identifier
   * @param {string} filePath - Path to log file
   * @param {string} data - Data to write
   * @returns {Promise<void>}
   */
  async writeToStream(deviceId, filePath, data) {
    return new Promise((resolve, reject) => {
      const stream = this.getStream(deviceId, filePath);
      const streamInfo = this.streams.get(deviceId);

      const writeSuccess = stream.write(data, 'utf8', (err) => {
        if (err) {
          logger.error(`Failed to write to log file for device ${deviceId}: ${err.message}`);
          reject(err);
        } else {
          streamInfo.bytesWritten += Buffer.byteLength(data, 'utf8');
          
          // Check file size periodically
          if (Date.now() - streamInfo.lastCheck > 60000) { // Check every minute
            this.checkFileSize(deviceId, streamInfo);
            streamInfo.lastCheck = Date.now();
          }
          
          resolve();
        }
      });

      // If write returned false, wait for drain event
      if (!writeSuccess) {
        stream.once('drain', resolve);
      }
    });
  }

  /**
   * Check file size and log warning if exceeds threshold
   * @param {string} deviceId - Device identifier
   * @param {object} streamInfo - Stream info object
   */
  async checkFileSize(deviceId, streamInfo) {
    try {
      const stats = await fsPromises.stat(streamInfo.filePath);
      if (stats.size > CONFIG.MAX_LOG_FILE_SIZE) {
        if (CONFIG.ENABLE_LOG_TRIMMING) {
          logger.warn(`Log file for device ${deviceId} exceeds ${CONFIG.MAX_LOG_FILE_SIZE} bytes (current: ${stats.size} bytes). Trimming enabled.`);
          await this.trimLogFile(deviceId, streamInfo, stats.size);
        } else {
          logger.warn(`Log file for device ${deviceId} exceeds ${CONFIG.MAX_LOG_FILE_SIZE} bytes (current: ${stats.size} bytes). Trimming disabled.`);
        }
      }
    } catch (err) {
      logger.error(`Failed to check file size for device ${deviceId}: ${err.message}`);
    }
  }

  /**
   * Trim a log file keeping only the most recent portion defined by LOG_TRIM_RETAIN_RATIO.
   * Safely closes existing stream, rewrites file, and reopens stream for continued writes.
   * @param {string} deviceId - Device identifier
   * @param {object} streamInfo - Current stream info
   * @param {number} currentSize - Current file size in bytes
   */
  async trimLogFile(deviceId, streamInfo, currentSize) {
    const retainRatio = CONFIG.LOG_TRIM_RETAIN_RATIO;
    const targetRetainSize = Math.max(1, Math.floor(CONFIG.MAX_LOG_FILE_SIZE * retainRatio));
    const filePath = streamInfo.filePath;

    try {
      // Close current stream before manipulating file
      await new Promise(resolve => streamInfo.stream.end(resolve));

      const startPos = Math.max(0, currentSize - targetRetainSize);
      const tempPath = filePath + '.tmp';

      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(filePath, { start: startPos });
        const ws = fs.createWriteStream(tempPath, { flags: 'w', encoding: 'utf8' });
        rs.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
        rs.pipe(ws);
      });

      await fsPromises.rename(tempPath, filePath);

      // Reopen stream for appending
      const newStream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
      newStream.on('error', (err) => {
        logger.error(`Reopened stream error for device ${deviceId}: ${err.message}`);
      });

      streamInfo.stream = newStream;
      streamInfo.bytesWritten = targetRetainSize;
      streamInfo.lastCheck = Date.now();

      logger.info(`Trimmed log file for device ${deviceId}. Retained last ${targetRetainSize} bytes (ratio ${retainRatio}).`);
    } catch (err) {
      logger.error(`Failed trimming log file for device ${deviceId}: ${err.message}`);
    }
  }

  /**
   * Close stream for a device
   * @param {string} deviceId - Device identifier
   * @returns {Promise<void>}
   */
  async closeStream(deviceId) {
    const streamInfo = this.streams.get(deviceId);
    if (streamInfo) {
      return new Promise((resolve) => {
        streamInfo.stream.end(() => {
          this.streams.delete(deviceId);
          logger.info(`Closed stream for device ${deviceId}`);
          resolve();
        });
      });
    }
  }

  /**
   * Close all streams
   * @returns {Promise<void>}
   */
  async closeAllStreams() {
    const closePromises = Array.from(this.streams.keys()).map(deviceId => 
      this.closeStream(deviceId)
    );
    await Promise.all(closePromises);
    logger.info('All log streams closed');
  }

  /**
   * Get statistics for a device stream
   * @param {string} deviceId - Device identifier
   * @returns {object|null} Stream statistics or null if not found
   */
  getStats(deviceId) {
    const streamInfo = this.streams.get(deviceId);
    if (streamInfo) {
      return {
        bytesWritten: streamInfo.bytesWritten,
        filePath: streamInfo.filePath,
        isOpen: !streamInfo.stream.destroyed
      };
    }
    return null;
  }
}

// Singleton instance
export const logStreamManager = new LogStreamManager();
