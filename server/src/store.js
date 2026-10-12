// Tiny data layer: MongoDB when MONGODB_URI is set; otherwise in memory, saved to a local JSON file
// (server/data/porchlight.json) so accounts and history survive a restart.
// Every document uses a string _id so both backends behave the same.
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COLLECTIONS = [
  'seniors', 'members', 'checkins', 'tasks', 'escalations', 'events', 'scamChecks',
  'appointments', 'actions', 'preferences', 'audit', 'notices', 'doses',
  'accounts', 'sessions', 'codes', 'invites',
];

// Local file for the in-memory store. PERSIST_FILE=off keeps everything in memory only (tests, demo seed).
const here = path.dirname(fileURLToPath(import.meta.url));
function persistFile() {
  const v = process.env.PERSIST_FILE;
  if (v === 'off' || process.env.SEED_DEMO === '1') return null;
  return v ? path.resolve(v) : path.resolve(here, '../data/porchlight.json');
}
let file = null;
let saveTimer = null;
function load() {
  file = persistFile();
  if (!file || !fs.existsSync(file)) return;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const c of COLLECTIONS) mem[c] = Array.isArray(saved[c]) ? saved[c] : [];
    console.log(`[store] Loaded saved data from ${path.relative(process.cwd(), file)}.`);
  } catch (e) {
    console.warn(`[store] Couldn't read ${file} (${e.message}); starting empty.`);
  }
}
function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!file || db) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(mem), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function changed() {
  if (!file || db || saveTimer) return;
  saveTimer = setTimeout(() => { try { writeNow(); } catch (e) { console.warn('[store] save failed:', e.message); } }, 200);
}
process.on('exit', () => { if (saveTimer) try { writeNow(); } catch {} });
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => process.exit(0));

let db = null;
let client = null;
const mem = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

export async function disconnect() {
  const previous = client;
  client = null;
  db = null;
  if (previous) await previous.close();
}

export async function connect() {
  await disconnect();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    load();
    console.log(file ? '[store] No MONGODB_URI set: saving to a local file.' : '[store] In-memory store (data resets on restart).');
    return 'memory';
  }
  // A bad URI or campus Wi-Fi blocking Atlas must never take the demo down: fall back to memory.
  let candidate;
  try {
    candidate = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await candidate.connect();
    db = candidate.db(process.env.MONGODB_DB || 'porchlight');
    client = candidate;
    await Promise.all([
      db.collection('accounts').createIndex({ phone: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ tokenHash: 1 }),
      db.collection('invites').createIndex({ code: 1 }),
    ]).catch((e) => console.warn('[store] index setup:', e.codeName || e.name));
    console.log('[store] Connected to MongoDB.');
    return 'mongo';
  } catch (e) {
    // Driver messages may contain connection details. Log only the error category/code.
    console.warn(`[store] MongoDB unavailable (${e.name}${e.code ? `, code ${e.code}` : ''}); using in-memory store instead.`);
    if (candidate) await candidate.close().catch(() => {});
    db = null;
    load();
    return 'memory';
  }
}

export const newId = () => randomUUID();
export const usingMongo = () => Boolean(db);

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([k, v]) => doc[k] === v);
}

export async function list(coll, filter = {}, { sort, limit } = {}) {
  let rows;
  if (db) {
    let cur = db.collection(coll).find(filter);
    if (sort) cur = cur.sort(sort);
    if (limit) cur = cur.limit(limit);
    rows = await cur.toArray();
  } else {
    rows = mem[coll].filter((d) => matches(d, filter));
    if (sort) {
      const [[key, dir]] = Object.entries(sort);
      rows = [...rows].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
    }
    if (limit) rows = rows.slice(0, limit);
    rows = structuredClone(rows);
  }
  return rows;
}

export async function get(coll, id) {
  if (db) return db.collection(coll).findOne({ _id: id });
  const d = mem[coll].find((x) => x._id === id);
  return d ? structuredClone(d) : null;
}

export async function insert(coll, doc) {
  const full = { _id: newId(), createdAt: new Date().toISOString(), ...doc };
  if (db) await db.collection(coll).insertOne(full);
  else { mem[coll].push(structuredClone(full)); changed(); }
  return full;
}

export async function update(coll, id, patch) {
  if (db) {
    await db.collection(coll).updateOne({ _id: id }, { $set: patch });
    return get(coll, id);
  }
  const d = mem[coll].find((x) => x._id === id);
  if (!d) return null;
  Object.assign(d, structuredClone(patch));
  changed();
  return structuredClone(d);
}

export async function remove(coll, id) {
  if (db) await db.collection(coll).deleteOne({ _id: id });
  else { mem[coll] = mem[coll].filter((x) => x._id !== id); changed(); }
}

// Delete every document matching an equality filter (account deletion, sign-out everywhere).
export async function removeWhere(coll, filter) {
  if (db) await db.collection(coll).deleteMany(filter);
  else { mem[coll] = mem[coll].filter((d) => !matches(d, filter)); changed(); }
}

export async function clearAll() {
  for (const c of COLLECTIONS) {
    if (db) await db.collection(c).deleteMany({});
    else mem[c] = [];
  }
  changed();
}
