'use strict';
/*
 * STATUS DASHBOARD model builder — the phone-readable FACE of STATUS.md and
 * DECISIONS-NEEDED.md. Those two files stay the single source of truth; this
 * module only PARSES them into a structured model the view renders. Auto-current
 * on every push because it re-parses the deployed files at render time — nothing
 * to regenerate, no build step, no drift.
 *
 * Every function here is PURE (text in, model out) so the robot test can feed
 * known fixtures and assert the parse, and a "matches real file state" test can
 * parse the committed files. No fs, no Date, no network in the parsers — the
 * route injects `now` and the health inputs.
 */

// The draft-night deadline order (STATUS: "polish → paths → shadows → opening
// script → mocks"). A queue item whose text matches one of these is flagged as
// deadline-critical so the board can mark what cannot slip.
const DEADLINE_KEYWORDS = ['polish', 'path', 'shadow', 'opening', 'mock'];

/** Strip markdown emphasis/backticks and collapse whitespace for display. */
function clean(s) {
  return String(s || '')
    .replace(/\*\*/g, '').replace(/`/g, '').replace(/[_]{1,2}/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Parse the "Continuous queue (top→bottom …): a → b → c" line into ordered
 * items with a status each:
 *   done    — carries a ✅
 *   gated   — carries a 🔒, or says awaiting/blocked/gated
 *   current — the FIRST not-done item (the thing in flight); also anything the
 *             file bolds that isn't done reads as active
 *   queued  — everything else still ahead
 * The current item is the first non-done, non-gated item — highlighted by the view.
 */
function parseQueue(statusText) {
  const lines = String(statusText || '').split('\n');
  const line = lines.find(l => /continuous queue/i.test(l));
  if (!line) return [];
  // Everything after the first colon is the arrow-separated queue.
  const body = line.slice(line.indexOf(':') + 1);
  const raw = body.split(/→|->/).map(s => s.trim()).filter(Boolean);
  let currentAssigned = false;
  return raw.map(seg => {
    const done = /✅/.test(seg);
    const gated = /🔒/.test(seg) || /\b(awaiting|blocked|gated)\b/i.test(seg);
    let status;
    if (done) status = 'done';
    else if (gated) status = 'gated';
    else if (!currentAssigned) { status = 'current'; currentAssigned = true; }
    else status = 'queued';
    const label = clean(seg);
    const deadline = DEADLINE_KEYWORDS.some(k => new RegExp('\\b' + k, 'i').test(label));
    // A short unblock note for gated items: text in parens or after an em dash.
    let unblock = null;
    if (status === 'gated') {
      const m = seg.match(/[—-]\s*(.+)$/) || seg.match(/\(([^)]+)\)/);
      if (m) unblock = clean(m[1]);
    }
    return { label: label, status: status, deadline: deadline, unblock: unblock };
  });
}

/**
 * Parse DECISIONS-NEEDED.md "## D<n> — <title>" headers into action cards.
 * Status inferred from the header text: RESOLVED/✅/DONE → resolved; otherwise
 * open. Dedups repeated D-numbers (the file keeps provenance copies), keeping the
 * FIRST occurrence — that is the current status line, with older copies below it.
 */
function parseDecisions(decText) {
  const lines = String(decText || '').split('\n');
  const seen = {};
  const out = [];
  lines.forEach(l => {
    const m = l.match(/^##\s+(D\d+)\s*[—-]\s*(.+)$/);
    if (!m) return;
    const id = m[1];
    if (seen[id]) return;            // first occurrence wins (current status)
    seen[id] = true;
    const title = m[2];
    const resolved = /\b(resolved|done|implemented)\b/i.test(title) || /✅/.test(title);
    out.push({
      id: id,
      title: clean(title),
      status: resolved ? 'resolved' : 'open',
    });
  });
  // Open decisions first (they need action), then resolved, each in D-order.
  const num = d => parseInt(d.id.slice(1), 10);
  return out.sort((a, b) => {
    if ((a.status === 'open') !== (b.status === 'open')) return a.status === 'open' ? -1 : 1;
    return num(a) - num(b);
  });
}

/** Whole days from `now` until the draft date (negative once it's past). */
function daysUntil(draftISO, nowISO) {
  const d = new Date(draftISO + 'T00:00:00Z').getTime();
  const n = new Date(nowISO).getTime();
  if (isNaN(d) || isNaN(n)) return null;
  return Math.ceil((d - n) / 86400000);
}

/**
 * Assemble the full dashboard model. `inputs`:
 *   statusText, decText  — the two source files
 *   now                  — ISO string (route passes the real clock; test fixes it)
 *   draftDate            — 'YYYY-MM-DD'
 *   health               — { commit, commitAt, ci, audit } best-effort, any may be null
 */
function buildModel(inputs) {
  const inp = inputs || {};
  const queue = parseQueue(inp.statusText);
  const decisions = parseDecisions(inp.decText);
  const current = queue.find(q => q.status === 'current') || null;
  const counts = queue.reduce((a, q) => { a[q.status] = (a[q.status] || 0) + 1; return a; }, {});
  const countdown = inp.draftDate && inp.now ? daysUntil(inp.draftDate, inp.now) : null;
  return {
    queue: queue,
    current: current,
    counts: {
      done: counts.done || 0, current: counts.current || 0,
      queued: counts.queued || 0, gated: counts.gated || 0, total: queue.length,
    },
    decisions: decisions,
    openDecisions: decisions.filter(d => d.status === 'open').length,
    countdown: countdown,
    draftDate: inp.draftDate || null,
    health: inp.health || {},
  };
}

module.exports = { parseQueue, parseDecisions, daysUntil, buildModel, clean, DEADLINE_KEYWORDS };
