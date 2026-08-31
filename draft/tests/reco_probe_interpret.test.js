/* The reco-cron probe's interpreter (register 287's week-1 verification):
 * every response shape it can meet, with the failure arms proven red — a
 * probe that greens on garbage is the exact rule-3e trap it exists to close.
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const SCRIPT = path.join(__dirname, '..', 'tools', 'reco_probe_interpret.sh');

let pass = 0, fail = 0;

/* ⚠️ THE CLOCK IS PINNED ON PURPOSE (register 429). The pre-season verdict is
 * now DATE-DEPENDENT — "cleanly skipping pre-season" stops being OK once week 1
 * has been played — so a suite that let the real clock in would have gone red on
 * 2026-09-12 for no reason anyone could have predicted from reading it. The
 * date arms are asserted explicitly below instead, both ways.
 * `PRESEASON_DAY` is any date before kickoff; `INSEASON_DAY` is any date after. */
const PRESEASON_DAY = '2026-08-31';
const INSEASON_DAY = '2026-09-20';
const run = (code, body, today = PRESEASON_DAY) => {
  const env = { ...process.env };
  if (today === null) delete env.RECO_PROBE_TODAY; else env.RECO_PROBE_TODAY = today;
  try {
    const out = execFileSync('bash', [SCRIPT, String(code), 'test-cron'],
      { input: body, encoding: 'utf8', env });
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

// ── the date guard, both arms (register 429) ────────────────────────────────
/* A capture rail that dies in week 3 answers `skipped: preseason` forever and
 * this script used to call that OK — the identical green line, every week, over
 * an empty store. That is the failure its own header names, so both arms are
 * pinned here rather than discovered in October. */
for (const s of ['preseason', 'no live week yet']) {
  r = run(200, JSON.stringify({ ok: true, skipped: s }), INSEASON_DAY);
  ck(`KNOWN POSITIVE — '${s}' is REFUSED once week 1 has been played`,
    r.exit === 1 && /still answers/.test(r.out) && /week 1 kicked off/.test(r.out), r);
  r = run(200, JSON.stringify({ ok: true, skipped: s }), PRESEASON_DAY);
  ck(`  and the SAME body is accepted before kickoff, so the guard reads the `
     + `date and not the string ('${s}')`, r.exit === 0 && /OK \(pre-season\)/.test(r.out), r);
}

/* CONTROL: the guard must not swallow the states that are legitimately fine
 * in-season, or it would fire every week on a healthy rail — and a guard that
 * fires on ordinary work is a guard somebody deletes. */
r = run(200, JSON.stringify({ ok: true, skipped: 'already captured', week: 3 }), INSEASON_DAY);
ck('CONTROL — a healthy in-season capture is still OK, so the guard is narrow',
  r.exit === 0 && /SCHEDULED run already fired/.test(r.out), r);

/* CONTROL: with no override the script uses the real clock and still reaches a
 * verdict, naming where its threshold came from. The VERDICT is deliberately
 * not asserted — that would re-introduce exactly the rot this pin removes. */
r = run(200, JSON.stringify({ ok: true, skipped: 'preseason' }), null);
ck('CONTROL — unpinned, the script still runs and names its kickoff source '
   + '(so the pin above cannot hide a broken real-clock path)',
  /week 1 kicked off|Kickoff \d{4}-\d{2}-\d{2}, from /.test(r.out), r);

console.log(`\n${pass}/${pass + fail} probe-interpreter checks passed`);
process.exit(fail ? 1 : 0);
