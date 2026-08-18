// TERRITORY: relay
// A FOLLOW-UP THAT LIVED IN A COMMENT, AND THE CHECK THAT NOW CARRIES IT.
//
// `withheld_slate_exposure.test.js` is a good suite — 23/23, a fail arm, an
// exactly-bounded exposure ("divergence at pick P is the number of keepers
// ranked outside the top (P-1)"). It closes like this:
//
//     "It also uses the PREDICTED slate — the real one locks 20 August, and the
//      one number to re-check then is whether any keeper ranks deeper than
//      pick 33."
//
// **Nobody was named and no date was carried.** That suite is green today and
// will be green on 23 August whether or not the re-check ever happens, because
// it measures the PREDICTED slate — which is the right thing for it to measure
// and precisely why it cannot be its own trigger. The relay owns "every finding
// gets followed up"; this is one that would not have been.
//
// So the follow-up is now a row in `draft/data/commitments.json` with a due date
// and a mechanical check in `commit_verify.js` that READS BOARD STATE — it
// cannot be satisfied by editing a status field.
//
// ── WHY THIS FILE EXISTS SEPARATELY ────────────────────────────────────────
//
// **Every interesting branch of that check lives on the far side of a keeper
// lock that has not happened.** Left alone, the MET path would ship unproven and
// run for the first time, for real, on draft morning. That is the exact shape
// `commitments_check.js`'s own header warns about: *"a check whose firing
// condition cannot be exercised is a check nobody has seen fire."*
//
// So all three exit codes are exercised here against fixtures, including the one
// that will not occur naturally until 20 August.
//
// Run: node draft/tests/slate_exposure_commitment.test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ID = 'slate-exposure-rechecked';

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-exp-'));
function board(doc) {
  const f = path.join(DIR, 'board-' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(f, JSON.stringify(doc), 'utf8');
  return f;
}
/* A FRESH require EACH TIME, because the check reads process.env at call time
 * but the module is cached — and a cached module reading a stale env is exactly
 * the kind of thing that would make every fixture below agree with itself. */
function run(file) {
  const prev = process.env.DRAFT_DATA_PATH;
  if (file === null) delete process.env.DRAFT_DATA_PATH;
  else process.env.DRAFT_DATA_PATH = file;
  delete require.cache[require.resolve(path.join(ROOT, 'draft', 'tools', 'commit_verify.js'))];
  const { CHECKS } = require(path.join(ROOT, 'draft', 'tools', 'commit_verify.js'));
  try { return CHECKS[ID](); }
  finally {
    if (prev === undefined) delete process.env.DRAFT_DATA_PATH;
    else process.env.DRAFT_DATA_PATH = prev;
  }
}

const CONFIRMED = {
  status: 'confirmed', confirmed: true, teams_expected: 10, teams_designated: 10,
  withheld_from_board: { withheld: false, teams: 0, keepers: 0 },
};

// ── THE ROW AND THE CHECK ARE ACTUALLY WIRED TO EACH OTHER ──────────────────
{
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'commitments.json'), 'utf8'));
  const row = (reg.commitments || []).find(r => r.id === ID);
  ck('the commitment row exists', !!row);
  ck('...and it carries a due date, an owner and a verify command',
    row && row.due && row.owner && row.verify, row);
  const { CHECKS } = require(path.join(ROOT, 'draft', 'tools', 'commit_verify.js'));
  ck('...and a check is implemented for its id, so commitments_check.js does not '
    + 'report it as "a date with no check"', !!CHECKS[ID]);
}

// ── EXIT 1 — NOT MET. The state today, and the state on any partial slate. ──
{
  const r = run(board({ keeper_slate: {
    status: 'predicted', confirmed: false, teams_expected: 10, teams_designated: 4,
    withheld_from_board: { withheld: true, teams: 3, keepers: 8 } } }));
  ck('NOT MET on a predicted slate', r.code === 1, r);
  ck('...and the reason names the counts rather than saying "not confirmed"',
    /4\/10/.test(r.why) && /8 keeper/.test(r.why), r.why);

  /* The contradiction case: a slate claiming confirmed while the board still
   * withholds. Both cannot be true, and the board is the one Cory drafts from. */
  const c = run(board({ keeper_slate: Object.assign({}, CONFIRMED,
    { withheld_from_board: { withheld: true, teams: 2, keepers: 5 } }) }));
  ck('NOT MET when the slate claims confirmed but keepers are still withheld',
    c.code === 1, c);
}

// ── EXIT 2 — CANNOT DETERMINE, AND IT IS NOT A PASS ────────────────────────
{
  ck('CANNOT DETERMINE when the board is unreadable',
    run(path.join(DIR, 'does-not-exist.json')).code === 2);
  ck('CANNOT DETERMINE when the board carries no keeper_slate at all — absent '
    + 'is not unmet and neither is met',
  run(board({ players: [] })).code === 2);
  ck('CANNOT DETERMINE when confirmed but the board has no my_picks, so '
    + '"deeper than my first pick" has no referent',
  run(board({ keeper_slate: CONFIRMED, kept_players: [{ name: 'X', adjusted_adp: 5 }] })).code === 2);
  ck('CANNOT DETERMINE when confirmed but no keeper carries an ADP',
    run(board({ keeper_slate: CONFIRMED, pick_order: { my_picks: [33] },
      kept_players: [{ name: 'X' }] })).code === 2);
}

// ── EXIT 0 — MET. THE BRANCH THAT CANNOT HAPPEN UNTIL 20 AUGUST. ───────────
{
  const shallow = run(board({ keeper_slate: CONFIRMED, pick_order: { my_picks: [33, 48] },
    kept_players: [{ name: 'A', adjusted_adp: 3 }, { name: 'B', adjusted_adp: 22 },
      { name: 'C', adjusted_adp: 31 }] }));
  ck('MET when the slate is confirmed and every keeper is inside the window',
    shallow.code === 0, shallow);
  ck('...and it says so in the study\'s own terms rather than just "ok"',
    /0 rank deeper/.test(shallow.why) && /coincide/.test(shallow.why), shallow.why);

  /* THE ANSWER THE STUDY ASKED FOR. A keeper deeper than pick 33 is the whole
   * question, and the check must NAME him — a count with no name is not
   * something Cory can act on at 8s/pick. */
  const deep = run(board({ keeper_slate: CONFIRMED, pick_order: { my_picks: [33] },
    kept_players: [{ name: 'Shallow Guy', adjusted_adp: 12 },
      { name: 'Deep Keeper', adjusted_adp: 60 }] }));
  ck('MET, but it counts and NAMES the keeper ranked deeper than my first pick',
    deep.code === 0 && /1 rank deeper/.test(deep.why) && /Deep Keeper @60/.test(deep.why),
    deep.why);
  ck('...and it states the consequence — one freed player at the boundary each',
    /frees one player/.test(deep.why), deep.why);

  /* CONTROL for the boundary itself: a keeper AT pick 33 is inside the window
   * (`byAdp.slice(0, pick-1)` removes the top 32), one at 33.5 is outside. If
   * these two came back the same the count would be measuring nothing. */
  const at = run(board({ keeper_slate: CONFIRMED, pick_order: { my_picks: [33] },
    kept_players: [{ name: 'On The Line', adjusted_adp: 32 }] }));
  const past = run(board({ keeper_slate: CONFIRMED, pick_order: { my_picks: [33] },
    kept_players: [{ name: 'Past The Line', adjusted_adp: 33 }] }));
  ck('CONTROL: the boundary discriminates — ADP 32 is inside the window, 33 is not',
    /0 rank deeper/.test(at.why) && /1 rank deeper/.test(past.why),
    { at: at.why, past: past.why });
}

// ── THE DEFAULT PATH IS UNCHANGED, WHICH IS THE WHOLE PRICE OF THE OVERRIDE ─
{
  const live = run(null);
  ck('with no override the check reads the REAL board and returns a real verdict',
    [0, 1, 2].indexOf(live.code) >= 0 && /predicted|confirmed|keeper_slate/.test(live.why), live);
  const src = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'commit_verify.js'), 'utf8');
  ck('...and the default path is still the committed board, spelled literally',
    src.indexOf("'public/draft_data.json'") > 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
