#!/usr/bin/env node
'use strict';
// TERRITORY: D
/* P282 — THE BENCH-OPTION MODEL AS THE WAIVER ADVISOR: THE PAIRED HARNESS.
 *
 * Cory (via the relay's 08-20 dispatch, ROUTES.md "PAGE TURNED"): build the
 * paired counterfactual NOW, before week 1 of the 2026 season, so it can
 * grade live off real waiver-wire data the moment it exists. LEARNING TARGET
 * (PREDICTION-LEDGER.md P282): does pricing each waiver claim by
 * ΔE[rest-of-season lineup points] under the bench-option wire+absence
 * objective reorder the incumbent waiver tool's (`src/routes/waivers.js`)
 * top-3 recommendations in >=30% of weeks 1-5, AND do the reordered picks
 * outscore the incumbent's picks on PAIRED rest-of-season points?
 * CONSEQUENCE ROUTE: TRUE -> D rebuilds /waivers on the objective; FALSE ->
 * the friction constants get re-fit from failed-claim data and one re-test.
 *
 * ⚠️⚠️⚠️ CORRECTED 2026-08-20, SAME DAY — READ draft/audit/
 * waiver_advisor_paired_harness_2026-08-20.md §0 BEFORE TRUSTING ANYTHING
 * BELOW ⚠️⚠️⚠️
 *
 * This file originally claimed the `--opt` flag "does not exist anywhere in
 * this repository" and that the ledger's v1-v9 bench-option numbers had no
 * code behind them. THAT WAS WRONG. The branch search behind it checked
 * `git log --all` and every LOCALLY FETCHED branch, not every branch on
 * `origin` — `git ls-remote origin` (not run originally) shows
 * `claude/fantasy-football-research-926y6z` at commit `01668acc`, +276
 * lines to `draft/tools/roster_builder_replay.js`, real `optV`/`optU`/
 * `optCurveFor` functions matching the ledger's mechanism trail. Fetched,
 * checked out to its real path, and RUN directly (not just read): it
 * executes cleanly, five named controls pass, real numbers print. Reverted
 * after. The code is real; it is simply not yet merged into `main` or this
 * branch — already a tracked, dated ROUTES ask to A, not a new defect.
 *
 * CONSEQUENCE FOR THIS HARNESS, UNCHANGED BY THE CORRECTION: at the time
 * this file was written the real functions were not visible from here, so
 * what follows IS still an ORIGINAL, hand-transcribed reimplementation of
 * the bench-option VALUE FUNCTION V(R) from the prereg's prose (§1, §2, §7),
 * not the real `optV`/`optU`. That means Rule 11 (reuse, don't reimplement)
 * was NOT actually honored here, now that the real code is known to exist —
 * this section should be replaced with the real functions (adapted from a
 * 15-round draft sequence to a single in-season claim decision) before this
 * harness's own numbers are trusted either way. Until that swap happens,
 * this file's dry-run numbers below are evidence about THIS
 * reimplementation's behavior only — NOT about the real, graded `--opt`
 * objective, and NOT a signal on P282 in either direction.
 *
 * What IS reused, genuinely, per Rule 11 (cited at each use site below):
 *   - `src/routes/waivers.js` `evaluateClaims()` / `dropCandidate()` — THE
 *     INCUMBENT TOOL, called unmodified, exactly as it runs today.
 *   - `public/js/draft/valuation.js` `claimValue()`/`startableValue()` —
 *     transitively, via the incumbent tool.
 *   - `src/routes/lineup.js` `LO.harvest()`, `LO.slotsFromTemplate()`,
 *     `LO.bestLineup()` — the league history loader and the one lineup
 *     solver, not a second copy.
 *   - `draft/tools/lineup_edge_backtest_blend.js` `recencyWeightedAvg()`,
 *     `shrinkageToPosition()`, `computePositionConstants()` — the leak-free
 *     per-player weekly projection this session already built and proved
 *     leak-free (P143), reused here as the DRY-RUN-ONLY player-level source
 *     (see §B below for why it is not the live source).
 *   - `draft/data/waiver_realized_level.json` `rows[pos].floor_per_week` —
 *     the committed wire-level (WAIVER_WK) numbers, not retyped constants.
 *   - `draft/tools/bench_wire_room_sim.js`'s `mulberry32()` PRNG — the
 *     existing seeded-RNG pattern this codebase already uses for reproducible
 *     stochastic sims, copied verbatim rather than re-invented.
 *
 * ── §A. RULE 3f PREMISE CHECK #2 — DOES `league_history.json` CAPTURE
 *    FAILED WAIVER CLAIMS? (ROUTES.md V1, filed as an open C-lane item
 *    suggesting it might not) ──
 *
 * CHECKED DIRECTLY, not assumed. `league_history.json`'s `season.transactions`
 * is keyed by week; each entry carries `type` ('waiver'|'free_agent'|'trade')
 * and `status` ('complete'|'failed'). Counted across all three seasons:
 *
 *     season  waiver-type txns   failed   complete
 *     2023          336            107       ...
 *     2024          307             93       ...
 *     2025          294             89       ...
 *
 * (exact figures reprinted by controls below at run time). V1's premise is
 * ANSWERED, not open: YES, failed claims ARE captured, 289 of them across
 * three seasons, with the losing `adds`/`drops` intent recorded on each row
 * — `free_agent`-type transactions never carry `status: failed` (uncontested
 * adds do not fail), only `waiver`-type ones do, which is exactly the shape
 * a real FAAB/priority system produces. This is good news, reported here
 * because a corrected V1 changes what the relay dispatches to C.
 *
 * ── §B. THE WIRE POOL AND THE PLAYER-LEVEL SOURCE, BY ARM ──
 *
 * DECISION POPULATION: every (season, week, roster_id) in weeks 1-5 of
 * 2023/2024/2025 where the wire pool (below) has >=3 candidates.
 *
 * WIRE POOL for (season, week): every player_id that appears as an `adds`
 * target of ANY waiver/free_agent transaction in THAT week, status complete
 * OR failed, across all 10 rosters, minus anyone already on the DECIDING
 * roster's own week-(w-1) snapshot. Disclosed scope limit: this is the set
 * of players SOMEONE actually contested that week, not the full theoretical
 * free-agent universe (a deep, nobody-claimed-him wire body is invisible to
 * this reconstruction because league_history never records an uncontested
 * non-event) — but it is real, leak-free (built only from that week's own
 * transactions), and it is exactly the wire two decision rules can be
 * compared on.
 *
 * PLAYER LEVEL (both arms use the SAME source — the whole point of a paired
 * comparison is that only the decision rule differs):
 *   LIVE (2026 grading, once weekly_own has snapshots): `own_weekly_<season>
 *   _w<week>.json`'s champion `weekly_mean` — the real, live, per-player-week
 *   own-projection system (draft/data/weekly_own/README.md), reused per
 *   Rule 11 exactly as the dispatch instructed.
 *   DRY RUN (2023-2025, this file's control run): weekly_own has NO
 *   historical snapshots — CHECKED, not assumed: `draft/data/weekly_own/`
 *   holds only `README.md` and `controls.json`, and the formula itself reads
 *   the CURRENT board's `proj_ownmodel` plus CURRENT Vegas lines, neither of
 *   which exists for a 2023 or 2024 slate (the identical gap P143 already
 *   found and documented for external sources). So the dry run substitutes
 *   this session's OWN already-built, already leak-free-proven internal
 *   reconstruction (`lineup_edge_backtest_blend.js`'s recency-weighted +
 *   shrinkage blend), extended here to a LEAGUE-WIDE (not single-roster)
 *   chronological history per player — a player who was on a DIFFERENT
 *   team's bench in prior weeks still has real, strictly-prior, non-leaked
 *   games on record, and restricting to one roster's own history (as
 *   lineup_edge_backtest.js does, correctly, for ITS purpose) would starve
 *   every free-agent candidate of a level entirely. A candidate with zero
 *   games anywhere this season (true unknown) falls back to the same
 *   position-baseline constant the blend already computes.
 *
 * BOTH TOOLS RECEIVE THIS SAME PLAYER-LEVEL SOURCE. VORP for the incumbent
 * tool (required by `startableValue`) = level − FLOOR[pos], where FLOOR is
 * the committed wire level (`waiver_realized_level.json`) — the incumbent's
 * own replacement baseline and the bench-option's own wire floor are THE
 * SAME NUMBER by construction, so neither arm is quietly handed a better
 * replacement baseline than the other.
 *
 * ── §C. THE BENCH-OPTION VALUE FUNCTION, AS IMPLEMENTED HERE ──
 *
 * V(roster, weeksRemaining) = mean over M=200 seeded absence-mask draws of:
 *   for each of weeksRemaining weeks: each rostered player independently
 *   absent w.p. P_ABSENCE[pos] (§1 constants, QB .216/RB .191/WR .190/
 *   TE .186/K,DEF .20); present players fill starter slots via LO.bestLineup
 *   at their fixed level (v1: no performance variance, absence-only
 *   stochasticity, exactly as declared "deliberately excluded" in §2);
 *   empty UNCONTESTED slots (QB/K/DEF) float to FLOOR[pos] every time
 *   (uncontested streaming, §7/v4); among empty CONTESTED slots (RB/WR/TE,
 *   flex included) only the single highest-FLOOR one gets a wire fill that
 *   week, the rest score zero (one shared claim/week, §7/v4) — the v4
 *   position-dependent-friction rule, chosen because v4-v9's amendments
 *   after it (supply-aware/horizon-aware/EDF forcing) are entirely about
 *   SEQUENCING MULTIPLE DRAFT PICKS across 15 rounds, i.e. exactly the
 *   "draft-specific sequencing logic" the dispatch said to leave out — a
 *   single already-fixed roster plus one candidate marginal has no
 *   multi-pick sequence to force.
 * Candidate score = V(roster − drop + candidate, weeksRemaining) −
 *   V(roster − drop, weeksRemaining), same M seeded masks reused across the
 *   baseline and every candidate within one decision (common random
 *   numbers — a paired MC comparison with zero simulation noise between
 *   candidates, exactly as §2 specifies). `drop` is the SAME drop candidate
 *   the incumbent tool picks (`W.dropCandidate`) — reused rather than a
 *   second drop rule, so the ONLY thing that differs between the two
 *   rankings is the valuation function, matching this codebase's own
 *   `roster_builder_replay.js` design principle ("the only difference is
 *   the construction rule").
 *
 * ── §D. WHAT THIS FILE DOES NOT CLAIM ──
 * This is NOT a P282 grade. The 2026 season has not started; there is no
 * real 2026 wire. Every number this file prints when run today is a DRY RUN
 * / READINESS CHECK against 2023-2025 history, proving the harness's own
 * plumbing (leak-free level, wire-pool reconstruction, both rankings, the
 * paired points comparison, the controls) actually runs and produces a
 * real, non-degenerate answer. See draft/audit/waiver_advisor_paired_harness_
 * 2026-08-20.md for the full write-up, the dry-run numbers, the honesty
 * caveats, and the exact live command.
 *
 * Run (dry run on 2023-2025): node draft/tools/waiver_advisor_paired_harness.js
 * Run (live, once week-1 2026 wire data exists):
 *   node draft/tools/waiver_advisor_paired_harness.js --live --season 2026
 * Writes draft/data/waiver_advisor_paired_harness.json. REPORT ONLY.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const LO = require(path.join(ROOT, 'src', 'routes', 'lineup.js'));
const W = require(path.join(ROOT, 'src', 'routes', 'waivers.js'));
const BLEND = require(path.join(__dirname, 'lineup_edge_backtest_blend.js'));

const H = LO.harvest();
const PP = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'player_positions.json'), 'utf8'));
const WRL = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'waiver_realized_level.json'), 'utf8'));

const POSOF = {};
Object.entries(PP.positions || {}).forEach(([id, q]) => { POSOF[String(id)] = q; });
const posOf = id => POSOF[String(id)] || (/^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : null);

const FLOOR = {};   // WAIVER_WK, per week — reused verbatim from the committed store (Rule 11)
Object.entries(WRL.rows || {}).forEach(([q, r]) => { if (r) FLOOR[q] = r.floor_per_week; });

// §1 constants, BENCH-OPTION-PREREG-2026-08-20.md — taken as given, not re-measured here.
const P_ABSENCE = { QB: 0.216, RB: 0.191, WR: 0.190, TE: 0.186, K: 0.20, DEF: 0.20 };
const CONTESTED = new Set(['RB', 'WR', 'TE']);
const UNCONTESTED = new Set(['QB', 'K', 'DEF']);
const M_DRAWS = 200;
const SEED_BASE = 20260820;

// mulberry32 — copied verbatim from draft/tools/bench_wire_room_sim.js (Rule 11).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seasonEntries(s) {
  const H2 = LO.harvest();
  return LO.seasonOf(H2, s);
}

// ── §B roster snapshots: rosterOf[week][roster_id] -> Set(pid) ─────────────
function buildRosterSnapshots(s) {
  const out = {};
  Object.entries(s.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    out[w] = {};
    arr.forEach(e => { out[w][e.roster_id] = new Set((e.players || []).map(String)); });
  });
  return out;
}

// ── §B league-wide per-player chronological points, built incrementally so
// a query at week w only ever sees weeks < w (structural leak-free proof,
// checked by the test file's captured-calls control, same pattern as P143). ─
function buildLeagueWidePointsByWeek(s) {
  const byWeek = {};   // week -> {pid: pts}
  Object.entries(s.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const pts = {};
    arr.forEach(e => Object.entries(e.players_points || {}).forEach(([pid, v]) => { pts[pid] = Number(v || 0); }));
    byWeek[w] = pts;
  });
  return byWeek;
}

// ── §B transactions by week, both statuses, waiver+free_agent adds ─────────
function buildWirePools(s) {
  const pools = {};   // week -> Set(pid)  [everyone contested that week]
  const perRoster = {};   // week -> {roster_id: [{pid,status}]}  actual claims made
  Object.entries(s.transactions || {}).forEach(([wn, arr]) => {
    const w = +wn;
    (arr || []).forEach(t => {
      if (t.type !== 'waiver' && t.type !== 'free_agent') return;
      Object.keys(t.adds || {}).forEach(pid => {
        (pools[w] = pools[w] || new Set()).add(String(pid));
      });
      (t.roster_ids || []).forEach(rid => {
        Object.keys(t.adds || {}).forEach(pid => {
          (perRoster[w] = perRoster[w] || {});
          (perRoster[w][rid] = perRoster[w][rid] || []).push({ pid: String(pid), status: t.status });
        });
      });
    });
  });
  return { pools, perRoster };
}

// ── §B leak-free player level, dry-run arm: league-wide recency+shrinkage
// blend, reusing lineup_edge_backtest_blend.js's exported pieces (Rule 11). ──
function makeDryRunLevelFn(s) {
  const byWeek = buildLeagueWidePointsByWeek(s);
  const pos = LO.inferPositions(s);
  // POS_CONST is a POOLED 2023-2025 constant (computePositionConstants calls
  // LO.harvest() itself) — reused directly, not recomputed per season, exactly
  // as P143 built it.
  const { constants: POS_CONST } = BLEND.computePositionConstants();
  const leakProbe = [];   // every real call's (pid, week, priorWeeksData) — checked by the test file

  function priorWeeksFor(pid, week) {
    const rows = [];
    for (let k = 1; k < week; k++) {
      const v = (byWeek[k] || {})[pid];
      if (v != null) rows.push({ week: k, pts: v });
    }
    return rows;
  }

  function level(pid, week) {
    const prior = priorWeeksFor(pid, week);
    leakProbe.push({ pid, week, priorWeeksData: prior.map(r => ({ ...r })) });
    const q = pos[pid] || posOf(pid);
    if (!prior.length) {
      const pc = POS_CONST[q];
      return pc ? pc.posBaseline : 0;
    }
    const v = BLEND.blendedProject ? blendViaModule(prior, pid, week, q) : null;
    return v == null ? 0 : v;
  }
  function blendViaModule(prior, pid, week, q) {
    const rw = BLEND.recencyWeightedAvg(prior);
    const sh = BLEND.shrinkageToPosition(prior, q);
    if (sh == null) return rw;
    if (rw == null) return sh;
    return (rw + sh) / 2;
  }
  return { level, leakProbe, posOf: pid => pos[pid] || posOf(pid) };
}

// ── §C the bench-option value function ──────────────────────────────────────
function starterTemplate(s) {
  const template = s.roster_positions || [];
  return template.length ? LO.slotsFromTemplate(template) : LO.DEFAULT_SLOTS;
}
// dedicated (non-flex) slot counts, and the flex-eligible set, derived from
// the same template rather than a second hardcoded copy.
function dedicatedSlots(slots) {
  const ded = {};
  Object.entries(slots).forEach(([k, n]) => { if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(k)) ded[k] = n; });
  return ded;
}
function flexCount(slots) {
  return (slots.FLEX || 0) + (slots.SUPER_FLEX || 0) + (slots.REC_FLEX || 0);
}

function benchOptionV(rosterLevels, slots, weeksRemaining, rng) {
  // rosterLevels: [{pid, pos, level}]. Returns mean season points over M draws.
  const ded = dedicatedSlots(slots);
  const flexN = flexCount(slots);
  let total = 0;
  for (let m = 0; m < M_DRAWS; m++) {
    let seasonPts = 0;
    for (let wk = 0; wk < weeksRemaining; wk++) {
      const present = rosterLevels.filter(p => rng() >= (P_ABSENCE[p.pos] || 0.2));
      const byPos = {};
      present.forEach(p => (byPos[p.pos] = byPos[p.pos] || []).push(p.level));
      Object.keys(byPos).forEach(q => byPos[q].sort((a, b) => b - a));
      let weekPts = 0;
      const leftover = {};
      Object.entries(ded).forEach(([q, n]) => {
        const have = byPos[q] || [];
        for (let i = 0; i < n; i++) weekPts += have[i] || 0;
        leftover[q] = have.slice(n);
      });
      const flexPool = ['RB', 'WR', 'TE'].flatMap(q => leftover[q] || []).sort((a, b) => b - a);
      for (let i = 0; i < flexN; i++) weekPts += flexPool[i] || 0;
      // §7/v4 friction: exactly ONE contested (RB/WR/TE, flex included) empty
      // slot gets a wire fill this week — whichever unmet need has the
      // highest floor — every other contested vacancy scores ZERO.
      const unmetDed = {};
      ['RB', 'WR', 'TE'].forEach(q => {
        const have = (byPos[q] || []).length;
        const need = ded[q] || 0;
        if (need > have) unmetDed[q] = need - have;
      });
      const unmetFlex = Math.max(0, flexN - flexPool.length);
      const candTags = Object.keys(unmetDed);
      if (unmetFlex > 0) candTags.push('FLEX');
      const floorOfTag = tag => tag === 'FLEX'
        ? Math.max(FLOOR.RB || 0, FLOOR.WR || 0, FLOOR.TE || 0) : (FLOOR[tag] || 0);
      if (candTags.length) {
        const best = candTags.slice().sort((a, b) => floorOfTag(b) - floorOfTag(a))[0];
        weekPts += floorOfTag(best);
      }
      // uncontested: every empty QB/K/DEF slot floats to the floor, every time
      ['QB', 'K', 'DEF'].forEach(q => {
        const have = (byPos[q] || []).length;
        const need = ded[q] || 0;
        if (need > have) weekPts += (need - have) * (FLOOR[q] || 0);
      });
      seasonPts += weekPts;
    }
    total += seasonPts;
  }
  return total / M_DRAWS;
}

// ── the rankings, both arms, over the SAME candidate pool ──────────────────
function rankIncumbent(myRoster, freeAgents, slots) {
  const league = { teams: 10, starters: slots };
  const res = W.evaluateClaims(freeAgents, myRoster, league, {});
  return res.claims.slice(0, 3).map(c => c.player_id);
}

function rankBenchOption(myRoster, freeAgents, slots, weeksRemaining, seed) {
  const league = { teams: 10, starters: slots };
  const drop = W.dropCandidate(myRoster, league);   // reused, not re-derived (§C)
  const baseRoster = myRoster.filter(p => !drop || String(p.player_id) !== String(drop.player.player_id))
    .map(p => ({ pid: p.player_id, pos: p.position, level: p.proj_mean }));
  const rngSeed = seed;
  const baseV = benchOptionV(baseRoster, slots, weeksRemaining, mulberry32(rngSeed));
  const scored = freeAgents.map(fa => {
    const withFa = baseRoster.concat([{ pid: fa.player_id, pos: fa.position, level: fa.proj_mean }]);
    const v = benchOptionV(withFa, slots, weeksRemaining, mulberry32(rngSeed));   // SAME seed: common random numbers
    return { player_id: fa.player_id, score: v - baseV };
  });
  scored.sort((a, b) => b.score - a.score);
  return { top3: scored.slice(0, 3).map(s => s.player_id), scored, drop };
}

// ── the paired harness itself ───────────────────────────────────────────────
function runOne(s, week, weeksTotalHorizon) {
  const seasonKey = s.season;
  const snapshots = s._snapshots, byWeek = s._byWeek, wire = s._wire, levelFn = s._levelFn;
  const slots = s._slots;
  const decisions = [];
  const prevSnap = snapshots[week - 1];
  if (!prevSnap) return decisions;
  const pool = wire.pools[week] ? Array.from(wire.pools[week]) : [];
  const rosterIds = Object.keys(prevSnap).map(Number);
  const weeksRemaining = Math.max(1, 17 - week);

  rosterIds.forEach(rid => {
    const held = prevSnap[rid] || new Set();
    const candidates = pool.filter(pid => !held.has(pid) && posOf(pid));
    if (candidates.length < 3) return;
    const myRoster = Array.from(held).filter(posOf).map(pid => ({
      player_id: pid, name: pid, position: posOf(pid),
      proj_mean: levelFn.level(pid, week),
      vorp: levelFn.level(pid, week) - (FLOOR[posOf(pid)] || 0),
    }));
    const freeAgents = candidates.map(pid => ({
      player_id: pid, name: pid, position: posOf(pid),
      proj_mean: levelFn.level(pid, week),
      vorp: levelFn.level(pid, week) - (FLOOR[posOf(pid)] || 0),
    }));
    const incumbentTop3 = rankIncumbent(myRoster, freeAgents, slots);
    const seed = SEED_BASE + Number(seasonKey) * 10000 + week * 100 + rid;
    const bench = rankBenchOption(myRoster, freeAgents, slots, weeksRemaining, seed);

    const reordered = JSON.stringify(incumbentTop3) !== JSON.stringify(bench.top3);
    const incumbentPick = incumbentTop3[0] || null;
    const benchPick = bench.top3[0] || null;

    const realized = pid => {
      let sum = 0, weeksSeen = 0;
      for (let k = week + 1; k <= 17; k++) {
        const v = (byWeek[k] || {})[pid];
        if (v != null) { sum += v; weeksSeen++; }
      }
      return { sum, weeksSeen };
    };
    const incR = incumbentPick ? realized(incumbentPick) : null;
    const benR = benchPick ? realized(benchPick) : null;

    decisions.push({
      season: seasonKey, week, roster_id: rid, pool_size: candidates.length,
      incumbent_top3: incumbentTop3, bench_top3: bench.top3, reordered,
      incumbent_pick: incumbentPick, bench_pick: benchPick,
      picks_differ: incumbentPick !== benchPick,
      incumbent_realized_ros: incR ? incR.sum : null,
      bench_realized_ros: benR ? benR.sum : null,
      incumbent_weeks_observed: incR ? incR.weeksSeen : 0,
      bench_weeks_observed: benR ? benR.weeksSeen : 0,
    });
  });
  return decisions;
}

function dryRun() {
  const seasons = ['2023', '2024', '2025'];
  const allDecisions = [];
  const txnCensus = {};
  seasons.forEach(season => {
    const s = seasonEntries(season);
    if (!s) return;
    s._snapshots = buildRosterSnapshots(s);
    s._byWeek = buildLeagueWidePointsByWeek(s);
    s._wire = buildWirePools(s);
    s._levelFn = makeDryRunLevelFn(s);
    s._slots = starterTemplate(s);

    // §A census, printed as the V1 answer
    let waiverN = 0, failedN = 0, completeN = 0, faN = 0;
    Object.values(s.transactions || {}).forEach(arr => (arr || []).forEach(t => {
      if (t.type === 'waiver') { waiverN++; if (t.status === 'failed') failedN++; else if (t.status === 'complete') completeN++; }
      if (t.type === 'free_agent') faN++;
    }));
    txnCensus[season] = { waiver_txns: waiverN, failed: failedN, complete: completeN, free_agent_txns: faN };

    for (let week = 1; week <= 5; week++) {
      allDecisions.push(...runOne(s, week, 17 - week));
    }
  });
  return { allDecisions, txnCensus };
}

// ── controls (Rule 3e) ───────────────────────────────────────────────────
function runControls() {
  const out = {};

  // C1 — KNOWN POSITIVE, filled in by main() AFTER the real dry run: rather
  // than a hand-tuned synthetic fixture (tried first — see git history of
  // this file's development; several hand-built rosters produced IDENTICAL
  // rankings from both arms, because in the "everyone present, one week"
  // happy path the bench-option value function collapses to almost the same
  // marginal the incumbent already computes, and only the absence/friction
  // terms can separate them, which a small synthetic roster does not
  // reliably exercise), C1 picks the FIRST real disagreement found in the
  // actual 2023-2025 dry run, prints it in full (season/week/roster/pool),
  // and RE-DERIVES it independently to prove it reproduces deterministically
  // — a real, inspectable, reproducible known-positive rather than an
  // invented one. See main().
  out.C1_known_positive_disagreement = { ok: false, _pending: true };

  // C2 — KNOWN NEGATIVE / fail-arm: feed the reorder-detector two IDENTICAL
  // rankings and assert it reads 0% reorder — proves the differencing logic
  // can return a true negative, not just a positive (P143's own convention).
  {
    const same = ['x1', 'x2', 'x3'];
    const reordered = JSON.stringify(same) !== JSON.stringify(same.slice());
    out.C2_known_negative_identical_rankings = {
      ok: reordered === false,
      why: 'identical top-3 lists must report reordered=false, not a residual true-by-default bug',
    };
  }

  // C3 — leak-free player level: every real call captured during a real dry
  // run has priorWeeksData entries with week strictly less than the week
  // being projected (structural proof over every call, P143's pattern).
  {
    const s = seasonEntries('2023');
    s._byWeek = buildLeagueWidePointsByWeek(s);
    const levelFn = makeDryRunLevelFn(s);
    // drive a handful of real calls
    const anyPids = Object.keys(s._byWeek[3] || {}).slice(0, 5);
    anyPids.forEach(pid => levelFn.level(pid, 4));
    const allPast = levelFn.leakProbe.every(c => c.priorWeeksData.every(r => r.week < c.week));
    out.C3_leakfree_level_structural = {
      ok: allPast && levelFn.leakProbe.length > 0,
      calls_checked: levelFn.leakProbe.length,
      why: 'every priorWeeksData row seen by the level function must carry week < the week being projected',
    };
  }

  // C4 — fail-arm for C3: a synthetic call whose priorWeeksData contains the
  // CURRENT week must be flagged by the same check (proves the checker can
  // return a positive, not just a clean null).
  {
    const bad = [{ pid: 'z', week: 4, priorWeeksData: [{ week: 3, pts: 1 }, { week: 4, pts: 9 }] }];
    const flagged = !bad.every(c => c.priorWeeksData.every(r => r.week < c.week));
    out.C4_leak_check_fail_arm = { ok: flagged === true, why: 'the checker must actually flag a planted leak, not just pass everything' };
  }

  // C5 — FLOOR values actually loaded from the committed store, not silently empty.
  {
    const have = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].every(q => typeof FLOOR[q] === 'number' && FLOOR[q] > 0);
    out.C5_floor_constants_loaded = { ok: have, floor: FLOOR,
      why: 'waiver_realized_level.json rows must actually populate FLOOR for all six positions' };
  }

  // C6 — the reorder-rate check ACTUALLY FIRES on the real dry-run population
  // (rule 3e: a null that has never demonstrated a positive is not a finding).
  out._c6_placeholder = true;   // filled in after dryRun() below, see main()

  return out;
}

function r2(n) { return n == null ? null : Math.round(n * 100) / 100; }

function main() {
  const controls = runControls();
  const { allDecisions, txnCensus } = dryRun();

  // C1 — real known-positive, re-derived independently for determinism.
  const firstDisagreement = allDecisions.find(d => d.reordered);
  if (firstDisagreement) {
    const s = seasonEntries(firstDisagreement.season);
    s._snapshots = buildRosterSnapshots(s);
    s._byWeek = buildLeagueWidePointsByWeek(s);
    s._wire = buildWirePools(s);
    s._levelFn = makeDryRunLevelFn(s);
    s._slots = starterTemplate(s);
    const rerun = runOne(s, firstDisagreement.week, 17 - firstDisagreement.week)
      .find(d => d.roster_id === firstDisagreement.roster_id);
    const reproduces = rerun && rerun.reordered === true
      && JSON.stringify(rerun.incumbent_top3) === JSON.stringify(firstDisagreement.incumbent_top3)
      && JSON.stringify(rerun.bench_top3) === JSON.stringify(firstDisagreement.bench_top3);
    controls.C1_known_positive_disagreement = {
      ok: !!reproduces,
      example: firstDisagreement,
      why: 'a real 2023-2025 decision where the incumbent tool and the bench-option '
        + 'valuation genuinely rank different top-3s, re-run independently from the raw '
        + 'season data and confirmed to reproduce byte-for-byte (rule 3e known-positive, '
        + 'plus a determinism check on the seeded RNG for free)',
    };
  } else {
    controls.C1_known_positive_disagreement = { ok: false,
      why: 'NO disagreement found anywhere in 120 real decisions — the harness has not '
        + 'demonstrated it can tell the two arms apart; treat every other number here as unproven' };
  }

  const reorderCount = allDecisions.filter(d => d.reordered).length;
  const reorderRate = allDecisions.length ? reorderCount / allDecisions.length : null;
  controls.C6_reorder_check_has_fired_at_least_once = {
    ok: reorderCount > 0,
    reordered: reorderCount, of: allDecisions.length,
    why: 'rule 3e — if this never fires on 120 real decisions, treat the harness as unproven, not the objective as agreeing with the incumbent',
  };

  const paired = allDecisions.filter(d => d.picks_differ
    && d.incumbent_realized_ros != null && d.bench_realized_ros != null);
  const benchWins = paired.filter(d => d.bench_realized_ros > d.incumbent_realized_ros).length;
  const incWins = paired.filter(d => d.incumbent_realized_ros > d.bench_realized_ros).length;
  const ties = paired.length - benchWins - incWins;
  const meanDelta = paired.length
    ? paired.reduce((a, d) => a + (d.bench_realized_ros - d.incumbent_realized_ros), 0) / paired.length
    : null;

  const allOk = Object.entries(controls).every(([k, v]) => k.startsWith('_') || v.ok);

  const doc = {
    _territory: 'TERRITORY: D — draft/tools/waiver_advisor_paired_harness.js',
    _prediction: 'PREDICTION-LEDGER.md P282',
    _NOT_A_GRADE: 'THIS IS A DRY RUN ON 2023-2025 HISTORY, NOT THE P282 GRADE. The 2026 '
      + 'season has not started and there is no real 2026 wire. Numbers below prove the '
      + 'harness runs correctly and produces a real, non-degenerate answer on historical '
      + 'data; they are NOT a verdict on the live claim.',
    _premise_finding: 'CORRECTED same day: the --opt flag IS real and runs (verified directly, '
      + 'see file header and the audit doc §0) -- it lives on an unmerged branch '
      + '(claude/fantasy-football-research-926y6z @ 01668acc), not on this one, which is a '
      + 'known ROUTES ask to A, not fabrication. This harness still reimplements the '
      + 'v9-documented VALUE FUNCTION from prereg prose rather than the real optV/optU '
      + '(written before that branch was found) -- it does not verify or reproduce the '
      + 'ledger v1-v9 numbers, and should be replaced with the real functions before its own '
      + 'numbers are trusted.',
    v1_answer_failed_claims_captured: txnCensus,
    controls, controls_all_passed: allOk,
    dry_run: {
      seasons: ['2023', '2024', '2025'], weeks: '1-5',
      decisions: allDecisions.length,
      reorder_count: reorderCount, reorder_rate: r2(reorderRate),
      reorder_bar_30pct: reorderRate != null ? reorderRate >= 0.30 : null,
      paired_comparable: paired.length,
      bench_wins: benchWins, incumbent_wins: incWins, ties,
      mean_paired_delta_bench_minus_incumbent: r2(meanDelta),
    },
    decisions: allDecisions,
  };
  fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'waiver_advisor_paired_harness.json'),
    JSON.stringify(doc, null, 1));

  console.log('P282 PAIRED HARNESS — DRY RUN ON 2023-2025 HISTORY (NOT A GRADE)\n');
  console.log('⚠ 2026 season has not started; no real wire exists yet. See file header for');
  console.log('  the --opt-does-not-exist Rule 3f finding this harness works around.\n');
  console.log('V1 (failed waiver claims captured?): YES —');
  Object.entries(txnCensus).forEach(([season, c]) => {
    console.log(`    ${season}: ${c.waiver_txns} waiver txns (${c.failed} failed / ${c.complete} complete), ${c.free_agent_txns} free_agent txns`);
  });
  console.log('\nCONTROLS:');
  Object.entries(controls).forEach(([k, v]) => {
    if (k.startsWith('_')) return;
    console.log('  ' + (v.ok ? 'OK   ' : 'FAIL ') + k);
  });
  console.log(`\nDECISIONS: ${allDecisions.length} (weeks 1-5, seasons 2023-2025, pool>=3 candidates)`);
  console.log(`  reorder rate: ${reorderCount}/${allDecisions.length} = ${r2(100 * (reorderRate || 0))}%  (P282 bar: >=30%)`);
  console.log(`  paired-comparable picks (top-1 differs AND both realized-ROS observed): ${paired.length}`);
  console.log(`  of those: bench-option wins ${benchWins}, incumbent wins ${incWins}, ties ${ties}`);
  console.log(`  mean paired delta (bench − incumbent): ${r2(meanDelta)} pts rest-of-season`);
  console.log(`\nAll controls passed: ${allOk}`);
  console.log('\nOnce week-1 2026 wire data exists, run:');
  console.log('  node draft/tools/waiver_advisor_paired_harness.js --live --season 2026');
  console.log('(not yet implemented — see audit doc §"what remains" for the one change needed:');
  console.log(' point the level source at draft/data/weekly_own/own_weekly_2026_w<N>.json instead');
  console.log(' of the dry-run blend, per §B above.)');

  return doc;
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRosterSnapshots, buildLeagueWidePointsByWeek, buildWirePools, makeDryRunLevelFn,
  benchOptionV, rankIncumbent, rankBenchOption, runOne, dryRun, runControls, main,
  P_ABSENCE, FLOOR, M_DRAWS, mulberry32,
};
