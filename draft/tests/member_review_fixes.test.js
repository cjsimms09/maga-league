// TERRITORY: A
'use strict';
/* THE MEMBER-SITE REVIEW'S THREE FIXES (2026-08-15), pinned over the real app:
 *
 *   1. THE MATCHUP IS ONE TAP — it joins the phone tab bar (the goal is
 *      tracking matchups here instead of on Sleeper, and Sleeper's whole pitch
 *      is the matchup one tap from anywhere).
 *   2. PICK'EM ON THE NEEDS-YOU STRIP — the dashboard's strip now carries the
 *      one item with a hard weekly deadline, with the live count; it stays
 *      silent once you've picked everything (a strip that always nags is a
 *      strip nobody reads).
 *   3. MONEY ON THE GAME CARD — a locked side bet on one of this week's games
 *      puts a 💰 chip on that game's scoreboard card (locked bets are
 *      league-visible, same rule as SB.betsAbout); a mere proposal never does
 *      (a proposal is not money).
 */
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mrfix-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  const LID = 'MRFIX';
  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID; cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  cfg.season_start = '2026-09-10';        // week-9 kickoff months out → OPEN
  await store.set('config', cfg);
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  await store.set('sleeper-cache', {
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week: 9 }, week: 9,
      league: { name: 'MFGA', total_rosters: 10, settings: { playoff_week_start: 16, playoff_teams: 4 } },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
      rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
        settings: { wins: 4, losses: 4, ties: 0, fpts: 880, fpts_decimal: 0 } })),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 0 })),
    },
  });

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = cookieFrom(login);
  const get = async p => (await fetch(base + p, { headers: { cookie } })).text();

  // ── 1. the matchup is in the phone tab bar ────────────────────────────────
  {
    const html = await get('/');
    const tab = html.slice(html.indexOf('class="tabbar"'), html.indexOf('</nav>', html.indexOf('class="tabbar"')));
    ck('the phone tab bar carries The Matchup', /href="\/matchup"/.test(tab), tab.slice(0, 300));
  }

  // ── 2. pick'em on the needs-you strip, with the live count ────────────────
  {
    // Freeze the slate (a page load does it), then a 2-of-5 card.
    await get('/pickem');
    const slate = await PE.getSlate(SEASON, 9);
    ck('fixture: a five-game slate froze', slate && slate.games.length === 5, slate && slate.games.length);
    const [g1, g2] = slate.games;
    await PE.savePicks(SEASON, 9, cory.id, { [g1.id]: g1.a.id, [g2.id]: g2.b.id }, slate.games);
    let html = await get('/');
    ck('the strip nags with the live count', /Pick this week's games \(2 of 5 in\)|Pick this week&#39;s games \(2 of 5 in\)/.test(html),
      (html.match(/Pick this week[^<]*/) || [])[0]);
    // All five in → the nag goes silent.
    const picks = {};
    for (const g of slate.games) picks[g.id] = g.a.id;
    await PE.savePicks(SEASON, 9, cory.id, picks, slate.games);
    html = await get('/');
    ck('all picked → the strip stops nagging', !/Pick this week/.test(html));
  }

  // ── 3. money on the scoreboard game card ──────────────────────────────────
  {
    const slate = await PE.getSlate(SEASON, 9);
    const g = slate.games[1];                     // a game cory is NOT in
    const inGame = id => slate.games[0].a.id === id || slate.games[0].b.id === id;
    ck('fixture: cory is in game 0, not game 1', inGame(cory.id) && g.a.id !== cory.id && g.b.id !== cory.id);
    const aO = active.find(o => o.id === g.a.id), bO = active.find(o => o.id === g.b.id);
    // A LOCKED matchup bet between the two owners of game 1.
    const locked = await SB.propose({ proposer_id: aO.id, party_ids: [bO.id], stake: 20,
      terms: `${aO.name} outscores ${bO.name} in week 9`, kind: 'matchup', week: 9,
      conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: aO.id, target_id: bO.id }] });
    await SB.accept(locked.id, bO.id, bO.name);
    // A mere PROPOSAL on cory's own game — must never chip (not money yet).
    const g0 = slate.games[0];
    const opp = active.find(o => o.id === (g0.a.id === cory.id ? g0.b.id : g0.a.id));
    await SB.propose({ proposer_id: opp.id, party_ids: [cory.id], stake: 99,
      terms: `${opp.name} outscores Cory in week 9`, kind: 'matchup', week: 9,
      conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: opp.id, target_id: cory.id }] });

    const html = await get('/scoreboard');
    ck('a locked bet puts the 💰 chip on its game', /💰 \$20 riding/.test(html), (html.match(/💰[^<]*/) || [])[0]);
    ck('  naming who is in it', new RegExp(`${aO.name} vs ${bO.name}|${bO.name} vs ${aO.name}`).test(html));
    ck('a proposal never chips ($99 nowhere on the board)', !/\$99 riding/.test(html));
    ck('  and the locked chip does not wear the .mine face for a bystander', !/sb-chip money mine/.test(html));
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
