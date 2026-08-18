#!/usr/bin/env node
'use strict';
/* ONESIE HISTORY CHECK — how often this league's real drafters take a 2nd
 * QB/TE, and when, from the three complete real drafts in league_history.json.
 *
 * Built 2026-08-15 during a full re-audit Cory asked for. PARKED.md's "TE:0/
 * QB:0 was premature" entry cites these exact numbers (30 team-seasons,
 * QB=2: 17/30 (57%), TE=2: 14/30 (47%), timing distributions) as the evidence
 * for the ONESIE_ENDGAME_PICKS widening recommendation — but no saved script
 * produces them; they were a one-off calculation, not reproducible. This is
 * that script, built to actually check.
 *
 * RE-DERIVED, NOT ASSUMED CORRECT EITHER. A first pass at this without
 * filtering for the REAL draft per season got 40 team-seasons instead of 30 —
 * league_history.json has a SECOND, 30-pick "2023" draft entry
 * (draft_id 990840142107619329) alongside the real 150-pick one
 * (1001232801791856640) — almost certainly an abandoned/restarted draft
 * attempt still sitting in Sleeper's history, not a played season. Filtering
 * to exactly one 150-pick (rounds*teams) draft per season is what gets this
 * script's team-season count to match PARKED.md's stated 30 at all.
 *
 * RESULT AS OF 2026-08-15: matches PARKED.md closely but not exactly —
 * QB=2 count (17/30) and the TE2 timing distribution (50/58/83/100% at
 * <=2/3/4/5 picks remaining) match precisely. TE=2 count does NOT: this
 * script gets 12/30 (40%), not the claimed 14/30 (47%). QB's breakdown
 * across QB=1/2/3 also differs slightly (this script finds no QB=3 team-
 * seasons at all). The qualitative conclusion — a 2nd TE is common, not
 * rare, and duplicate picks cluster hard in the last few slots — holds
 * either way; the specific TE2 percentage does not reproduce as claimed.
 * Reported, not silently corrected, since the original methodology that
 * produced 47% cannot be reconstructed to say which is right.
 *
 * Run: node draft/tools/onesie_history_check.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

function positionIndex() {
  const idx = {};
  try {
    const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'fixtures', 'players.json'), 'utf8'));
    for (const p of fx) {
      const pid = String(p.player_id || p.id);
      if (pid && p.position) idx[pid] = p.position;
    }
  } catch (e) { /* fixture optional */ }
  try {
    const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
    for (const p of board.players || []) {
      const pid = String(p.player_id);
      if (pid && p.position && !idx[pid]) idx[pid] = p.position;
    }
  } catch (e) { /* board optional */ }
  return idx;
}

/* The ONE real, completed draft for a season — the one whose pick count
 * matches rounds * teams from its own settings, not just "status: complete"
 * (a partial/abandoned draft can carry that status too). Throws if a season
 * doesn't resolve to exactly one, rather than silently picking the first —
 * this is exactly the ambiguity that produced the 40-vs-30 discrepancy. */
function realDraftFor(season) {
  const drafts = season.drafts || [];
  const candidates = drafts.filter(d => {
    const want = (d.settings && d.settings.rounds && d.settings.teams)
      ? d.settings.rounds * d.settings.teams : null;
    return want != null && (d.picks || []).length === want;
  });
  if (candidates.length !== 1) {
    throw new Error(`season ${season.season}: expected exactly 1 real draft, found ${candidates.length} `
      + `(${drafts.map(d => (d.picks || []).length).join(', ')} picks)`);
  }
  return candidates[0];
}

function analyze() {
  const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  const posOf = positionIndex();
  const seasons = (hist.seasons || []).filter(s => ['2023', '2024', '2025'].includes(s.season));

  const qbCounts = {}, teCounts = {};
  const qb2Remaining = [], te2Remaining = [];
  let teamSeasons = 0, matched = 0, total = 0;

  for (const s of seasons) {
    const draft = realDraftFor(s);
    const picks = [...(draft.picks || [])].sort((a, b) =>
      (a.pick_no || a.overall || 0) - (b.pick_no || b.overall || 0));
    const byRoster = {};
    for (const pk of picks) {
      const rid = pk.roster_id != null ? pk.roster_id : (pk.picked_by != null ? pk.picked_by : pk.owner_id);
      (byRoster[rid] = byRoster[rid] || []).push(pk);
    }
    for (const rid of Object.keys(byRoster)) {
      const pks = byRoster[rid];
      teamSeasons++;
      let qb = 0, te = 0;
      pks.forEach((pk, i) => {
        total++;
        const pos = posOf[String(pk.player_id)];
        if (pos) matched++;
        const remaining = pks.length - 1 - i;
        if (pos === 'QB') { qb++; if (qb === 2) qb2Remaining.push(remaining); }
        if (pos === 'TE') { te++; if (te === 2) te2Remaining.push(remaining); }
      });
      qbCounts[qb] = (qbCounts[qb] || 0) + 1;
      teCounts[te] = (teCounts[te] || 0) + 1;
    }
  }

  const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
  const distribution = (arr, upto) => {
    const out = {};
    for (const n of upto) out[n] = { count: arr.filter(x => x <= n).length, of: arr.length };
    return out;
  };

  return {
    seasons: seasons.map(s => s.season),
    teamSeasons,
    coverage: { matched, total, pct: pct(matched, total) },
    qbCounts, teCounts,
    qb2AtLeast: (qbCounts[2] || 0) + (qbCounts[3] || 0),
    te2AtLeast: teCounts[2] || 0,
    qb2RemainingDist: distribution(qb2Remaining, [2, 3, 4, 5]),
    te2RemainingDist: distribution(te2Remaining, [2, 3, 4, 5]),
  };
}

if (require.main === module) {
  const r = analyze();
  console.log(`ONESIE HISTORY CHECK — ${r.seasons.join(', ')} (${r.teamSeasons} team-seasons)`);
  console.log(`  position coverage: ${r.coverage.matched}/${r.coverage.total} (${r.coverage.pct}%)`);
  console.log(`  QB counts: ${JSON.stringify(r.qbCounts)}  (>=2 QB: ${r.qb2AtLeast}/${r.teamSeasons} = ${pctStr(r.qb2AtLeast, r.teamSeasons)})`);
  console.log(`  TE counts: ${JSON.stringify(r.teCounts)}  (>=2 TE: ${r.te2AtLeast}/${r.teamSeasons} = ${pctStr(r.te2AtLeast, r.teamSeasons)})`);
  console.log(`  2nd-QB picks-remaining: ${JSON.stringify(r.qb2RemainingDist)}`);
  console.log(`  2nd-TE picks-remaining: ${JSON.stringify(r.te2RemainingDist)}`);
}
function pctStr(n, d) { return d ? Math.round(1000 * n / d) / 10 + '%' : '0%'; }

module.exports = { analyze, positionIndex, realDraftFor };
