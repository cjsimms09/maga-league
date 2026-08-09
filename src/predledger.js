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
// 'survival', 'override', 'lrm', 'run', and the doctrine pair — 'doctrine'
// (the plan in force at this pick, its live alternative and the dollar gap) and
// 'doctrine_decline' (I was offered a switch and kept the prior plan). January
// grades whether declared doctrines and declines earned their dollars, which it
// cannot do if the banner's state was never written down.

const KINDS = ['recommendation', 'pick', 'survival', 'override', 'lrm', 'run',
               'doctrine', 'doctrine_decline',
               // Experiment 31 data collection. Every non-Cory pick in a MOCK
               // room is Sleeper's default ordering executing — especially the
               // bot/autopick ones — so a rehearsal doubles as a sample of the
               // platform board we have no historical archive of.
               'mock_platform_sample',
               // Phase H. Every strategy drafts silently at my slots, and each
               // of those counterfactual picks is a prediction logged at
               // DECISION TIME so the 2026 season can grade it in dollars.
               // Emitted by app.js updateShadows() and never registered here,
               // so every shadow capture 400'd and the decision-time record
               // behind shadow standings was dropped on the floor. Found by the
               // mock-#3 rehearsal, and only after two louder errors sitting in
               // front of it were classified away.
               'shadow_pick',
               // ...and it was never one omission. A sweep of every capture
               // call in the client found FOUR kinds emitted and none
               // registered, so four separate decision-time records were
               // 400'ing on every write:
               'shadow_freeze',    // the shadow slate frozen at draft end
               'pick_reconciled',  // missed-mark recovery: a pick I forgot to
                                   // mark, recovered from Sleeper rather than
                                   // invented — the audit trail for the fix
               'correction',       // a recorded pick corrected after the fact

               /* ── IN-SEASON KINDS (experiment 37's rail) ──────────────────
                *
                * Registered BEFORE the draft, deliberately, and this is the
                * one deadline where missing it destroys something
                * unrecoverable. Draft night is the densest decision event of
                * the year; a ledger that starts on Sept 1 captures NONE of it,
                * and no amount of later work reconstructs a decision-time
                * record after the decision. Sleeper's transactions are
                * retrievable retroactively — what is NOT retrievable is what
                * the tool RECOMMENDED at the moment, which is the entire
                * attribution question.
                *
                * EVERY ONE OF THESE CARRIES ITS COUNTERFACTUAL. That is not a
                * payload convention, it is what makes the entry gradeable:
                * without "what I would plausibly have done otherwise" there is
                * an outcome and nothing to compare it to. Enforced by
                * assertCounterfactual below.
                *
                * ⚠️ ATTRIBUTION WORDING IS BINDING ON EVERYTHING GRADED FROM
                * THESE (docs/queued/in-season-master.md): the design is
                * observational with no control arm, so the permitted form is
                * "$X was realised on decisions where the tool recommended Y" —
                * never "the tool earned $X". No sample size changes that.
                */
               'lineup_call',      // a start/sit recommendation, with the lineup
                                   // I would have played instead
               'waiver_claim',     // a claim recommendation + priority/order
               'stream_call',      // a K/DEF stream, with the hold alternative
               'trade_eval',       // an offer priced, accepted or declined
               'weekly_brief',     // the brief as delivered — what I was told,
                                   // when, so a later grade reads what I saw
               'inseason_override',   // I went against the recommendation, and
                                      // what I did instead

               /* ── FORWARD PREDICTION (the one thing no backtest can give) ──
                *
                * Every experiment in the Lab is RETROSPECTIVE — it replays
                * 2023-25 and grades against outcomes that already exist, and
                * whoever builds the analysis has seen the answers. That is why
                * three self-agreeing backtests slipped through this month. A
                * FORECAST is different in kind: the model commits IN WRITING,
                * timestamped, to a claim about something that has NOT happened
                * yet — a survival %, which players fall past ADP, the roster's
                * dollar value, who the room takes at each seat, the weekly-high
                * winner. Reality answers once; there is no second run and no
                * researcher degree of freedom. Calibration ("91% survival") is
                * only measurable this way: forward, over many live claims.
                *
                * 'forecast'            — a committed claim (see assertForecast:
                *                         it MUST carry ftype + value + a
                *                         resolution rule + a key, or it is
                *                         ungradeable and refused, the same
                *                         discipline the counterfactual gets).
                * 'forecast_resolution' — what reality returned, a SEPARATE
                *                         append joined by key, written only when
                *                         the outcome is known. The original
                *                         forecast is never mutated (contamination
                *                         rule), and the grader disqualifies any
                *                         forecast whose decision_at is not
                *                         strictly before its resolution — the
                *                         guarantee that makes it forward. */
               'forecast',
               'forecast_resolution'];

/* EVERY KIND THE CLIENT EMITS MUST BE REGISTERED ABOVE.
 *
 * This is a closed vocabulary enforced at the server boundary, while the code
 * that emits into it lives in a different file — so adding a capture call
 * without adding its kind yields a 400 that is invisible unless somebody
 * happens to be watching the console at the moment it fires. That has now
 * happened twice ('doctrine', then 'shadow_pick'), which makes it a class
 * rather than an accident.
 *
 * ledger.test.js reads the emitters straight out of the client source and
 * asserts the two agree, so the next omission fails a test instead of quietly
 * discarding data for weeks. */

/* WHICH KINDS MUST CARRY A COUNTERFACTUAL, and why it is enforced rather than
 * documented: an in-season entry without one records an outcome with nothing to
 * compare it against, which is unfalsifiable rather than merely incomplete. The
 * January attribution table is built entirely from these pairs.
 *
 * The counterfactual is MODELLED, NOT OBSERVED, and its quality varies sharply
 * by component — that limitation rides with the report per exp 37, and is the
 * reason the wording rule exists. Recording it is what makes the weakness
 * visible; omitting it is what would hide it. */
const COUNTERFACTUAL_KINDS = ['lineup_call', 'waiver_claim', 'stream_call',
                              'trade_eval', 'inseason_override'];

function assertCounterfactual(kind, payload) {
  if (COUNTERFACTUAL_KINDS.indexOf(kind) < 0) return;
  const p = payload || {};
  if (p.counterfactual === undefined || p.counterfactual === null) {
    throw new Error(
      `in-season kind '${kind}' requires payload.counterfactual — what I would ` +
      'plausibly have done without the tool. Without it the entry records an ' +
      'outcome with nothing to compare it to, and January cannot grade it.');
  }
}

/* A forecast without a resolution rule is not a prediction, it is a mood — it
 * can be reinterpreted after the fact, which is exactly the freedom a forward
 * prediction is supposed to remove. So the gradeable skeleton is ENFORCED, not
 * documented: ftype, a value, a stated resolution rule, and a stable key the
 * later resolution joins on. The three types the grader knows:
 *   probability — value in [0,1], graded by Brier + reliability bin;
 *   point       — a numeric estimate, graded by signed error + |error|;
 *   categorical — a label, graded hit/miss. */
const FORECAST_TYPES = ['probability', 'point', 'categorical'];

function assertForecast(kind, payload) {
  const p = payload || {};
  if (kind === 'forecast') {
    if (!p.key || typeof p.key !== 'string') {
      throw new Error("forecast requires payload.key — a stable id its resolution joins on");
    }
    if (FORECAST_TYPES.indexOf(p.ftype) < 0) {
      throw new Error(`forecast requires payload.ftype in ${JSON.stringify(FORECAST_TYPES)}`);
    }
    if (p.value === undefined || p.value === null) {
      throw new Error('forecast requires payload.value — the committed prediction');
    }
    if (p.ftype === 'probability' && !(Number(p.value) >= 0 && Number(p.value) <= 1)) {
      throw new Error('a probability forecast needs value in [0,1]');
    }
    if (!p.resolution_rule || typeof p.resolution_rule !== 'string') {
      throw new Error('forecast requires payload.resolution_rule — how reality decides it, '
        + 'stated BEFORE the outcome so a null cannot be reinterpreted');
    }
  } else if (kind === 'forecast_resolution') {
    if (!p.forecast_key || typeof p.forecast_key !== 'string') {
      throw new Error('forecast_resolution requires payload.forecast_key — the forecast it resolves');
    }
    if (p.outcome === undefined || p.outcome === null) {
      throw new Error('forecast_resolution requires payload.outcome — what reality returned');
    }
  }
}

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
  assertCounterfactual(kind, raw.payload);
  assertForecast(kind, raw.payload);
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
  KINDS, COUNTERFACTUAL_KINDS, FORECAST_TYPES,
  assertCounterfactual, assertForecast,
  seqKey, counterKey, buildEntry, assertFreshKey,
  nextSeq, append, readAll,
};
