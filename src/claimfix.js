/* Commissioner claim correction — the fat-finger fix for the live slot draft.
 *
 * The slot-claim process is live and sequential: owners pick draft spots in
 * `order[]` position order, the current turn being the first entry with
 * slot == null. A wrong claim (Richard on the wrong slot, mid-process) would
 * otherwise be permanent. This module is the pure correction logic: SET an
 * owner's claim to a specific slot, or CLEAR it so they re-pick.
 *
 * Semantics that make it downstream-safe by construction (data-spine rule —
 * every consumer derives from the ONE claim doc, so correcting the doc corrects
 * everything: the /draft page's pool, the slot-picker model, the war room's
 * claimed-slot provenance):
 *   - SET: frees the owner's old slot (back to the pool) and takes the new one.
 *     Rejected if another owner holds it.
 *   - CLEAR: the owner returns to unclaimed. Because the turn is "first null in
 *     position order", an owner cleared at position k becomes the current turn
 *     again — later positions wait until the commissioner's correction settles.
 *   - Every correction appends to doc.corrections — corrections, never
 *     silent edits; the audit trail is part of the doc.
 */
'use strict';

/**
 * @param doc    the draft:{year} document ({order:[{pos,owner_id,slot}], ...})
 * @param fix    {owner_id, action:'set'|'clear', slot?, by, at}
 * @returns      {doc, change:{owner_id, from, to}, next_owner_id}
 */
function applyCorrection(doc, fix) {
  const order = (doc && doc.order) || [];
  if (!order.length) throw new Error('no claim order exists yet');
  const entry = order.find(e => Number(e.owner_id) === Number(fix.owner_id));
  if (!entry) throw new Error('that owner is not in the claim order');

  const from = entry.slot == null ? null : Number(entry.slot);
  let to = null;

  if (fix.action === 'set') {
    to = parseInt(fix.slot, 10);
    if (!(to >= 1 && to <= order.length)) {
      throw new Error('slot must be 1-' + order.length);
    }
    const holder = order.find(e => Number(e.slot) === to
      && Number(e.owner_id) !== Number(fix.owner_id));
    if (holder) {
      throw new Error('slot ' + to + ' is held by owner ' + holder.owner_id
        + ' — clear or move them first');
    }
    entry.slot = to;
  } else if (fix.action === 'clear') {
    if (from == null) throw new Error('that owner has no claim to clear');
    entry.slot = null;
  } else {
    throw new Error('action must be set or clear');
  }

  doc.corrections = doc.corrections || [];
  doc.corrections.push({
    at: fix.at, by: fix.by || null,
    owner_id: Number(fix.owner_id), from: from, to: entry.slot,
  });

  const next = order.find(e => e.slot == null);
  return {
    doc: doc,
    change: { owner_id: Number(fix.owner_id), from: from, to: entry.slot },
    next_owner_id: next ? next.owner_id : null,
  };
}

/** The open pool after any state — derived, never stored (one fact, one home). */
function openSlots(doc) {
  const order = (doc && doc.order) || [];
  const taken = new Set(order.filter(e => e.slot != null).map(e => Number(e.slot)));
  const out = [];
  for (let s = 1; s <= order.length; s++) if (!taken.has(s)) out.push(s);
  return out;
}

module.exports = { applyCorrection, openSlots };
