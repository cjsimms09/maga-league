'use strict';
// Side-bet declare→confirm→dispute lifecycle. In-memory store shim so it runs
// without Netlify Blobs. Asserts the state machine + the "never settle silently"
// and "site records, never adjudicates" rules.
const path=require('path');
const ROOT=require('path').join(__dirname,'..','..');
// in-memory store
const mem={};
const store={ async get(k,d){return k in mem?mem[k]:(d===undefined?null:d);},
  async set(k,v){mem[k]=v;}, async listKeys(p){return Object.keys(mem).filter(k=>k.startsWith(p));},
  async getMany(ks){return ks.map(k=>mem[k]);}, async del(k){delete mem[k];} };
require.cache[path.join(ROOT,'src','data.js')]={exports:{store,getDoc:store.get,setDoc:store.set,
  newId:()=>Math.random().toString(36).slice(2,10),now:()=>new Date(2026,0,1).toISOString()}};
const SB=require(path.join(ROOT,'src','sidebets'));
let pass=0,fail=0;const ck=(n,c,d)=>{c?(pass++,console.log('PASS '+n)):(fail++,console.log('FAIL '+n+(d?' -> '+d:'')))};

(async function(){
  // A locked two-party bet between owner 1 and owner 2.
  let bet=await SB.propose({proposer_id:1,party_ids:[2],terms:'Cory outscores David wk5',stake:20,kind:'matchup',week:5});
  bet=await SB.accept(bet.id,2,'David');
  ck('bet locks once both accept',bet.status===SB.STATUS.LOCKED,bet.status);

  // owner 1 DECLARES they won -> AWAITING_CONFIRM, no money yet
  bet=await SB.declareResult(bet.id,1,'Cory',{winner_ids:[1],why:'final 120-99'});
  ck('declare -> AWAITING_CONFIRM',bet.status===SB.STATUS.AWAITING_CONFIRM,bet.status);
  ck('declare moves NO money yet (no legs)',(bet.legs||[]).length===0);
  ck('declare records who + when in the audit',bet.audit.some(a=>a.by===1&&/declared the result/.test(a.what)));

  // declarer cannot self-confirm
  const self=await SB.confirmResult(bet.id,1,'Cory');
  ck('declarer cannot self-confirm (stays AWAITING)',self.status===SB.STATUS.AWAITING_CONFIRM);

  // it shows up as "awaiting you" for owner 2, not owner 1
  const all1=await SB.all();
  ck('awaiting() surfaces it to the confirmer (2), not the declarer (1)',
    SB.awaiting(all1,2).some(b=>b.id===bet.id) && !SB.awaiting(all1,1).some(b=>b.id===bet.id));

  // owner 2 CONFIRMS -> SETTLED, legs built (David pays Cory 20)
  bet=await SB.confirmResult(bet.id,2,'David');
  ck('confirm -> SETTLED',bet.status===SB.STATUS.SETTLED,bet.status);
  ck('settle builds a leg loser->winner',bet.legs.length===1 && bet.legs[0].from===2 && bet.legs[0].to===1 && bet.legs[0].amount===20,JSON.stringify(bet.legs));
  ck('confirm is on the record (who confirmed)',bet.audit.some(a=>a.by===2&&/confirmed the result/.test(a.what)));

  // ---- the dispute path ----
  let b2=await SB.propose({proposer_id:1,party_ids:[2],terms:'wk6',stake:10,kind:'matchup',week:6});
  b2=await SB.accept(b2.id,2,'David');
  b2=await SB.declareResult(b2.id,1,'Cory',{winner_ids:[1],why:'I won'});
  // owner 2 DISPUTES
  b2=await SB.disputeResult(b2.id,2,'David','no, the stat correction flipped it');
  ck('dispute -> DISPUTED (site records, never adjudicates)',b2.status===SB.STATUS.DISPUTED,b2.status);
  ck('dispute is NOT settled, no legs, no money moved',(b2.legs||[]).length===0 && !b2.settled_at);
  ck('dispute records both the disputer and the reason',b2.dispute && b2.dispute.by===2 && /stat correction/.test(b2.dispute.why));
  ck('disputed() surfaces it to a party',SB.disputed(await SB.all(),1).some(b=>b.id===b2.id));

  // re-declare after sorting it out (the honest outcome this time), then confirm
  b2=await SB.declareResult(b2.id,2,'David',{winner_ids:[2],why:'agreed: David won after correction'});
  ck('re-declare from DISPUTED resets to AWAITING_CONFIRM and clears the dispute',
    b2.status===SB.STATUS.AWAITING_CONFIRM && b2.dispute===null,b2.status);
  b2=await SB.confirmResult(b2.id,1,'Cory');
  ck('the re-declared result confirms and settles the other way',
    b2.status===SB.STATUS.SETTLED && b2.winner_ids[0]===2 && b2.legs[0].from===1 && b2.legs[0].to===2);

  // full audit trail is append-only (every transition recorded, none rewritten)
  ck('audit is a complete append-only trail (proposed→…→settled)',
    b2.audit.length>=5 && b2.audit.some(a=>/DISPUTED/.test(a.what)) && b2.audit.some(a=>/confirmed/.test(a.what)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
