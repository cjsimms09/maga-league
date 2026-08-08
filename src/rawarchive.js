// Raw-forever storage (Phase L2 — the Learning Seed).
//
// The complete draft and season, archived RAW and IMMUTABLE. Features recompute;
// raw is permanent — a metric invented in a 2028 backtest can only test against
// 2026 if the raw 2026 record still exists, byte for byte. So this store never
// mutates and never deletes: every snapshot is a fresh key, frozen on write.
//
// It differs from the prediction ledger (L1) in intent: the ledger records what
// the TOOL predicted at decision time; this records what actually HAPPENED — the
// full Sleeper pick stream (all ten teams, timestamped), the board build the
// draft ran on, the final draft, and later the weekly data and transactions.
//
// Dedup: re-archiving a byte-identical snapshot (a re-sync that changed nothing)
// is waste, not fidelity. A content hash lets us skip an unchanged snapshot
// while keeping every DISTINCT state. The ordered sequence of distinct snapshots
// IS the raw history.

const crypto = require('crypto');

const KINDS = ['draft_picks', 'board', 'draft_complete', 'weekly', 'transactions', 'lineups'];

function seqKey(season, kind, seq) {
  return `raw:${season}:${kind}:${String(seq).padStart(9, '0')}`;
}
function headKey(season, kind) {
  return `raw-head:${season}:${kind}`;      // {seq, hash} of the latest snapshot
}

function contentHash(payload) {
  // Stable stringify: sort object keys so hashing is order-independent.
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

// --- pure core --------------------------------------------------------------

function buildSnapshot(raw, { nowIso, seq, hash }) {
  if (!raw || typeof raw !== 'object') throw new Error('raw snapshot must be an object');
  const kind = String(raw.kind || '');
  if (KINDS.indexOf(kind) < 0) throw new Error(`unknown raw kind: ${kind || '(none)'}`);
  if (raw.season == null) throw new Error('raw snapshot needs a season');
  return Object.freeze({
    id: `${raw.season}-${kind}-${String(seq).padStart(9, '0')}`,
    seq,
    kind,
    season: String(raw.season),
    archived_at: nowIso,          // server clock — when we captured it
    source_at: raw.source_at || null,   // when the source (e.g. Sleeper) produced it
    hash,
    payload: raw.payload == null ? {} : raw.payload,
  });
}

// --- store-aware API --------------------------------------------------------

async function nextSeq(store, season, kind) {
  const head = await store.get(headKey(season, kind));
  if (head && Number.isFinite(head.seq)) return head.seq + 1;
  const keys = await store.listKeys(`raw:${season}:${kind}:`);
  const max = keys.reduce((m, k) => Math.max(m, Number(k.split(':').pop()) || 0), 0);
  return max + 1;
}

/**
 * Archive one raw snapshot. Immutable + append-only. Returns
 * {snapshot, deduped}: when the content is identical to the latest snapshot of
 * the same kind, nothing is written and deduped=true — the raw record already
 * has that exact state.
 */
async function snapshot(store, raw, { now } = {}) {
  const nowIso = (now ? new Date(now) : new Date()).toISOString();
  if (raw == null || raw.season == null) throw new Error('raw snapshot needs a season');
  const kind = String(raw.kind || '');
  if (KINDS.indexOf(kind) < 0) throw new Error(`unknown raw kind: ${kind || '(none)'}`);
  const season = String(raw.season);
  const hash = contentHash(raw.payload == null ? {} : raw.payload);

  const head = await store.get(headKey(season, kind));
  if (head && head.hash === hash) {
    return { snapshot: null, deduped: true, seq: head.seq };
  }
  const seq = await nextSeq(store, season, kind);
  const snap = buildSnapshot(raw, { nowIso, seq, hash });
  const key = seqKey(season, kind, seq);
  const existing = await store.listKeys(`raw:${season}:${kind}:`);
  if (existing.indexOf(key) >= 0) throw new Error(`raw archive would overwrite ${key} — refusing (immutable)`);
  await store.set(key, snap);
  await store.set(headKey(season, kind), { seq, hash });
  return { snapshot: snap, deduped: false };
}

/** Read every snapshot of a kind for a season, in order. READ-ONLY. */
async function readAll(store, season, kind) {
  const keys = (await store.listKeys(`raw:${String(season)}:${kind}:`)).slice().sort();
  const rows = await store.getMany(keys);
  return rows.filter(Boolean).sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

/** A manifest of what raw data exists — counts per kind. READ-ONLY. */
async function manifest(store, season) {
  const out = {};
  for (const kind of KINDS) {
    const keys = await store.listKeys(`raw:${String(season)}:${kind}:`);
    if (keys.length) out[kind] = keys.length;
  }
  return out;
}

module.exports = {
  KINDS, seqKey, headKey, contentHash, stableStringify, buildSnapshot,
  nextSeq, snapshot, readAll, manifest,
};
