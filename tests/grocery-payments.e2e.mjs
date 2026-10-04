import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as O from '../js/product-orders.js';
import * as C from '../js/commerce.js';
import * as I from '../js/grocery-inventory.js';
import * as Staff from '../js/grocery-staff.js';
import {resolvePending} from '../js/pay.js';
const fresh=()=>structuredClone(SEED),ok=x=>assert.equal(x,'');
const entry=(s,id,type)=>s.ledger.find(e=>(e.orderId===id||e.sourceId===id)&&e.type===type);
const prepare=(s,o)=>{ok(C.sellerAction(s,'grocery',o.id,'accept'));ok(Staff.assignPicker(s,'grocery',o.id,'PICK-001'));ok(C.pickerAction(s,'picker',o.id,'start'));for(const item of o.items)ok(C.pickerAction(s,'picker',o.id,'check',item.productId));ok(C.pickerAction(s,'picker',o.id,'complete'));ok(C.sellerAction(s,'grocery',o.id,'pack',1))};
let cases=0;
for(const [method,ref] of [['store_cash',''],['store_upi','UPI-123'],['store_card','POS-123']]){
 const s=fresh(),o=O.placeOrder(s,{productId:'PRD-101',qty:2,fulfilment:'pickup',method}).order;
 assert.equal(o.paymentStatus,'due_at_pickup');assert.equal(entry(s,o.id,'customer_payment'),undefined);prepare(s,o);
 if(method!=='store_cash')assert.match(C.collectStorePickup(s,'grocery',o.id,o.pickupCode),/reference/);
 ok(C.collectStorePickup(s,'grocery',o.id,o.pickupCode,ref));assert.equal(entry(s,o.id,'customer_payment').status,'confirmed');assert.equal(entry(s,o.id,'customer_payment').channel,'outside_app');assert.equal(entry(s,o.id,'seller_settlement'),undefined);
 const fee=entry(s,o.id,'platform_commission_due');assert.equal(fee.status,'due');assert.match(C.recordPlatformFee(s,fee.id,''),/reference/);ok(C.recordPlatformFee(s,fee.id,'FEE-TRANSFER'));assert.equal(fee.status,'recorded_paid');assert.match(C.recordPlatformFee(s,fee.id,'again'),/No platform fee/);
 ok(C.requestReturn(s,o.id,'Wrong product'));ok(C.resolveReturn(s,o.id,true));assert.equal(entry(s,o.id,'refund').status,'refund_recorded');assert.ok(entry(s,o.id,'platform_fee_adjustment'));assert.doesNotMatch(O.ordersScreen(s),/Invalid Date/);cases++;
}
for(const method of ['cash','upi','card']){
 const s=fresh();ok(I.addCounterItem(s,'grocery','PRD-101',1));
 assert.match(I.completeCounterSale(s,'grocery',method,'Customer',0,'' ).error||'',method==='cash'?/^$/:/reference/);
 if(method==='cash'){// The first call created the sale; use that receipt.
  const sale=s.counterSales[0];assert.equal(entry(s,sale.id,'customer_payment').amount,sale.total);ok(I.returnCounterSale(s,'grocery',sale.id,'damaged'));assert.equal(entry(s,sale.id,'refund').status,'refund_recorded');
 }else{const sale=I.completeCounterSale(s,'grocery',method,'Customer',0,'',`${method}-REF`).sale;assert.equal(entry(s,sale.id,'customer_payment').reference,`${method}-REF`);ok(I.returnCounterSale(s,'grocery',sale.id,'sellable'));assert.equal(entry(s,sale.id,'refund').amount,sale.total)}cases++;
}
for(const method of ['cash','upi','card','cod']){
 const s=fresh(),res=C.createCounterDelivery(s,'grocery','PRD-101',1,'Noida','Customer',false,method,method==='cash'||method==='cod'?'':`${method}-REF`),o=res.order;
 assert.ok(o,res.error);if(method==='cod')assert.equal(entry(s,o.id,'customer_payment'),undefined);else assert.equal(entry(s,o.id,'customer_payment').channel,'outside_app');prepare(s,o);ok(C.deliveryAction(s,'deliveryPartner',o.id,'accept'));ok(C.deliveryAction(s,'deliveryPartner',o.id,'pickup',o.pickupCode,1));ok(C.deliveryAction(s,'deliveryPartner',o.id,'deliver',o.deliveryCode));
 if(method==='cod'){assert.equal(entry(s,o.id,'customer_payment').method,'cash');ok(C.deliveryAction(s,'deliveryPartner',o.id,'remit','','',{amount:o.total,receiver:'Cash desk'}));ok(C.reconcileCash(s,o.id,o.total,'RCPT-001','Cash desk'));assert.ok(entry(s,o.id,'cash_handover'));assert.ok(entry(s,o.id,'cash_reconciliation'));assert.ok(entry(s,o.id,'seller_settlement'))}else{assert.equal(entry(s,o.id,'seller_settlement'),undefined);assert.equal(entry(s,o.id,'platform_commission_due').status,'due')}
 assert.equal(entry(s,o.id,'delivery_earning').amount,o.feeBreakdown.deliveryPartnerEarning);assert.ok(o.feeBreakdown.deliveryPartnerEarning>=30,'distance-based courier pay');cases++;
}
for(const [v,status] of [['pending@upi','paid'],['pendingfail@upi','cancelled']]){
 const s=fresh(),p=s.products.find(x=>x.id==='PRD-101'),start=p.reserved,o=O.placeOrder(s,{productId:p.id,qty:1,address:'Delhi',method:'upi',vpa:v}).order;
 assert.equal(o.status,'payment_pending');assert.equal(p.reserved,start+1);resolvePending(s);assert.equal(o.status,status);assert.equal(o.paymentStatus,status==='paid'?'paid':'failed');if(status==='cancelled')assert.equal(p.reserved,start);cases++;
}
console.log(JSON.stringify({status:'PASS',suite:'Grocery payment methods and cross-role ledger',cases}));
