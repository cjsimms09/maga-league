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
    valueOverride: valueOverride, summarize: summarize, decisionKey: decisionKey };
  global.OverrideRecord = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
