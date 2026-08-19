// TERRITORY: A
/* "VONA IS ONLY AS GOOD AS ITS PROJECTIONS — DO WE USE SLEEPER, FANTASYPROS,
 * OR A MIX?" (Cory, 2026-08-19). THE ANSWER IS SLEEPER, ALONE, AND THIS
 * MEASURES WHAT THAT CHOICE COSTS OR BUYS AT HIS ACTUAL PICKS.
 *
 * The board carries THREE projection columns and the scorer reads ONE:
 *   proj_sleeper      — 609/609 priced players; `proj_mean` equals it EXACTLY
 *   proj_fantasypros  — 426/609 (70%); on the board, read by nothing
 *   proj_ownmodel     — 498/609 (82%); own_projections.py's own docstring:
 *                       "it does NOT enter proj_mean's composition"
 *
 * ── WHAT THIS TOOL CAN AND CANNOT SAY ─────────────────────────────────────
 * It CANNOT say which source is more accurate. That needs per-player HISTORY
 * for the challenger, and `proj_mean_blend.py`'s own constructibility gate
 * returns `no_control` because no such history exists in this repo for either
 * challenger. Nothing here grades anything, and no result of it should be
 * read as licensing a source change.
 *
 * It CAN say how EXPOSED the board is to the choice: rebuild the same board
 * on the challenger column, drive the same engine down Cory's real pick
 * schedule, and count how many of his fifteen picks change. That is a
 * sensitivity, and a sensitivity is knowable today.
 *
 * ── THE TWO RULES THAT MAKE THE SUBSTITUTION HONEST ───────────────────────
 * (1) COVERAGE. A player with no challenger number keeps his Sleeper number
 *     rather than vanishing or receiving a fabricated one. The fill count is
 *     reported, because a 70%-covered challenger is 30% champion by
 *     construction and a reader must be able to discount for it.
 * (2) DISPERSION. proj_ceiling / proj_floor / proj_sd are FITTED against
 *     proj_mean, so swapping the mean and keeping them would hand the
 *     challenger the champion's spread. They are scaled by the same ratio, so
 *     the ceiling term sees a proportionally consistent player. Stated rather
 *     than buried: this is an assumption, not a measurement.
 *
 * Run: node draft/tools/projection_source_probe.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const WEIGHTS = E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS;
const SOURCES = {
  sleeper: null,                       // the champion: proj_mean as built
  fantasypros: 'proj_fantasypros',
  ownmodel: 'proj_ownmodel',
  // A 50/50 of champion and FantasyPros wherever both exist. Not a proposal —
  // an arm, so "a mix" is a measured row instead of a hypothetical.
  half_fp: '__HALF_FP__',
};

const keep = KEEP.keepersFrom(DATA);
const basePool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);

/** A board rebuilt on one projection column. Returns {pool, filled, moved}. */
function poolFor(source) {
  const col = SOURCES[source];
  if (!col) return { pool: basePool, filled: 0, covered: basePool.length };
  let filled = 0, covered = 0;
  const pool = basePool.map(p => {
    let v = null;
    if (col === '__HALF_FP__') {
      const fp = p.proj_fantasypros;
      v = (fp == null) ? null : 0.5 * p.proj_mean + 0.5 * fp;
    } else {
      v = p[col];
    }
    if (v == null || !isFinite(v) || v <= 0) { filled++; return p; }   // rule (1)
    covered++;
    const r = p.proj_mean > 0 ? v / p.proj_mean : 1;                   // rule (2)
    const q = Object.assign({}, p, { proj_mean: +v });
    ['proj_ceiling', 'proj_floor', 'proj_sd'].forEach(k => {
      if (typeof p[k] === 'number') q[k] = +(p[k] * r).toFixed(2);
    });
    return q;
  });
  return { pool: pool, filled: filled, covered: covered };
}

function drive(pool) {
  const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
    : (p.raw_adp != null ? +p.raw_adp : 9999));
  const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [];
  SCHED.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && need > 0; j++) {
      const p = byAdp[j];
      if (taken.has(String(p.player_id))) continue;
      taken.add(String(p.player_id)); need--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const ctx = {
      board: board, roster: roster, nextPick: SCHED[i + 1] || null,
      currentPick: pk, pick: pk, round: Math.ceil(pk / (DATA.league.teams || 10)),
      myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
      totalPicks: 150, league: DATA.league, weights: WEIGHTS,
      currentKeepers: roster.filter(p => p.is_keeper),
      ceilingAllStages: false, doctrine: null, drift: null,
      intervening: (SCHED[i + 1] || pk) - pk,
    };
    const out = E.recommend(ctx);
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    const top = list[0];
    if (!top || !top.player) { picks.push(null); return; }
    taken.add(String(top.player.player_id));
    roster.push(Object.assign({}, top.player));
    picks.push({ pick: pk, player_id: String(top.player.player_id),
                 name: top.player.name, position: top.player.position });
  });
  return picks;
}

const runs = {};
Object.keys(SOURCES).forEach(s => {
  const b = poolFor(s);
  runs[s] = { picks: drive(b.pool), covered: b.covered, filled_from_sleeper: b.filled };
});

const champ = runs.sleeper.picks;
const report = {
  _territory: 'TERRITORY: A — draft/tools/projection_source_probe.js',
  _note: 'SENSITIVITY, NOT ACCURACY. No source is graded here and none can be '
       + 'from this repo — proj_mean_blend.py\'s constructibility gate returns '
       + 'no_control for want of challenger history. This counts how many of '
       + 'Cory\'s picks the source choice moves.',
  board_built_at: DATA.built_at || null,
  proj_mean_source: 'proj_sleeper (609/609 priced players match it EXACTLY)',
  sources: {},
};
Object.keys(SOURCES).forEach(s => {
  const p = runs[s].picks;
  const changed = p.map((x, i) => (x && champ[i] && x.player_id !== champ[i].player_id) ? i : -1)
                   .filter(i => i >= 0);
  report.sources[s] = {
    coverage: runs[s].covered, filled_from_sleeper: runs[s].filled_from_sleeper,
    picks_changed_vs_sleeper: changed.length,
    changes: changed.map(i => ({ pick: SCHED[i],
      sleeper: champ[i] ? champ[i].position + ' ' + champ[i].name : null,
      challenger: p[i] ? p[i].position + ' ' + p[i].name : null })),
    schedule: p.map(x => x ? x.position + ' ' + x.name : null),
  };
});

console.log('PROJECTION SOURCE SENSITIVITY — board built ' + report.board_built_at);
console.log('proj_mean is ' + report.proj_mean_source + '\n');
Object.keys(SOURCES).forEach(s => {
  const r = report.sources[s];
  console.log('  ' + s.padEnd(12) + ' covered ' + String(r.coverage).padStart(3)
    + '/' + basePool.length + '  filled-from-Sleeper ' + String(r.filled_from_sleeper).padStart(3)
    + '   picks changed: ' + r.picks_changed_vs_sleeper + '/' + SCHED.length);
  r.changes.forEach(c => console.log('       pick ' + String(c.pick).padStart(3)
    + '  ' + String(c.sleeper).padEnd(28) + ' -> ' + c.challenger));
});

const outPath = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); console.log('\nwrote ' + outPath); }
module.exports = { report };
