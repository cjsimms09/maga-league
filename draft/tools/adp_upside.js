// TERRITORY: A
/* COULD HE OUTSCORE HIS DRAFT COST? — the bet, priced, with the risk shown.
 *
 * Cory, 2026-08-19: "it also is what tells you that this player could
 * potentially outscore their ADP!!! its a risk but could pay off. yes, it is
 * not something you can calculate. which is why I was excited when we actually
 * got proj floor and ceilings from draft shark"
 *
 * He is right that we could never have calculated it. Our own band is
 * `mean ± 1.28 × sd ACROSS SOURCES` — how much analysts disagree, which for a
 * mid-round receiver is nearly the OPPOSITE of volatility (register 119). Draft
 * Sharks publishes a modelled per-player outcome range, and only that can price
 * a bet.
 *
 * THE QUESTION THIS ANSWERS, and it is the only one:
 *
 *   the market is charging you pick N for this man.
 *   what does pick N usually return?
 *   what does HE return if he hits — and what if he does not?
 *
 * A player is a BET when his ceiling clears what his draft slot normally buys
 * by a wide margin. He is a TRAP when his floor is far below it. Most men are
 * neither, and the list says so.
 *
 * ⚠️ THIS RANKS A RISK, NOT A PROJECTION. It says nothing whatever about
 * whether he reaches the ceiling — only that if he does, the price was wrong.
 *
 * REPORT ONLY. Writes draft/data/adp_upside.json.
 * Run: node draft/tools/adp_upside.js [--exclude-fp]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FILE = process.argv.includes('--exclude-fp')
  ? 'blended_projection_noFP.json' : 'blended_projection.json';
const BL = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', FILE), 'utf8'));
if (!BL.controls_all_passed) throw new Error('the blend failed its controls — REFUSING');

const POS = ['QB', 'RB', 'WR', 'TE'];
const rows = BL.players.filter(r => r.adp != null && r.adp < 250
  && r.floor != null && r.ceiling != null && POS.includes(r.position));

/* ── what does a draft slot normally return? ────────────────────────────────
 * Measured from the board itself, WITHIN position: the median blended
 * projection of the men going around that ADP at that position. Within
 * position, because a quarterback taken at pick 100 and a back taken at pick
 * 100 buy completely different point totals -- pooling them is the mistake this
 * project has now made three times in one day. */
function slotValue(pos, adp, window) {
  const w = window || 24;
  const near = rows.filter(r => r.position === pos && Math.abs(r.adp - adp) <= w);
  if (near.length < 5) return null;
  const v = near.map(r => r.proj).sort((a, b) => a - b);
  return v[v.length >> 1];
}

const out = rows.map(r => {
  const slot = slotValue(r.position, r.adp);
  if (slot == null || slot <= 0) return null;
  return {
    name: r.name, position: r.position, adp: r.adp, bye: r.bye,
    proj: r.proj, floor: r.floor, ceiling: r.ceiling,
    injury_risk_pct: r.injury_risk_pct,
    /* what his draft slot normally buys at his position */
    slot_normally_returns: +slot.toFixed(1),
    /* the bet: how far his ceiling clears the price */
    upside_over_price: +(r.ceiling - slot).toFixed(1),
    upside_pct: +(100 * (r.ceiling - slot) / slot).toFixed(0),
    /* the risk, which has to be shown beside it or the list is a trap */
    downside_under_price: +(r.floor - slot).toFixed(1),
    downside_pct: +(100 * (r.floor - slot) / slot).toFixed(0),
    /* is the projection itself already above the price, or is the whole case
     * resting on the ceiling? */
    proj_over_price: +(r.proj - slot).toFixed(1),
  };
}).filter(Boolean);

/* ── controls ─────────────────────────────────────────────────────────────── */
const ctl = {
  C1_slot_value_is_within_position: { ok: true,
    why: 'a QB at pick 100 and an RB at pick 100 buy different point totals. '
       + 'Pooling them across positions is the error made three times today — '
       + 'the VONA value term, the ceiling-steals list, and the centring offsets.' },
  C2_upside_is_not_just_the_projection: (() => {
    /* if upside_over_price were ~perfectly correlated with proj_over_price, the
     * ceiling adds nothing and this is a projection ranking wearing a new name */
    const a = out.map(r => r.upside_over_price), b = out.map(r => r.proj_over_price);
    const m = z => z.reduce((x, y) => x + y, 0) / z.length;
    const ma = m(a), mb = m(b);
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    const r = n / Math.sqrt(da * db);
    return { ok: Math.abs(r) < 0.95, correlation_with_projection_edge: +r.toFixed(3),
      why: 'if the ceiling ranking just reproduces the projection ranking then '
         + 'the band is decoration and Cory gained nothing from Draft Sharks' };
  })(),
  C3_both_sides_shown: { ok: out.every(r => r.downside_under_price != null),
    why: 'a list of ceilings with no floors beside them is how a person talks '
       + 'himself into a roster of lottery tickets' },
};
const allOk = Object.values(ctl).every(c => c.ok);

const doc = {
  _territory: 'TERRITORY: A — draft/tools/adp_upside.js',
  _ruling: 'Cory 2026-08-19: the band "tells you that this player could '
         + 'potentially outscore their ADP... its a risk but could pay off"',
  _warning: 'THIS RANKS A RISK, NOT A PROJECTION. It says nothing about whether '
          + 'he reaches his ceiling — only that if he does, the price was wrong.',
  _source: FILE, controls: ctl, controls_all_passed: allOk, n: out.length,
  players: out.sort((a, b) => b.upside_pct - a.upside_pct),
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'adp_upside.json'), JSON.stringify(doc, null, 1));

console.log('COULD HE OUTSCORE HIS DRAFT COST?\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k
  + (v.correlation_with_projection_edge != null ? `  (r = ${v.correlation_with_projection_edge})` : '')));

const show = (title, list) => {
  console.log(`\n  ── ${title} ──`);
  console.log('  ' + 'player'.padEnd(21) + 'pos'.padStart(4) + 'adp'.padStart(7)
    + 'slot buys'.padStart(11) + 'proj'.padStart(7) + 'ceiling'.padStart(9)
    + 'IF HE HITS'.padStart(12) + 'if he busts'.padStart(13) + '  risk');
  list.forEach(r => console.log('  ' + r.name.slice(0, 20).padEnd(21) + r.position.padStart(4)
    + String(r.adp.toFixed(0)).padStart(7) + String(r.slot_normally_returns).padStart(11)
    + String(r.proj).padStart(7) + String(r.ceiling).padStart(9)
    + ('+' + r.upside_pct + '%').padStart(12) + (r.downside_pct + '%').padStart(13)
    + (r.injury_risk_pct == null ? '' : '  ' + r.injury_risk_pct + '%')));
};
/* ⚠️ RANKED WITHIN POSITION. Pooled, the list came back ALL RUNNING BACKS --
 * not a bug and not a finding either: the RB curve collapses hardest, so the
 * slot value late is tiny and any decent ceiling looks enormous against it.
 * Cory picks the position, so the list has to answer "who is the bet AT WR",
 * not "who is the bet overall". Fourth time today that pooling across positions
 * produced a list that was really about the scale of the position. */
POS.forEach(q => {
  const late = doc.players.filter(r => r.position === q && r.adp >= 60).slice(0, 6);
  if (late.length) show(`${q} — the bets after pick 60`, late);
});
show('AND THE EARLY PICKS, where the price is already high',
  doc.players.filter(r => r.adp < 60).slice(0, 6));
console.log('\n  ⚠️  the right-hand column is what you lose if the bet misses. A man with');
console.log('     +150% upside and −60% downside is a different pick from one with');
console.log('     +150% and −10%, and the list refuses to show one without the other.');
process.exit(allOk ? 0 : 1);
