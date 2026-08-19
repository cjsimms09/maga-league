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
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
// eslint-disable-next-line no-eval
const depthChartRow = eval('(' + lift('depthChartRow') + ')');
// eslint-disable-next-line no-eval
const teamPassRateRow = eval('(' + lift('teamPassRateRow') + ')');

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
}

// ── wiring: admin.js reads the artifact server-side and hands it to the view ──
{
  const ADMIN = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'admin.js'), 'utf8');
  ck('admin.js reads team_pace_2021_2025.json', /team_pace_2021_2025\.json/.test(ADMIN));
  ck('...degrades to null on any read failure, same pattern as durability',
    /teamPace = null;\s*\n\s*try/.test(ADMIN) || /let teamPace = null;/.test(ADMIN));
  ck('...and passes teamPace to the view', /\n\s*teamPace,/.test(ADMIN));
  const VIEW = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'admin', 'warroom.ejs'), 'utf8');
  ck('the view bootstraps it onto window.WR_TEAM_PACE', /window\.WR_TEAM_PACE = /.test(VIEW));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
