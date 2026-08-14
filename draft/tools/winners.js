// TERRITORY: A
/* WHAT ACTUALLY WORKED IN THIS LEAGUE — draft shape against finish.
 *
 * Cory: "Is it worth reviewing last 3 league winners and teams that won most
 * money and look for clues in what worked in this league? Trends? ... Did they
 * have WR or RB in flex most often, did they draft QB or TE early, did they
 * draft WR vs RB early."
 *
 * Yes — and the way it is asked is the trap. THREE WINNERS IS NOT A SAMPLE. Any
 * six variables measured on three teams will produce a pattern, and it will be
 * noise. This tool exists to answer the question without that.
 *
 * ── THREE THINGS MAKE IT USABLE ───────────────────────────────────────────
 *
 * 1. ALL 30 TEAM-SEASONS, NOT THE 3 WINNERS. Finish is a rank, so every team
 *    carries information — the teams that came 8th tell you as much as the ones
 *    that won.
 *
 * 2. THE WITHIN-MANAGER DESIGN, WHICH IS THE WHOLE POINT. The same ten managers
 *    recur every season, so 30 rows are not 30 independent observations — they
 *    are ~10 managers observed 3 times. If one good manager happens to like
 *    early quarterbacks, he manufactures the entire correlation by himself.
 *    So the headline number compares each manager to HIS OWN average: in the
 *    seasons he drafted a position earlier than he usually does, did he finish
 *    better than he usually does? That removes "who is good at fantasy"
 *    completely, and it is the only comparison here that survives the objection.
 *
 * 3. THE MULTIPLE-COMPARISON COUNT IS PRINTED. Testing k metrics on a sample
 *    this size will produce roughly k/6 spurious "findings" at the sizes people
 *    normally call interesting. The tool says how many it tested so a reader can
 *    discount accordingly, rather than being shown only the one that worked.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It does not rank strategies, recommend a draft plan, or feed any live
 * surface. It reports effects with their n and their direction and stops. With
 * 10 managers and 3 seasons the honest output is "worth testing", never "do
 * this" — and a tool that phrased it as advice would be read as advice.
 *
 * Run: node draft/tools/winners.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const PM = require(path.join(ROOT, 'draft', 'tools', 'position_map.js'));
const POS = PM.positionMap();

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/* ONE ROW PER TEAM-SEASON: the draft that team made, and where it finished.
 * Seasons with no completed record are excluded rather than counted as zeros —
 * the 2026 standings exist and are all 0-0. */
function rows() {
  const out = [];
  (H.seasons || []).forEach(s => {
    const standings = (s.standings || []).filter(r => (r.wins || 0) + (r.losses || 0) > 0);
    const draft = (s.drafts || []).find(d => (d.picks || []).length >= 150);
    if (!standings.length || !draft) return;
    const byRoster = {};
    draft.picks.forEach(p => {
      if (p.roster_id == null) return;
      (byRoster[p.roster_id] = byRoster[p.roster_id] || []).push(p);
    });
    standings.forEach(r => {
      const pk = (byRoster[r.roster_id] || []).slice()
        .sort((a, b) => (a.pick_no || 0) - (b.pick_no || 0));
      if (pk.length < 10) return;
      const posOf = z => PM.posOf(POS, z.player_id);
      const firstAt = want => {
        const hit = pk.find(z => posOf(z) === want);
        return hit ? hit.pick_no : null;      // null, never a sentinel that averages
      };
      const countIn = (want, n) => pk.slice(0, n).filter(z => posOf(z) === want).length;
      out.push({
        season: s.season, owner: String(r.owner_id), rank: r.rank,
        points_for: r.points_for,
        qb_first: firstAt('QB'), te_first: firstAt('TE'),
        rb_first6: countIn('RB', 6), wr_first6: countIn('WR', 6),
        rb_total: pk.filter(z => posOf(z) === 'RB').length,
        wr_total: pk.filter(z => posOf(z) === 'WR').length,
      });
    });
  });
  return out;
}

/* THE HEADLINE TEST. For each manager, centre both the metric and the finish on
 * HIS OWN average across seasons, then ask whether the deviations move together.
 * A manager seen once contributes nothing and is dropped — he has no "own
 * average" to deviate from, and including him would smuggle between-manager
 * variation back in through the door this design exists to close. */
function withinManager(data, key) {
  const byOwner = {};
  data.forEach(r => { if (r[key] != null) (byOwner[r.owner] = byOwner[r.owner] || []).push(r); });
  const early = [], late = [];
  let managers = 0;
  Object.values(byOwner).forEach(v => {
    if (v.length < 2) return;
    managers++;
    const mk = mean(v.map(r => r[key])), mr = mean(v.map(r => r.rank));
    v.forEach(r => {
      const d = r[key] - mk, dr = r.rank - mr;
      if (d < 0) early.push(dr); else if (d > 0) late.push(dr);
    });
  });
  return { early: mean(early), late: mean(late), nEarly: early.length,
    nLate: late.length, managers: managers,
    spread: (mean(late) - mean(early)) };
}

const METRICS = [
  ['qb_first', 'first QB taken', 'earlier'],
  ['te_first', 'first TE taken', 'earlier'],
  ['rb_first6', 'RB among first 6 picks', 'more'],
  ['wr_first6', 'WR among first 6 picks', 'more'],
  ['rb_total', 'total RB drafted', 'more'],
  ['wr_total', 'total WR drafted', 'more'],
];

const DATA = rows();

if (require.main === module) {
  console.log('WHAT WORKED IN THIS LEAGUE — draft shape against finish\n');
  const seasons = [...new Set(DATA.map(r => r.season))];
  const owners = [...new Set(DATA.map(r => r.owner))];
  console.log('  ' + DATA.length + ' team-seasons · ' + seasons.length + ' completed seasons ('
    + seasons.join(', ') + ') · ' + owners.length + ' managers');
  console.log('  RANK IS THE OUTCOME. Lower is better, so a NEGATIVE effect below means');
  console.log('  the team finished HIGHER.\n');

  console.log('  1. THE NAIVE CUT — top 3 vs bottom 3, which is what "look at the winners"');
  console.log('     asks for. Shown because it is the comparison that misleads.\n');
  console.log('     metric                    top-3    bottom-3       gap');
  METRICS.forEach(([k, label]) => {
    const top = DATA.filter(r => r.rank <= 3 && r[k] != null).map(r => r[k]);
    const bot = DATA.filter(r => r.rank >= 8 && r[k] != null).map(r => r[k]);
    console.log('     ' + label.padEnd(24) + mean(top).toFixed(1).padStart(6)
      + mean(bot).toFixed(1).padStart(12) + (mean(top) - mean(bot)).toFixed(1).padStart(10));
  });
  console.log('\n     n = 9 and 9. THE SAME MANAGERS RECUR, so these are not 18 independent');
  console.log('     observations and a single strong manager can produce every gap above.\n');

  console.log('  2. WITHIN EACH MANAGER — the test that removes who-is-good entirely.');
  console.log('     "did HE finish better in the seasons HE drafted differently than usual"\n');
  console.log('     metric                    when LOWER   when HIGHER   spread   n');
  const found = [];
  METRICS.forEach(([k, label]) => {
    const w = withinManager(DATA, k);
    if (!isFinite(w.spread)) return;
    console.log('     ' + label.padEnd(24)
      + (w.early >= 0 ? '+' : '') + w.early.toFixed(2).padStart(8)
      + (w.late >= 0 ? '   +' : '   ') + w.late.toFixed(2).padStart(8)
      + w.spread.toFixed(2).padStart(9) + ('  ' + (w.nEarly + w.nLate)).padStart(5));
    if (Math.abs(w.spread) >= 0.75) found.push([label, w]);
  });

  console.log('\n  3. WHAT TO DO WITH IT\n');
  console.log('     metrics tested: ' + METRICS.length + '. At this sample size roughly one');
  console.log('     spurious result of "interesting" size is expected by chance, so a single');
  console.log('     standout among six is NOT evidence — it is the expected noise.');
  if (found.length) {
    console.log('\n     effects at or above 0.75 rank positions:');
    found.forEach(([label, w]) => console.log('       · ' + label + '  spread '
      + w.spread.toFixed(2) + ' over ' + w.managers + ' managers, n=' + (w.nEarly + w.nLate)));
    console.log('\n     TREAT AS HYPOTHESES. Each is ~1 rank position in a ten-team league,');
    console.log('     measured on ' + owners.length + ' managers over ' + seasons.length + ' seasons. That is enough to');
    console.log('     justify testing them forward, and nowhere near enough to draft on.');
  } else {
    console.log('\n     nothing clears 0.75 rank positions. That is a real answer: the draft');
    console.log('     shapes measured here do not separate this league\'s finishers.');
  }
  console.log('\n     THE WAY TO SETTLE ANY OF THEM is forward prediction, not more slicing');
  console.log('     of the same 30 rows — commit the claim before the season, grade it after.');
}

module.exports = { rows, withinManager, METRICS, DATA };
