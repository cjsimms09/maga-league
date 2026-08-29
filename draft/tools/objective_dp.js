#!/usr/bin/env node
// TERRITORY: relay
/* THE TRUE OPTIMUM OF THE CONSTRUCTION PROBLEM — prereg §12, P142.
 *
 * Cory: "So mlv is the best idea you have? You can't think of some complex
 * calculus equation that makes this legit?" — and, 08-20, "Your equation
 * still sucks." This tool turns that argument into a measurement: in the
 * fixed-opponent replay the opponents are deterministic, so the stochastic
 * DP collapses to EXACT dynamic programming, and the optimum any
 * construction rule of ANY complexity could reach is computable. If the
 * greedy sits within a few points of that ceiling, no cleverer equation can
 * exist IN THIS FRAMEWORK, and the room to improve is the VALUE SIGNAL
 * (projections), not the construction rule.
 *
 * ── THE THREE REDUCTIONS (each exact in the fixed-draft setting) ─────────────
 * 1. Within a position, an optimal policy always takes the current best
 *    available (exchange argument; values are the market's own order, and the
 *    candidate pool at my slot r is a SUFFIX of the recorded picks, so my k
 *    prior takes of a position are exactly its top-k survivors at any later
 *    slot). So "take position q at my t-th slot having taken k before" prices
 *    as the (k+1)-th surviving q at that slot — the player is determined.
 * 2. The single flex slot is handled exactly by enumerating its source
 *    (RB/WR/TE/none): four additive DPs, max taken.
 * 3. Keepers pre-occupy their position stacks at their recorded values. Their
 *    marginal interaction with my takes is exact by telescoping the top-C sum:
 *    inserting value v into (k prior takes, all ≥ v, plus the keeper
 *    constants) displaces the (C−k)-th best keeper or nothing — closed form,
 *    path-independent, proven against brute lineupValueOf in the self-test.
 *
 * Dead picks (a 15-pick draft has ~4 picks no lineup can use) transition with
 * marginal 0. For GRADING the reconstructed roster they are refilled with the
 * best surviving player by market order under the K≤1/DEF≤1 cap — the same
 * thing the greedy does with surplus picks. The DP total is exact for the
 * internal objective; dead-pick placement cannot change it.
 *
 * ── CONTROLS (3e/3f), all mandatory, run before any number is reported ──────
 * A. The replicated MLV greedy must reproduce the harness's +45.84 actual /
 *    +29.33 skill vs owners to the decimal (known positive — a different
 *    implementation path arriving at the same 30 numbers).
 * B. DP internal objective ≥ MLV internal objective in EVERY seat — an
 *    "optimum" any greedy beats anywhere is a bug, and the run REFUSES.
 * C. lineupValueOf(brute) === base + Σ telescoped marginals on 500 random
 *    take/keeper mixes — the reduction-3 closed form proven, not assumed.
 *
 * Run:  node draft/tools/objective_dp.js
 * Writes draft/data/objective_dp.json. REPORT ONLY — nothing ships from this.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PP = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'player_positions.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const POSOF = {};
Object.entries(PP.positions || {}).forEach(([id, q]) => { POSOF[String(id)] = q; });
BOARD.players.forEach(p => { if (p.position) POSOF[String(p.player_id)] = p.position; });
const posOf = id => POSOF[String(id)] || (/^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : null);

const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
const FLEX = ['RB', 'WR', 'TE'];

function lineupValueOf(vals) {
  let total = 0;
  const left = {};
  POS.forEach(q => {
    const need = STARTERS[q] || 0;
    const have = (vals[q] || []).slice().sort((a, b) => b - a);
    for (let i = 0; i < need; i++) total += have[i] || 0;
    left[q] = have.slice(need);
  });
  const flex = FLEX.flatMap(q => left[q] || []).sort((a, b) => b - a);
  return total + (flex[0] || 0);
}

/* ── grading, same rules as the harness ────────────────────────────────────── */
function bestLineup(roster, pts) {
  const byPos = {};
  roster.forEach(id => {
    const q = posOf(id);
    if (!q) return;
    (byPos[q] || (byPos[q] = [])).push(pts[String(id)] || 0);
  });
  POS.forEach(q => { if (byPos[q]) byPos[q].sort((a, b) => b - a); });
  let total = 0;
  const left = [];
  POS.forEach(q => {
    const need = STARTERS[q] || 0;
    const have = byPos[q] || [];
    for (let i = 0; i < need; i++) total += have[i] || 0;
    if (FLEX.includes(q)) left.push(...have.slice(need));
  });
  left.sort((a, b) => b - a);
  return total + (left[0] || 0);
}
function weeklyPts(season) {
  const weeks = [];
  Object.entries(season.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const pts = {};
    arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => { pts[id] = v; }));
    weeks.push(pts);
  });
  return weeks;
}
function gradeSeason(season, roster) {
  let t = 0;
  weeklyPts(season).forEach(pts => { t += bestLineup(roster, pts); });
  return +t.toFixed(2);
}
function gradeSkill(season, roster) {
  const tot = {}, games = {};
  Object.entries(season.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const seen = new Set();
    arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => {
      if (seen.has(id)) return;
      seen.add(id);
      tot[id] = (tot[id] || 0) + v;
      games[id] = (games[id] || 0) + 1;
    }));
  });
  const rate = {};
  roster.forEach(id => { const k = String(id); if (games[k]) rate[k] = tot[k] / games[k]; });
  return +(bestLineup(roster, rate) * 17).toFixed(2);
}

/* ── the replicated MLV-cap greedy (control A) ─────────────────────────────── */
function mlvSeat(picks, seatId) {
  const N = picks.length;
  const valueOf = p => (N + 1) - p.pick_no;
  const mine = [], held = {}, mineVals = {};
  const gone = new Set();
  picks.forEach((pk, idx) => {
    if (pk.roster_id !== seatId) return;
    if (pk.is_keeper) {
      mine.push(pk.player_id);
      const q = posOf(pk.player_id);
      if (q) { held[q] = (held[q] || 0) + 1; (mineVals[q] || (mineVals[q] = [])).push(valueOf(pk)); }
      return;
    }
    let best = null, bestV = -Infinity;
    for (let j = idx; j < N; j++) {
      const c = picks[j];
      if (c.is_keeper || gone.has(c.player_id)) continue;
      const q = posOf(c.player_id);
      if (!q) continue;
      if ((q === 'K' || q === 'DEF') && (held[q] || 0) >= 1) continue;
      const cur = {};
      POS.forEach(z => { cur[z] = (mineVals[z] || []).slice(); });
      const before = lineupValueOf(cur);
      (cur[q] || (cur[q] = [])).push(valueOf(c));
      const v = lineupValueOf(cur) - before;
      if (v > bestV) { bestV = v; best = c; }
    }
    if (!best) return;
    gone.add(best.player_id);
    mine.push(best.player_id);
    const q = posOf(best.player_id);
    if (q) { held[q] = (held[q] || 0) + 1; (mineVals[q] || (mineVals[q] = [])).push(valueOf(best)); }
  });
  return { mine, mineVals };
}

/* ── reduction-3 marginal: insert v as my (k+1)-th take of a position whose
 * keeper constants are K (sorted desc), contribution cap C ─────────────────── */
function takeMarginal(k, v, K, C) {
  if (k >= C) return 0;
  const ge = K.filter(u => u >= v).length;
  if (k + ge >= C) return 0;
  const size = k + K.length;
  if (size < C) return v;
  return v - K[C - k - 1];   // the (C−k)-th best keeper is displaced
}

/* control C: the closed form vs brute force, 500 random mixes */
(function proveTakeMarginal() {
  let rnd = 1234567;
  const rand = () => (rnd = (rnd * 48271) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 500; trial++) {
    const C = 1 + Math.floor(rand() * 3);
    const K = Array.from({ length: Math.floor(rand() * 3) }, () => Math.floor(rand() * 150));
    K.sort((a, b) => b - a);
    const takes = Array.from({ length: Math.floor(rand() * 4) }, () => Math.floor(rand() * 150))
      .sort((a, b) => b - a);
    const topC = arr => arr.slice().sort((a, b) => b - a).slice(0, C).reduce((x, y) => x + y, 0);
    let total = topC(K), cur = K.slice();
    takes.forEach((v, k) => { total += takeMarginal(k, v, K, C); cur.push(v); });
    const brute = topC(cur);
    if (Math.abs(total - brute) > 1e-9) {
      throw new Error('takeMarginal control FAILED: telescoped ' + total + ' vs brute ' + brute
        + ' (C=' + C + ' K=' + K + ' takes=' + takes + ')');
    }
  }
  console.error('[control C] takeMarginal === brute lineup top-C on 500 random mixes');
})();

/* ── the exact DP for one seat, one flex arm ───────────────────────────────── */
function dpSeat(picks, seatId, flexArm) {
  const N = picks.length;
  const valueOf = p => (N + 1) - p.pick_no;
  const C = {};
  POS.forEach(q => { C[q] = (STARTERS[q] || 0) + (q === flexArm ? 1 : 0); });

  const keepers = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
  const myKeeperIds = [];
  const mySlots = [];
  picks.forEach((pk, idx) => {
    if (pk.roster_id !== seatId) return;
    if (pk.is_keeper) {
      const q = posOf(pk.player_id);
      if (q) keepers[q].push(valueOf(pk));
      myKeeperIds.push(pk.player_id);
    } else mySlots.push(idx);
  });
  POS.forEach(q => keepers[q].sort((a, b) => b - a));
  const base = POS.reduce((s, q) =>
    s + keepers[q].slice(0, C[q]).reduce((x, y) => x + y, 0), 0);

  /* survivors per position: a SUFFIX of that position's non-keeper picks.
   * survStart[q][t] = first index into list[q] alive at my t-th slot. */
  const list = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
  picks.forEach((pk, idx) => {
    if (pk.is_keeper) return;
    const q = posOf(pk.player_id);
    if (q) list[q].push({ idx, id: pk.player_id, v: valueOf(pk) });
  });
  const m = mySlots.length;
  const survStart = {};
  POS.forEach(q => {
    survStart[q] = mySlots.map(r => {
      let lo = 0, hi = list[q].length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (list[q][mid].idx < r) lo = mid + 1; else hi = mid; }
      return lo;
    });
  });

  /* ── state: per position (count, o) where count = my takes so far (capped)
   * and o = how many of those still sit at the FRONT of the current suffix.
   * A take prices at list[survStart + o] — NOT survStart + count, because a
   * player I took early falls out of the suffix once the recorded draft
   * passes his slot, after which he blocks nothing. o decays
   * deterministically between my slots by however far survStart advanced,
   * which is what keeps the exact state small (o ≤ count ≤ C_q ≤ 3). */
  const maxTakes = POS.map(q => (q === 'K' || q === 'DEF')
    ? Math.max(0, 1 - keepers[q].length)       // K/DEF cap counts keepers
    : C[q]);
  /* enumerate (count, o) pairs per position */
  const pairs = maxTakes.map(mt => {
    const a = [];
    for (let cnt = 0; cnt <= mt; cnt++) for (let o = 0; o <= cnt; o++) a.push([cnt, o]);
    return a;
  });
  const pairIdx = pairs.map(a => {
    const m2 = {};
    a.forEach(([cnt, o], i) => { m2[cnt + ':' + o] = i; });
    return m2;
  });
  const dims = pairs.map(a => a.length);
  const S = dims.reduce((a, b) => a * b, 1);
  const NEG = -1e15;
  let cur = new Float64Array(S).fill(NEG);
  cur[0] = 0;                                   // pairs[i][0] === [0,0] for all i
  const choice = [];                            // Int8Array(S): pos index or -1 dead
  const prevs = [];                             // Int32Array(S): pre-decay origin state
  const st = new Array(POS.length);
  for (let t = 0; t < m; t++) {
    const nxt = new Float64Array(S).fill(NEG);
    const ch = new Int8Array(S).fill(-2);
    const pr = new Int32Array(S).fill(-1);
    for (let s = 0; s < S; s++) {
      if (cur[s] <= NEG / 2) continue;
      let rem = s;
      for (let i = POS.length - 1; i >= 0; i--) { st[i] = rem % dims[i]; rem = (rem / dims[i]) | 0; }
      /* decay o by how far each suffix advanced since my previous slot,
       * then branch on this slot's action — one recorded transition, so the
       * backward pass never has to invert the many-to-one decay */
      let sd = 0;
      const stD = new Array(POS.length);
      for (let i = 0; i < POS.length; i++) {
        const [cnt, o] = pairs[i][st[i]];
        const d = t > 0 ? survStart[POS[i]][t] - survStart[POS[i]][t - 1] : 0;
        const o2 = Math.max(0, o - d);
        stD[i] = pairIdx[i][cnt + ':' + o2];
        sd = sd * dims[i] + stD[i];
      }
      /* dead pick: contributes 0 */
      if (nxt[sd] < cur[s]) { nxt[sd] = cur[s]; ch[sd] = -1; pr[sd] = s; }
      for (let i = 0; i < POS.length; i++) {
        const q = POS[i];
        const [cnt, o] = pairs[i][stD[i]];
        if (cnt + 1 > maxTakes[i]) continue;
        const p = survStart[q][t] + o;
        if (p >= list[q].length) continue;      // supply exhausted
        const gain = takeMarginal(cnt, list[q][p].v, keepers[q], C[q]);
        let stride = 1;
        for (let jj = POS.length - 1; jj > i; jj--) stride *= dims[jj];
        const s2 = sd + stride * (pairIdx[i][(cnt + 1) + ':' + (o + 1)] - stD[i]);
        const val = cur[s] + gain;
        if (val > nxt[s2]) { nxt[s2] = val; ch[s2] = i; pr[s2] = s; }
      }
    }
    choice.push(ch);
    prevs.push(pr);
    cur = nxt;
  }

  /* terminal: legality (keepers count toward slots), pick best legal state */
  let bestS = -1, bestVal = NEG;
  for (let s = 0; s < S; s++) {
    if (cur[s] <= NEG / 2) continue;
    let rem = s;
    for (let i = POS.length - 1; i >= 0; i--) { st[i] = rem % dims[i]; rem = (rem / dims[i]) | 0; }
    let legal = true;
    POS.forEach((q, i) => {
      const bodies = pairs[i][st[i]][0] + keepers[q].length;
      let need = STARTERS[q] || 0;
      if (q === flexArm) need += 1;
      if (bodies < need) legal = false;
    });
    if (!legal) continue;
    if (cur[s] > bestVal) { bestVal = cur[s]; bestS = s; }
  }
  if (bestS < 0) return null;

  /* reconstruct backwards via the recorded back-pointers */
  const takes = [];   // {t, i} forward order
  let s = bestS;
  for (let t = m - 1; t >= 0; t--) {
    const i = choice[t][s];
    if (i === -2) throw new Error('DP reconstruction lost the path');
    if (i >= 0) takes.push({ t, i });
    s = prevs[t][s];
  }
  takes.reverse();

  /* forward re-simulation realizes players exactly and re-verifies the total */
  const kcount = {}, ocount = {};
  const roster = myKeeperIds.slice();
  const taken = new Set(roster.map(String));
  const heldPos = {};
  myKeeperIds.forEach(id => { const q = posOf(id); if (q) heldPos[q] = (heldPos[q] || 0) + 1; });
  const deadSlots = [];
  let ti = 0, replayTotal = 0;
  const lastStart = {};
  for (let t = 0; t < m; t++) {
    POS.forEach(q => {
      if (t > 0) {
        const d = survStart[q][t] - survStart[q][t - 1];
        ocount[q] = Math.max(0, (ocount[q] || 0) - d);
      }
    });
    if (ti < takes.length && takes[ti].t === t) {
      const q = POS[takes[ti].i];
      const cnt = kcount[q] = (kcount[q] || 0);
      const o = ocount[q] || 0;
      const pl = list[q][survStart[q][t] + o];
      replayTotal += takeMarginal(cnt, pl.v, keepers[q], C[q]);
      kcount[q] = cnt + 1;
      ocount[q] = o + 1;
      roster.push(pl.id);
      taken.add(String(pl.id));
      heldPos[q] = (heldPos[q] || 0) + 1;
      ti++;
    } else deadSlots.push(t);
  }
  if (Math.abs(replayTotal - bestVal) > 1e-6) {
    throw new Error('DP replay mismatch: ' + replayTotal + ' vs ' + bestVal + ' — reconstruction bug, REFUSING');
  }
  deadSlots.forEach(t => {
    const r = mySlots[t];
    for (let j = r; j < N; j++) {
      const pk = picks[j];
      if (pk.is_keeper || taken.has(String(pk.player_id))) continue;
      const q = posOf(pk.player_id);
      if (!q) continue;
      if ((q === 'K' || q === 'DEF') && (heldPos[q] || 0) >= 1) continue;
      roster.push(pk.player_id);
      taken.add(String(pk.player_id));
      heldPos[q] = (heldPos[q] || 0) + 1;
      break;
    }
  });
  return { internal: base + bestVal, roster };
}

/* ── run ──────────────────────────────────────────────────────────────────── */
/* ⚠️ A SEASON COUNTS ONLY IF IT HAS REALIZED POINTS, NOT MERELY A `weeks` KEY.
 *
 * `if (!season.weeks || ...)` was the guard, and it held while 2026 had no
 * weeks at all. The 2026 scaffolding landed 18 weeks of ZEROS after the 08-22
 * draft — week 1 is 09-10, nothing has been played — and 2026 has a 150-pick
 * draft, so it walked straight through the guard and added TEN SEATS THAT
 * GRADE 0 FOR EVERY OWNER AND EVERY ARM.
 *
 * That is not a small error. It diluted every mean this tool reports by
 * exactly 30/40: the MLV-vs-owner edge read +45.84/+29.33 and became
 * +34.38/+22.00, which is 0.75x to the decimal. Control A caught it and
 * REFUSED to report, which is the control doing precisely its job — the
 * frozen literal was RIGHT and the guard was wrong. Register 419.
 *
 * ⚠️ THE PREDICATE IS "COMPLETE", NOT "SOMEBODY SCORED", AND THE DIFFERENCE
 * IS A DATE. The first cut of this fix asked whether ANY week had realized
 * points. That is correct today and becomes WRONG ON 2026-09-10, when week 1
 * is played: 2026 would then satisfy it and enter a FULL-SEASON grade on
 * 1 of 18 weeks — a subtler error than the zeros, and one that would arrive
 * on a schedule with nobody watching. `gradeSeason` grades a season, so a
 * season qualifies only when every week it carries has been played. Measured:
 * 2023, 2024 and 2025 each have 18 of 18 weeks scored; 2026 has 0 of 18. */
const { isCompleteSeason } = require('./season_completeness.js');

const seats = [];
const skippedUngraded = [];
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  if (!isCompleteSeason(season)) { skippedUngraded.push(season.season); return; }
  const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
  if (!draft) return;
  const picks = (draft.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
  const ids = [...new Set(picks.map(p => p.roster_id))].sort((a, b) => a - b);
  ids.forEach(seatId => {
    const ownerIds = picks.filter(p => p.roster_id === seatId).map(p => p.player_id);
    if (ownerIds.length < 10) return;
    const g = mlvSeat(picks, seatId);
    const mlvInternal = lineupValueOf(g.mineVals);
    let best = null;
    ['none', 'RB', 'WR', 'TE'].forEach(F => {
      const r = dpSeat(picks, seatId, F);
      if (r && (!best || r.internal > best.internal)) best = r;
    });
    if (!best) throw new Error('DP found no legal roster for seat ' + seatId);
    /* control B — non-negotiable */
    if (best.internal + 1e-9 < mlvInternal) {
      throw new Error('CONTROL B FAILED season ' + season.season + ' seat ' + seatId
        + ': DP internal ' + best.internal + ' < MLV internal ' + mlvInternal
        + ' — an optimum a greedy beats is a bug. REFUSING.');
    }
    seats.push({
      season: season.season, seat: seatId,
      mlv_internal: +mlvInternal.toFixed(2),
      dp_internal: +best.internal.toFixed(2),
      gap_pct: +((best.internal - mlvInternal) / mlvInternal * 100).toFixed(3),
      owner_actual: gradeSeason(season, ownerIds), owner_skill: gradeSkill(season, ownerIds),
      mlv_actual: gradeSeason(season, g.mine), mlv_skill: gradeSkill(season, g.mine),
      dp_actual: gradeSeason(season, best.roster), dp_skill: gradeSkill(season, best.roster),
    });
  });
});

/* An exclusion nobody can see is the defect this run was built out of, so it
 * is printed and it goes into the artifact. Register 419. */
if (skippedUngraded.length) {
  console.error('[seasons] EXCLUDED as INCOMPLETE (drafted, but not every '
    + 'week has been played): ' + skippedUngraded.join(', ') + ' — they would grade 0 for every '
    + 'owner and dilute every mean below.');
}

/* control A: the replicated greedy must reproduce the harness numbers */
const mA = seats.reduce((a, s) => a + (s.mlv_actual - s.owner_actual), 0) / seats.length;
const mS = seats.reduce((a, s) => a + (s.mlv_skill - s.owner_skill), 0) / seats.length;
if (Math.abs(mA - 45.84) > 0.02 || Math.abs(mS - 29.33) > 0.02) {
  throw new Error('CONTROL A FAILED: replicated MLV greedy gives ' + mA.toFixed(2) + '/'
    + mS.toFixed(2) + ' vs the harness\'s +45.84/+29.33. REFUSING to report DP numbers.');
}
console.error('[control A] replicated MLV greedy reproduces +45.84/+29.33 ✓ ('
  + mA.toFixed(2) + '/' + mS.toFixed(2) + ')');

const under5 = seats.filter(s => s.gap_pct < 5).length;
const dS = seats.reduce((a, s) => a + (s.dp_skill - s.mlv_skill), 0) / seats.length;
const dA = seats.reduce((a, s) => a + (s.dp_actual - s.mlv_actual), 0) / seats.length;
const dpWins = seats.filter(s => s.dp_skill > s.mlv_skill).length;
const gapSorted = seats.map(s => s.gap_pct).sort((a, b) => a - b);

console.log('='.repeat(74));
console.log('EXACT DP vs MLV-CAP GREEDY — prereg §12, P142');
console.log('='.repeat(74));
console.log('  internal objective (what any equation could optimize):');
console.log('    gap < 5% in ' + under5 + '/30 seats   (prereg bar: ≥ 25/30)');
console.log('    median gap ' + gapSorted[15].toFixed(2) + '%   max gap ' + gapSorted[29].toFixed(2) + '%');
console.log('  graded points of the DP-optimal rosters vs MLV\'s:');
console.log('    skill  ' + (dS >= 0 ? '+' : '') + dS.toFixed(2) + ' pts/season  (DP wins ' + dpWins + '/30)   prereg: >10 = MLV leaves real value');
console.log('    actual ' + (dA >= 0 ? '+' : '') + dA.toFixed(2) + ' pts/season');
console.log('='.repeat(74));

fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'objective_dp.json'),
  JSON.stringify({ generated: new Date().toISOString(), prereg: 'MLV-OBJECTIVE-PREREG-2026-08-19.md §12 (P142)',
    controls: { takeMarginal_brute_500: 'passed', mlv_replication: [+mA.toFixed(2), +mS.toFixed(2)] },
    summary: { seats_gap_under_5pct: under5, median_gap_pct: gapSorted[15], max_gap_pct: gapSorted[29],
      dp_minus_mlv_skill: +dS.toFixed(2), dp_minus_mlv_actual: +dA.toFixed(2), dp_skill_wins: dpWins },
    seats }, null, 1));
