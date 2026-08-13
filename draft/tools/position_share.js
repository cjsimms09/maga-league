/* THE CLOSURE TEST FOR THE QB/TE COMPLAINT. Not "does the test pass" but
 * "is the symptom Cory saw demonstrably absent": what share of the TOP TEN
 * is QB/TE, against their share of the playable pool, at every one of his picks.
 * Run: node draft/tools/position_share.js */
'use strict';
const path=require('path'); const ROOT='/home/user/maga-league';
global.window=global;
['survival','composite','engine','needrule'].forEach(m=>require(path.join(ROOT,'public/js/draft',m+'.js')));
const LC=require(path.join(ROOT,'draft/tools/live_context.js'));
const E=global.DraftEngine;
const b=LC.loadBoard(), ALL=b.players, K=b.kept_players, MY=b.pick_order.my_picks.slice();
const drafted=new Set(); K.forEach(k=>drafted.add(String(k.player_id)));
const roster=K.map(k=>Object.assign({},k,{is_keeper:true}));
function opp(pool){let best=null;for(const p of pool){const a=p.adp==null?9999:+p.adp;if(!best||a<best._a){best=p;best._a=a;}}return best;}
// What fraction of the POOL is QB/TE, vs what fraction of the TOP 10 the panel shows?
console.log('pick | QB+TE share of pool | QB+TE share of TOP 10 | over-representation');
let tot=[0,0];
for(let i=0;i<MY.length;i++){
  const pick=MY[i], next=MY[i+1]||pick;
  let pool=ALL.filter(p=>!drafted.has(String(p.player_id)));
  const before=i===0?pick-1:pick-MY[i-1]-1;
  for(let k=0;k<before;k++){const p=opp(pool);if(!p)break;drafted.add(String(p.player_id));pool=pool.filter(x=>x!==p);}
  // pool restricted to PLAYABLE, which is what a person would consider
  const playable=pool.filter(p=>(p.team||'FA')!=='FA'&&+p.proj_mean>0);
  const poolShare=playable.filter(p=>p.position==='QB'||p.position==='TE').length/playable.length;
  const r=E.recommend(LC.liveContext({currentPick:pick,nextPick:next,board:pool,roster,
    myPicksLeft:MY.length-i,myPickIndex:i}));
  const t10=r.slice(0,10);
  const topShare=t10.filter(x=>x.player.position==='QB'||x.player.position==='TE').length/10;
  tot[0]+=poolShare; tot[1]+=topShare;
  console.log(String(pick).padStart(4)+' | '+(poolShare*100).toFixed(1).padStart(17)+'% | '
    +(topShare*100).toFixed(0).padStart(19)+'% | '+(poolShare>0?(topShare/poolShare).toFixed(2)+'x':'-'));
  drafted.add(String(r[0].player.player_id)); roster.push(r[0].player);
}
console.log('\nAVERAGE  pool '+(100*tot[0]/MY.length).toFixed(1)+'%   top-10 '
  +(100*tot[1]/MY.length).toFixed(1)+'%   over-representation '+(tot[1]/tot[0]).toFixed(2)+'x');
