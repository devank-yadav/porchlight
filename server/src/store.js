// Tiny data layer: MongoDB when MONGODB_URI is set, in-memory otherwise.
// Every document uses a string _id so both backends behave the same.
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';

const COLLECTIONS = ['seniors', 'members', 'checkins', 'tasks', 'escalations', 'events', 'scamChecks'];

let db = null;
const mem = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

export async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[store] No MONGODB_URI set, using in-memory store (data resets on restart).');
    return 'memory';
  }
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'porchlight');
  console.log('[store] Connected to MongoDB.');
  return 'mongo';
}

export const newId = () => randomUUID();

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
  else mem[coll].push(structuredClone(full));
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
  return structuredClone(d);
}

export async function clearAll() {
  for (const c of COLLECTIONS) {
    if (db) await db.collection(c).deleteMany({});
    else mem[c] = [];
  }
}
