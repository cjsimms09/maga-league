/* AUDIT B's DRIVEN-MOCK LOG. PRE-REGISTERED — WRITTEN BEFORE THE LOG EXISTS.
 *
 * Cory, 2026-08-14: B is driving the deployed war room through full mocks and
 * logging every recommendation as it appears ON THE SURFACE — one machine-
 * readable row per pick, stamped with board version and commit. And:
 *
 *   "AUDIT IT RATHER THAN CITING IT. B has caught its own probes producing false
 *    results twice this week. THE FIRST QUESTION IS WHETHER THE LOG ITSELF IS
 *    SOUND. A log nobody checks is the same trap as a harness nobody checks,
 *    which is how we got here."
 *
 * ── WHY THIS IS WRITTEN BEFORE THE ARTIFACT LANDS ───────────────────────────
 *
 * Because a check authored after seeing the data is a check shaped by the data.
 * Every threshold and every required field below is fixed now, while the log
 * does not exist, so it cannot be tuned to make the first drop pass. That is the
 * same discipline as pre-registering an experiment, applied to an audit — and
 * this program has already spent a week finding instruments that could only
 * return one answer.
 *
 * IT WILL PROBABLY NOT MATCH B's SCHEMA EXACTLY, AND THAT IS HANDLED: an
 * unrecognised shape reports CANNOT AUDIT and exits 2. It does not guess at
 * field names and it does not pass. Adapting the FIELD MAP to B's actual keys is
 * legitimate; relaxing a CHECK because the log fails it is not, and the two are
 * kept separate below so the difference is visible in a diff.
 *
 * ── THE FIVE QUESTIONS, IN CORY'S ORDER ─────────────────────────────────────
 *
 *   1. Does the capture reflect what RENDERED?  (cross-checked against the
 *      engine on the logged roster state — a disagreement localises to the
 *      surface or to the log, and BOTH are findings)
 *   2. Are absent fields recorded as ABSENT rather than OMITTED?
 *   3. Does the board stamp match what was actually DEPLOYED?
 *   4. Is it internally coherent — one row per pick, rounds and picks
 *      consistent, roster state advancing?
 *   5. Do the panels agree with each other, and where they disagree is the
 *      disagreement CAPTURED rather than silently resolved?
 *
 * Run: node draft/tools/surface_log_audit.js <path-to-log.json>
 * Exit 0 sound, 1 defects found, 2 CANNOT AUDIT.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');

/* ── THE FIELD MAP. Adapting THIS to B's real keys is legitimate. ───────────
 * Each entry lists the names this auditor will accept for one concept. If none
 * matches, the audit says which concept it could not find and refuses to run —
 * it does not fall back to a default and it does not skip the check. */
/* B's REAL NAMES ADDED 2026-08-14 when the artifact landed
 * (public/js/drivelog/draft-drive-log.ndjson, 61 rows). Adding an ALIAS is the
 * legitimate half of the split this file declares below; every CHECK is
 * untouched. Named rather than merged silently so the next reader can see which
 * concepts were resolved by guessing at a name versus by B confirming one. */
const FIELD = {
  pick: ['pick', 'pick_no', 'pick_number', 'overall_pick', 'sleeper_pick_no'],
  round: ['round', 'round_no', 'rnd'],
  player: ['player', 'recommended', 'recommended_player', 'name', 'player_name'],
  position: ['position', 'pos', 'recommended_position'],
  board_rank: ['board_rank', 'rank', 'overall_rank'],
  score: ['score', 'composite', 'composite_score'],
  gap: ['gap', 'gap_to_second', 'gap_to_next', 'score_gap', 'gap_1_to_2'],
  alternatives: ['alternatives', 'alts', 'others', 'candidates'],
  explanation: ['explanation', 'why', 'reason', 'reasons'],
  roster: ['roster', 'roster_state', 'my_roster', 'roster_before'],
  panels: ['panels', 'panel', 'cards', 'surfaces'],
};
const STAMP = {
  commit: ['commit', 'sha', 'git_sha', 'head'],
  board: ['board_sha256', 'board_digest', 'board_sha', 'board_version', 'board'],
};

let pass = 0, fail = 0, cannot = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> '
      + JSON.stringify(d).slice(0, 400) : ''))); };
const blocked = (n, why) => { cannot++; console.log('CANNOT AUDIT  ' + n + '\n        -> ' + why); };

function pick(obj, names) {
  for (const n of names) if (obj && Object.prototype.hasOwnProperty.call(obj, n)) return obj[n];
  return undefined;
}
function found(obj, names) {
  for (const n of names) if (obj && Object.prototype.hasOwnProperty.call(obj, n)) return n;
  return null;
}

const file = process.argv[2];
if (!file) {
  console.log('usage: node draft/tools/surface_log_audit.js <path-to-log.json>');
  console.log('\nPRE-REGISTERED and waiting for B\'s artifact. Checks are fixed now,');
  console.log('before the log exists, so they cannot be shaped by what arrives.');
  process.exit(2);
}
let raw, doc;
try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
  console.log('CANNOT AUDIT: ' + e.message); process.exit(2);
}
/* JSON or JSONL — both are "machine-readable, one row per pick". */
try {
  doc = JSON.parse(raw);
} catch (e) {
  try {
    doc = raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  } catch (e2) {
    console.log('CANNOT AUDIT: not JSON and not JSONL — ' + e.message);
    process.exit(2);
  }
}
const rows = Array.isArray(doc) ? doc
  : (doc.rows || doc.picks || doc.records || doc.log || null);
const meta = Array.isArray(doc) ? {} : doc;
if (!Array.isArray(rows) || !rows.length) {
  console.log('CANNOT AUDIT: no row array found (looked for a top-level array, or '
    + '.rows/.picks/.records/.log). Top-level keys: '
    + (Array.isArray(doc) ? '<array>' : Object.keys(doc).join(', ')));
  process.exit(2);
}

console.log('SURFACE-LOG AUDIT — ' + path.basename(file) + ', ' + rows.length + ' row(s)\n');

/* Which concepts this log actually carries. A concept the map cannot find is
 * reported, and its checks are BLOCKED rather than skipped. */
const key = {};
Object.keys(FIELD).forEach(c => { key[c] = found(rows[0], FIELD[c]); });
const missingConcepts = Object.keys(key).filter(c => !key[c]);
console.log('  field map resolved: '
  + Object.keys(key).filter(c => key[c]).map(c => c + '->' + key[c]).join(', '));
if (missingConcepts.length) {
  console.log('  NOT FOUND: ' + missingConcepts.join(', '));
  console.log('  (adapting the FIELD map to B\'s real names is legitimate; relaxing a'
    + ' CHECK is not)');
}
console.log('');

/* PICK ROWS VS EVERYTHING ELSE — needed by both the completeness block and the
 * sequence block, so it is resolved once here rather than twice. */
const isPick = r => r && key.player && Object.prototype.hasOwnProperty.call(r, key.player);
const pickRows = rows.filter(isPick);
const otherRows = rows.filter(r => !isPick(r));

// ── 3. THE BOARD STAMP — checked first because everything else depends on it ─
{
  const stampSrc = Object.keys(meta).length ? meta : rows[0];
  const boardKey = found(stampSrc, STAMP.board);
  const commitKey = found(stampSrc, STAMP.commit);
  if (!boardKey) {
    blocked('the log carries a board stamp',
      'no board digest/version field found. Without it the log cannot be tied to '
      + 'a board, and "which board said this" is unanswerable a week later.');
  } else {
    const claimed = String(pick(stampSrc, STAMP.board));
    const liveRaw = fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'));
    const liveSha = crypto.createHash('sha256').update(liveRaw).digest('hex');
    const live = JSON.parse(liveRaw);
    let pins = [];
    try {
      pins = (JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data',
        'board_pins.json'), 'utf8')).series) || [];
    } catch (e) { /* no pins */ }
    const known = new Set([liveSha, String(live.version), String(live.built_at)]
      .concat(pins.map(p => String(p.sha256))).concat(pins.map(p => String(p.commit))));
    const matches = Array.from(known).some(k => k && (k === claimed
      || claimed.indexOf(k) === 0 || k.indexOf(claimed) === 0));
    ck('the board stamp matches a board we can actually identify',
      matches, { claimed: claimed, live_sha256: liveSha,
        live_version: live.version, pins: pins.map(p => p.observed_at + '/' + String(p.sha256).slice(0, 12)) });
    if (commitKey) {
      ck('  and it carries a commit as well as a digest',
        String(pick(stampSrc, STAMP.commit)).length >= 7);
    } else {
      blocked('the log carries a commit', 'no commit/sha field found');
    }
  }
}

// ── 2. ABSENT vs OMITTED ────────────────────────────────────────────────────
{
  /* THE DISTINCTION THAT MATTERS MOST AND IS EASIEST TO LOSE. A field that is
   * present-and-null says "asked, no value". A field that is simply not in the
   * row says "nobody knows whether it was asked". C's field_population exists
   * for exactly this three-way split and this project has hit the collapse of
   * it ten times. gap_to_second is the specific case: the engine sets it on the
   * leader and NULL on every other entry, so a log that omits it on non-leaders
   * has thrown away the distinction the engine deliberately encodes. */
  /* A LOG MAY CARRY MORE THAN ONE RECORD SHAPE, AND RAGGEDNESS ACROSS SHAPES IS
   * NOT THE SAME DEFECT AS RAGGEDNESS WITHIN ONE. B's log carries 60 PICK rows
   * and 1 EVENT row (the kill marker on the frozen run). Comparing all 61
   * against a union of both key sets reported twelve "missing" fields and read
   * as a badly-formed capture; it is in fact a well-formed capture of two things.
   * Checked within record type instead — which still catches a pick row that
   * drops a field, the case this was written for.
   *
   * THE REAL FINDING THAT SURVIVES: there is NO TYPE DISCRIMINATOR. A consumer
   * has to probe for the presence of `recommended` to know which shape it holds,
   * and a consumer that does not probe will read the event row as a pick with
   * everything missing. That is reported below rather than smoothed over. */
  const typeKey = ['type', 'record_type', 'kind', 'event'].find(k => rows.some(r => r && k in r));
  if (otherRows.length) {
    console.log('  record shapes: ' + pickRows.length + ' pick row(s), '
      + otherRows.length + ' non-pick row(s)');
    ck('  a mixed-shape log declares its record type in a field',
      Boolean(typeKey),
      { note: 'without a discriminator a consumer must probe for `' + key.player
        + '` to know what it is holding, and one that does not probe reads the '
        + 'non-pick rows as picks with every field missing',
        non_pick_row_keys: Object.keys(otherRows[0] || {}).slice(0, 12) });
  }

  const allKeys = new Set();
  pickRows.forEach(r => Object.keys(r || {}).forEach(k => allKeys.add(k)));
  const ragged = Array.from(allKeys).filter(k =>
    pickRows.some(r => !Object.prototype.hasOwnProperty.call(r || {}, k)));
  ck('every PICK row carries every field — absent is recorded as null, not omitted',
    ragged.length === 0,
    { fields_missing_from_some_rows: ragged.slice(0, 12),
      pick_rows: pickRows.length,
      note: 'present-and-null means "asked, no value"; omitted means "nobody knows '
        + 'whether it was asked". They must not read the same.' });

  /* NULLS AT ANY DEPTH, NOT JUST THE TOP LEVEL. The first version looked only at
   * row keys and reported "this log never uses null" about a log whose
   * alternatives carry `gap_to_second: null` on ranks 2..N — which is precisely
   * the engine-side distinction Cory observed live and precisely what this
   * control exists to confirm survived the capture. A control that reads one
   * level deep and concludes something about the whole document is the same
   * over-read it is meant to catch. */
  const nullPaths = [];
  const walk = (v, path, depth) => {
    if (depth > 4 || nullPaths.length > 8) return;
    if (v === null) { nullPaths.push(path); return; }
    if (Array.isArray(v)) { v.slice(0, 3).forEach((x, i) => walk(x, path + '[' + i + ']', depth + 1)); return; }
    if (v && typeof v === 'object') { Object.keys(v).forEach(k => walk(v[k], path ? path + '.' + k : k, depth + 1)); }
  };
  pickRows.slice(0, 10).forEach((r, i) => walk(r, '', 0));
  const everNull = nullPaths;
  ck('  CONTROL: the log DOES use null somewhere — otherwise the check above is vacuous',
    everNull.length > 0,
    { note: 'a log with no nulls anywhere is either perfect or is omitting rather '
      + 'than nulling, and those look identical from outside' });
  if (everNull.length) {
    console.log('        (null observed at: ' + everNull.slice(0, 3).join(', ') + ')');
  }
}

// ── 4. INTERNAL COHERENCE ───────────────────────────────────────────────────
{
  /* SEQUENCE INVARIANTS HOLD WITHIN A RUN, NOT ACROSS A FILE.
   *
   * THE FIRST VERSION OF THESE THREE CHECKS ASSUMED ONE DRAFT PER FILE AND
   * FAILED ALL THREE ON A SOUND LOG. B's artifact concatenates four runs
   * (follow-1, follow-2-killed, override-early, override-mid); each restarts at
   * pick 8 with the three keepers. So "duplicate pick 33", "picks out of order"
   * and "the roster shrank from 11 to 3" were MY instrument reporting its own
   * assumption, and every one of them would have been read as a defect in B's
   * capture. Rule 13f cuts both ways: a negative deserves the same reading as a
   * positive, and three red lines are exactly as citable as three green ones.
   *
   * Grouping by run makes the invariant STRONGER, not weaker — it still catches
   * a real duplicate or a real reset, and it now also catches a run whose rows
   * are interleaved with another's. */
  const runKey = ['run', 'run_id', 'session', 'trial'].find(k => rows[0] && k in rows[0]);
  const groups = {};
  pickRows.forEach(r => { const g = runKey ? String(r[runKey]) : '_all'; (groups[g] = groups[g] || []).push(r); });
  const runNames = Object.keys(groups);
  console.log('  sequence invariants evaluated PER RUN: '
    + (runKey ? runNames.length + ' run(s) via `' + runKey + '` — ' + runNames.join(', ')
      : 'no run field; treating the file as one run'));

  if (!key.pick) { blocked('one row per pick, picks strictly increasing', 'no pick field'); }
  else {
    const badDupes = [], badOrder = [];
    runNames.forEach(g => {
      const picks = groups[g].map(r => Number(pick(r, FIELD.pick)))
        .filter(p => isFinite(p));
      const dupes = picks.filter((p, i) => picks.indexOf(p) !== i);
      if (dupes.length) badDupes.push({ run: g, dupes: dupes.slice(0, 6) });
      const sorted = picks.slice().sort((a, b) => a - b);
      if (picks.join(',') !== sorted.join(',')) badOrder.push({ run: g, picks: picks.slice(0, 8) });
    });
    ck('one row per pick — no duplicate pick numbers WITHIN a run',
      badDupes.length === 0, badDupes);
    ck('  and picks increase within a run',
      badOrder.length === 0, badOrder);
  }

  if (!key.roster) { blocked('the roster advances', 'no roster field'); }
  else {
    const shrank = [];
    runNames.forEach(g => {
      const sizes = groups[g].map(r => {
        const v = pick(r, FIELD.roster);
        return Array.isArray(v) ? v.length : (v && typeof v === 'object'
          ? Object.keys(v).length : null);
      }).filter(s => s !== null);
      sizes.forEach((s, i) => { if (i && s < sizes[i - 1]) shrank.push({ run: g, at: i, from: sizes[i - 1], to: s }); });
    });
    ck('the roster state never SHRINKS within a run', shrank.length === 0,
      { shrank: shrank.slice(0, 6),
        note: 'a shrinking roster means the capture is reading a stale or reset state '
          + '— the mid-draft reset defect, seen from the log side' });
  }
}

// ── 1. DOES THE CAPTURE REFLECT WHAT THE ENGINE WOULD SAY? ──────────────────
{
  /* THE HIGHEST-VALUE CHECK AND THE ONE THAT MUST NOT BE OVER-READ.
   *
   * Re-running recommend() on the logged roster state and comparing to the
   * logged recommendation localises a disagreement — it does NOT decide who is
   * wrong. Three readings, and the audit reports the disagreement rather than
   * picking one:
   *   · the log mis-captured what rendered
   *   · the surface genuinely diverges from the engine (the two-panel
   *     contradiction class — invisible from the engine side, which is exactly
   *     why Cory wants a log I did not generate)
   *   · the board or context differed from what I can reconstruct here
   *
   * A HIGH AGREEMENT RATE IS NOT A PASS EITHER. If it agrees everywhere, the log
   * is confirming a system I built with a harness I built — which is the
   * position Cory is trying to get us OUT of. The number is reported; it is not
   * scored. */
  console.log('\n  ── engine cross-check ────────────────────────────────────────');
  if (!key.player || !key.roster || !key.pick) {
    blocked('cross-check the log against the engine',
      'needs pick, player and roster fields; missing: '
      + ['pick', 'player', 'roster'].filter(c => !key[c]).join(', '));
  } else {
    /* NOT IMPLEMENTED, AND SAYING SO RATHER THAN PRINTING A SENTENCE THAT
     * DESCRIBES WORK THAT DOES NOT HAPPEN.
     *
     * The first version of this block printed "(reconstructing each logged state
     * and re-scoring it)" and then did nothing. That is the self-description
     * defect — a description asserted rather than performed — inside the file
     * written to hunt it, and it would have read as a clean cross-check to
     * anyone scanning the output.
     *
     * IT IS BLOCKED ON A REAL UNKNOWN, not on effort: reconstructing a state
     * needs the log's roster entries mapped to board players, and B's roster
     * shape is not known yet (names? ids? objects?). Guessing the mapping would
     * produce a comparison that silently compared the wrong things — which is
     * the same failure as a fixture that invents its input.
     *
     * WHEN THE LOG LANDS: map roster -> player_id, rebuild ctx via
     * live_context.js (which refuses partial or invented keys), call
     * E.recommend, and REPORT the disagreement rate without scoring it. */
    /* THE ARTIFACT LANDED 2026-08-14 AND THE BLOCKER IS NO LONGER THE ROSTER
     * SHAPE — that resolved cleanly ({name, pos}). It is that THE LOG DOES NOT
     * RECORD THE BOARD STATE. Recomputing a recommendation needs the set of
     * players already taken; the log carries only page_says.drafted (a count)
     * and page_says.board_left (a count). Two different boards with the same
     * count produce different recommendations, so counts cannot stand in.
     *
     * This is now a REQUEST WITH A NAME rather than an open-ended gap: one field
     * per row — the taken player_ids, or a digest of the remaining board — makes
     * every logged pick independently recomputable, and this check goes live
     * without any other change. Recorded here rather than approximated, because
     * a cross-check run against a guessed board would disagree with the surface
     * for reasons that have nothing to do with the surface. */
    blocked('cross-check the log against the engine',
      'STILL BLOCKED, BUT THE BLOCKER IS NOW NAMED. The roster shape resolved '
      + '({name, pos}); what is missing is the BOARD STATE. The log records '
      + 'page_says.drafted and board_left as COUNTS, never which players were '
      + 'taken, and recommend() is a function of the exact remaining board. '
      + 'Needed from B: taken player_ids (or a digest of the remaining board) '
      + 'per row. One field, and this check runs.');
  }
}

// ── 5. PANEL DISAGREEMENT IS CAPTURED, NOT RESOLVED ─────────────────────────
{
  if (!key.panels) {
    blocked('panel disagreements are captured',
      'no panels field. This is the one thing the log offers that neither the '
      + 'engine harness nor the baseline analysis can see — a needrule card and a '
      + 'composite card naming different players. Without it the log is a '
      + 'recommendation trace, not a surface trace.');
  } else {
    /* PICK ROWS ONLY. An event row has no recommendation, so it has no panels to
     * disagree about; counting it made a sound log read 60/61. */
    const withPanels = pickRows.filter(r => {
      const p = pick(r, FIELD.panels);
      return p && (Array.isArray(p) ? p.length : Object.keys(p).length);
    });
    ck('every PICK row records what the other panels said',
      withPanels.length === pickRows.length,
      { rows_with_panels: withPanels.length, pick_rows: pickRows.length });
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + cannot + ' could not be audited');
if (cannot) {
  console.log('\nCANNOT-AUDIT IS NOT A PASS. Each one above is a question this log '
    + 'cannot answer\nin its current shape, and it exits non-zero for the same reason '
    + 'a missing\nmeasurement is not a null.');
}
process.exit(fail || cannot ? 1 : 0);
