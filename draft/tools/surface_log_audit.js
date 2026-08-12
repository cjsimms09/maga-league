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
const FIELD = {
  pick: ['pick', 'pick_no', 'pick_number', 'overall_pick'],
  round: ['round', 'round_no', 'rnd'],
  player: ['player', 'recommended', 'recommended_player', 'name', 'player_name'],
  position: ['position', 'pos', 'recommended_position'],
  board_rank: ['board_rank', 'rank', 'overall_rank'],
  score: ['score', 'composite', 'composite_score'],
  gap: ['gap', 'gap_to_second', 'gap_to_next', 'score_gap'],
  alternatives: ['alternatives', 'alts', 'others', 'candidates'],
  explanation: ['explanation', 'why', 'reason', 'reasons'],
  roster: ['roster', 'roster_state', 'my_roster'],
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
  const allKeys = new Set();
  rows.forEach(r => Object.keys(r || {}).forEach(k => allKeys.add(k)));
  const ragged = Array.from(allKeys).filter(k =>
    rows.some(r => !Object.prototype.hasOwnProperty.call(r || {}, k)));
  ck('every row carries every field — absent is recorded as null, not omitted',
    ragged.length === 0,
    { fields_missing_from_some_rows: ragged.slice(0, 12),
      rows_total: rows.length,
      note: 'present-and-null means "asked, no value"; omitted means "nobody knows '
        + 'whether it was asked". They must not read the same.' });

  const nulls = {};
  Array.from(allKeys).forEach(k => {
    nulls[k] = rows.filter(r => r && r[k] === null).length;
  });
  const everNull = Object.keys(nulls).filter(k => nulls[k] > 0);
  ck('  CONTROL: the log DOES use null somewhere — otherwise the check above is vacuous',
    everNull.length > 0,
    { note: 'a log with no nulls anywhere is either perfect or is omitting rather '
      + 'than nulling, and those look identical from outside' });
}

// ── 4. INTERNAL COHERENCE ───────────────────────────────────────────────────
{
  if (!key.pick) { blocked('one row per pick, picks strictly increasing', 'no pick field'); }
  else {
    const picks = rows.map(r => Number(pick(r, FIELD.pick)));
    const dupes = picks.filter((p, i) => picks.indexOf(p) !== i);
    ck('one row per pick — no duplicate pick numbers', dupes.length === 0, dupes.slice(0, 8));
    const sorted = picks.slice().sort((a, b) => a - b);
    ck('  picks are in order and every one is a number',
      picks.every(p => isFinite(p)) && picks.join(',') === sorted.join(','),
      { first: picks.slice(0, 6), nonNumeric: picks.filter(p => !isFinite(p)).length });
  }

  if (!key.roster) { blocked('the roster advances', 'no roster field'); }
  else {
    const sizes = rows.map(r => {
      const v = pick(r, FIELD.roster);
      return Array.isArray(v) ? v.length : (v && typeof v === 'object'
        ? Object.keys(v).length : null);
    });
    const ok = sizes.every(s => s !== null) && sizes.every((s, i) => i === 0 || s >= sizes[i - 1]);
    ck('the roster state never SHRINKS between picks', ok,
      { sizes: sizes.slice(0, 12),
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
    blocked('cross-check the log against the engine',
      'NOT IMPLEMENTED. Needs the log\'s roster entry shape to map to board '
      + 'players, which is not known until B\'s artifact lands. Guessing the '
      + 'mapping would compare the wrong things silently. This is the check Cory '
      + 'most wants and it is deliberately unbuilt rather than faked.');
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
    const withPanels = rows.filter(r => {
      const p = pick(r, FIELD.panels);
      return p && (Array.isArray(p) ? p.length : Object.keys(p).length);
    });
    ck('every row records what the other panels said', withPanels.length === rows.length,
      { rows_with_panels: withPanels.length, rows_total: rows.length });
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + cannot + ' could not be audited');
if (cannot) {
  console.log('\nCANNOT-AUDIT IS NOT A PASS. Each one above is a question this log '
    + 'cannot answer\nin its current shape, and it exits non-zero for the same reason '
    + 'a missing\nmeasurement is not a null.');
}
process.exit(fail || cannot ? 1 : 0);
