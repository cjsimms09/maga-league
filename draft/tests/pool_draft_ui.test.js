'use strict';
const os=require('os'),fs=require('fs'),path=require('path');const ROOT=require('path').join(__dirname,'..','..');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'pdui-'));
const store=require(path.join(ROOT,'src','store'));store.initFiles();
const data=require(path.join(ROOT,'src','data'));const {hashPassword}=require(path.join(ROOT,'src','auth'));
const {createApp}=require(path.join(ROOT,'server-app'));const SB=require(path.join(ROOT,'src','sidebets'));
const cookieFrom=r=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
let pass=0,fail=0;const ck=(n,c,d)=>{c?(pass++,console.log('PASS '+n)):(fail++,console.log('FAIL '+n+(d?' -> '+d:'')))};
(async function(){
  await data.ensureSeeded();const owners=await store.get('owners');
  const cory=owners.find(o=>o.username==='cory');const rich=owners.find(o=>o.name==='Richard');
  for(const o of [cory,rich]){o.password_hash=hashPassword('pw');o.must_change_password=false;}await store.set('owners',owners);
  const server=createApp().listen(0);await new Promise(r=>server.once('listening',r));const b=`http://127.0.0.1:${server.address().port}`;
  const login=async u=>cookieFrom(await fetch(b+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`username=${u}&password=pw`,redirect:'manual'}));
  const cc=await login('cory');const rc=await login(rich.username);
  const get=async(p,ck)=>{const r=await fetch(b+p,{headers:{Cookie:ck},redirect:'manual'});return{status:r.status,body:r.status===200?await r.text():''}};
  const post=async(p,ck,body)=>{const r=await fetch(b+p,{method:'POST',headers:{Cookie:ck,'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'manual'});return r.status};
  // Cory proposes a pool bet vs Richard (champion pool)
  await post('/sidebets',cc,`format=pool&party=${rich.id}&stake=100&terms=Champion+pool&pool_outcome=holds+the+champion`);
  let all=await SB.all();let bet=all.find(x=>x.format==='pool');
  ck('pool bet proposed as PROPOSED with all teams in play',bet&&bet.status==='proposed'&&bet.pool.team_pool.length===10,bet&&bet.pool&&bet.pool.team_pool.length);
  ck('nobody picked at propose',bet.parties.every(p=>p.picks.length===0));
  // proposed pool shows "draft opens when they accept"
  const cView0=await get('/bank?section=sidebets',cc);
  ck('proposed pool shows the draft-pending message',/draft opens the moment/.test(cView0.body));
  // Richard accepts -> draft opens, order by prior-season finish
  await post(`/sidebets/${bet.id}/accept`,rc,'');
  bet=await SB.get(bet.id);
  ck('accept opens the draft',!!bet.draft&&bet.status==='locked',bet.draft?'draft':'none');
  ck('draft order computed with a why',/picks first/.test(bet.draft.why),bet.draft&&bet.draft.why);
  // whoever is on the clock drafts; run the whole snake via the route
  for(let i=0;i<10;i++){ bet=await SB.get(bet.id); const who=bet.draft.turn; const ck2=who===cory.id?cc:rc;
    const team=bet.draft.pool.find(t=>bet.draft.taken[t]==null);
    await post(`/sidebets/${bet.id}/draft-pick`,ck2,`team=${team}`); }
  bet=await SB.get(bet.id);
  ck('draft completes via the routes',bet.draft.complete&&bet.draft.sequence.length===10);
  ck('each bettor holds 5, mutually exclusive',bet.parties[0].picks.length===5&&bet.parties[1].picks.length===5&&bet.parties[0].picks.every(t=>!bet.parties[1].picks.includes(t)));
  // out-of-turn via route is a no-op: try Cory picking when it's complete
  const seqLen=bet.draft.sequence.length; await post(`/sidebets/${bet.id}/draft-pick`,cc,'team=1'); bet=await SB.get(bet.id);
  ck('no pick after complete via route',bet.draft.sequence.length===seqLen);
  // the draft room renders the board + complete rosters
  const done=await get('/bank?section=sidebets',cc);
  ck('draft room renders the board + rosters',/Draft complete/.test(done.body)&&/pd-roster/.test(done.body));
  server.close();console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
