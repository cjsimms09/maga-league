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
/* ⛔ THIS WAS THE HARDCODED FIFTEEN-PICK LITERAL [8, 13, 28, 33, ...] — the
 * defect register 95 found, which Cory caught himself: keeping three players
 * forfeits rounds 1-3, so he owns TWELVE picks starting at 33 and does NOT own
 * 8, 13 or 28, the three most valuable in the draft. A drive down the literal
 * hands him three picks he cannot make and every roster it reports is wrong.
 *
 * Register 95's sweep fixed eight tools and MISSED SEVEN, this one among them,
 * for nine days. Rule 11: one derivation. draft_plan derives the schedule from
 * the snake and cross-checks it against the artifact's own pre-keeper list, and
 * refuses if the two disagree — so it is read from there and never retyped.
 * Register 406. */
const SCHED = require('./draft_plan.js').SCHED;
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
/* ⛔ BOTH ARMS WERE THE SAME RUN, AND THE HEADER SAID OTHERWISE.
 *
 * This tool was A13's own evidence — *"need: 1.0 CHANGES ONLY THREE OF YOUR
 * FIFTEEN PICKS"*. Cory RULED A13 on 2026-08-20 and `engine.js:826` has shipped
 * `need: 1.0` ever since, so arm B's override became a no-op: it printed
 * "picks changed: 0 of 12" while labelling column one "SHIPPED (need 0)", which
 * has been false for eight days. Nothing could have caught it here, because the
 * collapse was caused by a ruling elsewhere. Register 405 found the identical
 * defect in `fieldability_probe.js` the same hour.
 *
 * The informative comparison is now the other direction — what the board looked
 * like BEFORE the ruling — so arm B is `need: 0` and the labels say which is
 * which. The refusal below is the guard: if a future ruling collapses these two
 * again, the run stops instead of printing one arm twice. Register 406. */
const A=walk(E.MEASURED_WEIGHTS);
const NEED0=Object.assign({},E.MEASURED_WEIGHTS,{need:0.0});
/* ONE guard, not four copies — draft/tools/arms_differ.js, register 408. */
require('./arms_differ.js').assertArmsDiffer('need_weight_pick_diff',
  { shipped: E.MEASURED_WEIGHTS, need0: NEED0 });
const B=walk(NEED0);
/* ⚠️ THE BOARD STAMP IS NOT DECORATION (register 455). This tool's answer is a
 * function of the board it ran on, and after the draft that board is rebuilt
 * every night out of a churning free-agent pool. MEASURED, one night apart, on
 * the same code and the same weights:
 *
 *   board of 2026-08-31 → 8 of 12 picks change, shipped roster holds EIGHT QBs
 *   board of 2026-09-01 → 3 of 12 picks change, shipped roster holds ONE QB
 *
 * I quoted the first of those as a finding about `need: 1.0` and it was a fact
 * about one night's board. An output this volatile must never be repeated
 * without the board it came from, so it can no longer be printed without one.
 *
 * (The 3-of-12 reading is also what A13's original evidence said — "need: 1.0
 * changes only three of your fifteen picks" — so the ruling's evidence stands;
 * it was the 08-31 re-run that was the outlier, not the ruling.) */
const _stamp = (DATA.post_processed_at || DATA.built_at || 'UNSTAMPED')
  + ', ' + DATA.players.length + ' players';
console.log('A13, RULED 2026-08-20 — every pick, SHIPPED (need ' + E.MEASURED_WEIGHTS.need
  + ') vs the PRE-RULING need 0, on the published board');
console.log('  BOARD: ' + _stamp + '  ⚠️ this answer is a function of THIS board — it '
  + 'moved from 8-of-12 to 3-of-12 on one night\'s rebuild (register 455). Quote '
  + 'the number only with the board.\n');
console.log('  pick   SHIPPED (need ' + E.MEASURED_WEIGHTS.need + ')'
  + '              PRE-RULING need = 0            changed?');
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
console.log('  roster SHIPPED  (need ' + E.MEASURED_WEIGHTS.need + ') : '+JSON.stringify(cnt(A.roster)));
console.log('  roster PRE-RULE (need 0) : '+JSON.stringify(cnt(B.roster)));
console.log('  league top-3 target (15-pick seasons): QB 1.33  RB 3.83  WR 5.17  TE 1.83');
