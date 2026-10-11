import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { Button, Card, Chip, H1, H2, Meta, P } from './ui';
import { color, font } from './theme';

// rank ≤ 3 needs a person. Tone follows the lamp: red only for help and scams, amber for follow-ups.
const STATUS = {
  help: { label: 'Pressed help', rank: 0, tone: 'urgent' },
  missed: { label: 'Check-in unresolved', rank: 1, tone: 'attention' },
  scam: { label: 'Possible scam', rank: 2, tone: 'urgent' },
  'needs-human': { label: 'Needs a human call', rank: 3, tone: 'attention' },
  talking: { label: 'On a call now', rank: 4, tone: 'neutral' },
  waiting: { label: 'Not called yet', rank: 5, tone: 'neutral' },
  ok: { label: 'Okay today', rank: 6, tone: 'ok' },
};
const info = (s) => STATUS[s.status] ?? { label: s.status, rank: 9, tone: 'neutral' };

export default function DeskScreen({ state, run }) {
  const seniors = [...state.seniors].sort((a, b) => info(a).rank - info(b).rank);
  const needYou = seniors.filter((s) => info(s).rank <= 3);
  const handled = seniors.filter((s) => info(s).rank > 3);
  const okCount = seniors.filter((s) => s.status === 'ok').length;

  return (
    <ScrollView contentContainerStyle={st.pad}>
      <H1 style={{ fontSize: 28, lineHeight: 32 }}>Today’s reassurance calls</H1>
      <Meta>Sample program. Porchlight makes the routine calls; you take the ones that need a person.</Meta>

      <View style={st.stats}>
        <Stat label="Need you" value={needYou.length} />
        <Stat label="Okay today" value={okCount} />
        <Stat label="In program" value={seniors.length} />
      </View>

      <H2 style={st.section}>Needs a person</H2>
      {needYou.length === 0
        ? <Card><P muted>Nobody needs a call right now. Porchlight will flag anyone who does.</P></Card>
        : needYou.map((s) => <SeniorRow key={s._id} senior={s} run={run} />)}

      <H2 style={st.section}>Porchlight has it</H2>
      {handled.map((s) => <SeniorRow key={s._id} senior={s} run={run} />)}
    </ScrollView>
  );
}

function SeniorRow({ senior: s, run }) {
  const i = info(s);
  const needs = i.rank <= 3;
  const note = s.lastNote || 'No calls yet today.';
  return (
    <Card style={[st.row, needs && { borderColor: i.tone === 'urgent' ? color.brick : color.lamp, borderWidth: 2 }]}>
      <View style={st.rowTop} accessible accessibilityLabel={`${s.name}, ${s.age}. ${i.label}. ${note}`}>
        <Lamp state={lampState(s)} size={44} />
        <View style={{ flex: 1, gap: 4 }}>
          <P bold>{s.name}, {s.age}</P>
          <Chip label={i.label} tone={i.tone} />
        </View>
      </View>
      <P muted style={st.note}>{note}</P>
      {needs && (
        <Button
          small
          variant="solid"
          label="I called, all okay"
          accessibilityHint={`Marks ${s.preferredName || s.name} as okay and stops the alerts.`}
          onPress={run(() => api.resolve(s._id, 'sam'))}
        />
      )}
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <Card style={st.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={st.statValue}>{value}</Text>
      <Meta>{label}</Meta>
    </Card>
  );
}

const st = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48, gap: 12 },
  stats: { flexDirection: 'row', gap: 10, marginVertical: 4 },
  stat: { flex: 1, padding: 14, gap: 2 },
  statValue: { fontFamily: font.display, fontSize: 32, lineHeight: 36, color: color.dusk },
  section: { marginTop: 8 },
  row: { padding: 14, gap: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { fontSize: 15, lineHeight: 21 },
});
