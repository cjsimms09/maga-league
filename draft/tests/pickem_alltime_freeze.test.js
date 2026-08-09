'use strict';
// PICK'EM ALL-TIME FREEZE — the worst rollover orphan the reset audit found: the
// "never resets" all-time board silently dropped every COMPLETED season, because
// scoring a past week needs that week's final points and a new Sleeper league id
// can't refetch a prior season — the resolver returned null and prior years
// scored zero. The fix freezes a finalized week's points under
// pickem-points:<season>:<week> and the all-time resolver reads frozen points for
// EVERY season. This asserts: with frozen points a prior season scores; the old
// current-season-only resolver zeroes it (the bug it replaces).
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pkfz-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const { getDoc } = require(path.join(ROOT, 'src', 'data'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

(async () => {
  const owners = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  // A completed PRIOR season (2025), rolled past — current season is 2026.
  await store.set('pickem-slate:2025:1', { season: 2025, week: 1, locked: true,
    games: [{ id: 'g1', a: { id: 1, name: 'A' }, b: { id: 2, name: 'B' } }] });
  await store.set('pickem:2025:1:1', { season: 2025, week: 1, owner_id: 1, picks: { g1: 1 } }); // A picked A
  // frozen final points: A 100 > B 90 → A wins → A's pick was correct.
  await store.set('pickem-points:2025:1', { 1: 100, 2: 90 });

  // THE FIX's resolver: read frozen points for ANY season, fall back to live only
  // for the current season (2026) — exactly what member.js pickemContext now does.
  const frozenResolver = async (s, w) => {
    const f = await getDoc(`pickem-points:${s}:${w}`, null);
    if (f && Object.keys(f).length) return f;
    return s === 2026 ? null /* would be a live fetch */ : null;
  };
  const fixed = await PE.allTimeBoard([2025], owners, frozenResolver, 18);
  const aFixed = fixed.board.find(r => r.owner_id === 1);
  ck('fixed: prior season (2025) is scored, not dropped', fixed.seasons.includes(2025), fixed.seasons);
  ck('fixed: A graded 1 pick and got it right', aFixed && aFixed.graded === 1 && aFixed.correct === 1, aFixed);

  // THE OLD resolver: only the current season resolves; a prior season returns
  // null → skipped → zeroed. This documents the bug the freeze fix removes.
  const oldResolver = async (s, w) => (s === 2026 ? {} : null);
  const broken = await PE.allTimeBoard([2025], owners, oldResolver, 18);
  ck('old: prior season silently dropped (zero graded)', !broken.seasons.includes(2025), broken.seasons);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
