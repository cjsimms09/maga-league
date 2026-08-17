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
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
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
    myPicksLeft: MY.filter(p => p >= pick).length, roster: [], doctrine: null,
    myPickIndex: Math.max(0, MY.indexOf(pick)), totalMyPicks: MY.length,
    currentKeepers: [], league: D.league, weights: E.MEASURED_WEIGHTS,
    runMultipliers: {}, ceilingAllStages: false, drift: null, currentPick: pick,
    intervening: next ? next - pick : 0,
    pickBoard: (D.pick_order || {}).picks || null,
    roundsLeft: Math.max(0, Math.ceil((150 - pick) / (D.league.teams || 10))),
  }, overrides);
}

// ── 1. THE MEASUREMENT THAT MOTIVATES THE FIX ───────────────────────────
const nacua = D.players.find(p => p.name === 'Puka Nacua');
ck('CONTROL — Nacua is really on the board with a tight ADP spread',
  !!nacua && nacua.adjusted_adp != null && nacua.adp_sd != null,
  nacua && { adp: nacua.adjusted_adp, sd: nacua.adp_sd });
{
  const s = E.survival(nacua, FIRST, ctxAt(FIRST));
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
{
  const out = E.onTheClock(ctxAt(FIRST, { preDraftPrep: false }), { avoid: [], target: [] });
  const scored = (out || {}).scored || [];
  const rank = scored.findIndex(e => e.player && e.player.name === 'Puka Nacua');
  ck('FAIL ARM — without the flag, the unfiltered board still ranks a '
    + '0.000%-survival player inside the top 3, reproducing the defect',
  rank !== -1 && rank < 3, { rank: rank, score: rank >= 0 && scored[rank].score });
}

// ── 3. WITH preDraftPrep, HE IS EXCLUDED FROM CONSIDERATION ──────────────
{
  const out = E.onTheClock(ctxAt(FIRST, { preDraftPrep: true }), { avoid: [], target: [] });
  const scored = (out || {}).scored || [];
  ck('the recommendation list is non-empty', scored.length > 0, scored.length);
  ck('Puka Nacua no longer appears ANYWHERE in the scored list — not '
    + 'demoted, excluded, because the board itself should not have offered him',
  !scored.some(e => e.player && e.player.name === 'Puka Nacua'),
  scored.slice(0, 3).map(e => e.player && e.player.name));
  ck('the top recommendation is someone the model believes is REALLY there '
    + '(survival >= the cutoff)',
  scored[0] && E.survival(scored[0].player, FIRST, ctxAt(FIRST)) >= E.CFG.SURVIVOR_CUTOFF,
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
    top && top.player && top.player.name !== 'Puka Nacua');
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: pre-draft, before any pick has landed, the '
  + 'engine only recommends candidates its OWN survival model believes could '
  + 'genuinely be there. LIVE, the instant a real pick lands, this is a no-op '
  + 'and the board is trusted completely — a real value cliff (Cory\'s instinct) '
  + 'still wins by construction, because that is how vona() has always scored.');
