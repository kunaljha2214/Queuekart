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
    name: 'Default',
    importance: AndroidImportance.HIGH,
  });
}

export async function registerPushToken() {
  // iOS: ask permission (Android 13+ handled by Notifee permission prompt below if needed).
  try {
    await messaging().requestPermission();
  } catch {
    // Permission denied; don't block app.
  }

  let token;
  try {
    token = await messaging().getToken();
  } catch {
    return;
  }
  if (!token) return;

  // Avoid spamming API on every app open.
  const lastSent = await AsyncStorage.getItem(TOKEN_SENT_KEY);
  if (lastSent === token) return;

  await client.post('/notifications/token', {
    token,
    platform: Platform.OS,
  });
  await AsyncStorage.setItem(TOKEN_SENT_KEY, token);
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
  // Foreground notifications
  const unsubOnMessage = messaging().onMessage(async (remoteMessage) => {
    await ensureAndroidChannel();
    const title = remoteMessage?.notification?.title || 'QueueKart';
    const body = remoteMessage?.notification?.body || '';
    await notifee.displayNotification({
      title,
      body,
      android: { channelId: 'default' },
      data: remoteMessage?.data,
    });
  });

  // Token refresh
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

  // When returning to foreground, re-register token (helps after reinstall / permission changes).
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

