'use strict';
// THE WAIVER PAGE — and the thing it must refuse to imply.
//
// The engine sat with no caller for weeks. This is the caller, and the hard part
// was never the layout.
//
// OUR LEAGUE RUNS PRIORITY WAIVERS, NOT FAAB. Priority is a depleting resource:
// one good claim drops you to the bottom. So the decision is never "is this
// player good", it is "is he worth spending my CURRENT POSITION on, or do I hold
// for something better" — a stopping problem. The engine does not model it: it
// prices what a claim adds to the starting lineup, which is the numerator of the
// stopping rule and not the rule. `whoElseNeeds` derives the one input such a
// rule would need and the valuation throws it away.
//
// So these checks are mostly about what the page SAYS, not what it computes:
//   • it must state the gap rather than present a ranking as the answer;
//   • a week with nothing worth claiming must say so and say HOLD, not rank
//     three zeros 1-2-3;
//   • contested-ness must be shown AND flagged as not priced, because the dollar
//     figure is identical whether three teams want him or nobody does;
//   • and a member must not be able to read any of it.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wsf-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

// MY ROSTER: nine slots filled plus one droppable scrub.
const MINE = [
  ['m1', 'Josh Allen', 'QB', 300], ['m2', 'Bijan Robinson', 'RB', 240],
  ['m3', 'Breece Hall', 'RB', 220], ['m4', "Ja'Marr Chase", 'WR', 230],
  ['m5', 'Puka Nacua', 'WR', 210], ['m6', 'Sam LaPorta', 'TE', 180],
  ['m7', 'Jahmyr Gibbs', 'RB', 175], ['m8', 'Harrison Butker', 'K', 130],
  ['m9', 'Ravens D/ST', 'DEF', 125], ['m10', 'Bench Scrub', 'WR', 120],
];
// THE WIRE, two versions: one with a genuine upgrade, one with nothing.
const GOOD_WIRE = [['f1', 'Wire Leadback', 'RB', 255], ['f2', 'Wire Slot WR', 'WR', 205], ['f3', 'Wire Kicker', 'K', 110]];
const DEAD_WIRE = [['f1', 'Wire Scrub A', 'WR', 90], ['f2', 'Wire Scrub B', 'RB', 80], ['f3', 'Wire Kicker', 'K', 110]];

const realFetch = global.fetch;
global.fetch = async (url, opts) => {
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
  active.forEach(o => { o.password_hash = hashPassword('pw'); o.must_change_password = false; });
  const member = active.find(o => o.id !== cory.id && !o.is_commissioner);
  await store.set('owners', owners);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const myRid = Object.keys(cfg.sleeper_map).find(k => Number(cfg.sleeper_map[k]) === Number(cory.id));
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  // The artifact is the SOURCE OF TRUTH for projections and VORP (the live
  // adapter's own rule — recomputing VORP over the thin FA pool inflates it and
  // makes the waiver tool disagree with the draft on the same player).
  const artifactPath = path.join(ROOT, 'public', 'draft_data.json');
  const realArtifact = fs.readFileSync(artifactPath);
  const mkArt = wire => ({
    players: [...MINE, ...wire].map(([id, name, pos, proj]) => ({
      player_id: id, name, position: pos, proj_mean: proj, vorp: Math.round(proj * 0.4), bye: null })),
  });

  const seed = async (wire, opts = {}) => {
    fs.writeFileSync(artifactPath, JSON.stringify(mkArt(wire)));
    const slim = {};
    for (const [id, name, pos] of [...MINE, ...wire]) slim[id] = { name, pos, team: 'XXX', rank: 1, inj: null };
    await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: MINE.length + wire.length } });
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(),
      data: { state: { week: 7, season: SEASON },
        league: { name: 'MFGA', season: SEASON, total_rosters: 10,
          roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN'],
          settings: { playoff_week_start: 15 } },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          // Rival rosters are DELIBERATELY THIN when `contested` is wanted: an
          // open startable slot at RB is what whoElseNeeds looks for.
          players: String(i + 1) === String(myRid) ? MINE.map(p => p[0])
            : (opts.rivalsWant ? ['m1'] : [...MINE.map(p => p[0])]),
          settings: { wins: 4, losses: 3, fpts: 700 } })),
        matchups: [], week: 7 } });
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const loginAs = async o => {
    const r = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(o.username)}&password=pw` });
    return (r.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  };
  const cook = await loginAs(cory);
  const page = async (cookie = cook) => {
    const r = await fetch(base + '/waivers', { headers: { cookie }, redirect: 'manual' });
    return { status: r.status, text: strip(await r.text()) };
  };

  try {
    // ── IT IS A TOOL, SO IT IS THE COMMISSIONER'S ──────────────────────────
    {
      const mcook = await loginAs(member);
      const m = await page(mcook);
      ck('a member cannot open the waiver tool', m.status === 403 || m.status >= 300,
        m.status);
      const anon = await fetch(base + '/waivers', { redirect: 'manual' });
      ck('  nor can a logged-out visitor', anon.status >= 300, anon.status);
      ck('  and it no longer 404s for the commissioner', (await page()).status === 200);
    }

    // ── THE GAP IS STATED, ONCE, AT THE TOP ────────────────────────────────
    await seed(GOOD_WIRE, { rivalsWant: true });
    {
      const t = (await page()).text;
      ck('the page says it prices the player and does not decide the claim',
        /prices the player\. It does not decide the claim/i.test(t),
        (t.match(/.{0,60}does not decide.{0,60}/i) || [''])[0]);
      ck('  it names PRIORITY waivers as the reason', /priority waivers/i.test(t));
      ck('  it states the actual decision in the manager\'s words',
        /worth my current spot, or do I hold/i.test(t),
        (t.match(/.{0,80}current spot.{0,60}/i) || [''])[0]);
      ck('  and says plainly that none of it is modelled',
        /None of that is modelled here/i.test(t),
        (t.match(/.{0,80}modelled here.{0,40}/i) || [''])[0]);
    }

    // ── THE CLAIMS THEMSELVES ──────────────────────────────────────────────
    {
      const t = (await page()).text;
      ck('a real upgrade is listed by name', /Wire Leadback/.test(t),
        (t.match(/.{0,60}Wire Leadback.{0,80}/) || [''])[0]);
      ck('  with the drop it would cost', /Bench Scrub/.test(t),
        (t.match(/.{0,40}drop.{0,60}/) || [''])[0]);
      ck('  priced in POINTS first, dollars second — points are checkable, dollars are modelled',
        /\+80\.0 pts/.test(t), (t.match(/.{0,40}pts.{0,40}/) || [''])[0]);
      // The kicker that started this whole defect must not appear at all: it
      // reaches no slot, so it is not a claim.
      ck('  and a claim that reaches no slot is not listed at all',
        !/Wire Kicker/.test(t), (t.match(/.{0,60}Wire Kicker.{0,40}/) || [''])[0]);
    }

    // ── CONTESTED IS SHOWN AND EXPLICITLY NOT PRICED ───────────────────────
    // The engine values a claim identically whether three eager rivals want him
    // or nobody does. In a PRIORITY league that is backwards, so the page must
    // surface the fact with the caveat rather than fold it into a number that
    // would then be wrong.
    {
      const t = (await page()).text;
      ck('rivals short at the position are named', /other team/i.test(t),
        (t.match(/.{0,80}other team.{0,80}/i) || [''])[0]);
      // FOUND TWENTY MINUTES AFTER SHIPPING THIS PAGE. It read "including N
      // contending or desperate", and the route computes NO postures —
      // whoElseNeeds defaults a missing posture to eager, a conservative default
      // inside the engine, which the page turned into a claim about nine teams'
      // competitive state. Absent is not a value, in a view as much as in a
      // record.
      ck('  it does NOT claim a posture nothing established',
        !/contending or desperate/i.test(t),
        (t.match(/.{0,100}contending or desperate.{0,40}/i) || [''])[0]);
      ck('  it says only what is known — an open slot at the position',
        /open .* slot/i.test(t), (t.match(/.{0,60}open .{0,30}slot.{0,40}/i) || [''])[0]);
      ck('  and says outright that their willingness to spend is not modelled',
        /not modelled/i.test(t), (t.match(/.{0,80}not modelled.{0,40}/i) || [''])[0]);
      ck('  and the page says the dollar figure does NOT include it',
        /not in the dollar figure above/i.test(t),
        (t.match(/.{0,100}dollar figure.{0,60}/i) || [''])[0]);
    }

    // ── THE NOTHING WEEK: it must say HOLD, not rank three zeros ───────────
    await seed(DEAD_WIRE);
    {
      const t = (await page()).text;
      ck('a week with nothing worth claiming says so', /Nothing on the wire improves your lineup/i.test(t),
        (t.match(/.{0,80}Nothing on the wire.{0,60}/i) || [''])[0]);
      ck('  and gives the one stopping answer it CAN give: hold', /Hold your priority/i.test(t),
        (t.match(/.{0,60}Hold your.{0,80}/i) || [''])[0]);
      ck('  it does not rank worthless claims as though they were options',
        !/Wire Scrub A/.test(t) && !/Claim Wire/.test(t),
        (t.match(/.{0,60}Wire Scrub.{0,40}/) || [''])[0]);
      ck('  and it explains WHY that answer is decidable',
        /never worth your position in the order/i.test(t),
        (t.match(/.{0,80}never worth.{0,60}/i) || [''])[0]);
    }

    // ── OFF-SEASON: no roster, and that is the correct answer ──────────────
    await store.set('sleeper-cache', null);
    {
      const t = (await page()).text;
      ck('with no live roster it says so rather than showing an empty table',
        /No live roster yet/i.test(t), (t.match(/.{0,60}No live roster.{0,60}/i) || [''])[0]);
      ck('  and calls that the correct answer, not a fault',
        /correct answer rather than an empty table/i.test(t));
    }
  } finally {
    fs.writeFileSync(artifactPath, realArtifact);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
