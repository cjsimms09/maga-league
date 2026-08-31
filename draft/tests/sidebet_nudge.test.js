/* THE NUDGE (redesign catalog 5, 2026-08-24) — a public Locker Room callout,
 * once per bet per day. Real app, real routes, nonce-keyed.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'nudge-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };
const nonce = 'nudge-' + Date.now();

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);
  const cory = owners.find(o => o.username === 'cory');
  const rich = owners.find(o => o.username === 'richard');

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw`, redirect: 'manual' }));
  const cc = await login('cory'), rc = await login('richard');
  const post = (ck2, url) => fetch(b + url, { method: 'POST',
    headers: { Cookie: ck2 }, redirect: 'manual' });
  const chatTexts = async () => {
    const keys = await store.listKeys('chat:');
    return (await store.getMany(keys)).filter(Boolean).map(m => m.text);
  };

  const bet = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id],
    stake: 35, terms: nonce + ' the offer', resolves: 'week 5' });

  // the proposer's pending card offers the nudge
  let page = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: cc } })).text();
  ck('the proposer sees the Nudge button', page.includes(`/sidebets/${bet.id}/nudge`), 'no button');

  // nudge → public callout with names, terms, stake
  await post(cc, `/sidebets/${bet.id}/nudge`);
  let texts = await chatTexts();
  const call = texts.find(t => t.includes(nonce + ' the offer'));
  ck('the nudge lands in the Locker Room', !!call, texts.slice(-3));
  ck('…naming who is waiting on whom, with the stake',
    /Cory is waiting on Richard/.test(call) && /\$35/.test(call), call);
  const after = await SB.get(bet.id);
  ck('…stamped on the bet with an audit row', !!after.nudged_at
    && after.audit.some(a => /Nudged Richard/.test(a.what || '')), after.nudged_at);

  // the cooldown: second nudge same day is a no-op, button becomes the timer
  await post(cc, `/sidebets/${bet.id}/nudge`);
  texts = await chatTexts();
  ck('a same-day second nudge posts NOTHING (one per day per bet)',
    texts.filter(t => t.includes(nonce + ' the offer')).length === 1, texts.length);
  page = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: cc } })).text();
  ck('…and the card shows the cooldown instead of the button',
    /nudged (just now|\d+h ago)/.test(page) && !page.includes(`action="/sidebets/${bet.id}/nudge"`),
    'cooldown text or button state wrong');

  // the recipient never gets the button; their POST is a no-op
  page = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: rc } })).text();
  ck('the recipient has no nudge button on the needs-you card',
    !page.includes(`/sidebets/${bet.id}/nudge`), 'button leaked to recipient');
  const stamp = (await SB.get(bet.id)).nudged_at;
  await post(rc, `/sidebets/${bet.id}/nudge`);
  ck('a non-proposer POST changes nothing', (await SB.get(bet.id)).nudged_at === stamp);

  // a day later the button returns (backdate the stamp)
  const doc = await store.get(`sidebet:${bet.id}`);
  doc.nudged_at = new Date(Date.now() - 25 * 3600000).toISOString();
  await store.set(`sidebet:${bet.id}`, doc);
  await post(cc, `/sidebets/${bet.id}/nudge`);
  texts = await chatTexts();
  ck('after 24h a fresh nudge posts again',
    texts.filter(t => t.includes(nonce + ' the offer')).length === 2, texts.length);

  server.close();
  console.log(`\n${pass}/${pass + fail} nudge checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
