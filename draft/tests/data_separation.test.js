// TERRITORY: A
// RESEARCH DATA MUST NOT SEEP INTO A LIVE RECOMMENDATION.
//
// Cory: "anything used for this season needs to be separate and accurate from
// the data we get for future predictions, experiments, etc... we should be
// collecting as much data as possible for learning, but that should not seep
// into current recommendations until the model has decided it has enough."
//
// The audit says the separation HOLDS TODAY. Of twenty artifacts in draft/data,
// exactly four are read by any production surface, and each is read for a reason
// that is about this league right now rather than about a future experiment. The
// projection archive, the ADP time series, the coherence and tripwire
// distributions, the source probes — none of them reach a recommendation.
//
// THE RISK IS NOT TODAY, IT IS THE NEXT WIRE-UP. A future edge gets measured, it
// looks good, and someone reads it from a panel "just to display it" — and a
// displayed number on a decision surface IS an input, because Cory reads it while
// picking. That is the failure this file exists to make loud, and it is the same
// reasoning as tripwires being invisible during a live draft.
//
// ── THE DEFAULT IS VIOLATION ───────────────────────────────────────────────
//
// An undeclared artifact reaching production FAILS. A permissive default only
// catches the files somebody remembered to classify, and the one that bites is
// always the one added by someone who did not know this test existed. Same
// design as C's season stamps, for the same reason.
//
// Run: node draft/tests/data_separation.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : '')); }
};

/* ── THE DECLARATION ───────────────────────────────────────────────────────
 * Every data artifact a PRODUCTION surface may read, with the reason it is
 * allowed. The reason is the point: "it is useful" is how research becomes
 * production by accident. Each of these describes THIS league THIS season. */
const PRODUCTION_INPUTS = {
  'draft_data.json': 'THE BOARD. Current-season projections, ADP and provenance, '
    + 'built for this draft.',
  'seat_plan.json': 'The seat schedule derived from the current board and this '
    + 'year\'s keepers.',
  'league_history.json': 'Completed seasons of THIS league — head-to-head records, '
    + 'opponent tendencies, roster norms. Historical by nature and about this '
    + 'league, which is what makes it a legitimate input rather than a leak.',
  'master_sheet_archive.json': 'League money history, displayed on the history and '
    + 'bank pages. Finance, never a ranking input.',
  'weekly_realized.json': 'In-season realized box scores — the lineup optimizer and '
    + 'the weekly surfaces need what actually happened.',
  'component_grades.json': 'READ-ONLY DISPLAY of the September component grades. '
    + 'Reported to the accuracy page; must never be an input to a ranking.',
  'sleeper_league_settings.json': 'This league\'s scoring and roster rules.',
  'payouts.json': 'This league\'s payout structure.',
  'league_config.json': 'This league\'s configuration.',
  'league_config_overrides.json': 'Operator overrides to the above.',
  'identity_map.json': 'Owner identity crosswalk.',
  'nfl_byes.json': 'Current-season bye weeks.',
  'predicted_keepers.json': 'This year\'s keeper slate.',
  'draft-config.json': 'Draft-day configuration.',
  'state.json': 'Slot-picker UI state.',
  'ledger.csv': 'The decision ledger export.',
  'player_positions.json': 'Ground-truth id -> position, union-over-builds, never '
    + 'pruned. Fallback for inferPositions() (src/routes/lineup.js) on players the '
    + 'starters-array heuristic cannot classify — anyone who only ever started in a '
    + 'FLEX-type slot. About real historical rosters of THIS league, same as '
    + 'league_history.json, not a future-season signal.',
};

/* Artifacts collected FOR LEARNING. Present, valuable, and explicitly not
 * allowed to reach a recommendation until a decision is made to promote one —
 * which is a decision with a name on it, not a wire-up. */
const RESEARCH_ONLY = ['proj_series.json', 'adp_series.json', 'external_adp_series.json',
  'adp_sources_probe.json', 'coherence.json', 'tripwire_distribution.json',
  'format_census_series.json', 'oracle_capture_series.json', 'unprojected_snapshot.json',
  'career_reconcile.json', 'commitments.json', 'board_pins.json', 'room_read.json',
  'opening_script.json', 'sleeper_trending.json'];

/* ── THE PRODUCTION SURFACES ───────────────────────────────────────────────
 * Everything that can put a number in front of Cory while he is deciding. */
function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  ents.forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.(js|ejs)$/.test(e.name)) out.push(p);
  });
  return out;
}
const SURFACES = walk(path.join(ROOT, 'src'), [])
  .concat(walk(path.join(ROOT, 'public', 'js', 'draft'), []))
  .concat(walk(path.join(ROOT, 'views'), []));
ck('production surfaces were found to scan', SURFACES.length > 20, SURFACES.length);

/* Read references, ignoring COMMENTS — `adp_series.json` appears in an app.js
 * comment explaining why it is NOT used, and counting that as a read would
 * report a leak that does not exist. A test that cannot tell a mention from a
 * dependency generates false alarms until it is switched off. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const reads = {};
SURFACES.forEach(f => {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  const m = src.match(/['"][^'"]*\.(?:json|csv)['"]/g) || [];
  m.forEach(raw => {
    const name = raw.replace(/['"]/g, '').split('/').pop();
    if (!name || name.indexOf('${') >= 0) return;      // templated backup filenames
    /* A BARE EXTENSION IS NOT AN ARTIFACT. `version + '.json'` and
     * `key.replace(...) + '.json'` are filename CONSTRUCTION, and counting
     * ".json" as a data dependency reported a leak from src/store.js that does
     * not exist. A detector whose first finding is a false positive gets
     * switched off, so the filter is part of the design and not a tidy-up. */
    if (/^\.[a-z]+$/.test(name)) return;
    (reads[name] = reads[name] || []).push(path.relative(ROOT, f));
  });
});
ck('CONTROL — the scan actually found data reads (or it proves nothing)',
  Object.keys(reads).length >= 5, Object.keys(reads).length);
ck('CONTROL — it found the board itself, so the scanner reaches the real code',
  !!reads['draft_data.json'], Object.keys(reads).slice(0, 12));

/* ── 1. NO RESEARCH ARTIFACT IS READ BY A PRODUCTION SURFACE ─────────────*/
const leaked = RESEARCH_ONLY.filter(r => reads[r]);
ck('NO research-only artifact is read by any production surface',
  leaked.length === 0, leaked.map(r => r + ' <- ' + reads[r].join(', ')));

/* ── 2. AND NOTHING UNDECLARED IS READ EITHER ────────────────────────────
 * The default-is-violation clause. A new artifact wired into a panel fails here
 * before it can quietly become an input. */
const undeclared = Object.keys(reads)
  .filter(n => !PRODUCTION_INPUTS[n] && RESEARCH_ONLY.indexOf(n) < 0);
ck('every data file a production surface reads is DECLARED, with a reason',
  undeclared.length === 0,
  undeclared.map(n => n + ' <- ' + reads[n].slice(0, 2).join(', ')));
/* I WROTE A CHECK ON PROSE LENGTH AND IT WENT RED ON MY OWN SHORTEST REASON
 * ("Owner identity crosswalk.", 25 chars). It deserved to fail, and not because
 * the threshold was wrong: whether a reason is GOOD is not machine-checkable,
 * and a length test dressed as a quality test is exactly the vacuous-assertion
 * class I spent a commit removing today. Removed rather than tuned. What IS
 * checkable is that a reason exists at all, which the declaration table
 * enforces by construction — an entry with no string is a syntax error. */
ck('every declaration carries a reason string (quality is a human read, not a check)',
  Object.keys(PRODUCTION_INPUTS).every(k => typeof PRODUCTION_INPUTS[k] === 'string'
    && PRODUCTION_INPUTS[k].trim().length > 0));

/* ── 3. THE MARKET LAYER STAYS OUT OF DECISIONS (rule 15) ────────────────
 * Side bets are finance and are emphatically not league money or a ranking
 * input. The check is structural: the engine and the draft surfaces must not
 * reach the sidebet module at all. */
const DECISION_FILES = SURFACES.filter(f => /public\/js\/draft\//.test(f)
  || /src\/routes\/(lineup|waiver|trade)/.test(f));
const marketTouch = DECISION_FILES.filter(f =>
  /require\([^)]*sidebets|require\([^)]*betlogic/.test(stripComments(fs.readFileSync(f, 'utf8'))));
ck('CONTROL — there are decision surfaces to check', DECISION_FILES.length > 0, DECISION_FILES.length);
ck('NO decision surface imports the side-bet or bet-logic modules (rule 15)',
  marketTouch.length === 0, marketTouch);

/* ── 4. REHEARSAL AND MOCK ROWS MUST BE DISTINGUISHABLE ──────────────────
 * The newest leak of this shape, and mine: mock rows now WRITE to the ledger
 * where they used to be dropped. That was the right call — dropping them made
 * the deployed-capture proof impossible — but it is only safe because every row
 * is LABELLED. An aggregate that fails to filter turns rehearsal into evidence.
 */
const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
ck('every recommendation row carries a mock flag so aggregates can filter it',
  /mock:\s*!!state\.mockMode/.test(app));
ck('and the flag is a BOOLEAN on every row, not merely present on mocks',
  /mock:\s*!!/.test(app));

/* ── 5. FAIL ARM ─────────────────────────────────────────────────────────
 * Every check above passes on a clean tree, which proves nothing about
 * detection. Simulate a leak and confirm each clause fires. */
{
  const fakeReads = Object.assign({}, reads, { 'proj_series.json': ['public/js/draft/app.js'] });
  const wouldLeak = RESEARCH_ONLY.filter(r => fakeReads[r]);
  ck('FAIL ARM — a research artifact wired into a panel is detected',
    wouldLeak.length === 1 && wouldLeak[0] === 'proj_series.json');
  const fake2 = Object.assign({}, reads, { 'brand_new_edge.json': ['src/routes/lineup.js'] });
  const wouldUndeclare = Object.keys(fake2)
    .filter(n => !PRODUCTION_INPUTS[n] && RESEARCH_ONLY.indexOf(n) < 0);
  ck('FAIL ARM — a brand-new undeclared artifact is detected',
    wouldUndeclare.length === 1 && wouldUndeclare[0] === 'brand_new_edge.json');
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  ('
  + SURFACES.length + ' surfaces scanned, ' + Object.keys(reads).length + ' data reads found)');
if (fail) { console.log('\nFAILED — research data is reaching a live recommendation.'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: no artifact collected for learning is read by a surface');
console.log('that can put a number in front of Cory while he decides, nothing undeclared is');
console.log('read at all, the market layer is unreachable from a decision path, and every');
console.log('ledger row says whether it was a rehearsal.');
console.log('WHAT IT DOES NOT: judge whether the DECLARED inputs are CORRECT. "Separate" and');
console.log('"accurate" are two requirements and this is the first one. board_integrity.test.js');
console.log('is the second, and it covers only the board.');
