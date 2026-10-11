import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { Button, H1, Meta, P } from './ui';
import { color, font, radius } from './theme';

const STATUS = {
  help: { label: 'Pressed help', rank: 0 },
  missed: { label: 'Missed check-in', rank: 1 },
  scam: { label: 'Possible scam', rank: 2 },
  'needs-human': { label: 'Needs a human call', rank: 3 },
  talking: { label: 'On a call now', rank: 4 },
  waiting: { label: 'Not called yet', rank: 5 },
  ok: { label: 'Okay today', rank: 6 },
};
const CHIP = {
  help: [color.brickSoft, color.brick], missed: [color.brickSoft, color.brick], scam: [color.brickSoft, color.brick],
  'needs-human': [color.lampSoft, '#6A4300'], ok: [color.sageSoft, color.sage],
};

export default function DeskScreen({ state, run }) {
  const seniors = [...state.seniors].sort((a, b) => (STATUS[a.status]?.rank ?? 9) - (STATUS[b.status]?.rank ?? 9));
  const need = seniors.filter((s) => (STATUS[s.status]?.rank ?? 9) <= 3).length;
  const okCount = seniors.filter((s) => s.status === 'ok').length;

  return (
    <ScrollView contentContainerStyle={st.pad}>
      <H1 style={{ fontSize: 28, lineHeight: 32 }}>Today’s reassurance calls</H1>
      <Meta>Sample program. Porchlight makes the routine calls; you take the ones that need a person.</Meta>
      <View style={st.stats}>
        <Stat label="Need you" value={need} />
        <Stat label="Okay today" value={okCount} />
        <Stat label="In program" value={seniors.length} />
      </View>

      {seniors.map((s) => {
        const info = STATUS[s.status] ?? { label: s.status, rank: 9 };
        const urgent = info.rank <= 3;
        const [bg, fg] = CHIP[s.status] ?? [color.sky, color.dusk];
        return (
          <View key={s._id} style={[st.row, urgent && { borderColor: color.brick }]}>
            <View style={st.rowTop}>
              <Lamp state={lampState(s)} size={44} label={info.label} />
              <View style={{ flex: 1 }}>
                <P bold>{s.name}, {s.age}</P>
                <View style={[st.chip, { backgroundColor: bg }]}><Text style={[st.chipText, { color: fg }]}>{info.label}</Text></View>
              </View>
            </View>
            <Meta>{s.lastNote || 'No calls yet today.'}</Meta>
            {urgent
              ? <Button small variant="solid" label="I called, all okay" onPress={run(() => api.resolve(s._id, 'sam'))} />
              : <Meta style={{ fontStyle: 'normal' }}>Porchlight has it</Meta>}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({ label, value }) {
  return (
    <View>
      <Text style={st.statValue}>{value}</Text>
      <Meta>{label}</Meta>
    </View>
  );
}

const st = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48, gap: 12 },
  stats: { flexDirection: 'row', gap: 28, marginVertical: 4 },
  statValue: { fontFamily: font.display, fontSize: 32, color: color.dusk },
  row: { backgroundColor: '#fff', borderRadius: radius.sm, borderWidth: 1, borderColor: color.line, padding: 14, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  chipText: { fontFamily: font.bodyBold, fontSize: 13 },
});
