// TERRITORY: A
'use strict';
/* MEMBER SITE SURFACES — the wiring, not just the modules. Boots the REAL app
 * on a temp store, seeds a mid-season world through the docs the app actually
 * reads (sleeper-cache, players-cache, frozen weeks, the schedule doc, a
 * scratch DRAFT_DATA_PATH board), logs in as a NON-COMMISSIONER, and asserts
 * the member-site pass's surfaces off the rendered HTML:
 *   previews · week nav (past/future/degraded) · the Sleeper-labelled odds
 *   line · records watch chips · /races · the /watch swing layer · the nav.
 * Same pattern as bet_edge_surface.test.js / the shots-member harness.
 */
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'msite-'));
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'msite-art-'));
process.env.DRAFT_DATA_PATH = path.join(SCRATCH, 'draft_data.json');
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const LID = 'SURFLEAGUE';
const SEASON_START = '2026-09-10';
const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const POS_OF = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB', 'K', 'DEF'];

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  const byName = n => active.find(o => o.name === n);
  const david = byName('David'), michael = byName('Michael');
  for (const o of [cory, david]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID;
  cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  cfg.season_start = SEASON_START;
  await store.set('config', cfg);
  const seasons = await store.get('seasons');
  const SEASON = String(Math.max(...Object.keys(seasons).map(Number)));

  // players + the scratch board (Sleeper projections; K/DEF unprojected).
  const playersDb = {}, boardPlayers = [];
  const starterIds = i => SLOTS.map((s, k) => `p${i + 1}${k}`);
  active.forEach((o, i) => {
    starterIds(i).forEach((pid, k) => {
      const pos = POS_OF[k];
      playersDb[pid] = { name: `S${k} ${o.name}`, pos, team: 'KC', rank: 40, inj: null };
      boardPlayers.push({ player_id: pid, name: `S${k} ${o.name}`, position: pos, team: 'KC',
        bye: 12, injury_status: null,
        proj_sleeper: (pos === 'K' || pos === 'DEF') ? null : 250 - k * 14 + i * 6,
        proj_mean: 240 - k * 12, proj_ownmodel: 610.66, weekly_sd: 20 });
    });
  });
  await store.set('players-cache', { fetched_at: Date.now(), data: { players: playersDb, count: Object.keys(playersDb).length } });
  fs.writeFileSync(process.env.DRAFT_DATA_PATH, JSON.stringify({ players: boardPlayers }));

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
        settings: { wins: 3 + (i % 3), losses: 7 - (3 + (i % 3)), ties: 0,
          fpts: Math.round((100 + i * 4) * 7), fpts_decimal: 0 } })),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1,
        points: scores[i], starters: starterIds(i),
        starters_points: SLOTS.map(() => scores[i] / 9),
        players: starterIds(i), players_points: {} })),
      week,
    },
  });

  // Frozen weeks 1–7 (pairings rotate) + the schedule doc for 9–14.
  const pairsFor = w => {
    const ids = active.map((o, i) => i);
    const rot = [ids[0], ...ids.slice(1 + ((w - 1) % 9)), ...ids.slice(1, 1 + ((w - 1) % 9))];
    const out = [];
    for (let k = 0; k < 5; k++) out.push([rot[k], rot[9 - k]]);
    return out;
  };
  const wkScores = w => active.map((o, i) => 88 + ((i * 7 + w * 13) % 45));
  for (let w = 1; w <= 7; w++) {
    const pts = {};
    active.forEach((o, i) => { pts[String(o.id)] = wkScores(w)[i]; });
    await store.set(`weekpoints:${LID}:${w}`, { fetched_at: Date.now(), points: pts });
    await store.set(`pickem-points:${SEASON}:${w}`, pts);
    const games = pairsFor(w).map(([x, y]) => {
      const [a, b] = active[x].id < active[y].id ? [active[x], active[y]] : [active[y], active[x]];
      return { id: `${a.id}:${b.id}`, a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } };
    });
    await PE.ensureSlate(SEASON, w, games, { locked: true });
  }
  const schedWeeks = {};
  for (let w = 9; w <= 14; w++) schedWeeks[w] = pairsFor(w).map(([x, y]) => [active[x].id, active[y].id]);
  await store.set(`schedule:${LID}:${SEASON}`, { fetched_at: Date.now(), season: SEASON, weeks: schedWeeks });
  const prevOdds = {};
  active.forEach((o, i) => { prevOdds[o.id] = 0.4; });
  await store.set(`playoff-odds:${SEASON}:7`, { week: 7, odds: prevOdds, saved_at: new Date().toISOString() });

  // PRE-KICK world first (the odds line + previews live there).
  await store.set('sleeper-cache', bundleDoc(8, active.map(() => 0)));

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));
  const dCk = await login('david');
  const get = async url => (await fetch(b + url, { headers: { Cookie: dCk } })).text();

  // David (index in active) — his week-8 opponent is the paired index.
  const dIdx = active.indexOf(david);
  const dOppIdx = dIdx % 2 === 0 ? dIdx + 1 : dIdx - 1;
  const dOppName = active[dOppIdx].name;

  // ── PRE-KICK: the matchup page ────────────────────────────────────────────
  let html = await get('/matchup');
  ck('matchup: renders for a member with no template error', !/ReferenceError|is not defined|Cannot read/.test(html));
  ck('matchup: the week strip is on the page with the current week marked',
    /wk-strip/.test(html) && /Wk 8 · now/.test(html));
  ck('matchup: the Sleeper odds line renders pre-kick and NAMES its source',
    /mu-odds/.test(html) && /from Sleeper(&#39;|')s projections/.test(html), (html.match(/mu-odds[\s\S]{0,200}/) || [])[0]);
  ck('matchup: the odds line states the K/DEF symmetric exclusion',
    /not projected by Sleeper — left out of both sides/.test(html));
  ck('matchup: the odds line carries a printable probability (pctText grammar)',
    /mu-odds-pct">(\d+%|&lt;1%|&gt;99%)</.test(html));
  ck('matchup: the Your Season schedule card renders', /Your Season/.test(html) && /sched-list/.test(html));
  ck('matchup: a future opponent is named — "when do I play X again" answered here',
    /schedule not posted yet/.test(html) === false && /preview →/.test(html));
  ck('matchup: past weeks in the schedule carry W/L results',
    /sched-res W/.test(html) || /sched-res L/.test(html));

  // ── WEEK NAV: a past week ─────────────────────────────────────────────────
  html = await get('/matchup?week=5');
  ck('matchup?week=5: renders the past-week view', /Week 5/.test(html) && /final — how it went|in the books/.test(html));
  ck('matchup?week=5: the full slate of that week renders with previews',
    /The Week-5 Slate/.test(html) && /all-time|First meeting/.test(html));
  ck('matchup?week=5: no bet form on a past week (betting is the live week\'s)',
    !/name="stake"/.test(html));
  // ── WEEK NAV: an upcoming week ────────────────────────────────────────────
  html = await get('/matchup?week=11');
  ck('matchup?week=11: the upcoming preview names the scheduled opponent',
    /upcoming — the Tuesday preview/.test(html) && /Your game/.test(html));
  ck('matchup?week=11: betting explicitly deferred to the live week',
    /Betting opens when week 11 is the live week/.test(html));
  // ── WEEK NAV: degrades honestly when the schedule doc is gone ────────────
  await store.set(`schedule:${LID}:${SEASON}`, { fetched_at: Date.now(), failed_at: Date.now(), season: SEASON, weeks: {} });
  html = await get('/matchup?week=11');
  ck('matchup?week=11 without a schedule: says NOT POSTED, never a guessed pairing',
    /schedule isn(&#39;|')t posted yet/.test(html) && !/Your game/.test(html));
  html = await get('/matchup');
  ck('matchup: the season card marks unknown future weeks honestly',
    /schedule not posted yet/.test(html));
  await store.set(`schedule:${LID}:${SEASON}`, { fetched_at: Date.now(), season: SEASON, weeks: schedWeeks });

  // ── PRE-KICK: the scoreboard ──────────────────────────────────────────────
  html = await get('/scoreboard');
  ck('scoreboard: week strip present', /wk-strip/.test(html));
  ck('scoreboard: every pre-kick card carries the Tuesday preview strip',
    (html.match(/mu-prev-lead/g) || []).length >= 5, (html.match(/mu-prev-lead/g) || []).length);
  ck('scoreboard: the per-game odds line renders and names Sleeper',
    /sb-odds/.test(html) && /from Sleeper(&#39;|')s projections/.test(html));
  html = await get('/scoreboard?week=5');
  ck('scoreboard?week=5: the frozen finals render with FINAL badges',
    /Week 5/.test(html) && /FINAL/.test(html));
  ck('scoreboard?week=5: previews ride on the past cards', /mu-prev-lead/.test(html));
  html = await get('/scoreboard?week=11');
  ck('scoreboard?week=11: the scheduled slate renders previewed', /week 11/i.test(html) && /mu-prev-lead/.test(html));

  // ── LIVE world: records watch + the odds line stands down ────────────────
  const LIVE = [112.4, 98.2, 121.9, 171.9, 132.6, 104.4, 95.0, 118.3, 77.9, 101.5];
  await store.set('sleeper-cache', bundleDoc(8, LIVE));
  html = await get('/scoreboard');
  ck('scoreboard live: the records-watch chip fires on the record-book score',
    /Records watch:/.test(html) && /already past the all-time No\. 5 week/.test(html));
  ck('scoreboard live: the pre-kick odds line STANDS DOWN once points exist',
    !/sb-odds/.test(html));
  ck('scoreboard live: previews stand down too — the live chips own the card',
    !/mu-prev-lead/.test(html));
  html = await get('/matchup');
  ck('matchup live: the pre-kick odds line stands down', !/mu-odds/.test(html));

  // ── THE RACES ─────────────────────────────────────────────────────────────
  html = await get('/races');
  ck('races: renders for a member', !/ReferenceError|is not defined|Cannot read/.test(html));
  ck('races: all three races render', /The Playoff Race/.test(html) && /The Points Crown/.test(html) && /The Toilet Race/.test(html));
  ck('races: the viewer finds their own line ("Your races")', /Your races/.test(html) && /You sit \d+(st|nd|rd|th)/.test(html));
  ck('races: the playoff line is drawn at the cut', /the playoff line/i.test(html) && /top 4/.test(html));
  ck('races: every played team appears in the playoff race exactly once',
    active.every(o => new RegExp('race-name"><b>' + o.name + '</b>').test(html)));
  ck('races: odds movement arrows ride the prev snapshot', /po-arrow (up|down)/.test(html));
  ck('races: the odds are labelled an estimate, and clinch/elim as proved',
    /running estimate off record \+ points/.test(html) && /proved from the arithmetic, not sampled/.test(html));

  // ── THE WATCH SWING LAYER (rehearsal path — deterministic any day) ────────
  html = await get('/watch?preview=1');
  ck('watch: the swing board header counts GAMES', /The swing board:/.test(html) && /5 games on this slate/.test(html),
    (html.match(/The swing board:[^<]*/) || [])[0]);
  ck('watch: stake lines ride the rows (playoff-line grammar)',
    /wtw-stake/.test(html) && /(playing for the cut|playoff-line game|climbs to)/.test(html));
  ck('watch: the $100 lead is named on its game', /\$100 lead \(/.test(html));

  // ── THE TEAM TREND (chart additive: chart AND its table) ─────────────────
  html = await get('/team');
  ck('team: the season trend chart renders from the frozen weeks',
    /Season Trend/.test(html) && /wr-chart/.test(html));
  ck('team: the chart is ADDITIVE — the same numbers stay as a table',
    /The numbers \(7 weeks\)/.test(html) && /League median/.test(html));

  // ── NAV modernization ────────────────────────────────────────────────────
  html = await get('/');
  ck('nav: The Races is in the member nav', /href="\/races"/.test(html) && /The Races/.test(html));
  ck('nav: the phone tab bar carries Matchup and Scores as primaries',
    /tabbar/.test(html) && /tb-label">Matchup</.test(html) && /tb-label">Scores</.test(html));
  ck('home: the races CTA rides under the week CTA', /weekhub-cta races/.test(html));
  ck('home: the hero carries the Tuesday preview line when live',
    /week-hero-prev/.test(html) || !/week-hero/.test(html), 'hero without preview');

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
