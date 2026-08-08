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
