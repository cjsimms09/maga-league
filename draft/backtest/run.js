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
const allPoints = {};
Object.keys(points).forEach(season => Object.assign(allPoints, points[season]));

const graded = R.grade(replays, allPoints, { maxRound: R.CFG.MAX_ROUND_GRADED });

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
const text = REP.render(graded, cal, meta);
console.log(text);
fs.writeFileSync(REPORT, '```\n' + text + '\n```\n');
fs.writeFileSync(OUT, JSON.stringify({ meta, headline: graded.headline,
  disagreement: graded.disagreement, per_round: graded.per_round,
  vs_human: graded.vs_human, calibration: cal, graded_picks: graded.graded_picks }, null, 1));
console.log('\nwritten to', path.relative(process.cwd(), REPORT));
