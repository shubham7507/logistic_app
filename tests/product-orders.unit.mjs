import assert from 'node:assert/strict';
import * as O from '../js/product-orders.js';
import * as P from '../js/pay.js';
import {SEED} from '../js/mock-data.js';
const S=()=>JSON.parse(JSON.stringify(SEED));
let s=S();const p=s.products[1];
assert.deepEqual(O.quote(p,1),{items:485,delivery:40,total:525});assert.equal(O.quote(p,2).delivery,0,'free delivery above ₹499');
assert.match(O.placeOrder(s,{productId:p.id,qty:1,address:'',method:'upi',vpa:'a@okaxis'}).error,/address/);
assert.match(O.placeOrder(s,{productId:p.id,qty:1,address:'X',method:'upi',vpa:'fail@upi'}).error,/declined/);
let r=O.placeOrder(s,{productId:p.id,qty:2,address:'X',method:'upi',vpa:'a@okaxis'});assert.equal(r.order.status,'paid');
const pay=s.ledger.find(x=>x.orderId===r.order.id);assert.equal(pay.status,'held');
// deliver → released to store minus 8%
for(let i=0;i<4;i++)O.advanceOrder(s,r.order);assert.equal(r.order.status,'delivered');assert.equal(pay.status,'released');
assert.equal(P.wallet(s,r.order.party).balance,970-Math.round(970*0.08));
// return within 7 days → store wallet reversed, customer refund started
assert.match(O.returnOrder(s,r.order,''),/why/);assert.equal(O.returnOrder(s,r.order,'Damaged pack'),'');O.completeReturn(s,r.order);
assert.equal(r.order.status,'returned');assert.equal(P.wallet(s,r.order.party).balance,0);assert.ok(s.ledger.some(x=>x.orderId===r.order.id&&x.type==='refund'&&x.amount===970));
// cancel before dispatch → full refund; not after dispatch
s=S();r=O.placeOrder(s,{productId:p.id,qty:1,address:'X',method:'card',card:'4111111111111111'});assert.equal(O.cancelOrder(s,r.order),'');assert.equal(s.ledger.find(x=>x.orderId===r.order.id&&x.type==='refund').amount,525);
r=O.placeOrder(s,{productId:p.id,qty:1,address:'X',method:'upi',vpa:'a@okaxis'});O.advanceOrder(s,r.order);O.advanceOrder(s,r.order);O.advanceOrder(s,r.order);assert.match(O.cancelOrder(s,r.order),/left the store/);
// cash on delivery: limit, then commission as wallet debt
s=S();assert.match(O.placeOrder(s,{productId:s.products[0].id,qty:10,address:'X',method:'cod'}).error||'',/up to/);
r=O.placeOrder(s,{productId:p.id,qty:1,address:'X',method:'cod'});assert.equal(r.order.status,'confirmed');for(let i=0;i<4;i++)O.advanceOrder(s,r.order);
assert.equal(P.wallet(s,r.order.party).balance,-Math.round(525*0.08));
// pending payment
s=S();r=O.placeOrder(s,{productId:p.id,qty:1,address:'X',method:'upi',vpa:'pendingfail@upi'});assert.equal(r.order.status,'payment_pending');O.checkPayment(s,r.order);assert.equal(r.order.status,'cancelled');
console.log(JSON.stringify({status:'PASS',suite:'Product orders with MoveAI Pay'},null,2));
