import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { ago } from './useAppState';
import { Button, Card, Chip, Dot, Field, Heading, IconCircle, InfoList, List, Row, Screen, Section, Stats, Steps, T, Tabs } from './ui';
import { color, radius, space } from './theme';

const MOOD = { good: 'Cheerful', okay: 'Steady', low: 'A bit down' };

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
const STEPS = ['Needs OK', 'Approved', 'Requested', 'Confirmed'];
const STEP_INDEX = { PENDING_APPROVAL: 0, APPROVED: 1, REQUESTED: 2, CONFIRMED: 3, COMPLETED: 3 };
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

export default function FamilyScreen({ senior, state, me, run }) {
  const [tab, setTab] = useState('today');

  const circle = state.members.filter((m) => m.circleId === senior.circleId);
  const checkins = state.checkins.filter((c) => c.seniorId === senior._id && c.status === 'completed');
  const ctx = { senior, state, me, run, circle, checkins, latestTalk: checkins.find((c) => c.channel !== 'button') };

  return (
    <View style={{ flex: 1 }}>
      <View style={st.tabs}>
        <Tabs
          options={[{ id: 'today', label: 'Today' }, { id: 'care', label: 'Care' }, { id: 'stories', label: 'Stories' }, { id: 'circle', label: 'Circle' }]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <Screen>
        {tab === 'today' && <Today {...ctx} />}
        {tab === 'care' && <Care {...ctx} />}
        {tab === 'stories' && <Stories {...ctx} />}
        {tab === 'circle' && <Circle {...ctx} />}
      </Screen>
    </View>
  );
}

function Today({ senior, state, me, run, checkins, latestTalk }) {
  const latest = checkins[0];
  const escalation = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'active');
  const lastResolved = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'resolved');
  const scamFlags = [
    ...(latestTalk?.flags || []).filter((f) => f.type === 'scam').map((f) => ({ text: f.text, at: latestTalk.endedAt })),
    ...state.scamChecks.filter((x) => x.seniorId === senior._id && x.verdict !== 'probably fine').map((x) => ({ text: x.description, at: x.createdAt })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 2);
  const otherFlags = (latestTalk?.flags || []).filter((f) => f.type !== 'scam');
  const week = checkins.filter((c) => c.channel !== 'button').slice(0, 7).reverse();
  const isHelp = escalation?.reason === 'help';
  const meMember = state.members.find((m) => m._id === me);
  const actions = (state.actions || []).filter((a) => a.seniorId === senior._id && a.status !== 'COMPLETED');
  const appointments = (state.appointments || [])
    .filter((a) => a.seniorId === senior._id && new Date(a.startsAt).getTime() > Date.now() - 3600000)
    .sort((a, b) => (a.startsAt > b.startsAt ? 1 : -1));

  const headline =
    escalation ? (isHelp ? `${senior.preferredName} pressed her help button` : `${senior.preferredName}’s check-in is unresolved`)
    : senior.status === 'talking' ? `${senior.preferredName} is talking with Porchlight`
    : latest && new Date(latest.endedAt).toDateString() === new Date().toDateString() ? `${senior.preferredName} checked in ${ago(latest.endedAt)}`
    : `Waiting for ${senior.preferredName}’s ${senior.checkinTime} check-in`;

  const needsYou = actions.length + scamFlags.length + otherFlags.length > 0;

  return (
    <>
      <Card flush tone={isHelp ? 'urgent' : 'hero'} accessibilityLiveRegion="polite">
        <View style={st.heroBody}>
          <View style={st.heroTop}>
            <Lamp state={lampState(senior)} size={72} label={headline} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="title" accessibilityRole="header">{headline}</T>
              {state.digest?.line ? <T v="caption" tone="soft">{state.digest.line}</T> : null}
            </View>
          </View>
          {escalation ? (
            <View style={{ gap: 12 }}>
              {!isHelp && <T tone="soft">She may just be out or asleep. Porchlight is working down the list below.</T>}
              <View style={{ gap: 10 }}>
                {escalation.steps.map((s, i) => {
                  const done = s.status === 'done';
                  return (
                    <View key={i} style={st.ladder}>
                      <View style={[st.ladderMark, done && { backgroundColor: isHelp ? color.brick : color.lamp, borderColor: isHelp ? color.brick : color.lamp }]} />
                      <T tone={done ? 'ink' : 'soft'} style={{ flex: 1 }}>{s.label}</T>
                      <T v="caption" tone="soft">{done ? `sent ${ago(s.at)}` : s.status === 'held' ? 'held for quiet hours' : 'next'}</T>
                    </View>
                  );
                })}
              </View>
              <Button variant="primary" label={`I reached ${senior.preferredName}, she’s okay`} onPress={run(() => api.resolve(senior._id, me))} />
            </View>
          ) : latest ? (
            <T>{latest.summary}</T>
          ) : null}
          {!escalation && lastResolved && Date.now() - new Date(lastResolved.resolvedAt).getTime() < 3600000 && (
            <T v="caption" tone="soft">Earlier alert resolved by {lastResolved.resolvedBy}, {ago(lastResolved.resolvedAt)}.</T>
          )}
        </View>
        {!escalation && (
          <Stats
            bare
            items={[
              { label: 'Mood', value: latest?.mood ? MOOD[latest.mood] : '—' },
              { label: 'Pills', value: medLabel(latest) ?? '—' },
              { label: 'Next call', value: senior.checkinTime },
            ]}
          />
        )}
      </Card>

      {needsYou && (
        <Section label="Needs you">
          {actions.map((a) => <ActionCard key={a._id} action={a} state={state} me={meMember} run={run} senior={senior} />)}
          {scamFlags.map((f, i) => (
            <Card key={`s${i}`} tone="urgent">
              <View style={st.cardHead}>
                <Heading tone="brick" style={{ flex: 1 }}>Possible scam</Heading>
                <Chip label={ago(f.at)} tone="urgent" />
              </View>
              <T v="quote">“{f.text}”</T>
              <T tone="soft">Porchlight told her not to send anything. Worth a call today to make sure she didn’t share any details.</T>
            </Card>
          ))}
          {otherFlags.map((f, i) => (
            <Card key={`f${i}`} tone={f.type === 'urgent' ? 'urgent' : 'default'}>
              <Heading tone={f.type === 'urgent' ? 'brick' : 'ink'}>{f.type === 'urgent' ? 'Needs attention now' : f.type === 'lonely' ? 'She sounded lonely' : 'Different from usual'}</Heading>
              <T v="quote">“{f.text}”</T>
            </Card>
          ))}
        </Section>
      )}

      {appointments.length > 0 && (
        <Section label="Coming up">
          <Card flush>
            <List inset={72}>
              {appointments.map((a) => {
                const [label, tone] = TRANSPORT[a.transport] ?? TRANSPORT.unknown;
                return (
                  <Row key={a._id} leading={<IconCircle name="calendar" />} title={a.title} sub={[when(a.startsAt), a.where].filter(Boolean).join(' · ')}>
                    <Chip label={label} tone={tone} style={{ marginTop: 6 }} />
                  </Row>
                );
              })}
            </List>
          </Card>
        </Section>
      )}

      <Section label="Things to talk about" footnote="From what she shared today. A real call beats any app.">
        <Card flush>
          <List>
            {latestTalk?.starters?.length
              ? latestTalk.starters.map((s) => <Row key={s}><T>{s}</T></Row>)
              : [<Row key="none"><T tone="muted">After her next chat, you’ll see ideas here for your own call.</T></Row>]}
          </List>
        </Card>
      </Section>

      {week.length > 0 && (
        <Section label="This week">
          <Card style={st.week}>
            {week.map((c) => (
              <View key={c._id} style={st.weekDay} accessible accessibilityLabel={`${new Date(c.endedAt).toLocaleDateString('en-US', { weekday: 'long' })}: ${MOOD[c.mood]}`}>
                <Dot tone={c.mood === 'good' ? 'attention' : c.mood === 'low' ? 'urgent' : 'neutral'} size={14} />
                <T v="small">{new Date(c.endedAt).toLocaleDateString('en-US', { weekday: 'short' })}</T>
                <T v="caption" tone="muted" style={{ fontSize: 12 }}>{MOOD[c.mood]}</T>
              </View>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}

function ActionCard({ action, state, me, run, senior }) {
  const approver = state.members.find((m) => m._id === action.approverId);
  const approverName = approver?.name.split(' ')[0] ?? 'the primary contact';
  const idx = STEP_INDEX[action.status] ?? 0;
  const ended = ENDED[action.status];
  const pending = action.status === 'PENDING_APPROVAL';
  const canApprove = Boolean(me?.canApprove);
  const last = action.history?.[action.history.length - 1];
  const d = action.details || {};

  return (
    <Card accessibilityLiveRegion="polite">
      <View style={st.cardHead}>
        <Heading style={{ flex: 1 }}>{action.title}</Heading>
        <Chip label={ended ?? (pending ? 'Needs your OK' : STEPS[idx])} tone={ended ? 'urgent' : pending ? 'attention' : idx >= 3 ? 'ok' : 'neutral'} />
      </View>
      {action.reason ? <T v="quote" tone="soft">{action.reason}</T> : null}
      <InfoList items={[['Pickup', when(d.pickupAt)], ['From', d.from], ['To', d.to], ['Note', d.needs]]} />
      {!ended && <Steps steps={STEPS} index={idx} tone={idx >= 3 ? 'ok' : 'attention'} />}

      {pending && (canApprove ? (
        <View style={st.btnRow}>
          <Button variant="primary" label="Approve ride" style={{ flex: 1 }} onPress={run(() => api.approve(action._id, me._id))} />
          <Button label="Not now" style={{ flex: 1 }} onPress={run(() => api.reject(action._id, me._id))} />
        </View>
      ) : (
        <T v="caption" tone="muted">Waiting for {approverName} to approve.</T>
      ))}
      {action.status === 'CONFIRMED' && canApprove && (
        <Button label={`${senior.preferredName} got there`} onPress={run(() => api.complete(action._id, me._id))} />
      )}
      {action.simulated && (
        <T v="caption" tone="muted" style={{ textAlign: 'center' }}>Simulated booking, not a real ride{last?.evidence?.ref ? ` · ref ${last.evidence.ref}` : ''}</T>
      )}
      {last?.evidence?.note && last.evidence.note !== 'Simulated booking, not a real ride' ? <T v="caption" tone="muted" style={{ textAlign: 'center' }}>{last.evidence.note}</T> : null}
    </Card>
  );
}

function Care({ senior, state, me, run, circle }) {
  const [newTask, setNewTask] = useState('');
  const tasks = state.tasks.filter((t) => t.seniorId === senior._id);
  const open = tasks.filter((t) => t.status === 'open');
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
      <Section label="Open tasks">
        <Card flush>
          <List>
            {open.length === 0
              ? [<Row key="none"><T tone="muted">Nothing open. Add something below.</T></Row>]
              : open.map((t) => <TaskRow key={t._id} t={t} me={me} run={run} name={name} senior={senior} />)}
            <View style={st.addRow}>
              <Field style={{ flex: 1 }} value={newTask} onChangeText={setNewTask} placeholder="Add a task, like ‘Drop off soup’" returnKeyType="done" onSubmitEditing={add} accessibilityLabel="New task" />
              <Button size="sm" label="Add" onPress={add} />
            </View>
          </List>
        </Card>
      </Section>

      <Section label="Who’s been helping this month">
        <Card>
          {share.map(({ m, n }) => (
            <View key={m._id} style={st.shareRow} accessible accessibilityLabel={`${m.name}: ${n} tasks`}>
              <T v="caption" style={{ width: 64, fontSize: 15 }}>{m.name.split(' ')[0]}</T>
              <View style={st.shareBar}><View style={[st.shareFill, { width: `${(n / max) * 100}%` }]} /></View>
              <T v="label" style={{ width: 20, textAlign: 'right' }}>{n}</T>
            </View>
          ))}
        </Card>
      </Section>

      {events.length > 0 && (
        <Section label="Get her out of the house" footnote="Matched to what she enjoys. Offering a ride adds it to care tasks.">
          <Card flush>
            <List>
              {events.map((e) => (
                <Row
                  key={e._id}
                  title={e.title}
                  sub={`${e.when} · ${e.where}`}
                  trailing={<Button size="sm" label="Offer a ride" onPress={run(() => api.addTask({ seniorId: senior._id, title: `Ride to ${e.title.toLowerCase()} (${e.when})`, type: 'ride', due: e.when }))} />}
                />
              ))}
            </List>
          </Card>
        </Section>
      )}
    </>
  );
}

function TaskRow({ t, me, run, name, senior }) {
  const ho = t.handoff?.status === 'pending' ? t.handoff : null;
  const who = t.requestedBy === 'peggy' || t.source === 'checkin' ? senior.preferredName : t.requestedBy ? name(t.requestedBy) : null;
  const suggested = !t.assignee && t.suggestedOwner ? t.suggestedOwner : null;

  let buttons;
  if (ho && ho.to === me) {
    buttons = (
      <View style={st.btnRow}>
        <Button size="sm" variant="primary" label="Accept" onPress={run(() => api.accept(t._id, me))} />
        <Button size="sm" label="Decline" onPress={run(() => api.decline(t._id, me))} />
      </View>
    );
  } else if (ho) {
    buttons = <T v="caption" tone="muted">Asked {name(ho.to)}, waiting for an answer</T>;
  } else if (t.assignee) {
    buttons = <View style={st.btnRow}><Button size="sm" label="Mark done" onPress={run(() => api.done(t._id))} /></View>;
  } else {
    buttons = (
      <View style={st.btnRow}>
        <Button size="sm" variant="primary" label="I’ll do it" onPress={run(() => api.claim(t._id, me))} />
        {suggested && suggested !== me && (
          <Button size="sm" label={`Ask ${name(suggested)}`} onPress={run(() => api.handoff(t._id, me, suggested))} />
        )}
      </View>
    );
  }

  const meta = [
    t.due,
    t.assignee ? `${t.assignee === me ? 'You have' : `${name(t.assignee)} has`} it` : null,
    ho && ho.to === me ? `${name(ho.from)} asked you` : null,
    suggested ? `Suggested: ${suggested === me ? 'you' : name(suggested)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={st.task}>
      <View style={st.cardHead}>
        <T v="bodyBold" style={{ flex: 1 }}>{t.title}</T>
        {t.sensitive && <Chip label="Private" />}
      </View>
      {t.quote && who ? <T v="quote" tone="soft">{who} said: “{t.quote}”</T> : null}
      {meta ? <T v="caption" tone="muted">{meta}</T> : null}
      <View style={{ marginTop: 6 }}>{buttons}</View>
    </View>
  );
}

function Stories({ senior, checkins }) {
  const stories = checkins.flatMap((c) => (c.stories || []).map((s) => ({ ...s, at: c.endedAt })));
  return (
    <Section label={`${senior.preferredName}’s stories`} footnote="Saved from her calls, for the whole family.">
      <Card flush>
        <List inset={72}>
          {stories.length === 0
            ? [<Row key="none"><T tone="muted">Stories she tells on her calls are saved here.</T></Row>]
            : stories.map((s, i) => (
              <Row key={i} leading={<IconCircle name="book" />} title={s.title} style={{ alignItems: 'flex-start' }}>
                <T v="quote" style={{ fontSize: 17, lineHeight: 25 }}>{s.text}</T>
                <T v="caption" tone="muted">{ago(s.at)}</T>
              </Row>
            ))}
        </List>
      </Card>
    </Section>
  );
}

function Circle({ state, circle }) {
  const texts = state.notifications.filter((n) => circle.some((m) => m._id === n.toId)).slice(0, 8);
  return (
    <>
      <Section label="The circle">
        <Card flush>
          <List inset={72}>
            {circle.map((m) => {
              const awake = isAwake(m.timezone);
              return (
                <Row
                  key={m._id}
                  leading={<IconCircle name="user" />}
                  title={m.name}
                  sub={m.relation}
                  trailing={<T v="caption" tone={awake ? 'soft' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>{localTime(m.timezone)}{awake ? '' : ' · asleep'}</T>}
                />
              );
            })}
          </List>
        </Card>
      </Section>
      <Section label="Texts sent by Porchlight">
        <Card flush>
          <List inset={72}>
            {texts.length === 0
              ? [<Row key="none"><T tone="muted">When Porchlight needs the circle, the texts it sends show up here.</T></Row>]
              : texts.map((n, i) => (
                <Row key={i} leading={<IconCircle name="message" />} style={{ alignItems: 'flex-start' }}>
                  <T v="caption" tone="muted">To {n.to.split(' ')[0]}, {ago(n.at)}</T>
                  <T>{n.text}</T>
                </Row>
              ))}
          </List>
        </Card>
      </Section>
    </>
  );
}

const st = StyleSheet.create({
  tabs: { paddingHorizontal: space.screen, paddingTop: 8 },
  heroBody: { padding: space.card + 4, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ladder: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ladderMark: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: color.soft },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  btnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  week: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekDay: { alignItems: 'center', gap: 4, minWidth: 60, paddingVertical: 10, borderRadius: radius.control, backgroundColor: color.raised },
  task: { padding: space.card, gap: 4 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: color.raised, overflow: 'hidden' },
  shareFill: { height: '100%', borderRadius: 4, backgroundColor: color.soft },
});
