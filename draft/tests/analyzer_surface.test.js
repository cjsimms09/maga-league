'use strict';
// THE ANALYZER SURFACE (C3, 4th tool) — B's view over A's standings engine.
// Asserts: it renders A's projection (never a second one), states the measured
// caveat honestly, carries the raw sanity-check number alongside the modelled
// odds, exposes the postures the other tools consume, and is commissioner-only.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'azt-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const member = owners.find(o => o.username !== 'cory' && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  member.password_hash = hashPassword('pw'); member.must_change_password = false; member.is_commissioner = false;
  await store.set('owners', owners);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));

  const cc = await login('cory');
  const res = await fetch(b + '/analyzer', { headers: { Cookie: cc } });
  const html = await res.text();
  ck('renders 200 for the commissioner', res.status === 200);
  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));

  // A row per team, with the playoff line drawn at the cut.
  const probs = [...html.matchAll(/az-prob">(\d+)%/g)].map(m => Number(m[1]));
  ck('renders a projection row per team', probs.length >= 8, probs.length);
  ck('draws the playoff line', /playoff line/i.test(html));

  // THE DEGENERATE-DEFAULT GUARD. Defaulting to the final week leaves the
  // simulator nothing to simulate: every probability collapses to 100/0 and the
  // table looks confident while saying nothing. Found by driving the page.
  ck('the default week is NOT degenerate (probabilities are not all 0/100)',
    !probs.every(p => p === 0 || p === 100), probs.join(','));

  // The honest caveat, stated ON the page (A's validation: ~78% vs ~75% naive).
  ck('states the measured edge vs the naive baseline', /\d+%[\s\S]{0,80}?\d+%/.test(html) && /reading the current standings/i.test(html));
  ck('warns not to read the top four as sharp', /don.t read the top four as sharp/i.test(html));
  ck('says the value is the calibrated probabilities', /calibrated probabilit/i.test(html));

  // C3: the raw, unmodelled number alongside the modelled odds, labelled honestly.
  ck('carries the raw sanity-check number, labelled not-our-valuation',
    /realized weekly average/i.test(html) && /not our valuation/i.test(html));

  // The postures the other tools consume.
  const postures = [...html.matchAll(/az-posture (\w+)"/g)].map(m => m[1]);
  ck('exposes the posture vocabulary', ['lock', 'contender', 'desperate', 'chasing_high'].every(p => postures.includes(p)),
    [...new Set(postures)].join(','));
  ck('explains what each posture means in plain words', /will overpay to swing it/i.test(html) && /only live money/i.test(html));

  // ── ARITHMETIC INVARIANTS on the engine the page renders ────────────────────
  // Probabilities that should sum to something, checked rather than assumed.
  // Exactly PLAYOFF_SPOTS teams make it in EVERY simulation, so the playoff
  // probabilities must sum to exactly that; every game has exactly one winner, so
  // expected wins must sum to teams x weeks / 2; and a team's seed distribution
  // must sum to its own playoff probability. These are the checks that catch a
  // silent engine regression the rendering tests would happily pass.
  {
    const LO = require(path.join(ROOT, 'src', 'routes', 'lineup'));
    const ST = require(path.join(ROOT, 'src', 'routes', 'standings'));
    const hist = LO.harvest();
    const yr = LO.defaultSeasons(hist).slice(-1)[0];
    const sObj = LO.seasonOf(hist, yr);
    if (sObj) {
      const proj = ST.projectStandings(sObj, { throughWeek: 9, sims: 2000, seed: 4242 }).projections;
      /* BOTH OF THESE ARE EXACT IDENTITIES, AND BOTH CARRIED BANDS SIZED FOR NOISE
       * THEY DO NOT HAVE. Rule 10b, applied 2026-08-11 in the bounded look the
       * rule asks for.
       *
       * Neither is a statistical estimate despite arriving out of a Monte Carlo.
       * In EVERY simulation exactly one team wins each game, so the across-team
       * sum of wins is `games` in every single draw and therefore in the mean —
       * the sim count cannot move it. Same for playoff probability: every draw
       * seats exactly PLAYOFF_SPOTS teams.
       *
       * MEASURED rather than assumed: across 2023/2024/2025 at (seed, sims) of
       * (4242, 2000), (7, 500), (99, 3000) and (1234, 100), the largest deviation
       * of either quantity was 1.42e-14 — pure float accumulation.
       *
       * So 0.51 was ~3.6e13 times the actual noise, and 0.01 ~7e11 times. A band
       * that wide is not a tolerance, it is a window that would accept a whole
       * missing game (or, on the playoff line, a team seated in 1% of universes
       * for no reason). 1e-9 sits far above the measured 1.42e-14 and far below
       * anything that could be a real defect.
       *
       * The 0.51 is the tell worth remembering: a band written as 0.5 and then
       * nudged up by one hundredth is a band chosen to make the test pass. It
       * turned out nothing needed the nudge. */
      const sumP = proj.reduce((a, r) => a + r.playoff_prob, 0);
      ck(`Σ playoff probability == playoff spots (${ST.PLAYOFF_SPOTS}) — EXACT`,
        Math.abs(sumP - ST.PLAYOFF_SPOTS) < 1e-9, sumP.toFixed(12));

      const weeks = LO.regularSeasonWeeks(sObj).length;
      const expectedWins = (proj.length * weeks) / 2;   // one winner per game
      const sumW = proj.reduce((a, r) => a + r.exp_wins, 0);
      ck(`Σ expected wins == games played (${expectedWins}) — EXACT`,
        Math.abs(sumW - expectedWins) < 1e-9, sumW.toFixed(12));

      const seedErr = Math.max(...proj.map(r =>
        Math.abs(Object.values(r.seed_dist || {}).reduce((a, b) => a + b, 0) - r.playoff_prob)));
      ck('each team\'s seed distribution sums to its own playoff probability',
        seedErr < 0.001, seedErr.toFixed(4));

      ck('every probability is a real number in [0,1]',
        proj.every(r => r.playoff_prob >= 0 && r.playoff_prob <= 1 && isFinite(r.playoff_prob)));
    }
  }

  // ACCESS RULE: in-season recommendation surfaces are commissioner-only.
  const mc = await login(member.username);
  const mres = await fetch(b + '/analyzer', { headers: { Cookie: mc }, redirect: 'manual' });
  ck('a plain member cannot reach it (tools are commissioner-only)', mres.status === 403 || mres.status === 302);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
