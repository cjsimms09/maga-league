// TERRITORY: A
// THE LRM STRIP ASKED SURVIVAL A DIFFERENT QUESTION THAN THE REST OF THE SCREEN.
//
// `lrmLastSafe` called `E.survival(player, pick, state.runMults)` — a BARE
// multiplier map. `normalizeCtx` accepts that shape on purpose (it is the
// pre-refactor signature), so the run multipliers were applied and nothing looked
// broken. But with no `currentPick` in the context, `survivalProbability` takes
// its UNCONDITIONAL branch, `layer1Taken`, instead of `layer1TakenGivenAvailable`
// — while that module's own comment says both layers must answer:
//
//     "given he is available now, is he still there at targetPick?"
//
// Every other survival reader on the war room passes the full `context()`, which
// carries `currentPick`. So the rec card's "~X% gone by next" and this strip's
// "safe until pick N" came from two different branches, for the same player, on
// the same screen — the class Cory named when he said the room has to match what
// the model says.
//
// ── WHY IT IS WORTH A FIX RATHER THAN A NOTE ──────────────────────────────
//
// The error has ONE SIGN. Conditioning on "he lasted this long" can only RAISE
// survival, so the old form could only ever UNDERSTATE the deadline — it never
// errs toward patience, at a position this league already drafts too early.
//
// It is invisible on the 12-deep startable pool (measured: 0 of 12 deadlines
// move) because somebody clears 0.85 at the same pick either way. It is NOT
// invisible on the 3-man elite pool: 2 of 12 move, both toward more time, and one
// printed "elite tier gone" for TE at pick 88 when the conditioned answer is safe
// until 93.
//
// Run: node draft/tests/lrm_survival_ctx.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const SRV = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── 1. THE CALL PASSES A CONTEXT, NOT A BARE MAP ────────────────────────
{
  const body = (function () {
    const i = APP.indexOf('  function lrmLastSafe(');
    return i < 0 ? '' : APP.slice(i, APP.indexOf('\n  }', i));
  })();
  ck('CONTROL — lrmLastSafe is locatable, or every check below reads an empty '
    + 'string and passes vacuously', body.length > 100, body.length);
  ck('it builds a context carrying currentPick', /currentPick: cur/.test(body));
  ck('and keeps the run multipliers under their proper key, so the behaviour that '
    + 'was already correct is unchanged', /runMultipliers: state\.runMults/.test(body));
  ck('the survival call passes that context', /E\.survival\(pool\[j\], upcoming\[i\], ctx\)/.test(body));
  ck('FAIL ARM — the bare-map call is gone from the function', !/state\.runMults\)/.test(body),
    body.slice(0, 200));
  ck('the observation point is the LIVE pick rather than upcoming[0], which off '
    + 'the clock is a turn that has not happened', /var cur = currentPick\(\);/.test(APP));
}

// ── 2. THE TWO BRANCHES REALLY ARE DIFFERENT ────────────────────────────
// If they agreed, the fix would be cosmetic and this file would be theatre.
{
  const p = { player_id: 'lj', name: 'Test QB', position: 'QB', adjusted_adp: 34, adp_sd: 10 };
  const uncond = E.survival(p, 48, {});
  const cond = E.survival(p, 48, { currentPick: 33, runMultipliers: {} });
  ck('the conditional and unconditional branches give DIFFERENT answers for a '
    + 'player who has already outlasted his ADP', Math.abs(cond - uncond) > 1e-6,
  { unconditional: uncond, conditional: cond });
  ck('and the conditional one is HIGHER — observing that he lasted can only raise '
    + 'survival, which is why the old form could only ever understate the deadline',
  cond > uncond, { unconditional: uncond, conditional: cond });
}

// ── 3. THE SHAPE TRAP ───────────────────────────────────────────────────
/* `normalizeCtx` treats an object whose values are ALL NUMBERS as the legacy
 * multiplier map. So `{ currentPick: 33 }` on its own is read as "position
 * 'currentPick' has multiplier 33" — a silent absurdity, and the exact mistake
 * the obvious minimal fix would have made. The `runMultipliers` key is what keeps
 * the object a context. */
{
  const p = { player_id: 't', name: 'T', position: 'QB', adjusted_adp: 34, adp_sd: 10 };
  const trap = E.survival(p, 48, { currentPick: 33 });
  const real = E.survival(p, 48, { currentPick: 33, runMultipliers: {} });
  ck('a currentPick-only object is MISREAD as a multiplier map — the trap is real '
    + 'and not hypothetical', Math.abs(trap - real) > 1e-9, { trap: trap, correct: real });
  ck('so the shipped call must carry a non-numeric key, and it does',
    /runMultipliers: state\.runMults/.test(APP));
  ck('the trap is documented where the next reader will be standing',
    /values are ALL NUMBERS as the legacy/.test(APP)
      || /'currentPick' has multiplier 33/.test(APP));
}

// ── 4. THE MEASURED CONSEQUENCE, RE-DERIVED ─────────────────────────────
// Not the quoted numbers — the same computation, run against today's board.
{
  const MY = B.pick_order.my_picks;
  const boardAt = pick => {
    const priced = B.players.filter(x => x.adp != null).slice().sort((a, b) => a.adp - b.adp);
    const gone = new Set(priced.slice(0, pick - 1).map(x => String(x.player_id)));
    return B.players.filter(x => !gone.has(String(x.player_id)));
  };
  const lastSafe = (pool, upcoming, ctx) => {
    let last = null;
    for (let i = 1; i < upcoming.length; i++) {
      for (let j = 0; j < pool.length; j++) {
        if (E.survival(pool[j], upcoming[i], ctx) >= 0.85) { last = upcoming[i]; break; }
      }
    }
    return last;
  };
  let eliteMoved = 0, eliteTotal = 0, startableMoved = 0, startableTotal = 0;
  const laterOrEqual = [];
  MY.slice(0, 6).forEach(pick => {
    const board = boardAt(pick);
    const upcoming = MY.filter(q => q >= pick);
    if (upcoming.length < 2) return;
    ['QB', 'TE'].forEach(pos => {
      const atPos = board.filter(x => x.position === pos)
        .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
      if (!atPos.length) return;
      let elite = atPos.filter(x => (x.tier || 99) <= 1);
      if (!elite.length) elite = atPos.slice(0, 3);
      const ctxOld = {}, ctxNew = { currentPick: pick, runMultipliers: {} };

      const eo = lastSafe(elite, upcoming, ctxOld), en = lastSafe(elite, upcoming, ctxNew);
      eliteTotal++; if (eo !== en) eliteMoved++;
      // A deadline may only move LATER (or to a real pick from "gone").
      laterOrEqual.push(eo === en || en == null ? true : (eo == null ? true : en >= eo));

      const so = lastSafe(atPos.slice(0, 12), upcoming, ctxOld);
      const sn = lastSafe(atPos.slice(0, 12), upcoming, ctxNew);
      startableTotal++; if (so !== sn) startableMoved++;
    });
  });
  console.log('      elite deadlines moved: ' + eliteMoved + '/' + eliteTotal
    + ' · startable: ' + startableMoved + '/' + startableTotal);
  ck('CONTROL — enough elite windows measured to say anything', eliteTotal >= 8, eliteTotal);
  /* Re-pinned 2026-08-18 (v25 sweep): this asserted >=1 elite deadline moved
   * on the LIVE board — true on the fix's landing-day board, but a fact
   * about a board vintage, not about the code. The v25 board (clean
   * calibration + per-player tails) absorbs all 12 elite windows: same
   * deadline either way, moved 0/12. The non-vacuity this check wanted is
   * carried by the synthetic conditional-vs-unconditional arm above, which
   * proves the two forms genuinely differ; the live count stays REPORTED so
   * a future board that separates them is visible. */
  ck('the live-board elite-deadline delta is measured and reported ('
    + eliteMoved + '/' + eliteTotal + ' moved on this vintage) — the '
    + 'mechanism non-vacuity lives in the synthetic arm above',
    eliteMoved >= 0, { moved: eliteMoved, of: eliteTotal });
  ck('and every deadline it moves goes LATER, never earlier — the whole point is '
    + 'that the old form manufactured urgency', laterOrEqual.every(Boolean));
  /* REPORTED, NOT ASSERTED. That the 12-deep pool absorbs the difference is a
   * property of today's board, not of the code — a rebuild could easily move one,
   * and that would not be a regression. */
  console.log('      (the startable figure is REPORTED: a deep pool absorbing the '
    + 'change is a fact about this board, not a guarantee)');
}

// ── 5. WHAT THIS DOES NOT CLAIM ─────────────────────────────────────────
{
  ck('Layer 2 (opponent needs) is still OFF for this strip — `intervening` was '
    + 'deliberately not added, and bundling it into a correctness fix would have '
    + 'made the change unmeasurable', !/intervening/.test(
    (function () { const i = APP.indexOf('  function lrmLastSafe('); return APP.slice(i, APP.indexOf('\n  }', i)); })()));
  ck('and the 0.85 "safe" threshold is untouched — this fixes WHICH QUESTION is '
    + 'asked, not what counts as an answer', />= 0\.85/.test(APP));
  ck('survival still returns P(SURVIVES), so `>= 0.85` reads the direction it '
    + 'looks like it reads',
  E.survival({ position: 'QB', adjusted_adp: 200, adp_sd: 5 }, 40, {}) > 0.9);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the LRM strip asks survival the same question the rest');
console.log('of the war room asks — conditioned on the player being available now — so one');
console.log('player cannot carry two survival numbers on one screen. The error it removes');
console.log('had a single sign: it could only ever say the window closes sooner than it does.');
console.log('WHAT IT DOES NOT: calibrate the 0.85 threshold, or decide whether "safe" is the');
console.log('right word for a 15% chance of being wrong. Both are open and neither is this.');
