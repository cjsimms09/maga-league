// TERRITORY: A
/* CAN THE ROSTER THE TOOL BUILDS ACTUALLY BE FIELDED EVERY WEEK?
 *
 * Register 59 says the tool drafts a roster with an EMPTY WR SLOT in week 11.
 * That is the cleanest kind of defect there is — not a projection being a
 * little wrong, but a zero on the scoreboard for a slot nobody could fill.
 *
 * ── WHY THIS EXISTS AS ITS OWN PROBE ────────────────────────────────────────
 * `SLOT-AWARE-VONA-REPREG-2026-08-19.md` set four ship conditions and the third
 * was "s1 must not increase the count of un-fieldable weeks". **I could not
 * evaluate it**: the seat replay's `optimal` estimand CONSTRUCTS a legal lineup
 * every week by definition, so it can never report one. I wrote a condition
 * against an instrument that cannot answer it, which is the same error as
 * measuring a null on an instrument that could not have seen the effect.
 *
 * This measures it directly instead, on the live board, where byes are known.
 *
 * ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────────
 * The room is drained in strict ADP order, which the real room will not be. So
 * these are the ENGINE'S OWN tendencies under a synthetic room, not a forecast
 * of the 22nd — the same caveat `auto_adjuster_probe.js` carries, and the same
 * reason register 67 exists (my ADP-order probe says RB10; the seat replay says
 * RB 4.77, and B's war-room walk is what settles which is real).
 *
 * REPORT ONLY. Ships no flag, writes no config.
 *
 * Run: node draft/tools/fieldability_probe.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null,
                    addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const ENGINE_PATH = path.join(ROOT, 'public', 'js', 'draft', 'engine.js');
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const STARTERS = (DATA.league && DATA.league.starters) || {};
const FLEX_ELIG = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
                    REC_FLEX: ['WR', 'TE'] };

/* THE BYE WEEKS THIS BOARD ACTUALLY CARRIES — discovered, never a hardcoded
 * 1..18. A season whose bye range moves would otherwise be checked against the
 * wrong weeks and report a clean sheet. */
const BYE_WEEKS = Array.from(new Set(
  DATA.players.filter(p => p.bye).map(p => +p.bye))).sort((a, b) => a - b);

/* CAN THIS SET OF PLAYERS FILL EVERY STARTING SLOT IN WEEK `wk`?
 *
 * Greedy would be wrong: filling FLEX first can strand a dedicated slot. This
 * is a small bipartite matching (players -> slots) solved by augmenting paths,
 * so "un-fieldable" means genuinely un-fieldable rather than
 * "my heuristic could not find it". */
function fieldable(roster, wk) {
  const slots = [];
  Object.keys(STARTERS).forEach(s => {
    for (let i = 0; i < STARTERS[s]; i++) slots.push(s);
  });
  const avail = roster.filter(p => +p.bye !== wk && p.position);
  const eligible = (p, slot) => (FLEX_ELIG[slot]
    ? FLEX_ELIG[slot].indexOf(p.position) >= 0
    : p.position === slot);

  const slotOf = new Array(slots.length).fill(-1);
  function tryAssign(pi, seen) {
    for (let s = 0; s < slots.length; s++) {
      if (seen[s] || !eligible(avail[pi], slots[s])) continue;
      seen[s] = true;
      if (slotOf[s] < 0 || tryAssign(slotOf[s], seen)) { slotOf[s] = pi; return true; }
    }
    return false;
  }
  let filled = 0;
  for (let i = 0; i < avail.length; i++) {
    if (tryAssign(i, new Array(slots.length).fill(false))) filled++;
  }
  const unfilled = [];
  slots.forEach((s, i) => { if (slotOf[i] < 0) unfilled.push(s); });
  return { ok: unfilled.length === 0, unfilled: unfilled, bodies: avail.length,
           slots: slots.length };
}

function loadEngine(flags) {
  delete require.cache[require.resolve(ENGINE_PATH)];
  const E = require(ENGINE_PATH);
  Object.keys(flags || {}).forEach(k => {
    if (!(k in E.CFG)) throw new Error('unknown engine flag ' + k);
    E.CFG[k] = flags[k];
  });
  return E;
}

const keep = KEEP.keepersFrom(DATA);
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

function walk(E, weightsFor) {
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  SCHED.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && need > 0; j++) {
      if (taken.has(String(byAdp[j].player_id))) continue;
      taken.add(String(byAdp[j].player_id)); need--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const ctx = {
      board: board, roster: roster, nextPick: SCHED[i + 1] || null,
      currentPick: pk, pick: pk, round: Math.ceil(pk / (DATA.league.teams || 10)),
      myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
      totalPicks: 150, league: DATA.league, currentKeepers: keep,
      ceilingAllStages: false, doctrine: null, drift: null, intervening: 5,
      wireWeekly: DATA.wire_level || null,
    };
    ctx.weights = weightsFor(E, ctx);
    const out = E.recommend(ctx);
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    const top = list[0];
    if (!top || !top.player) return;
    taken.add(String(top.player.player_id));
    roster.push(Object.assign({}, top.player));
  });
  return roster;
}

const ARMS = {
  shipped: { flags: { VONA_INCLUDE_SELF: true, VONA_SLOT_AWARE: false },
             w: E => E.MEASURED_WEIGHTS },
  slot_aware: { flags: { VONA_INCLUDE_SELF: true, VONA_SLOT_AWARE: true },
                w: E => E.MEASURED_WEIGHTS },
  need1: { flags: { VONA_INCLUDE_SELF: true, VONA_SLOT_AWARE: false },
           w: E => Object.assign({}, E.MEASURED_WEIGHTS, { need: 1.0 }) },
  auto: { flags: { VONA_INCLUDE_SELF: true, VONA_SLOT_AWARE: false },
          w: (E, ctx) => { const a = E.autoWeights(ctx); return (a && a.weights) ? a.weights : a; } },
};

/* THE WALK ONLY RUNS WHEN THIS FILE IS INVOKED DIRECTLY. Its own test file
 * requires it for `fieldable()`, and a module that drafts four rosters on
 * require() makes that test slow and couples it to the live board. */
function run() {
const report = {
  _territory: 'TERRITORY: A — draft/tools/fieldability_probe.js',
  _note: 'REPORT ONLY. Room drained in strict ADP order, which the real room '
       + 'will not be — the engine\'s own tendency, not a forecast of the 22nd '
       + '(register 67).',
  board_built_at: DATA.built_at || null,
  starters: STARTERS,
  bye_weeks_on_this_board: BYE_WEEKS,
  arms: {},
};

Object.keys(ARMS).forEach(name => {
  const E = loadEngine(ARMS[name].flags);
  const roster = walk(E, ARMS[name].w);
  const weeks = {};
  const bad = [];
  BYE_WEEKS.forEach(wk => {
    const r = fieldable(roster, wk);
    weeks[wk] = r;
    if (!r.ok) bad.push({ week: wk, unfilled: r.unfilled });
  });
  const counts = {};
  roster.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });
  /* K AND DEF ARE SEPARATED, AND WITHOUT THIS THE PROBE CRIES WOLF ON EVERY
   * ARM. The tool drafts exactly one kicker and one defence, so EVERY roster is
   * "un-fieldable" in its own kicker's bye week — that is not a defect, it is
   * how the position is played: you stream a kicker off waivers for one week
   * and nobody thinks about it again. Counting those hides the real signal,
   * which is a SKILL slot nobody can fill. Both are reported; the skill count
   * is the decision-relevant one. */
  const skillBad = bad
    .map(b => ({ week: b.week,
                 unfilled: b.unfilled.filter(u => u !== 'K' && u !== 'DEF') }))
    .filter(b => b.unfilled.length);
  report.arms[name] = { roster_size: roster.length, counts: counts,
                        unfieldable_weeks: bad,
                        unfieldable_skill_weeks: skillBad, weeks: weeks };
});

console.log('FIELDABILITY — can the drafted roster fill every starting slot, board '
            + report.board_built_at);
console.log('  starters: ' + JSON.stringify(STARTERS));
console.log('  bye weeks on this board: ' + BYE_WEEKS.join(', ') + '\n');
Object.keys(report.arms).forEach(name => {
  const a = report.arms[name];
  const tag = a.unfieldable_skill_weeks.length
    ? '🔴 ' + a.unfieldable_skill_weeks.length + ' UN-FIELDABLE SKILL WEEK(S)'
    : '✅ every skill slot fillable, all weeks';
  console.log('  ' + name.padEnd(12) + JSON.stringify(a.counts).padEnd(46) + tag);
  a.unfieldable_skill_weeks.forEach(b =>
    console.log('        week ' + String(b.week).padStart(2) + ' cannot fill: '
                + b.unfilled.join(', ')));
  const kd = a.unfieldable_weeks.filter(b =>
    b.unfilled.every(u => u === 'K' || u === 'DEF'));
  if (kd.length) {
    console.log('        (' + kd.length + ' K/DEF-only week(s): '
      + kd.map(b => b.week + ':' + b.unfilled.join('+')).join(' ')
      + ' — streamed, not a defect)');
  }
});

const outPath = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); console.log('\n  wrote ' + outPath); }
return report;
}

if (require.main === module) run();
module.exports = { run: run, fieldable: fieldable };
