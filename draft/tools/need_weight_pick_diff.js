// TERRITORY: A
/* WHICH OF CORY'S FIFTEEN PICKS ACTUALLY CHANGE IF `need` GOES TO 1.0?
 *
 * `CORY-ASKS.md` A13 asks him to rule on points-versus-roster-shape, and until
 * now the evidence was aggregates: +68.6 points per seat-year, a distance from
 * the winners' shape. **Neither is a thing a person can look at and have an
 * opinion about.** This is the same question as a diff he can read in ten
 * seconds: which picks change, and to what.
 *
 * BOTH ARMS WALK THEIR OWN DRAFT, and that is the one thing this must get
 * right. Re-scoring one arm's roster under the other's weights would compare
 * SCORES, not DRAFTS — after the first divergence the rosters differ, so every
 * later pick is being made from a different roster and a naive diff would
 * attribute all of it to the weight. Each arm walks independently; the picks
 * are lined up by pick number.
 *
 * CAVEAT THAT TRAVELS WITH IT (register 67/74): the room is drained in strict
 * ADP order, which the real room will not be, and those rosters are unstable
 * to a board rebuild. **The PATTERN — when the tool takes a quarterback — is
 * the robust part; the specific names are not.**
 *
 * REPORT ONLY. Ships no weight.
 *
 * Run: node draft/tools/need_weight_pick_diff.js
 */
const fs=require('fs');
global.window=global; global.document={getElementById:()=>null,querySelector:()=>null,addEventListener:()=>{}};
const DATA=JSON.parse(fs.readFileSync('public/draft_data.json','utf8'));
const E=require('/home/user/maga-league/public/js/draft/engine.js');
const KEEP=require('/home/user/maga-league/draft/tools/keepers_of.js');
const SCHED=[8,13,28,33,48,53,68,73,88,93,108,113,128,133,148];
const keep=KEEP.keepersFrom(DATA);
const pool=DATA.players.filter(p=>p.position&&(p.proj_mean||0)>0);
const adpOf=p=>(p.adjusted_adp!=null?+p.adjusted_adp:(p.raw_adp!=null?+p.raw_adp:9999));
const byAdp=pool.slice().sort((a,b)=>adpOf(a)-adpOf(b));

/* BOTH ARMS WALK THEIR OWN DRAFT. A diff computed by re-scoring one arm's
 * roster under the other's weights would be a comparison of scores, not of
 * DRAFTS — after the first divergence the rosters differ and every later pick
 * is made from a different roster. Each arm is walked independently and the
 * picks lined up by pick number. */
function walk(w){
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
      weights:w,wireWeekly:DATA.wire_level||null};
    const r=E.recommend(ctx); const l=Array.isArray(r)?r:(r&&r.scored)||[];
    const top=l[0]; if(!top||!top.player){out.push(null);return;}
    const p=top.player;
    taken.add(String(p.player_id)); roster.push(Object.assign({},p));
    out.push({pos:p.position,name:p.name,need:top.components?top.components.need:null,
              why:top.components?top.components.need_fills:null});
  });
  return {picks:out,roster:roster};
}
const A=walk(E.MEASURED_WEIGHTS);
const B=walk(Object.assign({},E.MEASURED_WEIGHTS,{need:1.0}));
console.log('A13 MADE CONCRETE — every pick, shipped vs need:1.0, on the published board\n');
console.log('  pick   SHIPPED (need 0)              need = 1.0                    changed?');
let ch=0;
SCHED.forEach((pk,i)=>{
  const a=A.picks[i],b=B.picks[i];
  const same=a&&b&&a.name===b.name; if(!same)ch++;
  console.log('  '+String(pk).padStart(4)+'   '
    +String(a?a.pos+' '+a.name:'-').padEnd(29)
    +String(b?b.pos+' '+b.name:'-').padEnd(29)
    +(same?'':'  <-- CHANGED'));
});
const cnt=r=>{const c={};r.filter(p=>!p.is_keeper).forEach(p=>c[p.position]=(c[p.position]||0)+1);return c;};
console.log('\n  picks changed: '+ch+' of '+SCHED.length);
console.log('  roster shipped : '+JSON.stringify(cnt(A.roster)));
console.log('  roster need1.0 : '+JSON.stringify(cnt(B.roster)));
console.log('  league top-3 target (15-pick seasons): QB 1.33  RB 3.83  WR 5.17  TE 1.83');
