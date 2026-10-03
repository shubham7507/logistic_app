import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as Manager from '../js/grocery-manager-pay.js';
import * as Picker from '../js/grocery-picker-pay.js';
import * as Commerce from '../js/commerce.js';
import * as Orders from '../js/product-orders.js';
import * as Staff from '../js/grocery-staff.js';
const fresh=()=>structuredClone(SEED),ok=x=>assert.equal(x,'');
for(const method of ['upi','cash','card_transfer']){
 const s=fresh();assert.match(Manager.setManagerPayPlan(s,'groceryFresh','MGR-001',25000),/store/);ok(Manager.setManagerPayPlan(s,'grocery','MGR-001',25000));ok(Manager.prepareManagerPay(s,'grocery','MGR-001'));const r=s.managerPayRuns[0];assert.equal(r.amount,25000);assert.match(Manager.prepareManagerPay(s,'grocery','MGR-001'),/already/);assert.match(Manager.recordManagerPayment(s,'grocery',r.id,method,'REF'),/Approve/);ok(Manager.approveManagerPay(s,'grocery',r.id));assert.match(Manager.recordManagerPayment(s,'grocery',r.id,method,''),/reference/);ok(Manager.recordManagerPayment(s,'grocery',r.id,method,`MGR-${method}`));assert.equal(s.ledger.find(x=>x.sourceId===r.id).method,method);assert.equal(s.ledger.find(x=>x.sourceId===r.id).channel,'outside_app');assert.match(Manager.recordManagerPayment(s,'grocery',r.id,method,'DUP'),/Approve/);assert.match(Manager.managerPayHistory(s,'groceryManager'),new RegExp(`MGR-${method}`));assert.doesNotMatch(Manager.managerPayHistory(s,'groceryFreshManager'),new RegExp(`MGR-${method}`));assert.match(Commerce.screen(s,'commercePayments','admin'),/manager wage payment/);
}
for(const method of ['upi','cash','card_transfer']){
 const s=fresh();ok(Picker.startPickerShift(s,'picker'));ok(Picker.endPickerShift(s,'picker'));ok(Picker.approvePickerShift(s,'grocery',s.pickerShifts[0].id));ok(Picker.createPickerPayRun(s,'grocery','PICK-001'));const r=s.pickerPayRuns[0];ok(Picker.approvePickerPayRun(s,'grocery',r.id));ok(Picker.recordPickerPayment(s,'grocery',r.id,method,`PICK-${method}`));assert.equal(s.ledger.find(x=>x.sourceId===r.id).method,method);assert.match(Commerce.screen(s,'pickEarnings','picker'),new RegExp(`PICK-${method}`));
}
for(const method of ['upi','cash','card_transfer']){
 const s=fresh(),o=Orders.placeOrder(s,{productId:'PRD-101',qty:1,address:'Delhi',method:'upi',vpa:'demo@okaxis'}).order;ok(Commerce.sellerAction(s,'grocery',o.id,'accept'));ok(Staff.assignPicker(s,'grocery',o.id,'PICK-001'));ok(Commerce.pickerAction(s,'picker',o.id,'start'));ok(Commerce.pickerAction(s,'picker',o.id,'check','PRD-101'));ok(Commerce.pickerAction(s,'picker',o.id,'complete'));ok(Commerce.sellerAction(s,'grocery',o.id,'pack',1));ok(Commerce.deliveryAction(s,'deliveryPartner',o.id,'accept'));ok(Commerce.deliveryAction(s,'deliveryPartner',o.id,'pickup',o.pickupCode,1));ok(Commerce.deliveryAction(s,'deliveryPartner',o.id,'deliver',o.deliveryCode));assert.match(Commerce.payDelivery(s,o.id,method,''),/reference/);ok(Commerce.payDelivery(s,o.id,method,`DRV-${method}`));const e=s.ledger.find(x=>x.orderId===o.id&&x.type==='delivery_earning');assert.equal(e.method,method);assert.equal(e.channel,'outside_app');assert.equal(e.status,'recorded_paid');assert.match(Commerce.screen(s,'deliveryEarnings','deliveryPartner'),new RegExp(`DRV-${method}`));assert.match(Commerce.payDelivery(s,o.id,method,'DUP'),/not ready/);
}
console.log(JSON.stringify({status:'PASS',suite:'Grocery manager, picker and courier payment methods with store isolation',scenarios:9}));
