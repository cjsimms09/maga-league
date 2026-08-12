// TERRITORY: A
/* THE HUMAN-OVERRIDE RECORD — the shape B's surface reads and January grades.
 *
 * WHY IT HAS TO EXIST BEFORE AUGUST 22. Draft night is the densest override
 * event of the year and the record is UNRECOVERABLE. Sleeper returns the pick
 * in January; what it can never return is what the tool RECOMMENDED at that
 * moment and what the two players were worth on the board as it stood. The
 * board is rebuilt nightly, so a January reconstruction reads a different board
 * than the one I overruled. If the shape is not here on the 22nd the data does
 * not get captured, and no later work recovers it.
 *
 * ── THE ONE PLACE AN OVERRIDE IS STRONGER THAN EVERY OTHER LEDGER ENTRY ──────
 *
 * Every other in-season kind carries a MODELLED counterfactual — "what I would
 * plausibly have done without the tool" — and its quality varies sharply by
 * component, which is why the attribution wording is binding.
 *
 * AN OVERRIDE'S COUNTERFACTUAL IS OBSERVED. It is the recommendation the tool
 * actually made, recorded before the outcome, with no modelling in it at all.
 * That makes overrides the cleanest attribution evidence in the whole system,
 * and it is the reason to get the shape right rather than approximate.
 *
 * ── WHAT WAS WRONG WITH WHAT WE HAD ─────────────────────────────────────────
 *
 * `app.js` emits ledger kind `override` from TWO places with TWO INCOMPATIBLE
 * payloads, distinguished only by an undeclared `method` string:
 *   'override-v1'         {player_id, name, kind, pct}     — I changed a number
 *   'override-reason-v1'  {player_id, over_player_id, reason, path, ...} — I took
 *                                                            someone else
 * A surface cannot read one kind whose fields depend on a string nobody
 * declared, and January cannot aggregate them. These are two different events
 * and this module types them as two.
 *
 * NEITHER carried the values at decision time, which is the half that cannot be
 * rebuilt.
 *
 * Pure payload builders. The write is B's (its route, its surface); what was
 * missing is the DECISION the write has to record.
 */
'use strict';
(function (global) {

/* The closed reason vocabulary. `no_reason_given` is FIRST-CLASS, not a failure
 * mode: a required modal at draft speed poisons the ledger worse than a missing
 * reason, and an override with no stated reason is still an override. */
const REASONS = ['target', 'gut', 'news', 'plan', 'coin_flip', 'no_reason_given'];
/* `coin_flip` WAS MISSING AND app.js WAS ALREADY EMITTING IT. The board flags a
 * pick contested when the top two are within a hair; taking the other one is
 * logged as `coin_flip` with no interrogation. That reason was not in this list,
 * so `pickOverride` threw, and the caller's catch returned silently — SO THE
 * ENTIRE COIN-FLIP CLASS OF OVERRIDE WAS BEING DROPPED, on the surface whose
 * first real entry is draft night. Found by verifying the path rather than by
 * trusting that it worked. */

/* The two event types, which is the fix for the `method`-string ambiguity. */
const TYPES = ['pick_override', 'value_override'];

function req(o, keys, what) {
  for (const k of keys) {
    if (o[k] === undefined || o[k] === null) {
      throw new Error(`${what}: \`${k}\` is required and has no default. `
        + 'An override recorded without it cannot be graded in January, and an '
        + 'ungradeable entry is worse than none — it makes the ledger read as '
        + 'though the decision were measured.');
    }
  }
}

/* THE DECISION JOIN KEY, identical to the one predledger stamps on forecasts.
 * The grader joins on it; a second scheme here would split the very rows that
 * are supposed to line up. */
function decisionKey(o) {
  if (o.pick == null || !o.build_at) return null;
  return (o.season || '') + '|' + o.build_at + '|' + o.pick;
}

/* A player as the board had him AT THE MOMENT, not as he can be looked up
 * later. This snapshot is the unrecoverable part: `vorp` and `adjusted_adp` move
 * every night, and a January join against today's board silently grades the
 * override against numbers I never saw. */
function snapshot(p, what) {
  if (!p) return null;
  req(p, ['player_id'], what);
  return {
    player_id: String(p.player_id),
    name: p.name == null ? null : String(p.name),
    position: p.position == null ? null : String(p.position),
    // Every value the decision could have turned on, frozen. Nulls are recorded
    // as nulls rather than dropped: "the board had no VORP for him" and "nobody
    // wrote the field" are different facts and January must be able to tell them
    // apart.
    vorp: p.vorp == null ? null : Number(p.vorp),
    proj_mean: p.proj_mean == null ? null : Number(p.proj_mean),
    adp: p.adjusted_adp == null ? (p.raw_adp == null ? null : Number(p.raw_adp))
      : Number(p.adjusted_adp),
    tier: p.tier == null ? null : Number(p.tier),
  };
}

/* ── PICK OVERRIDE — I took somebody other than the top recommendation ───────
 *
 * `recommended` is REQUIRED and is the whole point. Without it this is a pick,
 * not an override, and the ledger already has a `pick` kind for that. Refusing
 * here is what stops the override stream filling with entries that have nothing
 * to be measured against.
 */
/* ── WHERE THE SCORE GAP COMES FROM, AS A PURE FUNCTION ────────────────────
 *
 * THIS LIVES HERE RATHER THAN IN app.js BECAUSE app.js CANNOT BE TESTED AT
 * RUNTIME. It is a browser IIFE with no exports, so `app-wiring.test.js` checks
 * it by SOURCE INSPECTION — and says so in its own header: that catches "the app
 * never mentions it", not "the app mentions it but computes it wrong."
 *
 * The second failure mode is the one that just cost ten days. `score_gap` was
 * wired at three call sites, missed at a fourth, and every record came out null.
 * A source scan of the three that WERE wired would have looked healthy, and the
 * scan I added yesterday catches THIS instance while still being unable to catch
 * a wiring bug that computes the wrong number.
 *
 * So the resolution moves into a module Node can call directly, app.js keeps one
 * line, and the behaviour is asserted against the real function rather than
 * against the shape of its source.
 *
 * `passed` is what the caller supplied. `clockTop` is the live recommendation
 * entry — the engine puts `gap_to_second` on `scored[0]`. `recommended` is the
 * player the override was measured against, and the two must be THE SAME PLAYER
 * or the gap describes a different comparison.
 */
function resolveScoreGap(opts) {
  const o = opts || {};
  if (o.passed != null && isFinite(Number(o.passed))) {
    return { score_gap: Number(o.passed), score_gap_source: 'passed' };
  }
  const top = o.clockTop, rec = o.recommended;
  if (!top || !top.player) {
    return { score_gap: null, score_gap_source: 'unavailable: no live clock' };
  }
  if (!rec || String(top.player.player_id) !== String(rec.player_id)) {
    /* NOT A FALLBACK — A REFUSAL. Using the clock's gap when its top is a
     * DIFFERENT player would attach a number measured on one comparison to a
     * record about another: a plausible value quietly about the wrong pair,
     * which is worse than a null because nothing downstream could detect it. */
    return { score_gap: null,
      score_gap_source: 'unavailable: the clock top is not the player this '
        + 'override was measured against' };
  }
  if (top.gap_to_second == null || !isFinite(Number(top.gap_to_second))) {
    return { score_gap: null,
      score_gap_source: 'unavailable: the clock reported no gap_to_second' };
  }
  return { score_gap: Number(top.gap_to_second), score_gap_source: 'derived_from_clock' };
}

/* ── THE LOCKED RECOMMENDATION FOR A PICK ──────────────────────────────────
 *
 * WHAT THIS FIXES. The architecture is meant to be: recommendation COMMITTED
 * before the pick → Sleeper reports the actual pick → the system compares →
 * override recorded if they differ. The first, second and fourth steps exist.
 * **The third compares against the wrong object.**
 *
 * `noteReconciledPick` reads `state.lastClock` — an in-memory value rewritten on
 * EVERY render by `renderRecommendations`. That is the floating "if your turn
 * came now" recommendation, computed at whatever pick was current at the last
 * render. Between my turns that is an opponent's pick number, and `currentPick`,
 * `myPicksLeft` and `roundsLeft` all feed the score — so it is a materially
 * different calculation from the one for my pick.
 *
 * It currently produces the right answer BY ACCIDENT: the sync handler removes
 * my player from the board before calling `noteReconciledPick`, and `lastClock`
 * only refreshes on render, so the stale value happens to predate the batch. One
 * added render inside the poll loop inverts that silently.
 *
 * So the app now LOCKS the recommendation per pick number at the moment it
 * commits it to the ledger, and this resolves which lock applies.
 *
 * ── EXACT, OR NEAREST-EARLIER AND SAID SO ─────────────────────────────────
 *
 * If I pick fast in Sleeper, my pick can arrive in the same 4-second batch as
 * the ones before it and NO render ever happens with `currentPick` equal to
 * mine. Then there is no exact lock. Falling back silently to a neighbouring
 * pick's recommendation would be the `score_gap` defect again — a plausible
 * value quietly about a different question — so the fallback is labelled and the
 * distance is recorded.
 */
function lockedRecommendationFor(locked, pick) {
  const L = locked || {};
  const want = Number(pick);
  if (!isFinite(want)) {
    return { rec: null, source: 'unavailable: no pick number to look up' };
  }
  if (L[want]) return { rec: L[want], source: 'locked_at_pick', distance: 0 };
  // Nearest EARLIER only. A later pick's board has already lost players I could
  // have taken, so it cannot stand in for the decision I actually faced.
  const earlier = Object.keys(L).map(Number).filter(k => k < want).sort((a, b) => b - a);
  if (!earlier.length) {
    return { rec: null, source: 'unavailable: no recommendation was locked at or before this pick' };
  }
  const k = earlier[0];
  return { rec: L[k], source: 'nearest_earlier_lock', distance: want - k, locked_at: k };
}

function pickOverride(opts) {
  const o = opts || {};
  req(o, ['season', 'build_at', 'pick', 'chosen', 'recommended', 'reconciled_from_sync'],
    'pickOverride');
  if (String((o.chosen || {}).player_id) === String((o.recommended || {}).player_id)) {
    throw new Error('pickOverride: chosen and recommended are the same player — '
      + 'that is a `pick`, not an override. Recording it here would inflate the '
      + 'override count with agreements and make the disagreement rate meaningless.');
  }
  const reason = o.reason == null ? 'no_reason_given' : String(o.reason);
  if (REASONS.indexOf(reason) < 0) {
    throw new Error(`pickOverride: unknown reason "${reason}". The vocabulary is `
      + `closed (${REASONS.join(', ')}) so January can group them; a free-text `
      + 'reason produces one bucket per entry and grades nothing.');
  }
  const chosen = snapshot(o.chosen, 'pickOverride.chosen');
  const rec = snapshot(o.recommended, 'pickOverride.recommended');
  return {
    type: 'pick_override',
    decision_key: decisionKey(o),
    season: o.season, build_at: o.build_at, pick: Number(o.pick),
    chosen: chosen,
    // OBSERVED, not modelled — see the header. Named `counterfactual` so it
    // satisfies the ledger's own enforcement without a special case.
    counterfactual: rec,
    counterfactual_is: 'observed — the recommendation the tool actually made at '
      + 'this pick, recorded before the outcome. Not a model of what I would '
      + 'have done.',
    reason: reason,
    /* THE RESOLUTION RULE, STATED BEFORE THE OUTCOME — the discipline every
     * forecast on the rail already carries and this record did not. Without it
     * January decides what "the override was right" means AFTER seeing the
     * season, which is the freedom a forward prediction exists to remove. */
    resolution_rule: 'Resolved from realized FANTASY POINTS in our scoring over '
      + 'the rest of the season, from the pick onward: the override SUCCEEDED if '
      + 'the player I took outscored the player the tool recommended. A player '
      + 'who never plays scores zero rather than being excluded. Games before '
      + 'this pick do not count. An exact tie resolves as NOT a success, so the '
      + 'tool keeps the benefit of the doubt.',
    // The score gap the tool itself reported. A disagreement on a hair-thin gap
    // is a different event from one on a clear gap, and January cannot
    // reconstruct either.
    score_gap: o.score_gap == null ? null : Number(o.score_gap),
    /* ⚠️ WHY A NULL GAP IS NULL, and this field exists because its absence cost
     * ten days. `score_gap` was wired at three call sites and missed at the
     * fourth — the Sleeper sync path, which carries most of draft night — and
     * every record came out null. NOTHING COULD TELL "the tool did not report a
     * gap" from "nobody passed the one it reported", because both render as
     * `null`.
     *
     * A missing REASON is now itself a defect: an emitter that supplies neither
     * a gap nor a source is recorded as `unstated`, which is greppable, rather
     * than as a null that looks deliberate. */
    /* WHICH RECOMMENDATION THE OVERRIDE WAS MEASURED AGAINST. `locked_at_pick`
     * is the recommendation committed for THIS pick; `nearest_earlier_lock` is a
     * neighbour standing in because no render happened while it was my turn;
     * `live_clock` is the old floating value. They are different evidence and
     * January must be able to separate them. */
    rec_source: o.rec_source == null ? 'unstated' : String(o.rec_source),
    rec_lock_distance: o.rec_lock_distance == null ? null : Number(o.rec_lock_distance),
    score_gap_source: o.score_gap_source == null
      ? (o.score_gap == null ? 'unstated — the emitter passed neither a gap nor a reason' : 'passed')
      : String(o.score_gap_source),
    /* WAS THE BOARD ITSELF UNSURE? `contested` means the tool flagged the top two
     * as effectively tied. Overriding a confident recommendation and overriding a
     * coin flip are different acts and must not aggregate into one rate. */
    contested: o.contested == null ? null : !!o.contested,
    // Deliberate or recovered. A pick I forgot to mark and reconciled from
    // Sleeper is weaker evidence than one I tapped, and merging them would
    // credit or blame me for a decision I may not have made consciously.
    reconciled_from_sync: !!o.reconciled_from_sync,
    // What the on-screen path was, when there is one. Null is honest.
    path: o.path == null ? null : String(o.path),
  };
}

/* ── VALUE OVERRIDE — I changed a player's number ────────────────────────────
 *
 * A different event from taking a different player, and it resolves differently:
 * a pick override is graded against two players' outcomes, a value override
 * against ONE player's outcome versus the board's own number for him.
 */
function valueOverride(opts) {
  const o = opts || {};
  req(o, ['season', 'build_at', 'pick', 'player', 'direction', 'pct'], 'valueOverride');
  if (['up', 'down', 'clear'].indexOf(String(o.direction)) < 0) {
    throw new Error('valueOverride: direction must be up, down or clear');
  }
  const before = snapshot(o.player, 'valueOverride.player');
  return {
    type: 'value_override',
    decision_key: decisionKey(o),
    season: o.season, build_at: o.build_at, pick: Number(o.pick),
    player: before,
    direction: String(o.direction),
    pct: o.direction === 'clear' ? null : Number(o.pct),
    // THE BOARD'S OWN NUMBER IS THE COUNTERFACTUAL. Grading "was my nudge right"
    // means comparing the player's realized season against what the board said
    // before I touched it — which is exactly `player.proj_mean` above, frozen.
    counterfactual: { proj_mean: before ? before.proj_mean : null,
      vorp: before ? before.vorp : null },
    counterfactual_is: 'observed — the board\'s own projection for this player '
      + 'before the override, frozen at the moment of the change.',
    reason: o.reason == null ? 'no_reason_given' : String(o.reason),
  };
}

/* What B's surface needs to render a row without re-deriving anything, and what
 * the grader needs to bucket. Kept here so the two cannot drift apart. */
function summarize(rec) {
  if (!rec) return null;
  if (rec.type === 'pick_override') {
    return {
      decision_key: rec.decision_key, pick: rec.pick, reason: rec.reason,
      took: rec.chosen.name, over: rec.counterfactual.name,
      // Signed, in the board's own units, at decision time. Positive = I took
      // the player the board rated LOWER, which is what an override usually is.
      vorp_given_up: (rec.counterfactual.vorp == null || rec.chosen.vorp == null)
        ? null : Number((rec.counterfactual.vorp - rec.chosen.vorp).toFixed(2)),
      deliberate: !rec.reconciled_from_sync,
    };
  }
  if (rec.type === 'value_override') {
    return {
      decision_key: rec.decision_key, pick: rec.pick, reason: rec.reason,
      player: rec.player.name, direction: rec.direction, pct: rec.pct,
      deliberate: true,
    };
  }
  return null;
}

  var api = { REASONS: REASONS, TYPES: TYPES, pickOverride: pickOverride,
    valueOverride: valueOverride, summarize: summarize, decisionKey: decisionKey,
    // Exported so the gap resolution can be exercised at RUNTIME in Node —
    // app.js is a browser IIFE and can only ever be source-inspected.
    resolveScoreGap: resolveScoreGap,
    lockedRecommendationFor: lockedRecommendationFor };
  global.OverrideRecord = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
