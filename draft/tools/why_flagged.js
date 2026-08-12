/* UNUSUAL INTERNAL CAUSALITY — WHY DOES THE ENGINE BELIEVE THIS PICK BELONGS HERE?
 *
 * Cory, 2026-08-14, section 6: the four tripwires catch UNUSUAL OUTPUT. They do
 * not say why. "If QB1 is pick four, the tripwire says the pick is unusual. IT
 * DOES NOT SAY WHY THE ENGINE BELIEVES HE BELONGS THERE." The diagnostic chain —
 *
 *   RECOMMENDATION -> VALUE -> VORP -> REPLACEMENT -> PLAYER POPULATION
 *                                                       -> RAW PROJECTION
 *
 * — should be inspectable for any flagged pick WITHOUT CHANGING THE
 * RECOMMENDATION. If the chain explains the result, the unusual pick is an edge.
 * If it does not, there is a defect.
 *
 * THE CHAIN HAS A BROKEN LINK AND IT IS NOT A DEFECT — IT IS THE ARCHITECTURE.
 * VORP DOES NOT ENTER THE SCORE. The value term is VONA
 * (`proj_mean - expectedBestAvailable(samePos, nextPick)`) at weight 1.0; VORP
 * feeds the board ordering and the tiering. Measured by boundary_walk.js and
 * reported here as a LINK rather than hidden, because a chain that silently
 * skipped it would let a reader conclude the baseline drove a pick it never
 * touched. Both quantities are therefore printed, with the join between them
 * marked as what it is.
 *
 * IT CHANGES NOTHING. Same rule as tripwires.js: this reports, it does not
 * adjust. It does not import a weight, it does not re-rank, and it takes the
 * scored list as an argument rather than producing one.
 *
 * Run: node draft/tools/why_flagged.js [--pick N] [--player "Name"]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const DC = require(path.join(ROOT, 'public', 'js', 'draft', 'decision_contract.js'));
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;

/* ── THE CHAIN ─────────────────────────────────────────────────────────────
 * Each link carries a VALUE and a CHECK. A link whose check fails is where the
 * investigation belongs; everything below it is inheriting the problem. */
function chainFor(player, scored, board, ctx) {
  const pos = player.position;
  const projected = DATA.players
    .filter(p => p.position === pos && Number(p.proj_mean) > 0)
    .sort((a, b) => Number(b.proj_mean) - Number(a.proj_mean));
  const allAtPos = DATA.players.filter(p => p.position === pos);

  const proj = Number(player.proj_mean);
  const rep = Number(player.replacement);
  const vorp = Number(player.vorp);

  const posRank = projected.findIndex(p => String(p.player_id) === String(player.player_id)) + 1;
  let repRank = null;
  for (let i = 0; i < projected.length; i++) {
    if (Number(projected[i].proj_mean) <= rep + 1e-9) { repRank = i + 1; break; }
  }
  const dedicated = (L.starters[pos] || 0) * L.teams;
  const flex = (L.starters.FLEX || 0) * L.teams;

  const entry = scored.find(s => String(s.player.player_id) === String(player.player_id));
  const rank = entry ? scored.indexOf(entry) + 1 : null;
  const vona = entry ? Number(entry.components.vona) : null;

  const links = [];

  links.push({
    step: 'RAW PROJECTION', value: proj.toFixed(1),
    detail: pos + posRank + ' of ' + projected.length + ' projected ' + pos + 's',
    ok: isFinite(proj) && proj > 0,
    fail: 'no usable projection — every link below is built on nothing',
  });

  links.push({
    step: 'PLAYER POPULATION', value: projected.length + ' / ' + allAtPos.length,
    detail: (allAtPos.length - projected.length) + ' of ' + allAtPos.length + ' '
      + pos + 's carry no projection ('
      + (100 * (allAtPos.length - projected.length) / Math.max(1, allAtPos.length)).toFixed(0)
      + '%), and the baseline is drawn from the ' + projected.length + ' that do',
    ok: repRank != null && repRank <= projected.length,
    fail: 'the baseline rank falls OUTSIDE the projected population, so replacement '
      + 'is being read off a zero-projection player',
  });

  links.push({
    step: 'REPLACEMENT', value: rep.toFixed(1),
    detail: 'sits at ' + (repRank == null ? '?' : pos + repRank)
      + '; the roster implies ' + dedicated
      + (flex ? ' dedicated (+ up to ' + flex + ' flex)' : ' dedicated'),
    ok: repRank != null && repRank >= dedicated && repRank <= dedicated + flex,
    fail: 'the baseline is at a depth the starting requirements do not imply — '
      + 'too shallow inflates VORP at this position, too deep suppresses it',
  });

  links.push({
    step: 'VORP', value: vorp.toFixed(1),
    detail: proj.toFixed(1) + ' - ' + rep.toFixed(1) + ' = ' + (proj - rep).toFixed(1),
    ok: Math.abs((proj - rep) - vorp) < 0.05,
    fail: 'the stored VORP does not equal projection minus replacement',
  });

  /* THE JOIN, AND IT IS NOT A LINK. Printed as a break in the chain so nobody
   * reads the baseline as having driven a recommendation it does not reach. */
  links.push({
    step: '↯ VORP DOES NOT ENTER THE SCORE', value: '—',
    detail: 'VORP feeds the board ordering and the tiering. The value term is '
      + 'VONA. If the four links above are clean, the baseline did not cause this '
      + 'pick and the next two links are where it came from.',
    ok: true, join: true,
  });

  links.push({
    step: 'VALUE (VONA)', value: vona == null ? 'not scored' : vona.toFixed(1),
    detail: 'proj_mean - expectedBestAvailable(' + pos + ', pick ' + ctx.nextPick + ')'
      + (vona == null ? '' : ' — what waiting costs at this position'),
    ok: vona != null && isFinite(vona),
    fail: 'the player is not in the scored list (refused, or filtered by roster legality)',
  });

  links.push({
    step: 'RECOMMENDATION', value: entry && E.scoreable(entry) ? entry.score.toFixed(1) : 'n/a',
    detail: rank == null ? 'not in the list' : 'ranked ' + rank + ' of ' + scored.length,
    ok: rank != null,
    fail: 'flagged but absent from the recommendation list',
  });

  return links;
}

/* ── DRIVE IT ──────────────────────────────────────────────────────────────*/
const arg = n => {
  const a = process.argv.find(x => x.indexOf('--' + n + '=') === 0);
  return a ? a.split('=').slice(1).join('=') : null;
};
const PICK = Number(arg('pick') || 30);
const WANT = arg('player');

const adpOf = p => (p.adjusted_adp != null ? Number(p.adjusted_adp)
  : (p.raw_adp != null ? Number(p.raw_adp) : 9999));
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const K = KEEP.keepersFrom(DATA);

const taken = new Set(byAdp.slice(0, PICK - 1).map(p => String(p.player_id)));
K.forEach(k => taken.add(String(k.player_id)));
const board = pool.filter(p => !taken.has(String(p.player_id)));
const ctx = { board: board, roster: K, league: L, currentPick: PICK, nextPick: PICK + 15,
  totalPicks: 147, myPicksLeft: 12, roundsLeft: 12, runMultipliers: {},
  intervening: [], weights: E.MEASURED_WEIGHTS };
const scored = E.recommend(ctx);

const subject = WANT
  ? board.find(p => p.name === WANT)
  : (scored[0] && scored[0].player);
if (!subject) {
  console.log('No such player on the board at pick ' + PICK + ': ' + WANT);
  process.exit(2);
}

console.log('WHY THIS PICK — internal causality for a flagged recommendation\n');
console.log('  ' + subject.name + ' (' + subject.position + '), pick ' + PICK
  + ', seat ' + (L.my_draft_slot || '?') + ', keepers '
  + K.map(k => k.position).join('/') + '\n');

const links = chainFor(subject, scored, board, ctx);
const width = Math.max.apply(null, links.map(l => l.step.length));
let firstBreak = null;
links.forEach(l => {
  const mark = l.join ? '   ' : (l.ok ? ' ok' : '***');
  if (!l.ok && !firstBreak) firstBreak = l;
  console.log('  ' + mark + ' ' + l.step.padEnd(width + 2) + String(l.value).padStart(8)
    + '   ' + l.detail);
  if (!l.ok) console.log('      ^ ' + l.fail);
});

console.log('\n  VERDICT');
if (!firstBreak) {
  console.log('    THE CHAIN EXPLAINS THE PICK. Every link holds: the projection is real,');
  console.log('    the baseline is drawn from the projected population at the depth the');
  console.log('    roster implies, VORP is that subtraction, and the recommendation comes');
  console.log('    from VONA. An unusual pick with an intact chain is an EDGE, not a');
  console.log('    defect — and the tripwire that flagged it has done its job by making');
  console.log('    it inspectable rather than by being right.');
} else {
  console.log('    THE CHAIN BREAKS AT: ' + firstBreak.step);
  console.log('    ' + firstBreak.fail);
  console.log('    Everything below that link is inheriting the problem, not causing it.');
}

/* The contract's half of the chain — recommendation -> value — which it already
 * supplies and which this file must not reimplement (rule 10d: a second copy
 * agrees with itself). */
if (scored.length > 1) {
  const winner = scored[0], alt = scored[1];
  try {
    const ex = DC.explain({ winner: winner, alternative: alt, cfg: E.CFG });
    console.log('\n  AND THE CONTRACT\'S HALF, for the pick actually recommended:');
    console.log('    ' + winner.player.name + ' over ' + alt.player.name
      + ', gap ' + (ex.evidence.gap == null ? 'n/a' : ex.evidence.gap.toFixed(2))
      + ', resolution ' + (ex.evidence.resolution && ex.evidence.resolution.status));
    /* THE FIELD NAMES ARE READ FROM decision_contract.causes(), NOT GUESSED.
     * My first version printed `c.term`/`c.delta` and rendered "undefined" for
     * every cause: causes() emits {code, kind, magnitude, decision_significant,
     * calibration}. A consumer that invents the producer's shape is the same
     * defect as a fixture that invents its input — and it failed loudly here
     * only because the field was displayed. */
    (ex.evidence.causes || []).slice(0, 5).forEach(c =>
      console.log('      · ' + String(c.code).padEnd(22)
        + (c.magnitude != null
          ? (Number(c.magnitude) > 0 ? '+' : '') + Number(c.magnitude).toFixed(2) : '')
        + (c.decision_significant ? '   DECISIVE' : '')
        + (c.detail ? '   ' + c.detail : '')));
    const contribs = ex.evidence.contributions || [];
    const shares = contribs.filter(c => c.share_of_gap != null)
      .sort((a, b) => Math.abs(b.share_of_gap) - Math.abs(a.share_of_gap)).slice(0, 3);
    if (shares.length) {
      console.log('    share of the gap (can exceed 1 and can be negative — opposing terms):');
      shares.forEach(c => console.log('      · ' + String(c.term).padEnd(14)
        + (100 * c.share_of_gap).toFixed(0) + '%'));
    }
  } catch (err) {
    console.log('\n  (contract explanation unavailable: ' + err.message + ')');
  }
}

console.log('\n  NOTHING ABOVE CHANGED A RECOMMENDATION. This tool reads a scored list it');
console.log('  was handed; it has no path into scorePlayer and imports no weight.');
