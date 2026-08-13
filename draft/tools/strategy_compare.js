// TERRITORY: A
/* DOES OUR MODEL BEAT THE MARKET? — the counterfactual nobody had run.
 *
 * Every roster measured so far was built by our own model, so no measurement
 * could detect systematic error: if the model is wrong in a consistent
 * direction, all six runs are wrong the same way and the small spread between
 * them reads as reassurance. That is grading your own work.
 *
 * THIS IS A CONTROLLED A/B. Same board, same schedule, same opponent model, same
 * seed. ONLY MY PICK RULE CHANGES. The arms:
 *
 *   MODEL     the engine's top composite recommendation
 *   MARKET    best available by ADP -- what the room would do
 *   VORP      best available by raw vorp, no VONA, no adjusters
 *   NEEDRULE  the shipped needrule card's pick (best ADP within startable need)
 *
 * ── WHY THIS SIM IS THE RIGHT TOOL HERE AND WAS THE WRONG ONE BEFORE ────────
 *
 * It was WRONG as a predictor of B's rosters: it said TE 1 where B measured
 * TE 4, because the opponent model differs and different players survive. That
 * error is real and the sim stays retired for that purpose.
 *
 * It is RIGHT for this question, because every arm runs against THE SAME
 * opponent model. A bias that makes all four arms wrong in the same direction
 * cancels in the comparison. What it cannot tell you is the absolute number.
 *
 * ── AND IT IS STILL SCORED BY AN UNVALIDATED SIMULATOR ──────────────────────
 *
 * season_lineup.js has never been checked against a realized season. A margin
 * here is a hypothesis about strategy, not a demonstrated edge.
 *
 * Run: node draft/tools/strategy_compare.js [sims]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const NR = require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));
const LV = require(path.join(ROOT, 'draft', 'tools', 'lineup_value.js'));
const SL = require(path.join(ROOT, 'draft', 'tools', 'season_lineup.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const keep = KEEP.keepersFrom(DATA);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
/* TEN DRAFT SLOTS, NOT ONE. A single schedule gives one comparison and one
 * comparison is an anecdote -- the first version of this reported an 83-point
 * margin from n=1. Snake order, 10 teams, 15 rounds: odd rounds pick from the
 * front, even rounds from the back. */
function schedule(slot) {
  const out = [];
  for (let r = 1; r <= 15; r++) {
    out.push((r - 1) * 10 + (r % 2 === 1 ? slot : 11 - slot));
  }
  return out;
}
let SCHED = schedule(8);

const STRATEGIES = {
  MODEL: (board, roster, pick, i) => {
    const recs = E.recommend({ board, roster, league: L, currentPick: pick,
      nextPick: SCHED[i + 1] || pick + 5, totalPicks: 150,
      myPicksLeft: SCHED.length - i, roundsLeft: SCHED.length - i,
      runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS })
      .filter(x => E.scoreable(x));
    return recs.length ? recs[0].player : null;
  },
  /* VONA WITH THE PLAYER LEFT IN HIS OWN REPLACEMENT POOL.
   *
   * The shipped vona() builds its comparison set as
   *   board.filter(p => p.position === player.position && p.player_id !== player.player_id)
   * -- it EXCLUDES the man himself. So "what do I lose by waiting on Allen" is
   * priced against the best quarterback who ISN'T Allen, while the survival model
   * simultaneously says Allen is 96% likely to be the man still sitting there.
   * Those two statements cannot both inform the same decision.
   *
   * Measured at pick 8: Allen 33.6 -> 1.3, Bowers 20.6 -> 1.3, Cook 24.0 -> 17.5.
   * The correction is proportional to survival, which is what a wait-cost should
   * be. IMPLEMENTED HERE AS A STRATEGY ARM, NOT AS AN ENGINE CHANGE -- the
   * scoring path is frozen until Aug 22 and this is measurement. */
  VONA_FIXED: (board, roster, pick, i) => {
    const ctx = { board, roster, league: L, currentPick: pick,
      nextPick: SCHED[i + 1] || pick + 5, totalPicks: 150,
      myPicksLeft: SCHED.length - i, roundsLeft: SCHED.length - i,
      runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS };
    const next = SCHED[i + 1] || pick + 5;
    const byPos = {};
    board.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
    let best = null, bestV = -Infinity;
    Object.keys(byPos).forEach(pos => {
      const list = byPos[pos];
      const eba = E.expectedBestAvailable(list, next, ctx);   // player INCLUDED
      list.forEach(p => {
        const v = (p.proj_mean || 0) - eba;
        if (v > bestV) { bestV = v; best = p; }
      });
    });
    return best;
  },
  MARKET: board => board.slice().sort((a, b) => adpOf(a) - adpOf(b))[0] || null,
  VORP: board => board.slice().sort((a, b) => (b.vorp || 0) - (a.vorp || 0))[0] || null,
  NEEDRULE: (board, roster) => {
    const r = NR.recommend(board, roster);
    return (r && r.player) || (r && r.pick) || r || null;
  },
};

function draft(name) {
  const pick1 = STRATEGIES[name];
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.slice();
  const got = [];
  for (let pick = 1; pick <= SCHED[SCHED.length - 1]; pick++) {
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    if (!board.length) break;
    const i = SCHED.indexOf(pick);
    if (i >= 0) {
      /* EVERY ARM MUST FIELD A LEGAL LINEUP, OR THE COMPARISON IS RIGGED.
       *
       * THE FIRST RUN OF THIS REPORTED MODEL BEATING MARKET BY 219 POINTS AND IT
       * WAS AN ARTIFACT. MARKET drafted RB 7 / QB 4 / TE 2 / WR 2 and NO KICKER
       * AND NO DEFENCE -- it scored the whole season with two empty starting
       * slots. VORP was worse in the other direction: DEF 4 / K 4, because a
       * kicker's vorp is enormous against a tiny replacement level.
       *
       * The engine has applyRosterLegality and the naive rules do not, so the
       * margin was mostly "one arm fills its lineup and the others cannot".
       * A REAL DRAFTER TAKES A KICKER. Every arm now does, in the last rounds,
       * exactly as a human would -- which is the comparison that was intended. */
      const held = {};
      roster.forEach(r => { held[r.position] = (held[r.position] || 0) + 1; });
      const mandatory = ['K', 'DEF'].filter(pos => !held[pos]);
      const picksLeft = SCHED.length - i;
      let pl = null;
      if (mandatory.length >= picksLeft) {
        const pos = mandatory[0];
        pl = board.filter(p => p.position === pos)
          .sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0))[0] || null;
      }
      if (!pl) { try { pl = pick1(board, roster, pick, i); } catch (e) { pl = null; } }
      if (!pl) pl = board.slice().sort((a, b) => adpOf(a) - adpOf(b))[0];
      taken.add(String(pl.player_id)); roster.push(pl);
      got.push({ round: i + 1, p: pl });
    } else {
      /* THE ROOM. Identical across every arm — that is what makes this a
       * controlled comparison rather than four different drafts. */
      const b = board.slice().sort((a, b2) => adpOf(a) - adpOf(b2))[0];
      taken.add(String(b.player_id));
    }
  }
  return { roster, got };
}

const SIMS = Number(process.argv[2]) || 400;
const NAMES = Object.keys(STRATEGIES);
console.log('STRATEGY COMPARISON — same board, same room, same seed. Only my rule changes.');
console.log('Ten draft slots, so each margin is ten paired comparisons rather than one.\n');
const per = {}; NAMES.forEach(n => { per[n] = []; });
console.log('  slot   ' + NAMES.map(n => n.padStart(9)).join(''));
for (let slot = 1; slot <= 10; slot++) {
  SCHED = schedule(slot);
  const row = [];
  NAMES.forEach(name => {
    const { roster } = draft(name);
    const v = SL.simulate(roster, SIMS, 424242 + slot);
    per[name].push(v); row.push(v);
  });
  console.log('  ' + String(slot).padStart(4) + '   ' + row.map(v => v.toFixed(1).padStart(9)).join(''));
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
console.log('\n  rule        mean      sd     min     max');
NAMES.slice().sort((a, b) => mean(per[b]) - mean(per[a])).forEach(n =>
  console.log('  ' + n.padEnd(11) + mean(per[n]).toFixed(1).padStart(8)
    + sd(per[n]).toFixed(1).padStart(8)
    + Math.min.apply(null, per[n]).toFixed(1).padStart(8)
    + Math.max.apply(null, per[n]).toFixed(1).padStart(8)));

/* PAIRED, NOT UNPAIRED. Slot changes both arms together, so the per-slot
 * DIFFERENCE removes the slot effect entirely and is the honest statistic. */
console.log('\n  PAIRED MARGINS vs MODEL (per slot, so slot difficulty cancels):');
NAMES.filter(n => n !== 'MODEL').forEach(n => {
  const d = per.MODEL.map((v, i) => v - per[n][i]);
  const wins = d.filter(x => x > 0).length;
  console.log('    MODEL - ' + n.padEnd(9) + 'mean ' + mean(d).toFixed(1).padStart(7)
    + '   sd ' + sd(d).toFixed(1).padStart(6)
    + '   MODEL ahead in ' + wins + '/10 slots');
});
