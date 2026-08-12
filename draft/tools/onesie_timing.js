// TERRITORY: A
/* ITEM 4b — WHEN TO TAKE A ONESIE, AS A DIFFERENCE OF DIFFERENCES.
 *
 * ── THE QUESTION THE CONSTRUCTION ARMS CANNOT ANSWER ────────────────────────
 *
 * RB and WR are CONTINUOUS decisions — several will be taken, so each pick is
 * "who is best available". QB, TE, K and DEF are DISCRETE: exactly one is taken,
 * so the question is never WHO, it is WHEN. And "when" depends on the SHAPE OF
 * THE DROP-OFF at that position relative to the shape everywhere else — a slope,
 * not the level that VORP reports.
 *
 * What ships today is a deferral HEURISTIC for QB and DEF plus a bench-branch
 * arithmetic DEFECT that overpaid for onesies. One is a rule of thumb and the
 * other was a units bug. Neither is a timing model.
 *
 * ── THE DECISION QUANTITY, AND IT IS NOT THE CURVE ─────────────────────────
 *
 * Cory's correction, and it is what makes this a timing model rather than
 * another VORP ranking:
 *
 *     ONESIE LOSS FROM WAITING = best now − E[best at my next pick]
 *     FLEX   LOSS FROM WAITING = best flex now − E[best flex at my next pick]
 *     DECISION = ONESIE LOSS − FLEX LOSS
 *
 * Take the onesie when its incremental loss from waiting exceeds the incremental
 * loss of the alternative I would otherwise spend the pick on.
 *
 * **THE POSITIONAL CURVES ARE DIAGNOSTIC. THE DIFFERENCE OF DIFFERENCES IS THE
 * DECISION QUANTITY.** Both are reported and the first must not stand in for the
 * second: a steep curve at a position I was never drafting from is not urgency.
 *
 * ── SURVIVAL, RUN BOTH WAYS, AND WHY THE BIAS CANNOT BE ASSUMED TO CANCEL ──
 *
 * The survival model is measured over-predicting departures by 15-57%. It is
 * tempting to argue a uniform bias cancels in a difference of differences. It
 * does not: survival sets WHERE EACH CURVE BENDS, and positions have different
 * depth distributions, so the distortion is not uniform across them. A slope
 * comparison reads exactly the quantity a level comparison would have let cancel.
 *
 * So every number is computed twice — `CFG.CONSERVE_SURVIVAL_ON` true and false,
 * which is the engine's own toggle rather than a second survival model — and the
 * reported result is whether THE CROSSOVER PICKS MOVE.
 *
 *   · barely move  → survival uncertainty is not decision-critical here, and
 *                    that is a real result.
 *   · move a lot   → this cannot become a live rule yet, which is worth more
 *                    than the crossover number itself.
 *
 * ── THE BOUNDARY, WHICH IS HARD ────────────────────────────────────────────
 *
 * NO scalar urgency weight. NO change to VORP. NOTHING here influences the live
 * draft unless the crossover policy is measured to improve the construction
 * objective on the same paired harness. Under one projected starting-lineup
 * point, it closes as arithmetic and says so. Above it, it earns a
 * PREREGISTRATION and not a production change — discovery gate, not production
 * gate.
 *
 * ── AND K/DEF ARE NOT FORCED INTO THE FRAME ────────────────────────────────
 *
 * If their curves are flat, "NO MEANINGFUL CROSSOVER" is a valid result and is
 * reported as one. A narrowing to a QB-and-TE problem would mean the shipped
 * rule is already right for half the onesies.
 *
 * Run: node draft/tools/onesie_timing.js
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const CO = require('./construction_order.js');

const DATA = CO.DATA, L = DATA.league;
const TEAMS = L.teams, ROUNDS = L.rounds, MY = L.my_draft_slot;
const KR = (L.keeper_rules || {}).count || 0;
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY);

const ONESIES = ['QB', 'TE', 'K', 'DEF'];
const FLEX_OK = { RB: 1, WR: 1, TE: 1 };

function myPicks() {
  const out = [];
  for (let r = 1; r <= ROUNDS; r++) {
    out.push((r - 1) * TEAMS + ((r % 2 === 1) ? MY : (TEAMS - MY + 1)));
  }
  return out.slice(KR);
}
const MINE = myPicks();

/* The board as it plausibly stands at pick `p`: the top `p-1` by ADP are gone.
 * A SIMPLIFICATION, stated rather than buried — it is the ADP room's depletion,
 * which the calibration showed over-drafts QB by 40% and TE by 33%. It is used
 * here because the question is the SHAPE OF A CURVE at a given board depth, and
 * both arms of every comparison face the identical board, so the depletion
 * model cancels between them. It does NOT cancel for the crossover PICK NUMBER,
 * which is why that number is reported as approximate and the policy arm is run
 * in both room models. */
function boardAt(pick) {
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null
    && !KEEPERS.some(k => String(k.player_id) === String(p.player_id)));
  const byAdp = pool.slice().sort((a, b) => CO.adpOf(a) - CO.adpOf(b));
  const gone = new Set(byAdp.slice(0, Math.max(0, pick - 1)).map(p => String(p.player_id)));
  return pool.filter(p => !gone.has(String(p.player_id)));
}

function bestNow(board, posTest) {
  const at = board.filter(posTest).sort((a, b) => b.proj_mean - a.proj_mean);
  return at.length ? at[0].proj_mean : 0;
}

/* E[best available at my NEXT pick], from the ENGINE'S OWN function so this
 * cannot become a second expected-best.
 *
 * ⚠️ THE CONTEXT SHAPE IS THE SCORER'S, NOT ONE I INVENTED, and my first version
 * got this wrong in a way that inverted the result. I passed
 * `{board, currentPick: null}`. `survivalProbability` branches on exactly that
 * field: with `currentPick` set it asks **"given he is available NOW, is he
 * there at targetPick"**, and with it null it answers the UNCONDITIONAL
 * question. Those are different quantities, and the null form made every loss
 * roughly ten times too small — I nearly reported an 80-pick crossover swing
 * that was partly my own malformed argument.
 *
 * `intervening` is deliberately EMPTY and that is a stated limit rather than an
 * oversight: Layer 2 models the specific opponents picking between my turns, and
 * this tool has no opponent rosters. So every number here is Layer-1 (ADP-shape)
 * survival. It is the right restriction for a question about the SHAPE OF A
 * CURVE, and it is the wrong one for a live rule — which is one more reason this
 * stays a measurement arm. */
function survCtx(board, currentPick) {
  return { board: board, currentPick: currentPick, runMultipliers: {}, intervening: [] };
}
function bestThen(board, posTest, nextPick, currentPick) {
  const at = board.filter(posTest);
  if (!at.length) return 0;
  return E.expectedBestAvailable(at, nextPick, survCtx(board, currentPick));
}

function measure(conserve) {
  const prev = E.CFG.CONSERVE_SURVIVAL_ON;
  E.CFG.CONSERVE_SURVIVAL_ON = conserve;
  try {
    const rows = [];
    for (let i = 0; i < MINE.length - 1; i++) {
      const p = MINE[i], nx = MINE[i + 1];
      const board = boardAt(p);
      const flexNow = bestNow(board, x => FLEX_OK[x.position]);
      const flexThen = bestThen(board, x => FLEX_OK[x.position], nx, p);
      const flexLoss = flexNow - flexThen;
      const row = { pick: p, next: nx, flex_loss: flexLoss, pos: {} };
      ONESIES.forEach(pos => {
        const now = bestNow(board, x => x.position === pos);
        const then = bestThen(board, x => x.position === pos, nx, p);
        const loss = now - then;
        row.pos[pos] = { now: now, then: then, loss: loss, dod: loss - flexLoss };
      });
      rows.push(row);
    }
    return rows;
  } finally {
    E.CFG.CONSERVE_SURVIVAL_ON = prev;
  }
}

/* THE CROSSOVER: the FIRST of my picks at which the onesie's loss from waiting
 * exceeds the flex alternative's. `null` means it never crosses — which for a
 * flat position is the correct answer and not a failure to find one. */
function crossover(rows, pos) {
  for (const r of rows) if (r.pos[pos].dod > 0) return r.pick;
  return null;
}

// ─────────────────────────────────────────────────────────────────── report
const raw = measure(false);
const con = measure(true);

console.log('='.repeat(78));
console.log('ONESIE TIMING — the difference of differences, not the curve');
console.log('='.repeat(78));
console.log(`seat ${MY}, my picks: ${MINE.join(', ')}`);
console.log('LOSS FROM WAITING = best now − E[best at my next pick], in projected season points.');
console.log('DoD = onesie loss − FLEX loss. Positive means the onesie is the more urgent pick.');
console.log('');

function table(rows, label) {
  console.log('── ' + label + ' ' + '─'.repeat(Math.max(0, 58 - label.length)));
  console.log('   pick  flexLoss  ' + ONESIES.map(p => (p + ' loss/DoD').padStart(16)).join(''));
  rows.forEach(r => {
    console.log('   ' + String(r.pick).padStart(4) + '  '
      + r.flex_loss.toFixed(1).padStart(8) + '  '
      + ONESIES.map(p => (r.pos[p].loss.toFixed(1) + '/'
          + (r.pos[p].dod >= 0 ? '+' : '') + r.pos[p].dod.toFixed(1)).padStart(16)).join(''));
  });
  console.log('');
}
table(raw, 'SURVIVAL AS SHIPPED (conservation OFF)');
table(con, 'CONSERVATION-CONSTRAINED SURVIVAL');

console.log('── CROSSOVERS, AND WHETHER SURVIVAL TREATMENT MOVES THEM ────────');
console.log('   pos   raw-survival    conserved      moved?');
let anyMove = false, anyCross = false;
ONESIES.forEach(pos => {
  const a = crossover(raw, pos), b = crossover(con, pos);
  if (a != null || b != null) anyCross = true;
  const moved = a !== b;
  if (moved) anyMove = true;
  console.log('   ' + pos.padEnd(5) + ' ' + String(a == null ? 'never' : 'pick ' + a).padEnd(15)
    + String(b == null ? 'never' : 'pick ' + b).padEnd(14)
    + (moved ? '⚠️ YES — ' + (a == null || b == null ? 'appears/disappears' : Math.abs(a - b) + ' picks')
             : 'no'));
});
console.log('');

/* ⚠️ THE FLATNESS CHECK, so K and DEF are not forced into a frame they do not
 * belong in. A position whose top-20 spread is small has no meaningful timing
 * decision at all, and saying so is a result. */
console.log('── IS THERE A DECISION HERE AT ALL? top-20 spread by position ───');
const b0 = boardAt(MINE[0]);
['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
  const at = b0.filter(p => p.position === pos)
    .sort((a, b) => b.proj_mean - a.proj_mean).slice(0, 20);
  if (at.length < 2) { console.log('   ' + pos.padEnd(5) + ' fewer than two players'); return; }
  const spread = at[0].proj_mean - at[at.length - 1].proj_mean;
  const flat = spread < 20;
  console.log('   ' + pos.padEnd(5) + ' top-20 spread ' + spread.toFixed(0).padStart(4)
    + ' pts   ' + (flat ? 'FLAT — no meaningful timing decision' : 'has slope'));
});
console.log('');
console.log('   ⚠️ THIS TOOL PROPOSES NOTHING AND CHANGES NOTHING. It is a measurement');
console.log('   arm. The crossover policy must beat the shipped rule on the construction');
console.log('   objective before it is even a candidate, and under one projected point it');
console.log('   closes as arithmetic. Discovery gate, not production gate.');
if (!anyCross) {
  console.log('\n   RESULT: NO ONESIE EVER CROSSES. On this board the flex alternative');
  console.log('   always loses at least as much from waiting, which would mean the shipped');
  console.log('   deferral rule is already correct and this closes.');
}
if (anyMove) {
  console.log('\n   ⚠️ A CROSSOVER MOVED WITH THE SURVIVAL TREATMENT. That is the result:');
  console.log('   this cannot become a live rule until survival is calibrated, whatever the');
  console.log('   crossover numbers themselves say.');
}
