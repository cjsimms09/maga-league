/* KILL THE PAGE MID-DRAFT AND COME BACK. Cory's requirement, verbatim:
 * "I want to be able to kill the page mid-mock and come back to where I was.
 *  If that is not demonstrable before the 22nd, I am drafting off the print sheet."
 *
 * So this drives a REAL round trip through a fake localStorage against the REAL
 * board, rather than scanning app.js for the word "localStorage". A source scan
 * cannot tell a working round trip from a comment describing one (rule 11e).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DS = require(path.join(ROOT, 'public', 'js', 'draft', 'draft_session.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d ? '\n        -> ' + d : ''))); };

const board = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const players = board.players;
const keepers = board.kept_players;

function fakeStorage() {
  const m = {};
  return { setItem: (k, v) => { m[k] = String(v); }, getItem: k => (k in m ? m[k] : null),
    removeItem: k => { delete m[k]; }, _m: m };
}

// ── A DRAFT IN PROGRESS: 80 picks deep, which is where Cory lost his ────────
const drafted = new Set();
const rosters = {};
const myRoster = keepers.map(k => Object.assign({}, k, { is_keeper: true }));
myRoster.forEach(k => drafted.add(String(k.player_id)));
players.slice(0, 80).forEach((p, i) => {
  const slot = (i % 10) + 1;
  drafted.add(String(p.player_id));
  (rosters[slot] = rosters[slot] || []).push(p);
  if (slot === 8) myRoster.push(p);
});
const live = { mode: 'live', mockMode: 'mock', drafted, rosters, myRoster,
  recentPicks: [{ pick_no: 80, name: 'x' }], lastPickSeen: 80,
  pickContextId: 'ctx-80', clockMode: true, clockIndex: 3 };

const store = fakeStorage();
const w = DS.save(live, { built_at: board.built_at, mySlot: 8, now: '2026-08-13T00:00:00Z' }, store);
ck('the session writes', w.ok, w.reason);
ck('  and it is JSON on the storage key, not an object reference',
  typeof store._m[DS.KEY] === 'string' && store._m[DS.KEY].length > 100);

// THE PAGE DIES HERE. Everything above is gone; only `store` survives.
const saved = DS.load(store);
ck('a saved session with picks is resumable', DS.isResumable(saved));
// THE LOOKUP POOL IS players + kept_players. Keepers are deliberately OFF the
// draftable board; without them here, restore silently returns a roster three
// players short and the engine scores need and stack against it.
const r = DS.restore(saved, players, { built_at: board.built_at, alsoLookIn: keepers });
ck('the restore succeeds', r.ok, r.reason);
ck('  no warnings on the same board', r.warnings.length === 0, r.warnings.join(' | '));

// ── AND THE STATE THAT COMES BACK IS THE STATE THAT WENT IN ────────────────
ck('every drafted player came back',
  r.state.drafted.size === drafted.size, r.state.drafted.size + ' vs ' + drafted.size);
ck('  including the exact ids, not just the count',
  [...drafted].every(id => r.state.drafted.has(id)));
ck('my roster came back at full length',
  r.state.myRoster.length === myRoster.length,
  r.state.myRoster.length + ' vs ' + myRoster.length);
ck('  and the KEEPERS came back at all (they are not on the draftable board)',
  r.state.myRoster.filter(p => p.is_keeper).length === 3,
  'kept_players is disjoint from players — a restore that looks only at the '
  + 'board returns a roster three players short, silently');
ck('  and the three keepers are still flagged is_keeper',
  r.state.myRoster.filter(p => p.is_keeper).length === 3,
  'the flag is CARRIED, not re-derived from the slate — a second derivation of '
  + 'the same fact is free to disagree with the first');
ck('  and is_keeper did not leak onto the shared board rows',
  players.filter(p => p.is_keeper).length === 0,
  'restore must copy, not stamp the board object every other surface reads');
ck('every seat roster came back with the right counts',
  Object.keys(rosters).every(s => r.state.rosters[s].length === rosters[s].length));
ck('the clock position came back', r.state.lastPickSeen === 80
  && r.state.pickContextId === 'ctx-80' && r.state.clockMode === true
  && r.state.clockIndex === 3);
ck('the mode came back', r.state.mode === 'live' && r.state.mockMode === 'mock');
ck('my seat came back', r.mySlot === 8);

// ── AND IT REFUSES, RATHER THAN RESTORING SOMETHING WRONG ──────────────────
ck('a fresh page with no picks is NOT offered as a resume',
  !DS.isResumable(DS.serialize({ drafted: new Set(), myRoster: [] }, {})),
  'a banner that is always there is not a signal');
ck('a future schema version is REFUSED, not guessed at',
  DS.restore(Object.assign({}, saved, { v: 99 }), players, { alsoLookIn: keepers }).ok === false);
ck('a rebuilt board is REPORTED, not silently restored onto',
  DS.restore(saved, players, { built_at: '2026-09-01T00:00:00Z', alsoLookIn: keepers })
    .warnings.some(x => /rebuilt/.test(x)),
  'ADP, projections and tiers all move on a rebuild — the picks are intact but '
  + 'the numbers behind them are not the ones they were made against');

// THE ERROR THAT WOULD ACTIVELY MISLEAD A LIVE DRAFT.
const gone = players.filter(p => String(p.player_id) !== [...drafted][5]);
const r2 = DS.restore(saved, gone, { built_at: board.built_at, alsoLookIn: keepers });
ck('a drafted player who left the pool is STILL HELD AS TAKEN',
  r2.state.drafted.size === drafted.size,
  'dropping him hands a taken player back to the board as available — the one '
  + 'restore error that actively misleads rather than merely losing information');
ck('  and the caller is told he could not be named',
  r2.warnings.some(x => /no longer in the pool/.test(x)));

// ── A WRITE FAILURE REPORTS RATHER THAN THROWS ─────────────────────────────
const badStore = { setItem: () => { throw new Error('QuotaExceededError'); },
  getItem: () => null, removeItem: () => {} };
const bad = DS.save(live, {}, badStore);
ck('a storage failure is reported, never thrown on the clock',
  bad.ok === false && !!bad.reason,
  'a lost recovery point is bad; an exception mid-draft is worse');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
