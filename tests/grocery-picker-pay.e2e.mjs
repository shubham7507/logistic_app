import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as Pay from '../js/grocery-picker-pay.js';
import * as Staff from '../js/grocery-staff.js';
import * as Commerce from '../js/commerce.js';
import * as Orders from '../js/product-orders.js';
import {canOpen} from '../js/permissions.js';

const s=structuredClone(SEED);
assert.equal(canOpen('grocery','shopPickerPay'),true);
assert.equal(canOpen('picker','pickEarnings'),true);
assert.equal(canOpen('picker','shopPickerPay'),false);
assert.match(Commerce.screen(s,'shopTeam','grocery'),/Monthly/);
assert.match(Commerce.screen(s,'shopEarnings','grocery'),/Picker Pay/);
assert.match(Commerce.screen(s,'pickEarnings','picker'),/12,000/);
assert.match(Pay.startPickerShift(s,'grocery'),/Picker access/);
assert.equal(Pay.startPickerShift(s,'picker'),'');
assert.match(Pay.startPickerShift(s,'picker'),/already have a shift/);
assert.match(Pay.approvePickerShift(s,'grocery',s.pickerShifts[0].id),/not found/);
assert.equal(Pay.endPickerShift(s,'picker'),'');
assert.match(Pay.createPickerPayRun(s,'grocery','PICK-001'),/approve all shifts/);
assert.match(Pay.approvePickerShift(s,'groceryFresh',s.pickerShifts[0].id),/not found/);
assert.equal(Pay.approvePickerShift(s,'grocery',s.pickerShifts[0].id),'');
assert.equal(Pay.createPickerPayRun(s,'grocery','PICK-001'),'');
const monthly=Pay.payRunFor(s,'PICK-001',Pay.payPeriod(s.pickerStaff[0]));
assert.equal(monthly.baseAmount,12000);
assert.match(Pay.createPickerPayRun(s,'grocery','PICK-001'),/already exists/);
assert.match(Pay.adjustPickerPayRun(s,'grocery',monthly.id,-50,''),/Explain/);
assert.equal(Pay.adjustPickerPayRun(s,'grocery',monthly.id,200,'Extra shift cover'),'');
assert.equal(monthly.amount,12200);
assert.equal(Pay.approvePickerPayRun(s,'grocery',monthly.id),'');
assert.match(Pay.adjustPickerPayRun(s,'grocery',monthly.id,0,''),/draft/);
assert.match(Pay.recordPickerPayment(s,'grocery',monthly.id,'cash',''),/reference/);
assert.equal(Pay.recordPickerPayment(s,'grocery',monthly.id,'upi','UPI-ABC-03'),'');
assert.equal(monthly.status,'paid');
assert.match(Pay.recordPickerPayment(s,'grocery',monthly.id,'upi','UPI-ABC-03'),/Approve/);
assert.match(Commerce.screen(s,'pickEarnings','picker'),/12,200/);
assert.match(Commerce.screen(s,'shopPickerPay','grocery'),/UPI-ABC-03/);
assert.doesNotMatch(Commerce.screen(s,'shopPickerPay','groceryFresh'),/UPI-ABC-03/);

// Imran works a daily shift. The daily rate is counted once, independent of task count.
assert.equal(Pay.startPickerShift(s,'pickerFresh'),'');
assert.equal(Pay.endPickerShift(s,'pickerFresh'),'');
const dailyShift=s.pickerShifts.at(-1);
assert.equal(Pay.approvePickerShift(s,'groceryFresh',dailyShift.id),'');
assert.equal(Pay.createPickerPayRun(s,'groceryFresh','PICK-002'),'');
const daily=Pay.payRunFor(s,'PICK-002',Pay.payPeriod(s.pickerStaff[1]));
assert.equal(daily.baseAmount,500);
assert.match(Pay.approvePickerPayRun(s,'grocery',daily.id),/not found/);
assert.equal(Pay.approvePickerPayRun(s,'groceryFresh',daily.id),'');
assert.equal(Pay.recordPickerPayment(s,'groceryFresh',daily.id,'bank','BANK-FM-03'),'');

// Order settlements do not change when the store records staff pay.
const o=Orders.placeOrder(s,{productId:'PRD-101',qty:1,address:'Delhi',method:'upi',vpa:'test@okaxis'}).order;
assert.equal(Commerce.sellerAction(s,'grocery',o.id,'accept'),'');
assert.equal(Staff.assignPicker(s,'grocery',o.id,'PICK-001'),'');
assert.equal(Commerce.pickerAction(s,'picker',o.id,'start'),'');
assert.equal(Commerce.pickerAction(s,'picker',o.id,'check','PRD-101'),'');
assert.equal(Commerce.pickerAction(s,'picker',o.id,'complete'),'');
assert.equal(Commerce.sellerAction(s,'grocery',o.id,'pack',1),'');
assert.equal(Commerce.deliveryAction(s,'deliveryPartner',o.id,'accept'),'');
assert.equal(Commerce.deliveryAction(s,'deliveryPartner',o.id,'pickup',o.pickupCode,1),'');
assert.equal(Commerce.deliveryAction(s,'deliveryPartner',o.id,'deliver',o.deliveryCode),'');
assert.equal(o.sellerDue,653);assert.equal(o.deliveryPayoutStatus,'pending');
assert.equal(s.pickerPayRuns.filter(r=>r.pickerId==='PICK-001').length,1);
assert.equal(s.ledger.some(e=>e.type==='picker_pay'),false);

// Removed staff still appear for final store-funded payment.
const t=structuredClone(SEED);
assert.equal(Pay.startPickerShift(t,'picker'),'');
assert.equal(Staff.removePicker(t,'grocery','PICK-001'),'');
assert.equal(t.pickerShifts[0].status,'submitted');
assert.equal(Pay.approvePickerShift(t,'grocery',t.pickerShifts[0].id),'');
assert.equal(Pay.createPickerPayRun(t,'grocery','PICK-001'),'');
assert.match(Commerce.screen(t,'shopPickerPay','grocery'),/Former picker/);

// The controls on the rendered pages invoke the same actions through the UI binder.
const ui=structuredClone(SEED);let saved=0;
function tap(ws,action,id,fields={}){
 ui.currentWorkspace=ws;
 const button={dataset:{commerce:action,id},onclick:null};
 const root={querySelectorAll:selector=>selector==='[data-commerce]'?[button]:[],querySelector:selector=>({value:fields[selector]||''})};
 Commerce.bind(root,{getState:()=>ui,save:()=>saved++,render:()=>{},toast:message=>{if(message!=='Updated')throw new Error(message)}});
 button.onclick();
}
tap('picker','start-picker-shift');tap('picker','end-picker-shift');
tap('grocery','approve-picker-shift',ui.pickerShifts[0].id);
tap('grocery','create-picker-pay','PICK-001');
const uiRun=ui.pickerPayRuns[0];
tap('grocery','adjust-picker-pay',uiRun.id,{[`[data-picker-adjustment="${uiRun.id}"]`]:'100',[`[data-picker-adjustment-reason="${uiRun.id}"]`]:'Extra cover'});
tap('grocery','approve-picker-pay',uiRun.id);
tap('grocery','record-picker-payment',uiRun.id,{[`[data-picker-payment-method="${uiRun.id}"]`]:'bank',[`[data-picker-payment-ref="${uiRun.id}"]`]:'BANK-001'});
assert.equal(uiRun.status,'paid');assert.equal(uiRun.amount,12100);assert.equal(saved,7);
assert.match(Commerce.screen(ui,'commercePayments','admin'),/Store-funded Picker Pay/);
assert.match(Commerce.screen(ui,'commercePayments','admin'),/BANK-001/);

console.log(JSON.stringify({status:'PASS',suite:'Picker monthly and daily plans, shifts, approval, adjustments, recorded payment, role boundaries, removed staff and order money isolation'}));
