'use strict';
/* WHAT MAY BE EMAILED TO A LEAGUE MEMBER — asserted, not remembered.
 *
 * Cory, 2026-08-11. EXACTLY THREE THINGS may ever reach a member:
 *   1. Password resets.
 *   2. The weekly recap (B is building it).
 *   3. "You're up to pick your draft spot."
 * Nothing else — not lineup alerts, waiver reminders, settlement notices, vote
 * notifications or trade offers, and not anything built later. If a feature's
 * design assumes member notification, the information lives on the site.
 * The Sunday alert and every other in-season notification is COMMISSIONER-ONLY.
 *
 * WHY A TEST AND NOT A COMMENT. The policy was violated four ways at once and
 * every one of them looked reasonable in isolation — a settlement receipt, a
 * ballot notice, an urgent announcement, a side-bet offer. `sideBetProposed`
 * even carried a comment arguing for itself. A rule that lives only in prose
 * gets re-derived by the next person with a good reason, so the constraint is
 * asserted where it fails loudly.
 *
 * THIS IS A CAPABILITY TEST, NOT A CALL-SITE TEST. Auditing call sites finds
 * today's violations; auditing the capability makes tomorrow's impossible. The
 * distinction is exactly what went wrong with sundayAlert, whose own comment
 * said "the caller gates" — putting the policy in every call site meant it could
 * only ever be as correct as the least careful one.
 *
 * Run: node draft/tests/notify_policy.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const N = require(path.join(ROOT, 'src', 'notify.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'notify.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? '\n        -> ' + d : ''))); };

/* THE EXPORT LIST IS THE POLICY SURFACE. A new sender cannot be reached without
 * appearing here, so pinning it exactly means a new member email is a
 * deliberate, visible act rather than an addition nobody reviewed. */
const ALLOWED = ['configured', 'sendMail', 'draftTurn', 'passwordReset', 'sundayAlert', 'SITE'];
const actual = Object.keys(N).sort();
ck('notify.js exports exactly the permitted surface',
   JSON.stringify(actual) === JSON.stringify(ALLOWED.slice().sort()),
   'expected ' + JSON.stringify(ALLOWED.slice().sort()) + '\n           got      '
   + JSON.stringify(actual) + '\n           A NEW EXPORT MUST BE one of the three permitted '
   + 'member emails, or commissioner-only and structurally unable to address a member.');

/* THE FOUR THAT WERE REMOVED. Named individually so a revert says WHICH, and so
 * "we deleted some email code" cannot quietly become "we deleted one of them". */
[['moneySettled', 'settlement notice — the member sees it on their tab at /bank'],
 ['newVote', 'ballot notice to EVERY member — the ballot is at /votes'],
 ['alertPosted', 'league announcement to EVERY member — it is on the site'],
 ['sideBetProposed', 'bet offer to every counterparty — it is at /bank?section=sidebets'],
].forEach(([name, why]) => {
  ck('removed and still gone: ' + name,
     N[name] === undefined && !new RegExp('function\\s+' + name + '\\b').test(SRC),
     'it is back. ' + why);
});

/* THE BROADCAST HELPER. `emailsFor(owners)` turned the owner list into a
 * league-wide address. Nothing may do that, so it is deleted rather than left
 * unused — an unused helper makes the next broadcast a one-line change. */
ck('no helper exists that addresses the whole league',
   !/emailsFor\s*[=(]/.test(SRC),
   'a broadcast helper is present; the capability is one call away');

/* SUNDAY ALERT IS COMMISSIONER-ONLY BY CONSTRUCTION.
 * Fed a member — even one flagged active with an address — it must refuse. */
(async () => {
  const member = { id: 2, name: 'Member', email: 'member@example.com', active: true,
                   is_commissioner: false };
  const commish = { id: 1, name: 'Cory', email: 'commish@example.com', active: true,
                    is_commissioner: true };
  const alert = { week: 5, headline: 'x', hasCalls: false, calls: [] };

  // Capture what would be sent WITHOUT sending: sendMail short-circuits when
  // unconfigured, so assert on the resolution instead of the wire.
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, text: async () => '' }; };
  const realKey = process.env.RESEND_API_KEY;

  /* ASSERT ON THE REASON, NOT ON `skipped`. With no RESEND_API_KEY every send
   * skips, so `skipped === true` would pass for a policy refusal AND for a
   * config gap — a green that proves nothing. The reason separates them. */
  const r1 = await N.sundayAlert([member], alert);
  ck('a member-only owner list is refused BY POLICY (not by config)',
     r1 && r1.reason === 'not-commissioner',
     'got ' + JSON.stringify(r1) + ' — expected reason "not-commissioner"');

  const r2 = await N.sundayAlert([member, commish], alert);
  ck('a mixed list resolves to the commissioner, never the member',
     r2 && r2.reason !== 'not-commissioner',
     'got ' + JSON.stringify(r2) + ' — the commissioner was not found in a mixed list');

  // The legacy shape — a bare owner object — must not smuggle a member through.
  const r3 = await N.sundayAlert(member, alert);
  ck('the OLD single-owner call shape cannot address a member either',
     r3 && r3.reason === 'not-commissioner',
     'got ' + JSON.stringify(r3) + ' — the gate moved but did not close');

  global.fetch = realFetch;
  if (realKey === undefined) delete process.env.RESEND_API_KEY;

  /* NO CALL SITE MAY ADDRESS A MEMBER. The capability test above is the durable
   * one; this catches a caller that hands sundayAlert something other than the
   * full owner list, which would be a caller re-inventing the gate. */
  ['member.js', 'admin.js'].forEach(f => {
    const p = path.join(ROOT, 'src', 'routes', f);
    if (!fs.existsSync(p)) return;
    const s = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const bad = (s.match(/notify\.sundayAlert\(([^,]+),/g) || [])
      .filter(m => !/owners/.test(m));
    ck('routes/' + f + ' passes the owner list to sundayAlert, not a person',
       bad.length === 0, bad.join(' | '));
  });

  console.log('');
  console.log(pass + '/' + (pass + fail) + ' notify-policy checks passed');
  process.exit(fail ? 1 : 0);
})();
