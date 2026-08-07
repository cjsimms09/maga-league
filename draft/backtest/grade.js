/* The JS-side survival truth helper. Kept tiny and separate from grade.py so
 * the replay's calibration does not need a Python round-trip. */
'use strict';
function survived(sp, picks) {
  if (!picks || !picks.length) return null;
  let last = 0;
  picks.forEach(p => { if ((p.pick_no || 0) > last) last = p.pick_no; });
  if (sp.next_pick > last) return null;       // unknowable, not a survival
  for (let i = 0; i < picks.length; i++) {
    const n = picks[i].pick_no || 0;
    if (n > sp.pick_no && n < sp.next_pick && String(picks[i].player_id) === String(sp.player_id)) return false;
  }
  return true;
}
module.exports = { survived };
