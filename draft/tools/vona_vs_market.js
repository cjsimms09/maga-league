/* QUESTION 8, AGAINST THE RIGHT QUANTITY. The composite's `value` term is VONA
 * (proj_mean minus E[best same-position available at my next pick]), NOT the
 * static `vorp` field on the artifact. An earlier pass ranked on `vorp` and was
 * describing a number the composite never reads.
 * Run: node draft/tools/vona_vs_market.js */
'use strict';
const path=require('path'); const ROOT='/home/user/maga-league';
global.window=global;
['survival','composite','engine','needrule'].forEach(m=>require(path.join(ROOT,'public/js/draft',m+'.js')));
const LC=require(path.join(ROOT,'draft/tools/live_context.js'));
const E=global.DraftEngine;
const B=LC.loadBoard(), ALL=B.players, K=B.kept_players, MY=B.pick_order.my_picks.slice();
const adpOf=p=>p.adp==null?9999:+p.adp;
const bestAdp=pool=>pool.reduce((b,p)=>(!b||adpOf(p)<adpOf(b))?p:b,null);
const med=a=>{const t=a.slice().sort((x,y)=>x-y);return t[Math.floor(t.length/2)];};
const drafted=new Set(); K.forEach(k=>drafted.add(String(k.player_id)));
const roster=K.map(k=>Object.assign({},k,{is_keeper:true}));
console.log('THE ACTUAL DECISIVE QUANTITY: value = VONA = proj_mean - E[best same-position');
console.log('available at my next pick]. Ranked against ADP, at each of my STARTER picks');
console.log('(the regime where value reconciles to the score exactly).\n');
console.log('pick  position medians of (ADP-rank - VONA-rank); + = we pull forward');
for(let i=0;i<MY.length;i++){
  const pick=MY[i], next=MY[i+1]||pick;
  let pool=ALL.filter(p=>!drafted.has(String(p.player_id)));
  const gap=i===0?pick-1:pick-MY[i-1]-1;
  for(let k=0;k<gap;k++){const o=bestAdp(pool);if(!o)break;drafted.add(String(o.player_id));pool=pool.filter(x=>x!==o);}
  const ctx=LC.liveContext({currentPick:pick,nextPick:next,board:pool,roster,
    myPicksLeft:MY.length-i,myPickIndex:i});
  const recs=E.recommend(ctx);
  const fills=(recs[0].components||{}).need_fills;
  // rank the priced, projected pool by VONA and by ADP
  const priced=recs.filter(r=>r.player.adp!=null&&+r.player.adp<300&&+r.player.proj_mean>0);
  const byV=priced.slice().sort((a,b)=>(b.components.vona||0)-(a.components.vona||0));
  const byA=priced.slice().sort((a,b)=>adpOf(a.player)-adpOf(b.player));
  const vR={},aR={};
  byV.forEach((r,j)=>vR[r.player.player_id]=j+1);
  byA.forEach((r,j)=>aR[r.player.player_id]=j+1);
  const byPos={};
  priced.forEach(r=>{(byPos[r.player.position]=byPos[r.player.position]||[]).push(aR[r.player.player_id]-vR[r.player.player_id]);});
  const cells=['RB','WR','TE','QB','DEF','K'].map(p=>byPos[p]?p+' '+(med(byPos[p])>=0?'+':'')+med(byPos[p]):p+' -').join('  ');
  console.log(String(pick).padStart(4)+' ['+String(fills).padEnd(7)+'] '+cells);
  drafted.add(String(recs[0].player.player_id)); roster.push(recs[0].player);
}
