import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as Voice from '../js/grocery-voice.js';
import * as Inventory from '../js/grocery-inventory.js';
import * as Orders from '../js/product-orders.js';
import * as Commerce from '../js/commerce.js';
import * as PickerPay from '../js/grocery-picker-pay.js';
import * as Staff from '../js/grocery-staff.js';

const s=structuredClone(SEED),ok=result=>assert.equal(result,'');
assert.match(Orders.searchScreen(s),/Order by voice/);
assert.match(Commerce.screen(s,'shopCatalog','grocery'),/Add or update by voice/);
assert.match(Commerce.screen(s,'shopCounter','grocery'),/Walk-in order by voice/);
const draft=Voice.productDraft('Add Amul Milk 1 litre at ₹70 stock 20 low-stock alert 5');
assert.equal(draft.name,'Amul Milk');assert.equal(draft.size,'1 litre');assert.equal(draft.price,'70');
const demo=structuredClone(SEED);demo.currentWorkspace='grocery';let saved=0;
function click(action,values={}){const button={dataset:{commerce:action}},root={querySelectorAll:sel=>sel==='[data-commerce]'?[button]:[],querySelector:sel=>sel in values?{value:values[sel]}:null};Commerce.bind(root,{getState:()=>demo,save:()=>saved++,render:()=>{},toast:message=>{if(message!=='Updated')throw Error(message)}});button.onclick();}
click('voice-product-parse',{'[data-voice-product-text]':'Add Amul Milk 1 litre at ₹70 stock 20 low-stock alert 5'});
assert.equal(demo.voiceCatalogDraft.grocery.name,'Amul Milk');
click('voice-counter-parse',{'[data-voice-counter-text]':'Two Tata Salt'});
assert.equal(demo.voiceCounterDraft.grocery.lines[0].quantity,2);assert.equal(demo.counterCarts.grocery.length,0);assert.equal(saved,2);
assert.match(Inventory.saveProduct(s,'grocery',null,{...draft,category:'Dairy & paneer',vegStatus:'',status:'active'}),/vegetarian/);
ok(Inventory.saveProduct(s,'grocery',null,{...draft,category:'Dairy & paneer',subcategory:'Milk',vegStatus:'vegetarian',status:'active'}));
const milk=s.products.at(-1);assert.match(Inventory.saveProduct(s,'grocery',null,{...draft,category:'Dairy & paneer',vegStatus:'vegetarian',status:'active'}),/already exist/);
assert.match(Inventory.saveProduct(s,'grocery',null,{...draft,name:'Eggs',category:'Dairy & paneer',vegStatus:'vegetarian',status:'active'}),/excludes/);
assert.match(Inventory.saveProduct(s,'grocery',null,{...draft,category:'Frozen Foods',vegStatus:'vegetarian',status:'active'}),/category/);
const update=Voice.productUpdateDraft('Change Tata Salt price to 30',s.products);assert.equal(update.productId,'PRD-103');assert.equal(update.value,30);
ok(Inventory.saveProduct(s,'grocery',update.productId,{...s.products.find(p=>p.id===update.productId),price:update.value}));
assert.equal(s.products.find(p=>p.id==='PRD-103').price,30);
const stock=Voice.productUpdateDraft('Add Tata Salt stock by 10',s.products);assert.equal(stock.productId,'PRD-103');ok(Inventory.adjustStock(s,'grocery',stock.productId,stock.value,'Received'));

const spoken=Voice.orderDraft('Two Tata Salt and one rice',s.products.filter(Inventory.published));
assert.equal(spoken.lines.length,2);assert.equal(spoken.lines[0].productId,'PRD-103');assert.equal(spoken.lines[1].productId,'');assert.ok(spoken.lines[1].options.length>=2,'rice pack sizes offered as options');
const hindi=Voice.orderDraft('दो नमक और एक चावल',s.products.filter(Inventory.published));assert.equal(hindi.lines[0].productId,'PRD-103');assert.equal(hindi.lines[0].quantity,2);assert.ok(hindi.lines[1].options.length>=2);
ok(Orders.addToCart(s,spoken.lines[0].productId,2));ok(Orders.addToCart(s,'PRD-101',1));
const {order,error}=Orders.placeOrder(s,{fromCart:true,address:'Flat 402, Noida',method:'cod'});assert.equal(error,undefined);assert.equal(order.items.length,2);
assert.match(Commerce.screen(s,'shopOrders','grocery'),/offer to an on-shift worker/);
ok(Commerce.sellerAction(s,'grocery',order.id,'accept'));assert.equal(order.pickerId,null);
assert.ok(s.notifications.some(n=>n.to==='grocery'&&/no on-shift worker/.test(n.text)));

// Only an open shift at this store makes a picker eligible for automatic offers.
ok(PickerPay.startPickerShift(s,'picker'));
s.pickerStaff.push({id:'PICK-NEW',store:'grocery',name:'Priya',status:'active',joinedAt:'2026-10-03',payPlan:{type:'daily',rate:500}});
s.activePicker.picker='PICK-NEW';ok(PickerPay.startPickerShift(s,'picker'));s.activePicker.picker='PICK-001';
const second=Orders.placeOrder(s,{productId:milk.id,qty:1,address:'Noida',method:'cod'}).order;
ok(Commerce.sellerAction(s,'grocery',second.id,'accept'));assert.equal(second.pickerId,'PICK-001');
assert.equal(second.pickerOffer.status,'offered');
assert.match(Commerce.pickerAction(s,'picker',second.id,'start'),/Accept this pick offer/);
ok(Staff.respondPickOffer(s,'picker',second.id,false));assert.equal(second.pickerId,'PICK-NEW');
s.activePicker.picker='PICK-NEW';ok(Staff.respondPickOffer(s,'picker',second.id,true));ok(Commerce.pickerAction(s,'picker',second.id,'start'));
ok(Commerce.pickerAction(s,'picker',second.id,'check',milk.id));ok(Commerce.pickerAction(s,'picker',second.id,'complete'));
ok(Commerce.sellerAction(s,'grocery',second.id,'pack',1));ok(Commerce.deliveryAction(s,'deliveryPartner',second.id,'accept'));
ok(Commerce.deliveryAction(s,'deliveryPartner',second.id,'pickup',second.pickupCode,1));
ok(Commerce.deliveryAction(s,'deliveryPartner',second.id,'deliver',second.deliveryCode));assert.equal(second.status,'delivered');
assert.match(Orders.trackingScreen({...s,selectedTrackingOrderId:second.id}),/Delivered/);
assert.match(Commerce.screen(s,'commerceOrders','admin'),new RegExp(second.id));
ok(Staff.autoAssignPicker(s,'grocery',order.id));assert.equal(order.pickerId,'PICK-001');order.pickerOffer.expiresAt=Date.now()-1;
s.activePicker.picker='PICK-001';assert.match(Staff.respondPickOffer(s,'picker',order.id,true),/expired/);
ok(Staff.reofferExpiredPick(s,'groceryManager',order.id));assert.equal(order.pickerId,'PICK-NEW');
s.activePicker.picker='PICK-NEW';ok(Staff.setPickerBreak(s,'picker',true));assert.equal(Staff.availablePickers(s,'grocery').some(p=>p.id==='PICK-NEW'),false);
ok(Staff.setPickerBreak(s,'picker',false));

// A voice-created counter list only changes the counter cart after explicit review.
const walkIn=Voice.orderDraft('Two Tata Salt and one Amul Milk',Inventory.forStore(s,'grocery').filter(Inventory.published));
assert.equal(walkIn.lines.length,2);assert.equal((s.counterCarts.grocery||[]).length,0);
for(const line of walkIn.lines)ok(Inventory.addCounterItem(s,'grocery',line.productId,line.quantity));
assert.equal(Inventory.counterLines(s,'grocery').length,2);
console.log(JSON.stringify({status:'PASS',suite:'Voice drafts, strict catalogue, dynamic picker offer and customer-to-delivery',order:second.id,picker:'Priya',counterLines:2}));
