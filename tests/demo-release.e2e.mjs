import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as Shop from '../js/product-orders.js';
import * as Commerce from '../js/commerce.js';
import * as Geo from '../js/geo.js';
import * as Staff from '../js/grocery-staff.js';
import * as Payroll from '../js/payroll-core.js';
import {mobileMoreGroups} from '../js/navigation.js';
import {ROLE_CONFIG} from '../js/config.js';

const ok = value => assert.equal(value, '');
const s = structuredClone(SEED);
for (const id of ['PRD-101','PRD-201','PRD-301']) ok(Shop.addToCart(s,id));
const checkout = Shop.placeOrder(s,{fromCart:true,address:'Delhi 110001',method:'cod'});
assert.equal(checkout.ok,true,checkout.error);
assert.equal(checkout.orders.length,3);
assert.equal(s.productCart.length,0);
for (const ws of ['grocery','electrical','fashion']) {
  const order=checkout.orders.find(o=>o.party===s.shopPartners[ws].party);
  assert.ok(order);
  ok(Commerce.sellerAction(s,ws,order.id,'accept'));
  ok(Commerce.pickerAction(s,ws,order.id,'start'));
  for(const item of order.items)ok(Commerce.pickerAction(s,ws,order.id,'check',item.productId,ws==='grocery'?[]:[true,true]));
  ok(Commerce.pickerAction(s,ws,order.id,'complete'));
  ok(Commerce.sellerAction(s,ws,order.id,'pack',1));
  ok(Commerce.deliveryAction(s,'deliveryPartner',order.id,'accept'));
  assert.match(Commerce.deliveryAction(s,'deliveryPartner',order.id,'pickup',order.pickupCode,1),/location/);
  Geo.ensureGeo(s);
  order.geo={...order.geo,mode:'demo',live:true,everStarted:true,lastAt:Date.now()};
  ok(Geo.recordPosition(s,order,order.origin[0],order.origin[1],'demo'));
  ok(Commerce.deliveryAction(s,'deliveryPartner',order.id,'pickup',order.pickupCode,1));
  ok(Commerce.deliveryAction(s,'deliveryPartner',order.id,'deliver',order.deliveryCode));
  assert.equal(order.status,'delivered');
  assert.match(Shop.ordersScreen(s),new RegExp(order.id));
  assert.equal(order.codCash.status,'collected');
}

const mobile = mobileMoreGroups('seller','fashion',ROLE_CONFIG.fashion.nav);
assert.ok(mobile.some(g=>g.label==='Staff'&&g.items.some(([route])=>route==='shopTeam')));
assert.ok(mobile.some(g=>g.label==='Money'&&g.items.some(([route])=>route==='shopSales')));

ok(Staff.invitePicker(s,'fashion','New teammate','9876512345'));
const invited=s.pickerStaff.at(-1);
ok(Staff.selectPicker(s,'pickerFashion',invited.id));
ok(Staff.acceptPickerInvite(s,'pickerFashion'));
assert.equal(invited.status,'profile_pending');
ok(Staff.submitPickerOnboarding(s,'pickerFashion',{aadhaar:'234567891234',otp:'123456',consent:'1',dob:'1995-01-01',selfie:'worker.jpg',accountName:invited.name,accountNumber:'1234567891',ifsc:'SBIN0001234',upi:'worker@okaxis'}));
ok(Staff.pickerReviewDecision(s,'fashion',invited.id,'approve'));
assert.equal(invited.status,'active');
invited.bankStatus='verified';
Payroll.ensurePayrollCore(s);
const employment=s.employments.find(e=>e.source.kind==='picker'&&e.source.id===invited.id);
assert.ok(employment);
// A wage must be due before a payment can be initiated.
s.staffLedger ||= [];s.staffLedger.push({id:'DEMO-WAGE-1',store:'fashion',personId:invited.id,branchId:'fashion-B1',type:'earning',amount:600,status:'posted',note:'Demo work',at:new Date().toISOString()});
Payroll.ensurePayrollCore(s);
const payment=Payroll.payNow(s,'fashion',employment.personId,500,'upi');
assert.equal(payment.ok,true);
ok(Payroll.confirmPayment(s,payment.eventId,'owner',true));
assert.equal(s.payEvents.find(e=>e.id===payment.eventId).status,'pending_confirmation');
ok(Payroll.confirmPayment(s,payment.eventId,'worker',true));
assert.equal(s.payEvents.find(e=>e.id===payment.eventId).status,'posted');
const mismatch=Payroll.payNow(s,'fashion',employment.personId,100,'upi');
ok(Payroll.confirmPayment(s,mismatch.eventId,'owner',true));
ok(Payroll.confirmPayment(s,mismatch.eventId,'worker',false));
assert.equal(s.payEvents.find(e=>e.id===mismatch.eventId).status,'disputed');

console.log('PASS demo release: three-seller COD delivery, staff onboarding, grouped mobile menu, two-sided UPI pay');
