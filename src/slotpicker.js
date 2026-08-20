'use strict';
/*
 * SLOT PICKER (private, Cory-only) — turns the slot-value analysis into a live
 * page while draft-spot claims land on the shared /draft page. READ-ONLY: it
 * never writes the claim doc and never touches the shared page — it only reads
 * the claim state and ranks the still-open slots for Cory's own pick.
 *
 * Pure module (state in, model out) so the robot can drive it with a fixture.
 * Survival uses the same survival.js the war room uses.
 */
const path = require('path');
let S = null;
try { S = require(path.join(__dirname, '..', 'public', 'js', 'draft', 'survival.js')); } catch (e) { S = null; }

let K = null;
try { K = require(path.join(__dirname, '..', 'public', 'js', 'draft', 'keepers.js')); } catch (e) { K = null; }

/* MY PICK NUMBERS AT A CANDIDATE SEAT — via the SHARED derivation.
 *
 * A SECOND DERIVATION PATH, FOUND BY RULE 11's BINDING DIAGNOSTIC (2026-08-10).
 * This file used to compute pick numbers itself: a local `rawSnake` with snake
 * parity hard-coded, minus a flat keeperRounds. `keepers.buildTruePickOrder` —
 * the derivation the pipeline, the war room and `setSlot` all use — computes the
 * same quantity a different way.
 *
 * Compared across paths for the live config, they AGREE at all ten seats. They
 * agree only because this league is snake:
 *
 *     snake                  0/10 seats disagree
 *     third_round_reversal  10/10 disagree  (seat 1: [37,38,57,58] vs [28,47,48,67])
 *     linear                10/10 disagree  (seat 1: [37,38,57,58] vs [28,38,48,58])
 *
 * `rawSnake` never read draft_type at all, so it silently answered as though
 * every draft were a snake. That is reachable, not theoretical: sleeper_import.py
 * explicitly maps `settings.reversal_round` to `third_round_reversal`. The slot
 * picker's whole job is telling Cory which SEAT to claim — it would have done so
 * from pick numbers that do not exist, with nothing failing.
 *
 * So the second path is deleted rather than cross-checked. Keeping two and
 * comparing them would be two-places-with-a-test; one derivation cannot disagree
 * with itself. It also picks up the real keeper cost model (top_picks_flat and
 * the collision roll) instead of assuming a flat subtraction.
 */
function myPicks(slot, teams, rounds, keeperRounds, opts) {
  const o = opts || {};
  if (K) {
    const cfg = {
      teams: teams, rounds: rounds,
      draft_type: o.draftType || 'snake',
      my_draft_slot: slot,
      keepers: o.keeperRules || { count: keeperRounds, cost_model: 'top_picks_flat' },
    };
    // Keepers are only needed as COUNT-many charges against this seat; the real
    // slate (when the caller has it) keeps the cost model honest.
    const list = (o.keepers && o.keepers.length)
      ? o.keepers.map(k => Object.assign({}, k, { team_slot: slot }))
      : Array.from({ length: keeperRounds }, (_, i) => ({ player_id: 'k' + i, team_slot: slot }));
    const byTeam = keeperRounds > 0 ? { [slot]: list } : {};
    const out = K.buildTruePickOrder(cfg, byTeam);
    if (out && (out.my_picks || []).length) return out.my_picks;
  }
  // FAIL LOUD, not silently back to a private snake formula. A wrong seat
  // recommendation is worse than none, and this module is Cory-only.
  throw new Error('slotpicker: keepers.js unavailable — refusing to invent pick numbers');
}

/** claimOrder: [{pos, owner_id, slot}] from the draft:<year> doc. */
function analyze(opts) {
  const o = opts || {};
  const art = o.artifact || {};
  const league = art.league || {};
  const teams = o.teams || league.teams || 10;
  const rounds = o.rounds || league.rounds || 15;
  const keeperRounds = o.keeperRounds != null ? o.keeperRounds : 3;
  const claimOrder = o.claimOrder || [];
  // The draft's real SHAPE, carried to the shared pick derivation. Defaulting
  // draft_type to 'snake' silently is what the deleted rawSnake did.
  const pickOpts = {
    draftType: o.draftType || league.draft_type || 'snake',
    keeperRules: league.keeper_rules || null,
    keepers: (art.pick_order || {}).forfeited || [],
  };
  const ownerName = o.ownerName || (id => 'Owner ' + id);
  const myOwnerId = o.myOwnerId;

  // slot -> owner_id (claimed), and my own claim if any.
  const slotToOwner = {};
  let myClaim = null;
  claimOrder.forEach(e => {
    if (e.slot != null) slotToOwner[Number(e.slot)] = e.owner_id;
    if (String(e.owner_id) === String(myOwnerId) && e.slot != null) myClaim = Number(e.slot);
  });
  const takenSlots = Object.keys(slotToOwner).map(Number);

  // Board + best TE ("Bowers-class") for survival to first pick.
  const board = (art.players || []).filter(p => (p.proj_mean || 0) > 0)
    .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
  const bestTE = board.find(p => p.position === 'TE') || null;
  const ctx = { board: board, league: league, runMultipliers: {},
    profiles: (art.manager_profiles || {}).managers || {} };
  const surv = (player, pick) => (S && player) ? S.survivalProbability(player, pick, ctx) : null;

  function neighbor(slot, delta) {
    const n = slot + delta;
    if (n < 1 || n > teams) return null;
    const owner = slotToOwner[n];
    return { slot: n, claimed: owner != null,
      name: owner != null ? ownerName(owner) : null };
  }

  const cards = [];
  for (let slot = 1; slot <= teams; slot++) {
    if (slotToOwner[slot] != null) continue;   // taken — not a candidate
    const picks = myPicks(slot, teams, rounds, keeperRounds, pickOpts);
    const first = picks[0];
    const second = picks[1];
    const backToBack = second != null && (second - first) <= 2;
    cards.push({
      slot: slot,
      picks: picks,
      first: first,
      second: second,
      backToBack: backToBack,
      bowersSurvival: bestTE ? surv(bestTE, first) : null,
      bowersName: bestTE ? bestTE.name : null,
      turnNote: backToBack
        ? 'the TURN — back-to-back at ' + first + ',' + second + ' (grab a pair before the wheel)'
        : 'mid cadence — first pick ' + first,
      before: neighbor(slot, -1),
      after: neighbor(slot, +1),
    });
  }

  // Rank: earlier first pick is the stronger anchor (more premium fallers survive),
  // with a small bonus for the back-to-back turn. Lower `first` = better.
  cards.forEach(c => { c.score = -(c.first || 999) + (c.backToBack ? 1.5 : 0); });
  cards.sort((a, b) => b.score - a.score);
  cards.forEach((c, i) => { c.rank = i + 1; });

  const top = cards[0] || null;
  const recommendation = top ? {
    slot: top.slot,
    reason: top.backToBack
      ? 'Slot ' + top.slot + ' — the turn gives back-to-back picks ' + top.first + ',' + top.second
        + ' to secure a pair (stack or WR2+TE) before the long wait.'
      : 'Slot ' + top.slot + ' — earliest open first pick (' + top.first + '), best shot at a premium '
        + 'faller to anchor your open WR2/TE'
        + (top.bowersSurvival != null ? ' (' + Math.round(top.bowersSurvival * 100) + '% ' + top.bowersName + ' survives)' : '') + '.',
  } : null;

  return {
    teams: teams,
    rounds: rounds,
    keeperRounds: keeperRounds,
    myClaim: myClaim,
    claimed: myClaim != null,
    myClaimPicks: myClaim != null ? myPicks(myClaim, teams, rounds, keeperRounds, pickOpts) : null,
    open: cards,
    taken: takenSlots.sort((a, b) => a - b).map(s => ({ slot: s, ownerId: slotToOwner[s], ownerName: ownerName(slotToOwner[s]) })),
    recommendation: recommendation,
    provenance: 'site claims — Sleeper pending',
    caveat: 'final numbers firm at keeper lock (Aug 21)',
  };
}

module.exports = { analyze: analyze, myPicks: myPicks };
