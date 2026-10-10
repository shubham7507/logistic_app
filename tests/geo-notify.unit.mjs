import assert from 'node:assert/strict';
import * as O from '../js/product-orders.js';
import * as C from '../js/commerce.js';
import * as G from '../js/geo.js';
import * as N from '../js/notify-center.js';
import * as X from '../js/commerce-plus.js';
import {SEED} from '../js/mock-data.js';
const fresh=()=>{const s=structuredClone(SEED);s.person={id:'P1',name:'Shubham'};X.ensurePlus(s);G.ensureGeo(s);return s};
let s=fresh();
// distances and delivery radius
assert.ok(Math.abs(G.km([28.6519,77.1909],[28.6315,77.2167])-3.4)<0.5);
assert.match(O.placeOrder(s,{productId:'PRD-103',qty:1,address:'X',method:'upi',vpa:'a@okaxis',billing:{name:'S'},geoArea:'Sector 62, Noida'}).error,/delivers up to 12 km/);
let r=O.placeOrder(s,{productId:'PRD-103',qty:1,address:'X',method:'upi',vpa:'a@okaxis',billing:{name:'S'},geoArea:'Connaught Place, Delhi'});let o=r.order;
assert.ok(o.dest&&o.origin);assert.ok(o.deliveryKm>2&&o.deliveryKm<8,'road distance from coordinates');assert.equal(o.feeBreakdown.deliveryPartnerEarning,X.deliveryPay(s,o));
// courier: offered → accepted → drive to store (auto arrival) → pickup → drive to customer (arriving, arrived) → deliver
o.status='ready_for_pickup';o.bagCount=1;C.autoOffer(s,o);const ws=Object.keys(s.deliveryPartners).find(k=>s.deliveryPartners[k].id===o.deliveryAssignment.partnerId);
assert.equal(C.deliveryAction(s,ws,o.id,'accept'),'');
o.geo.everStarted=true; // The courier explicitly started location sharing before driving.
G.demoStep(s,o,0.05);assert.equal(o.geo.live,true);assert.equal(o.geo.phase,'to_store');
assert.match(C.deliveryAction(s,ws,o.id,'pickup',o.pickupCode,1),/from the store/,'pickup blocked away from the store');
for(let i=0;i<60&&!o.geo.arrivedStoreAt;i++)G.demoStep(s,o);assert.ok(o.geo.arrivedStoreAt,'auto arrived at store');
assert.ok(s.notifications.some(n=>/arrived at the store/.test(n.text)));
assert.equal(C.deliveryAction(s,ws,o.id,'pickup',o.pickupCode,1),'');assert.equal(o.status,'out_for_delivery');
G.demoStep(s,o,0.3);assert.match(C.deliveryAction(s,ws,o.id,'issue','Customer unavailable'),/from the customer/,'cannot fake a failed attempt far away');
const eta1=G.etaMin(s,o);for(let i=0;i<60&&!o.geo.arrivedDoorAt;i++)G.demoStep(s,o);assert.ok(o.geo.arrivingAt&&o.geo.arrivedDoorAt);assert.ok(G.etaMin(s,o)<=eta1);
assert.equal(C.deliveryAction(s,ws,o.id,'deliver',o.deliveryCode),'');assert.equal(o.geo.live,false,'tracking stops on delivery');assert.ok(o.deliveredLocation&&o.actualKm>0);
assert.match(G.recordPosition(s,o,28.6,77.2),/only on during an active delivery/);
assert.match(G.trackPanel(s,o),/Delivered/);
// notification centre
s=fresh();r=O.placeOrder(s,{productId:'PRD-103',qty:1,address:'X',method:'upi',vpa:'a@okaxis',billing:{name:'S'}});o=r.order;
const html=N.screen({...s,currentWorkspace:'personal'});assert.match(html,/Active \(/);assert.match(html,/Past orders/);assert.match(html,/Track/);
o.status='delivered';o.deliveredAt=Date.now();assert.ok(N.actions(s,'personal').some(a=>/Rate/.test(a.text)),'rate action pinned');
assert.ok(N.actions(s,'grocery').length>=0);
for(let i=0;i<4;i++)s.notifications.unshift({id:'n'+i,to:'personal',text:`ORD-X1: step ${i}`,ref:'ORD-X1',read:false});
const unread=s.notifications.filter(n=>n.to==='personal'&&!n.read);assert.ok(N.badge(s,unread,'personal')<unread.length,'one badge per order, not per event');
assert.match(N.screen({...s,currentWorkspace:'admin'}),/Notifications/);
console.log(JSON.stringify({status:'PASS',suite:'GPS tracking + notification centre'},null,2));
