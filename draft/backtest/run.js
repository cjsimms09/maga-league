/* Orchestrator: bundles in, report out. Same provenance standard as the
 * tournament — a result you cannot attribute to a configuration is an anecdote.
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const R = require('./replay.js');
const REP = require('./report.js');
const G = require('./grade.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const IN = arg('in', path.join(__dirname, 'bundles.json'));
const OUT = arg('out', path.join(__dirname, 'results.json'));
const REPORT = arg('report', path.join(__dirname, 'BACKTEST.md'));

const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
const bundles = input.bundles || [];
const points = input.actual_points || {};

const replays = bundles.map(b => R.replaySeason(b));
// Season-aware raw points. NEVER merge seasons — a player drafted in two years
// must be graded with each year's own points.
const rawFn = (id, season) => {
  const m = points[String(season)];
  return m ? m[String(id)] : null;
};

// Value-over-replacement points (D1's recommended metric). Replacement is the
// (starters x teams)-th best ACTUAL scorer at each position that season, so an
// elite QB's huge raw total is discounted by the high replacement QB — which is
// why ADP correctly sends QBs late and raw-points grading does not.
const posOf = {};
bundles.forEach(b => (b.players || []).forEach(p => { posOf[String(p.player_id)] = p.position; }));
function replacementBySeason() {
  const out = {};
  bundles.forEach(b => {
    const season = String(b.season);
    const m = points[season] || {};
    const starters = {};
    (b.roster_positions || []).forEach(slot => {
      if (['BN','IR','TAXI'].indexOf(slot) >= 0) return;
      // FLEX contributes to RB/WR/TE replacement pools; approximate by adding to each.
      if (slot === 'FLEX') { ['RB','WR','TE'].forEach(x => starters[x] = (starters[x]||0) + 1/3); }
      else starters[slot] = (starters[slot] || 0) + 1;
    });
    const teams = b.teams || 10;
    const byPos = {};
    Object.keys(m).forEach(id => {
      const pos = posOf[id]; if (!pos) return;
      (byPos[pos] = byPos[pos] || []).push(m[id]);
    });
    const rep = {};
    Object.keys(byPos).forEach(pos => {
      const arr = byPos[pos].slice().sort((x, y) => y - x);
      const n = Math.max(1, Math.round((starters[pos] || 0) * teams));
      rep[pos] = arr[Math.min(arr.length - 1, n)] || 0;   // next man off the bench
    });
    out[season] = rep;
  });
  return out;
}
const REPL = replacementBySeason();
const valueFn = (id, season) => {
  const m = points[String(season)];
  const raw = m ? m[String(id)] : null;
  if (raw == null) return null;
  const pos = posOf[String(id)];
  const rep = (REPL[String(season)] || {})[pos] || 0;
  return raw - rep;
};

// Flat map only for the diagnostics' name/smell dump.
const allPoints = {};
Object.keys(points).forEach(season => Object.assign(allPoints, points[season]));

const graded = R.grade(replays, rawFn, { maxRound: R.CFG.MAX_ROUND_GRADED });
const gradedValue = R.grade(replays, valueFn, { maxRound: R.CFG.MAX_ROUND_GRADED });

// ---- LEAK DIAGNOSTICS (round-1 bug alarm forces this) --------------------
// The report fired its round-1 alarm. Before any number is believed, prove the
// board actually depletes and the pick ids join the board ids — a board that
// never shrinks makes every player 'survive' and every pick diverge, which is
// exactly the calibration + round-1 signature observed.
(function () {
  const D = [];
  bundles.forEach(b => {
    const boardIds = new Set((b.players || []).map(p => String(p.player_id)));
    const pk = (b.picks || []);
    const nonKeeper = pk.filter(p => !p.is_keeper);
    const idsOnBoard = nonKeeper.filter(p => boardIds.has(String(p.player_id))).length;
    D.push('  ' + b.season + ': ' + pk.length + ' picks, ' + nonKeeper.length
      + ' non-keeper; ' + idsOnBoard + ' of those match a board id ('
      + (100 * idsOnBoard / Math.max(1, nonKeeper.length)).toFixed(0) + '%)');
    // The replay result carries records; how many decisions did it actually make?
    const rep = replays.find(r => r.season === b.season);
    D.push('    board size ' + (b.players || []).length + '; replay made '
      + (rep ? rep.records.length : 0) + ' decisions');
  });
  // Name lookup across all bundles.
  const nameOf = {};
  bundles.forEach(b => (b.players || []).forEach(p => { nameOf[String(p.player_id)] = p.name; }));
  // Multi-season-sum smell: any graded actual over a single-season ceiling.
  const hot = [];
  Object.keys(allPoints).forEach(id => { if (allPoints[id] > 450) hot.push(id); });
  D.push('  players with actual points > 450 (single-season ceiling smell): ' + hot.length);
  hot.slice(0, 8).forEach(id => D.push('      ' + (nameOf[id] || id) + ' = ' + allPoints[id].toFixed(0)));
  // Round-1 detail: the alarm lives here, so show exactly what each policy took.
  D.push('  round-1 picks (actual / B0 / B3, name=points):');
  (graded.rows || []).filter(r => r.round === 1).slice(0, 12).forEach(r => {
    const nm = id => (nameOf[id] || id) + '=' + (allPoints[id] == null ? 'NA' : allPoints[id].toFixed(0));
    D.push('    ' + r.season + '  actual ' + nm(r.actual_id)
      + '  | B0 ' + nm(r.ids.B0) + '  | B3 ' + nm(r.ids.B3));
  });
  console.log('\n=== LEAK DIAGNOSTICS ===');
  D.forEach(l => console.log(l));
  require('fs').writeFileSync(require('path').join(__dirname, 'DIAGNOSTICS.txt'), D.join('\n'));
})();

// Survival truth comes from the pick sequence, which is outcome-free.
const picksBySeason = {};
bundles.forEach(b => { picksBySeason[b.season] = b.picks || []; });
const cal = R.calibration(replays, sp => G.survived(sp, picksBySeason[sp.season]));

function gitHead() {
  try {
    return cp.execSync('git rev-parse HEAD && git status --porcelain -- draft/backtest public/js/draft',
      { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim().split('\n');
  } catch (e) { return ['UNAVAILABLE']; }
}
const head = gitHead();
const meta = {
  git_head: head[0],
  uncommitted_when_run: head.slice(1),
  seasons: bundles.map(b => b.season),
  max_round: R.CFG.MAX_ROUND_GRADED,
  methods: bundles.map(b => ({ season: b.season, method: b.projection_method,
                               spearman: (b.sanity || {}).spearman_vs_adp })),
  caveats: input.caveats || [],
};
let text = REP.render(graded, cal, meta);

// ---- D1: value-over-replacement cut, reported ALONGSIDE the raw metric ------
// The raw-points round-1 alarm is a QB artifact (elite QBs score 450+ raw but
// little over replacement). This cut is the D1-recommended metric; if the
// alarm clears here, that confirms it was a metric artifact, not the engine
// over-drafting QBs.
(function () {
  const h = gradedValue.headline, r1 = (gradedValue.per_round || []).find(x => x.round === 1);
  const V = [];
  V.push('');
  V.push('='.repeat(78));
  V.push('D1 CUT — VALUE OVER POSITIONAL REPLACEMENT (points minus replacement)');
  V.push('='.repeat(78));
  V.push('  This discounts an elite QB\'s raw total by the high replacement QB —');
  V.push('  the reason ADP sends QBs late. Reported alongside the raw metric; no');
  V.push('  install happens off either until D1 is ruled.');
  V.push('  B0 ' + h.b0_mean + '  B2(VORP) ' + h.b2_mean + '  B3 ' + h.b3_mean);
  V.push('  B3-B0 per pick   ' + h.mean_gain_per_pick + ' +/- ' + h.ci95_per_pick);
  V.push('  B3-B0 per draft  ' + h.mean_gain_per_draft + ' +/- ' + h.ci95_per_draft);
  V.push('  round-1 gain     ' + (r1 ? r1.mean_gain + ' +/- ' + r1.ci95 : 'n/a'));
  if (r1) {
    V.push(Math.abs(r1.mean_gain) > 8
      ? '  ROUND-1 ALARM STILL FIRES under value grading — the composite genuinely'
        + ' over-drafts QBs in round 1; that is an ENGINE finding, not a metric one.'
      : '  Round-1 alarm CLEARS under value grading — confirming the raw-points'
        + ' alarm was a QB metric artifact, per D1.');
  }
  V.push('  per-round value gain (B3-B0):');
  (gradedValue.per_round || []).forEach(x => V.push('    r' + x.round + '  ' + x.mean_gain + ' +/- ' + x.ci95));
  text = text + '\n' + V.join('\n');
  console.log(V.join('\n'));
})();
console.log(text);
fs.writeFileSync(REPORT, '```\n' + text + '\n```\n');
fs.writeFileSync(OUT, JSON.stringify({ meta, headline: graded.headline,
  disagreement: graded.disagreement, per_round: graded.per_round,
  value_cut: { headline: gradedValue.headline, per_round: gradedValue.per_round, disagreement: gradedValue.disagreement },
  vs_human: graded.vs_human, calibration: cal, graded_picks: graded.graded_picks }, null, 1));
console.log('\nwritten to', path.relative(process.cwd(), REPORT));
