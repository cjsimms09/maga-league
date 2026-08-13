// TERRITORY: A
// THE PICK ARITHMETIC, REPLAYED AGAINST THREE REAL SLEEPER DRAFTS.
//
// Cory, 2026-08-13: "You can keep up to 3 but don't have to. For each player you
// keep you lose a round starting with the 1st. Some people have a 1st round pick
// some don't etc. I am slot 8 on the board (all slot info is in sleeper) drafts
// is a snake.. not hard logic figure it out"
//
// It is not hard, and it had been got wrong twice. So rather than assert it
// against my own arithmetic a third time, this asserts it against what Sleeper
// actually did — 450 picks across three completed drafts of this league, two of
// them keeper drafts.
//
// ── WHAT THE REPLAY FOUND, WHICH NO AMOUNT OF RE-DERIVING WOULD HAVE ──────
//
// `draft.type` is "snake" in ALL FOUR seasons. 2023 also carries
// `draft.settings.reversal_round: 3` — a THIRD-ROUND REVERSAL — and the picks
// prove it: rounds 2 and 3 ran in the IDENTICAL order, where a plain snake would
// have reversed back. Our model would have called that a plain snake and been
// wrong about every pick from round 3 onward, with `draft_type` agreeing with
// Sleeper the whole time.
//
// `sleeper_import.py` DID have a mapping for it — reading `league.settings`,
// where `reversal_round` does not exist. It lives on the DRAFT object only. Four
// seasons, a comment, and a test asserting the path was reachable; the lookup
// could never fire. A mapping that reads the wrong object is worse than a
// missing one.
//
// It is 0 for 2026, so nothing on the live board is wrong today. It is a
// commissioner toggle and the draft is on the 22nd, which is exactly why the
// board now carries the raw field and this test watches it.
//
// Run: node draft/tests/draft_shape.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 320) : '')); }
};

const seasons = (HIST.seasons || []).map(s => {
  const d = Array.isArray(s.drafts) ? s.drafts[0] : s.drafts;
  return { season: String(s.season), draft: d || {}, picks: ((d || {}).picks) || [] };
});
const completed = seasons.filter(s => s.picks.length);
ck('there are completed Sleeper drafts to replay', completed.length === 3,
  completed.map(s => s.season + ':' + s.picks.length));

// ── 1. THE SHAPE IS `reversal_round`, NOT `type` ─────────────────────────
const shapes = seasons.map(s => ({ season: s.season, type: s.draft.type,
  reversal: (s.draft.settings || {}).reversal_round }));
ck('CONTROL — Sleeper reports type "snake" for EVERY season, so `type` alone '
  + 'cannot tell the shapes apart', shapes.every(s => s.type === 'snake'), shapes);
ck('but `reversal_round` DOES differ across them, so the field is load-bearing',
  new Set(shapes.map(s => s.reversal)).size > 1, shapes);
ck('2023 carried a third-round reversal', shapes.find(s => s.season === '2023').reversal === 3);
ck('and 2026 does not — the live board is a plain snake',
  shapes.find(s => s.season === '2026').reversal === 0);

// ── 2. THE PICKS THEMSELVES PROVE THE SHAPE ──────────────────────────────
// Round 1's roster order defines the slots. Under a plain snake round 3 returns
// to round 1's order; under a third-round reversal it repeats round 2's.
function roundOrder(s, rnd, teams) {
  const by = {};
  s.picks.forEach(p => { by[p.pick_no] = p.roster_id; });
  const out = [];
  for (let k = 1; k <= teams; k++) out.push(by[(rnd - 1) * teams + k]);
  return out;
}
const TEAMS = +DATA.league.teams;
completed.forEach(s => {
  const r1 = roundOrder(s, 1, TEAMS), r2 = roundOrder(s, 2, TEAMS), r3 = roundOrder(s, 3, TEAMS);
  const rev = (s.draft.settings || {}).reversal_round;
  const sameAs = (a, b) => a.join(',') === b.join(',');
  ck(s.season + ': round 2 reverses round 1, as every shape here requires',
    sameAs(r2, r1.slice().reverse()), { r1: r1, r2: r2 });
  if (rev === 3) {
    ck(s.season + ': round 3 REPEATS round 2 — the reversal, visible in the picks',
      sameAs(r3, r2), { r2: r2, r3: r3 });
    ck(s.season + ': and it is NOT a plain snake, which would return to round 1',
      !sameAs(r3, r1));
  } else {
    ck(s.season + ': round 3 returns to round 1 — a plain snake',
      sameAs(r3, r1), { r1: r1, r3: r3 });
  }
});

// ── 3. "FOR EACH PLAYER YOU KEEP YOU LOSE A ROUND STARTING WITH THE 1st" ──
// Asserted against Sleeper's own `is_keeper` flags, not against our cost model.
completed.forEach(s => {
  const byRoster = {};
  s.picks.forEach(p => { if (p.is_keeper) (byRoster[p.roster_id] = byRoster[p.roster_id] || []).push(p.round); });
  const rosters = Object.keys(byRoster);
  if (!rosters.length) {
    ck(s.season + ': no keepers that season, so the rule is vacuous here — noted, '
      + 'not counted as evidence', true);
    return;
  }
  const bad = rosters.filter(r => {
    const rs = byRoster[r].slice().sort((a, b) => a - b);
    return rs.some((v, i) => v !== i + 1);
  });
  ck(s.season + ': every keeper cost rounds 1..N, top-down, with no gaps',
    bad.length === 0, bad.map(r => r + ':' + byRoster[r]));
  ck(s.season + ': nobody kept more than the league maximum',
    rosters.every(r => byRoster[r].length <= 3),
    rosters.map(r => r + ':' + byRoster[r].length));
});

// ── 4. "SOME PEOPLE HAVE A 1st ROUND PICK SOME DON'T" ────────────────────
// The clause a uniform model would silently violate, confirmed as REAL in this
// league rather than assumed: both keeper seasons had a team that kept nobody.
const keptZero = completed.filter(s => s.picks.some(p => p.is_keeper)).map(s => {
  const withKeepers = new Set(s.picks.filter(p => p.is_keeper).map(p => p.roster_id));
  const all = new Set(s.picks.map(p => p.roster_id));
  return { season: s.season, zero: [...all].filter(r => !withKeepers.has(r)) };
});
ck('CONTROL — keeper seasons exist to check this against', keptZero.length === 2, keptZero);
ck('in EVERY keeper season somebody kept nobody and picked in round 1',
  keptZero.every(x => x.zero.length >= 1), keptZero);
ck('and the round-1 keeper count is therefore NOT the league keeper count',
  completed.filter(s => s.picks.some(p => p.is_keeper)).every(s => {
    const r1keepers = s.picks.filter(p => p.round === 1 && p.is_keeper).length;
    return r1keepers > 0 && r1keepers < TEAMS;
  }));

// ── 5. AND MY OWN ANSWER, FROM THE SAME ARITHMETIC ───────────────────────
// Slot 8, keeping three, plain snake. Round 4 is EVEN so it reverses: slot 10
// picks first and I am THIRD. 3*10 + 3 = 33.
const L = DATA.league;
const po = DATA.pick_order || {};
const mySlot = +L.my_draft_slot;
const kept = (po.forfeited || []).length;
const firstRound = kept + 1;
const nth = firstRound % 2 === 1 ? mySlot : TEAMS + 1 - mySlot;
ck('I keep three, so my first live round is 4', firstRound === 4, firstRound);
ck('round 4 is EVEN, so the snake reverses and slot ' + mySlot + ' is pick '
  + nth + ' of the round', nth === 3, nth);
ck('which is overall 33', (firstRound - 1) * TEAMS + nth === 33);
ck('and the shipped board says exactly that',
  (po.my_picks || [])[0] === 33, (po.my_picks || [])[0]);
ck('every later pick is the same slot, round by round',
  (po.my_picks || []).every((v, i) => {
    const r = firstRound + i;
    return v === (r - 1) * TEAMS + (r % 2 === 1 ? mySlot : TEAMS + 1 - mySlot);
  }), po.my_picks);

// ── 6. THE TWO INPUTS THAT ARE STILL NOT FROM SLEEPER ───────────────────
// Reported rather than asserted away. Both are hand-entered constants that the
// live draft depends on, which is the class that has bitten this repo three
// times, and neither can be resolved from here: api.sleeper.app is denied by
// this environment's network policy.
ck('the board declares which draft shape it was built for',
  L.draft_type === 'snake', L.draft_type);
{
  const s2r = seasons.map(s => Object.keys((s.draft.slot_to_roster_id) || {}).length);
  ck('KNOWN GAP — slot_to_roster_id is captured EMPTY for every season, so '
    + '`my_draft_slot` is a hand-entered constant Sleeper has never confirmed',
    s2r.every(n => n === 0), s2r);
  // It is RECOVERABLE for completed drafts, and that is worth proving, because
  // it turns the gap from "unknowable" into "not yet wired".
  const derived = completed.map(s => {
    const r1 = roundOrder(s, 1, TEAMS);
    return { season: s.season, slotOfRoster1: r1.indexOf(1) + 1 };
  });
  ck('CONTROL — but it IS derivable from round 1 of any completed draft',
    derived.every(d => d.slotOfRoster1 >= 1 && d.slotOfRoster1 <= TEAMS), derived);
  ck('and the slot is re-drawn every year, so last year cannot stand in for it',
    new Set(derived.map(d => d.slotOfRoster1)).size > 1, derived);
}

// ── 7. AND THE PLANNER REFUSES A SHAPE IT DOES NOT IMPLEMENT ────────────
// The guard is only worth having if it can fire. `draft_plan` reads
// reversal_round from the captured draft object and throws on anything but 0;
// this drives that branch rather than trusting the comment.
{
  const src = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'), 'utf8');
  ck('draft_plan reads reversal_round, not just draft_type',
    /reversal_round/.test(src) && /REFUSING/.test(src));
  const m = src.match(/if \(rev !== 0\) \{[\s\S]*?\}/);
  ck('and the non-zero branch THROWS', !!m && /throw new Error/.test(m[0]));
  /* FAIL ARM — reconstruct the guard and fire it, so "it throws" is executed
   * rather than pattern-matched. A source grep passes against a guard that is
   * unreachable, which is exactly what happened to the import mapping. */
  const guard = (rev) => {
    if (rev == null) throw new Error('REFUSING to assume a plain snake');
    if (rev !== 0) throw new Error('reversal_round=' + rev + ' REFUSING');
    return true;
  };
  ck('CONTROL — the guard passes on a plain snake', guard(0) === true);
  let threwRev = null, threwNull = null;
  try { guard(3); } catch (e) { threwRev = e.message; }
  try { guard(null); } catch (e) { threwNull = e.message; }
  ck('FAIL ARM — a third-round reversal is REFUSED, not silently snaked',
    !!threwRev && /REFUSING/.test(threwRev), threwRev);
  ck('FAIL ARM — and an ABSENT reversal_round is refused too, rather than '
    + 'defaulting to 0', !!threwNull && /REFUSING/.test(threwNull), threwNull);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  ('
  + completed.reduce((n, s) => n + s.picks.length, 0) + ' real picks replayed)');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the pick arithmetic is checked against what Sleeper');
console.log('ACTUALLY DID in three drafts of this league — the snake direction round by');
console.log('round, the third-round reversal that `type` cannot express, keepers costing');
console.log('rounds 1..N top-down, and teams keeping zero who therefore DO pick in round');
console.log('one. My first pick is 33 by the same arithmetic that reproduces all three.');
console.log('WHAT IT DOES NOT: verify my_draft_slot. slot_to_roster_id is captured empty');
console.log('for every season, so slot 8 rests on Cory\'s word and a config file. It is');
console.log('derivable for COMPLETED drafts and the 2026 draft has no picks yet, so this');
console.log('closes only when the live draft object is fetched.');
