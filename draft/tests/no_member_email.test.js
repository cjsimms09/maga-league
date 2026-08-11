'use strict';
// THE SITE NEVER EMAILS MEMBERS.
//
// Standing rule (Cory, 2026-08-11). Six paths already emailed the other nine
// owners — alertPosted and newVote to EVERY owner, moneySettled and draftTurn
// and passwordReset to the individual, sideBetProposed to the named parties —
// and the seventh would have been added by whoever built the next feature.
//
// So the rule is not enforced at the call sites. It is enforced at the single
// door every message passes through (notify.sendMail), and this test drives the
// PUBLIC entry points — the functions a feature actually calls — rather than the
// door, because a guard tested only through its own front door does not tell you
// whether anything still walks around it.
//
// What is asserted, in one sentence: no address that is not an active
// commissioner's may reach the wire, by any path, ever.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nme-'));
process.env.RESEND_API_KEY = 'test-key';   // the mailer must be LIVE, or this proves nothing
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const notify = require(path.join(ROOT, 'src', 'notify'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };

// A named failure instead of a bare TypeError. A missing export used to throw
// out of the whole file and print NOTHING, hiding every check after it.
const need = (obj, name, what) => {
  if (obj && typeof obj[name] === 'function') return obj[name];
  ck(`${what} exists`, false, `notify.${name} is not exported`);
  return async () => ({ skipped: true, reason: 'missing-export' });
};

const COMMISH = { id: 1, name: 'Cory', username: 'cory', email: 'Cory@Example.com',
  active: true, is_commissioner: true };
const MEMBERS = [
  { id: 2, name: 'Richard', username: 'richard', email: 'richard@example.com', active: true },
  { id: 3, name: 'David', username: 'david', email: 'david@example.com', active: true },
  // An INACTIVE former commissioner: the flag alone must not buy a seat.
  { id: 4, name: 'Ghost', username: 'ghost', email: 'ghost@example.com', active: false, is_commissioner: true },
];
const ALL = [COMMISH, ...MEMBERS];

// Every address that must never appear on the wire, in the casing a caller
// would actually pass.
const FORBIDDEN = ['richard@example.com', 'david@example.com', 'ghost@example.com'];

// The wire. Anything that gets this far WOULD have been delivered.
const wire = [];
global.fetch = async (url, opts) => {
  let body = {}; try { body = JSON.parse(opts.body); } catch (e) { /* record it raw */ }
  wire.push({ url: String(url), to: [].concat(body.to || []).map(a => String(a).toLowerCase()) });
  return { ok: true, status: 200, text: async () => '{}' };
};

(async () => {
  await store.set('owners', ALL);

  // ── the door itself ────────────────────────────────────────────────────────
  const send = need(notify, 'sendMail', 'the mailer');
  const cases = [
    ['to the commissioner', [COMMISH.email], true],
    ['to the commissioner in another casing', ['cory@example.com'], true],
    ['to a member', [MEMBERS[0].email], false],
    ['to BOTH — the whole send must be refused', [COMMISH.email, MEMBERS[0].email], false],
    ['to an address on no roster', ['stranger@example.com'], false],
    ['to an INACTIVE ex-commissioner', [MEMBERS[2].email], false],
  ];
  for (const [label, to, expectSent] of cases) {
    wire.length = 0;
    const r = await send({ to, subject: 's', html: 'h' });
    const went = wire.length > 0;
    ck(`sendMail ${label} — ${expectSent ? 'sends' : 'refuses'}`, went === expectSent,
      { result: r, wire });
    if (!expectSent) {
      ck('  ...and names WHY it refused', r && r.reason === 'recipient-not-commissioner', r);
    }
  }

  // ── every public notification, driven the way a feature calls it ────────────
  // This is the half that matters. A caller does not invoke sendMail; it invokes
  // one of these.
  wire.length = 0;
  const bet = { id: 'b1', proposer_id: MEMBERS[0].id, stake: 25, resolves: 'week 7',
    parties: [{ owner_id: MEMBERS[0].id }, { owner_id: COMMISH.id }, { owner_id: MEMBERS[1].id }] };
  const vote = { id: 'v1', question: 'Move to 12 teams?', description: '', proposer_id: MEMBERS[0].id };

  const drives = [
    ['draftTurn to a member', () => need(notify, 'draftTurn', 'the draft-turn notice')(MEMBERS[0])],
    ['moneySettled to a member', () => need(notify, 'moneySettled', 'the settlement notice')(MEMBERS[0], { amount: 40, desc: 'Week 3' })],
    ['newVote to every owner', () => need(notify, 'newVote', 'the ballot notice')(ALL, vote, 'Richard')],
    ['alertPosted to every owner', () => need(notify, 'alertPosted', 'the announcement')(ALL, 'Draft moved', 'urgent')],
    ['sideBetProposed to the named parties', () => need(notify, 'sideBetProposed', 'the side-bet notice')(ALL, bet, 'Richard', 'Bills over 10.5')],
    ['passwordReset to a member', () => need(notify, 'passwordReset', 'the reset link')(MEMBERS[0], 'tok123')],
    ['sundayAlert to a member', () => need(notify, 'sundayAlert', 'the Sunday alert')(MEMBERS[0], { week: 7, hasCalls: false, headline: 'Nothing to change', edge: 0 })],
  ];
  for (const [label, run] of drives) {
    const before = wire.length;
    await run();
    const leaked = wire.slice(before).flatMap(w => w.to).filter(a => FORBIDDEN.includes(a));
    ck(`${label} reaches no member`, leaked.length === 0, leaked);
  }

  // ── the ones the commissioner SHOULD still get ─────────────────────────────
  // A rule that silences everything is easy to pass and useless: if the
  // commissioner's own alert stopped arriving, the checks above would still be
  // green. So prove the wire is not simply dead.
  {
    const before = wire.length;
    await need(notify, 'sundayAlert', 'the Sunday alert')(COMMISH,
      { week: 7, hasCalls: false, headline: 'Nothing to change', edge: 0 });
    ck('the commissioner still gets his Sunday alert', wire.length > before, wire.slice(before));
  }
  {
    const before = wire.length;
    await need(notify, 'alertPosted', 'the announcement')([COMMISH], 'Draft moved', 'urgent');
    ck('  and an urgent announcement addressed only to him', wire.length > before, wire.slice(before));
  }

  // ── the whole run, checked once more from the transcript ───────────────────
  const everyone = [...new Set(wire.flatMap(w => w.to))];
  ck('across the ENTIRE run, no member address ever hit the wire',
    !everyone.some(a => FORBIDDEN.includes(a)), everyone);
  ck('  and every address that did was the commissioner',
    everyone.length > 0 && everyone.every(a => a === 'cory@example.com'), everyone);

  // ── mayEmail: the question asked BEFORE work is done ────────────────────────
  // /forgot mints a reset token and promises a link. It must ask the same rule
  // the mailer enforces, not a second copy of it that can drift.
  const may = need(notify, 'mayEmail', 'the advance check');
  ck('mayEmail says yes to the commissioner', (await may(COMMISH.email)) === true);
  ck('mayEmail says no to a member', (await may(MEMBERS[0].email)) === false);
  ck('mayEmail says no to nothing at all', (await may('')) === false);
  ck('mayEmail agrees with sendMail on every case above', await (async () => {
    for (const [, to, expectSent] of cases) {
      if (to.length !== 1) continue;
      if ((await may(to[0])) !== expectSent) return false;
    }
    return true;
  })());

  // ── which way it fails when the roster is unreadable ───────────────────────
  // If the owners doc is missing, empty, or nobody carries the flag, the
  // allowlist is empty. An empty allowlist must mean "email NOBODY", never
  // "the check found nothing to object to". Fail closed.
  for (const [label, roster] of [['the owners doc is empty', []],
                                 ['the owners doc is missing', null],
                                 ['no owner carries the commissioner flag',
                                   ALL.map(o => ({ ...o, is_commissioner: false }))]]) {
    await store.set('owners', roster);
    wire.length = 0;
    const r = await send({ to: [COMMISH.email], subject: 's', html: 'h' });
    ck(`fails CLOSED when ${label}`, wire.length === 0 && r && r.skipped === true, { result: r, wire });
  }
  await store.set('owners', ALL);

  // ── /forgot must not promise a link it will not send ───────────────────────
  const route = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'member.js'), 'utf8');
  const forgot = route.slice(route.indexOf("router.post('/forgot'"), route.indexOf("router.get('/reset'"));
  ck('/forgot gates on the mailer, not on its own idea of who may be emailed',
    /notify\.mayEmail\(/.test(forgot), forgot.slice(0, 400));
  ck('  and does not re-derive is_commissioner for itself',
    !/is_commissioner/.test(forgot), forgot.slice(0, 400));
  const view = fs.readFileSync(path.join(ROOT, 'views', 'forgot.ejs'), 'utf8');
  ck('  the confirmation no longer states a link IS on its way unconditionally',
    !/a reset link is on its way/i.test(view), (view.match(/.{0,60}on its way.{0,60}/i) || [''])[0]);
  ck('  and it tells a member what to do instead',
    /text\s+cory/i.test(view.replace(/<[^>]+>/g, ' ')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
