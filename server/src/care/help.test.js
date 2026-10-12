// "I need help": the family gets where they are and what Porchlight knows; "I'm on it" stops the ladder.
process.env.PERSIST_FILE = 'off';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.js';
import * as escalation from './escalation.js';
import { helpContext, helpText, helpSpoken } from './help.js';
import { recentNotifications } from '../voice/notify.js';

test('a help press carries location and today’s context, medicines only for those allowed', async () => {
  await store.connect();
  await store.insert('seniors', { _id: 'h1', circleId: 'hc', preferredName: 'Rose', phone: '+15550400009', homeLatLng: '40.7934,-77.86', timezone: 'America/New_York', meds: [{ id: 'p1', name: 'Pill', times: ['00:00'] }], status: 'ok' });
  await store.insert('members', { _id: 'hm1', circleId: 'hc', name: 'Ann Lee', role: 'family', primary: true, seesMeds: true, phone: '+15550400001' });
  await store.insert('members', { _id: 'hm2', circleId: 'hc', name: 'Ben Lee', role: 'family', seesMeds: false, phone: '+15550400002' });
  await store.insert('checkins', { seniorId: 'h1', status: 'completed', summary: 'Rose sounded steady.', endedAt: new Date().toISOString() });
  const senior = await store.get('seniors', 'h1');

  const ctx = await helpContext(senior, { lat: 40.7935, lng: -77.8601, accuracy: 12, address: '12 Main St, State College' });
  assert.equal(ctx.nearHome, true);
  assert.match(ctx.location.mapUrl, /^https:\/\/maps\.apple\.com\/\?ll=40\.7935,-77\.8601/);
  assert.equal(ctx.lastCall.summary, 'Rose sounded steady.');
  assert.match(helpText(senior, ctx, { seesMeds: true }, senior.phone), /Pills today/);
  assert.doesNotMatch(helpText(senior, ctx, { seesMeds: false }, senior.phone), /Pills/);
  assert.match(helpSpoken(senior, ctx), /I need help.*at home.*call 9 1 1/s);
  assert.equal((await helpContext(senior, { lat: 'x' })).location, null, 'bad input is ignored');

  const esc = await escalation.start(senior, 'help', ctx);
  for (let i = 0; i < 50 && (await store.get('escalations', esc._id)).steps[0].status !== 'done'; i++) await new Promise((r) => setTimeout(r, 20));
  const sent = recentNotifications().filter((n) => ['Ann Lee', 'Ben Lee'].includes(n.to));
  assert.equal(sent.length, 2, 'the whole family is alerted at once');
  assert.ok(sent.every((n) => n.urgent && /maps\.apple\.com/.test(n.text)));

  assert.equal((await store.get('escalations', esc._id)).steps[1].again, true, 'the family is called again if no one is on it');
  const taken = await escalation.acknowledge('h1', await store.get('members', 'hm2'));
  assert.equal(taken.ack.name, 'Ben Lee');
  const [notice] = await store.list('notices', { seniorId: 'h1' });
  assert.match(notice.text, /Ben saw your alert/);
  assert.ok(recentNotifications().some((n) => n.to === 'Ann Lee' && /Ben is on it/.test(n.text)));
  assert.equal(await escalation.resolve('h1', 'Ben Lee'), 1);
  assert.equal((await store.get('escalations', esc._id)).status, 'resolved');
});
