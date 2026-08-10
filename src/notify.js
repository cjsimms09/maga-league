// Email notifications via Resend (https://resend.com — free tier, 3k/month).
// Entirely optional: with no RESEND_API_KEY the site behaves exactly as before,
// every send is a silent no-op, and nothing ever throws into a page render.
const { getDoc, setDoc, now } = require('./data');

const API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.NOTIFY_FROM || 'MFGA League <onboarding@resend.dev>';
// The deployed site. Every notification email links here, so a wrong default
// sends ten people to a domain that isn't ours.
const SITE = process.env.SITE_URL || 'https://makefbgreatagain.netlify.app';

const configured = () => !!API_KEY;

async function sendMail({ to, subject, html }) {
  if (!configured() || !to || !to.length) return { skipped: true };
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

const emailsFor = (owners, filter = () => true) =>
  owners.filter(o => o.active && o.email && filter(o)).map(o => o.email);

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

async function moneySettled(owner, entry) {
  if (!owner.email) return;
  const paid = entry.amount > 0;
  await sendMail({
    to: [owner.email],
    subject: paid ? `💵 You've been paid — ${fmt(entry.amount)}` : `✅ Payment recorded — ${fmt(-entry.amount)}`,
    html: wrap(paid ? 'The commissioner paid you' : 'Your payment was recorded',
      `<b>${entry.desc}</b> — ${fmt(Math.abs(entry.amount))}${entry.settle_note ? ` (${entry.settle_note})` : ''}. Your tab has been updated.`,
      { path: '/bank', label: 'See my tab' }),
  });
}

async function newVote(owners, vote, proposerName) {
  const to = emailsFor(owners, o => o.id !== vote.proposer_id);
  await sendMail({
    to,
    subject: `🗳 New measure on the ballot: ${vote.question}`,
    html: wrap(vote.question,
      `<b>${proposerName}</b> put this on the ballot.${vote.description ? ` "${vote.description}"` : ''} Six YES votes passes it. You can change your vote until it closes.`,
      { path: '/votes', label: 'Cast my vote' }),
  });
}

async function alertPosted(owners, message, level) {
  if (level !== 'urgent') return;
  await sendMail({
    to: emailsFor(owners),
    subject: '🚨 League announcement',
    html: wrap('From the commissioner', message, { path: '/', label: 'Open the league office' }),
  });
}

/**
 * Somebody put a bet in front of you.
 *
 * This one matters more than the other notifications: an unanswered side bet
 * sits at "proposed" doing nothing, and the person who offered it is waiting.
 * Nobody checks a website for a bet they do not know exists.
 */
async function sideBetProposed(owners, bet, proposerName, sentence) {
  const to = emailsFor(owners, o => o.id !== bet.proposer_id);
  if (!to.length) return { skipped: true };
  await sendMail({
    to,
    subject: `🤝 ${proposerName} wants to bet you ${fmt(bet.stake)}`,
    html: wrap(`${proposerName} put up a side bet`,
      `<b>${sentence}</b><br><br>${fmt(bet.stake)} each${bet.resolves ? `, settling ${bet.resolves}` : ''}.
       It is not a bet until you accept — and accepting is a gentlemen's agreement,
       as good as a handshake. The site keeps score; it does not hold the money.`,
      { path: '/bank?section=sidebets', label: 'See the bet' }),
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

// THE SUNDAY ALERT — before kickoff, the specific start/sit calls and what each
// is worth. Commissioner-only content (a recommendation tool); the caller gates.
async function sundayAlert(owner, alert) {
  if (!owner || !owner.email || !alert) return { skipped: true };
  const week = alert.week ? `Week ${alert.week}` : 'This week';
  // The badge must cover every posture the engine can return. It was a two-way
  // ternary over three modes, so `pending` came out branded 🛡️ PROTECT above its
  // own headline "No projections yet — nothing to optimize" — and the on-page
  // rehearsal (lineup.ejs) got it right, so the preview showed a badge the real
  // email would never send. Same table both places now.
  const MODE = { chase: '🎯 CHASE', protect: '🛡️ PROTECT', pending: '⏳ PENDING' };
  const mode = (alert.posture && alert.posture.mode) || null;
  const tag = MODE[mode] || MODE.protect;
  let body = '';

  if (alert.hasCalls) {
    // THE RARE WEEK — ~11% of them. Lead with the call and the money.
    if (alert.posture) {
      body += `<div style="font-weight:800;font-size:16px">${tag} — ${alert.posture.headline}</div>`
            + `<div style="color:#3c4a60;margin:4px 0 12px">${alert.posture.why}</div>`;
    }
    body += `<b>${alert.headline}</b>`;
    // Dollar figure in the site's dark green (#0f8a4d), not the old #4ade80 —
    // the old bright green was a dark-theme value and is barely legible on white.
    body += '<br><br>' + alert.calls.map(c =>
      `▲ <b>Start ${c.start}</b> over ${c.sit} — <b style="color:#0d7a44">$${Math.round(c.dollars)}</b> <span style="color:#3c4a60">(${c.why})</span>`
    ).join('<br>');
  } else {
    // THE ORDINARY WEEK — the common one. It used to lead with a 16px "🎯 CHASE"
    // call to action and then say, underneath, that there was nothing to do:
    // the loudest element in the email was a decision that didn't exist. The
    // answer leads now, the reasoning supports it, and the frequency is stated
    // so a quiet email reads as the expected result rather than a dud — the
    // same framing as the optimizer page.
    body += `<div style="font-weight:800;font-size:16px">${mode === 'pending' ? '⏳' : '✅'} ${alert.headline}</div>`;
    if (alert.posture) {
      body += `<div style="color:#3c4a60;margin:6px 0 0">${alert.posture.why}</div>`;
    }
    if (mode !== 'pending') {
      body += '<div style="color:#3c4a60;margin:10px 0 0;font-size:13px">That\'s the normal week. '
            + 'Starting your best projections is the right call about 9 weeks in 10 — no need to open anything.</div>';
    }
  }

  if (alert.band && alert.band.median) {
    body += `<br><br><span style="color:#3c4a60">The bar: ~${alert.band.median} usually wins the week's $100.` +
      (alert.projected ? ` You project ${alert.projected.toFixed(0)}.` : '') + '</span>';
  }
  return sendMail({
    to: [owner.email],
    subject: alert.hasCalls
      ? `🎯 ${week} lineup: $${Math.round(alert.edge)} on the table`
      : `✅ ${week} lineup: nothing to change`,
    html: wrap(`${week} — set your lineup`, body, { path: '/lineup', label: 'Open the optimizer' }),
  });
}

module.exports = { configured, sendMail, draftTurn, moneySettled, newVote, alertPosted,
                   sideBetProposed, passwordReset, sundayAlert, SITE };
