// TERRITORY: A
'use strict';
// THE VOTING BOOTH's new contract (Cory, 2026-08-16): "a way to change or
// recend your vote" + "see how everyone voted for everyone". Real-app HTTP:
// cast → change (overwrite, never a second ballot) → roll call names every
// voter and the holdouts → rescind returns you to not-voted (which is NOT a
// "no") → a closed measure refuses the rescind (the record is a record) →
// the punishment wall names its backers and honors the same withdraw.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'votes-'));
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
  const other = owners.find(o => o.active && o.id !== cory.id);
  for (const o of [cory, other]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));
  const coryC = await login('cory');
  const otherC = await login(other.username);
  const post = (url, cookie, body) => fetch(b + url, { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body || '', redirect: 'manual' });
  const page = async cookie => (await fetch(b + '/votes', { headers: { Cookie: cookie } })).text();

  // A measure on the ballot.
  await post('/votes/propose', coryC, 'question=Test+measure%3F&description=x');
  const voteId = (await store.listKeys('vote:')).map(k => k.split(':')[1])[0];
  ck('the measure exists', !!voteId, voteId);

  // Cast YES, then CHANGE to NO — one ballot doc, overwritten.
  await post(`/votes/${voteId}/ballot`, coryC, 'choice=yes');
  await post(`/votes/${voteId}/ballot`, coryC, 'choice=no');
  const ballots1 = await store.listKeys(`ballot:${voteId}:`);
  ck('changing a vote overwrites — exactly one ballot doc for the voter', ballots1.length === 1, ballots1);
  ck('and the ballot now says NO', (await store.get(ballots1[0])).choice === 'no');

  // The roll call names the voter under NO, and the holdouts by name.
  await post(`/votes/${voteId}/ballot`, otherC, 'choice=yes');
  let html = await page(coryC);
  ck('the roll call names the NO voter', new RegExp('NO \\(1\\):[\\s\\S]{0,200}' + cory.name).test(html), 'no-name missing');
  ck('the roll call names the YES voter', new RegExp('YES \\(1\\):[\\s\\S]{0,200}' + other.name).test(html));
  const third = owners.find(o => o.active && o.id !== cory.id && o.id !== other.id);
  ck('the holdouts are named under Yet to vote', new RegExp('Yet to vote[\\s\\S]{0,300}' + third.name).test(html));

  // RESCIND: back to not-voted — the ballot is GONE, not flipped.
  const r = await post(`/votes/${voteId}/rescind`, coryC);
  ck('rescind redirects back to the measure', /votes#vote-/.test(r.headers.get('location') || ''), r.headers.get('location'));
  ck('the ballot doc is deleted — not-voted, which is not a NO',
    (await store.listKeys(`ballot:${voteId}:`)).length === 1);   // only other's remains
  html = await page(coryC);
  ck('the page shows the rescinder back among the holdouts',
    new RegExp('Yet to vote[\\s\\S]{0,300}' + cory.name).test(html));
  ck('and the withdraw button is gone with the ballot', !/Withdraw my vote/.test(html));

  // A CLOSED measure refuses the rescind — the record is a record.
  const vdoc = await store.get(`vote:${voteId}`);
  vdoc.status = 'closed'; vdoc.closed_at = new Date().toISOString();
  await store.set(`vote:${voteId}`, vdoc);
  await post(`/votes/${voteId}/rescind`, otherC);
  ck('rescind on a closed measure is refused — the ballot survives',
    (await store.listKeys(`ballot:${voteId}:`)).length === 1);
  html = await page(coryC);
  ck('a closed measure still shows the full roll call, abstainers named',
    new RegExp('YES \\(1\\):[\\s\\S]{0,200}' + other.name).test(html) && /Abstained \(/.test(html));

  // ── The punishment wall: backers named, vote withdrawable until lock. ──
  await post('/punishments', coryC, 'text=Last+place+sings+the+anthem');
  const pid = (await store.listKeys('punish:')).map(k => k.split(':')[1])[0];
  await post(`/punishments/${pid}/vote`, coryC);
  html = await page(otherC);
  ck('the punishment idea names its backer', new RegExp('backed by:[\\s\\S]{0,120}' + cory.name).test(html));
  await post('/punishments/rescind', coryC);
  ck('the punishment vote withdraws cleanly', (await store.listKeys('pvote:')).length === 0);
  html = await page(otherC);
  ck('and the backer line is gone from the page', !/backed by:/.test(html));
  ck('no template error anywhere in the flow', !/ReferenceError|Cannot read|is not defined/.test(html));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
