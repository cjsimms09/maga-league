// TERRITORY: A
/* SIDE-BET + PICK'EM SCREENSHOT HARNESS — the in-season design pass's camera.
 *
 * Same acceptance order as the war room (docs/queued/warroom-v2-visual-design.md):
 * visual review PRECEDES mechanical verification. This boots the REAL app on a
 * temp store, seeds one bet of every kind in every load-bearing state, seeds a
 * graded pick'em history plus a live locked week, and captures full pages at
 * phone (390×844) and desktop (1440) into draft/audit/screens/.
 *
 * Everything is seeded THROUGH the store the app actually reads — the Sleeper
 * bundle rides in via the sleeper-cache doc and finished weeks via
 * weekpoints:*, so no module is stubbed and what renders is what production
 * would render for this data.
 *
 * Not in the default suite: needs the pre-installed Chromium.
 * Run:  SHOT_TAG=sb-before node draft/tests/shots-sidebets.js
 */
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-sb-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const { chromium } = require('playwright');

const TAG = process.env.SHOT_TAG || 'sb-shot';
const OUT = path.join(__dirname, '..', 'audit', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const LID = 'SHOTLEAGUE';
const SEASON_START = '2026-09-10';   // week 8 "now", week 9 kickoff still ahead

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  const byName = n => active.find(o => o.name === n) || active.find(o => o.id !== cory.id);
  const david = byName('David'), rich = byName('Richard'), marian = byName('Marian'),
        michael = byName('Michael'), sam = byName('Sam');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  david.venmo = 'david-pays';           // the pay-link case
  await store.set('owners', owners);

  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID;
  cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  cfg.season_start = SEASON_START;
  await store.set('config', cfg);
  const seasons = await store.get('seasons');
  const SEASON = String(Math.max(...Object.keys(seasons).map(Number)));

  // ── the Sleeper world: one cache doc the whole app reads ──────────────────
  const bundleDoc = (week, scores) => ({
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week, season: SEASON },
      league: { name: 'MFGA', season: SEASON, total_rosters: 10,
        settings: { playoff_week_start: 16, playoff_teams: 4 } },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name,
        metadata: { team_name: o.name + "'s Team" } })),
      rosters: active.map((o, i) => {
        const wins = o.id === david.id ? 6 : o.id === marian.id ? 1 : 3 + (i % 2);
        const mean = o.id === david.id ? 128 : o.id === marian.id ? 92 : 110 + i;
        return { roster_id: i + 1, owner_id: 'u' + i,
          settings: { wins, losses: 7 - wins, ties: 0, fpts: Math.round(mean * 7), fpts_decimal: 0 } };
      }),
      matchups: active.map((o, i) => ({ roster_id: i + 1,
        matchup_id: Math.floor(i / 2) + 1, points: scores[i] })),
      week,
    },
  });
  const WEEK8 = [112.4, 98.2, 121.9, 88.1, 132.6, 104.4, 95.0, 118.3, 77.9, 101.5];
  await store.set('sleeper-cache', bundleDoc(8, WEEK8));

  // Finished weeks 1–5, frozen where the graders read them.
  const wkScores = w => active.map((o, i) => 90 + ((i * 7 + w * 13) % 45) + (i === 0 ? 8 : 0));
  for (let w = 1; w <= 5; w++) {
    const pts = {};
    active.forEach((o, i) => { pts[String(o.id)] = wkScores(w)[i]; });
    await store.set(`weekpoints:${LID}:${w}`, { fetched_at: Date.now(), points: pts });
    await store.set(`pickem-points:${SEASON}:${w}`, pts);
  }

  // ── pick'em history: frozen slates + everyone's cards for weeks 1–3 ──────
  const mkGames = () => {
    const games = [];
    for (let i = 0; i < 10; i += 2) {
      const [a, b] = active[i].id < active[i + 1].id ? [active[i], active[i + 1]] : [active[i + 1], active[i]];
      games.push({ id: `${a.id}:${b.id}`, a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } });
    }
    return games;
  };
  for (let w = 1; w <= 3; w++) {
    const games = mkGames();
    await PE.ensureSlate(SEASON, w, games, { locked: true });
    const pts = {};
    active.forEach((o, i) => { pts[String(o.id)] = wkScores(w)[i]; });
    for (let pi = 0; pi < 10; pi++) {
      const picks = {};
      games.forEach((g, gi) => {
        const win = pts[String(g.a.id)] >= pts[String(g.b.id)] ? g.a.id : g.b.id;
        const lose = win === g.a.id ? g.b.id : g.a.id;
        const right = pi === 0 ? true : pi === 9 ? false : ((gi + pi) % 3 !== 0);
        picks[g.id] = right ? win : lose;
      });
      await PE.savePicks(SEASON, w, active[pi].id, picks, games);
    }
  }
  // This week's slate (week 8, locked — points on the board) with cory's card
  // and a league split, so the post-lock view has splits + live results.
  {
    const games = mkGames();
    await PE.ensureSlate(SEASON, 8, games, { locked: true });
    for (let pi = 0; pi < 10; pi++) {
      const picks = {};
      games.forEach((g, gi) => { picks[g.id] = ((gi + pi) % 2) ? g.a.id : g.b.id; });
      await PE.savePicks(SEASON, 8, active[pi].id, picks, games);
    }
  }

  // ── one bet of every kind, in every load-bearing state ───────────────────
  // 1. WAITING ON YOU — a matchup bet proposed to Cory, week 9 (clock ahead).
  await SB.propose({ proposer_id: david.id, party_ids: [cory.id], stake: 25,
    terms: `${david.name}'s team outscores Cory in week 9`, kind: 'matchup', week: 9,
    conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: david.id, target_id: cory.id }] });
  // 2. CONFIRM NEEDED — the other side declared a result on a live bet.
  {
    const b = await SB.propose({ proposer_id: rich.id, party_ids: [cory.id], stake: 40,
      terms: 'Loser wears the jersey to the draft' });
    await SB.accept(b.id, cory.id, cory.name);
    await SB.declareResult(b.id, rich.id, rich.name, { winner_ids: [rich.id], why: 'you saw the game' });
  }
  // 3. YOUR PICK — a franchise-pool draft with Cory on the clock.
  {
    const b = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id], stake: 100,
      terms: 'The franchise pool — whoever holds the champion', format: 'pool',
      pool_rules: ['champion', 'best_finish'], picks_required: 5,
      pool_teams: active.map(o => o.id), pool_wins: 'holds the eventual league champion' });
    await SB.accept(b.id, rich.id, rich.name);
    await SB.startPoolDraft(b.id, [cory.id, rich.id], 'Cory picks first — finished 2nd to Richard\'s 5th in 2025.');
  }
  // 4. ON THE BOARD — an open market bet with a priced condition.
  await SB.propose({ proposer_id: michael.id, open_slots: 1, stake: 30,
    terms: `${michael.name} makes the playoffs`,
    conditions: [{ test: 'finishes', when: 'season', subject_id: michael.id, target_place: 'playoffs' }] });
  // 5. LIVE, engine can't call it yet — week 10 hasn't happened.
  {
    const b = await SB.propose({ proposer_id: cory.id, party_ids: [sam.id], stake: 20,
      terms: `Cory outscores ${sam.name} in week 10`, kind: 'matchup', week: 10,
      conditions: [{ test: 'outscores', when: 'week', week: 10, subject_id: cory.id, target_id: sam.id }] });
    await SB.accept(b.id, sam.id, sam.name);
  }
  // 6. ENGINE DECIDED — a week-5 bet the seeded scores decide; one tap offers it.
  {
    const b = await SB.propose({ proposer_id: cory.id, party_ids: [marian.id], stake: 35,
      terms: `Cory outscores ${marian.name} in week 5`, kind: 'matchup', week: 5,
      conditions: [{ test: 'outscores', when: 'week', week: 5, subject_id: cory.id, target_id: marian.id }] });
    await SB.accept(b.id, marian.id, marian.name);
  }
  // 7. SETTLED, money not yet moved — one leg in, one leg out (Venmo case).
  {
    const w = await SB.propose({ proposer_id: cory.id, party_ids: [marian.id], stake: 50,
      terms: 'Bills cover on Thanksgiving' });
    await SB.accept(w.id, marian.id, marian.name);
    await SB.settle(w.id, [cory.id], marian.id, marian.name);
    const l = await SB.propose({ proposer_id: cory.id, party_ids: [david.id], stake: 75,
      terms: 'My QB outpoints yours through week 6' });
    await SB.accept(l.id, david.id, david.name);
    await SB.settle(l.id, [david.id], cory.id, cory.name);
  }
  // 8. SENT — an offer of Cory's still waiting on an answer.
  await SB.propose({ proposer_id: cory.id, party_ids: [sam.id], stake: 15,
    terms: `${sam.name} finishes out of the playoffs`,
    conditions: [{ test: 'finishes', when: 'season', subject_id: sam.id, target_place: 'missed' }] });
  // 9. History: one paid-off bet and one declined offer.
  {
    const b = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id], stake: 10,
      terms: 'Week 2: my kicker outscores your defense' });
    await SB.accept(b.id, rich.id, rich.name);
    await SB.settle(b.id, [rich.id], cory.id, cory.name);
    const fresh = await SB.get(b.id);
    await SB.markLeg(b.id, fresh.legs[0].id, rich.id, rich.name, true);
    const d = await SB.propose({ proposer_id: cory.id, party_ids: [michael.id], stake: 500,
      terms: 'Loser shaves his head' });
    await SB.decline(d.id, michael.id, michael.name);
  }

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
      await page.waitForTimeout(400);
      // A phone page must never scroll sideways — the war-room acceptance bar.
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
    ['sidebets', '/bank?section=sidebets'],
    ['pickem', '/pickem'],
    ['matchup', '/matchup'],
  ];
  await shoot({ width: 390, height: 844 }, 'phone', PAGES);
  await shoot({ width: 1440, height: 950 }, 'desktop', PAGES.slice(0, 2));
  await b.close();
  server.close();
  // Horizontal-overflow check rides on the captures: a phone page must not scroll sideways.
  if (errs.length) { console.log('CONSOLE/PAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('zero console errors');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
