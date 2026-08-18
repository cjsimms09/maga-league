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

const keepers = art.kept_players.map(k => Object.assign({}, k, { is_keeper: true,
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
  ck('KNOWN-POSITIVE: scoring a valueless row as zero really does fire KEEPER '
    + 'TARGET badges at pick 33', before.length > 0, before);
  ck('and the claim names the valueless row as the man being beaten',
    before.length > 0 && before.every(b => /Off-board Guy/.test(String(b.beats))), before);

  const after = badgesAt(33, keepers.slice(0, 2).concat([stub(1)]));
  ck('with the row excluded, no badge claims to beat it', after.length === 0, after);
}

// ─────────── 4. A REAL WEAK CANDIDATE IS STILL COUNTED — the fix is narrow
/* The badge is not the defect. "beats Jordan Mason by 13" is a TRUE claim when
 * Mason really is the weakest of three candidates. Only the unknown row goes. */
{
  const mason = board.find(p => p.name === 'Jordan Mason');
  const out = badgesAt(33, keepers.slice(0, 2).concat([Object.assign({}, mason)]));
  ck('a genuinely weak but VALUED third candidate still sets the bar and still '
    + 'earns a truthful badge', out.length > 0 && out.every(b => b.beats === 'Jordan Mason'), out);
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
}

// ─────────── 6. E17 AND E18 ARE INDEPENDENT — neither subsumes the other
/* E18 alone, without E17's seeding, produces a DIFFERENT false statement: the
 * keepers are excluded as unvaluable and the screen offers keeper slots Cory
 * does not have. Both fixes are load-bearing. */
{
  const unseeded = art.kept_players.map(k => Object.assign({}, k, { is_keeper: true }));
  const c = mk(33, unseeded);
  const cand = c.board.find(p => p.vorp > 0);
  const k = C.keeperOptionValue(cand, c);
  ck('E18 WITHOUT E17 would say all three keeper slots are open while he holds '
    + 'three keepers — so E17 is load-bearing, not redundant',
  k.slots_free === art.kept_players.length, { slots_free: k.slots_free });
  const cs = mk(33, keepers);
  const ks = C.keeperOptionValue(cs.board.find(p => p.vorp > 0), cs);
  ck('and with both fixes the slots are correctly full and a real keeper is named',
    ks.slots_free === 0 && art.kept_players.some(x => x.name === ks.displaced),
    { slots_free: ks.slots_free, displaced: ks.displaced });
}

// ─────────── 7. slots_free reflects the drop
{
  const c = mk(33, keepers.slice(0, 1).concat([stub(1), stub(2)]));
  const k = C.keeperOptionValue(c.board.find(p => p.vorp > 0), c);
  ck('two valueless rows do not consume keeper slots — slots_free counts only '
    + 'candidates we can value', k.slots_free === C.keeperSlots(c) - 1,
  { slots_free: k.slots_free, slots: C.keeperSlots(c) });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
