'use strict';
// TERRITORY: A
// realDraftFor() — the fix for the 40-vs-30-team-season bug found 2026-08-15
// while re-verifying PARKED.md's ONESIE_ENDGAME_PICKS evidence. A naive
// "every draft in this season" pass over league_history.json's 2023 entry
// picks up a second, 30-pick draft (draft_id 990840142107619329) alongside
// the real 150-pick one — almost certainly an abandoned/restarted attempt
// still sitting in Sleeper's history — inflating every team-season count by
// a third for that year. This test pins the filter that fixes it.
//
// Run: node draft/tests/onesie_history_check.test.js
const path = require('path');
const { realDraftFor, analyze } = require(path.join(__dirname, '..', 'tools', 'onesie_history_check.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// ── realDraftFor: the real bug, reproduced on a synthetic fixture ──────────
{
  const season = {
    season: '2023',
    drafts: [
      { settings: { rounds: 15, teams: 10 }, picks: Array(30).fill({ player_id: 'x' }) },   // abandoned attempt
      { settings: { rounds: 15, teams: 10 }, picks: Array(150).fill({ player_id: 'x' }) },  // the real draft
    ],
  };
  const real = realDraftFor(season);
  ck('picks the 150-pick draft, not the 30-pick abandoned one', real.picks.length === 150, real.picks.length);
}
{
  const season = {
    season: '2024',
    drafts: [{ settings: { rounds: 15, teams: 10 }, picks: Array(150).fill({ player_id: 'x' }) }],
  };
  ck('a season with exactly one matching draft just uses it', realDraftFor(season).picks.length === 150);
}
{
  const season = { season: '2025', drafts: [] };
  let threw = false;
  try { realDraftFor(season); } catch (e) { threw = /expected exactly 1/.test(e.message); }
  ck('a season with ZERO matching drafts refuses rather than returning undefined', threw);
}
{
  const season = {
    season: '2026',
    drafts: [
      { settings: { rounds: 15, teams: 10 }, picks: Array(150).fill({ player_id: 'x' }) },
      { settings: { rounds: 15, teams: 10 }, picks: Array(150).fill({ player_id: 'x' }) },
    ],
  };
  let threw = false;
  try { realDraftFor(season); } catch (e) { threw = /expected exactly 1/.test(e.message); }
  ck('TWO equally-real-looking drafts also refuses rather than silently picking one', threw);
}

// ── analyze(): against the REAL data, pinning the exact reproducible
// numbers so a future edit to league_history.json (or the position fixture)
// is caught if it moves them. ────────────────────────────────────────────
{
  const r = analyze();
  ck('exactly 30 team-seasons once the abandoned draft is filtered out',
    r.teamSeasons === 30, r.teamSeasons);
  ck('QB=2 count matches what PARKED.md independently claims (17/30)',
    r.qbCounts['2'] === 17, r.qbCounts);
  ck('the 2nd-TE timing distribution matches PARKED.md exactly (50/58/83/100% at <=2/3/4/5)',
    r.te2RemainingDist[2].count === 6 && r.te2RemainingDist[3].count === 7
      && r.te2RemainingDist[4].count === 10 && r.te2RemainingDist[5].count === 12,
    r.te2RemainingDist);
  ck('coverage is in the 86-97% range PARKED.md itself flagged as "good enough for a distribution"',
    r.coverage.pct >= 86 && r.coverage.pct <= 97, r.coverage);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
