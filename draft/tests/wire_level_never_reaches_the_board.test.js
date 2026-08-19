/* THE WIRE-BENCH REMEDY ON FILE WOULD NOT MAKE THE FEATURE WORK.
 *
 * Register E22, and it is deliberately ADDITIVE to an existing filing rather
 * than a re-report of it. ROUTES already records (2026-08-16) that
 * `VONA_WIRE_BENCH` is dead code because the branch is unreachable while
 * `VONA_SLOT_AWARE` is false, with a ruling pending and one proposed remedy:
 * "finish slot-aware so the branch is reachable".
 *
 * THAT REMEDY IS NOT SUFFICIENT. Even reachable, the DATA never arrives.
 * `app.js:2079` reads `state.data.wire_level`; `build.py` never writes
 * `wire_level` onto the board. The measured artifact
 * `draft/data/wire_level.json` is committed and real — 422 scored acquisitions
 * across 2023-25 — and is simply not joined into `public/draft_data.json`.
 *
 * So `ctx.wireWeekly` is null in production, `wireBenchValue` returns null on
 * its first line, and every player falls back to the vorp rule — a fallback
 * whose own comment documents it as the K/DEF case ("nflverse is
 * offense-only"), i.e. a per-POSITION gap being taken by every position.
 *
 * This file pins the JOIN, not the flags. Nothing here asserts a flag should
 * flip — that is A's ruling.
 *
 * Run: node draft/tests/wire_level_never_reaches_the_board.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const BOARD = path.join(ROOT, 'public', 'draft_data.json');
const WIRE = path.join(ROOT, 'draft', 'data', 'wire_level.json');
if (!fs.existsSync(BOARD)) { console.log('SKIP  no built board'); process.exit(0); }
const ART = JSON.parse(fs.readFileSync(BOARD, 'utf8'));

// ─────────────── 1. the artifact is real, and the board does not carry it
ck('the measured wire artifact exists and is committed', fs.existsSync(WIRE));
const WL = JSON.parse(fs.readFileSync(WIRE, 'utf8'));
ck('it carries a per-position weekly level for the four offensive positions',
  ['QB', 'RB', 'WR', 'TE'].every(p => typeof WL.per_week[p] === 'number'), WL.per_week);
ck('and it is measured, not asserted — a real sample size travels with it',
  WL.scored > 100 && Array.isArray(WL.seasons) && WL.seasons.length >= 2,
  { scored: WL.scored, seasons: WL.seasons });

ck('THE JOIN IS MISSING: the published board carries no `wire_level`',
  ART.wire_level === undefined, Object.keys(ART));

// ─────────────── 2. the app reads the key the board does not have
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('app.js reads `state.data.wire_level` into ctx.wireWeekly — so the consumer '
    + 'is wired and only the producer is missing',
  /wireWeekly:\s*\(state\.data \|\| \{\}\)\.wire_level/.test(app));
}

// ─────────────── 3. the engine's guard turns absence into the K/DEF fallback
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('wireBenchValue returns null when the map is absent',
    /const wireWeekly = \(ctx && ctx\.wireWeekly\) \|\| \{\};/.test(src)
    && /if \(wire == null\) return null;/.test(src));
  ck('and the fallback is documented as the per-POSITION K/DEF case, not a '
    + 'whole-map case — which is what makes taking it wholesale wrong',
  /nflverse is offense-only/.test(src));
}

// ─────────────── 4. KNOWN-POSITIVE: the data would matter if it arrived
/* The point of the file. Force the outer flag — the remedy on file — and show
 * the wire data still changes scores, i.e. the branch reaching the code is NOT
 * the same as the branch working. CFG is exported directly and this process is
 * throwaway, so mutating it here affects nothing else. */
{
  const RP = ART.replacement.replacement_points;
  const board = ART.players;
  const keepers = ART.kept_players.map(k => Object.assign({}, k, { is_keeper: true,
    vorp: Math.round((k.proj_mean - RP[k.position]) * 100) / 100 }));
  const burrow = board.find(p => p.name === 'Joe Burrow');
  const byAdp = board.slice().sort((a, b) => (a.adjusted_adp || 9999) - (b.adjusted_adp || 9999));
  const PB = ART.pick_order.picks, MY = ART.pick_order.my_picks;
  const run = (pick, wire) => {
    const roster = keepers.concat(burrow ? [burrow] : []);
    const t = new Set();
    for (let i = 0; i < pick - 1 && i < byAdp.length; i++) t.add(String(byAdp[i].player_id));
    roster.forEach(p => t.add(String(p.player_id)));
    const ctx = { board: board.filter(p => !t.has(String(p.player_id))), roster: roster,
      currentKeepers: keepers, league: ART.league, weights: E.MEASURED_WEIGHTS,
      currentPick: pick, nextPick: MY.find(q => q > pick) || null, totalPicks: 150,
      myPicksLeft: MY.filter(q => q >= pick).length, roundsLeft: 8,
      runMultipliers: {}, intervening: [], pickBoard: PB, taken: t };
    if (wire) ctx.wireWeekly = WL.per_week;
    return E.onTheClock(ctx, { targets: [], avoid: [] }).scored;
  };

  const wasAware = E.CFG.VONA_SLOT_AWARE;
  const wasWire = E.CFG.VONA_WIRE_BENCH;
  try {
    // CONTROL: at the SHIPPED flags the data changes nothing, because the
    // branch is unreachable. That half is the existing filing, re-verified.
    E.CFG.VONA_SLOT_AWARE = false;
    const a0 = run(93, false), b0 = run(93, true);
    const m0 = new Map(a0.map(s => [s.player.player_id, s.score]));
    const moved0 = b0.filter(s => Math.abs(s.score - (m0.get(s.player.player_id) || 0)) > 0.005).length;
    ck('CONTROL: at the shipped flags, supplying the wire data changes NOTHING '
      + '(the branch is unreachable — the half already on file)', moved0 === 0, { moved: moved0 });

    // KNOWN-POSITIVE: apply the remedy on file, and the data still matters.
    E.CFG.VONA_SLOT_AWARE = true;
    const a1 = run(93, false), b1 = run(93, true);
    const m1 = new Map(a1.map(s => [s.player.player_id, s.score]));
    const moved1 = b1.filter(s => Math.abs(s.score - (m1.get(s.player.player_id) || 0)) > 0.005).length;
    ck('KNOWN-POSITIVE: with slot-aware forced true — the remedy on file — the '
      + 'wire data changes many scores, so making the branch REACHABLE is not '
      + 'the same as making it WORK', moved1 > 20, { moved: moved1 });
  } finally {
    E.CFG.VONA_SLOT_AWARE = wasAware;
    E.CFG.VONA_WIRE_BENCH = wasWire;
  }
  ck('the flags are restored, so this file cannot leak state into a shared run',
    E.CFG.VONA_SLOT_AWARE === wasAware && E.CFG.VONA_WIRE_BENCH === wasWire);
}

// ─────────────── 5. the stale self-description is gone
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('the docstring no longer says OFF BY DEFAULT while the flag is on',
    !/PROTOTYPED 2026-08-14\/15, OFF BY DEFAULT/.test(src));
  ck('and VONA_WIRE_BENCH really is on, which is what made that stale',
    E.CFG.VONA_WIRE_BENCH === true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
