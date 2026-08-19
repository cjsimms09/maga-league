// TERRITORY: B
/* POSITION BOARDS VIEW — Cory redefined the war room, 2026-08-19 (A dispatch,
 * ROUTES.md): "you aren't making 1 recommended pick anymore. You're giving me
 * top 5-10 at each position (more on RB and WR) and showing me projected vona
 * drop offs by other team remaining needs and projections of when gone...
 * Wouldn't mind little notes from model like maybe take QB here or wait on QB
 * here. But now need multiple positions and the view I need is different now."
 *
 * A built the data (`draft/tools/position_boards.js` -> `public/position_boards.json`).
 * This is the VIEW: six position columns, not one list. Renders whatever pick
 * entry matches the live pick number.
 *
 * ⚠️ SURVIVAL OVERRIDE, PER A'S OWN DISPATCH: the JSON's `pct_still_there_next_pick`
 * is ADP-drain only (300 simulated rooms, no live draft context). app.js MUST
 * compute a live number via `DraftSurvival.conservedSurvival()` (composes ADP
 * with opponent-need Layer 2) and pass it in as `liveSurvivalById` — a plain
 * {player_id: probability 0-1} map, kept out of this file so the render stays
 * pure (no DraftSurvival dependency, no DOM, no fetch). When a player has no
 * live entry (not yet computed, or already drafted and dropped from the live
 * board), this falls back to the JSON's own number, labelled as an estimate.
 *
 * NOTES ARE ARITHMETIC, NEVER A PICK. Cory took the position decision back
 * from the model; a note drifting toward "take this man" hands it back. The
 * note strings themselves come from the JSON (A's `noteFor()`), unmodified.
 *
 * ⚠️ THE PROJECTION-SOURCE TOGGLE, PER ROUTES-B-TOGGLE.md (A→B, 2026-08-19):
 * Cory: "can we actually program 2 models, one that uses proj from draft
 * shark and 1 that uses mean proj... I want to be able to toggle between
 * them." Every list here is SELECTED and RANKED on Draft Sharks
 * (draft/tools/position_boards.js) — that never changes under the toggle.
 * `proj_blend`/`floor_blend`/`ceiling_blend` carry the SAME already-selected
 * player's public/draft_data.json blend numbers (proj_mean/proj_floor/
 * proj_ceiling), attached alongside. The `projSource` param ('ds' default |
 * 'blend') only picks WHICH of the two already-present numbers a row prints
 * — never a reselection, never a reorder. Every player here carries both by
 * construction (A's C4 control), so there is no unranked case on this side.
 *
 * PURE: no DOM, no fetch. Dual browser/Node export, same shape as
 * market_delta.js / expert_spread.js this session.
 */
(function (global) {
  'use strict';

  // Cory: "more on RB and WR" — lead with the positions he asked to see more of.
  var POS_ORDER = ['RB', 'WR', 'QB', 'TE', 'K', 'DEF'];

  function findPick(data, pickNum) {
    var picks = (data && data.picks) || [];
    if (pickNum == null) return picks[0] || null;
    var exact = null, next = null;
    for (var i = 0; i < picks.length; i++) {
      if (picks[i].pick === pickNum) { exact = picks[i]; break; }
      if (picks[i].pick >= pickNum && (!next || picks[i].pick < next.pick)) next = picks[i];
    }
    return exact || next || null;
  }

  function fmtPct(n) { return n == null ? '—' : Math.round(n) + '%'; }
  function fmtNum(n) { return n == null ? '—' : String(n); }

  function survivalFor(p, liveSurvivalById) {
    if (liveSurvivalById && p.player_id != null) {
      var live = liveSurvivalById[String(p.player_id)];
      if (live != null) return { pct: Math.round(live * 100), live: true };
    }
    return { pct: p.pct_still_there_next_pick, live: false };
  }

  function riskBadge(pct, esc) {
    if (pct == null) return '';
    var cls = pct >= 50 ? ' pb-risk-hi' : pct >= 25 ? ' pb-risk-mid' : '';
    return '<span class="pb-risk' + cls + '" title="' + esc(pct + '% injury risk (Draft Sharks)') + '">⚕' + pct + '%</span>';
  }

  /* Which of the two already-present numbers a row prints. 'blend' falls
   * back to the DS number only if a blend figure is somehow absent (should
   * not happen — A's C4 control — but a fallback beats a blank cell). */
  function projFieldsFor(p, projSource) {
    if (projSource === 'blend' && p.proj_blend != null) {
      return { proj: p.proj_blend, floor: p.floor_blend, ceiling: p.ceiling_blend };
    }
    return { proj: p.proj, floor: p.floor, ceiling: p.ceiling };
  }

  function playerRow(p, esc, liveSurvivalById, isCliffLine, projSource) {
    var surv = survivalFor(p, liveSurvivalById);
    var survClass = surv.pct == null ? '' : surv.pct >= 70 ? 'pb-surv-safe' : surv.pct >= 30 ? 'pb-surv-mid' : 'pb-surv-hot';
    var survTitle = surv.live
      ? 'live, opponent-need aware'
      : 'pre-draft estimate (ADP-drain only) — live number not available yet';
    var pf = projFieldsFor(p, projSource);
    return '<tr class="pb-row' + (isCliffLine ? ' pb-cliff-line' : '') + '">'
      + '<td class="pb-name">' + esc(p.name || '')
        + (p.team ? ' <span class="pb-team">' + esc(p.team) + '</span>' : '') + '</td>'
      + '<td class="pb-proj">' + esc(fmtNum(pf.proj)) + '</td>'
      + '<td class="pb-fc" title="' + esc('floor ' + fmtNum(pf.floor) + ' / ceiling ' + fmtNum(pf.ceiling)) + '">'
        + esc(fmtNum(pf.floor) + '/' + fmtNum(pf.ceiling)) + '</td>'
      + '<td class="pb-adp">' + esc(fmtNum(p.adp)) + '</td>'
      + '<td class="pb-surv ' + survClass + '" title="' + esc(survTitle) + '">' + esc(fmtPct(surv.pct))
        + (surv.live ? '' : '<sup class="pb-est">~</sup>') + '</td>'
      + '<td class="pb-risk-cell">' + riskBadge(p.injury_risk_pct, esc) + '</td>'
      + '</tr>';
  }

  function positionColumn(pos, block, esc, liveSurvivalById, projSource) {
    if (!block) return '';
    var players = block.players || [];
    var rows = players.map(function (p, i) {
      var row = playerRow(p, esc, liveSurvivalById, false, projSource);
      if (block.cliff_after_rank != null && i === block.cliff_after_rank - 1 && i < players.length - 1) {
        row += '<tr class="pb-cliff-row"><td colspan="6">▽ cliff — next tier drops '
          + esc(fmtNum(block.cliff_size)) + ' pts ▽</td></tr>';
      }
      return row;
    }).join('');
    return '<div class="pb-col">'
      + '<div class="pb-col-head">'
        + '<span class="pb-pos">' + esc(pos) + '</span>'
        + '<span class="pb-vona" title="VONA — what waiting until your next pick costs">'
          + 'VONA <b>' + esc(fmtNum(block.VONA)) + '</b></span>'
        + '<span class="pb-surplus" title="best available, points over a free waiver pickup">'
          + '+' + esc(fmtNum(block.surplus_over_wire)) + ' wire</span>'
      + '</div>'
      + (block.note ? '<div class="pb-note">' + esc(block.note) + '</div>' : '')
      + (players.length ? '<table class="pb-table"><thead><tr>'
        + '<th>Player</th><th>Proj</th><th>Fl/Ce</th><th>ADP</th><th>Surv</th><th></th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>' : '<div class="pb-empty">none available</div>')
      + '</div>';
  }

  /* Cory: "can we actually program 2 models... I want to be able to toggle
   * between them." Selection/order are Draft-Sharks-fixed (unchanged by this
   * control — see the file header); this only swaps which already-present
   * number each row prints. */
  function projSourceToggle(esc, projSource) {
    var ds = projSource !== 'blend';
    return '<div class="pb-src-toggle" title="Ranking and selection always use Draft Sharks — this only swaps which projection number is displayed">'
      + '<button type="button" class="pb-src-btn' + (ds ? ' pb-src-active' : '') + '" data-pb-source="ds">Draft Sharks</button>'
      + '<button type="button" class="pb-src-btn' + (!ds ? ' pb-src-active' : '') + '" data-pb-source="blend">Blend</button>'
      + '</div>';
  }

  /* Cory: "very easy for me to view other team needs in a very small window." */
  function opponentsStrip(list, esc) {
    if (!list || !list.length) return '';
    var rows = list.map(function (o) {
      return '<div class="pb-opp-row">'
        + '<span class="pb-opp-name">' + esc(o.owner || '') + '</span>'
        + (o.keeps ? '<span class="pb-opp-keeps" title="already has">' + esc(o.keeps) + '</span>' : '')
        + '<span class="pb-opp-needs" title="still open">' + esc(o.needs || '') + '</span>'
      + '</div>';
    }).join('');
    return '<details class="pb-opponents"><summary>Room needs (' + list.length + ' owners)</summary>'
      + '<div class="pb-opp-body">' + rows + '</div></details>';
  }

  /* Cory: "info about when position drop offs are high or low between rounds." */
  function dropoffsStrip(list, esc) {
    if (!list || !list.length) return '';
    var rows = list.map(function (d) {
      var cells = POS_ORDER.map(function (pos) {
        var v = (d.pos || {})[pos];
        var hot = v != null && d.steepest === pos && v > 0;
        return '<td class="' + (hot ? 'pb-do-hot' : '') + '">' + esc(v == null ? '—' : String(v)) + '</td>';
      }).join('');
      return '<tr><td class="pb-do-range">' + esc(d.from_pick + '→' + d.to_pick) + '</td>' + cells + '</tr>';
    }).join('');
    return '<details class="pb-dropoffs"><summary>Round-to-round drop-offs</summary>'
      + '<table class="pb-do-table"><thead><tr><th></th>'
      + POS_ORDER.map(function (p) { return '<th>' + esc(p) + '</th>'; }).join('')
      + '</tr></thead><tbody>' + rows + '</tbody></table></details>';
  }

  /* Cory: "when do we really ramp up ceilings and look for players who's ADP
   * is a steal if they perform closer to their ceilings." */
  function stealsStrip(list, caveat, esc) {
    if (!list || !list.length) return '';
    var rows = list.slice(0, 10).map(function (s) {
      return '<tr><td>' + esc(s.name || '') + ' <span class="pb-team">' + esc(s.position || '') + '</span></td>'
        + '<td>' + esc(fmtNum(s.adp)) + '</td>'
        + '<td>' + esc(fmtNum(s.proj)) + ' / ' + esc(fmtNum(s.ceiling)) + '</td>'
        + '<td>' + esc(fmtNum(s.steal_gap)) + ' ranks</td></tr>';
    }).join('');
    return '<details class="pb-steals"><summary>Ceiling steals</summary>'
      + (caveat ? '<div class="pb-note">' + esc(caveat) + '</div>' : '')
      + '<table class="pb-steals-table"><thead><tr><th>Player</th><th>ADP</th><th>Proj/Ceil</th><th>Steal gap</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></details>';
  }

  /* THE PUBLIC ENTRY POINT. Returns '' if there is no data or no matching pick,
   * so a missing/stale artifact degrades to nothing rather than a broken panel.
   * `projSource` ('ds' default | 'blend') — see projSourceToggle above. */
  function renderPositionBoards(data, pickNum, liveSurvivalById, esc, projSource) {
    if (!data || !Array.isArray(data.picks) || !data.picks.length) return '';
    var pick = findPick(data, pickNum);
    if (!pick) return '';
    var src = projSource === 'blend' ? 'blend' : 'ds';
    var cols = POS_ORDER.map(function (pos) {
      return positionColumn(pos, (pick.positions || {})[pos], esc, liveSurvivalById, src);
    }).join('');
    return '<div class="pb-wrap">'
      + '<div class="pb-head">Position boards — pick ' + esc(String(pick.pick))
        + ' (round ' + esc(String(pick.round)) + ')'
        + (pick.next_pick ? ', your next pick is ' + esc(String(pick.next_pick)) : '') + '</div>'
      + projSourceToggle(esc, src)
      + '<div class="pb-grid">' + cols + '</div>'
      + opponentsStrip(data.opponents_compact, esc)
      + dropoffsStrip(data.round_dropoffs, esc)
      + stealsStrip(data.ceiling_steals, data._steals_caveat, esc)
      + '</div>';
  }

  var API = { renderPositionBoards: renderPositionBoards, findPick: findPick,
    positionColumn: positionColumn, projFieldsFor: projFieldsFor, POS_ORDER: POS_ORDER };
  global.PositionBoardsView = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
