import assert from 'node:assert/strict';
import * as O from '../js/product-orders.js';
import * as C from '../js/commerce.js';
import * as X from '../js/commerce-plus.js';
import * as P from '../js/pay.js';
import * as R from '../js/ops-rules.js';
import {SEED} from '../js/mock-data.js';
const fresh=()=>{const s=structuredClone(SEED);s.person={id:'P1',name:'S'};X.ensurePlus(s);return s};
let s=fresh();
// cancel one item before packing → refund; cannot cancel the only item
s.productCart=[{productId:'PRD-101',quantity:1},{productId:'PRD-103',quantity:2}];
let r=O.placeOrder(s,{fromCart:true,address:'Flat 4',method:'upi',vpa:'a@okaxis',billing:{name:'S'}});let o=(r.orders||[r.order]).find(x=>x.items.length===2);
const before=o.total;assert.equal(X.cancelItem(s,o,'PRD-103'),'');assert.equal(o.total,before-56);assert.ok(s.ledger.some(x=>x.orderId===o.id&&x.type==='refund'&&x.amount===56));
assert.match(X.cancelItem(s,o,'PRD-101'),/only item/);
// stock-outs counted; admin alerted at 3
const p=s.shopPartners.grocery;for(let i=0;i<3;i++)X.noteStockout(s,{fulfilmentPartner:p.name});assert.equal(p.stockouts.length,3);assert.ok(s.notifications.some(n=>/3 items unavailable/.test(n.text)));
// coupon expiry, budget, per-customer
s.customerOrders=[];s.coupons.push({code:'OLD10',type:'flat',value:10,min:0,fundedBy:'platform',expires:'2000-01-01',active:true},{code:'ONCE5',type:'flat',value:5,min:0,fundedBy:'platform',perCustomer:1,active:true},{code:'TINY',type:'flat',value:50,min:0,fundedBy:'platform',budget:50,active:true});
const lines=[{productId:'PRD-101',quantity:1,product:s.products.find(x=>x.id==='PRD-101')}];
assert.match(X.couponDiscount(s,'OLD10',lines).error,/expired/);
s.couponUses.push({code:'ONCE5',discount:5},{code:'TINY',discount:50});
assert.match(X.couponDiscount(s,'ONCE5',lines).error,/already used/);assert.match(X.couponDiscount(s,'TINY',lines).error,/budget/);
// peak bonus and daily target bonus
X.settings(s).peakStart='00:00';X.settings(s).peakEnd='23:59';const base={deliveryKm:3,tip:0};assert.equal(X.deliveryPay(s,base),Math.max(30,Math.round(20+24))+10);
X.settings(s).dailyTarget=1;s=s;const d=Object.values(s.deliveryPartners)[0];const od={id:'ORDX',deliveryAssignment:{partnerId:d.id},status:'delivered',deliveredAt:Date.now(),items:[]};s.customerOrders.push(od);X.onDelivered(s,od);
assert.ok(s.ledger.some(x=>x.type==='delivery_incentive'&&x.amount===100));
// statements render
s.customerOrders.push({...o});assert.match(X.sellerStatementHtml(s,'ABC Grocery'),/Payout statement/);assert.match(X.customerStatementScreen(s),/Monthly statement/);
// cash driver job: booking fee owed by driver
s=fresh();const rq={id:'SR-T',customer:'personal',type:'driver',provider:'personalDriver',quote:R.quoteDriver({hireType:'daily'}),extras:[],status:'completed'};s.serviceRequests.unshift(rq);
P.payBalance(s,rq,{method:'cash'});assert.ok(s.ledger.some(x=>x.reference==='FEE-CASH-SR-T'&&x.amount===58));assert.equal(P.wallet(s,'personalDriver').balance,-58);
console.log(JSON.stringify({status:'PASS',suite:'Phase 1–2: settlement, cash fee, item cancel, stock-outs, coupons, incentives, statements'},null,2));
