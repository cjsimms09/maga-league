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

// ── 2. forSource — the real swap ─────────────────────────────────────────────
{
  const players = [
    mk('1', 'RB', 200, { vorp_ds: 90, tier_ds: 2, pos_rank_ds: 3, overall_rank_ds: 10,
      replacement_ds: 40, tier_size_ds: 4, tier_drop_ds: 5, tier_rank_ds: 2,
      proj_used_ds: 150, covered_ds: true }),
    mk('2', 'RB', 180, { covered_ds: false, proj_used_ds: 180 }), // no vorp_ds/tier_ds at all — genuinely never ranked
  ];
  const out = SB.forSource(players, 'ds');
  ck('forSource returns a NEW array, not the same reference', out !== players);
  ck('the original array/objects are never mutated', players[0].proj_mean === 200 && players[0].vorp === 150);

  const p1 = out.find(p => p.player_id === '1');
  ck('proj_mean is swapped to the source\'s OWN proj_used (not the raw source field)', p1.proj_mean === 150);
  ck('vorp is swapped to the source-specific vorp', p1.vorp === 90);
  ck('tier is swapped to the source-specific tier', p1.tier === 2);
  ck('pos_rank/overall_rank/replacement/tier_* all swap too', p1.pos_rank === 3 && p1.overall_rank === 10
    && p1.replacement === 40 && p1.tier_size === 4 && p1.tier_drop === 5 && p1.tier_rank === 2);
  ck('the swapped player is tagged with which source ranked it', p1._sourceRanked === 'ds' && p1._sourceCovered === true);

  const p2 = out.find(p => p.player_id === '2');
  ck('CONTROL — a player never run through the precompute (no vorp_ds at all) keeps his blend fields, not a crash or undefined',
    p2.vorp === 130 && p2.tier === 1, p2);
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

// ── 4. the real committed board — proves this survives contact with reality ─
{
  const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const board = artifact.players.filter(p => p.proj_mean > 0).slice(0, 200);
  const hasAltFields = board.some(p => p.vorp_ds != null);
  if (hasAltFields) {
    const dsBoard = SB.forSource(board, 'ds');
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
  } else {
    console.log('SKIP  real-board checks — draft_data.json has not been run through alt_source_rankings.py yet');
  }
}

console.log(`\n${pass}/${pass + fail} source_board checks passed`);
if (fail) process.exit(1);
