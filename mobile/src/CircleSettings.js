// Family side: who's in the care circle, invites, what each person can see, and this account.
// The older adult and the primary contact can change the circle; everyone can invite.
import { useState } from 'react';
import { Alert, Share, StyleSheet, Switch, TextInput, View } from 'react-native';
import { api } from './api';
import { sheet } from './design/Sheet';
import { toast } from './design/Toaster';
import { haptic } from './design/haptics';
import { useTheme } from './design/theme';
import { Button, ListGroup, ListRow, T } from './design/ui';
import { accent, radius } from './design/tokens';
import { pretty } from './Onboarding';

const first = (name) => String(name || '').split(' ')[0];
const failed = (e) => toast.error('That didn’t go through', { description: e.message });

export async function shareInvite(senior) {
  try {
    const { code } = await api.invite();
    await Share.share({ message: `Join ${senior.preferredName}’s care circle on Porchlight. Install the app, choose “I’m family”, and enter this code: ${code}. It works for 7 days.` });
  } catch (e) { failed(e); }
}

function Field({ label, multiline, ...props }) {
  const { c } = useTheme();
  return <View style={{ gap: 6 }}>
    <T v="label" muted>{label}</T>
    <TextInput placeholderTextColor={c.muted} multiline={multiline} style={[st.input, multiline && st.multi, { backgroundColor: c.sunken, color: c.ink }]} accessibilityLabel={label} {...props} />
  </View>;
}

// Invite and add buttons for the circle list.
export function CircleActions({ senior, manager, refresh }) {
  return <View style={st.row}>
    <Button variant="primary" icon="person.badge.plus" label="Invite with a code" style={{ flex: 1 }} onPress={() => shareInvite(senior)} />
    {manager && <Button icon="phone" label="Add by number" style={{ flex: 1 }} onPress={() => openAddPerson({ senior, refresh })} />}
  </View>;
}

export function openAddPerson({ senior, refresh }) {
  sheet.open((close) => <AddPerson senior={senior} refresh={refresh} close={close} />);
}

function AddPerson({ senior, refresh, close }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy || !name.trim() || !phone.trim()) return;
    setBusy(true);
    try {
      await api.addPerson({ name: name.trim(), phone, relation: relation.trim(), role: /neighbo/i.test(relation) ? 'neighbor' : 'family' });
      haptic.success();
      toast.success(`${first(name)} is in the circle`, { description: 'When they sign in to Porchlight with that number, they’re offered the circle.' });
      close();
      await refresh?.();
    } catch (e) { failed(e); } finally { setBusy(false); }
  };
  return <View style={{ gap: 14 }}>
    <T v="title">Add someone</T>
    <T v="callout" muted>A relative or neighbor Porchlight can reach when {senior.preferredName} needs help.</T>
    <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" maxLength={80} />
    <Field label="Mobile number" value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" textContentType="telephoneNumber" maxLength={20} />
    <Field label="Who they are" value={relation} onChangeText={setRelation} placeholder="Son, neighbor, friend" autoCapitalize="sentences" maxLength={40} />
    <Button variant="primary" label={busy ? 'Adding…' : 'Add to the circle'} disabled={!name.trim() || !phone.trim()} busy={busy} onPress={save} />
  </View>;
}

// One person: what they can see and do. Only the primary contact (or the older adult) opens this.
export function openMember({ member, senior, refresh }) {
  sheet.open((close) => <Member member={member} senior={senior} refresh={refresh} close={close} />);
}

function Member({ member, senior, refresh, close }) {
  const [m, setM] = useState(member);
  const set = async (patch) => {
    haptic.select();
    const before = m;
    setM({ ...m, ...patch });
    try { setM(await api.editPerson(m._id, patch)); await refresh?.(); } catch (e) { setM(before); failed(e); }
  };
  const remove = () => Alert.alert(`Remove ${first(m.name)}?`, `They’ll stop getting updates about ${senior.preferredName}.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { try { await api.removePerson(m._id); close(); await refresh?.(); toast.success(`${first(m.name)} was removed`); } catch (e) { failed(e); } } },
  ]);
  const toggle = (key, label, sub) => (
    <ListRow title={label} sub={sub} right={<Switch value={!!m[key]} disabled={m.primary} onValueChange={(v) => set({ [key]: v })} trackColor={{ true: accent.green }} accessibilityLabel={label} />} />
  );
  return <View style={{ gap: 14 }}>
    <View style={{ gap: 4 }}>
      <T v="title">{m.name}</T>
      <T v="callout" muted>{[m.relation, m.primary ? 'Primary contact' : null, m.hasApp ? 'Uses the app' : 'No app yet'].filter(Boolean).join(' · ')}</T>
    </View>
    <ListGroup>
      {toggle('seesMeds', 'Medicine details', 'Sees medicines, doses and call transcripts')}
      {toggle('canApprove', 'Can approve rides', 'Gets asked when a ride needs an OK')}
    </ListGroup>
    {!m.primary && m.role === 'family' && <Button label="Make primary contact" icon="star" onPress={() => set({ primary: true })} />}
    {!m.primary && <Button variant="ghost" label={`Remove ${first(m.name)} from the circle`} onPress={remove} />}
    {m.primary && <T v="footnote" muted>The primary contact sees everything and is called first. Make someone else primary to change this.</T>}
  </View>;
}

// The older adult's details that help Porchlight: name, home (for rides), and things to talk about.
export function openSeniorEditor({ senior, refresh }) {
  sheet.open((close) => <SeniorEditor senior={senior} refresh={refresh} close={close} />);
}

function SeniorEditor({ senior, refresh, close }) {
  const [preferredName, setName] = useState(senior.preferredName || '');
  const [home, setHome] = useState(senior.home || '');
  const [about, setAbout] = useState((senior.about || []).join('\n'));
  const [phone, setPhone] = useState(senior.phone || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy || !preferredName.trim()) return;
    setBusy(true);
    try {
      await api.editSenior({
        preferredName: preferredName.trim(), home: home.trim(),
        about: about.split('\n').map((x) => x.trim()).filter(Boolean),
        ...(!senior.hasApp && phone.trim() ? { phone } : {}),
      });
      haptic.success();
      toast.success('Saved');
      close();
      await refresh?.();
    } catch (e) { failed(e); } finally { setBusy(false); }
  };
  return <View style={{ gap: 14 }}>
    <T v="title">About {senior.preferredName}</T>
    <Field label="What Porchlight calls them" value={preferredName} onChangeText={setName} autoCapitalize="words" maxLength={40} />
    {!senior.hasApp && <Field label="Their phone number (Porchlight calls this)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} />}
    <Field label="Home address (for rides)" value={home} onChangeText={setHome} placeholder="Street, city" autoCapitalize="words" maxLength={200} />
    <Field label="Things they like to talk about (one per line)" value={about} onChangeText={setAbout} placeholder={'Gardening\nThe grandkids'} multiline maxLength={2000} />
    <Button variant="primary" label={busy ? 'Saving…' : 'Save'} disabled={!preferredName.trim()} busy={busy} onPress={save} />
  </View>;
}

// Settings rows for the signed-in family member.
export function AccountGroup({ account }) {
  const me = account.me || {};
  const confirmDelete = () => Alert.alert('Delete your account?', 'You’ll leave the care circle and stop getting updates. If you set Porchlight up and no one else is in the circle, its data is deleted too.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => account.deleteAccount().catch(failed) },
  ]);
  return <ListGroup>
    <ListRow avatar={me.name} title={me.name || 'You'} sub={me.phone ? pretty(me.phone) : null} />
    <ListRow icon="rectangle.portrait.and.arrow.right" title="Sign out" onPress={account.signOut} chevron={false} />
    <ListRow icon="trash" title="Delete my account" onPress={confirmDelete} chevron={false} />
  </ListGroup>;
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  input: { borderRadius: radius.sm, paddingHorizontal: 14, minHeight: 48, fontSize: 17 },
  multi: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
});
