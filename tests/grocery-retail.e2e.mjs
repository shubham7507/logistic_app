import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {canOpen} from '../js/permissions.js';
import * as I from '../js/grocery-inventory.js';
import * as O from '../js/product-orders.js';
import * as C from '../js/commerce.js';
import * as Staff from '../js/grocery-staff.js';
const s=structuredClone(SEED),ok=x=>assert.equal(x,'');
for(const [role,route] of [['grocery','shopCounter'],['groceryManager','shopCatalog'],['groceryManager','shopSales'],['picker','pickTasks'],['admin','commercePartners']])assert.ok(canOpen(role,route));
assert.equal(canOpen('picker','shopCatalog'),false);
assert.equal(canOpen('groceryManager','shopEarnings'),false);
assert.match(C.screen(s,'shopCatalog','grocery'),/Add product/);
assert.match(C.screen(s,'shopCounter','groceryManager'),/In-store sale/);
assert.match(C.screen(s,'shopCounterDelivery','grocery'),/Counter delivery order/);
ok(I.saveProduct(s,'grocery',null,{name:'Draft Tomato',size:'1 kg',category:'Vegetables',price:60,quantity:4,lowStockAt:2,status:'draft'}));const draft=s.products.at(-1);assert.doesNotMatch(O.searchScreen(s),/Draft Tomato/);assert.match(C.screen(s,'shopCatalog','grocery'),/Publish/);ok(I.setAvailability(s,'grocery',draft.id,'active'));assert.match(O.searchScreen(s),/Draft Tomato/);
const spec={name:'Demo Milk',size:'1 litre',category:'Dairy',brand:'Farm',description:'Chilled milk',price:65,quantity:10,lowStockAt:3,status:'active'};
assert.match(I.saveProduct(s,'groceryManager',null,spec),/owner access/);
ok(I.saveProduct(s,'grocery',null,spec));const p=s.products.at(-1);assert.match(O.searchScreen(s),/Demo Milk/);
assert.match(I.saveProduct(s,'groceryFresh',p.id,{...spec,price:70}),/another store/);
ok(O.addToCart(s,p.id,2));
ok(I.saveProduct(s,'grocery',p.id,{...spec,price:70}));
assert.match(O.cartScreen(s),/Prices changed/);
assert.match(O.placeOrder(s,{fromCart:true,address:'Noida',method:'cod'}).error,/price changed/);assert.equal(p.reserved,0);
s.productCart[0].priceAtAdd=70;
const pickup=O.placeOrder(s,{fromCart:true,fulfilment:'pickup',method:'upi',vpa:'test@okaxis'}).order;
assert.equal(pickup.deliveryFee,0);assert.equal(pickup.total,140);assert.equal(p.reserved,2);assert.equal(I.available(p),8);
assert.match(O.ordersScreen(s),/Store pickup/);
ok(C.sellerAction(s,'groceryManager',pickup.id,'accept'));
ok(Staff.assignPicker(s,'groceryManager',pickup.id,'PICK-001'));
ok(C.pickerAction(s,'picker',pickup.id,'start'));
ok(C.pickerAction(s,'picker',pickup.id,'check',p.id));
ok(C.pickerAction(s,'picker',pickup.id,'complete'));
ok(C.sellerAction(s,'groceryManager',pickup.id,'pack',1));
assert.equal(pickup.deliveryAssignment,null);assert.match(O.trackingScreen({...s,selectedTrackingOrderId:pickup.id}),/Pickup code/);
assert.match(C.collectStorePickup(s,'groceryManager',pickup.id,'0000'),/pickup code/);
ok(C.collectStorePickup(s,'groceryManager',pickup.id,pickup.pickupCode));
assert.equal(pickup.status,'collected');assert.equal(p.quantity,8);assert.equal(p.reserved,0);
assert.match(O.ordersScreen(s),/Collected|collected/);
assert.match(C.requestReturn(s,pickup.id,'Wrong item'),/^$/);
ok(C.resolveReturn(s,pickup.id,true));ok(C.recordOnlineReturnCondition(s,'grocery',pickup.id,'sellable'));assert.equal(p.quantity,10);
assert.match(C.recordOnlineReturnCondition(s,'grocery',pickup.id,'sellable'),/unavailable/);

// A walk-in sale consumes the same store stock and can record a full return.
ok(I.addCounterItem(s,'groceryManager',p.id,3));assert.equal(I.available(p),10); // cart does not commit yet
const sale=I.completeCounterSale(s,'groceryManager','cash','Walk-in',0,'').sale;assert.equal(sale.total,210);assert.equal(p.quantity,7);
assert.match(I.retailReport(s,'grocery'),/Counter receipts/);
assert.match(C.screen(s,'commercePayments','admin'),new RegExp(sale.id));
assert.match(I.returnCounterSale(s,'groceryFreshManager',sale.id,'sellable'),/not found/);
ok(I.returnCounterSale(s,'groceryManager',sale.id,'damaged'));assert.equal(p.quantity,7);
assert.match(I.returnCounterSale(s,'groceryManager',sale.id,'sellable'),/not found/);

// Online reservations beat a later counter sale, then release on cancellation.
const order=O.placeOrder(s,{productId:p.id,qty:4,address:'Delhi',method:'cod'}).order;assert.equal(p.reserved,4);assert.equal(I.available(p),3);
assert.match(I.addCounterItem(s,'grocery',p.id,4),/Only 3/);
assert.match(I.adjustStock(s,'grocery',p.id,-4,'Damaged'),/committed/);
ok(C.customerCancel(s,order.id));assert.equal(p.reserved,0);assert.equal(I.available(p),7);
ok(I.adjustStock(s,'groceryManager',p.id,-5,'Expired'));assert.equal(p.quantity,2);assert.ok(I.low(p));assert.ok(s.notifications.some(n=>n.to==='grocery'&&n.ref===p.id&&/only 2 available/.test(n.text)));assert.ok(s.notifications.some(n=>n.to==='groceryManager'&&n.ref===p.id));
assert.match(C.screen(s,'shopCatalog','groceryManager'),/Needs attention/);
assert.match(C.screen(s,'commercePartners','admin'),/low stock/);
ok(I.adjustStock(s,'grocery',p.id,10,'Received'));assert.equal(I.available(p),12);
ok(I.saveProduct(s,'grocery',p.id,{...spec,price:70,quantity:0})); // owner can set zero after reservations clear
assert.equal(I.available(p),0);
assert.match(I.setAvailability(s,'picker',p.id,'paused'),/permission/);

// Counter-created delivery runs through existing picker and courier workflow.
const delivery=C.createCounterDelivery(s,'groceryManager','PRD-101',2,'Noida Sector 62','Counter Customer').order;
assert.equal(delivery.cod,true);assert.equal(delivery.channel,'counter_delivery');assert.doesNotMatch(O.ordersScreen(s),new RegExp(delivery.id));
const linked=C.createCounterDelivery(s,'grocery','PRD-103',1,'Delhi','Shubham Kumar',true).order;assert.match(O.ordersScreen(s),new RegExp(linked.id));ok(C.customerCancel(s,linked.id));
ok(C.sellerAction(s,'groceryManager',delivery.id,'accept'));
ok(Staff.assignPicker(s,'groceryManager',delivery.id,'PICK-001'));
ok(C.pickerAction(s,'picker',delivery.id,'start'));
ok(C.pickerAction(s,'picker',delivery.id,'check','PRD-101'));
ok(C.pickerAction(s,'picker',delivery.id,'complete'));
ok(C.sellerAction(s,'groceryManager',delivery.id,'pack',1));
assert.equal(delivery.deliveryAssignment.partnerName,'Ravi Delivery');
ok(C.deliveryAction(s,'deliveryPartner',delivery.id,'accept'));
ok(C.deliveryAction(s,'deliveryPartner',delivery.id,'pickup',delivery.pickupCode,1));
ok(C.deliveryAction(s,'deliveryPartner',delivery.id,'deliver',delivery.deliveryCode));
assert.equal(delivery.status,'delivered');assert.match(C.screen(s,'commerceOrders','admin'),new RegExp(delivery.id));


// Exercise the rendered button wiring as a user would click it.
const ui=structuredClone(SEED);ui.currentWorkspace='grocery';let saved=0,rendered=0;
function click(action,values,id){const button={dataset:{commerce:action,id}},root={querySelectorAll:sel=>sel==='[data-commerce]'?[button]:[],querySelector:sel=>sel in values?{value:values[sel],checked:values[sel]===true}:null};C.bind(root,{getState:()=>ui,save:()=>saved++,render:()=>rendered++,toast:m=>{if(m!=='Updated')throw new Error(m)}});button.onclick()}
click('catalog-add',{'[data-catalog-name]':'Counter Beans','[data-catalog-size]':'500 g','[data-catalog-category]':'Essentials','[data-catalog-price]':'90','[data-catalog-quantity]':'12','[data-catalog-low]':'3'});
const bean=ui.products.at(-1);assert.equal(bean.name,'Counter Beans');
click('counter-add',{'[data-counter-product]':bean.id,'[data-counter-qty]':'2'});
click('counter-complete',{'[data-counter-method]':'cash','[data-counter-discount]':'0'});
assert.equal(ui.counterSales[0].total,180);assert.equal(bean.quantity,10);assert.equal(saved,3);assert.equal(rendered,3);
console.log(JSON.stringify({status:'PASS',suite:'Catalogue, stock, repricing, counter sale/return, store pickup, counter delivery and cross-role access',pickup:pickup.id,sale:sale.id,delivery:delivery.id}));
