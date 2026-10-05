import assert from 'node:assert/strict';
import * as L from '../js/ledger-core.js';
import * as C from '../js/people-core.js';
import * as WF from '../js/workforce.js';
import * as H from '../js/store-hr.js';
import {SEED} from '../js/mock-data.js';
const fresh=()=>{const s=structuredClone(SEED);H.people(s,'grocery');C.ensureCore(s);WF.ensureWorkforce(s);globalThis.__moveaiLC=L;return s};
let s=fresh();
// one schema: balances for business staff (khata) and store staff (store ledger) in the same rows
const tr=L.rows(s,'transporter');assert.ok(tr.length>=4&&tr.every(r=>'balance' in r&&r.engine==='business'));
const st=L.rows(s,'grocery');assert.ok(st.length>=2&&st.every(r=>r.engine==='store'));
assert.ok(L.rows(s,'groceryManager').every(r=>r.e.homeBranch==='grocery-B1'||r.e.cover.includes('grocery-B1')),'manager sees only their branch');
// policy: lead ≤ 200, manager ≤ 5000, owner above
assert.equal(L.levelFor(s,'grocery',150),'lead');assert.equal(L.levelFor(s,'grocery',800),'manager');assert.equal(L.levelFor(s,'grocery',9000),'owner');
assert.equal(L.canApprove(s,'grocery','grocery','grocery-B1',9000),'');
assert.equal(L.canApprove(s,'groceryManager','grocery','grocery-B1',800),'');assert.match(L.canApprove(s,'groceryManager','grocery','grocery-B1',9000),/owner/);
assert.match(L.canApprove(s,'groceryManager','grocery','grocery-B2',100),/another branch/);
// store reimbursement goes through the shared policy (manager approves ₹800 but not ₹9,000)
H.addReimbursement(s,'PICK-001',{amount:800,note:'Bags',receipt:'r.jpg'},true);H.addReimbursement(s,'PICK-001',{amount:9000,note:'Scale repair',receipt:'r.jpg'},true);
let inb=L.inbox(s,'groceryManager');const small=inb.find(x=>x.amount===800),big=inb.find(x=>x.amount===9000);assert.equal(small.can,'');assert.match(big.can,/owner/);
assert.equal(L.decide(s,'groceryManager',small,true),'');assert.match(L.decide(s,'groceryManager',big,true),/owner/);assert.equal(L.decide(s,'grocery',L.inbox(s,'grocery').find(x=>x.amount===9000),true),'');
// business trip receipts in the same inbox; owner approves
s.tripExpenses.push({id:'EXP-T',tripId:'TRP-501',workerKey:'staff:WORKER-001',category:'food',amount:350,proof:'f.jpg',status:'submitted'});
inb=L.inbox(s,'transporter');const exp=inb.find(x=>x.id==='EXP-T');assert.equal(exp.level,'manager');assert.equal(L.decide(s,'transporter',exp,true),'');assert.equal(s.tripExpenses.find(x=>x.id==='EXP-T').status,'approved');
// business cash payment waits for the worker's confirmation
const mohan=L.rows(s,'transporter').find(r=>r.e.source.id==='WORKER-001');WF.postAccrual(s,'transporter',mohan.key,'wage',1500,'Trip wage');
const r2=L.rows(s,'transporter').find(r=>r.e.source.id==='WORKER-001');assert.match(L.payCash(s,'transporter',r2,r2.balance+1),/only/);assert.equal(L.payCash(s,'transporter',r2,Math.min(1000,r2.balance)),'');
const cash=s.ledger.find(x=>x.ack==='pending');assert.ok(cash);assert.match(L.ackPanel(s,'staff')||L.ackPanel({...s,selectedStaffId:'WORKER-001'},'staff'),/Confirm cash/);
assert.ok(L.register(s,'transporter').some(x=>/waiting for staff confirmation/.test(x.status)));
// petty cash now works for business branches too; managers limited by policy
assert.match(L.pettyAction(s,'transporter','BR-001',{type:'expense',amount:100,note:'Tea'}),/receipt/);
assert.equal(L.pettyAction(s,'transporter','BR-001',{type:'topup',amount:3000}),'');assert.equal(L.pettyAction(s,'transporter','BR-001',{type:'expense',amount:150,note:'Tea for loaders',receipt:'t.jpg'}),'');assert.equal(H.pettyBalance(s,'BR-001'),2850);
// unified entries
assert.ok(L.entries(s,r2).some(x=>x.type==='earning'));
// screens
for(const ws of ['transporter','goods','vehicle','movers','grocery','groceryManager'])for(const t of ['balances','approvals','petty','register','policy']){s.lcTab=t;const h=L.screen(s,'payLedgers',ws);assert.ok(h.length>200,ws+t);assert.doesNotMatch(h.replace(/<[^>]+>/g,' '),/\bundefined\b|NaN/,`${ws} ${t}`);}
console.log(JSON.stringify({status:'PASS',suite:'Unified pay & ledgers: one schema, approval chain, approvals inbox, cash confirmation, petty cash, register'},null,2));
