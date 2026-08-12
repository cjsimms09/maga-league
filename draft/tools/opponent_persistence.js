// TERRITORY: A
/* DO OWNER TENDENCIES PERSIST ACROSS SEASONS? — the out-of-sample test.
 *
 * ── THE QUESTION THIS ANSWERS BEFORE THE 22nd ──────────────────────────────
 *
 * The room layer's 1.4% was either the CEILING (tendencies do not persist, so
 * the negative was evidential) or an ARTEFACT of our architecture (they do, and
 * we failed to use them). Nothing has distinguished those, and the winter is
 * being planned as though the second is true. C named cross-season persistence
 * as the absent class it most regretted.
 *
 * The live shadow arm answers it with ONE draft on 22 August. **This answers it
 * with two, today, from the 480 real picks already on disk** — and one draft is
 * one cluster, so two is not a luxury.
 *
 * ── THE CIRCULARITY THIS EXISTS TO AVOID (rule 10d) ────────────────────────
 *
 * `manager_profiles.json` was BUILT FROM these same drafts. Predicting them with
 * it would be fitting to training data and would report a number far above
 * anything real — the exact shape of defect this project keeps finding.
 *
 * **So the profiles are rebuilt here, per target season, from the seasons BEFORE
 * it only.** 2024 is predicted from 2023; 2025 from 2023+2024. The shipped
 * artifact is never consulted.
 *
 * ── AND THE BASELINE HAD TO BE REBUILT FOR THE SAME REASON ─────────────────
 *
 * The live experiment's baseline is ADP. **A contemporaneous 2024/2025 ADP does
 * not exist in this repository** — scoring an old draft against the 2026 ADP
 * would measure two years of career trajectory and report it as market
 * knowledge. So the baseline is a MARKET PROXY built the same way as the profile
 * arm: a player's average draft position across the PRIOR seasons only.
 *
 * Both arms therefore see exactly the same information cut-off. That symmetry is
 * the whole design — an asymmetric cut-off would let either arm win for a reason
 * that has nothing to do with tendencies.
 *
 * ── WHAT IT CANNOT SAY ─────────────────────────────────────────────────────
 *
 * Two target seasons is TWO CLUSTERS. This produces a direction and a magnitude,
 * not an interval. And a player the prior seasons never saw is invisible to both
 * arms — rookies are unpredictable here by construction, which biases both arms
 * down equally and neither relatively.
 *
 * Run: node draft/tools/opponent_persistence.js
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OP = require(path.join(ROOT, 'public', 'js', 'draft', 'opponent_predict.js'));
const HIST = require(path.join(ROOT, 'draft', 'data', 'league_history.json'));
const BOARD = require(path.join(ROOT, 'public', 'draft_data.json'));

const POS = {};
BOARD.players.forEach(p => { if (p.player_id != null) POS[String(p.player_id)] = p.position; });

const ROUND_BUCKET = r => (r <= 3 ? 'early' : (r <= 9 ? 'mid' : 'late'));

function draftsBySeason() {
  const out = {};
  (HIST.seasons || []).forEach(s => {
    (s.drafts || []).forEach(d => {
      const picks = (d.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
      if (picks.length > 100) out[String(s.season)] = picks;
    });
  });
  return out;
}

/* Build a profile in the SAME SHAPE `OpponentPredict.profilePrediction` consumes,
 * from a set of prior seasons. Not a second profile format — the live arm and
 * this one must read the same structure or the test is of a different object. */
function buildProfiles(seasons, all) {
  const byOwner = {};
  seasons.forEach(y => {
    (all[y] || []).forEach(pk => {
      /* KEEPERS ARE EXCLUDED. A keeper is not a draft DECISION — it is a slot
       * pre-assigned before the room sat down, and counting it as a tendency
       * would score the league's keeper rules as if they were the owner's
       * behaviour. */
      if (pk.is_keeper) return;
      const pos = POS[String(pk.player_id)];
      if (!pos) return;
      const o = String(pk.roster_id);
      const b = ROUND_BUCKET(Number(pk.round));
      byOwner[o] = byOwner[o] || {};
      byOwner[o][b] = byOwner[o][b] || {};
      byOwner[o][b][pos] = (byOwner[o][b][pos] || 0) + 1;
    });
  });
  const out = {};
  Object.keys(byOwner).forEach(o => {
    const buckets = {};
    Object.keys(byOwner[o]).forEach(b => {
      const counts = byOwner[o][b];
      const tot = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
      const mix = {};
      Object.keys(counts).forEach(k => { mix[k] = counts[k] / tot; });
      buckets[b] = { mix: mix };
    });
    out[o] = { draft_patterns: { by_round_bucket: buckets } };
  });
  return out;
}

/* THE MARKET PROXY — a player's average draft position across PRIOR seasons
 * only. Stands in for the contemporaneous ADP this repo does not hold, on the
 * same information cut-off as the profile arm. */
function buildMarket(seasons, all) {
  const acc = {};
  seasons.forEach(y => {
    (all[y] || []).forEach(pk => {
      if (pk.is_keeper) return;
      const id = String(pk.player_id);
      acc[id] = acc[id] || { n: 0, sum: 0 };
      acc[id].n++; acc[id].sum += Number(pk.pick_no);
    });
  });
  const adp = {};
  Object.keys(acc).forEach(id => { adp[id] = acc[id].sum / acc[id].n; });
  return adp;
}

function replay(target, priors, all) {
  const profiles = buildProfiles(priors, all);
  const market = buildMarket(priors, all);
  const picks = all[target] || [];
  const taken = new Set();
  // The board is every player the PRIOR seasons saw — the only players either
  // arm could name. Anyone else is invisible to both, equally.
  const pool = Object.keys(market).map(id => ({
    player_id: id, position: POS[id] || null,
    adjusted_adp: market[id],
  })).filter(p => p.position);

  const resolutions = [];
  for (const pk of picks) {
    if (pk.is_keeper) { taken.add(String(pk.player_id)); continue; }
    const board = pool.filter(p => !taken.has(p.player_id));
    if (board.length) {
      const f = OP.predictPick({
        season: target, pick_no: pk.pick_no, round: Number(pk.round),
        owner: String(pk.roster_id), board: board,
        profile: profiles[String(pk.roster_id)] || null,
      });
      const r = OP.resolvePick(f, String(pk.player_id));
      if (r) resolutions.push(r);
    }
    taken.add(String(pk.player_id));
  }
  return OP.summarize(resolutions);
}

// ─────────────────────────────────────────────────────────────────── report
const all = draftsBySeason();
const years = Object.keys(all).sort();

console.log('='.repeat(78));
console.log('DO OWNER TENDENCIES PERSIST? — out-of-sample, prior seasons only');
console.log('='.repeat(78));
console.log('Profiles AND the market proxy are rebuilt from seasons BEFORE the target.');
console.log('The shipped manager_profiles.json is never consulted: it was built from');
console.log('these same drafts, so using it would be fitting to training data.');
console.log('');

const rows = [];
years.forEach((y, i) => {
  const priors = years.slice(0, i);
  if (!priors.length) { console.log(`  ${y}: no prior season — skipped, correctly`); return; }
  const s = replay(y, priors, all);
  rows.push({ y, priors, s });
  const pct = v => (v == null ? '  —  ' : (v * 100).toFixed(1).padStart(5) + '%');
  console.log(`  ${y} from [${priors.join(',')}]  n=${String(s.n_compared).padStart(3)}`
    + `   profile ${pct(s.profile_accuracy)}   market ${pct(s.adp_accuracy)}`
    + `   DIFF ${s.profile_minus_adp == null ? '—' : ((s.profile_minus_adp >= 0 ? '+' : '')
        + (s.profile_minus_adp * 100).toFixed(1) + 'pp')}`
    + `   excluded ${s.n_excluded_no_profile}`);
});
console.log('');

if (rows.length) {
  const diffs = rows.map(r => r.s.profile_minus_adp).filter(v => v != null);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  console.log(`  ACROSS ${diffs.length} TARGET SEASON(S): mean difference `
    + `${(mean >= 0 ? '+' : '') + (mean * 100).toFixed(1)}pp`);
  console.log('');
  if (mean > 0.02) {
    console.log('  READING: the profile arm beats the market proxy out of sample.');
    console.log('  That is evidence TENDENCIES PERSIST, and the room layer is worth solving.');
  } else if (mean < -0.02) {
    console.log('  READING: the profile arm LOSES to the market proxy out of sample.');
    console.log('  Tendencies as we model them are worse than the market at naming the pick.');
  } else {
    console.log('  READING: a TIE, and a tie DOES NOT distinguish the two worlds. It is');
    console.log('  equally consistent with tendencies not persisting AND with our profiles');
    console.log('  failing to capture tendencies that are there. Only a WIN resolves cleanly.');
  }
}
console.log('');
console.log('  ⚠️ TWO TARGET SEASONS IS TWO CLUSTERS. This is a direction and a magnitude,');
console.log('  never an interval. And a player the prior seasons never saw is invisible to');
console.log('  BOTH arms — rookies are unpredictable here by construction, which biases the');
console.log('  arms down equally and neither relatively.');
