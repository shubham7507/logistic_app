import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SEED} from '../js/mock-data.js';
import * as Shop from '../js/product-orders.js';
import {canOpen} from '../js/permissions.js';

const s=structuredClone(SEED),add={dataset:{poAdd:'PRD-101'}},detail={dataset:{poDetail:'PRD-101'}};
let route='',saved=0;
const root={
 querySelector(sel){return sel==='[data-po-detail-qty]'?{value:'2'}:null},
 querySelectorAll(sel){return sel==='[data-po-add]'?[add]:sel==='[data-po-detail]'?[detail]:[]}
};
const api={getState:()=>s,save:()=>saved++,render:()=>{},navigate:r=>route=r,toast:m=>{throw new Error(m)}};
Shop.bindOrders(root,api);
detail.onclick();assert.equal(route,'productDetail');assert.equal(s.selectedProductId,'PRD-101');
assert.match(Shop.productDetailScreen(s),/Quantity/);
add.onclick();assert.equal(route,'cartAdded');assert.deepEqual(s.productCart,[{productId:'PRD-101',quantity:2,priceAtAdd:710}]);
assert.match(Shop.cartAddedScreen(s),/Go to cart/);
assert.match(Shop.cartScreen(s),/₹1,420/);
assert.match(Shop.searchScreen(s),/shop-cart-link/);
assert.match(Shop.searchScreen(s),/Cart <b>2<\/b>/);
assert.ok(saved>=2);
const quick={dataset:{poAdd:'PRD-103'}},quickRoot={querySelector:()=>null,querySelectorAll:sel=>sel==='[data-po-add]'?[quick]:[]};
Shop.bindOrders(quickRoot,api);quick.onclick();
assert.equal(route,'cartAdded');assert.equal(s.productCart.find(x=>x.productId==='PRD-103').quantity,1);
assert.match(Shop.cartAddedScreen(s),/3 items in cart/);
assert.match(Shop.addToCart(s,'PRD-101',9),/Maximum 10/);
assert.equal(canOpen('personal','productDetail'),true);
assert.equal(canOpen('personal','cartAdded'),true);
assert.equal(canOpen('grocery','cartAdded'),false);
s.checkoutFromCart=true;
for(const step of ['1 · Fulfilment','2 · Payment method','3 · Review seller packages and total'])assert.ok(Shop.checkoutScreen(s).includes(step));
const mobileCss=fs.readFileSync(new URL('../css/marketplace.css',import.meta.url),'utf8');
assert.match(mobileCss,/\.shop-toolbar/);
console.log(JSON.stringify({status:'PASS',suite:'Product detail → add button → visible cart confirmation → basket → checkout'}));
