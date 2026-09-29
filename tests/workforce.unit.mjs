import assert from 'node:assert/strict';
import * as W from '../js/workforce.js';
import {SEED} from '../js/mock-data.js';
const s=JSON.parse(JSON.stringify(SEED));s.currentWorkspace='transporter';W.ensureWorkforce(s);

// directory: one list, engagement tags, no duplicates
const wf=W.workforceOf(s,'transporter');
assert.ok(wf.some(w=>w.kind==='team'&&w.family==='office')&&wf.some(w=>w.family==='field'),'office + field');
assert.ok(wf.some(w=>w.engagement==='contractor'),'contractor listed');
assert.equal(new Set(wf.map(w=>w.id)).size,wf.length,'each person once');
const mohan=wf.find(w=>w.id==='WORKER-001');assert.ok(mohan.keys.includes('commercialDriver'),'staff driver linked to persona ledger key');

// duty: leave wins, then trip
const d=new Date().toISOString().slice(0,10);mohan.member.leave={from:d,to:d,reason:'Sick'};assert.equal(W.dutyStatus(s,'transporter',mohan,d).status,'on_leave');delete mohan.member.leave;

// khata: accruals minus payments; disputes excluded
const k0=W.khata(s,'transporter',mohan).balance;
W.postAccrual(s,'transporter',mohan.key,'bata',900,'Bata test');assert.equal(W.khata(s,'transporter',mohan).balance,k0+900);
assert.match(W.addDeduction(s,'transporter',mohan,{reason:'fine_vehicle',amount:500,note:'x',evidence:'c.jpg'}),/paid by the business/);
assert.match(W.addDeduction(s,'transporter',mohan,{reason:'damage',amount:500,note:'Broken carton'}),/evidence/);
assert.match(W.addDeduction(s,'transporter',mohan,{reason:'damage',amount:9000,note:'x',evidence:'e.jpg'}),/override/);
assert.equal(W.addDeduction(s,'transporter',mohan,{reason:'damage',amount:500,note:'Broken carton',evidence:'e.jpg'}),'');
assert.equal(W.khata(s,'transporter',mohan).balance,k0+400);
const ded=s.accruals.find(a=>a.type==='deduction');assert.equal(W.disputeAccrual(s,ded.id,'Carton was damaged at loading'),'');
assert.equal(W.khata(s,'transporter',mohan).balance,k0+900,'disputed deduction not counted');
W.resolveDispute(s,ded.id,'waive');assert.equal(W.khata(s,'transporter',mohan).balance,k0+900);

// trip settlement: bata + receipts − advance; FASTag excluded; pending receipts block posting
const t=s.trips.find(x=>x.id==='TRP-501');t.owner='transporter';
assert.match(W.addExpense(s,t,mohan.key,{category:'food',amount:300}),/receipt/);
W.addExpense(s,t,mohan.key,{category:'food',amount:300,proof:'bill.jpg'});W.addExpense(s,t,mohan.key,{category:'toll_fastag',amount:1200});
let row=W.tripCrewSettlement(s,t).find(r=>r.w.key===mohan.key);assert.equal(row.pendingExpenses,1);assert.match(W.postTripSettlement(s,t,row),/Approve/);
s.tripExpenses.find(e=>e.category==='food').status='approved';row=W.tripCrewSettlement(s,t).find(r=>r.w.key===mohan.key);
assert.equal(row.approved,300,'FASTag toll is not reimbursed to the driver');assert.equal(row.bata,W.tripDays(t)*300);
assert.equal(row.net,row.wage+row.bata+300-row.advances);assert.equal(W.postTripSettlement(s,t,row),'');assert.match(W.postTripSettlement(s,t,W.tripCrewSettlement(s,t).find(r=>r.w.key===mohan.key)),/Already/);

// payroll: prepare → approve (limit, maker-checker) → pay; loan instalment recovered
const lines=W.payrollLines(s,'transporter');const ml=lines.find(l=>l.memberId==='WORKER-001');assert.equal(ml.recovery,2000);
assert.equal(W.preparePayroll(s,'transporter','Sunita Verma'),'');
assert.match(W.approvePayroll(s,'transporter','Sunita Verma',25000),/above your approval limit|cannot also approve/);
assert.equal(W.approvePayroll(s,'transporter','Amit Raj'),'');assert.equal(W.payPayroll(s,'transporter','Amit Raj'),'');
assert.equal(mohan.member.loan.balance,4000);assert.equal(W.khata(s,'transporter',W.workforceOf(s,'transporter').find(w=>w.id==='WORKER-001')).balance,0,'payroll settles the khata');
assert.ok(s.ledger.some(x=>x.sourceType==='payroll'&&x.payee==='staff:WORKER-001'));
console.log(JSON.stringify({status:'PASS',suite:'Workforce + worker money (W4/P4)'},null,2));
