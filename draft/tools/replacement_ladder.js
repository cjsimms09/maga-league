/* CORY'S LADDER (2026-08-13), levels A-D. THE ANSWER IS THAT ALL FOUR RUNGS
 * ALREADY EXIST: A = the artifact's `vorp` (positional draft replacement, flex
 * slots allocated); B/D = `need` = starterSlotMarginal (VORP adjusted for WHICH
 * SLOT this player fills on THIS roster, with a flex discount); C = `vona`
 * (proj_mean minus E[best same-position available at my next pick]) — and C is
 * the LIVE value term. This moves the weight on B/D from 0 to 2 and measures.
 * Run: node draft/tools/replacement_ladder.js */
/* THE LADDER. Projections held constant; only the weight on `need` moves.
 * `need` = starterSlotMarginal = VORP adjusted for WHICH SLOT this player fills
 * on THIS roster, with a flex discount. It is Cory's ladder level B/D and it is
 * already implemented — and weighted zero. */
'use strict';
const path=require('path'); const ROOT='/home/user/maga-league';
global.window=global;
['survival','composite','engine','needrule'].forEach(m=>require(path.join(ROOT,'public/js/draft',m+'.js')));
const LC=require(path.join(ROOT,'draft/tools/live_context.js'));
const E=global.DraftEngine;
const B=LC.loadBoard(), ALL=B.players, K=B.kept_players, MY=B.pick_order.my_picks.slice();
const adpOf=p=>p.adp==null?9999:+p.adp;
const bestAdp=pool=>pool.reduce((b,p)=>(!b||adpOf(p)<adpOf(b))?p:b,null);
const med=a=>{const t=a.slice().sort((x,y)=>x-y);return t.length?t[Math.floor(t.length/2)]:null;};
const q=(a,f)=>{const t=a.slice().sort((x,y)=>x-y);if(!t.length)return null;const i=(t.length-1)*f;const lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?t[lo]:t[lo]+(t[hi]-t[lo])*(i-lo);};

function run(needW){
  const drafted=new Set(); K.forEach(k=>drafted.add(String(k.player_id)));
  const roster=K.map(k=>Object.assign({},k,{is_keeper:true}));
  const picks=[]; let qbteTop10=0, n=0;
  for(let i=0;i<MY.length;i++){
    const pick=MY[i], next=MY[i+1]||pick;
    let pool=ALL.filter(p=>!drafted.has(String(p.player_id)));
    const gap=i===0?pick-1:pick-MY[i-1]-1;
    for(let k=0;k<gap;k++){const o=bestAdp(pool);if(!o)break;drafted.add(String(o.player_id));pool=pool.filter(x=>x!==o);}
    const r=E.recommend(LC.liveContext({currentPick:pick,nextPick:next,board:pool,roster,
      myPicksLeft:MY.length-i,myPickIndex:i,
      weights:Object.assign({},E.MEASURED_WEIGHTS,{need:needW})}));
    const t=r[0];
    picks.push({pick,pos:t.player.position,name:t.player.name,reach:adpOf(t.player)-pick});
    qbteTop10+=r.slice(0,10).filter(x=>x.player.position==='QB'||x.player.position==='TE').length; n+=10;
    drafted.add(String(t.player.player_id)); roster.push(t.player);
  }
  const shape={}; picks.forEach(p=>shape[p.pos]=(shape[p.pos]||0)+1);
  const reaches=picks.map(p=>p.reach);
  return {picks,shape,qbte:qbteTop10/n,med:med(reaches),p90:q(reaches,0.9),max:Math.max(...reaches)};
}
console.log('need   roster shape                          QB+TE in top10   reach med   p90    max');
[0,0.25,0.5,1.0,2.0].forEach(w=>{
  const r=run(w);
  const sh=['QB','RB','WR','TE','DEF','K'].map(p=>p+(r.shape[p]||0)).join(' ');
  console.log(String(w).padEnd(6)+sh.padEnd(38)+(100*r.qbte).toFixed(0).padStart(11)+'%'
    +r.med.toFixed(1).padStart(12)+r.p90.toFixed(1).padStart(7)+r.max.toFixed(1).padStart(7));
});
console.log('\n(market reference from Stage 1: RB6 WR4 QB1 TE1, reach med +3.8 p90 +8.8 max +10.3)');
console.log('\nPICKS AT need=1.0:');
run(1.0).picks.forEach(p=>console.log('  '+String(p.pick).padStart(4)+'  '+p.pos.padEnd(4)+' '+p.name.padEnd(24)+' reach '+(p.reach>=0?'+':'')+p.reach.toFixed(1)));
