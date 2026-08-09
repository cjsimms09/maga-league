'use strict';
const path=require('path');const ROOT='/home/user/maga-league';
const mem={};const store={async get(k,d){return k in mem?mem[k]:(d===undefined?null:d);},async set(k,v){mem[k]=v;},async listKeys(p){return Object.keys(mem).filter(k=>k.startsWith(p));},async getMany(ks){return ks.map(k=>mem[k]);},async del(k){delete mem[k];}};
require.cache[path.join(ROOT,'src','data.js')]={exports:{store,getDoc:store.get,setDoc:store.set,newId:()=>Math.random().toString(36).slice(2,10),now:()=>new Date(2026,0,1).toISOString()}};
const SB=require(path.join(ROOT,'src','sidebets'));
let pass=0,fail=0;const ck=(n,c,d)=>{c?(pass++,console.log('PASS '+n)):(fail++,console.log('FAIL '+n+(d?' -> '+d:'')))};
(async function(){
  const CORY=1,RICH=9;const teams=[1,2,3,4,5,6,7,8,9,10];
  let bet=await SB.propose({proposer_id:CORY,party_ids:[RICH],terms:'Champion pool: Cory vs Richard, 5 teams each',stake:100,format:'pool',pool_teams:teams,pool_wins:'holds the league champion'});
  ck('pool bet proposed, pool config stored',bet.format==='pool'&&bet.pool.team_pool.length===10,JSON.stringify(bet.pool));
  ck('no draft until accepted',bet.draft===null);
  bet=await SB.accept(bet.id,RICH,'Richard');
  ck('locks on accept, still no draft (picking not open yet)',bet.status==='locked'&&bet.draft===null);
  // Richard finished higher -> picks first
  bet=await SB.startPoolDraft(bet.id,[RICH,CORY],'Richard picks first — finished 4th to your 7th in 2025');
  ck('draft opens, Richard on the clock',bet.draft&&bet.draft.turn===RICH&&!bet.draft.complete);
  ck('draft records the why',/finished 4th/.test(bet.draft.why));
  // out-of-turn refused
  const before=JSON.stringify(bet.draft.sequence);
  bet=await SB.poolDraftPick(bet.id,CORY,5);
  ck('out-of-turn pick refused',JSON.stringify(bet.draft.sequence)===before);
  // snake sequence R C C R R C C R R C
  const snakeExpect=[RICH,CORY,CORY,RICH,RICH,CORY,CORY,RICH,RICH,CORY];
  let team=1;
  for(let i=0;i<10;i++){ const who=bet.draft.turn; bet=await SB.poolDraftPick(bet.id,who,team++); }
  const seqBy=bet.draft.sequence.map(s=>s.by);
  ck('snake order correct (R C C R R C C R R C)',JSON.stringify(seqBy)===JSON.stringify(snakeExpect),JSON.stringify(seqBy));
  ck('draft complete when pool empty',bet.draft.complete&&bet.draft.turn===null);
  const cory=bet.parties.find(p=>p.owner_id===CORY),rich=bet.parties.find(p=>p.owner_id===RICH);
  ck('each holds 5 franchises',cory.picks.length===5&&rich.picks.length===5,`${cory.picks.length}/${rich.picks.length}`);
  ck('no team held by both (mutual exclusion)',cory.picks.every(t=>!rich.picks.includes(t)));
  ck('all 10 teams allocated',new Set([...cory.picks,...rich.picks]).size===10);
  // can't pick after complete
  const after=JSON.stringify(bet.draft.sequence);const betId=bet.id;
  await SB.poolDraftPick(betId,RICH,1);bet=await SB.get(betId);
  ck('no picks after complete',JSON.stringify(bet.draft.sequence)===after);
  console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
