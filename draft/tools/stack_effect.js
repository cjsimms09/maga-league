/* WHAT DID D10's CORRECTION ACTUALLY DO TO THE BOARD? stack 0.5 vs 1.0,
 * real keepers, real board. The earlier answer ("nothing in the top 10") was
 * measured with a keeper lookup that silently resolved to an empty roster. */
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const board=JSON.parse(fs.readFileSync(path.join(ROOT,'public','draft_data.json'),'utf8'));
const players=board.players||[];
global.window=global;
require(path.join(ROOT,'public','js','draft','survival.js'));
require(path.join(ROOT,'public','js','draft','engine.js'));
const E=global.DraftEngine;
// KEPT PLAYERS ARE A SEPARATE ARRAY, removed from the draftable pool. Reading
// them out of `players` resolves to nothing and every stack term is zero — the
// dead instrument that produced this question's first two (wrong) answers.
const keepers=board.kept_players||[];
if(!keepers.length){console.error('no kept_players — every stack term would be 0; refusing');process.exit(1);}

function run(pick,next,stackW){
  const w={...E.MEASURED_WEIGHTS, stack:stackW};
  const recs=E.recommend({board:players,available:players,players:players,drafted:[],
    roster:keepers,currentPick:pick,nextPick:next,myPicks:[pick,next],teams:10,
    round:Math.ceil(pick/10),weights:w});
  const list=Array.isArray(recs)?recs:(recs.recommendations||recs.list||[]);
  return list;
}
// GUARD: prove the weight override is actually reaching the engine, or this
// whole comparison is two identical runs agreeing with each other (rule 10d).
const probeA=run(33,48,0.0), probeB=run(33,48,3.0);
const sameScores=probeA.slice(0,50).every((r,i)=>Number(r.score)===Number(probeB[50>i?i:i].score));
console.log('INSTRUMENT CHECK — stack 0.0 vs 3.0 produce identical top-50 scores?', sameScores,
  sameScores?'  <<< THE OVERRIDE IS NOT REACHING THE ENGINE — comparison is void':'  (override works)');
if (sameScores) process.exit(1);

for(const [pick,next] of [[33,48],[68,73],[108,113]]){
  const a=run(pick,next,0.5), b=run(pick,next,1.0);
  const nameOf=r=>r.name||(r.player&&r.player.name)||r.player_id;
  const ta=a.slice(0,10).map(nameOf), tb=b.slice(0,10).map(nameOf);
  const diff=ta.filter((n,i)=>n!==tb[i]).length;
  console.log(`\nPICK ${pick}`);
  console.log(`  top-1: ${ta[0]}  ->  ${tb[0]}${ta[0]!==tb[0]?'   *** TOP PICK CHANGED':''}`);
  console.log(`  top-10 positions differing: ${diff}`);
  if(diff){ for(let i=0;i<10;i++) if(ta[i]!==tb[i]) console.log(`    #${i+1}: ${ta[i]}  ->  ${tb[i]}`); }
  // How far down does ANY change reach?
  const ra={},rb={}; a.forEach((r,i)=>ra[nameOf(r)]=i); b.forEach((r,i)=>rb[nameOf(r)]=i);
  const movers=Object.keys(ra).filter(n=>rb[n]!=null&&ra[n]!==rb[n]);
  const biggest=movers.map(n=>({n,d:ra[n]-rb[n],from:ra[n],to:rb[n]}))
    .sort((x,y)=>Math.abs(y.d)-Math.abs(x.d)).slice(0,4);
  console.log(`  players changing rank anywhere on the board: ${movers.length}`);
  biggest.forEach(m=>console.log(`    ${m.n}: #${m.from+1} -> #${m.to+1}`));
}
