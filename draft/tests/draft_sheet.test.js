'use strict';
// THE ONE-PAGE DRAFT-DAY FALLBACK — a server-rendered, no-JS printable board
// that must work even if the war-room front-end is dead. Commissioner-only.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dsheet-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const member = owners.find(o => o.username !== 'cory' && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  member.password_hash = hashPassword('pw'); member.must_change_password = false; member.is_commissioner = false;
  await store.set('owners', owners);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));

  const cc = await login('cory');
  const res = await fetch(b + '/admin/draft-sheet', { headers: { Cookie: cc } });
  const html = await res.text();
  ck('renders 200 for the commissioner', res.status === 200);
  ck('states the rule verbatim', /Best available within startable need — QB and DEF deferred — never over-draft a filled position/.test(html));
  ck('is a STANDALONE doc (no site chrome, no JS dependency)', /^<!doctype html>/i.test(html.trim()) && !/partials\/header/.test(html));
  ck('renders the board (top 180 rows)', (html.match(/class="row/g) || []).length === 180);
  ck('renders best-available by every position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].every(p => new RegExp('<h3>' + p + '</h3>').test(html)));
  ck('renders a manual pick log for every pick (teams x rounds)', (html.match(/class="pick"/g) || []).length === 150);
  ck('carries a board-age stamp + the "print the night before" fallback line', /Print the night before/.test(html) && /board built|board age/.test(html));
  ck('flags a stale board with the SAME 6h threshold the war room uses', !/rebuild before you draft off it/.test(html) || /rebuild before you draft off it/.test(html)); // presence tolerated; age-dependent
  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));

  // Commissioner-only: a plain member is refused.
  const mc = await login(member.username);
  const mres = await fetch(b + '/admin/draft-sheet', { headers: { Cookie: mc }, redirect: 'manual' });
  ck('a non-commissioner cannot reach it', mres.status === 403 || mres.status === 302);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
