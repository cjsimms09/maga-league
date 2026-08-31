/* EDIT AN UNVOTED PROPOSAL (redesign catalog 10, the other half of withdraw,
 * 2026-08-27) — "same rule as bets: until anyone has acted on it, the author
 * owns it. Typo'd ballots currently live forever." Real app, real routes.
 * Nonce-keyed questions against the persistent store, same pattern as
 * votes_withdraw.test.js.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'vedit-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };
const nonce = 'vedit-' + Date.now();

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
    return docs.filter(Boolean).find(v => v.question === q || v.question === q + ' — fixed') || null;
  };
  const getVoteById = async id => store.get(`vote:${id}`);

  // richard proposes a typo'd question; nobody has voted yet.
  await post(rc, '/votes/propose', 'question=' + encodeURIComponent(nonce + ' q1'));
  const v1 = await findVote(nonce + ' q1');
  ck('the measure exists, open, no edited_at yet', v1 && v1.status === 'open' && !v1.edited_at, v1);
  let page = await (await fetch(b + '/votes', { headers: { Cookie: rc } })).text();
  ck('the proposer sees the edit form', page.includes(`/votes/${v1.id}/edit`), 'no edit form');
  page = await (await fetch(b + '/votes', { headers: { Cookie: cc } })).text();
  ck('another owner does NOT see it', !page.includes(`/votes/${v1.id}/edit`), 'form leaked');

  // a non-proposer POSTing directly is a no-op
  await post(cc, `/votes/${v1.id}/edit`, 'question=' + encodeURIComponent(nonce + ' hijacked'));
  ck('a non-proposer POST changes nothing', (await findVote(nonce + ' q1')).question === nonce + ' q1');

  // the proposer fixes the typo — real edit, persisted, marked.
  await post(rc, `/votes/${v1.id}/edit`,
    'question=' + encodeURIComponent(nonce + ' q1 — fixed') + '&description=' + encodeURIComponent('now with context'));
  const edited = await findVote(nonce + ' q1');
  ck('the question text actually changed', edited.question === nonce + ' q1 — fixed', edited.question);
  ck('the description changed too', edited.description === 'now with context', edited.description);
  ck('edited_at is stamped', !!edited.edited_at, edited);
  ck('status stays open — an edit is not a withdrawal', edited.status === 'open');
  page = await (await fetch(b + '/votes', { headers: { Cookie: rc } })).text();
  ck('the page shows the NEW question text', page.includes(nonce + ' q1 — fixed'), 'stale text on screen');
  ck('the page marks it (edited)', /\(edited\)/.test(page.slice(page.indexOf(nonce + ' q1 — fixed'), page.indexOf(nonce + ' q1 — fixed') + 300)));

  // the proposer's OWN ballot never blocks their own edit (same rule as withdraw).
  await post(rc, `/votes/${edited.id}/ballot`, 'choice=yes');
  await post(rc, `/votes/${edited.id}/edit`, 'question=' + encodeURIComponent(nonce + ' q1 — twice'));
  ck('editing still works after the proposer votes for their own idea',
    (await getVoteById(edited.id)).question === nonce + ' q1 — twice');

  // once ANOTHER owner engages, the measure belongs to the electorate.
  await post(rc, '/votes/propose', 'question=' + encodeURIComponent(nonce + ' q2'));
  const v2 = await findVote(nonce + ' q2');
  await post(cc, `/votes/${v2.id}/ballot`, 'choice=no');
  page = await (await fetch(b + '/votes', { headers: { Cookie: rc } })).text();
  ck('the edit form disappears once the league has engaged',
    !page.includes(`/votes/${v2.id}/edit`), 'form still offered');
  await post(rc, `/votes/${v2.id}/edit`, 'question=' + encodeURIComponent(nonce + ' too late'));
  ck('…and a direct POST refuses too (the record stands)',
    (await findVote(nonce + ' q2')).question === nonce + ' q2');

  // an empty question is not a valid edit
  await post(rc, '/votes/propose', 'question=' + encodeURIComponent(nonce + ' q3'));
  const v3 = await findVote(nonce + ' q3');
  await post(rc, `/votes/${v3.id}/edit`, 'question=');
  ck('CONTROL — a blank question does not blank out the measure',
    (await findVote(nonce + ' q3')).question === nonce + ' q3');

  server.close();
  console.log(`\n${pass}/${pass + fail} measure-edit checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
