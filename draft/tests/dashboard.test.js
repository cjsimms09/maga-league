/* Status dashboard — the phone-readable face of STATUS.md + DECISIONS-NEEDED.md.
 * The single robot requirement (Cory): the dashboard renders and MATCHES the file
 * state. So this proves (1) the parsers classify queue/decisions correctly on a
 * known fixture, (2) they parse the REAL committed files into a coherent model,
 * and (3) the EJS view renders that real model without throwing and reflects it.
 *
 * Run: node draft/tests/dashboard.test.js   (exit 0 green, 1 red)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const D = require('../../src/dashboard.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) pass++; else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// ── Fixtures: a queue line and a decisions file with every status ──────────
const FIX_STATUS = [
  '# STATUS',
  '**Continuous queue (top→bottom, no stopping):** DST fix ✅(done) → §D ✅(done) → '
    + '**Part 2 layout (Paths)** → Phase H shadows → mocks-ready checkpoint → '
    + 'in-season master (built now, awaiting season data) → E-behaviors',
  '',
  'Some prose. Weekly self-audit 2026-08-03: all crons green, ledger cadence ok.',
].join('\n');

const FIX_DEC = [
  '# Decisions needed',
  '## D1 — Backtest metric — RESOLVED BY DATA',
  'body',
  '## D3 — Flex discount — ✅ RESOLVED + IMPLEMENTED',
  '## D3 — Flex discount (original — OPEN)',   // provenance dup: must be ignored
  '## D4 — Draft slot UNVERIFIED (blocked on Sleeper)',
  '## D8 — IR config oddity (low priority)',
].join('\n');

// ── parseQueue ─────────────────────────────────────────────────────────────
{
  const q = D.parseQueue(FIX_STATUS);
  check('queue: parses every arrow-separated segment', q.length === 7, 'n=' + q.length);
  check('queue: ✅ segments are done', q[0].status === 'done' && q[1].status === 'done');
  check('queue: the first non-done is current', q[2].status === 'current' && /Part 2/.test(q[2].label));
  check('queue: later undecided items are queued', q[3].status === 'queued' && q[6].status === 'queued');
  check('queue: an "awaiting" segment is gated', q[5].status === 'gated', JSON.stringify(q[5]));
  check('queue: deadline keywords flag deadline-order items',
    q[3].deadline === true /* shadows */ && q[4].deadline === true /* mocks */);
  check('queue: a non-deadline item is not flagged', q[6].deadline === false /* E-behaviors */);
  check('queue: exactly one current item', q.filter(x => x.status === 'current').length === 1);
  check('queue: no line → empty', D.parseQueue('# nothing here').length === 0);
}

// ── parseDecisions ─────────────────────────────────────────────────────────
{
  const dec = D.parseDecisions(FIX_DEC);
  check('decisions: dedups a repeated D-number (first occurrence wins)',
    dec.filter(d => d.id === 'D3').length === 1);
  check('decisions: the kept D3 is the RESOLVED one (first in file), not the OPEN dup',
    (dec.find(d => d.id === 'D3') || {}).status === 'resolved');
  check('decisions: RESOLVED / ✅ headers are resolved', (dec.find(d => d.id === 'D1') || {}).status === 'resolved');
  check('decisions: a plain header with a blocker is open', (dec.find(d => d.id === 'D4') || {}).status === 'open');
  check('decisions: open items sort before resolved',
    dec[0].status === 'open' && dec[dec.length - 1].status === 'resolved');
  check('decisions: D4 and D8 are the two open ones', dec.filter(d => d.status === 'open').map(d => d.id).join() === 'D4,D8');
}

// ── daysUntil ──────────────────────────────────────────────────────────────
check('daysUntil: 14 days out', D.daysUntil('2026-08-22', '2026-08-08T00:00:00Z') === 14);
check('daysUntil: draft day is 0', D.daysUntil('2026-08-22', '2026-08-22T06:00:00Z') === 0);
check('daysUntil: after the draft goes negative', D.daysUntil('2026-08-22', '2026-08-25T00:00:00Z') < 0);

// ── draftAnnouncement — DERIVED from config, one source for banner+alert ─────
{
  // Fallback DATE derives its year from the season (never a hardcoded literal).
  const di = D.draftAnnouncement({}, '2026-08-10T12:00:00Z', 2026);
  check('draftAnnouncement: fallback is the season-year draft, Sat 8/22 6pm at Cory\'s', di.message === "DRAFT DAY: Saturday August 22 at 6:00 PM — Cory's House. Be there.");
  check('draftAnnouncement: weekday is DERIVED from the date (Saturday)', di.weekday === 'Saturday');
  check('draftAnnouncement: countdown reads 12 days out', di.days === 12 && di.countdownText === '12 days out');
  check('draftAnnouncement: not passed / not today pre-draft', di.passed === false && di.today === false);
  check('draftAnnouncement: fallback year FOLLOWS the season (2027 → 2027)', D.draftAnnouncement({}, '2027-01-01T00:00:00Z', 2027).date === '2027-08-22');
  const over = D.draftAnnouncement({ draft_date: '2026-08-22', draft_time: '7:30 PM', draft_location: 'The Sports Bar' }, '2026-08-20T12:00:00Z', 2026);
  check('draftAnnouncement: config overrides date + time + place', over.message === 'DRAFT DAY: Saturday August 22 at 7:30 PM — The Sports Bar. Be there.');
  check('draftAnnouncement: today reads TODAY', D.draftAnnouncement({}, '2026-08-22T09:00:00Z', 2026).today === true && D.draftAnnouncement({}, '2026-08-22T09:00:00Z', 2026).countdownText === 'TODAY');
  check('draftAnnouncement: after the draft is marked passed', D.draftAnnouncement({}, '2026-09-01T00:00:00Z', 2026).passed === true);
  check('draftAnnouncement: a bad configured date does not throw and falls back to the raw string', D.draftAnnouncement({ draft_date: 'nonsense' }, '2026-08-10T00:00:00Z', 2026).longDate === 'nonsense');
  // No config date AND no season year → unconfigured (banner hides, no throw).
  const none = D.draftAnnouncement({}, '2026-08-10T00:00:00Z');
  check('draftAnnouncement: no date + no season year → configured:false, no message', none.configured === false && none.message === null && none.date === null);

  // ── REGISTER 5m (B, 2026-08-18): `configured` used to return `true`
  // unconditionally — a bare, unruled placeholder announcing itself with the
  // authority of a decision, the same defect keeperDeadlineAnnouncement below
  // was already fixed for. The committed ruling in league_config.json (`draft`,
  // "Yes it's 6pm", A10 08-18) is a REAL decision even with the runtime store
  // empty, so it earns configured:true; a season the ruling does not name gets
  // a genuinely-guessed placeholder and must NOT claim the ruling's authority.
  check('draftAnnouncement: the committed 2026 ruling backs configured:true even '
    + 'with an empty runtime config (this is the middle tier, not a guess)',
    di.configured === true);
  const offYear = D.draftAnnouncement({}, '2027-08-01T00:00:00Z', 2027);
  check('draftAnnouncement: FAIL ARM — a season the committed ruling does not '
    + 'name gets an unconfigured placeholder, not the ruling\'s authority '
    + '(2027-08-22 is a guess, not a decision)',
    offYear.date === '2027-08-22' && offYear.configured === false);
  const runtimeOnly = D.draftAnnouncement({ draft_date: '2027-09-04', draft_time: '5:00 PM' }, '2027-08-01T00:00:00Z', 2027);
  check('draftAnnouncement: a real runtime value earns configured:true on its '
    + 'own, independent of the committed ruling',
    runtimeOnly.configured === true && runtimeOnly.date === '2027-09-04');
}

// ── keeperDeadlineAnnouncement — register row 42's fix: `configured` and
// `derived` are SEPARATE, so a fallback guess can never fire the pinned,
// league-wide alert the way it used to (a hardcoded fallback and a real
// ruling both returned configured:true before this row was found). ────────
{
  // No config.keepers.deadline at all, but a season year → falls back to a
  // DERIVED date (never a hardcoded literal), and MUST read configured:false.
  const derived = D.keeperDeadlineAnnouncement({}, '2026-08-10T12:00:00Z', 2026);
  check('keeperDeadlineAnnouncement: no config -> derived fallback date, not configured', derived.date === '2026-08-21' && derived.configured === false && derived.derived === true);
  check('keeperDeadlineAnnouncement: derived still produces a real message (informational banner can show it)', typeof derived.message === 'string' && derived.message.indexOf('KEEPER DEADLINE') === 0);

  // The ruled config (the real shape Cory's ruling landed in) -> configured:true.
  const ruledConfig = { keepers: { deadline: { date: '2026-08-21', time: '6:00 PM', tz: 'CDT' } } };
  const ruled = D.keeperDeadlineAnnouncement(ruledConfig, '2026-08-18T12:00:00Z', 2026);
  check('keeperDeadlineAnnouncement: config.keepers.deadline present -> configured:true, derived:false', ruled.configured === true && ruled.derived === false);
  check('keeperDeadlineAnnouncement: weekday DERIVED from the ruled date (Friday)', ruled.weekday === 'Friday');
  check('keeperDeadlineAnnouncement: message states the deadline, not a guess', ruled.message === 'KEEPER DEADLINE: Friday August 21 at 6:00 PM CDT — set your keeper before it locks.');
  check('keeperDeadlineAnnouncement: not passed 3 days out', ruled.passed === false && ruled.hoursLeft > 24);

  // FAIL ARM for the exact bug this row found: even though a date exists (via
  // fallback), configured must stay false so the pinned alert never fires.
  check('FAIL ARM — a derived-only date never reports configured:true', derived.configured !== true);

  // Deadline instant math: 6:00 PM CDT = 23:00 UTC (CDT is UTC-5).
  const past = D.keeperDeadlineAnnouncement(ruledConfig, '2026-08-21T23:30:00Z', 2026);
  check('keeperDeadlineAnnouncement: passes exactly at the CDT instant, not just the calendar day', past.passed === true);
  const before = D.keeperDeadlineAnnouncement(ruledConfig, '2026-08-21T22:30:00Z', 2026);
  check('keeperDeadlineAnnouncement: half an hour before the instant is NOT yet passed', before.passed === false && before.countdownText === 'less than an hour left');

  // A bad date string must not throw, same contract as draftAnnouncement.
  const bad = D.keeperDeadlineAnnouncement({ keepers: { deadline: { date: 'nonsense' } } }, '2026-08-10T00:00:00Z', 2026);
  check('keeperDeadlineAnnouncement: a bad configured date does not throw and falls back to the raw string', bad.longDate === 'nonsense' && bad.configured === true);

  // No date and no season year -> fully unconfigured, no throw.
  const none = D.keeperDeadlineAnnouncement({}, '2026-08-10T00:00:00Z');
  check('keeperDeadlineAnnouncement: no date + no season year -> configured:false, no message', none.configured === false && none.message === null && none.date === null);
}

// ── buildModel on the fixture ──────────────────────────────────────────────
{
  const m = D.buildModel({ statusText: FIX_STATUS, decText: FIX_DEC,
    now: '2026-08-08T00:00:00Z', draftDate: '2026-08-22', health: { commit: 'abc1234' } });
  check('model: counts sum to the queue length',
    m.counts.done + m.counts.current + m.counts.queued + m.counts.gated === m.counts.total);
  check('model: exposes the current item', m.current && /Part 2/.test(m.current.label));
  check('model: openDecisions counted', m.openDecisions === 2);
  check('model: countdown computed', m.countdown === 14);
}

// ── MATCHES REAL FILE STATE — the committed STATUS.md + DECISIONS-NEEDED.md ─
const ROOT = path.join(__dirname, '..', '..');
const statusText = fs.readFileSync(path.join(ROOT, 'STATUS.md'), 'utf8');
const decText = fs.readFileSync(path.join(ROOT, 'DECISIONS-NEEDED.md'), 'utf8');
const real = D.buildModel({ statusText, decText, now: '2026-08-08T12:00:00Z',
  draftDate: '2026-08-22', health: {} });

check('real: STATUS.md yields a non-empty queue', real.queue.length > 0, 'n=' + real.queue.length);
check('real: the queue has exactly one current (in-flight) item',
  real.queue.filter(q => q.status === 'current').length === 1);
check('real: counts sum to total',
  real.counts.done + real.counts.current + real.counts.queued + real.counts.gated === real.counts.total);
check('real: DECISIONS-NEEDED.md yields decisions', real.decisions.length > 0, 'n=' + real.decisions.length);
check('real: no decision id is duplicated (provenance dups collapsed)',
  new Set(real.decisions.map(d => d.id)).size === real.decisions.length);

// ── RENDERS — the EJS view compiles against the real model without throwing ─
{
  const tpl = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'dashboard.ejs'), 'utf8');
  let html = null, threw = null;
  try {
    // include() needs a filename base + a no-op layout; render the body only by
    // stubbing the header/footer includes to isolate the dashboard markup.
    const body = tpl.replace(/<%-\s*include\([^%]+%>/g, '');
    html = ejs.render(body, { model: real, hasFiles: true });
  } catch (e) { threw = e; }
  check('render: the dashboard view renders the real model without throwing', threw === null,
    threw && threw.message);
  check('render: output contains the current queue item label',
    html != null && real.current != null && html.indexOf(real.current.label.slice(0, 12)) !== -1);
  check('render: output shows the draft countdown number',
    html != null && html.indexOf(String(real.countdown)) !== -1);
  check('render: every open decision id appears in the output',
    html != null && real.decisions.filter(d => d.status === 'open').every(d => html.indexOf(d.id) !== -1));
}

console.log((fail ? '' : '\n') + (pass) + '/' + (pass + fail) + ' dashboard checks passed');
process.exit(fail ? 1 : 0);
