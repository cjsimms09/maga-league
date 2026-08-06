// Email notifications via Resend (https://resend.com — free tier, 3k/month).
// Entirely optional: with no RESEND_API_KEY the site behaves exactly as before,
// every send is a silent no-op, and nothing ever throws into a page render.
const { getDoc, setDoc, now } = require('./data');

const API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.NOTIFY_FROM || 'MFGA League <onboarding@resend.dev>';
const SITE = process.env.SITE_URL || 'https://maga-league.netlify.app';

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

function wrap(title, body, cta) {
  return `<div style="font-family:Helvetica,Arial,sans-serif;background:#0b0e16;color:#e7eaf3;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#10141d;border:1px solid rgba(255,255,255,.1);border-radius:14px;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.1)">
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#f5c445;font-weight:800">🦅 Make Football Great Again</div>
      </div>
      <div style="padding:20px">
        <h1 style="margin:0 0 10px;font-size:19px;color:#fff">${title}</h1>
        <p style="margin:0 0 18px;line-height:1.55;color:#c7cddd">${body}</p>
        <a href="${SITE}${cta.path}" style="display:inline-block;background:#ff4655;color:#fff;text-decoration:none;font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:11px 18px;border-radius:8px">${cta.label}</a>
      </div>
      <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,.1);font-size:11px;color:#8a92a6">
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

module.exports = { configured, sendMail, draftTurn, moneySettled, newVote, alertPosted, passwordReset, SITE };
