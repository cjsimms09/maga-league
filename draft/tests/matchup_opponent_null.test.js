#!/usr/bin/env node
'use strict';
// TERRITORY: B
//
// ── /matchup INVENTED AN OPPONENT IN ANY WEEK WHOSE SLATE IS NOT POSTED ─────
//
// Sleeper returns a row per roster with `matchup_id: null` for a week whose
// schedule has not been posted. `sleeper.js` paired opponents on
//
//     m.matchup_id === row.matchup_id
//
// and `null === null` is TRUE — so with the slate unposted it returned
// whichever roster came next in the array. Week 1 before the schedule lands
// rendered "Cory 0.00 you vs Marian 0.00", carrying the real all-time
// head-to-head against her, a trash thread, and a one-tap side bet: a real
// wager against a person you are not playing.
//
// A NULL IS NOT AN IDENTIFIER. Found by driving the unposted-slate state, not
// by reading the code — nothing about the line looks wrong until you ask what
// it does when every id is absent.
//
// ── WHY THIS IS AT THE ENGINE AND NOT AT THE PAGE ──────────────────────────
//
// The defect is arithmetic, so it is stated as arithmetic. A rendered-sentence
// assertion would pass or fail on copy edits that have nothing to do with it,
// and it would need a browser to say something a pure function can answer.
// The page's wording is guarded separately.
//
// ⚠️ SLEEPER_BASE IS SET BEFORE THE REQUIRE, and that is the whole point.
// `src/sleeper.js` reads `process.env.SLEEPER_BASE` ONCE, at module load. Set
// it after the require and the assignment is a no-op that reads as isolation —
// a sibling suite passed that way for a week only because this sandbox's proxy
// happens to 403 the real API, and went red on CI, which has internet.
process.env.SLEEPER_BASE = 'http://127.0.0.1:1';

const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mopp-'));
const sleeper = require(path.join(ROOT, 'src', 'sleeper'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n
    + (d !== undefined ? '  — ' + JSON.stringify(d).slice(0, 300) : ''))); };

const map = { 1: 1, 2: 2, 3: 3, 4: 4 };
const owners = [{ id: 1, name: 'Cory' }, { id: 2, name: 'Marian' },
  { id: 3, name: 'David' }, { id: 4, name: 'Michael' }];
const rows = ids => ({
  week: 1, users: [], rosters: [1, 2, 3, 4].map(r => ({ roster_id: r })),
  matchups: [1, 2, 3, 4].map((r, i) => ({ roster_id: r, matchup_id: ids[i], points: 0 })),
});

const unposted = sleeper.myMatchup(rows([null, null, null, null]), map, 1, owners);
ck('an unposted slate yields NO opponent, not the next roster in the array',
  unposted && unposted.opp === null, unposted && unposted.opp);

// ⚠️ THE CONTROL IS NOT OPTIONAL HERE. Every clause above is a "should be
// null" clause, and a myMatchup() that returned null for EVERYTHING would
// satisfy them all. This is the assertion that says the pairing still works.
const posted = sleeper.myMatchup(rows([1, 1, 2, 2]), map, 1, owners);
ck('CONTROL — a posted slate still pairs correctly, so the null guard did not '
  + 'simply switch opponents off',
  posted && posted.opp && posted.opp.owner && posted.opp.owner.name === 'Marian',
  posted && posted.opp);

// A real bye — my row has no id while everyone else's does — is also not a
// game, and the two rows without ids must not be paired with each other.
const bye = sleeper.myMatchup(rows([null, 1, 1, null]), map, 1, owners);
ck('a bye row is not paired with the other bye row', bye && bye.opp === null,
  bye && bye.opp);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('FAILED'); process.exit(1); }
