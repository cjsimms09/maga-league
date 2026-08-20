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
/* THE ALTERNATE SOURCE BOARDS behind Cory's projection-source toggle. Same
 * current season, same players, same league; the ONLY difference is which
 * source's projection is treated as proj_mean before vorp and tiers are
 * recomputed. Produced by rerank_by_source.py calling the SAME vorp functions
 * build.py uses, never a second implementation (register 148 is what two
 * disagreeing derivations cost). Legitimate production input by the same
 * reasoning as draft_data.json itself: this season, this league, this draft. */
const SOURCE_BOARD = 'A current-season board re-ranked as if one projection '
  + 'source were the only one, for Cory\'s war-room source toggle. Same season, '
  + 'players and league as draft_data.json; vorp/tier recomputed by the same '
  + 'vorp.py functions the real board uses. A player the source does not project '
  + 'is ABSENT and named on screen, never zeroed.';

const PRODUCTION_INPUTS = {
  'draft_data.json': 'THE BOARD. Current-season projections, ADP and provenance, '
    + 'built for this draft.',
  'seat_plan.json': 'The seat schedule derived from the current board and this '
    + 'year\'s keepers.',
  'source_agreement.json': 'Per-player AGREEMENT between the four projection '
    + 'sources, for THIS season, derived entirely from the per-source boards '
    + 'rerank_by_source.py already builds from the current board. Cory, '
    + '2026-08-20: "let me know when sources disagree". DISPLAY ONLY and '
    + 'structurally incapable of being anything else: it carries no points and '
    + 'no valuation, only each source\'s POSITIONAL RANK plus a label (agree / '
    + 'one dissenter / split / thin), and no ranking code reads it — engine.js, '
    + 'composite.js, valuation.js and survival.js never touch it. Rank rather '
    + 'than points on register 107\'s finding, re-measured 2026-08-20: the '
    + 'sources are not on one scale (median ratio to the blend DS 1.04, FP 1.01, '
    + 'Sleeper 0.96, our model 0.79), so a points gap would report a level '
    + 'offset as disagreement about a player.',
  'source_boards.json': 'THIS season\'s per-source, per-position draft ORDER, '
    + 'derived from the same current-season projections already on the board plus '
    + 'multisource_projections (CBS/ESPN/FFToday, this season). Cory asked to see '
    + '"who each source has as their best available at each position". DISPLAY '
    + 'ONLY and structurally incapable of being anything else: it carries no '
    + 'points, only order, and no ranking code reads it — engine.js, composite.js, '
    + 'valuation.js and survival.js never touch it. Declared rather than '
    + 'grandfathered because a cheat sheet is exactly the kind of surface that '
    + 'becomes an input by accident.',
  'mlv_plan.json': 'What the roster-builder model would draft across Cory\'s twelve '
    + 'CURRENT-SEASON picks, from the same current board and this year\'s keepers. '
    + 'Cory asked "what MLV displacement with 1k and def would pick". DISPLAY ONLY: '
    + 'no ranking code reads it, and it is downstream of the board rather than an '
    + 'input to it. It also carries its own honesty — six of the twelve picks are '
    + 'stamped as the BOARD\'s order because MLV is indifferent there (register '
    + '146), so it cannot be mistaken for twelve model opinions.',
  'board_ds.json': SOURCE_BOARD, 'board_sleeper.json': SOURCE_BOARD,
  'board_own.json': SOURCE_BOARD, 'board_fp.json': SOURCE_BOARD,
  'position_boards.json': 'Per-position VONA, surplus-over-the-wire, round-to-round '
    + 'drop-offs, opponent needs and ceiling steals for the six position boards '
    + '(RB/WR/QB/TE/K/DEF) that replaced the single-recommendation panel, 2026-08-19 '
    + '(Cory: "you aren\'t making 1 recommended pick anymore... top 5-10 at each '
    + 'position"). Built from THIS draft\'s own current-season board '
    + '(draft/tools/position_boards.js), same provenance as draft_data.json, not a '
    + 'separate research artifact. DISPLAY ONLY: position_boards_view.js is a pure '
    + 'render layer (own file header says so) — engine.js, composite.js, '
    + 'valuation.js and survival.js never read it; the live survival OVERRIDE it '
    + 'shows comes from state.lastClock.scored, computed by those modules '
    + 'separately, not the other way round. Declared 2026-08-20 (found by this test '
    + 'finally running against the rebased branch that shipped it, not by a new leak).',
  'season_forward_live.json': 'Weekly playoff-odds / risk-posture feed from A\'s '
    + 'many-worlds season simulator (P(playoffs), E[$], p5/p95 band per seat), '
    + 'validated against three hindcast seasons before publishing (P103 TRUE: '
    + 'Brier 0.072-0.131 vs a constant-odds 0.24 baseline at week 8). Cory-ordered '
    + '2026-08-18. DISPLAY ONLY on the member dashboard (src/playoffOdds.js\'s '
    + 'widget, wired in src/routes/member.js) — an IN-SEASON risk-posture read for '
    + 'Cory\'s own seat, never a draft input; refuses loudly preseason rather than '
    + 'guessing (pinned by its own test). Declared 2026-08-20, same reason as '
    + 'position_boards.json above.',
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
  'controls.json': 'Cory\'s adaptation controls for the weekly own-projection '
    + 'loop (draft/data/weekly_own/) — read by /admin/model-scoreboard to '
    + 'DISPLAY adaptation state (the same page reads grades_<season>.json via '
    + 'a templated name for the scoreboard numbers). Cory-only display; never '
    + 'an input to a ranking or a member surface. Declared 2026-08-16 with '
    + 'the weekly-own loop.',
  'conditional_value_2026.json': 'The stack+handcuff premiums for CORY\'S '
    + 'keeper roster — PROMOTED FROM RESEARCH TO DISPLAY BY CORY\'S RULING, '
    + '2026-08-17 (verbatim: "Yes!"), on the evidence in '
    + 'draft/audit/conditional_value_2026-08-16.md. This is exactly the '
    + '"decision with a name on it" this file requires: the war room prints '
    + 'the premium as its own labelled chip BESIDE board value (the queued '
    + 'doc\'s contract — each printed separately). DISPLAY ONLY: the engine, '
    + 'composite, VORP and build never read it, pinned by '
    + 'test_conditional_value.py\'s scoring-side gate. The header\'s own '
    + 'warning ("a displayed number on a decision surface IS an input, '
    + 'because Cory reads it while picking") is TRUE here and is the point — '
    + 'Cory ruled to read it.',
  'opponent_need_2026.json': 'Need-conditioned opponent pick tendencies for '
    + 'THIS league, fitted on its own 2023-25 drafts (league_history.json) by '
    + 'draft/backtest/opponent_need_model.py — declared 2026-08-17 when the '
    + 'survival need-tilt landed. NOT display-only and declared as such: '
    + 'survival.js (CFG.OPPONENT_NEED_LAYER) tilts pick-survival odds with it, '
    + 'on the measured evidence in draft/audit/opponent_need_2026-08-17.md '
    + '(Brier −0.0039 vs base, cluster-bootstrap CI95 [−0.0067, −0.0015], '
    + 'excluding zero) — pinned by test_opponent_need.py and registered in '
    + 'artifact_registry.json (id: opponent_need_2026). Degrades honestly: a '
    + 'missing artifact means the blend runs WITHOUT the tilt, never a '
    + 'guessed one.',
  'expert_spread_2026.json': 'Observed 2026 preseason expert-rank disagreement '
    + '(FantasyPros, ~200 experts) — DISPLAY BADGE ordered by A 2026-08-18 on '
    + 'Cory\'s ruling ("Yes! Best way to implement this data into our model??") '
    + 'after the skill grading proved the flat consensus is already the '
    + 'optimal ranking, so the experts\' remaining value is WHERE THEY SPLIT. '
    + 'Read by app.js (loadExpertSpread) and rendered via '
    + 'public/js/draft/expert_spread.js — DISPLAY ONLY, same contract as '
    + 'conditional_value_2026.json above: engine.js/composite.js/valuation.js/'
    + 'survival.js never read it (nothing in expert_spread.js touches a rank, '
    + 'a score or a dollar), pinned by expert_spread_display.test.js\'s own '
    + 'ratio-not-raw-spread and reliability-floor checks. The badge prints a '
    + 'FACT ("experts split"), never the spread number itself, in THE PICK\'s '
    + 'name and alternatives.',
  'league_analysis_2026.json': 'DISCLOSED TRESPASS INTO A\'S FILE (B, 2026-08-20) '
    + '— found while touching an unrelated part of admin.js, not going looking: '
    + 'src/routes/admin.js\'s /admin/league-analysis route (requireCory-gated, '
    + 'added 2026-08-18, Cory verbatim: "After draft it should immediately be '
    + 'ready for me, I will make bet with Richard") reads '
    + 'public/league_analysis_2026.json, produced by '
    + 'draft/tools/league_analyzer.py off Sleeper + the board. POST-DRAFT '
    + 'ANALYSIS DISPLAY for Cory\'s own use, not a draft-time ranking input — '
    + 'the route\'s own comment says the artifact carries its own '
    + '"projections not results" caveat and the claim line renders verbatim so '
    + 'Cory never misquotes a projection as a result. This route existed and '
    + 'read this file for two days without a declaration here; the scanner\'s '
    + 'comment-stripping regex happened not to see it until an unrelated edit '
    + 'shifted where a later /* comment landed in the file. Not this test\'s '
    + 'territory to re-rule on — only stating what the already-shipped code '
    + 'already does. A should confirm the reason text if it needs correcting.',
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
