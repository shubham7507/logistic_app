import assert from 'node:assert/strict';
import * as F from '../js/freight.js';
import {SEED} from '../js/mock-data.js';
const S=()=>{const s=JSON.parse(JSON.stringify(SEED));s.currentWorkspace='transporter';F.ensureFreight(s);return s};
let s=S();
const i501=s.freightInvoices.find(i=>i.tripId==='TRP-501'&&i.issuer==='transporter');
// GST: reverse charge → not on invoice; forward → added
let a=F.amounts(s,i501);assert.equal(a.gst,0);assert.equal(a.rcmGst,Math.round(62000*0.05));
i501.gstMode='forward';a=F.amounts(s,i501);assert.equal(a.gst,Math.round(62000*0.12));i501.gstMode='rcm';
// TDS: partnership payee → 2%; exempt truck owner (≤10 trucks + PAN) → none
a=F.amounts(s,i501);assert.equal(a.tds.rate,2);assert.equal(a.tds.amount,1240);
const iv=s.freightInvoices.find(i=>i.issuer==='vehicle');assert.equal(F.tdsFor(s,iv).applicable,false);assert.match(F.tdsFor(s,iv).reason,/≤10 trucks/);
// existing advance payment from the ledger counts
assert.equal(F.amounts(s,i501).cash,12000);
// schedule: advance at loading (loaded ✓), balance after POD (not yet)
const sc=F.schedule(s,i501);assert.equal(sc[0].amount,12000);assert.equal(sc[1].due,null);
// credit invoice from August is overdue; credit rule pauses new trips after 15 days
const old=s.freightInvoices.find(i=>i.tripId==='TRP-488');const d=F.dueState(s,old);assert.equal(d.status,'overdue');assert.ok(d.overdueDays>=15);
assert.equal(F.creditStatus(s,'transporter','goods').blocked,true);
// part payment with UTR required, TDS capped, over-payment refused
assert.match(F.recordPayment(s,old,{amount:10000,method:'neft',reference:''},'Vijay'),/UTR/);
assert.match(F.recordPayment(s,old,{amount:999999,method:'neft',reference:'X'},'Vijay'),/more than/);
assert.equal(F.recordPayment(s,old,{amount:20000,tds:720,method:'neft',reference:'UTR123'},'Vijay'),'');
a=F.amounts(s,old);assert.equal(a.cash,20000);assert.equal(a.tdsDone,720);assert.equal(a.outstanding,36000-20720);assert.equal(a.confirmed,0);
const p=s.ledger.find(x=>x.invoiceId===old.id&&x.type==='freight');assert.match(F.confirmPayment(s,old,p.id,'goods'),/receiver/);assert.equal(F.confirmPayment(s,old,p.id,'transporter'),'');
// extra charge: issuer proposes with evidence, payer approves → revision
assert.match(F.proposeCharge(s,i501,{kind:'detention',amount:1500}),/evidence/);
assert.equal(F.proposeCharge(s,i501,{kind:'detention',amount:1500,note:'9 h at gate',evidence:'gate.jpg'}),'');
assert.match(F.decideCharge(s,i501,i501.charges[0].id,'approve','transporter'),/Only the party being billed/);
assert.equal(F.decideCharge(s,i501,i501.charges[0].id,'approve','goods'),'');assert.equal(F.amounts(s,i501).taxable,63500);assert.equal(i501.revision,2);
// shortage deduction: disputed amount is held (not demanded)
i501.adjustments.push({id:'ADJ-1',kind:'shortage',amount:2000,note:'200 kg short',status:'proposed',by:'goods'});
const before=F.amounts(s,i501).outstanding;F.decideAdjustment(s,i501,'ADJ-1','dispute','transporter');assert.equal(F.amounts(s,i501).outstanding,before-2000);assert.equal(F.amounts(s,i501).held,2000);
// duplicate invoice for the same trip refused; export has sales + receipt rows
assert.match(F.createInvoice(s,{issuer:'transporter',tripId:'TRP-501',billTo:'goods',freight:1}).error,/already exists/);
const rows=F.exportRows(s,'transporter');assert.ok(rows.some(r=>r[0]==='Sales')&&rows.some(r=>r[0]==='Receipt'));assert.ok(F.toCsv(rows).split('\n').length>3);
console.log(JSON.stringify({status:'PASS',suite:'Freight billing phase 1'},null,2));
