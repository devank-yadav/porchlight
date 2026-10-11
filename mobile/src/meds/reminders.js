// Daily pill reminders on Peggy's iPhone: local notifications, so they ring even if the server or Wi-Fi is down.
// One notification per time slot ("Time for your 8:00 PM pills") with an "I took it" button, and a gentle
// repeat 30 minutes later that's cancelled as soon as the dose is marked taken (here, on a call, or by family).
// Scheduled a few days ahead as one-off notifications (iOS keeps at most 64), and re-synced whenever her
// meds or today's taken doses change.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { api } from '../api';
import { toast } from '../design/Toaster';

const CATEGORY = 'porchlight-pills';
const PREFIX = 'pills:';
const REPEAT_AFTER_MIN = 30;
const BUDGET = 40; // notifications we allow ourselves out of iOS's 64

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function clock(hhmm) {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? 'AM' : 'PM'}`;
}
const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
const what = (m) => m.name + (m.dose ? ` (${m.dose})` : '');

// The meds due at each time of day: { '08:00': [med, med], '20:00': [med] }
export function slots(meds = []) {
  const out = {};
  for (const m of meds) for (const t of m.times || []) (out[t] ||= []).push(m);
  return out;
}

let categoryReady = null;
const handled = new Set(); // notification responses already acted on
function ensureCategory() {
  categoryReady ||= Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: 'taken', buttonTitle: 'I took it', options: { opensAppToForeground: true } },
  ]).catch(() => {});
  return categoryReady;
}

async function allowed() {
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  return status === 'granted';
}

// Cancel our pending reminders and schedule the next few days again.
export async function syncReminders(meds, takenToday = new Set(), now = new Date()) {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  const bySlot = slots(meds);
  const times = Object.keys(bySlot).sort();
  if (!times.length || !(await allowed())) return 0;
  await ensureCategory();
  const days = Math.max(1, Math.min(7, Math.floor(BUDGET / (times.length * 2))));
  let count = 0;
  for (let day = 0; day < days; day++) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
    const date = ymd(base);
    for (const time of times) {
      const due = bySlot[time].filter((m) => !(day === 0 && takenToday.has(`${m.id}@${time}`)));
      if (!due.length) continue;
      const at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(time.slice(0, 2)), Number(time.slice(3)));
      const again = new Date(at.getTime() + REPEAT_AFTER_MIN * 60000);
      const names = due.map(what);
      const data = { kind: 'pills', date, time, medIds: due.map((m) => m.id) };
      const plural = due.length > 1 ? 'pills' : due[0].name;
      if (at > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIX}${date}:${time}`,
          content: { title: `Time for your ${clock(time)} ${plural}`, body: `${list(names)}. Tap “I took it” when you’re done.`, data, categoryIdentifier: CATEGORY, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
        });
        count++;
      }
      if (again > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIX}${date}:${time}:again`,
          content: { title: `A gentle reminder about your ${clock(time)} ${plural}`, body: `Have you taken your ${list(due.map((m) => m.name))}? Tap “I took it” if you have.`, data, categoryIdentifier: CATEGORY, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: again },
        });
        count++;
      }
    }
  }
  return count;
}

// Mark every med in one slot as taken (from the notification button or the Today card).
export async function markSlotTaken(seniorId, medIds, time, date) {
  await Promise.all(medIds.map((id) => api.takeDose(seniorId, id, time, date)));
  await Notifications.cancelScheduledNotificationAsync(`${PREFIX}${date}:${time}:again`).catch(() => {});
}

// Peggy's side: keep reminders in sync with her meds, and handle "I took it" from a notification.
export function useMedReminders(senior, state, refresh) {
  const signature = useRef(null);
  const seniorId = senior?._id;
  const meds = senior?.meds || [];
  const today = (state?.medsToday || []).filter((d) => d.seniorId === seniorId);
  const taken = today.filter((d) => d.status === 'taken').map((d) => `${d.medId}@${d.time}`);
  const sig = JSON.stringify([ymd(new Date()), meds.map((m) => [m.id, m.name, m.dose, m.times]), taken]);

  useEffect(() => {
    if (Platform.OS === 'web' || !seniorId || signature.current === sig) return;
    signature.current = sig;
    syncReminders(meds, new Set(taken)).catch((e) => console.warn('[pills] reminders not scheduled:', e.message));
  }, [sig, seniorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Platform.OS === 'web' || !seniorId) return undefined;
    const handle = async (response) => {
      const data = response?.notification?.request?.content?.data;
      const key = `${response?.notification?.request?.identifier}@${response?.notification?.date}:${response?.actionIdentifier}`;
      if (data?.kind !== 'pills' || handled.has(key)) return;
      handled.add(key);
      Notifications.clearLastNotificationResponse?.();
      if (response.actionIdentifier === 'taken') {
        try {
          await markSlotTaken(seniorId, data.medIds, data.time, data.date);
          toast.success('Marked as taken', { description: `Your ${clock(data.time)} pills. Your family can see it.` });
          refresh?.();
        } catch (e) {
          toast.error('Please try again', { description: e.message });
        }
      }
      router.replace('/senior/today');
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    // Opened from a pill reminder while the app was closed.
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    return () => sub.remove();
  }, [seniorId, refresh]);
}
