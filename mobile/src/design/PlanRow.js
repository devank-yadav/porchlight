import { StyleSheet, View } from 'react-native';
import { T, Badge } from './ui';
import { useTheme } from './theme';
import { accent, radius } from './tokens';

export function upcomingPlans(state, senior) {
  return (state.appointments || []).filter((p) => p.seniorId === senior._id && new Date(p.startsAt).getTime() > Date.now() - 3600000).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
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
export default function PlanRow({ plan, senior, state }) {
  const { c, isSenior } = useTheme();
  const action = (state.actions || []).find((a) => a._id === plan.actionId);
  const simulated = action?.simulated;
  const transport = { unknown: 'Ride not arranged', self: 'You have a ride', at_risk: 'A ride is needed', requested: 'Ride requested', confirmed: simulated ? 'Demo ride confirmed' : 'Ride confirmed' }[plan.transport] || 'Ride not arranged';
  const date = new Date(plan.startsAt);
  return <View style={[st.row, { borderColor: c.line }]}>
    {!isSenior && <View style={[st.date, { backgroundColor: c.sunken }]} accessible={false}>
      <T v="label" muted>{date.toLocaleDateString('en-US', { month: 'short', timeZone: senior.timezone })}</T>
      <T v="title">{date.toLocaleDateString('en-US', { day: 'numeric', timeZone: senior.timezone })}</T>
    </View>}
    <View style={{ flex: 1, gap: isSenior ? 8 : 5 }}>
      <T v={isSenior ? 'readHeadline' : 'headline'}>{plan.title}</T>
      <T v={isSenior ? 'readSmall' : 'callout'}>{dayLabel(plan.startsAt, senior.timezone)}</T>
      {plan.where && <T v={isSenior ? 'readSmall' : 'callout'} muted>{plan.where}</T>}
      {isSenior ? <T v="readSmall" color={plan.transport === 'confirmed' || plan.transport === 'self' ? accent.greenText : c.muted}>{transport}</T> : <Badge label={transport.replace('You have', 'Has')} tone={['confirmed', 'self'].includes(plan.transport) ? 'green' : 'neutral'} />}
    </View>
  </View>;
}
const st = StyleSheet.create({ row: { flexDirection: 'row', gap: 16, paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth }, date: { width: 56, height: 66, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 2 } });
