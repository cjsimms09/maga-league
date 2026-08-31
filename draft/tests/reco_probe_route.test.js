/* The /api/reco-probe/:which route (register 287's week-1 verification,
 * post-403 rework) — the app-function path CI actually uses, end-to-end
 * against the real app. A good-key probe exercises the full chain (route ->
 * runCapture -> bundle attempt -> context gate) and lands on a clean
 * pre-season skip, which the interpreter script then scores.
 *
 * ⚠️ WHICH skip depends on the MACHINE, and this header used to say otherwise
 * (register 430): "in the sandbox Sleeper is unreachable, so it lands on the
 * clean 'no live week yet' skip". True here, false on GitHub's runners, where
 * Sleeper answers and the gate returns 'preseason' one line later. Both are
 * legal; neither is assumed below.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'recoprobe-'));
process.env.CRON_SECRET = 'probe-secret-for-test';

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };

(async () => {
  await data.ensureSeeded();
  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;

  // no key -> forbidden, nothing runs
  let r = await fetch(b + '/api/reco-probe/waiver');
  ck('no key is forbidden', r.status === 403, r.status);

  // wrong key -> forbidden
  r = await fetch(b + '/api/reco-probe/waiver?key=nope');
  ck('a wrong key is forbidden', r.status === 403, r.status);

  // bad which -> named 400
  r = await fetch(b + '/api/reco-probe/everything', {
    headers: { Authorization: 'Bearer probe-secret-for-test' } });
  ck('an unknown which is a named 400', r.status === 400
    && /waiver or lineup/.test((await r.json()).error || ''), r.status);

  /* The real path, both captures. ⚠️ WHAT THIS USED TO ASSERT, AND WHY IT WAS
   * RED ON EVERY CI RUN ON `main` (register 430): it pinned the literal string
   * `'no live week yet'`, which is the skip `autoCaptureContext` returns when
   * Sleeper is UNREACHABLE (line 43 of the cron). On GitHub's runners Sleeper
   * IS reachable, answers `season_type: 'pre'`, and the very next line returns
   * `'preseason'` instead — so this test passed in every sandbox and failed in
   * every CI run, which is exactly how it kept getting merged.
   *
   * Both strings are correct pre-season answers. The thing worth asserting is
   * not WHICH one came back, it is that the INTERPRETER — the half that scores
   * this in production — accepts the body the route actually produced. So the
   * route's real response is piped into the real script below, and the pinned
   * fixture is gone.
   *
   * ⚠️ AND THE FIRST REWRITE OF THIS BLOCK WAS STILL WRONG, WHICH IS WHY IT
   * READS THE WAY IT DOES NOW. It widened the pin from one skip string to two
   * — and CI came back a third answer within the hour: `'commissioner not
   * mapped to a Sleeper roster'`, because the gate stopped short-circuiting on
   * `season_type` and reached a branch this sandbox never sees. Enumerating
   * the legal answers IS the bug, one value at a time. What this test can
   * honestly assert is the WIRING: the route answers 200 with parseable JSON,
   * and the real interpreter reaches a RECOGNISED verdict on that exact body
   * rather than its "shape I do not recognize" fallback. Whether the verdict
   * is OK or FAIL is the environment's business, not this test's — the probe
   * WORKFLOW is what grades the live answer, weekly, and fails red. */
  const bodies = {};
  for (const which of ['waiver', 'lineup']) {
    r = await fetch(b + `/api/reco-probe/${which}`, {
      headers: { Authorization: 'Bearer probe-secret-for-test' } });
    const text = await r.text();
    const j = (() => { try { return JSON.parse(text); } catch { return null; } })();
    bodies[which] = text;
    ck(`${which}: good key reaches the capture and answers a parseable verdict`,
      r.status === 200 && j && typeof j.ok === 'boolean', { status: r.status, j });
  }

  // and the interpreter accepts exactly what this route just answered — the two
  // halves are proven against EACH OTHER, on the live body, not on a fixture.
  const { execFileSync } = require('child_process');
  const SCRIPT = path.join(ROOT, 'draft', 'tools', 'reco_probe_interpret.sh');
  const interpret = (input, today) => {
    try {
      return { rc: 0, out: execFileSync('bash', [SCRIPT, '200', 'waiver-reco'],
        { input, encoding: 'utf8', env: { ...process.env, RECO_PROBE_TODAY: today } }) };
    } catch (e) { return { rc: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
  };

  /* The halves proven against EACH OTHER on the live body: whatever the route
   * just said, the interpreter must RECOGNISE it. Both verdicts are legal here
   * — what is not legal is the catch-all, which means the two halves have
   * drifted apart and the weekly probe would refuse a healthy rail (or, worse,
   * a real state nobody taught it to read). */
  for (const which of ['waiver', 'lineup']) {
    const g = interpret(bodies[which], '2026-08-31');       // before kickoff
    ck(`the interpreter RECOGNISES ${which}'s OWN live answer, whatever it is `
       + `(halves proven against each other, no fixture)`,
      !/does not recognize/.test(g.out) && /^(OK|WARN|FAIL)/.test(g.out.trim()), g);
  }

  /* ⚠️ THE OTHER ENVIRONMENT, EXERCISED HERE ON PURPOSE. This sandbox cannot
   * reach Sleeper, so the route can only ever produce ONE of the two legal
   * pre-season skips — and trusting that is the whole mistake this rework
   * exists to undo. Both shapes are put through the interpreter explicitly, so
   * the arm CI hits is covered on a machine that cannot generate it. */
  for (const s of ['preseason', 'no live week yet']) {
    const g = interpret(JSON.stringify({ ok: true, skipped: s }), '2026-08-31');
    ck(`both legal pre-season skips are accepted — '${s}' (the sandbox can only `
       + `produce one of these; CI produces the other)`,
      g.rc === 0 && /OK \(pre-season\)/.test(g.out), g);
  }

  /* KNOWN POSITIVE for the date guard (rule 3e). "Cleanly skipping pre-season"
   * is the right answer today and the worst possible answer in week 3 — a dead
   * capture rail prints it identically. Feed the SAME live body with the clock
   * moved past week 1 and the interpreter must refuse; without this arm the
   * guard could be inert and nothing here would notice until the season was
   * already unrecorded. */
  const late = interpret(JSON.stringify({ ok: true, skipped: 'preseason' }), '2026-09-20');
  ck('KNOWN POSITIVE — a pre-season skip is REFUSED once week 1 has been played, '
     + 'so the date guard is not inert',
    late.rc === 1 && /still answers/.test(late.out), late);
  //: on a SYNTHETIC body, not the live one — the live body is not guaranteed to
  //: be a pre-season skip (it was not, in CI, within an hour of this being
  //: written), and a known positive that depends on the environment is not a
  //: known positive at all.

  server.close();
  console.log(`\n${pass}/${pass + fail} reco-probe route checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
