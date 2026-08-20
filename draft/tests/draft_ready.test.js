// TERRITORY: A
/* THE READINESS GATE MUST BE ABLE TO SAY NO.
 *
 * Cory, 2026-08-20: "We need to be full go for draft! No mistakes"
 *
 * A go/no-go checklist that cannot fail is theatre, and this repository has
 * shipped that exact thing before — 21 vacuous `check(..., true)` assertions
 * across 13 suites (task 23), and four test files that collected ZERO tests
 * while reading as green (register, tonight). So every arm of draft_ready.js is
 * exercised here against a DELIBERATELY BROKEN board, and must refuse it.
 *
 * The pattern is break-first: corrupt one thing, assert the gate catches THAT
 * thing. A gate that fails for the wrong reason is not evidence.
 *
 * Run: node draft/tests/draft_ready.test.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let fails = [];
function ck(name, cond, detail) {
  if (cond) console.log('PASS  ' + name);
  else {
    fails.push(name);
    console.log('FAIL  ' + name
      + (detail === undefined ? '' : '  — ' + JSON.stringify(detail).slice(0, 300)));
  }
}

/* Run the real tool in a throwaway copy of the repo's data files. */
function runGate(mutate, afterLock) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-'));
  const pub = path.join(dir, 'public');
  const cfg = path.join(dir, 'draft', 'config');
  const dat = path.join(dir, 'draft', 'data');
  const tools = path.join(dir, 'draft', 'tools');
  [pub, cfg, dat, tools].forEach(d => fs.mkdirSync(d, { recursive: true }));

  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const keepers = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'config', 'keepers.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
  const seat = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));
  const freeze = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'pre_draft_freeze_2026.json'), 'utf8'));
  /* The alternate source boards travel in the bag too, so a mutator can keep
   * the fixture COHERENT. They are not auto-synced: the staleness BREAK arm
   * below depends on the board moving while these stay behind, which is the
   * real-world failure it models. */
  const SRC_BOARDS = ['board_ds.json', 'board_sleeper.json', 'board_own.json', 'board_fp.json'];
  const sourceBoards = {};
  SRC_BOARDS.forEach(f => {
    const q = path.join(ROOT, 'public', f);
    if (fs.existsSync(q)) sourceBoards[f] = JSON.parse(fs.readFileSync(q, 'utf8'));
  });
  const bag = { board, keepers, config, seat, freeze, sourceBoards };
  if (mutate) mutate(bag);

  fs.writeFileSync(path.join(pub, 'draft_data.json'), JSON.stringify(bag.board));
  fs.writeFileSync(path.join(cfg, 'keepers.json'), JSON.stringify(bag.keepers));
  fs.writeFileSync(path.join(cfg, 'league_config.json'), JSON.stringify(bag.config));
  fs.writeFileSync(path.join(pub, 'seat_plan.json'), JSON.stringify(bag.seat));
  fs.writeFileSync(path.join(dat, 'pre_draft_freeze_2026.json'), JSON.stringify(bag.freeze));
  ['source_boards.json', 'mlv_plan.json', 'position_boards.json'].forEach(f => {
    const src = path.join(ROOT, 'public', f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(pub, f));
  });
  Object.keys(bag.sourceBoards).forEach(f =>
    fs.writeFileSync(path.join(pub, f), JSON.stringify(bag.sourceBoards[f])));
  // the two sub-guards the gate shells out to
  ['draft_day_consistency.js', 'board_input_staleness.js'].forEach(f => {
    fs.writeFileSync(path.join(tools, f), 'process.exit(0);\n');
  });
  fs.copyFileSync(path.join(ROOT, 'draft', 'tools', 'draft_ready.js'),
    path.join(tools, 'draft_ready.js'));

  const args = [path.join(tools, 'draft_ready.js')];
  if (afterLock) args.push('--after-lock');
  const r = spawnSync('node', args, { cwd: dir, encoding: 'utf8' });
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(path.join(dat, 'draft_ready.json'), 'utf8')); }
  catch (e) { /* the gate may exit before writing */ }
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), doc };
}

const failedNames = res => (res.doc ? res.doc.checks.filter(c => !c.ok && c.fatal).map(c => c.name) : []);
const caught = (res, needle) => failedNames(res).some(n => n.toLowerCase().includes(needle.toLowerCase()));

/* ── 0. THE CONTROL — an otherwise-good repo must pass pre-lock ────────────
 *
 * ⚠️ THE CONTROL FRESHENS `built_at`, AND THAT IS THE FIX FOR A REAL FLAW IN
 * THIS TEST'S FIRST VERSION. It used the repo untouched, so the moment the live
 * board passed 24 hours old the control failed — meaning this whole suite went
 * red exactly when the gate was doing its job and Cory most needed to trust it.
 * A control that depends on the wall clock tests the calendar, not the code.
 * Staleness is still tested, hard, by its own BREAK arm below. */
const fresh = b => {
  b.board.built_at = new Date().toISOString();
  Object.values(b.sourceBoards).forEach(d => { d.built_from_board = b.board.built_at; });
};
const clean = runGate(fresh, false);
ck('CONTROL — the real, unmutated repo passes the pre-lock gate. Without this '
   + 'every "it caught the break" below could just be a gate that always fails.',
  clean.code === 0, { code: clean.code, fatal: failedNames(clean) });

/* ── 1. KEEPERS — the thing Cory named first ───────────────────────────────*/
let r = runGate(b => { b.board.kept_players = b.board.kept_players.slice(0, 2); }, false);
ck('BREAK: a keeper vanishes from the board -> the gate REFUSES',
  r.code !== 0 && caught(r, 'keeper COUNT'), failedNames(r));

r = runGate(b => { b.board.kept_players[0].player_id = '999999'; }, false);
ck('BREAK: a keeper id is changed -> refused (ids compared, not just counts)',
  r.code !== 0 && caught(r, 'PLAYER IDS'), failedNames(r));

r = runGate(b => { b.board.kept_players[0].name = 'Somebody Else'; }, false);
ck('BREAK: an id resolves to a DIFFERENT MAN -> refused. This is the worst '
   + 'version of the failure and a count check alone would miss it.',
  r.code !== 0 && caught(r, 'NAMES AND POSITIONS'), failedNames(r));

r = runGate(b => { b.board.kept_player_ids = ['1', '2', '3']; }, false);
ck('BREAK: the board\'s TWO keeper lists disagree with each other -> refused',
  r.code !== 0 && caught(r, 'agrees with board.kept_players'), failedNames(r));

r = runGate(b => {
  const t = b.keepers.teams.find(x => x.draft_slot === b.config.my_draft_slot);
  t.slot_provisional = true;
}, false);
ck('BREAK: Cory\'s draft slot goes provisional -> refused (a moving seat moves '
   + 'every pick he plans around)',
  r.code !== 0 && caught(r, 'NOT provisional'), failedNames(r));

/* ── 2. ABSENT IS NOT PASS — the rule the whole file is built on ───────────*/
r = runGate(b => { delete b.board.keeper_slate; }, false);
ck('BREAK: keeper_slate ABSENT -> refused, not silently passed. This is exactly '
   + 'how a missing key returning None slipped past an `is False` assertion '
   + 'tonight (register 151).',
  r.code !== 0 && caught(r, 'keeper_slate at all'), failedNames(r));

r = runGate(b => { b.board.built_at = '2020-01-01T00:00:00Z'; }, false);
ck('BREAK: a stale board -> refused', r.code !== 0 && caught(r, 'within the last 24 hours'),
  failedNames(r));

r = runGate(b => { delete b.board.post_processed_at; }, false);
ck('BREAK: the post-processing chain did not run -> refused (the war room would '
   + 'show pre-blend numbers)',
  r.code !== 0 && caught(r, 'post-processing chain'), failedNames(r));

/* ── 3. THE SCHEDULE ──────────────────────────────────────────────────────*/
r = runGate(b => { b.seat.my_picks = [1, 2, 3]; }, false);
ck('BREAK: the wrong number of picks -> refused (register 98 was an '
   + 'eighteen-pick artifact quoted for hours)',
  r.code !== 0 && caught(r, 'TWELVE picks'), failedNames(r));

/* ── 4. THE ARTIFACTS ─────────────────────────────────────────────────────*/
r = runGate(b => { b.board.built_at = new Date(Date.now() - 3600e3).toISOString(); }, false);
ck('BREAK: the board is rebuilt but the source boards are not -> refused. A '
   + 'toggle serving pre-lock replacement levels is worse than no toggle.',
  r.code !== 0 && caught(r, 'built from THIS board'), failedNames(r));

/* ── 5. THE AFTER-LOCK MODE IS ACTUALLY STRICTER ───────────────────────────*/
const pre = runGate(fresh, false);
const post = runGate(fresh, true);
ck('the SAME repo passes pre-lock and FAILS after-lock — the two modes are '
   + 'genuinely different, not a flag that does nothing',
  pre.code === 0 && post.code !== 0,
  { pre: pre.code, post: post.code, post_fatal: failedNames(post) });

['lock has PASSED', 'slate TRUTH', 'has designated', 'SEALED'].forEach(n => {
  ck('after-lock, "' + n + '" is FATAL rather than a warning', caught(post, n),
    failedNames(post));
});

/* ── 6. IT MUST NOT CLAIM WHAT IT CANNOT SEE ──────────────────────────────*/
ck('the gate reports Sleeper and the deployed site as UNVERIFIED gaps rather '
   + 'than passes — a checklist that downgrades what it could not reach is '
   + 'worse than no checklist',
  clean.doc && (clean.doc.unverified_from_here || []).length >= 2
    && /403|no network route/.test(JSON.stringify(clean.doc.unverified_from_here)),
  clean.doc ? clean.doc.unverified_from_here : null);

console.log('\n%d checks, %d failed', 18, fails.length);
if (fails.length) { console.log('FAILED'); process.exit(1); }
