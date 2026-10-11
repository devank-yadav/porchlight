import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from './api';
import { useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import { Appear, Badge, Button, Card, Section, T, useSettled } from './design/ui';
import { ease, light, radius, shadow } from './design/tokens';

// rank ≤ 3 needs a person. Tone follows the lamp: red only for help and scams, amber for follow-ups.
const STATUS = {
  help: { label: 'Pressed help', rank: 0, tone: 'red' },
  missed: { label: 'Check-in unresolved', rank: 1, tone: 'lamp' },
  scam: { label: 'Possible scam', rank: 2, tone: 'red' },
  'needs-human': { label: 'Needs a human call', rank: 3, tone: 'lamp' },
  talking: { label: 'On a call now', rank: 4, tone: 'neutral' },
  waiting: { label: 'Not called yet', rank: 5, tone: 'neutral' },
  ok: { label: 'Okay today', rank: 6, tone: 'green' },
};
const info = (s) => STATUS[s.status] ?? { label: s.status, rank: 9, tone: 'neutral' };

export default function DeskScreen() {
  const { state, run } = useAppContext();
  const insets = useSafeAreaInsets();
  const settled = useSettled();
  const seniors = [...state.seniors].sort((a, b) => info(a).rank - info(b).rank);
  const needYou = seniors.filter((s) => info(s).rank <= 3);
  const handled = seniors.filter((s) => info(s).rank > 3);
  const okCount = seniors.filter((s) => s.status === 'ok').length;

  return (
    <ScrollView contentContainerStyle={[st.pad, { paddingTop: 24, paddingBottom: insets.bottom + 40 }]}>
      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <T v="largeTitle">Today’s calls</T>
        <T v="callout" muted>Sample reassurance program. Porchlight makes the routine calls; you take the ones that need a person.</T>
      </View>

      <View style={st.stats}>
        <Stat label="Need you" value={needYou.length} strong={needYou.length > 0} />
        <Stat label="Okay today" value={okCount} />
        <Stat label="In program" value={seniors.length} />
      </View>

      <Section title="Needs a person">
        {needYou.length === 0
          ? <Card><T v="callout" muted>Nobody needs a call right now. Porchlight will flag anyone who does.</T></Card>
          : needYou.map((s) => <Appear key={s._id} on={settled}><SeniorRow senior={s} run={run} /></Appear>)}
      </Section>

      <Section title="Porchlight has it">
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {handled.map((s, i) => (
            <Appear key={s._id} on={settled}>
              {i > 0 && <View style={st.sep} />}
              <SeniorRow senior={s} run={run} flat />
            </Appear>
          ))}
        </Card>
      </Section>
    </ScrollView>
  );
}

function SeniorRow({ senior: s, run, flat }) {
  const i = info(s);
  const needs = i.rank <= 3;
  const note = s.lastNote || 'No calls yet today.';
  const body = (
    <>
      <View style={st.rowTop} accessible accessibilityLabel={`${s.name}, ${s.age}. ${i.label}. ${note}`}>
        <Lamp state={lampState(s)} size={42} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <T v="headline">{s.name}, {s.age}</T>
            <Badge label={i.label} tone={i.tone} />
          </View>
          <T v="footnote" muted numberOfLines={flat ? 1 : 3}>{note}</T>
        </View>
      </View>
      {needs && (
        <Button
          variant="primary"
          icon="checkmark"
          label="I called, all okay"
          accessibilityHint={`Marks ${s.preferredName || s.name} as okay and stops the alerts.`}
          onPress={run(() => api.resolve(s._id, 'sam'), `${s.preferredName || s.name} is marked okay`)}
        />
      )}
    </>
  );
  return flat ? <View style={st.flatRow}>{body}</View> : <Card tone={i.tone === 'red' ? 'red' : 'lamp'} style={{ gap: 14 }}>{body}</Card>;
}

// Counts roll when they change: the old number leaves up, the new one arrives from below.
function Stat({ label, value, strong }) {
  return (
    <View style={[st.stat, shadow.card]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={st.statClip}>
        <Animated.Text key={value} entering={FadeInDown.duration(250).easing(ease.out)} exiting={FadeOutUp.duration(200).easing(ease.out)} style={[st.statValue, strong && { color: '#A8291A' }]}>
          {value}
        </Animated.Text>
      </View>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  pad: { paddingHorizontal: 16, gap: 20 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: light.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: light.line, padding: 14, gap: 2 },
  statClip: { height: 40, overflow: 'hidden' },
  statValue: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1.2, color: light.ink, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, fontWeight: '500', color: light.muted },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flatRow: { paddingVertical: 12 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: light.lineStrong, marginLeft: 54 },
});
