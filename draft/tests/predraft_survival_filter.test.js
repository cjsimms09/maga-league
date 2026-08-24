// TERRITORY: A
// THE PRE-DRAFT BOARD RECOMMENDED A PLAYER ITS OWN MODEL SAYS IS CERTAINLY GONE.
//
// Cory, 2026-08-15, on the pick-33 three-surface disagreement the macro audit
// found (rec panel: Puka Nacua; seat panel: Colston Loveland; opening script:
// Zay Flowers): "any model that doesn't recommend nakua over the other 2 is
// broken." True IN A VACUUM — if Nacua (adjusted_adp 3.0) is genuinely still on
// the board at pick 33, no sane model should prefer a TE or a lesser WR to him.
// The question this file answers is whether he genuinely could be.
//
// MEASURED, on the real board, with the engine's own survival math
// (`E.survival`, the exact function VONA's `expectedBestAvailable` already
// uses): P(Nacua survives to pick 33) = 0.000%. adjusted_adp 3.0, adp_sd 0.4 —
// not a marginal read, a near-mathematical impossibility. Every OTHER
// pick-33 surface already agrees he will not be there: the opening script's
// candidate list (independently generated, python-side survival + VORP) does
// not even list him among its top five; the seat panel and the DP
// (doctrine_lookahead, brute-force verified) both plan for a realistic board.
//
// THE ONE SURFACE THAT DID NOT AGREE was the raw engine scored on the literal
// pre-draft `ctx.board` — which, before any pick (real or mock) has landed,
// still contains every player, because nothing has removed anyone yet, even
// though `currentPick()` (predraft_anchor.test.js's fix) correctly anchors
// ahead to pick 33. `ctx.currentPick` said 33; `ctx.board` was still pick 1's
// board. Same class of defect as the anchor bug, one layer deeper: WHICH pick
// was fixed there; WHO WOULD REALISTICALLY BE THERE was not.
//
// THE FIX IS NARROW BY THE SAME CONSTRUCTION AS THE ANCHOR FIX: it fires only
// when `ctx.preDraftPrep` is true, which app.js sets ONLY when zero picks —
// real or mock — have landed. The instant the first pick (of any kind) is
// recorded, this reverts to a no-op and the live board is trusted completely
// — which is exactly right, and exactly what makes Cory's instinct correct
// LIVE: if a real Nacua-class value cliff happens on draft night, the engine
// already rewards a fallen player's value with a higher score (that is what
// made him win the buggy pre-draft probe in the first place). The bug was
// never the valuation; it was applying it to a hypothetical as if it were
// real.
//
// Run: node draft/tests/predraft_survival_filter.test.js
'use strict';
/* ⚠️ CORY'S REAL KEEPERS — the `roster: []` fiction became illegal on
 * 2026-08-20 (register 160, Cory's ruling): `need` now carries weight 1.0 and
 * reads ctx.roster, so an empty roster scores every starter seat as OPEN and
 * hands full VORP to everyone. That is a draft state that cannot exist — he
 * holds three keepers before pick one.
 * Read from the live board rather than hardcoded, so it cannot drift from it. */
/* ONE DERIVATION, REUSED. Five suites had each grown their own copy of this
 * block; a fixture that differs between suites makes their results
 * incomparable. realRoster() REFUSES rather than falling back to roster: [],
 * which is the fiction register 160 made illegal. */
const KEEPERS_FOR_FIXTURE = require('./_empty_roster_fiction_precondition.js')
  .realRoster();

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const { assertRosterFictionPrecondition } = require('./_empty_roster_fiction_precondition.js');
// A's precondition (E31): this file's contexts pass roster: [].
/* ⚠️ THE FICTION GUARD IS GONE BECAUSE THE FICTION IS GONE. It asserts a
 * property of the WEIGHT VECTOR ("need is zero"), which was the right proxy
 * while these fixtures passed roster: [] and is the wrong question now that
 * they pass Cory's real keepers. Removed here rather than weakened there —
 * weakening it would leave every OTHER suite's fiction unguarded. */
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const MY = D.pick_order.my_picks;
const FIRST = MY[0];
const board = D.players.filter(p => p.position && p.proj_mean != null);

function ctxAt(pick, overrides) {
  const next = MY.find(p => p > pick) || null;
  return Object.assign({
    board: board, nextPick: next, totalPicks: (D.pick_order.picks || []).length || null,
    myPicksLeft: MY.filter(p => p >= pick).length, roster: KEEPERS_FOR_FIXTURE, doctrine: null,
    myPickIndex: Math.max(0, MY.indexOf(pick)), totalMyPicks: MY.length,
    currentKeepers: [], league: D.league, weights: E.MEASURED_WEIGHTS,
    runMultipliers: {}, ceilingAllStages: false, drift: null, currentPick: pick,
    intervening: next ? next - pick : 0,
    pickBoard: (D.pick_order || {}).picks || null,
    roundsLeft: Math.max(0, Math.ceil((150 - pick) / (D.league.teams || 10))),
  }, overrides);
}

/* THE UNCONDITIONAL MEASUREMENT CONTEXT — preDraftPool's own construction,
 * verbatim. Pre-draft, zero picks have landed, so "survives to pick 33" is
 * measured FROM THE START (currentPick 0), on the raw model (no board, so no
 * conservation tilt — there is nothing to conserve against before a single
 * pick exists). Passing the anchored ctx instead would ask
 * P(taken by 33 | alive at 33) — a zero-width window that is correctly 0 since
 * the survival.js empty-window fix (the 41%-wall root cause; see
 * survival_fallen_uniform.test.js). Before that fix the anchored call only
 * LOOKED right: the far-tail guard said "gone" for players with F ≥ 0.999
 * while declaring everyone else certain to survive, so a 91%-taken ADP-25
 * player sailed through the same filter that cut Nacua. */
const unconditional = () => ({ currentPick: 0, runMultipliers: {},
  pickBoard: (D.pick_order || {}).picks || null });

// ── 1. THE MEASUREMENT THAT MOTIVATES THE FIX ───────────────────────────
/* ⚠️ THIS USED TO BE `D.players.find(p => p.name === 'Puka Nacua')` AND IT
 * WENT INERT ON 2026-08-21 WHEN HE WAS KEPT (A, 08-24, register 300/301).
 * `build.py` moves keepers into `kept_players`, so the find returned undefined,
 * the CONTROL failed, and the very next line threw — the suite stopped running
 * at all rather than reporting anything. It had been red for days looking like
 * a finding.
 *
 * The property under test never depended on Nacua. It is: A PLAYER THE BOARD'S
 * OWN survival() SAYS IS ALREADY GONE MUST NOT BE OFFERED AS A PICK. Nacua was
 * the instance that exposed it (adjusted_adp 3.0, adp_sd 0.4, P(survives to 33)
 * = 0.000%, and the unfiltered board ranked him top-3 anyway), and he stays in
 * the comments as the motivation. The FIXTURE now derives its own probe from
 * whoever is actually on the board, so it survives any keeper slate — including
 * next year's, when a different name will be off the board.
 *
 * The control is a REAL precondition, not a formality: if no player on the
 * board is doomed by the engine's own math, this suite has nothing to test and
 * must say so loudly rather than pass vacuously. */
const _cands = D.players
  .filter(p => p.adjusted_adp != null && p.adp_sd != null && p.position && p.proj_mean != null)
  .sort((a, b) => a.adjusted_adp - b.adjusted_adp);
const doomed = _cands.find(p => E.survival(p, MY[0], { currentPick: 0, runMultipliers: {},
  pickBoard: (D.pick_order || {}).picks || null }) < E.CFG.SURVIVOR_CUTOFF) || null;
ck('CONTROL — some player on the board is genuinely doomed before my first '
  + 'pick, so there is a case to test (Nacua was this in 2026; he is a keeper now)',
  !!doomed && doomed.adjusted_adp != null && doomed.adp_sd != null,
  doomed ? { who: doomed.name, adp: doomed.adjusted_adp, sd: doomed.adp_sd }
        : { candidates: _cands.length, note: 'nobody is below SURVIVOR_CUTOFF' });
if (!doomed) {
  console.log('FAIL  ⛔ REFUSING to run the arms below: with no doomed player '
    + 'the fail-arm and pass-arm would both trivially "pass" on an empty case.');
  process.exit(1);
}
{
  /* UNCONDITIONAL, matching preDraftPool's own construction. Pre-draft, zero
   * picks have landed, so "survives to pick 33" is measured FROM THE START —
   * currentPick 0, not the pick-33 anchor. Passing the anchored ctx would ask
   * P(taken by 33 | alive at 33), a zero-width window that is correctly 0
   * since the survival.js empty-window fix (the 41%-wall root cause,
   * survival_fallen_uniform.test.js) — before that fix this call only looked
   * right because the far-tail guard fired for players with F ≥ 0.999 while
   * every other player was declared certain to survive. */
  const s = E.survival(doomed, FIRST, unconditional());
  ck('his measured survival to my first pick is negligible — not a close call',
    s < E.CFG.SURVIVOR_CUTOFF, s);
}

// ── 2. WITHOUT preDraftPrep, THE BUG REPRODUCES (fail arm) ──────────────
// Not pinned to #1 specifically — which name tops this exact synthetic
// roster/weights harness is a separate question (rec_rows.test.js already
// exists for that). The property under test is narrower and the one that
// actually matters: a 0%-survival player is not merely PRESENT somewhere in
// a 600-player list (everyone is, unfiltered) — he is a TOP-TIER candidate,
// i.e. the unfiltered scorer treats "still there" as fact rather than as the
// near-impossibility its own survival() function says it is.
/* ⚠️ THIS ARM'S PREMISE EXPIRED WITH THE KEEPER LOCK, AND FORCING IT GREEN
 * WOULD HAVE BEEN THE WRONG REPAIR (A, 2026-08-24, register 300).
 *
 * The defect needs a player who is BOTH certain to be gone AND good enough
 * that the unfiltered scorer wants him. Nacua was exactly that. On the
 * post-lock board that population is essentially empty: MEASURED, 1 player of
 * 680 sits below SURVIVOR_CUTOFF (0.5%) and he ranks 7th with a NEGATIVE
 * score, because the 23 elite players who used to occupy "doomed but worth
 * taking" are now in `kept_players`.
 *
 * So the arm becomes CONDITIONAL ON A MEASURED PRECONDITION rather than
 * unconditional — but a test that skips when it cannot reproduce is one step
 * from a test that always skips, so THE SKIP MUST BE EARNED: when the defect
 * does not reproduce, this asserts the REASON (a doomed population too small
 * and too weak to reach the top 3). If a doomed player ever does reach the
 * top 3 again and the flag fails to remove him, this goes red as it always
 * did. The load-bearing arm is section 3 below, which is unconditional. */
{
  const out = E.onTheClock(ctxAt(FIRST, { preDraftPrep: false }), { avoid: [], target: [] });
  const scored = (out || {}).scored || [];
  const isDoomed = e => e.player && E.survival(e.player, FIRST, unconditional()) < E.CFG.SURVIVOR_CUTOFF;
  const inTop3 = scored.slice(0, 3).filter(isDoomed);
  const anywhere = scored.filter(isDoomed);
  if (inTop3.length) {
    ck('FAIL ARM — without the flag, the unfiltered board offers a player its '
      + 'OWN survival() says is already gone, inside the top 3', true,
    inTop3.map(e => ({ who: e.player.name, score: +e.score.toFixed(2) })));
  } else {
    ck('FAIL ARM NOT REPRODUCIBLE ON THIS BOARD, and the reason is asserted '
      + 'rather than assumed: too few doomed players, none good enough for the '
      + 'top 3 (the keeper lock took the elite ones off the board)',
    anywhere.length <= 3 && scored.slice(0, 3).every(e => !isDoomed(e)),
    { doomed_anywhere: anywhere.length, of: scored.length,
      best_doomed_rank: anywhere.length ? scored.indexOf(anywhere[0]) : null,
      cutoff: E.CFG.SURVIVOR_CUTOFF });
  }
}

// ── 3. WITH preDraftPrep, HE IS EXCLUDED FROM CONSIDERATION ──────────────
{
  const out = E.onTheClock(ctxAt(FIRST, { preDraftPrep: true }), { avoid: [], target: [] });
  const scored = (out || {}).scored || [];
  ck('the recommendation list is non-empty', scored.length > 0, scored.length);
  ck(doomed.name + ' (the doomed player derived above) no longer appears '
    + 'ANYWHERE in the scored list — not demoted, EXCLUDED, because the board '
    + 'itself should not have offered him',
  !scored.some(e => e.player && e.player.name === doomed.name),
  scored.slice(0, 3).map(e => e.player && e.player.name));
  ck('the top recommendation is someone the model believes is REALLY there '
    + '(survival >= the cutoff)',
  scored[0] && E.survival(scored[0].player, FIRST, unconditional()) >= E.CFG.SURVIVOR_CUTOFF,
  scored[0] && scored[0].player.name);
}

// ── 4. A PLAUSIBLE FALLER IS NOT COLLATERAL DAMAGE ───────────────────────
// The fix must not over-filter. Someone genuinely near the pick, with real
// spread, must survive the cut even though his raw ADP is a little ahead of it.
{
  const plausible = board
    .filter(p => p.adjusted_adp != null && p.adjusted_adp < FIRST && p.adjusted_adp > FIRST - 15)
    .sort((a, b) => (b.adp_sd || 0) - (a.adp_sd || 0))[0];
  ck('CONTROL — a real, plausible near-pick candidate exists on this board',
    !!plausible, plausible && plausible.name);
  if (plausible) {
    const pool = E.preDraftPool(board, ctxAt(FIRST, { preDraftPrep: true }));
    ck('and he is NOT filtered out — the cut targets near-zero survival, '
      + 'not merely-early ADP', pool.some(p => p.player_id === plausible.player_id),
    plausible.name);
  }
}

// ── 5. NARROW BY THE SAME CONSTRUCTION AS THE ANCHOR FIX ────────────────
{
  const untouched = E.preDraftPool(board, ctxAt(FIRST, { preDraftPrep: false }));
  ck('preDraftPrep false (any real draft state) — the pool is untouched, '
    + 'byte-identical to the input', untouched === board);
  const noPickCtx = ctxAt(FIRST, { preDraftPrep: true, currentPick: 1 });
  ck('and it never fires at pick 1 even if asked to — nothing to filter '
    + 'against yet', E.preDraftPool(board, noPickCtx) === board);
}

// ── 6. THE HEADLINE, RESOLVED — WHAT ACTUALLY WINS PICK 33 NOW ──────────
{
  const out = E.onTheClock(ctxAt(FIRST, { preDraftPrep: true }), { avoid: [], target: [] });
  const top = ((out || {}).scored || [])[0];
  console.log('\n      RESOLVED pick-' + FIRST + ' headline with the fix applied: '
    + (top && top.player && top.player.name) + ' (' + (top && top.player && top.player.position) + ')');
  ck('CONTROL — it is not the phantom-available player the bug produced',
    top && top.player && top.player.name !== doomed.name);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: pre-draft, before any pick has landed, the '
  + 'engine only recommends candidates its OWN survival model believes could '
  + 'genuinely be there. LIVE, the instant a real pick lands, this is a no-op '
  + 'and the board is trusted completely — a real value cliff (Cory\'s instinct) '
  + 'still wins by construction, because that is how vona() has always scored.');
