'use strict';
// THE SUNDAY ALERT'S DELIVERY PATH — the cron endpoint and what its scheduler
// can tell from the answer.
//
// The workflow asserted `"ok":true` and nothing else. That is true for THREE
// completely different Sundays, and all three were green:
//   • the off-season no-op                    (correct)
//   • Sleeper unreachable mid-season          (an outage nobody hears about)
//   • no email provider configured in prod    (the alert never arrives, all
//                                              season, and the run is green)
// The endpoint now separates "there was nothing to send" from "there was
// something to send and it did not go", which is the only distinction the
// scheduler needs in order to know whether a green run is good news.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
process.env.SUNDAY_ALERT_KEY = 'test-key';
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 200) : ''))); };
const SEASON = '2026';
const SQUAD = [['p1', 'QB One', 'QB', 'BUF', 21.4], ['p2', 'RB One', 'RB', 'ATL', 16.2],
  ['p3', 'RB Two', 'RB', 'NYJ', 14.1], ['p4', 'WR One', 'WR', 'CIN', 17.8],
  ['p5', 'WR Two', 'WR', 'LAR', 15.3], ['p6', 'TE One', 'TE', 'DET', 11.2],
  ['p7', 'FLEX One', 'RB', 'DET', 13.6], ['p8', 'K One', 'K', 'KC', 8.4],
  ['p9', 'DEF One', 'DEF', 'BAL', 7.9], ['p10', 'Bench WR', 'WR', 'NYJ', 12.7]];

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.is_commissioner = true; cory.email = 'cory@example.com';
  await store.set('owners', owners);
  const active = owners.filter(o => o.active).slice(0, 10);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const myRid = Object.keys(cfg.sleeper_map).find(k => cfg.sleeper_map[k] === cory.id);

  const seedLive = async (live) => {
    if (!live) { await store.del('sleeper-cache').catch(() => {}); await store.set('sleeper-cache', null); return; }
    const slim = {};
    for (const [id, name, pos, team] of SQUAD) slim[id] = { name, pos, team, rank: 1 + Number(id.slice(1)), inj: null };
    await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: SQUAD.length } });
    const seas = {}, wk = {};
    for (const [id, , , , proj] of SQUAD) { seas[id] = { pts_half_ppr: proj * 6, gp: 6 }; wk[id] = { pts_half_ppr: proj }; }
    await store.set(`stats-cache:${SEASON}:season`, { fetched_at: Date.now(), data: seas });
    await store.set(`stats-cache:${SEASON}:6`, { fetched_at: Date.now(), data: wk });
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(), cached: new Date().toISOString(),
      data: { state: { week: 7, season: SEASON }, league: { name: 'MFGA', season: SEASON, total_rosters: 10 },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          players: String(i + 1) === String(myRid) ? SQUAD.map(p => p[0]) : [],
          starters: String(i + 1) === String(myRid) ? SQUAD.slice(0, 9).map(p => p[0]) : [],
          settings: { wins: 4, losses: 2, fpts: 700 } })),
        matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 0 })),
        week: 7 } });
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const hit = async key => {
    const r = await fetch(`${base}/api/sunday-alert?key=${key}`);
    let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
    return { status: r.status, body: j };
  };
  // The scheduler's own logic, mirrored from the workflow so this test judges
  // what the workflow judges rather than a paraphrase of it.
  const verdict = b => {
    const t = JSON.stringify(b || {});
    if (!/"ok":true/.test(t)) return 'red';
    if (/"sent":1/.test(t)) return 'notice';
    if (/"quiet":true/.test(t)) return 'warning';
    return 'red';
  };

  // ── the secret still guards the trigger
  ck('a wrong key is refused', (await hit('nope')).status === 403);
  ck('no key at all is refused', (await hit('')).status === 403);

  // ── off-season: nothing to send, and the scheduler must be able to tell
  await seedLive(false);
  {
    const { body } = await hit('test-key');
    ck('off-season answers ok', body && body.ok === true, body);
    ck('  it reports QUIET — there was nothing to send', body.quiet === true, body);
    ck('  with a machine-readable reason', body.reason === 'no-live-lineup', body);
    ck('  and the scheduler treats it as a warning, not a failure', verdict(body) === 'warning', verdict(body));
  }

  // ── mid-season with a live lineup and NO email provider: the alert cannot be
  // delivered. Previously indistinguishable from the off-season no-op.
  await seedLive(true);
  delete process.env.RESEND_API_KEY;
  {
    const { body } = await hit('test-key');
    ck('a live lineup with no mailer is NOT quiet', body && body.quiet === false, body);
    ck('  it names the misconfiguration', body.reason === 'email-not-configured', body);
    ck('  it reports the week it would have covered', body.week === 7, body);
    ck('  and the scheduler FAILS on it', verdict(body) === 'red', verdict(body));
    // The distinction that did not exist before: same `ok`, same `sent`, and now
    // the two cases are separable.
    ck('  ok and sent alone still cannot tell the two apart',
      body.ok === true && body.sent === 0);
  }

  // ── the endpoint must not become a way to read the analysis.
  {
    const { body } = await hit('test-key');
    const t = JSON.stringify(body);
    // Test for the DATA, not for a word: the note legitimately says "a live
    // lineup exists", which an over-broad /lineup/ match flagged. What must
    // never appear is a player, a dollar figure, or the calls themselves.
    const names = SQUAD.map(p => p[1]);
    ck('the response names no player', !names.some(n => t.includes(n)), t.slice(0, 160));
    ck('  and carries no priced call or lineup array',
      !/startName|sitName|"calls"|dollars|"proj"/i.test(t), t.slice(0, 200));
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
