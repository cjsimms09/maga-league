// TERRITORY: A
/* CHAOS DRILL (Cory's ruling, 2026-08-16) — the war room's sync under hostile input.
 *
 * THE BAR: every failure LOUD AND NAMED. Never a silent wrong number; never a
 * crash without a message pointing at the cause.
 *
 * WHAT THE DRILL FOUND AT BASELINE (2026-08-16, evidence in
 * draft/audit/chaos_drill_2026-08-16.md), all four fixed in sync.js/app.js:
 *
 *   F. a 200 whose body is a JSON OBJECT ({"error": ...}) produced NO status
 *      message at all — and refreshed lastOkAt and reset the failure counter
 *      first, so while Sleeper served garbage the sync-age readout said FRESH
 *      and the system strip's "SYNC STALE" red channel could never fire;
 *   G. a 200 whose body is not JSON at all (outage/block page) was reported
 *      as "Sleeper unreachable (Unexpected token <...)" — Sleeper was
 *      reached; the message blamed the wrong failure;
 *   H. an EMPTY pick list mid-draft was accepted as truth: 3 picks wiped,
 *      clock rewound 4 -> 1, status "Synced — 0 picks in" state 'live' — the
 *      exact `or []` failure the Python logger already refuses;
 *   I. a 4xx AFTER hours of working sync said "Check the draft ID — that will
 *      not fix itself by retrying" — misdirecting Cory to re-check an id that
 *      had already proven itself, when the real story is a rate limit/block;
 *   J. (app.js) a board with NO readable built_at reported NOTHING in the
 *      provenance banner, showed a GREEN movers dot and a green system strip
 *      — while the checklist called the same board "never built".
 *
 * The functional half drives the real DraftSync with a stubbed fetch and
 * captured timers — no browser, no network, deterministic. The app.js half
 * pins source structure the way this suite's siblings do (rec_rows,
 * sync_never_wedges), because app.js is a DOM IIFE.
 *
 * Run: node draft/tests/chaos_drill_warroom.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DraftSync = require(path.join(ROOT, 'public', 'js', 'draft', 'sync.js'));
const APP_SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'sync.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

/* Timers are CAPTURED, never run — each scenario drives poll() by hand, so a
 * runaway retry loop cannot hang the suite and every re-arm is observable. */
const timers = [];
global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
const lastTimerMs = () => (timers.length ? timers[timers.length - 1].ms : null);

const jsonResp = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const badJson = (status) => Promise.resolve({ ok: true, status: status || 200, json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')) });
const httpErr = code => Promise.resolve({ ok: false, status: code, json: () => Promise.resolve({}) });
const netDown = () => Promise.reject(new TypeError('fetch failed'));

function rig(fetchImpl) {
  global.fetch = fetchImpl;
  const statuses = [];
  const s = new DraftSync({ draftId: '123456789012', onStatus: m => statuses.push(m), onPicks: () => {} });
  s.running = true;
  return { s, statuses, last: () => statuses[statuses.length - 1] || {} };
}
const settle = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));
const picksOf = n => Array.from({ length: n }, (_, i) => ({ player_id: String(1000 + i), pick_no: i + 1, round: 1, draft_slot: (i % 10) + 1, roster_id: null }));

(async () => {
  // ── CONTROL: a healthy poll still syncs ──────────────────────────────────
  {
    const { s, last } = rig(() => jsonResp(picksOf(3)));
    s.poll(); await settle();
    ck('CONTROL — a healthy poll goes live and sets lastOkAt',
      last().state === 'live' && s.lastOkAt != null && s.picks.length === 3, last());
  }

  // ── F. 200 OK, body is an OBJECT ─────────────────────────────────────────
  {
    const { s, statuses, last } = rig(() => jsonResp({ error: 'draft not found' }));
    s.poll(); await settle();
    ck('F: an object body EMITS a status — the old code said nothing at all',
      statuses.length === 1 && last().state === 'error', statuses);
    ck('F: ...naming the shape AND quoting Sleeper\'s own error text',
      /an object/.test(last().message) && /draft not found/.test(last().message), last().message);
    ck('F: ...and does NOT touch lastOkAt — garbage is not a good read, or the '
      + 'SYNC STALE red channel could never fire while Sleeper served it',
      s.lastOkAt === null, s.lastOkAt);
    ck('F: ...and counts as a failure, so backoff engages', s.failures === 1);
    ck('F: ...and the poll re-arms — degraded, not stopped', lastTimerMs() === 8000, lastTimerMs());
    // recovery: the next good poll returns to live with no reset needed
    global.fetch = () => jsonResp(picksOf(2));
    s.poll(); await settle();
    ck('F: one good response after garbage returns to LIVE, failures reset',
      last().state === 'live' && s.failures === 0 && s.lastOkAt != null, last());
  }

  // ── G. 200 OK, body not JSON (outage page) ───────────────────────────────
  {
    const { s, last } = rig(() => badJson(200));
    s.poll(); await settle();
    ck('G: a non-JSON body names WHICH end answered and that it was not data',
      /answered HTTP 200 with a body that is not JSON/.test(last().message), last().message);
    ck('G: ...and no longer claims "unreachable" — Sleeper WAS reached',
      !/unreachable/.test(last().message), last().message);
    ck('G: ...still an error state that retries', last().state === 'error' && lastTimerMs() != null);
  }

  // ── H. empty pick list MID-DRAFT ─────────────────────────────────────────
  {
    const { s, last } = rig(() => jsonResp([]));
    s.picks = picksOf(3);
    s.poll(); await settle();
    ck('H: an empty read mid-draft KEEPS the picks — the board does not rewind',
      s.picks.length === 3 && s.currentPickNumber() === 4, { picks: s.picks.length, clock: s.currentPickNumber() });
    ck('H: ...and says exactly what happened and what it kept',
      last().state === 'error' && /EMPTY pick list while 3 picks are on the board/.test(last().message)
        && /KEEPING the 3 picks/.test(last().message), last().message);
    ck('H: ...without refreshing lastOkAt', s.lastOkAt === null);
  }
  {
    // CONTROL: an empty room BEFORE the draft is a normal state, not an error
    const { s, last } = rig(() => jsonResp([]));
    s.poll(); await settle();
    ck('H-CONTROL: empty pre-draft (0 -> 0) is still a quiet live sync',
      last().state === 'live' && /0 picks in/.test(last().message), last());
  }
  {
    // a SHRINKING list is accepted (Sleeper is the record; undo exists) but named
    const { s, last } = rig(() => jsonResp(picksOf(2)));
    s.picks = picksOf(3);
    s.poll(); await settle();
    ck('H2: a shrunken list follows Sleeper but SAYS the list shrank',
      s.picks.length === 2 && last().state === 'live'
        && /SHRANK from 3 to 2/.test(last().message), last());
    ck('H2: ...with the honest negative newPicks', last().newPicks === -1, last().newPicks);
  }

  // ── I. 4xx mid-draft vs 4xx at the start ─────────────────────────────────
  {
    const { s, last } = rig(() => httpErr(403));
    s.lastOkAt = Date.now() - 8000;   // the id has been syncing for a while
    s.transport = 'proxy';
    s.poll(); await settle();
    ck('I: a 403 AFTER working sync blames a rate limit/block, not the draft ID',
      /AFTER the sync had been working/.test(last().message)
        && /rate limit or block/.test(last().message), last().message);
    ck('I: ...and does NOT send Cory to re-check an id that already proved itself',
      !/Check the draft ID/.test(last().message), last().message);
    ck('I: ...and RETRIES — mid-draft blocks lift', /Retrying in/.test(last().message));
  }
  {
    const { s, last } = rig(() => httpErr(404));
    s.transport = 'proxy';            // no lastOkAt: the id has never worked
    s.poll(); await settle();
    ck('I-CONTROL: a 4xx with NO successful sync ever still says check the id',
      /Check the draft ID/.test(last().message), last().message);
  }

  // ── timeouts / network down: backoff grows and caps ──────────────────────
  {
    const { s, last } = rig(() => netDown());
    s.transport = 'proxy';
    const waits = [];
    for (let i = 0; i < 6; i++) { s.poll(); await settle(); waits.push(lastTimerMs()); }
    ck('outage: named "Sleeper unreachable" with the underlying error',
      /Sleeper unreachable \(this site/.test(last().message) || /Sleeper unreachable/.test(last().message), last().message);
    ck('outage: backoff doubles rather than hammering', waits[0] === 8000 && waits[1] === 16000, waits);
    ck('outage: ...and CAPS at 30s so recovery is never more than 30s away',
      waits[5] === 30000 && waits.every(w => w <= 30000), waits);
  }

  // ── clock pressure: a whole run of picks lands in ONE poll ───────────────
  {
    const { s, statuses, last } = rig(() => jsonResp(picksOf(12)));
    s.picks = picksOf(3);
    s.poll(); await settle();
    ck('clock pressure: 9 picks in one poll all land, clock jumps 4 -> 13',
      s.picks.length === 12 && s.currentPickNumber() === 13 && last().newPicks === 9,
      { len: s.picks.length, clock: s.currentPickNumber(), newPicks: last().newPicks });
    const health = s.ingestHealth();
    ck('clock pressure: ingest reports CLEAN — no silent drops under load',
      health.clean && health.picks === 12, health);
  }
  {
    // ...and the degraded version: one id-less pick and one pick_no collision
    const { s } = rig(() => jsonResp([]));
    const rows = picksOf(5);
    rows[2] = { pick_no: 3, round: 1, draft_slot: 3, roster_id: null };            // no id at all
    rows[4] = { player_id: '9999', round: 1, draft_slot: 5, roster_id: null };     // no pick_no -> substituted, collides
    s.picks = rows;
    const out = s.allPicks();
    const health = s.ingestHealth();
    ck('clock pressure, degraded: the id-less pick is COUNTED as dropped, not silent',
      health.dropped_no_id === 1 && !health.clean, health);
    // Found BY this drill's first run: the counter used to ACCUMULATE across
    // renders — one bad pick read as "2 dropped" after two allPicks() calls,
    // and would read as 47 after 47 renders. The count is per-pass now.
    s.allPicks(); s.allPicks();
    ck('clock pressure, degraded: ...and the count does NOT inflate with renders',
      s.ingestHealth().dropped_no_id === 1, s.ingestHealth());
    ck('clock pressure, degraded: a substituted pick_no colliding with a real one is COUNTED',
      health.pick_no_collisions >= 1, health);
    ck('clock pressure, degraded: the rest of the room still renders', out.length === 4, out.length);
  }

  // ── J. app.js: a board with no readable built_at is LOUD everywhere ──────
  ck('J: boardFreshness has an explicit unknown level (missing/garbage built_at)',
    /if \(h == null\) return \{ level: 'unknown', hours: null \};/.test(APP_SRC));
  ck('J: the provenance banner PUSHES A NOTE for unknown age — the old guard '
    + 'let it fall through in silence',
    /\} else \{[\s\S]{0,700}?notes\.push\(\{ level: 'bad',\s*\n\s*text: 'This board has NO readable built_at/.test(APP_SRC));
  ck('J: ...and the note says what to do about it', /Treat it as stale: rebuild before drafting off it/.test(APP_SRC));
  ck('J: the movers status dot shows RED for unknown age, not the old green',
    /freshMvs\.level === 'unknown' \? '🔴'/.test(APP_SRC));
  ck('J: the system strip pushes unknown age into the RED channel by name',
    /red\.push\('board age UNKNOWN — built_at missing or unreadable'\)/.test(APP_SRC));
  ck('J-CONTROL: stale (≥18h) still blocks — the unknown branch did not replace it',
    /blockOnStaleness\(hours\)/.test(APP_SRC) && /freshSS\.level === 'stale'\) red\.push/.test(APP_SRC));

  // ── the sync.js source keeps both halves of the fix ──────────────────────
  ck('sync.js: the non-array/empty guard sits BEFORE lastOkAt is refreshed',
    SYNC_SRC.indexOf('if (!Array.isArray(picks) || (picks.length === 0 && self.picks.length > 0))')
      < SYNC_SRC.indexOf('self.lastOkAt = Date.now();'),
    'guard must run first or garbage refreshes the age');
  ck('sync.js: the 4xx bad-id message survives for the never-worked case (FAIL '
    + 'ARM for the I fix — softening it everywhere would be the opposite mistake)',
    /Check the draft ID — that will not fix itself by retrying/.test(SYNC_SRC));

  console.log('\n' + pass + '/' + (pass + fail) + ' chaos checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('DRILL CRASH', e); process.exit(1); });
