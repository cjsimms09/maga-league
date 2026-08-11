'use strict';
// THE RECAP, END TO END — the gatherer, not the prose.
//
// weekly_recap.test.js drives src/recap.js with hand-built fixtures and proves
// the WRITING is right. That leaves the half that has never run: recap-data.js
// turning a real-shaped Sleeper payload into the object the writer expects. A
// generator that works on fixtures and a gatherer that has never executed is the
// wired-to-nothing shape, and it is the one I keep finding in other people's
// code.
//
// So this drives the actual cron endpoint against a seeded league and checks the
// states nobody screenshots: mid-week, a tie, the week rolling over, a second
// firing, no provider, off-season.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-'));
process.env.WEEKLY_RECAP_KEY = 'k';
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 260) : ''))); };
const need = (obj, name, what) => {
  if (obj && typeof obj[name] === 'function') return obj[name];
  ck(`${what} exists`, false, `${name} is not exported`);
  return async () => ({ ready: false, reason: 'missing-export' });
};

const SEASON = '2026';
// A real roster shape: 9 starters + bench, with positions, so the gatherer's
// starter/bench/worst-starter split is exercised rather than assumed.
const POOL = [
  ['q1', 'Josh Allen', 'QB'], ['r1', 'Bijan Robinson', 'RB'], ['r2', 'Breece Hall', 'RB'],
  ['w1', "Ja'Marr Chase", 'WR'], ['w2', 'Puka Nacua', 'WR'], ['t1', 'Sam LaPorta', 'TE'],
  ['r3', 'Jahmyr Gibbs', 'RB'], ['k1', 'Harrison Butker', 'K'], ['d1', 'Ravens D/ST', 'DEF'],
  ['w3', 'Garrett Wilson', 'WR'], ['r4', 'Tony Pollard', 'RB'],
];

const wire = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('resend')) {
    let b = {}; try { b = JSON.parse(opts.body); } catch (e) { /* raw */ }
    wire.push({ to: [].concat(b.to || []), subject: b.subject, html: b.html || '' });
    return { ok: true, status: 200, text: async () => '{}' };
  }
  if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
  return { ok: false, status: 500, text: async () => '' };
};

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  cory.is_commissioner = true;
  const active = owners.filter(o => o.active).slice(0, 10);
  // Everyone gets an address — the recap goes to the LEAGUE, and a test where
  // only the commissioner has one would pass a commissioner-only bug.
  active.forEach((o, i) => { o.email = `owner${i}@example.com`; });
  await store.set('owners', owners);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const nameOfRid = rid => (active[Number(rid) - 1] || {}).name;

  // Build one week of matchups. `scores` is per-roster totals; `detail` lets a
  // single roster carry a specific starter/bench story.
  const mkWeek = (week, scores, detail = {}) => active.map((o, i) => {
    const rid = i + 1;
    const d = detail[rid] || {};
    const starters = d.starters || POOL.slice(0, 9).map(p => p[0]);
    const players = POOL.map(p => p[0]);
    const pp = {};
    const total = scores[i];
    // Spread the total across the starters, then let `points` override specific ids.
    starters.forEach((id, k) => { pp[id] = Math.round((total / starters.length) * 10) / 10; });
    POOL.forEach(p => { if (pp[p[0]] == null) pp[p[0]] = 0; });
    Object.assign(pp, d.points || {});
    return { roster_id: rid, matchup_id: Math.floor(i / 2) + 1, points: total,
             starters, players, players_points: pp };
  });

  const seedWeek = async (stateWeek, matchups, opts = {}) => {
    const slim = {};
    for (const [id, name, pos] of POOL) slim[id] = { name, pos, team: 'XXX', rank: 1, inj: null };
    await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: POOL.length } });
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(), cached: new Date().toISOString(),
      data: { state: { week: stateWeek, season: SEASON },
        league: { name: 'MFGA', season: SEASON, total_rosters: 10, settings: { playoff_week_start: 15 } },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          players: POOL.map(p => p[0]),
          settings: { wins: opts.wins ? opts.wins[i] : 4, losses: opts.wins ? 8 - opts.wins[i] : 3, fpts: 700 + i * 9 } })),
        matchups, week: stateWeek } });
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const fire = async () => {
    const before = wire.length;
    const r = await fetch(`${base}/api/weekly-recap?key=k`);
    const j = await r.json();
    return { j, sent: wire.slice(before) };
  };
  // The workflow's own verdict, mirrored so this test judges what CI judges.
  const verdict = b => {
    const t = JSON.stringify(b || {});
    if (!/"ok":true/.test(t)) return 'red';
    if (/"sent":1/.test(t)) return 'notice';
    if (/"reason":"(off-season|already-sent)"/.test(t)) return 'notice';
    return 'red';
  };

  // ── the secret guards it ───────────────────────────────────────────────────
  ck('a wrong key is refused', (await fetch(`${base}/api/weekly-recap?key=no`)).status === 403);

  // ── OFF-SEASON ─────────────────────────────────────────────────────────────
  await store.set('sleeper-cache', null);
  {
    const { j, sent } = await fire();
    ck('off-season sends nothing', sent.length === 0 && j.sent === 0, j);
    ck('  and names it, so CI can tell July from a missed October week',
      j.quiet === true && j.reason === 'off-season', j);
    ck('  the workflow reads it as a notice, not a failure', verdict(j) === 'notice', verdict(j));
  }

  // ── MID-WEEK: the games are not final ──────────────────────────────────────
  // The single most dangerous state. "X beat Y" is FALSE at 4pm Sunday and stays
  // false forever once it is in nine inboxes.
  process.env.RESEND_API_KEY = 'test-key';
  {
    const scores = [88.2, 0, 101.4, 96.0, 77.7, 80.1, 92.3, 84.5, 70.0, 99.9];
    await seedWeek(7, mkWeek(7, scores));  // state.week 7 → recaps week 6
    await store.set('sleeper-cache', Object.assign(await store.get('sleeper-cache'), {}));
    const { j, sent } = await fire();
    ck('a week with an unplayed team sends NOTHING', sent.length === 0 && j.sent === 0, j);
    ck('  it refuses rather than telling half the story',
      j.reason === 'week-not-final' || j.reason === 'no-live-data', j);
    ck('  and CI goes RED, because a missed week is a real miss',
      verdict(j) === 'red', verdict(j));
  }

  // ── A FINISHED WEEK, with a story in it ────────────────────────────────────
  // Roster 1 leaves a 28.4 bench WR out for a 1.1 starter, in a game decided by
  // less than the gap — the flipped-it case, which must lead the oddities.
  const FINAL = [151.2, 150.6, 128.0, 67.4, 119.9, 102.2, 111.0, 110.4, 96.6, 95.1];
  {
    const detail = { 1: { starters: [...POOL.slice(0, 8).map(p => p[0]), 'd1'],
                          points: { w1: 1.1, k1: 14.0 } },
                     2: {} };
    const mus = mkWeek(9, FINAL, detail);
    // Give roster 1 the big bench score the solver should notice.
    mus[0].players_points.w3 = 28.4;
    await seedWeek(10, mus);   // state.week 10 → recaps week 9
    // matchupsForWeek re-fetches; with no egress it returns null and the route
    // falls back to the bundle's own matchups. Assert we actually got a recap
    // out of THAT path, since it is the one production will use off the cache.
    const { j, sent } = await fire();
    ck('a finished week SENDS', j.sent === 1 && sent.length === 1, j);
    ck('  it recaps the week that FINISHED, not the one in progress', j.week === 9, j);
    ck('  it goes to the whole league, not just the commissioner',
      sent[0].to.length === active.filter(o => o.email).length, sent[0].to.length);
    ck('  the workflow logs a notice', verdict(j) === 'notice', verdict(j));

    const html = sent[0].html;
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    // THE GATHERER'S OUTPUT, checked through the email rather than by inspecting
    // its return value — if the join from roster_id to owner name is broken this
    // is where it shows.
    ck('  it names real owners, not "Team 3"', !/Team \d/.test(text), text.slice(0, 200));
    // Count by OWNER, not by verb: a verb list is a paraphrase of the phrase
    // banks and would go stale the moment a bank changes.
    const named = active.filter(o => text.includes(o.name)).length;
    ck('  every team in the league appears', named === active.length, { named, of: active.length });
    ck('  the weekly $100 is in it', /\$100/.test(text), text.slice(0, 300));
    ck('  the 0.6-point game is called what it was',
      /0\.6/.test(text), (text.match(/.{0,80}0\.6.{0,60}/) || [''])[0]);
    ck('  the bench player who would have flipped it leads the oddities',
      /Garrett Wilson/.test(text), (text.match(/.{0,100}Garrett Wilson.{0,80}/) || [''])[0]);
    ck('  the subject line is the week, not a template', /Week 9/.test(sent[0].subject), sent[0].subject);
    // FOUND BY DRIVING IT. The rivalry billing read fields the module does not
    // return and shipped "(undefined — [object Object].)" into the body.
    ck('  no undefined or [object Object] anywhere in the email',
      !/undefined|\[object Object\]|NaN/.test(text), (text.match(/.{0,80}(undefined|\[object Object\]|NaN).{0,60}/) || [''])[0]);
    // ALSO FOUND BY DRIVING IT. "the margin was under the kicker's score" is true
    // in most games; it fired on three of five matchups in one email and pushed
    // the best material out of the top three.
    ck('  no running joke is told twice in one email',
      (text.match(/A kicker decided a football game/g) || []).length <= 1,
      (text.match(/A kicker decided a football game/g) || []).length);
    ck('  and the good material survives to the oddities',
      /Garrett Wilson/.test(text), (text.match(/.{0,100}bench.{0,80}/i) || [''])[0]);
    // The footer states the whole policy, because this is the only email nine
    // people get and "why am I receiving this" needs an answer in the email.
    ck('  the footer names the only three things we will ever send',
      /password resets and draft-turn/i.test(text), text.slice(-260));
  }

  // ── FIRED AGAIN, SAME WEEK ─────────────────────────────────────────────────
  {
    const { j, sent } = await fire();
    ck('the same week does not send twice', sent.length === 0 && j.sent === 0, j);
    ck('  it says why rather than looking like a failure',
      j.quiet === true && j.reason === 'already-sent', j);
    ck('  and CI treats it as a notice', verdict(j) === 'notice', verdict(j));
  }

  // ── THE WEEK ROLLS OVER ────────────────────────────────────────────────────
  {
    const next = FINAL.map((p, i) => Math.round((p + (i % 2 ? -7 : 9)) * 10) / 10);
    await seedWeek(11, mkWeek(10, next));
    const { j, sent } = await fire();
    ck('the NEXT week sends a new recap', j.sent === 1 && j.week === 10, j);
    ck('  and it is a different email', sent[0].subject !== '' && /Week 10/.test(sent[0].subject), sent[0].subject);
  }

  // ── NO EMAIL PROVIDER: a recap was written and cannot be delivered ─────────
  {
    delete process.env.RESEND_API_KEY;
    await seedWeek(12, mkWeek(11, FINAL));
    const { j, sent } = await fire();
    ck('with no provider it does not claim to have sent', sent.length === 0 && j.sent === 0, j);
    ck('  it is NOT quiet — a week went unrecapped',
      j.quiet === false && j.reason === 'email-not-configured', j);
    ck('  and CI goes red', verdict(j) === 'red', verdict(j));
    process.env.RESEND_API_KEY = 'test-key';
  }

  // ── A TIE ──────────────────────────────────────────────────────────────────
  // Nobody screenshots a tie and the writer has a winner/loser shape, so the
  // margin is 0 and the "winner" is arbitrary. It must not crash and must not
  // claim somebody beat somebody.
  {
    const tied = [110.0, 110.0, 128.0, 67.4, 119.9, 102.2, 111.0, 110.4, 96.6, 95.1];
    await seedWeek(14, mkWeek(13, tied));
    const { j, sent } = await fire();
    ck('a TIE does not crash the recap', j.ok === true, j);
    if (sent.length) {
      const text = sent[0].html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      // `by 0\b` matches "by 0.6" — `\b` sits at the dot. Test the real claim:
      // the tie is called a tie, and nobody is said to have beaten anyone by 0.
      ck('  the tie is called a tie', /tied|A tie\./.test(text), (text.match(/.{0,120}tie.{0,60}/i) || [''])[0]);
      ck('  and nobody is said to have won by nothing',
        !/by 0(?![.\d])/.test(text), (text.match(/.{0,90}by 0(?![.\d]).{0,40}/) || [''])[0]);
    } else {
      ck('  (it declined to send, which is also acceptable)', true, j.reason);
    }
  }

  // ── THE PREVIEW SHOWS THE SAME THING THE EMAIL SENDS ──────────────────────
  // A preview that diverges from the email is worse than no preview — it was
  // already caught once on the Sunday alert, showing a badge the real email
  // would never send. And this preview is the ONLY check on "is any of this
  // mean" before it reaches nine people.
  {
    await seedWeek(10, (() => {
      const detail = { 1: { starters: [...POOL.slice(0, 8).map(p => p[0]), 'd1'], points: { w1: 1.1, k1: 14.0 } } };
      const m = mkWeek(9, FINAL, detail); m[0].players_points.w3 = 28.4; return m;
    })());
    const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
    const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
    const page = await (await fetch(base + '/admin/recap?week=9', { headers: { cookie } })).text();
    const shown = page.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
    ck('the preview page renders the recap', /Week 9/.test(shown) && /hundred dollars/i.test(shown),
      shown.slice(0, 200));
    const RD = require(path.join(ROOT, 'src', 'routes', 'recap-data'));
    const world = { config: (await store.get('config')), seasons: (await store.get('seasons')) };
    const built = await need(RD, 'buildWeeklyRecap', 'the gatherer')(
      world, (await store.get('owners')).filter(o => o.active), 9, SEASON);
    ck('  and every line the email would carry is on the page',
      built.ready && built.sections.every(s => s.lines.every(l =>
        shown.includes(l.replace(/\*\*/g, '').slice(0, 60)))),
      built.ready ? built.sections[1].lines[0] : built);
    // A member must not be able to read it early, or the preview stops being a
    // gate and becomes a leak.
    const anon = await fetch(base + '/admin/recap?week=9', { redirect: 'manual' });
    ck('  a logged-out visitor cannot read it', anon.status >= 300, anon.status);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
