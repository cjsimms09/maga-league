/* ONE-TAP WHY + RECO-CAPTURE HEALTH (A's ranked items 3 and 1, 2026-08-24).
 *
 * Three surfaces, end-to-end:
 *   1. The Sunday alert EMAIL carries the /lineup/why reason chips — captured
 *      by intercepting the real provider call (global fetch), not by trusting
 *      the template.
 *   2. GET /lineup/why records the reason against the send-stamp's snapshot,
 *      once per week, commissioner-cookie only (a mail-client prefetch without
 *      a cookie must record NOTHING — that's the negative arm that matters).
 *   3. /admin/api/reco-capture-health shows markers + the latest auto ledger
 *      row per method, including the sunday-why row this test just wrote.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'sundaywhy-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));

let pass = 0, fail = 0;
const ck = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  -> ' + JSON.stringify(detail)));
  cond ? pass++ : fail++;
};

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  cory.email = 'cory@example.com';
  await store.set('owners', owners);

  // ── 1. the email body, via the REAL send path with the provider intercepted
  process.env.RESEND_API_KEY = 'test-key-not-real';
  const realFetch = global.fetch;
  let sentPayload = null;
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.resend.com')) {
      sentPayload = JSON.parse(opts.body);
      return { ok: true, text: async () => '', json: async () => ({}) };
    }
    return realFetch(url, opts);
  };
  const notify = require(path.join(ROOT, 'src', 'notify'));
  const alert = {
    week: 3, actionable: true, hasCalls: true, lineupKnown: true,
    headline: 'One swap is worth real money', edge: 4.2, fixWorth: 4.2,
    posture: { mode: 'protect', headline: 'Protect the matchup', why: 'you are favored' },
    calls: [], dead: [],
    changes: [{ start: 'Puka Test', sit: 'Bench Body', dollars: 4.2, why: '+$4 win-prob' }],
    band: { median: 148 },
  };
  const r = await notify.sundayAlert(owners, alert);
  global.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
  ck('the alert email actually sent through the intercepted provider', r && r.sent === true, r);
  const html = (sentPayload && sentPayload.html) || '';
  ck('…and carries the one-tap WHY chips', /\/lineup\/why\?week=3&reason=/.test(html), html.slice(0, 200));
  ck('…all four reasons, doing-it included',
    ['doing%20it', 'injury%20news', 'riding%20my%20guy'].every(s => html.includes('reason=' + s))
      && /don't buy the projection|don%27t%20buy/.test(decodeURIComponent(html)), 'missing a chip');

  // ── 2. the tap ────────────────────────────────────────────────────────────
  const season = '2026';
  await store.set(`sunday-alert-sent:${season}:3`, {
    at: new Date().toISOString(), calls: 1, dead: 0,
    todo: [{ start: 'Puka Test', sit: 'Bench Body', dollars: 4.2 }],
  });
  const server = createApp().listen(0);
  await new Promise(r2 => server.once('listening', r2));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = x => x.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const cc = cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=pw', redirect: 'manual' }));

  // The prefetch arm FIRST (order matters — a prefetch that recorded would
  // poison the real-tap assertions below): no cookie, must write nothing.
  const pre = await fetch(b + '/lineup/why?week=3&reason=injury%20news', { redirect: 'manual' });
  ck('a cookieless prefetch bounces off the login wall', pre.status === 302 || pre.status === 401, pre.status);
  ck('…and recorded nothing', !(await store.get(`sundaywhy:${season}:3`)), 'marker exists after prefetch');

  const tap = await fetch(b + "/lineup/why?week=3&reason=don't%20buy%20the%20projection", { headers: { Cookie: cc } });
  const tapBody = await tap.text();
  ck('the real tap lands', tap.status === 200 && /Noted/.test(tapBody), tap.status);
  const mark = await store.get(`sundaywhy:${season}:3`);
  ck('…writes the week marker with the reason', mark && mark.reason === "don't buy the projection", mark);
  const keys = (await store.listKeys(`pred:${season}:`)).sort();
  let whyRow = null;
  for (const k of keys) { const e = await store.get(k); if (e && e.method === 'sunday-why-v1') whyRow = e; }
  ck('…and the ledger row carries the email’s own snapshot',
    whyRow && whyRow.payload.week === 3
      && whyRow.payload.recommended[0] && whyRow.payload.recommended[0].start === 'Puka Test'
      && whyRow.payload.reason === "don't buy the projection", whyRow && whyRow.payload);

  const again = await (await fetch(b + '/lineup/why?week=3&reason=riding%20my%20guy', { headers: { Cookie: cc } })).text();
  ck('a second tap says already-noted and does not stack a row', /Already on the record/.test(again), again.slice(0, 120));
  let whyCount = 0;
  for (const k of (await store.listKeys(`pred:${season}:`))) {
    const e = await store.get(k); if (e && e.method === 'sunday-why-v1') whyCount++;
  }
  ck('…row count stays 1', whyCount === 1, whyCount);

  // ── 3. capture health ─────────────────────────────────────────────────────
  await store.set(`waiverauto:${season}:3`, { none: true, live: true, at: new Date().toISOString() });
  const health = await (await fetch(b + '/admin/api/reco-capture-health', { headers: { Cookie: cc } })).json();
  ck('health lists the waiverauto marker', health.markers.waiverauto && health.markers.waiverauto['3']
    && health.markers.waiverauto['3'].none === true, health.markers);
  ck('health shows the latest sunday-why row',
    health.latest_auto_row['sunday-why-v1'] && health.latest_auto_row['sunday-why-v1'].week === 3,
    health.latest_auto_row);
  ck('health names the never-emitted crons as null (the 3e read)',
    health.latest_auto_row['waiver-auto-v1'] === null && health.latest_auto_row['lineup-auto-v1'] === null,
    health.latest_auto_row);

  server.close();
  console.log(`\n${pass}/${pass + fail} sunday-why + capture-health checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
