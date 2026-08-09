'use strict';
// THE DISPATCH — transient popups: pure generation (awards / power poll /
// this-week-in-history, mean voice, deterministic), the archive + per-owner
// seen store, and the HTTP surface (renders on the home page, dismiss makes it
// stay gone) over the real app.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const D = require(path.join(ROOT, 'src', 'routes', 'dispatch'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(async function () {
  // ═══════════════ PURE GENERATION ═══════════════
  const review = {
    top: { roster_id: 1, points: 150.2, team: 'A' },
    low: { roster_id: 2, points: 61.0, team: 'B' },
    blowout: { w: { roster_id: 1, team: 'A' }, l: { roster_id: 2, team: 'B' }, margin: 89.2 },
  };
  const nameOfRoster = rid => ({ 1: 'Cory', 2: 'Justin' }[rid] || null);
  const standings = [
    { owner_name: 'Cory', rank: 1, wins: 3, losses: 0, pf: 400 },
    { owner_name: 'Rich', rank: 2, wins: 2, losses: 1, pf: 380 },
    { owner_name: 'Mike', rank: 3, wins: 1, losses: 2, pf: 350 },
    { owner_name: 'Justin', rank: 4, wins: 0, losses: 3, pf: 300 },
  ];
  const weeklyHistory = { 2022: ['Marian', 'Sam', 'David'], 2024: ['Cory', 'Mike', 'Justin'] };

  const items = D.generate({ season: 2026, week: 3, reviewWeek: 2, review, nameOfRoster, standings, weeklyHistory });
  const byKind = k => items.filter(i => i.kind === k);
  ck('generates the weekly high award', byKind('award').some(i => i.key === 'award:high:2026:2' && /Cory/.test(i.body)));
  ck('generates the toilet award naming the low + score', byKind('award').some(i => i.key === 'award:low:2026:2' && /Justin/.test(i.body) && /61/.test(i.body)));
  ck('generates the blowout award with the margin', byKind('award').some(i => /89\.2/.test(i.body)));
  ck('generates a power poll (top + bottom)', byKind('power').some(i => /Cory/.test(i.body) && /Justin/.test(i.body)));
  ck('this-week-in-history uses the MOST DISTANT past season', byKind('vault').some(i => /2022/.test(i.body) && /David/.test(i.body)), JSON.stringify(byKind('vault').map(i => i.body)));

  // deterministic: same key → same text, always (this is what makes it archivable)
  const again = D.generate({ season: 2026, week: 3, reviewWeek: 2, review, nameOfRoster, standings, weeklyHistory });
  ck('generation is deterministic', JSON.stringify(items) === JSON.stringify(again));

  // pre-season: no review, no games played → only the history callback, no crash
  const preItems = D.generate({ season: 2026, week: 1, reviewWeek: 0, review: null, nameOfRoster,
    standings: standings.map(s => ({ ...s, wins: 0, losses: 0 })), weeklyHistory });
  ck('pre-season: no awards, no power poll', !preItems.some(i => i.kind === 'award' || i.kind === 'power'));
  ck('pre-season still gives a history callback', preItems.some(i => i.kind === 'vault'));

  // ═══════════════ STORE LAYER ═══════════════
  const it = items[0];
  const arch1 = await D.archive(it);
  ck('archive stamps created_at', !!arch1.created_at);
  // immutability: a second archive with different text keeps the first
  const arch2 = await D.archive({ ...it, body: 'REWRITTEN' });
  ck('archive is immutable (first text wins)', arch2.body === it.body, arch2.body);
  const archList = await D.getArchive(2026);
  ck('getArchive lists the season index', archList.some(a => a.key === it.key));

  const seen0 = await D.getSeen(1);
  ck('nothing seen initially', seen0.size === 0);
  await D.markSeen(1, it.key);
  const seen1 = await D.getSeen(1);
  ck('markSeen records it for that owner', seen1.has(it.key));
  ck('pending drops the seen one', !D.pending(items, seen1).some(i => i.key === it.key));
  ck('pending is per-owner (owner 2 still sees it)', D.pending(items, await D.getSeen(2)).some(i => i.key === it.key));
  // cap
  const many = Array.from({ length: 10 }, (_, i) => ({ key: 'k' + i }));
  ck('pending caps at MAX_SHOWN', D.pending(many, new Set()).length === D.CFG.MAX_SHOWN);

  // ═══════════════ HTTP SURFACE ═══════════════
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  // A bundle whose rosters carry records → the power poll fires (deterministic,
  // no dependence on live matchup fetches, which the sandbox can't make).
  const smap = {}; owners.forEach((o, i) => { smap[String(i + 1)] = o.id; });
  const cfg = (await store.get('config')) || {};
  cfg.sleeper_league_id = 'DTEST'; cfg.sleeper_map = smap;
  await store.set('config', cfg);
  const rosters = owners.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + o.id,
    settings: { wins: (owners.length - i), losses: i, fpts: 500 - i * 10, fpts_decimal: 0 } }));
  const users = owners.map(o => ({ user_id: 'u' + o.id, display_name: o.name, metadata: { team_name: o.name + ' FC' } }));
  await store.set('sleeper-cache', { league_id: 'DTEST', fetched_at: Date.now(),
    data: { week: 3, state: { week: 3 }, league: { settings: { playoff_teams: 4 } }, users, rosters, matchups: [] } });

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const cc = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));
  const get = async ck => { const r = await fetch(b + '/', { headers: { Cookie: ck }, redirect: 'manual' }); return { status: r.status, body: r.status === 200 ? await r.text() : '' }; };

  const home1 = await get(cc);
  ck('home renders', home1.status === 200, home1.status);
  ck('home shows the dispatch region', /dispatch-region/.test(home1.body), 'no region');
  ck('home shows the power poll dispatch', /Power poll/.test(home1.body));

  // dismiss the power-poll card
  const pollKey = 'power:' + (await store.get('seasons') && Object.values(await store.get('seasons')).find(s => s.status === 'active')?.year) + ':3';
  const dis = await fetch(b + '/dispatch/dismiss', { method: 'POST', headers: { Cookie: cc, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: 'ajax=1&key=' + encodeURIComponent(pollKey), redirect: 'manual' });
  const disJson = await dis.json().catch(() => ({}));
  ck('dismiss answers JSON ok', dis.status === 200 && disJson.ok === true, dis.status);

  const home2 = await get(cc);
  ck('dismissed dispatch stays gone', !new RegExp('data-key="' + pollKey.replace(/[:]/g, '\\:') + '"').test(home2.body) && !/Power poll/.test(home2.body), 'still showing');

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
