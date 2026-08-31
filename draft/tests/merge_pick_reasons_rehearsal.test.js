#!/usr/bin/env node
/* THE DEVIATION-REASON CAPTURE, REHEARSED END TO END.
 *
 * `my_deviation_reason` is the one field of the 2026 capture that cannot be
 * reconstructed — Cory: "the why behind your twelve decisions is
 * unrecoverable". `pick_reasons.js` and `merge_pick_reasons.js` were built and
 * unit-tested to close that for 2027, and had NEVER been run end to end
 * against a real pick log. First use must not be draft night; that is exactly
 * how the field ended up empty the first time.
 *
 * ⚠️ WHAT THE FIRST REHEARSAL FOUND, and it would have cost the artifact:
 * the merge REWROTE the pick log in place. Annotating three picks rewrote ALL
 * 150 LINES — 147 of them for picks it was not asked about — because Python's
 * `json.dumps` and JavaScript's `JSON.stringify` do not agree on separators.
 * And `"availability_at_my_next_pick": 0.0` came back as `0`: a float silently
 * became an int in the FROZEN PREDICTION column, which is the one thing the
 * capture exists to hold. It also flatly contradicted the log's own contract
 * ("a row, once written, is never rewritten"). The tool now appends to a
 * sidecar and the log is untouched.
 *
 * So the load-bearing assertion here is not "the merge works". It is THE PICK
 * LOG IS BYTE-IDENTICAL AFTERWARDS.
 *
 * Everything runs against a scratch log in a temp dir. Nothing in this file
 * may touch draft/data — a test that rehearses on the real capture is the
 * accident it is meant to prevent.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'draft', 'tools', 'merge_pick_reasons.js');
const CFG = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const MY_SLOT = CFG.my_draft_slot;

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined
    ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reasons-'));
const LOG = path.join(tmp, 'log.jsonl');
const SIDE = path.join(tmp, 'reasons.jsonl');
const SHA = 'a'.repeat(64);

/* A scratch log written the way PYTHON writes it — `json.dumps` separators,
 * with a real float — because that spacing and that `0.0` are precisely what
 * the in-place rewrite destroyed. A fixture written by JSON.stringify would
 * have passed against the broken tool. */
function pyLine(obj) {
  const body = Object.keys(obj).sort().map(k => {
    const v = obj[k];
    const s = (typeof v === 'number' && Number.isInteger(v) && k === 'availability_at_my_next_pick')
      ? v.toFixed(1) : JSON.stringify(v);
    return JSON.stringify(k) + ': ' + s;
  }).join(', ');
  return '{' + body + '}';
}

function writeLog() {
  const rows = [];
  for (let pick = 1; pick <= 20; pick++) {
    const mine = pick % 10 === (MY_SLOT % 10);
    rows.push(pyLine({
      pick,
      team_slot: mine ? MY_SLOT : (MY_SLOT === 1 ? 2 : 1),
      player_id: String(1000 + pick),
      player_name: 'Player ' + pick,
      position: 'RB',
      is_keeper: false,
      availability_at_my_next_pick: 0,
      freeze_sha256: SHA,
      my_deviation_reason: null,
    }));
  }
  fs.writeFileSync(LOG, rows.join('\n') + '\n');
}

const myPicks = () => fs.readFileSync(LOG, 'utf8').trim().split('\n')
  .map(JSON.parse).filter(r => r.team_slot === MY_SLOT);

function reasonsDoc(overrides) {
  const mine = myPicks().slice(0, 2);
  return Object.assign({
    freeze_sha256: SHA,
    entries: mine.map((r, i) => ({
      pick: r.pick, player_id: r.player_id,
      reason_code: ['took_the_pick', 'position_need'][i],
      recorded_at: '2027-08-28T23:0' + i + ':00Z',
    })),
  }, overrides || {});
}

function run(doc, extra) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(doc));
  try {
    const out = execFileSync('node', [TOOL, f].concat(extra || []), {
      encoding: 'utf8',
      env: Object.assign({}, process.env,
        { DRAFT_PICK_LOG_PATH: LOG, DRAFT_PICK_REASONS_PATH: SIDE }),
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const sha = p => fs.existsSync(p)
  ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null;

/* ── CONTROL: the fixture is shaped like the real thing ─────────────────── */
writeLog();
{
  const raw = fs.readFileSync(LOG, 'utf8').split('\n')[0];
  ck('CONTROL: the scratch log is written Python-style — spaced separators and '
    + 'a real 0.0 — so a JS rewrite would visibly damage it',
    raw.includes('": ') && raw.includes('"availability_at_my_next_pick": 0.0'), raw.slice(0, 90));
  ck('CONTROL: the scratch log gives our seat some picks, or every case below '
    + 'would pass vacuously',
    myPicks().length >= 2, myPicks().length);
}

/* ── THE LOAD-BEARING ONE ──────────────────────────────────────────────── */
{
  const before = sha(LOG);
  const r = run(reasonsDoc());
  ck('a valid merge succeeds', r.code === 0, r.out);
  ck('THE PICK LOG IS BYTE-IDENTICAL AFTERWARDS — this is the assertion the '
    + 'first rehearsal failed, and it failed by rewriting 150 lines to '
    + 'annotate 3', sha(LOG) === before, { before, after: sha(LOG) });
  ck('the frozen prediction column still reads 0.0, not 0 — a float that '
    + 'became an int in the capture would be silent and permanent',
    fs.readFileSync(LOG, 'utf8').includes('"availability_at_my_next_pick": 0.0'));
  ck('the reasons landed in the sidecar instead', fs.existsSync(SIDE));
  const side = fs.readFileSync(SIDE, 'utf8').trim().split('\n').map(JSON.parse);
  ck('one sidecar row per reason, joined on pick, carrying the code and the board',
    side.length === 2 && side.every(x => x.pick && x.reason_code
      && x.freeze_sha256 === SHA), side);
  ck('the sidecar names the player, so a wrong join is visible rather than '
    + 'silent', side.every(x => x.player_name && x.player_id), side);
}

/* ── APPEND-ONLY: a second run over the same picks must refuse ──────────── */
{
  const before = sha(SIDE);
  const r = run(reasonsDoc());
  ck('re-merging picks that already carry a reason REFUSES', r.code === 1, r.out);
  ck('  ...and names them', /already carry a recorded reason: /.test(r.out), r.out);
  ck('  ...and writes nothing', sha(SIDE) === before);
}

/* ── THE REFUSALS. A guard that has only ever succeeded is untested. ────── */
const refusals = [
  ['a reasons file from a DIFFERENT board',
    reasonsDoc({ freeze_sha256: 'b'.repeat(64) }), /different drafts/],
  ['a reasons file with NO board at all',
    reasonsDoc({ freeze_sha256: undefined }), /carries no freeze_sha256/],
  ['a reason attached to SOMEONE ELSE\'S pick',
    (() => { const d = reasonsDoc();
      const other = fs.readFileSync(LOG, 'utf8').trim().split('\n').map(JSON.parse)
        .find(r => r.team_slot !== MY_SLOT);
      d.entries = [{ pick: other.pick, player_id: other.player_id,
        reason_code: 'my_read', recorded_at: 'x' }];
      return d; })(), /not yours/],
  ['a reason for a player the room did not take',
    (() => { const d = reasonsDoc(); d.entries[0].player_id = '999999'; return d; })(),
    /does not describe this pick/],
  ['an unknown reason code',
    (() => { const d = reasonsDoc(); d.entries[0].reason_code = 'vibes'; return d; })(),
    /unknown reason code/],
  ['an empty reasons file', reasonsDoc({ entries: [] }), /carries no entries/],
];
for (const [name, doc, re] of refusals) {
  fs.rmSync(SIDE, { force: true });
  const before = sha(LOG);
  const r = run(doc);
  ck('REFUSES: ' + name, r.code === 1 && re.test(r.out), r.out.slice(0, 200));
  ck('  ...and leaves the pick log untouched', sha(LOG) === before);
  ck('  ...and writes no sidecar', !fs.existsSync(SIDE));
}

/* ── --dry-run really is dry ────────────────────────────────────────────── */
{
  fs.rmSync(SIDE, { force: true });
  const before = sha(LOG);
  const r = run(reasonsDoc(), ['--dry-run']);
  ck('--dry-run reports and writes nothing at all',
    r.code === 0 && !fs.existsSync(SIDE) && sha(LOG) === before, r.out);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n%d passed, %d failed', pass, fail);
process.exitCode = fail ? 1 : 0;
