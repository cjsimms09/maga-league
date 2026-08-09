'use strict';
// ACCESS GUARD — analysis is the commissioner's, results are league property.
// Asserts (a) /lineup + /lineup/log 403 a non-commissioner, and (b) no
// league-visible page (as a NON-commissioner) renders per-owner efficiency
// rates, all-play records, or bench-points-left. This is the test Cory asked for
// so the leak can never come back by accident. Run: node access-guard.js
const os=require('os'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname,'..','..');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'guard-'));
const store=require(path.join(ROOT,'src','store'));store.initFiles();
const data=require(path.join(ROOT,'src','data'));
const {hashPassword}=require(path.join(ROOT,'src','auth'));
const {createApp}=require(path.join(ROOT,'server-app'));
const cookieFrom=res=>res.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
let pass=0,fail=0;const ck=(n,c,d)=>{c?(pass++,console.log('PASS '+n)):(fail++,console.log('FAIL '+n+(d?' -> '+d:'')))};

// Phrases that are ANALYSIS (must never appear on a league-visible page for a
// non-commissioner). Word-boundary-ish, case-insensitive. "efficiency" as a
// bare word appears in code comments only, not rendered text, so we target the
// rendered forms: "lineup efficiency", "N% efficiency", "all-play", "NN-NN all-play".
const BANNED = [
  /all[- ]play/i,
  /lineup efficiency/i,
  /efficiency (?:at|in the league|rate)/i,
  /biggest (?:positive )?luck gap/i,
  /largest robbery on record/i,
  // SEASON bench-points aggregate (intel), e.g. "left 297 on the bench",
  // "308 points rotting on his bench". Does NOT match a specific-game benching
  // like "benched Goff for 51" — that's a fact about a game and stays.
  /(?:left|leaving)\s+[\d,]+\s+(?:points?\s+)?(?:rotting\s+)?on (?:his|the) bench/i,
  /[\d,]+\s+points?\s+(?:rotting\s+)?on (?:his|the) bench/i,
];

(async function(){
  await data.ensureSeeded();
  const owners=await store.get('owners');
  // a NON-commissioner owner
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

  // (a) /lineup gated
  ck('/lineup 403 for a non-commissioner',(await get('/lineup',nc)).status===403);
  ck('/lineup?tab=proof 403 for a non-commissioner',(await get('/lineup?tab=proof',nc)).status===403);
  ck('/lineup 200 for the commissioner',(await get('/lineup',cc)).status===200);
  const logNc=await fetch(b+'/lineup/log',{method:'POST',headers:{Cookie:nc,'Content-Type':'application/x-www-form-urlencoded'},body:'counterfactual=%5B%5D&recommended=%5B%5D',redirect:'manual'});
  ck('/lineup/log 403 for a non-commissioner',logNc.status===403,String(logNc.status));

  // (b) no league-visible page leaks analysis, viewed AS a non-commissioner
  const PAGES=['/','/history','/history/season/2023','/history/season/2024','/history/season/2025',
    '/history/records','/history/money','/history/badbeats','/history/catalogue',
    '/history/franchise/Cory','/history/franchise/Jeremy','/matchup?opp=3','/bank','/team?section=roster'];
  for(const p of PAGES){
    const {status,body}=await get(p,nc);
    if(status!==200){ck('page loads: '+p,false,String(status));continue;}
    const hit=BANNED.find(re=>re.test(body));
    ck('no analysis leak on '+p,!hit,hit?('matched '+hit):'');
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
