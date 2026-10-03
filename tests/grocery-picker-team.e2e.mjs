import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as PO from '../js/product-orders.js';
import * as C from '../js/commerce.js';
import * as Staff from '../js/grocery-staff.js';
import {notificationsScreen} from '../js/ops.js';
import {canOpen} from '../js/permissions.js';
import {bindOps} from '../js/ops-actions.js';

const s=structuredClone(SEED);
assert.equal(canOpen('grocery','shopTeam'),true);
assert.equal(canOpen('picker','shopTeam'),false);
assert.match(C.screen(s,'shopTeam','grocery'),/Invite a fulfilment worker/);
assert.match(Staff.invitePicker(s,'grocery','Priya Sharma','bad'),/10-digit/);
assert.equal(Staff.invitePicker(s,'grocery','Priya Sharma','9876501555'),'');
const priya=s.pickerStaff.at(-1);
assert.equal(priya.status,'invited');
assert.match(Staff.invitePicker(s,'groceryFresh','Priya Sharma','9876501555'),/already/);
assert.match(Staff.selectPicker(s,'pickerFresh',priya.id),/unavailable/);
assert.equal(Staff.selectPicker(s,'picker',priya.id),'');
assert.match(C.screen(s,'pickProfile','picker'),/Accept store invitation/);
assert.equal(Staff.acceptPickerInvite(s,'picker'),'');
assert.equal(priya.status,'active');
assert.match(C.screen(s,'commercePartners','admin'),/Priya Sharma/);

for(const productId of ['PRD-101','PRD-103'])assert.equal(PO.addToCart(s,productId),'');
const placed=PO.placeOrder(s,{fromCart:true,address:'42 MG Road, Delhi',method:'upi',vpa:'test@okaxis'});
assert.ok(placed.ok,placed.error);const o=placed.order;
assert.equal(C.sellerAction(s,'grocery',o.id,'accept'),'');
assert.equal(C.visibleOrders(s,'picker').some(x=>x.id===o.id),false);
assert.match(C.pickerAction(s,'picker',o.id,'start'),/denied/);
assert.match(Staff.assignPicker(s,'groceryFresh',o.id,priya.id),/accepted.*store order/);
assert.match(Staff.assignPicker(s,'grocery',o.id,'PICK-002'),/active picker from this store/);
assert.equal(Staff.assignPicker(s,'grocery',o.id,priya.id),'');
assert.equal(C.visibleOrders(s,'picker').some(x=>x.id===o.id),true);
assert.match(C.screen(s,'pickTasks','picker'),new RegExp(o.id));
assert.match(C.pickerAction(s,'grocery',o.id,'start'),/Reassign or remove/);
assert.equal(C.pickerAction(s,'picker',o.id,'start'),'');
assert.equal(C.pickerAction(s,'picker',o.id,'check','PRD-101'),'');
assert.equal(Staff.assignPicker(s,'grocery',o.id,'PICK-001'),'');
assert.equal(o.pick,null); // A new picker rechecks all items.
assert.equal(C.visibleOrders(s,'picker').some(x=>x.id===o.id),false);
assert.equal(Staff.selectPicker(s,'picker','PICK-001'),'');
assert.equal(C.visibleOrders(s,'picker').some(x=>x.id===o.id),true);
assert.match(C.pickerAction(s,'picker',o.id,'complete'),/Start an open/);
assert.equal(C.pickerAction(s,'picker',o.id,'start'),'');
for(const i of o.items)assert.equal(C.pickerAction(s,'picker',o.id,'check',i.productId),'');
assert.equal(C.pickerAction(s,'picker',o.id,'complete'),'');
assert.match(Staff.assignPicker(s,'grocery',o.id,priya.id),/unfinished/);
assert.equal(C.sellerAction(s,'grocery',o.id,'pack',2),'');
assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'accept'),'');
assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'pickup',o.pickupCode,2),'');
assert.equal(C.deliveryAction(s,'deliveryPartner',o.id,'deliver',o.deliveryCode),'');
assert.equal(o.status,'delivered');
assert.ok(o.history.some(h=>h.text.includes('reassigned from Priya Sharma to Asha Picker')));

const o2=PO.placeOrder(s,{productId:'PRD-101',qty:1,address:'Delhi',method:'cod'}).order;
assert.equal(C.sellerAction(s,'grocery',o2.id,'accept'),'');
assert.equal(Staff.assignPicker(s,'grocery',o2.id,'PICK-001'),'');
assert.equal(Staff.removePicker(s,'grocery','PICK-001'),'');
assert.equal(o2.pickerId,null);
assert.match(Staff.assignPicker(s,'grocery',o2.id,'PICK-001'),/active picker/);
assert.equal(C.pickerAction(s,'grocery',o2.id,'start'),'');
assert.equal(C.pickerAction(s,'grocery',o2.id,'check','PRD-101'),'');
assert.equal(C.pickerAction(s,'grocery',o2.id,'complete'),'');
assert.equal(C.sellerAction(s,'grocery',o2.id,'pack',1),'');

// An invitation or assignment alert reaches only the selected picker account.
assert.equal(Staff.selectPicker(s,'picker',priya.id),'');
const priyaAlerts=notificationsScreen({...s,currentWorkspace:'picker'});
assert.match(priyaAlerts,/invitation to join ABC Grocery/);
assert.doesNotMatch(priyaAlerts,/Asha Picker: .*was reassigned/);
const alert=s.notifications.find(n=>n.pickerId===priya.id&&n.ref===o.id&&/assigned to Priya/.test(n.text));
let click,route='';
bindOps({querySelectorAll:sel=>sel==='[data-op]'?[{dataset:{op:'notif-open',id:alert.id},addEventListener:(event,fn)=>{if(event==='click')click=fn}}]:[],querySelector:()=>null},{getState:()=>s,save:()=>{},render:()=>{},navigate:r=>route=r,toast:()=>{}});
s.currentWorkspace='picker';click({preventDefault(){}});
assert.equal(route,''); // The order is no longer Priya's; deep link is denied.
assert.equal(Staff.selectPicker(s,'pickerFresh','PICK-002'),'');
assert.equal(C.visibleOrders(s,'pickerFresh').some(x=>x.id===o.id),false);

// Exercise the actual commerce button bindings with form values, not only the rules.
const ui=structuredClone(SEED);let saved=0;
const tap=(ws,action,id,values={},product)=>{
 ui.currentWorkspace=ws;
 const button={dataset:{commerce:action,id,product},onclick:null};
 const root={querySelectorAll:q=>q==='[data-commerce]'?[button]:[],querySelector:q=>({value:values[q]||''})};
 C.bind(root,{getState:()=>ui,save:()=>saved++,render:()=>{},toast:m=>{if(m!=='Updated')throw new Error(m)}});
 button.onclick();
};
tap('grocery','invite-picker','',{'[data-picker-name]':'Nina Das','[data-picker-mobile]':'9876501666'});
const nina=ui.pickerStaff.at(-1);
tap('picker','select-picker','',{'[data-picker-account]':nina.id});
tap('picker','accept-picker','');assert.equal(nina.status,'active');
const uiOrder=PO.placeOrder(ui,{productId:'PRD-103',qty:1,address:'Delhi',method:'cod'}).order;
tap('grocery','accept',uiOrder.id);
tap('grocery','assign-picker',uiOrder.id,{[`[data-picker-assignment="${uiOrder.id}"]`]:nina.id});
assert.equal(uiOrder.pickerId,nina.id);
tap('picker','pick-start',uiOrder.id);tap('picker','pick-check',uiOrder.id,{},'PRD-103');tap('picker','pick-complete',uiOrder.id);
tap('grocery','pack',uiOrder.id,{[`[data-bags="${uiOrder.id}"]`]:'1'});
assert.equal(uiOrder.status,'ready_for_pickup');
assert.ok(saved>=6);
console.log(JSON.stringify({status:'PASS',suite:'Grocery staff invitation, store isolation, assignment, reassignment, revoked access, self-pick, delivery and targeted alerts'}));
