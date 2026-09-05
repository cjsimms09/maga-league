// TERRITORY: A
// `kept_players` IS THE WHOLE LEAGUE'S KEEPERS. USING IT AS *MY* ROSTER IS THE
// MOST-REPEATED BUG IN THIS REPOSITORY — 21 files on `main` carry a "MY SEAT
// ONLY" / "FILTERED TO CORY'S SEAT" repair comment, counted 2026-09-05, and
// three more were found the same day by the sweep that produced this file.
//
// The board splits keepers out of `players` (register 80). Since the 08-22
// rebuild `kept_players` carries all ten teams' 23 keepers — Cory owns 3 of
// them, at slot 8. Two different lists live in one field:
//
//   · OFF THE BOARD  — all 23. Correct, and every tool needs it.
//   · MY ROSTER      — the 3 with `team_slot === my_draft_slot`.
//
// Seeding a roster with 23 is not a small error. Every roster-aware term reads
// a lineup that is three times full, so `need` is satisfied at every position
// and the tool suppresses exactly what the seat still needs. Register 276
// measured that mechanism; register 269 is the loud version, where the mismatch
// threw instead of lying quietly.
//
// ⚠️ THIS FILE EXISTS BECAUSE THE ROWS WERE CLOSED AND THE CLASS WAS NOT.
// Registers 269, 276 and 437 each fixed the instances they named. On 2026-09-05
// the sweep register 437 asked for and never got was finally run across every
// file mentioning `kept_players` — 205 of them, against the 83 in the scope the
// hand sweep would have covered — and it found THREE more instances nobody had
// checked: `mock_walk.js:62`, `normalisation_probe.js:12`, and the fixture in
// `keeper_seeded_with_a_value.test.js`, a suite whose own prose says "he holds
// three keepers" while seeding twenty-three.
//
// Nine of Cory's twelve picks changed when mock_walk was corrected, and — the
// part that matters — the corrected walk draws a TE at 48 and a QB at 88 where
// the phantom roster drew neither. That is register 276's predicted mechanism
// ("a phantom roster already holding a QB and a TE keeps `need` satisfied all
// the way down") reproducing in a tool that row never named.
//
// A row closes. A class needs a guard. This is the guard.
//
// Run: node draft/tests/kept_players_is_the_league.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0;
function ok(name, fn) { fn(); console.log('PASS  ' + name); pass++; }

/* The shape that is always wrong: `kept_players` assigned or mapped straight
 * into something named like a roster, with no `team_slot` filter anywhere near
 * it. Deliberately narrow — a guard that fires on ordinary work is a guard
 * people delete (registers 388, 417, 422). */
const MENTION = /kept_players/;
const FILTER = /team_slot|my_?keepers|myKeepers|mine_only|MY_SLOT|my_draft_slot/i;
const ROSTER_USE = /\b(roster|myRoster|MY_KEEPERS|myKeepers)\b\s*=|\bis_keeper\s*:\s*true/;

/* ⚠️ THE DETECTOR IS TWO-STEP, AND THE ONE-STEP VERSION WAS WRONG TWICE.
 *
 * First cut: "kept_players mentioned, and a roster word somewhere in a window,
 * and no team_slot". That is a proximity heuristic over source code, and it
 * behaved exactly like every proximity heuristic this repo has tried. At a
 * 4-line backward reach it flagged `_empty_roster_fiction_precondition.js`,
 * whose filter sat six lines above the match; widening the reach to 14 then
 * flagged `waiver_prices_keepers.test.js` (the phrase inside a TEST NAME) and
 * `member.js:2533` (`players.concat(kept_players)` building a lookup index —
 * the correct union use, in the one file where getting it wrong would be
 * league-facing). Three false positives, zero true ones, from widening a
 * window by ten lines.
 *
 * So it follows the VARIABLE instead. Bind the name assigned from
 * `kept_players`, then flag only when THAT name is turned into a roster. A
 * union built for an id lookup never becomes a roster; a test title is not an
 * assignment; and a filter anywhere on the binding chain clears it. */
const BIND = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;]*kept_players/;

function scan(dirs) {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!/\.(js|py)$/.test(e.name)) continue;
      /* This file quotes the defect verbatim as its known positive, so it
       * matches its own detector. Excluding it by NAME rather than by a
       * cleverer pattern: the fixture must stay byte-identical to the real
       * code, and any rule that stopped matching it here would stop matching
       * it in the tree too. */
      if (e.name === 'kept_players_is_the_league.test.js') continue;
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      lines.forEach((ln, i) => {
        if (!MENTION.test(ln)) return;
        /* A comment mentioning the field is prose about the bug, not the bug.
         * Every fix in this class LEFT such a comment behind, so counting them
         * would make the guard fire loudest on the files already repaired. */
        const code = ln.replace(/^\s*(\/\/|\/\*|\*|#).*$/, '');
        if (!code.trim()) return;

        //: STEP 1 — what name did `kept_players` get bound to on this line?
        const bind = code.match(BIND);
        //: a direct `art.kept_players.map(...)` binds nothing; treat the
        //: expression itself as the subject so it is still checked.
        const name = bind ? bind[1] : null;
        if (!name && !/kept_players\s*(\||\)|\]|\s)*\.\s*(map|forEach|filter|slice)/.test(code)
            && !ROSTER_USE.test(code)) return;

        //: STEP 2 — is that name (or the direct expression) turned into a
        //: roster within reach, and is there a seat filter on the way?
        const after = lines.slice(i, i + 15).join('\n');
        const subject = name ? new RegExp('\\b' + name + '\\b') : /kept_players/;
        const rosterLines = after.split('\n').filter(l => ROSTER_USE.test(l) && subject.test(l));
        if (!rosterLines.length) return;
        //: the filter may sit on the binding line, on the roster line, or on a
        //: line between them — all three are the same correct code.
        if (FILTER.test(lines.slice(Math.max(0, i - 3), i + 15).join('\n'))) return;
        hits.push(path.relative(ROOT, p) + ':' + (i + 1) + '  ' + ln.trim().slice(0, 90));
      });
    }
  };
  dirs.forEach(d => { const full = path.join(ROOT, d); if (fs.existsSync(full)) walk(full); });
  return hits;
}

ok('⭐ KNOWN POSITIVE — the real mock_walk.js:62 defect is detected. Taken '
  + 'VERBATIM from the code as it stood on 2026-09-05, not invented (register '
  + '121): if this stops firing, the detector has stopped detecting', () => {
  const tmp = path.join(ROOT, 'draft', 'tests', '_kept_players_fixture_tmp.js');
  fs.writeFileSync(tmp, [
    'const KEEPERS = board.kept_players;',
    'const drafted = new Set();',
    'KEEPERS.forEach(k => drafted.add(String(k.player_id)));',
    'const myRoster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));',
  ].join('\n'));
  try {
    const hits = scan(['draft/tests/_kept_players_fixture_tmp.js'].map(p => path.dirname(p)))
      .filter(h => h.includes('_kept_players_fixture_tmp'));
    assert.ok(hits.length >= 1, 'the known defect must be flagged, got: ' + JSON.stringify(hits));
  } finally { fs.unlinkSync(tmp); }
});

ok('  FAIL ARM — the SAME code with the team_slot filter is NOT flagged, so '
  + 'this is a detector and not a keyword alarm on the field name', () => {
  const tmp = path.join(ROOT, 'draft', 'tests', '_kept_players_fixture_tmp.js');
  fs.writeFileSync(tmp, [
    'const KEEPERS = board.kept_players;',
    'KEEPERS.forEach(k => drafted.add(String(k.player_id)));',
    'const MY_KEEPERS = KEEPERS.filter(k => Number(k.team_slot) === Number(MY_SLOT));',
    'const myRoster = MY_KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));',
  ].join('\n'));
  try {
    const hits = scan(['draft/tests']).filter(h => h.includes('_kept_players_fixture_tmp'));
    assert.deepStrictEqual(hits, [], 'the corrected form must not be flagged');
  } finally { fs.unlinkSync(tmp); }
});

ok('  CONTROL — a file that only takes all 23 OFF THE BOARD is not flagged. '
  + 'That use is correct and universal; flagging it would make this guard fire '
  + 'on every consumer and get it switched off', () => {
  const tmp = path.join(ROOT, 'draft', 'tests', '_kept_players_fixture_tmp.js');
  fs.writeFileSync(tmp, [
    'const gone = new Set();',
    '(board.kept_players || []).forEach(k => gone.add(String(k.player_id)));',
  ].join('\n'));
  try {
    const hits = scan(['draft/tests']).filter(h => h.includes('_kept_players_fixture_tmp'));
    assert.deepStrictEqual(hits, [], 'the off-the-board use must not be flagged');
  } finally { fs.unlinkSync(tmp); }
});

ok('THE LIVE TREE carries no unfiltered roster read of `kept_players` — swept '
  + 'across draft/, src/, netlify/ and public/js/: 205 files mention the field '
  + 'on 2026-09-05, of which 83 sit in draft/tools, src, netlify and public/js '
  + '(the hand sweep\'s scope) and the rest in draft/tests and draft/backtest, '
  + 'which the hand sweep did NOT reach and this one does', () => {
  const hits = scan(['draft', 'src', 'netlify', 'public/js']);
  assert.deepStrictEqual(hits, [],
    'kept_players read as MY roster without a team_slot filter:\n  ' + hits.join('\n  '));
});

ok('CONTROL — the sweep really reaches the files it claims to, so a clean '
  + 'result is a measurement rather than a walker that found nothing (rule 3e)', () => {
  let seen = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!/\.(js|py)$/.test(e.name)) continue;
      if (MENTION.test(fs.readFileSync(p, 'utf8'))) seen++;
    }
  };
  ['draft', 'src', 'netlify', 'public/js'].forEach(d => {
    const full = path.join(ROOT, d); if (fs.existsSync(full)) walk(full);
  });
  //: 205 on 2026-09-05. A floor, not a pin — the count grows with the repo, and
  //: pinning it exactly would make every new consumer a test failure. The floor
  //: is set well below today's count so ordinary deletions do not red the build,
  //: and well above zero so a walker that stopped walking is caught.
  assert.ok(seen >= 120, 'only ' + seen + ' files mention kept_players — the '
    + 'sweep is not reaching the tree it is supposed to');
  console.log('        (' + seen + ' files mention kept_players)');
});

ok('CONTROL — the board really does carry ten teams\' keepers and only three '
  + 'at Cory\'s seat, which is the fact the whole class rests on', () => {
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const kept = board.kept_players || [];
  const mySlot = Number(board.league && board.league.my_draft_slot);
  const mine = kept.filter(k => Number(k.team_slot) === mySlot);
  assert.ok(kept.length > mine.length,
    'if these are ever equal the premise has changed and this guard needs re-reading '
    + '(kept ' + kept.length + ', mine ' + mine.length + ')');
  assert.ok(mine.length > 0, 'Cory holds keepers; zero means the filter matches nothing');
  console.log('        (' + kept.length + ' kept league-wide, ' + mine.length
    + ' at seat ' + mySlot + ')');
});

console.log('\n' + pass + '/' + pass + ' checks passed');
