import assert from 'node:assert/strict';
import * as G from '../js/gst-portal.js';
import * as F from '../js/freight.js';
import {SEED} from '../js/mock-data.js';
const s=JSON.parse(JSON.stringify(SEED));s.currentWorkspace='transporter';F.ensureFreight(s);G.ensureGst(s);
const t=s.trips.find(x=>x.id==='TRP-501');const pre=G.prefillFromTrip(s,t);
assert.ok(G.needsEwb(s,t)||pre.value===0);
const v={...pre,value:430000,invoiceNo:'SF/INV-9',hsn:'1006',distanceKm:1000,fromGstin:'10AAKFS7788M1Z2',toGstin:''};
assert.match(G.generateEwb(s,t,{...v,value:40000},'goods').error,/not above/);
assert.match(G.generateEwb(s,t,{...v,fromGstin:'09AAACR5055K1Z9'},'goods').error,/cancelled/);
assert.match(G.generateEwb(s,t,{...v,fromPin:'12'},'goods').error,/PIN/);
s.gstPortal.down=true;assert.match(G.generateEwb(s,t,v,'goods').error,/not responding/);s.gstPortal.down=false;
// consignor generates Part A only; transporter adds truck → valid 5 days for 1000 km
const r=G.generateEwb(s,t,{...v,vehicle:''},'goods');assert.equal(G.ewbStatus(r.ewb).status,'part_a_only');
assert.equal(G.updatePartB(s,r.ewb,'BR01GX5522','Part B','transporter').ok,true);assert.equal(G.validityDays(1000),5);
assert.equal(G.ewbStatus(r.ewb).status,'active');
// truck replaced on the trip → Part B updated automatically
t.registration='BR01HK1180';t.previousVehicles=['BR01GX5522'];G.syncVehicles(s);assert.equal(r.ewb.partB.vehicle,'BR01HK1180');assert.match(r.ewb.history.at(-1).text,/Replacement/);
// extension only near expiry
assert.match(G.extendEwb(s,r.ewb,{remainingKm:300,reason:'Breakdown'}).error,/only from 8 hours/);
r.ewb.validUntil=Date.now()+2*3600000;assert.equal(G.ewbStatus(r.ewb).status,'expiring');assert.equal(G.extendEwb(s,r.ewb,{remainingKm:300,reason:'Breakdown'}).ok,true);
// cancel within 24 h only
r.ewb.generatedAt=Date.now()-25*3600000;assert.match(G.cancelEwb(s,r.ewb,'Trip cancelled').error,/24 hours/);
// transporter ID for unregistered truck owner; transfer
assert.equal(G.transporterIdOf(s,'vehicle'),'');assert.ok(G.enrolTransporter(s,'vehicle',{name:'Raj Transport',pan:'BKQPG4412C',stateCode:'10'}).ok);assert.ok(G.transporterIdOf(s,'vehicle'));
assert.ok(G.transferEwb(s,r.ewb,'vehicle').ok);assert.ok(G.updatePartB(s,r.ewb,'BR01HK2200','transshipment','vehicle').ok);
// consolidation requires same truck
const t3=s.trips.find(x=>x.id==='TRP-503');const r2=G.generateEwb(s,t3,{...v,vehicle:'BR01HK2200'},'transporter');
assert.ok(G.consolidate(s,[r.ewb.no,r2.ewb.no],'transporter').ok);
// e-invoice: exempt as GTA by default; when not exempt → IRN, locked, cancel within 24h
const inv=s.freightInvoices.find(i=>i.tripId==='TRP-503')||F.createInvoice(s,{issuer:'transporter',tripId:'TRP-503',billTo:'goods',freight:38000}).inv;
assert.equal(G.einvoiceRequired(s,inv).required,false);s.freightSettings.transporter.gtaExempt=false;assert.equal(G.einvoiceRequired(s,inv).required,true);
assert.ok(G.registerIrn(s,inv,F.amounts).ok);assert.equal(inv.irn.length,64);assert.equal(F.proposeCharge(s,inv,{kind:'detention',amount:100,evidence:'x'}),'');assert.equal(F.decideCharge(s,inv,inv.charges.at(-1).id,'approve','goods'),'');assert.equal(inv.notes[0].type,'debit','approved charge after IRN becomes a debit note');
assert.ok(G.cancelIrn(s,inv,'Wrong amount').ok);assert.equal(inv.status,'cancelled');
console.log(JSON.stringify({status:'PASS',suite:'E-way bill + e-invoice (simulated GSP)'},null,2));
