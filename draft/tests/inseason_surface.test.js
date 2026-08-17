// TERRITORY: A
'use strict';
// THE IN-SEASON DESIGN PASS, RENDERED BY THE REAL APP — not a direct-render
// fixture. Boots the app on a temp store, seeds a mid-season Tuesday through
// the docs the app actually reads (the shots-inseason.js world, lean), and
// asserts the load-bearing rendered claims of the 2026-08-16 pass:
//
//   • the four pages carry the explainer contract (ⓘ what/read/do/src) and the
//     desktop side-by-side wrappers, and the token layer is actually linked;
//   • /waivers leads with the verdict — claim X, drop Y, net N pts — with the
//     net-points derivation one tap deeper and every capture form intact;
//   • /lineup still leads with the to-do diff and still states the measured
//     ~11% honesty; the proof face draws the leak chart WITHOUT dropping the
//     tables it draws (charts are additive — the war-room rule);
//   • /lineup/accuracy renders the report card: per-kind hit-rate bars against
//     the 50% coin benchmark, and the decision rows' scored/edge facts that
//     were computed and displayed nowhere;
//   • /analyzer renders the posture board from the SAME rows as the table —
//     every team on the board exactly once, counts summing to the field, the
//     engine's own cut lines printed beside each posture.
//
// Run: node draft/tests/inseason_surface.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'is-surf-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

const WEEK = 8;
const MYPLAYERS = [
  ['s1', 'Josh Allen', 'QB', 'BUF', 20.1, null], ['s2', 'Bijan Robinson', 'RB', 'ATL', 17.9, null],
  ['s3', 'Breece Hall', 'RB', 'NYJ', 14.2, null], ['s4', "Ja'Marr Chase", 'WR', 'CIN', 18.8, null],
  ['s5', 'Nico Collins', 'WR', 'HOU', 12.1, null], ['s6', 'Sam LaPorta', 'TE', 'DET', 11.3, null],
  ['s7', 'Jahmyr Gibbs', 'RB', 'DET', 15.0, null], ['s8', 'Harrison Butker', 'K', 'KC', 8.9, null],
  ['s9', '49ers D/ST', 'DEF', 'SF', 8.0, null], ['b1', 'Puka Nacua', 'WR', 'LAR', 16.4, null],
  ['b2', 'Tyjae Spears', 'RB', 'TEN', 7.2, null], ['b3', 'Hunter Henry', 'TE', 'NE', 6.1, null],
];
const STARTERS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'];
const WIRE = [
  ['f1', 'Wire Leadback', 'RB', 'CAR', 13.8, null], ['f2', 'Waiver Hero', 'WR', 'PIT', 15.1, null],
  ['f3', 'Streamer Kicker', 'K', 'BAL', 10.2, null],
];

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const cfg = await store.get('config');
  cfg.sleeper_league_id = 'SURFLEAGUE';
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const myRid = Object.keys(cfg.sleeper_map).find(k => Number(cfg.sleeper_map[k]) === Number(cory.id));
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  const ALL = [...MYPLAYERS, ...WIRE];
  const others = active.filter((o, i) => String(i + 1) !== String(myRid));
  await store.set('sleeper-cache', {
    league_id: 'SURFLEAGUE', fetched_at: Date.now(),
    data: {
      state: { week: WEEK, season: SEASON },
      league: { name: 'MFGA', season: SEASON, total_rosters: 10,
        roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN'],
        settings: { playoff_week_start: 15, playoff_teams: 4 } },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
      rosters: active.map((o, i) => String(i + 1) === String(myRid)
        ? { roster_id: i + 1, owner_id: 'u' + i, players: MYPLAYERS.map(p => p[0]), starters: STARTERS,
            settings: { wins: 5, losses: 2, fpts: 812 } }
        : { roster_id: i + 1, owner_id: 'u' + i, players: ['o' + i + 'a'], starters: [],
            settings: { wins: 3, losses: 4, fpts: 700 } }),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 0 })),
      week: WEEK,
    },
  });
  const slim = {};
  for (const [id, name, pos, team, , inj] of ALL) slim[id] = { name, pos, team, rank: 50, inj };
  others.forEach((o, i) => { slim['o' + i + 'a'] = { name: 'Their QB ' + i, pos: 'QB', team: 'XXX', rank: 60, inj: null }; });
  await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: Object.keys(slim).length } });
  const seasonStats = {}, weekStats = {};
  for (const [id, , , , avg] of ALL) {
    seasonStats[id] = { pts_half_ppr: Math.round(avg * 7 * 10) / 10, gp: 7 };
    weekStats[id] = { pts_half_ppr: Math.round((avg + 1.3) * 10) / 10 };
  }
  await store.set(`stats-cache:${SEASON}:season`, { fetched_at: Date.now(), data: seasonStats });
  await store.set(`stats-cache:${SEASON}:${WEEK - 1}`, { fetched_at: Date.now(), data: weekStats });

  const artDir = fs.mkdtempSync(path.join(os.tmpdir(), 'is-surf-art-'));
  const artifactPath = path.join(artDir, 'draft_data.json');
  process.env.DRAFT_DATA_PATH = artifactPath;
  fs.writeFileSync(artifactPath, JSON.stringify({
    players: ALL.map(([id, name, pos, , avg]) => ({
      player_id: id, name, position: pos, proj_mean: Math.round(avg * 17), vorp: Math.round(avg * 17 * 0.4), bye: null })),
  }));

  // Accuracy: one graded snapshot with decision aggregates (scored + mean_edge).
  await store.set(`calibration:${SEASON}:2026-10-21T08:00:00Z`, {
    graded_at: '2026-10-21T08:00:00Z',
    forecasts: {
      week: 7, n_forecasts: 40, n_resolved: 30, n_graded: 28, n_pending: 10, n_disqualified: 2,
      probability: { n: 20, brier: 0.19, reliability: [{ predicted_mid: 0.55, n: 12, observed_rate: 0.5 }] },
      point: { n: 4, bias: 2.1, mae: 9.4 }, categorical: { n: 4, accuracy: 0.5 },
      graded: [
        { key: 'survival:puka@w8', ftype: 'probability', claim: 'Nacua clears 15', value: 0.72, outcome: 1, brier: 0.078, forecast_at: '2026-10-13T12:00:00Z', week: 7 },
        { key: 'survival:cmc@w7', ftype: 'probability', claim: 'CMC outscores Gibbs', value: 0.81, outcome: 0, brier: 0.656, forecast_at: '2026-10-12T12:00:00Z', week: 7 },
      ],
      by_kind: {
        survival: { n: 20, brier: 0.19, accuracy: 0.71 },
        lineup_call: { n: 5, scored: 3, mean_edge: 2.4, accuracy: 0.67 },
        waiver_claim: { n: 2, scored: 1, mean_edge: 4.1, accuracy: 1 },
      },
      by_week: [{ week: 7, n_graded: 28, brier: 0.19, accuracy: 0.72 }],
    },
    decisions: { n_decisions: 8, overridden: 2, scored: 4, cory_beat_model: 1 },
  });

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const cookie = ((await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=pw' })).headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const page = async url => (await fetch(base + url, { headers: { cookie } })).text();

  try {
    // ── /lineup (live) ───────────────────────────────────────────────────────
    {
      const t = await page('/lineup');
      ck('lineup: no template error', !/ReferenceError|is not defined|Cannot read propert/.test(t));
      ck('lineup: the token layer is actually linked (warroom.css)', /css\/warroom\.css/.test(t));
      ck('lineup: the page wears the desktop-first body class', /class="[^"]*inseason-tools/.test(t));
      ck('lineup: the verdict leads (chase/protect/pending)', /lo-verdict-tag/.test(t));
      ck('lineup: the to-do diff renders — start the benched Nacua over the weaker starter',
        /Your lineup isn(&#39;|')t the recommended one/.test(t) && /Puka Nacua/.test(t), (t.match(/.{0,80}recommended one.{0,60}/) || [''])[0]);
      ck('lineup: the measured honesty stays on the page (11% / rare week)',
        /11%/.test(t) || /a rare week/.test(t));
      ck('lineup: explainers render with the DO half', (t.match(/pe-do/g) || []).length >= 3, (t.match(/pe-do/g) || []).length);
      ck('lineup: every explainer cites its source', (t.match(/pe-src/g) || []).length >= 3);
      ck('lineup: desktop side-by-side wrappers present', /is-cols/.test(t) && (t.match(/is-col"/g) || []).length >= 2);
      ck('lineup: both capture forms intact', /action="\/lineup\/log"/.test(t) && /action="\/lineup\/override"/.test(t));
    }

    // ── /lineup?tab=proof — the chart is ADDITIVE ────────────────────────────
    {
      const t = await page('/lineup?tab=proof');
      ck('proof: the leak chart renders', /lo-leak-chart/.test(t) && /<svg/.test(t));
      ck('proof: chart bars carry direct dollar labels', /class="bar/.test(t) && /\$[\d,]+</.test(t));
      ck('proof: the chart says it adds the glance and the tables stay the record', /tables stay the record/.test(t));
      ck('proof: the efficiency tables it draws are STILL on the page (additive, never replacing)',
        /Lineup Efficiency/.test(t) && /Pts left/.test(t));
      ck('proof: the certified figures and the drill remain', /certified leak measurement/.test(t) && /A Week Up Close/.test(t));
    }

    // ── /waivers — the verdict grammar ───────────────────────────────────────
    {
      const t = await page('/waivers');
      ck('waivers: no template error', !/ReferenceError|is not defined|Cannot read propert/.test(t));
      ck('waivers: the verdict leads — BEST CLAIM chip', /BEST CLAIM/.test(t));
      ck('waivers: the verdict names the claim and the net points',
        /wv-name/.test(t) && /\+\d+\.\d pts/.test(t), (t.match(/.{0,90}wv-name.{0,140}/) || [''])[0]);
      ck('waivers: the derivation is one tap deeper and shows the working',
        /were computed<\/summary>/.test(t) && /bestLineup\(\)/.test(t) && /one baseline/i.test(t));
      ck('waivers: the derivation prices dollars from the live $110/$100 weights', /\$110/.test(t) && /\$100\)/.test(t));
      ck('waivers: the priority honesty still leads the doctrine card',
        /prices the player\. It does not decide the claim/.test(t) && /priority waivers/i.test(t));
      ck('waivers: the verdict does not overclaim — priority is called your call',
        /Not modelled — your call/.test(t));
      ck('waivers: all four capture forms intact',
        ['/waivers/log', '/waivers/override', '/stream/log', '/stream/override'].every(a => t.includes(`action="${a}"`)));
      ck('waivers: explainers render with the DO half', (t.match(/pe-do/g) || []).length >= 3);
      ck('waivers: desktop side-by-side wrappers present', /is-cols/.test(t));
    }

    // ── /lineup/accuracy — the report card ───────────────────────────────────
    {
      const t = await page('/lineup/accuracy');
      ck('accuracy: no template error', !/ReferenceError|is not defined|Cannot read propert/.test(t));
      ck('accuracy: the by-kind table reads as a report card', /By prediction type — the report card/.test(t));
      ck('accuracy: hit-rate bars render against the coin benchmark',
        /acc-kind-bar/.test(t) && /a coin flip: 50%/.test(t));
      ck('accuracy: decision rows surface scored + measured edge (computed, previously rendered nowhere)',
        /3 of 5/.test(t) && /\+2\.4 pts/.test(t), (t.match(/.{0,60}of 5.{0,60}/) || [''])[0]);
      ck('accuracy: thin samples are labelled as unproven, not bad',
        /thin sample/.test(t));
      ck('accuracy: explainers render with the DO half', (t.match(/pe-do/g) || []).length >= 3);
      ck('accuracy: desktop side-by-side wrappers present', /is-cols/.test(t));
    }

    // ── /analyzer — the posture board equals the table ───────────────────────
    {
      const t = await page('/analyzer');
      ck('analyzer: no template error', !/ReferenceError|is not defined|Cannot read propert/.test(t));
      ck('analyzer: the posture board renders', /The posture board/.test(t) && /az-board/.test(t));
      const cells = [...t.matchAll(/az-cell-count">(\d+) team/g)].map(m => Number(m[1]));
      const tableRows = [...t.matchAll(/az-prob">(\d+)%/g)].length;
      ck('analyzer: four posture cells, counts summing to the whole field',
        cells.length === 4 && cells.reduce((a, b) => a + b, 0) === tableRows,
        { cells, tableRows });
      const boardRows = (t.match(/az-row/g) || []).length - (t.match(/az-row \./g) || []).length;
      ck('analyzer: every team appears on the board exactly once',
        (t.match(/class="az-row/g) || []).length === tableRows,
        { board: (t.match(/class="az-row/g) || []).length, tableRows, boardRows });
      ck('analyzer: the engine’s cut lines are printed beside each posture',
        /≥ 85% playoff odds/.test(t) && /≤ 30% playoff odds/.test(t) && /≤ 10% playoff odds/.test(t));
      ck('analyzer: the honest validation caveat still precedes the numbers',
        t.indexOf('What this is worth, measured') < t.indexOf('The posture board'));
      ck('analyzer: the full table (the data) is still on the page', /Projected rest-of-season/.test(t));
      ck('analyzer: explainers render with the DO half', (t.match(/pe-do/g) || []).length >= 3);
    }
  } finally {
    delete process.env.DRAFT_DATA_PATH;
    try { fs.rmSync(artDir, { recursive: true, force: true }); } catch (e) { /* scratch */ }
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
