/* Step 3 runner: the strategy table, the winner, and the perturbation gate.
 * Reads the same bundles.json the replay does; installs nothing on its own —
 * it prints the verdict and STRATEGY.md, and a human decides whether the
 * winner becomes the League-Tuned preset.
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const S = require('./strategies.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const IN = arg('in', path.join(__dirname, 'bundles.json'));
const OUT = arg('out', path.join(__dirname, 'STRATEGY.md'));
const JSON_OUT = arg('json', path.join(__dirname, 'strategy-results.json'));

const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
const bundles = input.bundles || [];
const points = input.actual_points || {};

const table = S.runTable(bundles, points);
const sel = S.selectWinner(table);
const sweep = sel.winner
  ? S.perturbationSweep(bundles, points, sel.winner.key)
  : { ran: false, reason: 'no winner cleared the selection rule' };

// Install decision: BOTH gates. Cleared the rule AND survived jitter.
const install = !!(sel.winner && sweep.ran && sweep.survives);

function gitHead() {
  try {
    return cp.execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim();
  } catch (e) { return 'UNAVAILABLE'; }
}
const meta = { git_head: gitHead(), seasons: bundles.map(b => b.season), caveats: input.caveats || [] };

const L = [];
const f = (n, d) => (n == null ? '—' : Number(n).toFixed(d == null ? 2 : d));
L.push('='.repeat(78));
L.push('STRATEGY TABLE — which weighting would have won our drafts');
L.push('='.repeat(78));
L.push('git HEAD   ' + meta.git_head);
L.push('seasons    ' + meta.seasons.join(', ') + '   (N=' + sel.n_seasons + ')');
L.push('');
L.push('With N this small we are CHOOSING AMONG PROFILES, not tuning eight dials.');
L.push('Every number is paired profile-minus-Default on the same season+seat draft.');
L.push('');
L.push('profile           seasons won   pooled edge      95% CI');
table.forEach(r => {
  const v = r.vs_default;
  L.push('  ' + r.name.padEnd(16)
    + (v.seasons_won + '/' + v.seasons_total).padStart(11)
    + f(v.pooled.mean).padStart(14) + ('+/- ' + f(v.pooled.ci95)).padStart(13)
    + (r.key === 'default' ? '   (baseline)' : ''));
});
L.push('');
L.push('per-season edge over Default:');
L.push('  profile           ' + meta.seasons.map(s => String(s).padStart(9)).join(''));
table.forEach(r => {
  if (r.key === 'default') return;
  const cells = meta.seasons.map(s => {
    const ps = r.vs_default.per_season[s];
    return (ps ? f(ps.mean) : '—').padStart(9);
  }).join('');
  L.push('  ' + r.name.padEnd(16) + cells);
});
L.push('');
L.push('--- SELECTION RULE (pre-registered) ---');
L.push('  ' + sel.rule);
if (!sel.winner) {
  L.push('  RESULT: no profile cleared the bar. DEFAULT STANDS.');
} else {
  L.push('  Cleared the rule: ' + sel.winner.name + '  (pooled +' + f(sel.winner.vs_default.pooled.mean)
    + ', won ' + sel.winner.vs_default.seasons_won + '/' + sel.winner.vs_default.seasons_total + ')');
  L.push('');
  L.push('--- PERTURBATION GATE (each weight jittered +/-' + (S.CFG.JITTER * 100) + '%) ---');
  if (sweep.ran) {
    L.push('  ' + sweep.samples + ' jittered variants; ' + (sweep.fraction_beating_default * 100).toFixed(0)
      + '% still beat Default (threshold ' + (sweep.survive_threshold * 100) + '%)');
    L.push('  edge distribution:  p25 ' + f(sweep.edge_p25) + '   median ' + f(sweep.edge_median)
      + '   p75 ' + f(sweep.edge_p75) + '   worst ' + f(sweep.edge_min));
    if (sweep.survives) {
      L.push('  SURVIVES. The edge is a property of the strategy, not one point in');
      L.push('  weight-space. INSTALL ' + sel.winner.name + ' as the League-Tuned preset.');
    } else {
      L.push('  DID NOT SURVIVE. The edge collapsed under small perturbation — it lived');
      L.push('  at one exact point in weight-space, which is noise wearing a crown.');
      L.push('  DEFAULT STANDS.');
    }
  }
}
L.push('');
L.push('INSTALL DECISION: ' + (install ? ('YES — ' + sel.winner.name) : 'NO — Default stands'));
L.push('');
L.push('--- CAVEATS ---');
meta.caveats.forEach(c => L.push('  * ' + c));
L.push('  * ' + sel.n_seasons + ' seasons. The Part 8 C2 rule applies to reading this table:');
L.push('    three drafts can pick a profile, they cannot tune weights.');
L.push('='.repeat(78));

const text = L.join('\n');
console.log(text);
fs.writeFileSync(OUT, '```\n' + text + '\n```\n');
fs.writeFileSync(JSON_OUT, JSON.stringify({ meta, table, selection: sel, sweep, install }, null, 1));
console.log('\nwritten to', path.relative(process.cwd(), OUT));
