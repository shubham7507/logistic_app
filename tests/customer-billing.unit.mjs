import assert from 'node:assert/strict';
import * as R from '../js/ops-rules.js';
import * as P from '../js/pay.js';
import * as B from '../js/customer-billing.js';
import {SEED} from '../js/mock-data.js';
const S=()=>{const s=JSON.parse(JSON.stringify(SEED));P.ensurePay(s);return s};

// driver: driver's charges + booking fee + GST on fee; outstation / one-way / monthly pieces
let q=R.quoteDriver({hireType:'daily',carType:'SUV automatic'});assert.equal(q.partnerTotal,1320);assert.equal(q.fee,58);assert.equal(q.total,1378);
assert.equal(R.quoteDriver({hireType:'hourly',duration:2}).partnerTotal,720,'hourly minimum 4 h');
assert.ok(R.quoteDriver({hireType:'outstation',duration:2,nights:1}).partnerLines.some(([d])=>/Food allowance/.test(d)));
assert.ok(R.quoteDriver({hireType:'oneway'}).partnerLines.some(([d])=>/return travel/.test(d)));
assert.equal(R.quoteDriver({hireType:'monthly'}).fee,499+90);
// movers: inventory-based, floors with 'no' strings, insurance, survey for big moves
q=R.quoteMoving({size:'2 BHK',floors:2,lift:'no',dropFloors:1,dropLift:'no',distanceKm:32,inventory:'2 beds, Wardrobe, Fridge, 40 cartons',declaredValue:300000});
assert.ok(q.partnerLines.some(([d])=>/Pickup floor 2/.test(d))&&q.partnerLines.some(([d])=>/Drop floor 1/.test(d)));
assert.equal(q.insurance,3000);assert.equal(q.total,q.partnerTotal+q.gst+3000);assert.equal(q.survey,false);
assert.equal(R.quoteMoving({size:'3 BHK'}).survey,true);assert.equal(R.quoteMoving({distanceKm:1400}).survey,true);

// driver release: no commission, fee to MoveAI, driver gets 100% of driver's charges + reimbursement
let s=S();const r={id:'SR-T1',customer:'personal',type:'driver',provider:'personalDriver',title:'Driver',quote:R.quoteDriver({hireType:'daily'}),extras:[],status:'completed'};s.serviceRequests.unshift(r);
assert.match(B.proposeExtra(s,r,{kind:'toll_parking',amount:60},'personalDriver'),/photo/);
B.proposeExtra(s,r,{kind:'extra_hour',qty:2},'personalDriver');B.proposeExtra(s,r,{kind:'toll_parking',amount:60,proof:'slip.jpg'},'personalDriver');
assert.match(P.payBalance(s,r,{method:'upi',vpa:'a@okaxis'}).error,/Approve or reject/);
r.extras.forEach(x=>B.decideExtra(s,r,x.id,'approve'));assert.equal(P.paySummary(s,r).total,1258+360);
const pay=P.payBalance(s,r,{method:'upi',vpa:'a@okaxis'});assert.equal(pay.amount,1618);
const rel=P.release(s,r);assert.equal(rel.commission,0);assert.equal(rel.amount,1200+300+60,'driver gets charges + extras + parking');
assert.ok(s.ledger.some(x=>x.reference==='FEE-SR-T1'&&x.amount===58));
const invs=s.customerInvoices.filter(i=>i.ref==='SR-T1');assert.equal(invs.length,2,'driver bill + MoveAI fee invoice');assert.equal(invs.find(i=>!i.feeInvoice).docType,'Bill of supply');
assert.ok(s.ledger.find(x=>x.serviceId==='SR-T1'&&x.type==='customer_payment').receiptNo.startsWith('MR/'));

// movers: 10% commission on mover's charges, insurance to insurer, GST invoice
s=S();const m={id:'SR-T2',customer:'personal',type:'moving',movingJobId:'MOV-X',title:'Move',quote:R.quoteMoving({size:'2 BHK',declaredValue:100000}),extras:[],status:'confirmed'};s.serviceRequests.unshift(m);
P.payBalance(s,m,{method:'upi',vpa:'a@okaxis'});const rm=P.release(s,m);
assert.equal(rm.commission,Math.round((m.quote.partnerTotal+m.quote.gst)*0.10));assert.ok(s.ledger.some(x=>x.type==='insurance'&&x.amount===1000));
assert.equal(s.customerInvoices.find(i=>i.ref==='SR-T2').docType,'Tax invoice');

// refund → credit note number
s=S();const c=s.serviceRequests.find(x=>x.movingJobId&&x.status!=='cancelled');s.movingJobs.find(j=>j.id===c.movingJobId).status='slot_confirmed';P.cancel(s,c,'customer');
assert.ok(s.ledger.find(x=>x.serviceId===c.id&&x.type==='refund').creditNoteNo.startsWith('CN/'));

// survey → fixed quote accepted → 20% held
s=S();const v={id:'SR-T3',customer:'personal',type:'moving',movingJobId:null,title:'3 BHK',quote:R.quoteMoving({size:'3 BHK'}),surveyRequested:true,extras:[],status:'confirmed'};s.serviceRequests.unshift(v);
v.fixedQuote={amount:50000,note:'110 cartons'};const acc=P.acceptFixedQuote(s,v,'a@okaxis');assert.equal(acc.amount,10000);assert.equal(v.quote.total,50000);assert.ok(v.fixedQuoteAccepted);
// GSTIN validation on receipt details
assert.ok(B.GSTIN_RE.test('09ABCDE1234F1Z5'));assert.ok(!B.GSTIN_RE.test('09ABC'));
console.log(JSON.stringify({status:'PASS',suite:'Customer pricing, extras, receipts, invoices, credit notes, survey'},null,2));
