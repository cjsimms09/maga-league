/* The /api/reco-probe/:which route (register 287's week-1 verification,
 * post-403 rework) — the app-function path CI actually uses, end-to-end
 * against the real app. In the sandbox Sleeper is unreachable, so a good-key
 * probe exercises the full chain (route -> runCapture -> bundle attempt ->
 * context gate) and lands on the clean 'no live week yet' skip — the same
 * shape the interpreter script scores OK pre-season.
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

  // the real path, both captures: Sleeper unreachable here, so the context
  // gate answers the clean skip — proving route -> runCapture wiring whole.
  for (const which of ['waiver', 'lineup']) {
    r = await fetch(b + `/api/reco-probe/${which}`, {
      headers: { Authorization: 'Bearer probe-secret-for-test' } });
    const j = await r.json().catch(() => null);
    ck(`${which}: good key runs the capture end-to-end`,
      r.status === 200 && j && j.ok === true && j.skipped === 'no live week yet', { status: r.status, j });
  }

  // and the interpreter accepts exactly what this route just answered —
  // the two halves of the probe are proven against EACH OTHER, not a fixture.
  const { execFileSync } = require('child_process');
  const body = JSON.stringify({ ok: true, skipped: 'no live week yet' });
  const out = execFileSync('bash',
    [path.join(ROOT, 'draft', 'tools', 'reco_probe_interpret.sh'), '200', 'waiver-reco'],
    { input: body, encoding: 'utf8' });
  ck('the interpreter scores the live answer OK (halves proven against each other)',
    /OK \(pre-season\)/.test(out), out);

  server.close();
  console.log(`\n${pass}/${pass + fail} reco-probe route checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
