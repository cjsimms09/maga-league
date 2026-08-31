'use strict';
/* TERRITORY: A.  THE ARTIFACT WRITE GUARD CANNOT ROT (register 388).
 *
 * The guard is enforced by a LOCAL git hook (.githooks/commit-msg, wired by
 * restore_container.sh). A local hook is exactly the kind of protection that
 * can quietly stop working — wrong hooksPath, a fresh clone, a recreated
 * container — so the LOGIC is gated here, in the suite CI already runs.
 *
 * This asserts the decision function and the wiring's existence. It cannot
 * assert that a given machine has hooksPath set, and does not pretend to.
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'draft', 'tools', 'artifact_write_guard.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// The guard proves itself; CI trusts that before anything else.
{
  let code = 0, out = '';
  try { out = execFileSync('node', ['draft/tools/artifact_write_guard.js', '--self-test'],
    { cwd: ROOT, encoding: 'utf8' }); } catch (e) { code = 1; out = String(e.stdout || ''); }
  ck('the guard\'s own self-test passes — it can both refuse and allow',
    code === 0 && /self-tests passed/.test(out) && !/^FAIL/m.test(out), out.slice(-300));
}

// The registry it depends on must actually declare artifacts.
{
  let map = null;
  try { map = G.registered(); } catch (e) { /* below */ }
  ck('the live registry declares artifacts, so the guard is not guarding nothing',
    map && map.size >= 10, { size: map ? map.size : 0 });

  // The four that actually reached history on 08-28 must be covered.
  const mustCover = ['draft/backtest/own_attribution_2026.json',
    'public/market_upside_2026.json', 'draft/backtest/ridge_arm_fit.json',
    'draft/backtest/age_curve_2026.json'];
  const missing = map ? mustCover.filter(p => !map.has(p)) : mustCover;
  ck('the artifacts that were committed by accident on 2026-08-28 are all '
    + 'covered — the guard is aimed at the incident that produced it',
  missing.length === 0, missing);
}

// FAIL ARM + pass arm on the decision itself, so neither direction is assumed.
{
  const reg = new Map([['a/x.json', 'x'], ['b/y.json', 'y']]);
  ck('FAIL ARM — an undeclared artifact is caught',
    G.undeclared(['a/x.json'], 'unrelated', reg).length === 1);
  ck('  and naming its id clears it, so deliberate work is never blocked',
    G.undeclared(['a/x.json'], 'Regenerate x because ...', reg).length === 0);
  ck('  a non-artifact file is never caught, so the guard cannot fire on '
    + 'ordinary commits', G.undeclared(['src/app.js'], 'anything', reg).length === 0);
}

// The wiring must exist in the tree, even though we cannot assert it is active.
{
  const hook = path.join(ROOT, '.githooks', 'commit-msg');
  ck('the commit-msg hook is tracked in the repo, not only in local .git',
    fs.existsSync(hook), hook);
  const restore = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'restore_container.sh'), 'utf8');
  ck('restore_container.sh re-points core.hooksPath — a recreated container '
    + 'loses local git config exactly as it loses the pip installs',
  /core\.hooksPath/.test(restore) && /\.githooks/.test(restore));
}

console.log('\n' + pass + '/' + (pass + fail) + ' artifact-write-guard arms passed');
process.exit(fail ? 1 : 0);
