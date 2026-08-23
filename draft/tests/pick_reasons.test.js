// TERRITORY: A
/* THE ONE FIELD THE 2026 DRAFT CANNOT GET BACK.
 *
 * Cory, 2026-08-23: *"my_deviation_reason are empty everywhere — the why behind
 * your twelve decisions is unrecoverable this needs to be fixed for next year."*
 *
 * `is_mine` and the truncated keeper name are recoverable — they derive from
 * `team_slot` and `player_id`. WHY he deviated existed only in his head on the
 * night, and it is gone. This pair (`pick_reasons.js` + `merge_pick_reasons.js`)
 * exists so 2027 does not repeat it.
 *
 * ── WHAT THESE CHECKS ARE ACTUALLY DEFENDING ────────────────────────────────
 *
 * Not "does the code run". The failure mode is a capture that LOOKS filled and
 * is wrong about which decision was which — a reason attached to someone else's
 * pick, or to a player the room did not actually take, or recorded against a
 * different board. Every one of those produces a log that grades cleanly and
 * lies. So the merge REFUSES on each, and the tests below drive the refusals,
 * not just the happy path.
 */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const PR = require(path.join(ROOT, 'public', 'js', 'draft', 'pick_reasons.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 260) : '')); }
};

/* ── THE VOCABULARY ───────────────────────────────────────────────────────── */

ck('the vocabulary is short enough to be ONE TAP — a list long enough to need '
  + 'reading is not a tap, and 8s/pick is why the 2026 field is empty',
  PR.REASONS.length <= 8 && PR.REASONS.length >= 4, { n: PR.REASONS.length });

ck('every reason carries a code, a label and a note explaining what it CLAIMS',
  PR.REASONS.every(r => r.code && r.label && r.note));

ck('the codes are distinct DECISIONS, not moods — "he would not last" and '
  + '"my read" are different claims about the world and only one is checkable',
  PR.CODES.indexOf('would_not_last') >= 0 && PR.CODES.indexOf('my_read') >= 0
  && new Set(PR.CODES).size === PR.CODES.length);

ck('an unknown code is rejected, so the vocabulary cannot rot by accident',
  !PR.isValidCode('vibes') && PR.isValidCode('other') && PR.isValidCode('my_read'));

/* ── THE PURE CORE ────────────────────────────────────────────────────────── */

ck('CONTROL: a well-formed entry is built, so the rejections below are the '
  + 'function discriminating rather than refusing everything',
  !!PR.makeEntry(33, '9997', 'my_read', null, '2026-08-22T23:10:00Z'));

ck('an entry with no player_id is refused — the merge joins on '
  + '(pick, player_id) and a null there would match nothing silently',
  PR.makeEntry(33, null, 'my_read') === null);

ck('free text is capped rather than unbounded, and is never required',
  (PR.makeEntry(1, '1', 'other', 'x'.repeat(900)).reason_text || '').length === 400
  && PR.makeEntry(1, '1', 'my_read').reason_text === undefined);

{
  /* LAST TAP WINS. He taps, changes his mind, taps again before the pick is in.
   * Keeping both makes the log ambiguous about which one he acted on. */
  let l = [];
  l = PR.upsert(l, PR.makeEntry(33, '1', 'my_read'));
  l = PR.upsert(l, PR.makeEntry(48, '2', 'position_need'));
  l = PR.upsert(l, PR.makeEntry(33, '9', 'value_too_good'));
  ck('re-tapping the same pick REPLACES rather than appends, and the list '
    + 'stays in pick order',
    l.length === 2 && l[0].pick === 33 && l[0].reason_code === 'value_too_good'
    && l[1].pick === 48, l);
}

{
  /* A private window throws on localStorage ACCESS, not just on write. */
  const thrower = { getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); } };
  ck('storage that throws degrades to empty rather than taking the page down '
    + '— draft night is exactly when a private window shows up',
    PR.load(thrower).length === 0 && PR.save([{ pick: 1 }], thrower) === false);
}

/* ── THE MERGE REFUSES (the part that matters) ────────────────────────────── */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reasons-'));
const LOG = path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl');
const logRows = fs.readFileSync(LOG, 'utf8').trim().split('\n').map(JSON.parse);
const sha = (logRows.find(r => r.freeze_sha256) || {}).freeze_sha256;
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const mineRow = logRows.find(r => String(r.team_slot) === String(CFG.my_draft_slot) && r.is_selection);
const theirsRow = logRows.find(r => String(r.team_slot) !== String(CFG.my_draft_slot) && r.is_selection);

ck('CONTROL: the real 2026 log gave us one of Cory\'s picks and one of '
  + 'someone else\'s to build the cases from',
  !!(mineRow && theirsRow && sha), { mine: !!mineRow, theirs: !!theirsRow, sha: !!sha });

function runMerge(docObj) {
  const f = path.join(tmp, 'r' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(f, JSON.stringify(docObj));
  try {
    execFileSync(process.execPath,
      [path.join(ROOT, 'draft', 'tools', 'merge_pick_reasons.js'), f, '--dry-run'],
      { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.stderr || '') };
  }
}

const good = { freeze_sha256: sha, entries: [
  { pick: mineRow.pick, player_id: String(mineRow.player_id), reason_code: 'my_read' }] };

ck('CONTROL: a correct reasons file MERGES — without this every refusal below '
  + 'could just be a tool that always fails',
  runMerge(good).ok);

ck('a reasons file from a DIFFERENT board is refused — a reason recorded '
  + 'against another freeze is about another draft',
  !runMerge(Object.assign({}, good, { freeze_sha256: 'deadbeef' })).ok);

ck('a reasons file with NO freeze sha is refused rather than merged on trust',
  !runMerge({ entries: good.entries }).ok);

ck('a reason attached to SOMEONE ELSE\'S pick is refused — that column grades '
  + 'Cory, and quietly annotating another owner\'s pick would corrupt it',
  !runMerge({ freeze_sha256: sha, entries: [
    { pick: theirsRow.pick, player_id: String(theirsRow.player_id), reason_code: 'my_read' }] }).ok);

ck('a reason whose player is NOT the man the room took is refused, and the '
  + 'message names both — he tapped for one and got another',
  (() => { const r = runMerge({ freeze_sha256: sha, entries: [
    { pick: mineRow.pick, player_id: '999999', reason_code: 'my_read' }] });
    return !r.ok && /the room took/.test(r.err); })());

ck('an unknown reason code is refused, not written through as free text',
  !runMerge({ freeze_sha256: sha, entries: [
    { pick: mineRow.pick, player_id: String(mineRow.player_id), reason_code: 'vibes' }] }).ok);

ck('an EMPTY reasons file is refused — merging nothing and reporting success '
  + 'is how a capture looks done and is not',
  !runMerge({ freeze_sha256: sha, entries: [] }).ok);

/* ── AND IT DOES NOT WRITE ON REFUSAL ─────────────────────────────────────── */
{
  const before = fs.readFileSync(LOG, 'utf8');
  runMerge(Object.assign({}, good, { freeze_sha256: 'deadbeef' }));
  ck('a refused merge leaves the log BYTE-IDENTICAL — a partial merge is how a '
    + 'log ends up half-annotated with no record of which half',
    fs.readFileSync(LOG, 'utf8') === before);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
