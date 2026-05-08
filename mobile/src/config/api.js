import { Platform } from 'react-native';

/**
 * Android physical devices are most reliable with `adb reverse` + localhost.
 * Android emulator reaches host machine via 10.0.2.2.
 */
const DEV_HOST = Platform.select({
  android: 'localhost',
  default: 'localhost',
});

export const API_PORT = 5000;
export const API_BASE_URL = `http://${DEV_HOST}:${API_PORT}`;
