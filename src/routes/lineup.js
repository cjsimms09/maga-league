'use strict';
//
// THE LINEUP OPTIMIZER — the in-season tool that captures the measured leak.
//
// The Lab measured it (EFFICIENCY-LEAK.md, experiment L0, certified grader): the
// optimal-in-hindsight lineup would have earned each team **$445–595/season more**
// than they collected, in weekly-high + regular-season money alone — Cory's own
// three-year total is **$2,100**, his lineup efficiency **86–89%** three seasons
// running. Weekly-high is ~70–75% of it: $100/week rides on the top score and one
// benched boom decides it.
//
// This module is the forward tool that attacks that leak. Given a roster with
// projections, this week's opponent, and this week's high-point band, it finds
// the lineup that maximises EXPECTED DOLLARS under a DUAL objective:
//
//   E[$] = P(win the matchup) · matchup_value  +  P(clear the weekly-high band) · $100
//
// The two objectives pull differently — the high-chase rewards variance (a boom
// bench play can clear 150 when the safe floor never will), the matchup rewards a
// high floor — so the E[$]-optimal lineup is NOT always "start your highest
// projection." That gap is the tool's edge, and it is priced in dollars per call.
//
// The band is the HARVESTED per-week winning distribution (money-grading
// requirement #2: sample the bar from real weeks, never a flat constant), not a
// made-up 150.
//
// PROVEN BEFORE WEEK 1: `replayEfficiency()` reproduces L0's realized-vs-optimal
// figures on 2023-25 to the decimal (see the validation route + scratchpad
// harness), so the same solver that finds the optimum on replayed weeks is the
// one recommending live lineups.
//
// DATA: reads draft/data/league_history.json (A's harvest, read-only) for the
// backtest + the band; live projections come from sleeper.js (A's lane) at
// request time. Positions are inferred from the harvest's own starters ordering
// (roster_sim.infer_positions, ported) — no external player DB needed.

const fs = require('fs');
const path = require('path');

function findFile(rel) {
  const roots = [
    path.join(__dirname, '..', '..'),
    process.cwd(),
    '/var/task',
    path.join(__dirname, '..', '..', '..', '..'),
  ];
  for (const r of roots) {
    const p = path.join(r, rel);
    try { if (fs.existsSync(p)) return p; } catch (e) { /* keep looking */ }
  }
  return path.join(roots[0], rel);
}

let _harvest = null;
function harvest() {
  if (_harvest) return _harvest;
  _harvest = JSON.parse(fs.readFileSync(findFile('draft/data/league_history.json'), 'utf8'));
  return _harvest;
}
// Era-correct payouts per season (weekly-high amount + regular-season prize both
// changed across eras). Read from the committed by_season config rather than a
// hardcoded per-year map, so the Leak analysis stays correct at every rollover
// instead of needing a new literal added each January.
let _payouts = null;
function payoutsBySeason() {
  if (_payouts) return _payouts;
  try { _payouts = (JSON.parse(fs.readFileSync(findFile('draft/config/payouts.json'), 'utf8')) || {}).by_season || {}; }
  catch (e) { _payouts = {}; }
  return _payouts;
}
// Sleeper handle -> real FIRST name, from the identity map. The proof/efficiency
// tables come off the harvest keyed by Sleeper display_name (coryjsimms, ds7mmet,
// B8T3S…); the commissioner reads these weekly and should see Cory / David /
// Bates, the same names the rest of the site uses. Falls back to the handle.
let _nameByHandle = null;
function ownerName(handle) {
  if (!_nameByHandle) {
    _nameByHandle = {};
    try {
      const m = (JSON.parse(fs.readFileSync(findFile('draft/config/identity_map.json'), 'utf8')) || {}).by_real_name || {};
      for (const [real, v] of Object.entries(m)) if (v && v.handle) _nameByHandle[v.handle] = String(real).split(' ')[0];
    } catch (e) { _nameByHandle = {}; }
  }
  return _nameByHandle[handle] || handle;
}
function seasonOf(history, season) {
  return (history.seasons || []).find(s => String(s.season) === String(season)) || null;
}

const FLEX_ELIGIBLE = new Set(['RB', 'WR', 'TE']);
const r2 = n => Math.round(n * 100) / 100;
const r4 = n => Math.round(n * 10000) / 10000;   // efficiency wants finer than 2dp

// --- slots -------------------------------------------------------------------
// Derived from roster_positions so it is never hardcoded wrong (the seed-data
// ROSTER is stale — it lists no dedicated TE; the harvest is ground truth:
// QB,RB,RB,WR,WR,TE,FLEX,K,DEF).
function slotsFromTemplate(template) {
  const slots = {};
  for (const slot of (template || [])) {
    if (slot === 'BN' || slot === 'IR' || slot === 'TAXI') continue;
    slots[slot] = (slots[slot] || 0) + 1;
  }
  return slots;
}
const DEFAULT_SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };

// --- positions from the harvest (port of roster_sim.infer_positions) ---------
function inferPositions(season) {
  const template = season.roster_positions || [];
  const pos = {};
  for (const entries of Object.values(season.weeks || {})) {
    for (const e of (entries || [])) {
      const starters = e.starters || [];
      for (let i = 0; i < template.length && i < starters.length; i++) {
        const slot = template[i];
        if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(slot)) pos[String(starters[i])] = slot;
      }
    }
  }
  return pos;
}

// --- the solver (exact port of roster_sim.best_lineup_points) ----------------
// Dedicated slots take the top scorers of their position; the lone FLEX then
// takes the best remaining flex-eligible. Moving anyone from a dedicated slot
// into FLEX can never raise the total, so greedy-by-position + best-remaining-
// flex is exact for a single flex.
function bestLineup(playerPts, posById, rosterIds, slots) {
  slots = slots || DEFAULT_SLOTS;
  const byPos = {};
  for (const pidRaw of rosterIds) {
    const pid = String(pidRaw);
    const p = posById[pid];
    if (!p) continue;
    (byPos[p] = byPos[p] || []).push([pid, Number(playerPts[pid] || 0)]);
  }
  for (const p of Object.keys(byPos)) byPos[p].sort((a, b) => b[1] - a[1]);

  const used = new Set();
  const starters = [];
  for (const [pos, n] of Object.entries(slots)) {
    if (pos === 'FLEX') continue;
    let taken = 0;
    for (const [pid, pt] of (byPos[pos] || [])) {
      if (taken >= n) break;
      if (used.has(pid)) continue;
      used.add(pid); starters.push({ pid, slot: pos, points: pt }); taken++;
    }
  }
  for (let k = 0; k < (slots.FLEX || 0); k++) {
    let best = null;
    for (const pos of FLEX_ELIGIBLE) {
      for (const [pid, pt] of (byPos[pos] || [])) {
        if (used.has(pid)) continue;
        if (best === null || pt > best.points) best = { pid, points: pt };
        break;   // each list sorted; first unused is its best
      }
    }
    if (best) { used.add(best.pid); starters.push({ pid: best.pid, slot: 'FLEX', points: best.points }); }
  }
  return { points: r2(starters.reduce((a, s) => a + s.points, 0)), starters };
}

// --- variance model: weekly SD by position, learned from the harvest ---------
// Grounds the probability model in real dispersion rather than a guess. A
// player's weekly score ~ Normal(projection, sigma[pos]); starters independent.
function positionSigmas(history, seasons) {
  history = history || harvest();
  seasons = seasons || defaultSeasons(history);
  const byPos = {};   // pos -> [points...]
  for (const season of seasons) {
    const s = seasonOf(history, season);
    if (!s) continue;
    const pos = inferPositions(s);
    for (const entries of Object.values(s.weeks || {})) {
      for (const e of (entries || [])) {
        for (const [pid, v] of Object.entries(e.players_points || {})) {
          const p = pos[String(pid)];
          if (!p) continue;
          (byPos[p] = byPos[p] || []).push(Number(v || 0));
        }
      }
    }
  }
  const out = {};
  for (const [p, arr] of Object.entries(byPos)) {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const varc = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1);
    out[p] = r2(Math.sqrt(varc));
  }
  return out;
}
// A safe fallback so the model never divides by zero if a position is absent.
const FALLBACK_SIGMA = { QB: 8, RB: 7, WR: 7, TE: 6, K: 4, DEF: 5, FLEX: 7 };
function sigmaOf(pos, learned) { return (learned && learned[pos]) || FALLBACK_SIGMA[pos] || 7; }

// --- the weekly-high band (harvested threshold distribution) -----------------
// Port of money_grade.weekly_high_threshold_distribution: the winning score of
// every regular-season week across seasons. n=45 on 2023-25, median ~148.5.
function weeklyHighBand(history, seasons) {
  history = history || harvest();
  seasons = seasons || defaultSeasons(history);
  const samples = [];
  for (const season of seasons) {
    const s = seasonOf(history, season);
    if (!s) continue;
    const field = fieldWeeklyScores(s);
    for (const w of regularSeasonWeeks(s)) {
      const scores = field[w] || {};
      const vals = Object.values(scores);
      if (vals.length) samples.push(r2(Math.max(...vals)));
    }
  }
  samples.sort((a, b) => a - b);
  const n = samples.length;
  return {
    samples, n,
    min: n ? samples[0] : 0,
    median: n ? samples[Math.floor(n / 2)] : 0,
    max: n ? samples[n - 1] : 0,
    mean: n ? r2(samples.reduce((a, b) => a + b, 0) / n) : 0,
  };
}

// The Leak analyzes COMPLETED seasons only. Exclude the current (in-progress)
// season DYNAMICALLY — was `y !== '2026'`, a literal that at the January rollover
// silently drops the just-finished 2026 (now analyzable) and stops excluding the
// new in-progress 2027. `currentYear` defaults to the calendar year (so Jan 2027
// excludes 2027, includes 2026); the route can pass the season-config year for
// precision.
function defaultSeasons(history, currentYear) {
  const cur = String(currentYear || new Date().getUTCFullYear());
  return (history.seasons || [])
    .map(s => String(s.season))
    .filter(y => y !== cur && seasonOf(history, y) && Object.keys(seasonOf(history, y).weeks || {}).length)
    .sort();
}

// --- field / weeks (ports of money_grade) ------------------------------------
function fieldWeeklyScores(season) {
  const out = {};
  for (const [wk, entries] of Object.entries(season.weeks || {})) {
    const w = Number(wk); out[w] = {};
    for (const e of (entries || [])) {
      if (e.roster_id == null) continue;
      out[w][Number(e.roster_id)] = Number(e.points || 0);
    }
  }
  return out;
}
function regularSeasonWeeks(season) {
  const pw = Number((season.settings || {}).playoff_week_start || 15);
  return Object.keys(fieldWeeklyScores(season)).map(Number).filter(w => w < pw).sort((a, b) => a - b);
}

// --- season-long roster pool (L0's ceiling basis) ----------------------------
// L0 grades the hindsight ceiling against every player a team rostered ALL
// season (roster churns weekly), scoring each at that week's league-wide actual
// points. That is a higher ceiling than "best of this week's roster" because it
// also credits never dropping a player — it measures lineup + retention, not the
// lineup alone. The live optimizer uses the per-week roster (you can't start who
// you don't currently hold); these functions exist to REPRODUCE L0 exactly.
function globalPlayerPoints(season) {
  const out = {};
  for (const [wk, entries] of Object.entries(season.weeks || {})) {
    const w = Number(wk); const pts = {};
    for (const e of (entries || [])) {
      for (const [pid, v] of Object.entries(e.players_points || {})) pts[String(pid)] = Number(v || 0);
    }
    out[w] = pts;
  }
  return out;
}
function seasonPlayers(season, rosterId) {
  const ids = new Set();
  for (const entries of Object.values(season.weeks || {})) {
    for (const e of (entries || [])) {
      if (Number(e.roster_id) === Number(rosterId)) for (const p of (e.players || [])) ids.add(String(p));
    }
  }
  return [...ids];
}
// {week: best-legal-lineup points} for a season-long roster (port of
// roster_sim.roster_weekly_scores).
function rosterWeeklyScores(season, rosterIds, posById, slots) {
  const gpp = globalPlayerPoints(season);
  const out = {};
  for (const [w, pts] of Object.entries(gpp)) out[Number(w)] = bestLineup(pts, posById, rosterIds, slots).points;
  return out;
}

// --- probability primitives --------------------------------------------------
// Abramowitz-Stegun normal CDF; plenty accurate for a start/sit decision.
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  let p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
// P(my team outscores the opponent), both teams ~ Normal(mean, var).
function pWin(myMean, myVar, oppMean, oppVar) {
  const s = Math.sqrt(Math.max(1e-9, myVar + oppVar));
  return normCdf((myMean - oppMean) / s);
}
// P(clear the weekly-high band): averaged over the harvested thresholds, so the
// bar is a realistic distribution of winning scores, not one flattering number.
function pClearHigh(myMean, myVar, bandSamples) {
  const s = Math.sqrt(Math.max(1e-9, myVar));
  if (!bandSamples || !bandSamples.length) return 0;
  let acc = 0;
  for (const t of bandSamples) acc += normCdf((myMean - t) / s);
  return acc / bandSamples.length;
}

// --- lineup stats under the projection model ---------------------------------
function lineupStats(starters, projById, sigmaById) {
  let mean = 0, varc = 0;
  for (const s of starters) {
    mean += Number(projById[s.pid] || 0);
    const sd = Number(sigmaById[s.pid] || 7);
    varc += sd * sd;
  }
  return { mean: r2(mean), varc: r2(varc), sd: r2(Math.sqrt(varc)) };
}

// --- ACTIVE-PROJECTION GUARD -------------------------------------------------
// The optimizer has no calendar: it seats whoever carries the highest projection
// for a slot. That is correct ONLY when a player who will not play this week
// carries a ZERO projection. The live path's projection fallbacks do not
// guarantee that — a season-average or last-week number is a full, positive
// projection for a player who is on bye or ruled OUT this week. Left unguarded,
// the tool recommends starting a benched player. So a player known not to be
// playing has his projection forced to zero BEFORE the roster reaches the solver.
//
// Two signals, both read defensively so an absent field is simply not a match:
//   • injury — Sleeper's injury_status (rosterView already carries it as row.inj)
//              for the statuses that mean "not playing". Questionable/Doubtful are
//              deliberately left alone: they MIGHT play, and that uncertainty is
//              exactly what the variance model already prices.
//   • bye    — row.bye === the week being optimized. WIRED (A, 2026-08-09):
//              rosterView now stamps row.bye from src/nfl_byes.json (team→bye,
//              derived from the board), joined on the player's CURRENT team so a
//              trade resolves to the new team's bye. A season with no map leaves
//              bye null and this arm stays a no-op (injury guard still fires).
const INACTIVE_INJURY = new Set(['OUT', 'IR', 'PUP', 'SUS', 'NA', 'DNR', 'COV', 'RES', 'DNP']);
function isInactive(row, weekNo) {
  if (!row) return false;
  const inj = row.inj != null ? String(row.inj).toUpperCase().replace(/[^A-Z]/g, '') : '';
  if (inj && INACTIVE_INJURY.has(inj)) return true;
  if (weekNo != null && row.bye != null && Number(row.bye) === Number(weekNo)) return true;
  return false;
}
// Zero the projection of a player who will not play this week; pass others
// through unchanged. Pure — the caller owns where it applies (member.js live path).
function activeProjection(proj, row, weekNo) {
  return isInactive(row, weekNo) ? 0 : Number(proj || 0);
}

/**
 * THE FORWARD OPTIMIZER — this week's E[$]-maximising lineup and priced calls.
 *
 * @param roster    [{ id, name, pos, proj }]  a manager's full roster with projections
 * @param ctx {
 *   slots        starting-slot counts (defaults to the league's)
 *   sigmaByPos   weekly SD by position (defaults to the harvest-learned set)
 *   oppMean      opponent's projected total (0 disables the matchup term)
 *   oppSd        opponent's projected SD (defaults to a team-typical value)
 *   band         { samples }  harvested weekly-high thresholds
 *   matchupValue $ weight on P(win) — the assumed value of the head-to-head result
 *                (default $25, a typical side-bet stake; tune to your RS/playoff stakes)
 *   weeklyHigh   $ weight on P(clear high) — default $100 (the league's weekly prize)
 * }
 * @returns { lineup, naive, calls[], ev, confidence }
 */
function optimize(roster, ctx = {}) {
  const slots = ctx.slots || DEFAULT_SLOTS;
  const sigmaByPos = ctx.sigmaByPos || FALLBACK_SIGMA;
  const bandSamples = (ctx.band && ctx.band.samples) || [];
  const matchupValue = ctx.matchupValue == null ? 25 : Number(ctx.matchupValue);
  const weeklyHigh = ctx.weeklyHigh == null ? 100 : Number(ctx.weeklyHigh);
  const oppMean = Number(ctx.oppMean || 0);
  const oppVar = Math.pow(Number(ctx.oppSd || 24), 2);   // team SD ~ 24 by default

  const projById = {}, posById = {}, sigmaById = {}, nameById = {};
  for (const p of roster) {
    projById[String(p.id)] = Number(p.proj || 0);
    posById[String(p.id)] = p.pos;
    // Per-player SD when supplied (boom/bust players differ within a position —
    // a projection service's own uncertainty); position-typical SD otherwise.
    sigmaById[String(p.id)] = p.sd != null ? Number(p.sd) : sigmaOf(p.pos, sigmaByPos);
    nameById[String(p.id)] = p.name || String(p.id);
  }
  const ids = roster.map(p => String(p.id));

  const evOf = (starters) => {
    const st = lineupStats(starters, projById, sigmaById);
    const pw = oppMean > 0 ? pWin(st.mean, st.varc, oppMean, oppVar) : null;
    const ph = pClearHigh(st.mean, st.varc, bandSamples);
    const dollars = (pw != null ? pw * matchupValue : 0) + ph * weeklyHigh;
    return { ...st, pWin: pw, pHigh: ph, dollars: r2(dollars) };
  };

  // NAIVE = "start your studs" = the E[points]-optimal lineup (highest projection).
  const naiveL = bestLineup(projById, posById, ids, slots);
  const naiveEv = evOf(naiveL.starters);

  // Hill-climb on E[$]: from the naive lineup, try every legal single swap of a
  // bench player for a starter of a slot he is eligible for; keep the best
  // positive-gain swap; repeat until no swap improves E[$]. Converges fast (a
  // roster is ~15 players) and lands the dual-objective optimum in practice —
  // the only lineups that beat the E[pts] optimum trade a little mean for enough
  // variance to raise P(clear high) by more dollars than it costs P(win).
  let current = naiveL.starters.map(s => ({ ...s }));
  let curEv = naiveEv;
  const starterSet = () => new Set(current.map(s => s.pid));
  for (let iter = 0; iter < 24; iter++) {
    let best = null;
    const inLineup = starterSet();
    const bench = ids.filter(id => !inLineup.has(id));
    for (let i = 0; i < current.length; i++) {
      const slot = current[i].slot;
      for (const cand of bench) {
        const candPos = posById[cand];
        const eligible = slot === 'FLEX' ? FLEX_ELIGIBLE.has(candPos) : candPos === slot;
        if (!eligible) continue;
        const trial = current.map(s => ({ ...s }));
        trial[i] = { pid: cand, slot, points: 0 };
        const ev = evOf(trial);
        const gain = ev.dollars - curEv.dollars;
        if (gain > 1e-6 && (!best || gain > best.gain)) best = { i, cand, ev, gain, replaced: current[i].pid };
      }
    }
    if (!best) break;
    current[best.i] = { pid: best.cand, slot: current[best.i].slot, points: 0 };
    curEv = best.ev;
  }

  // The calls: every difference between the recommended lineup and the naive one,
  // each priced by the marginal E[$] of making that single swap against naive.
  const recSet = starterSet();
  const naiveSet = new Set(naiveL.starters.map(s => s.pid));
  const calls = [];
  // Pair each newly-started player with the naive starter it displaced in the
  // same slot, so a call reads "start X over Y".
  const naiveBySlotIdx = naiveL.starters.map(s => s.pid);
  for (let i = 0; i < current.length; i++) {
    const inPid = current[i].pid;
    const outPid = naiveBySlotIdx[i];
    if (inPid === outPid) continue;
    // Price this one swap in isolation, against the naive baseline.
    const trial = naiveL.starters.map(s => ({ ...s }));
    trial[i] = { pid: inPid, slot: current[i].slot, points: 0 };
    const ev = evOf(trial);
    const dWin = (ev.pWin != null && naiveEv.pWin != null) ? ev.pWin - naiveEv.pWin : 0;
    const dHigh = ev.pHigh - naiveEv.pHigh;
    calls.push({
      slot: current[i].slot,
      startId: inPid, startName: nameById[inPid], startPos: posById[inPid], startProj: projById[inPid],
      sitId: outPid, sitName: nameById[outPid], sitPos: posById[outPid], sitProj: projById[outPid],
      dWin: r2(dWin), dHigh: r2(dHigh),
      dollarsWin: r2(dWin * matchupValue),
      dollarsHigh: r2(dHigh * weeklyHigh),
      dollars: r2(dWin * matchupValue + dHigh * weeklyHigh),
    });
  }
  calls.sort((a, b) => b.dollars - a.dollars);

  const recStarters = current.map(s => ({ ...s, name: nameById[s.pid], pos: posById[s.pid], proj: projById[s.pid] }));
  return {
    slots,
    lineup: recStarters,
    naive: naiveL.starters.map(s => ({ pid: s.pid, name: nameById[s.pid], pos: posById[s.pid], proj: projById[s.pid] })),
    ev: curEv,
    naiveEv,
    edge: r2(curEv.dollars - naiveEv.dollars),
    calls,
    assumptions: { matchupValue, weeklyHigh, oppMean, oppSd: Math.sqrt(oppVar), bandMedian: median(bandSamples) },
    confidence: confidenceSentence(calls, curEv, naiveEv, bandSamples),
  };
}

function median(arr) {
  if (!arr || !arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// The one honest sentence every recommendation carries. No call => say so plainly.
function confidenceSentence(calls, ev, naiveEv, band) {
  if (!calls.length) {
    return 'Your projection-optimal lineup is also the dollar-optimal one this week — '
      + 'no start/sit call to make. Confidence: this is a floor-and-ceiling tie, not a coin flip.';
  }
  const top = calls[0];
  const bits = [];
  bits.push(`Start ${top.startName} over ${top.sitName} — worth ≈ $${top.dollars.toFixed(0)} this week`);
  const parts = [];
  if (Math.abs(top.dollarsHigh) >= 0.5) parts.push(`${top.dollarsHigh >= 0 ? '+' : ''}$${top.dollarsHigh.toFixed(0)} from the weekly-high chase (${top.dHigh >= 0 ? '+' : ''}${(top.dHigh * 100).toFixed(0)}% to clear ${median(band) != null ? Math.round(median(band)) : 'the band'})`);
  if (Math.abs(top.dollarsWin) >= 0.5) parts.push(`${top.dollarsWin >= 0 ? '+' : ''}$${top.dollarsWin.toFixed(0)} from win probability (${top.dWin >= 0 ? '+' : ''}${(top.dWin * 100).toFixed(0)}%)`);
  if (parts.length) bits.push('(' + parts.join(', ') + ')');
  bits.push(`Total lineup edge over starting your studs: $${r2(ev.dollars - naiveEv.dollars).toFixed(0)}.`);
  return bits.join(' ');
}

// THE ONE NON-OBVIOUS WEEKLY CALL — chase the $100, or protect the matchup?
//
// Every week a manager faces the same fork: start a boom-or-bust player to chase
// the weekly high, or start the safe floor to bank the head-to-head. The E[$]
// solver already resolves it, but it never SAYS which mode you're in — and that
// is the single most valuable thing this tool can tell you. This reads the answer
// straight off what the solver did:
//   • the naive lineup is your highest-projection studs (the highest floor); the
//     solver only ever deviates to ADD ceiling for the high-chase, so a positive
//     edge means "the tool is trading floor for ceiling" = CHASE, and ~zero edge
//     means "your studs are already optimal" = PROTECT.
//   • WHY is read off P(win) and P(clear the high): a nearly-won or nearly-lost
//     matchup frees you to chase; a coin-flip matchup with the $100 out of reach
//     is the case to protect.
// Returns a plain headline + one honest sentence. Pure — no live data of its own.
function weeklyPosture(res, band) {
  const ev = (res && res.ev) || {};
  const pWin = ev.pWin;                 // null when the opponent isn't set yet
  const pHigh = Number(ev.pHigh || 0);
  const edge = Number((res && res.edge) || 0);

  // NO PROJECTIONS YET. After the draft but before the week's stats exist, every
  // player falls to a zero projection, so the lineup's mean is ~0 and pWin
  // collapses to ~0%. Read literally that becomes "P(win) 0% — play the floor",
  // which is doom, not truth: there is simply nothing to optimize yet. A real
  // eight-starter lineup always sums well above 1, so a near-zero mean can only
  // be the all-zero fallback — say the honest thing instead of a scary call.
  if (Number(ev.mean || 0) < 1 && res && res.lineup && res.lineup.length) {
    return {
      mode: 'pending',
      headline: 'No projections yet — nothing to optimize',
      why: 'Your roster is set, but there are no player projections for this week '
        + 'yet. The start/sit and chase-versus-protect call lights up the moment '
        + 'projections land — check back closer to kickoff.',
    };
  }
  const pct = p => p == null ? '—' : Math.round(p * 100) + '%';
  const dol = n => (n >= 0 ? '+$' : '−$') + Math.abs(Math.round(n));
  const chasing = edge >= 1;            // the solver traded floor for ceiling

  if (!chasing) {
    const coinflip = pWin != null && pWin >= 0.35 && pWin <= 0.65;
    return {
      mode: 'protect',
      headline: coinflip ? 'Protect the matchup — it’s a coin flip'
                         : 'Start your studs — no chase this week',
      why: pWin != null
        ? `Your highest-projection lineup is also the dollar-optimal one. P(win) ${pct(pWin)}, P($100) ${pct(pHigh)} — `
          + (coinflip
              ? 'the matchup is the live money; a boom-or-bust play would risk a winnable game for a lottery ticket you probably won’t hit. Play the floor.'
              : 'not enough weekly-high upside to trade any floor for it. Play the floor.')
        : 'Your highest-projection lineup is also the dollar-optimal one — no start/sit call to make.',
    };
  }
  if (pWin != null && pWin >= 0.75) {
    return { mode: 'chase', headline: 'Chase the weekly $100 — your matchup is nearly won',
      why: `P(win) ${pct(pWin)}: the win is close to banked, so the live money is the $100. Starting your ceiling can clear it and can’t cost you the matchup — worth ${dol(edge)} over your studs.` };
  }
  if (pWin != null && pWin <= 0.25) {
    return { mode: 'chase', headline: 'Swing for the $100 — the matchup is a long shot',
      why: `P(win) ${pct(pWin)}: the matchup is likely lost, so the $100 is your only live money. Go maximum ceiling — worth ${dol(edge)} over your studs.` };
  }
  if (pWin == null) {
    return { mode: 'chase', headline: 'Chase the weekly $100',
      why: `Opponent not set yet — with no matchup to protect, the priced lineup swings for the $100 (P ${pct(pHigh)}), worth ${dol(edge)}. Re-check when their projection lands.` };
  }
  return { mode: 'chase', headline: 'Chase the $100 — worth trading some floor',
    why: `P(win) ${pct(pWin)}, P($100) ${pct(pHigh)}: enough weekly-high upside that trading a little floor for ceiling pays — worth ${dol(edge)} over your studs.` };
}

// -----------------------------------------------------------------------------
// VALIDATION — reproduce L0's realized-vs-optimal efficiency on 2023-25.
// This is the proof the solver is correct: the same bestLineup() that recommends
// live must reproduce the certified grader's ceiling to the decimal.
// -----------------------------------------------------------------------------
function replayEfficiency(history, seasons) {
  history = history || harvest();
  seasons = seasons || defaultSeasons(history);
  const perSeason = [];
  for (const season of seasons) {
    const s = seasonOf(history, season);
    if (!s) continue;
    const pos = inferPositions(s);
    const rsw = new Set(regularSeasonWeeks(s));
    const teams = {};   // roster_id -> { real, opt, weeks }
    for (const [wk, entries] of Object.entries(s.weeks || {})) {
      const w = Number(wk);
      if (!rsw.has(w)) continue;
      for (const e of (entries || [])) {
        const rid = e.roster_id;
        const t = (teams[rid] = teams[rid] || { real: 0, opt: 0, weeks: 0, owner: (s.owners[rid] || {}).display_name, name: ownerName((s.owners[rid] || {}).display_name) });
        t.real += Number(e.points || 0);
        const pts = {};
        for (const [pid, v] of Object.entries(e.players_points || {})) pts[String(pid)] = Number(v || 0);
        t.opt += bestLineup(pts, pos, Object.keys(pts), DEFAULT_SLOTS).points;
        t.weeks++;
      }
    }
    const rows = Object.entries(teams).map(([rid, t]) => ({
      roster_id: Number(rid), owner: t.owner, name: t.name,
      realized: r2(t.real), optimal: r2(t.opt),
      leak: r2(t.opt - t.real),
      efficiency: t.opt > 0 ? r4(t.real / t.opt) : 1,
    })).sort((a, b) => a.efficiency - b.efficiency);
    const effs = rows.map(r => r.efficiency);
    perSeason.push({
      season, teams: rows,
      meanEfficiency: r4(effs.reduce((a, b) => a + b, 0) / effs.length),
      meanPointLeak: r2(rows.reduce((a, b) => a + b.leak, 0) / rows.length),
    });
  }
  return perSeason;
}

// Weekly-high DOLLAR leak per team: substitute one seat's optimal-in-hindsight
// weekly series into the field, re-run weekly_high_winners, diff the dollars.
// Port of the weekly-high half of money_grade.grade_substituted — the dominant
// (~70-75%) term of the leak, and self-contained (no RS standings / playoffs).
function weeklyHighLeak(history, seasons) {
  history = history || harvest();
  seasons = seasons || defaultSeasons(history);
  const WEEKLY_AMOUNT = 100;
  const out = [];
  for (const season of seasons) {
    const s = seasonOf(history, season);
    if (!s) continue;
    const pos = inferPositions(s);
    const field = fieldWeeklyScores(s);      // realized {week:{rid:pts}}
    const rsw = regularSeasonWeeks(s);
    // optimal weekly series per roster
    const optSeries = {};   // rid -> {week: optimalPoints}
    for (const [wk, entries] of Object.entries(s.weeks || {})) {
      const w = Number(wk); if (!rsw.includes(w)) continue;
      for (const e of (entries || [])) {
        const pts = {};
        for (const [pid, v] of Object.entries(e.players_points || {})) pts[String(pid)] = Number(v || 0);
        (optSeries[e.roster_id] = optSeries[e.roster_id] || {})[w] = bestLineup(pts, pos, Object.keys(pts), DEFAULT_SLOTS).points;
      }
    }
    const whDollars = (fieldScores, rid) => {
      let total = 0;
      for (const w of rsw) {
        const scores = fieldScores[w] || {};
        const vals = Object.values(scores);
        if (!vals.length) continue;
        const top = Math.max(...vals);
        const winners = Object.keys(scores).filter(k => scores[k] === top);
        if (winners.includes(String(rid))) total += WEEKLY_AMOUNT / winners.length;
      }
      return total;
    };
    const rows = [];
    for (const rid of Object.keys(optSeries)) {
      const actual = whDollars(field, rid);
      // substitute this seat's optimal series into the field
      const sub = {};
      for (const w of rsw) {
        sub[w] = { ...(field[w] || {}) };
        if (optSeries[rid][w] != null) sub[w][rid] = optSeries[rid][w];
      }
      const optimal = whDollars(sub, rid);
      rows.push({ roster_id: Number(rid), owner: (s.owners[rid] || {}).display_name, name: ownerName((s.owners[rid] || {}).display_name),
        actualWH: r2(actual), optimalWH: r2(optimal), leakWH: r2(optimal - actual) });
    }
    rows.sort((a, b) => b.leakWH - a.leakWH);
    out.push({ season, teams: rows, meanLeakWH: r2(rows.reduce((a, b) => a + b.leakWH, 0) / rows.length) });
  }
  return out;
}

// L0 REPRODUCTION — the certified headline, to the dollar. For each seat, grade
// the season-long hindsight ceiling's weekly-high + RS dollars against realized,
// exactly as lab.py's exp_lineup_ceiling_money does. This is the strongest proof
// the engine is correct: same numbers as A's certified, cert-gated grader.
function ceilingLeak(history, seasons) {
  history = history || harvest();
  seasons = seasons || defaultSeasons(history);
  // Era-correct, from the by_season payouts config — not a hardcoded per-year map
  // that goes stale every rollover (and was wrong the moment a payout vote passed).
  const PBS = payoutsBySeason();
  const out = [];
  for (const season of seasons) {
    const s = seasonOf(history, season); if (!s) continue;
    const pos = inferPositions(s);
    const field = fieldWeeklyScores(s);
    const rsw = regularSeasonWeeks(s);
    const matchups = weeklyMatchups(s);
    const pcfg = PBS[season] || {};
    const wh = (pcfg.weekly_high && pcfg.weekly_high.amount != null) ? pcfg.weekly_high.amount : 100;
    const prize = pcfg.regular_season
      ? { champ: pcfg.regular_season.champ, ru: pcfg.regular_season.runner_up }
      : { champ: 250, ru: 125 };

    const whDollars = (fieldScores, rid) => {
      let total = 0;
      for (const w of rsw) {
        const sc = fieldScores[w] || {}; const vals = Object.values(sc);
        if (!vals.length) continue;
        const top = Math.max(...vals);
        const winners = Object.keys(sc).filter(k => sc[k] === top);
        if (winners.includes(String(rid))) total += wh / winners.length;
      }
      return total;
    };
    const rsDollars = (fieldScores, rid) => {
      const rec = {};
      const rosters = new Set();
      for (const w of rsw) for (const k of Object.keys(fieldScores[w] || {})) rosters.add(Number(k));
      for (const r of rosters) rec[r] = { rid: r, wins: 0, pf: 0 };
      for (const w of rsw) {
        const sc = fieldScores[w] || {}; const pair = matchups[w] || {};
        for (const [r, pts] of Object.entries(sc)) {
          rec[r].pf += pts; const opp = pair[r];
          if (opp == null || sc[opp] == null) continue;
          if (pts > sc[opp]) rec[r].wins++;
        }
      }
      const table = Object.values(rec).sort((a, b) => b.wins - a.wins || b.pf - a.pf);
      const rank = table.findIndex(t => t.rid === Number(rid)) + 1;
      return rank === 1 ? prize.champ : (rank === 2 ? prize.ru : 0);
    };

    const rids = Object.keys(field[rsw[0]] || {}).map(Number);
    let sumWk = 0, sumRs = 0, sumTot = 0; const rows = [];
    for (const rid of rids) {
      const pool = seasonPlayers(s, rid);
      const ceiling = rosterWeeklyScores(s, pool, pos);   // {week: optimal pts}
      const sub = {};
      for (const w of rsw) { sub[w] = { ...(field[w] || {}) }; if (ceiling[w] != null) sub[w][rid] = ceiling[w]; }
      const dWk = whDollars(sub, rid) - whDollars(field, rid);
      const dRs = rsDollars(sub, rid) - rsDollars(field, rid);
      sumWk += dWk; sumRs += dRs; sumTot += dWk + dRs;
      rows.push({ roster_id: rid, owner: (s.owners[rid] || {}).display_name, name: ownerName((s.owners[rid] || {}).display_name),
        highPoolLeak: r2(dWk), matchupLeak: r2(dRs), totalLeak: r2(dWk + dRs) });
    }
    const n = rows.length;
    rows.sort((a, b) => b.totalLeak - a.totalLeak);
    out.push({ season,
      meanTotalLeak: r2(sumTot / n), meanHighPoolLeak: r2(sumWk / n), meanMatchupLeak: r2(sumRs / n),
      bestSeat: rows[0], teams: rows });
  }
  return out;
}

function weeklyMatchups(season) {
  const out = {};
  for (const [wk, entries] of Object.entries(season.weeks || {})) {
    const w = Number(wk); const byMid = {};
    for (const e of (entries || [])) {
      if (e.matchup_id == null) continue;
      (byMid[e.matchup_id] = byMid[e.matchup_id] || []).push(Number(e.roster_id));
    }
    const pair = {};
    for (const rids of Object.values(byMid)) if (rids.length === 2) { pair[rids[0]] = rids[1]; pair[rids[1]] = rids[0]; }
    out[w] = pair;
  }
  return out;
}

// A single real week, up close: what a manager actually started vs the optimal
// lineup from the SAME roster that week, and the points left on the bench. Makes
// the leak tangible ("week 6, 2024, you left 23.4 on the bench"). Read-only.
function weekDrill(season, week, ownerDisplayName) {
  const history = harvest();
  const s = seasonOf(history, season);
  if (!s || !s.weeks || !s.weeks[String(week)]) return null;
  const pos = inferPositions(s);
  // resolve owner display_name -> roster_id for this season
  const rid = Object.keys(s.owners || {}).find(k => (s.owners[k] || {}).display_name === ownerDisplayName);
  if (rid == null) return null;
  const entry = (s.weeks[String(week)] || []).find(e => Number(e.roster_id) === Number(rid));
  if (!entry) return null;

  const template = s.roster_positions || [];
  const pts = {};
  for (const [pid, v] of Object.entries(entry.players_points || {})) pts[String(pid)] = Number(v || 0);
  const nameFallback = pid => pid;   // no name DB here; the UI can map ids it knows

  // Actual started: the harvest's starters array (ordered to roster_positions).
  const startedIds = (entry.starters || []).map(String);
  const startedSet = new Set(startedIds);
  const actualPoints = r2((entry.starters_points || []).reduce((a, b) => a + Number(b || 0), 0)) || Number(entry.points || 0);

  // Optimal from the same week's roster.
  const opt = bestLineup(pts, pos, Object.keys(pts), DEFAULT_SLOTS);
  const optSet = new Set(opt.starters.map(s2 => s2.pid));

  // The specific mistakes: players who should have started but were benched, and
  // who they'd replace.
  const shouldHaveStarted = opt.starters
    .filter(s2 => !startedSet.has(s2.pid))
    .map(s2 => ({ pid: s2.pid, slot: s2.slot, points: s2.points }));
  const benchedByMistake = shouldHaveStarted;

  return {
    season: String(season), week: Number(week), owner: ownerName(ownerDisplayName),
    actual: { starters: startedIds.map(pid => ({ pid, points: pts[pid] != null ? r2(pts[pid]) : null, pos: pos[pid] || '?' })), points: r2(actualPoints) },
    optimal: { starters: opt.starters.map(s2 => ({ pid: s2.pid, points: r2(s2.points), pos: pos[s2.pid] || s2.slot, slot: s2.slot })), points: opt.points },
    leak: r2(opt.points - actualPoints),
    benchedByMistake,
  };
}

// THE SUNDAY ALERT — the thing that actually captures the leak: fires before
// kickoff with the specific start/sit calls and what each is worth in dollars.
// Formats an optimize() result into a concise, deliverable alert (email + the
// on-page preview). No calls worth making => it says so plainly (a quiet week is
// a real answer, not a bug).
function sundayAlert(result, opts = {}) {
  if (!result) return null;
  const band = opts.band || null;
  const calls = (result.calls || []).filter(c => c.dollars > 0.5).slice(0, 4).map(c => ({
    start: c.startName, sit: c.sitName, pos: c.startPos,
    dollars: r2(c.dollars),
    high: r2(c.dollarsHigh), win: r2(c.dollarsWin),
    why: `${c.dollarsHigh >= 0 ? '+' : ''}$${Math.round(c.dollarsHigh)} weekly-high · ${c.dollarsWin >= 0 ? '+' : ''}$${Math.round(c.dollarsWin)} win-prob`,
  }));
  const edge = r2(result.edge || 0);
  const posture = weeklyPosture(result, band);   // chase vs protect — the alert's lead
  return {
    week: opts.week || null,
    hasCalls: calls.length > 0,
    posture,
    headline: calls.length
      ? `${calls.length} start/sit call${calls.length === 1 ? '' : 's'} worth ≈ $${Math.round(edge)} this week`
      : "You're already starting the dollar-optimal lineup — nothing to change.",
    calls, edge,
    band: band ? { median: Math.round(band.median) } : null,
    pWin: result.ev && result.ev.pWin != null ? Math.round(result.ev.pWin * 100) : null,
    pHigh: result.ev && result.ev.pHigh != null ? Math.round(result.ev.pHigh * 100) : null,
    confidence: result.confidence,
    projected: result.ev ? result.ev.mean : null,
  };
}

module.exports = {
  // engine
  optimize, bestLineup, inferPositions, slotsFromTemplate, DEFAULT_SLOTS, weekDrill, sundayAlert, weeklyPosture,
  activeProjection, isInactive, INACTIVE_INJURY, FLEX_ELIGIBLE,
  positionSigmas, sigmaOf, weeklyHighBand,
  pWin, pClearHigh, normCdf, lineupStats,
  // data
  harvest, seasonOf, defaultSeasons, fieldWeeklyScores, regularSeasonWeeks, weeklyMatchups,
  globalPlayerPoints, seasonPlayers, rosterWeeklyScores,
  // validation
  replayEfficiency, weeklyHighLeak, ceilingLeak,
};
