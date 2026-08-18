// TERRITORY: A
// THE TIE-BREAK FACTS BAKE — a DUAL-STATE suite for a PREPARED patch.
//
// draft/patches/tiebreak_facts_bake.patch carries the ruled application of
// edge_hunt_2026-08-16 §3.1 (A, 2026-08-17: "APPLY the prepared diff, with its
// measured-strength wording verbatim") plus two facts from
// empirical_draft_value_2026-08-16 §8 — volume-over-efficiency for WR/TE pairs
// and RB NFL draft capital. It targets verdict.js + app.js, which a SIBLING
// WORKTREE owns right now, so this lane committed the patch instead of the
// edit, and A applies it at the next merge.
//
// A single-state test would be red on one side of that merge no matter which
// side it asserted. So this suite reads which state the tree is in and pins
// the correct contract for THAT state:
//
//   PRE-APPLY  — the patch file exists, `git apply --check` says it still
//                applies cleanly to the current files (bit-rot detector: the
//                moment the sibling's merge moves the context lines, THIS goes
//                red rather than the apply failing silently at merge time),
//                and every board field the prepared facts read exists on the
//                committed board or its build path;
//   POST-APPLY — the facts actually fire, trajectory FIRST, with the measured
//                wording (n printed), absence still means no claim, and the
//                app.js copy carries the coin-flip truth.
//
// Run: node draft/tests/tiebreak_facts_bake.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const PATCH = path.join(ROOT, 'draft', 'patches', 'tiebreak_facts_bake.patch');
const VERDICT = path.join(ROOT, 'public', 'js', 'draft', 'verdict.js');
const APP = path.join(ROOT, 'public', 'js', 'draft', 'app.js');

ck('the prepared patch is committed where the mandate said it lives',
  fs.existsSync(PATCH));
const patchSrc = fs.existsSync(PATCH) ? fs.readFileSync(PATCH, 'utf8') : '';
const verdictSrc = fs.readFileSync(VERDICT, 'utf8');
const applied = /late_trajectory/.test(verdictSrc);

// ── the patch carries the ruled, measured wording in BOTH states ──────────
ck('trajectory fact wording is the §3.1 prepared wording, n stated verbatim',
  /in 176 historical toss-ups that side won/.test(patchSrc)
  && /58% — the one measured tie-breaker \(weak signal, n stated\)/.test(patchSrc));
ck('volume fact carries its measured ρ and n (WR .70 vs .32; n=1152)',
  /WR \.70 vs \.32/.test(patchSrc) && /n=1152 player-seasons 2023-25/.test(patchSrc)
  && /efficiency predicts DECLINE \(WR −\.28 \[−\.37, −\.19\]\)/.test(patchSrc));
ck('capital fact carries ρ −0.427 with its CI, seasons and n',
  /ρ −0\.427/.test(patchSrc) && /\[−0\.67, −0\.09\], 3\/3 seasons, n=56/.test(patchSrc));
ck('the coin-flip truth (the ruling\'s second half) is in the app.js hunk',
  /true coin flips: 8 of 9/.test(patchSrc) && /259 near-ties/.test(patchSrc)
  && /stop sweating it/.test(patchSrc));
ck('the patch is a patch, not a hot edit: it touches ONLY verdict.js and app.js',
  (patchSrc.match(/^diff --git /gm) || []).length === 2
  && /b\/public\/js\/draft\/verdict\.js/.test(patchSrc)
  && /b\/public\/js\/draft\/app\.js/.test(patchSrc));

if (!applied) {
  // ── PRE-APPLY ────────────────────────────────────────────────────────────
  console.log('-- state: PREPARED (patch not applied) --');
  let clean = false, err = '';
  try {
    execFileSync('git', ['apply', '--check', PATCH], { cwd: ROOT, stdio: 'pipe' });
    clean = true;
  } catch (e) { err = String(e.stderr || e.message); }
  ck('git apply --check is CLEAN against the current tree (bit-rot detector: '
    + 'if the sibling worktree moves the context, this red fires BEFORE merge '
    + 'day, not at it)', clean, err.slice(0, 200));

  // Every field the prepared facts read exists where the facts will find it.
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const players = board.players || board;
  const has = f => players.some(p => p && p[f] != null);
  ['opportunity_share', 'target_share', 'wopr', 'nfl_draft_round', 'nfl_draft_pick']
    .forEach(f => ck('board field the prepared facts read exists on the committed board: ' + f, has(f)));
  // late_trajectory lands via the build attach committed on THIS branch — the
  // committed artifact predates it, so pin the BUILD PATH, not the artifact.
  const buildSrc = fs.readFileSync(path.join(ROOT, 'draft', 'build.py'), 'utf8');
  ck('late_trajectory is wired into build.py (the field exists after the next '
    + 'board build; test_late_trajectory.py pins the construction)',
    /attach_late_trajectory\(board, compute_late_trajectory\(year_n\)\)/.test(buildSrc));
} else {
  // ── POST-APPLY ───────────────────────────────────────────────────────────
  console.log('-- state: APPLIED --');
  const V = require(VERDICT);
  const mk = (id, name, pos, f) => ({ player: Object.assign({ player_id: id, name: name, position: pos }, f || {}) });

  // trajectory fires, and fires FIRST, ahead of every shipped fact.
  const fa = V.tiebreakFacts(
    mk('1', 'Hot', 'WR', { late_trajectory: 2.5, adp_velocity: 9, age: 24, opportunity_share: 0.24 }),
    mk('2', 'Cold', 'TE', { late_trajectory: -1.0, adp_velocity: -4, age: 29, opportunity_share: 0.18 }));
  ck('trajectory fact fires and is FIRST (the ruled order), ahead of market/age',
    fa.length >= 3 && /^trajectory: Hot finished last season hotter/.test(fa[0]), fa);
  ck('its printed strength is the measured one: 176 toss-ups, 58%, weak signal',
    /176 historical toss-ups/.test(fa[0]) && /58%/.test(fa[0]) && /weak signal/.test(fa[0]), fa[0]);
  ck('the volume fact fires for the WR/TE pair, share values printed',
    fa.some(x => /^volume: Hot carries the bigger measured opportunity share \(0\.24 vs 0\.18\)/.test(x)), fa);

  // capital fires on an RB pair carrying the column; better capital = LOWER round.
  const fc = V.tiebreakFacts(
    mk('3', 'RoundOne', 'RB', { nfl_draft_round: 1, nfl_draft_pick: 12 }),
    mk('4', 'RoundFour', 'RB', { nfl_draft_round: 4 }));
  ck('capital fact fires on the RB pair, names the better capital with ρ and n',
    fc.length === 1 && /^capital: RoundOne/.test(fc[0]) && /round 1, pick 12 vs round 4/.test(fc[0])
    && /ρ −0\.427/.test(fc[0]) && /n=56/.test(fc[0]), fc);

  // absence still means NO CLAIM — no fact invented from a missing field.
  ck('absent late_trajectory on one side: no trajectory claim',
    !V.tiebreakFacts(mk('5', 'A', 'RB', { late_trajectory: 1 }), mk('6', 'B', 'RB', {}))
      .some(x => /^trajectory:/.test(x)));
  ck('equal late_trajectory: no claim either (a tie on the tie-breaker is silence)',
    !V.tiebreakFacts(mk('5', 'A', 'RB', { late_trajectory: 1 }), mk('6', 'B', 'RB', { late_trajectory: 1 }))
      .some(x => /^trajectory:/.test(x)));
  ck('volume fact refuses a non-pass-catcher pair (RB/WR measured differently)',
    !V.tiebreakFacts(mk('7', 'A', 'RB', { opportunity_share: 0.3 }), mk('8', 'B', 'WR', { opportunity_share: 0.1 }))
      .some(x => /^volume:/.test(x)));
  ck('capital fact refuses a non-RB pair (WR/TE slot-beating measured NOTHING)',
    !V.tiebreakFacts(mk('9', 'A', 'WR', { nfl_draft_round: 1 }), mk('10', 'B', 'WR', { nfl_draft_round: 4 }))
      .some(x => /^capital:/.test(x)));
  ck('bare players still yield ZERO facts — nothing is invented',
    V.tiebreakFacts(mk('11', 'A', 'RB'), mk('12', 'B', 'WR')).length === 0);

  const appSrc = fs.readFileSync(APP, 'utf8');
  ck('app.js carries the coin-flip truth in the tie-break header',
    /true coin flips: 8 of 9/.test(appSrc) && /259 near-ties/.test(appSrc));
  ck('the "genuinely even" line now says a true toss-up is a true coin flip',
    /genuinely even; your read decides\. A true coin flip/.test(appSrc));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);
