// TERRITORY: A
/* EXPECTED STARTING-LINEUP POINTS, WEEK BY WEEK — WITH BYES AND INJURIES.
 *
 * lineup_value.js computes the season-mean version and is BLIND TO THE BENCH:
 * under a single season-long lineup the bench contributes exactly zero no matter
 * who sits on it, so it cannot grade a change that is mostly about bench picks.
 * Measured: follow-1 strands three tight ends on a 1705-point bench and still
 * lands within 84 points of every other run.
 *
 * A BENCH IS WORTH SOMETHING FOR THREE REASONS: byes, injuries, and weekly
 * variance. Two of the three are real data we already hold.
 *
 * ── WHAT IS REAL HERE AND WHAT IS NOT ───────────────────────────────────────
 *
 * REAL   weeks 1-15. From the league artifact: playoff_week_start = 16, so the
 *        fantasy regular season is 15 weeks. NOT 17, and not the 14 I assumed
 *        before reading the settings.
 * REAL   bye weeks, per player, from the board.
 * REAL   INJURY_RATE by position (QB .14 RB .28 WR .20 TE .22 K .04 DEF .02),
 *        the same table the engine already prices insurance with.
 * REAL   the league's starters: QB1 RB2 WR2 TE1 FLEX1 K1 DEF1.
 *
 * NOT REAL — and each one BIASES THE ANSWER IN A NAMED DIRECTION:
 *   · WEEKLY POINTS ARE FLAT (proj_mean / 17). proj_sd was 0.25 * proj_mean on a
 *     bundle board until 2026-08-17 (PRE-08-17; the harness now carries measured p90/p10/sd per (position, band)); it is now the measured sd ratio and
 *     still proj_mean x a per-CELL constant, i.e. a
 *     manufactured constant, so there is no honest weekly distribution to draw
 *     from. THIS UNDERSTATES DEPTH: with no week-to-week variance you never
 *     start a backup who happened to outscore your starter, which is one of the
 *     three reasons a bench is worth anything. C's uncertainty work lifts this.
 *   · THE INJURY MODEL IS A CRUDE BLOCK — one absence per player per season,
 *     4 weeks, uniformly placed. Real injuries cluster and recur.
 *   · 64% OF PROJECTED PLAYERS CARRY NO BYE WEEK on this board. They are treated
 *     as ALWAYS AVAILABLE, which OVERSTATES them and understates the depth
 *     needed behind them. Reported per run so it is never silently absorbed.
 *   · NO IR SLOT, though the league has reserve_slots = 1. An injured player on
 *     IR does not occupy a bench spot, so late fliers on hurt talent are cheaper
 *     than this model says.
 *
 * ── AND IT IS NOT AN ACCEPTANCE TEST ────────────────────────────────────────
 *
 * THIS SIMULATOR HAS NEVER BEEN VALIDATED AGAINST A REALIZED SEASON. league_
 * history.json carries three completed seasons (2025, 2024, 2023) but drafts: 0
 * and no per-player realized points, so there is nothing in the repo to check it
 * against. An unvalidated simulator used to grade a valuation change is a
 * harness nobody checked, built deliberately, in the week we spent finding
 * those. IT GENERATES HYPOTHESES. B's six-run harness remains the acceptance
 * test, and realized 2025 points are what would promote this.
 *
 * Run: node draft/tools/season_lineup.js [log.ndjson] [sims]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LV = require(path.join(ROOT, 'draft', 'tools', 'lineup_value.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league || {};
const SEASONS = (JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data',
  'league_history.json'), 'utf8')).seasons) || [];
const cur = SEASONS.find(s => String(s.season) === '2026') || {};
const PLAYOFF_START = ((cur.settings || {}).playoff_week_start) || 16;
const WEEKS = PLAYOFF_START - 1;                    // fantasy regular season
const GAMES = 17;
const INJURY_RATE = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };
const MISS_LEN = 4;

/* DETERMINISTIC. Math.random would make two runs of the same roster disagree and
 * a comparison between two rosters unreadable. A tiny LCG seeded per run. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function simulate(players, sims, seed) {
  const rand = rng(seed);
  let total = 0;
  for (let it = 0; it < sims; it++) {
    // sample one injury block per player
    const out = players.map(p => {
      if (rand() >= (INJURY_RATE[p.position] || 0.15)) return null;
      const start = 1 + Math.floor(rand() * WEEKS);
      return [start, start + MISS_LEN - 1];
    });
    for (let wk = 1; wk <= WEEKS; wk++) {
      const avail = players.filter((p, i) => {
        if (p.bye && Number(p.bye) === wk) return false;
        const o = out[i];
        return !(o && wk >= o[0] && wk <= o[1]);
      }).map(p => Object.assign({}, p, { proj_mean: (p.proj_mean || 0) / GAMES }));
      total += LV.bestLineup(avail).total;
    }
  }
  return total / sims;
}

module.exports = { simulate, WEEKS };

if (require.main === module) {
  const LOG = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2]
    : '/tmp/claude-0/-home-user-maga-league/5e339fd1-b931-5642-94fe-5e2425c58024/scratchpad/drive-log2.ndjson';
  const SIMS = Number(process.argv[3]) || 400;
  console.log('SEASON STARTING-LINEUP POINTS — weeks 1-' + WEEKS
    + ' (playoffs start ' + PLAYOFF_START + '), ' + SIMS + ' sims\n');
  let rows;
  try {
    rows = fs.readFileSync(LOG, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  } catch (e) { console.log('  cannot read log: ' + e.message); process.exit(2); }
  const runs = {};
  rows.forEach(r => { if (r.recommended) (runs[r.run] = runs[r.run] || []).push(r); });
  const out = [];
  Object.keys(runs).forEach((run, i) => {
    const rs = runs[run].slice().sort((a, b) => (a.my_pick_index || 0) - (b.my_pick_index || 0));
    const names = (rs[0].roster_before || []).map(p => p.name)
      .concat(rs.map(r => (r.action || {}).took).filter(Boolean));
    const { got, missing } = LV.resolve(names);
    const flat = LV.bestLineup(got).total;
    const sim = simulate(got, SIMS, 12345 + i * 7919);
    const noBye = got.filter(p => !p.bye).length;
    const byPos = {};
    got.forEach(p => { byPos[p.position] = (byPos[p.position] || 0) + 1; });
    out.push({ run, sim, flat, noBye, byPos, missing: missing.length, n: got.length });
  });
  out.sort((a, b) => b.sim - a.sim);
  console.log('  run                SEASON PTS   flat-lineup x15   roster                                no-bye');
  out.forEach(o => console.log('  ' + o.run.padEnd(18)
    + o.sim.toFixed(1).padStart(9)
    + (o.flat * WEEKS / GAMES).toFixed(1).padStart(16)
    + '   ' + JSON.stringify(o.byPos).padEnd(38)
    + o.noBye + '/' + o.n
    + (o.missing ? '  [' + o.missing + ' unresolved]' : '')));
  const b = out[0], w = out[out.length - 1];
  console.log('\n  spread: ' + (b.sim - w.sim).toFixed(1) + ' points across six rosters ('
    + b.run + ' vs ' + w.run + ')');
  console.log('  the flat column is the same rosters with byes and injuries switched OFF —');
  console.log('  the difference between the columns IS what a bench is worth in this model.');
}
