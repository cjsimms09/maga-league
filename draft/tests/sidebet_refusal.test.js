'use strict';
// A REFUSED SIDE BET MUST SAY SO.
//
// POST /sidebets guarded with a single silent `if`: fail it and control fell
// through to a bare `res.redirect('/bank?section=sidebets')` — no bet, no error,
// no reason. The catch around SB.propose did the same for anything it threw, on
// the reasoning that "the form enforces it too", which is exactly backwards: a
// client-side `required` is not a guarantee, and the one time it doesn't hold is
// the one time you need to be told.
//
// A bet that silently does not exist is worse than an error, because the
// proposer believes it is live until the week it should have paid.
//
// Found by driving the builder as a MEMBER (not the commissioner) in a browser:
// the form submitted, the page came back clean, and no bet was ever written.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sbfail-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const mem = owners.find(o => o.active && o.username && o.username !== 'cory');
  mem.password_hash = hashPassword('pw'); mem.must_change_password = false; mem.is_commissioner = false;
  await store.set('owners', owners);
  const other = owners.find(o => o.active && o.id !== mem.id);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `username=${mem.username}&password=pw` });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');

  const propose = async body => {
    const r = await fetch(base + '/sidebets', { method: 'POST', redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString() });
    return r.headers.get('location') || '';
  };
  const betCount = async () => (await store.listKeys('sidebet')).length;
  const pageAt = async loc => (await fetch(base + loc, { headers: { cookie } })).text();

  // ── Each way of getting it wrong must name ITSELF, not just fail.
  const cases = [
    ['no stake', { party: String(other.id), terms: 'I win the week', format: 'prop' }, /no stake/i],
    ['zero stake', { party: String(other.id), terms: 'I win the week', stake: '0', format: 'prop' }, /more than \$0/i],
    // NB: the apostrophe arrives HTML-escaped (&#39;) because the banner is
    // rendered as text — see the injection check at the bottom.
    ['nobody on the other side', { terms: 'I win the week', stake: '20', format: 'prop' }, /Nobody(&#39;|')s on the other side/i],
  ];
  for (const [name, body, re] of cases) {
    const before = await betCount();
    const loc = await propose(body);
    const after = await betCount();
    ck(`${name}: no bet is written`, after === before, { before, after });
    ck(`  and the redirect carries a reason`, /betfail=/.test(loc), loc);
    const html = await pageAt(loc);
    ck(`  and the page SAYS why`, re.test(html) && /wasn't created/.test(html),
      (html.match(/That bet wasn't created[\s\S]{0,200}/) || ['(no banner)'])[0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
  }

  // ── A VALID proposal still works, still writes, and shows NO failure banner.
  {
    const before = await betCount();
    const loc = await propose({ party: String(other.id), terms: 'I outscore you in week 3',
      stake: '25', format: 'prop', resolves: 'week 3 final scores' });
    const after = await betCount();
    ck('a valid bet is still created', after === before + 1, { before, after });
    ck('  and its redirect carries no failure flag', !/betfail=/.test(loc), loc);
    const html = await pageAt(loc);
    ck('  and the page shows no failure banner', !/That bet wasn't created/.test(html));
    ck('  and the bet itself is on the page', /I outscore you in week 3/.test(html));
  }

  // ── The matchup entry point is the same handler and must carry it too — a rule
  // enforced at one door and not the other is not enforced.
  {
    const loc = await propose({ back: 'matchup', party: String(other.id), terms: 'x', stake: '0', format: 'prop' });
    ck('the matchup entry point carries the reason as well', /betfail=/.test(loc), loc);
    // It used to redirect to "?sent=1" — rendering "✅ Bet sent" for a bet that
    // was never written. A false confirmation is worse than silence.
    ck('  and does NOT claim the bet was sent', !/sent=1/.test(loc), loc);
    const mh = await pageAt(loc);
    ck('  the matchup page shows the reason, not a success banner',
      /That bet wasn't created/.test(mh) && !/Bet sent/.test(mh),
      (mh.match(/(That bet wasn't created|Bet sent)[\s\S]{0,120}/) || ['(neither)'])[0].replace(/<[^>]*>/g, ' ').slice(0, 160));
  }

  // ── The message must never be silence, even for a code we do not recognise.
  {
    const html = await pageAt('/bank?section=sidebets&betfail=' + encodeURIComponent('some-new-code'));
    ck('an unrecognised refusal still says something rather than nothing',
      /That bet wasn't created/.test(html) && /some-new-code/.test(html));
  }

  // ── And it is rendered as TEXT. The reason can carry an exception message, so
  // it must not be able to inject markup.
  {
    const html = await pageAt('/bank?section=sidebets&betfail=' + encodeURIComponent('rejected:<img src=x onerror=alert(1)>'));
    ck('the reason is escaped, never rendered as markup',
      !/<img src=x/.test(html) && /&lt;img/.test(html),
      (html.match(/That bet wasn't created[\s\S]{0,160}/) || [''])[0].slice(0, 160));
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
