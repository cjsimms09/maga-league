/* CHAT EDIT/DELETE (5-minute window) + REPLY-TO (redesign catalog 12+13,
 * 2026-08-24) — real app, real routes, nonce-keyed messages.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'chatedit-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };
const nonce = 'chat-' + Date.now();

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);
  const rich = owners.find(o => o.username === 'richard');

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
  const findMsg = async text => {
    const keys = await store.listKeys('chat:');
    const docs = await store.getMany(keys);
    const i = docs.findIndex(d => d && d.text === text);
    return i >= 0 ? { key: keys[i], id: keys[i].slice(5), doc: docs[i] } : null;
  };

  // ── edit within the window ──────────────────────────────────────────────
  await post(rc, '/chat', 'text=' + encodeURIComponent(nonce + ' typo mesage'));
  const m1 = await findMsg(nonce + ' typo mesage');
  ck('the message landed', !!m1, m1);
  await post(rc, `/chat/${m1.id}/edit`, 'text=' + encodeURIComponent(nonce + ' fixed message'));
  const m1b = await store.get(m1.key);
  ck('the author edits within five minutes', m1b.text === nonce + ' fixed message'
    && !!m1b.edited_at, m1b);
  let page = await (await fetch(b + '/chat', { headers: { Cookie: cc } })).text();
  ck('…and the page marks it (edited)', page.includes(nonce + ' fixed message')
    && /\(edited\)/.test(page), 'edited marker missing');

  // ── another owner cannot touch it ───────────────────────────────────────
  await post(cc, `/chat/${m1.id}/edit`, 'text=' + encodeURIComponent('hijacked'));
  ck('another owner\'s edit is a no-op', (await store.get(m1.key)).text === nonce + ' fixed message');
  await post(cc, `/chat/${m1.id}/delete`);
  ck('another owner\'s delete is a no-op', !!(await store.get(m1.key)));

  // ── the window closes ───────────────────────────────────────────────────
  const oldDoc = { owner_id: rich.id, text: nonce + ' ancient take',
    created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() };
  await store.set('chat:oldmsg' + Date.now().toString(36), oldDoc);
  const old = await findMsg(nonce + ' ancient take');
  await post(rc, `/chat/${old.id}/edit`, 'text=' + encodeURIComponent('rewritten history'));
  ck('after five minutes the record stands (edit refused)',
    (await store.get(old.key)).text === nonce + ' ancient take');
  await post(rc, `/chat/${old.id}/delete`);
  ck('…and delete refuses too', !!(await store.get(old.key)));
  page = await (await fetch(b + '/chat', { headers: { Cookie: rc } })).text();
  ck('the page offers no edit form on the aged message',
    !page.includes(`/chat/${old.id}/edit`), 'stale edit form offered');

  // ── delete within the window ────────────────────────────────────────────
  await post(rc, '/chat', 'text=' + encodeURIComponent(nonce + ' regret'));
  const m2 = await findMsg(nonce + ' regret');
  await post(rc, `/chat/${m2.id}/delete`);
  ck('the author takes a fresh message back', !(await store.get(m2.key)));

  // ── reply-to, with the snapshot surviving deletion ──────────────────────
  await post(cc, '/chat', 'text=' + encodeURIComponent(nonce + ' bold claim'));
  const m3 = await findMsg(nonce + ' bold claim');
  page = await (await fetch(b + `/chat?reply=${m3.id}`, { headers: { Cookie: rc } })).text();
  ck('the composer quotes the message being answered',
    /Replying to <b>Cory<\/b>/.test(page) && page.includes(nonce + ' bold claim'), 'no reply banner');
  await post(rc, '/chat', 'reply_key=' + m3.id + '&text=' + encodeURIComponent(nonce + ' comeback'));
  const m4 = await findMsg(nonce + ' comeback');
  ck('the reply stores a snapshot of the quote',
    m4.doc.reply && m4.doc.reply.name === 'Cory'
    && m4.doc.reply.text.includes(nonce + ' bold claim'), m4.doc.reply);
  await post(cc, `/chat/${m3.id}/delete`);   // cory takes the original back
  page = await (await fetch(b + '/chat', { headers: { Cookie: rc } })).text();
  ck('the quote SURVIVES the original\'s deletion (snapshot, not pointer)',
    page.includes(nonce + ' comeback') && page.includes(nonce + ' bold claim'), 'quote lost');

  server.close();
  console.log(`\n${pass}/${pass + fail} chat edit/reply checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
