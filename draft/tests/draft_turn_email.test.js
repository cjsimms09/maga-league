'use strict';
// "YOU'RE UP TO PICK YOUR DRAFT SPOT" — one of exactly three things permitted to
// reach a member's inbox, and the only one with a hard date on it.
//
// It is triggered from TWO places (a member claiming a spot, and the
// commissioner voiding a claim), it was gated off entirely for part of a day
// while the never-email-members rule was in force, and nothing had ever driven
// either route end to end — the only coverage was a direct call to the notify
// function. On the 22nd it either works or nine people wait for a message that
// never comes, and there is no second chance at that.
//
// So: drive the actual routes, watch the wire.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dte-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { setDoc, getDoc } = require(path.join(ROOT, 'src', 'data'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };

const wire = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('resend')) {
    let b = {}; try { b = JSON.parse(opts.body); } catch (e) { /* raw */ }
    wire.push({ to: [].concat(b.to || []).map(a => String(a).toLowerCase()),
                subject: b.subject, html: b.html || '' });
    return { ok: true, status: 200, text: async () => '{}' };
  }
  if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
  return { ok: false, status: 500, text: async () => '' };
};

(async () => {
  process.env.RESEND_API_KEY = 'test-key';
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  active.forEach((o, i) => {
    o.email = `owner${i}@example.com`;
    o.password_hash = hashPassword('pw'); o.must_change_password = false;
  });
  const cory = owners.find(o => o.username === 'cory');
  cory.is_commissioner = true;
  await store.set('owners', owners);

  // `seasons` is an OBJECT keyed by year, not an array — and currentSeason picks
  // the ACTIVE one, so opening the draft on the wrong season would exercise a
  // route that then answers "the draft room is closed" and quietly proves
  // nothing. Use the same selector the route uses.
  const H = require(path.join(ROOT, 'src', 'helpers'));
  const seasons = await store.get('seasons');
  const season = H.currentSeason(seasons);
  seasons[String(season.year)].draft_open = true;
  await store.set('seasons', seasons);
  const YEAR = season.year;

  // The selection order: everyone unslotted, the first two are our actors.
  const A = active[0], B = active[1], C = active[2];
  const mkDoc = () => ({
    year: YEAR,
    order: active.map((o, i) => ({ owner_id: o.id, name: o.name, pos: i + 1, slot: null })),
  });
  await setDoc(`draft:${YEAR}`, mkDoc());

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const loginAs = async o => {
    const r = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(o.username)}&password=pw` });
    return (r.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  };
  const post = async (cookie, url, body) => {
    const r = await fetch(base + url, { method: 'POST', redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body });
    return { status: r.status, location: r.headers.get('location') || '' };
  };

  // ── the member on the clock picks; the NEXT one is told ───────────────────
  const cookA = await loginAs(A);
  {
    wire.length = 0;
    const r = await post(cookA, '/draft/pick', 'slot=4');
    ck('the owner on the clock can claim a spot',
      !/error/.test(r.location), r);
    const doc = await getDoc(`draft:${YEAR}`, null);
    ck('  the claim is recorded', doc && doc.order[0].slot === 4, doc && doc.order[0]);
    ck('  and the NEXT owner is emailed', wire.length === 1, wire);
    ck('  at their own address, nobody else\'s',
      wire.length === 1 && wire[0].to.length === 1 && wire[0].to[0] === B.email.toLowerCase(),
      wire[0] && wire[0].to);
    ck('  the subject says it is their turn',
      /up|turn|pick/i.test(wire[0] ? wire[0].subject : ''), wire[0] && wire[0].subject);
    ck('  and the email links to the draft page',
      /\/draft/.test(wire[0] ? wire[0].html : ''), (wire[0] || {}).subject);
  }

  // ── somebody NOT on the clock cannot trigger it ───────────────────────────
  {
    wire.length = 0;
    const cookC = await loginAs(C);
    const r = await post(cookC, '/draft/pick', 'slot=7');
    ck('an owner who is not on the clock is refused', /error/.test(r.location), r.location);
    ck('  and nobody is emailed about it', wire.length === 0, wire);
  }

  // ── an unavailable slot must not email the next owner either ─────────────
  // The order matters here: the send sits AFTER the validation, and a guard that
  // is merely present is not a guard that runs.
  {
    wire.length = 0;
    const cookB = await loginAs(B);
    const r = await post(cookB, '/draft/pick', 'slot=4');   // already taken
    ck('a taken slot is refused', /error/.test(r.location), r.location);
    ck('  and does not fire an email for a claim that did not happen',
      wire.length === 0, wire);
  }

  // ── THE LAST PICK. Nobody is next, so nobody may be emailed — and it must
  // not throw on the way to finding that out.
  {
    const doc = await getDoc(`draft:${YEAR}`, null);
    doc.order.forEach((p, i) => { p.slot = i + 1; });
    doc.order[doc.order.length - 1].slot = null;   // one left
    await setDoc(`draft:${YEAR}`, doc);
    const last = active[active.length - 1];
    const cookL = await loginAs(last);
    wire.length = 0;
    const r = await post(cookL, '/draft/pick', `slot=${active.length}`);
    ck('the final pick is accepted', !/error/.test(r.location), r.location);
    ck('  and emails nobody, because nobody is next', wire.length === 0, wire);
  }

  // ── THE COMMISSIONER VOIDS A CLAIM: whoever is back on the clock hears ────
  {
    await setDoc(`draft:${YEAR}`, (() => {
      const d = mkDoc();
      d.order[0].slot = 4; d.order[1].slot = 2;
      return d;
    })());
    const cookCory = await loginAs(cory);
    wire.length = 0;
    const r = await post(cookCory, '/admin/draft/claim-fix',
      `owner_id=${B.id}&action=clear&slot=`);
    ck('the commissioner can void a claim', r.status < 400, r);
    const doc = await getDoc(`draft:${YEAR}`, null);
    const cleared = doc.order.find(p => Number(p.owner_id) === Number(B.id));
    ck('  the slot is cleared', cleared && cleared.slot == null, cleared);
    ck('  and the owner put back on the clock is emailed',
      wire.length === 1 && wire[0].to[0] === B.email.toLowerCase(), wire);
  }

  // ── A MEMBER WITH NO ADDRESS ON FILE ─────────────────────────────────────
  // The draft must not stall because one person never gave us an email, and the
  // send must not throw into the page render either.
  {
    const os2 = await store.get('owners');
    const target = os2.find(o => Number(o.id) === Number(B.id));
    delete target.email;
    await store.set('owners', os2);
    await setDoc(`draft:${YEAR}`, mkDoc());
    wire.length = 0;
    const r = await post(cookA, '/draft/pick', 'slot=6');
    ck('a claim still succeeds when the next owner has no email',
      !/error/.test(r.location), r.location);
    ck('  and nothing is sent', wire.length === 0, wire);
    target.email = B.email;
    await store.set('owners', os2);
  }

  // ── AND IT IS A MEMBER EMAIL, ON PURPOSE ─────────────────────────────────
  // The whole point of the policy rewrite: this is one of the three, so it must
  // work for a MEMBER, not merely for the commissioner. The check above already
  // proves that (B is not a commissioner) — this states it so a future reader
  // does not "helpfully" restrict it.
  {
    const os3 = await store.get('owners');
    ck('the owner being emailed is NOT a commissioner',
      !os3.find(o => Number(o.id) === Number(B.id)).is_commissioner);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
