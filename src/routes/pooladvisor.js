'use strict';
//
// THE FRANCHISE-POOL ADVISOR — commissioner-only, per the tools rule.
//
// Only the champion matters, so a champion pool is a PORTFOLIO problem, not a
// ranking problem: the right metric for a pick is its marginal contribution to
// P(I hold the champion) given what I already hold and what my opponent is likely
// to take next — VONA for franchises. This module computes that.
//
// INPUT it needs from A's lane (flagged in PARKED): `champProb[owner_id]` — each
// franchise's probability of winning the league (roster + owner efficiency +
// schedule), and ideally `meetProb["a:b"]` — the chance two teams meet in a
// playoff round, so correlated picks (two titans who'd eliminate each other in
// the semi) are priced below their standalone odds. Until A ships that MEASURED
// model, the advisor renders a "pending" state — no numbers — and drops A's model
// in with no interface change the moment it lands.
//
// There is deliberately NO placeholder champion-odds generator (Cory, 2026-08-09:
// "do not manufacture odds nobody measured. Better it says 'odds pending' than
// shows a number nobody measured"). `advise()` is called ONLY once a MEASURED
// { owner_id: p(win league) } model exists; the route renders pending otherwise.
//
// The DRAFT interface is shared; THIS analysis is the commissioner's.

const r3 = n => Math.round(n * 1000) / 1000;

/** Which bettor picks at overall pick `made` (0-indexed), snake order. */
function snakeAt(order, made) {
  const k = order.length; if (!k) return null;
  const round = Math.floor(made / k), pos = made % k;
  return order[(round % 2 === 0) ? pos : (k - 1 - pos)];
}

/** How many picks the OPPONENT makes before my next turn (from the live draft). */
function oppPicksBeforeMyNextTurn(order, made, myId) {
  let count = 0;
  // Find my current/next pick index at or after `made`, then count opp picks until
  // the pick AFTER that (my following turn).
  let i = made;
  // advance to my next turn
  while (snakeAt(order, i) !== myId && i < made + 2 * order.length) i++;
  // now i is my turn; count opp picks from i+1 until my turn again
  let j = i + 1;
  while (snakeAt(order, j) !== myId && j < i + 1 + 2 * order.length) { count++; j++; }
  return count;
}

/**
 * The advice. Pure over the draft state + champ odds.
 *
 * @param draft     bet.draft { order, pool, taken, sequence, turn, complete }
 * @param myId      the commissioner's bettor id
 * @param champProb { owner_id: p(win league) }  A's MEASURED model (required)
 * @param nameOf    (owner_id) => name
 * @param source    'model'  provenance, shown honestly (only measured odds reach here)
 */
function advise({ draft, myId, champProb, nameOf, source = 'model' }) {
  if (!draft) return null;
  const oppId = (draft.order || []).find(id => Number(id) !== Number(myId));
  const held = draft.taken || {};
  const available = (draft.pool || []).filter(t => held[t] == null);
  const mine = (draft.pool || []).filter(t => Number(held[t]) === Number(myId));
  const theirs = (draft.pool || []).filter(t => Number(held[t]) === Number(oppId));

  const P = t => Number(champProb[t] || 0);
  const pMine = mine.reduce((a, t) => a + P(t), 0);
  const pTheirs = theirs.reduce((a, t) => a + P(t), 0);
  const pField = available.reduce((a, t) => a + P(t), 0);

  // Marginal value of drafting team t: I gain P(t) toward holding the champ AND I
  // deny it to my opponent — both matter in a two-person pool, so value counts the
  // full swing. Correlation discount: each strong team I already hold raises the
  // chance two of MINE meet and eliminate each other in the bracket, so a second
  // titan is worth a little less (crude until A's meetProb lands).
  const corrDiscount = 1 - Math.min(0.3, 0.10 * mine.filter(t => P(t) > pField / Math.max(1, available.length)).length);
  const recs = available.map(t => ({
    team: t, name: nameOf(t), champProb: r3(P(t)),
    value: r3(P(t) * (1 + corrDiscount)),   // gain + denial, discounted for collision
  })).sort((a, b) => b.value - a.value);

  // What's likely gone before my next turn: the opponent takes the best available
  // by raw champ odds on each of their intervening picks.
  const gap = oppId != null ? oppPicksBeforeMyNextTurn(draft.order, draft.sequence.length, myId) : 0;
  // What the opponent grabs before I pick again — the best available AFTER I take
  // my recommended pick (so it doesn't include the team I'm about to draft).
  const topPickTeam = recs[0] ? recs[0].team : null;
  const likelyGone = [...recs]
    .filter(r => r.team !== topPickTeam)
    .sort((a, b) => b.champProb - a.champProb)
    .slice(0, gap).map(r => r.name);

  // Live P(I win the bet) ≈ my held odds + my expected share of the field still to
  // be drafted (split by remaining picks), vs the opponent's. Rough but honest.
  const myRemaining = Math.ceil(available.length / 2);
  const shareMine = available.length ? (myRemaining / available.length) * pField : 0;
  const pWinRaw = pMine + shareMine;
  const pLoseRaw = pTheirs + (pField - shareMine);
  const denom = pWinRaw + pLoseRaw || 1;
  const pWin = r3(pWinRaw / denom);

  return {
    source,
    myHeld: mine.map(t => ({ team: t, name: nameOf(t), champProb: r3(P(t)) })).sort((a, b) => b.champProb - a.champProb),
    pHoldChampMe: r3(pMine), pHoldChampOpp: r3(pTheirs), pFieldLeft: r3(pField),
    recommendation: recs[0] || null,
    recs,
    likelyGone, gap,
    pWin,
    // The one honest sentence.
    confidence: recs.length
      ? `Take ${recs[0].name} — the biggest marginal swing (≈${Math.round(recs[0].champProb * 100)}% of the title in play${likelyGone.length ? `; ${likelyGone.slice(0, 2).join(', ')} likely gone before your next turn` : ''}). Live P(you win the bet): ${Math.round(pWin * 100)}%.`
      : `Draft complete — you hold ${Math.round(pMine * 100)}% of the title odds. Live P(you win): ${Math.round(pWin * 100)}%.`,
    placeholder: source !== 'model',
  };
}

module.exports = { advise, snakeAt, oppPicksBeforeMyNextTurn };
