/* THE SMALLEST DEFENSIBLE CORRECTION: make the code HONOUR the measured weight.
 * BENCH_CEILING_FLOOR = 0.25 overrides MEASURED_WEIGHTS.ceiling = 0 on every
 * bench pick. Setting the floor to 0 adds nothing and invents nothing — it
 * stops a constant from re-enabling a term the measurement could not sign. */
'use strict';
const path=require('path'); const ROOT='/home/user/maga-league';
global.window=global;
['survival','composite','engine','needrule'].forEach(m=>require(path.join(ROOT,'public/js/draft',m+'.js')));
const LC=require(path.join(ROOT,'draft/tools/live_context.js'));
const E=global.DraftEngine;
const B=LC.loadBoard(), ALL=B.players, K=B.kept_players, MY=B.pick_order.my_picks.slice();
const adpOf=p=>p.adp==null?9999:+p.adp;
const bestAdp=pool=>pool.reduce((b,p)=>(!b||adpOf(p)<adpOf(b))?p:b,null);
const q=(a,f)=>{const t=a.slice().sort((x,y)=>x-y);const i=(t.length-1)*f;const lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?t[lo]:t[lo]+(t[hi]-t[lo])*(i-lo);};
function run(){
  const drafted=new Set(); K.forEach(k=>drafted.add(String(k.player_id)));
  const roster=K.map(k=>Object.assign({},k,{is_keeper:true}));
  const picks=[]; let qbte=0,n=0, resid=[];
  for(let i=0;i<MY.length;i++){
    const pick=MY[i], next=MY[i+1]||pick;
    let pool=ALL.filter(p=>!drafted.has(String(p.player_id)));
    const gap=i===0?pick-1:pick-MY[i-1]-1;
    for(let k=0;k<gap;k++){const o=bestAdp(pool);if(!o)break;drafted.add(String(o.player_id));pool=pool.filter(x=>x!==o);}
    const r=E.recommend(LC.liveContext({currentPick:pick,nextPick:next,board:pool,roster,
      myPicksLeft:MY.length-i,myPickIndex:i}));
    const t=r[0], w=t.components.weighted;
    const sum=Object.keys(w).reduce((s,k2)=>s+(+w[k2]||0),0);
    resid.push(Math.abs(+t.score-sum));
    picks.push({pick,pos:t.player.position,name:t.player.name,reach:adpOf(t.player)-pick});
    qbte+=r.slice(0,10).filter(x=>x.player.position==='QB'||x.player.position==='TE').length; n+=10;
    drafted.add(String(t.player.player_id)); roster.push(t.player);
  }
  const shape={}; picks.forEach(p=>shape[p.pos]=(shape[p.pos]||0)+1);
  const re=picks.map(p=>p.reach);
  return {picks,shape,qbte:qbte/n,med:q(re,0.5),p90:q(re,0.9),max:Math.max(...re),
    maxResid:Math.max(...resid)};
}
const before=run();
E.CFG.BENCH_CEILING_FLOOR=0;
const after=run();
const fmt=r=>['QB','RB','WR','TE','DEF','K'].map(p=>p+(r.shape[p]||0)).join(' ');
console.log('                    roster shape                     QB+TE top10  med    p90    max   max|residual|');
console.log('floor 0.25 (live) '+fmt(before).padEnd(34)+(100*before.qbte).toFixed(0).padStart(8)+'%'
  +before.med.toFixed(1).padStart(8)+before.p90.toFixed(1).padStart(7)+before.max.toFixed(1).padStart(7)+before.maxResid.toFixed(1).padStart(13));
console.log('floor 0    (honour)'+fmt(after).padEnd(33)+(100*after.qbte).toFixed(0).padStart(8)+'%'
  +after.med.toFixed(1).padStart(8)+after.p90.toFixed(1).padStart(7)+after.max.toFixed(1).padStart(7)+after.maxResid.toFixed(1).padStart(13));
console.log('\nmarket reference: RB6 WR4 QB1 TE1   med +3.8  p90 +8.8  max +10.3\n');
console.log('PICKS AT floor 0:');
after.picks.forEach(p=>console.log('  '+String(p.pick).padStart(4)+'  '+p.pos.padEnd(4)+' '+p.name.padEnd(24)+' reach '+(p.reach>=0?'+':'')+p.reach.toFixed(1)));
