/* PlayerRef — the ONE player-metadata resolver (SSOT). Every surface that shows a
 * player — the board, the roster, the keeper slate, the ledger, receipts, the
 * history page — resolves an id (or a partial {player_id, name} record) through
 * HERE, so a raw numeric id never reaches a screen.
 *
 * The contract, non-negotiable:
 *  - a resolvable id renders as name + position + team + bye
 *  - an UNRESOLVABLE id renders LOUDLY as "Unknown player (<id>)" and is flagged
 *    resolved:false so callers can log it — a bare number or a silent blank is
 *    itself a data bug worth catching, never a thing to paper over
 *
 * Pure and dependency-free so the robot pass can exercise it against a fixture.
 */
(function (global) {
  'use strict';

  /** Build an index { String(player_id): metadata } from an artifact's pools.
   *  kept_players wins over players when both carry an id (it is the
   *  keeper-resolved record), but either provides name/position/team/bye. */
  function buildIndex(data) {
    const idx = {};
    const add = list => (list || []).forEach(p => {
      const id = p && (p.player_id != null ? p.player_id : p.id);
      if (id == null) return;
      const key = String(id);
      if (!idx[key]) idx[key] = p;
    });
    add((data || {}).kept_players);   // resolved keepers first
    add((data || {}).players);        // then the full board
    return idx;
  }

  /** Is this string/number a bare player id and nothing else (the bug shape)? */
  function looksLikeBareId(v) {
    return /^\s*\d{2,}\s*$/.test(String(v == null ? '' : v));
  }

  /** Resolve an id OR a partial record to a full display record.
   *  `ref` may be a raw id ("7564"), or a record {player_id, name, ...} whose
   *  name might itself be a bare id (the keeper-slate bug) — either way we look
   *  the id up in the index and prefer real metadata over a bare-id "name". */
  function resolve(ref, indexOrData) {
    const idx = (indexOrData && (indexOrData.players || indexOrData.kept_players))
      ? buildIndex(indexOrData) : (indexOrData || {});
    const isRecord = ref && typeof ref === 'object';
    const id = isRecord ? (ref.player_id != null ? ref.player_id : ref.id) : ref;
    const key = String(id == null ? '' : id);
    const hit = idx[key];
    if (hit) {
      return {
        player_id: key,
        name: hit.name || hit.full_name || key,
        position: hit.position || (isRecord ? ref.position : null) || null,
        team: hit.team || null,
        bye: hit.bye != null ? hit.bye : null,
        resolved: true,
      };
    }
    // No metadata. If the incoming record carried a REAL (non-bare-id) name, keep
    // it; otherwise render the loud unknown so a bad id is impossible to miss.
    const givenName = isRecord && ref.name && !looksLikeBareId(ref.name) ? ref.name : null;
    return {
      player_id: key,
      name: givenName || ('Unknown player (' + key + ')'),
      position: (isRecord && ref.position && ref.position !== '?') ? ref.position : null,
      team: (isRecord && ref.team) || null,
      bye: (isRecord && ref.bye != null) ? ref.bye : null,
      resolved: false,
    };
  }

  /** One-line label: "Ja'Marr Chase WR · CIN · bye 6". Degrades gracefully. */
  function label(p) {
    const r = (p && p.resolved != null) ? p : resolve(p, {});
    let s = r.name;
    if (r.position) s += ' ' + r.position;
    const tail = [];
    if (r.team) tail.push(r.team);
    if (r.bye != null) tail.push('bye ' + r.bye);
    if (tail.length) s += ' · ' + tail.join(' · ');
    return s;
  }

  const api = { buildIndex: buildIndex, resolve: resolve, label: label, looksLikeBareId: looksLikeBareId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PlayerRef = api;
})(typeof window !== 'undefined' ? window : globalThis);
