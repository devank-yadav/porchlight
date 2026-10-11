// F04 audit trail: who did what, to what, when, and with what result.
import * as store from '../store.js';

export function log(actor, action, { seniorId = 'peggy', targetId = null, outcome = 'ok', detail = '' } = {}) {
  return store.insert('audit', { actor, action, seniorId, targetId, outcome, detail, at: new Date().toISOString() });
}
