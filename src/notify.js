// Email notifications via Resend (https://resend.com — free tier, 3k/month).
// Entirely optional: with no RESEND_API_KEY the site behaves exactly as before,
// every send is a silent no-op, and nothing ever throws into a page render.
const { getDoc, setDoc, now } = require('./data');

// Read at CALL time, not at import time. Captured in a const, a key set after
// this module was first required could never take effect — which made the
// "production has no email provider" state impossible to exercise in a test
// that had already loaded the app, and would silently ignore a key rotated into
// the process environment at runtime.
const apiKey = () => process.env.RESEND_API_KEY || '';
const FROM = process.env.NOTIFY_FROM || 'MFGA League <onboarding@resend.dev>';
// The deployed site. Every notification email links here, so a wrong default
// sends ten people to a domain that isn't ours.
const SITE = process.env.SITE_URL || 'https://makefbgreatagain.netlify.app';

const configured = () => !!apiKey();

// ── WHAT MAY BE EMAILED TO A MEMBER ──────────────────────────────────────────
//
// STANDING POLICY (Cory, 2026-08-11). EXACTLY THREE things may ever reach a
// member's inbox:
//
//     password-reset · weekly-recap · draft-turn
//
// Nothing else. Not lineup alerts, not waiver reminders, not settlement notices,
// not vote notifications, not trade offers, not anything built later. If a
// feature's design assumes member notification, it lives on the site and they go
// look at it. Everything in-season is the commissioner's and nobody else's.
//
// FOUR CAPABILITIES WERE REMOVED RATHER THAN GATED, because a gated capability is
// one edit away from being a capability again: `moneySettled` (to the owner),
// `newVote` (to every owner), `alertPosted` (to every owner), and
// `sideBetProposed` (to the named parties) no longer exist in this file, and
// their call sites no longer call them. Each already had a louder on-site signal
// — see the note at the bottom of this file.
//
// THE ENFORCEMENT IS A KIND, NOT A RECIPIENT LIST. Every send declares what it
// IS. An unrecognised or absent kind is commissioner-only, so a new feature that
// calls sendMail without thinking about this inherits the restriction instead of
// having to be told about it, and widening the policy means editing one set here
// — a visible, deliberate line in a diff.
const MEMBER_KINDS = new Set(['password-reset', 'weekly-recap', 'draft-turn']);

async function ownerIndex() {
  try {
    const owners = await getDoc('owners', []);
    const commish = new Set(), active = new Set();
    for (const o of (owners || [])) {
      if (!o || !o.active || !o.email) continue;
      const e = String(o.email).trim().toLowerCase();
      active.add(e);
      if (o.is_commissioner) commish.add(e);
    }
    return { commish, active };
  } catch (e) { return { commish: new Set(), active: new Set() }; }
}

// Who may receive a message of this kind. Fails CLOSED on an unreadable roster:
// an empty set means "email nobody", never "found nothing to object to".
async function permitted(kind) {
  const { commish, active } = await ownerIndex();
  return MEMBER_KINDS.has(kind) ? active : commish;
}

// The same question, asked before doing work rather than after: "would a message
// of this kind to this address be sent?" Callers that need to know in advance
// (the forgot-password page, which must not promise a link it will not send) ask
// HERE rather than re-deriving the policy on their own — a second copy of a rule
// like this is exactly how the two drift apart.
async function mayEmail(address, kind) {
  if (!configured() || !address) return false;
  return (await permitted(kind)).has(String(address).trim().toLowerCase());
}

async function sendMail({ to, subject, html, kind }) {
  if (!configured() || !to || !to.length) return { skipped: true };
  const allowed = await permitted(kind);
  const list = [].concat(to).map(a => String(a).trim().toLowerCase()).filter(Boolean);
  const blocked = list.filter(a => !allowed.has(a));
  if (blocked.length) {
    // Refuse the WHOLE send rather than quietly trimming the recipients: a
    // partial send is how a policy like this decays into "mostly".
    return { skipped: true, reason: 'recipient-not-permitted',
      note: `${blocked.length} recipient${blocked.length === 1 ? '' : 's'} may not receive `
          + `${MEMBER_KINDS.has(kind) ? `a "${kind}"` : `"${kind || 'an unclassified message'}" (commissioner-only)`}` };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey()}`, 'content-type': 'application/json' },
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

// --- notification events (all fire-and-forget) ---

async function draftTurn(owner) {
  if (!owner.email) return;
  await sendMail({
    kind: 'draft-turn',
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
    kind: 'password-reset',
    to: [owner.email],
    subject: '🔑 Reset your league password',
    html: wrap('Password reset',
      `Someone (hopefully you) asked to reset the password for <b>${owner.username}</b>. This link works once and expires in an hour. Ignore this email if it wasn't you.`,
      { path: `/reset?token=${token}`, label: 'Set a new password' }),
  });
}

const fmt = n => '$' + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-US');

/* THE WEEKLY RECAP — the only in-season email the LEAGUE receives.
 *
 * One of exactly three things permitted to reach a member's inbox, and the only
 * one that is not transactional. It gets the plain shell rather than the
 * single-paragraph `wrap()` used by the notices, because it is a piece of
 * writing with sections and it should look like one.
 */
async function weeklyRecap(owners, recap) {
  const to = (owners || []).filter(o => o && o.active && o.email).map(o => o.email);
  if (!to.length || !recap || !recap.ready) return { skipped: true, reason: 'nothing-to-send' };
  // **bold** is the only markup the generator emits, so it is the only markup
  // converted here — anything else in the text is escaped rather than trusted.
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rich = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const body = (recap.sections || []).map(sec => {
    const h = sec.h
      ? `<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a5f14;font-weight:800;margin:20px 0 8px">${esc(sec.h)}</div>`
      : '';
    const lines = sec.lines.map(l =>
      `<p style="margin:0 0 10px;line-height:1.6;color:#0c1a2b">${rich(l)}</p>`).join('');
    return h + lines;
  }).join('');
  return sendMail({
    kind: 'weekly-recap',
    to,
    subject: recap.subject,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;background:#f7f6f2;color:#0c1a2b;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e3da;border-radius:14px;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid #e5e3da">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a5f14;font-weight:800">🦅 Make Football Great Again</div>
        </div>
        <div style="padding:20px">
          <h1 style="margin:0 0 4px;font-size:20px;color:#12294a">Week ${esc(recap.week)}</h1>
          ${body}
          <a href="${SITE}/" style="display:inline-block;margin-top:18px;background:#d4242f;color:#ffffff;text-decoration:none;font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:11px 18px;border-radius:8px">See the standings</a>
        </div>
        <div style="padding:12px 20px;border-top:1px solid #e5e3da;font-size:11px;color:#3c4a60">
          You get this because you are in the league. Remove your email on the site to stop —
          password resets and draft-turn notices are the only other things we will ever send you.
        </div>
      </div>
    </div>`,
  });
}

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

  // A DEAD SLOT LEADS. The alert now only arrives when there is something to do,
  // and this is one of the two things — a player in the lineup who cannot score.
  // It goes above the posture because it is not a probability judgement: he is
  // out, and no dollar figure changes that.
  const dead = (alert.dead || []);
  if (dead.length) {
    body += `<div style="font-weight:800;font-size:16px;color:#d4242f">⛔ ${dead.length} starter${dead.length === 1 ? '' : 's'} cannot score this week</div>`
          + `<div style="margin:4px 0 14px">` + dead.map(d =>
              `<b>${d.name}</b> (${d.pos}) — ${d.reason}`).join('<br>') + `</div>`;
  }

  // THE LIST IS WHAT YOU HAVE TO DO, not what the model deviates on.
  //
  // `calls` prices the recommended lineup against the PROJECTION-optimal one —
  // the ~11%-of-weeks deviation A measured. It is a property of the model, not
  // a to-do list, and it is empty exactly when the two optima agree, including
  // on a week when your actual lineup is wrong. `changes` prices the
  // recommendation against the lineup you have set. Prefer it whenever the live
  // lineup was available; fall back to `calls` when it was not, which is what an
  // older caller (or a rehearsal fixture) passes.
  const todo = (alert.lineupKnown ? (alert.changes || []) : (alert.calls || []));
  if (todo.length) {
    // THE RARE WEEK — ~11% of them. Lead with the call and the money.
    if (alert.posture) {
      body += `<div style="font-weight:800;font-size:16px">${tag} — ${alert.posture.headline}</div>`
            + `<div style="color:#3c4a60;margin:4px 0 12px">${alert.posture.why}</div>`;
    }
    body += `<b>${alert.headline}</b>`;
    // Dollar figure in the site's dark green (#0f8a4d), not the old #4ade80 —
    // the old bright green was a dark-theme value and is barely legible on white.
    body += '<br><br>' + todo.map(c =>
      `▲ <b>Start ${c.start}</b> over ${c.sit} — <b style="color:#0d7a44">$${Math.round(c.dollars)}</b> <span style="color:#3c4a60">(${c.why})</span>`
    ).join('<br>');
  } else if (dead.length) {
    // A DEAD SLOT AND NO PRICED CALL. The swap is normally a call, but a call
    // under the $0.50 print threshold is filtered out — and then the old email
    // said "nothing to change" over a starter on bye. Say the true thing.
    body += `<div style="color:#3c4a60">The optimizer has no other change to recommend — `
          + `swap ${dead.length === 1 ? 'him' : 'them'} for anyone on your bench and you are done.</div>`;
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
    // Say WHICH claim this is. "Your lineup is right" and "nothing checked your
    // lineup" read identically in an inbox and mean opposite things.
    if (alert.lineupKnown === false) {
      body += '<div style="color:#3c4a60;margin:8px 0 0;font-size:13px">'
            + '(Your live lineup was not readable this morning, so this compares the two model lineups '
            + 'rather than yours — worth opening the optimizer to check.)</div>';
    }
  }

  if (alert.band && alert.band.median) {
    body += `<br><br><span style="color:#3c4a60">The bar: ~${alert.band.median} usually wins the week's $100.` +
      (alert.projected ? ` You project ${alert.projected.toFixed(0)}.` : '') + '</span>';
  }
  return sendMail({
    // NO `kind`, deliberately. The Sunday alert is a recommendation tool and is
    // commissioner-only by the DEFAULT rather than by a special case — if it
    // ever needed to reach anyone else that would be a policy change, not a
    // parameter. This is the shape every future in-season notification should
    // have: say nothing, get the restriction.
    to: [owner.email],
    subject: todo.length
      ? `🎯 ${week} lineup: $${Math.round(alert.lineupKnown && alert.fixWorth != null ? alert.fixWorth : alert.edge)} on the table`
      : dead.length
        ? `⛔ ${week} lineup: ${dead.length} starter${dead.length === 1 ? '' : 's'} out`
        // Only reachable from the manual "send" button now — the cron does not
        // send a nothing-to-change week at all.
        : `✅ ${week} lineup: nothing to change`,
    html: wrap(`${week} — set your lineup`, body, { path: '/lineup', label: 'Open the optimizer' }),
  });
}

// WHAT REPLACED THE FOUR REMOVED NOTIFICATIONS, checked rather than assumed
// before they were deleted:
//   • sideBetProposed → server-app.js puts a banner at the top of EVERY page —
//     "N side bets waiting on you to accept or decline" — plus a count badge on
//     the League Finances nav, both from sidebets.awaiting(). Louder than the
//     email was; you cannot open the site anywhere and miss it.
//   • newVote      → the dashboard's "Needs you" strip counts votes you have not
//                    cast, on the page you land on when you log in.
//   • alertPosted  → an urgent alert is ALREADY pinned site-wide on every page.
//                    The email was a second copy of something you cannot miss.
//   • moneySettled → /bank. This one is a genuine reduction: if the commissioner
//                    pays you, nothing tells you until you look. Accepted
//                    deliberately — it is not one of the three.
module.exports = { configured, mayEmail, sendMail, MEMBER_KINDS,
                   draftTurn, passwordReset, sundayAlert, weeklyRecap, SITE };
