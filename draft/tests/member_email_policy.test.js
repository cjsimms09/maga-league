'use strict';
// EXACTLY THREE THINGS MAY REACH A MEMBER'S INBOX.
//
// Policy, Cory 2026-08-11: password resets, the weekly recap, and "you're up to
// pick your draft spot". Nothing else — not lineup alerts, not waiver reminders,
// not settlement notices, not vote notifications, not anything built later.
//
// Two halves, and the second is the one that keeps this true a year from now:
//
//  1. FOUR CAPABILITIES WERE REMOVED, NOT GATED. `moneySettled`, `newVote`,
//     `alertPosted` and `sideBetProposed` no longer exist. A gated capability is
//     one edit away from being a capability again; a deleted one has to be
//     rewritten, which is a conversation.
//
//  2. THE DEFAULT IS COMMISSIONER-ONLY. Enforcement is on the message KIND, not
//     on a recipient list, so a feature that calls sendMail without thinking
//     about any of this inherits the restriction instead of having to be told.
//     That is the case actually tested below — the seventh notification nobody
//     has written yet.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mep-'));
process.env.RESEND_API_KEY = 'test-key';   // the mailer must be LIVE or this proves nothing
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const notify = require(path.join(ROOT, 'src', 'notify'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };
// A named failure instead of a bare TypeError — a missing export used to throw
// out of the file and print nothing, hiding every check after it.
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
  { id: 4, name: 'Ghost', username: 'ghost', email: 'ghost@example.com', active: false },
];
const ALL = [COMMISH, ...MEMBERS];
const MEMBER_ADDRS = ['richard@example.com', 'david@example.com'];

const wire = [];
global.fetch = async (url, opts) => {
  let body = {}; try { body = JSON.parse(opts.body); } catch (e) { /* raw */ }
  wire.push({ to: [].concat(body.to || []).map(a => String(a).toLowerCase()), subject: body.subject });
  return { ok: true, status: 200, text: async () => '{}' };
};

(async () => {
  await store.set('owners', ALL);
  const send = need(notify, 'sendMail', 'the mailer');

  // ── the three permitted kinds reach the league ─────────────────────────────
  for (const kind of ['password-reset', 'weekly-recap', 'draft-turn']) {
    wire.length = 0;
    const r = await send({ kind, to: [MEMBERS[0].email], subject: 's', html: 'h' });
    ck(`"${kind}" reaches a member`, wire.length === 1, { result: r, wire });
  }

  // ── EVERYTHING ELSE DOES NOT, including the kinds nobody has invented yet ──
  const forbidden = ['lineup-alert', 'waiver-reminder', 'money-settled', 'new-vote',
    'trade-offer', 'side-bet', 'league-announcement', 'some-feature-from-2027', undefined, '', null];
  for (const kind of forbidden) {
    wire.length = 0;
    const r = await send({ kind, to: [MEMBERS[0].email], subject: 's', html: 'h' });
    ck(`"${kind === undefined ? 'no kind at all' : kind || '(empty)'}" does NOT reach a member`,
      wire.length === 0 && r && r.reason === 'recipient-not-permitted', { result: r, wire });
  }
  // The default is the point. A caller who declares nothing gets the restriction.
  {
    wire.length = 0;
    const r = await send({ to: [COMMISH.email], subject: 's', html: 'h' });
    ck('an unclassified message still reaches the COMMISSIONER', wire.length === 1, { result: r, wire });
  }

  // ── a permitted kind to a mixed list refuses the WHOLE send ───────────────
  {
    wire.length = 0;
    const r = await send({ kind: 'lineup-alert', to: [COMMISH.email, MEMBERS[0].email], subject: 's', html: 'h' });
    ck('a commissioner-only kind sent to both refuses entirely — no partial send',
      wire.length === 0 && r.reason === 'recipient-not-permitted', { result: r, wire });
  }

  // ── who counts as a member ────────────────────────────────────────────────
  {
    wire.length = 0;
    await send({ kind: 'weekly-recap', to: [MEMBERS[2].email], subject: 's', html: 'h' });
    ck('an INACTIVE owner gets nothing, even a permitted kind', wire.length === 0, wire);
    wire.length = 0;
    await send({ kind: 'weekly-recap', to: ['stranger@example.com'], subject: 's', html: 'h' });
    ck('an address on no roster gets nothing', wire.length === 0, wire);
  }

  // ── THE FOUR REMOVED CAPABILITIES ARE GONE, not merely blocked ────────────
  for (const gone of ['moneySettled', 'newVote', 'alertPosted', 'sideBetProposed']) {
    ck(`notify.${gone} no longer exists`, notify[gone] === undefined, typeof notify[gone]);
  }
  {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'notify.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ck('  and no definition of them survives in the file',
      !/function (moneySettled|newVote|alertPosted|sideBetProposed)\b/.test(src));
    for (const f of ['src/routes/member.js', 'src/routes/admin.js']) {
      const r = fs.readFileSync(path.join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      ck(`  and ${f} no longer calls any of them`,
        !/notify\.(moneySettled|newVote|alertPosted|sideBetProposed)\b/.test(r));
    }
  }

  // ── the public entry points, driven the way a feature calls them ──────────
  wire.length = 0;
  await need(notify, 'draftTurn', 'the draft-turn notice')(MEMBERS[0]);
  ck('draftTurn DOES reach a member — it is one of the three',
    wire.some(w => w.to.includes(MEMBERS[0].email)), wire);

  wire.length = 0;
  await need(notify, 'passwordReset', 'the reset link')(MEMBERS[0], 'tok');
  ck('passwordReset DOES reach a member', wire.length === 1, wire);

  wire.length = 0;
  await need(notify, 'weeklyRecap', 'the weekly recap')(ALL,
    { ready: true, week: 7, subject: 'Week 7', sections: [{ h: null, lines: ['A line.'] }] });
  ck('weeklyRecap goes to every ACTIVE owner with an address',
    wire.length === 1 && wire[0].to.length === 3
    && MEMBER_ADDRS.every(a => wire[0].to.includes(a)), wire);
  ck('  and not to the inactive one', !wire[0].to.includes('ghost@example.com'), wire[0].to);

  wire.length = 0;
  await need(notify, 'sundayAlert', 'the Sunday alert')(MEMBERS[0],
    { week: 7, hasCalls: false, headline: 'x', edge: 0 });
  ck('the SUNDAY ALERT still reaches no member — it is not one of the three',
    wire.length === 0, wire);
  wire.length = 0;
  await need(notify, 'sundayAlert', 'the Sunday alert')(COMMISH,
    { week: 7, hasCalls: false, headline: 'x', edge: 0 });
  ck('  and still reaches the commissioner, so this is not just silence',
    wire.length === 1, wire);

  // ── fail CLOSED when the roster is unreadable ─────────────────────────────
  for (const [label, roster] of [['empty', []], ['missing', null]]) {
    await store.set('owners', roster);
    wire.length = 0;
    const r = await send({ kind: 'weekly-recap', to: [COMMISH.email], subject: 's', html: 'h' });
    ck(`fails CLOSED when the owners doc is ${label}`, wire.length === 0 && r.skipped === true, r);
  }
  await store.set('owners', ALL);

  // ── mayEmail agrees with sendMail, per kind ──────────────────────────────
  const may = need(notify, 'mayEmail', 'the advance check');
  ck('mayEmail says yes to a member for a password reset',
    (await may(MEMBERS[0].email, 'password-reset')) === true);
  ck('mayEmail says NO to a member for anything else',
    (await may(MEMBERS[0].email, 'lineup-alert')) === false
    && (await may(MEMBERS[0].email)) === false);
  ck('mayEmail says yes to the commissioner with no kind at all',
    (await may(COMMISH.email)) === true);

  // ── ABSORBED FROM A's DELETED notify_policy.test.js ──────────────────────
  //
  // A removed that file on the grounds that this one subsumes it. I checked
  // clause by clause rather than accepting it, because a guard deleted on a
  // wrong assumption is a protection that vanishes with nothing failing. Seven
  // of its nine assertions were already covered here (four of them more
  // broadly — mine also checks the CALL SITES). Two were not, and they are its
  // two best. They are its wording and its reasoning, not a paraphrase.

  /* THE EXPORT LIST IS THE POLICY SURFACE. A new sender cannot be reached
   * without appearing here, so pinning it exactly means a new member email is a
   * deliberate, visible act rather than an addition nobody reviewed. */
  {
    const ALLOWED = ['configured', 'mayEmail', 'sendMail', 'MEMBER_KINDS',
                     'draftTurn', 'passwordReset', 'sundayAlert', 'weeklyRecap', 'SITE'];
    const actual = Object.keys(notify).sort();
    ck('notify.js exports exactly the permitted surface',
      JSON.stringify(actual) === JSON.stringify(ALLOWED.slice().sort()),
      { expected: ALLOWED.slice().sort(), got: actual,
        note: 'a new export must be one of the three permitted member kinds, or '
            + 'commissioner-only and structurally unable to address a member' });
  }

  /* THE BROADCAST HELPER. `emailsFor(owners)` turned the owner list into a
   * league-wide address. It is deleted rather than left unused — an unused
   * broadcast helper makes the next broadcast a one-line change.
   *
   * NARROWED FROM A's VERSION, which asserted that NOTHING addresses the whole
   * league. That is no longer true by design: weeklyRecap does, because it is
   * one of the three. So the property is that the only league-wide address is
   * built inside the permitted sender, not sitting in a general-purpose helper
   * anything can call. */
  {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'notify.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ck('no general-purpose broadcast helper exists',
      !/emailsFor\s*[=(]/.test(src),
      'a broadcast helper is present; the capability is one call away');
    const leagueWide = (src.match(/\.filter\([^)]*o\.active[^)]*\)\s*\.map\(o => o\.email\)/g) || []);
    ck('  and the one league-wide address is built inside weeklyRecap, nowhere else',
      leagueWide.length <= 1 && /async function weeklyRecap[\s\S]{0,400}o\.email\)/.test(src),
      leagueWide);
  }

  /* SUNDAY ALERT IS COMMISSIONER-ONLY BY CONSTRUCTION, not by the caller.
   * A's signature, restored after the integration took mine wholesale and
   * dropped it. Fed a member it refuses BY POLICY — and the reason says so,
   * because with no API key every send skips and `skipped` alone would read the
   * same for "we declined" and "email is not set up". */
  {
    const alert = { week: 5, headline: 'x', hasCalls: false, calls: [], edge: 0 };
    const r1 = await notify.sundayAlert([MEMBERS[0]], alert);
    ck('a member-only owner list is refused BY POLICY, not by config',
      r1 && r1.reason === 'not-commissioner', r1);
    const r2 = await notify.sundayAlert([MEMBERS[0], COMMISH], alert);
    ck('  a mixed list resolves to the commissioner, never the member',
      r2 && r2.reason !== 'not-commissioner', r2);
    const r3 = await notify.sundayAlert(MEMBERS[0], alert);
    ck('  the OLD single-owner shape cannot smuggle a member through',
      r3 && r3.reason === 'not-commissioner', r3);
    const r4 = await notify.sundayAlert([{ ...COMMISH, email: undefined }], alert);
    ck('  a commissioner with no address is a NAMED skip, not a policy refusal',
      r4 && r4.reason === 'commissioner-has-no-email', r4);
  }

  /* NO CALL SITE MAY RE-INVENT THE GATE. The construction above is the durable
   * guard; this catches a caller handing sundayAlert a person instead of the
   * roster, which is the shape that put the policy back in the call site. */
  for (const f of ['member.js', 'admin.js']) {
    const fp = path.join(ROOT, 'src', 'routes', f);
    if (!fs.existsSync(fp)) continue;
    const src = fs.readFileSync(fp, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const bad = (src.match(/notify\.sundayAlert\(([^,]+),/g) || []).filter(m => !/owners/.test(m));
    ck(`routes/${f} hands sundayAlert the owner list, not a person`, bad.length === 0, bad);
  }

  // ── the policy is stated in ONE place ────────────────────────────────────
  const kinds = notify.MEMBER_KINDS;
  ck('the permitted set is exported so it cannot be re-derived elsewhere',
    kinds instanceof Set && kinds.size === 3, kinds && [...kinds]);
  ck('  and it is exactly the three Cory named',
    ['password-reset', 'weekly-recap', 'draft-turn'].every(k => kinds.has(k)), [...(kinds || [])]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
