// Demo data. Every person and organization here is fictional sample data.
import * as store from './store.js';

const daysAgo = (n, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 5, 0, 0);
  return d.toISOString();
};

export async function seed() {
  await store.clearAll();

  const circleId = 'hollis';
  const members = [
    { _id: 'anne', circleId, name: 'Anne Hollis', relation: 'Daughter', role: 'family', phone: '+15550100001', timezone: 'America/Los_Angeles', primary: true },
    { _id: 'mark', circleId, name: 'Mark Hollis', relation: 'Son', role: 'family', phone: '+15550100002', timezone: 'America/New_York' },
    { _id: 'dolores', circleId, name: 'Dolores Kim', relation: 'Neighbor, next door', role: 'neighbor', phone: '+15550100003', timezone: 'America/New_York' },
    { _id: 'sam', circleId: null, name: 'Sam Ortiz', relation: 'Volunteer, sample reassurance program', role: 'volunteer', phone: '+15550100004', timezone: 'America/New_York' },
  ];
  for (const m of members) await store.insert('members', m);

  const peggy = await store.insert('seniors', {
    _id: 'peggy',
    circleId,
    name: 'Margaret Hollis',
    preferredName: 'Peggy',
    age: 81,
    city: 'State College, PA',
    phone: process.env.DEMO_SENIOR_PHONE || '+15550100009',
    checkinTime: '10:00',
    primaryContactName: 'Anne',
    opener: 'Hi Mom, it’s Anne. This is the helper I told you about.',
    about: [
      'Widowed; her husband Walt passed in 2021.',
      'Grows tomatoes and roses, does the crossword every morning.',
      'Loves big band music.',
      'Granddaughter Maya is a sophomore at Penn State.',
      'Stopped driving last spring.',
    ],
    meds: [
      { name: 'blood pressure pill', when: 'morning' },
      { name: 'vitamin D', when: 'morning' },
    ],
    status: 'waiting',
  });

  const others = [
    ['frank', 'Frank Delgado', 'Frank', 88, 'ok', 'Talked about the Penn State game. Took his pills.'],
    ['ruth', 'Ruth Abernathy', 'Ruth', 79, 'needs-human', 'Said she has felt lonely since her friend moved away. Asked if someone could visit.'],
    ['george', 'George Patel', 'George', 84, 'missed', 'Did not answer two calls this morning.'],
    ['elaine', 'Elaine Morrow', 'Elaine', 91, 'ok', 'Cheerful. Her daughter is visiting this weekend.'],
    ['harold', 'Harold Bishop', 'Harold', 76, 'scam', 'Got a call saying his grandson was in jail and needed bail in gift cards.'],
    ['jean', 'Jean Kowalski', 'Jean', 83, 'waiting', 'Check-in scheduled for 2:00 PM.'],
  ];
  for (const [_id, name, preferredName, age, status, note] of others) {
    await store.insert('seniors', {
      _id, circleId: null, name, preferredName, age, city: 'State College, PA', status, lastNote: note,
      about: [], meds: [], primaryContactName: 'family', checkinTime: '10:00',
    });
  }

  const history = [
    {
      at: daysAgo(3), mood: 'good',
      summary: 'Peggy sounded cheerful and talked about her tomatoes and the crossword. Took her pills.',
      stories: [{ title: 'The tomato contest', text: 'Walt and I used to enter the county fair every August. He always said my tomatoes were the reason we won, but it was his pie.' }],
    },
    {
      at: daysAgo(2), mood: 'okay',
      summary: 'Peggy was steady. She mentioned Maya has exams and that she misses going to church since she stopped driving.',
      stories: [],
    },
    {
      at: daysAgo(1), mood: 'good',
      summary: 'Peggy sounded happy and talked about big band music on the radio. Took her pills.',
      stories: [{ title: 'Dancing at the Elks lodge', text: 'When I was nineteen there was a band at the Elks lodge every Saturday. That’s where I met Walt. He stepped on my feet all night.' }],
    },
  ];
  for (const h of history) {
    await store.insert('checkins', {
      seniorId: peggy._id, channel: 'phone', status: 'completed', startedAt: h.at, endedAt: h.at,
      transcript: [], summary: h.summary, mood: h.mood, medsTaken: true, flags: [],
      starters: [], stories: h.stories, requests: [],
    });
  }

  const tasks = [
    { title: 'Pick up blood pressure refill at the pharmacy', type: 'refill', due: 'Thursday', assignee: null, status: 'open' },
    { title: 'Fix the loose porch step', type: 'repair', due: 'This weekend', assignee: 'mark', status: 'open' },
  ];
  const done = [['anne', 6], ['dolores', 3], ['mark', 1]];
  for (const t of tasks) await store.insert('tasks', { seniorId: peggy._id, source: 'family', ...t });
  for (const [who, n] of done) {
    for (let i = 0; i < n; i++) {
      await store.insert('tasks', { seniorId: peggy._id, title: 'Earlier task', type: 'errand', assignee: who, status: 'done', source: 'history', hidden: true });
    }
  }

  const events = [
    { title: 'Chair yoga', where: 'Community center (sample)', when: 'Tuesdays, 10 AM', tags: ['exercise'] },
    { title: 'Garden club', where: 'Public library (sample)', when: 'Thursdays, 2 PM', tags: ['garden', 'tomato', 'roses'] },
    { title: 'Lunch and cards', where: 'Senior center (sample)', when: 'Fridays, noon', tags: ['social', 'lonely'] },
    { title: 'Big band night', where: 'Downtown bandshell (sample)', when: 'Saturday, 6 PM', tags: ['music', 'band'] },
  ];
  for (const e of events) await store.insert('events', e);

  console.log('[seed] Demo data loaded.');
}
