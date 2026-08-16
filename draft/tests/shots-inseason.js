// TERRITORY: A
/* IN-SEASON COMMISSIONER TOOLS SCREENSHOT HARNESS — the design pass's camera.
 *
 * Same acceptance order as the war room and the side-bet pass
 * (docs/queued/warroom-v2-visual-design.md): visual review PRECEDES mechanical
 * verification. Boots the REAL app on a temp store and seeds a mid-season
 * Tuesday — week 8, lineup not yet matching the recommendation, a wire with a
 * real claim AND a real K stream, a graded calibration ledger with override
 * captures, and the committed harvest for the analyzer — then captures all four
 * commissioner in-season pages full-page at desktop 1440 (Cory's primary
 * surface, doctrine §7) and phone 390×844 (review surface; the zero-horizontal-
 * overflow bar still applies and is asserted here).
 *
 * Everything is seeded through the docs the app actually reads (sleeper-cache,
 * players-cache, stats-cache:*, calibration:*, the predledger, and a scratch
 * DRAFT_DATA_PATH artifact) — no module is stubbed, so what renders is what
 * production would render for this data.
 *
 * Not in the default suite: needs the pre-installed Chromium.
 * Run:  SHOT_TAG=is-before node draft/tests/shots-inseason.js
 */
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-is-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const predledger = require(path.join(ROOT, 'src', 'predledger'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const { chromium } = require('playwright');

const TAG = process.env.SHOT_TAG || 'is-shot';
const OUT = path.join(__dirname, '..', 'audit', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const LID = 'SHOTLEAGUE';
const WEEK = 8;

// ── Cory's roster: starters ordered to the league template, one bench WR who
//    SHOULD start (the to-do card's case), one OUT, one Questionable. ─────────
// [id, name, pos, team, seasonAvg, inj]
const MYPLAYERS = [
  ['s1', 'Josh Allen', 'QB', 'BUF', 20.1, null],
  ['s2', 'Bijan Robinson', 'RB', 'ATL', 17.9, null],
  ['s3', 'Breece Hall', 'RB', 'NYJ', 14.2, null],
  ['s4', "Ja'Marr Chase", 'WR', 'CIN', 18.8, null],
  ['s5', 'Nico Collins', 'WR', 'HOU', 12.1, null],       // weaker than the benched Nacua
  ['s6', 'Sam LaPorta', 'TE', 'DET', 11.3, null],
  ['s7', 'Jahmyr Gibbs', 'RB', 'DET', 15.0, null],       // FLEX
  ['s8', 'Harrison Butker', 'K', 'KC', 8.9, null],
  ['s9', '49ers D/ST', 'DEF', 'SF', 8.0, null],
  ['b1', 'Puka Nacua', 'WR', 'LAR', 16.4, null],         // the swap the tool should call
  ['b2', 'Tyjae Spears', 'RB', 'TEN', 7.2, null],
  ['b3', 'Hunter Henry', 'TE', 'NE', 6.1, null],
  ['b4', 'Rookie Burst', 'WR', 'GB', 9.0, 'Questionable'],
  ['b5', 'Glass Ankles', 'WR', 'DAL', 8.4, 'Out'],
];
const STARTERS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'];
// The wire: a real WR upgrade, a real K stream, and filler that reaches nothing.
const WIRE = [
  ['f1', 'Wire Leadback', 'RB', 'CAR', 13.8, null],
  ['f2', 'Waiver Hero', 'WR', 'PIT', 13.1, null],
  ['f3', 'Streamer Kicker', 'K', 'BAL', 10.2, null],
  ['f4', 'Deep Cut', 'WR', 'NO', 4.0, null],
];

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);

  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID;
  cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const myRid = Object.keys(cfg.sleeper_map).find(k => Number(cfg.sleeper_map[k]) === Number(cory.id));
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  // ── the Sleeper world ──────────────────────────────────────────────────────
  const ALL = [...MYPLAYERS, ...WIRE];
  const others = active.filter((o, i) => String(i + 1) !== String(myRid));
  await store.set('sleeper-cache', {
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week: WEEK, season: SEASON },
      league: {
        name: 'MFGA', season: SEASON, total_rosters: 10,
        roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN'],
        settings: { playoff_week_start: 15, playoff_teams: 4 },
      },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name,
        metadata: { team_name: o.name + "'s Team" } })),
      rosters: active.map((o, i) => {
        const rid = String(i + 1);
        if (rid === String(myRid)) {
          return { roster_id: i + 1, owner_id: 'u' + i,
            players: MYPLAYERS.map(p => p[0]), starters: STARTERS,
            settings: { wins: 5, losses: 2, ties: 0, fpts: 812, fpts_decimal: 0 } };
        }
        // Other teams: a thin roster with NO WR depth, so a WR claim reads
        // contested (whoElseNeeds sees open startable slots at WR elsewhere).
        return { roster_id: i + 1, owner_id: 'u' + i,
          players: ['o' + i + 'a', 'o' + i + 'b'], starters: [],
          settings: { wins: 3 + (i % 3), losses: 4 - (i % 3), ties: 0, fpts: 700 + i * 9, fpts_decimal: 0 } };
      }),
      // Tuesday: nobody has points yet — the set-your-lineup window.
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 0 })),
      week: WEEK,
    },
  });

  // players DB (slim shape the app reads from the cache doc)
  const slim = {};
  for (const [id, name, pos, team, , inj] of ALL) slim[id] = { name, pos, team, rank: 50, inj };
  others.forEach((o, i) => {
    slim['o' + i + 'a'] = { name: 'Their QB ' + i, pos: 'QB', team: 'XXX', rank: 60, inj: null };
    slim['o' + i + 'b'] = { name: 'Their RB ' + i, pos: 'RB', team: 'XXX', rank: 61, inj: null };
  });
  await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: Object.keys(slim).length } });

  // stat lines: season averages (gp=7) + last week's points → season-avg projections
  const seasonStats = {}, weekStats = {};
  for (const [id, , , , avg] of ALL) {
    seasonStats[id] = { pts_half_ppr: Math.round(avg * 7 * 10) / 10, gp: 7 };
    weekStats[id] = { pts_half_ppr: Math.round((avg + 1.3) * 10) / 10 };
  }
  await store.set(`stats-cache:${SEASON}:season`, { fetched_at: Date.now(), data: seasonStats });
  await store.set(`stats-cache:${SEASON}:${WEEK - 1}`, { fetched_at: Date.now(), data: weekStats });

  // ── the waiver artifact (scratch DRAFT_DATA_PATH, never the real board) ────
  const artDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-is-art-'));
  const artifactPath = path.join(artDir, 'draft_data.json');
  process.env.DRAFT_DATA_PATH = artifactPath;
  fs.writeFileSync(artifactPath, JSON.stringify({
    players: ALL.map(([id, name, pos, , avg]) => ({
      player_id: id, name, position: pos,
      proj_mean: Math.round(avg * 17), vorp: Math.round(avg * 17 * 0.4), bye: null })),
  }));

  // ── the accuracy page: a graded calibration ledger + captured decisions ────
  const snap = (iso, week, graded, brier, extraGraded) => ({
    graded_at: iso,
    forecasts: {
      week, generated_at: iso,
      n_forecasts: 64, n_resolved: graded + 3, n_graded: graded, n_pending: 64 - graded - 3, n_disqualified: 3,
      probability: {
        n: graded - 6, brier,
        reliability: [
          { predicted_mid: 0.25, n: 8, observed_rate: 0.375 },
          { predicted_mid: 0.55, n: 12, observed_rate: 0.5 },
          { predicted_mid: 0.85, n: 9, observed_rate: 0.778 },
        ],
      },
      point: { n: 4, bias: 2.1, mae: 9.4 },
      categorical: { n: 2, accuracy: 0.5 },
      graded: extraGraded,
      by_kind: {
        survival: { n: graded - 12, brier, accuracy: 0.71 },
        lineup_call: { n: 5, scored: 3, mean_edge: 2.4, accuracy: 0.67 },
        waiver_claim: { n: 2, scored: 1, mean_edge: 4.1, accuracy: 1 },
        forecast: { n: 6, brier: brier + 0.04, accuracy: 0.67 },
      },
      by_week: [
        { week: week - 2, n_graded: Math.floor(graded / 3), brier: brier + 0.03, accuracy: 0.64 },
        { week: week - 1, n_graded: Math.floor(graded / 3), brier: brier + 0.01, accuracy: 0.68 },
        { week, n_graded: graded - 2 * Math.floor(graded / 3), brier, accuracy: 0.72 },
      ],
    },
    decisions: { n_decisions: 8, overridden: 2, scored: 4, cory_beat_model: 1 },
  });
  const GRADED = [
    { key: 'survival:puka@w8', ftype: 'probability', claim: 'Nacua clears 15 in week 7', value: 0.72, outcome: 1, brier: 0.078, forecast_at: '2026-10-13T12:00:00Z', week: 7 },
    { key: 'survival:cmc@w7', ftype: 'probability', claim: 'CMC outscores Gibbs in week 7', value: 0.81, outcome: 0, brier: 0.656, forecast_at: '2026-10-12T12:00:00Z', week: 7 },
    { key: 'forecast:wk7-high', ftype: 'point', claim: 'The weekly high lands near 148', value: 148, outcome: 161.3, abs_error: 13.3, forecast_at: '2026-10-11T12:00:00Z', week: 7 },
    { key: 'forecast:wk6-me', ftype: 'probability', claim: 'Cory wins week 6', value: 0.64, outcome: 1, brier: 0.13, forecast_at: '2026-10-05T12:00:00Z', week: 6 },
    { key: 'room_seat:r1p4', ftype: 'categorical', claim: 'Seat 4 drafts RB in round 1', value: 'RB', outcome: 'WR', hit: false, forecast_at: '2026-08-27T12:00:00Z' },
  ];
  await store.set(`calibration:${SEASON}:2026-09-30T08:00:00Z`, snap('2026-09-30T08:00:00Z', 4, 18, 0.221, GRADED.slice(0, 2)));
  await store.set(`calibration:${SEASON}:2026-10-07T08:00:00Z`, snap('2026-10-07T08:00:00Z', 5, 26, 0.204, GRADED.slice(0, 3)));
  await store.set(`calibration:${SEASON}:2026-10-14T08:00:00Z`, snap('2026-10-14T08:00:00Z', 6, 35, 0.192, GRADED.slice(0, 4)));
  await store.set(`calibration:${SEASON}:2026-10-21T08:00:00Z`, snap('2026-10-21T08:00:00Z', 7, 47, 0.183, GRADED));

  // Captured decisions in the raw ledger (the overrides card reads these).
  const led = (kind, method, payload) => predledger.append(store, { kind, method, season: SEASON, payload });
  await led('lineup_call', 'lineup-tool-v1', { key: `lineup_call:${SEASON}:w5:1`, owner_id: cory.id, week: 5, dollars: 0, recommended: [], counterfactual: [] });
  await led('lineup_call', 'lineup-tool-v1', { key: `lineup_call:${SEASON}:w6:1`, owner_id: cory.id, week: 6, dollars: 3.2, recommended: [], counterfactual: [] });
  await led('lineup_call', 'lineup-tool-v1', { key: `lineup_call:${SEASON}:w7:1`, owner_id: cory.id, week: 7, dollars: 0, recommended: [], counterfactual: [] });
  await led('inseason_override', 'lineup-override-v1', { key: `override:lineup:${SEASON}:w4:1`, owner_id: cory.id, week: 4, gap_dollars: 11, contested: false, reason: 'injury news', recommended: [], counterfactual: [] });
  await led('inseason_override', 'lineup-override-v1', { key: `override:lineup:${SEASON}:w6:1`, owner_id: cory.id, week: 6, gap_dollars: 1.4, contested: true, reason: 'gut', recommended: [], counterfactual: [] });

  // ── boot the real app, drive the real browser ─────────────────────────────
  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  async function shoot(viewport, label, paths) {
    const ctx = await b.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(label + ': ' + e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      if (/Failed to load resource/.test(m.text())) return;
      errs.push(label + ' console: ' + m.text());
    });
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=username]', 'cory');
    await page.fill('input[name=password]', 'pw');
    await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
    for (const [slug, url] of paths) {
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      // The war-room acceptance bar: a phone page never scrolls sideways.
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) errs.push(`${slug}-${label}: horizontal overflow ${over}px`);
      const file = path.join(OUT, `${TAG}-${slug}-${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('saved', file);
    }
    await ctx.close();
  }
  const PAGES = [
    ['lineup', '/lineup'],
    ['lineup-proof', '/lineup?tab=proof'],
    ['waivers', '/waivers'],
    ['accuracy', '/lineup/accuracy'],
    ['analyzer', '/analyzer'],
  ];
  await shoot({ width: 1440, height: 950 }, 'desktop', PAGES);   // desktop FIRST — doctrine §7
  await shoot({ width: 390, height: 844 }, 'phone', PAGES);
  await b.close();
  server.close();
  try { fs.rmSync(artDir, { recursive: true, force: true }); } catch (e) { /* scratch */ }
  if (errs.length) { console.log('CONSOLE/PAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('zero console errors');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
