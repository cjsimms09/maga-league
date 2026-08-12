/* WHAT DOES THE ENGINE DO WHEN THE DATA IS WRONG? Cory: "I have never seen a
 * failure state and I will see one eventually." Every probe below is a board
 * the engine could actually receive.
 * Run: node draft/tools/failure_states.js */
'use strict';
const path=require('path'); const ROOT='/home/user/maga-league';
global.window=global;
['survival','composite','engine','needrule'].forEach(m=>require(path.join(ROOT,'public/js/draft',m+'.js')));
const LC=require(path.join(ROOT,'draft/tools/live_context.js'));
const E=global.DraftEngine;
const b=LC.loadBoard(), ALL=b.players;
function probe(label, mutate){
  let pool=ALL.map(p=>Object.assign({},p));
  pool=mutate(pool)||pool;
  try{
    const r=E.recommend(LC.liveContext({currentPick:33,nextPick:48,board:pool}));
    if(!r||!r.length){console.log(label.padEnd(46)+'-> EMPTY LIST (no error, nothing shown)');return;}
    const t=r[0];
    console.log(label.padEnd(46)+'-> '+(t.player.name||'?').padEnd(22)
      +' score '+(isFinite(+t.score)?(+t.score).toFixed(2):String(t.score)));
  }catch(e){console.log(label.padEnd(46)+'-> THREW: '+e.message);}
}
probe('control (healthy board)', p=>p);
probe('top-20 lose proj_mean (null)', p=>{p.slice(0,20).forEach(x=>{x.proj_mean=null;});return p;});
probe('top-20 lose adp (null)', p=>{p.slice(0,20).forEach(x=>{x.adp=null;});return p;});
probe('top-20 lose vorp (null)', p=>{p.slice(0,20).forEach(x=>{x.vorp=null;});return p;});
probe('EVERY player loses proj_mean', p=>{p.forEach(x=>{x.proj_mean=null;});return p;});
probe('EVERY player loses position', p=>{p.forEach(x=>{x.position=null;});return p;});
probe('no QBs left at all', p=>p.filter(x=>x.position!=='QB'));
probe('only kickers left', p=>p.filter(x=>x.position==='K'));
probe('single player on the board', p=>p.slice(0,1));
probe('EMPTY board', p=>[]);
probe('proj_mean is a STRING', p=>{p.slice(0,20).forEach(x=>{x.proj_mean=String(x.proj_mean);});return p;});
probe('proj_mean NaN', p=>{p.slice(0,20).forEach(x=>{x.proj_mean=NaN;});return p;});
probe('tier null on everyone', p=>{p.forEach(x=>{x.tier=null;});return p;});
