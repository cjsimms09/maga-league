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

// Cory forfeits rounds 1..N to keepers; his first LIVE pick is round N+1. Passed
// in so a heterogeneous future (different keep-count) is a one-arg change.
function rawSnake(slot, round, teams) {
  const odd = round % 2 === 1;
  return (round - 1) * teams + (odd ? slot : (teams - slot + 1));
}
function myPicks(slot, teams, rounds, keeperRounds) {
  const out = [];
  for (let r = keeperRounds + 1; r <= rounds; r++) out.push(rawSnake(slot, r, teams) - keeperRounds);
  return out;
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
    const picks = myPicks(slot, teams, rounds, keeperRounds);
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
    myClaimPicks: myClaim != null ? myPicks(myClaim, teams, rounds, keeperRounds) : null,
    open: cards,
    taken: takenSlots.sort((a, b) => a - b).map(s => ({ slot: s, ownerId: slotToOwner[s], ownerName: ownerName(slotToOwner[s]) })),
    recommendation: recommendation,
    provenance: 'site claims — Sleeper pending',
    caveat: 'final numbers firm at keeper lock (Aug 20)',
  };
}

module.exports = { analyze: analyze, myPicks: myPicks, rawSnake: rawSnake };
