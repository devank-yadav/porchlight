import { View } from 'react-native';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { Button, Card, Chip, List, Row, Screen, Section, Stats, T, Title } from './ui';

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
    <Screen>
      <View style={{ gap: 6 }}>
        <Title>Today’s calls</Title>
        <T tone="muted">Sample program. Porchlight makes the routine calls; you take the ones that need a person.</T>
      </View>

      <Stats
        items={[
          { label: 'Need you', value: needYou.length, big: true, tone: needYou.length ? 'lamp' : 'ink' },
          { label: 'Okay today', value: okCount, big: true },
          { label: 'In program', value: seniors.length, big: true },
        ]}
      />

      <Section label="Needs a person">
        <Card flush>
          <List inset={72}>
            {needYou.length === 0
              ? [<Row key="none"><T tone="muted">Nobody needs a call right now. Porchlight will flag anyone who does.</T></Row>]
              : needYou.map((s) => <SeniorRow key={s._id} senior={s} run={run} />)}
          </List>
        </Card>
      </Section>

      <Section label="Porchlight has it">
        <Card flush>
          <List inset={72}>
            {handled.map((s) => <SeniorRow key={s._id} senior={s} run={run} />)}
          </List>
        </Card>
      </Section>
    </Screen>
  );
}

function SeniorRow({ senior: s, run }) {
  const i = info(s);
  const needs = i.rank <= 3;
  const note = s.lastNote || 'No calls yet today.';
  return (
    <Row leading={<Lamp state={lampState(s)} size={44} label={i.label} />} style={{ alignItems: 'flex-start' }}>
      <View accessible accessibilityLabel={`${s.name}, ${s.age}. ${i.label}. ${note}`} style={{ gap: 6 }}>
        <T v="bodyBold">{s.name}, {s.age}</T>
        <Chip label={i.label} tone={i.tone} />
        <T v="caption" tone="muted" style={{ fontSize: 15, lineHeight: 21 }}>{note}</T>
      </View>
      {needs && (
        <Button
          size="sm"
          variant="primary"
          label="I called, all okay"
          accessibilityHint={`Marks ${s.preferredName || s.name} as okay and stops the alerts.`}
          onPress={run(() => api.resolve(s._id, 'sam'))}
          style={{ alignSelf: 'flex-start', marginTop: 8 }}
        />
      )}
    </Row>
  );
}
