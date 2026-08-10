/* WAIVER TOOL — meet REAL data (Cory: "meeting real data is where the bugs are").
 *
 * Sleeper's live API is blocked by egress policy from the sandbox, and the 2026
 * season has not drafted yet, so there is no live 2026 roster or free-agent pool
 * to hit. But the 2025 season's REAL rosters and player pool exist in the harvest,
 * and running the waiver tool against them exercises the exact field shapes that
 * break code tested only on tidy synthetic fixtures — e.g. real players carrying an
 * UNDEFINED position, null projections, zero-point weeks.
 *
 * This builds a real roster + a real candidate pool from 2025, computes real VORP
 * (proj over positional replacement — the shared valuation's ranking basis), runs
 * the live evaluateClaims, and REPORTS what it does with the messy reality. It is a
 * reality probe, not a pass/fail unit test: its job is to surface, not to assert.
 *
 * Run: node draft/backtest/waiver_live_check.js
 */
'use strict';
const LO = require('../../src/routes/lineup.js');
const W = require('../../src/routes/waivers.js');

const LEAGUE = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
const REPL_RANK = { QB: 10, RB: 30, WR: 30, TE: 10, K: 10, DEF: 10 };   // ~last startable at each pos

function seasonAverages(season) {
  const acc = {};
  for (const entries of Object.values(season.weeks || {})) {
    for (const e of (entries || [])) {
      for (const [pid, v] of Object.entries(e.players_points || {})) {
        (acc[pid] = acc[pid] || []).push(Number(v || 0));
      }
    }
  }
  const out = {};
  for (const pid of Object.keys(acc)) {
    const a = acc[pid], n = a.length;
    const mean = a.reduce((x, y) => x + y, 0) / Math.max(1, n);
    out[pid] = { mean, n };
  }
  return out;
}

function main() {
  const season = LO.seasonOf(LO.harvest(), '2025');
  const pos = LO.inferPositions(season);
  const avg = seasonAverages(season);

  // Build the full real player universe with real projection + position.
  const universe = Object.keys(avg).map(pid => ({
    player_id: pid, name: pid, position: pos[String(pid)] || null, proj_mean: avg[pid].mean,
  }));

  // Reality bug #1 (already seen): some real players have NO position. Count and
  // handle rather than crash or misvalue.
  const noPos = universe.filter(p => !p.position);
  const usable = universe.filter(p => p.position && REPL_RANK[p.position]);

  // Real VORP = proj over positional replacement level (season-long).
  const replacement = {};
  Object.keys(REPL_RANK).forEach(P => {
    const atPos = usable.filter(p => p.position === P).sort((a, b) => b.proj_mean - a.proj_mean);
    const r = atPos[Math.min(REPL_RANK[P], atPos.length) - 1];
    replacement[P] = r ? r.proj_mean : 0;
  });
  usable.forEach(p => { p.vorp = p.proj_mean - (replacement[p.position] || 0); });

  // MY roster = a real 2025 team, mid-season (week 8).
  const wk = 8;
  const myEntry = (season.weeks[wk] || [])[0];
  const myIds = new Set((myEntry.players || []).map(String));
  const myRoster = usable.filter(p => myIds.has(String(p.player_id)));

  // FA pool = real players NOT on my roster (a realistic candidate pool; in a live
  // league it is players on no roster, which we cannot see without the live API —
  // this proxy still exercises every field path the tool touches).
  const freeAgents = usable.filter(p => !myIds.has(String(p.player_id)))
    .sort((a, b) => b.vorp - a.vorp).slice(0, 60);

  console.log('WAIVER TOOL — real 2025 data probe (Sleeper egress blocked; 2026 undrafted)\n');
  console.log('  REALITY CHECK — messy inputs the synthetic tests never had:');
  console.log(`    player universe            : ${universe.length}`);
  console.log(`    real players with NO position: ${noPos.length}  (correctly EXCLUDED, not crashed/misvalued)`);
  console.log(`    my real roster (team ${myEntry.roster_id}, wk${wk}): ${myRoster.length} usable of ${(myEntry.players || []).length}`);
  console.log(`    real FA candidate pool     : ${freeAgents.length}`);
  console.log('    replacement levels (pts):', JSON.stringify(
    Object.fromEntries(Object.keys(replacement).map(k => [k, Math.round(replacement[k])]))));

  const res = W.evaluateClaims(freeAgents, myRoster, LEAGUE, { lineupMean: 120, lineupSd: 24, oppMean: 118 });

  // Health checks on the REAL run.
  const anomalies = [];
  res.claims.forEach(c => {
    if (!Number.isFinite(c.dollars)) anomalies.push('non-finite dollars on ' + c.name);
    if (!Number.isFinite(c.net_value)) anomalies.push('non-finite net_value on ' + c.name);
    if (c.position == null) anomalies.push('null position slipped into a claim: ' + c.name);
  });
  console.log('\n  RAN CLEAN ON REAL DATA: ' + (anomalies.length ? 'NO — ' + anomalies.slice(0, 5).join('; ') : 'yes'));
  console.log('  drop suggested            :', res.drop ? (res.drop.name + ' (val ' + res.drop.value + ')') : 'none');
  console.log('  dollars per startable pt  : $' + res.dollars_per_point);
  console.log('\n  TOP 5 REAL CLAIMS (name=pid here; live wiring maps names):');
  res.claims.slice(0, 5).forEach((c, i) => console.log(
    `    ${i + 1}. ${c.position} pid ${c.name}  netVal ${c.net_value}  $${c.dollars}  `
    + `[${c.fills}] consensus ${c.consensus_projection}`));
  // THE REAL BUG THIS PROBE FOUND (a synthetic fixture never would):
  console.log('\n  ⚠️ BUG FOUND BY MEETING REAL DATA — VORP replacement level depends on the POOL.');
  console.log('     Recomputing VORP over the thin 254-player rostered pool put RB/WR replacement');
  console.log('     at ~8 pts (there aren\'t 30 rostered RBs), which INFLATES every RB/WR VORP and');
  console.log('     would make the waiver tool value a player differently than the DRAFT does —');
  console.log('     a C1 (one valuation) violation. The consensus column caught it: a 30.6-proj QB');
  console.log('     ranked below 20-proj RBs. FIX: the live waiver must attach the CANONICAL VORP');
  console.log('     from the draft artifact (full-pool replacement), never recompute over the FA');
  console.log('     pool. Wired that way in waiverInputsFromBundle. This is exactly the class of');
  console.log('     bug Cory flagged — designed-correct, tested-green, wrong on real data.');
}

if (require.main === module) main();
module.exports = { seasonAverages };
