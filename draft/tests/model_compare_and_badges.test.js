// TERRITORY: B
/* MODEL COMPARISON + ROOKIE/PACE BADGES — Cory, live 2026-08-20: "Give me
 * peace to click in on war room to see what each model would take! Max
 * value, MLV displacement, upside only model, floor model (safe pick)!
 * Also add some sort of tag to every rookie on the board so I know they're
 * a rookie, maybe a blue R next to their name.. let's also add maybe a red
 * asterisk or some identifier to a player on a team with a top 5 pace of
 * play. These symbols should come with an asterisk."
 *
 * Three surfaces:
 *   1. rookieTag()/paceMark() (position_boards_view.js) — the two new
 *      inline badges, each carrying its own explanatory tooltip (this
 *      session's no-unexplained-glyph convention).
 *   2. playerRow()/renderPositionBoards() — badgeInfo threaded end to end.
 *   3. app.js's renderModelCompare() — structural checks (source text, same
 *      pattern as click_ins.test.js) that the four named models are wired:
 *      Max Value / Upside-Only / Floor (Safe) via DraftShadows, MLV
 *      Displacement via RosterBuilderMLV, each drillable, none of them
 *      silently dropped.
 *
 * Run: node draft/tests/model_compare_and_badges.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const V = require(path.join(ROOT, 'public', 'js', 'draft', 'position_boards_view.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

// ── 1. rookieTag / paceMark — pure, unit-testable ───────────────────────────
{
  const rookieIds = new Set(['1', '3']);
  const paceTeams = new Set(['TB', 'GB']);

  ck('a rookie gets the R tag', V.rookieTag({ player_id: '1' }, esc, rookieIds) !== '',
    V.rookieTag({ player_id: '1' }, esc, rookieIds));
  ck('the R tag carries a tooltip explaining what it means',
    /title="[^"]*[Rr]ookie/.test(V.rookieTag({ player_id: '1' }, esc, rookieIds)));
  ck('a non-rookie gets no tag', V.rookieTag({ player_id: '2' }, esc, rookieIds) === '');
  ck('CONTROL — no rookieIds set at all renders nothing, not a crash',
    V.rookieTag({ player_id: '1' }, esc, null) === '');

  ck('a top-5-pace team gets the mark', V.paceMark({ team: 'TB' }, esc, paceTeams) !== '');
  ck('the pace mark carries a tooltip explaining what it means',
    /title="[^"]*pace/.test(V.paceMark({ team: 'TB' }, esc, paceTeams)));
  ck('a non-top-5 team gets no mark', V.paceMark({ team: 'NYJ' }, esc, paceTeams) === '');
  ck('CONTROL — no paceTeams set at all renders nothing, not a crash',
    V.paceMark({ team: 'TB' }, esc, null) === '');
}

// ── 2. playerRow / renderPositionBoards — threaded end to end ──────────────
{
  const badgeInfo = { rookieIds: new Set(['1']), paceTeams: new Set(['AAA']) };
  const p1 = { player_id: '1', name: 'Rookie Guy', team: 'AAA', proj: 200, floor: 170, ceiling: 250, adp: 20 };
  const p2 = { player_id: '2', name: 'Vet Guy', team: 'ZZZ', proj: 180, floor: 150, ceiling: 220, adp: 30 };
  const row1 = V.playerRow(p1, esc, null, false, 'ds', null, {}, badgeInfo);
  const row2 = V.playerRow(p2, esc, null, false, 'ds', null, {}, badgeInfo);
  ck('a rookie on a top-5-pace team gets BOTH badges on his row',
    row1.includes('pb-rookie-tag') && row1.includes('pb-pace-mark'), row1);
  ck('a vet on a non-top-5-pace team gets NEITHER badge',
    !row2.includes('pb-rookie-tag') && !row2.includes('pb-pace-mark'), row2);
  ck('CONTROL — omitting badgeInfo entirely renders a normal row, not a crash',
    (() => { const r = V.playerRow(p1, esc, null, false, 'ds', null, {}); return typeof r === 'string' && r.includes('Rookie Guy'); })());

  const data = {
    picks: [{ pick: 1, round: 1, next_pick: 14, positions: {
      RB: { VONA: 1, surplus_over_wire: 1, players: [p1, p2] },
      WR: { players: [] }, QB: { players: [] }, TE: { players: [] }, K: { players: [] }, DEF: { players: [] } } }],
  };
  const html = V.renderPositionBoards(data, 1, null, esc, 'ds', {}, badgeInfo);
  ck('renderPositionBoards forwards badgeInfo all the way down to the row',
    html.includes('pb-rookie-tag') && html.includes('pb-pace-mark'), html.length);
}

// ── 3. app.js — the four-model comparison panel, wired structurally ────────
{
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const i = SRC.indexOf('function renderModelCompare()');
  ck('renderModelCompare() exists in app.js', i >= 0);
  const j = SRC.indexOf('\n  function strategyName(key)', i);
  const body = i >= 0 && j > i ? SRC.slice(i, j) : '';

  ck('it names Max Value, keyed to the existing value_anchor shadow profile (no duplicate model built)',
    /key: 'value_anchor'/.test(body) && /Max Value/.test(body), body.length);
  ck('it names Upside-Only, keyed to the upside_pure shadow profile added this turn',
    /key: 'upside_pure'/.test(body) && /Upside-Only/.test(body));
  ck('it names Floor (Safe), keyed to the floor_safe shadow profile added this turn',
    /key: 'floor_safe'/.test(body) && /Floor \(Safe\)/.test(body));
  ck('it names MLV Displacement, sourced from RosterBuilderMLV.recommend (a different system, reused not rebuilt)',
    /RosterBuilderMLV\.recommend/.test(body) && /MLV Displacement/.test(body));
  ck('every row carries a title= tooltip explaining what the model means (no unexplained model names)',
    /title:/.test(body) && (body.match(/title:/g) || []).length >= 3);
  ck('every row is drillable via data-drill into the shared player panel',
    /data-drill=/.test(body));
  ck('CONTROL — a DraftShadows failure does not take MLV down with it (try/catch isolates the two systems)',
    (() => {
      const shadowsBlockEnd = body.indexOf('} catch (e) { /* DraftShadows models are optional');
      const mlvBlockStart = body.indexOf('if (typeof RosterBuilderMLV', shadowsBlockEnd);
      return shadowsBlockEnd > 0 && mlvBlockStart > shadowsBlockEnd;
    })());

  ck('renderModelCompare is actually called from the live render cycle',
    /try \{ renderModelCompare\(\); \}/.test(SRC));

  const bi = SRC.indexOf('function badgeInfo()');
  ck('badgeInfo() exists in app.js', bi >= 0);
  const biEnd = SRC.indexOf('\n  }', bi);
  const biBody = bi >= 0 ? SRC.slice(bi, biEnd) : '';
  ck('badgeInfo() reads is_nfl_rookie off the live board (not a guessed field)',
    /is_nfl_rookie === true/.test(biBody));
  ck('badgeInfo() takes the top 5 teams by neutral_plays_per_game, sorted descending',
    /neutral_plays_per_game/.test(biBody) && /\.slice\(0, 5\)/.test(biBody));
  ck('renderPositionBoardsPanel actually passes badgeInfo() through to the view',
    /renderPositionBoards\([^)]*badgeInfo\(\)/.test(SRC));
}

// ── 4. the mount point exists on the page ───────────────────────────────────
{
  const ejs = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
  ck('warroom.ejs has a mount point for the model-comparison card',
    /id="model-compare-card"/.test(ejs) && /id="model-compare"/.test(ejs));
  ck('the card sits on the DRAFT tab (same zone as the strategy-split panel), not a separate one',
    (() => {
      const a = ejs.indexOf('id="shadow-projection"');
      const b = ejs.indexOf('id="model-compare-card"');
      const c = ejs.indexOf('id="lrm-card"');
      return a > 0 && b > a && c > b;
    })());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
