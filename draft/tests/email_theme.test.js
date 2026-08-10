'use strict';
// EMAIL LEGIBILITY — the Sunday alert (and every other notification) must stay
// readable in the one surface nobody can restyle: an inbox.
//
// The shell used to be DARK (#0b0e16 ground, pale #e7eaf3 text), left over from
// before the site flipped to light. That fails UNSAFELY: several clients drop or
// override container backgrounds, and when that happens pale text lands on the
// client's white default and disappears — the white-on-white failure again, in
// the surface that arrives unprompted on a Sunday morning. Every colour must
// therefore be legible on WHITE, not merely on our own background.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const src = fs.readFileSync(path.join(ROOT, 'src', 'notify.js'), 'utf8');
// Strip comments before scanning: the fix's own documentation NAMES the old dark
// values, and a guard that trips on its own rationale is a guard nobody keeps.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const lum = h => {
  const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a, b) => {
  const L1 = lum(a), L2 = lum(b);
  return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
};

// Every TEXT colour used anywhere in the email templates.
const textColors = [...new Set((code.match(/color:#[0-9a-fA-F]{6}/g) || [])
  .map(s => s.split(':')[1].toLowerCase()))];
ck('the email templates declare text colours', textColors.length > 0, textColors.join(','));

// White text is legitimate ONLY on the solid red CTA button; every other text
// colour has to survive landing on white.
const onButton = new Set(['#ffffff']);
const failures = textColors.filter(c => !onButton.has(c) && contrast(c, '#ffffff') < 4.5)
  .map(c => `${c} (${contrast(c, '#ffffff')}:1)`);
ck('every email text colour is AA-legible on WHITE (survives a stripped background)',
  failures.length === 0, failures.join(', '));

// The specific dark-theme values that used to be here must never come back.
const banned = ['#e7eaf3', '#c7cddd', '#4ade80', '#8a92a6', '#0b0e16', '#10141d', '#ff4655'];
const returned = banned.filter(b => code.toLowerCase().includes(b));
ck('no dark-theme email colours have crept back', returned.length === 0, returned.join(', '));

// The shell itself must be light: a light ground degrades safely, a dark one does not.
ck('the email shell uses the light paper ground', /background:#f7f6f2/.test(code));
ck('the email card is white', /background:#ffffff/.test(code));

// The CTA button keeps white-on-red (a solid background it paints itself).
ck('the CTA button is white on the brand red', /background:#d4242f;color:#ffffff/.test(code));

// ── THE SUNDAY ALERT, ACTUALLY COMPOSED. Grepping the source for "CHASE" only
// proved the string exists. Build the real email instead: set a key so sendMail
// runs, and intercept fetch to capture the exact HTML and subject that would go
// out. That is what caught the two defects below.
{
  process.env.RESEND_API_KEY = 'test-key-not-a-real-key';
  const realFetch = global.fetch;
  let sent = null;
  global.fetch = async (_url, opts) => { sent = JSON.parse(opts.body); return { ok: true, text: async () => '' }; };
  delete require.cache[require.resolve(path.join(ROOT, 'src', 'notify.js'))];
  const N = require(path.join(ROOT, 'src', 'notify.js'));
  const to = { email: 'x@example.com' };
  const send = async alert => { sent = null; await N.sundayAlert(to, alert); return sent || {}; };

  (async () => {
    // The rare week (~11%): the call and the money lead.
    const withCalls = await send({ week: 5, hasCalls: true, edge: 14,
      posture: { mode: 'chase', headline: 'Chase the weekly $100', why: 'because reasons' },
      calls: [{ start: 'Boom', sit: 'Safe', dollars: 9, why: '+$8 weekly-high' }], band: null });
    ck('a week WITH calls leads with the posture badge and prices the moves',
      /🎯 CHASE/.test(withCalls.html) && /Start Boom/.test(withCalls.html) && /\$9/.test(withCalls.html));
    ck('  and the subject says what is on the table', /\$14 on the table/.test(withCalls.subject), withCalls.subject);

    // The ORDINARY week (~89%): it used to lead with a 16px "🎯 CHASE" call to
    // action and then say underneath that there was nothing to do — the loudest
    // element in the email was a decision that did not exist.
    const none = await send({ week: 5, hasCalls: false, edge: 0,
      headline: "You're already starting the dollar-optimal lineup — nothing to change.",
      posture: { mode: 'protect', headline: 'Start your studs — no chase this week',
        why: 'Your highest-projection lineup is also the dollar-optimal one.' }, calls: [], band: null });
    const leadNone = (none.html.match(/font-size:16px[^>]*>([^<]*)/) || [])[1] || '';
    ck('an ordinary week leads with the ANSWER, not the posture call-to-action',
      /nothing to change/i.test(leadNone) && !/no chase this week/.test(leadNone), leadNone);
    ck('  the posture reasoning is demoted to supporting text, not the 16px lead',
      /dollar-optimal one\./.test(none.html) && !/dollar-optimal one\./.test(leadNone));
    // The true inversion: posture says CHASE (edge >= $1 in aggregate) but every
    // individual swap is under the $0.50 print threshold, so there are no calls.
    // The old email put a 16px "🎯 CHASE" above "nothing to change".
    const chaseNoCalls = await send({ week: 7, hasCalls: false, edge: 1.2,
      headline: "You're already starting the dollar-optimal lineup — nothing to change.",
      posture: { mode: 'chase', headline: 'Chase the $100', why: 'some ceiling upside' },
      calls: [], band: null });
    const leadCNC = (chaseNoCalls.html.match(/font-size:16px[^>]*>([^<]*)/) || [])[1] || '';
    ck('  a CHASE posture with no actual calls does not shout a decision that is not there',
      !/CHASE/.test(leadCNC) && /nothing to change/i.test(leadCNC), leadCNC);
    ck('  and it states the frequency, so a quiet email reads as expected not as a dud',
      /9 weeks in 10/.test(none.html));
    ck('  subject matches', /nothing to change/.test(none.subject), none.subject);

    // PENDING was branded 🛡️ PROTECT by a two-way ternary over three modes —
    // "PROTECT" above its own headline "nothing to optimize" — while the on-page
    // rehearsal in lineup.ejs rendered ⏳ PENDING. The preview showed a badge the
    // real email would never send.
    const pending = await send({ week: 1, hasCalls: false, edge: 0,
      headline: 'No projections yet — nothing to optimize',
      posture: { mode: 'pending', headline: 'No projections yet — nothing to optimize',
        why: 'Projections have not landed.' }, calls: [], band: null });
    ck('a PENDING posture is never branded PROTECT', !/PROTECT/.test(pending.html), pending.html.slice(0, 200));
    ck('  it uses the same ⏳ the on-page preview shows', /⏳/.test(pending.html));
    ck('  and does not claim the normal-week frequency when nothing is measured',
      !/9 weeks in 10/.test(pending.html));

    // The badge table must cover every mode weeklyPosture can return.
    const LOsrc = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'lineup.js'), 'utf8');
    const modes = [...new Set((LOsrc.match(/mode:\s*'(\w+)'/g) || []).map(m => m.split("'")[1]))];
    const nsrc = fs.readFileSync(path.join(ROOT, 'src', 'notify.js'), 'utf8');
    const missing = modes.filter(m => !new RegExp('\\b' + m + '\\b').test(nsrc));
    ck('every posture mode the engine can emit has an email badge', missing.length === 0, missing.join(','));

    global.fetch = realFetch;
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })();
}

