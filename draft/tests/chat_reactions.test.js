/* CHAT REACTIONS (site review 2026-09-02, item ⑥, catalog 13's other half —
 * edit/delete/reply already shipped): 🔥 💀 🤡, one tap toggles the acting
 * owner's own reaction on any message, including their own. Real app, real
 * routes, nonce-keyed messages.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'chatreact-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };
const nonce = 'react-' + Date.now();

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);
  const rich = owners.find(o => o.username === 'richard');
  const cory = owners.find(o => o.username === 'cory');

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw`, redirect: 'manual' }));
  const rc = await login('richard'), cc = await login('cory');
  const post = (ckie, url, body) => fetch(b + url, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ckie },
    body: body || '', redirect: 'manual' });
  const findMsg = async text => {
    const keys = await store.listKeys('chat:');
    const docs = await store.getMany(keys);
    const i = docs.findIndex(d => d && d.text === text);
    return i >= 0 ? { key: keys[i], id: keys[i].slice(5), doc: docs[i] } : null;
  };
  const getPage = async ckie => (await fetch(b + '/chat', { headers: { Cookie: ckie } })).text();

  await post(rc, '/chat', 'text=' + encodeURIComponent(nonce + ' a real message'));
  const m1 = await findMsg(nonce + ' a real message');
  ck('the message landed', !!m1, m1);

  // ── react, toggle on ────────────────────────────────────────────────────
  await post(cc, `/chat/${m1.id}/react`, 'emoji=' + encodeURIComponent('🔥'));
  let doc = await store.get(m1.key);
  ck('the reaction is recorded under the emoji key', doc.reactions && doc.reactions['🔥'] && doc.reactions['🔥'].includes(cory.id), doc.reactions);

  // ── same owner, same emoji again: toggles OFF ──────────────────────────
  await post(cc, `/chat/${m1.id}/react`, 'emoji=' + encodeURIComponent('🔥'));
  doc = await store.get(m1.key);
  ck('a second tap by the same owner on the same emoji removes it', !doc.reactions['🔥'].includes(cory.id), doc.reactions);

  // ── two owners, same emoji: both count ──────────────────────────────────
  await post(cc, `/chat/${m1.id}/react`, 'emoji=' + encodeURIComponent('🔥'));
  await post(rc, `/chat/${m1.id}/react`, 'emoji=' + encodeURIComponent('🔥'));
  doc = await store.get(m1.key);
  ck('two different owners both land in the same emoji\'s list', doc.reactions['🔥'].length === 2
    && doc.reactions['🔥'].includes(cory.id) && doc.reactions['🔥'].includes(rich.id), doc.reactions);

  // ── the SAME owner can stack multiple different emoji on one message ────
  await post(cc, `/chat/${m1.id}/react`, 'emoji=' + encodeURIComponent('💀'));
  doc = await store.get(m1.key);
  ck('one owner can react with a SECOND, different emoji on the same message (not exclusive)',
    doc.reactions['🔥'].includes(cory.id) && doc.reactions['💀'].includes(cory.id), doc.reactions);

  // CONTROL: reacting to your OWN message is allowed (not refused).
  await post(rc, '/chat', 'text=' + encodeURIComponent(nonce + ' self-reaction fixture'));
  const m2 = await findMsg(nonce + ' self-reaction fixture');
  await post(rc, `/chat/${m2.id}/react`, 'emoji=' + encodeURIComponent('🤡'));
  const doc2 = await store.get(m2.key);
  ck('CONTROL — reacting to your OWN message is allowed', doc2.reactions && doc2.reactions['🤡'].includes(rich.id), doc2.reactions);

  // CONTROL: an emoji outside the fixed set of three is refused (no arbitrary write).
  await post(cc, `/chat/${m1.id}/react`, 'emoji=' + encodeURIComponent('💩'));
  doc = await store.get(m1.key);
  ck('CONTROL — an emoji outside the fixed set is refused, not silently recorded',
    !doc.reactions['💩'], doc.reactions);

  // CONTROL: reacting to a message id that does not exist does not crash and writes nothing new.
  const badRes = await post(cc, '/chat/doesnotexist12345/react', 'emoji=' + encodeURIComponent('🔥'));
  ck('CONTROL — a nonexistent message id is refused cleanly (redirect, not a 500)',
    badRes.status >= 200 && badRes.status < 400, badRes.status);

  // ── the page actually renders the counts and the toggle state ───────────
  const html = await getPage(rc);
  // Anchor on the reactions block itself (the action URL is unique to this
  // message), not the message text -- Richard's own message also carries an
  // edit form with the same text in a `value="..."` attribute earlier on the
  // page, which is not what this assertion is about.
  const idx = html.indexOf(`/chat/${m1.id}/react`);
  const near = html.slice(idx, idx + 800);
  ck('the rendered page shows the 🔥 reaction with its count (2)',
    /🔥[\s\S]{0,20}<span class="chat-react-n">2<\/span>/.test(near), near.slice(0, 300));
  ck('richard (who reacted) sees his own 🔥 button marked "mine"',
    /class="chat-react mine"[^>]*title="🔥"/.test(near), near.slice(0, 300));

  server.close();
  console.log(`\n${pass}/${pass + fail} chat-reactions checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
