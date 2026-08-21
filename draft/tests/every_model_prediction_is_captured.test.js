/* TERRITORY: A
 *
 * WHAT EVERY MODEL WOULD HAVE TAKEN, RECORDED BEFORE THE PICK IS MADE.
 *
 * Cory, 2026-08-20: "We might as well be capturing predictions for ALL model
 * recommendation (all the ones we've toyed with and discussed) so we can grade
 * later and learn."
 *
 * The window is one-way. What each model would have taken at pick 33, with
 * pick 33's exact pool and roster, is computable for about a second and then
 * gone forever. Miss it and the only honest answer in January is "we cannot
 * say" — which is the answer this project has had to give before.
 *
 * The nine DraftShadows strategies were already captured (`shadow_pick`). What
 * was missing is everything Cory actually reads: the board's own #1, marginal
 * lineup value, the need rule, and EACH SOURCE'S OWN top available — the last
 * being the one he keeps asking for, and the one that eventually answers which
 * source to trust on this league's own outcomes.
 *
 * THREE WAYS THIS COULD BE WORTHLESS, all checked below:
 *   1. the models could be handed DIFFERENT pools, making the slate four
 *      unrelated observations rather than a comparison;
 *   2. it could write twice for one decision, double-counting whoever was right;
 *   3. it could fail to record which pool and roster produced it, leaving a
 *      January reader unable to tell a good call from a lucky one.
 *
 * Run: node draft/tests/every_model_prediction_is_captured.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
global.window = global;
const PL = require(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'));

let pass = 0;
const fails = [];
const check = (n, ok, d) => {
  if (ok) { pass++; return; }
  fails.push(n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 260) : ''));
};

/* ── 1. THE SLATE BUILDER, PULLED OUT AND RUN ────────────────────────────── */

const a = APP.indexOf('  function modelSlateAt(');
const b = APP.indexOf('\n  function captureModelSlate(');
check('modelSlateAt() exists', a >= 0 && b > a);
if (a < 0) { fails.forEach(f => console.log('  FAILED  ' + f)); process.exit(1); }
/* ⚠️ HELPERS modelSlateAt() CALLS ARE EXTRACTED FROM app.js TOO, NOT STUBBED.
 *
 * This harness slices one function out of app.js and injects its dependencies.
 * That makes a NEW call to a NEW sibling helper a ReferenceError — swallowed by
 * modelSlateAt's own per-model try/catch, which then drops the model from the
 * slate. Which is exactly what happened when `activeWaiverBaseline()` was added
 * for register 221: this file's only symptom was `mlv.marginal` reading
 * undefined, three checks downstream of the real cause.
 *
 * Stubbing the helper would have silenced it and left the harness blind to the
 * next one. Taking the REAL source instead means this file exercises the helper
 * as shipped, and a helper that throws on a normal state still goes red here. */
const HELPERS = ['  function activeWaiverBaseline('];
const helperSrc = HELPERS.map(function (sig) {
  const h = APP.indexOf(sig);
  check('helper extracted from app.js: ' + sig.trim(), h >= 0);
  if (h < 0) return '';
  /* to the next top-level `  function ` declaration */
  const end = APP.indexOf('\n  function ', h + sig.length);
  return APP.slice(h, end > 0 ? end : h + sig.length);
}).join('\n');
const src = helperSrc + '\n' + APP.slice(a, b);

const D = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const board = D.players.filter(p => p.position && p.proj_mean != null).slice(0, 400);
const roster = (D.kept_players || []).map(k => ({
  player_id: k.player_id, name: k.name, position: k.position, proj_mean: k.proj_mean }));

/* Each stub records the pool it was handed, so check 2 can prove they matched
 * rather than assume it. */
const seenPools = [];
function build(opts) {
  opts = opts || {};
  const stubs = {
    E: { recommend: function (ctx) {
      seenPools.push({ who: 'E', n: (ctx && ctx.board || []).length });
      return [{ player: board[0], score: 91.25, gap_to_second: 4.44 }];
    } },
    RosterBuilderMLV: { recommend: function (bd) {
      seenPools.push({ who: 'mlv', n: (bd || []).length });
      return [{ player: board[1], marginal: 123.4 }];
    } },
    DraftNeedRule: { recommend: function (bd) {
      seenPools.push({ who: 'need', n: (bd || []).length });
      return { player: board[2] };
    } },
    SourceBoard: {
      SOURCES: [{ key: 'ds', label: 'Draft Sharks' }, { key: 'sleeper', label: 'Sleeper' }],
      forSource: function (bd, key) {
        seenPools.push({ who: 'src:' + key, n: (bd || []).length });
        return bd.map(function (p, i) {
          const q = Object.assign({}, p);
          q.overall_rank = key === 'ds' ? i + 1 : bd.length - i;
          q['covered_' + key] = true;
          return q;
        });
      },
    },
    state: { myRoster: roster, drafted: new Set(), data: { league: D.league },
      mockMode: opts.mock ? {} : null },
  };
  if (opts.breakE) stubs.E.recommend = function () { throw new Error('boom'); };
  // eslint-disable-next-line no-new-func
  const fn = new Function('E', 'RosterBuilderMLV', 'DraftNeedRule', 'SourceBoard',
    'state', src + '; return modelSlateAt;')(
    stubs.E, stubs.RosterBuilderMLV, stubs.DraftNeedRule, stubs.SourceBoard, stubs.state);
  return fn;
}

const slate = build()(board, { board: board });
const models = slate.map(r => r.model);

check('the board\'s own #1 is captured — "THE PICK" was not in the ledger at all',
  models.indexOf('board_composite') >= 0, models);
check('marginal lineup value is captured', models.indexOf('mlv_displacement') >= 0);
check('the need rule is captured', models.indexOf('need_rule') >= 0);
check('EACH SOURCE\'s own top available is captured — the piece Cory keeps '
  + 'asking for ("tell me what all the sources think")',
  models.indexOf('source_ds') >= 0 && models.indexOf('source_sleeper') >= 0, models);
check('every entry names a real player by id, not by name alone — names are not '
  + 'a key and January cannot join on them',
  slate.every(r => r.player_id && String(r.player_id).length > 0),
  slate.filter(r => !r.player_id));
/* The composite's score and gap are ROUNDED to 1dp on the way into the ledger.
 * That is deliberate — a ledger does not need fifteen decimals — and my first
 * version of this check asserted the raw 91.25 and failed. The CODE was right.
 * Pinned as the rounded value so the next reader does not "fix" the rounding. */
{
  const comp = slate.find(r => r.model === 'board_composite');
  const mlv = slate.find(r => r.model === 'mlv_displacement');
  check('the deciding numbers travel with the pick, or the grade cannot say WHY',
    Math.abs(comp.score - 91.25) <= 0.05 && comp.gap_to_second != null
    && mlv.marginal === 123.4,
    { score: comp.score, gap: comp.gap_to_second, marginal: mlv.marginal });
  check('and they are rounded rather than carrying float noise into the ledger',
    String(comp.score).replace(/^-?\d+\.?/, '').length <= 1, comp.score);
}

/* ── 2. ONE POOL, ONE INSTANT ────────────────────────────────────────────── */
{
  const sizes = [...new Set(seenPools.map(p => p.n))];
  check('EVERY model was handed the SAME pool — a slate built on different '
    + 'pools is four unrelated observations, not a comparison',
    sizes.length === 1 && sizes[0] === board.length, seenPools);
}

/* ── 3. ONE MODEL FAILING MUST NOT LOSE THE OTHERS ───────────────────────── */
{
  const partial = build({ breakE: true })(board, { board: board });
  const m = partial.map(r => r.model);
  check('when one model throws, the rest are still recorded — a slate is worth '
    + 'more partial than absent',
    m.indexOf('board_composite') < 0 && m.indexOf('mlv_displacement') >= 0
    && m.indexOf('source_ds') >= 0, m);
}

/* ── 4. DEDUP: ONE WRITE PER DECISION ────────────────────────────────────── */

check('PredLedger exports oncePer, so the dedup is REUSED rather than a second '
  + 'implementation in app.js', typeof PL.oncePer === 'function');
check('captureModelSlate uses it', /PredLedger\.oncePer \|\| PredLedger\.capture/.test(APP));
check('and passes a signature, without which oncePer dedups on pick alone and '
  + 'would collide with any other once-per-pick kind',
/'model_slate'[\s\S]{0,1400}\}, 'slate'\)/.test(APP));

/* ── 5. THE PAYLOAD LETS JANUARY JUDGE IT ────────────────────────────────── */
{
  const cap = APP.slice(APP.indexOf('  function captureModelSlate('),
    APP.indexOf('  function updateShadows('));
  check('the pool SIZE is recorded — the same pick from a 400-man pool and a '
    + '40-man pool are different decisions', /pool_size/.test(cap));
  check('the roster at decision time is recorded — every one of these models is '
    + 'roster-dependent', /roster:/.test(cap));
  check('rehearsal entries are FLAGGED, not dropped — a mock is a real decision '
    + 'under a real pool', /rehearsal: !!state\.mockMode/.test(cap));
  check('it names what is captured elsewhere, so a January reader knows what is '
    + 'missing rather than inferring it from an absence',
    /also_captured_separately/.test(cap));
  check('a ledger failure can never cost a pick', /catch \(e\) \{ \/\* a ledger write never costs a pick/.test(cap));
}

/* ── 6. IT RECORDS, IT DOES NOT DECIDE ───────────────────────────────────── */

check('the slate builder never writes to the board, the roster or a pick',
  !/state\.board\s*=|state\.myRoster\s*=|state\.drafted\.add/.test(src));

/* ── 7. IT IS ACTUALLY CALLED, AT THE DECISION MOMENT ────────────────────── */
{
  const us = APP.slice(APP.indexOf('  function updateShadows('),
    APP.indexOf('  function updateShadows(') + 2200);
  check('captureModelSlate is called from updateShadows — the same instant the '
    + 'shadows are asked, on the same pool', /captureModelSlate\(boardAtPick, baseCtx, round\)/.test(us));
}

console.log('\n  EVERY MODEL\'S PICK IS ON THE RECORD\n');
console.log('    captured here : ' + models.join(', '));
console.log('    already there : shadow_pick (9 strategies), doctrine,');
console.log('                    opponent_prediction, survival, runs\n');
if (fails.length) {
  fails.forEach(f => console.log('  FAILED  ' + f));
  console.log('\n  ' + pass + ' passed, ' + fails.length + ' FAILED\n');
  process.exit(1);
}
console.log('  ' + pass + ' checks passed\n');
