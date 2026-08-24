// TERRITORY: relay
/* THE OFFER SHEET — the +EV bets worth ORIGINATING this week.
 *
 * Cory's 08-24 mandate names the side-bet book as the league's most
 * exploitable market: nine counterparties pricing on vibes, a measured model
 * on this side. src/betedge.js already answers the REACTIVE half ("is this
 * bet offered TO me advantageous?"); this module answers the PROACTIVE half
 * ("which bets should I be sending?") — and does it by pricing candidate
 * bets through betedge's OWN priceCondition, so an offer is flagged by
 * exactly the arithmetic that would flag it if someone else offered it to us.
 * A second pricer here is how the two halves of the book come to disagree.
 *
 * V1 CANDIDATE SET, deliberately small and fully mechanical: one season-long
 * "you out-point them" head-to-head per opponent, at even money. Season
 * head-to-heads resolve from final points-for with no judgement — which is
 * what makes the sheet's own grade (P333) cheap and unarguable.
 *
 * The threshold is betedge's ADVANTAGE_P (0.55), inherited not re-declared:
 * the 5-point band is measured respect for model noise, and an offer sheet
 * that sold 52% as an edge would be the exact overclaim the band exists to
 * stop.
 */
'use strict';
const BE = require('./betedge');

/**
 * @param ctx     betedge.contextFromRows() output (null-safe)
 * @param myId    the viewer's owner id
 * @param owners  active owners [{id, name}]
 * @returns [{ opponent_id, opponent, p, edge_per_10, terms, line }] sorted
 *          best-first, only entries at or above ADVANTAGE_P. Empty when the
 *          model sees no offer worth sending — an honest quiet week.
 */
function suggestOffers(ctx, myId, owners) {
  if (!ctx) return [];
  const me = Number(myId);
  const nameOf = id => ((owners || []).find(o => Number(o.id) === Number(id)) || {}).name || `#${id}`;
  const out = [];
  for (const o of owners || []) {
    if (Number(o.id) === me) continue;
    const cond = { test: 'outscores', when: 'season', subject_id: me, target_id: o.id };
    const priced = BE.priceCondition(cond, ctx, nameOf);
    if (!priced || priced.p == null) continue;
    if (priced.p < BE.CFG.ADVANTAGE_P) continue;
    out.push({
      opponent_id: Number(o.id), opponent: o.name,
      p: Math.round(priced.p * 1000) / 1000,
      // EV per $10 even-money stake: (2p − 1) × 10.
      edge_per_10: Math.round((2 * priced.p - 1) * 10 * 100) / 100,
      terms: `${nameOf(me)} out-points ${o.name} on the season (final points-for)`,
      line: priced.line,
    });
  }
  out.sort((a, b) => b.p - a.p);
  return out;
}

module.exports = { suggestOffers };
