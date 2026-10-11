import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { Button, Card, Meta, PageTitle, Row, Section, Status } from './ui';
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
      <PageTitle title="Today’s calls" sub="Sample program. Porchlight makes the routine calls; you take the ones that need a person." />

      <View style={st.stats}>
        <Stat label="Need you" value={needYou.length} tone={needYou.length ? 'attention' : 'ok'} />
        <Stat label="Okay today" value={okCount} tone="ok" />
        <Stat label="In program" value={seniors.length} />
      </View>

      <Section title={`Needs a person · ${needYou.length}`}>
        {needYou.length === 0
          ? <Row icon="checkCircle" iconTone="ok" title="Nobody needs a call right now" sub="Porchlight will flag anyone who does." />
          : needYou.map((s) => <SeniorRow key={s._id} senior={s} run={run} />)}
      </Section>

      <Section title={`Porchlight has it · ${handled.length}`}>
        {handled.map((s) => <SeniorRow key={s._id} senior={s} run={run} />)}
      </Section>
    </ScrollView>
  );
}

function SeniorRow({ senior: s, run }) {
  const i = info(s);
  const needs = i.rank <= 3;
  const note = s.lastNote || 'No calls yet today.';
  return (
    <View style={st.row}>
      <View style={st.rowTop} accessible accessibilityLabel={`${s.name}, ${s.age}. ${i.label}. ${note}`}>
        <Lamp state={lampState(s)} size={40} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={st.nameLine}>
            <Text style={st.name} numberOfLines={1}>{s.name}</Text>
            <Text style={st.age}>{s.age}</Text>
          </View>
          <Status label={i.label} tone={i.tone} />
        </View>
      </View>
      <Text style={st.note}>{note}</Text>
      {needs && (
        <Button
          small
          icon="check"
          label="I called, all okay"
          style={st.resolve}
          accessibilityHint={`Marks ${s.preferredName || s.name} as okay and stops the alerts.`}
          onPress={run(() => api.resolve(s._id, 'sam'))}
        />
      )}
    </View>
  );
}

function Stat({ label, value, tone }) {
  return (
    <Card style={st.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[st.statValue, tone === 'attention' && { color: color.lamp }, tone === 'ok' && { color: color.sage }]}>{value}</Text>
      <Meta>{label}</Meta>
    </Card>
  );
}

const st = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 56, gap: 22 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 14, gap: 0 },
  statValue: { fontFamily: font.display, fontSize: 30, lineHeight: 34, color: color.ink },
  row: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flexShrink: 1, fontFamily: font.bodyBold, fontSize: 16, color: color.ink },
  age: { fontFamily: font.body, fontSize: 14, color: color.muted },
  note: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.mutedOnDusk, marginLeft: 52 },
  resolve: { alignSelf: 'flex-start', marginLeft: 52 },
});
