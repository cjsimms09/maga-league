#!/usr/bin/env node
/* THE WIRE MUST NOT OFFER UP A KEEPER BECAUSE IT CANNOT PRICE HIM (register 277).
 *
 * What Cory saw on his phone, 2026-08-23:
 *
 *     BEST CLAIM — Claim Brenton Strange (TE) — drop Ja'Marr Chase
 *     +19.3 pts to your starting lineup this week · $38
 *
 * `waiverInputsFromBundle` built its price index from `artifact.players` alone.
 * Since the 08-22 board rebuild `kept_players` is a DISJOINT list — 0 of its 23
 * ids appear in the 680-row pool — so every keeper enriched to
 * `proj_mean: null, vorp: 0`. `dropCandidate` returns the roster MINIMUM, and a
 * man priced at zero among real projections is always the minimum. The worse a
 * player was mispriced, the more eagerly the tool offered him up.
 *
 * ⚠️ THE FIXTURE BELOW IS THE POINT OF THIS FILE, and the first version of it
 * was VACUOUS. With an empty players DB the keepers do not read as underpriced
 * at all — `enrich` gives them `position: null` and `myRoster`'s
 * `.filter(p => p.position)` DROPS THEM FROM THE ROSTER ENTIRELY. The run then
 * reports "0 unpriced" and looks clean, for entirely the wrong reason, on the
 * BROKEN code. Sleeper's real players DB carries name and position for
 * everyone, which is what makes the defect visible, so the fixture must too.
 * A control that cannot fail against the shipped bug is not a control.
 *
 * Run: node draft/tests/waiver_prices_keepers.test.js
 */
'use strict';
const path = require('path');
const W = require(path.join(__dirname, '..', '..', 'src', 'routes', 'waivers.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined
    ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

/* A board shaped like the shipped one: keepers live ONLY in kept_players. */
const ARTIFACT = {
  players: [
    { player_id: '1', name: 'Solid RB', position: 'RB', proj_mean: 180, vorp: 32 },
    { player_id: '2', name: 'Solid WR', position: 'WR', proj_mean: 170, vorp: 27 },
    /* The weakest man on the roster, and DELIBERATELY still above replacement.
     * The first cut gave him `vorp: -108`, which is below an UNPRICED keeper's
     * 0 — so the broken code dropped him rather than the star and the
     * known-negative below did not reproduce. That is not how a real roster
     * looks: in the live reproduction against Cory's actual fifteen, the
     * unpriced keeper sorted at value 0 and every other man sorted above him,
     * which is exactly why the star was the one offered up. A fixture whose
     * worst player is worse than "unknown" cannot show this defect. */
    { player_id: '3', name: 'Weak Bench RB', position: 'RB', proj_mean: 90, vorp: 8 },
  ],
  kept_players: [
    { player_id: '9', name: 'Star Keeper WR', position: 'WR', proj_mean: 271.8,
      vorp: 128.9, team_slot: 8 },
  ],
};
/* Sleeper's DB knows every player's name and position — including keepers. */
const DB = { players: {
  1: { name: 'Solid RB', pos: 'RB' },
  2: { name: 'Solid WR', pos: 'WR' },
  3: { name: 'Weak Bench RB', pos: 'RB' },
  9: { name: 'Star Keeper WR', pos: 'WR' },
} };
const BUNDLE = { rosters: [{ roster_id: 1, players: ['1', '2', '3', '9'] }] };

const inp = W.waiverInputsFromBundle(BUNDLE, DB, ARTIFACT, 1);
const roster = inp.myRoster || [];

ck('CONTROL: the keeper reaches the roster at all — with no players DB he is '
  + 'filtered out by `.filter(p => p.position)` and every assertion below '
  + 'passes vacuously against the BROKEN code',
  roster.length === 4, roster.map(p => p.name));

const keeper = roster.find(p => String(p.player_id) === '9');
ck('the keeper is PRICED from kept_players, not left null',
  keeper && keeper.proj_mean === 271.8, keeper);
ck('and carries his real vorp, not 0', keeper && keeper.vorp === 128.9, keeper);

const drop = W.dropCandidate(roster, {});
ck('THE DROP CANDIDATE IS NOT THE KEEPER — this is the assertion that '
  + 'reproduces Cory\'s screenshot when it fails',
  drop && drop.player && String(drop.player.player_id) !== '9',
  drop && drop.player);
ck('it is the genuinely weakest man on the roster',
  drop && drop.player && String(drop.player.player_id) === '3',
  drop && drop.player);

/* The failure mode stated directly: an unpriced player must never sort to the
 * bottom by virtue of being unpriced. If kept_players ever goes missing from
 * the index again, THIS is what it looks like. */
const brokenInputs = W.waiverInputsFromBundle(
  BUNDLE, DB, { players: ARTIFACT.players }, 1);   // kept_players withheld
const brokenKeeper = (brokenInputs.myRoster || [])
  .find(p => String(p.player_id) === '9');
ck('KNOWN-NEGATIVE: with kept_players withheld the keeper IS unpriced — so the '
  + 'assertions above are testing something real',
  brokenKeeper && brokenKeeper.proj_mean == null, brokenKeeper);
const brokenDrop = W.dropCandidate(brokenInputs.myRoster || [], {});
ck('KNOWN-NEGATIVE: and the wire then offers up the STAR — the exact inversion',
  brokenDrop && brokenDrop.player && String(brokenDrop.player.player_id) === '9',
  brokenDrop && brokenDrop.player);

console.log('\n%d passed, %d failed', pass, fail);
process.exitCode = fail ? 1 : 0;
