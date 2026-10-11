// Phone notifications for Peggy: "Your Uber to Target is ready". Tapping one opens Uber with the trip
// filled in. Remote push works in Expo Go on iPhone (projectId in app.json); if it can't register, the
// app still shows the same notification itself while it's open (see notifyLocally).
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Handle taps even when a notification cold-starts the app before Peggy's screen mounts.
const handledResponses = new Set();
const openFrom = async (response) => {
  const id = response?.notification?.request?.identifier;
  if (id && handledResponses.has(id)) return;
  const url = response?.notification?.request?.content?.data?.url;
  if (typeof url !== 'string' || !url.startsWith('https://m.uber.com/ul/?')) return;
  if (id) handledResponses.add(id);
  try {
    // Native app deep links open Uber directly; retain the universal link for phones without Uber.
    await Linking.openURL(url.replace('https://m.uber.com/ul/', 'uber://'));
  } catch {
    await Linking.openURL(url).catch((e) => console.warn('[push] could not open Uber:', e.message));
  } finally {
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }
};

export function startPushResponseListener() {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
  Notifications.getLastNotificationResponseAsync().then(openFrom).catch(() => {});
  return () => sub.remove();
}

// True once the server can push to this phone (then the app doesn't also notify locally).
export let pushRegistered = false;

// Call once when Peggy's side opens. Returns a cleanup function.
export function startPush(seniorId) {
  (async () => {
    try {
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
      if (status !== 'granted' || Platform.OS !== 'ios') return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      await api.savePushToken(seniorId, token);
      pushRegistered = true;
    } catch (e) {
      console.warn('[push] not registered:', e.message);
    }
  })();
  return () => {};
}

// Same notification, shown by the app itself (used when it sees a new Uber notice while open).
export function notifyLocally({ title, body, url }) {
  return Notifications.scheduleNotificationAsync({ content: { title, body, data: { url } }, trigger: null }).catch(() => {});
}
