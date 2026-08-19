// TERRITORY: A
/* WHICH OF CORY'S PICKS CHANGE BETWEEN THE SLEEPER-ONLY BOARD AND THE BLENDED ONE?
 *
 * The A14 counterpart to `need_weight_pick_diff.js`: the same engine, two
 * boards, so the only variable is the multi-source mean.
 *
 * ⚠️ READ THE CAVEAT BEFORE THE OUTPUT. This walk drains the room in strict ADP
 * order, and **register 74 caught exactly this probe swinging a simulated
 * roster by seven running backs across one board rebuild.** This comparison IS
 * two board rebuilds. So its result cannot separate the blend's effect from
 * that instability, and it must NOT be used to argue that the blend improves
 * roster shape — even though that is what it shows, and even though that is
 * the answer I would prefer.
 *
 * The stable measurement of the same question is the position mix of the top-N
 * by VORP (a sort, no simulated draft), and it points the OTHER way. Both
 * numbers are in `CORY-ASKS.md` A14 with the conflict stated rather than
 * resolved.
 *
 * REPORT ONLY.
 *
 * Run: node draft/tools/blend_pick_diff.js   (needs a pre-blend board on disk;
 *      recover one with `git show <sha>:public/draft_data.json`)
 */
const fs=require('fs');
global.window=global; global.document={getElementById:()=>null,querySelector:()=>null,addEventListener:()=>{}};
const E=require('/home/user/maga-league/public/js/draft/engine.js');
const KEEP=require('/home/user/maga-league/draft/tools/keepers_of.js');
const SCHED=[8,13,28,33,48,53,68,73,88,93,108,113,128,133,148];
function walk(DATA){
  const keep=KEEP.keepersFrom(DATA);
  const pool=DATA.players.filter(p=>p.position&&(p.proj_mean||0)>0);
  const adpOf=p=>(p.adjusted_adp!=null?+p.adjusted_adp:(p.raw_adp!=null?+p.raw_adp:9999));
  const byAdp=pool.slice().sort((a,b)=>adpOf(a)-adpOf(b));
  const taken=new Set(keep.map(k=>String(k.player_id)));
  const roster=keep.map(k=>Object.assign({},k,{is_keeper:true}));
  const out=[];
  SCHED.forEach((pk,i)=>{
    let need=(pk-1)-(taken.size-keep.length);
    for(let j=0;j<byAdp.length&&need>0;j++){
      if(taken.has(String(byAdp[j].player_id)))continue;
      taken.add(String(byAdp[j].player_id));need--;}
    const board=pool.filter(p=>!taken.has(String(p.player_id)));
    const ctx={board:board,roster:roster,nextPick:SCHED[i+1]||null,currentPick:pk,pick:pk,
      round:Math.ceil(pk/(DATA.league.teams||10)),myPicksLeft:SCHED.length-i,myPickIndex:i,
      totalMyPicks:SCHED.length,totalPicks:150,league:DATA.league,currentKeepers:keep,
      ceilingAllStages:false,doctrine:null,drift:null,intervening:5,
      weights:E.MEASURED_WEIGHTS,wireWeekly:DATA.wire_level||null};
    const r=E.recommend(ctx); const l=Array.isArray(r)?r:(r&&r.scored)||[];
    const top=l[0]; if(!top||!top.player){out.push(null);return;}
    taken.add(String(top.player.player_id)); roster.push(Object.assign({},top.player));
    out.push({pos:top.player.position,name:top.player.name});
  });
  return {picks:out,roster:roster};
}
const PRE=JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-maga-league/5e339fd1-b931-5642-94fe-5e2425c58024/scratchpad/board_preblend.json','utf8'));
const NOW=JSON.parse(fs.readFileSync('/home/user/maga-league/public/draft_data.json','utf8'));
const A=walk(PRE), B=walk(NOW);
console.log('A14 MADE CONCRETE — the SAME engine on the pre-blend board vs the published one\n');
console.log('  pre-blend board built '+PRE.built_at+'   published '+NOW.built_at+'\n');
console.log('  pick   SLEEPER-ONLY BOARD            MULTI-SOURCE BOARD            changed?');
let ch=0;
SCHED.forEach((pk,i)=>{
  const a=A.picks[i],b=B.picks[i];
  const same=a&&b&&a.name===b.name; if(!same)ch++;
  console.log('  '+String(pk).padStart(4)+'   '+String(a?a.pos+' '+a.name:'-').padEnd(29)
    +String(b?b.pos+' '+b.name:'-').padEnd(29)+(same?'':'  <-- CHANGED'));
});
const cnt=r=>{const c={};r.filter(p=>!p.is_keeper).forEach(p=>c[p.position]=(c[p.position]||0)+1);return c;};
console.log('\n  picks changed: '+ch+' of '+SCHED.length);
console.log('  roster on the sleeper-only board : '+JSON.stringify(cnt(A.roster)));
console.log('  roster on the multi-source board : '+JSON.stringify(cnt(B.roster)));
