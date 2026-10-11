import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutUp, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { api } from './api';
import { useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import { Appear, Avatar, Button, Card, Chip, IconTile, LargeTitle, ListGroup, Screen, Section, T, useSettled } from './design/ui';
import { useTheme } from './design/theme';
import { accent, ease, radius, shadow } from './design/tokens';

// The volunteer desk: an operations view for the nonprofit's reassurance program.
// rank ≤ 3 needs a person. Tone follows the lamp: red only for help and scams, amber for follow-ups.
const STATUS = {
  help: { label: 'Pressed help', rank: 0, tone: 'red', icon: 'hand.raised.fill' },
  missed: { label: 'Check-in unresolved', rank: 1, tone: 'lamp', icon: 'phone.down.fill' },
  scam: { label: 'Possible scam', rank: 2, tone: 'red', icon: 'exclamationmark.shield.fill' },
  'needs-human': { label: 'Needs a human call', rank: 3, tone: 'lamp', icon: 'person.wave.2.fill' },
  talking: { label: 'On a call now', rank: 4, tone: 'neutral', icon: 'phone.fill' },
  waiting: { label: 'Not called yet', rank: 5, tone: 'neutral', icon: 'clock' },
  ok: { label: 'Okay today', rank: 6, tone: 'green', icon: 'checkmark' },
};
const info = (s) => STATUS[s.status] ?? { label: s.status, rank: 9, tone: 'neutral' };

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const todayLabel = (d = new Date()) => `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

export default function DeskScreen() {
  const { state, run } = useAppContext();
  const settled = useSettled();
  const seniors = [...state.seniors].sort((a, b) => info(a).rank - info(b).rank);
  const needYou = seniors.filter((s) => info(s).rank <= 3);
  const handled = seniors.filter((s) => info(s).rank > 3);
  const okCount = seniors.filter((s) => s.status === 'ok').length;

  return (
    <Screen>
      <Appear on index={0} style={{ gap: 2 }}>
        <T v="eyebrow" muted style={{ paddingTop: 4 }}>{todayLabel()}</T>
        <LargeTitle title="Today’s calls" subtitle="Sample reassurance program" style={{ paddingTop: 0 }} />
      </Appear>

      <Appear on index={1} style={st.stats}>
        <Stat label="Need you" value={needYou.length} icon="person.wave.2.fill" alert={needYou.length > 0} animate={settled} />
        <Stat label="Okay today" value={okCount} icon="checkmark" tone="green" animate={settled} />
        <Stat label="In program" value={seniors.length} icon="person.2.fill" animate={settled} />
      </Appear>

      <Appear on index={2}>
        <Section title="Needs a person">
          {needYou.length === 0 ? (
            <Item key="clear" settled={settled}>
              <Card style={st.clear}>
                <IconTile icon="checkmark" tone="green" size={44} style={{ borderRadius: 14 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="headline">All clear</T>
                  <T v="footnote" muted>Porchlight will flag anyone who needs a call.</T>
                </View>
              </Card>
            </Item>
          ) : needYou.map((s) => (
            <Item key={s._id} settled={settled}>
              <NeedsCard senior={s} run={run} />
            </Item>
          ))}
        </Section>
      </Appear>

      {handled.length > 0 ? (
        <Appear on index={3}>
          <Section title="Porchlight has it">
            <ListGroup>
              {handled.map((s) => (
                <Item key={s._id} settled={settled} dividerInset={64}>
                  <HandledRow senior={s} />
                </Item>
              ))}
            </ListGroup>
          </Section>
        </Appear>
      ) : null}
    </Screen>
  );
}

// A list item that fades up when it arrives (after the screen has settled) and fades out when it
// leaves, while its neighbours glide into place. Nothing moves when the desk first opens.
function Item({ settled, children }) {
  const reduced = useReducedMotion();
  const entering = settled ? (reduced ? FadeIn.duration(200) : FadeInDown.duration(300).easing(ease.out)) : undefined;
  const exiting = settled ? FadeOut.duration(reduced ? 150 : 180).easing(ease.out) : undefined;
  return (
    <Animated.View entering={entering} exiting={exiting} layout={reduced ? undefined : LinearTransition.duration(220).easing(ease.out)}>
      {children}
    </Animated.View>
  );
}

// Someone who needs a volunteer: who they are, their porch light, why, what Porchlight heard, and the one action.
function NeedsCard({ senior: s, run }) {
  const { c } = useTheme();
  const i = info(s);
  const who = s.preferredName || s.name;
  const note = s.lastNote || 'No calls yet today.';
  return (
    <Card tone={s.status === 'help' ? 'red' : undefined} style={st.needs}>
      <View style={{ gap: 14 }} accessible accessibilityLabel={`${s.name}, ${s.age}. ${i.label}. ${note}`}>
        <View style={st.needsHead}>
          <Avatar name={s.name} size={44} />
          <View style={{ flex: 1, gap: 7 }}>
            <Text style={[st.name, { color: c.ink }]} numberOfLines={1}>
              {s.name}<Text style={[st.age, { color: c.muted }]}>, {s.age}</Text>
            </Text>
            <Chip label={i.label} tone={i.tone} icon={i.icon} />
          </View>
          <View style={st.lampSlot}>
            <Lamp state={lampState(s)} size={52} />
          </View>
        </View>
        <View style={[st.note, { backgroundColor: c.surface2, borderColor: c.line }]}>
          <Text style={[st.noteText, { color: c.ink2 }]} numberOfLines={4}>{note}</Text>
        </View>
      </View>
      <Button
        variant="primary"
        icon="checkmark"
        label="I called, all okay"
        accessibilityHint={`Marks ${who} as okay and stops the alerts.`}
        onPress={run(() => api.resolve(s._id, 'sam'), `${who} is marked okay`)}
      />
    </Card>
  );
}

// Everyone Porchlight is handling: one quiet row each, inside an inset-grouped list.
function HandledRow({ senior: s }) {
  const { c } = useTheme();
  const i = info(s);
  const note = s.lastNote || 'No calls yet today.';
  return (
    <View style={st.row} accessible accessibilityLabel={`${s.name}, ${s.age}. ${i.label}. ${note}`}>
      <Avatar name={s.name} size={36} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={st.rowTop}>
          <Text style={[st.rowName, { color: c.ink }]} numberOfLines={1}>{s.name}</Text>
          <Chip label={i.label} tone={i.tone} icon={i.icon} />
        </View>
        <Text style={[st.rowNote, { color: c.muted }]} numberOfLines={2}>{note}</Text>
      </View>
    </View>
  );
}

// Counts roll when they change: the old number leaves up, the new one arrives from below.
// "Need you" turns red only while someone is waiting on a person.
function Stat({ label, value, icon, tone = 'plain', alert, animate }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const entering = !animate ? undefined : reduced ? FadeIn.duration(200) : FadeInDown.duration(250).easing(ease.out);
  const exiting = !animate ? undefined : reduced ? FadeOut.duration(150) : FadeOutUp.duration(200).easing(ease.out);
  return (
    <View
      style={[st.stat, { backgroundColor: c.surface, borderColor: c.line }, shadow.card, alert && st.statAlert]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <IconTile icon={icon} tone={alert ? 'redSolid' : tone} size={30} iconSize={15} style={{ borderRadius: 9 }} />
      <View style={{ gap: 0 }}>
        <View style={st.statClip}>
          <Animated.Text key={value} entering={entering} exiting={exiting} style={[st.statValue, { color: alert ? accent.redText : c.ink }]}>
            {value}
          </Animated.Text>
        </View>
        <Text style={[st.statLabel, { color: alert ? accent.redText : c.muted }]} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 13, gap: 12 },
  statAlert: { backgroundColor: '#FFF9F7', borderColor: 'rgba(217,63,43,0.26)' },
  statClip: { height: 38, overflow: 'hidden' },
  statValue: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, lineHeight: 17, fontWeight: '600', letterSpacing: -0.1 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  needs: { padding: 18, gap: 16 },
  needsHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lampSlot: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center', marginRight: -4 },
  name: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  age: { fontWeight: '400', letterSpacing: -0.2 },
  note: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12 },
  noteText: { fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  rowName: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600', letterSpacing: -0.2 },
  rowNote: { fontSize: 14, lineHeight: 19 },
});
