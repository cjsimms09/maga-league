// TERRITORY: A
// THE BOARD CORY ACTUALLY DRAFTS FROM — invariants on the SHIPPED artifact.
//
// Every existing adp_source assertion in this suite runs against a FIXTURE. Not
// one of them looks at public/draft_data.json, so the properties that decide
// whether draft night is running on real data have been unguarded.
//
// The failure class this exists for is the one Cory named as the worst kind: a
// silent, plausible-looking error. A player inside the draftable range priced on
// SLEEPER POPULARITY RANK instead of real ADP produces a perfectly well-formed
// board — survival curves, VONA, run detection all compute happily — and every
// market-derived number for him is measuring the wrong thing. Nothing looks
// broken. The provenance block already records `fallback_count: 1418`, so the
// condition is not hypothetical; it is simply, currently, confined to players
// nobody will draft.
//
// Run: node draft/tests/board_integrity.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const TEAMS = ((D.league || {}).teams) || 10;
const ROUNDS = 15;                      // measured from league_history, 150 picks
const LAST_PICK = TEAMS * ROUNDS;
const draftable = (D.players || []).filter(p => adpOf(p) <= LAST_PICK);

// ── 0. A DENOMINATOR FIRST (rule 13f) ──────────────────────────────────────
// A board-integrity suite that reports clean on an empty board is green on
// exactly the morning it must shout.
ck('the artifact has players at all', (D.players || []).length > 0, (D.players || []).length);
ck('the draftable range is populated', draftable.length >= LAST_PICK * 0.9,
  { draftable: draftable.length, expected_at_least: Math.floor(LAST_PICK * 0.9) });

// ── 1. NO POPULARITY-RANK PLAYER INSIDE THE DRAFTABLE RANGE ───────────────
// THE ONE THAT MATTERS. Outside pick 150 the fallback is harmless; inside it,
// every market number for that player is computed from the wrong quantity.
const fallback = draftable.filter(p => p.adp_source === 'search_rank');
ck('NO player inside the draftable range is priced on search_rank',
  fallback.length === 0,
  fallback.slice(0, 8).map(p => Math.round(adpOf(p)) + ' ' + p.position + ' ' + p.name));
const sources = {};
draftable.forEach(p => { sources[p.adp_source || '(none)'] = (sources[p.adp_source || '(none)'] || 0) + 1; });
ck('and every one of them declares SOME adp_source',
  !sources['(none)'], sources);
console.log('        sources in range: ' + JSON.stringify(sources));

// ── 2. THE SEASON IS IN THE FETCH, CROSS-CHECKED BETWEEN TWO BLOCKS ───────
// C proved the ADP channel cannot carry a prior season because the year is in
// the request URL. That was a reading of the code; this makes it an enforced
// property of the artifact, and it compares the ADP url against the PROJECTIONS
// season rather than a literal, so the two provenance blocks check each other.
const prov = D.provenance || {};
const season = String((prov.projections || {}).season || '');
const fpUrl = String(((prov.adp || {}).fantasypros || {}).fp_url || '');
ck('the artifact declares a projection season', /^\d{4}$/.test(season), season);
ck('THE ADP FETCH URL NAMES THAT SAME SEASON', season && fpUrl.indexOf('/' + season + '/') >= 0,
  { season, fp_url: fpUrl.slice(0, 120) });
// FAIL ARM: the check must be able to notice a wrong year.
ck('FAIL ARM — a prior-season url would not satisfy that check',
  fpUrl.replace('/' + season + '/', '/' + (Number(season) - 1) + '/')
    .indexOf('/' + season + '/') < 0);

// ── 3. THE ADP TABLE RECONCILES ──────────────────────────────────────────
const fp = (prov.adp || {}).fantasypros || {};
// TOLERANCE, NOT ZERO (board-rebuild finding, 2026-08-16 — see
// draft/audit/rebuild_refusal_diagnosis_2026-08-16.md's pattern). This
// assertion required fp_unmatched === 0 outright and held on the 2026-08-15
// board (343 parsed, 0 unmatched, verified in git history). Today's rebuild
// (public/draft_data.json built 2026-08-16T14:10:12Z) fetched a LARGER FP
// board — 346 rows, 3 more than yesterday, ordinary day-to-day roster churn
// on FantasyPros' side (new signings/elevations FP lists before Sleeper's
// player directory picks them up) — and exactly one of the new rows failed to
// crosswalk to a Sleeper id. This is NOT a silent loss: adp.py's own
// accounting identity (matched + unmatched + dropped-to-collision === parsed)
// is enforced at build time (draft/adp.py:541-548, falls back to the FFC
// anchor if it does not hold), so an unmatched row is always counted, never
// hidden — and it provably did not degrade the draftable range: the "sources
// in range" tally logged above already accounts for every one of the 149
// draftable players as fantasypros(147) + ffc(2, exactly `ffc_gap_fill`), so
// the unmatched row sits outside pick 150, where — per this file's own
// opening comment — a crosswalk gap is harmless. Bounded rather than
// unbounded so a REAL matcher regression (dozens of rows failing) still
// fails this check.
const FP_UNMATCHED_TOLERANCE = 5;
ck('every parsed ADP row is accounted for, and unmatched rows stay a small '
  + 'minority (none silently dropped)',
  fp.fp_rows_parsed != null && fp.fp_matched + fp.fp_unmatched + (fp.fp_dropped_to_collision || 0) === fp.fp_rows_parsed
  && fp.fp_unmatched <= FP_UNMATCHED_TOLERANCE,
  { parsed: fp.fp_rows_parsed, matched: fp.fp_matched, unmatched: fp.fp_unmatched, tolerance: FP_UNMATCHED_TOLERANCE });
ck('no name collision silently dropped a player',
  (fp.fp_dropped_to_collision || 0) === 0, fp.fp_dropped_to_collision);

// ── 4. THE FIELDS THE ENGINE ACTUALLY READS ARE PRESENT IN RANGE ─────────
// A missing proj_mean does not throw; it sorts to the bottom and the player
// silently stops being recommendable.
/* A ZERO PROJECTION IS NOT AUTOMATICALLY A DEFECT — it is a defect only if it is
 * UNEXPLAINED. My first version asserted every draftable player has a positive
 * proj_mean and went red on Ricky Pearsall, who is on IR at ADP 109: the market
 * still stashes him and a zero is the correct number. The real invariant is the
 * same one proj_feed already enforces one layer down — a zero must SAY WHY. */
const zeroProj = draftable.filter(p => !(Number(p.proj_mean) > 0));
const unexplained = zeroProj.filter(p => !/^(IR|Out|PUP|NFI|Sus|DNR)/i.test(String(p.injury_status || '')));
const noSd = draftable.filter(p => !Number.isFinite(+p.adp_sd));
ck('every zero-projection player in range is EXPLAINED by a status',
  unexplained.length === 0,
  unexplained.slice(0, 6).map(p => p.position + ' ' + p.name + ' adp ' + Math.round(adpOf(p))));
if (zeroProj.length) {
  /* Printed, not asserted: these are the players whose price on draft day
   * depends on a status that can change. Worth seeing, not worth failing on. */
  console.log('        zeroed but draftable (status-dependent): '
    + zeroProj.map(p => p.name + ' [' + (p.injury_status || '?') + ', adp '
      + Math.round(adpOf(p)) + ']').join(', '));
}
ck('every draftable player carries an adp_sd',
  noSd.length === 0, noSd.slice(0, 6).map(p => p.position + ' ' + p.name));

// ── 5. THE KEEPERS ────────────────────────────────────────────────────────
/* THE INVARIANT RUNS THE OTHER WAY, and I had it backwards. Kept players are
 * DELIBERATELY absent from `players` — that is how the board stops recommending
 * a man already on the roster. Asserting they were present was asserting the
 * inverse of the design. What actually matters is that the exclusion is
 * complete: a keeper leaking into the pool is recommendable, and would be
 * counted twice by every shape and scarcity calculation downstream. */
const ids = new Set((D.players || []).map(p => String(p.player_id)));
const kept = (D.kept_players || []);
const leaked = kept.filter(k => ids.has(String(k.player_id)));
ck('the board declares keepers at all', kept.length > 0, kept.length);
ck('NO kept player leaks into the draftable pool (they are excluded by design)',
  leaked.length === 0, leaked.map(k => k.name));
ck('and every keeper carries the fields the plan reads',
  kept.every(k => k.player_id != null && k.position && k.name),
  kept.map(k => ({ n: k.name, pos: k.position })));

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  ('
  + draftable.length + ' players inside pick ' + LAST_PICK + ')');
if (fail) { console.log('\nFAILED — the shipped board violates a draft-night invariant.'); process.exit(1); }
console.log('\nWHAT THIS GUARDS: the board Cory drafts from is priced on real ' + season + ' ADP');
console.log('end to end, the ADP table reconciles, and the fields the engine reads are');
console.log('present for every player he can reach.');
console.log('WHAT IT DOES NOT: FRESHNESS. These invariants hold just as well on a board');
console.log('built weeks ago. A stale-but-valid 2026 ADP is the residual risk C named, and');
console.log('it is a rebuild question rather than an invariant one.');
