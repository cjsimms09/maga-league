#!/usr/bin/env node
/* FOLD THE ONE-TAP REASONS INTO THE PICK LOG — offline, after the draft.
 *
 * The other half of `public/js/draft/pick_reasons.js`. The war room records
 * WHY at the moment of the pick, into localStorage where no network can lose
 * it; this merges that export into `draft_pick_log_2026.jsonl` afterwards,
 * filling `my_deviation_reason` — the field that was null on all 150 rows of
 * the 2026 draft and is the one thing about that night we cannot reconstruct.
 *
 * Run:  node draft/tools/merge_pick_reasons.js <reasons.json> [--season 2027]
 *       node draft/tools/merge_pick_reasons.js <reasons.json> --dry-run
 *
 * ── IT REFUSES RATHER THAN GUESSES, in four places ─────────────────────────
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
 *     free text, so the vocabulary cannot rot by accident.
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

const LOG = path.join(ROOT, 'draft', 'data', `draft_pick_log_${SEASON}.jsonl`);
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

/* 3. MERGE. */
const byPickEntry = new Map(entries.map(e => [Number(e.pick), e]));
let filled = 0;
const out = rows.map(r => {
  const e = byPickEntry.get(Number(r.pick));
  if (!e) return r;
  filled++;
  return Object.assign({}, r, {
    my_actual_pick: r.player_id,
    my_deviation_reason: e.reason_code,
    my_deviation_text: e.reason_text || null,
    my_reason_recorded_at: e.recorded_at || null,
  });
});

console.log(`reasons: ${entries.length} · matched and validated: ${filled}`);
const codes = {};
entries.forEach(e => { codes[e.reason_code] = (codes[e.reason_code] || 0) + 1; });
Object.keys(codes).sort().forEach(c => console.log(`   ${c.padEnd(16)} ${codes[c]}`));

if (DRY) { console.log('\n--dry-run: nothing written'); process.exit(0); }
fs.writeFileSync(LOG, out.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`\nwrote ${path.relative(ROOT, LOG)} — ${filled} rows now carry a reason`);
