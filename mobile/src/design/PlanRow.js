import { StyleSheet, View } from 'react-native';
import { T, Chip, useSurface } from './ui';
import { useTheme } from './theme';
import { accent, radius, shadow } from './tokens';

export function upcomingPlans(state, senior) {
  return (state.appointments || []).filter((p) => p.seniorId === senior._id && !p.cancelled && new Date(p.startsAt).getTime() > Date.now() - 3600000).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}
export function dayLabel(iso, timezone = 'America/New_York') {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Time to be confirmed';
  const day = date.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
  return day + ' · ' + time;
}
export function isToday(iso, timezone = 'America/New_York') {
  return !!iso && new Date(iso).toLocaleDateString('en-US', { timeZone: timezone }) === new Date().toLocaleDateString('en-US', { timeZone: timezone });
}

// One appointment: a calendar date tile, what, when, where and the ride.
// On the page it draws its own card; inside a Card or ListGroup it sits flush.
export default function PlanRow({ plan, senior, state }) {
  const { c, isSenior } = useTheme();
  const surface = useSurface();
  const transport = plan.needsRide === false ? 'No ride needed' : { unknown: 'Ride not arranged', self: 'You have a ride', at_risk: 'A ride is needed', requested: 'Ride requested', confirmed: 'Ride confirmed' }[plan.transport] || 'Ride not arranged';
  const ok = ['confirmed', 'self'].includes(plan.transport) || plan.needsRide === false;
  const risky = plan.transport === 'at_risk';
  const date = new Date(plan.startsAt);
  const today = isToday(plan.startsAt, senior.timezone);
  const tz = { timeZone: senior.timezone };
  const time = Number.isFinite(date.getTime()) ? date.toLocaleTimeString('en-US', { ...tz, hour: 'numeric', minute: '2-digit' }) : 'Time to be confirmed';
  const chrome = surface === 'page' ? [st.card, { backgroundColor: c.surface, borderColor: c.line }, shadow.card] : surface === 'group' ? st.inGroup : st.inCard;

  return <View style={[st.row, { gap: isSenior ? 16 : 14 }, chrome]} accessible accessibilityLabel={[plan.title, dayLabel(plan.startsAt, senior.timezone), plan.where, transport].filter(Boolean).join('. ')}>
    <View style={[st.date, isSenior && st.dateSenior, { backgroundColor: today ? accent.lampSoft : c.sunken }]}>
      <T v="label" color={today ? accent.lampText : c.muted} style={[st.month, isSenior && { fontSize: 20, lineHeight: 24 }]}>{today ? 'Today' : date.toLocaleDateString('en-US', { ...tz, month: 'short' })}</T>
      {!today || !isSenior ? <T v="title" color={today ? accent.lampText : c.ink} style={isSenior ? { fontSize: 28, lineHeight: 32 } : { fontSize: 24, lineHeight: 28 }}>{date.toLocaleDateString('en-US', { ...tz, day: 'numeric' })}</T> : null}
    </View>
    <View style={{ flex: 1, gap: isSenior ? 6 : 4 }}>
      <T v={isSenior ? 'readHeadline' : 'headline'} style={isSenior && { fontSize: 24, lineHeight: 30 }}>{plan.title}</T>
      <T v={isSenior ? 'readSmall' : 'callout'} color={c.ink2}>{today ? 'Today · ' + time : dayLabel(plan.startsAt, senior.timezone)}</T>
      {plan.where ? <T v={isSenior ? 'readSmall' : 'callout'} muted numberOfLines={2}>{plan.where}</T> : null}
      <Chip label={isSenior ? transport : transport.replace('You have', 'Has')} icon={ok ? 'checkmark' : 'car'} tone={ok ? 'green' : risky ? 'lamp' : 'neutral'} style={{ marginTop: isSenior ? 6 : 4 }} />
    </View>
  </View>;
}
const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  inGroup: { paddingHorizontal: 16, paddingVertical: 16 },
  inCard: { paddingVertical: 4 },
  date: { width: 52, minHeight: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 0, paddingVertical: 6 },
  dateSenior: { width: 72, minHeight: 76, borderRadius: 18 },
  month: { textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11, lineHeight: 14 },
});
