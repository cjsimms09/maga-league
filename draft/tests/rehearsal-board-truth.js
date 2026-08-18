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
 * Run:
 *   node draft/tests/rehearsal-serve.js &
 *   WR_USER=cory WR_PASS=pw node draft/tests/rehearsal-board-truth.js
 */
const { launchChromium } = require('./rehearsal-browser');
const fs = require('fs');
const BASE = process.env.WR_BASE || 'http://localhost:8925';
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

const R = [];
const check = (name, ok, detail) => R.push({ name, ok: !!ok, detail });

(async () => {
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
  check('every rendered overall_rank matches the artifact', badRank === 0, `${checkedRank} checked, ${badRank} wrong`);
  check('every rendered projection matches the artifact (rounded)', badProj === 0, `${checkedProj} checked, ${badProj} wrong`);

  // The single-source caveat — E's sweep-4 finding, checked on the live screen.
  const marks = await page.$$eval('#board-body tr', trs => trs.map(tr => {
    const td = [...tr.querySelectorAll('td')].map(x => x.innerText.trim());
    return td.length >= 6 ? { name: td[1].split('\n')[0].trim(), proj: td[5] } : null;
  }).filter(Boolean));
  const withMean = marks.filter(m => byName[m.name] && byName[m.name].proj_mean != null);
  const unmarked = withMean.filter(m => !/[¹²]/.test(m.proj));
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

  console.log('\nBOARD TRUTH — rendered numbers and labels vs public/draft_data.json');
  console.log('='.repeat(72));
  for (const r of R) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  if (mismatches.length) { console.log('\nfirst mismatches:'); mismatches.slice(0, 10).forEach(m => console.log('   ' + m)); }
  console.log('='.repeat(72));
  console.log(`${R.filter(r => r.ok).length}/${R.length} truth checks passed`);
  await b.close();
  process.exit(R.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
