export const ADB_COMMANDS = {
  DEVICES: "adb devices",
  PIDOF: (deviceId, packageName) => `adb -s ${deviceId} shell pidof ${packageName}`,
  MEMINFO: (deviceId, packageName) => `adb -s ${deviceId} shell dumpsys meminfo ${packageName}`,
  PS: (deviceId, pid) => `adb -s ${deviceId} shell ps -o pid,uid,user,etime,pcpu,rss -p ${pid}`,
  KILL: (deviceId, pid) => `adb -s ${deviceId} shell kill -9 ${pid}`,
  PACKAGE_INFO: (deviceId, packageName) => `adb -s ${deviceId} shell dumpsys package ${packageName}`,
  GETPROP: (deviceId, prop) => `adb -s ${deviceId} shell getprop ${prop}`,
  FORCE_STOP: (deviceId, packageName) => `adb -s ${deviceId} shell am force-stop ${packageName}`,
  START_APP: (deviceId, packageName) => `adb -s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`
};