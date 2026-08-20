// TERRITORY: A
/* THE NUMBERS I QUOTED TO CORY, PINNED — AND PROOF THE TOGGLE ACTUALLY RE-RANKS.
 *
 * ── WHY THIS FILE EXISTS: THE AUDITOR CAUGHT ME OVERCLAIMING ────────────────
 *
 * Independent review, run 32329894396, 2026-08-20, on my own change:
 *
 *   [medium/evidence_boundary] "Specific outcome claims (e.g., Brock Bowers
 *   rank #7 on Sleeper vs outside top 8 on blend; bench-rule position counts
 *   within 0.56 of target) are asserted without visible corroborating artifacts
 *   or test expectations in this diff. These concrete examples are easy to
 *   misstate and are likely to be quoted."
 *
 * It was right. I told Cory both of those numbers in conversation and neither
 * was pinned by anything. This project's own register is full of exactly that
 * failure — register 98 is an eighteen-pick artifact quoted for hours across
 * three documents. A number I say out loud should be a number something checks.
 *
 * It also required, separately:
 *
 *   "add a test that toggling to a known differing source changes at least one
 *    named player's overall_rank and that K/DEF-absent sources do not corrupt
 *    the recommend path."
 *
 * ── AND ONE CLAIM OF MINE IT DOWNGRADED, WHICH I HAVE STOPPED MAKING ────────
 *
 *   PARITY-ONLY: "The alternate source boards cannot drift from the real board
 *   because rerank_by_source.py calls the same vorp/tier functions as build.py.
 *   Agreement of two implementations is not evidence of correctness; a shared
 *   bug would pass this check."
 *
 * Correct. Reusing build.py's functions buys CONSISTENCY, not correctness — it
 * removes one failure mode (two derivations disagreeing, register 148) and adds
 * nothing about whether the derivation is right. The tests below assert
 * behaviour, never "it matches, therefore it is fine."
 *
 * Run: node draft/tests/source_rerank_is_real.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');

let fails = [];
function ck(name, cond, detail) {
  if (cond) console.log('PASS  ' + name);
  else {
    fails.push(name);
    console.log('FAIL  ' + name
      + (detail === undefined ? '' : '  — ' + JSON.stringify(detail).slice(0, 320)));
  }
}

const blend = JSON.parse(fs.readFileSync(path.join(PUB, 'draft_data.json'), 'utf8'));
const load = k => {
  const p = path.join(PUB, 'board_' + k + '.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};
const SOURCES = ['ds', 'sleeper', 'own', 'fp'];
const boards = {};
SOURCES.forEach(k => { boards[k] = load(k); });

ck('CONTROL — all four alternate boards exist, so everything below has '
   + 'something to check (rule 3e)',
  SOURCES.every(k => boards[k] && Array.isArray(boards[k].players) && boards[k].players.length),
  SOURCES.map(k => ({ k, n: boards[k] ? (boards[k].players || []).length : null })));

const rankOf = (players, name) => {
  const p = players.find(x => x.name === name);
  return p ? p.overall_rank : null;
};

/* ── 1. THE TOGGLE GENUINELY RE-RANKS — the auditor's required test ─────────*/
SOURCES.forEach(k => {
  const b = boards[k];
  if (!b) return;
  const common = b.players.filter(p => blend.players
    .some(q => String(q.player_id) === String(p.player_id)));
  const moved = common.filter(p => {
    const q = blend.players.find(x => String(x.player_id) === String(p.player_id));
    return q && q.overall_rank != null && p.overall_rank !== q.overall_rank;
  });
  ck('switching to ' + b.source_label + ' moves at least 50 players\' overall_rank '
     + '— a toggle that changed nothing would be a lie on the banner',
    moved.length >= 50, { source: k, moved: moved.length, compared: common.length });
});

/* THE NAMED EXAMPLE I QUOTED. Not pinned to an exact rank, which would break on
 * every board rebuild and teach the next reader to delete the test. Pinned to
 * the CLAIM: Sleeper rates Bowers materially higher than the blend does. */
const bowersBlend = rankOf(blend.players, 'Brock Bowers');
const bowersSleeper = boards.sleeper ? rankOf(boards.sleeper.players, 'Brock Bowers') : null;
ck('THE EXAMPLE I GAVE CORY, PINNED — Sleeper ranks Brock Bowers higher than '
   + 'the blend does. I quoted "TE Bowers #7 on Sleeper, outside the top 8 on '
   + 'blend" in conversation with nothing checking it.',
  bowersSleeper != null && bowersBlend != null && bowersSleeper < bowersBlend,
  { sleeper: bowersSleeper, blend: bowersBlend });

/* ── 2. K/DEF-ABSENT SOURCES MUST NOT CORRUPT THE RECOMMEND PATH ───────────*/
const MLV = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));
const league = { starters: blend.league.starters };
['own', 'fp'].forEach(k => {
  const b = boards[k];
  if (!b) return;
  const hasK = b.players.some(p => p.position === 'K');
  const hasDEF = b.players.some(p => p.position === 'DEF');
  ck('CONTROL — ' + b.source_label + ' really does project no kickers/defenses, '
     + 'so the corruption check below is exercising the real hole',
    !hasK && !hasDEF, { K: hasK, DEF: hasDEF });

  let rec = null, threw = null;
  try { rec = MLV.recommend(b.players, [], { league, topN: 5 }); }
  catch (e) { threw = e && e.message; }
  ck('...and recommend() still returns a usable list on it rather than throwing '
     + 'or emptying — a source missing two required positions must degrade, not '
     + 'break the panel Cory drafts from',
    !threw && rec && rec.length > 0, { threw, n: rec ? rec.length : 0 });

  ck('...and the board DECLARES the gap in its own header, so the UI can warn '
     + 'rather than silently omit positions Cory is required to start',
    b.players_dropped > 0 && Array.isArray(b.dropped_inside_top150),
    { dropped: b.players_dropped });
});

/* ── 3. THE BENCH-RULE SHAPE CLAIM I QUOTED ────────────────────────────────*/
const planPath = path.join(PUB, 'mlv_plan.json');
if (fs.existsSync(planPath)) {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const worst = Object.entries(plan.vs_top3_finishers || {})
    .reduce((m, [q, v]) => (Math.abs(v.delta) > Math.abs(m.delta) ? { q, delta: v.delta } : m),
      { q: null, delta: 0 });
  ck('THE OTHER NUMBER I QUOTED, PINNED — the bench rule lands within ONE BODY '
     + 'of the top-3-finisher shape at every position. I told Cory "within 0.56"; '
     + 'the bar here is 1.0 so a rebuild does not break it, but a REGRESSION to '
     + 'the old board-rank tail (TE +4.33, WR -3.00) fails loudly.',
    Math.abs(worst.delta) < 1.0, worst);

  ck('...and the tail is not a tight-end stack — the defect Cory caught by eye',
    (plan.final_shape.TE || 0) <= 3, { te: plan.final_shape.TE });
} else {
  ck('CONTROL — mlv_plan.json exists so the shape claim can be checked', false, null);
}

/* ── THE BIG BOARD TAB MUST FOLLOW THE TOGGLE ──────────────────────────────
 * Cory, 2026-08-20: "when I select big board tab it shows me actual ranking of
 * selected source correct?" It did NOT. context() used the swapped board so the
 * recommendation and VONA followed, but renderBoard() read `state.board` raw,
 * so the Big Board kept painting the BLEND's order under a Draft Sharks
 * heading. Same class as the mock-end label lie: a surface asserting a source
 * it is not using. */
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
/* A FIXED-WIDTH SLICE IS A TRAP: adding a comment block above the code pushed
 * it out of a 3000-char window and turned two green checks red without the
 * behaviour changing at all. Slice to the NEXT function instead, so the window
 * tracks the function rather than its byte count. */
const rbStart = APP.indexOf('function renderBoard()');
const rbEnd = APP.indexOf('\n  function ', rbStart + 10);
const renderBoardSrc = APP.slice(rbStart, rbEnd > rbStart ? rbEnd : rbStart + 8000);
ck('renderBoard uses the SOURCE-ADJUSTED board, not state.board raw — the Big '
   + 'Board tab is where Cory reads rankings and it was ignoring his selection',
  /sourceAdjustedBoard\(\)/.test(renderBoardSrc), null);

ck('...and re-orders when a source is active, because forSource swaps the '
   + 'FIELD but the array still arrives in blend order',
  /state\.rankSource/.test(renderBoardSrc) && /overall_rank/.test(renderBoardSrc), null);

/* Cory, 2026-08-20: "it should just be pure ranking from that source!" */
ck('SLEEPER uses its OWN published rank, because that is the one source whose '
   + 'board we actually hold (sleeper_rank, all 700 players) — for the others '
   + 'we ingested projections, not rankings',
  /sleeper:\s*'sleeper_rank'/.test(renderBoardSrc), null);

ck('...and the ordering is DECLARED to the panel rather than inferred from a '
   + 'source name, so the heading cannot imply a board we do not have',
  /bigBoardOrdering/.test(APP)
    && /Sleeper\\'s own published/.test(APP)
    && /our replacement math on/.test(APP), null);

ck('KNOWN NEGATIVE — on BLEND it does not re-sort at all, so the shipped order '
   + 'is byte-identical and this fix cannot have moved the default board',
  /if \(!state\.rankSource\) return b;/.test(renderBoardSrc), null);

/* And the data behind it must actually differ, or the fix is cosmetic. */
const withRank = k => {
  const b = boards[k];
  if (!b) return null;
  return b.players.filter(p => p.overall_rank != null).length;
};
ck('CONTROL — the board carries a per-source overall_rank for every source the '
   + 'toggle offers, which is what makes the re-order possible at all',
  SOURCES.every(k => {
    const n = blend.players.filter(p => p['overall_rank_' + (k === 'own' ? 'ownmodel'
      : k === 'fp' ? 'fantasypros' : k)] != null).length;
    return n > 100;
  }),
  SOURCES.map(k => ({ k, n: blend.players.filter(p => p['overall_rank_'
    + (k === 'own' ? 'ownmodel' : k === 'fp' ? 'fantasypros' : k)] != null).length })));

/* ── 4. THE BOARDS ARE NOT STALE RELATIVE TO THE BLEND ─────────────────────*/
SOURCES.forEach(k => {
  const b = boards[k];
  if (!b) return;
  ck(b.source_label + '\'s board declares the blend build it came from, so '
     + 'staleness is checkable rather than invisible (relay\'s tripwire reads this)',
    !!b.built_from_board, { built_from_board: b.built_from_board });
});

console.log('\n%d checks, %d failed', 26, fails.length);
if (fails.length) { console.log('FAILED'); process.exit(1); }
