// Peggy's Today: her pills for today, grouped by time. A big "I took my 8:00 PM pills" button when a dose
// is due; a check once it's marked. Never tells her how much to take: only what her list says.
import { StyleSheet, View } from 'react-native';
import { BigButton, Press, T } from '../design/ui';
import { useTheme } from '../design/theme';
import Icon from '../design/Icon';
import { haptic } from '../design/haptics';
import { toast } from '../design/Toaster';
import { accent, radius } from '../design/tokens';
import { api } from '../api';
import { markSlotTaken } from './reminders';

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const names = (doses) => {
  const n = doses.map((d) => d.name);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n.at(-1)}` : n[0];
};

// Today's doses for one senior, grouped by time: [{ time, label, date, doses, state: 'taken'|'now'|'later' }]
export function todaySlots(state, seniorId) {
  const groups = {};
  for (const d of (state?.medsToday || []).filter((x) => x.seniorId === seniorId)) (groups[d.time] ||= []).push(d);
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([time, doses]) => ({
    time, label: doses[0].label, date: doses[0].date, doses,
    state: doses.every((d) => d.status === 'taken') ? 'taken' : doses.some((d) => ['due', 'missed'].includes(d.status)) ? 'now' : 'later',
  }));
}

export default function PillsCard({ senior, state, refresh }) {
  const { c } = useTheme();
  const groups = todaySlots(state, senior._id);
  if (!groups.length) return null;

  const took = async (g) => {
    const open = g.doses.filter((d) => d.status !== 'taken');
    try {
      await markSlotTaken(senior._id, open.map((d) => d.medId), g.time, g.date);
      haptic.success();
      toast.success('Marked as taken', { description: `Your ${g.label} pills. Your family can see it.` });
      await refresh?.();
    } catch (e) { toast.error('Please try again', { description: e.message }); }
  };
  const undo = async (g) => {
    try {
      await Promise.all(g.doses.map((d) => api.undoDose(senior._id, d.medId, g.time, g.date)));
      toast.info('Okay, not taken yet', { description: 'Porchlight will remind you again.' });
      await refresh?.();
    } catch (e) { toast.error('Please try again', { description: e.message }); }
  };

  return <View style={[st.card, { backgroundColor: c.surface, borderColor: c.line }]}>
    <View style={st.head}><Icon name="pills" size={26} color={c.ink} /><T v="readHeadline">Your pills today</T></View>
    {groups.map((g) => <View key={g.time} style={st.slot}>
      {g.state === 'now' ? <BigButton tone="lamp" icon="checkmark.circle" title={`I took my ${g.label} ${g.doses.length > 1 ? 'pills' : g.doses[0].name}`} sub={names(g.doses)} hint="Lets your family know you took them." onPress={() => took(g)} /> : <View style={st.row}>
        <View style={[st.mark, { backgroundColor: g.state === 'taken' ? accent.greenSoft : c.sunken }]}>
          <Icon name={g.state === 'taken' ? 'checkmark' : 'clock'} size={20} color={g.state === 'taken' ? accent.greenText : c.muted} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="read">{g.label} · {names(g.doses)}</T>
          <T v="readSmall" muted>{g.state === 'taken' ? `Taken${g.doses[0].takenAt ? ' at ' + timeOf(g.doses[0].takenAt) : ''}` : 'Later today. Your phone will remind you.'}</T>
        </View>
        {g.state === 'taken' && <Press onPress={() => undo(g)} accessibilityRole="button" accessibilityLabel={`Undo: I haven’t taken my ${g.label} pills yet`} style={st.undo}><T v="readSmall" style={{ textDecorationLine: 'underline' }}>Undo</T></Press>}
      </View>}
    </View>)}
    <T v="readSmall" muted>Not sure if you took one? Look at your pill box. If you still can’t tell, don’t take another; ask your pharmacist or {senior.primaryContactName || 'your family'}.</T>
  </View>;
}

const st = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: 20, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slot: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  undo: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 8 },
  mark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
