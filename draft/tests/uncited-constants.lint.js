/* ADVISORY LINT — test literals that mirror a production constant.
 *
 * WHY THIS EXISTS. Two bugs in this repo were defended by their own tests:
 * adpSd(100) === 22.0 pinned the coefficient an audit had already flagged as
 * ~2x reality, and a test REQUIRED the string "P(top-2)" on a value that is
 * not a probability. Both were written from the code rather than from a spec,
 * which converts a bug into a defended bug — strictly worse than no test,
 * because an untested bug can be fixed silently while a tested one fights back.
 *
 * THE RULE IT ENFORCES. A test asserting a specific constant must either
 * reference the constant symbolically (E.CFG.ADP_SD_CAP, so re-tuning does not
 * break it) or cite, in a comment, where the spec says that number. A bare
 * literal with no citation is a snapshot of the code agreeing with itself.
 *
 * ADVISORY, NOT GATING. This is deliberately not wired into the test run.
 * It has real false positives — normalCdf(mu) === 0.5 is mathematics, and a
 * fixture's pick number of 40 colliding with SHEET_QUEUE_DEPTH means nothing.
 * A lint that cries wolf gets suppressed, and a suppressed lint is worse than
 * no lint. Run it by hand when adding tests:
 *
 *   node draft/tests/uncited-constants.lint.js
 *
 * Triage each hit: is the literal an INPUT the test itself chose (fine), or an
 * EXPECTED VALUE that restates the code (fix it)?
 */
const fs = require('fs');
const MOD = { engine: 'engine', survival: 'engine', mcts: 'mcts', value: 'mcts' };
const cfg = {};
Object.keys(MOD).forEach(m => {
  const C = require('/home/user/TruthRxWebsite/league/public/js/draft/' + m + '.js').CFG || {};
  Object.keys(C).forEach(k => {
    const v = C[k];
    // Distinctive only: a decimal, or a magnitude unlikely to be a loop bound.
    if (typeof v === 'number' && (v % 1 !== 0 || Math.abs(v) >= 15)) {
      (cfg[v] = cfg[v] || []).push({ test: MOD[m], sym: m + '.CFG.' + k });
    }
  });
});
const dir = '/home/user/TruthRxWebsite/league/draft/tests/';
let hits = 0;
fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).forEach(f => {
  const base = f.replace('.test.js', '');
  fs.readFileSync(dir + f, 'utf8').split('\n').forEach((ln, i) => {
    if (/^\s*(\/\/|\*)/.test(ln) || /CFG\./.test(ln)) return;
    if (!/===|approx\(/.test(ln)) return;
    (ln.match(/-?\d+(?:\.\d+)?/g) || []).forEach(s => {
      const n = parseFloat(s), e = cfg[n];
      if (!e) return;
      const same = e.filter(x => x.test === base);
      if (!same.length) return;                 // constant belongs to another module
      hits++;
      console.log(f + ':' + (i + 1) + '  literal ' + n + '  ==  ' + same.map(x => x.sym).join(' / '));
      console.log('      ' + ln.trim().slice(0, 105));
    });
  });
});
console.log('\n' + hits + ' distinctive same-module mirrors');
