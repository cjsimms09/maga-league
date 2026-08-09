'use strict';
// End-to-end: the declare→confirm→dispute UI + routes over real HTTP, two owners.
const os=require('os'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname,'..','..');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'lcui-'));
const store=require(path.join(ROOT,'src','store'));store.initFiles();
const data=require(path.join(ROOT,'src','data'));
const {hashPassword}=require(path.join(ROOT,'src','auth'));
const {createApp}=require(path.join(ROOT,'server-app'));
const SB=require(path.join(ROOT,'src','sidebets'));
const cookieFrom=r=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
let pass=0,fail=0;const ck=(n,c,d)=>{c?(pass++,console.log('PASS '+n)):(fail++,console.log('FAIL '+n+(d?' -> '+d:'')))};
(async function(){
  await data.ensureSeeded();
  const owners=await store.get('owners');
  const cory=owners.find(o=>o.username==='cory'); const other=owners.find(o=>o.username&&o.username!=='cory'&&o.active);
  for(const o of [cory,other]){o.password_hash=hashPassword('pw123456');o.must_change_password=false;}
  other.venmo='davidhandle';   // give the counterparty a Venmo for the handoff test
  await store.set('owners',owners);
  const server=createApp().listen(0);await new Promise(r=>server.once('listening',r));
  const b=`http://127.0.0.1:${server.address().port}`;
  const login=async u=>cookieFrom(await fetch(b+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`username=${u}&password=pw123456`,redirect:'manual'}));
  const cc=await login('cory'); const oc=await login(other.username);
  const get=async(p,ck)=>{const r=await fetch(b+p,{headers:{Cookie:ck},redirect:'manual'});return{status:r.status,body:r.status===200?await r.text():''};};
  const post=async(p,ck,body)=>{const r=await fetch(b+p,{method:'POST',headers:{Cookie:ck,'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'manual'});return r.status;};

  // Cory proposes a matchup bet vs `other`, other accepts -> LOCKED.
  let bet=await SB.propose({proposer_id:cory.id,party_ids:[other.id],terms:'Cory beats '+other.name,stake:20,kind:'matchup',week:5});
  await SB.accept(bet.id,other.id,other.name);

  // Cory declares he won (via the route)
  ck('declare route ok',await post(`/sidebets/${bet.id}/declare`,cc,`winner=${cory.id}`)===302);
  bet=await SB.get(bet.id); ck('bet is AWAITING_CONFIRM after declare',bet.status==='awaiting_confirm',bet.status);

  // The bank page: `other` sees Confirm + Dispute; Cory sees "waiting on"
  const oView=await get('/bank?section=sidebets',oc);
  ck('confirmer sees Awaiting confirmation + Confirm button',/Awaiting confirmation/.test(oView.body)&&/Confirm &amp; settle/.test(oView.body));
  ck('confirmer sees a Dispute control',/That&#39;s not what happened|Dispute it/.test(oView.body));
  const cView=await get('/bank?section=sidebets',cc);
  ck('declarer sees "waiting to confirm", not the confirm button',/Waiting on/.test(cView.body)&&!/Confirm &amp; settle/.test(cView.body));

  // `other` disputes
  ck('dispute route ok',await post(`/sidebets/${bet.id}/dispute`,oc,'why=stat+correction')===302);
  bet=await SB.get(bet.id); ck('bet is DISPUTED',bet.status==='disputed',bet.status);
  const dView=await get('/bank?section=sidebets',cc);
  ck('DISPUTED renders visibly with the reason',/DISPUTED/.test(dView.body)&&/stat correction/.test(dView.body));

  // re-declare (Cory concedes other won), other confirms -> SETTLED
  await post(`/sidebets/${bet.id}/declare`,cc,`winner=${other.id}`);
  ck('confirm route ok',await post(`/sidebets/${bet.id}/confirm`,oc)===302);
  bet=await SB.get(bet.id);
  ck('bet SETTLED after confirm, other won',bet.status==='settled'&&bet.winner_ids[0]===other.id);
  ck('leg built: Cory pays other 20',bet.legs.length===1&&bet.legs[0].from===cory.id&&bet.legs[0].to===other.id);

  // Venmo handoff: Cory (loser) sees the winner's Venmo link with amount
  const owe=await get('/bank?section=sidebets',cc);
  ck('loser sees the winner Venmo deep-link with amount ready',
    /venmo\.com\/u\/davidhandle/.test(owe.body)&&/Venmo/.test(owe.body),'no venmo handoff');

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
