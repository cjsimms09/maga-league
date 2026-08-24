/* TERRITORY: D — report-only instrument, writes nothing. Register 280.
 * Run: node draft/tools/archetype_arm_firing_probe.js
 *
 * WHY DOES THE ARCHETYPE FAMILY'S NON-VACUITY CONTROL NEVER FIRE?
 *
 * `anti_barbell` is declared PRE-DECLARED TO LOSE and produces exactly zero
 * divergence across 40 rooms x 12 picks, in two independent artifacts. Register
 * 280 filed that as unexplained after killing two hypotheses. This calls
 * `choosePick` DIRECTLY at each of Cory's picks — the instrumentation that row's
 * next-action asked for — instead of proxying the slate by board rank.
 *
 * CONTROLS (Rule 3e/3f). A null here is exactly the shape a broken harness makes,
 * so three things must be shown BEFORE any "never fires" is believed:
 *   C1  the classifier works in this harness at all — whole-board census shows DEAD.
 *   C2  the harness really drives choosePick — `market_adp` (which we know diverges
 *       ~6 picks/room) must diverge here too. If it does not, the harness is wrong.
 *   C3  the ARM ITSELF can fire — on a HAND-BUILT slate containing a DEAD row,
 *       `anti_barbell` must select it. This is the one that separates "the arm is
 *       broken" from "the slate never offers the class".
 *
 * STATED LIMIT: opponents are drained by ADP, not by the measured opponent model
 * the real rooms use, so divergence COUNTS here will not match the 40-room
 * artifact. The question asked is qualitative — does the class ever appear in the
 * engine's own top-25, and does the arm act when it does.
 */
'use strict';
const path=require('path'); const ROOT=path.resolve(__dirname,'..','..');
global.window=global;
['survival','composite','engine','needrule'].forEach(m=>require(path.join(ROOT,'public/js/draft',m+'.js')));
const LC=require(path.join(ROOT,'draft/tools/live_context.js'));
const AP=require(path.join(ROOT,'draft/tools/archetype_policy.js'));
const UC=require(path.join(ROOT,'draft/tools/upside_class.js'));
const E=global.DraftEngine;

const B=LC.loadBoard(), ALL=B.players, LEAGUE=B.league;
const MY_SLOT=LEAGUE.my_draft_slot;
/* register 269/276: MY seat's keepers, not the whole league's. */
const MY_KEEPERS=(B.kept_players||[]).filter(k=>Number(k.team_slot)===MY_SLOT);
const MY=(B.pick_order.my_picks||[]).map(p=>p.overall??p);
const ONESIE={K:1,DEF:1,DST:1};
const adpOf=p=>p.adp==null?9999:+p.adp;
const bestAdp=pool=>pool.reduce((b,p)=>(!b||adpOf(p)<adpOf(b))?p:b,null);

// ── C1 ───────────────────────────────────────────────────────────────────────
const boardCensus=UC.census(ALL.filter(p=>p.position));
console.log('C1  classifier live in this harness:', JSON.stringify(boardCensus));
if (!boardCensus.DEAD) { console.error('CONTROL C1 FAILED — no DEAD on the board'); process.exit(2); }

// ── C3 ───────────────────────────────────────────────────────────────────────
const deadRow=ALL.find(p=>p.position&&!ONESIE[p.position]&&UC.classify(p)==='DEAD');
const anchorRow=ALL.find(p=>p.position&&!ONESIE[p.position]&&UC.classify(p)==='ANCHOR');
if(!deadRow||!anchorRow){console.error('CONTROL C3 FAILED — no DEAD/ANCHOR row to build a slate');process.exit(2);}
const synth=[{player:anchorRow,score:100},{player:deadRow,score:1}];
const st={round:3,classOf:UC.classify};
const c3=AP.choosePick('anti_barbell',synth,st);
console.log('C3  anti_barbell on a hand-built slate WITH a DEAD row picks:',
  c3.player===deadRow?'the DEAD row — THE ARM CAN FIRE':'recs[0] — ARM BROKEN');
if(c3.player!==deadRow){console.error('CONTROL C3 FAILED');process.exit(2);}
console.log();

// ── the real slates ──────────────────────────────────────────────────────────
const drafted=new Set(); MY_KEEPERS.forEach(k=>drafted.add(String(k.player_id)));
const roster=MY_KEEPERS.map(k=>Object.assign({},k,{is_keeper:true}));
const ARMS=['anti_barbell','no_deadweight','anchor_early','barbell','upside_late','market_adp'];
const fired={}; ARMS.forEach(a=>fired[a]=0);
let deadSeen=0, slates=0, legalityPicks=0; const legalityWhy={};
console.log('pick rnd | top-25 slate ANCHOR/SWING/DEAD | rec[0] class | arms that DIVERGE');
for(let i=0;i<MY.length;i++){
  const pick=MY[i], next=MY[i+1]||pick;
  let pool=ALL.filter(p=>!drafted.has(String(p.player_id)));
  const gap=i===0?pick-1:pick-MY[i-1]-1;
  for(let k=0;k<gap;k++){const o=bestAdp(pool);if(!o)break;drafted.add(String(o.player_id));pool=pool.filter(x=>x!==o);}
  const ctx=LC.liveContext({currentPick:pick,nextPick:next,board:pool,roster,
    myPicksLeft:MY.length-i,myPickIndex:i});
  const recs=E.recommend(ctx);
  const cand=AP.candidates(recs);
  const cls=r=>UC.classify(r.player);
  const nonOnesie=cand.filter(r=>!ONESIE[r.player.position]);
  const n={ANCHOR:0,SWING:0,DEAD:0};
  nonOnesie.forEach(r=>{const c=cls(r); if(n[c]!=null)n[c]++;});
  deadSeen+=n.DEAD; slates++;
  const round=i+1;
  const state={round,classOf:UC.classify,picksLeft:MY.length-i};
  const owned=AP.legalityOwns(recs);
  const why=recs[0].forced?'forced':(recs[0].legality_warning!=null?'warning':'');
  if(owned){ legalityPicks++; legalityWhy[why]=(legalityWhy[why]||0)+1; }
  const div=ARMS.filter(a=>AP.choosePick(a,recs,state)!==recs[0]);
  div.forEach(a=>fired[a]++);
  console.log(`${String(pick).padStart(4)} ${String(round).padStart(3)} | `
    +`${String(n.ANCHOR).padStart(6)}/${String(n.SWING).padStart(5)}/${String(n.DEAD).padStart(4)}`
    +` | ${cls(recs[0]).padEnd(11)} | ${(owned?'LEGALITY OWNS('+why+') ':'')}${div.join(' ')||'(none)'}`);
}
console.log();
console.log('C2  market_adp diverged at', fired.market_adp, 'of', slates,
  '— harness drives choosePick:', fired.market_adp>0?'YES':'NO — HARNESS BROKEN');
if(!fired.market_adp){console.error('CONTROL C2 FAILED');process.exit(2);}
console.log();
console.log('DEAD non-onesie rows appearing in the engine\'s own top-25, all picks:', deadSeen);
console.log('picks where LEGALITY OWNS the choice (every overlay disabled by design):',
  legalityPicks, 'of', slates, JSON.stringify(legalityWhy));
ARMS.forEach(a=>console.log(`  ${a.padEnd(14)} diverged at ${fired[a]} of ${slates} picks`));
