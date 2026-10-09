import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {PRODUCTS} from '../js/products.js';
import {canOpen} from '../js/permissions.js';
import * as Staff from '../js/grocery-staff.js';
import * as Workforce from '../js/grocery-workforce.js';
import * as Pay from '../js/grocery-picker-pay.js';
import * as Commerce from '../js/commerce.js';
import * as Shop from '../js/product-orders.js';

const s=structuredClone(SEED),ok=x=>assert.equal(x,'');
for(const [store,manager,worker,product] of [
 ['electrical','electricalManager','pickerElectrical','PRD-201'],
 ['fashion','fashionManager','pickerFashion','PRD-301']
]){
 assert.ok(PRODUCTS.seller.roles.includes(manager)&&PRODUCTS.picker.roles.includes(worker));
 assert.ok(canOpen(store,'shopTeam')&&canOpen(manager,'shopTeam')&&!canOpen(worker,'shopTeam'));
 assert.match(Commerce.screen(s,'shopTeam',store),/Open Staff/);
 assert.match(Commerce.screen(s,'shopTeam',manager),/Staff invitations/);
 assert.match(Commerce.screen(s,'shopProfile',store),/Manage store team/);
 const invited=`987650${store==='electrical'?'3344':'4455'}`;
 ok(Staff.invitePicker(s,store,`${store} colleague`,invited));
 const p=s.pickerStaff.at(-1);assert.equal(p.store,store);assert.equal(p.status,'invited');
 assert.match(Staff.selectPicker(s,worker==='pickerElectrical'?'pickerFashion':'pickerElectrical',p.id),/unavailable/);
 ok(Staff.selectPicker(s,worker,p.id));ok(Staff.acceptPickerInvite(s,worker));
 assert.equal(p.status,'profile_pending');
 ok(Staff.submitPickerOnboarding(s,worker,{aadhaar:'234567891234',otp:'123456',consent:'1',dob:'1995-01-01',selfie:'staff-selfie.jpg',accountName:p.name,accountNumber:'1234567891',ifsc:'SBIN0001234'}));
 assert.equal(p.status,'submitted');
 ok(Staff.pickerReviewDecision(s,store,p.id,'approve'));
 assert.equal(p.status,'active');
 assert.match(Commerce.screen(s,'pickProfile',worker),new RegExp(`${store} colleague`));
 const managerId=`MGR-${store==='electrical'?'003':'004'}`;
 assert.equal(Workforce.activeManager(s,manager).id,managerId);
 ok(Workforce.publishPickerShift(s,manager,p.id,new Date().toISOString().slice(0,10),'00:00','23:59'));
 ok(Workforce.respondPickerShift(s,worker,s.pickerSchedules.at(-1).id,'confirm'));
 ok(Pay.setPickerPayPlan(s,store,p.id,'daily',650));
 ok(Pay.startPickerShift(s,worker));
 assert.ok(Staff.availablePickers(s,store).some(x=>x.id===p.id));
 const o=Shop.placeOrder(s,{productId:product,qty:1,address:'Delhi 110001',method:'cod'}).order;
 assert.match(Commerce.sellerAction(s,worker,o.id,'accept'),/denied/);
 ok(Commerce.sellerAction(s,manager,o.id,'accept'));
 assert.equal(o.pickerId,p.id);assert.equal(o.pickerOffer.status,'offered');
 assert.match(Commerce.screen(s,'pickTasks',worker),new RegExp(o.id));
 ok(Staff.respondPickOffer(s,worker,o.id,true));ok(Commerce.pickerAction(s,worker,o.id,'start'));
 assert.match(Commerce.pickerAction(s,worker,o.id,'check',product),/product-specific check/);ok(Commerce.pickerAction(s,worker,o.id,'check',product,[true,true]));ok(Commerce.pickerAction(s,worker,o.id,'complete'));
 ok(Commerce.sellerAction(s,manager,o.id,'pack',1));
 assert.equal(o.status,'ready_for_pickup');
 ok(Commerce.deliveryAction(s,'deliveryPartner',o.id,'accept'));
 o.geo={...(o.geo||{}),live:true,everStarted:true,lastAt:Date.now()};
 ok(Commerce.deliveryAction(s,'deliveryPartner',o.id,'pickup',o.pickupCode,1));
 ok(Commerce.deliveryAction(s,'deliveryPartner',o.id,'deliver',o.deliveryCode));
 assert.equal(o.status,'delivered');
 assert.match(Shop.ordersScreen(s),new RegExp(o.id));
 assert.match(Commerce.screen(s,'commerceOrders','admin'),new RegExp(o.id));
 assert.ok(s.notifications.some(n=>n.to===manager&&n.ref===o.id));
 assert.equal(Commerce.visibleOrders(s,worker==='pickerElectrical'?'pickerFashion':'pickerElectrical').some(x=>x.id===o.id),false);
 ok(Pay.endPickerShift(s,worker));
 const shift=s.pickerShifts.find(x=>x.pickerId===p.id);ok(Pay.approvePickerShift(s,manager,shift.id));
 ok(Staff.removePicker(s,store,p.id));assert.equal(p.status,'removed');
 assert.match(Staff.assignPicker(s,store,o.id,p.id),/unfinished/);
}
console.log('PASS electrical and fashion team invite, manager, shift, assignment, fulfilment, delivery, notification, pay and removal');
