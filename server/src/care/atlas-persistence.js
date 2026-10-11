// Run from the repo root: node server/src/care/atlas-persistence.js
// Uses separate processes; never seeds or resets the database.
import '../env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import * as store from '../store.js';

const run = promisify(execFile);
const kind = 'atlas_persistence_probe';
const [mode, id] = process.argv.slice(2);

async function worker() {
  assert.match(id || '', /^atlas-probe-[0-9a-f-]{36}$/);
  assert.ok(['write', 'read', 'cleanup'].includes(mode), 'Unknown probe operation.');
  if (mode === 'cleanup') {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    try {
      await client.connect();
      await client.db(process.env.MONGODB_DB || 'porchlight').collection('audit')
        .deleteOne({ _id: id, kind });
    } finally {
      await client.close();
    }
    console.log('Removed this probe record.');
    return;
  }
  try {
    assert.equal(await store.connect(), 'mongo', 'Atlas is unavailable; memory fallback cannot prove persistence.');
    if (mode === 'write') {
      await store.insert('audit', { _id: id, kind, sample: true, result: 'written_before_restart' });
      await store.update('audit', id, { result: 'updated_before_restart' });
      console.log('Wrote and updated one temporary sample audit record.');
    } else {
      const saved = await store.get('audit', id);
      assert.ok(saved, 'The record did not survive the process restart.');
      assert.equal(saved.kind, kind);
      assert.equal(saved.result, 'updated_before_restart');
      const rows = await store.list('audit', { _id: id });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].result, saved.result);
      console.log('A new process read the saved record through the app store.');
    }
  } finally {
    await store.disconnect();
  }
}

async function probe() {
  assert.ok(process.env.MONGODB_URI, 'Set MONGODB_URI in the repo-root .env first.');
  const probeId = `atlas-probe-${randomUUID()}`;
  const script = fileURLToPath(import.meta.url);
  const step = async (operation) => {
    try {
      const { stdout } = await run(process.execPath, [script, operation, probeId], { timeout: 20000, windowsHide: true });
      process.stdout.write(stdout);
    } catch (error) {
      throw new Error(error.stderr?.trim() || `Atlas ${operation} operation failed.`);
    }
  };
  let failure;
  try {
    await step('write');
    await step('read');
  } catch (error) {
    failure = error;
  } finally {
    try {
      await step('cleanup');
    } catch (error) {
      console.error(`Cleanup failed. Only probe record ${probeId} may remain in audit.`);
      failure ||= error;
    }
  }
  if (failure) throw failure;
  console.log('PASS: MongoDB retained data across two independent app-store processes.');
}

try {
  if (mode) await worker();
  else await probe();
} catch (error) {
  // Driver messages can contain connection details; never print them.
  const reason = error.name === 'AssertionError' || error.constructor === Error
    ? error.message
    : `${error.name}${error.code ? ` (code ${error.code})` : ''}`;
  console.error(reason);
  process.exitCode = 1;
}
