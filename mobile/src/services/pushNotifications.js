import { AppState, PermissionsAndroid, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { client } from './api';

const TOKEN_SENT_KEY = '@queuekart/fcm_token_sent_v1';

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: 'default',
    name: 'Queue notifications',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
}

/**
 * Show the system notification permission dialog (Android 13+ uses POST_NOTIFICATIONS).
 * Returns true when notifications may be shown.
 */
export async function requestNotificationPermission() {
  await ensureAndroidChannel();

  if (Platform.OS === 'ios') {
    const authStatus = await messaging().requestPermission();
    return (
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL
    );
  }

  if (Platform.OS === 'android') {
    // Android 12 and below: notifications enabled by default.
    if (typeof Platform.Version === 'number' && Platform.Version < 33) {
      return true;
    }

    try {
      const already = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (already) return true;
    } catch {
      // fall through to request
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Allow notifications',
        message:
          'QueueKart sends alerts when your queue turn is near, when you join a queue, and when customers join your shop.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  return true;
}

export async function registerPushToken() {
  const granted = await requestNotificationPermission();
  if (!granted && Platform.OS === 'android' && Platform.Version >= 33) {
    return { ok: false, reason: 'permission_denied' };
  }

  let token;
  try {
    token = await messaging().getToken();
  } catch {
    return { ok: false, reason: 'no_token' };
  }
  if (!token) return { ok: false, reason: 'no_token' };

  try {
    await client.post('/notifications/token', {
      token,
      platform: Platform.OS,
    });
    await AsyncStorage.setItem(TOKEN_SENT_KEY, token);
    return { ok: true, token };
  } catch {
    try {
      await AsyncStorage.removeItem(TOKEN_SENT_KEY);
    } catch {
      // ignore
    }
    return { ok: false, reason: 'api_failed' };
  }
}

export async function unregisterPushToken() {
  try {
    const token = await messaging().getToken();
    await client.delete('/notifications/token', { data: { token } });
  } catch {
    // ignore
  } finally {
    try {
      await AsyncStorage.removeItem(TOKEN_SENT_KEY);
    } catch {
      // ignore
    }
  }
}

export function initPushListeners() {
  ensureAndroidChannel().catch(() => {});

  const unsubOnMessage = messaging().onMessage(async (remoteMessage) => {
    await ensureAndroidChannel();
    const title = remoteMessage?.notification?.title || 'QueueKart';
    const body = remoteMessage?.notification?.body || '';
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: 'default',
        pressAction: { id: 'default' },
      },
      data: remoteMessage?.data,
    });
  });

  const unsubOnTokenRefresh = messaging().onTokenRefresh(async (t) => {
    try {
      await client.post('/notifications/token', {
        token: t,
        platform: Platform.OS,
      });
      await AsyncStorage.setItem(TOKEN_SENT_KEY, t);
    } catch {
      // ignore
    }
  });

  const onAppState = async (state) => {
    if (state === 'active') {
      try {
        await registerPushToken();
      } catch {
        // ignore
      }
    }
  };

  const subAppState = AppState.addEventListener('change', onAppState);

  return () => {
    unsubOnMessage();
    unsubOnTokenRefresh();
    subAppState.remove();
  };
}
