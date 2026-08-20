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

  /* A DOT, NOT A NUMBER. First cut of this row spelled out "⚕67%" as its own
   * column and, separately, folded it into a wrapping subline with three
   * other figures — both measured as too wide (six nowrap columns forced a
   * horizontal scroll at a real 1440px viewport; the subline then wrapped
   * player rows to 3-4 lines each and, on long names, broke words mid-
   * syllable — "Quinsho-n-Judkins" — while ALSO silently truncating the
   * survival cell to "1...", a real bug my own width check had missed
   * because it never queried .pb-surv). Caught by looking at the actual
   * rendered page, not by eyeballing the code.
   *
   * A colored dot costs the row nothing horizontally and the exact number
   * is still one hover away (title), same as VONA/surplus above it. */
  function riskDot(pct, esc) {
    if (pct == null) return '';
    var cls = pct >= 50 ? ' pb-risk-hi' : pct >= 25 ? ' pb-risk-mid' : '';
    return '<span class="pb-risk-dot' + cls + '" title="' + esc(pct + '% injury risk (Draft Sharks)') + '">●</span>';
  }

  /* ── WHY THIS ROW IS 4 COLUMNS, NOT 6 ─────────────────────────────────────
   * Measured, not eyeballed, at a real 1440px viewport: six nowrap numeric
   * columns (Proj/Fl-Ce/ADP/Surv/Risk) needed a forced horizontal scroll to
   * reach the last position at all. Player/Proj/Fl-Ce/Surv are the four a
   * glance down the list is actually comparing; ADP is one hover away on
   * the name (still the SAME number, never dropped), and risk is a dot, not
   * a column (see riskDot above). Team sits beside the name, not under it —
   * a second LINE per row is exactly what turned 10 players into a wall of
   * text the first time through this fix. */
  function playerRow(p, esc, liveSurvivalById, isCliffLine, projSource, scale) {
    var surv = survivalFor(p, liveSurvivalById);
    var survClass = surv.pct == null ? '' : surv.pct >= 70 ? 'pb-surv-safe' : surv.pct >= 30 ? 'pb-surv-mid' : 'pb-surv-hot';
    var survTitle = surv.live
      ? 'live, opponent-need aware'
      : 'pre-draft estimate (ADP-drain only) — live number not available yet';
    var pf = projFieldsFor(p, projSource);
    /* WAR-ROOM-SPEC.md P1 names `bye` in its per-row field list; the artifact
     * never carried it (checked: draft_data.json has it, position_boards.js
     * just never joined it — fixed there). Same hover pattern as ADP, not a
     * fifth visible column — bye-week collision matters for roster building,
     * not for the 8-second in-the-moment pick, so it costs nothing to keep
     * it one hover away rather than fighting for more row width. */
    var nameTitleParts = [];
    if (p.adp != null) nameTitleParts.push('ADP ' + fmtNum(p.adp));
    if (p.bye != null) nameTitleParts.push('bye ' + fmtNum(p.bye));
    var nameTitle = nameTitleParts.join(' · ');
    /* THE DOT LIVES ON THE NAME CELL, NOT THE SURVIVAL CELL — measured, not
     * guessed. "100%●" inline with the survival percentage needed 49px of
     * real width; no allocation split among four columns in a ~150px table
     * ever gave it that much without starving something else. Absolutely
     * positioned in the name cell's own corner, it costs the TEXT FLOW
     * nothing — same trick riskBadge's predecessor never had, because it
     * was never asked to share a cell with three other things. */
    var risk = riskDot(p.injury_risk_pct, esc);
    /* A CSS-GRID ROW, NOT A <table> ROW. The <table> version's headers and
     * cells drifted apart under table-layout: fixed — a live screenshot
     * caught "PROJ"/"RANGE"/"SURV" overlapping in the header, and Proj's
     * number bleeding into a wrapped name's third line ("Montgom" / "197" /
     * "ery"), because auto table layout does not guarantee the header row
     * and a body row agree on column edges once content wraps unevenly.
     * A CSS grid template defined ONCE (.pb-table-row in warroom.css) and
     * reused by every row — header included — cannot drift, by construction:
     * there is only one column-width definition, not table auto-layout's
     * independent guess per row. */
    /* data-drill wires this row into the existing document-level click
     * delegate (warroom_charts.js) that opens the full player-detail panel —
     * Cory: "if I click a player it should give me lots of info". Same
     * attribute the left rail and big-board columns already use; no new
     * interaction pattern, just extended to the primary per-pick view that
     * was missing it. */
    return '<div class="pb-table-row pb-row' + (isCliffLine ? ' pb-cliff-line' : '') + '"'
      + (p.player_id != null ? ' data-drill="' + esc(String(p.player_id)) + '"' : '') + '>'
      + '<div class="pb-name"' + (nameTitle ? ' title="' + esc(nameTitle) + '"' : '') + '>'
        + esc(p.name || '') + (p.team ? ' <span class="pb-team">' + esc(p.team) + '</span>' : '') + risk + '</div>'
      + '<div class="pb-proj">' + esc(fmtNum(pf.proj)) + '</div>'
      + '<div class="pb-range">' + rangeBarMini(pf.floor, pf.proj, pf.ceiling, scale, esc) + '</div>'
      + '<div class="pb-surv ' + survClass + '" title="' + esc(survTitle) + '">' + esc(fmtPct(surv.pct))
        + (surv.live ? '' : '<sup class="pb-est">~</sup>') + '</div>'
      + '</div>';
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

  /* THE FLOOR–PROJ–CEILING RANGE, AS A BAR, NOT TEXT. Third shape for this
   * cell: "173/290" (its own column) measured 55px against a 26px budget;
   * folding it into a subline under the name wrapped every row to 3-4 lines
   * and broke names mid-word. A range visual does not have that problem —
   * its width is a fixed pixel count, not a character count, so it fits the
   * same ~26px this text never did, and it is the shape the dataviz method
   * actually calls for here: floor/ceiling is a MAGNITUDE WITH A RANGE, and
   * a bar reads that at a glance where three digits and a slash do not.
   * `scale` ({min,max}) is the position COLUMN's own floor-to-ceiling span
   * (positionColumn computes it once) — never the whole board's, for the
   * same reason the round-drop-off chart never shares a y-axis across
   * positions: a shared cross-position scale flattens whichever position
   * has the smaller spread. Exact numbers stay one hover away (title). */
  function rangeBarMini(floor, proj, ceiling, scale, esc) {
    if (floor == null || proj == null || ceiling == null || !scale || !(scale.max > scale.min)) {
      return fmtNum(proj);
    }
    var w = 24, h = 10;
    var x = function (v) {
      var t = (v - scale.min) / (scale.max - scale.min);
      return Math.max(0, Math.min(1, t)) * w;
    };
    var bx = x(floor), bw = Math.max(1, x(ceiling) - bx), mx = x(proj);
    var title = 'floor ' + fmtNum(floor) + ' · proj ' + fmtNum(proj) + ' · ceiling ' + fmtNum(ceiling);
    return '<span class="pb-range-wrap" title="' + esc(title) + '">'
      + '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(title) + '">'
      + '<line class="pb-range-rail" x1="0" y1="' + (h / 2) + '" x2="' + w + '" y2="' + (h / 2) + '"/>'
      + '<rect class="pb-range-band" x="' + bx.toFixed(1) + '" y="1" width="' + bw.toFixed(1) + '" height="' + (h - 2) + '" rx="1.5"/>'
      + '<line class="pb-range-tick" x1="' + mx.toFixed(1) + '" y1="0" x2="' + mx.toFixed(1) + '" y2="' + h + '"/>'
      + '</svg></span>';
  }

  /* ── THE VONA FALL-OFF CHART, BY ROUND — Cory, 2026-08-19: "really liked
   * the vona fall off charts by round.. improve them." "info about when
   * position drop offs are high or low between rounds."
   *
   * One small chart PER POSITION, inside that position's own column — where
   * he is already looking, not a separate section he has to correlate back
   * against the players above it. `round_dropoffs` is global (the whole
   * draft's round-to-round schedule), the same 11 transitions for every
   * column; each column reads only its OWN position's values.
   *
   * ⚠️ EACH BAR CHART GETS ITS OWN Y-SCALE, DELIBERATELY. This is the exact
   * defect this project corrected four times in one day (register discussion,
   * 2026-08-19 CLAUDE.md): a statistic compared ACROSS positions on one scale
   * makes the small ones invisible and the big ones dominate for no football
   * reason — QB/K/DEF drop-offs are real signal at 5-15 pts; RB/WR run
   * 20-40. A shared 0-40 axis would flatten every QB/K/DEF bar to a hairline.
   * Scaled to its own max, a position's OWN cliff always reads as a real bar.
   *
   * The steepest transition for THIS position gets the same status color the
   * existing exact-numbers table already uses (`.pb-do-hot`, `--wr-bad`) —
   * one color meaning "the cliff", never a decorative rainbow across bars.
   * Direct-labelled ONLY on that one bar (the caption line), never every bar. */
  /* IMPROVED, 2026-08-19 — Cory: "improve the charts you have... could be
   * great." Two real, low-risk upgrades, kept inside this codebase's own
   * established idiom (plain SVG + native `title` tooltips — every chart in
   * warroom_charts.js works the same way; a one-off custom JS tooltip here
   * would be a new pattern for one chart, not an improvement):
   *   1. ROUND LABELS. The chart had bars and nothing else — no axis, no
   *      way to read WHICH round a bar belongs to without hovering every
   *      one. A small label row underneath (the round each transition ENDS
   *      at) turns "some bars" into an actual axis.
   *   2. HOVER LIFT. Pure CSS (`.pb-do-bar:hover`) brightens and nudges the
   *      hovered bar up — real interactivity, costs no JS, and pairs with
   *      the tooltip that already fires on the same hover. */
  function roundDropoffChart(pos, dropoffs, esc) {
    if (!dropoffs || !dropoffs.length) return '';
    var vals = dropoffs.map(function (d) {
      var v = (d.pos || {})[pos];
      return v == null ? 0 : v;
    });
    var max = Math.max.apply(null, vals.concat([1]));
    var w = 132, h = 38, gap = 2, n = vals.length;
    var bw = (w - gap * (n - 1)) / n;
    var maxV = Math.max.apply(null, vals);
    var maxIdx = vals.indexOf(maxV);
    var bars = vals.map(function (v, i) {
      var bh = v > 0 ? Math.max(2, (v / max) * (h - 3)) : 0.5;
      var x = i * (bw + gap);
      var y = h - bh;
      var d = dropoffs[i];
      var hot = i === maxIdx && v > 0;
      var lbl = 'R' + d.from_round + '→' + d.to_round + ': −' + fmtNum(v) + ' pts (' + pos + ')';
      return '<rect class="pb-do-bar' + (hot ? ' pb-do-bar-hot' : '') + '" x="' + x.toFixed(1)
        + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="1">'
        + '<title>' + esc(lbl) + '</title></rect>';
    }).join('');
    var labels = dropoffs.map(function (d) {
      return '<span class="pb-do-tick">' + esc(fmtNum(d.to_round)) + '</span>';
    }).join('');
    var hotD = dropoffs[maxIdx];
    var cap = maxV > 0
      ? '▽ R' + hotD.from_round + '→' + hotD.to_round + ', −' + fmtNum(maxV) + ' pts'
      : 'flat across rounds';
    /* ⚠️ Cory, live: "What are the bar charts underneath each position..
     * again no explanations!!" There WAS an explanation — a title attribute
     * on the wrapper — but a hover-only tooltip on a chart with no visible
     * axis label is indistinguishable from no explanation at all unless you
     * already know to hover. This eyebrow line is the fix: always on
     * screen, no hover required. The hover title/aria-label stay too, for
     * the exact-numbers reader. */
    return '<div class="pb-do-mini" title="' + esc('Point drop-off by round transition — ' + pos) + '">'
      + '<div class="pb-do-mini-head">projected points lost, round to round</div>'
      + '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img"'
        + ' aria-label="' + esc(pos + ' round-to-round drop-off, biggest gap ' + cap.replace(/^▽ /, '')) + '"'
        + ' preserveAspectRatio="none">'
        + '<line class="pb-do-baseline" x1="0" y1="' + (h - 0.5) + '" x2="' + w + '" y2="' + (h - 0.5) + '"/>'
        + bars
      + '</svg>'
      + '<div class="pb-do-ticks" title="the round each transition ends at">' + labels + '</div>'
      + '<div class="pb-do-mini-cap' + (maxV > 0 ? ' pb-do-hot' : '') + '">' + esc(cap) + '</div>'
      + '</div>';
  }

  /* The range bar's shared scale for this position's own list — own-scaled
   * to THIS column, same principle as roundDropoffChart's per-position
   * y-axis: pooling floor-to-ceiling span across positions would flatten
   * whichever one has the smaller spread for no football reason. */
  function rangeScaleFor(players, projSource) {
    var floors = [], ceils = [];
    players.forEach(function (p) {
      var pf = projFieldsFor(p, projSource);
      if (pf.floor != null) floors.push(pf.floor);
      if (pf.ceiling != null) ceils.push(pf.ceiling);
    });
    if (!floors.length || !ceils.length) return null;
    return { min: Math.min.apply(null, floors), max: Math.max.apply(null, ceils) };
  }

  function positionColumn(pos, block, esc, liveSurvivalById, projSource, roundDropoffs) {
    if (!block) return '';
    var players = block.players || [];
    var scale = rangeScaleFor(players, projSource);
    var rows = players.map(function (p, i) {
      var row = playerRow(p, esc, liveSurvivalById, false, projSource, scale);
      if (block.cliff_after_rank != null && i === block.cliff_after_rank - 1 && i < players.length - 1) {
        row += '<div class="pb-cliff-row">▽ cliff — next tier drops '
          + esc(fmtNum(block.cliff_size)) + ' pts ▽</div>';
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
      + (players.length ? '<div class="pb-table">'
        + '<div class="pb-table-row pb-table-head">'
          + '<div title="Player">Player</div><div title="Projection">Proj</div>'
          + '<div title="Floor to ceiling — hover any row for the exact numbers">Fl–Ce</div>'
          + '<div title="Survival — chance he is still there at your next pick">Surv</div></div>'
        + rows + '</div>' : '<div class="pb-empty">none available</div>')
      + roundDropoffChart(pos, roundDropoffs, esc)
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
    return '<details class="pb-dropoffs"><summary>Round-to-round drop-offs — exact numbers'
      + ' <span class="pb-do-summary-note">(the chart in each column above is the same data)</span></summary>'
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

  /* ── THE STRIKE BAR — WAR-ROOM-SPEC.md P2 (A→B, 2026-08-19) ────────────────
   * Cory: "I will chose what position, what I need from you is info about
   * when position drop offs are high or low between rounds" — and, in the
   * spec's own words, "the peak of each position's own VONA curve across
   * Cory's twelve picks — where waiting one more turn costs the most."
   *
   * NOT A SECOND COMPUTATION. `draft/tools/strike_page.js` already answers
   * this exact question for `public/strike.html` — this mirrors that same
   * "which of my 12 picks has this position's highest VONA" loop verbatim
   * (Rule 11: one derivation), not a fresh one, even though it has to live
   * in browser JS rather than literally sharing the Node script. Reads only
   * `data.picks`/`data.round_dropoffs`-adjacent `positions[pos].VONA`,
   * already on the artifact this file already consumes — no new fetch.
   *
   * PERSISTENT AND SMALL, per the spec: one row, six cells, pick + cost. It
   * is the HEADLINE; the full per-round curve stays in each column's own
   * mini chart below (roundDropoffChart) for whoever wants the detail. */
  function strikePeaks(data) {
    var picks = (data && data.picks) || [];
    var out = {};
    POS_ORDER.forEach(function (pos) {
      var best = null, bv = -Infinity;
      picks.forEach(function (pk) {
        var d = (pk.positions || {})[pos];
        if (!d || d.VONA == null) return;
        if (d.VONA > bv) { bv = d.VONA; best = pk; }
      });
      out[pos] = best ? { pick: best.pick, round: best.round, vona: bv } : null;
    });
    return out;
  }

  function strikeBar(data, esc) {
    var peaks = strikePeaks(data);
    var cells = POS_ORDER.map(function (pos) {
      var p = peaks[pos];
      return '<div class="pb-strike-cell">'
        + '<span class="pb-strike-pos">' + esc(pos) + '</span>'
        + (p
          ? '<span class="pb-strike-pick" title="' + esc('round ' + p.round) + '">pick ' + esc(fmtNum(p.pick)) + '</span>'
            + '<span class="pb-strike-cost">costs ' + esc(fmtNum(Math.round(p.vona))) + '</span>'
          : '<span class="pb-strike-pick">—</span>')
        + '</div>';
    }).join('');
    return '<div class="pb-strike-bar" title="The pick where waiting on this position costs the most across your 12 picks — not a recommendation, a fact about the position (WAR-ROOM-SPEC.md P2)">'
      + cells + '</div>';
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
      return positionColumn(pos, (pick.positions || {})[pos], esc, liveSurvivalById, src, data.round_dropoffs);
    }).join('');
    return '<div class="pb-wrap">'
      + '<div class="pb-head">Position boards — pick ' + esc(String(pick.pick))
        + ' (round ' + esc(String(pick.round)) + ')'
        + (pick.next_pick ? ', your next pick is ' + esc(String(pick.next_pick)) : '') + '</div>'
      /* pb-toolbar: the six pb-grid columns are wider than the panel at a
       * normal desktop width by design (see .pb-grid's own CSS comment —
       * widening to fit the header labels without ellipsis pushed K/DEF
       * off-screen). That is an honest trade, but a live screenshot (Cory:
       * "keep improving layout... professional fantasy site") showed it has
       * no visible affordance: the 5th column ends in a bare sliver at the
       * panel edge with nothing telling you two more boards exist or that
       * you can scroll to them. The hint lives here, in the toolbar's own
       * empty space, rather than overlaid on the grid — a first attempt
       * put it in the grid's own corner and a live screenshot caught it
       * sitting on top of the TE column's "+66.6 wire" text, clipping a
       * real number. app.js's renderPositionBoardsPanel toggles the
       * pb-grid-more-left/right classes on .pb-wrap from a real scrollLeft
       * measurement after every render. */
      + strikeBar(data, esc)
      + '<div class="pb-toolbar">'
        + projSourceToggle(esc, src)
        + '<div class="pb-grid-hint" aria-hidden="true">scroll for more →</div>'
      + '</div>'
      + '<div class="pb-grid-wrap"><div class="pb-grid">' + cols + '</div></div>'
      + opponentsStrip(data.opponents_compact, esc)
      + dropoffsStrip(data.round_dropoffs, esc)
      + stealsStrip(data.ceiling_steals, data._steals_caveat, esc)
      + '</div>';
  }

  var API = { renderPositionBoards: renderPositionBoards, findPick: findPick,
    positionColumn: positionColumn, projFieldsFor: projFieldsFor,
    roundDropoffChart: roundDropoffChart, rangeBarMini: rangeBarMini,
    rangeScaleFor: rangeScaleFor, strikePeaks: strikePeaks, strikeBar: strikeBar,
    POS_ORDER: POS_ORDER };
  global.PositionBoardsView = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
