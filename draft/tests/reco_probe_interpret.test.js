/* The reco-cron probe's interpreter (register 287's week-1 verification):
 * every response shape it can meet, with the failure arms proven red — a
 * probe that greens on garbage is the exact rule-3e trap it exists to close.
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const SCRIPT = path.join(__dirname, '..', 'tools', 'reco_probe_interpret.sh');

let pass = 0, fail = 0;
const run = (code, body) => {
  try {
    const out = execFileSync('bash', [SCRIPT, String(code), 'test-cron'],
      { input: body, encoding: 'utf8' });
    return { exit: 0, out };
  } catch (e) {
    return { exit: e.status, out: String(e.stdout || '') };
  }
};
const ck = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  -> ' + JSON.stringify(detail)));
  cond ? pass++ : fail++;
};

// ── the passing states ──────────────────────────────────────────────────────
let r = run(200, JSON.stringify({ ok: true, skipped: 'preseason' }));
ck('pre-season skip verifies wiring (exit 0)', r.exit === 0 && /pre-season/.test(r.out), r);

r = run(200, JSON.stringify({ ok: true, skipped: 'already captured', week: 1 }));
ck('already-captured is the scheduled-run PROOF (exit 0)', r.exit === 0 && /SCHEDULED run already fired/.test(r.out), r);

r = run(200, JSON.stringify({ ok: true, week: 1, captured: 1, keys: ['waiver_auto|2026|w1|1|x'] }));
ck('fresh capture passes but names the missing schedule', r.exit === 0 && /scheduled fire is MISSING/.test(r.out), r);

r = run(200, JSON.stringify({ ok: true, week: 1, captured: 0, note: 'tool says hold — recorded as the week marker' }));
ck('a hold week is a recorded answer (exit 0)', r.exit === 0 && /hold week/.test(r.out), r);

// ── the failing states, proven red ──────────────────────────────────────────
r = run(500, JSON.stringify({ ok: false, error: 'ENOENT draft/data/league_history.json' }));
ck('an HTTP 500 fails red', r.exit === 1 && /HTTP 500/.test(r.out), r);

r = run(200, JSON.stringify({ ok: false, error: 'boom' }));
ck('ok:false fails red even at HTTP 200', r.exit === 1, r);

r = run(200, JSON.stringify({ ok: true, skipped: 'commissioner not mapped to a Sleeper roster' }));
ck('an unmapped commissioner fails red — it silently costs every week', r.exit === 1 && /silently costs/.test(r.out), r);

r = run(200, '<html>gateway timeout</html>');
ck('non-JSON garbage fails red, never greens', r.exit === 1, r);

r = run(200, JSON.stringify({ ok: true, something: 'unexpected' }));
ck('an unrecognized ok:true shape REFUSES to verify (the 3e trap)', r.exit === 1 && /does not recognize/.test(r.out), r);

console.log(`\n${pass}/${pass + fail} probe-interpreter checks passed`);
process.exit(fail ? 1 : 0);
