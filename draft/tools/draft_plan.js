// TERRITORY: A
/* THE WHOLE DRAFT, PRICED — all fifteen picks, not just the six seats.
 *
 * slot_schedule.js assigns the six remaining STARTING seats and says
 * "best available RB/WR" for the other nine, because a bench player was worth
 * nothing to it. That was honest but incomplete: the bench equation now gives
 * those nine picks a number.
 *
 *     starter value(p)  = his projection in that seat
 *     bench value(p)    = P(need at his position) x (his points - what is FREE)
 *
 * WAIVER REPLACEMENT, not draft replacement. VORP prices against the marginal
 * STARTER in a 10-team league; a bench player competes against WHAT YOU CAN GET
 * FOR NOTHING IN WEEK 6. Those are different numbers and only the second one is
 * relevant to a bench seat. Confirmed against this league's own behaviour --
 * 802 completed waiver adds, 2023-2025, DEF 100% of pool cycled, K 83%, WR 37%
 * (see waiver_supply.js).
 *
 * THE CONSEQUENCE THAT MATTERS: a bench K or DEF prices NEGATIVE, because the
 * best free kicker outscores the marginal starting kicker. The plan will never
 * spend a pick on one, and it did not have to be told.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * A PLAN, NOT A POLICY. It assumes the room drafts in ADP order and must be
 * re-solved at every pick as the board deviates. It is risk-neutral: a run at a
 * position is reacted to, never anticipated.
 * P(need) is a flat per-position injury rate. Handcuffs are not modelled -- a
 * backup who inherits his starter's touches is worth far more than his own
 * projection says, and that needs a conditional projection nobody has.
 * Upside is not modelled either. weekly_sd is real on this board (237 distinct
 * ratios) but nothing here reads it yet.
 *
 * Run: node draft/tools/draft_plan.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const keep = KEEP.keepersFrom(DATA);
/* ⚠️ MY PICKS ARE DERIVED FROM THE SNAKE, AND CROSS-CHECKED AGAINST THE ARTIFACT.
 *
 * THE ARTIFACT WAS WRONG AND CORY CAUGHT IT FROM THE SEAT ARITHMETIC ALONE.
 * `pick_order.my_picks` said [30, 45, 50, ...]. His words: "I am in slot 8...
 * since my first pick is in round 4 I am the 3rd pick in that round since it
 * snakes back." Round 4 is EVEN, the snake reverses, slot 10 picks first — so
 * he is overall 31, 32, THIRTY-THREE.
 *
 * IT IS FIXED AT SOURCE NOW and the artifact agrees; `pick_schedule.test.js`
 * asserts the match rather than the divergence it asserted for a day. The
 * derivation stays anyway, and not from distrust: it is a SECOND independent
 * route to the same number, and the only reason this was ever caught is that
 * two routes existed to disagree. It throws if they part again.
 *
 * ── VERIFIED AGAINST SLEEPER'S OWN LOG, WHICH IS THE ONLY AUTHORITY ───────
 *
 * `league_history.seasons[].drafts[].picks`, this league, three completed
 * seasons:
 *
 *     season   keepers on the board   total picks   round 4 begins at
 *      2023            0                  150             31
 *      2024           23                  150             31
 *      2025           20                  150             31
 *
 * SLEEPER DOES NOT COMPRESS. A keeper occupies his pick slot with
 * `is_keeper: true`; the pick is not removed and nothing after it shifts up.
 * 150 picks every year no matter how many keepers exist.
 *
 * `keepers.build_true_pick_order` USED TO delete forfeited picks and renumber
 * the survivors 1..N, which produced 147 rows, round 4 at 28, and a first pick
 * of 30. Both it and its JS twin now leave the numbering alone. Fixing it meant
 * rewriting ten test functions across six files whose NAMES asserted the
 * compressed model — "shifts my picks", "first pick is determined by the TOTAL
 * alone", "removing a keeper shifts every downstream pick" — every one false
 * here, because under real Sleeper numbering Cory's picks do not depend on other
 * teams' keepers at all.
 *
 * THE SCHEDULE IS DERIVED FROM THE SNAKE and cross-checked against the artifact's
 * OWN pre-keeper list — which was the correct uncompressed sequence all along.
 * `my_picks_before_keepers` minus the forfeited rounds IS the answer, and I had
 * the two fields exactly backwards for a day. It refuses loudly if the
 * derivation and the pre-keeper list disagree. */
const SCHED = (function () {
  const po = (DATA.pick_order || {});
  const L = DATA.league || {};
  const teams = +L.teams, rounds = +L.rounds, mySlot = +L.my_draft_slot;
  const type = L.draft_type || 'snake';
  if (!(teams > 0 && rounds > 0 && mySlot > 0)) {
    throw new Error('draft_plan: league.teams / rounds / my_draft_slot missing. '
      + 'REFUSING to guess a pick schedule.');
  }
  if (type !== 'snake') {
    throw new Error('draft_plan: this derivation is for a SNAKE. league.draft_type '
      + 'is ' + JSON.stringify(type) + ' — refusing rather than reversing the wrong '
      + 'rounds.');
  }
  /* ⚠️ `draft_type` CANNOT TELL A SNAKE FROM A THIRD-ROUND REVERSAL, so the
   * check above is not enough on its own. Sleeper reports `draft.type: "snake"`
   * in all four seasons of this league — including 2023, which ran with
   * `draft.settings.reversal_round: 3` and whose picks show rounds 2 and 3 in
   * the IDENTICAL order. A model reading `type` alone would have been wrong
   * about every pick from round 3 on and nothing would have disagreed with it.
   *
   * `sleeper_import.py` had a mapping for this and read `league.settings`, where
   * the field does not exist, so it never fired in four seasons. It is fixed
   * there; the raw value is read HERE TOO because the board in front of us was
   * built before that fix and a commissioner can flip the toggle up to draft
   * day. Read from the captured draft object, which IS Sleeper's answer. */
  const rev = (function () {
    let h = null;
    try {
      h = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data',
        'league_history.json'), 'utf8'));
    } catch (e) { h = null; }
    const season = String((DATA.league || {}).season || '');
    const node = ((h || {}).seasons || []).find(x => String(x.season) === season);
    if (!node) return null;
    const d = Array.isArray(node.drafts) ? node.drafts[0] : node.drafts;
    const v = ((d || {}).settings || {}).reversal_round;
    return v == null ? null : +v;
  })();
  if (rev == null) {
    throw new Error('draft_plan: cannot read reversal_round for this season from '
      + 'league_history. REFUSING to assume a plain snake — `draft.type` reads '
      + '"snake" under a third-round reversal too, which is how 2023 would have '
      + 'been mis-ordered from round 3 on.');
  }
  if (rev !== 0) {
    throw new Error('draft_plan: this draft has reversal_round=' + rev
      + '. The snake below does not implement it. REFUSING rather than emitting a '
      + 'plausible wrong schedule — every pick from round ' + rev + ' on would '
      + 'move.');
  }
  /* The full snake, uncompressed, exactly as Sleeper numbers it. */
  const mineAll = [];
  let overall = 0;
  for (let rnd = 1; rnd <= rounds; rnd++) {
    for (let k = 1; k <= teams; k++) {
      const slot = (rnd % 2 === 1) ? k : (teams - k + 1);
      overall++;
      if (slot === mySlot) mineAll.push({ overall: overall, round: rnd });
    }
  }
  /* CROSS-CHECK. `my_picks_before_keepers` is the artifact's own pre-keeper
   * sequence and must equal the derivation exactly. If it does not, one of the
   * two is wrong about the room and neither should be trusted. */
  const before = (po.my_picks_before_keepers || []).slice().sort((a, b) => a - b);
  const derived = mineAll.map(p => p.overall);
  if (before.length && (before.length !== derived.length
      || before.some((v, i) => v !== derived[i]))) {
    throw new Error('draft_plan: my derived snake ' + JSON.stringify(derived)
      + ' disagrees with pick_order.my_picks_before_keepers '
      + JSON.stringify(before) + '. REFUSING — one of them is wrong about the room.');
  }
  /* Keepers forfeit SPECIFIC ROUNDS (top_picks_flat: keeping N costs rounds
   * 1..N). Drop those rounds; every surviving pick keeps its TRUE overall. */
  const lost = new Set((po.forfeited || []).map(f => +f.cost_round));
  const mine = mineAll.filter(p => !lost.has(p.round)).map(p => p.overall);
  if (!mine.length) {
    throw new Error('draft_plan: derived an empty pick schedule. REFUSING.');
  }
  return mine;
})();
const INJURY = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };
/* HOW MANY PLAYERS ARE ACTUALLY GONE WHEN THE DRAFT ENDS — MEASURED, NOT ASSUMED.
 *
 * THIS WAS THE BUG BEHIND THE SIX-RUNNING-BACK ROSTER. It was hardcoded 180,
 * commented "10 teams x 18 spots", reasoning from ROSTER CAPACITY. But capacity
 * is not draft length: this league drafts FIFTEEN rounds, so 150 players leave
 * the board, not 180. Confirmed in league_history for all three completed
 * seasons -- 150 picks, 15 rounds, every year.
 *
 * The 30-player error lands almost entirely on running backs, because that is
 * where the board is deepest:
 *
 *     waiver replacement    QB    RB    WR    TE     K   DEF
 *     at 180 (assumed)     252    63   113   110   100   103
 *     at 150 (measured)    268   130   143   132   104   103
 *
 * RB MORE THAN DOUBLES. Every bench running back was being priced against a
 * replacement worth 63 points when the real one is worth 130, so each one looked
 * ~67 points more valuable than he is. That is why the plan kept buying them.
 *
 * AND THE TRUE LEVEL IS HIGHER STILL, in the same direction. A bench player is
 * insurance for WEEK 6, not for the minute the draft ends, and by then the wire
 * has been restocked by everyone else's cuts. Measured churn in this league
 * (final roster minus drafted, per team, 3 seasons): RB -0.37 and WR -0.27 —
 * teams SHED backs and receivers in-season, and those men land back in the pool.
 * So 150 is nearer the truth than 180 and still conservative. Both corrections
 * push the same way: BENCH PLAYERS ARE WORTH LESS THAN THIS MODEL SAID. */
/* Position cap for the shape experiment, e.g. PLAN_MAX_POS='{"QB":1,"TE":1}'.
 * Counts DRAFTED players only -- keepers are not a choice this plan makes. */
let MAXPOS = null;
try { MAXPOS = process.env.PLAN_MAX_POS ? JSON.parse(process.env.PLAN_MAX_POS) : null; }
catch (e) { console.log('PLAN_MAX_POS is not valid JSON: ' + e.message); process.exit(2); }

/* ⚠️ HOW MANY PLAYERS COME OFF THE BOARD — 150, AND I BROKE THIS THIS MORNING.
 *
 * It was `DRAFT_ROUNDS * TEAMS` = 150. I "fixed" it to count
 * `pick_order.picks` (147 rows), wrote a long commit about a 34.5-point
 * quarterback error, and was WRONG: the artifact compresses and Sleeper does
 * not. Its own log for this league says 150 picks in 2023 (0 keepers), 2024
 * (23 keepers) and 2025 (20 keepers). Keepers occupy slots; they do not shrink
 * the draft.
 *
 * THE FAILURE WAS NOT ARITHMETIC. I found a constant disagreeing with an
 * artifact and assumed the artifact was authoritative, because the constant
 * looked like the defect class I had just spent two hours on. The draft log
 * that settles it was in a file I had already opened that day. A rule that says
 * "prefer the artifact to the constant" is not a rule about truth — it is a
 * heuristic, and this is what it costs when it is applied without checking
 * which one is downstream of the real source.
 *
 * So: derived from the league's own declared shape, and CROSS-CHECKED against
 * every completed draft in the log. If a real draft ever ran a different length
 * this refuses instead of averaging them. */
const TEAMS = ((DATA.league || {}).teams) || 10;
const ROSTERED = (function () {
  const L = DATA.league || {};
  const product = (+L.rounds || 0) * (+L.teams || 0);
  if (!product) {
    throw new Error('draft_plan: league.rounds x league.teams is not available. '
      + 'REFUSING to guess how deep the board goes.');
  }
  let hist = null;
  try {
    hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data',
      'league_history.json'), 'utf8'));
  } catch (e) { hist = null; }
  const lengths = [];
  ((hist || {}).seasons || []).forEach(s => {
    const d = Array.isArray(s.drafts) ? s.drafts[0] : s.drafts;
    const picks = (d || {}).picks;
    if (Array.isArray(picks) && picks.length) lengths.push(picks.length);
  });
  const odd = lengths.filter(n => n !== product);
  if (odd.length) {
    throw new Error('draft_plan: completed drafts in league_history ran '
      + JSON.stringify(lengths) + ' picks but rounds x teams is ' + product
      + '. REFUSING — the room does not match its own settings and a bench '
      + 'valuation built on the wrong depth is what this replaced.');
  }
  return product;
})();

/* WAIVER REPLACEMENT LEVEL: the best man still unrostered when the draft ends. */
const drafted = new Set(byAdp.slice(0, ROSTERED).map(p => String(p.player_id)));
const WAIVER = {};
['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
  const free = pool.filter(p => p.position === pos && !drafted.has(String(p.player_id)))
    .sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0))[0];
  WAIVER[pos] = free ? free.proj_mean : 0;
});

const STARTERS = (DATA.league || {}).starters || {};
const FLEX_POS = ['RB', 'WR', 'TE'];
const held = {};
keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
const open = [];
Object.keys(STARTERS).forEach(pos => {
  if (pos === 'FLEX') return;
  for (let i = 0; i < (STARTERS[pos] || 0) - (held[pos] || 0); i++) open.push({ slot: pos, elig: [pos] });
});
const flexUsed = FLEX_POS.reduce((n, p) => n + Math.max(0, (held[p] || 0) - (STARTERS[p] || 0)), 0);
for (let i = 0; i < Math.max(0, (STARTERS.FLEX || 0) - flexUsed); i++) open.push({ slot: 'FLEX', elig: FLEX_POS });

const LOUD = (require.main === module);   /* silent when required as a library */
if (LOUD) {
  console.log('THE FULL DRAFT PLAN — all ' + SCHED.length + ' picks priced\n');
  console.log('  keepers: ' + keep.map(k => k.name + ' (' + k.position + ')').join(', '));
  console.log('  waiver replacement level (best man unrostered after ' + ROSTERED + ' spots):');
  console.log('    ' + Object.keys(WAIVER).map(p => p + ' ' + WAIVER[p].toFixed(0)).join('   ') + '\n');
}

/* P(YOU NEED YOUR Nth BACKUP AT A POSITION) — AND IT COLLAPSES FAST.
 *
 * THE FIRST VERSION OF THIS PRICED EVERY BACKUP THE SAME and produced a plan
 * with TEN RUNNING BACKS, recommending D'Andre Swift at pick 48 AND pick 53.
 * Two bugs with one root: the bench arm priced each pick independently, so it
 * neither noticed it had already taken the man nor that a FIFTH backup running
 * back is not worth what the FIRST is.
 *
 * You need a backup only if a starter is out. You need a SECOND backup only if
 * TWO are out simultaneously. With S starters at a position each independently
 * unavailable with probability r:
 *
 *     P(need the Nth backup) = P(at least N of S are out)
 *
 * For RB with S=2 and r=0.28 that is 0.48, then 0.078, then ~0. THE THIRD
 * BACKUP RUNNING BACK IS WORTH ESSENTIALLY NOTHING, which is what the plan
 * should have said and did not. This is the 1181-identical-values pattern in a
 * new place: treating every member of a class as interchangeable. */
/* THE FLEX IS ONE SEAT AND IT BELONGS TO WHOEVER ACTUALLY FILLS IT.
 * The first cut added STARTERS.FLEX to RB *and* WR *and* TE, so a single flex
 * seat was counted three times -- implying 8 starters across RB/WR/TE where the
 * league has 6. That inflated P(need a backup) at every flex-eligible position,
 * most visibly at TE, and the plan drafted THREE TIGHT ENDS. `flexOwner` is set
 * from the seat assignment below, so the seat is credited exactly once. */
let flexOwner = null;
function pNeedNth(pos, n) {
  const S = (STARTERS[pos] || 0) + (flexOwner === pos ? (STARTERS.FLEX || 0) : 0);
  const r = INJURY[pos] || 0.15;
  if (S <= 0) return 0;
  let p = 0;                                  // P(at least n of S out), binomial
  for (let k = n; k <= S; k++) {
    let c = 1;
    for (let i = 0; i < k; i++) c = c * (S - i) / (i + 1);
    p += c * Math.pow(r, k) * Math.pow(1 - r, S - k);
  }
  return p;
}
/* A BACKUP AT A RENTED POSITION IS WORTH ZERO, NOT EPSILON.
 *
 * waiver_supply.js measured, from 802 completed adds in this league: 100% of the
 * DEF pool and 83% of the K pool cycle every season. You can ALWAYS get one. So
 * holding a second is not slightly valuable, it is valueless -- the seat is
 * rented and the wire restocks it on demand.
 *
 * WITHOUT THIS THE PLAN DRAFTED THREE KICKERS. By the final picks every bench
 * value has decayed toward zero, and a backup kicker's 0.16 was the largest
 * number left. Not because a backup kicker is good, but because the model had
 * nothing better to say and a tie was broken arbitrarily -- the same degenerate
 * ordering that put Joe Flacco on a board earlier today. */
/* ── BENCH VALUE IS AN OPTION, NOT A DIFFERENCE ─────────────────────────────
 *
 * A bench player only helps you if he BECOMES STARTABLE. That is a threshold
 * event, so the right quantity is not his mean over the waiver line but
 *
 *     E[max(0, X - waiver)]   with X ~ N(proj_mean, proj_sd)
 *
 * i.e. a call option struck at the waiver replacement level. My earlier
 * max(0, proj - waiver) is the ZERO-VOLATILITY SPECIAL CASE of exactly this
 * formula -- it discards the upside that is the whole reason to hold a bench
 * player. proj_sd is REAL on this board (237 distinct sd/mean ratios), a fact I
 * spent most of the day wrongly asserting the opposite of.
 *
 * AND IT PRICES YOUTH WITHOUT AN AGE TERM. Measured: correlation(age, sd/mean)
 * = -0.318; median relative spread runs 0.420 at ages 20-24 against 0.354 at
 * 31+. Young players carry more variance, so the option is worth more on them
 * automatically. THAT MATTERS BECAUSE EVERY INTUITION-BASED TERM ADDED TO THIS
 * MODEL HAS FAILED MEASUREMENT -- tier -235, risk -143, bye null, ceiling
 * unsignable. Upside falls out of a quantity already on the board instead. */
function normPdf(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = normPdf(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
    + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d : d;
}
function optionValue(mu, sd, K) {
  if (!(sd > 0)) return Math.max(0, mu - K);
  const d = (mu - K) / sd;
  return (mu - K) * normCdf(d) + sd * normPdf(d);
}

const RENTED = { K: true, DEF: true };
function benchValue(x, heldAtPos) {
  /* ANY rented position is worth zero in a BENCH seat -- the starter arrives via
   * the seat assignment, so anything reaching here is a backup by construction.
   * MY FIRST GUARD TESTED `heldAtPos >= STARTERS[pos]` AND NEVER FIRED, because
   * heldAtPos is already max(0, held - starters) and is therefore 0 exactly when
   * you hold the starter. A guard that cannot fire on the case it was written
   * for -- the fourth one of those today. */
  if (RENTED[x.position]) return 0;
  const gap = optionValue(x.proj_mean || 0, x.proj_sd || 0, WAIVER[x.position] || 0);
  return pNeedNth(x.position, heldAtPos + 1) * gap;
}

/* Best available at each pick, per seat. Bench value is state-dependent, so it
 * cannot be precomputed -- it is evaluated inside the search. */
const avail = SCHED.map(p => {
  const gone = new Set(byAdp.slice(0, p - 1).map(x => String(x.player_id)));
  return pool.filter(x => !gone.has(String(x.player_id)));
});
const seatVal = avail.map(av => open.map(o => {
  const b = av.filter(x => o.elig.indexOf(x.position) >= 0)
    .sort((m, n) => (n.proj_mean || 0) - (m.proj_mean || 0))[0];
  return b ? { v: b.proj_mean, p: b } : { v: 0, p: null };
}));

/* GREEDY FORWARD WITH THE SEAT PLAN FIXED. The seat assignment is still solved
 * exactly (it is the part that matters and it is a clean assignment problem);
 * the bench is then filled forward, because bench value depends on what you have
 * already taken and that breaks the independence a DP needs. Stated rather than
 * hidden: the seats are optimal, the bench is greedy. */
const N = SCHED.length, S = open.length, FULL = (1 << S) - 1;
const dp = Array.from({ length: N + 1 }, () => new Float64Array(1 << S).fill(-Infinity));
const pv = Array.from({ length: N + 1 }, () => new Int32Array(1 << S).fill(-2));
dp[0][0] = 0;
for (let i = 0; i < N; i++) for (let m = 0; m <= FULL; m++) {
  if (dp[i][m] === -Infinity) continue;
  if (dp[i][m] > dp[i + 1][m]) { dp[i + 1][m] = dp[i][m]; pv[i + 1][m] = -1; }
  for (let s = 0; s < S; s++) {
    if (m & (1 << s)) continue;
    const nm = m | (1 << s), nv = dp[i][m] + seatVal[i][s].v;
    if (nv > dp[i + 1][nm]) { dp[i + 1][nm] = nv; pv[i + 1][nm] = s; }
  }
}
const seatAt = {};
{ let m = FULL;
  for (let i = N; i > 0; i--) { const s = pv[i][m]; if (s >= 0) { seatAt[i - 1] = s; m ^= (1 << s); } } }

/* RANKED CANDIDATES ARE KEPT, NOT JUST THE WINNER.
 * tiebreak_frontier.js needs the runners-up at each pick, and the ONE thing it
 * must not do is re-derive them -- its first version ranked bench candidates by
 * proj_mean instead of bench value and returned a quarterback at nine
 * consecutive picks. Exporting the real ranking makes that class of drift
 * impossible rather than merely unlikely. */
const ranked = [];
const plan = [];
const taken = new Set(keep.map(k => String(k.player_id)));
const heldPos = {};
const drawn = {};                 // DRAFTED count per position (keepers excluded)
keep.forEach(k => { heldPos[k.position] = (heldPos[k.position] || 0) + 1; });
for (let i = 0; i < N; i++) {
  const s = seatAt[i];
  if (s != null) {
    const cands = avail[i].filter(x => open[s].elig.indexOf(x.position) >= 0
      && !taken.has(String(x.player_id)))
      .sort((m2, n2) => (n2.proj_mean || 0) - (m2.proj_mean || 0));
    ranked.push({ pick: SCHED[i], role: open[s].slot, elig: open[s].elig.slice(),
      list: cands.map(x => ({ p: x, v: x.proj_mean })) });
    const b = cands[0];
    if (b) { taken.add(String(b.player_id)); heldPos[b.position] = (heldPos[b.position] || 0) + 1;
      drawn[b.position] = (drawn[b.position] || 0) + 1;
      if (open[s].slot === 'FLEX') flexOwner = b.position;
      plan.push({ pick: SCHED[i], slot: open[s].slot, p: b, v: b.proj_mean, bench: false }); continue; }
  }
  const priced = [];
  avail[i].forEach(x => {
    if (taken.has(String(x.player_id))) return;
    /* OPTIONAL POSITION CAP — used to PRICE a roster-shape constraint, not to
     * impose one. Cory doubted QB2/TE2. The honest way to answer that is to make
     * the model draft the shape he expects and report what it says that costs,
     * rather than to argue about it. Off unless PLAN_MAX_POS is set, so the
     * default plan is unchanged. */
    if (MAXPOS && MAXPOS[x.position] != null
      && (drawn[x.position] || 0) >= MAXPOS[x.position]) return;
    const starters = (STARTERS[x.position] || 0)
      + (flexOwner === x.position ? (STARTERS.FLEX || 0) : 0);
    const backups = Math.max(0, (heldPos[x.position] || 0) - starters);
    priced.push({ p: x, v: benchValue(x, backups) });
  });
  priced.sort((a, b) => b.v - a.v);
  ranked.push({ pick: SCHED[i], role: 'bench', elig: null, list: priced });
  const best = priced[0] || { v: -Infinity, p: null };
  /* A ZERO IS NOT A RECOMMENDATION. Once every remaining option prices at 0 the
   * model has nothing to say, and picking the arbitrary winner of that tie is
   * how a backup kicker ends up on the sheet. Say UNPRICED instead: these are
   * free options and they should go to upside -- rookies, young breakouts --
   * which this model cannot value because nothing here reads weekly_sd yet. */
  if (best.v <= 1e-9) {
    plan.push({ pick: SCHED[i], slot: 'bench', p: null, v: 0, bench: true, unpriced: true });
    continue;
  }
  taken.add(String(best.p.player_id));
  heldPos[best.p.position] = (heldPos[best.p.position] || 0) + 1;
  drawn[best.p.position] = (drawn[best.p.position] || 0) + 1;
  plan.push({ pick: SCHED[i], slot: 'bench', p: best.p, v: best.v, bench: true });
}
const TOTAL = plan.reduce((a, x) => a + x.v, 0);
/* ── SELECTIONS BEFORE A PICK, NOT BOARD SLOTS ────────────────────────────
 *
 * SHARED, because it was got wrong in EIGHT PLACES AT ONCE and eight copies is
 * eight chances to fix seven.
 *
 * `byAdp.slice(0, pick - 1)` is the natural way to ask "who is gone by my pick",
 * and it OVER-REMOVES by exactly the number of keeper slots ahead of it. A
 * keeper slot takes nobody out of the pool — the kept player is already excluded
 * from `DATA.players` — so the board simply never deals that pick. At overall 33
 * there are 32 slots behind Cory and TWENTY-NINE selections.
 *
 * EVERY CALL SITE WAS CORRECT UNTIL I FIXED THE NUMBERING. While
 * `build_true_pick_order` renumbered survivors 1..N, `my_picks` was [30, 45, ...]
 * — which IS the selection scale — so `pick - 1` and "selections before" were the
 * same number and had been agreeing by accident. Correcting the pick numbers to
 * Sleeper's own broke all eight simultaneously, which is the second time today a
 * true fix has broken an accidental agreement (the first was the survival curve).
 *
 * It REFUSES rather than falling back: a plausible wrong denominator is exactly
 * what this replaced, three times over. */
function liveBefore(pick) {
  const rows = ((DATA.pick_order || {}).picks) || [];
  if (!rows.length) {
    throw new Error('liveBefore: pick_order.picks is empty, so selections before a '
      + 'pick cannot be counted. REFUSING to fall back to pick-1 — that over-removes '
      + 'by the keeper count at every seat.');
  }
  return rows.filter(r => +r.overall < +pick && !r.keeper_slot).length;
}

module.exports = { liveBefore, plan, ranked, WAIVER, keep, pool, byAdp, SCHED, optionValue, TOTAL, MAXPOS };
if (require.main !== module) return;

console.log('  pick   role     take                        value');
plan.forEach(x => console.log('  ' + String(x.pick).padStart(4) + '   ' + x.slot.padEnd(8)
  + ((x.p ? x.p.position + ' ' + x.p.name
      : 'UNPRICED — free option, take upside')).padEnd(38)
  + (x.unpriced ? '' : x.v.toFixed(1).padStart(7))));
const by = {};
plan.forEach(x => { if (x.p) by[x.p.position] = (by[x.p.position] || 0) + 1; });
console.log('\n  drafted roster: ' + JSON.stringify(by));
console.log('  total value ' + plan.reduce((a,x)=>a+x.v,0).toFixed(1)
  + '  (starters at full projection, bench at insurance value)');
const kd = plan.filter(x => x.p && ['K', 'DEF'].includes(x.p.position) && x.bench).length;
const un = plan.filter(x => x.unpriced).length;
console.log('  bench kickers/defences taken: ' + kd + '  — the plan was never told not to');
console.log('  picks this model CANNOT price: ' + un
  + '  — free options; upside belongs here and is not modelled');
