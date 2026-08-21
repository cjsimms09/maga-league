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

  /* CALL GLYPH — Cory: "a way to like and dislike players... this info
   * needs to stay in the room". Inline, not absolutely positioned like
   * riskDot() above (that corner is already taken) — a small glyph in the
   * normal text flow costs one more character's width, which the name
   * column already has room for at typical name lengths. Read-only here on
   * purpose: the ACT of liking/disliking happens in the drill-down (a
   * deliberate click, not a second target competing with this row's own
   * data-drill open-panel click), this is just "you already called this
   * one" at a glance while scanning the board. */
  function callGlyph(entry, esc) {
    if (!entry || !entry.call) return '';
    var glyph = entry.call === 'like' ? '\u{1F44D}' : '\u{1F44E}';
    return '<span class="pb-call-glyph pb-call-' + entry.call + '" title="'
      + esc(entry.call === 'like' ? 'You liked him' : 'You disliked him') + '">' + glyph + '</span>';
  }

  /* ROOKIE TAG — Cory, live: "add some sort of tag to every rookie on the
   * board so I know they're a rookie, maybe a blue R next to their name."
   * `rookieIds` is a Set of player_ids built in app.js from `is_nfl_rookie`
   * on the full board (this file stays pure — no board/global lookup here,
   * same pattern as liveSurvivalById/callsById below it). */
  function rookieTag(p, esc, rookieIds) {
    if (!rookieIds || p.player_id == null || !rookieIds.has(String(p.player_id))) return '';
    return '<span class="pb-rookie-tag" title="' + esc('Rookie — first NFL season, 2026') + '">R</span>';
  }

  /* TOP-5 PACE MARK — Cory, live: "a red asterisk or some identifier to a
   * player on a team with a top 5 pace of play." `paceTeams` is a Set of
   * team abbreviations built in app.js from window.WR_TEAM_PACE (kept out
   * of this file for the same reason rookieIds is — no globals in the pure
   * view layer). */
  function paceMark(p, esc, paceTeams) {
    if (!paceTeams || !p.team || !paceTeams.has(p.team)) return '';
    return '<span class="pb-pace-mark" title="' + esc(p.team + ' — top-5 team pace of play this season') + '">*</span>';
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
  function playerRow(p, esc, liveSurvivalById, isCliffLine, projSource, scale, callsById, badgeInfo) {
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
    var call = callGlyph((callsById || {})[String(p.player_id)], esc);
    var rookie = rookieTag(p, esc, badgeInfo && badgeInfo.rookieIds);
    var pace = paceMark(p, esc, badgeInfo && badgeInfo.paceTeams);
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
        + esc(p.name || '') + rookie + pace + (p.team ? ' <span class="pb-team">' + esc(p.team) + '</span>' : '') + call + risk + '</div>'
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
    var w = 132, h = 48, gap = 2, n = vals.length;  // taller than the old 38 — Cory: "make charts better", bars were too short to read at a glance
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
    /* ⚠️ Cory, live 2026-08-20, AFTER the first fix: "I still don't
     * understand the projected points lost each round chart... explain
     * better, make charts better." The first pass (below) made the caption
     * always-visible, which was necessary but not sufficient — "▽ R6→7,
     * −36 pts" is still compressed notation nobody would say out loud. This
     * pass replaces it with an actual SENTENCE, and ties the whole chart to
     * a term this same page already explains elsewhere: VONA's own label
     * reads "what waiting until your next pick costs" — this chart is that
     * exact idea, just for every round of the WHOLE draft instead of only
     * your next pick, which is why it is worth a full sentence rather than
     * a shorthand only the person who built it would parse at a glance. */
    var cap = maxV > 0
      ? 'Biggest jump: waiting from round ' + hotD.from_round + ' to ' + hotD.to_round
        + ' costs about ' + fmtNum(maxV) + ' points at ' + pos + '.'
      : 'Costs about the same whichever round you wait to, in this range.';
    var hoverExplain = 'How much the best available ' + pos + ' gets worse each round you wait — '
      + 'the same idea as VONA above, extended across the whole draft instead of just your next pick.';
    return '<div class="pb-do-mini" title="' + esc(hoverExplain) + '">'
      + '<div class="pb-do-mini-head">waiting costs you points — here is how much, round by round</div>'
      + '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img"'
        + ' aria-label="' + esc(pos + ' round-to-round drop-off, biggest gap ' + cap) + '"'
        + ' preserveAspectRatio="none">'
        + '<line class="pb-do-baseline" x1="0" y1="' + (h - 0.5) + '" x2="' + w + '" y2="' + (h - 0.5) + '"/>'
        + bars
      + '</svg>'
      + '<div class="pb-do-ticks" title="the round each bar\'s transition ends at">' + labels + '</div>'
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

  /* ⚠️ THE PANEL SHOWED PLAYERS WHO WERE ALREADY GONE, AND THIS IS WHERE.
   *
   * Cory, 2026-08-20: "It is also showing players who are already gone on big
   * board and other places? Is this a sleeper sync issue? Keeper issue? Or
   * something else." E called the mechanism and it checks out on the artifact:
   * NEITHER. position_boards.json is a PRE-SIMULATED SNAPSHOT. Each of Cory's
   * twelve picks carries a `players` list computed offline by draining the pool
   * by ADP across 300 simulated rooms — "who I expect to be there at pick 33",
   * not "who is there". Breece Hall sits in the pick-33 RB list on the live
   * artifact, which is exactly one of the names he was shown.
   *
   * So this panel never had any idea who had actually been drafted. It was
   * built as a PLANNING artifact and is displayed beside live ones, which is
   * the whole defect — nothing was out of sync, the number simply answered a
   * different question than the screen implied.
   *
   * `takenIds` is now applied at render. A simulated list intersected with the
   * real draft is still a planning list, but it can no longer name a man who is
   * demonstrably gone. */
  function livePlayers(block, takenIds) {
    var players = (block && block.players) || [];
    if (!takenIds || !players.length) return players;
    return players.filter(function (p) {
      var id = p && (p.player_id != null ? p.player_id : p.id);
      if (id == null) return true;             // unknown id -> keep, never guess
      return !takenIds.has(String(id));
    });
  }

  /* Short source labels for the VONA chip — kept next to the only thing that
   * renders them, and deliberately short: this sits inside a column header. */
  var SRC_LABEL = { ds: 'DS', sleeper: 'SLP', cbs: 'CBS', espn: 'ESPN',
    fftoday: 'FFT', fantasypros: 'FP', clay: 'CLAY', ownmodel: 'OURS', blend: 'DS' };

  function positionColumn(pos, block, esc, liveSurvivalById, projSource, roundDropoffs, callsById, badgeInfo, takenIds, rankKey) {
    if (!block) return '';
    var players = livePlayers(block, takenIds);
    var scale = rangeScaleFor(players, projSource);
    var rows = players.map(function (p, i) {
      var row = playerRow(p, esc, liveSurvivalById, false, projSource, scale, callsById, badgeInfo);
      if (block.cliff_after_rank != null && i === block.cliff_after_rank - 1 && i < players.length - 1) {
        row += '<div class="pb-cliff-row">▽ cliff — next tier drops '
          + esc(fmtNum(block.cliff_size)) + ' pts ▽</div>';
      }
      return row;
    }).join('');
    return '<div class="pb-col">'
      + '<div class="pb-col-head">'
        + '<span class="pb-pos">' + esc(pos) + '</span>'
        /* ⚠️ (DS) IS NOT DECORATION — E's audit, 2026-08-21: "all VONA is coming
         * from draft shark and doesn't change with changing source". Correct
         * for THIS panel and only this one. `draft/tools/position_boards.js`
         * computes VONA from Draft Sharks' bestNow/bestNext and says so in its
         * own comment ("Ranking, VONA, cliff and surplus above are unaffected:
         * they stay computed from `ds`"), so this figure is frozen while the
         * Ranking Source toggle sits right above it. The panel's note already
         * said selection and order are DS-fixed, but it said "only the
         * projection NUMBER changes" — and VONA is not the projection number,
         * so a reader was told the opposite of the truth about this chip.
         * The Big Board / THE PICK VONA is a DIFFERENT number from engine.js
         * and DOES follow the toggle (source_toggle_moves_vona.test.js). */
        + (function () {
            /* ⚠️ CORY'S RULING, 2026-08-21, verbatim: "Vona should change for
             * each source in which we have a projected points total. If we
             * don't have projected points then it shouldn't show Vona for
             * that source."
             *
             * `position_boards.js` now emits VONA_by_source, computed from the
             * SAME 300 ADP-drained rooms re-priced under each source (the
             * drain is ADP-driven and therefore source-independent, so no
             * second simulation was needed). A source that prices fewer than
             * three of the available men at this position emits null, and
             * null prints as a dash with the reason — never a Draft Sharks
             * number wearing another source's name, which is the defect E
             * found and this replaces. */
            var key = rankKey || 'ds';
            var bySrc = block.VONA_by_source || null;
            var cov = (block.covered_by_source || {})[key];
            var v = bySrc ? bySrc[key] : undefined;
            var srcLabel = SRC_LABEL[key] || key;
            if (!bySrc) {
              /* older artifact, before the per-source build — say so rather
               * than silently printing the legacy Draft Sharks figure. */
              return '<span class="pb-vona" title="VONA — what waiting until your next pick '
                + 'costs. This board artifact predates per-source VONA, so this is Draft '
                + 'Sharks\u2019 figure.">VONA <b>' + esc(fmtNum(block.VONA))
                + '</b> <span class="pb-vona-src">DS</span></span>';
            }
            if (v == null) {
              return '<span class="pb-vona pb-vona-none" title="' + esc(srcLabel)
                + ' does not publish projected points for enough available '
                + esc(pos) + 's here, so there is no VONA to show for it'
                + (cov != null ? ' (' + cov + ' priced)' : '')
                + '. Switch source, or use the Big Board.">VONA <b>—</b> '
                + '<span class="pb-vona-src">' + esc(srcLabel) + '</span></span>';
            }
            return '<span class="pb-vona" title="VONA — what waiting until your next pick '
              + 'costs, priced on ' + esc(srcLabel) + '\u2019 own projected points. Follows '
              + 'the Ranking Source toggle.">VONA <b>' + esc(fmtNum(v)) + '</b> '
              + '<span class="pb-vona-src">' + esc(srcLabel) + '</span></span>';
          }())
        /* ── IT FOLLOWS THE TOGGLE NOW — register 221 CLOSED, 2026-08-21 ─────
         *
         * This chip used to carry a label saying it did NOT follow the toggle,
         * because `surplus_over_wire` was `max(0, projUsed - WAIVER[pos])` with
         * a Draft-Sharks numerator and a HARDCODED denominator. That label was
         * the honest short-term answer; it was not the fix.
         *
         * Cory, the same day: *"we need to fix wire logic! should we use last
         * few years of draft to determine how many at each position are
         * rostered/drafted then use that to compare waiver wire"* and *"it
         * should also change with each source probably?"*
         *
         * Both now hold. `draft/tools/waiver_baseline.js` derives the COUNT
         * from three seasons of this league's own `final_rosters` (a league
         * fact, source-independent) and the VALUE from each source's own
         * projection of the (count+1)-th best at that position (a source
         * opinion). `position_boards.js` emits `surplus_over_wire_by_source`
         * from it, on the SAME null rule VONA uses.
         *
         * SAME THREE-WAY BRANCH AS VONA ABOVE, deliberately: no artifact → say
         * so; source has no opinion → dash with the reason; otherwise the
         * number, named. A legacy artifact must never print its Draft Sharks
         * figure under another source's label — that is the defect this
         * family keeps producing. */
        + (function () {
            var key = rankKey || 'ds';
            var bySrc = block.surplus_over_wire_by_source || null;
            var srcLabel = SRC_LABEL[key] || key;
            if (!bySrc) {
              return '<span class="pb-surplus" title="Best available, points over a free '
                + 'waiver pickup. This board artifact predates the per-source waiver '
                + 'baseline, so this is Draft Sharks’ figure against the frozen '
                + 'baseline.">+' + esc(fmtNum(block.surplus_over_wire))
                + ' wire <span class="pb-vona-src">DS</span></span>';
            }
            var s = bySrc[key];
            if (s == null) {
              return '<span class="pb-surplus pb-vona-none" title="' + esc(srcLabel)
                + ' does not price enough available ' + esc(pos) + 's to say what a free '
                + 'waiver pickup at this position is worth, so there is no surplus to '
                + 'show for it. Switch source, or use the Big Board.">'
                + '— wire <span class="pb-vona-src">' + esc(srcLabel) + '</span></span>';
            }
            var wire = (block.waiver_by_source || {})[key];
            return '<span class="pb-surplus" title="Best available, points over a free '
              + 'waiver pickup at this position'
              + (wire != null ? ' (' + esc(fmtNum(wire)) + ' pts on ' + esc(srcLabel) + ')' : '')
              + '. The COUNT of players this league really rosters comes from its own last '
              + 'three drafts; the PRICE is ' + esc(srcLabel) + '’ own. Follows the '
              + 'Ranking Source toggle.">+' + esc(fmtNum(s)) + ' wire '
              + '<span class="pb-vona-src">' + esc(srcLabel) + '</span></span>';
          }())
      + '</div>'
      /* THE NOTE QUOTES THE TWO CHIPS ABOVE IT BY NAME — "waiting costs 35 and
       * he is +130 over the wire" — so it must be the SAME source's 35 and 130.
       * Leaving it on Draft Sharks while the chips followed the toggle would
       * have replaced one silent disagreement with a louder one. `note` (the
       * legacy DS string) is the fallback for a pre-08-21 artifact only. */
      + (function () {
          var byS = block.note_by_source || null;
          var n = byS ? byS[rankKey || 'ds'] : block.note;
          return n ? '<div class="pb-note">' + esc(n) + '</div>' : '';
        }())
      + (players.length ? '<div class="pb-table">'
        + '<div class="pb-table-row pb-table-head">'
          + '<div title="Player">Player</div><div title="Projection">Proj</div>'
          + '<div title="Floor to ceiling — hover any row for the exact numbers">Fl–Ce</div>'
          + '<div title="Survival — chance he is still there at your next pick">Surv</div></div>'
        + rows + '</div>' : '<div class="pb-empty">none available</div>')
      + roundDropoffChart(pos, roundDropoffs, esc)
      + '</div>';
  }

  /* ⚠️ RULED AWAY, 2026-08-21 — CORY: "should only be one toggle for each
   * source and blend and it should change everything, including big board
   * and recommended players by position." This panel used to run its OWN
   * second toggle (two buttons, Draft Sharks/Blend) beside the real one
   * (Ranking Source, five buttons, above). He read the two as one control
   * and reported "I only have selection between draft shark or blended ..
   * not sure what toggles above that do .. doesn't look to change much" —
   * true on both halves, and confusing on both halves for the same reason:
   * a second clickable toggle existed at all.
   *
   * THE FIX IS TO STOP HAVING A SECOND TOGGLE, NOT TO EXPLAIN IT BETTER.
   * This panel's player SELECTION and ORDER are a real technical limit —
   * position_boards.py simulates the draft once, against Draft Sharks, and
   * cannot be re-run live for four more sources without a backend rebuild
   * this codebase does not have time for before Saturday. But the NUMBER a
   * row prints never needed its own control — it can follow the one real
   * toggle automatically: `state.rankSource === 'ds'` prints Draft Sharks'
   * own number, anything else (including blend) prints the board's blend
   * number, exactly the two values this panel has ever had. No button, no
   * click handler, no second state variable — `src` arrives from the
   * caller (app.js), already derived from state.rankSource. */
  function projSourceStatus(esc, projSource) {
    var ds = projSource !== 'blend';
    return '<div class="pb-src-status">Showing <b>' + (ds ? 'Draft Sharks’' : 'the board’s Blend')
      + '</b> own number on every row — follows the <b>Ranking Source</b> toggle above, '
      + 'no separate control here.</div>';
  }

  /* Selection and order stay Draft-Sharks-simulated regardless of which
   * number is showing (see projSourceStatus above for why) — said
   * plainly so a reader does not conclude the WHOLE panel followed the
   * toggle when only the printed number did. */
  function projSourceNote() {
    return '<p class="muted pb-src-note">This list\'s player selection and order always follow '
      + '<b>Draft Sharks</b>’ pre-draft simulation, whichever source is active — and so do the '
      + '<b>VONA</b>, wire-surplus and cliff figures in the column headers (marked '
      + '<span class="pb-vona-src">DS</span>). Only the per-player projection NUMBER follows the '
      + 'toggle. For a live top-N list — and a VONA that does change with the source — see '
      + 'the <b>Top Available</b> panel above instead.</p>';
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
      return '<tr' + (s.player_id != null ? ' data-drill="' + esc(String(s.player_id)) + '" class="pb-steal-row"' : '') + '>'
        + '<td>' + esc(s.name || '') + ' <span class="pb-team">' + esc(s.position || '') + '</span></td>'
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
  function renderPositionBoards(data, pickNum, liveSurvivalById, esc, projSource, callsById, badgeInfo, takenIds, rankKey) {
    if (!data || !Array.isArray(data.picks) || !data.picks.length) return '';
    var pick = findPick(data, pickNum);
    if (!pick) return '';
    var src = projSource === 'blend' ? 'blend' : 'ds';
    /* How far the real draft has already diverged from the simulation these
     * lists were built on. Counted so the caveat below can be specific rather
     * than a standing disclaimer nobody reads. */
    var removed = 0;
    POS_ORDER.forEach(function (pos) {
      var b = (pick.positions || {})[pos];
      if (b && b.players) removed += b.players.length - livePlayers(b, takenIds).length;
    });
    var cols = POS_ORDER.map(function (pos) {
      return positionColumn(pos, (pick.positions || {})[pos], esc, liveSurvivalById, src, data.round_dropoffs, callsById, badgeInfo, takenIds, rankKey);
    }).join('');
    return '<div class="pb-wrap">'
      + '<div class="pb-head">Position boards — pick ' + esc(String(pick.pick))
        + ' (round ' + esc(String(pick.round)) + ')'
        + (pick.next_pick ? ', your next pick is ' + esc(String(pick.next_pick)) : '')
        /* ⚠️ SAY WHAT THESE NUMBERS ARE. The names are now filtered against the
         * real draft, but VONA, best-now, expected-best-next and the cliff were
         * all computed on the SIMULATED pool this artifact was built from. Once
         * the real draft diverges they describe a room that did not happen, and
         * a stale number that looks live is worse than one labelled stale. */
        + (removed
            ? '<span class="pb-diverged" title="These lists were pre-computed by '
              + 'simulating who would be gone by ADP. ' + esc(String(removed))
              + ' of them have actually been drafted and are now hidden — but '
              + 'VONA, best-now and the cliff below were computed BEFORE those '
              + 'picks happened, so read them as a plan, not as live values.">'
              + ' · ⚠️ ' + esc(String(removed)) + ' already drafted, hidden — '
              + 'VONA/cliff below are from the pre-draft simulation</span>'
            : '') + '</div>'
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
        + projSourceStatus(esc, src)
        + '<div class="pb-grid-hint" aria-hidden="true">scroll for more →</div>'
      + '</div>'
      + projSourceNote()
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
    playerRow: playerRow, rookieTag: rookieTag, paceMark: paceMark,
    POS_ORDER: POS_ORDER };
  global.PositionBoardsView = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
