import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as Orders from '../js/product-orders.js';
import * as Claims from '../js/commerce-plus.js';
import * as Help from '../js/help-desk.js';
import * as NC from '../js/notify-center.js';
import {readEvidence} from '../js/claim-evidence.js';

const seed=()=>{const s=structuredClone(SEED);s.person={id:'P1',name:'Shubham Kumar'};Claims.ensurePlus(s);return s;};
const order=s=>{const o=Orders.placeOrder(s,{productId:'PRD-103',qty:2,address:'Flat 4, Sector 62',method:'upi',vpa:'test@upi',billing:{name:'Shubham'}}).order;o.status='delivered';o.deliveredAt=Date.now();return o;};
const photo={name:'damage.png',mime:'image/png',data:'data:image/png;base64,aGVsbG8='};
const reader=globalThis.FileReader;
globalThis.FileReader=class {readAsDataURL(f){this.result=`data:${f.type};base64,aGVsbG8=`;this.onload();}};
assert.deepEqual(await readEvidence({name:'damage.png',type:'image/png',size:20}),photo);
await assert.rejects(readEvidence({name:'wrong.pdf',type:'application/pdf',size:20}),/JPG, PNG or WebP/);
await assert.rejects(readEvidence({name:'large.pdf',type:'application/pdf',size:350001},{pdf:true}),/smaller than 350 KB/);
globalThis.FileReader=reader;

let s=seed(),o=order(s);
assert.equal(Claims.raiseClaim(s,o,'PRD-103',{kind:'damaged',qty:1,reason:'The packet was torn',photo:photo.name,evidence:photo,refundTo:'source'}),'');
let c=s.claims[0],seller=Claims.screen(s,'plusReturns','grocery'),admin=Claims.screen(s,'plusClaims','admin'),customer=Claims.orderHelp(s,o),driver=Claims.deliveryExtras(s,'deliveryPartner');
assert.equal(c.status,'pickup_assigned');assert.equal(c.pickup.status,'offered');
for(const html of [seller,admin,customer,driver])assert.match(html,/data:image\/png;base64,aGVsbG8=/,'all four roles can inspect evidence');
assert.match(seller,/Send evidence to platform/);assert.match(seller,/Original picking and packing record/);assert.match(admin,/Return pickup/);assert.match(customer,/View claim updates/);
assert.ok(NC.actions(s,'grocery').some(x=>x.route==='plusReturns'&&x.text.includes(c.id)));
assert.ok(NC.actions(s,'deliveryPartner').some(x=>x.route==='deliveryJobs'&&x.text.includes('accept or decline')));
assert.equal(Claims.sellerClaimResponse(s,c,'electrical','We checked the packet seal.'), 'This claim belongs to another store.');
assert.equal(Claims.sellerClaimResponse(s,c,'grocery','The seal was intact at handover',photo),'');
admin=Claims.screen(s,'plusClaims','admin');assert.match(admin,/Store response/);assert.match(admin,/seal was intact/);
const help=Claims.helpForClaim(s,c);assert.ok(help.caseId);assert.equal(c.helpCaseId,help.caseId);
s.selectedSupportCaseId=help.caseId;assert.match(Help.screen(s,'personal'),/Linked claim/);assert.match(Help.screen(s,'grocery'),/data:image\/png;base64,aGVsbG8=/);assert.match(Claims.screen(s,'plusReturns','grocery'),/Open linked Help Desk case/);assert.equal(Claims.helpForClaim(s,c).caseId,help.caseId);
assert.equal(Claims.returnPartnerAction(s,c,'deliveryPartner','decline'),'');
assert.equal(c.pickup.status,'waiting','Sana is unavailable; claim must stay visible for admin');
assert.ok(NC.actions(s,'admin').some(x=>x.route==='plusClaims'));
s.deliveryPartners.deliveryPartner2={...structuredClone(s.deliveryPartners.deliveryPartner),id:'DP-002',name:'Sana Delivery',available:true};
assert.equal(Claims.assignReturnPartner(s,c,'DP-002'),'');assert.equal(c.pickup.partnerId,'DP-002');
assert.equal(Claims.returnPartnerAction(s,c,'deliveryPartner','accept'),'This return pickup is not assigned to you.');
assert.equal(Claims.returnPartnerAction(s,c,'deliveryPartner2','accept'),'');
assert.match(Claims.pickupAction(s,c,'collect',{code:c.pickup.code,qc0:'on',qc1:'on'},'deliveryPartner'),/Accept your assigned/);
assert.equal(Claims.pickupAction(s,c,'collect',{code:c.pickup.code,qc0:'on',qc1:'on'},'deliveryPartner2'),'');
assert.equal(c.status,'refund_started');
const ledger=s.ledger.find(x=>x.sourceId===c.id&&x.type==='refund');assert.equal(ledger.status,'refund_initiated');
assert.match(Claims.storeDispute(s,c,'The returned item does not match'),/Only refunded/);
assert.equal(Claims.completeClaimRefund(s,c),'');assert.equal(c.status,'refunded');assert.equal(ledger.status,'refunded');
assert.equal(Claims.storeDispute(s,c,'The returned item does not match'),'');
assert.equal(Claims.adminDecide(s,c,'approve'),'');assert.equal(c.dispute.status,'store_upheld');

// A failed condition check has a visible appeal and admin can arrange another pickup.
s=seed();o=order(s);Claims.raiseClaim(s,o,'PRD-103',{kind:'damaged',qty:1,reason:'Packet burst open',photo:photo.name,evidence:photo});c=s.claims[0];
assert.equal(Claims.returnPartnerAction(s,c,'deliveryPartner','accept'),'');
assert.equal(Claims.pickupAction(s,c,'collect',{code:c.pickup.code,qc0:'on'},'deliveryPartner'),'');assert.equal(c.status,'qc_failed');
assert.match(Claims.orderHelp(s,o),/Appeal/);assert.equal(Claims.appealClaim(s,c,'Photo clearly shows the damaged seal'),'');
assert.match(Claims.screen(s,'plusClaims','admin'),/Arrange another pickup/);
assert.equal(Claims.adminDecide(s,c,'retry'),'');assert.equal(c.status,'pickup_assigned');assert.equal(c.pickup.status,'waiting');
assert.ok(c.history.some(x=>x.text.includes('new return pickup')));

// No pickup: an admin decision needs a reason and an external refund stays pending until confirmed.
s=seed();o=Orders.placeOrder(s,{productId:'PRD-107',qty:1,address:'Flat 4',method:'upi',vpa:'test@upi',billing:{name:'Shubham'}}).order;o.status='delivered';o.deliveredAt=Date.now();Claims.settings(s).claimAutoLimit=0;Claims.raiseClaim(s,o,'PRD-107',{kind:'damaged',qty:1,reason:'Milk was leaking',photo:photo.name,evidence:photo,refundTo:'source'});
c=s.claims[0];assert.equal(c.status,'review');assert.match(Claims.adminDecide(s,c,'reject'),/Explain the rejection/);
assert.equal(Claims.adminDecide(s,c,'reject','The evidence does not show damage'),'');assert.equal(c.status,'rejected');
assert.equal(Claims.appealClaim(s,c,'The seal is torn in the photo'),'');
assert.equal(Claims.adminDecide(s,c,'approve'),'');assert.equal(c.status,'refund_started');

console.log('PASS damage claim: customer, seller, admin, partner, evidence, Help Desk, pickup exceptions, appeal, refund');
