// Peggy's medicines: the list (name, dose, times of day) with today's taken / not yet marked status,
// and an editor sheet to add or change one. Used on Peggy's My plans and on the family side.
// Family members who can't see medicine details (seesMeds: false, e.g. Mark) get a "private" note.
// Porchlight only keeps the list and reminds; it never suggests doses or changes.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BigButton, Badge, Button, Card, Divider, Press, Section, T } from '../design/ui';
import { useTheme } from '../design/theme';
import { sheet } from '../design/Sheet';
import Icon from '../design/Icon';
import { haptic } from '../design/haptics';
import { toast } from '../design/Toaster';
import { accent, font, radius } from '../design/tokens';
import { api } from '../api';
import { clock } from './reminders';
import { todaySlots } from './PillsCard';

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const first = (name) => name?.split(' ')[0];

const STATUS = {
  taken: (d) => [`${d.label} · Taken${d.takenAt ? ' ' + timeOf(d.takenAt) : ''}${d.by === 'call' ? ' (said on a call)' : ''}`, 'green'],
  due: (d) => [`${d.label} · Due now`, 'lamp'],
  missed: (d) => [`${d.label} · Not marked yet`, 'lamp'],
  upcoming: (d) => [`${d.label} · Later`, 'neutral'],
};

// Family Today: one line per time slot. viewer = the member using the phone.
export function MedsSummary({ senior, state, viewer, onOpen }) {
  const { c } = useTheme();
  if (viewer?.seesMeds === false) return null;
  const groups = todaySlots(state, senior._id);
  if (!groups.length) return null;
  const name = senior.preferredName;
  return <Section title="Pills today" action={onOpen && <Button size="sm" variant="ghost" label="Medicines" onPress={onOpen} />}>
    <Card style={{ gap: 10 }}>
      {groups.map((g, i) => <View key={g.time} style={{ gap: 10 }}>
        {i > 0 && <Divider />}
        <View style={st.row}>
          <Icon name={g.state === 'taken' ? 'checkmark.circle' : 'clock'} size={18} color={g.state === 'taken' ? accent.greenText : c.muted} />
          <View style={{ flex: 1, gap: 1 }}>
            <T v="headline">{g.label}</T>
            <T v="footnote" muted>{g.doses.map((d) => d.name).join(', ')}</T>
          </View>
          <Badge label={g.state === 'taken' ? 'Taken' : g.doses.some((d) => d.status === 'missed') ? 'Not marked' : g.state === 'now' ? 'Due now' : 'Later'} tone={g.state === 'taken' ? 'green' : g.state === 'now' ? 'lamp' : 'neutral'} />
        </View>
      </View>)}
      <T v="footnote" muted>{name} marks pills from her phone’s reminder or on her call. Porchlight reminds her again 30 minutes later.</T>
    </Card>
  </Section>;
}

// The full list with editing. viewer: the family member (null on Peggy's own phone).
export default function MedsList({ senior, state, viewer, refresh }) {
  const { c, isSenior } = useTheme();
  const name = senior.preferredName;
  if (viewer?.seesMeds === false) {
    const primary = state.members.find((m) => m.circleId === senior.circleId && m.primary);
    return <Section title="Medicines"><Card><T v="headline">Private</T><T v="callout" muted>{name}’s medicine details are shared with {first(primary?.name) || 'her primary contact'} only.</T></Card></Section>;
  }
  const meds = senior.meds || [];
  const today = (state.medsToday || []).filter((d) => d.seniorId === senior._id);
  const open = (med) => openMedEditor({ senior, med, memberId: viewer?._id, refresh, theme: isSenior ? 'senior' : 'light' });

  const rows = meds.map((m) => {
    const doses = today.filter((d) => d.medId === m.id);
    return <Press key={m.id} onPress={() => open(m)} scaleTo={0.98} accessibilityLabel={`${m.name}${m.dose ? ', ' + m.dose : ''}, ${m.when || ''}. Edit`} style={st.medRow}>
      <View style={{ flex: 1, gap: 6 }}>
        <T v="headline">{m.name}</T>
        <T v="callout" muted>{[m.dose, m.when].filter(Boolean).join(' · ')}</T>
        <View style={st.badges}>{doses.map((d) => { const [label, tone] = STATUS[d.status](d); return <Badge key={d.time} label={label} tone={tone} />; })}</View>
      </View>
      <Icon name="chevron.right" size={14} color={c.muted} />
    </Press>;
  });

  if (isSenior) {
    return <View style={{ gap: 12 }}>
      <T v="readHeadline">My medicines</T>
      {meds.length ? <Card style={{ gap: 4 }}>{rows.map((r, i) => <View key={i}>{i > 0 && <Divider />}{r}</View>)}</Card> : <T v="read" muted>No medicines on your list yet.</T>}
      <BigButton icon="plus" title="Add a medicine" sub="Porchlight reminds you each day" onPress={() => open(null)} />
    </View>;
  }
  return <Section title="Medicines" action={<Button size="sm" variant="ghost" icon="plus" label="Add" accessibilityLabel={`Add a medicine for ${name}`} onPress={() => open(null)} />}>
    <Card style={{ gap: 4, paddingVertical: 6 }}>
      {meds.length ? rows.map((r, i) => <View key={i}>{i > 0 && <Divider />}{r}</View>) : <View style={{ paddingVertical: 12, gap: 4 }}><T v="headline">No medicines yet</T><T v="callout" muted>Add one and {name}’s phone reminds her at each time.</T></View>}
    </Card>
    <T v="footnote" muted>Reminders ring on {name}’s phone at each time, with a gentle repeat if she hasn’t marked it. Porchlight never gives dosing advice; check changes with her doctor or pharmacist.</T>
  </Section>;
}

export function openMedEditor({ senior, med, memberId, refresh, theme = 'light' }) {
  sheet.open((close) => <MedEditor senior={senior} med={med} memberId={memberId} refresh={refresh} close={close} />, { theme });
}

function MedEditor({ senior, med, memberId, refresh, close }) {
  const { c, isSenior } = useTheme();
  const [nameText, setName] = useState(med?.name || '');
  const [dose, setDose] = useState(med?.dose || '');
  const [times, setTimes] = useState(med?.times?.length ? med.times : ['08:00']);
  const [busy, setBusy] = useState(false);
  const input = [st.input, { backgroundColor: c.sunken, color: c.ink }, isSenior && { fontFamily: font.read, fontSize: 22, minHeight: 60 }];
  const step = (i, d) => { haptic.select(); setTimes((ts) => ts.map((t, j) => (j === i ? toHHMM((toMin(t) + d + 1440) % 1440) : t))); };
  const addTime = () => { haptic.select(); setTimes((ts) => [...ts, ts.length ? toHHMM((toMin(ts.at(-1)) + 12 * 60) % 1440) : '08:00']); };

  const save = async () => {
    if (!nameText.trim() || busy) return;
    setBusy(true);
    try {
      const body = { name: nameText.trim(), dose: dose.trim(), times: [...new Set(times)].sort() };
      if (med) await api.editMed(senior._id, med.id, body, memberId);
      else await api.addMed(senior._id, body, memberId);
      haptic.success();
      toast.success(med ? 'Medicine updated' : 'Medicine added', { description: `${senior.preferredName}’s phone will remind her at ${body.times.map(clock).join(' and ')}.` });
      close();
      await refresh?.();
    } catch (e) { toast.error('That didn’t save', { description: e.message }); } finally { setBusy(false); }
  };
  const remove = async () => {
    try {
      await api.removeMed(senior._id, med.id);
      toast.success('Medicine removed', { description: 'Its reminders are turned off.' });
      close();
      await refresh?.();
    } catch (e) { toast.error('That didn’t go through', { description: e.message }); }
  };

  return <View style={{ gap: 14 }}>
    <T v="title">{med ? 'Edit medicine' : 'Add a medicine'}</T>
    <View style={{ gap: 6 }}>
      <T v="label" muted>Name</T>
      <TextInput value={nameText} onChangeText={setName} placeholder="Blood pressure pill" placeholderTextColor={c.muted} style={input} maxLength={60} accessibilityLabel="Medicine name" autoCapitalize="sentences" />
    </View>
    <View style={{ gap: 6 }}>
      <T v="label" muted>How much (as prescribed)</T>
      <TextInput value={dose} onChangeText={setDose} placeholder="1 tablet" placeholderTextColor={c.muted} style={input} maxLength={40} accessibilityLabel="How much, as prescribed" />
    </View>
    <View style={{ gap: 8 }}>
      <T v="label" muted>Times each day</T>
      {times.map((t, i) => <View key={i} style={st.timeRow}>
        <Press onPress={() => step(i, -15)} feedback={null} accessibilityLabel={`${clock(t)}, fifteen minutes earlier`} style={[st.stepBtn, { backgroundColor: c.sunken }]}><Icon name="minus" size={18} color={c.ink} weight="bold" /></Press>
        <Text style={[st.time, { color: c.ink }]} accessibilityLabel={`Reminder at ${clock(t)}`}>{clock(t)}</Text>
        <Press onPress={() => step(i, 15)} feedback={null} accessibilityLabel={`${clock(t)}, fifteen minutes later`} style={[st.stepBtn, { backgroundColor: c.sunken }]}><Icon name="plus" size={18} color={c.ink} weight="bold" /></Press>
        {times.length > 1 && <Press onPress={() => setTimes((ts) => ts.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove the ${clock(t)} reminder`} style={[st.stepBtn, { backgroundColor: 'transparent' }]}><Icon name="xmark" size={14} color={c.muted} /></Press>}
      </View>)}
      {times.length < 4 && <Button size="sm" variant="ghost" icon="plus" label="Add a time" onPress={addTime} />}
    </View>
    <Button variant="primary" label={busy ? 'Saving…' : med ? 'Save changes' : 'Add medicine'} disabled={!nameText.trim()} busy={busy} onPress={save} />
    {med && <Button variant="ghost" label="Remove this medicine" accessibilityHint="Turns off its reminders" onPress={remove} />}
    <T v="footnote" muted>Enter it exactly as the doctor or pharmacist prescribed. Porchlight only reminds; it never gives dosing advice.</T>
  </View>;
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  input: { borderRadius: radius.sm, paddingHorizontal: 14, minHeight: 48, fontSize: 17 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  time: { flex: 1, textAlign: 'center', fontSize: 30, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] },
});
