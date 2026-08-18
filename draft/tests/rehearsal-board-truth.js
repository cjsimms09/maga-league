/* BOARD TRUTH — does a number ON SCREEN match the ARTIFACT, and does its label
 * say what the number actually is?
 *
 * WHY THIS EXISTS SEPARATELY FROM mock3. The 19/19 dress rehearsal checks
 * MECHANISM — the clock advances, "add me" lands, the strip is visible. It
 * never compares a rendered FIGURE against public/draft_data.json, and neither
 * did anything else: proj_source_authority.test.js asserted a property of the
 * DATA and then only that projSourceMark EXISTS and is CALLED, never what it
 * returns. So an inverted condition in that function shipped, and every suite
 * stayed green (session E, 2026-08-18, register E6).
 *
 * WHAT IT PINS. Two rendered fields against the artifact, and the caveat's
 * MEANING: no row may render without a source mark, ¹ must mean "a second
 * source exists and is unused", ² must mean "no second source exists". Before
 * the fix this reported 127 unmarked rows, all 127 single-source.
 *
 * Findability is deliberately NOT tested here — layout is Cory's call and B
 * owns the redesign. This is truth only.
 *
 * Run:  node draft/tests/rehearsal-board-truth.js
 *   (self-contained; set WR_BASE to point at an already-running server instead)
 */
/* SELF-CONTAINED AS OF 2026-08-18, AND THAT IS THE FIX FOR THE FALSE GREEN.
 *
 * This file used to require a manually-started `rehearsal-serve.js` on port 8925
 * plus matching WR_USER/WR_PASS. That coupling is what produced the incident
 * recorded below: run it against a server whose credentials did not match and
 * login 401s, `/admin/warroom` bounces, the page renders NO rows, and the suite
 * reported FOUR OF SIX PASSING against a blank war room.
 *
 * The CONTROL checks added the same day stop it reporting green. They do not stop
 * it happening — it still went 2/8 today for exactly that reason, on a stale
 * server left over from another session, and a suite that fails for environmental
 * reasons is a suite people learn to skip.
 *
 * So it now boots its OWN server in-process on port 0 and seeds its own
 * commissioner, which is the pattern `rehearsal-keepers.js` already established
 * here. No setup, no port collision, no credential drift — and it can run in CI,
 * which the manual version never could. `WR_BASE` still overrides, so pointing it
 * at a real deployment is still one env var.
 */
const { launchChromium } = require('./rehearsal-browser');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

const R = [];
const check = (name, ok, detail) => R.push({ name, ok: !!ok, detail });

let srv = null;

(async () => {
  let BASE = process.env.WR_BASE;
  if (!BASE) {
    await data.ensureSeeded();
    const owners = await store.get('owners');
    const cory = owners.find(o => o.username === 'cory');
    cory.password_hash = hashPassword(process.env.WR_PASS || 'pw');
    cory.must_change_password = false;
    cory.is_commissioner = true;
    await store.set('owners', owners);
    srv = createApp().listen(0);
    await new Promise(r => srv.once('listening', r));
    BASE = `http://127.0.0.1:${srv.address().port}`;
  }
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || 'pw');
  await page.click('button[type=submit]');
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // The board table: read the rendered rows straight off the DOM.
  const rows = await page.$$eval('#board-body tr', trs => trs.map(tr => {
    const td = [...tr.querySelectorAll('td')].map(x => x.innerText.trim());
    return td.length >= 6 ? td : null;
  }).filter(Boolean));

  check('the board table renders rows at all', rows.length > 0, `${rows.length} rows`);

  const byName = {};
  for (const p of board.players) byName[p.name] = p;

  // Column order per app.js: rank, name, pos, team, bye, proj_mean, ...
  let checkedRank = 0, badRank = 0, checkedProj = 0, badProj = 0;
  const mismatches = [];
  for (const td of rows) {
    const rank = parseInt(td[0], 10);
    const name = td[1].split('\n')[0].trim();
    const p = byName[name];
    if (!p) continue;
    if (Number.isFinite(rank)) {
      checkedRank++;
      if (rank !== p.overall_rank) { badRank++; mismatches.push(`RANK ${name}: screen ${rank} vs artifact ${p.overall_rank}`); }
    }
    const projCell = parseInt(String(td[5]).replace(/[^0-9-]/g, ''), 10);
    if (Number.isFinite(projCell) && p.proj_mean != null) {
      checkedProj++;
      const want = Math.round(p.proj_mean);
      if (projCell !== want) { badProj++; mismatches.push(`PROJ ${name}: screen ${projCell} vs artifact ${want}`); }
    }
  }
  // ZERO IS NOT A PASS. Found 2026-08-18 (relay) by running this against a server
  // whose dev credentials did not exist: login 401'd, /admin/warroom bounced, the
  // page rendered NO rows — and this file reported **4 of 6 PASSING**. Three checks
  // were satisfied by an empty population: "0 checked, 0 wrong", "0 of 0 rows still
  // unmarked", "0 rows carry ², 0 of them wrongly".
  //
  // Only the rows-at-all check above caught it. Remove or reorder that one line and
  // this suite reports SIX OF SIX GREEN against a blank war room — the exact defect
  // class this project spent 08-18 finding elsewhere, sitting in the rehearsal that
  // guards the screen Cory drafts on.
  //
  // So every population-dependent check now requires its population. A comparison
  // with nothing to compare is a check that could not have failed.
  check('CONTROL: there is a population to compare at all',
    checkedRank > 0 && checkedProj > 0,
    `${checkedRank} ranks / ${checkedProj} projections available — zero means the page `
    + 'did not render (auth? board missing?) and every check below is vacuous');
  check('every rendered overall_rank matches the artifact',
    checkedRank > 0 && badRank === 0, `${checkedRank} checked, ${badRank} wrong`);
  check('every rendered projection matches the artifact (rounded)',
    checkedProj > 0 && badProj === 0, `${checkedProj} checked, ${badProj} wrong`);

  // The single-source caveat — E's sweep-4 finding, checked on the live screen.
  const marks = await page.$$eval('#board-body tr', trs => trs.map(tr => {
    const td = [...tr.querySelectorAll('td')].map(x => x.innerText.trim());
    return td.length >= 6 ? { name: td[1].split('\n')[0].trim(), proj: td[5] } : null;
  }).filter(Boolean));
  const withMean = marks.filter(m => byName[m.name] && byName[m.name].proj_mean != null);
  const unmarked = withMean.filter(m => !/[¹²]/.test(m.proj));
  check('CONTROL: there are marked rows to judge at all', withMean.length > 0,
    `${withMean.length} rows carry a proj_mean — zero makes all three E6 checks vacuous`);
  check('E6 FIX: NO row claims a second opinion it does not have (every row marked)',
    unmarked.length === 0, `${unmarked.length} of ${withMean.length} rows still unmarked`);
  const fpMark = withMean.filter(m => /¹/.test(m.proj));
  const fpMarkWrong = fpMark.filter(m => byName[m.name].proj_fantasypros == null).length;
  check('E6 FIX: the ¹ mark means "a second source EXISTS and is unused"',
    fpMarkWrong === 0 && fpMark.length > 0,
    `${fpMark.length} rows carry ¹, ${fpMarkWrong} of them wrongly (no FP)`);
  const noFpMark = withMean.filter(m => /²/.test(m.proj));
  const noFpWrong = noFpMark.filter(m => byName[m.name].proj_fantasypros != null).length;
  check('E6 FIX: the ² mark means "no second source exists"',
    noFpWrong === 0, `${noFpMark.length} rows carry ², ${noFpWrong} of them wrongly (FP present)`);

  /* ── THE SEAT AND THE PICK NUMBERS (added 2026-08-18) ────────────────────
   *
   * Register row 4c: "the war room is computing every pick number for the WRONG
   * SEAT, and it shipped to Cory as a demo — 3 keepers, he owns 12 picks in a
   * 15-round draft, the board gives him 15, the seat is set to someone with 0
   * keepers." It is false today. NOTHING GUARDED IT, which is why it could be
   * true once and why nobody could tell whether it still was without opening a
   * browser by hand.
   *
   * The trap this catches is specific: `pick_order` carries BOTH `my_picks` (12,
   * after keepers) and `my_picks_before_keepers` (15). Rendering the wrong one
   * looks entirely plausible on screen — fifteen picks in a fifteen-round draft —
   * and every timing call, survival % and wait-cost on the page is computed from
   * it. At 8 seconds a pick that is not a number Cory can sanity-check.
   */
  const po = board.pick_order || {};
  const mine = Array.isArray(po.my_picks) ? po.my_picks.map(x => (x && x.overall) || x) : [];
  const preKeeper = Array.isArray(po.my_picks_before_keepers)
    ? po.my_picks_before_keepers.map(x => (x && x.overall) || x) : [];
  const consumed = preKeeper.filter(n => !mine.includes(n));
  const bodyText = await page.evaluate(() => document.body.innerText);

  check('CONTROL: keepers actually remove picks, or the two checks below are vacuous',
    mine.length > 0 && consumed.length > 0,
    `${mine.length} picks after keepers, ${consumed.length} consumed by them`);

  const upMatch = /YOU ARE UP[^0-9]*([0-9]+)/i.exec(bodyText);
  check('the page\'s current pick is the first pick Cory actually OWNS',
    upMatch != null && mine.length > 0 && Number(upMatch[1]) === mine[0],
    upMatch ? `page says pick ${upMatch[1]}, my_picks[0] is ${mine[0]}` : 'no "YOU ARE UP" line found');

  const ghosts = consumed.filter(n => new RegExp(`(pick|overall)\\s*#?${n}\\b`, 'i').test(bodyText));
  check('NO keeper-consumed pick is presented as one of his',
    ghosts.length === 0,
    ghosts.length ? `shown as his: ${ghosts.join(', ')}` : `none of ${consumed.join(', ')} shown as his`);

  console.log('\nBOARD TRUTH — rendered numbers and labels vs public/draft_data.json');
  console.log('='.repeat(72));
  for (const r of R) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  if (mismatches.length) { console.log('\nfirst mismatches:'); mismatches.slice(0, 10).forEach(m => console.log('   ' + m)); }
  console.log('='.repeat(72));
  console.log(`${R.filter(r => r.ok).length}/${R.length} truth checks passed`);
  await b.close();
  if (srv) srv.close();
  process.exit(R.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
