// TERRITORY: A
/* MEMBER-SITE SCREENSHOT HARNESS — the member-site design pass's camera.
 *
 * Same acceptance order as the war room and the two passes before this one:
 * visual review PRECEDES mechanical verification. Boots the REAL app on a temp
 * store and seeds a mid-season Sunday entirely through the docs the app
 * actually reads (sleeper-cache, players-cache, weekpoints/pickem docs, a
 * scratch DRAFT_DATA_PATH artifact, the schedule doc) — no module stubbed, so
 * what renders is what production would render for this data.
 *
 * THE VIEWER IS A NON-COMMISSIONER (David). Doctrine §7: members live on
 * phones, so phone 390 is captured FIRST here — the inverse of the in-season
 * commissioner harness — and desktop 1440 second, because both must be clean.
 * Zero horizontal overflow and zero console errors are asserted on every
 * capture.
 *
 * Two worlds, one seed: the live Sunday board (scores on), then the SAME week
 * pre-kick (scores zeroed in the cache doc) for the surfaces that only exist
 * before kickoff (the Sleeper-fed odds line, the preview strips).
 *
 * Not in the default suite: needs the pre-installed Chromium.
 * Run:  SHOT_TAG=ms-before node draft/tests/shots-member.js
 */
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-ms-'));
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-ms-artifact-'));
process.env.DRAFT_DATA_PATH = path.join(SCRATCH, 'draft_data.json');
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const { chromium } = require('playwright');

const TAG = process.env.SHOT_TAG || 'ms-shot';
const OUT = path.join(__dirname, '..', 'audit', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const LID = 'SHOTLEAGUE';
const SEASON_START = '2026-09-10';

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  const byName = n => active.find(o => o.name === n) || active.find(o => o.id !== cory.id);
  const david = byName('David'), rich = byName('Richard'), marian = byName('Marian'),
        michael = byName('Michael'), sam = byName('Sam'), dylan = byName('Dylan');
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

  // ── players + a scratch board artifact (Sleeper projections live here) ────
  // Nine starting slots per league template; every roster gets nine starters
  // plus two bench. K and DEF deliberately carry NO Sleeper projection (the
  // real board's shape) so the odds line's symmetric exclusion renders.
  const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
  const POS_OF = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB', 'K', 'DEF'];
  const FIRST = ['Josh', 'Bijan', 'Jahmyr', 'Puka', 'CeeDee', 'Sam', 'James', 'Harrison', 'Denver'];
  const playersDb = {}, boardPlayers = [];
  const starterIds = i => SLOTS.map((s, k) => `p${i + 1}${k}`);
  active.forEach((o, i) => {
    starterIds(i).forEach((pid, k) => {
      const pos = POS_OF[k];
      playersDb[pid] = { name: `${FIRST[k]} ${o.name}`, pos, team: pos === 'DEF' ? 'DEN' : 'KC', rank: 40, inj: null };
      boardPlayers.push({ player_id: pid, name: `${FIRST[k]} ${o.name}`, position: pos, team: 'KC',
        bye: 12, injury_status: null,
        proj_sleeper: (pos === 'K' || pos === 'DEF') ? null : Math.round((250 - k * 14 + i * 6) * 10) / 10,
        proj_mean: 240 - k * 12, proj_ownmodel: 610.66, weekly_sd: 20 });
    });
    for (const b of [0, 1]) {
      const pid = `b${i + 1}${b}`;
      playersDb[pid] = { name: `Bench ${o.name} ${b + 1}`, pos: 'WR', team: 'KC', rank: 200, inj: null };
    }
  });
  await store.set('players-cache', { fetched_at: Date.now(), data: { players: playersDb, count: Object.keys(playersDb).length } });
  fs.writeFileSync(process.env.DRAFT_DATA_PATH, JSON.stringify({ players: boardPlayers }));

  // ── the Sleeper world: one cache doc the whole app reads ──────────────────
  const bundleDoc = (week, scores) => ({
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week, season: SEASON },
      league: { name: 'MFGA', season: SEASON, total_rosters: 10,
        roster_positions: [...SLOTS, 'BN', 'BN'],
        settings: { playoff_week_start: 15, playoff_teams: 4 } },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name,
        metadata: { team_name: o.name + "'s Team" } })),
      rosters: active.map((o, i) => {
        const wins = o.id === david.id ? 5 : o.id === marian.id ? 1 : o.id === cory.id ? 4 : 3 + (i % 2);
        const mean = o.id === david.id ? 126 : o.id === marian.id ? 94 : 108 + i * 2;
        return { roster_id: i + 1, owner_id: 'u' + i,
          players: [...starterIds(i), `b${i + 1}0`, `b${i + 1}1`],
          starters: starterIds(i),
          settings: { wins, losses: 7 - wins, ties: 0, fpts: Math.round(mean * 7), fpts_decimal: 0 } };
      }),
      matchups: active.map((o, i) => {
        const pts = scores[i];
        const perStarter = SLOTS.map((s, k) => Math.round(pts * ([18, 16, 14, 13, 12, 9, 8, 6, 4][k] / 100) * 10) / 10);
        const pp = {}; starterIds(i).forEach((pid, k) => { pp[pid] = perStarter[k]; });
        pp[`b${i + 1}0`] = 11.2; pp[`b${i + 1}1`] = 3.4;
        return { roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: pts,
          starters: starterIds(i), starters_points: perStarter,
          players: [...starterIds(i), `b${i + 1}0`, `b${i + 1}1`], players_points: pp };
      }),
      week,
    },
  });
  // Week 8, live Sunday: David's game is close, one blowout, one record-book
  // score (Michael i=3 → 171.9 clears the all-time top five).
  const WEEK8 = [112.4, 98.2, 121.9, 171.9, 132.6, 104.4, 95.0, 118.3, 77.9, 101.5];
  await store.set('sleeper-cache', bundleDoc(8, WEEK8));

  // Finished weeks 1–7: frozen points + frozen pick'em slates (the week-nav
  // sources), pairings rotating so "when do I play X again" has an answer.
  const pairsFor = w => {
    const ids = active.map((o, i) => i);
    const rot = [ids[0], ...ids.slice(1 + ((w - 1) % 9)), ...ids.slice(1, 1 + ((w - 1) % 9))];
    const out = [];
    for (let k = 0; k < 5; k++) out.push([rot[k], rot[9 - k]]);
    return out;
  };
  const wkScores = w => active.map((o, i) => 88 + ((i * 7 + w * 13) % 45) + (i === 1 ? 6 : 0));
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
  // The upcoming schedule (weeks 9–14) as the schedule doc the week-nav reads.
  const schedWeeks = {};
  for (let w = 9; w <= 14; w++) {
    schedWeeks[w] = pairsFor(w).map(([x, y]) => [active[x].id, active[y].id]);
  }
  await store.set(`schedule:${LID}:${SEASON}`, { fetched_at: Date.now(), season: SEASON, weeks: schedWeeks });

  // Last week's playoff-odds snapshot so movement arrows have a real anchor.
  const prevOdds = {};
  active.forEach((o, i) => { prevOdds[o.id] = Math.max(0.02, Math.min(0.95, 0.35 + (i % 5) * 0.1)); });
  await store.set(`playoff-odds:${SEASON}:7`, { week: 7, odds: prevOdds, saved_at: new Date().toISOString() });

  // This week's pick'em slate (locked — points on the board) with a full split.
  {
    const games = [];
    for (let i = 0; i < 10; i += 2) {
      const [a, b] = active[i].id < active[i + 1].id ? [active[i], active[i + 1]] : [active[i + 1], active[i]];
      games.push({ id: `${a.id}:${b.id}`, a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } });
    }
    await PE.ensureSlate(SEASON, 8, games, { locked: true });
    for (let pi = 0; pi < 10; pi++) {
      const picks = {};
      games.forEach((g, gi) => { picks[g.id] = ((gi + pi) % 2) ? g.a.id : g.b.id; });
      await PE.savePicks(SEASON, 8, active[pi].id, picks, games);
    }
  }

  // A locked side bet riding on David's game this week (the money chip).
  {
    const opp = active[1];
    const b = await SB.propose({ proposer_id: david.id, party_ids: [opp.id], stake: 25,
      terms: `${david.name} outscores ${opp.name} in week 8`, kind: 'matchup', week: 8,
      conditions: [{ test: 'outscores', when: 'week', week: 8, subject_id: david.id, target_id: opp.id }] });
    await SB.accept(b.id, opp.id, opp.name);
  }

  // ── boot the real app, drive the real browser ─────────────────────────────
  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  async function shoot(viewport, label, paths, user) {
    const ctx = await b.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(label + ': ' + e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      if (/Failed to load resource/.test(m.text())) return;
      errs.push(label + ' console: ' + m.text());
    });
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=username]', user || 'david');
    await page.fill('input[name=password]', 'pw');
    await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
    for (const [slug, url] of paths) {
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      // A member page must never scroll sideways — the standing acceptance bar.
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) errs.push(`${slug}-${label}: horizontal overflow ${over}px`);
      const file = path.join(OUT, `${TAG}-${slug}-${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('saved', file);
    }
    await ctx.close();
  }

  // The member surfaces, live-Sunday world. Phone FIRST (doctrine §7).
  const LIVE_PAGES = [
    ['home', '/'],
    ['matchup', '/matchup'],
    ['matchup-past', '/matchup?week=5'],
    ['matchup-future', '/matchup?week=11'],
    ['scoreboard', '/scoreboard'],
    ['scoreboard-past', '/scoreboard?week=5'],
    ['watch', '/watch?preview=1'],
    ['races', '/races'],
    ['team', '/team'],
  ];
  await shoot({ width: 390, height: 844 }, 'phone', LIVE_PAGES);
  await shoot({ width: 1440, height: 950 }, 'desktop', LIVE_PAGES);

  // The pre-kick world: same week, no scores yet — the odds line + preview
  // strips live here. Only the two surfaces that change are captured.
  await store.set('sleeper-cache', bundleDoc(8, WEEK8.map(() => 0)));
  const PREKICK = [
    ['matchup-prekick', '/matchup'],
    ['scoreboard-prekick', '/scoreboard'],
  ];
  await shoot({ width: 390, height: 844 }, 'phone', PREKICK);
  await shoot({ width: 1440, height: 950 }, 'desktop', PREKICK);
  await store.set('sleeper-cache', bundleDoc(8, WEEK8));

  await b.close();
  server.close();
  if (errs.length) { console.log('CONSOLE/PAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('zero console errors');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
