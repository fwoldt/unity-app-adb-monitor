export const ADB_COMMANDS = {
  DEVICES: "adb devices",
  PIDOF: (deviceId, packageName) => `adb -s ${deviceId} shell pidof ${packageName}`,
  MEMINFO: (deviceId, packageName) => `adb -s ${deviceId} shell dumpsys meminfo ${packageName}`,
  PS: (deviceId, pid) => `adb -s ${deviceId} shell ps -o pid,uid,user,etime,pcpu,rss -p ${pid}`,
  KILL: (deviceId, pid) => `adb -s ${deviceId} shell kill -9 ${pid}`,
  PACKAGE_INFO: (deviceId, packageName) => `adb -s ${deviceId} shell dumpsys package ${packageName}`,
  GETPROP: (deviceId, prop) => `adb -s ${deviceId} shell getprop ${prop}`,
  FORCE_STOP: (deviceId, packageName) => `adb -s ${deviceId} shell am force-stop ${packageName}`,
  START_APP: (deviceId, packageName) => `adb -s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`,
  SCREENSHOT: (deviceId) => `adb -s ${deviceId} exec-out screencap -p`,
  WAKE_SCREEN: (deviceId) => `adb -s ${deviceId} shell input keyevent KEYCODE_WAKEUP`,
  POWER_BUTTON: (deviceId) => `adb -s ${deviceId} shell input keyevent KEYCODE_POWER`,
  SWIPE_UNLOCK: (deviceId) => `adb -s ${deviceId} shell input swipe 300 1000 300 300`,
  CHECK_SCREEN_STATE: (deviceId) => `adb -s ${deviceId} shell dumpsys power | grep 'Display Power'`,
  // Unity Forum Commands
  UNINSTALL_UNITY: (deviceId, packageName) => `adb -s ${deviceId} uninstall ${packageName}`,
  SET_BATTERY_100: (deviceId) => `adb -s ${deviceId} shell dumpsys battery set level 100`,
  UNITY_STOP: (deviceId, packageName) => `adb -s ${deviceId} shell am force-stop ${packageName}`,
  UNITY_RESTART: (deviceId, packageName) => `adb -s ${deviceId} shell am force-stop ${packageName} && adb -s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`,
  SET_RESOLUTION: (deviceId, width = 1080, height = 2220, density = 420, fontScale = 1.1) => 
    `adb -s ${deviceId} shell wm size ${width}x${height} && adb -s ${deviceId} shell wm density ${density} && adb -s ${deviceId} shell settings put system font_scale ${fontScale}`,
  DEVICE_REBOOT: (deviceId) => `adb -s ${deviceId} reboot`,
  RESET_BATTERY: (deviceId) => `adb -s ${deviceId} shell dumpsys battery reset`,
  MAC_ADDRESS: (deviceId) => `adb -s ${deviceId} shell ip addr show wlan0 | grep link/ether`,
  // Screen mirroring and touch commands
  TAP: (deviceId, x, y) => `adb -s ${deviceId} shell input tap ${x} ${y}`,
  SWIPE: (deviceId, x1, y1, x2, y2, duration = 300) => `adb -s ${deviceId} shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`,
  KEY_EVENT: (deviceId, keycode) => `adb -s ${deviceId} shell input keyevent ${keycode}`,
  TEXT_INPUT: (deviceId, text) => `adb -s ${deviceId} shell input text "${text}"`,
  GET_SCREEN_SIZE: (deviceId) => `adb -s ${deviceId} shell wm size`
};