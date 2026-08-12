// TERRITORY: A
/* DOES THE ORDER POSITIONS ARE TAKEN CHANGE THE STARTING LINEUP?
 *
 * THE ONE ARM THAT DECIDES WHETHER THE REST IS WORTH RUNNING, and it goes first:
 * GREEDY END-STATE. At each pick, take the player who most increases the
 * projected STARTING lineup. It directly maximises the metric everything else is
 * scored on.
 *
 *   · if the shipping rule sits close to it, the metric is near-circular and the
 *     comparison says little;
 *   · if there is a gap, THE GAP IS THE FINDING, denominated in projected points
 *     the current rule leaves on the table.
 *
 * WHY THE POWER ANALYSIS DOES NOT APPLY HERE. "Which strategy makes money" needs
 * a realized season and we get one a year. "Which sequence produces the strongest
 * projected starting lineup" is a property of the board, the room and the pick
 * order — it resolves the moment the simulation ends. And it is NOT circular:
 * the tool is GREEDY PER PICK on a composite while the metric is the END STATE of
 * twelve picks under a snake, and greedy does not reach the best end state
 * because taking the best player now changes what is available at the next four
 * turns.
 *
 * PAIRED ON THE SAME SEED. Every arm sees identical opponent behaviour and an
 * identical board evolution; only my own rule differs. That removes the
 * between-room variance which would otherwise force a large n — 200 paired rooms
 * resolves a couple of projected points per lineup, where unpaired would need
 * thousands.
 *
 * THE PRIOR, from published work on a comparable setup (12-team, 4th slot):
 * bad-autodraft floor 1656, autodraft-for-everyone at the 4th slot ~1875,
 * optimal 1961 — SO ROUGHLY 86 POINTS BETWEEN NAIVE SLOT-FILLING AND OPTIMAL,
 * about 4.6% of the total. Real and not enormous. If ours comes out very
 * differently that says something about our FORMAT rather than about the method,
 * and it is reported either way.
 *
 * ⚠️ THIS MEASURES BEHAVIOUR, NOT VALUE. A stronger projected lineup is better
 * only if the projections are right, and they are public consensus. Any result is
 * a CANDIDATE under the three-filter model — discovery, earning a preregistration
 * rather than a promotion.
 *
 * Run: node draft/tools/construction_order.js [rooms] [--rooms-vary]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../../public/js/draft/engine.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const SLEEPER = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'sleeper_league_settings.json'), 'utf8'));
const L = DATA.league, TEAMS = L.teams, ROUNDS = L.rounds, MY = L.my_draft_slot;
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY);
const KR = (L.keeper_rules || {}).count || 0;

const STARTERS = {};
(SLEEPER.roster_positions || []).forEach(s => { if (s !== 'BN') STARTERS[s] = (STARTERS[s] || 0) + 1; });
const FLEX_OK = { RB: 1, WR: 1, TE: 1 };

const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));
const projOf = p => Number(p.proj_mean || 0);
function rng(s) {
  let a = s >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slotOf = o => { const r = Math.ceil(o / TEAMS), i = o - (r - 1) * TEAMS; return (r % 2 === 1) ? i : (TEAMS - i + 1); };
function myPicks() {
  const out = [];
  for (let r = 1; r <= ROUNDS; r++) out.push((r - 1) * TEAMS + ((r % 2 === 1) ? MY : (TEAMS - MY + 1)));
  return out.slice(KR);
}
/* Manager profiles keyed by SEAT. The mapping of manager to seat is unknown
 * until the draft order is assigned, so a stable arbitrary seating is used and
 * the arm is a DISTRIBUTION over seatings rather than a claim about who sits
 * where — same discipline profile_flip.js established. */
const MGRS = ((DATA.manager_profiles || {}).managers) || {};
const ME = L.my_manager_id || null;
const ROOM_PROFILES = Object.keys(MGRS).map(k => MGRS[k])
  .filter(m => m && (!ME || String(m.manager_id) !== String(ME)));
const PROFILE_BY_SEAT = {};
{ let i = 0; for (let s = 1; s <= TEAMS; s++) if (s !== MY) PROFILE_BY_SEAT[s] = ROOM_PROFILES[i++ % (ROOM_PROFILES.length || 1)] || null; }

const REPL = {};
DATA.players.forEach(p => {
  if (p.position && p.replacement != null && REPL[p.position] == null) REPL[p.position] = Number(p.replacement);
});

/** THE OBJECTIVE: projected points of the STARTING lineup only. Bench is zero. */
function startingStrength(roster) {
  const slots = [];
  Object.keys(STARTERS).forEach(pos => { for (let i = 0; i < STARTERS[pos]; i++) slots.push(pos); });
  slots.sort((a, b) => (a === 'FLEX' ? 1 : 0) - (b === 'FLEX' ? 1 : 0));
  const used = new Set();
  let total = 0, holes = 0;
  slots.forEach(s => {
    const c = roster.filter(p => !used.has(String(p.player_id))
      && (s === 'FLEX' ? FLEX_OK[p.position] : p.position === s))
      .sort((a, b) => projOf(b) - projOf(a));
    if (c.length) { used.add(String(c[0].player_id)); total += projOf(c[0]); }
    else holes++;
  });
  return { points: total, holes: holes };
}

/* THE STARTABLE MASK, in ONE place so the three anchor arms differ ONLY in what
 * they rank the masked pool by. Three copies of this would let the arms drift
 * apart and turn an anchor comparison into a mask comparison. */
function maskPool(ctx) {
  const have = {};
  ctx.roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
  const openDirect = ctx.board.filter(p => (have[p.position] || 0) < (STARTERS[p.position] || 0));
  // Once every slot is filled the mask stops constraining and the arm ranks the
  // whole board — the same point at which the OBJECTIVE stops seeing the pick.
  const pool = openDirect.length ? openDirect : ctx.board.filter(p => FLEX_OK[p.position]);
  return pool.length ? pool : ctx.board;
}

/* ── THE ARMS. Valuation is FIXED across all of them; only ORDER varies. ───── */
const ARMS = {
  /* The shipping rule, unchanged. */
  shipped: (ctx) => {
    const r = E.recommend(ctx);
    return r && r.length ? r[0].player : null;
  },

  /* THE BENCHMARK. Directly maximises the metric: which available player most
   * increases the projected starting lineup right now. Greedy on the OBJECTIVE
   * rather than on a composite. */
  greedy_end_state: (ctx) => {
    const base = startingStrength(ctx.roster).points;
    let best = null, bestGain = -Infinity;
    // Only the plausible top of the board — scanning 1700 players per pick is
    // 12x the cost for a gain that is provably zero below replacement.
    const cand = ctx.board.slice().sort((a, b) => projOf(b) - projOf(a)).slice(0, 60);
    cand.forEach(p => {
      const g = startingStrength(ctx.roster.concat([p])).points - base;
      // Tie-break toward the better player, so an equal-gain bench body does not
      // beat a starter on list order.
      if (g > bestGain || (g === bestGain && best && projOf(p) > projOf(best))) {
        bestGain = g; best = p;
      }
    });
    return best;
  },

  /* THE DEPTH-LIMITED LOOKAHEAD — the version the external review named as
   * tractable, and the arm that tests a REAL LIMIT IN MY OWN ITEM-11 ANSWER.
   *
   * I reported "the sequential rewrite buys 0.4%" from the greedy arm. But
   * GREEDY IS NOT OPTIMAL — it is depth-0 on the end state, so its +7.9 is a
   * LOWER BOUND on the headroom, not the headroom. A lookahead can beat it, and
   * if it does, my 0.4% understated the case for the rewrite.
   *
   * Depth 2 of MY OWN picks: for each candidate now, assume the board drains by
   * ADP to my next turn, then take the best end-state addition there, and score
   * the pair. Opponents modelled as ADP order, which is what the review
   * prescribed and what the room model already does.
   */
  lookahead_2: (ctx) => {
    const base = startingStrength(ctx.roster).points;
    const gap = ctx.nextPick ? (ctx.nextPick - ctx.currentPick) : 0;
    const byAdp = ctx.board.slice().sort((a, b) => adpOf(a) - adpOf(b));
    // Who the room is expected to have taken by my next turn.
    const drained = new Set(byAdp.slice(0, Math.max(0, gap - 1)).map(p => String(p.player_id)));
    const cand = ctx.board.slice().sort((a, b) => projOf(b) - projOf(a)).slice(0, 40);
    const later = ctx.board.filter(p => !drained.has(String(p.player_id)))
      .sort((a, b) => projOf(b) - projOf(a)).slice(0, 40);
    let best = null, bestVal = -Infinity;
    cand.forEach(p => {
      const r1 = ctx.roster.concat([p]);
      const now = startingStrength(r1).points - base;
      // The best I could add at my NEXT pick, given this one.
      let then = 0;
      if (gap > 0) {
        const b1 = startingStrength(r1).points;
        later.forEach(q => {
          if (String(q.player_id) === String(p.player_id)) return;
          const g = startingStrength(r1.concat([q])).points - b1;
          if (g > then) then = g;
        });
      }
      const val = now + then;
      if (val > bestVal || (val === bestVal && best && projOf(p) > projOf(best))) {
        bestVal = val; best = p;
      }
    });
    return best;
  },

  /* SCARCITY PER TURN — the only arm that routes through TIMING rather than
   * value: take the position where (viable players above replacement) divided by
   * (picks until my next turn) is smallest, then the best player there. */
  scarcity_per_turn: (ctx) => {
    const gap = Math.max(1, (ctx.nextPick || ctx.currentPick + 10) - ctx.currentPick);
    const open = {};
    const have = {};
    ctx.roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
    Object.keys(STARTERS).forEach(pos => {
      if (pos === 'FLEX') return;
      if ((have[pos] || 0) < STARTERS[pos]) open[pos] = 1;
    });
    if (!Object.keys(open).length) { ['RB', 'WR', 'TE'].forEach(p => { open[p] = 1; }); }
    let bestPos = null, bestRatio = Infinity;
    Object.keys(open).forEach(pos => {
      const viable = ctx.board.filter(p => p.position === pos
        && REPL[pos] != null && projOf(p) >= REPL[pos]).length;
      const ratio = viable / gap;
      if (ratio < bestRatio) { bestRatio = ratio; bestPos = pos; }
    });
    const at = ctx.board.filter(p => p.position === bestPos)
      .sort((a, b) => projOf(b) - projOf(a));
    return at[0] || ctx.board.slice().sort((a, b) => projOf(b) - projOf(a))[0];
  },

  /* ── THE VALUE ANCHOR, TESTED FROM OUTSIDE THE EXPERIMENT THAT SET IT ──────
   *
   * Cory's item 12, and the asymmetry he named: THE MASK HAS INDEPENDENT
   * CONFIRMATION AND THE VALUE ANCHOR DOES NOT. The anchor's entire evidence is
   * one participation-test arm — the second-largest term in the system, and
   * nothing outside that experiment has ever tested it.
   *
   * This is the independent direction. Rank on PURE VORP within the startable
   * mask, against the shipping composite, on the same paired seeds and the same
   * board, graded on projected starting-lineup strength rather than in dollars.
   * The participation test cannot make this comparison: it grades through the
   * money layer, so a rule that builds a better lineup but never cashes reads
   * the same as one that does not.
   *
   * ⚠️ AND WHAT I FOUND WHILE DEFINING THE ARM CHANGES WHAT IT TESTS. The ledger
   * glosses the anchor as "ranking off the ADP board". It is not: the
   * participation test's value term is `w.value * vorp`, and `vorp` is
   * `proj_mean − replacement` (draft/vorp.py:94) with NO ADP anywhere — all 150
   * of the top-VORP board players carry a real projection, so `_rank_fallback`,
   * the one path where ADP could enter a projection, never fires for a
   * draftable player. So this arm isolates what the COMPOSITE adds over raw
   * cross-position VORP, which is the honest version of the question.
   */
  vorp_only: (ctx) => {
    const pool = maskPool(ctx);
    // PURE VORP — the board's own points-over-positional-replacement, which is
    // exactly the quantity the value anchor weights.
    return pool.slice().sort((a, b) => (Number(b.vorp) || 0) - (Number(a.vorp) || 0))[0];
  },

  /* ── ITEM 4b's DECISION GATE — the crossover policy as an ARM ──────────────
   *
   * `onesie_timing.js` measures the difference of differences. This is the only
   * thing that decides whether it is worth anything: run the policy it implies
   * against the shipped rule on the SAME paired harness and the SAME objective.
   *
   * THE POLICY: at each of my picks, compute each open onesie's LOSS FROM
   * WAITING against the FLEX alternative's. If any onesie's loss exceeds the
   * flex loss, take the best player at the most urgent one. Otherwise fall
   * through to the shipped composite — so this arm differs from `shipped` ONLY
   * where the timing signal actually fires, which is what makes the paired
   * difference attributable to the timing signal rather than to a whole
   * different ranking rule.
   *
   * Cory's bar, declared before the run: under ONE projected starting-lineup
   * point it closes as arithmetic. */
  onesie_timing: (ctx) => {
    const have = {};
    ctx.roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
    const openOnesies = ['QB', 'TE', 'K', 'DEF']
      .filter(pos => (have[pos] || 0) < (STARTERS[pos] || 0));
    if (openOnesies.length && ctx.nextPick != null) {
      const sctx = { board: ctx.board, currentPick: ctx.currentPick,
        runMultipliers: {}, intervening: ctx.intervening || [] };
      const lossAt = test => {
        const at = ctx.board.filter(test);
        if (!at.length) return -Infinity;
        const now = at.slice().sort((a, b) => projOf(b) - projOf(a))[0];
        return projOf(now) - E.expectedBestAvailable(at, ctx.nextPick, sctx);
      };
      const flexLoss = lossAt(p => FLEX_OK[p.position]);
      let bestPos = null, bestDod = 0;
      openOnesies.forEach(pos => {
        const d = lossAt(p => p.position === pos) - flexLoss;
        if (d > bestDod) { bestDod = d; bestPos = pos; }
      });
      if (bestPos) {
        const pick = ctx.board.filter(p => p.position === bestPos)
          .sort((a, b) => projOf(b) - projOf(a))[0];
        if (pick) return pick;
      }
    }
    // NO TIMING SIGNAL -> the shipped rule, unchanged. The arm is the composite
    // plus a timing override, not a replacement for it.
    const r = E.recommend(ctx);
    return r && r.length ? r[0].player : null;
  },

  /* ⚠️ THE TWO ARMS `vorp_only` NEEDED AND DID NOT HAVE.
   *
   * `vorp_only` measures MASK + ANCHOR. On its own it says what the COMPOSITE
   * adds on top of the anchor — it does not say what the ANCHOR is worth,
   * because nothing in the set lacks one. Cory asked for "pure VORP within the
   * mask" and I built exactly that, which turns out not to be the contrast that
   * answers the question. Both halves are needed:
   *
   *   adp_only    — mask + a DIFFERENT anchor (ADP). This is the arm the ledger
   *                 thought it was describing when it called the value anchor
   *                 "ranking off the ADP board". vorp_only vs adp_only is
   *                 therefore the direct test of that claim: does ranking by
   *                 points-over-replacement beat ranking by market order?
   *   mask_only   — mask + NO anchor, ordered arbitrarily but DETERMINISTICALLY
   *                 within the mask. This is the no-anchor control, and it is
   *                 the only arm here that can say what the anchor is worth at
   *                 all rather than what one anchor is worth against another.
   */
  adp_only: (ctx) => {
    const pool = maskPool(ctx);
    return pool.slice().sort((a, b) => adpOf(a) - adpOf(b))[0];
  },

  mask_only: (ctx) => {
    const pool = maskPool(ctx);
    /* NOT Math.random(): the harness is PAIRED on a seed, and an arm with its
     * own entropy would break the pairing that every interval here depends on.
     * Hashing the id gives an arbitrary-but-fixed order — no value information,
     * fully reproducible. */
    const key = p => {
      const s = String(p.player_id); let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    };
    return pool.slice().sort((a, b) => key(a) - key(b))[0];
  },

  /* THE CALIBRATION ARM — strict fill-first, which the Lab already measured
   * losing to the startable-cap mask. If it wins here the HARNESS is wrong, and
   * that is the point of including it. */
  need_filter: (ctx) => {
    const have = {};
    ctx.roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
    const needed = ctx.board.filter(p => (have[p.position] || 0) < (STARTERS[p.position] || 0));
    const pool = needed.length ? needed
      : ctx.board.filter(p => FLEX_OK[p.position]);
    const use = pool.length ? pool : ctx.board;
    return use.slice().sort((a, b) => projOf(b) - projOf(a))[0];
  },
};

/* Room shapes, so "is the answer robust to the room" is answerable rather than
 * assumed. Each returns the opponent's pick from the board. */
const ROOMS = {
  adp: (board, rand) => {
    const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 8);
    return top[Math.min(top.length - 1, Math.floor(rand() * rand() * top.length))];
  },
  // A room that REACHES — takes from deeper in the ADP list, more variance.
  reachy: (board, rand) => {
    const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 20);
    return top[Math.floor(rand() * top.length)];
  },
  // A room that takes QUARTERBACKS EARLY, which starves the position I defer.
  qb_early: (board, rand) => {
    if (rand() < 0.30) {
      const qb = board.filter(p => p.position === 'QB')
        .sort((a, b) => adpOf(a) - adpOf(b))[0];
      if (qb) return qb;
    }
    return ROOMS.adp(board, rand);
  },
  /* THE MEASURED ROOM — the review's item 4, built from what we actually hold.
   *
   * ⚠️ AND THE THING THE REVIEW ASSUMED IS NOT TRUE: THE RAW TRACES ARE NOT
   * RETAINED. `manager_profiles.json` holds the DERIVED profiles — positional
   * mix by round bucket, positional timing, reach delta, softmax dials — built
   * from 450 picks across 3 drafts, and the picks themselves were consumed at
   * build time. The three `draft_ids` are recorded, so Sleeper could serve them
   * again, but nothing in this repo can replay a trace today.
   *
   * So this is the closest honest thing: draw each opponent's POSITION from that
   * seat's measured by-round-bucket mix, then apply their measured REACH DELTA
   * to how far down the ADP list they take it. That mixes measured room
   * behaviour with the parametric model, which is what was asked for, using data
   * that exists.
   *
   * WHAT IT STILL CANNOT DO: reproduce a specific person's specific run. A mix
   * is a marginal; the elite-fall-through defect was found in a TAIL that no
   * marginal contains. Recorded rather than glossed — this narrows the gap the
   * ADP room leaves and does not close it.
   *
   * SILENCE RULE (15): this is a SIMULATION room model. It never renders and is
   * never visible during a live decision.
   */
  profiled: (board, rand, seat) => {
    const prof = PROFILE_BY_SEAT[seat];
    if (!prof) return ROOMS.adp(board, rand);
    const bucket = rand() < 0.25 ? 'early' : (rand() < 0.6 ? 'mid' : 'late');
    const mix = ((prof.draft_patterns || {}).by_round_bucket || {})[bucket];
    const m = mix && mix.mix;
    let pos = null;
    if (m) {
      let r = rand(), acc = 0;
      Object.keys(m).forEach(k => { if (pos === null) { acc += m[k]; if (r <= acc) pos = k; } });
    }
    const at = (pos ? board.filter(p => p.position === pos) : board)
      .sort((a, b) => adpOf(a) - adpOf(b));
    if (!at.length) return ROOMS.adp(board, rand);
    // reach_delta.mean is picks AHEAD of ADP (negative = reaches). sd is theirs.
    const rd = prof.reach_delta || {};
    const jitter = Math.max(0, Math.round(
      (Number(rd.mean) || 0) * -0.1 + Math.abs(rand() - rand()) * (Number(rd.sd) || 10) * 0.3));
    return at[Math.min(at.length - 1, jitter)];
  },

  // A RUN: once someone takes an RB, the next few opponents pile in.
  rb_run: (board, rand) => {
    if (rand() < 0.45) {
      const rb = board.filter(p => p.position === 'RB')
        .sort((a, b) => adpOf(a) - adpOf(b))[0];
      if (rb) return rb;
    }
    return ROOMS.adp(board, rand);
  },
};

/* Counters for the two ways a draft can end SHORT — an arm throwing, and an arm
 * returning nothing. Both produce holes, and neither is a strategy result. */
const ARM_ERRORS = {};
const ARM_ERR_SEEN = {};
const ARM_EMPTY = {};

function simulate(seed, armName, roomName, seat) {
  const rand = rng(seed);
  const mySeat = seat || MY;
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set(KEEPERS.map(k => String(k.player_id)));
  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const idx = (r % 2 === 1) ? mySeat : (TEAMS - mySeat + 1);
    picks.push((r - 1) * TEAMS + idx);
  }
  const mine = new Set(picks.slice(KR));
  const opp = {}; for (let s = 1; s <= TEAMS; s++) opp[s] = [];
  const order = [];
  let moved = 0, beforePts = startingStrength(roster).points;

  for (let o = 1; o <= TEAMS * ROUNDS; o++) {
    const board = pool.filter(p => !gone.has(String(p.player_id)));
    if (!board.length) break;
    if (!mine.has(o)) {
      const pick = (ROOMS[roomName] || ROOMS.adp)(board, rand, slotOf(o));
      if (!pick) break;
      gone.add(String(pick.player_id)); opp[slotOf(o)].push(pick); continue;
    }
    const nx = [...mine].filter(x => x > o).sort((a, b) => a - b)[0] || null;
    const win = [];
    if (nx) for (let q = o; q < nx; q++) { const s = slotOf(q); if (s !== mySeat) win.push({ team_slot: s, pick_no: q, roster: opp[s], profile: null, room: null }); }
    const ctx = { board: board, roster: roster, league: L, weights: E.MEASURED_WEIGHTS,
      currentPick: o, nextPick: nx, totalPicks: TEAMS * ROUNDS,
      myPicksLeft: [...mine].filter(x => x >= o).length,
      roundsLeft: ROUNDS - Math.ceil(o / TEAMS) + 1, runMultipliers: {}, intervening: win };
    /* ⚠️ THIS CATCH USED TO BE SILENT, AND A SILENT ONE HERE MANUFACTURES THE
     * EXACT DEFECT THE TABLE REPORTS. An arm that throws mid-draft breaks the
     * loop, the roster ends SHORT, and `startingStrength` scores the missing
     * slots as HOLES. So "lookahead_2 left 44 starting slots empty" and
     * "lookahead_2 crashed in 44 drafts" would print identically, and I would
     * have read a stack trace as a strategy finding. Same swallowed-error
     * pattern this project has now hit six times — this one was mine, in the
     * instrument I was about to draw a conclusion from.
     *
     * Control flow is UNCHANGED (still breaks) so the numbers stay comparable
     * with the runs already taken; only the silence is removed. */
    let p;
    try { p = ARMS[armName](ctx); } catch (e) {
      ARM_ERRORS[armName] = (ARM_ERRORS[armName] || 0) + 1;
      if (!ARM_ERR_SEEN[armName]) {
        ARM_ERR_SEEN[armName] = true;
        console.error(`   !! ARM THREW — ${armName} @ pick ${o} in room ${roomName}: ${e && e.message}`);
      }
      break;
    }
    if (!p) { ARM_EMPTY[armName] = (ARM_EMPTY[armName] || 0) + 1; break; }
    /* ⚠️ HOW MANY OF MY PICKS THE OBJECTIVE CAN EVEN SEE.
     *
     * The metric is STARTING-lineup points and the bench is worth zero, so once
     * every starting slot is filled EVERY remaining pick scores exactly the
     * same: nothing. Those picks are not "close" under this objective, they are
     * INVISIBLE to it, and each arm then falls through to its own tie-break.
     * greedy_end_state's tie-break is highest raw projection, which is why its
     * modal shape ends in a wall of quarterbacks — a roster no human would build
     * and that this metric cannot distinguish from a good one.
     *
     * Counting it makes the harness state its own blind spot on every run,
     * instead of me discovering it by reading a modal pick shape. */
    const after = startingStrength(roster.concat([p])).points;
    if (after > beforePts + 1e-9) moved++;
    beforePts = after;
    order.push(p.position);
    gone.add(String(p.player_id)); roster.push(p); opp[mySeat].push(p);
  }
  const s = startingStrength(roster);
  return { points: s.points, holes: s.holes, order: order.join(''),
    moved: moved, picks: order.length };
}

// ─────────────────────────────────────────────────────────────── report
const rooms = Number(process.argv[2] || 200);
const varyRooms = process.argv.includes('--rooms-vary');
const armNames = Object.keys(ARMS);

function banner() {
  console.log('='.repeat(78));
  console.log('CONSTRUCTION ORDER — does the sequence change the starting lineup?');
  console.log('='.repeat(78));
  console.log(`${rooms} PAIRED rooms (same seed across arms), seat ${MY}, valuation FIXED.`);
  console.log('Objective: projected points of the STARTING lineup. Bench is worth zero.');
  console.log('PRIOR from published work (12-team, 4th slot): ~86 pts between naive');
  console.log('slot-filling and optimal, about 4.6% of the total.');
  console.log('');
}

function runSet(roomName, seat, label) {
  const res = {}; armNames.forEach(a => { res[a] = []; });
  const holes = {}; armNames.forEach(a => { holes[a] = 0; });
  const shapes = {}; armNames.forEach(a => { shapes[a] = {}; });
  const moved = {}; armNames.forEach(a => { moved[a] = []; });
  const picksN = {}; armNames.forEach(a => { picksN[a] = []; });
  for (let i = 0; i < rooms; i++) {
    const seed = 60000 + i * 104729;                 // SAME SEED across arms
    armNames.forEach(a => {
      const r = simulate(seed, a, roomName, seat);
      res[a].push(r.points);
      if (r.holes) holes[a]++;
      moved[a].push(r.moved); picksN[a].push(r.picks);
      shapes[a][r.order] = (shapes[a][r.order] || 0) + 1;
    });
  }
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * q)]; };
  const base = mean(res.shipped);
  console.log('── ' + label + ' ' + '─'.repeat(Math.max(0, 60 - label.length)));
  console.log('   arm                 mean     vs shipped      p10      p50      p90   holes');
  armNames.forEach(a => {
    const m = mean(res[a]);
    // PAIRED difference, which is the number the design buys.
    const diffs = res[a].map((v, i) => v - res.shipped[i]);
    const dm = mean(diffs);
    const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - dm) * (d - dm), 0) / Math.max(1, diffs.length - 1));
    const se = sd / Math.sqrt(diffs.length);
    console.log(`   ${a.padEnd(18)} ${m.toFixed(1).padStart(7)} `
      + `${(a === 'shipped' ? '     —' : (dm >= 0 ? '+' : '') + dm.toFixed(1) + ' ±' + (1.96 * se).toFixed(1)).padStart(14)} `
      + `${pct(res[a], 0.1).toFixed(0).padStart(8)} ${pct(res[a], 0.5).toFixed(0).padStart(8)} `
      + `${pct(res[a], 0.9).toFixed(0).padStart(8)} ${String(holes[a]).padStart(6)}`);
  });
  console.log(`   shipped mean ${base.toFixed(1)} — the 86-pt published gap would be `
    + `${(86 / base * 100).toFixed(1)}% of it`);

  /* THE PICK SHAPES WERE COLLECTED AND NEVER PRINTED — rule 14 in my own tool,
   * and the omission mattered: the shape is the only thing in this harness that
   * says WHY an arm won. A mean says an arm is better; the modal position order
   * says what it did differently. */
  /* THE HARNESS'S OWN BLIND SPOT, printed before the shapes that reveal it. */
  const mm = a => moved[a].reduce((s, x) => s + x, 0) / Math.max(1, moved[a].length);
  const pp = a => picksN[a].reduce((s, x) => s + x, 0) / Math.max(1, picksN[a].length);
  console.log('   picks the OBJECTIVE CAN SEE (moved the starting lineup) / picks made:');
  armNames.forEach(a => {
    console.log(`     ${a.padEnd(18)} ${mm(a).toFixed(1)} of ${pp(a).toFixed(1)}`
      + `   — ${(100 * (1 - mm(a) / Math.max(1e-9, pp(a)))).toFixed(0)}% of this arm's picks scored ZERO either way`);
  });

  console.log('   modal 12-pick shape (position order, most common of ' + rooms + '):');
  armNames.forEach(a => {
    const top = Object.keys(shapes[a]).sort((x, y) => shapes[a][y] - shapes[a][x])[0];
    const n = top ? shapes[a][top] : 0;
    console.log(`     ${a.padEnd(18)} ${String(top || '—').padEnd(16)} ${n}/${rooms}`
      + `   distinct shapes: ${Object.keys(shapes[a]).length}`);
  });

  /* AND THE HOLES COLUMN IS ONLY READABLE NEXT TO THIS. A draft that ends short
   * because the arm threw scores identically to one that ends short because the
   * arm chose badly. Stated every run, including when it is zero. */
  const errLines = armNames
    .filter(a => ARM_ERRORS[a] || ARM_EMPTY[a])
    .map(a => `${a}: ${ARM_ERRORS[a] || 0} threw, ${ARM_EMPTY[a] || 0} returned nothing`);
  console.log('   short-draft causes: ' + (errLines.length ? errLines.join('; ')
    : 'NONE — no arm threw and no arm returned nothing, so every hole above is a CHOICE'));
  console.log('');
  return res;
}

/* WHICH ROOM. Default adp-with-jitter; `--room X` runs one alternative.
 *
 * ⚠️ AND THE REASON THE PROFILED ROOM MATTERS HERE. Measured today: the ADP room
 * produces an elite fall-through in 0 of 40 drafts and the profiled room in 40 of
 * 40. So every arm comparison above was made inside a room model that is blind to
 * a whole class of event. I ARGUED that pairing cancels a shared blind spot for
 * DIFFERENCES even though it biases LEVELS — this flag is what turns that
 * argument into a measurement. */
const roomArg = (() => {
  const i = process.argv.indexOf('--room');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'adp';
})();

/* CLI-GUARDED so the ROOM MODELS can be required by another tool instead of
 * copied into it. `room_tail_calibration.js` scores these same functions against
 * the real drafts, and a second copy of them would be a harness that could
 * disagree with the one whose results are being defended. */
if (require.main === module) {
  banner();
  runSet(roomArg, MY, `ROOM: ${roomArg} · SEAT ${MY}`);

  if (varyRooms) {
    ['reachy', 'qb_early', 'rb_run', 'profiled'].forEach(r => runSet(r, MY, `ROOM: ${r} · SEAT ${MY}`));
    [2, 5].forEach(s => runSet('adp', s, `ROOM: adp · SEAT ${s}`));
  }
}

module.exports = { ROOMS, DATA, TEAMS, ROUNDS, MY, rng, adpOf, projOf };
