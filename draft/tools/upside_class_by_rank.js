/* TERRITORY: D — report-only instrument, writes nothing. Register 280.
 * Run: node draft/tools/upside_class_by_rank.js
 *
 * WHERE DO THE UPSIDE CLASSES LIVE, BY BOARD RANK — and can the barbell family's
 * arms actually SEE the class each one seeks?
 *
 * The arms in archetype_policy.js act on the engine's TOP_N=25 candidate slate,
 * not on the whole board, so the board-wide census (88 ANCHOR / 58 SWING /
 * 374 DEAD) does NOT tell you what those arms can reach. This prints both.
 *
 * CONTROLS (Rule 3e/3f) — a null here is the exact shape a broken probe makes:
 *   KNOWN-POSITIVE: the whole-board census must report DEAD. The board carries
 *     374; if this line reads 0 the probe is broken, not the board.
 *   KNOWN-POSITIVE 2: every one of Cory's picks must have DEAD non-onesie rows
 *     somewhere in its AVAILABLE pool, or the removal step is not deepening the
 *     slate and the per-pick table means nothing.
 *
 * STATED LIMIT, and it is load-bearing: the per-pick table orders the pool by
 * `overall_rank` (the board's VORP order) and approximates the room's draw by
 * ADP. The ENGINE ranks by SCORE, which is not the same ordering. So this
 * bounds what the arms could see; it does not reproduce the room.
 */
'use strict';
const fs=require('fs'), path=require('path'); const ROOT=path.resolve(__dirname,'..','..');
global.window=global;
const UC=require(path.join(ROOT,'draft/tools/upside_class.js'));
const AP=require(path.join(ROOT,'draft/tools/archetype_policy.js'));
const art=JSON.parse(fs.readFileSync(path.join(ROOT,'public/draft_data.json'),'utf8'));

const pool=(art.players||[]).filter(p=>p.position);
// board order: the engine ranks on score; overall_rank is the shipped ordering
const ranked=pool.slice().sort((a,b)=>(a.overall_rank??9e9)-(b.overall_rank??9e9));
const ONESIE={K:1,DEF:1,DST:1};

function census(rows){const o={ANCHOR:0,SWING:0,DEAD:0,UNMEASURED:0,NA:0};
  rows.forEach(p=>{o[UC.classify(p)]++;});return o;}

console.log('whole board (control, must show DEAD):', JSON.stringify(census(ranked)));
console.log();
const BANDS=[[0,25],[25,50],[50,100],[100,200],[200,400],[400,ranked.length]];
console.log('rank band   ANCHOR SWING  DEAD  UNMEAS    NA   | DEAD non-onesie');
for(const [a,b] of BANDS){
  const rows=ranked.slice(a,b);
  const c=census(rows);
  const deadNon=rows.filter(p=>!ONESIE[p.position]&&UC.classify(p)==='DEAD').length;
  console.log(`${(a+'-'+b).padEnd(11)} ${String(c.ANCHOR).padStart(6)}${String(c.SWING).padStart(6)}${String(c.DEAD).padStart(6)}${String(c.UNMEASURED).padStart(8)}${String(c.NA).padStart(6)}   | ${deadNon}`);
}
console.log();
console.log('TOP_N =', AP.TOP_N, '— the window every barbell arm acts inside');
const t=ranked.slice(0,AP.TOP_N);
console.log('top-25 classes:', JSON.stringify(census(t)));
console.log('top-25 DEAD non-onesie (what anti_barbell/no_deadweight need):',
  t.filter(p=>!ONESIE[p.position]&&UC.classify(p)==='DEAD').length);
console.log('top-25 rank-1 class:', UC.classify(t[0]), '—', t[0].name, t[0].position);

/* ── AT EACH OF CORY'S TWELVE PICKS ──────────────────────────────────────────
 * The arms see the top-25 AVAILABLE, not the board's top-25. Approximate the
 * room by removing the (pick-1) lowest-ADP players plus the 23 keepers, then
 * census the top-25 of what remains by board rank. This is an APPROXIMATION of
 * the room's draw order (ADP, not the measured opponent model), stated as one.
 * CONTROL: at least one pick must show a non-zero DEAD count somewhere in the
 * available pool, or the removal is not actually deepening the slate. */
const kept=new Set((art.kept_players||[]).map(k=>String(k.player_id)));
const byAdp=pool.slice().sort((a,b)=>
  ((a.adjusted_adp??a.raw_adp??9999)-(b.adjusted_adp??b.raw_adp??9999)));
const MY=((art.pick_order||{}).my_picks||[]).map(p=>p.overall??p);
console.log();
console.log('pick | top-25 AVAILABLE: ANCHOR SWING DEAD | DEAD non-onesie | rank-1 class');
let anyDead=0, anyDeadInPool=0;
for(const pk of MY){
  const gone=new Set(byAdp.slice(0,Math.max(0,pk-1)).map(p=>String(p.player_id)));
  const avail=ranked.filter(p=>!gone.has(String(p.player_id))&&!kept.has(String(p.player_id)));
  const top=avail.slice(0,AP.TOP_N);
  const c=census(top);
  const deadNon=top.filter(p=>!ONESIE[p.position]&&UC.classify(p)==='DEAD').length;
  anyDead+=deadNon;
  anyDeadInPool+=avail.filter(p=>!ONESIE[p.position]&&UC.classify(p)==='DEAD').length?1:0;
  console.log(`${String(pk).padStart(4)} | ${String(c.ANCHOR).padStart(21)}${String(c.SWING).padStart(6)}${String(c.DEAD).padStart(5)} | ${String(deadNon).padStart(15)} | ${UC.classify(top[0])}`);
}
console.log();
console.log('CONTROL — picks whose AVAILABLE pool contains DEAD non-onesie:', anyDeadInPool, 'of', MY.length);
console.log('TOTAL DEAD non-onesie inside any top-25 slate across all 12 picks:', anyDead);
