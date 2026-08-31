#!/usr/bin/env node
/* FOLD THE ONE-TAP REASONS INTO THE PICK LOG — offline, after the draft.
 *
 * The other half of `public/js/draft/pick_reasons.js`. The war room records
 * WHY at the moment of the pick, into localStorage where no network can lose
 * it; this folds that export in afterwards, carrying the deviation reason —
 * the field that was null on all 150 rows of the 2026 draft and is the one
 * thing about that night we cannot reconstruct.
 *
 * ⚠️ IT WRITES A SIDECAR, `pick_reasons_<season>.jsonl`, AND NEVER TOUCHES THE
 * PICK LOG. It used to rewrite the log in place; the first rehearsal against
 * the real 2026 capture showed that annotating three picks rewrote all 150
 * lines and turned `0.0` into `0` in the frozen prediction column. See the
 * comment at the write step. Join on `pick`.
 *
 * Run:  node draft/tools/merge_pick_reasons.js <reasons.json> [--season 2027]
 *       node draft/tools/merge_pick_reasons.js <reasons.json> --dry-run
 *
 * ── IT REFUSES RATHER THAN GUESSES, in five places ─────────────────────────
 *
 * A merge tool that half-works is worse than none: it produces a log that
 * looks complete and is wrong about which decisions were which. So:
 *
 *   · a reasons file whose `freeze_sha256` differs from the log's REFUSES —
 *     the same guard `log_draft_picks.py` already enforces per row, because a
 *     reason recorded against a different board is about a different draft;
 *   · a reason whose (pick, player_id) does not match the log REFUSES, named —
 *     that means he tapped for one man and the room took another;
 *   · a reason for a pick that is not Cory's REFUSES — the field is about HIS
 *     decisions and silently attaching one to someone else's pick would
 *     corrupt the only column that grades him;
 *   · an unknown reason code REFUSES, rather than being written through as
 *     free text, so the vocabulary cannot rot by accident;
 *   · a pick that ALREADY carries a recorded reason REFUSES — the sidecar is
 *     append-only for the same reason the pick log is, because overwriting a
 *     stated reason after the fact turns a record of what you thought into a
 *     record of what you wish you had thought.
 *
 * Nothing is written unless every row passes. Partial merges are how a log
 * ends up half-annotated with no record of which half.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PR = require(path.join(ROOT, 'public', 'js', 'draft', 'pick_reasons.js'));

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const seasonIx = args.indexOf('--season');
const SEASON = seasonIx >= 0 ? args[seasonIx + 1] : '2026';
const src = args.find(a => !a.startsWith('--') && a !== SEASON);

if (!src) {
  console.error('usage: merge_pick_reasons.js <reasons.json> [--season YYYY] [--dry-run]');
  process.exit(2);
}

/* Overridable so a test — and the draft-night dry_run isolation — can exercise
 * this against a scratch log instead of the one artifact of draft night that
 * cannot be recaptured. Same env var `log_draft_picks.py` already honours, so
 * a redirected capture carries its reasons with it. */
const LOG = process.env.DRAFT_PICK_LOG_PATH
  || path.join(ROOT, 'draft', 'data', `draft_pick_log_${SEASON}.jsonl`);
if (!fs.existsSync(LOG)) { console.error('no pick log at ' + LOG); process.exit(2); }

const doc = JSON.parse(fs.readFileSync(src, 'utf8'));
const rows = fs.readFileSync(LOG, 'utf8').trim().split('\n').map(JSON.parse);

const problems = [];

/* 1. SAME BOARD. */
const logSha = (rows.find(r => r.freeze_sha256) || {}).freeze_sha256 || null;
if (doc.freeze_sha256 && logSha && doc.freeze_sha256 !== logSha) {
  problems.push(`freeze mismatch: reasons carry ${String(doc.freeze_sha256).slice(0, 12)}…, `
    + `the log carries ${String(logSha).slice(0, 12)}… — these are different drafts`);
}
if (!doc.freeze_sha256) {
  problems.push('the reasons file carries no freeze_sha256, so it cannot be '
    + 'proven to be about this board — re-export from the war room');
}

/* 2. WHOSE PICKS. Derived from the log rather than configured, because
 *    `is_mine` is false on every row of the 2026 log (register 264) and
 *    trusting it would silently match nothing. */
const slots = {};
rows.forEach(r => { if (r.team_slot != null) slots[String(r.team_slot)] = (slots[String(r.team_slot)] || 0) + 1; });
const CFG = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const MY_SLOT = String(CFG.my_draft_slot);
const byPick = new Map(rows.map(r => [Number(r.pick), r]));

const entries = (doc.entries || []);
if (!entries.length) problems.push('the reasons file carries no entries');

entries.forEach(e => {
  const row = byPick.get(Number(e.pick));
  if (!row) { problems.push(`pick ${e.pick}: no such pick in the log`); return; }
  if (String(row.team_slot) !== MY_SLOT) {
    problems.push(`pick ${e.pick}: belongs to slot ${row.team_slot}, not yours (${MY_SLOT})`);
  }
  if (String(row.player_id) !== String(e.player_id)) {
    problems.push(`pick ${e.pick}: you tapped for ${e.player_id} but the room took `
      + `${row.player_id} (${row.player_name}) — the reason does not describe this pick`);
  }
  if (!PR.isValidCode(e.reason_code)) {
    problems.push(`pick ${e.pick}: unknown reason code "${e.reason_code}"`);
  }
});

if (problems.length) {
  console.error('REFUSING to merge — ' + problems.length + ' problem(s):');
  problems.forEach(p => console.error('  · ' + p));
  console.error('\nNothing was written. A half-merged log looks complete and is '
    + 'wrong about which decisions were which.');
  process.exit(1);
}

/* 3. WRITE A SIDECAR. THE PICK LOG IS NEVER TOUCHED.
 *
 * ⚠️ THIS TOOL USED TO REWRITE `draft_pick_log_<season>.jsonl` IN PLACE, AND
 * THE FIRST REHEARSAL AGAINST THE REAL 2026 LOG SHOWED WHAT THAT COSTS.
 * Merging three reasons rewrote ALL 150 LINES — 147 of them for picks this
 * tool was not even asked about — because the log was written by Python's
 * `json.dumps` and rewritten by JavaScript's `JSON.stringify`, which do not
 * agree on separators. Worse than whitespace: `"availability_at_my_next_pick":
 * 0.0` came back as `0`. That column IS the frozen prediction, the one thing
 * the whole capture exists to hold, and a float silently became an int in
 * every row carrying a zero.
 *
 * And it contradicted the log's own contract outright. `log_draft_picks.py`:
 * "JSONL, appended. A row, once written, is never rewritten… a correction is
 * a NEW row with `supersedes`, so both the original claim and the correction
 * survive." A tool that rewrites 150 rows to annotate three is the opposite of
 * that, and it would have run for the first time on the one artifact of draft
 * night that cannot be recaptured.
 *
 * So the reasons go to their own append-only sidecar, joined on `pick`. The
 * capture stays byte-identical; the annotation is a separate, later, clearly
 * dated claim — which is what it actually is. Reasons known AT capture time
 * still land directly on the row: `record()` already accepts
 * `my_deviation_reason` on the entry, and that path is the primary one. This
 * tool is the fallback for reasons that only ever lived in the browser.
 */
const SIDECAR = process.env.DRAFT_PICK_REASONS_PATH
  || path.join(ROOT, 'draft', 'data', `pick_reasons_${SEASON}.jsonl`);
const existing = fs.existsSync(SIDECAR)
  ? fs.readFileSync(SIDECAR, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  : [];
const already = new Set(existing.map(r => Number(r.pick)));

const dupes = entries.filter(e => already.has(Number(e.pick)));
if (dupes.length) {
  console.error('REFUSING to merge — ' + dupes.length + ' pick(s) already carry a '
    + 'recorded reason: ' + dupes.map(e => e.pick).join(', '));
  console.error('\nThe sidecar is append-only for the same reason the pick log '
    + 'is: overwriting a stated reason after the fact is how a record of what '
    + 'you thought becomes a record of what you wish you had thought.');
  process.exit(1);
}

console.log(`reasons: ${entries.length} · matched and validated: ${entries.length}`);
const codes = {};
entries.forEach(e => { codes[e.reason_code] = (codes[e.reason_code] || 0) + 1; });
Object.keys(codes).sort().forEach(c => console.log(`   ${c.padEnd(16)} ${codes[c]}`));

if (DRY) { console.log('\n--dry-run: nothing written'); process.exit(0); }

const out = entries.map(e => {
  const row = byPick.get(Number(e.pick));
  return {
    pick: Number(e.pick),
    player_id: String(e.player_id),
    player_name: row.player_name,
    position: row.position,
    reason_code: e.reason_code,
    reason_text: e.reason_text || null,
    recorded_at: e.recorded_at || null,
    /* Both shas, so a row can be proven to describe this board AND this log. */
    freeze_sha256: doc.freeze_sha256,
    merged_at: new Date().toISOString(),
    /* The annotation is a LATER claim than the pick, and says so rather than
     * being presented as part of the capture. */
    _what: 'recorded in the war room at the moment of the pick, folded in '
      + 'afterwards; joins to draft_pick_log_' + SEASON + '.jsonl on `pick`',
  };
});
fs.appendFileSync(SIDECAR, out.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`\nwrote ${path.relative(ROOT, SIDECAR)} — ${out.length} reason(s) appended`);
console.log(`${path.relative(ROOT, LOG)} is UNCHANGED (append-only; join on \`pick\`)`);
