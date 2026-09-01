/* THE CAPTURE HAS NEVER BEEN SHOWN TO CAPTURE (register 458).
 *
 * ── WHY THIS FILE EXISTS, AND IT IS A DEADLINE ─────────────────────────────
 *
 * Week 1's capture window opens 2026-09-06. Until it does, EVERY path through
 * waiver-reco-cron and lineup-reco-cron lands in a skip arm, and every test of
 * them asserts a skip. `reco_probe_route.test.js` says so in its own header:
 * "lands on a clean pre-season skip, which the interpreter script then scores".
 *
 * So the branch that writes the row Cory cannot backfill — the one-per-week-
 * ever marker and the ledger entry behind it — had never once been demonstrated
 * to write anything. That is rule 3e in its purest form: a probe that has never
 * returned a positive is untested, not passing. `waiver_reco_autocapture.test.js`
 * proves the WINDOW arithmetic and the entry BUILDERS; nothing proved the two
 * halves meet.
 *
 * The cost of finding out on 2026-09-06 is a week of the season's first
 * decisions, unrecoverable — providers overwrite weekly numbers in place and
 * "what the tool recommended at the moment" cannot be reconstructed later.
 *
 * ── WHAT IT DOES ───────────────────────────────────────────────────────────
 *
 * Drives the REAL `runCapture` with the clock set INSIDE week 1's real window
 * (RECO_CAPTURE_NOW, register 458), against a stubbed Sleeper and a temp store,
 * and requires that a marker and a ledger row actually appear. Then it proves
 * the same call OUTSIDE the window writes nothing — because a capture that
 * fires unconditionally would pass the first half and be register 438 again.
 *
 * Run: node draft/tests/capture_opens_and_writes.test.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'capopen-'));

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 500) : ''))); };

const WINDOW = require(path.join(ROOT, 'src', 'capture_window'));
const store = require(path.join(ROOT, 'src', 'store'));

/* A Sleeper bundle shaped like the real one, saying exactly what Sleeper says
 * during week 1: season 2026, regular, week 1. The whole question is whether
 * the CLOCK, not Sleeper, decides — Sleeper says this from 2026-08-30 onward
 * and week 1's games start on 09-10 (register 438). */
function stubBundle(week) {
  return {
    state: { season: '2026', season_type: 'regular', week },
    week,
    season_type: 'regular',
    rosters: [{ roster_id: 1, owner_id: 'sleeper-1', players: ['4046'], starters: ['4046'] }],
    users: [{ user_id: 'sleeper-1', display_name: 'Commish' }],
    matchups: {},
    transactions: [],
  };
}

const CFG = { sleeper_league_id: 'L1', sleeper_map: { 1: 7 } };
const OWNERS = [{ id: 7, name: 'Cory', is_commissioner: true }];

async function seedStore() {
  await store.set('config', CFG);
  await store.set('owners', OWNERS);
}

/* Stub the two modules runCapture reaches for, by seeding require.cache before
 * the cron is loaded. Done here rather than with a mocking library because the
 * repo has none and one module is the point of the test. */
function stubDeps() {
  const sleeperPath = require.resolve(path.join(ROOT, 'src', 'sleeper'));
  require.cache[sleeperPath] = {
    id: sleeperPath, filename: sleeperPath, loaded: true,
    exports: {
      bundle: async () => stubBundle(1),
      players: async () => ({ '4046': { player_id: '4046', full_name: 'Bench Body', position: 'RB', team: 'FA' } }),
    },
  };
}

(async () => {
  await seedStore();
  stubDeps();

  const w = WINDOW.windowFor('2026', 1);
  ok('CONTROL — week 1 has a real capture window in the committed schedule, or '
     + 'every arm below is about a missing file rather than about the gate',
    w && Number.isFinite(w.opens) && Number.isFinite(w.closes) && w.closes > w.opens, w);

  const inside = new Date(w.opens + 36e5).toISOString();      // one hour after it opens
  const before = new Date(w.opens - 36e5).toISOString();      // one hour before

  ok('CONTROL — the two clocks really do straddle the window, so the two arms '
     + 'below differ by the thing under test and not by accident',
    WINDOW.weekIsLive('2026', 1, Date.parse(inside)) === true
    && WINDOW.weekIsLive('2026', 1, Date.parse(before)) === false,
    { inside, before });

  // ── ARM 1: OUTSIDE THE WINDOW, IT MUST WRITE NOTHING ─────────────────────
  // First, because if it wrote unconditionally, arm 2 would pass for the wrong
  // reason and this whole file would certify register 438 back into the code.
  process.env.RECO_CAPTURE_NOW = before;
  delete require.cache[require.resolve(path.join(ROOT, 'netlify', 'functions', 'waiver-reco-cron'))];
  const cronBefore = require(path.join(ROOT, 'netlify', 'functions', 'waiver-reco-cron'));
  const resBefore = await cronBefore.runCapture();
  const bodyBefore = JSON.parse(resBefore.body || '{}');
  ok('an hour BEFORE the window opens, the capture SKIPS and says why',
    bodyBefore.skipped === WINDOW.SKIP_REASON, bodyBefore);
  ok('  and it wrote NO marker — the one-per-week-ever key is still unburned',
    !(await store.get('waiverauto:2026:1')),
    await store.get('waiverauto:2026:1'));

  // ── ARM 2: INSIDE THE WINDOW, IT MUST ACTUALLY CAPTURE ───────────────────
  process.env.RECO_CAPTURE_NOW = inside;
  delete require.cache[require.resolve(path.join(ROOT, 'netlify', 'functions', 'waiver-reco-cron'))];
  const cronInside = require(path.join(ROOT, 'netlify', 'functions', 'waiver-reco-cron'));
  const resInside = await cronInside.runCapture();
  const bodyInside = JSON.parse(resInside.body || '{}');

  ok('INSIDE the window the capture does NOT skip — this is the arm that had '
     + 'never been demonstrated, and the whole reason for this file',
    !bodyInside.skipped, bodyInside);
  ok('  it answers ok:true rather than erroring on the live path',
    resInside.statusCode === 200 && bodyInside.ok === true, bodyInside);

  const mark = await store.get('waiverauto:2026:1');
  ok('  and it BURNED THE MARKER, which is the record that this week was handled',
    !!mark, mark);
  ok('  the marker carries an `at`, without which markerIsPremature cannot ever '
     + 'tell a real capture from a premature one (register 438)',
    !!(mark && mark.at), mark);
  ok('  and the marker it wrote is NOT premature by the repo\'s own predicate — '
     + 'a capture that immediately looks premature to the self-heal would '
     + 're-fire every run',
    !!(mark && WINDOW.markerIsPremature(mark, '2026', 1) === false), mark);

  // ── ARM 3: IDEMPOTENCE, WHICH IS WHAT THE MARKER IS FOR ──────────────────
  const resAgain = await cronInside.runCapture();
  const bodyAgain = JSON.parse(resAgain.body || '{}');
  ok('a SECOND run inside the same window skips as "already captured" — one '
     + 'capture per week, ever',
    bodyAgain.skipped === 'already captured', bodyAgain);

  // ── ARM 4: THE LINEUP CAPTURE, WHICH IS THE OTHER UNRECOVERABLE ONE ──────
  //
  // It shares autoCaptureContext but has its own marker write and its own
  // dependency (liveOptimizeFor), so "the waiver one works" does not cover it.
  // Sunday's start/sit call is exactly as unbackfillable as Tuesday's claim.
  {
    const memberPath = require.resolve(path.join(ROOT, 'src', 'routes', 'member'));
    const realMember = require.cache[memberPath];
    require.cache[memberPath] = {
      id: memberPath, filename: memberPath, loaded: true,
      exports: {
        liveOptimizeFor: async () => ({
          live: {
            lineup: [{ pid: '4046', name: 'Bench Body', pos: 'RB', proj: 12.5 }],
            naive: [{ pid: '4046', name: 'Bench Body', pos: 'RB', proj: 11.0 }],
            edge: 1.5, confidence: 'stubbed for the open-window arm',
          },
          band: { median: 108 },
        }),
      },
    };

    process.env.RECO_CAPTURE_NOW = before;
    delete require.cache[require.resolve(path.join(ROOT, 'netlify', 'functions', 'lineup-reco-cron'))];
    let lc = require(path.join(ROOT, 'netlify', 'functions', 'lineup-reco-cron'));
    const lBefore = JSON.parse((await lc.runCapture()).body || '{}');
    ok('LINEUP: an hour BEFORE the window it skips, and burns no marker',
      lBefore.skipped === WINDOW.SKIP_REASON && !(await store.get('lineupauto:2026:1')),
      { body: lBefore, marker: await store.get('lineupauto:2026:1') });

    process.env.RECO_CAPTURE_NOW = inside;
    delete require.cache[require.resolve(path.join(ROOT, 'netlify', 'functions', 'lineup-reco-cron'))];
    lc = require(path.join(ROOT, 'netlify', 'functions', 'lineup-reco-cron'));
    const lIn = JSON.parse((await lc.runCapture()).body || '{}');
    ok('LINEUP: INSIDE the window it captures rather than skipping', !lIn.skipped, lIn);

    const lMark = await store.get('lineupauto:2026:1');
    ok('LINEUP: the marker is burned and is NOT premature by the same predicate — '
       + 'the defect the waiver arm caught would be identical here',
      !!(lMark && lMark.at && WINDOW.markerIsPremature(lMark, '2026', 1) === false), lMark);

    const lAgain = JSON.parse((await lc.runCapture()).body || '{}');
    ok('LINEUP: a second run inside the window is idempotent',
      lAgain.skipped === 'already captured', lAgain);

    if (realMember) require.cache[memberPath] = realMember;
    else delete require.cache[memberPath];
  }

  delete process.env.RECO_CAPTURE_NOW;
  console.log('\n' + pass + '/' + (pass + fail) + ' capture-opens arms passed');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('THREW: ' + (e && e.stack || e));
  process.exit(1);
});
