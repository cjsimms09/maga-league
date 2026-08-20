/* TERRITORY: A
 *
 * ONE SCOPE, READ EVERYWHERE — the test that makes that claim checkable.
 *
 * Cory, 2026-08-20: "We really just need to focus on top 200 players maybe 250"
 *
 * Before that ruling landed, the depth a number was computed over was decided
 * by whoever wrote the line: rerank_by_source.py cut at 150, the war room's
 * source buttons counted all 700, three probes used 150/200/250. Nothing failed
 * when they disagreed, which is why they disagreed for weeks.
 *
 * The ruling now lives in ONE place — league_config.json's `draftable_scope` —
 * and has three readers:
 *
 *   draft/draftable_scope.py      Python tools (rerank_by_source.py, build.py)
 *   board.league.draftable_scope  carried to the browser by build.py
 *   app.js SCOPE_FALLBACK         the client's fallback for a pre-ruling board
 *
 * The third is the dangerous one. It exists because the live board was built
 * 2026-08-19, before the block did, so without a fallback the panel would show
 * nothing at all until the next rebuild. But a fallback is a second copy of the
 * numbers, and a second copy that nothing checks is exactly the drift this
 * change was meant to end. So: THIS SUITE FAILS IF THE FALLBACK STOPS MATCHING
 * THE CONFIG. Change the config, this goes red until the client agrees.
 *
 * Every check below is BREAK-FIRST: each one is proven to fail against a
 * deliberately broken input before it is trusted against the real one. A check
 * that has never been seen to fail is decoration.
 *
 * Run: node draft/tests/draftable_scope_is_one_definition.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fails.push(name + (detail ? ' — ' + detail : ''));
}

const CFG = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const APP = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const SB = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'draft', 'source_board.js'), 'utf8');

/* ---- 1. THE CONFIG BLOCK EXISTS AND IS SHAPED ------------------------- */

const S = CFG.draftable_scope;
check('config carries draftable_scope', S && typeof S === 'object');
check('scope quotes Cory verbatim',
  !!(S && typeof S.cory_ruling_verbatim === 'string'
     && /top 200 players maybe 250/.test(S.cory_ruling_verbatim)),
  S && S.cory_ruling_verbatim);

/* `drafted` is DERIVED, not typed. If someone changes league size and leaves
 * 150 behind, the whole scope is silently wrong. */
check('drafted === teams * rounds (derived, not asserted)',
  !!(S && S.drafted === CFG.teams * CFG.rounds),
  S ? S.drafted + ' vs ' + (CFG.teams * CFG.rounds) : 'no block');
check('scope widens: drafted <= focus <= outer',
  !!(S && S.drafted <= S.focus && S.focus <= S.outer),
  S ? [S.drafted, S.focus, S.outer].join('/') : 'no block');

/* ---- 2. THE PYTHON READER AGREES WITH THE RAW CONFIG ------------------ */

let py = null;
try {
  py = JSON.parse(execFileSync('python3',
    ['-c',
      'import sys, json; sys.path.insert(0, "draft"); import draftable_scope as d; '
      + 'print(json.dumps(d.load()))'],
    { cwd: ROOT, encoding: 'utf8' }));
} catch (e) {
  fails.push('draftable_scope.py did not load — ' + (e.stderr || e.message));
}
if (py) {
  check('python reader: drafted matches config', py.drafted === S.drafted,
    py.drafted + ' vs ' + S.drafted);
  check('python reader: focus matches config', py.focus === S.focus,
    py.focus + ' vs ' + S.focus);
  check('python reader: outer matches config', py.outer === S.outer,
    py.outer + ' vs ' + S.outer);
}

/* THE READER MUST REFUSE, NOT GUESS. A missing block has to raise — if it
 * quietly substituted a default we would be back to an invented cutoff, which
 * is the entire defect. Proven by feeding it a config with the block removed. */
let refused = false;
try {
  execFileSync('python3',
    ['-c',
      'import sys, json; sys.path.insert(0, "draft"); import draftable_scope as d; '
      + 'cfg = json.load(open("draft/config/league_config.json")); '
      + 'cfg.pop("draftable_scope", None); d.load(cfg)'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
} catch (e) { refused = /no draftable_scope/i.test(String(e.stderr || '')); }
check('KNOWN NEGATIVE: reader RAISES on a config with no scope block', refused);

/* And it must refuse a STALE derived value rather than trusting the typed one. */
let caughtStale = false;
try {
  execFileSync('python3',
    ['-c',
      'import sys, json; sys.path.insert(0, "draft"); import draftable_scope as d; '
      + 'cfg = json.load(open("draft/config/league_config.json")); '
      + 'cfg["teams"] = 12; d.load(cfg)'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
} catch (e) { caughtStale = /stale/i.test(String(e.stderr || '')); }
check('KNOWN NEGATIVE: reader RAISES when drafted no longer equals teams*rounds',
  caughtStale);

/* ---- 3. THE CLIENT FALLBACK AGREES WITH THE CONFIG -------------------- */

const fbMatch = APP.match(
  /const SCOPE_FALLBACK\s*=\s*\{\s*drafted:\s*(\d+),\s*focus:\s*(\d+),\s*outer:\s*(\d+)\s*\}/);
check('app.js declares SCOPE_FALLBACK in the expected shape', !!fbMatch);
if (fbMatch) {
  const fb = { drafted: +fbMatch[1], focus: +fbMatch[2], outer: +fbMatch[3] };
  check('client fallback drafted matches config', fb.drafted === S.drafted,
    fb.drafted + ' vs ' + S.drafted);
  check('client fallback focus matches config', fb.focus === S.focus,
    fb.focus + ' vs ' + S.focus);
  check('client fallback outer matches config', fb.outer === S.outer,
    fb.outer + ' vs ' + S.outer);
}

/* THE PATH INTO state. Written as `state.league.draftable_scope` first, which
 * does not exist on this object — the scope would have read as absent forever
 * and the fallback would have been permanent, invisibly. */
check('client reads state.data.league.draftable_scope, not state.league',
  /state\.data && state\.data\.league && state\.data\.league\.draftable_scope/.test(APP));
check('KNOWN NEGATIVE: no bare state.league.draftable_scope read survives',
  !/[^.]\bstate\.league\.draftable_scope/.test(APP));

/* ---- 4. BUILD.PY PUTS IT ON THE BOARD --------------------------------- */

const BUILD = fs.readFileSync(path.join(ROOT, 'draft', 'build.py'), 'utf8');
check('build.py emits league.draftable_scope',
  /"draftable_scope":\s*_draftable_scope\(cfg\)/.test(BUILD));
check('build.py derives it from the shared reader, not a literal',
  /def _draftable_scope[\s\S]{0,600}draftable_scope_mod\.load\(cfg\)/.test(BUILD));

/* ---- 5. THE PANEL CORY READS IS SCOPED -------------------------------- */

const RS = (function () {
  const a = APP.indexOf('function renderRankSourcePanel()');
  if (a < 0) return '';
  /* Bounded by the next top-level function, never a fixed character count —
   * a fixed slice silently drops code the moment a comment is added above it,
   * which turned two checks red in source_rerank_is_real.test.js for no
   * behaviour change at all. */
  const b = APP.indexOf('\n  function ', a + 10);
  return APP.slice(a, b > a ? b : APP.length);
}());
check('renderRankSourcePanel found', RS.length > 200, RS.length + ' chars');
check('panel derives its depth from draftableScope(), not a literal',
  /draftableScope\(\)\.focus/.test(RS));
check('panel passes that depth into SourceBoard.coverage',
  /SourceBoard\.coverage\(state\.board,\s*s\.key,\s*depth\)/.test(RS));
check('KNOWN NEGATIVE: the button count is no longer the raw whole-board number',
  !/const n = cov \? cov\.covered : state\.board\.length;/.test(RS));
check('panel says WHAT the percentage is over (an unlabelled % is the same sin)',
  /top \' \+ depth \+ \' by ADP/.test(RS) || /top ' \+ depth \+ ' by ADP/.test(RS));

/* A number quoted into prose goes stale silently. The all-board figure shown
 * beside the scoped one must be COMPUTED from the board in hand.
 *
 * ⚠️ CHECKED AGAINST CODE, NOT COMMENTS. The first version of this check ran
 * against the raw slice and went red on this suite's own explanatory comment,
 * which mentions the stale figure in order to explain why it was removed. A
 * probe that matches prose is not measuring the program — same mistake as the
 * `grep "^FAILED"` that once matched documentation and nearly reported twenty
 * red suites. Comments are stripped first. */
const RS_CODE = RS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
check('the wide-vs-near comparison is computed, not a quoted measurement',
  /SourceBoard\.coverage\(state\.board,\s*s\.key\)/.test(RS_CODE)
  && !/\b\d{1,3}%['"]/.test(RS_CODE),
  (RS_CODE.match(/\b\d{1,3}%['"]/g) || []).join(','));

/* ---- 6. SourceBoard.coverage IS BACKWARD-COMPATIBLE ------------------- */

const SourceBoard = require(path.join(ROOT, 'public', 'js', 'draft', 'source_board.js'));
const fake = [];
for (let i = 0; i < 300; i++) {
  fake.push({ adp: i + 1, covered_ds: i < 250 });
}
const wide = SourceBoard.coverage(fake, 'ds');
const near = SourceBoard.coverage(fake, 'ds', 200);
check('coverage() with no depth still counts the whole array (unchanged callers)',
  wide.total === 300 && wide.covered === 250,
  JSON.stringify(wide));
check('coverage() with a depth counts only that depth',
  near.total === 200 && near.covered === 200, JSON.stringify(near));
check('KNOWN POSITIVE: the depth actually changes the answer',
  Math.round(100 * wide.covered / wide.total)
  !== Math.round(100 * near.covered / near.total),
  wide.covered + '/' + wide.total + ' vs ' + near.covered + '/' + near.total);
check('depth larger than the pool degrades to the whole pool, never throws',
  SourceBoard.coverage(fake, 'ds', 99999).total === 300);
check('coverage() still returns null for blend', SourceBoard.coverage(fake, 'blend') === null);

/* NO-ADP PLAYERS SORT LAST. If they sorted first they would fill the top-200
 * cut with players nobody has ranked, and every source would read as thin. */
const withHoles = [{ covered_ds: false }, { adp: 1, covered_ds: true },
  { adp: 2, covered_ds: true }];
check('a player with no ADP is scoped LAST, not first',
  SourceBoard.coverage(withHoles, 'ds', 2).covered === 2,
  JSON.stringify(SourceBoard.coverage(withHoles, 'ds', 2)));

/* ---- 7. THE ARTIFACTS CARRY THE SCOPE THEY WERE CUT AT ---------------- */

/* ⚠️ THE LIKELY REAL FAILURE IS AN ARTIFACT CUT AT AN OLD SCOPE. Someone edits
 * the config and does not re-run rerank_by_source.py, so public/board_*.json
 * still carries "top 200" keys while the config now says 210. The first version
 * of this section indexed straight into d.coverage['top ' + S.focus] and threw
 * a TypeError on .pct — a stack trace instead of the one sentence that names
 * the fix. It still exits non-zero, so the gate held, but a gate that reports
 * "Cannot read properties of undefined" teaches nobody anything. Every read
 * below is guarded and the diagnosis is stated. */
const depthKey = function (d, n) { return d.coverage && d.coverage['top ' + n]; };

['ds', 'sleeper', 'own', 'fp'].forEach(function (k) {
  const p = path.join(ROOT, 'public', 'board_' + k + '.json');
  if (!fs.existsSync(p)) { fails.push('public/board_' + k + '.json missing'); return; }
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  check('board_' + k + ' carries its draftable_scope',
    !!(d.draftable_scope && d.draftable_scope.focus === S.focus),
    d.draftable_scope
      ? 'artifact cut at focus ' + d.draftable_scope.focus + ', config says '
        + S.focus + ' — re-run: python3 draft/tools/rerank_by_source.py'
      : 'no scope block on the artifact — re-run rerank_by_source.py');
  const dDrafted = depthKey(d, S.drafted);
  const dFocus = depthKey(d, S.focus);
  const dOuter = depthKey(d, S.outer);
  check('board_' + k + ' reports coverage at every depth',
    !!(dDrafted && dFocus && dOuter && d.coverage && d.coverage.all),
    'missing: ' + [!dDrafted && ('top ' + S.drafted), !dFocus && ('top ' + S.focus),
      !dOuter && ('top ' + S.outer)].filter(Boolean).join(', ')
      + ' — artifact predates the current scope, re-run rerank_by_source.py');
  check('board_' + k + ' headline is the FOCUS depth, not the widest',
    !!(d.coverage_headline && d.coverage_headline.depth === S.focus),
    d.coverage_headline && String(d.coverage_headline.depth));
  /* The legacy keys the deployed client still reads must keep agreeing with
   * the new block, or a stale app.js and a fresh artifact disagree. */
  check('board_' + k + ' legacy coverage_top150_pct still matches the new block',
    !!dDrafted && d.coverage_top150_pct === dDrafted.pct,
    d.coverage_top150_pct + ' vs ' + (dDrafted ? dDrafted.pct : 'absent'));
});

/* KNOWN POSITIVE: on the real board the scope must actually MOVE a number,
 * otherwise this whole change is ceremony. Draft Sharks is the case that
 * motivated it — 35% of all 700, 94% of the top 200 on the 2026-08-19 board.
 * The bar is 30 points; the observed gap is ~59, and the bar was written down
 * before the gap was looked up rather than fitted to it (no_fit_guard). */
const dsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'board_ds.json'), 'utf8'));
const dsFocus = depthKey(dsDoc, S.focus);
check('KNOWN POSITIVE: scoping changes Draft Sharks materially (>= 30 points)',
  !!(dsFocus && dsDoc.coverage.all)
  && dsFocus.pct - dsDoc.coverage.all.pct >= 30,
  dsFocus
    ? dsDoc.coverage.all.pct + '% of all vs ' + dsFocus.pct + '% of top ' + S.focus
    : 'board_ds.json has no "top ' + S.focus + '" depth — re-run rerank_by_source.py');

/* ---- report ----------------------------------------------------------- */

console.log('\n  DRAFTABLE SCOPE — one definition, three readers\n');
console.log('    Cory: "' + S.cory_ruling_verbatim + '"');
console.log('    drafted ' + S.drafted + ' (teams x rounds)  focus ' + S.focus
  + '  outer ' + S.outer + '\n');
if (fails.length) {
  fails.forEach(function (f) { console.log('  FAILED  ' + f); });
  console.log('\n  ' + pass + ' passed, ' + fails.length + ' FAILED\n');
  process.exit(1);
}
console.log('  ' + pass + ' checks passed\n');
