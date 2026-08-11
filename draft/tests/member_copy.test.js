'use strict';
// COPY THAT READS WRONG — not that LOOKS wrong.
//
// Found by driving every member surface AS A MEMBER, on a phone, in four states
// (logged out / no data / mid-week live / off-season). Both of these render
// perfectly, pass every correctness test, and still tell the reader something
// false. Driven end to end through the real app in the exact state that
// produced them, so neither can pass for the wrong reason.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const PO = require(path.join(ROOT, 'src', 'routes', 'playoffs'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };
const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const mem = owners.find(o => o.active && o.username && o.username !== 'cory');
  mem.password_hash = hashPassword('pw'); mem.must_change_password = false; mem.is_commissioner = false;
  await store.set('owners', owners);

  // ── MID-WEEK, WEEK 7. Ten teams all 4–2, separated only on points. The viewer
  // sits near the bottom on points, which computes to win 0.55% / lose 0.05% —
  // the shape that produced the defect.
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  const active = owners.filter(o => o.active).slice(0, 10);
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const cacheDoc = {
    league_id: lid, fetched_at: Date.now(), cached: new Date().toISOString(),
    data: { state: { week: 7 }, league: { name: 'MFGA', season: '2026', total_rosters: 10 },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
      rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
        settings: { wins: 4, losses: 2, fpts: 700 + i } })),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 70 + i * 6.3 })),
      week: 7 },
  };
  await store.set('sleeper-cache', cacheDoc);

  // Prove the fixture is the one that matters before trusting anything below.
  const rows = active.map((o, i) => ({ owner_id: o.id, wins: 4, losses: 2, pf: 700 + i }));
  const lev = PO.matchupLeverage(rows, 8, 4, mem.id);
  ck('fixture check: this really is the near-zero-odds shape',
    !!lev && lev.win < 0.01 && lev.lose < 0.005, lev);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `username=${mem.username}&password=pw` });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = async r => (await fetch(base + r, { headers: { cookie } })).text();

  // ── 1) PLAYOFF STAKES: rounding must not become a claim.
  {
    const html = await get('/matchup');
    ck('the matchup page IS the matchup page', /THE MATCHUP|The Matchup/i.test(html));
    const line = (strip(html).match(/What this is worth[^.]*\./) || ['(stakes line absent)'])[0];
    ck('the stakes line renders', /What this is worth/.test(line), line);
    // A 4–2 team in week 7 with eight games left is mathematically alive. A flat
    // 0% asserts elimination; that is a claim, not a rounding.
    ck('a live team is never told it is at a flat 0%',
      !/drops you to 0%/.test(line) && /<1%/.test(line), line);
    // And the line has to reconcile with itself: it used to print two different
    // percentages next to a swing that rounded away to nothing.
    ck('  the swing agrees with the two figures shown, or says it is negligible',
      /barely a swing/.test(line) || !/\b0-point swing/.test(line), line);
  }

  // ── 2) EMPTY ROSTER: do not assert a cause you do not know.
  // Same fixture: Sleeper reports a 4–2 record and no players, which is what an
  // unmapped owner or a Sleeper outage looks like. It used to read "Empty
  // roster — draft hasn't happened yet" directly under that record: two
  // mutually exclusive claims on one screen, and the friendly one sends you off
  // to wait instead of to the fix.
  {
    const t = strip(await get('/team'));
    ck('the team page IS the team page', /MY TEAM|My Team/i.test(t));
    ck('a played record is on the page', /4-2/.test(t), (t.match(/Record.{0,40}/) || [])[0]);
    ck('an empty roster under a real record does not blame the draft',
      !/draft hasn't happened yet/.test(t),
      (t.match(/(Empty roster|No roster came back)[^.]*\./) || ['(absent)'])[0]);
    ck('  it names the real possibility and where to fix it',
      /connection or mapping problem/.test(t),
      (t.match(/No roster came back[^.]*\./) || ['(absent)'])[0]);
  }

  // ── The pre-draft reading must survive: with no games played, "the draft
  // hasn't happened yet" is the true explanation and has to stay.
  {
    cacheDoc.data.rosters = cacheDoc.data.rosters.map(r => ({ ...r, settings: { wins: 0, losses: 0, fpts: 0 } }));
    cacheDoc.fetched_at = Date.now();
    await store.set('sleeper-cache', cacheDoc);
    const t = strip(await get('/team'));
    ck('before the draft it still says exactly that', /draft hasn't happened yet/.test(t),
      (t.match(/(Empty roster|No roster came back)[^.]*\./) || ['(absent)'])[0]);
  }

  // ── 3) PICK'EM: "they" must exist before you taunt them.
  // With nobody picking either way this read "0 of the league backed you to win.
  // Nobody picked against you. THEY'RE ON RECORD NOW. If you win, they'll hear
  // about it." — a taunt aimed at an audience that does not exist. The follow-up
  // assumed the two counts above it were never both zero; in a week nobody
  // submits, they are.
  {
    const t = strip(await get('/pickem'));
    ck("the pick'em page IS the pick'em page", /PICK'EM|Pick'em/i.test(t));
    ck('with nobody picking, it does not claim anyone is on record',
      !/They're on record now/.test(t),
      (t.match(/(Nobody picked this one — not|0 of the league backed)[^.]*\.[^.]*\./) || ['(absent)'])[0]);
    ck('  it says plainly that nobody picked it',
      /Nobody picked this one — not for you, not against you/.test(t),
      (t.match(/Your game[\s\S]{0,220}/) || ['(absent)'])[0]);
  }

  // ── 4) THE CONSTITUTION MUST NOT DISAGREE WITH THE BALLOT.
  // The vote threshold is live-settable (Commish → Season, 1-20). /votes renders
  // it from H.voteThreshold(config); /rules hardcoded "6" in its subtitle AND in
  // the stored rules list. Change it and the two surfaces quote different
  // numbers for the rule that governs changing the rules — with the wrong one on
  // the page people cite in an argument.
  {
    const c = await store.get('config');
    c.vote_threshold = 8;
    await store.set('config', c);
    const rules = strip(await get('/rules'));
    const votes = strip(await get('/votes'));
    ck('the ballot reflects a changed threshold', /8 YES votes/.test(votes),
      (votes.match(/Democracy in action[^.]*\./) || ['(absent)'])[0]);
    ck('the constitution agrees with it', /Amended only by 8 votes/.test(rules),
      (rules.match(/Ratified by the owners[^.]*\.[^.]*\./) || ['(absent)'])[0]);
    ck('  and so does the rules list itself', /All rule changes approved by 8 votes/.test(rules),
      (rules.match(/All rule changes approved by \d+ votes/) || ['(absent)'])[0]);
    ck('  with no stale 6 left behind on the page',
      !/approved by 6 votes/.test(rules) && !/Amended only by 6 votes/.test(rules));
    // Back to the default: absent config, both must still read 6.
    delete c.vote_threshold; await store.set('config', c);
    const r2 = strip(await get('/rules')), v2 = strip(await get('/votes'));
    ck('the default is still 6 on both', /Amended only by 6 votes/.test(r2) && /6 YES votes/.test(v2));
  }

  // ── 5) A SCOPE NOTE THAT CONTRADICTS THE CARD BELOW IT.
  // The Record Book's subtitle blanketed the whole page with "2023 to present",
  // and the very first card under it — the Dynasty Tracker, "titles, all time" —
  // visibly shows a 2022 crown. Two different scopes on one page, one of them
  // stated wrongly over both. And the range was typed, so it would have gone
  // stale the first year nobody remembered to edit it.
  {
    const t = strip(await get('/history/records'));
    ck('the record book IS the record book', /Record Book/.test(t));
    ck('the page no longer claims one scope over two different ones',
      !/settle arguments — 2023 to present/.test(t),
      (t.match(/settle arguments[^.]*\./) || ['(absent)'])[0]);
    ck('  box-score records state their own range, derived from the seasons on file',
      /Box-score records cover \d{4}/.test(t),
      (t.match(/Box-score records cover[^.]*\./) || ['(absent)'])[0]);
    ck('  and the titles above are still labelled all-time',
      /titles, all time/i.test(t));
    // The derived range must actually match the data, not a hardcoded pair.
    const HIST = require(path.join(ROOT, 'src', 'routes', 'history-data'));
    const yrs = (HIST.build().seasons || []).map(x => Number(x.year)).filter(Number.isFinite).sort((a, b) => a - b);
    if (yrs.length) {
      ck('  the range matches the harvested seasons exactly',
        new RegExp('Box-score records cover ' + yrs[0] + (yrs.length > 1 ? '–' + yrs[yrs.length - 1] : '')).test(t),
        { shown: (t.match(/Box-score records cover[^—]*/) || [])[0], expected: yrs[0] + '–' + yrs[yrs.length - 1] });
    }
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
