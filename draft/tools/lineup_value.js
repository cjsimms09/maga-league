// TERRITORY: A
/* EXPECTED STARTING-LINEUP POINTS — THE OBJECTIVE, AS A NUMBER.
 *
 * THE OBJECTIVE (draft/audits/objective_2026-08-13.md):
 *   maximise expected points scored by my STARTING LINEUP over the season,
 *   given the picks I have left, the league's roster, scoring and keeper
 *   constraints, and what the room is expected to do.
 *
 * Every grading standard used this week has been a SYMPTOM -- "did the tight-end
 * count fall". Three valuation attempts moved that count in some direction and
 * none could say why, because there was no way to ask whether the roster got
 * BETTER. A fix that moves a symptom and cannot say why is a coincidence.
 *
 * This computes the thing itself: the best legal lineup a roster can field, and
 * the points sitting on the bench that can never reach it.
 *
 * ── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────────
 *
 * IS: a SEASON-MEAN estimate. The best legal lineup by proj_mean, once.
 * IS NOT: the full objective. The real quantity is a sum over WEEKS of the best
 *   legal lineup that week, which needs weekly distributions, byes and injuries.
 *   A lineup is a MAX OVER STARTABLE PLAYERS, so variance changes the answer
 *   even when means agree -- and proj_sd was 0.25 * proj_mean on a bundle board
 *   until 2026-08-17 (PRE-08-17; the harness now carries measured p90/p10/sd per (position, band)); production's is now the measured sd ratio. It is
 *   still proj_mean x a per-CELL constant, so it remains
 *   manufactured constant. THAT IS WHY THIS IS A LOWER BOUND ON THE ANSWER
 *   RATHER THAN THE ANSWER, and it is C's uncertainty work that lifts it.
 *
 * It is still strictly better than counting tight ends, because a fourth tight
 * end contributes EXACTLY ZERO to this number and the count could not say so.
 *
 * Run: node draft/tools/lineup_value.js            (B's six logged rosters)
 *      node draft/tools/lineup_value.js --self     (the shipped engine's roster)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league || {};
const STARTERS = L.starters || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
const FLEX_ELIGIBLE = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'] };

/* NAME JOIN, AND IT IS THE WEAK LINK. B's log records names, not player_ids --
 * the same missing-decision-inputs gap that blocks the engine cross-check. A
 * name that does not resolve is REPORTED, never silently dropped: a roster
 * quietly missing two players would score lower and look like a finding. */
/* AND kept_players IS A SEPARATE LIST, DISJOINT FROM players. Joining against
 * `players` alone silently lost Chase, Henry and Walker from every as-shipped
 * roster -- three of the best assets on the team -- and the four affected runs
 * scored ~300 points low while looking like a finding about tight ends. Caught
 * only because unresolved names are REPORTED rather than dropped. */
const byName = new Map();
[].concat(DATA.players || [], DATA.kept_players || [])
  .forEach(p => { if (p.name && !byName.has(p.name)) byName.set(p.name, p); });

function resolve(names) {
  const got = [], missing = [];
  names.forEach(n => {
    const p = byName.get(n);
    if (p && Number(p.proj_mean) > 0) got.push(p); else missing.push(n);
  });
  return { got, missing };
}

/** The best legal lineup, greedily by dedicated slot then flex. */
function bestLineup(players) {
  const pool = players.slice().sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0));
  const used = new Set();
  const starters = [];
  // dedicated slots first — a QB cannot cover an RB slot, so order does not matter
  Object.keys(STARTERS).forEach(slot => {
    if (FLEX_ELIGIBLE[slot]) return;
    let need = STARTERS[slot] || 0;
    for (const p of pool) {
      if (need <= 0) break;
      if (used.has(p) || p.position !== slot) continue;
      used.add(p); starters.push({ slot, p }); need--;
    }
  });
  // then each flex, best remaining eligible
  Object.keys(STARTERS).forEach(slot => {
    const elig = FLEX_ELIGIBLE[slot];
    if (!elig) return;
    let need = STARTERS[slot] || 0;
    for (const p of pool) {
      if (need <= 0) break;
      if (used.has(p) || elig.indexOf(p.position) < 0) continue;
      used.add(p); starters.push({ slot, p }); need--;
    }
  });
  const bench = pool.filter(p => !used.has(p));
  const total = starters.reduce((s, x) => s + (x.p.proj_mean || 0), 0);
  const unfilled = Object.keys(STARTERS)
    .reduce((n, s) => n + (STARTERS[s] || 0), 0) - starters.length;
  return { starters, bench, total, unfilled,
    benchPoints: bench.reduce((s, p) => s + (p.proj_mean || 0), 0) };
}

function report(label, names) {
  const { got, missing } = resolve(names);
  const r = bestLineup(got);
  const byPos = {};
  got.forEach(p => { byPos[p.position] = (byPos[p.position] || 0) + 1; });
  const benchPos = {};
  r.bench.forEach(p => { benchPos[p.position] = (benchPos[p.position] || 0) + 1; });
  console.log('  ' + label.padEnd(18)
    + 'LINEUP ' + r.total.toFixed(1).padStart(7)
    + '   bench ' + r.benchPoints.toFixed(1).padStart(7)
    + '   roster ' + JSON.stringify(byPos)
    + (r.unfilled ? '   *** ' + r.unfilled + ' SLOT(S) UNFILLED' : '')
    + (missing.length ? '   [unresolved: ' + missing.join(', ') + ']' : ''));
  return { total: r.total, bench: r.benchPoints, benchPos, missing: missing.length, r };
}

module.exports = { bestLineup, report, resolve, STARTERS };

if (require.main === module) {
  const LOG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2]
    : '/tmp/claude-0/-home-user-maga-league/5e339fd1-b931-5642-94fe-5e2425c58024/scratchpad/drive-log2.ndjson';
  console.log('EXPECTED STARTING-LINEUP POINTS — B\'s driven mocks\n');
  console.log('  league starters: ' + JSON.stringify(STARTERS) + '\n');
  let rows;
  try {
    rows = fs.readFileSync(LOG, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  } catch (e) { console.log('  cannot read log: ' + e.message); process.exit(2); }
  const runs = {};
  rows.forEach(r => { if (r.recommended) (runs[r.run] = runs[r.run] || []).push(r); });
  const out = [];
  Object.keys(runs).forEach(run => {
    const rs = runs[run].slice().sort((a, b) => (a.my_pick_index || 0) - (b.my_pick_index || 0));
    const keep = (rs[0].roster_before || []).map(p => p.name);
    const took = rs.map(r => (r.action || {}).took).filter(Boolean);
    out.push(Object.assign({ run }, report(run, keep.concat(took))));
  });
  console.log('\n  WHAT THE BENCH COSTS — points held that cannot reach the lineup:');
  out.sort((a, b) => b.total - a.total).forEach(o =>
    console.log('     ' + o.run.padEnd(18) + 'lineup ' + o.total.toFixed(1).padStart(7)
      + '   stranded on bench ' + o.bench.toFixed(1).padStart(7)
      + '   ' + JSON.stringify(o.benchPos)));
  const best = out[0], worst = out[out.length - 1];
  console.log('\n  spread across six runs: ' + (best.total - worst.total).toFixed(1)
    + ' points of starting lineup (' + best.run + ' vs ' + worst.run + ')');
}
