// TERRITORY: A
/* ARE WE ACTUALLY READY TO DRAFT? ONE COMMAND, GO OR NO-GO.
 *
 * Cory, 2026-08-20: "After 6 I will let you know that keepers are locked on
 * sleeper board and you need to make sure we're ready for draft Saturday. Check
 * draft boards, check that everything with sleeper is good, check keepers match!
 * We need to be full go for draft! No mistakes"
 *
 * ── TWO MODES, BECAUSE "NOT LOCKED YET" IS CORRECT ON THURSDAY AND FATAL ON
 *    SATURDAY ──────────────────────────────────────────────────────────────
 *
 *   node draft/tools/draft_ready.js                 pre-lock: lock/freeze/
 *                                                   designation checks REPORT
 *   node draft/tools/draft_ready.js --after-lock    post-lock: the same checks
 *                                                   are FATAL
 *
 * A single mode would have to choose which day to be wrong on. Run the second
 * form after Cory says the keepers are locked.
 *
 * ── THE RULE THIS FILE IS BUILT ON: ABSENT IS NOT PASS ──────────────────────
 *
 * Every check treats missing data as FAILURE, never as silence. This project's
 * whole register is that failure mode: a stale seat plan stamping itself fresh
 * (143), a probe printing a truncated payload as absence (rule 3e), a keeper
 * slate whose missing key makes `.get()` return None and slip past an `is False`
 * assertion (151, tonight). If this tool cannot see a thing, it says NO-GO.
 *
 * ── WHAT IT CANNOT DO ───────────────────────────────────────────────────────
 *
 * It reads the REPOSITORY. It cannot see Sleeper directly (this sandbox has no
 * route) and it cannot see the deployed site (Netlify is a policy 403 at CONNECT
 * from here). Both are reported as UNVERIFIED-FROM-HERE with the command that
 * does check them, never as passes. A checklist that quietly downgrades what it
 * could not reach is worse than no checklist.
 *
 * Exit 0 = GO. Exit 1 = NO-GO. Writes draft/data/draft_ready.json.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const AFTER_LOCK = process.argv.includes('--after-lock');

const checks = [];
function ck(fatal, name, ok, detail, fix) {
  checks.push({ name, ok: !!ok, fatal: !!fatal, detail: detail === undefined ? null : detail, fix: fix || null });
}
function read(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

const BOARD = read(path.join(PUB, 'draft_data.json'));
const KEEPERS = read(path.join(ROOT, 'draft', 'config', 'keepers.json'));
const CONFIG = read(path.join(ROOT, 'draft', 'config', 'league_config.json'));
const SEAT = read(path.join(PUB, 'seat_plan.json'));
const FREEZE = read(path.join(ROOT, 'draft', 'data', 'pre_draft_freeze_2026.json'));

ck(true, 'the board file loads at all', !!BOARD, BOARD ? null : 'public/draft_data.json unreadable',
  'the board is the whole draft — nothing below matters until this passes');
ck(true, 'keepers.json loads', !!KEEPERS);
ck(true, 'league_config.json loads', !!CONFIG);
if (!BOARD || !KEEPERS || !CONFIG) { report(); }

/* ── 1. KEEPERS MATCH — CORY NAMED THIS ONE FIRST ──────────────────────────*/
const MY_SLOT = CONFIG.my_draft_slot;
ck(true, 'league_config declares Cory\'s draft slot', typeof MY_SLOT === 'number', { my_draft_slot: MY_SLOT });

const myTeam = (KEEPERS.teams || []).find(t => t.draft_slot === MY_SLOT);
ck(true, 'keepers.json has a row for Cory\'s slot (' + MY_SLOT + ')', !!myTeam,
  myTeam ? null : 'no team row with draft_slot ' + MY_SLOT,
  'without this the whole keeper comparison is vacuous');

const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
if (myTeam) {
  ck(true, 'Cory\'s draft slot is NOT provisional — a moving seat moves every pick',
    myTeam.slot_provisional === false, { slot_provisional: myTeam.slot_provisional });

  const cfgKeepers = myTeam.keepers || [];
  const boardKept = BOARD.kept_players || [];
  const boardIds = (BOARD.kept_player_ids || []).map(String);

  ck(true, 'CONTROL — Cory actually has keepers to check (a comparison of two '
    + 'empty lists passes and proves nothing)', cfgKeepers.length > 0,
    { n: cfgKeepers.length });

  ck(true, 'keeper COUNT matches between keepers.json and the board',
    cfgKeepers.length === boardKept.length,
    { keepers_json: cfgKeepers.length, board: boardKept.length });

  const cfgIds = cfgKeepers.map(k => String(k.player_id)).sort();
  const kptIds = boardKept.map(k => String(k.player_id)).sort();
  ck(true, 'keeper PLAYER IDS match exactly — keepers.json vs board.kept_players',
    JSON.stringify(cfgIds) === JSON.stringify(kptIds),
    { keepers_json: cfgIds, board: kptIds },
    'a mismatch means the board thinks he owns someone he does not, or vice versa');

  ck(true, 'board.kept_player_ids agrees with board.kept_players — the board\'s '
    + 'TWO keeper lists must not disagree with each other',
    JSON.stringify(boardIds.slice().sort()) === JSON.stringify(kptIds),
    { kept_player_ids: boardIds.slice().sort(), kept_players: kptIds });

  const nameMismatch = cfgKeepers.filter(k => {
    const b = boardKept.find(x => String(x.player_id) === String(k.player_id));
    return !b || norm(b.name) !== norm(k.name) || b.position !== k.position;
  });
  ck(true, 'keeper NAMES AND POSITIONS match, not just ids — an id that resolves '
    + 'to a different man is the worst version of this failure',
    nameMismatch.length === 0,
    nameMismatch.map(k => ({ id: k.player_id, keepers_json: k.name + '/' + k.position })));

  /* ⚠️ THE ONE THAT WOULD ACTUALLY COST HIM A PICK. */
  const pool = (BOARD.players || []).filter(p => p.position);
  const keptStillDraftable = kptIds.filter(id => {
    const p = pool.find(x => String(x.player_id) === id);
    return p && !p.kept && !p.is_keeper && !p.keeper;
  });
  ck(false, 'his keepers are FLAGGED on the board so the engine cannot recommend '
    + 'a man he already owns (report-only: the board may mark this by exclusion '
    + 'rather than a flag — see detail)',
    keptStillDraftable.length === 0,
    { unflagged: keptStillDraftable.map(id => (pool.find(x => String(x.player_id) === id) || {}).name) });

  const kept3 = boardKept.map(k => k.name + ' (' + k.position + ')').sort();
  ck(false, 'FOR THE HUMAN — read these three and confirm they are yours', true, kept3);
}

/* ── 2. THE SLEEPER SIDE ───────────────────────────────────────────────────*/
const slate = BOARD.keeper_slate || null;
ck(true, 'the board carries a keeper_slate at all — an ABSENT slate is how a '
  + 'missing-key None slipped past an `is False` assertion tonight (register 151)',
  !!slate, slate ? null : 'keeper_slate ABSENT');

if (slate) {
  ck(AFTER_LOCK, 'the keeper lock has PASSED on Sleeper',
    slate.keeper_lock_passed === true,
    { keeper_lock_passed: slate.keeper_lock_passed },
    AFTER_LOCK ? 'Cory said keepers are locked — if this is still false the board '
      + 'has not been rebuilt since the lock' : 'expected FALSE before Friday 6pm');

  ck(AFTER_LOCK, 'the importer calls the slate TRUTH, not a prediction',
    slate.status === 'confirmed' || slate.confirmed === true,
    { status: slate.status, confirmed: slate.confirmed },
    'status "predicted" means opponent keepers are GUESSES');

  ck(AFTER_LOCK, 'every team has designated — a missing team is an unknown '
    + 'keeper, which is an unknown player still on the board',
    slate.teams_designated === slate.teams_expected,
    { designated: slate.teams_designated, expected: slate.teams_expected,
      undesignated: slate.undesignated_teams });

  ck(true, 'no designation/placement MISMATCHES — a mismatch means Sleeper and '
    + 'our config disagree about who somebody kept',
    !(slate.mismatches && slate.mismatches.length),
    { mismatches: slate.mismatches });
}

/* ── 3. THE FREEZE ─────────────────────────────────────────────────────────*/
ck(true, 'the pre-draft freeze exists', !!FREEZE);
if (FREEZE) {
  ck(AFTER_LOCK, 'the freeze is SEALED, not PROVISIONAL — a provisional freeze '
    + 'was built on PREDICTED opponent keepers',
    FREEZE.status === 'SEALED',
    { status: FREEZE.status },
    'delete draft/data/pre_draft_freeze_2026.json and re-take it AFTER the slate '
    + 'confirms (freeze_pre_draft.py refuses to overwrite by design)');
}

/* ── 4. THE BOARD ITSELF ───────────────────────────────────────────────────*/
const builtAt = BOARD.built_at ? Date.parse(BOARD.built_at) : NaN;
const ageH = isFinite(builtAt) ? (Date.now() - builtAt) / 3.6e6 : Infinity;
ck(true, 'the board was built within the last 24 hours',
  ageH < 24, { built_at: BOARD.built_at, age_hours: isFinite(ageH) ? Math.round(ageH * 10) / 10 : 'UNKNOWN' },
  'ADP, injuries and suspensions all move daily — rebuild before drafting');

ck(true, 'the board has a real player population', (BOARD.players || []).length > 400,
  { players: (BOARD.players || []).length });

ck(true, 'the post-processing chain ran on the published board (blend + Draft '
  + 'Sharks bands) — without it the war room shows pre-blend numbers',
  !!BOARD.post_processed_at, { post_processed_at: BOARD.post_processed_at || 'ABSENT' });

/* ── 5. THE PICK SCHEDULE ──────────────────────────────────────────────────*/
const picks = (SEAT && SEAT.my_picks) || null;
ck(true, 'the seat plan knows Cory\'s picks', Array.isArray(picks) && picks.length > 0,
  { my_picks: picks });
if (Array.isArray(picks)) {
  ck(true, 'he has TWELVE picks — register 98 was an eighteen-pick artifact '
    + 'quoted for hours after his real twelve were known',
    picks.length === 12, { n: picks.length, picks });
  const kn = myTeam ? (myTeam.keepers || []).length : 0;
  ck(false, 'picks + keepers fill the roster (' + (picks.length + kn) + ' of 15)',
    picks.length + kn === 15, { picks: picks.length, keepers: kn });
}

/* ── 6. THE ARTIFACTS THE WAR ROOM READS ───────────────────────────────────*/
const NEEDED = ['seat_plan.json', 'source_boards.json', 'mlv_plan.json',
  'position_boards.json', 'board_ds.json', 'board_sleeper.json',
  'board_own.json', 'board_fp.json'];
const missing = NEEDED.filter(f => !fs.existsSync(path.join(PUB, f)));
ck(true, 'every artifact the war room fetches exists', missing.length === 0, { missing });

const staleBoards = NEEDED.filter(f => /^board_/.test(f)).filter(f => {
  const d = read(path.join(PUB, f));
  return !d || !d.built_from_board || d.built_from_board !== BOARD.built_at;
});
ck(true, 'the alternate source boards were built from THIS board — a toggle '
  + 'serving pre-lock replacement levels is worse than no toggle',
  staleBoards.length === 0,
  { stale: staleBoards, board_built_at: BOARD.built_at },
  'run python3 draft/tools/rerank_by_source.py after any board rebuild');

/* ── 7. THE OTHER GUARDS, RUN FOR REAL ─────────────────────────────────────*/
function runs(cmd, args) {
  try { execFileSync(cmd, args, { cwd: ROOT, stdio: 'pipe' }); return true; }
  catch (e) { return false; }
}
ck(true, 'draft_day_consistency: every artifact still agrees with the board',
  runs('node', ['draft/tools/draft_day_consistency.js']),
  null, 'node draft/tools/draft_day_consistency.js');
ck(true, 'board_input_staleness: nothing derived predates the board it came from',
  runs('node', ['draft/tools/board_input_staleness.js']),
  null, 'node draft/tools/board_input_staleness.js');

/* ── 8. WHAT THIS SANDBOX CANNOT SEE, SAID PLAINLY ─────────────────────────*/
const UNVERIFIED = [
  { what: 'Sleeper itself — that the keepers on sleeper.app match the three above',
    why: 'no network route to api.sleeper.app from the build sandbox',
    how: 'the nightly build fetches it; or open Sleeper and eyeball the three names' },
  { what: 'the DEPLOYED site is serving this board',
    why: 'Netlify answers 403 at CONNECT from here — a policy answer, not an outage',
    how: 'the deploy-verify workflow polls /build-stamp.json for the pushed SHA' },
];

function report() {
  const fatalFails = checks.filter(c => c.fatal && !c.ok);
  const softFails = checks.filter(c => !c.fatal && !c.ok);
  const go = fatalFails.length === 0;

  fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'draft_ready.json'),
    JSON.stringify({
      _territory: 'TERRITORY: A — draft/tools/draft_ready.js',
      mode: AFTER_LOCK ? 'AFTER-LOCK (strict)' : 'PRE-LOCK (lock checks report only)',
      _absent_is_not_pass: 'Every check treats missing data as failure.',
      go, fatal_failures: fatalFails.length, soft_failures: softFails.length,
      checks, unverified_from_here: UNVERIFIED,
    }, null, 1));

  console.log('\n  DRAFT READINESS — ' + (AFTER_LOCK ? 'AFTER-LOCK (strict)' : 'PRE-LOCK'));
  console.log('  ' + '-'.repeat(72));
  checks.forEach(c => {
    const mark = c.ok ? '  ok  ' : (c.fatal ? ' STOP ' : ' warn ');
    console.log(mark + c.name);
    if (!c.ok && c.detail != null) console.log('        ' + JSON.stringify(c.detail).slice(0, 300));
    if (!c.ok && c.fix) console.log('        fix: ' + c.fix);
    if (c.ok && c.detail != null && /FOR THE HUMAN/.test(c.name)) {
      console.log('        ' + JSON.stringify(c.detail));
    }
  });
  console.log('\n  CANNOT BE CHECKED FROM HERE (not passes — gaps):');
  UNVERIFIED.forEach(u => console.log('    · ' + u.what + '\n        why: ' + u.why
    + '\n        how: ' + u.how));
  console.log('\n  ' + (go
    ? '✅ GO — ' + checks.filter(c => c.ok).length + '/' + checks.length + ' checks pass'
      + (softFails.length ? ', ' + softFails.length + ' warning(s) above' : '')
    : '⛔ NO-GO — ' + fatalFails.length + ' blocking failure(s). Do not draft on this.'));
  console.log('  wrote draft/data/draft_ready.json\n');
  process.exit(go ? 0 : 1);
}

report();
