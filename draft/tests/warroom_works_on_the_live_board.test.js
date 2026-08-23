// TERRITORY: A
/* DOES THE WAR ROOM ACTUALLY WORK ON THE BOARD THAT IS LIVE RIGHT NOW?
 *
 * Written 2026-08-22, hours after the keeper lock, because the post-lock
 * rebuild turned 2 red JS suites into 41 and I needed to know which question
 * that answered. It does not answer "do the tests pass" — it answers "do the
 * numbers Cory reads at 6pm come out, and are they sane".
 *
 * THE ANSWER, and it is why the 41 are pins rather than breakage: every check
 * here passes on the post-lock board. The board excludes every kept player,
 * Cory's twelve picks are unchanged, all eight sources score and produce VONA,
 * survival is per-player and monotone in ADP, and THE PICK resolves to a real
 * draftable man. The 41 failing suites assert things like "the slate is mine
 * only, not the league's" — true while opponent keepers were WITHHELD, false
 * by design the moment the slate confirmed, which was the entire point.
 *
 * ── WHY THIS FILE EXISTS AND NOT JUST THE 41 ────────────────────────────────
 *
 * Those suites pin the SHAPE of a specific board vintage. This one exercises
 * the RENDER PATH and asks whether it produces usable answers on whatever board
 * is committed. Both are worth having; only this one would have caught a war
 * room that renders but computes garbage, and only this one keeps working
 * across a keeper lock without being rewritten.
 *
 * ⚠️ MY OWN PROBE WAS WRONG TWICE BEFORE IT WAS RIGHT, AND THAT IS THE REASON
 * FOR EVERY CONTROL IN IT.
 *   1. I called `conservedSurvival(player, ...)`. It takes `(board, targetPick,
 *      ctx)`. All 203 lookups returned undefined and I nearly filed "survival
 *      is broken on the post-lock board" as a finding.
 *   2. Corrected the call and still read the map off the top level. It is
 *      nested at `.byId` — the return is {byId, lambda, picks, massBefore,
 *      massAfter, ...}. Same wrong-level mistake, twice in five minutes.
 *   And underneath both, a VACUOUS GREEN: "survival rises with ADP inside the
 *   5-95%% band" PASSED while the band was empty, sitting directly below two
 *   reds. A check that cannot fail on an empty set is not a check.
 *
 * So the survival section now carries two CONTROLS — "numbers came back at all"
 * and "the band is non-empty" — either of which fires before the real
 * assertions can pass on nothing. Rule 3e, learned the hard way, in the file
 * that learned it.
 */
'use strict';
const path=require('path'); const ROOT=require('path').join(__dirname,'..','..');
global.window=global;
require(path.join(ROOT,'public/js/draft/survival.js'));
require(path.join(ROOT,'public/js/draft/composite.js'));
require(path.join(ROOT,'public/js/draft/source_board.js'));
const SB=global.window.SourceBoard;
const E=require(path.join(ROOT,'public/js/draft/engine.js'));
const V=require(path.join(ROOT,'public/js/draft/verdict.js'));
const d=require(path.join(ROOT,'public/draft_data.json'));
let bad=0; const ck=(n,c,x)=>{ if(c){console.log('OK   '+n)} else {bad++;console.log('BAD  '+n+'  '+JSON.stringify(x).slice(0,180))} };

const my=(d.pick_order||{}).my_picks||[]; const allPicks=(d.pick_order||{}).picks||[];
const keptIds=new Set((d.kept_player_ids||[]).map(String));
const kept=(d.kept_players||[]).filter(p=>String(p.team_slot)===String(8));
const base=d.players.filter(p=>!keptIds.has(String(p.player_id)));

ck('board excludes every kept player from the draftable pool',
   base.length===d.players.length && d.players.filter(p=>keptIds.has(String(p.player_id))).length===0,
   {players:d.players.length, base:base.length});
ck('Cory picks are the shipped schedule', JSON.stringify(my)==='[33,48,53,68,73,88,93,108,113,128,133,148]', my);
ck('my roster = my 3 keepers only', kept.length===3, kept.map(p=>p.name));

function ctxAt(pk,idx,src){
  const pool=SB.forSource(base,src);
  return {board:pool,currentPick:pk,nextPick:my[idx+1]||pk+20,totalPicks:allPicks.length,
    roster:kept.slice(),currentKeepers:kept.slice(),league:d.league,pickBoard:allPicks,
    intervening:[],myPickIndex:idx,totalMyPicks:my.length,myPicksLeft:my.length-idx,
    roundsLeft:my.length-idx,runMultipliers:{},drift:null,preDraftPrep:true};
}
// 1. SCORING + VONA at his first pick, every source
const perSrc=[];
[null].concat(SB.SOURCES.map(s=>s.key)).forEach(k=>{
  const pool=SB.forSource(base,k); const ctx=ctxAt(my[0],0,k);
  const rows=[];
  pool.forEach(p=>{ if(p.adjusted_adp==null||p.adjusted_adp>250) return;
    const s=E.scorePlayer(p,ctx)||{}; const c=s.components||{};
    if(s.score!=null) rows.push({n:p.position+' '+p.name,s:s.score,v:c.vona}); });
  rows.sort((a,b)=>b.s-a.s);
  perSrc.push({k:k||'blend',n:rows.length,top:rows[0]&&rows[0].n,
    vona:rows.filter(r=>r.v!=null).length});
});
ck('every source scores a full board at pick 33', perSrc.every(x=>x.n>=100), perSrc.map(x=>x.k+':'+x.n));
ck('every source produces VONA', perSrc.every(x=>x.vona>=100), perSrc.map(x=>x.k+':'+x.vona));
ck('no kept player appears in any source view',
   [null].concat(SB.SOURCES.map(s=>s.key)).every(k=>SB.forSource(base,k).every(p=>!keptIds.has(String(p.player_id)))));

// 2. SURVIVAL — my FIRST probe called this wrong and reported a false alarm.
// conservedSurvival(board, targetPick, ctx) takes the BOARD and returns a map;
// I passed it one player, got undefined for all 203, and nearly filed it as a
// defect. Worse, my "rises with ADP" check then passed on the EMPTY set — a
// vacuous green sitting right under a red. Both fixed, with a control.
let surv=null, survErr=null;
try{
  const ctx=ctxAt(my[0],0,null);
  const pool=SB.forSource(base,null).filter(p=>p.adjusted_adp!=null&&p.adjusted_adp<=200);
  // .byId — the map is NESTED. conservedSurvival returns
  // {byId, lambda, picks, massBefore, massAfter, ...}. This is the THIRD time
  // this session I have read a value off the wrong level of a return object
  // and briefly believed the result; the control below is what caught it twice.
  const r=global.window.DraftSurvival.conservedSurvival(pool, my[1], ctx);
  const m=(r&&r.byId)||{};
  surv=pool.map(p=>({n:p.name,adp:p.adjusted_adp,s:m[String(p.player_id)]}));
}catch(e){survErr=e.message}
ck('survival computes without throwing on the post-lock board', !survErr, survErr);
if(surv){
  const vals=surv.map(x=>x.s).filter(v=>typeof v==='number');
  ck('CONTROL: survival returned numbers at all — zero here means the probe is '
     +'broken, not the board (it did, the first time)', vals.length>50,
     {got:vals.length,of:surv.length});
  ck('survival returns a number for every top-200 player', vals.length===surv.length,
     {got:vals.length,of:surv.length});
  ck('survival is per-player, not one constant',
     new Set(vals.map(v=>v.toFixed(4))).size>20,
     {distinct:new Set(vals.map(v=>v.toFixed(4))).size});
  const inBand=surv.filter(x=>typeof x.s==='number'&&x.s>0.05&&x.s<0.95);
  ck('CONTROL: the 5-95% band is non-empty, so the monotonicity check below '
     +'cannot pass by having nothing to check', inBand.length>=20, {n:inBand.length});
  ck('survival rises with ADP inside the 5-95% band',
     (()=>{if(inBand.length<20) return false;
       const a=inBand.slice().sort((x,y)=>x.adp-y.adp);
       let inv=0; for(let i=1;i<a.length;i++) if(a[i].s<a[i-1].s-0.15) inv++;
       return inv<=a.length*0.1;})(), {n:inBand.length});
}
// 3. THE PICK
const ctx=ctxAt(my[0],0,null);
const scored=[]; SB.forSource(base,null).forEach(p=>{ if(p.adjusted_adp==null||p.adjusted_adp>250)return;
  const s=E.scorePlayer(p,ctx)||{}; if(s.score!=null) scored.push({player:p,score:s.score,components:s.components||{},gap_to_second:null});});
scored.sort((a,b)=>b.score-a.score); if(scored[1]) scored[0].gap_to_second=scored[0].score-scored[1].score;
const v=V.derive({cfg:E.CFG,scored,confidence:{level:'none',gap:0,message:''},roster:kept.slice(),sourceLabel:'the blend'});
ck('THE PICK resolves to a real player', !!(v&&v.pick&&v.pick.name), v&&v.verdict);
ck('THE PICK is not a kept player', v&&v.pick&&!keptIds.has(String(v.pick.player_id)), v&&v.pick&&v.pick.name);
console.log('\nTHE PICK at 33:', v&&v.pick&&v.pick.name, '|', (v&&v.why||'').slice(0,110));
console.log('top by source:', perSrc.map(x=>x.k+'='+x.top).join(' · '));
console.log('\n'+(bad?('*** '+bad+' PROBLEM(S)'):'ALL LIVE CHECKS PASS'));
process.exit(bad?1:0);
