import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as PO from '../js/product-orders.js';
import * as C from '../js/commerce.js';
import {canOpen} from '../js/permissions.js';
const fresh=()=>{globalThis.__moveaiClockOffset=0;return structuredClone(SEED)};
const order=(s,method='upi',productId='PRD-101')=>{
 const v={productId,qty:1,address:'42 MG Road, Delhi 110001',method,vpa:'test@okaxis'};
 const r=PO.placeOrder(s,v);assert.ok(r.ok,r.error);return r.order;
};
const pack=(s,o,ws='grocery')=>{assert.equal(C.sellerAction(s,ws,o.id,'accept'),'');assert.equal(C.sellerAction(s,ws,o.id,'pack'),'');};
const deliver=(s,o,ws='deliveryPartner')=>{assert.equal(C.deliveryAction(s,ws,o.id,'accept'),'');assert.match(C.deliveryAction(s,ws,o.id,'pickup','0000'),/pickup code/);assert.equal(C.deliveryAction(s,ws,o.id,'pickup',o.pickupCode),'');assert.match(C.deliveryAction(s,ws,o.id,'deliver','0000'),/delivery code/);assert.equal(C.deliveryAction(s,ws,o.id,'deliver',o.deliveryCode),'');};
// Prepaid: distinct role scopes, verified handoff, delayed settlement, idempotence, invoice.
let s=fresh(),o=order(s);
assert.equal(C.visibleOrders(s,'grocery').some(x=>x.id===o.id),true);
assert.equal(C.visibleOrders(s,'groceryFresh').some(x=>x.id===o.id),false);
assert.match(C.sellerAction(s,'groceryFresh',o.id,'accept'),/denied/);
assert.match(C.deliveryAction(s,'deliveryPartner',o.id,'accept'),/denied/);
pack(s,o);assert.equal(o.deliveryAssignment.partnerId,'DP-001');
assert.equal(C.visibleOrders(s,'deliveryPartner2').some(x=>x.id===o.id),false);
assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'accept'),'');assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'pickup',o.pickupCode),'');
assert.match(C.updateLocation(s,'deliveryPartner2',o.id,'En route'),/only for your/);
assert.equal(C.updateLocation(s,'deliveryPartner',o.id,'Near destination'),'');assert.equal(o.latestLocation.label,'Near destination');
assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'deliver',o.deliveryCode),'');assert.equal(o.status,'delivered');assert.equal(o.settlementStatus,'pending');
assert.equal(o.sellerDue,653); // ₹710 products - ₹57 rounded commission
assert.equal(s.ledger.find(x=>x.orderId===o.id&&x.type==='customer_payment').status,'captured');
assert.equal(s.customerInvoices.find(x=>x.ref===o.id).total,710);
assert.match(C.settle(s,o.id),/reserve period/);
C.advanceDemoClock(s);assert.equal(C.settle(s,o.id),'');assert.equal(o.settlementStatus,'paid');
assert.match(C.settle(s,o.id),/not ready/);
assert.equal(s.ledger.filter(x=>x.orderId===o.id&&x.type==='delivery_earning').length,1);
assert.equal(s.ledger.filter(x=>x.orderId===o.id&&x.type==='seller_settlement').length,1);
assert.equal(C.payDelivery(s,o.id),'');assert.equal(o.deliveryPayoutStatus,'paid');assert.match(C.payDelivery(s,o.id),/not ready/);
// Return after payout creates refund and a future adjustment; wrong actors remain isolated.
assert.equal(C.requestReturn(s,o.id,'Damaged pack'),'');assert.equal(C.resolveReturn(s,o.id,true),'');
assert.equal(o.settlementStatus,'adjustment_due');assert.ok(s.ledger.some(x=>x.orderId===o.id&&x.type==='settlement_adjustment'&&x.amount===653));
assert.ok(s.ledger.some(x=>x.orderId===o.id&&x.type==='refund'&&x.amount===710));
// COD: offer decline → alternate driver → collection → handover → admin reconciliation → settlement.
s=fresh();o=order(s,'cod');pack(s,o);
assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'decline'),'');assert.equal(o.deliveryAssignment.partnerId,'DP-002');
assert.match(C.deliveryAction(s,'deliveryPartner',o.id,'accept'),/denied/);
deliver(s,o,'deliveryPartner2');assert.equal(o.codCash.status,'collected');
C.advanceDemoClock(s);assert.match(C.settle(s,o.id),/reconciled/);
assert.match(C.payDelivery(s,o.id),/Reconcile COD/);
assert.match(C.reconcileCash(s,o.id),/hand over/);
assert.equal(C.deliveryAction(s,'deliveryPartner2',o.id,'remit'),'');assert.equal(C.reconcileCash(s,o.id),'');assert.equal(C.settle(s,o.id),'');
assert.equal(C.payDelivery(s,o.id),'');
assert.match(C.requestReturn(s,o.id,'Wrong item','bad'),/UPI/);
assert.equal(C.requestReturn(s,o.id,'Wrong item','customer@okaxis'),'');assert.equal(C.resolveReturn(s,o.id,true),'');
assert.equal(s.ledger.find(x=>x.orderId===o.id&&x.type==='refund').destination,'customer@okaxis');
// Rejection, cancellation, no available courier and delivery exception.
s=fresh();o=order(s);assert.match(C.sellerAction(s,'grocery',o.id,'reject',''),/reason/);
assert.equal(C.sellerAction(s,'grocery',o.id,'reject','Out of stock'),'');assert.equal(o.status,'cancelled');assert.equal(s.ledger.filter(x=>x.orderId===o.id&&x.type==='refund').length,1);
o=order(s);assert.equal(C.customerCancel(s,o.id),'');assert.equal(o.status,'cancelled');
s.deliveryPartners.deliveryPartner.available=false;s.deliveryPartners.deliveryPartner2.available=false;
o=order(s);pack(s,o);assert.equal(o.deliveryAssignment,null);assert.match(C.assign(s,o.id,'DP-001'),/not found/);
s.deliveryPartners.deliveryPartner.available=true;assert.equal(C.assign(s,o.id,'DP-001'),'');
assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'accept'),'');assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'pickup',o.pickupCode),'');
assert.match(C.customerCancel(s,o.id),/before pickup/);
assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'issue'),'');assert.equal(o.status,'delivery_issue');
assert.equal(C.retryDelivery(s,o.id),'');assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'deliver',o.deliveryCode),'');
assert.equal(C.requestReturn(s,o.id,'Damaged pack'),'');assert.equal(C.resolveReturn(s,o.id,false),'');assert.equal(o.status,'delivered');
// A seller toggles only its own stock, and new orders respect availability.
s=fresh();s.products.find(p=>p.id==='PRD-101').stock='Unavailable';assert.match(PO.placeOrder(s,{productId:'PRD-101',qty:1,address:'X',method:'cod'}).error,/availability/);
assert.equal(C.visibleOrders(s,'admin').length,0);
assert.equal(canOpen('grocery','commerceOps'),false);assert.equal(canOpen('deliveryPartner','shopOrders'),false);assert.equal(canOpen('admin','commerceOps'),true);
assert.match(C.screen(s,'shopProfile','grocery'),/ABC Grocery/);
assert.match(C.screen(s,'commerceOps','admin'),/Shop operations/);
// One customer checkout creates one payment attempt and separate store tasks.
s=fresh();PO.addToCart(s,'PRD-101');PO.addToCart(s,'PRD-102');
let cart=PO.placeOrder(s,{fromCart:true,address:'Delhi',method:'upi',vpa:'pending@upi'});
assert.equal(cart.orders.length,2);assert.equal(cart.orders.reduce((n,x)=>n+x.total,0),1195);
assert.equal(C.visibleOrders(s,'grocery').filter(x=>x.checkoutId===cart.checkoutId).length,1);
assert.equal(C.visibleOrders(s,'groceryFresh').filter(x=>x.checkoutId===cart.checkoutId).length,1);
assert.match(C.sellerAction(s,'grocery',cart.orders[0].id,'accept'),/not available/);
assert.equal(PO.checkPayment(s,cart.order),'');assert.ok(cart.orders.every(x=>x.paymentStatus==='paid'));
assert.equal(new Set(s.ledger.filter(x=>x.checkoutId===cart.checkoutId).map(x=>x.reference)).size,1);
assert.equal(C.sellerAction(s,'grocery',cart.orders[0].id,'accept'),'');
assert.equal(C.sellerAction(s,'groceryFresh',cart.orders[1].id,'accept'),'');
assert.match(C.setPartnerStatus(s,'store','grocery','suspended'),/active orders/);
assert.equal(C.setPartnerStatus(s,'delivery','deliveryPartner2','suspended'),'');
assert.match(C.assign(s,cart.orders[0].id,'DP-002'),/not found/);
// Rejected bank payout stays pending and can be retried after correction.
s=fresh();o=order(s);pack(s,o);deliver(s,o);C.advanceDemoClock(s);
s.shopPartners.grocery.payoutAccount.accountNumber='123456000';
assert.match(C.settle(s,o.id),/Bank rejected/);assert.equal(o.settlementStatus,'pending');
s.shopPartners.grocery.payoutAccount.accountNumber='1234561254';assert.equal(C.settle(s,o.id),'');
// A multi-item store order follows the customer's substitution preference.
s=fresh();PO.addToCart(s,'PRD-101');PO.addToCart(s,'PRD-103');
cart=PO.placeOrder(s,{fromCart:true,address:'Delhi',method:'upi',vpa:'test@okaxis',substitution:'contact'});o=cart.order;
assert.equal(C.sellerAction(s,'grocery',o.id,'accept'),'');
assert.equal(C.unavailableItem(s,'grocery',o.id,'PRD-103'),'');assert.equal(o.status,'item_review');
assert.match(C.sellerAction(s,'grocery',o.id,'pack'),/not available/);
assert.equal(C.removeUnavailable(s,o.id),'');assert.equal(o.total,710);
assert.equal(s.ledger.find(x=>x.orderId===o.id&&x.type==='refund').amount,28);
assert.equal(C.sellerAction(s,'grocery',o.id,'pack'),'');
s=fresh();PO.addToCart(s,'PRD-101');PO.addToCart(s,'PRD-103');
cart=PO.placeOrder(s,{fromCart:true,address:'Delhi',method:'cod',substitution:'refund'});o=cart.order;
C.sellerAction(s,'grocery',o.id,'accept');assert.equal(C.unavailableItem(s,'grocery',o.id,'PRD-103'),'');assert.equal(o.status,'accepted');assert.equal(o.total,710);
console.log(JSON.stringify({status:'PASS',suite:'Cross-role mock commerce end-to-end',scenarios:13}));
