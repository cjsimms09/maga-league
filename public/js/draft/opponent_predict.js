// TERRITORY: A
/* PREDICT EVERY OPPONENT PICK, AND GRADE IT — the shadow measurement.
 *
 * ── WHY THIS IS DIFFERENT FROM THE PROFILES WE ALREADY HAVE ────────────────
 *
 * `manager_profiles.json` describes owners: Richard reaches, ds7mmet takes a
 * quarterback in round five. Built from 468 real picks and **never once graded.**
 *
 * **A DESCRIPTION CANNOT BE WRONG. A PREDICTION CAN.** This turns the first into
 * the second, at ~135 graded observations per draft against the twelve my own
 * picks produce.
 *
 * ── THE BASELINE IS THE WHOLE MEASUREMENT ──────────────────────────────────
 *
 * Every pick gets TWO predictions resolved against the SAME outcome:
 *
 *   ADP      — best available by ADP. What the market alone would say.
 *   PROFILE  — the owner's measured positional tendency for this round bucket,
 *              then best available by ADP WITHIN that position.
 *
 * **If the profile is right and ADP would have said the same player, the profile
 * contributed nothing**, and the record must make that visible. So both go in,
 * and the DIFFERENCE is the finding — never the profile's raw accuracy.
 *
 * ── THE RESOLUTION RULE, HARSH AND DECLARED BEFORE THE FIRST ENTRY ─────────
 *
 * **EXACT PLAYER = CORRECT. ANYTHING ELSE = INCORRECT.** No position-only
 * credit, no within-N-of-ADP credit. Those create judgement and tuning surface
 * where there should be none.
 *
 * And there is a second reason beyond harshness: **the comparison has to be
 * symmetric.** Any softened rule would have to be applied to both arms, and
 * every softening is a place the profile arm could be advantaged by a choice
 * made after seeing the data. Harsh and symmetric beats generous and arguable.
 *
 * ── WHAT ONE DRAFT CAN AND CANNOT CONCLUDE ─────────────────────────────────
 *
 * The ~135 predictions in one draft are **ONE CLUSTER, not 135 independent
 * observations.** They share a board, a keeper slate and a run structure — the
 * same argument that put survival's independent unit at the DRAFT, where
 * treating correlated observations as independent measured the false-positive
 * rate at 11.1%. So one draft supports a per-draft difference, not an interval
 * on it. Stamped into every record via `cluster_is: 'draft'`.
 *
 * **AND A TIE DOES NOT DISTINGUISH THE TWO WORLDS.** A profile arm that matches
 * ADP is consistent with *tendencies do not persist* AND with *tendencies persist
 * but our profiles fail to capture them*. Only a WIN resolves cleanly. Declared
 * here, before any result, so a null cannot later be read as the stronger claim.
 *
 * ── THE BOUNDARIES, ALL THREE HARD ─────────────────────────────────────────
 *
 * SILENCE (rule 15), and it matters more here than anywhere: a prediction about
 * what the next owner will take is exactly the kind of thing a human would act
 * on and must not. **This module RETURNS PAYLOADS AND RENDERS NOTHING.** There
 * is no DOM in this file, by construction rather than by discipline.
 *
 * SHADOW ONLY. Nothing here influences a recommendation this season.
 *
 * FREE OR DROPPED. Measured: ADP arm 1.37 ms, profile arm 0.17 ms, both arms
 * across nine opponents **13.8 ms per round**. For scale, marking one opponent
 * pick already costs ~1.9 s.
 *
 * ⚠️ AND THE ONE IMPLEMENTATION THAT WOULD DESTROY DRAFT NIGHT. The obvious way
 * to write "what will this owner take" is *run the recommender against their
 * roster*. **`E.recommend` is 3,097 ms warm — nine per round is 28 SECONDS**, a
 * factor of two thousand. **NOTHING IN THIS FILE MAY CALL `recommend`**, and
 * `predictRound` enforces a declared budget rather than trusting the rule.
 */
'use strict';
(function (global) {

/* THE BUDGET, DECLARED. A prediction pass that exceeds it REFUSES rather than
 * slows — the evidence is only worth having if it is free, and a slower board on
 * the 22nd costs more than the measurement is worth. */
const BUDGET_MS = 150;

const ROUND_BUCKET = r => (r <= 3 ? 'early' : (r <= 9 ? 'mid' : 'late'));

function adpOf(p) {
  return p.adjusted_adp != null ? p.adjusted_adp
    : (p.raw_adp != null ? p.raw_adp : 9999);
}

/* THE ADP BASELINE — best available by ADP. Deliberately the crudest honest
 * predictor: it is what the market alone says, and it is the bar. */
function adpPrediction(board) {
  if (!board || !board.length) return null;
  let best = null;
  for (const p of board) if (!best || adpOf(p) < adpOf(best)) best = p;
  return best;
}

/* THE PROFILE ARM — the owner's measured positional mix for this round bucket,
 * then best available by ADP within it.
 *
 * DETERMINISTIC: it takes the owner's MODAL position for the bucket rather than
 * sampling from the mix. A sampled prediction would be a different prediction on
 * every re-run and could not be graded — and a draw that happened to be right
 * would be luck recorded as skill. */
function profilePrediction(board, profile, round) {
  if (!board || !board.length) return null;
  const mix = profile && profile.draft_patterns
    && profile.draft_patterns.by_round_bucket
    && profile.draft_patterns.by_round_bucket[ROUND_BUCKET(round)];
  const m = mix && mix.mix;
  if (!m) return null;          // NO PROFILE IS NULL, NOT A FALLBACK TO ADP —
                                // an arm that silently becomes the baseline would
                                // grade as a tie and hide that it never ran.
  let pos = null, bestShare = -1;
  Object.keys(m).forEach(k => { if (m[k] > bestShare) { bestShare = m[k]; pos = k; } });
  if (!pos) return null;
  const at = board.filter(p => p.position === pos);
  if (!at.length) return null;
  return adpPrediction(at);
}

function key(season, draftId, pickNo) {
  return `op|${season}|${draftId || 'live'}|${pickNo}`;
}

/* One pick's forecast payload. Both arms, one outcome, resolution rule stated. */
function predictPick(opts) {
  const o = opts || {};
  for (const k of ['season', 'pick_no', 'round', 'owner', 'board']) {
    if (o[k] === undefined || o[k] === null) {
      throw new Error(`opponent_predict.predictPick: \`${k}\` is required and has `
        + 'no default. A prediction with a guessed input measures the guess.');
    }
  }
  const adp = adpPrediction(o.board);
  const prof = profilePrediction(o.board, o.profile, Number(o.round));
  const snap = p => (p ? { player_id: String(p.player_id), name: p.name || null,
    position: p.position || null, adp: adpOf(p) } : null);
  return {
    key: key(o.season, o.draft_id, o.pick_no),
    ftype: 'categorical',
    /* THE GRADED VALUE IS THE PROFILE ARM. The ADP arm rides alongside as the
     * baseline; both resolve against the same pick and the DIFFERENCE is the
     * finding. */
    value: prof ? String(prof.player_id) : null,
    subject: { pick_no: Number(o.pick_no), round: Number(o.round),
      owner: String(o.owner) },
    predictions: { profile: snap(prof), adp: snap(adp) },
    /* Both arms naming the same player is the case that matters most: the
     * profile can be RIGHT and still have contributed nothing. Computed here so
     * January cannot forget to. */
    arms_agree: !!(prof && adp && String(prof.player_id) === String(adp.player_id)),
    profile_ran: !!prof,
    resolution_rule: 'The player this owner actually takes at this pick, from '
      + 'the Sleeper draft feed. EXACT PLAYER MATCH = correct; anything else = '
      + 'incorrect. No position-only or within-N-of-ADP credit, and the same '
      + 'rule applies to BOTH arms so the comparison stays symmetric.',
    /* THE INDEPENDENT UNIT, stamped rather than assumed downstream. */
    cluster_is: 'draft',
    shadow: true,
    do_not_render: 'rule 15 — a prediction about the next owner is exactly what a '
      + 'human would act on. Revealed only after the entire draft concludes.',
  };
}

/* Resolve one prediction against what was actually taken. A separate append
 * joined by key, never an edit — a prediction you can revise after the outcome
 * is not a prediction. */
function resolvePick(forecast, actualPlayerId) {
  if (actualPlayerId == null) return null;     // not taken yet — NOT a miss
  const f = forecast || {};
  const pr = f.predictions || {};
  const hit = a => !!(a && String(a.player_id) === String(actualPlayerId));
  const profileHit = hit(pr.profile), adpHit = hit(pr.adp);
  return {
    forecast_key: f.key,
    outcome: String(actualPlayerId),
    profile_correct: profileHit,
    adp_correct: adpHit,
    /* THE ENTIRE FINDING, per pick: did the profile add anything the market did
     * not already have? +1 only where the profile was right AND ADP was wrong. */
    profile_edge: (profileHit ? 1 : 0) - (adpHit ? 1 : 0),
    arms_agreed: !!f.arms_agree,
    profile_ran: !!f.profile_ran,
  };
}

/* A whole round, with the budget enforced rather than trusted. */
function predictRound(opts) {
  const o = opts || {};
  const started = (global.performance && global.performance.now)
    ? global.performance.now() : Date.now();
  const out = [];
  for (const seat of (o.seats || [])) {
    out.push(predictPick({
      season: o.season, draft_id: o.draft_id, pick_no: seat.pick_no,
      round: o.round, owner: seat.owner, board: o.board,
      profile: (o.profiles || {})[String(seat.owner)],
    }));
  }
  const took = ((global.performance && global.performance.now)
    ? global.performance.now() : Date.now()) - started;
  if (took > BUDGET_MS) {
    /* REFUSE, LOUDLY, RATHER THAN SLOW THE BOARD. The condition on this whole
     * experiment is that it costs nothing operationally; a pass that has already
     * blown the budget returns nothing and says so, so the next round is not
     * attempted on a board that is evidently struggling. */
    return { picks: [], ms: took, over_budget: true,
      why: `prediction pass took ${Math.round(took)}ms against a ${BUDGET_MS}ms `
        + 'budget — DROPPED. The evidence is only worth having if it is free.' };
  }
  return { picks: out, ms: took, over_budget: false };
}

const api = { BUDGET_MS, adpPrediction, profilePrediction, predictPick,
  resolvePick, predictRound, key };
global.OpponentPredict = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
