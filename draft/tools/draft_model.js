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
const RAMP = Math.min(1, Math.max(0, arg('--ramp', 0)));   // Cory's late-ceiling ramp
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
/* ── AND A BACKUP COMPETES WITH STREAMING, WHICH IS WHY QB2 KEPT WINNING ─────
 *
 * Cory, on run 4: "pretty clode but QB still too high!!" — QB 1.82.
 *
 * The mechanism, isolated: late in a draft every position sits near w = 0.05,
 * so w stops discriminating and raw surplus decides. Darnold's ceiling-leaning
 * band clears the QB wire by 59 points; the 6th receiver's clears the WR wire by
 * 39. The quarterback wins on scale.
 *
 * What the surplus is missing is WHAT THE WIRE ACTUALLY IS. WAIVER.QB = 322.9 is
 * the best quarterback left after the draft — but quarterbacks can be STREAMED,
 * a different one each week, chosen on matchup. So the real alternative to a
 * rostered QB2 is not one fixed man at 322.9, it is a fresh pick every Sunday.
 * A backup receiver has no such competition: measured streamability is QB 0.590
 * and WR 0.252.
 *
 * ⚠️ THIS APPLIES TO BENCH BODIES ONLY, and that restriction is the whole
 * point. My STARTING quarterback is not competing with streaming — I am
 * fielding him every week by choice. Only the body whose entire job is to fill
 * in is substitutable by the wire, so only he pays the tax.
 *
 * NOT A NEW KNOB: streamability is measured (draft/data/streamability.json,
 * passed its own controls) and this is the same (1 − streamability) factor the
 * derived need curve already used to collapse QB2 from .427 to .084. Cory's
 * transcription of the curve simply has no streaming term in it, and this is
 * where it belongs. */
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'streamability.json'), 'utf8'));
if (!ST.controls_all_passed) throw new Error('streamability failed its controls — REFUSING');
const STREAM = ST.streamability;
const STREAM_TAX = process.env.STREAMTAX !== 'off';

const startProb = (pos, held) => {
  const row = W[pos];
  if (!row) return 0;
  const base = held < row.length ? row[held] : 0;
  if (!STREAM_TAX) return base;
  /* a body filling an EMPTY starting slot is not a fill-in and pays nothing */
  if (held < (STARTERS[pos] || 0)) return base;
  return base * (1 - (STREAM[pos] || 0));
};

/* ── the pool ─────────────────────────────────────────────────────────────────
 * Blended projection — Cory: "lets use a mean projection from all, but using
 * the same proj % of draft shark". A player with NO Draft Sharks band enters
 * with floor = proj = ceiling, so LEAN cannot move him in either direction, and
 * C3 prints how many that is. Inventing a band for him is exactly the thing
 * Cory has spent two days correcting. */
/* ── CORY'S TWO MODELS ────────────────────────────────────────────────────────
 * "can we actually program 2 models, one that uses proj from draft shark and 1
 *  that uses mean proj. and I want to be able to toggle between them"
 *
 *   --source blend   the mean of every source, centred per position (default)
 *   --source ds      Draft Sharks' own projection, uncentred
 *
 * The BAND is Draft Sharks' either way -- that was never the question, and there
 * is no other per-player outcome range to use.
 *
 * ⚠️ THE DS ARM RANKS 247 PLAYERS, NOT 700. Coverage by ADP depth: top-100
 * 100%, top-150 99.3%, top-200 94.5%, top-250 88.4%. Cory's last pick is 148,
 * by which point the board is ~250 deep, so the DS arm thins exactly where his
 * final picks come from. Men without a Draft Sharks line are EXCLUDED from that
 * arm rather than back-filled from the blend -- mixing the two inside one
 * ranking is the defect this toggle exists to let him see. */
const SOURCE = (() => {
  const i = process.argv.indexOf('--source');
  const v = i >= 0 ? process.argv[i + 1] : 'blend';
  if (v !== 'blend' && v !== 'ds') throw new Error('--source must be blend or ds');
  return v;
})();

const DS = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'draftsharks_projections_2026.json'), 'utf8'));

/* Draft Sharks' published rows, for the ds arm's band */
const dsRaw = {};
(DS.players || []).forEach(r => { if (r.sleeper_id != null) dsRaw[String(r.sleeper_id)] = r; });

const pool = [];
let noBand = 0, excludedNoDS = 0;
BL.players.forEach(p => {
  if (!POS.includes(p.position) || p.adp == null || p.proj == null) return;
  if (SOURCE === 'ds' && p.ds_proj == null) { excludedNoDS++; return; }
  const has = p.floor != null && p.ceiling != null;
  if (!has) noBand++;
  pool.push({
    id: p.player_id, name: p.name, position: p.position, adp: p.adp, bye: p.bye,
    /* the toggle: which projection drives the ranking, and which band goes with
     * it. Cory: "does toggle also switch the proj ceilings and floors back to
     * Draftsharks original" — yes, and under --source ds they are Draft Sharks'
     * PUBLISHED numbers, read straight from his store.
     *
     * ⚠️ THE FIRST VERSION RECONSTRUCTED THEM as ds_proj x (blend_floor /
     * blend_proj). That is algebraically the same thing -- the blend wears DS's
     * ratio by construction -- and it checked out to within 0.29 points across
     * all 247 players. But the residue is real: the blend stores proj, floor and
     * ceiling rounded to 0.1, so the ratio carries the rounding through and
     * Gibbs' published ceiling of 370 came back as 370.06. Toggling to "Draft
     * Sharks" should show what Draft Sharks published, not a faithful
     * reconstruction of it, so the raw fields are read directly and C7 pins the
     * identity at zero rather than at a tolerance. */
    proj: SOURCE === 'ds' ? p.ds_proj : p.proj,
    floor: SOURCE === 'ds'
      ? (dsRaw[String(p.player_id)] || {}).floor_proj ?? p.ds_proj
      : (has ? p.floor : p.proj),
    ceiling: SOURCE === 'ds'
      ? (dsRaw[String(p.player_id)] || {}).ceil_proj ?? p.ds_proj
      : (has ? p.ceiling : p.proj),
    banded: has,
    injury_risk_pct: p.injury_risk_pct,
    /* HIS band width, and it is divided by HIS OWN projection and by nothing
     * else. No cohort denominator. */
    band_width: p.proj > 0 && has ? (p.ceiling - p.floor) / p.proj : 0,
    /* ADP noise for draining the room; a market property, not a band term */
    sd: Math.max(4, p.adp * 0.18),
  });
});

/* ── THE CEILING ADJUSTER — CORY'S KNOB, AS HE ACTUALLY SPECIFIED IT ─────────
 *
 * ⛔ THE PREVIOUS VERSION OF THIS FUNCTION FAILED CORY'S OWN TEST CASE, and he
 * is the one who wrote the test:
 *
 *   "if someone has mean proj of 500 and ceiling of 550, and another have a
 *    mean proj of 450 but ceiling of 550, and I crank ceiling adjuster all the
 *    way up, then 550 player should be ahead of 500"
 *
 * Run against the old rule at LEAN = 1:
 *
 *   starter slot (w=1)   A -> 450.0   B -> 400.0    ← their FLOORS
 *   bench slot   (w=0)   A -> 550.0   B -> 550.0    ← correct, but only here
 *
 * Cranking the ceiling adjuster all the way up pushed starters to their FLOOR.
 * That is the opposite of what the knob is called and the opposite of what he
 * asked for, three separate times, in the same words: "if I crank ceiling
 * adjuster all the way up it should be ranking off pure ceiling projections..
 * if I crank it to 50 it should use 50% of the added ceiling."
 *
 * I had conflated two different things. HIS knob is one number applied to
 * EVERYONE. What I built used it as "how far toward whichever end w selects",
 * so w and LEAN fought each other. He also said "We are simplifying model!!"
 * and I had complicated it.
 *
 *   adj  = clamp(A + RAMP × progress, 0, 1)
 *   used = proj + adj × (ceiling − proj)
 *
 * A = 0 ranks on the blended mean. A = 1 ranks on pure ceiling, for every
 * player at every slot. A = 0.5 uses exactly half the added ceiling. RAMP is
 * the late-draft crank on top, so the last picks are judged nearer their
 * ceiling than the first ones.
 *
 * AND THE FLOOR GOES WHERE HE PUT IT — a TIEBREAK, early. "What I want is!
 * Floors to be used for tiebreakers in early rounds and ceilings in later
 * rounds." It is not part of the scale; it separates men the scale has already
 * called level. */
function projUsed(x, a, progress) {
  const adj = Math.min(1, Math.max(0, a + RAMP * (progress || 0)));
  return x.proj + adj * (x.ceiling - x.proj);
}
/* two candidates are "level" within this fraction of the better one's value */
const TIE_EPS = 0.02;
/* the floor only breaks ties in the FIRST HALF of his picks */
const TIE_UNTIL = 0.5;

/* ── THE KEEPERS, who are not on the board ───────────────────────────────────
 *
 * Chase, Henry and Walker are NOT among the board's 700 players -- the board
 * holds DRAFTABLE men, and a keeper is not draftable. So the snapshot never saw
 * them, the blend never saw them, and until the baseline needed their bands
 * nothing in this project had noticed.
 *
 * ⚠️ IT SURFACED AS A CRASH ONLY BECAUSE THE LOOKUP THROWS. The line it
 * replaced was `pool.find(...) || { proj: k.proj || 0 }`, which would have made
 * Ja'Marr Chase a ZERO-POINT incumbent at receiver -- silently, in every room,
 * for the whole run. The fallback was the bug; the crash was the fix working.
 *
 * Their numbers come from Draft Sharks by sleeper_id and are put on the blend's
 * scale with THE BLEND'S OWN per-position offsets, read out of its artifact
 * rather than recomputed here (rule 11: one derivation, reused). With no second
 * source they are a one-source row, and `keeper_single_source` says so. */
const DS_OFFSET = (BL.controls.C3_centering_is_per_position
  .median_offsets_vs_board_mean_by_position || {}).draftsharks || {};
const dsById = {};
(DS.players || []).forEach(r => { if (r.sleeper_id != null) dsById[String(r.sleeper_id)] = r; });

function keeperRow(k) {
  const d = dsById[String(k.player_id)];
  if (!d || !d.ds_proj) throw new Error(
    'keeper has no Draft Sharks line and there is nothing honest to put here: ' + k.name);
  const off = DS_OFFSET[k.position] || DS_OFFSET._global || 0;
  const proj = d.ds_proj - off;                       // same centring as the blend
  return { id: 'KEEP:' + k.player_id, name: k.name, position: k.position,
    proj: +proj.toFixed(1),
    floor: +(proj * (d.floor_proj / d.ds_proj)).toFixed(1),
    ceiling: +(proj * (d.ceil_proj / d.ds_proj)).toFixed(1),
    banded: true, injury_risk_pct: d.injury_risk_pct,
    band_width: (d.ceil_proj - d.floor_proj) / d.ds_proj,
    keeper_single_source: true };
}
const KEEPERS = PLAN.keep.map(keeperRow);

/* ── THE BASELINE — and the wrong turn, kept because it is the useful part ───
 *
 * Run 1 came back QB 1.69, and the mechanism looked like a baseline error: at
 * the end of a draft EVERY position sits near w = 0.05, so w stops
 * discriminating and raw surplus decides -- and a backup QB's ceiling clears the
 * QB wire by 63 points where a 6th receiver's clears the WR wire by 39. I
 * replaced the wire with "the man he displaces". Two runs:
 *
 *   run 2, baseline = worst held man's PROJECTION   QB 1.22  TE 1.00
 *   run 3, baseline = worst held man's BAND         QB 3.10  TE 5.78  ← collapse
 *
 * Run 3 drafted five tight ends and took men at w = 0.00, which is only possible
 * when EVERY candidate scores exactly zero and the tie falls to pool order.
 * Henry and Walker fill both RB slots, so under the displacement rule every
 * drafted back had to beat Walker's own band at 218.4, none could, RB surplus
 * went to zero board-wide and the model wandered.
 *
 * ⛔ THE COLLAPSE IS A SYMPTOM. THE RULE ITSELF IS THE ERROR, and the football
 * says so plainly: a third running back does not displace Derrick Henry. He
 * starts the week Henry is hurt or on bye -- and in THAT week the man he
 * replaces is whoever I could have streamed. His alternative is THE WIRE.
 * Measured starters-per-week agrees out loud: RB 2.417, WR 2.556, so a third
 * body at either is playing regularly, not waiting on a displacement.
 *
 * And it is true at quarterback too, which is the part I had backwards. If
 * Stafford goes down I do not start Darnold because he beat Stafford -- I start
 * someone because Stafford is OUT, and the honest alternative is again the wire.
 * w already carries how OFTEN that happens (0.05); the baseline carries what it
 * is worth WHEN it happens. That is the wire at every position.
 *
 * So P196 stands and the amendment is WITHDRAWN. The QB2 count is whatever it
 * is with the forcing defect fixed and nothing else changed -- which is the only
 * honest way to find out what run 1's 1.69 was really made of. */

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
  const mine = {};                    // the actual bodies, for baselineOf
  PLAN.keep.forEach(k => {
    held[k.position] = (held[k.position] || 0) + 1;
    const kp = KEEPERS[PLAN.keep.indexOf(k)];
    (mine[k.position] || (mine[k.position] = [])).push(kp);
  });
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
    /* ⛔ THE FIRST VERSION LEFT 295 OF 300 ROOMS WITH AN EMPTY STARTING SLOT.
     * The gate excluded BAD positions (w = 0, or a full non-flex one) but never
     * REQUIRED a position that fills an empty slot, so on the last pick a 6th
     * receiver at w = 0.05 was still legal while the tight end slot sat empty.
     * Cory: "must draft 1 k and 1 def!! If 2 rounds and don't have either it
     * equation should force." Forcing now means what the word means: once the
     * picks left equal the slots left, only a body that REDUCES the empty count
     * may be taken. C4 is what caught this. */
    const fillsASlot = q => {
      const t = { ...held };
      t[q] = (t[q] || 0) + 1;
      return unfilled(t) < must;
    };
    let best = null, bestV = -Infinity, bestParts = null;
    for (const x of avail) {
      const w = startProb(x.position, held[x.position] || 0);
      if (forcing && !fillsASlot(x.position)) continue;
      const progress = SCHED.length > 1 ? i / (SCHED.length - 1) : 0;
      const band = projUsed(x, lean, progress);
      const dur = (DURABILITY && !DUR_OFF) ? durability(x, w) : 1;
      const base = WAIVER[x.position] || 0;   // P196: the wire, at every position
      const v = Math.max(0, band - base) * w * dur;
      /* CORY'S FLOOR TIEBREAK, early rounds only */
      const level = best && bestV > 0 && Math.abs(v - bestV) <= TIE_EPS * bestV;
      if (level && progress < TIE_UNTIL) {
        if (x.floor > best.floor) { bestV = v; best = x; bestParts = { w, band, dur, base }; }
      } else if (v > bestV) { bestV = v; best = x; bestParts = { w, band, dur, base }; }
    }
    if (!best) return;
    taken.add(best.id);
    held[best.position] = (held[best.position] || 0) + 1;
    (mine[best.position] || (mine[best.position] = [])).push(best);
    got.push({ pick: pk, round: i + 1, name: best.name, position: best.position,
      proj: best.proj, floor: best.floor, ceiling: best.ceiling,
      band_width: best.band_width, banded: best.banded,
      injury_risk_pct: best.injury_risk_pct,
      w: +bestParts.w.toFixed(3), band_used: +bestParts.band.toFixed(1),
      durability: +bestParts.dur.toFixed(3), baseline: +bestParts.base.toFixed(1),
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
  const atLean0 = projUsed(plant, 0, 0) - projUsed(twin, 0, 0);
  const atLean1 = projUsed(plant, 1, 0) - projUsed(twin, 1, 0);
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
  /* ⚠️ THE FIRST VERSION OF THIS CONTROL FAILED ON ITS OWN DOCUMENTATION. It
   * scanned the raw file, so it matched VET_WIDTH and RISK_MED in the header
   * comment that says those tables are DELETED, and in the banned list itself.
   * A control that fires on prose about a defect, rather than on the defect,
   * is measuring the wrong thing -- so the CHECK is fixed and the bar is not
   * touched: comments and this function's own body are stripped first, and
   * what remains is executable code only. */
  const raw = fs.readFileSync(__filename, 'utf8');
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')            // block comments
    .replace(/^\s*\/\/.*$/gm, ' ')                 // line comments
    .replace(/function noCohortBands\(\)[\s\S]*?\n\}/, ' ');   // this checker
  const banned = ['VET_WIDTH', 'VET_CV', 'WEEK_CV', 'RISK_MED', 'Q_POS'];
  const found = banned.filter(t => src.includes(t));
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
  a0_is_the_blended_mean: Math.abs(projUsed(probe, 0, 0) - probe.proj) < 1e-9,
  a1_is_pure_ceiling_FOR_EVERYONE:
    Math.abs(projUsed(probe, 1, 0) - probe.ceiling) < 1e-9,
  a_half_is_half_the_added_ceiling:
    Math.abs(projUsed(probe, 0.5, 0) - (probe.proj + 0.5 * (probe.ceiling - probe.proj))) < 1e-9,
  /* CORY'S OWN TEST CASE, run every time this file runs */
  corys_500_550_vs_450_550_tie_at_full_crank: (() => {
    const A = { proj: 500, floor: 450, ceiling: 550 };
    const B = { proj: 450, floor: 400, ceiling: 550 };
    return Math.abs(projUsed(A, 1, 0) - projUsed(B, 1, 0)) < 1e-9;
  })(),
  corys_case_bigger_ceiling_wins_at_full_crank: (() => {
    const hi = { proj: 450, floor: 400, ceiling: 550 };   // lower mean, higher ceiling
    const lo = { proj: 500, floor: 450, ceiling: 520 };   // higher mean, lower ceiling
    return projUsed(hi, 1, 0) > projUsed(lo, 1, 0);
  })(),
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
  /* Cory: "does toggle also switch the proj ceilings and floors back to
   * Draftsharks original" — this is that question, asserted rather than
   * answered. Under --source ds the band must be Draft Sharks' PUBLISHED
   * numbers EXACTLY, not a reconstruction that happens to agree. */
  C7_ds_arm_uses_draftsharks_published_band_exactly: (() => {
    if (SOURCE !== 'ds') return { ok: true, skipped: 'only meaningful on --source ds' };
    let worst = 0, n = 0;
    pool.forEach(x => {
      const r = dsRaw[String(x.id)];
      if (!r || r.floor_proj == null) return;
      worst = Math.max(worst, Math.abs(x.floor - r.floor_proj), Math.abs(x.ceiling - r.ceil_proj));
      n++;
    });
    return { ok: worst === 0, n, worst_difference: worst,
      why: 'the first version reconstructed the band as ds_proj x (blend_floor / '
         + 'blend_proj) — algebraically identical, and it agreed to within 0.29 '
         + 'points. But the blend rounds to 0.1, so Gibbs\' published 370 came '
         + 'back as 370.06. Toggling to Draft Sharks should show what Draft '
         + 'Sharks published. Pinned at ZERO, not at a tolerance.' };
  })(),
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

/* P214 — CORY'S RULING, and it is a sharper test than the count ──────────────
 * "1.22 on QB is not bad, I do see carryng 2 qbs sometimes if you didnt draft a
 * good one"
 *
 * The operative word is IF. A second quarterback taken AT RANDOM is a wasted
 * pick; one taken BECAUSE THE FIRST IS WEAK is a hedge, and only the second is
 * what he described. So the count is not the question -- the CONDITION is.
 * P213's bar of 1.1 is left FALSE where it stands rather than widened to fit
 * this, because moving a preregistered bar after seeing the number is the one
 * thing no_fit_guard exists to stop. */
const qb1Of = r => {
  const q = r.got.filter(g => g.position === 'QB');
  return q.length ? Math.max(...q.map(g => g.proj)) : null;
};
const two = rooms.filter(r => r.got.filter(g => g.position === 'QB').length >= 2);
const one = rooms.filter(r => r.got.filter(g => g.position === 'QB').length === 1);
const avg = v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const qb1two = avg(two.map(qb1Of).filter(v => v != null));
const qb1one = avg(one.map(qb1Of).filter(v => v != null));
const P214 = two.length > 0 && one.length > 0 && (qb1one - qb1two) >= 10;

const P213 = rosterWithKeepers.QB <= 1.1 && rosterWithKeepers.TE >= 0.9;
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
  lean: LEAN, ramp: RAMP, source: SOURCE, rooms: ROOMS,
  players_excluded_for_having_no_draftsharks_line: excludedNoDS,
  controls: ctl, controls_all_passed: allOk,
  predictions: {
    P209_normal_roster: { pass: P209, mean_roster_with_keepers: rosterWithKeepers,
      onesies_all_1: onesies, share_of_rooms_WR_over_RB: +wrOverRb.toFixed(3) },
    P210_upside_at_the_end: { pass: P210,
      mean_band_width_first_4_picks: +eW.toFixed(3),
      mean_band_width_last_4_picks: +lW.toFixed(3),
      ratio: +(lW / eW).toFixed(3), bar: 1.40 },
    P211_the_knob_does_what_he_said: { pass: P211, identities: ident },
    P212_durability_moves_the_right_picks: {
      pass: starterDrop >= 3 && benchDrop < starterDrop,
      mean_injury_risk_starting_core: { on: riskOn.starters, off: riskOff.starters },
      mean_injury_risk_bench: { on: riskOn.bench, off: riskOff.bench },
      starter_drop: +starterDrop.toFixed(2), bench_drop: +benchDrop.toFixed(2),
      bar: 'starters fall >= 3 points AND bench falls less than starters' },
    P214_a_second_QB_only_when_the_first_is_weak: { pass: P214,
      _ruling: 'Cory: "1.22 on QB is not bad, I do see carryng 2 qbs sometimes '
             + 'if you didnt draft a good one"',
      rooms_taking_two_QBs: two.length, rooms_taking_one: one.length,
      mean_QB1_when_only_one_taken: qb1one == null ? null : +qb1one.toFixed(1),
      mean_QB1_when_a_second_is_taken: qb1two == null ? null : +qb1two.toFixed(1),
      gap: (qb1one != null && qb1two != null) ? +(qb1one - qb1two).toFixed(1) : null,
      bar: 'QB1 at least 10 points worse in the rooms that hedge' },
    P213_baseline_kills_the_second_QB: { pass: P213,
      mean_QB: rosterWithKeepers.QB, mean_TE: rosterWithKeepers.TE,
      bar: 'QB <= 1.1 and TE >= 0.9' },
  },
  mean_drafted_by_position: roster,
  example_room: rooms[0].got,
};
/* ⚠️ THE ARMS MUST NOT SHARE A FILENAME. They did, and running the STREAMTAX=off
 * arm second overwrote the artifact with the arm the commit message was NOT
 * describing -- a committed JSON saying P209 false beside a committed claim that
 * it was true. An off-arm is a comparison, not a replacement. */
const OUTNAME = 'draft_model' + (SOURCE === 'ds' ? '_ds' : '') + (STREAM_TAX ? '' : '_noStreamTax')
  + (DURABILITY ? '' : '_noDurability') + '.json';
fs.writeFileSync(path.join(ROOT, 'draft', 'data', OUTNAME), JSON.stringify(doc, null, 1));

/* ── print ────────────────────────────────────────────────────────────────── */
console.log(`THE DRAFT MODEL — value early, normal roster, upside at the end`);
console.log(`  source = ${SOURCE}   A = ${LEAN}   RAMP = ${RAMP}   ${ROOMS} rooms   pool ${pool.length}`
  + (excludedNoDS ? `  (${excludedNoDS} excluded: no Draft Sharks line)` : `  (${noBand} with no DS band)`) + '\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK   ' : '  FAIL ') + k));

console.log(`\n  P209  normal roster              ${P209 ? 'TRUE ' : 'FALSE'}`);
console.log('        ' + POS.map(q => `${q} ${rosterWithKeepers[q]}`).join('   ') + '   (keepers included)');
console.log(`        rooms with WR > RB: ${(wrOverRb * 100).toFixed(0)}%   bar 80%`);
console.log(`\n  P210  upside at the end          ${P210 ? 'TRUE ' : 'FALSE'}`);
console.log(`        band width  first 4 picks ${eW.toFixed(3)}   last 4 picks ${lW.toFixed(3)}`
  + `   ratio ${(lW / eW).toFixed(2)}x   bar 1.40x`);
console.log(`\n  P214  QB2 ONLY when QB1 is weak  ${P214 ? 'TRUE ' : 'FALSE'}   (Cory's ruling)`);
console.log(`        QB1 projects ${qb1one == null ? '—' : qb1one.toFixed(1)} in the ${one.length} rooms that take one,`
  + ` ${qb1two == null ? '—' : qb1two.toFixed(1)} in the ${two.length} that hedge`
  + `   gap ${(qb1one != null && qb1two != null) ? (qb1one - qb1two).toFixed(1) : '—'}  bar 10`);
console.log(`\n  P213  baseline kills the QB2     ${P213 ? 'TRUE ' : 'FALSE'}   (bar left where it was)`);
console.log(`        mean QB ${rosterWithKeepers.QB} (bar <=1.1)   mean TE ${rosterWithKeepers.TE} (bar >=0.9)`);
console.log(`\n  P212  durability moves the right picks   `
  + `${(starterDrop >= 3 && benchDrop < starterDrop) ? 'TRUE ' : 'FALSE'}`);
console.log(`        mean injury risk  starting core ${(riskOff.starters||0).toFixed(1)} -> `
  + `${(riskOn.starters||0).toFixed(1)}  (drop ${starterDrop.toFixed(1)}, bar 3.0)`);
console.log(`                          bench         ${(riskOff.bench||0).toFixed(1)} -> `
  + `${(riskOn.bench||0).toFixed(1)}  (drop ${benchDrop.toFixed(1)}, must be smaller)`);
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
console.log(`\n  wrote draft/data/${OUTNAME}`);
console.log(`  ⚠️  REPORT ONLY. If the roster misses, the fix is the defect, not LEAN.`);
process.exit(allOk ? 0 : 1);
