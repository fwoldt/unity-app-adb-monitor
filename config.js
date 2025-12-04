export const CONFIG = {
  PACKAGE: process.env.PACKAGE || "io.unitynodes.unityapp",
  SERVICE_NAME: process.env.SERVICE_NAME || "io.unitynodes.unityapp/expo.modules.pow.PowService",
  REFRESH_INTERVAL: parseInt(process.env.REFRESH_INTERVAL, 10) || 60, // seconds

  // Logging configuration
  LOG_FILTER: {
    // Filter pattern for logcat logs (string or regex pattern)
    pattern: process.env.LOG_FILTER_PATTERN || "ExpoPowService",
    // Whether to use regex matching (true) or simple string contains (false)
    useRegex: process.env.LOG_FILTER_USE_REGEX === "true" || false,
    // Additional tags to filter (comma-separated)
    tags: process.env.LOG_FILTER_TAGS?.split(",").map(t => t.trim()).filter(Boolean) || [],
    // Minimum log level to capture (V=Verbose, D=Debug, I=Info, W=Warn, E=Error, F=Fatal)
    minLevel: process.env.LOG_MIN_LEVEL || "V"
  },

  // Max log file size before warning (in bytes)
  MAX_LOG_FILE_SIZE: parseInt(process.env.MAX_LOG_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
  // Portion of newest data to retain when trimming (0-1). Defaults to 0.5 (keep last 50%).
  LOG_TRIM_RETAIN_RATIO: (() => {
    const v = parseFloat(process.env.LOG_TRIM_RETAIN_RATIO);
    return (isNaN(v) || v <= 0 || v >= 1) ? 0.5 : v;
  })(),
  // Enable or disable automatic trimming when exceeding MAX_LOG_FILE_SIZE
  ENABLE_LOG_TRIMMING: process.env.ENABLE_LOG_TRIMMING === 'true'||true,
  // Maximum listeners per WriteStream to avoid Node warnings
  MAX_STREAM_LISTENERS: parseInt(process.env.MAX_STREAM_LISTENERS, 10) || 20,
  // Network device discovery
  NETWORK_DISCOVERY: {
    enabled: process.env.ENABLE_NETWORK_DISCOVERY === "true" || true,
    // IP range to scan for ADB devices (e.g., "192.168.44.1-254")
    ipRange: process.env.NETWORK_IP_RANGE || "192.168.44.1-254",
    // ADB port to check
    adbPort: parseInt(process.env.ADB_PORT, 10) || 5555,
    // Discovery interval in seconds
    discoveryInterval: parseInt(process.env.DISCOVERY_INTERVAL, 10) || 300, // 5 minutes
    // Connection timeout for port checks in milliseconds
    connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT, 10) || 2000,
  },

  // Telegram notifications with global cooldown
  TELEGRAM: {
    enabled: process.env.ENABLE_TELEGRAM === "true" || true,
    botToken: process.env.TELEGRAM_BOT_TOKEN || "xxx",
    chatId: process.env.TELEGRAM_CHAT_ID || "xxx",
    // Global cooldown in milliseconds - applies to all devices (default: 5 minutes)
    // Messages are buffered during cooldown and sent in batch when cooldown expires
    notificationCooldown: parseInt(process.env.NOTIFICATION_COOLDOWN, 10) || 0 * 60 * 1000,
    // Retry settings
    maxRetries: parseInt(process.env.TELEGRAM_MAX_RETRIES, 10) || 3,
    retryDelay: parseInt(process.env.TELEGRAM_RETRY_DELAY, 10) || 2000,
  }
};
