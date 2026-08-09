'use strict';
// INSTRUMENTATION CHECK (exp 37) — can September be reconstructed in January?
// Verifies the in-season ledger captures, AT DECISION TIME: the recommendation,
// the counterfactual (what I'd have done otherwise), a SERVER-stamped decision
// time, and the model version — the pairs January grades from. Boots the app for
// the real lineup_call write path (/lineup/log), and checks the enforcement on
// every counterfactual-bearing kind directly.
const os=require('os'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname,'..','..');
const P=require(path.join(ROOT,'src','predledger'));
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'instr-'));
const store=require(path.join(ROOT,'src','store'));store.initFiles();
const data=require(path.join(ROOT,'src','data'));const {hashPassword}=require(path.join(ROOT,'src','auth'));
const {createApp}=require(path.join(ROOT,'server-app'));const predledger=require(path.join(ROOT,'src','predledger'));
const cookieFrom=r=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
let pass=0,fail=0;const ck=(n,c,d)=>{c?(pass++,console.log('PASS '+n)):(fail++,console.log('FAIL '+n+(d?' -> '+d:'')))};

// 1) Every in-season recommendation kind ENFORCES its counterfactual.
for (const kind of ['lineup_call','waiver_claim','stream_call','trade_eval','inseason_override']) {
  let threw=false; try { P.buildEntry({kind,season:2026,payload:{recommended:'x'}},{nowIso:'z',seq:1}); } catch(e){ threw=/counterfactual/.test(e.message); }
  ck(`${kind} REJECTS a write with no counterfactual`, threw);
  let ok=true; try { P.buildEntry({kind,season:2026,payload:{recommended:'x',counterfactual:'y'}},{nowIso:'z',seq:1}); } catch(e){ ok=false; }
  ck(`${kind} accepts once the counterfactual is present`, ok);
}
// weekly_brief is a record of what I was TOLD — no counterfactual required.
let briefOk=true; try{ P.buildEntry({kind:'weekly_brief',season:2026,payload:{brief:'...'}},{nowIso:'z',seq:1}); }catch(e){briefOk=false;}
ck('weekly_brief does NOT require a counterfactual (it is a record, not a call)', briefOk);
// decision_at is the SERVER clock, never the client's (a replayed client can't forge it).
const e=P.buildEntry({kind:'lineup_call',season:2026,client_at:'1999-01-01T00:00:00Z',payload:{recommended:'a',counterfactual:'b'}},{nowIso:'2026-09-13T16:00:00.000Z',seq:1});
ck('decision_at is server-stamped, client_at kept only as untrusted provenance', e.decision_at==='2026-09-13T16:00:00.000Z'&&e.client_at==='1999-01-01T00:00:00Z');
ck('the model version rides with every entry (January reads which model called it)', /-/.test(e.method));

(async function(){
  await data.ensureSeeded();const owners=await store.get('owners');const cory=owners.find(o=>o.username==='cory');
  cory.password_hash=hashPassword('pw');cory.must_change_password=false;await store.set('owners',owners);
  const server=createApp().listen(0);await new Promise(r=>server.once('listening',r));const b=`http://127.0.0.1:${server.address().port}`;
  const cc=cookieFrom(await fetch(b+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'username=cory&password=pw',redirect:'manual'}));
  // The real decision-time write: the lineup optimizer's "Log this lineup".
  const rec=JSON.stringify([{id:'a',pos:'QB',proj:22}]);const cf=JSON.stringify([{id:'b',pos:'QB',proj:20}]);
  const r=await fetch(b+'/lineup/log',{method:'POST',headers:{Cookie:cc,'Content-Type':'application/x-www-form-urlencoded'},
    body:'week=3&dollars=6&confidence=start+A&recommended='+encodeURIComponent(rec)+'&counterfactual='+encodeURIComponent(cf),redirect:'manual'});
  ck('the lineup optimizer logs a decision (302)', r.status===302);
  const entries=await predledger.readAll(store,'2026');const call=entries.find(x=>x.kind==='lineup_call');
  ck('lineup_call landed with the recommendation AND the counterfactual', !!call && call.payload.recommended && call.payload.counterfactual);
  ck('...its dollar value + confidence sentence (what it was worth, and why)', call && call.payload.dollars!=null && !!call.payload.confidence);
  ck('...stamped with the server decision time (reconstructable in January)', call && !!call.decision_at);
  ck('...and the model version', call && call.method==='lineup-optimizer-v1');
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  // COVERAGE NOTE (not a failure): lineup_call is wired (the optimizer). waiver_claim/
  // stream_call/trade_eval are REGISTERED + enforced but not yet EMITTED — their
  // recommendation surfaces (waiver/trade tools) are post-draft and don't exist
  // yet, so those decisions capture the moment those tools ship. The RAIL is ready.
  console.log('COVERAGE: lineup_call emitted (optimizer). waiver/stream/trade kinds ready, await their tools.');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
