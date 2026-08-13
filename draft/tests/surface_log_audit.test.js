// TERRITORY: A
/* THE LOG AUDITOR MUST CATCH A BAD LOG — PROVEN ON FIXTURES, NOT ASSUMED.
 *
 * surface_log_audit.js was written BEFORE B's artifact existed, deliberately, so
 * its checks could not be shaped by the data. That makes this file the only
 * evidence it works at all: an auditor that has never been run against a bad log
 * is precisely the trap Cory named — *"a log nobody checks is the same trap as a
 * harness nobody checks"* — one level up.
 *
 * Each fixture below breaks exactly ONE thing. If the auditor passes a fixture
 * it should fail, the auditor is the defect.
 *
 * Run: node draft/tests/surface_log_audit.test.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const AUDIT = path.join(ROOT, 'draft', 'tools', 'surface_log_audit.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'logaudit-'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

const BOARD_SHA = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'))).digest('hex');

/* A SOUND log: every row carries every field, nulls are used where a value is
 * genuinely absent, picks ascend, roster grows, panels recorded. */
function soundRows() {
  const picks = [30, 45, 50, 65];
  return picks.map((p, i) => ({
    pick: p, round: i + 3,
    player: 'Player ' + i, position: ['TE', 'RB', 'WR', 'QB'][i], board_rank: i + 1,
    score: 16.9 - i, gap_to_second: i === 0 ? 3.57 : null,
    alternatives: [{ name: 'Alt A', score: 13.3 }, { name: 'Alt B', score: 8.1 }],
    explanation: 'best value on the board at ' + ['TE', 'RB', 'WR', 'QB'][i],
    roster: new Array(3 + i).fill(0).map((_, j) => 'RosterGuy' + j),
    panels: { needrule: 'Player ' + i, composite: 'Player ' + i, grabby: null },
  }));
}
function soundDoc() {
  return { board_sha256: BOARD_SHA, commit: 'abc1234def', rows: soundRows() };
}

function run(doc, label) {
  const f = path.join(TMP, label + '.json');
  fs.writeFileSync(f, JSON.stringify(doc, null, 1));
  try {
    const out = execFileSync('node', [AUDIT, f], { encoding: 'utf8' });
    return { code: 0, out: out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// ── THE SOUND LOG MUST PASS, or every failure below is meaningless ─────────
{
  /* A SOUND LOG HAS NO FAILURES — BUT IT DOES NOT EXIT 0, AND THAT IS CORRECT.
   * The engine cross-check is deliberately unbuilt (it needs B's roster shape),
   * so it reports CANNOT AUDIT, and cannot-audit is not a pass. My first version
   * of this assertion required exit 0 and went red the moment the auditor
   * started being honest about the unbuilt check — the test was demanding the
   * silence the auditor had just stopped producing. */
  const r = run(soundDoc(), 'sound');
  const fails = r.out.split('\n').filter(l => /^FAIL/.test(l));
  ck('a SOUND log produces NO failures', fails.length === 0, fails.slice(0, 4));
  /* THESE TWO PINNED THE WORDING, AND THE WORDING WENT STALE ON 2026-08-14.
   * They required the phrase "NOT IMPLEMENTED" and "not known until B's artifact
   * lands". The artifact landed, the roster shape resolved, and the real blocker
   * turned out to be different (the log records board COUNTS, never which players
   * were taken). Keeping the old assertions would have pinned a sentence that had
   * become FALSE — a test enforcing a stale description is the same defect the
   * auditor exists to find, so it is the EXPECTATION that moves here, and the
   * reason is written down rather than silently edited.
   *
   * They now pin the INVARIANT rather than the sentence: unbuilt must not read as
   * a pass, and it must name something concrete and actionable. */
  ck('  but does not exit 0 — the unbuilt cross-check is CANNOT AUDIT, not a pass',
    r.code === 1 && /CANNOT AUDIT  cross-check the log against the engine/.test(r.out));
  ck('  and the unbuilt check names what is missing rather than going quiet',
    /BLOCKED|NOT IMPLEMENTED/.test(r.out)
    && /board state|board_left|taken player_ids|roster entry shape/i.test(r.out));
}

// ── 3. BOARD STAMP ─────────────────────────────────────────────────────────
{
  const d = soundDoc(); d.board_sha256 = 'deadbeef'.repeat(8);
  const r = run(d, 'badstamp');
  ck('a log stamped with a board we cannot identify FAILS',
    r.code !== 0 && /board stamp matches/.test(r.out) && /FAIL/.test(r.out));
}

// ── 2. ABSENT vs OMITTED ───────────────────────────────────────────────────
{
  const d = soundDoc();
  delete d.rows[2].gap_to_second;             // omitted, not nulled
  const r = run(d, 'ragged');
  ck('a log that OMITS a field on some rows FAILS',
    r.code !== 0 && /absent is recorded as null, not omitted/.test(r.out)
    && /gap_to_second/.test(r.out));
}
{
  /* The control's own control: a log with no nulls at all cannot be told from
   * one that omits rather than nulls, so the auditor must say so. */
  const d = soundDoc();
  d.rows.forEach(r0 => { r0.gap_to_second = 0; r0.panels.grabby = 'x'; });
  const r = run(d, 'nonulls');
  ck('a log that never uses null trips the vacuity control',
    /CONTROL: the log DOES use null/.test(r.out) && /FAIL/.test(r.out));
}

// ── 4. INTERNAL COHERENCE ──────────────────────────────────────────────────
{
  const d = soundDoc(); d.rows[2].pick = d.rows[1].pick;
  const r = run(d, 'dupe');
  ck('duplicate pick numbers FAIL', r.code !== 0 && /duplicate pick numbers/.test(r.out));
}
{
  const d = soundDoc(); d.rows[3].roster = ['only', 'two'];
  const r = run(d, 'shrink');
  ck('a SHRINKING roster FAILS — the mid-draft reset seen from the log side',
    r.code !== 0 && /never SHRINKS/.test(r.out));
}

// ── 5. PANELS ──────────────────────────────────────────────────────────────
{
  const d = soundDoc(); d.rows.forEach(r0 => { delete r0.panels; });
  const r = run(d, 'nopanels');
  ck('a log with no panel capture reports CANNOT AUDIT, not a pass',
    r.code !== 0 && /CANNOT AUDIT/.test(r.out) && /panels/.test(r.out));
}

// ── SHAPES IT MUST REFUSE RATHER THAN GUESS AT ─────────────────────────────
{
  const f = path.join(TMP, 'notjson.json');
  fs.writeFileSync(f, 'this is not json at all {{{');
  let code = 0, out = '';
  try { out = execFileSync('node', [AUDIT, f], { encoding: 'utf8' }); }
  catch (e) { code = e.status; out = (e.stdout || '') + (e.stderr || ''); }
  ck('a non-JSON file reports CANNOT AUDIT and exits 2', code === 2 && /CANNOT AUDIT/.test(out));
}
{
  const r = run({ board_sha256: BOARD_SHA, rows: [] }, 'emptyrows');
  ck('an EMPTY log exits 2 rather than passing vacuously', r.code === 2);
}
{
  /* JSONL is equally "one row per pick" and must be accepted. */
  const f = path.join(TMP, 'lines.jsonl');
  fs.writeFileSync(f, soundRows().map(r0 =>
    JSON.stringify(Object.assign({ board_sha256: BOARD_SHA, commit: 'abc1234def' }, r0))).join('\n'));
  let code = 0, out = '';
  try { out = execFileSync('node', [AUDIT, f], { encoding: 'utf8' }); }
  catch (e) { code = e.status; out = (e.stdout || '') + (e.stderr || ''); }
  ck('JSONL is accepted, not refused as malformed', !/not JSON and not JSONL/.test(out), out.slice(0, 200));
}

// ── AND THE AUDITOR MUST NOT HAVE BEEN TUNED TO B's DATA ───────────────────
{
  /* It was written before the artifact existed. If a log file has since landed,
   * that is fine — but this suite must still be driven by FIXTURES, not by it,
   * or the audit becomes a description of whatever B produced. */
  const src = fs.readFileSync(AUDIT, 'utf8');
  ck('the auditor states it is pre-registered', /PRE-REGISTERED/.test(src));
  ck('  and separates adapting the FIELD MAP from relaxing a CHECK',
    /adapting the FIELD map[\s\S]{0,80}legitimate/i.test(src)
    || /Adapting the FIELD MAP[\s\S]{0,120}legitimate/i.test(src));
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort */ }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
