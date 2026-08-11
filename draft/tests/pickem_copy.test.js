'use strict';
// THE PICK'EM PAGE MUST NOT INVENT A FACT ABOUT A NAMED PERSON.
//
// The all-time board closed with:
//
//   This is what the chronicle quotes years from now — "he went <rec> picking
//   games the year he finished last, which tells you everything."
//
// Two invented facts in one sentence. Nothing on that page knows where anybody
// FINISHED — a pick'em record and a league standing are unrelated, and the
// worst picker is routinely mid-table. And when no worst picker was marked, the
// record itself was filled in as "4–11": a fabricated number, inside quotation
// marks, presented as the thing the chronicle will quote years from now.
//
// That second state is reachable, not theoretical. rankBoard only marks a worst
// picker when at least TWO are eligible, so a week where one person picked
// rendered the card with a made-up record in it. Both fixtures below are driven
// through the real page.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pkc-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));
const sleeper = require(path.join(ROOT, 'src', 'sleeper'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  const active = owners.filter(o => o.active).slice(0, 10);
  await store.set('owners', owners);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid; cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  cfg.season_start = '2026-09-10';
  await store.set('config', cfg);
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  const WK = { 1: [120, 90, 100, 95, 88, 80, 140, 70, 66, 60],
    2: [80, 120, 95, 100, 70, 88, 60, 140, 66, 80],
    3: [110, 105, 90, 95, 140, 60, 88, 80, 70, 66] };

  const setWeek = async (week, scores) => store.set('sleeper-cache', {
    league_id: lid, fetched_at: Date.now(),
    data: { state: { week, season: SEASON },
      league: { name: 'MFGA', season: SEASON, total_rosters: 10 },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
      rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i, settings: { wins: 0, losses: 0, fpts: 0 } })),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: scores[i] })),
      week } });

  // pickerIdx: which owners submit a card. Everyone else never picked.
  const seedWeeks = async pickerIdx => {
    for (const k of await store.listKeys('pickem:')) await store.del(k);
    for (const w of [1, 2, 3]) {
      await setWeek(w, WK[w]);
      const games = PE.weekGames(await sleeper.bundle(lid), cfg.sleeper_map, active);
      await PE.ensureSlate(SEASON, w, games, { locked: true });
      await store.set(`pickem-points:${SEASON}:${w}`,
        Object.fromEntries(active.map((o, i) => [String(o.id), WK[w][i]])));
      for (const pi of pickerIdx) {
        const picks = {};
        games.forEach((g, gi) => {
          const aI = active.findIndex(o => o.id === g.a.id), bI = active.findIndex(o => o.id === g.b.id);
          const win = WK[w][aI] >= WK[w][bI] ? g.a.id : g.b.id;
          const lose = WK[w][aI] >= WK[w][bI] ? g.b.id : g.a.id;
          const right = pi === 0 ? true : pi === 9 ? false : ((gi + pi) % 3 !== 0);
          picks[g.id] = right ? win : lose;
        });
        await PE.savePicks(SEASON, w, active[pi].id, picks, games);
      }
    }
    await setWeek(4, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const page = async () => flat(await (await fetch(base + '/pickem', { headers: { cookie } })).text());

  // ── 1) A FULL LEAGUE. There is a worst picker, so the line renders — and it
  // may quote only what the board itself shows.
  {
    await seedWeeks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const t = await page();
    ck('the all-time board renders with a full league', /All-time accuracy/.test(t), t.slice(0, 120));
    const worstRec = (t.match(/DEAD LAST\s*(\d+)%\s*(\d+)[–-](\d+)/) || []).slice(1, 4);
    ck('  fixture check: somebody is marked worst', worstRec.length === 3, worstRec);

    const quote = (t.match(/chronicle quotes years from now — "([^"]+)"/) || [])[1];
    ck('  the closing line renders', !!quote, t.match(/chronicle quotes[^"]*"[^"]*"/));
    ck('  it no longer claims where anybody FINISHED',
      !!quote && !/finished last/.test(quote), quote);
    ck('  the record it quotes is the worst picker\'s own, off the same board',
      !!quote && quote.includes(`${worstRec[1]}–${worstRec[2]}`), { quote, board: worstRec });
    ck('  and it does not assume a pronoun the site never recorded',
      !!quote && !/\bhe\b|\bhis\b/i.test(quote), quote);
  }

  // ── 2) ONE PICKER. rankBoard marks nobody worst (it needs two eligible), and
  // the card still renders because that picker has graded games. This is the
  // state that used to print an invented "4–11".
  {
    await seedWeeks([0]);
    const t = await page();
    ck('fixture check: the all-time card still renders with a single picker',
      /All-time accuracy/.test(t), t.slice(0, 120));
    ck('  fixture check: and nobody is marked worst', !/DEAD LAST/.test(t));
    ck('a record nobody achieved is never printed', !/4–11|4-11/.test(t),
      (t.match(/chronicle quotes[^"]*"[^"]*"/) || [])[0]);
    ck('  with no worst picker the line is simply not made',
      !/chronicle quotes years from now/.test(t),
      (t.match(/chronicle quotes[^"]*"[^"]*"/) || [])[0]);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
