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
    // Two heading formats, both live: the legacy "## D3 — title" and the current
    // numbered "## 1. TITLE — ✅ APPROVED" that DECISIONS-NEEDED.md migrated to.
    // Matching only the first made the status dashboard show ZERO decisions once
    // the file was renumbered (caught by the real-file test).
    const m = l.match(/^##\s+(D\d+)\s*[—-]\s*(.+)$/)     // legacy: "## D3 — title"
           || l.match(/^##\s+(\d+)\.\s+(.+)$/);           // current: "## 1. TITLE — status"
    if (!m) return;
    const id = m[1];
    if (seen[id]) return;            // first occurrence wins (current status)
    seen[id] = true;
    const title = m[2];
    // "✅ APPROVED" is a decided (resolved) decision; OPEN / PENDING are not.
    const resolved = /\b(resolved|done|implemented|approved)\b/i.test(title) || /✅/.test(title);
    out.push({
      id: id,
      title: clean(title),
      status: resolved ? 'resolved' : 'open',
    });
  });
  // Open decisions first (they need action), then resolved, each in D-order.
  const num = d => parseInt(String(d.id).replace(/\D/g, ''), 10);
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
 * THE DRAFT-DAY ANNOUNCEMENT — derived from config so ONE edit (date, time, or
 * place) moves the front-page banner, the countdown, and the pinned alert
 * together. Three hand-typed strings had already drifted: the pinned alert said
 * "5:00 PM" and named no place. Defaults are the 2026 draft as Cory set it
 * (Sat 8/22, 6:00 PM, Cory's House); the weekday is DERIVED from the date, so it
 * can never say a day the date isn't.
 *
 * @param {object} config      world.config (draft_date 'YYYY-MM-DD', draft_time, draft_location)
 * @param {string} nowISO      the clock (route passes real; tests fix it)
 * @param {number} [seasonYear] current season year — the fallback draft year DERIVES
 *                              from it (never a hardcoded year literal, per the
 *                              no-season-literals guard), so the default rolls forward
 *                              on its own. `config.draft_date` is the real source; this
 *                              only fills in a late-August placeholder until Cory sets it.
 */
function draftAnnouncement(config, nowISO, seasonYear) {
  const cfg = config || {};
  // Fallback DATE derives its year from the season; the month-day is a placeholder
  // (late-August draft) that the admin form overrides. No quoted YYYY-MM-DD literal.
  const fallbackDate = seasonYear ? (seasonYear + '-08-22') : null;
  const date = cfg.draft_date || fallbackDate;
  const time = cfg.draft_time || '6:00 PM';
  const place = cfg.draft_location || "Cory's House";
  if (!date) return { date: null, time, place, weekday: '', longDate: '', when: '', days: null, passed: false, today: false, countdownText: null, message: null, configured: false };
  const days = nowISO ? daysUntil(date, nowISO) : null;
  // Fixed UTC frame so the label never shifts by the server's timezone.
  const d = new Date(date + 'T12:00:00Z');
  const ok = !isNaN(d.getTime());
  const weekday = ok ? d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : '';
  const longDate = ok ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }) : date;
  const when = (weekday ? weekday + ' ' : '') + longDate + ' at ' + time;
  // The canonical one-line alert text (also self-heals the pinned alert).
  const message = 'DRAFT DAY: ' + when + ' — ' + place + '. Be there.';
  const passed = days != null && days < 0;
  const today = days === 0;
  // A short human countdown for the banner ("12 days out", "TODAY", "tomorrow").
  let countdownText = null;
  if (days != null) {
    countdownText = today ? 'TODAY' : days === 1 ? 'Tomorrow' : passed ? 'Draft complete' : days + ' days out';
  }
  return { date, time, place, weekday, longDate, when, days, passed, today, countdownText, message, configured: true };
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

module.exports = { parseQueue, parseDecisions, daysUntil, draftAnnouncement, buildModel, clean, DEADLINE_KEYWORDS };
