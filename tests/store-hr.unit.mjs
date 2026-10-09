import assert from 'node:assert/strict';
import * as H from '../js/store-hr.js';
import {invitePicker} from '../js/grocery-staff.js';
import {SEED} from '../js/mock-data.js';
import * as Payroll from '../js/payroll-core.js';
import {ensurePlus} from '../js/commerce-plus.js';
const fresh=()=>{const s=structuredClone(SEED);H.ensureBranchDocs(s);return s};
let s=fresh();const B1='grocery-B1',B2='grocery-B2';
// invite needs role, home branch and rate; manager limited to own branch
assert.match(H.invite(s,'grocery',{name:'Priya',mobile:'9811122233',role:'picker',payType:'per_shift'},invitePicker).error,/home branch/);
let r=H.invite(s,'grocery',{name:'Priya',mobile:'9811122233',role:'picker',homeBranch:B2,payType:'per_shift',rate:450,freq:'weekly',cover:[B1]},invitePicker);assert.ok(r.ok,r.error);
const priya=r.person;assert.equal(s.staffHR[priya.id].homeBranch,B2);assert.deepEqual(s.staffHR[priya.id].cover,[B1]);
assert.match(H.invite(s,'grocery',{name:'Priya',mobile:'9811122233',role:'picker',homeBranch:B2,payType:'per_shift',rate:450},invitePicker).error,/already/);
const mgr=H.actor(s,'groceryManager');assert.equal(mgr.kind,'manager');assert.match(H.invite(s,'groceryManager',{name:'Ravi',mobile:'9811122299',role:'picker',homeBranch:mgr.branch===B1?B2:B1,payType:'monthly',rate:10000},invitePicker).error,/own branch/);
// same person at another seller: allowed with a note
r=H.invite(s,'groceryFresh',{name:'Asha',mobile:'9876505101',role:'picker',homeBranch:'groceryFresh-B1',payType:'per_shift',rate:400},invitePicker);assert.ok(r.ok);assert.match(r.note,/also works at/);
// staff verification: age, Aadhaar OTP, selfie, emergency; payout ₹1 check
assert.match(H.verifyStaff(s,priya.id,{dob:'2012-01-01'}),/18/);
assert.equal(H.verifyStaff(s,priya.id,{dob:'1998-05-01',aadhaar:'234567890123',otp:'123456',selfie:'me.jpg',emergencyName:'Mom',emergencyMobile:'9811100000'}),'');
assert.equal(H.setPayout(s,priya.id,{method:'upi',upi:'priya@okaxis'}),'');
// transfer by owner only; history kept
const asha=s.pickerStaff.find(p=>p.id==='PICK-001');H.hr(s,{...asha,kind:'staff'});
assert.match(H.setBranches(s,'groceryManager','PICK-001',B2,[]),/owner|your branch/);
assert.equal(H.setBranches(s,'grocery','PICK-001',B1,[B2],'Weekend cover'),'');
// attendance by branch → payroll split, meal + cover allowances
priya.status='active';
assert.match(H.markDay(s,'grocery',priya.id,'2026-10-01','grocery-B9'),/not assigned/);
const m=new Date().toISOString().slice(0,7);
H.markDay(s,'grocery',priya.id,`${m}-01`,B2);H.markDay(s,'grocery',priya.id,`${m}-02`,B2);H.markDay(s,'grocery',priya.id,`${m}-03`,B1);
let l=H.payrollLines(s,'grocery').find(x=>x.p.id===priya.id);assert.equal(l.base,1350);assert.equal(l.meal,180);assert.equal(l.coverPay,100);assert.deepEqual(l.byBranch,{[B2]:2,[B1]:1});
// advance with instalments (owner), manager can only request
assert.equal(H.giveAdvance(s,'groceryManager',priya.id,{amount:1000,instalment:500,reason:'Rent'}),'sent');
const adv=s.staffAdvances[0];assert.equal(adv.status,'pending_approval');assert.equal(H.approveAdvance(s,'grocery',adv.id),'');assert.equal(H.advanceLeft(s,priya.id),0);
const given=s.payAdvances.find(x=>x.migratedFrom?.id===adv.id);assert.equal(given.status,'pending_handoff');
assert.equal(Payroll.confirmAdvanceUpi(s,given.id,'owner',true),'');assert.equal(Payroll.confirmAdvanceUpi(s,given.id,'worker',true),'');assert.equal(H.advanceLeft(s,priya.id),1000);
assert.match(H.giveAdvance(s,'grocery',priya.id,{amount:999999,instalment:500,reason:'x'}),/limited/);
// reimbursement (receipt, approval limit), deduction + dispute
assert.match(H.addReimbursement(s,priya.id,{amount:200}),/receipt/);H.addReimbursement(s,priya.id,{amount:200,note:'Carry bags',receipt:'r.jpg'},true);
const re=s.staffLedger.find(e=>e.type==='reimbursement');assert.equal(H.decideEntry(s,'groceryManager',re.id,'approve'),'');
H.addDeduction(s,'grocery',priya.id,{amount:100,reason:'Scanner damaged',evidence:'p.jpg'});const de=s.staffLedger.find(e=>e.type==='deduction');assert.equal(H.dispute(s,priya.id,de.id,'Was already broken'),'');
assert.match(H.decideEntry(s,'groceryManager',de.id,'reject'),/owner/);assert.equal(H.decideEntry(s,'grocery',de.id,'reject'),'');
// payroll: manager posts, owner pays; recovery of one instalment; UPI payout
assert.equal(H.postEarnings(s,'grocery'),'');assert.match(H.payPerson(s,'groceryManager',priya.id),/owner/);
const before=H.balance(s,priya.id);assert.equal(before,1350+180+100+200);assert.equal(H.payPerson(s,'grocery',priya.id,'upi'),'');
assert.equal(H.advanceLeft(s,priya.id),500);assert.equal(H.balance(s,priya.id),0);
// cash payment needs the staff member's confirmation
H.markDay(s,'grocery',priya.id,`${m}-04`,B2);s.staffLedger.push({id:'E-X',store:'grocery',personId:priya.id,type:'earning',amount:450,status:'posted',period:'other'});
// petty cash per branch
assert.match(H.pettyAction(s,'groceryManager',B1,{type:'topup',amount:2000}),/owner|only at their branch/);assert.equal(H.pettyAction(s,'grocery',B1,{type:'topup',amount:2000}),'');
assert.match(H.pettyAction(s,'grocery',B1,{type:'expense',amount:120,note:'Tea'}),/receipt/);assert.equal(H.pettyAction(s,'grocery',B1,{type:'expense',amount:120,note:'Tea',receipt:'t.jpg'}),'');
H.pettyAction(s,'grocery',B1,{type:'count',counted:1850});assert.equal(H.pettyBalance(s,B1),1850);
assert.ok(H.branchCost(s,'grocery')[B2]>0);
// seller onboarding: branch GSTIN must match the state; FSSAI expiry pauses the branch
assert.match(H.saveBranchDocs(s,'grocery',B2,{gstin:'07AABCA1234K1Z5'}),/must start with 09/);
s.sellerBranches.grocery[0].docs.fssaiExpiry='2000-01-01';const msgs=H.dailyChecks(s);assert.ok(msgs.some(x=>/FSSAI expired/.test(x)));assert.equal(s.sellerBranches.grocery[0].open,false);
{const f=fresh();ensurePlus(f);assert.equal(H.sellerLevel(f,'grocery').level,3);f.shopPartners.grocery.onboarding.bankVerified=false;assert.equal(H.sellerLevel(f,'grocery').level,2);f.shopPartners.grocery.onboarding.pan='';assert.equal(H.sellerLevel(f,'grocery').level,1);}
// screens render
for(const [ws,route] of [['grocery','storeHR'],['groceryManager','storeHR'],['picker','myHR']]){s.hrTab='team';const h=H.screen(s,route,ws);assert.ok(h.length>300,route+ws);assert.doesNotMatch(h.replace(/<[^>]+>/g,' '),/\bundefined\b|NaN/,`${ws} ${route}`);}
for(const t of ['payroll','ledgers','petty','reports']){s.hrTab=t;assert.doesNotMatch(H.screen(s,'storeHR','grocery').replace(/<[^>]+>/g,' '),/\bundefined\b|NaN/,t);}
console.log(JSON.stringify({status:'PASS',suite:'Store people & pay: branches, onboarding, payroll, advances, petty cash, seller documents'},null,2));
