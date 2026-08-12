/* QUESTION 8 (Cory's eighth): was the decisive term CONCEPTUALLY VALID?
 * On starter picks the decisive term is VALUE = VORP, so this asks whether VORP
 * ranks positions the way a competent drafter does — not whether it is computed
 * correctly. Run: node draft/tools/vorp_vs_market.js */
/* QUESTION 8 — was the decisive term conceptually valid?
 * On starter picks the decisive term is VALUE = VORP. So: does VORP rank
 * positions the same way the market does, and if not, is it the REPLACEMENT
 * BASELINE or the PROJECTIONS that move it? */
'use strict';
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('/home/user/maga-league/public/draft_data.json','utf8'));
const ps=b.players.filter(p=>p.adp!=null&&+p.adp<300&&+p.proj_mean>0);
console.log('priced pool (adp < 300, projected): '+ps.length);
// Rank by VORP (what the model uses) and by ADP (what the market uses).
const byV=ps.slice().sort((a,b)=>b.vorp-a.vorp);
const byA=ps.slice().sort((a,b)=>a.adp-b.adp);
const vRank={},aRank={};
byV.forEach((p,i)=>vRank[p.player_id]=i+1);
byA.forEach((p,i)=>aRank[p.player_id]=i+1);
const byPos={};
ps.forEach(p=>{(byPos[p.position]=byPos[p.position]||[]).push(aRank[p.player_id]-vRank[p.player_id]);});
const med=a=>{const t=a.slice().sort((x,y)=>x-y);return t[Math.floor(t.length/2)];};
console.log('\nADP-rank minus VORP-rank, by position (positive = the MODEL likes them');
console.log('more than the market; i.e. our board pulls them forward):');
console.log('  pos    n   median   mean');
Object.keys(byPos).sort().forEach(k=>{
  const a=byPos[k]; const mean=a.reduce((s,x)=>s+x,0)/a.length;
  console.log('  '+k.padEnd(5)+String(a.length).padStart(4)+'  '+String(med(a)).padStart(7)+'  '+mean.toFixed(1).padStart(7));
});
console.log('\nREPLACEMENT DEPTH — how many players clear replacement at each position:');
const rep=b.replacement.replacement_points, sc=b.replacement.starter_counts;
Object.keys(rep).sort().forEach(k=>{
  const pool=b.players.filter(p=>p.position===k&&+p.proj_mean>0);
  const above=pool.filter(p=>+p.proj_mean>rep[k]).length;
  console.log('  '+k.padEnd(5)+' replacement '+String(rep[k]).padStart(7)
    +'  starters '+String(sc[k]).padStart(3)+'  players above replacement '+String(above).padStart(4)
    +'  (' + (above/Math.max(1,sc[k])).toFixed(2) + ' per starting slot)');
});
console.log('\nTOP-12 VORP AT EACH POSITION vs their ADP:');
['QB','TE','WR','RB'].forEach(k=>{
  const top=ps.filter(p=>p.position===k).sort((a,b)=>b.vorp-a.vorp).slice(0,3);
  console.log('  '+k+': '+top.map(p=>p.name+' vorp '+p.vorp.toFixed(0)+' adp '+p.adp).join(' | '));
});
