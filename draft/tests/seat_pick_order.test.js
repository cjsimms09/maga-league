'use strict';
/* SEAT -> PICK ORDER. The board is baked for ONE seat; changing seats must
 * REBUILD the order, never filter the baked one.
 *
 * THE BUG THIS PINS (2026-08-10, draft-critical). `setSlot` recomputed my picks
 * as `pick_order.picks.filter(p => p.slot === n)`. The shipped board carries
 * keeper forfeits BAKED IN — 147 picks, not 150, because Cory's rounds 1-3 are
 * gone to Henry / Chase / Walker. So slot 4 has 12 rows and every other slot has
 * 15. Filtering by any seat that is not 4 therefore returns that seat's
 * UNFORFEITED 15-pick sequence, numbered inside a sequence that compressed three
 * picks out of seat 4: three picks that do not exist, and a first pick wrong by
 * more than two full rounds.
 *
 * Nothing would have errored. A filter over a real board always returns
 * something plausible, and every pick number, survival window and VONA n_next
 * reads off that sequence — so the tool would have been confidently wrong from
 * pick one the moment Sleeper assigned a seat that was not 4. Cory's seat is not
 * assigned until draft day, so 9 of the 10 possible outcomes were broken.
 *
 * WHY THE TEST IS SHAPED LIKE THIS. app.js is a browser IIFE with no node
 * harness, so this cannot call setSlot directly. Rather than MIRROR its logic
 * here (the two-places disease, which is what put the bug in), it pins the two
 * things that are checkable without a browser:
 *   1. the TRUTH, from the same module the app must use — every seat forfeits
 *      three rounds, and the naive filter disagrees with it at every seat but 4;
 *   2. a SOURCE guard that setSlot actually calls that module.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const K = require(path.join(ROOT, 'public', 'js', 'draft', 'keepers.js'));
const DATA = require(path.join(ROOT, 'public', 'draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const league = DATA.league;
const TEAMS = league.teams;
const ROUNDS = league.rounds;
const KEEPERS = (DATA.kept_players || []).length
  ? DATA.kept_players
  : ((DATA.pick_order || {}).forfeited || []);
const KCOUNT = (league.keeper_rules || {}).count || 0;

function rebuild(slot) {
  const cfg = {
    teams: TEAMS, rounds: ROUNDS, draft_type: league.draft_type || 'snake',
    my_draft_slot: slot, keepers: Object.assign({}, league.keeper_rules),
  };
  const byTeam = { [slot]: KEEPERS.map(k => Object.assign({}, k, { team_slot: slot })) };
  return K.buildTruePickOrder(cfg, byTeam);
}
const filterOnly = slot =>
  (DATA.pick_order.picks || []).filter(p => Number(p.slot) === slot).map(p => p.overall);

// ── The premise: the shipped board really is seat-specific ──────────────────
ck('the shipped board is baked for one seat (fewer picks than teams x rounds)',
  (DATA.pick_order.picks || []).length === TEAMS * ROUNDS - KCOUNT,
  `${(DATA.pick_order.picks || []).length} picks vs ${TEAMS}x${ROUNDS}-${KCOUNT}`);

ck('exactly one seat carries the keeper forfeits on the shipped board',
  (() => {
    const c = {};
    (DATA.pick_order.picks || []).forEach(p => { c[p.slot] = (c[p.slot] || 0) + 1; });
    const short = Object.keys(c).filter(s => c[s] < ROUNDS);
    return short.length === 1 && c[short[0]] === ROUNDS - KCOUNT;
  })(), 'only the baked seat should be short');

// ── The truth, for EVERY seat ───────────────────────────────────────────────
for (let slot = 1; slot <= TEAMS; slot++) {
  const truth = rebuild(slot).my_picks;
  ck(`slot ${slot}: forfeits ${KCOUNT} rounds, so ${ROUNDS - KCOUNT} live picks`,
    truth.length === ROUNDS - KCOUNT, `got ${truth.length}`);
  // top_picks_flat: keeping N forfeits rounds 1..N, so the first live pick is
  // in round N+1 wherever I sit. This is the fact the filter destroyed.
  const firstRound = rebuild(slot).picks.find(p => p.overall === truth[0]).round;
  ck(`slot ${slot}: first live pick is in round ${KCOUNT + 1}, not round 1`,
    firstRound === KCOUNT + 1, `round ${firstRound}, overall ${truth[0]}`);
}

// ── The regression itself: filter vs rebuild ────────────────────────────────
{
  const baked = (() => {
    const c = {};
    (DATA.pick_order.picks || []).forEach(p => { c[p.slot] = (c[p.slot] || 0) + 1; });
    return Number(Object.keys(c).find(s => c[s] < ROUNDS));
  })();
  ck('the baked seat is the ONLY one where filtering happens to be right',
    JSON.stringify(filterOnly(baked)) === JSON.stringify(rebuild(baked).my_picks),
    `seat ${baked}`);

  let wrong = 0;
  for (let slot = 1; slot <= TEAMS; slot++) {
    if (slot === baked) continue;
    if (JSON.stringify(filterOnly(slot)) !== JSON.stringify(rebuild(slot).my_picks)) wrong++;
  }
  ck('filtering is WRONG at every other seat (this is the bug, pinned)',
    wrong === TEAMS - 1, `${wrong} of ${TEAMS - 1} seats disagree`);
}

// ── The source guard: setSlot must rebuild, not filter ──────────────────────
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const i = src.indexOf('function setSlot(');
  ck('setSlot exists', i > 0);
  // Take the function body up to the next top-level `function ` at the same
  // indent — enough to see what setSlot itself does.
  const raw = src.slice(i, src.indexOf('\n  function ', i + 10));
  // STRIP COMMENTS FIRST. The first cut of this guard grepped the raw body, and
  // it PASSED against a deliberately re-broken setSlot — because the comment
  // explaining the fix names `buildTruePickOrder`, so the regex matched prose
  // while the call itself was gone. A guard satisfied by its own documentation
  // is the "exists and does not guard" class. Only executable text counts.
  const body = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ck('setSlot REBUILDS the pick order via the shared keeper module',
    /DraftKeepers\.buildTruePickOrder/.test(body),
    'setSlot must not derive my picks by filtering the baked board');
  ck('any fallback to filtering warns that the numbers are keeper-blind',
    !/\.filter\(p => Number\(p\.slot\) === n\)/.test(body)
      || /VERIFY THEM/.test(body),
    'a silent filter fallback is the original bug');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
