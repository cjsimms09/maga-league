/* HISTORY SMOKE — the pages render, logged in, WITH CONTENT.
 *
 * "Renders locally, breaks in prod" is now a known failure family here: the
 * History engine 500'd in the deployed function because its data files were not
 * bundled (see bundling_guard.test.js), and the career money board came back
 * empty. An empty table is WORSE than a 500 — nothing alarms on it. So this
 * boots the real app over HTTP, logs in, and asserts every History page is 200
 * AND carries the content that proves it actually populated: the money board
 * must show dollar totals, the 2024 chapter must carry real prose, the record
 * book must list names.
 *
 * This runs with a full filesystem, so it does NOT prove the bundle is complete
 * — that is bundling_guard.test.js's job. The two are complementary: the guard
 * proves the files SHIP, this proves the render POPULATES. Neither alone is enough.
 *
 * Needs node_modules (express/ejs); CI runs it in the npm-install'd step next to
 * server-ledger.test.js.
 *
 * Run: node draft/tests/history_smoke.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-smoke-'));

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = res => res.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');

(async function () {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('draftnight2026');
  cory.must_change_password = false;
  await store.set('owners', owners);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(base + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=draftnight2026', redirect: 'manual' });
  check('login succeeds (302)', login.status === 302, String(login.status));
  const cookie = cookieFrom(login);

  async function getPage(p) {
    const r = await fetch(base + p, { headers: { Cookie: cookie }, redirect: 'manual' });
    const body = r.status === 200 ? await r.text() : '';
    return { status: r.status, body };
  }

  // /history — the chronicle hub, must list seasons and mark 2024 written.
  {
    const { status, body } = await getPage('/history');
    check('/history is 200', status === 200, String(status));
    check('/history is non-empty and lists the 2024 season card',
      body.length > 2000 && /\/history\/season\/2024/.test(body),
      'len ' + body.length);
    // Behavioral, not copy-pinned: B owns the history wording, so assert the
    // written-vs-records DISTINCTION renders (2024 is a written chapter, other
    // years are records-only) rather than an exact string that B may reword.
    check('/history distinguishes the written 2024 chapter from records-only years',
      /<span class="tag">/.test(body) && /tag (pending|ghost)/.test(body),
      'no written/records tag distinction found — the chapters set is not driving the tags');
  }

  // /history/season/2024 — the written chapter must carry real prose, not a shell.
  {
    const { status, body } = await getPage('/history/season/2024');
    check('/history/season/2024 is 200', status === 200, String(status));
    check('/history/season/2024 renders the written chapter (substantial prose)',
      body.length > 12000, 'len ' + body.length + ' — a near-empty chapter is the shell, not the prose');
  }

  // /history/records — the record book must list owner names + numbers.
  {
    const { status, body } = await getPage('/history/records');
    check('/history/records is 200', status === 200, String(status));
    check('/history/records is populated (has rows)', body.length > 3000, 'len ' + body.length);
  }

  // /history/money — THE regression. The career board must show DOLLAR TOTALS.
  {
    const { status, body } = await getPage('/history/money');
    check('/history/money is 200', status === 200, String(status));
    const dollars = (body.match(/\$[0-9][0-9,]*/g) || []);
    check('/history/money shows career dollar totals (NOT an empty table)',
      dollars.length >= 5,
      dollars.length + ' dollar figures found — an empty money board is a silent '
        + 'failure worse than a 500, nothing alarms on it');
    check('/history/money totals are non-zero (real earnings, not $0 placeholders)',
      dollars.some(d => !/^\$0$/.test(d)), 'first few: ' + dollars.slice(0, 5).join(' '));
  }

  // /admin/warroom — the draft surface. Serves a shell (the board loads client
  // side), so this asserts the shell renders with its decision scaffolding, not
  // a login bounce or a 500. This is the page draft night actually runs on.
  {
    const { status, body } = await getPage('/admin/warroom');
    check('/admin/warroom is 200 (logged-in draft surface)', status === 200, String(status));
    check('/admin/warroom renders the war-room shell (not a bounce/empty)',
      body.length > 5000 && /war\s*room|Take This Player|paths-panel|recs/i.test(body),
      'len ' + body.length);
  }

  server.close();
  console.log('');
  console.log(pass + '/' + (pass + fail) + ' history-smoke checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE THREW:', e && e.stack || e); process.exit(1); });
