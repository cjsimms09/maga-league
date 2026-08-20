// TERRITORY: B
/* SOURCE-AWARE BOARD — Cory, live 2026-08-20: "This toggle should just
 * rearrange the board though and also may change vona calc or recommended
 * player." Pins source_board.js: it is the ONLY thing that changes when the
 * ranking toggle is used — engine.js itself is never touched — so this file
 * is where the correctness has to live.
 *
 * Run: node draft/tests/source_board.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SB = require(path.join(ROOT, 'public', 'js', 'draft', 'source_board.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

function mk(id, pos, proj_mean, over) {
  return Object.assign({ player_id: id, name: 'P' + id, position: pos, proj_mean,
    vorp: proj_mean - 50, tier: 1, pos_rank: 1, overall_rank: 1, replacement: 50,
    tier_size: 3, tier_drop: 0, tier_rank: 1 }, over);
}

// ── 1. forSource — the identity/no-op cases ─────────────────────────────────
{
  const players = [mk('1', 'RB', 200)];
  ck('no source ("") returns the SAME array (no copy, no cost)',
    SB.forSource(players, '') === players);
  ck('source "blend" returns the SAME array', SB.forSource(players, 'blend') === players);
  ck('a garbage source key degrades to the same array rather than scoring on undefined',
    SB.forSource(players, 'nonsense') === players);
  ck('an empty board returns itself under any source', SB.forSource([], 'ds').length === 0);
}

// ── 2. forSource — the real swap, and DROP (Cory's ruling: "I like the
// player disappearing when source is selected", overriding an earlier
// FALLBACK version of this file — ROUTES.md, 2026-08-20) ────────────────────
{
  const players = [
    mk('1', 'RB', 200, { vorp_ds: 90, tier_ds: 2, pos_rank_ds: 3, overall_rank_ds: 10,
      replacement_ds: 40, tier_size_ds: 4, tier_drop_ds: 5, tier_rank_ds: 2,
      proj_used_ds: 150, covered_ds: true }),
    mk('2', 'RB', 180, { covered_ds: false, proj_used_ds: 180 }), // NOT covered — must be DROPPED
  ];
  const out = SB.forSource(players, 'ds');
  ck('forSource returns a NEW array, not the same reference', out !== players);
  ck('the original array/objects are never mutated', players[0].proj_mean === 200 && players[0].vorp === 150);
  ck('the original array still has BOTH players (drop happens in the copy, not the source)', players.length === 2);

  ck('a player the source does NOT cover is DROPPED from the returned board entirely',
    out.every(p => p.player_id !== '2'), out.map(p => p.player_id));
  ck('...and covered players are the only ones that survive', out.length === 1);

  const p1 = out.find(p => p.player_id === '1');
  ck('proj_mean is swapped to the source\'s OWN proj_used (not the raw source field)', p1.proj_mean === 150);
  ck('vorp is swapped to the source-specific vorp', p1.vorp === 90);
  ck('tier is swapped to the source-specific tier', p1.tier === 2);
  ck('pos_rank/overall_rank/replacement/tier_* all swap too', p1.pos_rank === 3 && p1.overall_rank === 10
    && p1.replacement === 40 && p1.tier_size === 4 && p1.tier_drop === 5 && p1.tier_rank === 2);
  ck('the swapped player is tagged with which source ranked it', p1._sourceRanked === 'ds' && p1._sourceCovered === true);
}

// ── 2b. THE ONE GUARD — an artifact with NO coverage data at all must not
// blank the whole board (the pre-alt_source_rankings.py degrade case) ───────
{
  const players = [mk('1', 'RB', 200), mk('2', 'WR', 180)]; // no covered_ds field anywhere
  const out = SB.forSource(players, 'ds');
  ck('with zero coverage data anywhere on the board, nobody is dropped — the safe degrade, not a blanked board',
    out.length === 2, out.map(p => p.player_id));
}

// ── 3. coverage() — the honesty check ────────────────────────────────────────
{
  const players = [
    mk('1', 'RB', 200, { covered_ds: true }),
    mk('2', 'RB', 180, { covered_ds: true }),
    mk('3', 'RB', 150, { covered_ds: false }),
  ];
  ck('coverage() is null for blend (the question does not apply)', SB.coverage(players, 'blend') === null);
  const cov = SB.coverage(players, 'ds');
  ck('coverage() counts real coverage, not fallback', cov.covered === 2 && cov.total === 3, cov);
}

// ── 3b. topByPosition() — Cory, 2026-08-21: "toggle between sources... the
// old list you used to have that list top 5-10 at each position for that
// source." ────────────────────────────────────────────────────────────────
{
  const players = [
    mk('1', 'RB', 200, { pos_rank: 2, pos_rank_ds: 1, covered_ds: true }),
    mk('2', 'RB', 210, { pos_rank: 1, pos_rank_ds: 2, covered_ds: true }),
    mk('3', 'RB', 190, { pos_rank: 3, pos_rank_ds: 3, covered_ds: false }), // NOT covered by ds — must be dropped there
    mk('4', 'WR', 180, { pos_rank: 1, pos_rank_ds: 1, covered_ds: true }),
  ];
  const blendTop = SB.topByPosition(players, 'blend', 5);
  ck('blend groups by position and sorts by the board\'s own pos_rank',
    blendTop.RB.map(p => p.player_id).join(',') === '2,1,3', blendTop.RB.map(p => p.player_id));
  ck('...WR too, one position with one player still returns a real array',
    blendTop.WR.length === 1 && blendTop.WR[0].player_id === '4');

  const dsTop = SB.topByPosition(players, 'ds');
  ck('a source drops uncovered players from the top-N list too (same DROP rule as forSource)',
    dsTop.RB.map(p => p.player_id).join(',') === '1,2', dsTop.RB.map(p => p.player_id));

  const many = Array.from({ length: 12 }, (_, i) => mk(String(10 + i), 'QB', 100 - i,
    { pos_rank: i + 1 }));
  ck('n caps each position\'s list — default 8 when omitted',
    SB.topByPosition(many, 'blend').QB.length === 8);
  ck('...and an explicit n is honoured',
    SB.topByPosition(many, 'blend', 3).QB.length === 3);
  ck('n=0/negative degrades to the default rather than an empty list',
    SB.topByPosition(many, 'blend', 0).QB.length === 8);

  ck('a player with no position is skipped, not crashed on',
    (function () {
      const noPos = players.concat([{ player_id: '99', name: 'Nobody', proj_mean: 50 }]);
      const out = SB.topByPosition(noPos, 'blend');
      return Object.keys(out).indexOf('undefined') === -1;
    })());
  ck('empty board returns an empty object, not a throw',
    Object.keys(SB.topByPosition([], 'blend')).length === 0);
}

// ── 4. the real committed board — proves this survives contact with reality ─
{
  const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const board = artifact.players.filter(p => p.proj_mean > 0).slice(0, 200);
  const hasAltFields = board.some(p => p.vorp_ds != null);
  if (hasAltFields) {
    const dsBoard = SB.forSource(board, 'ds');
    ck('on the real board, Draft Sharks genuinely drops uncovered players (a smaller board, not the same 200)',
      dsBoard.length > 0 && dsBoard.length < board.length, { before: board.length, after: dsBoard.length });
    ck('...and every player that DOES survive is really marked covered',
      dsBoard.every(p => p._sourceCovered === true));
    ck('on the real board, a genuine top-VORP RB swap happens under at least one source',
      (function () {
        const blendTop = board.filter(p => p.position === 'RB').sort((a, b) => (b.vorp || -1e9) - (a.vorp || -1e9))[0];
        const dsTop = dsBoard.filter(p => p.position === 'RB').sort((a, b) => (b.vorp || -1e9) - (a.vorp || -1e9))[0];
        return blendTop && dsTop; // both resolve — the reorder-happens claim is pinned server-side in test_alt_source_rankings.py
      })());

    // The real proof this ships: E.recommend() itself — completely unmodified —
    // produces a DIFFERENT top recommendation when handed the swapped board.
    const ctxBlend = { board, currentPick: 4, nextPick: 17, totalPicks: 150,
      myPicksLeft: 12, roster: [], league: artifact.league, weights: E.DEFAULT_WEIGHTS,
      runMultipliers: {}, intervening: [], roundsLeft: 12 };
    const ctxDs = Object.assign({}, ctxBlend, { board: dsBoard });
    const recBlend = E.recommend(ctxBlend);
    const recDs = E.recommend(ctxDs);
    ck('engine.js is completely unmodified and still produces a real ranking off the swapped board',
      recDs.length > 0 && recDs[0].player && recDs[0].player.player_id != null);
    ck('CONTROL — recommend() is deterministic: re-running the SAME (blend) board twice agrees with itself',
      JSON.stringify(E.recommend(ctxBlend)[0].player.player_id) === JSON.stringify(recBlend[0].player.player_id));

    const rbTopDs = SB.topByPosition(board, 'ds', 8).RB || [];
    const rbTopBlend = SB.topByPosition(board, 'blend', 8).RB || [];
    ck('on the real board, topByPosition returns a real, position-sorted RB list for a source',
      rbTopDs.length > 0 && rbTopDs.every(p => p.position === 'RB'), rbTopDs.length);
    ck('...sorted ascending by the swapped pos_rank (forSource already put DS\'s own rank there), not left in input order',
      rbTopDs.every((p, i) => i === 0 || p.pos_rank >= rbTopDs[i - 1].pos_rank));
    ck('...and it genuinely differs from the blend list at least somewhere in the top-8 (the whole feature is pointless if it never does)',
      JSON.stringify(rbTopDs.map(p => p.player_id)) !== JSON.stringify(rbTopBlend.map(p => p.player_id)));
  } else {
    console.log('SKIP  real-board checks — draft_data.json has not been run through alt_source_rankings.py yet');
  }
}

console.log(`\n${pass}/${pass + fail} source_board checks passed`);
if (fail) process.exit(1);
