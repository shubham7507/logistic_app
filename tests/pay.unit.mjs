import assert from 'node:assert/strict';
import * as P from '../js/pay.js';
import {SEED} from '../js/mock-data.js';
const S=()=>{const s=JSON.parse(JSON.stringify(SEED));P.ensurePay(s);return s};

// gateway simulator
assert.match(P.gateway.collect({method:'upi',vpa:'fail@upi',amount:10}).reason,/declined/);
assert.match(P.gateway.collect({method:'card',card:'4111111111110002',amount:10}).reason,/declined/);
assert.ok(P.gateway.collect({method:'upi',vpa:'a@okaxis',amount:10}).ok);
assert.equal(P.bookingAmount('moving',10000),2000);assert.equal(P.bookingAmount('moving',1000),500);assert.equal(P.bookingAmount('driver',5000),0);

// seeded moving bookings got their ₹2,000 hold
let s=S();const r=s.serviceRequests.find(x=>x.movingJobId&&x.status!=='cancelled');
assert.equal(P.paySummary(s,r).held,2000);

// customer pays balance online → held; job closes → released minus 10%
const due=P.paySummary(s,r).due;assert.equal(P.payBalance(s,r,{method:'upi',vpa:'shubham@okaxis'}).amount,due);
const w0=P.wallet(s,'movers').balance;const rel=P.release(s,r);
assert.equal(rel.commission,Math.round(r.quote.total*0.10));assert.equal(P.wallet(s,'movers').balance,w0+r.quote.total-rel.commission);
assert.equal(P.holdsOf(s,r).filter(x=>x.status==='held').length,0);

// cash balance → commission becomes wallet debt; blocked above limit
s=S();const r2=s.serviceRequests.find(x=>x.movingJobId&&x.status!=='cancelled');
P.payBalance(s,r2,{method:'cash'});const debt=s.ledger.find(x=>x.type==='cash_commission');assert.equal(debt.amount,Math.round(P.paySummary(s,r2).cash*0.10));
for(let i=0;i<30;i++)P.cashCommission(s,r2,1000);assert.ok(P.wallet(s,'movers').blocked);assert.match(P.partnerBlocked(s,'movers'),/Pay it/);
assert.equal(P.settleDebt(s,'movers',{method:'upi',vpa:'x@okaxis'}).ok,true);assert.equal(P.partnerBlocked(s,'movers'),'');

// cancellation: free before crew, fee after crew, full refund + penalty on no-show, not after start
s=S();const r3=s.serviceRequests.find(x=>x.movingJobId&&x.status!=='cancelled');const job=s.movingJobs.find(j=>j.id===r3.movingJobId);
job.status='slot_confirmed';assert.equal(P.cancellationQuote(s,r3).fee,0);
job.status='resources_allocated';const q=P.cancellationQuote(s,r3);assert.ok(q.fee>=299&&q.fee<=1500);assert.equal(q.refund,2000-q.fee);
job.status='in_transit';assert.equal(P.cancellationQuote(s,r3).allowed,false);
job.status='resources_allocated';const c=P.cancel(s,r3,'partner_no_show');assert.equal(c.refund,2000);assert.ok(s.ledger.some(x=>x.type==='penalty'&&x.amount===500));
assert.equal(r3.status,'cancelled');assert.equal(job.status,'cancelled');assert.ok(s.ledger.some(x=>x.type==='refund'&&x.amount===2000));

// payouts: weekly/instant, failure keeps balance, retry after fixing account
s=S();const r4=s.serviceRequests.find(x=>x.movingJobId&&x.status!=='cancelled');P.payBalance(s,r4,{method:'upi',vpa:'a@okaxis'});P.release(s,r4);
const bal=P.wallet(s,'movers').balance;s.payoutAccounts.movers={method:'bank',accountNumber:'1234000'};
const f=P.payout(s,'movers');assert.ok(f.error);assert.equal(P.wallet(s,'movers').balance,bal,'failed payout does not reduce wallet');
s.payoutAccounts.movers={method:'upi',vpa:'safemove@okhdfc'};const ok=P.retryPayout(s,f.entry.id);assert.equal(ok.amount,bal);assert.equal(P.wallet(s,'movers').balance,0);
const r5=s.serviceRequests.find(x=>x.movingJobId&&x!==r4&&x.status!=='cancelled');if(r5){P.release(s,r5);const b2=P.wallet(s,'movers').balance;const inst=P.payout(s,'movers',{instant:true});assert.equal(inst.amount,b2-10);}
console.log(JSON.stringify({status:'PASS',suite:'MoveAI Pay'},null,2));
