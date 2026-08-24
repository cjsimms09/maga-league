/* WITHDRAW A MEASURE (redesign catalog 10, 2026-08-24) — the proposer pulls
 * their own unengaged question; the electorate's engagement locks it. Real
 * app, real routes. Nonce-keyed questions against the persistent store.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'vwithdraw-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };
const nonce = 'wdraw-' + Date.now();

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw`, redirect: 'manual' }));
  const rc = await login('richard'), cc = await login('cory');
  const post = (ck2, url, body) => fetch(b + url, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck2 },
    body: body || '', redirect: 'manual' });
  const findVote = async q => {
    const keys = await store.listKeys('vote:');
    const docs = await store.getMany(keys);
    return docs.filter(Boolean).find(v => v.question === q) || null;
  };

  // richard proposes; his card offers the withdraw; nobody else has voted.
  await post(rc, '/votes/propose', 'question=' + encodeURIComponent(nonce + ' q1'));
  const v1 = await findVote(nonce + ' q1');
  ck('the measure exists and is open', v1 && v1.status === 'open', v1);
  let page = await (await fetch(b + '/votes', { headers: { Cookie: rc } })).text();
  ck('the proposer sees the withdraw button', page.includes(`/votes/${v1.id}/withdraw`), 'no button');
  page = await (await fetch(b + '/votes', { headers: { Cookie: cc } })).text();
  ck('another owner does NOT see it', !page.includes(`/votes/${v1.id}/withdraw`), 'button leaked');

  // a non-proposer POSTing directly is a no-op
  await post(cc, `/votes/${v1.id}/withdraw`);
  ck('a non-proposer POST changes nothing', (await findVote(nonce + ' q1')).status === 'open');

  // the proposer's OWN ballot never blocks their withdrawal
  await post(rc, `/votes/${v1.id}/ballot`, 'choice=yes');
  await post(rc, `/votes/${v1.id}/withdraw`);
  const gone = await findVote(nonce + ' q1');
  ck('the proposer withdraws even after voting for their own idea',
    gone.status === 'withdrawn' && !!gone.withdrawn_at, gone.status);
  page = await (await fetch(b + '/votes', { headers: { Cookie: cc } })).text();
  ck('a withdrawn measure leaves the page entirely', !page.includes(nonce + ' q1'), 'still rendered');

  // once ANOTHER owner engages, the measure belongs to the electorate.
  await post(rc, '/votes/propose', 'question=' + encodeURIComponent(nonce + ' q2'));
  const v2 = await findVote(nonce + ' q2');
  await post(cc, `/votes/${v2.id}/ballot`, 'choice=no');
  page = await (await fetch(b + '/votes', { headers: { Cookie: rc } })).text();
  ck('the button disappears once the league has engaged',
    !page.includes(`/votes/${v2.id}/withdraw`), 'button still offered');
  await post(rc, `/votes/${v2.id}/withdraw`);
  ck('…and a direct POST refuses too (the record stands)',
    (await findVote(nonce + ' q2')).status === 'open');

  server.close();
  console.log(`\n${pass}/${pass + fail} measure-withdraw checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
