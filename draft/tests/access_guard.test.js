'use strict';
// ACCESS GUARD — the settled rule is TOOLS vs HISTORY, not raw-data vs analysis.
//
//   COMMISSIONER-ONLY: the tools, and ONLY the tools — the war room and everything
//   it computes, /lineup + the optimizer + its proof tab, and the in-season
//   recommendation surfaces (waiver calls, streaming, trade radar, Sunday alert).
//   Anything that GENERATES A RECOMMENDATION for the commissioner.
//
//   LEAGUE-VISIBLE: everything that DESCRIBES WHAT ALREADY HAPPENED, however it was
//   computed — all-play records, luck-gap and robbery rankings, per-owner/per-season
//   lineup-efficiency %, season bench-point totals, all money/standings/records, and
//   every analytical framing in the history chapters. History is the league's shared
//   record; results are league property.
//
// HISTORY OF THIS FILE (so the change is auditable): it originally also asserted
// that NO league-visible page renders all-play / efficiency / luck-gap / robbery /
// bench-aggregate text. That encoded an EARLIER, since-CORRECTED reading (raw-data
// vs analysis). Cory corrected it 2026-08-09: the distinction is TOOLS vs HISTORY,
// the earlier instruction was wrong, and B implemented the earlier instruction
// correctly — the correction is Cory's, not a bug. So those negative assertions are
// REMOVED; they are now wrong. The /lineup gating below is the real, standing rule
// and stays. Run: node draft/tests/access_guard.test.js
const os=require('os'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname,'..','..');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'guard-'));
const store=require(path.join(ROOT,'src','store'));store.initFiles();
const data=require(path.join(ROOT,'src','data'));
const {hashPassword}=require(path.join(ROOT,'src','auth'));
const {createApp}=require(path.join(ROOT,'server-app'));
const cookieFrom=res=>res.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
let pass=0,fail=0;const ck=(n,c,d)=>{c?(pass++,console.log('PASS '+n)):(fail++,console.log('FAIL '+n+(d?' -> '+d:'')))};

(async function(){
  await data.ensureSeeded();
  const owners=await store.get('owners');
  const notComm=owners.find(o=>!o.is_commissioner);
  notComm.password_hash=hashPassword('pw123456');notComm.must_change_password=false;
  const comm=owners.find(o=>o.is_commissioner);
  comm.password_hash=hashPassword('pw123456');comm.must_change_password=false;
  await store.set('owners',owners);
  const server=createApp().listen(0);await new Promise(r=>server.once('listening',r));
  const b=`http://127.0.0.1:${server.address().port}`;
  async function loginAs(u){const r=await fetch(b+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`username=${u}&password=pw123456`,redirect:'manual'});return cookieFrom(r);}
  const nc=await loginAs(notComm.username);
  const cc=await loginAs(comm.username);
  const get=async(p,cookie)=>{const r=await fetch(b+p,{headers:{Cookie:cookie},redirect:'manual'});return{status:r.status,body:r.status===200?await r.text():''};};

  // THE STANDING RULE: the TOOLS are commissioner-only. A non-commissioner gets 403;
  // the commissioner gets 200. This is what must never regress.
  ck('/lineup 403 for a non-commissioner',(await get('/lineup',nc)).status===403);
  ck('/lineup?tab=proof 403 for a non-commissioner',(await get('/lineup?tab=proof',nc)).status===403);
  ck('/lineup 200 for the commissioner',(await get('/lineup',cc)).status===200);
  const logNc=await fetch(b+'/lineup/log',{method:'POST',headers:{Cookie:nc,'Content-Type':'application/x-www-form-urlencoded'},body:'counterfactual=%5B%5D&recommended=%5B%5D',redirect:'manual'});
  ck('/lineup/log 403 for a non-commissioner',logNc.status===403,String(logNc.status));

  // History pages are LEAGUE-VISIBLE by the settled rule; there is deliberately no
  // assertion that they hide all-play / efficiency / bench analysis. (A positive
  // guard — that the history pages DO render that league-visible analysis to a
  // non-commissioner — is the natural follow-up once B's restore commit lands, and
  // belongs here then, coordinated with B on the exact rendered phrases.)

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
