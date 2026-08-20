/* THE RERUN. Cory's twelve picks, drafted forward with a GROWING real roster
 * and the real intervening picks, under the OLD weights (need 0) and the NEW
 * ones (need 1.0). Same board, same ADP drain, same everything else.
 *
 * Cory, 2026-08-20: "I do feel like we need to rerun roster test and other
 * model test as previous runs would've been flawed."
 *
 * ── WHY A FORWARD DRAFT AND NOT TWELVE INDEPENDENT PICKS ───────────────────
 *
 * An earlier version of this measurement handed the SAME roster (keepers only)
 * to every one of the twelve picks. That is not a draft — it is twelve copies
 * of pick 33 with a thinner board, and it inflates late-round QBs because the
 * QB slot never fills. The roster here grows by whatever the model actually
 * took, which is the only version of this question that has an answer.
 *
 * ── WHAT IT FOUND, 2026-08-20 ──────────────────────────────────────────────
 *
 *   6 of 12 picks changed.
 *   roster shape at need=0   : QB1 RB9 WR2 TE1 K1 DEF1
 *   roster shape at need=1.0 : QB1 RB7 WR4 TE1 K1 DEF1
 *   total VORP               : 210 -> 206
 *
 * The RB9/WR2 roster is the finding. With Chase, Henry and Walker kept, the
 * need-blind model took seven more running backs and finished with exactly two
 * wide receivers in a league that starts WR2 plus a flex — a lineup that is
 * legal on paper and has no WR on the bench. `need` at 1.0 costs 4 points of
 * raw VORP (1.9%) and buys two more receivers. That trade is the entire
 * argument for register 160, and it is here so the argument is checkable
 * rather than asserted.
 *
 * NOT A FIT. 1.0 is parity with `value`, chosen because it is the one number
 * nobody has to defend. This tool measures a consequence; it does not select a
 * weight, and running it over a grid to pick the best-looking roster would be
 * choosing a weight after seeing where the value fell.
 *
 * Run: node draft/tools/need_weight_rerun.js
 */
'use strict';
const fs=require('fs'),path=require('path');const ROOT='/home/user/maga-league';
global.window=global;
const E=require(path.join(ROOT,'public/js/draft/engine.js'));
const {realRoster}=require(path.join(ROOT,'draft/tests/_empty_roster_fiction_precondition.js'));
const D=JSON.parse(fs.readFileSync(path.join(ROOT,'public/draft_data.json'),'utf8'));
const L=D.league;
const byAdp=D.players.filter(p=>p.position&&p.proj_mean!=null)
  .sort((a,b)=>(a.adjusted_adp||a.raw_adp||999)-(b.adjusted_adp||b.raw_adp||999));
const order=((D.pick_order||{}).picks)||[];
const MY=((D.pick_order||{}).my_picks)||[];
const MY_SLOT=L.my_draft_slot;

function draft(weights){
  let roster=realRoster();
  const out=[];
  MY.forEach((cur,i)=>{
    const nxt=MY[i+1]||cur+15;
    const taken=new Set(byAdp.slice(0,cur-1).map(p=>String(p.player_id)));
    roster.forEach(k=>taken.add(String(k.player_id)));
    const board=byAdp.filter(p=>!taken.has(String(p.player_id)));
    const iv=order.filter(p=>p.overall>=cur&&p.overall<nxt&&p.slot!==MY_SLOT)
      .map(p=>({team_slot:p.slot,pick_no:p.overall,roster:[],profile:null,room:[]}));
    const ctx={board:board,roster:roster,league:L,currentPick:cur,nextPick:nxt,
      totalPicks:150,myPicksLeft:MY.length-i,myPickIndex:i,totalMyPicks:MY.length,
      roundsLeft:MY.length-i,runMultipliers:{},intervening:iv,weights:weights};
    const r=E.recommend(ctx);
    if(!r||!r.length){out.push(null);return;}
    out.push({name:r[0].player.name,pos:r[0].player.position,
      score:r[0].score,vorp:r[0].player.vorp,
      alt:(r[1]&&r[1].player.name)||'-'});
    roster=roster.concat([r[0].player]);
  });
  return {picks:out,roster:roster};
}

const W=E.MEASURED_WEIGHTS;
const OLD=Object.assign({},W,{need:0.0});
const a=draft(OLD),b=draft(W);

console.log('\n  RERUN ON A REAL, GROWING ROSTER — old weights (need 0) vs new (need '+W.need+')\n');
console.log('  pick   need=0                        need='+W.need);
let diff=0;
MY.forEach((cur,i)=>{
  const x=a.picks[i],y=b.picks[i];
  const same=x&&y&&x.name===y.name;
  if(!same)diff++;
  console.log('  '+String(cur).padEnd(7)
    +((x?x.pos+' '+x.name:'—')).padEnd(30)
    +((y?y.pos+' '+y.name:'—')).padEnd(28)
    +(same?'':'  <-- CHANGED'));
});
const shape=r=>{const c={};r.forEach(p=>{c[p.position]=(c[p.position]||0)+1;});
  return ['QB','RB','WR','TE','K','DEF'].map(k=>k+c[k]||'').filter(Boolean).join(' ');};
console.log('\n  '+diff+' of '+MY.length+' picks changed');
console.log('  roster shape  need=0 : '+shape(a.roster));
console.log('  roster shape  need='+W.need+' : '+shape(b.roster));
const tot=r=>r.reduce((s,p)=>s+(p.vorp||0),0);
console.log('  total VORP    need=0 : '+tot(a.roster).toFixed(0)
  +'   need='+W.need+' : '+tot(b.roster).toFixed(0)+'\n');
