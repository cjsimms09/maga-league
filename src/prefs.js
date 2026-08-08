/* A-1 — personal draft prefs that survive the phone/laptop divide.
 *
 * Targets, never list, queue, sliders, overrides and rail-acks lived only in
 * localStorage — per device. Prep happens on the desktop, the draft happens on
 * a phone, and Tuesday-night homework must not evaporate in between. So: the
 * server keeps one document per OWNER (same durable store as the ledger),
 * localStorage stays as the offline cache, and the newest stamp wins.
 *
 * This module is the pure logic (sanitize + merge) shared by the route and the
 * tests; the client mirrors the same merge rule in prefsync.js so both sides
 * always agree on who won.
 */
'use strict';

// The whitelist IS the schema: anything else posted is dropped, so the store
// can never be used to smuggle arbitrary payloads under my login.
const KEYS = ['lists', 'weights', 'autoWeights', 'playerOverrides', 'railAcks'];
const MAX_LIST = 400;        // player ids per list — far above real use, bounded anyway
const MAX_JSON = 200_000;    // whole-document ceiling

function sanitize(prefs) {
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  const out = {};
  if (p.lists && typeof p.lists === 'object') {
    out.lists = {};
    for (const k of ['targets', 'avoid', 'queue']) {
      if (Array.isArray(p.lists[k])) out.lists[k] = p.lists[k].slice(0, MAX_LIST).map(String);
    }
  }
  if (p.weights && typeof p.weights === 'object') {
    out.weights = {};
    for (const k of Object.keys(p.weights).slice(0, 24)) {
      const v = Number(p.weights[k]);
      if (isFinite(v)) out.weights[k] = v;
    }
  }
  if (typeof p.autoWeights === 'boolean') out.autoWeights = p.autoWeights;
  for (const k of ['playerOverrides', 'railAcks']) {
    if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) {
      const trimmed = {};
      for (const id of Object.keys(p[k]).slice(0, MAX_LIST)) trimmed[String(id)] = p[k][id];
      out[k] = trimmed;
    }
  }
  if (JSON.stringify(out).length > MAX_JSON) {
    throw new Error('prefs document too large');
  }
  return out;
}

/** Wrap prefs in a stamped doc. `at` is required — the caller owns the clock. */
function doc(prefs, at, device) {
  return { updated_at: at, device: String(device || '').slice(0, 40), prefs: sanitize(prefs) };
}

/**
 * Last-write-wins, whole-document. Field-level merging would silently weave two
 * half-sessions together; whole-doc keeps "what you see is one device's truth",
 * which is what the visible synced stamp promises.
 */
function merge(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return String(b.updated_at || '') >= String(a.updated_at || '') ? b : a;
}

const KEY = ownerId => `prefs:draft:${ownerId}`;

async function load(store, ownerId) {
  return store.get(KEY(ownerId), null);
}

/** Merge the incoming doc against what's stored; persist and return the winner. */
async function save(store, ownerId, incoming) {
  const current = await store.get(KEY(ownerId), null);
  const winner = merge(current, doc(incoming.prefs, incoming.updated_at, incoming.device));
  await store.set(KEY(ownerId), winner);
  return winner;
}

module.exports = { KEYS, sanitize, doc, merge, load, save, KEY };
