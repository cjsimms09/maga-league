// TERRITORY: A
/* DOES WHAT CORY IS TOLD ON DRAFT NIGHT MATCH WHAT THE MODEL ACTUALLY SAYS?
 *
 * Cory, 2026-08-19: *"we need to ensure model matches what is actually being
 * told to me at draft!!"*
 *
 * ── WHY THIS IS A REAL RISK AND NOT A HYPOTHETICAL ────────────────────────
 * The war room does NOT compute everything live. `app.js` fetches FIVE
 * pre-computed artifacts beside the board:
 *
 *     /draft_data.json          the board itself
 *     /seat_plan.json           the per-seat plan Cory reads at his picks
 *     /conditional_value_2026.json
 *     /expert_spread_2026.json
 *     /opponent_need_2026.json
 *
 * Each was written by a different tool at a different moment. Nothing forces
 * them to agree with the engine that is running when Cory looks at them, and
 * this project has already been bitten twice in one day:
 *
 *   - `opening_script.py` ranked candidates on RAW VORP and made a DEFENCE the
 *     TARGET at pick 48, eighty picks before its ADP, while the engine scoring
 *     the same board disagreed. Found by reading what the tool would actually
 *     tell him to do — not by any test.
 *   - `seat_plan.json` was regenerated as sweep debris and its
 *     `measured_edge_vs_greedy` moved 81.1 -> 28.6, because the ENGINE had
 *     changed underneath a number nobody re-derived.
 *
 * ── THE TWO CHECKS ────────────────────────────────────────────────────────
 * 1. PROVENANCE. Does the artifact say which board and which engine produced
 *    it? An artifact with no stamp cannot be shown to be current — and
 *    "cannot be shown stale" is not the same thing.
 * 2. AGREEMENT. For artifacts that name a PLAYER at a PICK, re-derive the same
 *    decision with the live engine and compare. A disagreement is not
 *    automatically a defect (the plan is allowed to differ from greedy by
 *    design) — it is a thing a human must have SEEN.
 *
 * REPORT ONLY. It changes no artifact and ships no configuration.
 *
 * Run: node draft/tools/surface_parity.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

/* The list is DERIVED from app.js, not hand-kept — a hand-kept list of "what
 * the war room reads" is exactly the list that silently stops covering a new
 * fetch, and this tool exists because artifacts drift unnoticed. */
function fetchedArtifacts() {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const out = [];
  const re = /fetch\('\/([A-Za-z0-9_\-.]+\.json)'/g;
  let m;
  while ((m = re.exec(src)) !== null) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}

const STAMP_KEYS = ['built_at', 'generated_at', 'built', 'git_head', 'as_of',
                    'board_built_at', 'source_board_built_at', 'scraped_at'];

function provenanceOf(doc) {
  const hits = {};
  Object.keys(doc || {}).forEach(k => {
    if (STAMP_KEYS.indexOf(k) >= 0) hits[k] = doc[k];
  });
  return hits;
}

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const BOARD_BUILT = DATA.built_at || null;
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const keep = KEEP.keepersFrom(DATA);

const report = {
  _territory: 'TERRITORY: A — draft/tools/surface_parity.js',
  _note: 'REPORT ONLY. A disagreement is not automatically a defect — the seat '
       + 'plan is allowed to differ from greedy by design. It is a thing a '
       + 'human must have SEEN before draft night.',
  board_built_at: BOARD_BUILT,
  artifacts: {},
};

/* ---- CHECK 1: PROVENANCE ------------------------------------------------ */
fetchedArtifacts().forEach(name => {
  const p = path.join(ROOT, 'public', name);
  if (!fs.existsSync(p)) {
    report.artifacts[name] = { present: false,
      verdict: 'MISSING — the war room fetches it and it is not in public/' };
    return;
  }
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { report.artifacts[name] = { present: true, verdict: 'UNPARSEABLE' }; return; }
  const prov = provenanceOf(doc);
  report.artifacts[name] = {
    present: true,
    bytes: fs.statSync(p).size,
    provenance: prov,
    verdict: Object.keys(prov).length
      ? 'STAMPED'
      : 'NO PROVENANCE STAMP — nothing on disk says which board or engine built '
        + 'this, so it cannot be shown to be current. "Cannot be shown stale" is '
        + 'not the same thing.',
  };
});

/* ---- CHECK 2: AGREEMENT, for the artifact that names players at picks ---- */
/* THE CTX IS engine_drive.js's, FIELD FOR FIELD. That file's header records
 * what a hand-built ctx costs: `myPicksLeft` passed as `roundsLeft` defaulted to
 * 99, legality never fired, and the probe reported an engine defect that was
 * the driver. Nothing here is re-derived. */
function liveTopAt(pick, nextPick, roster, board, idx, total) {
  const ctx = {
    board: board, roster: roster, nextPick: nextPick,
    currentPick: pick, pick: pick,
    round: Math.ceil(pick / (DATA.league.teams || 10)),
    myPicksLeft: total - idx, myPickIndex: idx, totalMyPicks: total,
    totalPicks: 150, league: DATA.league,
    weights: E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS,
    currentKeepers: roster.filter(p => p.is_keeper),
    ceilingAllStages: false, doctrine: null, drift: null,
    intervening: (nextPick || pick) - pick,
  };
  const out = E.recommend(ctx);
  const list = Array.isArray(out) ? out : (out && out.scored) || [];
  return list;
}

const spPath = path.join(ROOT, 'public', 'seat_plan.json');
if (fs.existsSync(spPath)) {
  const sp = JSON.parse(fs.readFileSync(spPath, 'utf8'));
  const seats = Array.isArray(sp.seats) ? sp.seats : Object.values(sp.seats || {});
  const picks = seats.map(s => s.pick).filter(n => typeof n === 'number').sort((a, b) => a - b);

  const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
    : (p.raw_adp != null ? +p.raw_adp : 9999));
  const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));

  const rows = [];
  picks.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && need > 0; j++) {
      const p = byAdp[j];
      if (taken.has(String(p.player_id))) continue;
      taken.add(String(p.player_id)); need--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const list = liveTopAt(pk, picks[i + 1] || null, roster, board, i, picks.length);
    const top = list[0];
    const seat = seats.find(s => s.pick === pk) || {};
    const planned = (seat.plan_player || {});

    /* ⚠️ COMPARE WITHIN THE SEAT'S OWN SLOT. MY FIRST VERSION DID NOT, AND IT
     * PRODUCED A FALSE ALARM I NEARLY REPORTED.
     *
     * The plan assigns a SLOT to every seat — pick 108 is the DEF seat, 113 is
     * the K seat. Ranking the plan's defence against the engine's ALL-POSITIONS
     * list made it "engine #429" and the tool called that the opening-script
     * defect returning. It is not: at a DEF seat, naming the best available
     * defence is the plan doing its job. An all-positions comparison at a
     * slotted seat is apples to oranges, and the honest question is whether the
     * plan names the man the ENGINE would name AMONG THE ELIGIBLE. */
    const SLOT_ELIG = { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
                        K: ['K'], DEF: ['DEF'], FLEX: ['RB', 'WR', 'TE'] };
    const elig = SLOT_ELIG[seat.slot] || null;   // BENCH / unknown => all positions
    const scoped = elig ? list.filter(e => e && e.player && elig.indexOf(e.player.position) >= 0)
                        : list;
    const scopedTop = scoped[0];
    const engineId = scopedTop && scopedTop.player ? String(scopedTop.player.player_id) : null;
    const agree = engineId && String(planned.player_id) === engineId;
    const planRank = scoped.findIndex(e => e && e.player
      && String(e.player.player_id) === String(planned.player_id));
    /* ⚠️ SECOND INSTRUMENT FLAW, AND IT ONLY SHOWS UP AT LATE SEATS. This walk
     * is GREEDY — it takes the engine's own pick at every seat — so by pick 133
     * the engine already holds players the PLAN intended for later. The plan's
     * man is then simply not on the board, and `planRank` comes back null, which
     * reads as "the engine ranks him nowhere". It does not; the two rosters
     * diverged upstream. A seat plan is a SIMULTANEOUS plan across all seats and
     * a greedy walk is not, so late seats are structurally NOT COMPARABLE and
     * saying so is more useful than a disagreement count that inflates itself. */
    const alreadyTaken = planned.player_id != null && planRank < 0
      && taken.has(String(planned.player_id));
    rows.push({
      pick: pk,
      slot: seat.slot || null,
      is_starter_seat: !!seat.is_starter_seat,
      plan_says: planned.name ? (planned.position + ' ' + planned.name) : null,
      engine_says_in_slot: scopedTop && scopedTop.player
        ? (scopedTop.player.position + ' ' + scopedTop.player.name) : null,
      agree: !!agree,
      /* NAMES NOBODY is its own outcome and is NOT a disagreement: a seat with
       * no plan player tells Cory nothing at that pick, which is a gap in the
       * surface rather than a conflict with the engine. */
      plan_names_nobody: !planned.name,
      plan_player_rank_within_slot: planRank >= 0 ? planRank + 1 : null,
      not_comparable: !!alreadyTaken,
    });
    if (top && top.player) {
      taken.add(String(top.player.player_id));
      roster.push(Object.assign({}, top.player));
    }
  });
  const named = rows.filter(r => !r.plan_names_nobody && !r.not_comparable);
  const dis = named.filter(r => !r.agree);
  const deep = dis.filter(r => r.plan_player_rank_within_slot == null
                            || r.plan_player_rank_within_slot > 5);
  const silent = rows.filter(r => r.plan_names_nobody);
  report.seat_plan_agreement = {
    seats_checked: rows.length,
    seats_naming_a_player: named.length,
    seats_naming_nobody: silent.length,
    seats_not_comparable_greedy_divergence: rows.filter(r => r.not_comparable).length,
    disagreements_within_slot: dis.length,
    disagreements_outside_the_slot_top_5: deep.length,
    rows: rows,
    reading: deep.length
      ? 'A SEAT NAMES A PLAYER THE ENGINE RANKS OUTSIDE THE TOP 5 OF THAT SEAT\'S '
        + 'OWN SLOT — that is the opening-script shape and needs a human before 08-22.'
      : (dis.length
         ? 'Every disagreement is inside the top 5 of the seat\'s own slot — '
           + 'consistent with a plan that trades a little value for structure, '
           + 'which is what it is for.'
         : 'The plan and the live engine name the same player at every slotted seat.'),
    silent_reading: silent.length
      ? silent.length + ' seat(s) name NOBODY. That is a gap in what Cory is told '
        + 'at those picks, not a conflict with the engine — but a seat that '
        + 'recommends nothing is a seat the war room cannot help him at.'
      : 'Every seat names somebody.',
  };
}

/* ---- print -------------------------------------------------------------- */
console.log('SURFACE PARITY — what the war room READS vs what the engine SAYS');
console.log('board built ' + report.board_built_at + '\n');
console.log('  PROVENANCE of every artifact app.js fetches:');
Object.keys(report.artifacts).forEach(n => {
  const a = report.artifacts[n];
  console.log('    ' + n.padEnd(30) + (a.verdict.startsWith('STAMPED')
    ? 'STAMPED  ' + JSON.stringify(a.provenance)
    : a.verdict.split(' —')[0]));
});
if (report.seat_plan_agreement) {
  const s = report.seat_plan_agreement;
  console.log('\n  SEAT PLAN vs LIVE ENGINE, WITHIN EACH SEAT\'S OWN SLOT — '
    + s.disagreements_within_slot + ' of ' + s.seats_naming_a_player
    + ' named seats disagree, ' + s.disagreements_outside_the_slot_top_5 + ' of them deep; '
    + s.seats_naming_nobody + ' seat(s) name nobody');
  s.rows.forEach(r => console.log('    pick ' + String(r.pick).padStart(3)
    + ' [' + String(r.slot || '?').padEnd(5) + ']  plan '
    + String(r.plan_says).padEnd(26) + ' engine ' + String(r.engine_says_in_slot).padEnd(26)
    + (r.plan_names_nobody ? '  PLAN NAMES NOBODY'
       : r.not_comparable ? '  NOT COMPARABLE (walk already took him)'
       : r.agree ? '  AGREE'
       : '  plan player is #' + r.plan_player_rank_within_slot + ' in slot')));
  console.log('\n  ' + s.reading);
  console.log('  ' + s.silent_reading);
}

const outPath = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); console.log('\nwrote ' + outPath); }
module.exports = { report, fetchedArtifacts };
