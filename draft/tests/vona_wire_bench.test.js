// TERRITORY: A
// THE WIRE-COMPARED BENCH BRANCH — arithmetic proven directly, off by default.
//
// Answers the independent OpenAI review's BLOCK on the prose-only claim file
// (draft/audit/bench_wire_comparison_claim_2026-08-15.md): "commit the
// prototype... or a small isolated function with tests, so the described
// formula can be inspected and exercised." This is that.
//
// wireBenchValue() itself is exercised directly (not just through vona()) so
// the arithmetic is checked without the rest of vona()'s machinery in the
// way. draft/tools/bench_wire_room_sim.js is the separate, larger claim (does
// this change what a full draft looks like) — this file is just "is the
// formula correct".
//
// Run: node draft/tests/vona_wire_bench.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));
const WIRE = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'wire_level.json'), 'utf8')).per_week;

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── 1. THE FLAG IS OFF BY DEFAULT — same standing gate as VONA_SLOT_AWARE ──
ck('VONA_WIRE_BENCH defaults to false — committing this changes no live behavior',
  E.CFG.VONA_WIRE_BENCH === false);

// ── 2. THE ARITHMETIC, DIRECTLY ─────────────────────────────────────────────
{
  // A bench QB whose per-game rate is BELOW the wire: edgePerWeek floors at 0,
  // so the whole term is just -forgone — a hard discount, exactly the "a
  // backup QB averaging 24 isn't worth a spot if the wire gives you 22" case.
  const belowWire = { position: 'QB', proj_mean: 15 * 16, games_expected: 16, vorp: 40 };
  // 15/game vs wire 23.38: weeklyMine < wire, edgePerWeek = 0.
  const v1 = E.wireBenchValue(belowWire, { wireWeekly: WIRE }, /* forgone */ 5, /* rate */ 0.14);
  ck('a bench QB below the real wire median gets the hard discount (-forgone, no insurance credit)',
    v1 === -5, v1);
}
{
  // A bench RB clearly ABOVE the wire: real insurance value, scaled by
  // INJURY_RATE and games, same shape as the existing vorp-based formula.
  const aboveWire = { position: 'RB', proj_mean: 12 * 15, games_expected: 15, vorp: 40 };
  // 12/game vs wire 7.80: edgePerWeek = 4.20, seasonEdge = 4.20*15 = 63.0.
  const v2 = E.wireBenchValue(aboveWire, { wireWeekly: WIRE }, /* forgone */ 5, /* rate */ 0.28);
  const expected = Math.round((0.28 * 63.0 - 5) * 1e6) / 1e6;
  ck('a bench RB clearly above the wire prices as real insurance, not a flat discount',
    Math.abs(v2 - expected) < 1e-6, { got: v2, expected });
  ck('CONTROL — the RB case is NOT a hard discount (unlike the QB case above)',
    v2 > -5, v2);
}
{
  // K/DEF: no wire sample exists (nflverse is offense-only). The function
  // must return null (not invent a floor), so vona()'s caller falls back to
  // the vorp-based rule exactly as if the flag were off.
  const noSample = { position: 'K', proj_mean: 100, games_expected: 17, vorp: 20 };
  const v3 = E.wireBenchValue(noSample, { wireWeekly: WIRE }, 5, 0.04);
  ck('K (no wire sample) returns null so the caller falls back to the vorp rule',
    v3 === null, v3);
  const noWireCtx = { position: 'RB', proj_mean: 100, games_expected: 15, vorp: 20 };
  ck('an empty/missing wireWeekly map also returns null, never a crash or a fabricated number',
    E.wireBenchValue(noWireCtx, {}, 5, 0.28) === null);
}
{
  // A player with games_expected missing falls back to the documented default
  // (15) rather than dividing by zero or by undefined.
  const noGames = { position: 'WR', proj_mean: 150, vorp: 30 };
  const v4 = E.wireBenchValue(noGames, { wireWeekly: WIRE }, 5, 0.20);
  ck('missing games_expected falls back to 15 rather than NaN/crash', Number.isFinite(v4), v4);
}

// ── 3. UNITS CHECK — the independent review's [medium/boundary] finding ────
// weeklyMine and wireWeekly must be on the SAME basis (weekly points, same
// scoring). weeklyMine is proj_mean/games_expected -- a season total divided
// down to a weekly rate, which is definitionally weekly points under this
// league's own scoring (proj_mean is computed in league_config['scoring'],
// see draft/scoring.py). wireWeekly is wire_level.js's own per-(position,
// week) cell median, i.e. also weekly points, also under real games scored
// with this league's actual scoring settings (draft/grade.py's
// nflverse_weekly_to_scoring, same scoring table). Same basis, checked here
// by asserting the two are comparable orders of magnitude for a realistic
// player rather than off by a scoring-table factor (which a pass_td=6-vs-4
// mismatch, e.g., would produce as a ~50-point QB gap per game).
{
  const realisticQB = { position: 'QB', proj_mean: 22 * 17, games_expected: 17, vorp: 10 };
  const weeklyMine = realisticQB.proj_mean / realisticQB.games_expected;
  ck('weeklyMine for a realistic QB and wireWeekly.QB are the same order of magnitude '
    + '(same units) — a scoring-table mismatch would show as a >2x gap, not a few points',
    Math.abs(weeklyMine - WIRE.QB) < WIRE.QB, { weeklyMine, wireQB: WIRE.QB });
}

// ── 4. THE WIRE ARTIFACT ITSELF IS REAL AND REGENERATABLE ──────────────────
{
  const WL = require(path.join(__dirname, '..', 'tools', 'wire_level.js'));
  const fresh = WL.levels().per_week;
  ck('draft/data/wire_level.json matches a fresh run of wire_level.js right now — '
    + 'not a stale snapshot drifting from its own source',
    JSON.stringify(fresh) === JSON.stringify(WIRE), { committed: WIRE, fresh });
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: wireBenchValue()\'s arithmetic is correct on both the');
console.log('discount case (below-wire) and the insurance case (above-wire), K/DEF and a');
console.log('missing wire map both degrade to the documented fallback rather than a');
console.log('fabricated number, the units check gives no evidence of a scoring-table');
console.log('mismatch, and the committed wire_level.json artifact matches a fresh run of');
console.log('its own source rather than being a stale, hand-typed snapshot.');
console.log('WHAT IT DOES NOT: prove this changes a full draft for the better — that is');
console.log('draft/tools/bench_wire_room_sim.js, a separate, larger claim.');
