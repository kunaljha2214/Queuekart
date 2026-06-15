/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

async function ensureDefaultChannel() {
  await notifee.createChannel({
    id: 'default',
    name: 'Queue notifications',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  await ensureDefaultChannel();
  const title = remoteMessage?.notification?.title;
  const body = remoteMessage?.notification?.body;
  if (title || body) {
    await notifee.displayNotification({
      title: title || 'QueueKart',
      body: body || '',
      android: {
        channelId: 'default',
        pressAction: { id: 'default' },
      },
      data: remoteMessage?.data,
    });
  }
});

AppRegistry.registerComponent(appName, () => App);
