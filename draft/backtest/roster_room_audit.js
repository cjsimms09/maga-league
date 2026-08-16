#!/usr/bin/env node
// TERRITORY: A
'use strict';
/* ROSTER-CONSTRUCTION ROOM AUDIT — does the shipped engine ever paint itself
 * into a corner, and what do its K/DEF timing, FLEX fills, bench mix and
 * near-tie rates actually look like over many simulated rooms?
 *
 * Feeds draft/audit/roster_construction_audit_2026-08-15.md (Missions A.1,
 * A.2-fill-agreement, A.3-bench-mix, B.1-tie-frequency). MEASUREMENT ONLY:
 * no CFG default is changed; the engine runs exactly as shipped
 * (VONA_SLOT_AWARE=false, MEASURED_WEIGHTS via live_context.js).
 *
 * MECHANICS are the proven pattern of draft/tools/bench_wire_room_sim.js
 * (research branch claude/fantasy-football-research-926y6z, commit ab80a657):
 * real board, real keepers, real E.recommend() through the real
 * live_context.js; opponents draft by noisy ADP (Gaussian perturbation scaled
 * to each player's own adp_sd); seeded mulberry32 PRNG so every room
 * reproduces from its seed. ONE DELIBERATE DEVIATION from that sim, declared:
 * opponent pick counts here come from the pick board filtered to slots that
 * are NOT mine (`p.slot !== MY_SLOT`), so Cory's three keeper-consumed slots
 * (overall 8/13/28) no longer draft an extra opponent player each — the
 * branch sim's `before = pick - prev - 1` removed 3 phantom players before
 * pick 33. Direction of that bias: a slightly thinner board for me; small,
 * but this audit is about corners and margins, so it is corrected here.
 *
 * TWO PAIRED ARMS, same seeds, same opponent noise:
 *   shipped     — the engine picks all 12 live picks. Today's live default.
 *   onesie_last — counterfactual policy: K/DEF are withheld from the engine's
 *                 board until exactly 2 picks remain, then the best engine-
 *                 ranked K and DEF are taken with the last two picks. This is
 *                 the latest-legal onesie schedule; the paired difference in
 *                 final starting-lineup projected points prices what the
 *                 shipped K/DEF timing costs (or buys) against it.
 *
 * Starting-lineup points = the optimal legal lineup by proj_mean over the
 * final 15-man roster (QB1 RB2 WR2 TE1 K1 DEF1 + FLEX best remaining
 * RB/WR/TE). Greedy per-position then best-leftover flex is EXACT for this
 * slot structure (one flex, nested eligibility) — the same fill
 * slot_schedule.js's DP produces for a fixed roster.
 *
 * Run:    node draft/backtest/roster_room_audit.js [--rooms 100] [--seed 1]
 * Writes: draft/backtest/roster_room_audit.json (research artifact — no
 *         production surface reads it).
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));

const args = process.argv.slice(2);
const flagIdx = f => args.indexOf(f);
const ROOMS = flagIdx('--rooms') >= 0 ? Number(args[flagIdx('--rooms') + 1]) : 100;
const SEED0 = flagIdx('--seed') >= 0 ? Number(args[flagIdx('--seed') + 1]) : 1;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  const u1 = Math.max(rng(), 1e-9), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const board = LC.loadBoard();
const ALL = board.players;
const KEEPERS = board.kept_players;
const LEAGUE = board.league;
const ORDER = board.pick_order;
const MY_SLOT = LEAGUE.my_draft_slot;
const MY_PICKS = (ORDER.my_picks || []).map(p => (p.overall != null ? p.overall : p));
const PICKS = ORDER.picks || [];
const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }; // + 1 FLEX
const FLEX_ELIG = { RB: true, WR: true, TE: true };

// Assert the hardcoded starter map matches the league config rather than
// silently diverging from it (the two-places disease).
Object.keys(STARTERS).forEach(pos => {
  const cfg = (LEAGUE.starters || {})[pos];
  if (cfg !== STARTERS[pos]) {
    throw new Error('starter map drift: ' + pos + ' config=' + cfg + ' tool=' + STARTERS[pos]);
  }
});
if ((LEAGUE.starters || {}).FLEX !== 1) throw new Error('starter map drift: FLEX');

function opponentPick(pool, rng) {
  let best = null, bestScore = Infinity;
  for (const p of pool) {
    const adp = p.adp == null ? 9999 : Number(p.adp);
    const sd = p.adp_sd == null ? 6 : Number(p.adp_sd);
    const score = adp + gaussian(rng) * sd;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

/* Optimal legal lineup by proj_mean. Exact for QB/RB/WR/TE/K/DEF + 1 FLEX. */
function optimalLineup(roster) {
  const byPos = {};
  roster.forEach(p => { (byPos[p.position] || (byPos[p.position] = [])).push(p); });
  Object.keys(byPos).forEach(pos =>
    byPos[pos].sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0)));
  const lineup = [];
  const missing = [];
  Object.keys(STARTERS).forEach(pos => {
    const need = STARTERS[pos];
    const have = byPos[pos] || [];
    for (let i = 0; i < need; i++) {
      if (have[i]) lineup.push(have[i]);
      else missing.push(pos);
    }
  });
  // FLEX: best remaining RB/WR/TE beyond dedicated slots.
  let flex = null;
  ['RB', 'WR', 'TE'].forEach(pos => {
    const extra = (byPos[pos] || [])[STARTERS[pos]];
    if (extra && (!flex || (extra.proj_mean || 0) > (flex.proj_mean || 0))) flex = extra;
  });
  if (flex) lineup.push(flex); else missing.push('FLEX');
  const points = lineup.reduce((s, p) => s + (p.proj_mean || 0), 0);
  return { lineup, points, flexPlayer: flex, missing, legal: missing.length === 0 };
}

function runRoom(seed, arm) {
  const rng = mulberry32(seed);
  const drafted = new Set();
  KEEPERS.forEach(k => drafted.add(String(k.player_id)));
  const myRoster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const picksLog = [];
  const tieLog = [];
  let prevPick = 0;

  for (let i = 0; i < MY_PICKS.length; i++) {
    const pick = MY_PICKS[i];
    const next = MY_PICKS[i + 1] || null;
    // Opponent picks between my previous live pick and this one — only slots
    // that are not mine (my keeper-consumed slots draft nobody).
    const oppSlots = PICKS.filter(p => p.overall > prevPick && p.overall < pick
      && p.slot !== MY_SLOT).length;
    let pool = ALL.filter(p => !drafted.has(String(p.player_id)));
    for (let k = 0; k < oppSlots; k++) {
      const p = opponentPick(pool, rng);
      if (!p) break;
      drafted.add(String(p.player_id));
      pool = pool.filter(x => String(x.player_id) !== String(p.player_id));
    }
    const picksLeft = MY_PICKS.length - i;

    // Arm policy: onesie_last withholds K/DEF until exactly 2 picks remain,
    // then forces best-ranked K and DEF.
    let engineBoard = pool;
    if (arm === 'onesie_last') {
      const haveK = myRoster.some(p => p.position === 'K');
      const haveD = myRoster.some(p => p.position === 'DEF');
      if (picksLeft > 2) {
        engineBoard = pool.filter(p => p.position !== 'K' && p.position !== 'DEF');
      } else {
        const wanted = !haveK ? 'K' : (!haveD ? 'DEF' : null);
        engineBoard = wanted ? pool.filter(p => p.position === wanted) : pool;
      }
    }

    const ctx = LC.liveContext({
      currentPick: pick, nextPick: next == null ? pick : next,
      board: engineBoard, roster: myRoster, myPicksLeft: picksLeft, myPickIndex: i,
    });
    let recs;
    try { recs = E.recommend(ctx); } catch (e) {
      return { seed, arm, crashed: String(e && e.message || e), picksLog };
    }
    if (!recs || !recs.length) return { seed, arm, crashed: 'empty recommendation', picksLog };
    const top = recs[0];
    const p = top.player;

    // Near-tie bookkeeping (shipped arm is the one B.1 reads; recorded for both).
    const second = recs[1];
    const samePosTier = !!(second && second.player.position === p.position
      && (second.player.tier || 0) === (p.tier || 0));
    tieLog.push({
      pickIndex: i, pick,
      contested: top.contested === true,
      gap: top.gap_to_second == null ? null : Math.round(top.gap_to_second * 100) / 100,
      top2_same_pos_tier_within: samePosTier && top.gap_to_second != null
        && top.gap_to_second < E.CFG.TIE_THRESHOLD,
      ceiling_promotion_top5: recs.slice(0, 5).some(r => r.ceiling_tiebreak != null),
      forced: !!top.forced,
      legality_warning: top.legality_warning != null,
    });

    const fills = E.starterSlotMarginal(p, myRoster, LEAGUE).fills;
    picksLog.push({ pick, round: Math.ceil(pick / (LEAGUE.teams || 10)),
      name: p.name, pos: p.position, fills, forced: !!top.forced });
    drafted.add(String(p.player_id));
    myRoster.push(p);
    prevPick = pick;
  }

  const lineup = optimalLineup(myRoster);
  const posCounts = {};
  myRoster.forEach(p => { posCounts[p.position] = (posCounts[p.position] || 0) + 1; });
  const inLineup = new Set(lineup.lineup.map(p => String(p.player_id)));
  const benchMix = {};
  myRoster.filter(p => !inLineup.has(String(p.player_id)))
    .forEach(p => { benchMix[p.position] = (benchMix[p.position] || 0) + 1; });
  // FLEX agreement: the player the engine labeled 'flex' at pick time vs the
  // optimal lineup's flex occupant.
  const flexPickNames = picksLog.filter(x => x.fills === 'flex').map(x => x.name);
  const kPick = picksLog.find(x => x.pos === 'K');
  const dPick = picksLog.find(x => x.pos === 'DEF');
  return {
    seed, arm, crashed: null,
    rosterSize: myRoster.length,
    legal: lineup.legal, missing: lineup.missing,
    lineupPoints: Math.round(lineup.points * 10) / 10,
    flexOptimal: lineup.flexPlayer ? lineup.flexPlayer.name : null,
    flexOptimalPos: lineup.flexPlayer ? lineup.flexPlayer.position : null,
    flexPickNames,
    posCounts, benchMix,
    kRound: kPick ? kPick.round : null, defRound: dPick ? dPick.round : null,
    forcedPicks: picksLog.filter(x => x.forced).length,
    picksLog, tieLog,
  };
}

const rooms = { shipped: [], onesie_last: [] };
for (let s = SEED0; s < SEED0 + ROOMS; s++) {
  rooms.shipped.push(runRoom(s, 'shipped'));
  rooms.onesie_last.push(runRoom(s, 'onesie_last'));
}

function dist(values) {
  const c = {};
  values.forEach(v => { c[String(v)] = (c[String(v)] || 0) + 1; });
  return c;
}
function summarize(list) {
  const ok = list.filter(r => !r.crashed);
  const legal = ok.filter(r => r.legal);
  const benchAgg = {};
  ok.forEach(r => Object.keys(r.benchMix).forEach(p => {
    benchAgg[p] = (benchAgg[p] || 0) + r.benchMix[p];
  }));
  return {
    n: list.length, crashed: list.length - ok.length,
    legal_rooms: legal.length,
    illegal_rooms: ok.length - legal.length,
    illegal_examples: ok.filter(r => !r.legal).slice(0, 5)
      .map(r => ({ seed: r.seed, missing: r.missing, posCounts: r.posCounts })),
    roster_size_dist: dist(ok.map(r => r.rosterSize)),
    mean_lineup_points: ok.length
      ? Math.round(ok.reduce((s, r) => s + r.lineupPoints, 0) / ok.length * 10) / 10 : null,
    k_round_dist: dist(ok.map(r => r.kRound)),
    def_round_dist: dist(ok.map(r => r.defRound)),
    forced_picks_dist: dist(ok.map(r => r.forcedPicks)),
    bench_mix_total: benchAgg,
    bench_mix_per_room: Object.fromEntries(Object.entries(benchAgg)
      .map(([p, n]) => [p, Math.round(10 * n / Math.max(1, ok.length)) / 10])),
  };
}

// Paired K/DEF-timing cost: shipped minus onesie_last, same seed.
const paired = [];
for (let i = 0; i < ROOMS; i++) {
  const a = rooms.shipped[i], b = rooms.onesie_last[i];
  if (a.crashed || b.crashed || !a.legal || !b.legal) continue;
  paired.push(Math.round((a.lineupPoints - b.lineupPoints) * 10) / 10);
}
paired.sort((x, y) => x - y);
const pairedMean = paired.length
  ? Math.round(paired.reduce((s, x) => s + x, 0) / paired.length * 100) / 100 : null;
const q = f => paired.length ? paired[Math.min(paired.length - 1,
  Math.floor(f * paired.length))] : null;

// Tie-frequency table per pick index (shipped arm only — the live surface).
const tieByPick = MY_PICKS.map((pick, i) => {
  const rowsAll = rooms.shipped.filter(r => !r.crashed)
    .map(r => r.tieLog[i]).filter(Boolean);
  const n = rowsAll.length;
  const gaps = rowsAll.map(t => t.gap).filter(g => g != null).sort((a, b) => a - b);
  return {
    pickIndex: i, pick, n,
    contested_pct: n ? Math.round(1000 * rowsAll.filter(t => t.contested).length / n) / 10 : null,
    median_gap: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
    same_pos_tier_tie_pct: n
      ? Math.round(1000 * rowsAll.filter(t => t.top2_same_pos_tier_within).length / n) / 10 : null,
    ceiling_promotion_top5_pct: n
      ? Math.round(1000 * rowsAll.filter(t => t.ceiling_promotion_top5).length / n) / 10 : null,
    forced_pct: n ? Math.round(1000 * rowsAll.filter(t => t.forced).length / n) / 10 : null,
    warning_pct: n ? Math.round(1000 * rowsAll.filter(t => t.legality_warning).length / n) / 10 : null,
  };
});

// FLEX agreement (shipped): of rooms whose optimal lineup has a flex occupant,
// how often is that occupant a player the engine called 'flex' at pick time,
// or a keeper (keepers were never labeled by a pick), or someone labeled
// otherwise (disagreement worth reading).
const flexRows = rooms.shipped.filter(r => !r.crashed && r.flexOptimal);
const keeperNames = new Set(KEEPERS.map(k => k.name));
const flexAgree = flexRows.filter(r => r.flexPickNames.includes(r.flexOptimal)).length;
const flexKeeper = flexRows.filter(r => keeperNames.has(r.flexOptimal)).length;
const flexSummary = {
  rooms_with_flex: flexRows.length,
  optimal_flex_was_engine_flex_pick: flexAgree,
  optimal_flex_was_keeper: flexKeeper,
  optimal_flex_was_other_pick: flexRows.length - flexAgree - flexKeeper,
  optimal_flex_pos_dist: dist(flexRows.map(r => r.flexOptimalPos)),
};

const out = {
  _territory: 'TERRITORY: A — research artifact, no production reader',
  tool: 'draft/backtest/roster_room_audit.js',
  rooms: ROOMS, seed_start: SEED0, generated_at: new Date().toISOString(),
  engine_flags: { VONA_SLOT_AWARE: E.CFG.VONA_SLOT_AWARE === true,
    CEILING_TIEBREAK: E.CFG.CEILING_TIEBREAK === true, TIE_THRESHOLD: E.CFG.TIE_THRESHOLD },
  arms: {
    shipped: 'engine as shipped picks all 12 live picks',
    onesie_last: 'K/DEF withheld until 2 picks remain, then forced — latest-legal onesie schedule',
  },
  summary: { shipped: summarize(rooms.shipped), onesie_last: summarize(rooms.onesie_last) },
  kdef_timing_cost_paired: {
    n: paired.length, mean: pairedMean,
    p10: q(0.10), p50: q(0.50), p90: q(0.90),
    note: 'shipped lineupPoints minus onesie_last lineupPoints, same seed; negative = shipped timing costs starting-lineup points vs taking K/DEF with the last two picks',
  },
  tie_by_pick: tieByPick,
  flex: flexSummary,
  detail: rooms,
};
const OUT_PATH = process.env.ROSTER_ROOM_AUDIT_OUT
  || path.join(ROOT, 'draft', 'backtest', 'roster_room_audit.json');
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));

console.log('ROSTER ROOM AUDIT — ' + ROOMS + ' paired rooms, seeds '
  + SEED0 + '-' + (SEED0 + ROOMS - 1));
['shipped', 'onesie_last'].forEach(arm => {
  const s = out.summary[arm];
  console.log('  ' + arm + ': legal ' + s.legal_rooms + '/' + (s.n - s.crashed)
    + (s.crashed ? (' (crashed ' + s.crashed + ')') : '')
    + ', mean lineup ' + s.mean_lineup_points
    + ', K rounds ' + JSON.stringify(s.k_round_dist)
    + ', DEF rounds ' + JSON.stringify(s.def_round_dist));
  console.log('    bench mix per room: ' + JSON.stringify(s.bench_mix_per_room));
});
console.log('  K/DEF timing cost (paired, shipped - onesie_last): mean '
  + pairedMean + ', p10/p50/p90 ' + q(0.10) + '/' + q(0.50) + '/' + q(0.90)
  + ' over n=' + paired.length);
console.log('  contested% by my pick: '
  + tieByPick.map(t => t.pick + ':' + t.contested_pct).join(' '));
console.log('  flex: ' + JSON.stringify(flexSummary));
console.log('  wrote ' + OUT_PATH);
