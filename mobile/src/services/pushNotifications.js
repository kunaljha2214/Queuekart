import { AppState, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { client } from './api';

const TOKEN_SENT_KEY = '@queuekart/fcm_token_sent_v1';

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: 'default',
    name: 'Queue notifications',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

/** Android 13+ requires runtime POST_NOTIFICATIONS permission. */
async function ensureNotificationPermission() {
  await ensureAndroidChannel();
  if (Platform.OS === 'android') {
    await notifee.requestPermission();
  }
  try {
    await messaging().requestPermission();
  } catch {
    // Permission denied; don't block app.
  }
}

export async function registerPushToken() {
  await ensureNotificationPermission();

  let token;
  try {
    token = await messaging().getToken();
  } catch {
    return;
  }
  if (!token) return;

  // Always sync token with server (same device, different user after logout/login).
  try {
    await client.post('/notifications/token', {
      token,
      platform: Platform.OS,
    });
    await AsyncStorage.setItem(TOKEN_SENT_KEY, token);
  } catch {
    // Don't cache as sent if API failed — retry on next foreground.
    try {
      await AsyncStorage.removeItem(TOKEN_SENT_KEY);
    } catch {
      // ignore
    }
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
