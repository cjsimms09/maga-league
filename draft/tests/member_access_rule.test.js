// TERRITORY: A
'use strict';
/* THE ACCESS RULE, FAIL-ARM (member-site pass, 2026-08-16).
 *
 * Cory, verbatim: "their odds of winning this week (sleeper info only, not our
 * model for anyone but me)". This suite renders every member-visible surface
 * the pass touched AS A NON-COMMISSIONER and asserts our model cannot be seen:
 *
 *   1. A DISTINCTIVE proj_ownmodel value seeded on every board player must
 *      appear on NO member page (the tripwire: if any surface ever renders an
 *      own-model number, this fails by construction).
 *   2. The member win-odds line must not MOVE when proj_ownmodel moves — the
 *      probability is a function of Sleeper's numbers only, proved by
 *      rendering twice with only proj_ownmodel changed.
 *   3. proj_mean (the blend carrying our opportunity adjustment) must not
 *      move the line either — the mean is proj_sleeper alone.
 *   4. The commissioner tools stay 403 for a member, and the commissioner-only
 *      report strings never leak onto member pages.
 *   5. Everywhere the member site states win odds, the label names Sleeper.
 */
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'maccess-'));
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'maccess-art-'));
process.env.DRAFT_DATA_PATH = path.join(SCRATCH, 'draft_data.json');
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));
const MW = require(path.join(ROOT, 'src', 'routes', 'memberweek'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const LID = 'ACCESSLEAGUE';
const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const POS_OF = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB', 'K', 'DEF'];
// The tripwire values. Distinctive enough that an accidental render is caught
// by a plain string search of the HTML.
const OWNMODEL_MARK = 43219.87;
const OWNMODEL_RX = /43219|43,219/;

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  const david = active.find(o => o.name === 'David');
  for (const o of [cory, david]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID;
  cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  cfg.season_start = '2026-09-10';
  await store.set('config', cfg);
  const seasons = await store.get('seasons');
  const SEASON = String(Math.max(...Object.keys(seasons).map(Number)));

  const starterIds = i => SLOTS.map((s, k) => `p${i + 1}${k}`);
  const playersDb = {};
  const writeBoard = (ownmodel, projMeanShift = 0) => {
    const boardPlayers = [];
    active.forEach((o, i) => {
      starterIds(i).forEach((pid, k) => {
        const pos = POS_OF[k];
        playersDb[pid] = { name: `S${k} ${o.name}`, pos, team: 'KC', rank: 40, inj: null };
        boardPlayers.push({ player_id: pid, name: `S${k} ${o.name}`, position: pos, team: 'KC',
          bye: 12, injury_status: null,
          proj_sleeper: (pos === 'K' || pos === 'DEF') ? null : 250 - k * 14 + i * 6,
          proj_mean: 240 - k * 12 + projMeanShift,
          proj_ownmodel: ownmodel, weekly_sd: 20 });
      });
    });
    fs.writeFileSync(process.env.DRAFT_DATA_PATH, JSON.stringify({ players: boardPlayers }));
    MW._resetArtifactCache();
  };
  writeBoard(OWNMODEL_MARK);
  await store.set('players-cache', { fetched_at: Date.now(), data: { players: playersDb, count: Object.keys(playersDb).length } });

  const bundleDoc = (week, scores) => ({
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week, season: SEASON },
      league: { name: 'MFGA', season: SEASON, total_rosters: 10,
        roster_positions: [...SLOTS, 'BN'],
        settings: { playoff_week_start: 15, playoff_teams: 4 } },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name,
        metadata: { team_name: o.name + "'s Team" } })),
      rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
        players: starterIds(i), starters: starterIds(i),
        settings: { wins: 3 + (i % 3), losses: 4 - (i % 3), ties: 0,
          fpts: Math.round((100 + i * 4) * 7), fpts_decimal: 0 } })),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1,
        points: scores[i], starters: starterIds(i),
        starters_points: SLOTS.map(() => scores[i] / 9),
        players: starterIds(i), players_points: {} })),
      week,
    },
  });
  // Pre-kick (the odds line renders) — the state where a leak would show.
  await store.set('sleeper-cache', bundleDoc(8, active.map(() => 0)));
  // A frozen past week so the week views render content.
  {
    const pts = {};
    active.forEach((o, i) => { pts[String(o.id)] = 90 + i; });
    await store.set(`pickem-points:${SEASON}:5`, pts);
    const games = [];
    for (let i = 0; i < 10; i += 2) {
      const [a, b] = active[i].id < active[i + 1].id ? [active[i], active[i + 1]] : [active[i + 1], active[i]];
      games.push({ id: `${a.id}:${b.id}`, a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } });
    }
    await PE.ensureSlate(SEASON, 5, games, { locked: true });
  }

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));
  const dCk = await login('david');
  const get = async (url, ckie) => fetch(b + url, { headers: { Cookie: ckie || dCk } });

  // ── 1. The tripwire: no member page carries the own-model number ──────────
  const MEMBER_PAGES = ['/', '/matchup', '/matchup?week=5', '/matchup?week=11',
    '/scoreboard', '/scoreboard?week=5', '/watch', '/watch?preview=1', '/races',
    '/team', '/pickem', '/bank', '/bank?section=sidebets', '/history'];
  const bodies = {};
  for (const p of MEMBER_PAGES) {
    const r = await get(p);
    const html = await r.text();
    bodies[p] = html;
    ck(`member page ${p}: renders (${r.status})`, r.status === 200 && !/ReferenceError|is not defined/.test(html));
    ck(`member page ${p}: NO own-model number anywhere on it`,
      !OWNMODEL_RX.test(html) && !/proj_ownmodel|own model|own-model/i.test(html));
  }

  // ── 2+3. The odds line is a function of Sleeper's numbers ONLY ────────────
  const oddsOf = html => { const m = html.match(/mu-odds-pct">([^<]+)</); return m ? m[1] : null; };
  const baseline = oddsOf(bodies['/matchup']);
  ck('the member odds line renders (precondition for the invariance arms)', baseline != null, baseline);
  writeBoard(1.23);                       // move ONLY proj_ownmodel
  let html = await (await get('/matchup')).text();
  ck('FAIL-ARM: moving proj_ownmodel does NOT move the member odds line',
    oddsOf(html) === baseline, `${oddsOf(html)} vs ${baseline}`);
  writeBoard(1.23, 400);                  // now move ONLY proj_mean (the blend)
  html = await (await get('/matchup')).text();
  ck('FAIL-ARM: moving proj_mean (our adjusted blend) does NOT move the line either',
    oddsOf(html) === baseline, `${oddsOf(html)} vs ${baseline}`);
  writeBoard(OWNMODEL_MARK);

  // ── 4. The tools stay commissioner-gated; their strings never leak ────────
  for (const tool of ['/lineup', '/waivers', '/analyzer', '/lineup/accuracy']) {
    const r = await get(tool);
    ck(`tool ${tool}: 403 for a member`, r.status === 403, r.status);
  }
  const TOOL_STRINGS = [/Your edges/, /how it was priced/, /posture board/i,
    /CLAIM .*drop/, /bench dollars/i, /Championship odds/i];
  for (const p of MEMBER_PAGES) {
    ck(`member page ${p}: no commissioner-report string leaks`,
      !TOOL_STRINGS.some(rx => rx.test(bodies[p])));
  }
  // The commissioner still gets the tools (the gate is the member, not the code).
  const cCk = await login('cory');
  const rTool = await get('/lineup', cCk);
  ck('the commissioner still reaches /lineup (200)', rTool.status === 200, rTool.status);

  // ── 5. Wherever the member site states win odds, Sleeper is named ─────────
  for (const p of ['/matchup', '/scoreboard']) {
    const h = bodies[p];
    if (/mu-odds|sb-odds/.test(h)) {
      ck(`odds on ${p} are labelled Sleeper-derived`, /from Sleeper(&#39;|')s projections/.test(h));
    }
  }
  ck('the matchup odds label narrates the exclusion honestly',
    /not projected by Sleeper — left out of both sides/.test(bodies['/matchup']));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
