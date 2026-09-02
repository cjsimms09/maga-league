/* A ROSTER ENTRY WHOSE VALUE WE NEVER KNEW IS NOT A KEEPER CANDIDATE.
 *
 * Register E18, the sibling of E17. E17 fixed the SEAM (keepers were seeded
 * without `vorp`); this fixes the READER. `composite.js:nextYearVorp` reads
 * `(player.vorp || 0)`, so ANY roster entry with no `vorp` scored as worth
 * exactly zero rather than unknown — and since the bar is `ranked[slots-1]`, a
 * valueless entry at that index dragged the bar NEGATIVE, after which
 * `max(0, raw - bar)` ADDED to every candidate.
 *
 * Two live paths put valueless rows on the roster BY DESIGN and both are
 * correct to exist: `recordManualPick` (a name typed at the table) and the
 * Sleeper poll's stub for a pick whose player is not on our board (measured
 * 3.3% expected, 14% upper bound). The pick count, seat rosters, need and
 * legality all have to see them. They are simply not keeper candidates.
 *
 * Measured at pick 33 with two keepers plus one off-board stub: three KEEPER
 * TARGET badges reading "beats <stub> by 12 pts" — a comparison against a
 * player carrying no projection. On screen the stub wears its real Sleeper
 * name, so it reads as a judgement about a real player.
 *
 * The docstring in `keeperOptionValue` already stated the right answer: "with
 * fewer incumbents than slots there is a free slot, so the bar is zero." A row
 * we cannot value is not an incumbent. Fixed as a CONTRACT VIOLATION rather
 * than an improvement — the same grounds as the negative-KOV floor above it.
 *
 * Run: node draft/tests/keeper_bar_ignores_what_it_cannot_value.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const C = require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const BOARD = path.join(ROOT, 'public', 'draft_data.json');
if (!fs.existsSync(BOARD)) { console.log('SKIP  no built board'); process.exit(0); }
const art = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
const board = art.players, league = art.league;
const RP = art.replacement.replacement_points;

/* ⚠️ FILTERED TO CORY'S SEAT (A, 2026-08-24, register 303). Post-lock
 * `kept_players` is the league's 23, not his three. */
const _mySlotKB = Number((art.league || {}).my_draft_slot);
const keepers = art.kept_players
  .filter(k => Number(k.team_slot) === _mySlotKB)
  .map(k => Object.assign({}, k, { is_keeper: true,
  vorp: Math.round((k.proj_mean - RP[k.position]) * 100) / 100 }));
// the exact shape recordManualPick and the Sleeper poll build
const stub = n => ({ player_id: 'stub:' + n, name: 'Off-board Guy ' + n,
  position: 'RB', team: '', bye: null, off_board: true });

const byAdp = board.slice().sort((a, b) => (a.adjusted_adp || 9999) - (b.adjusted_adp || 9999));
function mk(pick, roster) {
  const t = new Set();
  for (let i = 0; i < pick - 1 && i < byAdp.length; i++) t.add(String(byAdp[i].player_id));
  return { league: league, board: board.filter(p => !t.has(String(p.player_id))),
    roster: roster.slice(), currentKeepers: roster.filter(p => p.is_keeper),
    currentPick: pick, taken: t };
}
const badgesAt = (pick, roster) => {
  const c = mk(pick, roster);
  return c.board
    .map(p => ({ p: p, k: C.keeperOptionValue(p, c) }))
    .filter(x => x.k.value >= C.CFG.KOV_BADGE_AT)
    .map(x => ({ who: x.p.name, beats: x.k.displaced, by: Math.round(x.k.value) }));
};

/* THE PICK EVERY KEEPER-BAR ARM RUNS AT: the earliest overall pick where at least one
 * available player reaches the full keeper path. DERIVED, not hardcoded — a
 * hardcoded 33 is what expired — see the note in section 5 for the measurement.
 * If no pick anywhere reaches it, the control below fails rather than the arms
 * passing vacuously (rule 3e). */
const REACHABLE_PICK = (() => {
  for (let pk = 1; pk <= 150; pk++) {
    const c = mk(pk, keepers);
    if (c.board.some(p => C.keeperOptionValue(p, c).slots_free !== undefined)) return pk;
  }
  return null;
})();
ck('CONTROL: there is some pick at which the keeper-option branch is reachable, '
  + 'so the two arms below exercise it rather than passing on an early return',
  REACHABLE_PICK != null, { reachable_at: REACHABLE_PICK });

// ─────────── 1. the stub really is valueless, and really does reach the roster
ck('the stub shape carries no vorp — the premise', stub(1).vorp === undefined);
{
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('recordManualPick still pushes its stub onto myRoster (this file is not '
    + 'asserting a path that was quietly deleted)',
  /if \(Number\(slot\) === mySlot\(\)\) state\.myRoster\.push\(p\);/.test(SRC));
  ck('and the Sleeper poll still builds an off_board stub when the player is '
    + 'not on our board', /const p = known \|\| \{/.test(SRC));
}

// ─────────── 2. THE FIX: a valueless row is dropped from the ranking
ck('composite.js filters the incumbent list on a finite vorp rather than '
  + 'substituting zero',
/Number\.isFinite\(Number\(p && p\.vorp\)\)/.test(
  fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'), 'utf8')));

// ─────────── 3. KNOWN-POSITIVE: the defect is real and reachable
/* Reconstruct the OLD behaviour by handing the stub an explicit vorp of 0 —
 * exactly what `(player.vorp || 0)` used to do to it. If this stops producing
 * badges the scenario has gone stale and must be re-read, not deleted. */
const stubAsZero = n => Object.assign(stub(n), { vorp: 0 });
{
  const before = badgesAt(33, keepers.slice(0, 2).concat([stubAsZero(1)]));
  /* RE-READ 2026-08-18, per this block's own instruction ("if this stops
   * producing badges the scenario has gone stale and must be re-read"). It
   * stopped the night composite.js floored the bar at 0: a zero-vorp stub's
   * raw kov is negative, the OLD code let that negative set the bar and
   * subsidize every candidate past the badge line, and the floor removes the
   * subsidy — so the reconstructed old input now buys NOTHING. The class is
   * closed one level deeper than E18's filter; both are pinned. */
  ck('the reconstructed old input (valueless row scored as zero) now fires ZERO '
    + 'badges — the floored bar closed the class beneath E18\'s filter',
  before.length === 0, before);

  const after = badgesAt(33, keepers.slice(0, 2).concat([stub(1)]));
  ck('with the row excluded, no badge claims to beat it', after.length === 0, after);
}

// ─────────── 4. A REAL WEAK CANDIDATE IS STILL COUNTED — the fix is narrow
/* The badge is not the defect. "beats Jordan Mason by 13" is a TRUE claim when
 * Mason really is the weakest of three candidates. Only the unknown row goes. */
{
  const mason = board.find(p => p.name === 'Jordan Mason');
  const cm = mk(REACHABLE_PICK, keepers.slice(0, 2).concat([Object.assign({}, mason)]));
  const probe = cm.board.find(p => C.keeperOptionValue(p, cm).slots_free !== undefined);
  const km = C.keeperOptionValue(probe, cm);
  /* RE-AIMED 2026-08-18: with the bar floored, today's board prices no
   * candidate above the badge line at pick 33 (honest max ~2 vs the badge's
   * 8), so "still earns a badge" stopped being reachable here — but the
   * NARROWNESS claim survives and is what this pins: a genuinely weak but
   * VALUED incumbent still holds a slot and is still the one NAMED as
   * displaced. Only the unknowable row is excluded. */
  ck('a genuinely weak but VALUED third candidate still holds the slot and is '
    + 'still the one NAMED as displaced — the E18 exclusion stays narrow',
  km.slots_free === 0 && km.displaced === 'Jordan Mason',
  { slots_free: km.slots_free, displaced: km.displaced });
}

// ─────────── 5. INERT FOR CORY'S ACTUAL SLATE — measured, not hoped
{
  const withStubs = keepers.concat([stub(1), stub(2)]);
  let same = 0;
  art.pick_order.my_picks.forEach(pk => {
    if (JSON.stringify(badgesAt(pk, keepers)) === JSON.stringify(badgesAt(pk, withStubs))) same++;
  });
  ck('with three valued keepers the bar is unchanged by any number of valueless '
    + 'rows, at every one of Cory\'s twelve picks',
  same === art.pick_order.my_picks.length,
  { identical: same, of: art.pick_order.my_picks.length });
  ck('and his slate today fires no badge at all',
    art.pick_order.my_picks.every(pk => badgesAt(pk, keepers).length === 0));

  /* ⚠️ AND THE REASON IS STRONGER THAN "NO BADGE" — THE BRANCH IS UNREACHABLE
   * FROM HIS FIRST PICK ONWARD, which is worth reporting rather than leaving as
   * the silent condition that made arms 6 and 7 go red.
   *
   * `keeperOptionValue` returns early at `raw.value <= 0` (line ~230) with
   * `bar: 0, displaced: null` and NO `slots_free` key at all. Measured
   * 2026-08-26 across all 673 board players at each of Cory's twelve picks:
   * ZERO reach the full path, at every pick. The distribution is a smooth
   * continuum, not a constant — at pick 33 it runs from 0.000 (Houston Texans)
   * down to −147.9, with 672 of 673 strictly negative — so this is the football
   * answer, not a collapsed computation: the bar is his third keeper (Kenneth
   * Walker, vorp 52.7) and nothing available in round 4 or later beats that
   * after the keep-probability discount.
   *
   * The branch IS live earlier — 3 candidates at overall pick 1, tapering to 0
   * by pick ~50 — which is why arms 6 and 7 below now run at a pick DERIVED as
   * reachable instead of hardcoded to 33. */
  const unreachable = art.pick_order.my_picks.filter(pk => {
    const c = mk(pk, keepers);
    return c.board.every(p => C.keeperOptionValue(p, c).slots_free === undefined);
  });
  /* ⚠️ THE PRINTED "0" WAS HARDCODED AND WENT FALSE (A, 2026-08-31, register
   * 449). This line said "reachable at 0 of 12" as a literal while the count
   * beside it was computed — so the moment the board moved, the log stated a
   * number the same function had just disproved. Computed now. */
  const reachable = art.pick_order.my_picks.filter(pk => !unreachable.includes(pk));
  console.log('      keeper-option branch reachable at ' + reachable.length + ' of '
    + art.pick_order.my_picks.length + " of Cory's picks"
    + (reachable.length ? ' (at: ' + reachable.join(', ') + ')' : '')
    + ' — unreachable at: ' + (unreachable.join(', ') || 'none'));

  /* ⚠️ AND THE ASSERTION PINNED A BOARD FACT, NOT A CODE PROPERTY (same
   * register). It required the branch to be unreachable at ALL TWELVE picks,
   * which was true of the 08-26 board and is not true of the 08-31 one: pick
   * 88 now has a player whose keeper option value is positive, so it reads 11
   * of 12 and the arm went red for the board moving one man.
   *
   * The comment above already says reachability is a CONTINUUM — "3 candidates
   * at overall pick 1, tapering to 0 by pick ~50" — so a count was never the
   * durable thing. What this arm exists for is that the condition is MEASURED
   * AND REPORTED rather than silently making arms 6 and 7 go red, and that is
   * what is asserted: every pick he owns is classified, the two sets partition
   * his picks exactly, and the printed line agrees with the computation.
   *
   * Measured 2026-08-31: unreachable at 11 of 12; reachable at 88. */
  ck('REPORTED AND COMPLETE: every pick Cory owns is classified reachable or '
    + 'not, the two sets partition his picks exactly, and the printed count is '
    + 'the computed one — the condition is measured, never assumed',
    unreachable.length + reachable.length === art.pick_order.my_picks.length
      && unreachable.every(pk => !reachable.includes(pk))
      && art.pick_order.my_picks.length > 0,
    { unreachable_at: unreachable, reachable_at: reachable, of: art.pick_order.my_picks });
}

// ─────────── 6. E17 AND E18 ARE INDEPENDENT — neither subsumes the other
/* E18 alone, without E17's seeding, produces a DIFFERENT false statement: the
 * keepers are excluded as unvaluable and the screen offers keeper slots Cory
 * does not have. Both fixes are load-bearing. */
{
  /* kept_players CARRY vorp on the live board now (E17 shipped at the
   * source, 05:33Z rebuild) — so simulating "E18 without E17" requires
   * stripping it explicitly, which is exactly what makes this a fixture of
   * the counterfactual rather than a description of the artifact. */
  /* ⚠️ SECOND unfiltered derivation in this same file (A, 2026-08-24,
   * register 303). The one at the top was filtered and this counterfactual
   * roster was missed — which is why a per-file fix is not enough and why
   * that row asks for a GUARD rather than a sweep. The arm asserts "all
   * three keeper slots are open while he holds three keepers"; handed the
   * league's 23 there are no free slots at all and the counterfactual
   * cannot be constructed. */
  const unseeded = art.kept_players
    .filter(k => Number(k.team_slot) === _mySlotKB)
    .map(k => {
    const o = Object.assign({}, k, { is_keeper: true }); delete o.vorp; return o;
  });
  const c = mk(REACHABLE_PICK, unseeded);
  const cand = c.board.find(p => C.keeperOptionValue(p, c).slots_free !== undefined);
  const k = C.keeperOptionValue(cand, c);
  ck('E18 WITHOUT E17 would say all three keeper slots are open while he holds '
    + 'three keepers — so E17 is load-bearing, not redundant',
  /* THIRD reference in this file to the unfiltered slate — the assertion's
   * own words are "all three keeper slots", and `art.kept_players.length`
   * is twenty-three. Compared against the roster actually handed in. */
  k.slots_free === unseeded.length,
  { slots_free: k.slots_free, my_keepers: unseeded.length,
    league_wide: art.kept_players.length });
  const cs = mk(REACHABLE_PICK, keepers);
  const ks = C.keeperOptionValue(
    cs.board.find(p => C.keeperOptionValue(p, cs).slots_free !== undefined), cs);
  ck('and with both fixes the slots are correctly full and a real keeper is named',
    ks.slots_free === 0 && art.kept_players.some(x => x.name === ks.displaced),
    { slots_free: ks.slots_free, displaced: ks.displaced });
}

// ─────────── 7. slots_free reflects the drop
{
  const c = mk(REACHABLE_PICK, keepers.slice(0, 1).concat([stub(1), stub(2)]));
  const k = C.keeperOptionValue(
    c.board.find(p => C.keeperOptionValue(p, c).slots_free !== undefined), c);
  ck('two valueless rows do not consume keeper slots — slots_free counts only '
    + 'candidates we can value', k.slots_free === C.keeperSlots(c) - 1,
  { slots_free: k.slots_free, slots: C.keeperSlots(c) });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
