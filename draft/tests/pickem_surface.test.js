// TERRITORY: A
'use strict';
/* PICK'EM LOCK BEHAVIOR, AS RENDERED — the 2026-08-15 polish, pinned.
 *
 * Two states of the same page, driven through the real app:
 *   OPEN   — the slate wears the YOUR PICKS chip with a live count and the
 *            lock clock; a saved pick is marked on its card; the league split
 *            is hidden ("picks hidden until kickoff") — a visible split would
 *            let the last picker copy the crowd.
 *   LOCKED — points on the board flip the chip to LOCKED, the radios disable,
 *            the save button is gone, and the split goes public.
 * Plus the ink pins: the invisible dark-era colors this pass killed stay dead
 * (the shamed name and the picked name must render in real ink).
 */
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pksurf-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
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

  const LID = 'PKSURF';
  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID; cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  // Week 9 of a season whose calendar kickoff is months ahead → the clock, not
  // the scoreboard, says OPEN.
  cfg.season_start = '2026-09-10';
  await store.set('config', cfg);
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  const setWorld = scores => store.set('sleeper-cache', {
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week: 9 }, week: 9,
      league: { name: 'MFGA', total_rosters: 10, settings: { playoff_week_start: 16, playoff_teams: 4 } },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
      rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
        settings: { wins: 4, losses: 4, ties: 0, fpts: 880, fpts_decimal: 0 } })),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: scores[i] })),
    },
  });
  await setWorld(active.map(() => 0));   // OPEN: no points anywhere

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = cookieFrom(login);
  const page = async () => (await fetch(base + '/pickem', { headers: { cookie } })).text();

  // First GET freezes the slate; then save a 2-of-5 card straight through the form.
  let html = await page();
  const slate = await PE.getSlate(SEASON, 9);
  ck('fixture: a five-game slate froze', slate && slate.games.length === 5, slate && slate.games.length);
  const [g1, g2] = slate.games;
  await fetch(base + '/pickem', { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: `pick_${g1.id}=${g1.a.id}&pick_${g2.id}=${g2.b.id}` });

  // ── OPEN ──────────────────────────────────────────────────────────────────
  html = await page();
  ck('OPEN: the slate wears the YOUR PICKS chip', /bc-state needs">YOUR PICKS/.test(html));
  ck('OPEN: the live count renders 2/5', /id="pk-progress">2\/5</.test(html), (html.match(/pk-progress">[^<]*/) || [])[0]);
  ck('OPEN: the lock clock is on the card', /locks <span class="wr-num">[A-Z][a-z]{2},? \d/.test(html.replace(/&nbsp;/g, ' '))
      || /locks <span class="wr-num">/.test(html));
  ck('OPEN: a saved pick is marked on its card', /✓ saved/.test(html));
  ck('OPEN: the split stays hidden before kickoff', /picks hidden until kickoff/.test(html));
  ck('OPEN: no radio is disabled and the save button renders',
    !/type="radio"[^>]*disabled/.test(html) && /id="pk-save-btn"/.test(html));

  // ── LOCKED: points on the board flip everything ───────────────────────────
  await setWorld(active.map((o, i) => 40 + i));
  html = await page();
  ck('LOCKED: the chip flips to LOCKED', /bc-state live">🔒 LOCKED/.test(html));
  ck('LOCKED: every radio disables', !/type="radio"(?![^>]*disabled)/.test(html));
  ck('LOCKED: the save button is gone', !/id="pk-save-btn"/.test(html));
  ck('LOCKED: the league split goes public ("N of M took X" or "all N took X")',
    /\d+ of \d+ took |all \d+ took /.test(html), (html.match(/took [A-Za-z]+/) || [])[0]);
  ck('LOCKED: your pre-lock pick is tagged on the locked card', /your pick/.test(html));

  // ── ink pins: the invisible dark-era colors stay dead ─────────────────────
  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
  const shame = css.slice(css.indexOf('.pk-shame {'), css.indexOf('.pk-shame {') + 200);
  ck('the shamed name renders in real ink (no #ffd7db)', !/ffd7db/.test(shame) && /var\(--ink\)/.test(shame));
  const picked = css.slice(css.indexOf('.pk-opt.picked .pk-opt-name'), css.indexOf('.pk-opt.picked .pk-opt-name') + 120);
  ck('the picked name renders in real ink (no #fff)', /var\(--ink\)/.test(picked), picked);
  ck('warroom.css (the chip grammar) is linked on /pickem', /css\/warroom\.css/.test(html));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
