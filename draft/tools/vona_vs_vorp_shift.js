// TERRITORY: A
/* DOES THE BLEND MOVE THE VONA RANKING AS MUCH AS THE VORP RANKING?
 *
 * Register 83. A14 carried two of my own measurements pointing opposite ways:
 * the VORP ranking said the blend favours running backs (top-48 RB12 -> RB22),
 * the draft walk said it drafts fewer of them (RB10 -> RB8). I offered a story
 * that reconciled them — VORP is a LEVEL measure, VONA is a SCARCITY measure,
 * so lifting every RB together raises VORP and cancels in VONA — and labelled
 * it a hypothesis rather than a finding.
 *
 * This tests it, on a STABLE instrument: both rankings are SORTS at one fixed
 * context, no greedy walk, so register 74's instability does not apply.
 *
 * Run: node draft/tools/vona_vs_vorp_shift.js  (needs a pre-blend board on
 *      disk; recover one with `git show <sha>:public/draft_data.json`)
 */
const fs=require('fs');
global.window=global; global.document={getElementById:()=>null,querySelector:()=>null,addEventListener:()=>{}};
const E=require('/home/user/maga-league/public/js/draft/engine.js');
const KEEP=require('/home/user/maga-league/draft/tools/keepers_of.js');
/* ONE FIXED CONTEXT PER BOARD — no greedy walk, so this is a SORT like the
 * VORP ranking is, and carries none of register 74's instability. The room is
 * drained to the same pick on both boards by ADP, and every remaining player is
 * scored once. */
function rank(DATA, pick, nextPick){
  const keep=KEEP.keepersFrom(DATA);
  const pool=DATA.players.filter(p=>p.position&&(p.proj_mean||0)>0);
  const adpOf=p=>(p.adjusted_adp!=null?+p.adjusted_adp:(p.raw_adp!=null?+p.raw_adp:9999));
  const byAdp=pool.slice().sort((a,b)=>adpOf(a)-adpOf(b));
  const taken=new Set(keep.map(k=>String(k.player_id)));
  let need=pick-1;
  for(let j=0;j<byAdp.length&&need>0;j++){
    if(taken.has(String(byAdp[j].player_id)))continue;
    taken.add(String(byAdp[j].player_id));need--;}
  const board=pool.filter(p=>!taken.has(String(p.player_id)));
  const ctx={board:board,roster:keep.map(k=>Object.assign({},k,{is_keeper:true})),
    nextPick:nextPick,currentPick:pick,pick:pick,round:Math.ceil(pick/(DATA.league.teams||10)),
    myPicksLeft:10,myPickIndex:0,totalMyPicks:15,totalPicks:150,league:DATA.league,
    currentKeepers:keep,ceilingAllStages:false,doctrine:null,drift:null,intervening:5,
    weights:E.MEASURED_WEIGHTS,wireWeekly:DATA.wire_level||null};
  const vona=board.map(p=>({p:p,v:E.vona(p,board,nextPick,ctx)}))
                  .filter(r=>typeof r.v==='number'&&isFinite(r.v))
                  .sort((a,b)=>b.v-a.v);
  const vorp=board.filter(p=>p.vorp!=null).slice().sort((a,b)=>b.vorp-a.vorp);
  return {vona:vona.map(r=>r.p), vorp:vorp};
}
function mix(arr,n){const c={};arr.slice(0,n).forEach(p=>c[p.position]=(c[p.position]||0)+1);
  return ['QB','RB','WR','TE'].map(k=>k+(c[k]||0)).join(' ');}
const PRE=JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-maga-league/5e339fd1-b931-5642-94fe-5e2425c58024/scratchpad/board_preblend.json','utf8'));
const NOW=JSON.parse(fs.readFileSync('/home/user/maga-league/public/draft_data.json','utf8'));
console.log('THE HYPOTHESIS, TESTED: does the blend move the VONA ranking as much as the VORP ranking?');
console.log('(both are SORTS at one fixed context — no greedy walk, so register 74 does not apply)\n');
[[8,13],[48,53]].forEach(([pk,np])=>{
  const A=rank(PRE,pk,np), B=rank(NOW,pk,np);
  console.log('  at pick '+pk+' (next '+np+')');
  console.log('    '+'ranking'.padEnd(10)+'pre-blend'.padEnd(22)+'published'.padEnd(22)+'RB delta');
  [12,24,48].forEach(n=>{
    const a=mix(A.vorp,n), b=mix(B.vorp,n);
    const ra=+a.match(/RB(\d+)/)[1], rb=+b.match(/RB(\d+)/)[1];
    console.log('    VORP top'+String(n).padEnd(4)+a.padEnd(22)+b.padEnd(22)+(rb-ra>=0?'+':'')+(rb-ra));
  });
  [12,24,48].forEach(n=>{
    const a=mix(A.vona,n), b=mix(B.vona,n);
    const ra=+a.match(/RB(\d+)/)[1], rb=+b.match(/RB(\d+)/)[1];
    console.log('    VONA top'+String(n).padEnd(4)+a.padEnd(22)+b.padEnd(22)+(rb-ra>=0?'+':'')+(rb-ra));
  });
  console.log('');
});
