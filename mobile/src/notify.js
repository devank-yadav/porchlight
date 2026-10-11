import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';

// Peggy's phone notifications. When Porchlight sets up her Uber (on a call or in the app),
// her phone shows "Your Uber to Target is ready". Tapping it opens Uber with the trip filled in.
// Remote push needs an Expo project id (run `npx eas-cli init` in mobile/ once, or set
// EXPO_PUBLIC_EAS_PROJECT_ID). Without one, the app still shows the notification itself
// whenever it's open.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;

async function register(seniorId) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted' || Platform.OS !== 'ios' || !projectId) return false;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.pushToken(seniorId, token);
  return true;
}

function openFrom(response) {
  const url = response?.notification?.request?.content?.data?.url;
  if (url && response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) Linking.openURL(url).catch(() => {});
}

// Used on Peggy's side only.
export function usePeggyNotifications(senior, notices) {
  const pushing = useRef(false);
  const seen = useRef(null);
  const seniorId = senior?._id;

  useEffect(() => {
    if (!seniorId) return;
    register(seniorId).then((ok) => { pushing.current = ok; }).catch((e) => console.warn('[notify]', e.message));
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) { openFrom(r); Notifications.clearLastNotificationResponseAsync?.(); }
    }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
  }, [seniorId]);

  // No remote push: the app shows the Uber notification itself when it sees a new one.
  useEffect(() => {
    if (!notices) return;
    const uber = notices.filter((n) => n.kind === 'uber' && n.uberLink && n.seniorId === seniorId);
    if (seen.current === null) { seen.current = new Set(uber.map((n) => n._id)); return; }
    for (const n of uber) {
      if (seen.current.has(n._id)) continue;
      seen.current.add(n._id);
      if (pushing.current) continue; // the server's push covers it
      Notifications.scheduleNotificationAsync({
        content: { title: 'Your Uber is ready to book', body: 'Tap here. Uber opens with your trip filled in, then press Request.', data: { url: n.uberLink }, sound: 'default' },
        trigger: null,
      }).catch(() => {});
    }
  }, [notices, seniorId]);
}
