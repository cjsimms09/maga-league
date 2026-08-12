/* THE NORMALISATION HUNT (Cory, 2026-08-13): is a fixed threshold being
 * applied to a quantity whose SCALE is not stable? Every CFG gap constant is in
 * "composite points" and the composite's spread collapses as the pool empties —
 * PATHS_BAND=12 admits 5 players at pick 30 and 726 at pick 70.
 * Run: node draft/tools/normalisation_probe.js */
'use strict';
const path=require('path'); const ROOT='/home/user/maga-league';
global.window=global;
['survival','composite','engine','needrule'].forEach(m=>require(path.join(ROOT,'public/js/draft',m+'.js')));
const LC=require(path.join(ROOT,'draft/tools/live_context.js'));
const E=global.DraftEngine;
const b=LC.loadBoard(), ALL=b.players, K=b.kept_players, ORD=b.pick_order;
const MY=ORD.my_picks.slice();
const CFG=E.CFG||{};
console.log('THRESHOLDS (all fixed constants, all in "composite points"):');
['COIN_FLIP_GAP','TIE_THRESHOLD','CLOSE_GAP','PATHS_BAND','STAGE2_CAP_T'].forEach(k=>
  console.log('  '+k.padEnd(16)+CFG[k]));
const drafted=new Set(); K.forEach(k=>drafted.add(String(k.player_id)));
const roster=K.map(k=>Object.assign({},k,{is_keeper:true}));
function oppPick(pool){let best=null;for(const p of pool){const a=p.adp==null?9999:+p.adp;if(!best||a<best._a){best=p;best._a=a;}}return best;}
console.log('\npick   top    #2gap   #5gap  #10gap  |  band12 admits  coinflip?  close?');
for(let i=0;i<MY.length;i++){
  const pick=MY[i], next=MY[i+1]||pick;
  let pool=ALL.filter(p=>!drafted.has(String(p.player_id)));
  const before=i===0?pick-1:pick-MY[i-1]-1;
  for(let k=0;k<before;k++){const p=oppPick(pool);if(!p)break;drafted.add(String(p.player_id));pool=pool.filter(x=>x!==p);}
  const r=E.recommend(LC.liveContext({currentPick:pick,nextPick:next,board:pool,roster,
    myPicksLeft:MY.length-i,myPickIndex:i}));
  const s=r.map(x=>+x.score);
  const g2=s[0]-s[1], g5=s[0]-s[4], g10=s[0]-s[9];
  const band=s.filter(x=>x>=s[0]-(CFG.PATHS_BAND||12)).length;
  console.log(String(pick).padStart(4)+' '+s[0].toFixed(2).padStart(7)+' '+g2.toFixed(2).padStart(7)
    +' '+g5.toFixed(2).padStart(7)+' '+g10.toFixed(2).padStart(7)
    +'  |  '+String(band).padStart(5)+' players   '
    +(g2<(CFG.COIN_FLIP_GAP||1)?'YES':' no ')+'      '+(g2<(CFG.CLOSE_GAP||3.5)?'YES':' no '));
  drafted.add(String(r[0].player.player_id)); roster.push(r[0].player);
}
