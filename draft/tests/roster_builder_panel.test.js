// TERRITORY: A
/* DOES THE ROSTER BUILDER PANEL ACTUALLY ANSWER THE QUESTION CORY ASKED?
 *
 * Cory, 2026-08-19: "what is VONA? If I need a flex and RB has a higher VONA
 * than next best WR, should I take RB?"
 *
 * The answer is NO, not from VONA — VONA is a within-position quantity and the
 * project has the measurement to prove it (trap 3: a backup QB's cliff is the
 * largest on the board and sits on 17 points of surplus; an RB's 11-point cliff
 * sits on 233). Marginal lineup value IS cross-position comparable, and the
 * roster-builder panel is where that comparison lives.
 *
 * ⚠️ RULE 3e — EVERY CHECK HERE HAS A DEMONSTRATED POSITIVE *AND* A DEMONSTRATED
 * NEGATIVE. The failure this file exists to prevent is a panel that renders
 * something plausible for every input, which is indistinguishable from a panel
 * that works until the night it matters.
 *
 * Run: node draft/tests/roster_builder_panel.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const M = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
function ck(name, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + '  — ' + JSON.stringify(detail).slice(0, 260)); }
}

const LEAGUE = { starters: BOARD.league.starters };
const pool = BOARD.players.filter(p => p.position && p.proj_mean != null);
const byPos = q => pool.filter(p => p.position === q).sort((a, b) => b.proj_mean - a.proj_mean);
const top = (q, i) => byPos(q)[i];

/* ── 1. THE PANEL'S OWN WIRING ─────────────────────────────────────────────── */
ck('the module the war room loads exposes what app.js calls',
  typeof M.recommend === 'function' && M.WAIVER && M.EVIDENCE,
  Object.keys(M));

ck('the league really does have a FLEX slot — the whole question depends on it',
  (LEAGUE.starters.FLEX || 0) >= 1, LEAGUE.starters);

/* ── 2. CORY'S FLEX QUESTION, BOTH DIRECTIONS ──────────────────────────────
 * Same roster, same two candidates, and the answer must be able to come out
 * EITHER way depending on the men — a rule that always says RB is not an
 * answer, it is a constant. */
{
  /* a roster with RB/WR starters filled and the FLEX seat open */
  const roster = [top('QB', 4), top('RB', 6), top('RB', 12), top('WR', 5), top('WR', 11), top('TE', 4)];
  const rb = top('RB', 20), wr = top('WR', 20);
  const two = M.recommend([rb, wr], roster, { league: LEAGUE, topN: 2 });
  ck('with the FLEX open it ranks an RB against a WR at all (VONA cannot)',
    two.length === 2 && two.every(r => typeof r.marginal === 'number'),
    two.map(r => [r.position, r.marginal]));
  ck('and it says so in words — both are competing for the same open seat',
    two.every(r => /FLEX/.test(r.why)), two.map(r => r.why));

  /* KNOWN POSITIVE: a much better WR must win the flex over a weak RB … */
  const strongWR = M.recommend([top('RB', 60), top('WR', 8)], roster, { league: LEAGUE, topN: 1 });
  ck('KNOWN POSITIVE — a clearly better WR takes the flex over a weak RB',
    strongWR[0].position === 'WR', strongWR[0]);
  /* … and the mirror image must flip, or the panel is answering by position */
  const strongRB = M.recommend([top('RB', 8), top('WR', 60)], roster, { league: LEAGUE, topN: 1 });
  ck('KNOWN NEGATIVE — and it flips to RB when the RB is the better man',
    strongRB[0].position === 'RB', strongRB[0]);
}

/* ── 3. THE DISAGREEMENT THAT MAKES THE PANEL WORTH SCREEN SPACE ───────────
 * A body you already have in a filled slot must be worth ~nothing, and the
 * panel must SAY so rather than quietly ranking him low. */
{
  const roster = [top('QB', 0), top('RB', 0), top('RB', 1), top('WR', 0), top('WR', 1),
    top('TE', 0), top('RB', 2)];   // every starting slot and the flex filled by elites
  const scrub = top('WR', 90);
  const r = M.recommend([scrub], roster, { league: LEAGUE, topN: 1 })[0];
  ck('a man who cannot crack the lineup is worth ~0 …', r.marginal <= 0.01, r);
  ck('… and the panel says "bench only" in Cory\'s words, not the model\'s',
    /bench only/.test(r.why), r.why);
}

/* ── 4. THE ONESIE BEHAVIOUR, PINNED SO IT CANNOT SURPRISE HIM AT THE TABLE ──
 * Register 134. This is IMPOSED (cap) plus EMERGENT (timing) and both halves
 * have been wrong in a document before, so both are pinned here. */
{
  const full = [top('QB', 3), top('RB', 5), top('RB', 9), top('WR', 4), top('WR', 10),
    top('TE', 3), top('RB', 15)];
  /* ⚠️ THE BOARD MUST BE THINNED, AND MY FIRST VERSION OF THIS CHECK WAS NOT —
   * it handed the model every elite running back in the league and then called
   * it a failure for preferring them to a kicker. It was right and the test was
   * wrong. The claim is not "a full lineup wants a kicker"; it is "a full lineup
   * at a REALISTIC ROUND-9 BOARD wants a kicker", which is what the harness
   * measures (first K at its round-9 pick in 30 of 30 seat-years). Simulated by
   * ADP, the same way the finding was verified against the live board. */
  const adp = p => Number(p.adjusted_adp != null ? p.adjusted_adp : p.adp) || 9999;
  const late = pool.filter(p => !full.includes(p) && adp(p) > 90);
  ck('CONTROL — the simulated round-9 board really is thinned', late.length < pool.length
    && late.length > 100, { thinned: late.length, whole: pool.length });
  const r = M.recommend(late, full, { league: LEAGUE, topN: 3 });
  ck('KNOWN POSITIVE — nine starting slots full, board thinned to round 9, and it '
    + 'wants a K or DEF at the top (register 134: consistent, not broken)',
    r.some(x => x.position === 'K' || x.position === 'DEF'), r.map(x => [x.position, x.marginal]));
  /* KNOWN NEGATIVE for the same claim: on the FULL board it must NOT, or the
   * check above is passing on a rule rather than on the board state. */
  const whole = M.recommend(pool.filter(p => !full.includes(p)), full, { league: LEAGUE, topN: 3 });
  ck('KNOWN NEGATIVE — and on an untouched board it prefers the elite upgrades, so '
    + 'the check above is reading board state and not a hardcoded preference',
    whole.every(x => x.position !== 'K' && x.position !== 'DEF'),
    whole.map(x => [x.position, x.marginal]));

  /* and the cap: never a SECOND one */
  const withK = full.concat([byPos('K')[0]]);
  const r2 = M.recommend(byPos('K'), withK, { league: LEAGUE, topN: 5 });
  ck('KNOWN NEGATIVE — but never a second kicker, which is Cory\'s rule not the model\'s',
    r2.length === 0, r2.map(x => x.player && x.player.name));
}

/* ── 5. THE PORTING ERROR THAT ALREADY HAPPENED ONCE ───────────────────────
 * Fed raw projections this recommended quarterbacks at +415 and a kicker above
 * Puka Nacua. The fix is surplus over the wire, and it lives inside the module
 * so the panel cannot reintroduce it by passing players in differently. */
{
  const empty = [];
  const r = M.recommend(pool, empty, { league: LEAGUE, topN: 5 });
  ck('on an EMPTY roster it does not open with a quarterback or a kicker '
    + '(the raw-projection porting bug, pinned)',
    r.every(x => x.position !== 'K') && r[0].position !== 'QB',
    r.map(x => [x.player.name, x.position, x.marginal]));
  ck('and the top marginal is a plausible surplus, not a raw projection',
    r[0].marginal < 400, r[0]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
