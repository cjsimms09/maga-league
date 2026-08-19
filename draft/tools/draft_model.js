// TERRITORY: A
/* THE DRAFT MODEL — value early, a normal roster, upside at the end.
 *
 * Cory, 2026-08-19: "Ive been saying for 3 weeks.. build me a model that drafts
 * value early, builds a normal roster, and drafts for upside at the end!! we
 * need to do this in the next 2 days"
 *
 * Prereg: draft/DRAFT-MODEL-PREREG-2026-08-19.md (committed before this ran).
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 *
 * I twice built "value early / upside late" as a ramp on ROUND NUMBER, which is
 * a knob I chose. There is a football reason underneath that makes the knob
 * unnecessary:
 *
 *     A STARTER'S FLOOR CAN LOSE YOU A WEEK.
 *     A BENCH BODY'S FLOOR COSTS YOU NOTHING, BECAUSE YOU DROP HIM.
 *
 * If he starts, his bad season is yours to eat — you have to field him. If he
 * is the twelfth man on a fifteen-man roster his bad season ends with a waiver
 * claim in week 3, and the ONLY reason to spend a pick on him is the branch
 * where he hits.
 *
 * So which END of his band we read is decided by whether he starts, not by what
 * round it is:
 *
 *     w     = P(this body starts)              Cory's own curve, by bodies held
 *     safe  = proj − LEAN × (proj − floor)     a starter, priced at his bad weeks
 *     bold  = proj + LEAN × (ceiling − proj)   a bench body, priced at his good ones
 *     band  = w × safe + (1 − w) × bold
 *     value = max(0, band − wire(pos)) × w
 *
 * Early picks fill starting slots, so w ≈ 1 and they come out conservative.
 * Late picks land on positions already full, so w ≈ 0 and they come out on the
 * ceiling. "Value early, upside late" is an OUTPUT of this rule, not a setting
 * inside it — and the normal roster falls out of the same line, because a full
 * position has both a crushed multiplier and no claim on safety.
 *
 * ── ⛔ EVERY BAND IS THAT PLAYER'S OWN ──────────────────────────────────────
 *
 * Cory, same day: "you need to stop grouping players ceilings together by age or
 * position.. Each player has their own projected ceiling and it could be
 * irrelevant to another player at same age and position. ie. one rookie RB is
 * 2nd round pick and other is a non drafted player whos 4th on his teams depth
 * chart"
 *
 * He is describing a real defect I shipped. lineup_sim.js divided each band
 * width by VET_WIDTH[position] — the median width among 3+-year players at that
 * position — and scaled injury risk by RISK_MED[position]. Under that, his two
 * rookie backs are read against the same veteran denominator and a wide band is
 * reported as "wide FOR A RUNNING BACK" instead of as what Draft Sharks said
 * about HIM. Both tables are deleted; C1 below fails the run if a band term ever
 * meets a per-position aggregate again.
 *
 * The only position-indexed numbers in this file are the WAIVER level, which is
 * a property of the league's leftovers, and the need curve, which is a property
 * of the roster. Neither is a property of a player.
 *
 * REPORT ONLY. Writes draft/data/draft_model.json. Ships nothing.
 * Run: node draft/tools/draft_model.js [--lean 0.5] [--rooms 300]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const BL = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'blended_projection.json'), 'utf8'));
if (!BL.controls_all_passed) throw new Error('the blend failed its controls — REFUSING');

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE'];
const STARTERS = (BOARD.league || {}).roster_slots || {};
const SCHED = PLAN.SCHED;
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? +process.argv[i + 1] : d; };
const LEAN = Math.min(1, Math.max(0, arg('--lean', 0.5)));
const ROOMS = arg('--rooms', 300);
const DURABILITY = process.env.DURABILITY !== 'off';   // P212's off-arm
let DUR_OFF = false;                                   // toggled for the P212 arm

/* ── the wire: what the league actually leaves unrostered ─────────────────────
 * Per POSITION on purpose, and it is not a player property. Computed in
 * CORRECTED-WIRE-PREREG from this room's own three drafts: the (N+1)-th best at
 * each position where N is how many that position this league really takes. */
const WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };

/* ── w: P(this body starts), given how many I already hold ────────────────────
 * CORY'S OWN WORDS, transcribed, not fitted: "once have 1 QB and TE, equation
 * should severely restrict... WR should hold importance until you have 4 then
 * be cut, RB should hold until you have 3 then cut, and cut to almost 0 when
 * you have 4." Indexed by bodies held; the candidate is body held+1.
 * If the roster comes out wrong the response is to find the defect, NOT to
 * nudge these — no_fit_guard. */
const W = {
  K:   [1.00, 0],
  DEF: [1.00, 0],
  QB:  [1.00, 0.05, 0],
  TE:  [1.00, 0.05, 0],
  RB:  [1.00, 1.00, 0.90, 0.25, 0.05, 0.02],
  WR:  [1.00, 1.00, 1.00, 0.90, 0.15, 0.05],
};
const startProb = (pos, held) => {
  const row = W[pos];
  if (!row) return 0;
  return held < row.length ? row[held] : 0;
};

/* ── the pool ─────────────────────────────────────────────────────────────────
 * Blended projection — Cory: "lets use a mean projection from all, but using
 * the same proj % of draft shark". A player with NO Draft Sharks band enters
 * with floor = proj = ceiling, so LEAN cannot move him in either direction, and
 * C3 prints how many that is. Inventing a band for him is exactly the thing
 * Cory has spent two days correcting. */
const pool = [];
let noBand = 0;
BL.players.forEach(p => {
  if (!POS.includes(p.position) || p.adp == null || p.proj == null) return;
  const has = p.floor != null && p.ceiling != null;
  if (!has) noBand++;
  pool.push({
    id: p.player_id, name: p.name, position: p.position, adp: p.adp, bye: p.bye,
    proj: p.proj,
    floor: has ? p.floor : p.proj,
    ceiling: has ? p.ceiling : p.proj,
    banded: has,
    injury_risk_pct: p.injury_risk_pct,
    /* HIS band width, and it is divided by HIS OWN projection and by nothing
     * else. No cohort denominator. */
    band_width: p.proj > 0 && has ? (p.ceiling - p.floor) / p.proj : 0,
    /* ADP noise for draining the room; a market property, not a band term */
    sd: Math.max(4, p.adp * 0.18),
  });
});

/* ── THE BAND RULE ────────────────────────────────────────────────────────── */
function bandUsed(x, w, lean) {
  const safe = x.proj - lean * (x.proj - x.floor);
  const bold = x.proj + lean * (x.ceiling - x.proj);
  return w * safe + (1 - w) * bold;
}

/* ── DURABILITY — Cory asked, and the honest first answer was "it doesn't" ────
 *
 * "does your approach that you conceptulized take into account injury risk"
 *
 * It did not. Two checks decided how it enters, both run before this line was
 * written:
 *
 * 1. IT IS NOT ALREADY IN THE BAND. r(band width, injury risk) = −0.069 across
 *    the 247 players carrying both, so Draft Sharks' floor is not quietly
 *    pricing durability and using both is not double-counting.
 *
 * 2. THE TAX IS MEASURABLE HERE. Across 429 player-seasons of this league's own
 *    weeks, a rostered player posts EXACTLY ZERO in 16.9% of his rostered
 *    weeks. One bye is 5.9%, leaving 11.0% lost beyond it.
 *    ⚠️ That is an UPPER BOUND on missed games — "exactly zero" also catches a
 *    healthy scratch and a genuinely pointless afternoon.
 *
 * IT ENTERS ON THE SAME LEVER, because injury hurts asymmetrically by slot in
 * exactly the way the band does: a starter who misses time costs you real weeks,
 * you must field someone worse. A bench body who misses time costs you nearly
 * nothing — he was benched anyway and you drop him.
 *
 * MISS_MAX is the ONE global scalar that makes the model's mean availability
 * loss equal the measured 11.0% given the pool's mean risk of 31.6. It is an
 * anchor of the same class as WAIVER — calibrated to a league-wide aggregate,
 * with every player keeping his own DS number and his own place in the order.
 * It is NOT RISK_MED[position], the cohort scaler Cory forbade, which is gone. */
const MEASURED_ZERO_WEEK_SHARE = 0.169;      // this league, 429 player-seasons
const BYE_SHARE = 1 / 17;
const MEASURED_LOSS = MEASURED_ZERO_WEEK_SHARE - BYE_SHARE;   // 0.110
const POOL_MEAN_RISK = (() => {
  const v = BL.players.filter(p => p.injury_risk_pct != null).map(p => p.injury_risk_pct);
  return v.reduce((a, b) => a + b, 0) / v.length;             // 31.6
})();
const MISS_MAX = MEASURED_LOSS / (POOL_MEAN_RISK / 100);       // 0.348

/* his own number, ungrouped. No risk => no discount, which is right for K/DEF
 * (median 0) and is a fact about them rather than an exemption for them. */
const availOf = x => x.injury_risk_pct == null
  ? 1 : Math.max(0, 1 - MISS_MAX * (x.injury_risk_pct / 100));
const durability = (x, w) => { const a = availOf(x); return w * a + (1 - w); };

/* ── the room ─────────────────────────────────────────────────────────────── */
let _s = 20260819;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function unfilled(held) {
  /* how many STARTING slots are still empty, flex included */
  let n = 0;
  POS.forEach(q => { n += Math.max(0, (STARTERS[q] || 0) - (held[q] || 0)); });
  const surplus = FLEX_ELIGIBLE.reduce(
    (a, q) => a + Math.max(0, (held[q] || 0) - (STARTERS[q] || 0)), 0);
  return n + Math.max(0, (STARTERS.FLEX || 0) - surplus);
}

function runRoom(lean, hardFill) {
  const order = pool.map(p => ({ p, k: p.adp + gauss() * p.sd }))
    .sort((x, y) => x.k - y.k).map(x => x.p.id);
  const held = {};
  PLAN.keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
  const taken = new Set(), got = [];
  SCHED.forEach((pk, i) => {
    const gone = new Set(order.slice(0, pk - 1));
    const avail = pool.filter(x => !taken.has(x.id) && !gone.has(x.id));
    /* CORY'S HARD RULE: "must draft 1 k and 1 def!! If 2 rounds and don't have
     * either it equation should force." Kept ON in BOTH arms — C4. A comparator
     * allowed to skip it drafts twelve quarterbacks and hands back a fake
     * improvement, which has happened twice on this project. */
    const must = unfilled(held);
    const forcing = (SCHED.length - i) <= must;
    let best = null, bestV = -Infinity, bestParts = null;
    for (const x of avail) {
      const w = startProb(x.position, held[x.position] || 0);
      if (forcing && w <= 0) continue;
      if (forcing && (STARTERS[x.position] || 0) <= (held[x.position] || 0)
          && !FLEX_ELIGIBLE.includes(x.position)) continue;
      const band = bandUsed(x, w, lean);
      const dur = (DURABILITY && !DUR_OFF) ? durability(x, w) : 1;
      const v = Math.max(0, band - (WAIVER[x.position] || 0)) * w * dur;
      if (v > bestV) { bestV = v; best = x; bestParts = { w, band, dur }; }
    }
    if (!best) return;
    taken.add(best.id);
    held[best.position] = (held[best.position] || 0) + 1;
    got.push({ pick: pk, round: i + 1, name: best.name, position: best.position,
      proj: best.proj, floor: best.floor, ceiling: best.ceiling,
      band_width: best.band_width, banded: best.banded,
      injury_risk_pct: best.injury_risk_pct,
      w: +bestParts.w.toFixed(3), band_used: +bestParts.band.toFixed(1),
      durability: +bestParts.dur.toFixed(3),
      value: +bestV.toFixed(1) });
  });
  return { got, held, empty_starting_slots: unfilled(held) };
}

/* ── C2: THE KNOWN POSITIVE, because rule 3e forbids a null probe without one ─
 * Plant a man at a bench-slot position whose projection matches his neighbours
 * but whose ceiling is enormous. If the ceiling arm cannot move a pick when the
 * ceiling difference is made huge, then any "ceilings don't matter" result
 * later is uninterpretable. */
function knownPositive() {
  const wr = pool.filter(x => x.position === 'WR' && x.adp > 90 && x.adp < 140)
    .sort((a, b) => b.proj - a.proj);
  if (wr.length < 3) return { ok: false, why: 'not enough late WRs to plant into' };
  const twin = wr[1];
  const plant = { ...twin, id: '__PLANT__', name: 'PLANT (ceiling +150)',
    floor: twin.proj, ceiling: twin.proj + 150, banded: true,
    band_width: 150 / twin.proj };
  const held = { WR: 4, RB: 3, QB: 1, TE: 1 };      // bench slot: w small
  const w = startProb('WR', held.WR);
  const atLean0 = bandUsed(plant, w, 0) - bandUsed(twin, w, 0);
  const atLean1 = bandUsed(plant, w, 1) - bandUsed(twin, w, 1);
  return { ok: Math.abs(atLean0) < 1e-9 && atLean1 > 50,
    w_at_a_bench_slot: w,
    gap_at_lean_0: +atLean0.toFixed(3), gap_at_lean_1: +atLean1.toFixed(1),
    why: 'a planted +150 ceiling must be worth NOTHING at LEAN=0 and a lot at '
       + 'LEAN=1 in a bench slot. If it cannot move here, a null result on '
       + 'ceilings anywhere else means nothing (rule 3e).' };
}

/* ── C5: the durability term's OWN known positive (rule 3e) ───────────────────
 * A twin at maximum risk must lose value in a STARTING slot and must lose
 * materially less in a BENCH slot. If the term cannot move a pick when the risk
 * difference is maximal, then P212 coming back FALSE would tell us nothing. */
function durabilityKnownPositive() {
  const base = { injury_risk_pct: 0 }, worst = { injury_risk_pct: 85 };  // pool max
  const starterLoss = 1 - durability(worst, 1) / durability(base, 1);
  const benchLoss = 1 - durability(worst, 0.05) / durability(base, 0.05);
  return { ok: starterLoss > 0.15 && benchLoss < starterLoss / 3,
    miss_max: +MISS_MAX.toFixed(3),
    pool_mean_risk: +POOL_MEAN_RISK.toFixed(1),
    measured_weeks_lost_beyond_bye: +MEASURED_LOSS.toFixed(3),
    value_lost_by_a_max_risk_starter: +starterLoss.toFixed(3),
    value_lost_by_a_max_risk_bench_body: +benchLoss.toFixed(3),
    why: 'injury must bite the starter and barely touch the bench body — that '
       + 'asymmetry IS the term. A uniform discount would be a knob for nothing.' };
}

/* ── C1: no cohort statistic may touch a band ─────────────────────────────────
 * Enforced by reading this file's own source. The band terms are proj, floor,
 * ceiling and band_width; the only per-position tables permitted are WAIVER and
 * W (the need curve). If a future edit reintroduces a VET_WIDTH-style table the
 * run fails here rather than quietly grouping players again. */
function noCohortBands() {
  const src = fs.readFileSync(__filename, 'utf8');
  const banned = ['VET_WIDTH', 'VET_CV', 'WEEK_CV', 'RISK_MED', 'Q_POS'];
  const found = banned.filter(t => src.split(t).length > 2);   // >2 = a real use
  const perPosTables = (src.match(/^const ([A-Z_]+) = \{[^}]*QB:/gm) || [])
    .map(m => m.match(/const ([A-Z_]+)/)[1]);
  const allowed = ['WAIVER', 'W'];
  const extra = perPosTables.filter(t => !allowed.includes(t));
  return { ok: found.length === 0 && extra.length === 0,
    banned_cohort_tables_found: found,
    per_position_tables_present: perPosTables,
    permitted: allowed,
    why: "Cory: 'Each player has their own projected ceiling and it could be "
       + "irrelevant to another player at same age and position.' WAIVER is a "
       + 'property of the league leftovers and W of the roster; neither is a '
       + 'property of a player. Anything else touching a band is the defect.' };
}

/* ── run ──────────────────────────────────────────────────────────────────── */
const rooms = [];
for (let i = 0; i < ROOMS; i++) rooms.push(runRoom(LEAN, true));

const meanBy = f => rooms.reduce((a, r) => a + f(r), 0) / rooms.length;
const roster = {};
POS.forEach(q => { roster[q] = +meanBy(r => r.got.filter(g => g.position === q).length).toFixed(2); });
const rosterWithKeepers = {};
POS.forEach(q => {
  const k = PLAN.keep.filter(x => x.position === q).length;
  rosterWithKeepers[q] = +(roster[q] + k).toFixed(2);
});
const wrOverRb = rooms.filter(r =>
  r.got.filter(g => g.position === 'WR').length + 1 >
  r.got.filter(g => g.position === 'RB').length + 2).length / rooms.length;

/* P210 — early picks vs late picks, on band width. The prediction is that this
 * model puts its wild men LAST without ever being told about rounds. */
const widthOf = (r, from, to) => {
  const g = r.got.slice(from, to).filter(x => x.banded);
  return g.length ? g.reduce((a, x) => a + x.band_width, 0) / g.length : null;
};
const early = rooms.map(r => widthOf(r, 0, 4)).filter(v => v != null);
const late = rooms.map(r => widthOf(r, 8, 12)).filter(v => v != null);
const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
const eW = mean(early), lW = mean(late);

/* P211 — the identities Cory specified for the knob */
const probe = pool.find(x => x.banded && x.position === 'WR');
const ident = {
  lean0_is_pure_projection: Math.abs(bandUsed(probe, 0.5, 0) - probe.proj) < 1e-9,
  lean1_bench_is_pure_ceiling: Math.abs(bandUsed(probe, 0, 1) - probe.ceiling) < 1e-9,
  lean1_starter_is_pure_floor: Math.abs(bandUsed(probe, 1, 1) - probe.floor) < 1e-9,
  lean_half_is_half_the_added_ceiling:
    Math.abs(bandUsed(probe, 0, 0.5) - (probe.proj + 0.5 * (probe.ceiling - probe.proj))) < 1e-9,
};

const onesies = ['QB', 'TE', 'K', 'DEF'].every(q => Math.abs(rosterWithKeepers[q] - 1) <= 0.1);
/* P212 — durability moves picks, and the RIGHT ones. Starting core risk must
 * fall; bench risk must not fall as much. Run with DURABILITY=off for the arm. */
const roomsOff = [];
_s = 20260819;                    // IDENTICAL rooms, exactly one thing changed
DUR_OFF = true;
for (let i = 0; i < ROOMS; i++) roomsOff.push(runRoom(LEAN, true));
DUR_OFF = false;
const meanRisk = (set, from, to) => {
  const v = [];
  set.forEach(r => r.got.slice(from, to).forEach(g => {
    if (g.injury_risk_pct != null) v.push(g.injury_risk_pct);
  }));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const riskOn = { starters: meanRisk(rooms, 0, 6), bench: meanRisk(rooms, 6, 12) };
const riskOff = { starters: meanRisk(roomsOff, 0, 6), bench: meanRisk(roomsOff, 6, 12) };
const starterDrop = (riskOff.starters ?? 0) - (riskOn.starters ?? 0);
const benchDrop = (riskOff.bench ?? 0) - (riskOn.bench ?? 0);

const ctl = {
  C1_no_cohort_statistic_touches_a_band: noCohortBands(),
  C2_known_positive_ceiling_can_move_a_pick: knownPositive(),
  C5_known_positive_injury_can_move_a_pick: durabilityKnownPositive(),
  C3_players_without_a_band_are_named_not_invented: {
    ok: true, pool: pool.length, without_a_draftsharks_band: noBand,
    treatment: 'floor = proj = ceiling, so LEAN cannot move them either way',
    why: 'an invented band is the exact thing Cory has been correcting' },
  C4_comparator_keeps_the_hard_K_DEF_fill: {
    ok: rooms.every(r => r.empty_starting_slots === 0),
    rooms_with_an_empty_starting_slot: rooms.filter(r => r.empty_starting_slots > 0).length,
    why: 'a comparator allowed to skip the fill drafts twelve quarterbacks and '
       + 'returns a fake improvement — happened twice on this project' },
};
const allOk = Object.values(ctl).every(c => c.ok);

const P209 = onesies && wrOverRb >= 0.80;
const P210 = lW / eW >= 1.40;
const P211 = Object.values(ident).every(Boolean);

const doc = {
  _territory: 'TERRITORY: A — draft/tools/draft_model.js',
  _ruling: 'Cory 2026-08-19: "build me a model that drafts value early, builds a '
         + 'normal roster, and drafts for upside at the end"',
  _rule: "a starter's floor can lose you a week; a bench body's floor costs you "
       + 'nothing because you drop him. So w = P(he starts) decides which END of '
       + 'his band we read, and value-early/upside-late is an OUTPUT.',
  _bands_are_per_player: 'no cohort statistic touches a band. Enforced by C1.',
  _prereg: 'draft/DRAFT-MODEL-PREREG-2026-08-19.md',
  lean: LEAN, rooms: ROOMS,
  controls: ctl, controls_all_passed: allOk,
  predictions: {
    P209_normal_roster: { pass: P209, mean_roster_with_keepers: rosterWithKeepers,
      onesies_all_1: onesies, share_of_rooms_WR_over_RB: +wrOverRb.toFixed(3) },
    P210_upside_at_the_end: { pass: P210,
      mean_band_width_first_4_picks: +eW.toFixed(3),
      mean_band_width_last_4_picks: +lW.toFixed(3),
      ratio: +(lW / eW).toFixed(3), bar: 1.40 },
    P211_the_knob_does_what_he_said: { pass: P211, identities: ident },
  },
  mean_drafted_by_position: roster,
  example_room: rooms[0].got,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'draft_model.json'), JSON.stringify(doc, null, 1));

/* ── print ────────────────────────────────────────────────────────────────── */
console.log(`THE DRAFT MODEL — value early, normal roster, upside at the end`);
console.log(`  LEAN = ${LEAN}   ${ROOMS} rooms   pool ${pool.length} (${noBand} with no DS band)\n`);
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK   ' : '  FAIL ') + k));

console.log(`\n  P209  normal roster              ${P209 ? 'TRUE ' : 'FALSE'}`);
console.log('        ' + POS.map(q => `${q} ${rosterWithKeepers[q]}`).join('   ') + '   (keepers included)');
console.log(`        rooms with WR > RB: ${(wrOverRb * 100).toFixed(0)}%   bar 80%`);
console.log(`\n  P210  upside at the end          ${P210 ? 'TRUE ' : 'FALSE'}`);
console.log(`        band width  first 4 picks ${eW.toFixed(3)}   last 4 picks ${lW.toFixed(3)}`
  + `   ratio ${(lW / eW).toFixed(2)}x   bar 1.40x`);
console.log(`\n  P211  the knob                   ${P211 ? 'TRUE ' : 'FALSE'}`);
Object.entries(ident).forEach(([k, v]) => console.log(`        ${v ? 'ok  ' : 'FAIL'} ${k}`));

console.log(`\n  ONE ROOM, pick by pick — watch w fall and the band flip ends:\n`);
console.log('  ' + 'pk'.padStart(4) + '  ' + 'player'.padEnd(22) + 'pos'.padStart(4)
  + 'w'.padStart(7) + 'floor'.padStart(8) + 'proj'.padStart(8) + 'ceil'.padStart(8)
  + 'used'.padStart(8) + 'width'.padStart(8));
rooms[0].got.forEach(g => console.log('  ' + String(g.pick).padStart(4) + '  '
  + g.name.slice(0, 21).padEnd(22) + g.position.padStart(4)
  + g.w.toFixed(2).padStart(7) + String(g.floor).padStart(8) + String(g.proj).padStart(8)
  + String(g.ceiling).padStart(8) + String(g.band_used).padStart(8)
  + (g.banded ? g.band_width.toFixed(2) : '—').padStart(8)));
console.log(`\n  ⚠️  REPORT ONLY. If the roster misses, the fix is the defect, not LEAN.`);
process.exit(allOk ? 0 : 1);
