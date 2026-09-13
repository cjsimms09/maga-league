'use strict';
const os=require('os'),fs=require('fs'),path=require('path');const ROOT=require('path').join(__dirname,'..','..');
const LO=require(path.join(ROOT,'src','routes','lineup'));
let pass=0,fail=0;const ck=(n,c,d)=>{c?(pass++,console.log('PASS '+n)):(fail++,console.log('FAIL '+n+(d?' -> '+d:'')))};
// 1) generator formats an optimize result
const roster=[{id:'qb',name:'QB1',pos:'QB',proj:22,sd:6},{id:'rba',name:'RBa',pos:'RB',proj:18,sd:6},{id:'rbb',name:'RBb',pos:'RB',proj:16,sd:6},{id:'wra',name:'WRa',pos:'WR',proj:17,sd:6},{id:'wrb',name:'WRb',pos:'WR',proj:15,sd:6},{id:'te',name:'TE1',pos:'TE',proj:12,sd:5},{id:'k',name:'K1',pos:'K',proj:8,sd:4},{id:'def',name:'DEF1',pos:'DEF',proj:7,sd:5},{id:'safe',name:'SafeFlexRB',pos:'RB',proj:15,sd:3},{id:'boom',name:'BoomFlexWR',pos:'WR',proj:14,sd:18}];
const band=LO.weeklyHighBand();
const res=LO.optimize(roster,{band,oppMean:150,oppSd:22,matchupValue:25});
const alert=LO.sundayAlert(res,{week:5,band});
ck('alert has a headline + week',!!alert.headline&&alert.week===5,alert.headline);
ck('alert carries the band bar',alert.band&&alert.band.median>100);
ck('alert calls (if any) carry dollars + why',!alert.hasCalls||(alert.calls[0].dollars>0&&/weekly-high/.test(alert.calls[0].why)));
// quiet week
const flat=LO.optimize([{id:'q',name:'Q',pos:'QB',proj:20,sd:6},{id:'r1',name:'R1',pos:'RB',proj:15,sd:6},{id:'r2',name:'R2',pos:'RB',proj:14,sd:6},{id:'w1',name:'W1',pos:'WR',proj:14,sd:6},{id:'w2',name:'W2',pos:'WR',proj:13,sd:6},{id:'t',name:'T',pos:'TE',proj:9,sd:5},{id:'k',name:'K',pos:'K',proj:8,sd:4},{id:'d',name:'D',pos:'DEF',proj:7,sd:5},{id:'f',name:'F',pos:'RB',proj:6,sd:5}],{band,oppMean:100});
const qa=LO.sundayAlert(flat,{week:5,band});
ck('a quiet week says so plainly',!qa.hasCalls&&/optimal|nothing/i.test(qa.headline),qa.headline);
// register 496 option ②: the late-firing honesty helper (kickoff is 1pm ET,
// UTC hour flips at the 2026-11-01 US DST fall-back).
const preDst=new Date(Date.UTC(2026,8,13,16,59,0));  // 2026-09-13 16:59Z, EDT
ck('pre-DST: 16:59Z is before the 17:00Z EDT kickoff',Date.parse('2026-09-13T16:59:00Z')<LO.earlySundayKickoffUtcMs(preDst));
ck('pre-DST: 17:00Z IS the EDT kickoff instant',LO.earlySundayKickoffUtcMs(preDst)===Date.parse('2026-09-13T17:00:00Z'));
const postDst=new Date(Date.UTC(2026,10,8,17,30,0));  // a Sunday after the fall-back, EST
ck('post-DST: kickoff moves to 18:00Z (EST)',LO.earlySundayKickoffUtcMs(postDst)===Date.parse('2026-11-08T18:00:00Z'));
// 2) the endpoint + routes
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'sun-'));process.env.SUNDAY_ALERT_KEY='testkey';
const store=require(path.join(ROOT,'src','store'));store.initFiles();
const data=require(path.join(ROOT,'src','data'));const {hashPassword}=require(path.join(ROOT,'src','auth'));
const {createApp}=require(path.join(ROOT,'server-app'));const cookieFrom=r=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
(async function(){
  await data.ensureSeeded();const owners=await store.get('owners');const cory=owners.find(o=>o.username==='cory');const rich=owners.find(o=>o.name==='Richard');
  for(const o of [cory,rich]){o.password_hash=hashPassword('pw');o.must_change_password=false;}await store.set('owners',owners);
  const server=createApp().listen(0);await new Promise(r=>server.once('listening',r));const b=`http://127.0.0.1:${server.address().port}`;
  const noKey=await fetch(b+'/api/sunday-alert',{redirect:'manual'});ck('cron endpoint 403 without the secret',noKey.status===403);
  const badKey=await fetch(b+'/api/sunday-alert?key=wrong',{redirect:'manual'});ck('cron endpoint 403 with wrong secret',badKey.status===403);
  const okKey=await fetch(b+'/api/sunday-alert?key=testkey',{redirect:'manual'});const j=await okKey.json();
  ck('cron endpoint with the secret returns ok (no-ops off-season)',okKey.status===200&&j.ok===true,JSON.stringify(j));
  const cc=cookieFrom(await fetch(b+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'username=cory&password=pw',redirect:'manual'}));
  const rc=cookieFrom(await fetch(b+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'username='+rich.username+'&password=pw',redirect:'manual'}));
  const send=await fetch(b+'/lineup/sunday/send',{method:'POST',headers:{Cookie:cc},redirect:'manual'});
  ck('commissioner manual send redirects (rehearsal)',send.status===302&&/sent=1/.test(send.headers.get('location')||''));
  const sendNc=await fetch(b+'/lineup/sunday/send',{method:'POST',headers:{Cookie:rc},redirect:'manual'});
  ck('non-commissioner cannot send (403)',sendNc.status===403);

  // register 496 option ②: a postKickoff alert's email leads with the honesty
  // note; a timely one does not. Provider intercepted, same pattern as
  // sunday_why.test.js.
  process.env.RESEND_API_KEY='test-key-not-real';
  const realFetch=global.fetch;let sentHtml=null;
  global.fetch=async(url,opts)=>{if(String(url).includes('api.resend.com')){sentHtml=JSON.parse(opts.body).html;return{ok:true,text:async()=>'',json:async()=>({})};}return realFetch(url,opts);};
  const notify=require(path.join(ROOT,'src','notify'));
  cory.email='cory@example.com';await store.set('owners',owners);
  const lateAlert=Object.assign({},alert,{postKickoff:true});
  await notify.sundayAlert([cory],lateAlert);
  ck('a post-kickoff alert leads with the honesty note',/fired after the early Sunday kickoff/.test(sentHtml||''),sentHtml&&sentHtml.slice(0,200));
  const onTimeAlert=Object.assign({},alert,{postKickoff:false});
  await notify.sundayAlert([cory],onTimeAlert);
  ck('an on-time alert carries no late note',!/fired after the early Sunday kickoff/.test(sentHtml||''),sentHtml&&sentHtml.slice(0,200));
  global.fetch=realFetch;delete process.env.RESEND_API_KEY;

  server.close();console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
