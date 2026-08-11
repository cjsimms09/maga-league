// Email notifications via Resend (https://resend.com — free tier, 3k/month).
// Entirely optional: with no RESEND_API_KEY the site behaves exactly as before,
// every send is a silent no-op, and nothing ever throws into a page render.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHAT MAY BE EMAILED TO A LEAGUE MEMBER — EXACTLY THREE THINGS. Cory, 2026-08-11.
//
//   1. Password resets.
//   2. The weekly recap (B is building it — the chronicle voice: who beat who,
//      close games, streaks, the weekly high and its $100, playoff odds, the
//      funny things).
//   3. "You're up to pick your draft spot."
//
// NOTHING ELSE. Not lineup alerts, not waiver reminders, not settlement notices,
// not vote notifications, not trade offers — not anything that exists now or
// gets built later. If a feature's design assumes member notification, THE
// INFORMATION LIVES ON THE SITE AND THEY GO LOOK AT IT.
//
// The Sunday alert and every other in-season notification is COMMISSIONER-ONLY.
//
// REMOVED 2026-08-11 RATHER THAN GATED, by instruction — four senders that could
// each reach a member outside the three:
//   moneySettled      "You've been paid $X"          (settlement notice)
//   newVote           "New measure on the ballot"     (to EVERY member)
//   alertPosted       "League announcement"           (to EVERY member)
//   sideBetProposed   "X wants to bet you $Y"         (to every other member)
//
// sideBetProposed is worth naming twice, because its own comment argued FOR
// itself: "Nobody checks a website for a bet they do not know exists." That is
// exactly the assumption the policy forbids — the answer is that the bet lives
// on the site and they go look at it.
//
// A GATE IS NOT A REMOVAL. sundayAlert used to take any `owner` and carried the
// comment "Commissioner-only content; the caller gates." That put the policy in
// every call site instead of in the capability, so it could only ever be as
// correct as the least careful caller. It now resolves the commissioner ITSELF
// and physically cannot address anyone else.
// ══════════════════════════════════════════════════════════════════════════════
const { getDoc, setDoc, now } = require('./data');

const API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.NOTIFY_FROM || 'MFGA League <onboarding@resend.dev>';
// The deployed site. Every notification email links here, so a wrong default
// sends ten people to a domain that isn't ours.
const SITE = process.env.SITE_URL || 'https://makefbgreatagain.netlify.app';

const configured = () => !!API_KEY;

async function sendMail({ to, subject, html }) {
  /* A SKIP CARRIES ITS REASON. "skipped" used to mean three different things —
   * no API key, no recipient, or a policy refusal upstream — and a caller (or a
   * test) could not tell them apart. Conflating "we declined to send this" with
   * "email is not configured" is how a policy refusal reads as infrastructure. */
  if (!configured()) return { skipped: true, reason: 'unconfigured' };
  if (!to || !to.length) return { skipped: true, reason: 'no-recipient' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { sent: true };
  } catch (e) {
    console.error('email send failed:', e.message);
    return { error: e.message };
  }
}

/* THE EMAIL SHELL — Field Office light theme, matching the site.
 *
 * This was a DARK email (#0b0e16 ground, pale #e7eaf3 text) left over from before
 * the site flipped to light. Two problems, one of them a real risk:
 *   1. It looked like a different product than the site it links to.
 *   2. DARK EMAILS FAIL UNSAFELY. Several clients (notably Outlook) drop or
 *      override container backgrounds; when that happened, pale text landed on
 *      the client's white default and became INVISIBLE — the same white-on-white
 *      failure found in the war room, but in the one surface that arrives
 *      unprompted on a Sunday morning. A light shell degrades safely: if the
 *      background is stripped, dark ink on white is still readable.
 * Colors mirror the site tokens (paper #f7f6f2 / card #fff / ink #0c1a2b /
 * navy #12294a / muted #3c4a60 / red #d4242f). The kicker gold is darkened to
 * #8a5f14 (5.6:1) because the site's #b9822a only reaches 3.3:1 on white, which
 * is under AA for 12px text.
 */
function wrap(title, body, cta) {
  return `<div style="font-family:Helvetica,Arial,sans-serif;background:#f7f6f2;color:#0c1a2b;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e3da;border-radius:14px;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #e5e3da">
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a5f14;font-weight:800">🦅 Make Football Great Again</div>
      </div>
      <div style="padding:20px">
        <h1 style="margin:0 0 10px;font-size:19px;color:#12294a">${title}</h1>
        <p style="margin:0 0 18px;line-height:1.55;color:#0c1a2b">${body}</p>
        <a href="${SITE}${cta.path}" style="display:inline-block;background:#d4242f;color:#ffffff;text-decoration:none;font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:11px 18px;border-radius:8px">${cta.label}</a>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #e5e3da;font-size:11px;color:#3c4a60">
        You're getting this because you're in the league. Remove your email on the site to stop.
      </div>
    </div>
  </div>`;
}

/* `emailsFor(owners)` — the helper that turned the owner list into a broadcast
 * address — is DELETED, not left unused. Its only purpose was addressing the
 * whole league, which nothing may now do; leaving it in place would leave the
 * capability one call away and make the next broadcast a one-line change. */

// --- notification events (all fire-and-forget) ---

async function draftTurn(owner) {
  if (!owner.email) return;
  await sendMail({
    to: [owner.email],
    subject: "🎯 You're up — pick your draft spot",
    html: wrap("It's your turn to choose a draft spot",
      `Everyone behind you is waiting. No timer, but the group chat has opinions. Check the cheat sheet to see where your first real pick lands based on how many keepers you're holding.`,
      { path: '/draft', label: 'Choose my spot' }),
  });
}

async function passwordReset(owner, token) {
  if (!owner.email) return { skipped: true };
  return sendMail({
    to: [owner.email],
    subject: '🔑 Reset your league password',
    html: wrap('Password reset',
      `Someone (hopefully you) asked to reset the password for <b>${owner.username}</b>. This link works once and expires in an hour. Ignore this email if it wasn't you.`,
      { path: `/reset?token=${token}`, label: 'Set a new password' }),
  });
}

const fmt = n => '$' + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-US');

/* THE SUNDAY ALERT — before kickoff, the specific start/sit calls and what each
 * is worth. COMMISSIONER-ONLY, and now structurally so.
 *
 * It used to be `sundayAlert(owner, alert)` with the comment "the caller gates".
 * Both call sites happened to be correct — one resolves the commissioner from the
 * world, the other sits behind requireCommissioner — but the policy lived in the
 * call sites, so it could only ever be as correct as the least careful one, and a
 * third caller written in a hurry would have had nothing stopping it.
 *
 * It now takes the OWNER LIST and finds the commissioner itself. There is no
 * parameter through which a member can be addressed. */
async function sundayAlert(owners, alert) {
  const list = Array.isArray(owners) ? owners : (owners ? [owners] : []);
  const owner = list.find(o => o && o.is_commissioner && o.active);
  // THE POLICY REFUSAL, named. Anyone who is not the active commissioner is not
  // addressable here, and the reason says so rather than looking like a config gap.
  if (!owner) return { skipped: true, reason: 'not-commissioner' };
  if (!owner.email) return { skipped: true, reason: 'commissioner-has-no-email' };
  if (!alert) return { skipped: true, reason: 'no-alert' };
  const week = alert.week ? `Week ${alert.week}` : 'This week';
  // Lead with the one real call — chase the $100 or protect the matchup — the same
  // verdict the on-page optimizer now leads with, so the email and the site agree.
  let body = '';
  if (alert.posture) {
    const tag = alert.posture.mode === 'chase' ? '🎯 CHASE' : '🛡️ PROTECT';
    body += `<div style="font-weight:800;font-size:16px">${tag} — ${alert.posture.headline}</div>`
          + `<div style="color:#3c4a60;margin:4px 0 12px">${alert.posture.why}</div>`;
  }
  body += `<b>${alert.headline}</b>`;
  if (alert.hasCalls) {
    // Dollar figure in the site's dark green (#0f8a4d), not the old #4ade80 —
    // the old bright green was a dark-theme value and is barely legible on white.
    body += '<br><br>' + alert.calls.map(c =>
      `▲ <b>Start ${c.start}</b> over ${c.sit} — <b style="color:#0d7a44">$${Math.round(c.dollars)}</b> <span style="color:#3c4a60">(${c.why})</span>`
    ).join('<br>');
  }
  if (alert.band && alert.band.median) {
    body += `<br><br><span style="color:#3c4a60">The bar: ~${alert.band.median} usually wins the week's $100.` +
      (alert.projected ? ` You project ${alert.projected.toFixed(0)}.` : '') + '</span>';
  }
  return sendMail({
    to: [owner.email],
    subject: `🎯 ${week} lineup: ${alert.hasCalls ? `$${Math.round(alert.edge)} on the table` : 'you\'re optimal'}`,
    html: wrap(`${week} — set your lineup`, body, { path: '/lineup', label: 'Open the optimizer' }),
  });
}

/* THE EXPORT LIST IS THE POLICY SURFACE. Only these may exist. A new sender
 * added here must be one of the three permitted member emails, or be
 * commissioner-only and structurally unable to address a member.
 * notify_policy.test.js asserts this list. */
module.exports = { configured, sendMail, draftTurn, passwordReset, sundayAlert, SITE };
