// TERRITORY: A
/* THE DISAGREEMENT RATE, MEASURED BEFORE THE CANDIDATE IS PROPOSED.
 *
 * WHY THIS TOOL EXISTS. The power work established that the disagreement rate
 * dominates every other lever: at the 0.7% rate the opponent dossier actually
 * produces, a 16-point-per-slot edge — larger than an average starter scores —
 * is detected at the false-positive rate. Moving 0.7% -> 20% buys more power
 * than three seasons of data. So the rate is not a curiosity about a candidate,
 * it is the ADMISSION TEST for one, and it has to be measured BEFORE the
 * candidate is argued for, or the argument selects the number.
 *
 * THE BAR: about 10%. Below it, do not propose the comparison at all.
 *
 * WHAT A RATE IS AND IS NOT. This measures how often two rules pick different
 * players. It says NOTHING about which is better — that is what a season of
 * paired weeks is for. A high rate is a licence to run the experiment, not
 * evidence for either arm.
 *
 * FIXED STATE, NOT FREE RUN — inherited from profile_flip.js for the same
 * reason. Both arms are evaluated at identical board states. If each arm drafted
 * its own team the boards would diverge after the first disagreement and every
 * later difference would measure the divergence rather than the rule. The
 * trajectory is driven by the arm that SHIPS TODAY, and that choice is stated
 * because it is a choice.
 *
 * Run: node draft/tools/contrast_rate.js [drafts] [weeks]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../../public/js/draft/engine.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const LEAGUE = DATA.league;
const TEAMS = LEAGUE.teams || 10;
const ROUNDS = LEAGUE.rounds || 15;
const MY_SLOT = LEAGUE.my_draft_slot;
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY_SLOT);
const KEEPER_ROUNDS = (LEAGUE.keeper_rules || {}).count || 0;
const PROJ_GAMES = 17;   // proj_mean is a SEASON total; reconciled against the box-score archive.

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : 9999));
const pct = (n, d) => (d ? (100 * n / d) : 0);
const fpct = (n, d) => d ? pct(n, d).toFixed(1) + '%' : 'n/a';
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

function myPicks() {
  const out = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const idx = (r % 2 === 1) ? MY_SLOT : (TEAMS - MY_SLOT + 1);
    out.push((r - 1) * TEAMS + idx);
  }
  return out.slice(KEEPER_ROUNDS);
}
const slotOf = overall => {
  const r = Math.ceil(overall / TEAMS);
  const i = overall - (r - 1) * TEAMS;
  return (r % 2 === 1) ? i : (TEAMS - i + 1);
};

const STARTERS = LEAGUE.starters || {};
const FLEXABLE = { RB: 1, WR: 1, TE: 1 };

/* The market arm an actual ADP drafter runs: lowest ADP among positions whose
 * starting slots are still open, K and DEF held back to the end. Without the
 * roster constraint the arm drafts no quarterback and beating it measures
 * nothing about following the market. `byAdp` is the board, already sorted. */
function marketPick(byAdp, roster, round) {
  const have = {};
  roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
  const need = {};
  Object.keys(STARTERS).forEach(pos => {
    if (pos === 'FLEX') return;
    if ((have[pos] || 0) < Number(STARTERS[pos] || 0)) need[pos] = 1;
  });
  const flexOpen = Number(STARTERS.FLEX || 0) > 0
    && ['RB', 'WR', 'TE'].some(pos => (have[pos] || 0) >= Number(STARTERS[pos] || 0));
  const late = round >= 13;
  const ok = p => {
    if ((p.position === 'K' || p.position === 'DEF') && !late) return false;
    if (need[p.position]) return true;
    if (flexOpen && FLEXABLE[p.position]) return true;
    return Object.keys(need).length === 0 && p.position !== 'K' && p.position !== 'DEF';
  };
  return byAdp.find(ok) || null;
}

/* ── CONTRAST A: THE WEIGHT VECTOR ──────────────────────────────────────────
 * MEASURED_WEIGHTS (what app.js:52 ships) against DEFAULT_WEIGHTS. Four terms
 * the Lab measured as drag — tier, need, risk, bye — are zeroed in one and
 * believed in the other. Trajectory follows MEASURED, the shipping arm.
 *
 * CONTRAST B rides along on the same simulation, at the same decision points:
 * the shipping recommendation against a MARKET-ANCHORED arm, in two versions,
 * because the difference between them is the whole trap.
 *
 *   naive   lowest adjusted_adp on the board, full stop.
 *   roster  lowest adjusted_adp among players who fill a starting slot I have
 *           not filled; K and DEF held until round 13, as everyone does.
 *
 * The naive arm is a STRAW MAN and is reported as one: it will happily leave me
 * without a quarterback, so beating it measures nothing about market-following.
 * The roster-aware arm is what an ADP drafter in this league actually does.
 */
function draftContrasts(seed) {
  const rand = rng(seed);
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set(KEEPERS.map(k => String(k.player_id)));
  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const mine = new Set(myPicks());
  const oppRosters = {};
  for (let s = 1; s <= TEAMS; s++) oppRosters[s] = [];
  const out = [];

  for (let overall = 1; overall <= TEAMS * ROUNDS; overall++) {
    const board = pool.filter(p => !gone.has(String(p.player_id)));
    if (!board.length) break;

    if (!mine.has(overall)) {
      const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 8);
      const pick = top[Math.min(top.length - 1, Math.floor(rand() * rand() * top.length))];
      if (!pick) break;
      gone.add(String(pick.player_id));
      oppRosters[slotOf(overall)].push(pick);
      continue;
    }

    const nextMine = [...mine].filter(x => x > overall).sort((a, b) => a - b)[0] || null;
    const window = [];
    if (nextMine) {
      for (let o = overall; o < nextMine; o++) {
        const s = slotOf(o);
        if (s === MY_SLOT) continue;
        window.push({ team_slot: s, pick_no: o, roster: oppRosters[s], profile: null, room: null });
      }
    }
    const base = {
      board: board, roster: roster, league: LEAGUE,
      currentPick: overall, nextPick: nextMine, totalPicks: TEAMS * ROUNDS,
      myPicksLeft: [...mine].filter(x => x >= overall).length,
      roundsLeft: ROUNDS - Math.ceil(overall / TEAMS) + 1,
      runMultipliers: {},
    };
    // A FRESH ctx PER ARM. The engine memoises survival onto the object it is
    // given; a shared ctx serves arm two the answers computed for arm one, and
    // the contrast then reports zero — the failure that looks like a true null.
    let measured, dflt;
    try {
      measured = E.recommend(Object.assign({}, base, { intervening: window.map(w => Object.assign({}, w)), weights: E.MEASURED_WEIGHTS }));
      dflt = E.recommend(Object.assign({}, base, { intervening: window.map(w => Object.assign({}, w)), weights: E.DEFAULT_WEIGHTS }));
    } catch (e) { break; }
    if (!measured || !measured.length || !dflt || !dflt.length) break;

    const byAdp = board.slice().sort((a, b) => adpOf(a) - adpOf(b));
    const market = byAdp[0];
    const marketRoster = marketPick(byAdp, roster, Math.ceil(overall / TEAMS)) || market;

    out.push({
      overall: overall, round: Math.ceil(overall / TEAMS),
      measured: measured[0].player, dflt: dflt[0].player,
      market: market, market_roster: marketRoster,
      adp_measured: adpOf(measured[0].player), adp_market: adpOf(marketRoster),
    });

    gone.add(String(measured[0].player.player_id));
    roster.push(measured[0].player);
    oppRosters[MY_SLOT].push(measured[0].player);
  }
  return out;
}

/* ── CONTRAST C: THE LINEUP OBJECTIVE ───────────────────────────────────────
 * max E[points] against max P(win). They can only differ through VARIANCE: a
 * big underdog should buy it and a big favourite should sell it. The question
 * is whether our matchups are ever lopsided enough for that to bite.
 *
 * Rosters are drawn from the live board so the projections and spreads are the
 * real ones; the opponent's total is drawn 0.75x-1.25x mine, which is roughly
 * what a ten-team league produces. Weekly units: proj_mean/17 and weekly_sd.
 */
function drawRoster(rand) {
  const byPos = {};
  DATA.players.forEach(p => {
    if (!p.position || p.proj_mean == null || !(p.weekly_sd > 0)) return;
    (byPos[p.position] = byPos[p.position] || []).push(p);
  });
  Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0)));
  // Roughly a drafted roster: two deep at each starting spot, one at K/DEF.
  const want = { QB: 2, RB: 5, WR: 5, TE: 2, K: 1, DEF: 1 };
  const out = [];
  Object.keys(want).forEach(pos => {
    const list = byPos[pos] || [];
    const depth = Math.min(list.length, Math.max(want[pos] * 6, 12));
    const taken = new Set();
    for (let i = 0; i < want[pos] && taken.size < depth; i++) {
      let j;
      do { j = Math.floor(rand() * depth); } while (taken.has(j));
      taken.add(j);
      out.push(list[j]);
    }
  });
  return out.map(p => ({
    id: String(p.player_id), name: p.name, pos: p.position,
    mu: Number(p.proj_mean) / PROJ_GAMES, sd: Number(p.weekly_sd),
  }));
}

function slots() {
  const out = [];
  Object.keys(STARTERS).forEach(pos => {
    for (let i = 0; i < Number(STARTERS[pos] || 0); i++) out.push(pos);
  });
  return out;
}
const eligible = (slot, pos) => slot === 'FLEX' ? !!FLEXABLE[pos] : slot === pos;

function bestByPoints(roster) {
  const sl = slots(), used = new Set(), out = [];
  // Scarcest slots first so FLEX cannot steal a player a strict slot needs.
  sl.sort((a, b) => (a === 'FLEX' ? 1 : 0) - (b === 'FLEX' ? 1 : 0));
  sl.forEach(s => {
    const cands = roster.filter(p => !used.has(p.id) && eligible(s, p.pos))
      .sort((a, b) => b.mu - a.mu);
    if (cands.length) { used.add(cands[0].id); out.push({ slot: s, p: cands[0] }); }
    else out.push({ slot: s, p: null });
  });
  return out;
}
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
function pWin(lineup, oppMu, oppSd) {
  let mu = 0, v = 0;
  lineup.forEach(x => { if (x.p) { mu += x.p.mu; v += x.p.sd * x.p.sd; } });
  return normCdf((mu - oppMu) / Math.sqrt(v + oppSd * oppSd));
}
function bestByWin(roster, oppMu, oppSd) {
  let cur = bestByPoints(roster).map(x => Object.assign({}, x));
  let best = pWin(cur, oppMu, oppSd);
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < cur.length && !moved; i++) {
      const startersIds = new Set(cur.map(x => x.p && x.p.id).filter(Boolean));
      const bench = roster.filter(p => !startersIds.has(p.id) && eligible(cur[i].slot, p.pos));
      for (const b of bench) {
        const trial = cur.map(x => Object.assign({}, x));
        trial[i] = { slot: cur[i].slot, p: b };
        const pw = pWin(trial, oppMu, oppSd);
        if (pw > best + 1e-9) { best = pw; cur = trial; moved = true; break; }
      }
    }
    if (!moved) break;
  }
  return cur;
}

function lineupContrast(nWeeks, seed) {
  const rand = rng(seed);
  let slotsTotal = 0, slotsDiff = 0, weeksDiff = 0, lopsided = 0;
  const gaps = [];
  for (let w = 0; w < nWeeks; w++) {
    const roster = drawRoster(rand);
    const byPts = bestByPoints(roster);
    let mu = 0, v = 0;
    byPts.forEach(x => { if (x.p) { mu += x.p.mu; v += x.p.sd * x.p.sd; } });
    const ratio = 0.75 + rand() * 0.5;
    const oppMu = mu * ratio, oppSd = 23.6;   // measured team-week SD, 540 team-weeks
    if (ratio < 0.85 || ratio > 1.15) lopsided++;
    const byWin = bestByWin(roster, oppMu, oppSd);
    let d = 0;
    for (let i = 0; i < byPts.length; i++) {
      slotsTotal++;
      const a = byPts[i].p && byPts[i].p.id, b = byWin[i].p && byWin[i].p.id;
      if (a !== b) { d++; slotsDiff++; }
    }
    if (d) {
      weeksDiff++;
      gaps.push(pWin(byWin, oppMu, oppSd) - pWin(byPts, oppMu, oppSd));
    }
  }
  return { slotsTotal, slotsDiff, weeksDiff, nWeeks, lopsided, gaps };
}

/* ── CONTRAST D: ONE SOURCE AGAINST THE CONSENSUS ───────────────────────────
 * FantasyPros alone against the shipped two-source blend.
 *
 * THE ARTIFACT THIS AVOIDS. Comparing raw `proj_fantasypros` against `vorp`
 * compares two different SCALES and reports ~90% disagreement, all of it
 * arithmetic. Replacement level is defined by a ROSTER SLOT — i.e. by a rank —
 * so the FP arm's replacement is recomputed as the FP projection of the player
 * sitting at the same positional rank the shipped replacement sits at. Both
 * arms are then VORPs in their own units and the comparison is real.
 */
function sourceContrast() {
  const uni = DATA.players.filter(p => p.position && p.proj_mean != null
    && p.proj_fantasypros != null && p.replacement != null);
  const byPos = {};
  uni.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
  const fpVorp = new Map();
  Object.keys(byPos).forEach(pos => {
    const list = byPos[pos];
    const shipped = list.slice().sort((a, b) => b.proj_mean - a.proj_mean);
    const repl = Number(list[0].replacement);
    // The rank the shipped replacement level sits at, in the shipped scale.
    let rank = shipped.findIndex(p => Number(p.proj_mean) <= repl);
    if (rank < 0) rank = shipped.length - 1;
    const fpSorted = list.slice().sort((a, b) => b.proj_fantasypros - a.proj_fantasypros);
    const fpRepl = Number(fpSorted[Math.min(rank, fpSorted.length - 1)].proj_fantasypros);
    list.forEach(p => fpVorp.set(String(p.player_id), Number(p.proj_fantasypros) - fpRepl));
  });
  const shippedRank = uni.slice().sort((a, b) => Number(b.vorp) - Number(a.vorp));
  const fpRank = uni.slice().sort((a, b) =>
    fpVorp.get(String(b.player_id)) - fpVorp.get(String(a.player_id)));
  const memberDiff = n => {
    const A = new Set(shippedRank.slice(0, n).map(p => String(p.player_id)));
    let miss = 0;
    fpRank.slice(0, n).forEach(p => { if (!A.has(String(p.player_id))) miss++; });
    return { n: n, differ: miss };
  };
  /* The DECISION-relevant version: at each successive board state, does the FP
   * arm take someone else?
   *
   * THE ARTIFACT THE UNION FIXES, and it is rule 13f in one line. The first
   * version removed only the SHIPPED arm's pick. So the moment the two arms
   * disagreed once, the FP arm's favourite stayed on the board and it re-picked
   * him at every later state — 88% disagreement, of which one was real and 131
   * were bookkeeping. It read exactly like "the sources disagree constantly",
   * which is what I expected to find. Removing BOTH arms' picks keeps the two
   * at the same board state, which is the only state at which a disagreement
   * means anything. */
  let picks = 0, differ = 0;
  const gone = new Set();
  for (let i = 0; i < 150; i++) {
    const a = shippedRank.find(p => !gone.has(String(p.player_id)));
    const b = fpRank.find(p => !gone.has(String(p.player_id)));
    if (!a || !b) break;
    picks++;
    if (String(a.player_id) !== String(b.player_id)) differ++;
    gone.add(String(a.player_id));
    gone.add(String(b.player_id));
  }
  return { top: [memberDiff(50), memberDiff(100), memberDiff(200)], picks, differ };
}

// ─────────────────────────────────────────────────────────── report
const nDrafts = Number(process.argv[2] || 10);
const nWeeks = Number(process.argv[3] || 400);

console.log('='.repeat(74));
console.log('DISAGREEMENT RATES — measured BEFORE any candidate is argued for');
console.log('='.repeat(74));
console.log('The bar is ~10%. Below it the comparison is unresolvable at our sample');
console.log('and should not be proposed at all. A rate says nothing about WHICH arm');
console.log('is right — only whether a season could ever tell us.');
console.log('');

const rows = [];
for (let d = 0; d < nDrafts; d++) draftContrasts(3000 + d * 104729).forEach(r => rows.push(r));
const same = (a, b) => String(a.player_id) === String(b.player_id);
const wDiff = rows.filter(r => !same(r.measured, r.dflt)).length;
const mDiff = rows.filter(r => !same(r.measured, r.market)).length;
const mrDiff = rows.filter(r => !same(r.measured, r.market_roster)).length;

console.log('── A · MEASURED_WEIGHTS vs DEFAULT_WEIGHTS ' + '─'.repeat(31));
console.log(`   ${wDiff}/${rows.length} picks differ   ${fpct(wDiff, rows.length)}`
  + `   ${pct(wDiff, rows.length) >= 10 ? 'ADMITTED' : 'BELOW BAR'}`);
{
  const byRound = {}, tot = {};
  rows.forEach(r => { tot[r.round] = (tot[r.round] || 0) + 1; });
  rows.filter(r => !same(r.measured, r.dflt)).forEach(r => { byRound[r.round] = (byRound[r.round] || 0) + 1; });
  const line = Object.keys(tot).map(Number).sort((a, b) => a - b)
    .map(rd => 'r' + rd + ' ' + fpct(byRound[rd] || 0, tot[rd])).join('  ');
  console.log('   by round: ' + line);
}
console.log('');
console.log('── B · MODEL-ANCHORED vs MARKET-ANCHORED ' + '─'.repeat(33));
console.log(`   naive  (lowest ADP, no roster) : ${mDiff}/${rows.length}  ${fpct(mDiff, rows.length)}`
  + '   STRAW MAN — drafts no quarterback');
console.log(`   roster-aware (what ADP drafters run) : ${mrDiff}/${rows.length}  ${fpct(mrDiff, rows.length)}`
  + `   ${pct(mrDiff, rows.length) >= 10 ? 'ADMITTED' : 'BELOW BAR'}`);
{
  const g = rows.filter(r => !same(r.measured, r.market_roster))
    .map(r => Math.abs(r.adp_measured - r.adp_market)).filter(x => Number.isFinite(x));
  console.log(`   ADP gap when they differ: median ${median(g) == null ? 'n/a' : median(g).toFixed(1)}`
    + ` picks, max ${g.length ? Math.max.apply(null, g).toFixed(1) : 'n/a'}`);
  const byRound = {}, tot = {};
  rows.forEach(r => { tot[r.round] = (tot[r.round] || 0) + 1; });
  rows.filter(r => !same(r.measured, r.market_roster)).forEach(r => { byRound[r.round] = (byRound[r.round] || 0) + 1; });
  console.log('   by round: ' + Object.keys(tot).map(Number).sort((a, b) => a - b)
    .map(rd => 'r' + rd + ' ' + fpct(byRound[rd] || 0, tot[rd])).join('  '));
  // THE PICKS THEMSELVES. A rate with no examples beside it cannot be sanity
  // checked, and a 90%+ rate is exactly where a straw man hides.
  console.log('   sample:');
  rows.filter(r => !same(r.measured, r.market_roster)).slice(0, 8).forEach(r => {
    console.log(`     r${String(r.round).padStart(2)}  model ${r.measured.name} (${r.measured.position}`
      + `, adp ${adpOf(r.measured).toFixed(0)})   vs market ${r.market_roster.name} `
      + `(${r.market_roster.position}, adp ${adpOf(r.market_roster).toFixed(0)})`);
  });
}
console.log('');

const L = lineupContrast(nWeeks, 55501);
console.log('── C · max E[POINTS] vs max P(WIN) ' + '─'.repeat(39));
console.log(`   ${L.slotsDiff}/${L.slotsTotal} starter slots differ   ${fpct(L.slotsDiff, L.slotsTotal)}`);
console.log(`   ${L.weeksDiff}/${L.nWeeks} weeks with at least one differing slot   ${fpct(L.weeksDiff, L.nWeeks)}`);
console.log(`   -> about ${(pct(L.weeksDiff, L.nWeeks) / 100 * 14).toFixed(1)} weeks of a 14-week season`
  + `   ${(pct(L.weeksDiff, L.nWeeks) / 100 * 14) >= 8 ? 'ADMITTED' : 'BELOW BAR ON PAIRED WEEKS'}`);
if (L.gaps.length) {
  const g = median(L.gaps) * 100, mx = Math.max.apply(null, L.gaps) * 100;
  console.log(`   P(win) bought when it differs: median ${g.toFixed(2)}pp, max ${mx.toFixed(2)}pp`);
  // THE STAKE, not the rate. Two objectives that disagree on the roster and
  // agree on the outcome are one strategy wearing two names.
  const seasonWeeks = pct(L.weeksDiff, L.nWeeks) / 100 * 14;
  console.log(`   -> the whole season's stake is about ${(g * seasonWeeks / 100).toFixed(3)}`
    + ' expected wins. This is why the rate alone does not admit a candidate.');
}
console.log('');

const S = sourceContrast();
console.log('── D · FANTASYPROS ALONE vs THE TWO-SOURCE CONSENSUS ' + '─'.repeat(21));
S.top.forEach(t => console.log(`   top-${String(t.n).padEnd(3)} membership differs on ${t.differ}/${t.n}   ${fpct(t.differ, t.n)}`));
console.log(`   best-available differs on ${S.differ}/${S.picks} picks   ${fpct(S.differ, S.picks)}`
  + `   ${pct(S.differ, S.picks) >= 10 ? 'ADMITTED' : 'BELOW BAR'}`);
console.log('');
console.log('── E · OPPONENT-BLIND vs OPPONENT-MODELLED ' + '─'.repeat(31));
console.log('   0.7% — measured by draft/tools/profile_flip.js, not re-run here.');
console.log('   DROPPED. Nothing detectable at any effect size this league can carry.');
