import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as Shop from '../js/product-orders.js';
import * as Commerce from '../js/commerce.js';
const s=structuredClone(SEED),ok=v=>assert.equal(v,'');
for(const id of ['PRD-102','PRD-201','PRD-104'])ok(Shop.addToCart(s,id));
const html=Shop.cartScreen(s);
for(const [seller,amount] of [['Fresh Mart','₹525'],['Sharma Electricals','₹160'],['ABC Grocery','₹650']]){
 const start=html.indexOf(`class="panel seller-cart-card" aria-label="Package `+(['Fresh Mart','Sharma Electricals','ABC Grocery'].indexOf(seller)+1)+` from ${seller}"`);
 assert.ok(start>=0,`Missing seller card ${seller}`);
 const end=html.indexOf('</section>',start),card=html.slice(start,end);
 assert.match(card,new RegExp(amount));
 assert.match(card,/data-po-cart-qty/);
}
assert.match(html,/Delivery \(3 packages\).*?₹80/s);
assert.match(html,/Continue to payment · ₹1,335/);
assert.equal((html.match(/seller-cart-card/g)||[]).length,3);
const checkout=Shop.checkoutScreen({...s,checkoutFromCart:true});
for(const [seller,amount] of [['Fresh Mart','₹525'],['Sharma Electricals','₹160'],['ABC Grocery','₹650']]){
 assert.match(checkout,new RegExp(`Package \\d · ${seller}[\\s\\S]*?Package total<\\/span><strong>${amount}`));
}
assert.match(checkout,/Pay once · 3 seller packages.*?₹1,335/s);
const r=Shop.placeOrder(s,{fromCart:true,address:'Sector 62, Noida',method:'upi',vpa:'test@okaxis'});
assert.equal(r.ok,true,r.error);assert.equal(r.total,1335);assert.equal(r.orders.length,3);
assert.equal(r.orders.reduce((sum,o)=>sum+o.total,0),1335);
assert.equal(new Set(r.orders.map(o=>o.checkoutId)).size,1);
const orders=Shop.ordersScreen(s);
assert.match(orders,/Order placed · 3 seller packages/);
assert.match(orders,/Checkout .* · ₹1,335 total/);
for(const [n,o] of r.orders.entries()){
 assert.match(orders,new RegExp(`Package ${n+1} of 3 · ${o.fulfilmentPartner}`));
 s.selectedTrackingOrderId=o.id;
 assert.match(Shop.trackingScreen(s),new RegExp(`Package ${n+1} of 3 · ${o.fulfilmentPartner}`));
 const store=Object.keys(s.shopPartners).find(k=>s.shopPartners[k].name===o.fulfilmentPartner);
 assert.ok(Commerce.visibleOrders(s,store).some(x=>x.id===o.id));
 for(const other of Object.keys(s.shopPartners).filter(k=>k!==store))assert.ok(!Commerce.visibleOrders(s,other).some(x=>x.id===o.id));
}
// Quantity and removal recalculate the package fee and the combined total.
const changed=structuredClone(SEED);for(const id of ['PRD-102','PRD-201','PRD-104'])ok(Shop.addToCart(changed,id));
ok(Shop.updateCart(changed,'PRD-102',0));
assert.equal(Shop.quote(Shop.cartLines(changed).map(i=>({price:i.product.price,quantity:i.quantity,fulfilmentPartner:i.product.fulfilmentPartner}))).total,810);
assert.doesNotMatch(Shop.cartScreen(changed),/Package 1 of 3/);
console.log('PASS grouped seller cards, package totals, one checkout, separate tracking and seller isolation');
