// The prediction ledger (Phase L1 — the Learning Seed).
//
// An APPEND-ONLY record of what the tool predicted, written AT DECISION TIME.
// Draft night is its first big harvest; if it is not wired before then, that
// data is gone forever. The single rule that makes it trustworthy as future
// training data is the CONTAMINATION RULE: writes happen only at decision time,
// from this module's append() path; grading and analysis may READ, never write.
// A prediction logged before the outcome is known cannot be bent to fit it.
//
// Storage is one Blob key PER ENTRY (`pred:<season>:<seq>`), never one growing
// document. That makes every write a fresh key — genuinely append-only, with no
// read-modify-write race when survival estimates and picks fire in quick
// succession on the clock. Reads list the prefix and sort by seq.
//
// Kinds captured (from the spec): 'recommendation' (board context + what was
// recommended), 'pick' (what I actually took — a SEPARATE later entry, joined
// by pick number, so the recommendation is never mutated after the fact),
// 'survival', 'override', 'lrm', 'run'.

const KINDS = ['recommendation', 'pick', 'survival', 'override', 'lrm', 'run'];

function seqKey(season, seq) {
  // Zero-padded so lexical key order equals numeric order for cheap listing.
  return `pred:${season}:${String(seq).padStart(9, '0')}`;
}
function counterKey(season) {
  return `pred-seq:${season}`;
}

// --- pure core (unit-testable without a store) ------------------------------

/**
 * Build a validated ledger entry. `nowIso` is the SERVER decision-time clock —
 * the authority for when the prediction was made, never the client's. The entry
 * is frozen so a later reader cannot mutate a recorded prediction in place.
 */
function buildEntry(raw, { nowIso, seq }) {
  if (!raw || typeof raw !== 'object') throw new Error('ledger entry must be an object');
  const kind = String(raw.kind || '');
  if (KINDS.indexOf(kind) < 0) throw new Error(`unknown ledger kind: ${kind || '(none)'}`);
  if (raw.season == null) throw new Error('ledger entry needs a season');
  const entry = {
    id: `${raw.season}-${String(seq).padStart(9, '0')}`,
    seq,
    kind,
    // The method/model version that PRODUCED this prediction. Grading reads it so
    // a mid-season model upgrade never blurs the record: the lightweight LRM logs
    // as 'survival-snapshot-v0', distinct from a future real 'lrm-v1', and every
    // kind carries its own version. Defaults to kind-v0 if a caller omits it, so
    // an untagged entry is conservatively marked as un-versioned, never blank.
    method: String(raw.method || `${kind}-v0`),
    season: String(raw.season),
    // decision_at is stamped by the server, NOT taken from the client, so a
    // replayed or backdated client cannot forge the moment of decision.
    decision_at: nowIso,
    // client_at is kept only as provenance, clearly labelled as untrusted.
    client_at: raw.client_at || null,
    pick: raw.pick == null ? null : Number(raw.pick),
    build_at: raw.build_at || null,     // which board build this prediction was made against
    payload: raw.payload == null ? {} : raw.payload,
  };
  return Object.freeze(entry);
}

/** Append-only invariant: a computed key must never already exist. */
function assertFreshKey(existingKeys, key) {
  if (existingKeys && existingKeys.indexOf(key) >= 0) {
    throw new Error(`ledger append would overwrite ${key} — refusing (append-only)`);
  }
}

// --- store-aware API (used by the decision-time route only) -----------------

async function nextSeq(store, season) {
  // A dedicated counter doc; if it is ever lost, fall back to the max existing
  // key so we never reuse a seq and clobber an entry.
  const ck = counterKey(season);
  let cur = await store.get(ck);
  if (cur == null) {
    const keys = await store.listKeys(`pred:${season}:`);
    cur = keys.reduce((m, k) => Math.max(m, Number(k.split(':').pop()) || 0), 0);
  }
  const next = Number(cur) + 1;
  await store.set(ck, next);
  return next;
}

/**
 * Append one prediction at decision time. THE ONLY WRITE PATH. `now` is
 * injectable for tests; in production it is the server clock.
 */
async function append(store, raw, { now } = {}) {
  const nowIso = (now ? new Date(now) : new Date()).toISOString();
  if (raw == null || raw.season == null) throw new Error('ledger entry needs a season');
  const season = String(raw.season);
  // Validate BEFORE consuming a seq, so a rejected entry never burns a number
  // and leaves a gap. buildEntry runs twice (once to validate, once with the
  // real seq) — cheap, and it keeps the seq stream tight.
  buildEntry(raw, { nowIso, seq: 0 });
  const seq = await nextSeq(store, season);
  const entry = buildEntry(raw, { nowIso, seq });
  const key = seqKey(season, seq);
  const existing = await store.listKeys(`pred:${season}:`);
  assertFreshKey(existing, key);
  await store.set(key, entry);
  return entry;
}

/**
 * Read the whole ledger for a season, sorted by seq. READ-ONLY — this is the
 * path grading and verification use, and it performs no writes, ever.
 */
async function readAll(store, season) {
  const keys = (await store.listKeys(`pred:${String(season)}:`)).slice().sort();
  const rows = await store.getMany(keys);
  return rows.filter(Boolean).sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

module.exports = {
  KINDS, seqKey, counterKey, buildEntry, assertFreshKey,
  nextSeq, append, readAll,
};
