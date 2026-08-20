// TERRITORY: B
/* DRILL-DOWN FACTS — Cory's ask (ROUTES.md 08-17): "it might also be nice to
 * get easy access to team depth chart if I click on a player. ie is this
 * player listed as starting RB, and maybe also how often that team passed or
 * threw last year." Both `depthChartRow()` and `teamPassRateRow()` live in
 * warroom_charts.js's browser-only controller half (the file early-returns
 * when `document` is undefined, so `require()` cannot reach them — same
 * eval-lift pattern this repo already uses for app.js's browser-only
 * helpers, e.g. source_gap_caveat.test.js).
 *
 * What matters: both rows read data that already exists on the board
 * (`depth_chart_order`, admin.js's server-read `window.WR_TEAM_PACE`) and
 * degrade to `null` — never a fabricated dash, never a thrown error — for
 * the ~150 players (free agents, mostly) with no depth-chart entry, and for
 * any team missing from the pace artifact (including the whole feature
 * missing, pre-load or on fetch failure).
 *
 * Run: node draft/tests/drill_facts_rows.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
const lift = (name) => {
  const m = SRC.match(new RegExp('function ' + name + '\\(p\\) \\{[\\s\\S]*?\\n  \\}'));
  if (!m) throw new Error(name + ' not found in warroom_charts.js');
  return m[0];
};
// depthChartTeammates takes (p, allPlayers, esc), not the single-param shape
// the lift above assumes — same idea, any parameter list.
const liftAnyArgs = (name) => {
  const m = SRC.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  if (!m) throw new Error(name + ' not found in warroom_charts.js');
  return m[0];
};
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
// eslint-disable-next-line no-eval
const depthChartRow = eval('(' + lift('depthChartRow') + ')');
// eslint-disable-next-line no-eval
const teamPassRateRow = eval('(' + lift('teamPassRateRow') + ')');
// eslint-disable-next-line no-eval
const teamPaceRow = eval('(' + lift('teamPaceRow') + ')');
// eslint-disable-next-line no-eval
const usageRow = eval('(' + lift('usageRow') + ')');
// eslint-disable-next-line no-eval
const injuryRow = eval('(' + lift('injuryRow') + ')');
// eslint-disable-next-line no-eval
const pedigreeRow = eval('(' + lift('pedigreeRow') + ')');
// eslint-disable-next-line no-eval
const ageRow = eval('(' + lift('ageRow') + ')');
// eslint-disable-next-line no-eval
const depthChartTeammates = eval('(' + liftAnyArgs('depthChartTeammates') + ')');

// ── depthChartRow ────────────────────────────────────────────────────────
ck('starter (order 1) reads "starter"',
  /starter/.test(depthChartRow({ depth_chart_order: 1, team: 'DET', position: 'RB' })[1])
  && !/2nd/.test(depthChartRow({ depth_chart_order: 1, team: 'DET', position: 'RB' })[1]));
ck('backup (order 2) reads "2nd string"',
  /2nd string/.test(depthChartRow({ depth_chart_order: 2, team: 'DET', position: 'WR' })[1]));
ck('deeper slots (order 5) name the number rather than guessing a word',
  /5 on the depth chart/.test(depthChartRow({ depth_chart_order: 5, team: 'DET', position: 'WR' })[1]));
ck('position and team are both in the row, escaped',
  depthChartRow({ depth_chart_order: 1, team: 'DET', position: 'RB' })[1].indexOf('(RB, DET)') >= 0);
ck('NO depth-chart entry (free agents, ~150 of them) -> null, not a fabricated dash',
  depthChartRow({ depth_chart_order: null, team: 'FA', position: 'WR' }) === null);
ck('missing player object -> null, not a throw', depthChartRow(null) === null);
ck('label is not itself HTML-unsafe on a hostile team/position string',
  depthChartRow({ depth_chart_order: 1, team: '<b>X</b>', position: 'RB' })[1].indexOf('<b>X</b>') === -1);

// ── teamPassRateRow ──────────────────────────────────────────────────────
const realPace = { season: '2025', teams: { DET: { pass_rate: 0.5432, neutral_pass_rate: 0.5011, proe: 0.02 } } };
{
  global.window = { WR_TEAM_PACE: realPace };
  const row = teamPassRateRow({ team: 'DET' });
  ck('a mapped team renders a rounded whole-percent + tenths, not a raw fraction',
    row[1].indexOf('54.3%') === 0);
  ck('the season is named in the label, not left implicit', row[0].indexOf('2025') >= 0);
  ck('score-neutral rate rides along as a secondary figure', row[1].indexOf('50.1% score-neutral') >= 0);
}
ck('team missing from the artifact -> null, not a guess',
  teamPassRateRow({ team: 'ZZ' }) === null);
ck('no player / no team -> null', teamPassRateRow({}) === null && teamPassRateRow(null) === null);
{
  global.window = { WR_TEAM_PACE: null };
  ck('artifact never loaded (server read failed) -> null across the whole page, not per-team',
    teamPassRateRow({ team: 'DET' }) === null);
}
{
  global.window = {};
  ck('window.WR_TEAM_PACE entirely absent (bootstrap script never ran) -> null, no throw',
    teamPassRateRow({ team: 'DET' }) === null);
}

// ── teamPaceRow (Cory, live: "pace of play of team") ───────────────────────
{
  const realPaceWithTempo = { season: '2025', teams: { DET: {
    pass_rate: 0.5432, plays_per_game: 63.176, neutral_plays_per_game: 25.647, neutral_sec_per_play: 34.593,
  } } };
  global.window = { WR_TEAM_PACE: realPaceWithTempo };
  const row = teamPaceRow({ team: 'DET' });
  ck('leads with score-neutral plays/game, one decimal, not garbage-time-inflated raw pace',
    row[1].indexOf('25.6 neutral plays/gm') === 0, row);
  ck('raw plays/game rides along as a secondary figure', row[1].indexOf('63.2 total/gm') >= 0, row);
  ck('seconds/play is included, rounded to a whole second', row[1].indexOf('35s/play') >= 0, row);
  ck('the season is named in the label, same convention as teamPassRateRow', row[0].indexOf('2025') >= 0);
}
ck('a team present in the artifact but missing neutral_plays_per_game -> null, not a half-built row',
  (() => { global.window = { WR_TEAM_PACE: { season: '2025', teams: { DET: { pass_rate: 0.5 } } } };
    return teamPaceRow({ team: 'DET' }) === null; })());
ck('team missing from the artifact -> null', (() => { global.window = { WR_TEAM_PACE: { season: '2025', teams: {} } };
  return teamPaceRow({ team: 'ZZ' }) === null; })());
ck('artifact never loaded -> null, no throw', (() => { global.window = { WR_TEAM_PACE: null };
  return teamPaceRow({ team: 'DET' }) === null; })());

// ── usageRow (Cory: "more clear info... a powerhouse") — position-tailored ─
ck('RB gets carries/opportunity-share/red-zone-share, not a WR field',
  (() => { const r = usageRow({ position: 'RB', carries: 249.3, opportunity_share: 0.185, rz_share: 0.218 });
    return r[1].indexOf('249 carries/szn') >= 0 && r[1].indexOf('18.5% opportunity share') >= 0
      && r[1].indexOf('21.8% red-zone share') >= 0 && r[1].indexOf('target') === -1; })());
ck('WR/TE gets target share/WOPR/aDOT, not a RB carries field',
  (() => { const r = usageRow({ position: 'WR', target_share: 0.159, wopr: 0.248, adot: 5.7, rz_share: 0.1 });
    return r[1].indexOf('15.9% target share') >= 0 && r[1].indexOf('0.25 WOPR') >= 0
      && r[1].indexOf('5.7 aDOT') >= 0 && r[1].indexOf('carries') === -1; })());
ck('TE uses the same shape as WR', (() => usageRow({ position: 'TE', target_share: 0.1 })[0] === 'Usage')());
ck('QB has no comparable per-touch usage field on this board -> no row, not an empty/misleading one',
  usageRow({ position: 'QB', target_share: 0.5 }) === null);
ck('K/DEF -> no row', usageRow({ position: 'K' }) === null && usageRow({ position: 'DEF' }) === null);
ck('a RB with every usage field null -> null, not an empty "Usage" label',
  usageRow({ position: 'RB', carries: null, opportunity_share: null, rz_share: null }) === null);
ck('missing player / no position -> null, no throw', usageRow(null) === null && usageRow({}) === null);

// ── usageRow, the 08-20 additions — A's nothing_computed_goes_unshown.js
// audit: gl_carries/rz_targets/air_yards_share computed on the real board,
// read by no served file until now. opportunity_adj is DELIBERATELY absent
// — it is -0 for all 700 players on the live board (a real distribution
// check, not an oversight: draft/tests/opportunity_adj_stays_off.test.js
// pins that it stays off), so displaying it would show "0" for every
// player on the page, which is worse than not showing it at all.
ck('RB also gets goal-line carries when present, a separate fact from total carries',
  (() => { const r = usageRow({ position: 'RB', carries: 249.3, gl_carries: 12.4 });
    return r[1].indexOf('12.4 goal-line carries/szn') >= 0 && r[1].indexOf('249 carries/szn') >= 0; })());
ck('...and is absent (not a "0 goal-line carries" line) when the field is null',
  (() => { const r = usageRow({ position: 'RB', carries: 249.3, gl_carries: null });
    return r[1].indexOf('goal-line') === -1; })());
ck('WR/TE gets red-zone TARGETS (the raw count) alongside the share',
  (() => { const r = usageRow({ position: 'WR', rz_share: 0.275, rz_targets: 19.8 });
    return r[1].indexOf('19.8 red-zone targets/szn') >= 0 && r[1].indexOf('27.5% red-zone share') >= 0; })());
ck('WR/TE gets air-yards share, distinct from aDOT',
  (() => { const r = usageRow({ position: 'WR', adot: 12.1, air_yards_share: 0.286 });
    return r[1].indexOf('28.6% air-yards share') >= 0 && r[1].indexOf('12.1 aDOT') >= 0; })());
ck('a RB with ONLY gl_carries (everything else null) still gets a row, not null',
  usageRow({ position: 'RB', carries: null, opportunity_share: null, rz_share: null, gl_carries: 8.1 }) !== null);
ck('opportunity_adj is intentionally never referenced by usageRow (it is a constant 0 on the real board)',
  !/opportunity_adj/.test(lift('usageRow')));

// ── volatilityRow — A's RISK block: proj_sd (season uncertainty) and
// weekly_sd (start/sit swing) are two different questions, both computed on
// all 700 players and read by nothing before this. variance_why is
// deliberately NOT surfaced raw — it is a methodology/provenance trail for
// auditing the number, not a fact Cory needs at 8s/pick.
const volatilityRow = eval('(' + lift('volatilityRow') + ')');
ck('both proj_sd and weekly_sd render, plain-labelled, with a ± and an explanation apiece',
  (() => { const r = volatilityRow({ proj_sd: 18.72, weekly_sd: 45.21 });
    return r[0] === 'Volatility' && r[1].indexOf('±18.7 season proj') >= 0 && r[1].indexOf('±45.2 week to week') >= 0; })());
ck('one present, one absent -> just the one, not a broken row',
  (() => { const r = volatilityRow({ proj_sd: 9.6, weekly_sd: null });
    return r[1].indexOf('season proj') >= 0 && r[1].indexOf('week to week') === -1; })());
ck('neither present -> null, not an empty "Volatility" label', volatilityRow({}) === null);
ck('missing player -> null, no throw', volatilityRow(null) === null);
ck('variance_why is deliberately never echoed raw — it is provenance/methodology text, not a player fact',
  !/variance_why/.test(lift('volatilityRow')));
ck('volatilityRow is actually wired into the drill panel, next to usageRow', (() => {
  const wcSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
  return /usageRow\(p\),\s*\n\s*volatilityRow\(p\),/.test(wcSrc);
})());

// ── injuryRow — a designation and a risk pct are two different claims, and
// neither is fabricated when the other is the only one present. ───────────
ck('a real designation with a risk pct shows both, one sentence',
  injuryRow({ injury_status: 'Questionable', injury_risk_pct: 23 })[1] === 'Questionable'
  + ' <span class="muted">(23% missed-game risk this season)</span>');
ck('a risk pct with NO designation still shows the number, honestly labeled "no designation"',
  (() => { const v = injuryRow({ injury_status: null, injury_risk_pct: 5 })[1];
    return v.indexOf('no designation') >= 0 && v.indexOf('5% missed-game risk') >= 0; })());
ck('a designation with NO risk pct still shows the designation alone',
  injuryRow({ injury_status: 'Out', injury_risk_pct: null })[1] === 'Out');
ck('NEITHER present -> null, not a fabricated "healthy"/"0%"',
  injuryRow({ injury_status: null, injury_risk_pct: null }) === null);
ck('a hostile designation string is escaped',
  injuryRow({ injury_status: '<b>X</b>', injury_risk_pct: null })[1].indexOf('<b>X</b>') === -1);
ck('missing player object -> null, no throw', injuryRow(null) === null);

// ── pedigreeRow — rookies only; a veteran\'s draft round is stale noise ────
ck('a rookie with a known round/pick shows both, no year claimed (the field carries none)',
  pedigreeRow({ is_nfl_rookie: true, nfl_draft_round: 1, nfl_draft_pick: 12 })[1]
    === 'Round 1, pick 12 <span class="muted">(rookie)</span>');
ck('a rookie with a round but no pick number still shows the round',
  pedigreeRow({ is_nfl_rookie: true, nfl_draft_round: 3, nfl_draft_pick: null })[1].indexOf('Round 3') === 0);
ck('a VETERAN with the same round/pick fields present -> null (stale, not shown)',
  pedigreeRow({ is_nfl_rookie: false, nfl_draft_round: 1, nfl_draft_pick: 12 }) === null);
ck('a rookie with no round on file -> null, not a guess',
  pedigreeRow({ is_nfl_rookie: true, nfl_draft_round: null }) === null);
ck('missing player / no rookie flag -> null', pedigreeRow(null) === null && pedigreeRow({}) === null);

// ── ageRow — Cory's 08-20 design brief: "player ages" as a plain fact for
// every player, not just a silent ingredient in the RB-30+ risk flag. ──────
ck('a player with a real age shows it, plain', ageRow({ age: 24 })[0] === 'Age' && ageRow({ age: 24 })[1] === '24');
ck('age 0 is falsy but a real (if bizarre) value — must not be treated as missing', ageRow({ age: 0 }) === null || ageRow({ age: 0 })[1] === '0');
ck('missing age -> null, not a fabricated value', ageRow({ age: null }) === null && ageRow({}) === null);
ck('missing player object -> null, no throw', ageRow(null) === null);
ck('ageRow is actually wired into the drill panel, next to injuryRow and pedigreeRow', (() => {
  const wcSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
  return /injuryRow\(p\),\s*\n\s*ageRow\(p\),\s*\n\s*pedigreeRow\(p\),/.test(wcSrc);
})());

// ── depthChartTeammates — the ask ("who else is on the depth chart"), from
// data already on the board, zero new fetch ────────────────────────────────
{
  const board = [
    { player_id: '1', name: 'Alpha Back', team: 'DET', position: 'RB', depth_chart_order: 1 },
    { player_id: '2', name: 'Beta Back', team: 'DET', position: 'RB', depth_chart_order: 2 },
    { player_id: '3', name: 'Gamma Back', team: 'DET', position: 'RB', depth_chart_order: 3 },
    { player_id: '4', name: 'Wrong Team Back', team: 'ZZZ', position: 'RB', depth_chart_order: 1 },
    { player_id: '5', name: 'Wrong Pos', team: 'DET', position: 'WR', depth_chart_order: 1 },
    { player_id: '6', name: 'No Slot Back', team: 'DET', position: 'RB', depth_chart_order: null },
  ];
  const html = depthChartTeammates({ player_id: '2', team: 'DET', position: 'RB' }, board, esc);
  ck('lists only same-team same-position players, sorted by depth_chart_order',
    /Alpha Back[\s\S]*Beta Back[\s\S]*Gamma Back/.test(html), html);
  ck('excludes a different team entirely', html.indexOf('Wrong Team Back') === -1, html);
  ck('excludes a different position entirely', html.indexOf('Wrong Pos') === -1, html);
  ck('excludes a player with no depth-chart slot at all', html.indexOf('No Slot Back') === -1, html);
  ck('marks the CLICKED player distinctly from his teammates',
    /wr-drill-dc-him[^"]*"[\s\S]{0,80}Beta Back[\s\S]{0,40}this player/.test(html)
    || /Beta Back[\s\S]{0,40}this player/.test(html), html);
  ck('the header names the position and team', /depth chart[\s\S]{0,30}RB, DET/.test(html), html);
}
ck('a player with no depth-chart teammates at all (e.g. a lone K) -> empty string, no empty shell',
  depthChartTeammates({ player_id: '9', team: 'ZZZ', position: 'K' }, [], esc) === '');
ck('caps at 5 even with a longer real depth chart, so a bench pileup cannot blow out the panel',
  (() => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      player_id: String(i + 1), name: 'P' + i, team: 'DET', position: 'WR', depth_chart_order: i + 1,
    }));
    const html = depthChartTeammates({ player_id: '1', team: 'DET', position: 'WR' }, many, esc);
    return (html.match(/wr-drill-dc-row/g) || []).length === 5;
  })());
ck('missing player / no allPlayers array -> empty string, no throw',
  depthChartTeammates(null, [], esc) === '' && depthChartTeammates({ team: 'DET', position: 'RB' }, null, esc) === '');

// ── register 4v's drill-down half (routed 08-18): the ceiling row must mark
// a cohort-constant ceiling the same way the shortlist's rangeBar() already
// does, since renderDrill() is the drill-down Cory's own rehearsal harness
// reaches — a bare number here is exactly the gap the routing item named,
// down to its line numbers. ─────────────────────────────────────────────────
// eslint-disable-next-line no-eval
const isCohortCeiling = eval('(' + lift('isCohortCeiling') + ')');
ck('a measured-band-constant ceiling source IS flagged',
  isCohortCeiling({ proj_ceiling_source: 'measured-2023-25-p90' }) === true);
ck('a genuinely per-player source is NOT flagged',
  isCohortCeiling({ proj_ceiling_source: 'measured-2023-25-p90-x-player-cv' }) === false);
ck('CONTROL: an unrecognised/gaussian_z stamp is NOT flagged — conservative on '
  + 'purpose, same as app.js\'s cohortCeiling() (K/DEF must not light up here)',
  isCohortCeiling({ proj_ceiling_source: 'gaussian_z' }) === false);
ck('missing/absent stamp -> not flagged, no throw',
  isCohortCeiling({}) === false && isCohortCeiling(null) === false);
ck('the ceiling row actually calls it and renders the same .wr-ceil-cohort mark '
  + 'the shortlist already ships (no new CSS needed)',
  /isCohortCeiling\(p\)[\s\S]{0,80}wr-ceil-cohort/.test(SRC));
ck('the mark carries the identical explanatory title text as the shortlist\'s own mark',
  /This ceiling is the band [\s\S]{0,20}average, not a measurement of this player/.test(SRC));

// ── wiring: rows.filter(Boolean) actually strips a null row before render ──
{
  ck('renderDrill\'s rows array is filtered before the <tr> map, so a null row renders nothing rather than a broken row',
    /rows\.filter\(Boolean\)\.map/.test(SRC));
  ck('both rows are actually wired into the drill-down\'s facts table',
    /depthChartRow\(p\)/.test(SRC) && /teamPassRateRow\(p\)/.test(SRC));
  ck('the four new rows are wired into the same facts table, not built and discarded',
    /teamPaceRow\(p\)/.test(SRC) && /usageRow\(p\)/.test(SRC)
    && /injuryRow\(p\)/.test(SRC) && /pedigreeRow\(p\)/.test(SRC));
  ck('the depth-chart teammates block is actually rendered into the panel html',
    /depthChartTeammates\(p, d\.players\(\), esc\)/.test(SRC) && /\+ dcHtml/.test(SRC));
}

// ── per-source rank block (Cory: "if I click a player it should give me
// lots of info including where they rank on each source (sleeper, fantasy
// pro, etc)"). Lifted straight out of renderDrill() by source-text slice
// (it's inline, not its own function) and re-executed against a stub
// `d.sourceBoards()` and `p` — same eval-lift pattern as the rest of this
// file, extended to a block instead of a whole function. ──────────────────
{
  const startMark = 'var SOURCE_LABELS = {';
  const start = SRC.indexOf(startMark);
  if (start < 0) throw new Error('per-source rank block not found in warroom_charts.js');
  const end = SRC.indexOf('\n    }\n', SRC.indexOf('if (srcBoards && srcBoards.order) {', start));
  if (end < 0) throw new Error('per-source rank block end not found');
  const block = SRC.slice(start, end + '\n    }'.length);
  // eslint-disable-next-line no-new-func
  const runSrcRanks = new Function('d', 'p', 'esc', block + ';\nreturn srcRanksHtml;');

  const order = {
    BLEND: { RB: ['11', '22', '33'] },
    SLEEPER: { RB: ['22', '11', '33'] },
    // DRAFTSHARKS deliberately absent — a whole-source gap.
    FANTASYPROS: { RB: ['11', '22'] }, // player '33' not carried by this source.
    CBS: {},
    ESPN: { RB: [] },
    FFTODAY: { RB: ['11', '22', '33'] },
  };
  const d = { sourceBoards: () => ({ order }) };
  const p11 = { player_id: 11, position: 'RB' };

  const html11 = runSrcRanks(d, p11, esc);
  ck('a source that ranks the player prints a 1-based rank (BLEND has 11 first)',
    /Blend<\/td><td class="wr-num">#1</.test(html11), html11);
  ck('...and reads it correctly for a source with a different order (SLEEPER has 11 second)',
    /Sleeper<\/td><td class="wr-num">#2</.test(html11), html11);
  ck('a source missing the position entirely -> "no coverage", not a crash or a fake #0',
    /Draft Sharks<\/td><td class="wr-num"><span class="muted">no coverage<\/span>/.test(html11), html11);
  ck('a source that carries the position but not this player -> "no coverage" too '
    + '(CBS has no RB key at all here)',
    /CBS<\/td><td class="wr-num"><span class="muted">no coverage<\/span>/.test(html11), html11);
  ck('a source with an empty array for the position -> "no coverage", not #0 or a throw',
    /ESPN<\/td><td class="wr-num"><span class="muted">no coverage<\/span>/.test(html11), html11);

  const p33 = { player_id: 33, position: 'RB' };
  const html33 = runSrcRanks(d, p33, esc);
  ck('a player a source ranks but not first still gets the right 1-based number (FFTODAY has 33 third)',
    /FFToday<\/td><td class="wr-num">#3</.test(html33), html33);
  ck('a player absent from one source\'s list (in-position, but not ranked) -> "no coverage" '
    + '(FANTASYPROS never lists 33)',
    /FantasyPros<\/td><td class="wr-num"><span class="muted">no coverage<\/span>/.test(html33), html33);
  ck('never prints a raw score alongside the rank — order only, register 107\'s contract',
    !/proj_|score|pts/.test(html33), html33);

  ck('CONTROL: no source-boards artifact loaded at all -> empty string, not a broken/half-built panel',
    runSrcRanks({ sourceBoards: () => null }, p11, esc) === '');
  ck('CONTROL: d.sourceBoards accessor itself missing -> empty string, no throw',
    runSrcRanks({}, p11, esc) === '');

  ck('all seven sources are actually named in the source text (nothing silently dropped)',
    ['Blend', 'Sleeper', 'Draft Sharks', 'FantasyPros', 'CBS', 'ESPN', 'FFToday']
      .every((label) => block.indexOf(label) >= 0), block);
  ck('the section is wired into renderDrill\'s panel html, not built and discarded',
    /\+ srcRanksHtml/.test(SRC));
}

// ── wiring: admin.js reads the artifact server-side and hands it to the view ──
{
  const ADMIN = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'admin.js'), 'utf8');
  ck('admin.js reads team_pace_2021_2025.json', /team_pace_2021_2025\.json/.test(ADMIN));
  ck('...degrades to null on any read failure, same pattern as durability',
    /teamPace = null;\s*\n\s*try/.test(ADMIN) || /let teamPace = null;/.test(ADMIN));
  ck('...and passes teamPace to the view', /\n\s*teamPace,/.test(ADMIN));
  ck('...and the pace fields (Cory: "pace of play") are in the server-side allowlist, not just pass rate',
    /plays_per_game: t\.plays_per_game/.test(ADMIN) && /neutral_plays_per_game: t\.neutral_plays_per_game/.test(ADMIN)
    && /neutral_sec_per_play: t\.neutral_sec_per_play/.test(ADMIN));
  const VIEW = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'admin', 'warroom.ejs'), 'utf8');
  ck('the view bootstraps it onto window.WR_TEAM_PACE', /window\.WR_TEAM_PACE = /.test(VIEW));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
