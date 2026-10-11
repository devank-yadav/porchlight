import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { TASK_ICON } from './Icon';
import { ago } from './useAppState';
import { Button, Card, IconBadge, Inset, Meta, P, Row, Section, Segmented, Status } from './ui';
import { color, font } from './theme';

const MOOD = { good: 'Cheerful', okay: 'Steady', low: 'A bit down' };
const MOOD_TONE = { good: 'ok', okay: 'neutral', low: 'urgent' };

// Pills: we only report what she said. Never a judgement.
const MED = { taken: 'Taken (she said)', not_taken: 'Not yet', unsure: 'Not sure', no_answer: 'No answer', private: 'Private' };
function medLabel(c) {
  if (!c) return null;
  if (c.medStatus && MED[c.medStatus]) return MED[c.medStatus];
  return c.medsTaken === true ? 'Taken (she said)' : c.medsTaken === false ? 'Not yet' : 'No answer';
}

const TRANSPORT = {
  unknown: ['Ride not sorted', 'neutral'],
  self: ['Has a ride', 'ok'],
  at_risk: ['Needs a ride', 'attention'],
  requested: ['Ride requested', 'attention'],
  confirmed: ['Ride confirmed', 'ok'],
};

// Ride steps shown on the approval card.
const STEPS = [
  ['PENDING_APPROVAL', 'Needs OK'],
  ['APPROVED', 'Approved'],
  ['REQUESTED', 'Requested'],
  ['CONFIRMED', 'Confirmed'],
];
const STEP_INDEX = { PENDING_APPROVAL: 0, APPROVED: 1, REQUESTED: 2, CONFIRMED: 3, COMPLETED: 4 };
const ENDED = { REJECTED: 'Not approved', FAILED: 'Booking failed', CANCELLED: 'Cancelled' };

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const day = d.toDateString() === today.toDateString() ? 'Today'
    : d.toDateString() === tomorrow.toDateString() ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function localTime(tz) {
  try {
    return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}
function isAwake(tz) {
  try {
    const h = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
    return h >= 8 && h < 21;
  } catch {
    return true;
  }
}

function Avatar({ name }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return <View style={st.avatar}><Text style={st.avatarText}>{initials}</Text></View>;
}

export default function FamilyScreen({ senior, state, me, run }) {
  const [tab, setTab] = useState('today');

  const circle = state.members.filter((m) => m.circleId === senior.circleId);
  const checkins = state.checkins.filter((c) => c.seniorId === senior._id && c.status === 'completed');
  const openTasks = state.tasks.filter((t) => t.seniorId === senior._id && t.status === 'open');
  const unowned = openTasks.filter((t) => !t.assignee && !(t.handoff?.status === 'pending'));
  const askedMe = openTasks.filter((t) => t.handoff?.status === 'pending' && t.handoff.to === me);
  const careBadge = unowned.length + askedMe.length || null;
  const ctx = { senior, state, me, run, circle, checkins, openTasks, unowned, askedMe, setTab, latestTalk: checkins.find((c) => c.channel !== 'button') };

  return (
    <View style={{ flex: 1 }}>
      <View style={st.tabs}>
        <Segmented
          options={[{ id: 'today', label: 'Today' }, { id: 'care', label: 'Care', badge: careBadge }, { id: 'stories', label: 'Stories' }, { id: 'circle', label: 'Circle' }]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
        {tab === 'today' && <Today {...ctx} />}
        {tab === 'care' && <Care {...ctx} />}
        {tab === 'stories' && <Stories {...ctx} />}
        {tab === 'circle' && <Circle {...ctx} />}
      </ScrollView>
    </View>
  );
}

// ---------- Today ----------
function Today({ senior, state, me, run, checkins, latestTalk, unowned, askedMe, setTab }) {
  const latest = checkins[0];
  const escalation = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'active');
  const lastResolved = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'resolved');
  const scamFlags = [
    ...(latestTalk?.flags || []).filter((f) => f.type === 'scam').map((f) => ({ text: f.text, at: latestTalk.endedAt })),
    ...state.scamChecks.filter((x) => x.seniorId === senior._id && x.verdict !== 'probably fine').map((x) => ({ text: x.description, at: x.createdAt })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const otherFlags = (latestTalk?.flags || []).filter((f) => f.type !== 'scam');
  const week = checkins.filter((c) => c.channel !== 'button').slice(0, 7).reverse();
  const lamp = lampState(senior);
  const isHelp = escalation?.reason === 'help';
  const meMember = state.members.find((m) => m._id === me);
  const actions = (state.actions || []).filter((a) => a.seniorId === senior._id && a.status !== 'COMPLETED');
  const appointments = (state.appointments || [])
    .filter((a) => a.seniorId === senior._id && new Date(a.startsAt).getTime() > Date.now() - 3600000)
    .sort((a, b) => (a.startsAt > b.startsAt ? 1 : -1));
  const checkedInToday = latest && new Date(latest.endedAt).toDateString() === new Date().toDateString();

  const headline =
    escalation ? (isHelp ? `${senior.preferredName} pressed her help button` : `${senior.preferredName}’s check-in is unresolved`)
    : senior.status === 'talking' ? `${senior.preferredName} is talking with Porchlight`
    : checkedInToday ? `${senior.preferredName} checked in ${ago(latest.endedAt)}`
    : `Waiting for ${senior.preferredName}’s ${senior.checkinTime} check-in`;

  return (
    <>
      {/* Status: the one place the summary appears. */}
      <Card style={[st.hero, isHelp && { backgroundColor: color.brickSoft }]} accessibilityLiveRegion="polite">
        <View style={st.heroTop}>
          <Lamp state={lamp} size={64} label={headline} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={st.heroTitle} accessibilityRole="header">{headline}</Text>
            {state.digest?.line && !escalation ? <Text style={st.heroSub}>{state.digest.line}</Text> : null}
          </View>
        </View>

        {escalation ? (
          <View style={{ gap: 12 }}>
            {!isHelp && <P style={{ color: color.mutedOnDusk }}>She may just be out or asleep. Porchlight is working down the list below.</P>}
            <View style={{ gap: 10 }}>
              {escalation.steps.map((s, i) => (
                <View key={i} style={st.step}>
                  <View style={[st.stepMark, s.status === 'done' && { backgroundColor: isHelp ? color.brick : color.lamp, borderColor: isHelp ? color.brick : color.lamp }]} />
                  <Text style={[st.stepText, s.status === 'done' && { color: color.ink }]}>{s.label}</Text>
                  <Text style={st.stepWhen}>{s.status === 'done' ? `sent ${ago(s.at)}` : s.status === 'held' ? 'held for quiet hours' : 'next'}</Text>
                </View>
              ))}
            </View>
            <Button variant="solid" icon="check" label={`I reached ${senior.preferredName}, she’s okay`} onPress={run(() => api.resolve(senior._id, me))} />
          </View>
        ) : (
          <>
            {latest?.summary ? <P style={{ color: color.mutedOnDusk }}>{latest.summary}</P> : null}
            <View style={st.facts}>
              {latest?.mood && <Fact label="Mood" value={MOOD[latest.mood]} />}
              {latest && <Fact label="Pills" value={medLabel(latest)} />}
              <Fact label="Next call" value={`Tomorrow ${senior.checkinTime}`} />
            </View>
            {lastResolved && Date.now() - new Date(lastResolved.resolvedAt).getTime() < 3600000 && (
              <Meta>Earlier alert resolved by {lastResolved.resolvedBy}, {ago(lastResolved.resolvedAt)}.</Meta>
            )}
          </>
        )}
      </Card>

      {actions.map((a) => (
        <ActionCard key={a._id} action={a} state={state} me={meMember} run={run} senior={senior} />
      ))}

      {(unowned.length > 0 || askedMe.length > 0) && (
        <Section title="Needs someone">
          {askedMe.length > 0 && (
            <Row icon="users" iconTone="attention" title={`${askedMe.length} ${askedMe.length === 1 ? 'task' : 'tasks'} asked of you`} sub="Accept or decline in Care" onPress={() => setTab('care')} />
          )}
          {unowned.length > 0 && (
            <Row icon="bag" title={`${unowned.length} ${unowned.length === 1 ? 'task' : 'tasks'} nobody has taken`} sub={unowned.slice(0, 2).map((t) => t.title).join(' · ')} onPress={() => setTab('care')} />
          )}
        </Section>
      )}

      {(scamFlags.length > 0 || otherFlags.length > 0) && (
        <Section title="Heads up">
          {scamFlags.slice(0, 2).map((f, i) => (
            <Row key={`s${i}`} icon="shield" iconTone="urgent" title={`Possible scam · ${ago(f.at)}`} sub={`“${f.text}”`}>
              <Meta style={{ marginLeft: 48 }}>Porchlight told her not to send anything. Worth a call to check she didn’t share any details.</Meta>
            </Row>
          ))}
          {otherFlags.map((f, i) => (
            <Row
              key={`f${i}`}
              icon={f.type === 'urgent' ? 'alert' : f.type === 'lonely' ? 'heart' : 'sparkle'}
              iconTone={f.type === 'urgent' ? 'urgent' : 'attention'}
              title={f.type === 'urgent' ? 'Needs attention now' : f.type === 'lonely' ? 'She sounded lonely' : f.type === 'meds_unsure' ? 'Not sure about her pills' : 'Different from usual'}
              sub={`“${f.text}”`}
            />
          ))}
        </Section>
      )}

      {appointments.length > 0 && (
        <Section title="Coming up">
          {appointments.map((a) => {
            const [label, tone] = TRANSPORT[a.transport] ?? TRANSPORT.unknown;
            return (
              <Row key={a._id} icon="calendar" title={a.title} sub={`${when(a.startsAt)} · ${a.where || a.with || ''}`} right={<Status label={label} tone={tone} />} />
            );
          })}
        </Section>
      )}

      <Section title="Things to talk about" footer="From what she shared today. A real call beats any app.">
        {latestTalk?.starters?.length
          ? latestTalk.starters.map((s) => <Row key={s} icon="chat" title={<P>{s}</P>} />)
          : <Row icon="chat" title={<P muted>After her next chat, you’ll see ideas here for your own call.</P>} />}
      </Section>

      {week.length > 0 && (
        <Section title="This week">
          <View style={st.week}>
            {week.map((c) => (
              <View key={c._id} style={st.weekDay} accessible accessibilityLabel={`${new Date(c.endedAt).toLocaleDateString('en-US', { weekday: 'long' })}: ${MOOD[c.mood]}`}>
                <Text style={st.weekLabel}>{new Date(c.endedAt).toLocaleDateString('en-US', { weekday: 'narrow' })}</Text>
                <View style={[st.weekDot, { backgroundColor: MOOD_TONE[c.mood] === 'ok' ? color.sage : MOOD_TONE[c.mood] === 'urgent' ? color.brick : color.surface3 }]} />
              </View>
            ))}
          </View>
          <View style={st.legend}>
            <Status label="Cheerful" tone="ok" />
            <Status label="Steady" tone="neutral" />
            <Status label="A bit down" tone="urgent" />
          </View>
        </Section>
      )}
    </>
  );
}

function Fact({ label, value }) {
  return (
    <Inset style={st.fact}>
      <Text style={st.factLabel}>{label}</Text>
      <Text style={st.factValue} numberOfLines={2}>{value}</Text>
    </Inset>
  );
}

function ActionCard({ action, state, me, run, senior }) {
  const approver = state.members.find((m) => m._id === action.approverId);
  const approverName = approver?.name.split(' ')[0] ?? 'the primary contact';
  const idx = STEP_INDEX[action.status];
  const ended = ENDED[action.status];
  const pending = action.status === 'PENDING_APPROVAL';
  const canApprove = Boolean(me?.canApprove);
  const last = action.history?.[action.history.length - 1];
  const d = action.details || {};
  const stepLabel = STEPS[Math.min(idx ?? 0, 3)][1];
  // Evidence notes sometimes repeat her quote; show a note only when it adds something.
  const note = last?.evidence?.note;
  const showNote = note && note !== 'Simulated booking, not a real ride' && !(action.reason && note.includes(action.reason.replace(/^.*?"|"$/g, '').slice(0, 20)));

  return (
    <Card accessibilityLiveRegion="polite">
      <View style={st.cardHead}>
        <IconBadge name="car" tone={ended ? 'urgent' : pending ? 'attention' : idx >= 3 ? 'ok' : 'neutral'} size={40} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={st.cardTitle}>{action.title}</Text>
          <Status label={ended ?? (pending ? (canApprove ? 'Needs your OK' : `Waiting for ${approverName}`) : stepLabel)} tone={ended ? 'urgent' : pending ? 'attention' : idx >= 3 ? 'ok' : 'neutral'} />
        </View>
      </View>

      {action.reason ? <Text style={st.quote}>{action.reason}</Text> : null}

      <Inset style={{ gap: 10 }}>
        {d.pickupAt && <Detail label="Pickup" value={when(d.pickupAt)} />}
        {d.from && <Detail label="From" value={d.from} />}
        {d.to && <Detail label="To" value={d.to} />}
        {d.needs && <Detail label="Note" value={d.needs} />}
      </Inset>

      {!ended && (
        <View style={{ gap: 6 }} accessible accessibilityLabel={`Status: ${stepLabel}`}>
          <View style={st.steps}>
            {STEPS.map(([key], i) => (
              <View key={key} style={[st.bar, i <= (idx ?? 0) && { backgroundColor: idx >= 3 ? color.sage : color.lamp }]} />
            ))}
          </View>
          <View style={st.steps}>
            {STEPS.map(([key, label], i) => (
              <Text key={key} style={[st.stepLabel, i <= (idx ?? 0) && { color: color.ink }]}>{label}</Text>
            ))}
          </View>
        </View>
      )}

      {(action.simulated || showNote) && (
        <Meta>{[action.simulated && `Simulated booking, not a real ride${last?.evidence?.ref ? ` · ref ${last.evidence.ref}` : ''}`, showNote && note].filter(Boolean).join(' · ')}</Meta>
      )}

      {pending && canApprove && (
        <View style={st.btnRow}>
          <Button variant="solid" label="Approve ride" style={{ flex: 1 }} onPress={run(() => api.approve(action._id, me._id))} />
          <Button label="Not now" style={{ flex: 1 }} onPress={run(() => api.reject(action._id, me._id))} />
        </View>
      )}
      {action.status === 'CONFIRMED' && canApprove && (
        <Button icon="check" label={`${senior.preferredName} got there`} onPress={run(() => api.complete(action._id, me._id))} />
      )}
    </Card>
  );
}

function Detail({ label, value }) {
  return (
    <View style={st.detail}>
      <Text style={st.detailLabel}>{label}</Text>
      <Text style={st.detailValue}>{value}</Text>
    </View>
  );
}

// ---------- Care ----------
function Care({ senior, state, me, run, circle, openTasks }) {
  const [newTask, setNewTask] = useState('');
  const tasks = state.tasks.filter((t) => t.seniorId === senior._id);
  const name = (id) => state.members.find((m) => m._id === id)?.name.split(' ')[0] ?? 'Someone';
  const share = circle.map((m) => ({ m, n: tasks.filter((t) => t.status === 'done' && t.assignee === m._id).length }));
  const max = Math.max(1, ...share.map((x) => x.n));
  const about = senior.about.join(' ').toLowerCase();
  const events = state.events.filter((e) => e.tags.some((t) => about.includes(t)) || e.tags.includes('social'));

  const add = () => {
    if (!newTask.trim()) return;
    run(() => api.addTask({ seniorId: senior._id, title: newTask.trim() }))();
    setNewTask('');
  };

  return (
    <>
      <Section title={`Open tasks · ${openTasks.length}`}>
        {openTasks.length === 0 && <Row icon="checkCircle" iconTone="ok" title="Nothing open" sub="Add something below." />}
        {openTasks.map((t) => <TaskRow key={t._id} t={t} me={me} run={run} name={name} senior={senior} />)}
        <View style={st.addRow}>
          <TextInput style={st.addInput} value={newTask} onChangeText={setNewTask} placeholder="Add a task, like ‘Drop off soup’" placeholderTextColor={color.muted} returnKeyType="done" onSubmitEditing={add} accessibilityLabel="New task" />
          <Button small icon="plus" label="Add" onPress={add} disabled={!newTask.trim()} />
        </View>
      </Section>

      <Section title="Who’s been helping this month">
        {share.map(({ m, n }) => (
          <View key={m._id} style={st.shareRow} accessible accessibilityLabel={`${m.name}: ${n} tasks`}>
            <Avatar name={m.name} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={st.shareTop}>
                <Text style={st.shareName}>{m.name.split(' ')[0]}</Text>
                <Text style={st.shareN}>{n} done</Text>
              </View>
              <View style={st.shareBar}><View style={[st.shareFill, { width: `${Math.max(4, (n / max) * 100)}%` }]} /></View>
            </View>
          </View>
        ))}
      </Section>

      <Section title="Get her out of the house" footer="Matched to what she enjoys. Offering a ride adds it to care tasks.">
        {events.map((e) => (
          <Row
            key={e._id}
            icon="sparkle"
            title={e.title}
            sub={`${e.when} · ${e.where}`}
            right={<Button small label="Offer a ride" onPress={run(() => api.addTask({ seniorId: senior._id, title: `Ride to ${e.title.toLowerCase()} (${e.when})`, type: 'ride', due: e.when }))} />}
          />
        ))}
      </Section>
    </>
  );
}

function TaskRow({ t, me, run, name, senior }) {
  const ho = t.handoff?.status === 'pending' ? t.handoff : null;
  const who = t.requestedBy === 'peggy' || t.source === 'checkin' ? senior.preferredName : t.requestedBy ? name(t.requestedBy) : null;
  const suggested = !t.assignee && t.suggestedOwner ? t.suggestedOwner : null;
  const mine = t.assignee === me;

  let status;
  if (ho && ho.to === me) status = <Status label={`${name(ho.from)} asked you`} tone="attention" />;
  else if (ho) status = <Status label={`Asked ${name(ho.to)}`} tone="neutral" />;
  else if (t.assignee) status = <Status label={mine ? 'You have it' : `${name(t.assignee)} has it`} tone="ok" />;
  else status = <Status label="Nobody yet" tone="attention" />;

  let buttons;
  if (ho && ho.to === me) {
    buttons = (
      <>
        <Button small variant="solid" label="Accept" onPress={run(() => api.accept(t._id, me))} />
        <Button small label="Decline" onPress={run(() => api.decline(t._id, me))} />
      </>
    );
  } else if (ho) {
    buttons = null;
  } else if (t.assignee) {
    buttons = <Button small icon="check" label="Mark done" onPress={run(() => api.done(t._id))} />;
  } else {
    buttons = (
      <>
        <Button small label="I’ll do it" onPress={run(() => api.claim(t._id, me))} />
        {suggested && suggested !== me && (
          <Button small label={`Ask ${name(suggested)}`} onPress={run(() => api.handoff(t._id, me, suggested))} />
        )}
      </>
    );
  }

  const meta = [t.due, suggested ? `Suggested: ${suggested === me ? 'you' : name(suggested)}` : null].filter(Boolean).join(' · ');

  return (
    <Row icon={TASK_ICON[t.type] || 'bag'} iconTone={t.assignee ? 'ok' : 'neutral'} title={t.title} sub={meta || null}>
      <View style={{ marginLeft: 48, gap: 8 }}>
        {t.quote && who ? <Text style={st.quoteSmall}>{who} said “{t.quote}”</Text> : null}
        {status}
        {buttons ? <View style={st.btnRow}>{buttons}</View> : null}
      </View>
    </Row>
  );
}

// ---------- Stories ----------
function Stories({ senior, checkins }) {
  const stories = checkins.flatMap((c) => (c.stories || []).map((s) => ({ ...s, at: c.endedAt })));
  return (
    <Section title={`${senior.preferredName}’s stories`} footer="Saved from her calls, for the whole family.">
      {stories.length === 0 && <Row icon="book" title={<P muted>Stories she tells on her calls are saved here.</P>} />}
      {stories.map((s, i) => (
        <Row key={i} icon="book" title={s.title} sub={ago(s.at)}>
          <Text style={[st.quote, { marginLeft: 48 }]}>{s.text}</Text>
        </Row>
      ))}
    </Section>
  );
}

// ---------- Circle ----------
function Circle({ state, circle }) {
  const texts = state.notifications.filter((n) => circle.some((m) => m._id === n.toId)).slice(0, 8);
  return (
    <>
      <Section title="The circle">
        {circle.map((m) => (
          <Row
            key={m._id}
            title={<View style={st.memberTop}><Avatar name={m.name} /><View style={{ flex: 1 }}><Text style={st.cardTitle}>{m.name}</Text><Meta>{m.relation}</Meta></View></View>}
            right={
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={st.clock}>{localTime(m.timezone)}</Text>
                {!isAwake(m.timezone) && <Meta>asleep</Meta>}
              </View>
            }
          />
        ))}
      </Section>
      <Section title="Texts sent by Porchlight">
        {texts.length === 0 && <Row icon="message" title={<P muted>When Porchlight needs the circle, the texts it sends show up here.</P>} />}
        {texts.map((n, i) => (
          <Row key={i} icon="message" title={`To ${n.to.split(' ')[0]}`} sub={ago(n.at)}>
            <P style={{ marginLeft: 48 }}>{n.text}</P>
          </Row>
        ))}
      </Section>
    </>
  );
}

const st = StyleSheet.create({
  tabs: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  pad: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 56, gap: 22 },

  hero: { gap: 16, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroTitle: { fontFamily: font.display, fontSize: 23, lineHeight: 27, color: color.ink, letterSpacing: -0.2 },
  heroSub: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.muted },
  facts: { flexDirection: 'row', gap: 8 },
  fact: { flex: 1, padding: 12, gap: 2 },
  factLabel: { fontFamily: font.body, fontSize: 12, color: color.muted },
  factValue: { fontFamily: font.bodyBold, fontSize: 15, lineHeight: 20, color: color.ink },

  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepMark: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color.muted },
  stepText: { flex: 1, fontFamily: font.body, fontSize: 16, color: color.mutedOnDusk },
  stepWhen: { fontFamily: font.body, fontSize: 13, color: color.muted },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 22, color: color.ink },
  quote: { fontFamily: font.bodyItalic, fontSize: 16, lineHeight: 23, color: color.mutedOnDusk },
  quoteSmall: { fontFamily: font.bodyItalic, fontSize: 15, lineHeight: 21, color: color.mutedOnDusk },
  detail: { flexDirection: 'row', gap: 12 },
  detailLabel: { width: 56, fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.muted },
  detailValue: { flex: 1, fontFamily: font.bodyBold, fontSize: 15, lineHeight: 20, color: color.ink },
  steps: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.line },
  stepLabel: { flex: 1, fontFamily: font.body, fontSize: 12, color: color.muted },
  btnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  week: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  weekDay: { alignItems: 'center', gap: 8 },
  weekDot: { width: 22, height: 22, borderRadius: 11 },
  weekLabel: { fontFamily: font.bodyBold, fontSize: 12, color: color.muted },
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6 },

  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12 },
  addInput: { flex: 1, minHeight: 42, backgroundColor: color.surface2, borderRadius: 10, paddingHorizontal: 12, fontFamily: font.body, fontSize: 16, color: color.ink },

  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.surface3, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.bodyBold, fontSize: 13, color: color.ink },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  shareTop: { flexDirection: 'row', justifyContent: 'space-between' },
  shareName: { fontFamily: font.bodyBold, fontSize: 15, color: color.ink },
  shareN: { fontFamily: font.body, fontSize: 14, color: color.muted },
  shareBar: { height: 6, borderRadius: 3, backgroundColor: color.surface2, overflow: 'hidden' },
  shareFill: { height: '100%', borderRadius: 3, backgroundColor: color.mutedOnDusk },

  memberTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clock: { fontFamily: font.bodyBold, fontSize: 15, color: color.ink, fontVariant: ['tabular-nums'] },
});
