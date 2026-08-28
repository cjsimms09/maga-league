'use strict';
/* TERRITORY: A.  THE REGISTER COMMIT GUARD CANNOT ROT (register 390). */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'draft', 'tools', 'register_commit_guard.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

{
  let code = 0, out = '';
  try { out = execFileSync('node', ['draft/tools/register_commit_guard.js', '--self-test'],
    { cwd: ROOT, encoding: 'utf8' }); } catch (e) { code = 1; out = String(e.stdout || ''); }
  ck('the guard proves itself — both corruptions and the clean case',
    code === 0 && /self-tests passed/.test(out) && !/^FAIL/m.test(out), out.slice(-300));
}

// The LIVE register must pass, or the guard blocks all future work.
{
  const live = fs.readFileSync(path.join(ROOT, 'DEFECT-REGISTER.md'), 'utf8');
  ck('the live register is clean, so this guard does not block every commit',
    G.problems(live, []).length === 0, G.problems(live, []).slice(0, 3));
}

/* THE FAIL-OPEN ARM. The first version of this guard read the staged blob with
 * execSync's DEFAULT 1MB buffer; DEFECT-REGISTER.md is ~1.04MB, so it threw
 * ENOBUFS, the catch returned null, and the guard EXITED 0 ON A BROKEN ROW.
 * The self-test passed 7/7 throughout, because fixtures are small. */
{
  const src = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'register_commit_guard.js'), 'utf8');
  ck('the staged read raises maxBuffer — the register is ~1MB and the DEFAULT '
    + 'silently threw, which made the guard fail OPEN',
  /maxBuffer/.test(src) && /BUF\s*=\s*\d+\s*\*/.test(src));
  ck('  and a read failure REFUSES rather than being read as "not staged" — a '
    + 'guard that cannot read what it guards must not report success',
  /return 2;/.test(src) && /REFUSING the commit/.test(src));
  const bytes = fs.statSync(path.join(ROOT, 'DEFECT-REGISTER.md')).size;
  ck('  CONTROL — the register really is near/over the 1MB default, so that '
    + 'failure was real and not hypothetical (' + bytes + ' bytes)',
  bytes > 900000, { bytes: bytes });
}

// The hook must be tracked, or the guard is unreachable at commit time.
ck('the pre-commit hook is tracked in the repo',
  fs.existsSync(path.join(ROOT, '.githooks', 'pre-commit')));

console.log('\n' + pass + '/' + (pass + fail) + ' register-commit-guard arms passed');
process.exit(fail ? 1 : 0);
