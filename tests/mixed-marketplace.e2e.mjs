import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as Shop from '../js/product-orders.js';
import * as Commerce from '../js/commerce.js';
import * as Inventory from '../js/grocery-inventory.js';
import {ROLE_CONFIG} from '../js/config.js';
import {PRODUCTS} from '../js/products.js';

assert.ok(PRODUCTS.seller.roles.includes('electrical')&&PRODUCTS.seller.roles.includes('fashion'));
assert.ok(ROLE_CONFIG.electrical.nav.some(([id])=>id==='shopCatalog'));
assert.match(Inventory.catalogScreen(structuredClone(SEED),'fashion'),/Fashion &amp; clothing/);
assert.doesNotMatch(Inventory.catalogScreen(structuredClone(SEED),'fashion'),/<option value="Rice, grains &amp; cereals"/);
const inventory=structuredClone(SEED);
assert.match(Inventory.saveProduct(inventory,'fashion',null,{name:'New Rice',size:'1 kg',category:'Rice, grains & cereals',vegStatus:'vegetarian',price:100,quantity:2,lowStockAt:1}),/approved/);
assert.equal(Inventory.saveProduct(inventory,'fashion',null,{name:'Linen Shirt',size:'L',category:'Fashion & clothing',vegStatus:'not_applicable',price:899,quantity:2,lowStockAt:1,status:'active'}),'');
assert.match(Shop.searchScreen(inventory),/Linen Shirt/);

for(const method of ['upi','cod']){
 const s=structuredClone(SEED);
 for(const id of ['PRD-101','PRD-201','PRD-301'])assert.equal(Shop.addToCart(s,id),'');
 assert.match(Shop.cartScreen(s),/Sharma Electricals/);
 assert.match(Shop.checkoutScreen({...s,checkoutFromCart:true}),/City Fashion · separate package/);
 assert.match(Shop.placeOrder(s,{fromCart:true,fulfilment:'pickup',method:'upi',vpa:'test@okaxis'}).error,/one seller/);
 const r=Shop.placeOrder(s,{fromCart:true,fulfilment:'delivery',address:'42 MG Road, Delhi 110001',method,vpa:'test@okaxis'});
 assert.equal(r.ok,true,r.error);assert.equal(r.orders.length,3);assert.equal(r.total,1669);
 assert.equal(r.orders.reduce((n,o)=>n+o.total,0),r.total);
 assert.deepEqual(r.orders.map(o=>o.total),[710,160,799]);
 assert.equal(new Set(r.orders.map(o=>o.checkoutId)).size,1);
 assert.equal(s.productCart.length,0);
 assert.equal(Commerce.visibleOrders(s,'electrical').length,1);
 assert.equal(Commerce.visibleOrders(s,'fashion').length,1);
 assert.equal(Commerce.visibleOrders(s,'grocery').filter(o=>o.checkoutId===r.checkoutId).length,1);
 assert.ok(!Commerce.visibleOrders(s,'electrical').some(o=>o.party==='store:city-fashion'));
 for(const ws of ['grocery','electrical','fashion']){
  const o=Commerce.visibleOrders(s,ws)[0];
  assert.equal(Commerce.sellerAction(s,ws,o.id,'accept'),'');
  if(ws!=='grocery')assert.ok(!o.pickerId);
  // The grocery seller can pick in store; the other sellers check their own packages.
  assert.equal(Commerce.pickerAction(s,ws,o.id,'start'),'');
  for(const item of o.items)assert.equal(Commerce.pickerAction(s,ws,o.id,'check',item.productId),'');
  assert.equal(Commerce.pickerAction(s,ws,o.id,'complete'),'');
  assert.equal(Commerce.sellerAction(s,ws,o.id,'pack'),'');
  assert.equal(o.status,'ready_for_pickup');
  assert.equal(Commerce.deliveryAction(s,'deliveryPartner',o.id,'accept'),'');
  assert.equal(Commerce.deliveryAction(s,'deliveryPartner',o.id,'pickup',o.pickupCode,o.bagCount),'');
  s.selectedTrackingOrderId=o.id;assert.match(Shop.trackingScreen(s),/Courier collected/);
  assert.equal(Commerce.deliveryAction(s,'deliveryPartner',o.id,'deliver',o.deliveryCode),'');
  assert.equal(o.status,'delivered');assert.equal(Inventory.available(s.products.find(p=>p.id===o.items[0].productId)),ws==='grocery'?19:ws==='electrical'?23:11);
  if(method==='cod')assert.equal(o.codCash.amount,o.total);
  assert.match(Shop.ordersScreen(s),new RegExp(o.id));
 }
 assert.equal(r.orders.reduce((n,o)=>n+o.total,0),r.total);
 assert.equal(s.ledger.filter(e=>e.checkoutId===r.checkoutId&&e.type==='customer_payment').length,method==='upi'?3:0);
}
console.log('PASS mixed grocery, electrical, clothing checkout; three sellers; separate pickup, tracking, delivery and COD totals');
