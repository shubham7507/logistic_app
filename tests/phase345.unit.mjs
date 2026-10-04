import assert from 'node:assert/strict';
import * as N from '../js/notify-center.js';
import * as G from '../js/geo.js';
import * as X from '../js/commerce-plus.js';
import * as F from '../js/freight.js';
import * as P from '../js/pay.js';
import * as W from '../js/workforce.js';
import * as R from '../js/ops-rules.js';
import {SEED} from '../js/mock-data.js';
const fresh=()=>{const s=structuredClone(SEED);s.person={id:'P1',name:'S'};X.ensurePlus(s);G.ensureGeo(s);G.ensureJobGeo(s);P.ensurePay(s);F.ensureFreight(s);return s};
let s=fresh();
// phase 3: notification centre for business roles, settings, channels
s.trips[0].status='awaiting_assignment';s.trips[0].owner='transporter';assert.ok(N.actions(s,'transporter').some(a=>/vehicle and crew/.test(a.text)));
assert.match(N.screen({...s,currentWorkspace:'transporter'}),/Active \(/);
const p=N.prefs(s,'personal');p.offers.whatsapp=false;p.orders.sms=false;p.quietStart='00:00';p.quietEnd='00:00';
assert.deepEqual(N.channelsFor(s,'personal','ORD-1: Store accepted'),['Push','WhatsApp']);
p.quietStart='00:00';p.quietEnd='23:59';assert.deepEqual(N.channelsFor(s,'personal','ORD-1: Store accepted'),['Push (silent, quiet hours)']);
assert.ok(N.channelsFor(s,'personal','Your order is arriving').length>=1,'urgent alerts still go out in quiet hours');
// phase 4: polygon delivery area, gate note, truck GPS auto milestone + deviation, admin late alert
const abc=s.shopPartners.grocery;abc.area=[[28.66,77.17],[28.66,77.23],[28.61,77.23],[28.61,77.17]];
assert.equal(G.serviceable(s,abc.name,{lat:28.6315,lng:77.2167}).ok,true);assert.equal(G.serviceable(s,abc.name,{lat:28.5677,lng:77.2433}).ok,false);
const o={id:'ORD-G',dest:[28.6315,77.2167],deliveryAssignment:{partnerId:Object.values(s.deliveryPartners)[0].id}};assert.equal(G.saveGateNote(s,o,'Gate 2, Tower B'),'');assert.equal(G.gateNote(s,[28.6315,77.2167]),'Gate 2, Tower B');
const t=s.trips.find(x=>x.id==='TRP-503');t.status='terms_confirmed';(t.milestones||[]).forEach(m=>{if(m.key!=='terms_confirmed')m.status='pending'});
G.jobPosition(s,t,'trip',t.route.from[0]+0.001,t.route.from[1]);assert.ok(t.geo.atPickupAt);assert.equal((t.milestones||[]).find(m=>m.key==='pickup_reached')?.status??'done','done');
G.jobPosition(s,t,'trip',23.0,72.5);assert.ok(t.geo.deviationAlerted,'route deviation flagged');
const late={id:'ORD-L',deliveryAssignment:{status:'accepted',partnerId:'x'},geo:{live:true,lastAt:Date.now()-11*60000},etaMinutes:10,createdAt:Date.now()-60*60000,items:[]};s.customerOrders.push(late);G.alerts(s);
assert.ok(late.geo.lateAlerted&&late.geo.stuckAlerted);assert.ok(s.notifications.filter(n=>n.to==='admin'&&/ORD-L/.test(n.text)).length===2);
// phase 5: service claim → admin approval → wallet refund + partner recovery
const rq={id:'SR-C',customer:'personal',type:'moving',quote:{total:10000},paid:true,status:'closed',extras:[]};s.serviceRequests.unshift(rq);
assert.match(X.raiseServiceClaim(s,rq,{kind:'damage',amount:2000,reason:'TV cracked'}),/photo/);
assert.equal(X.raiseServiceClaim(s,rq,{kind:'damage',amount:2000,reason:'TV cracked',photo:'tv.jpg',refundTo:'wallet'}),'');
const c=s.claims[0];const wb=P.wallet(s,'movers').balance;assert.equal(X.adminDecide(s,c,'approve'),'');assert.equal(c.status,'refunded');assert.equal(s.customerWallet.balance,2000);assert.equal(P.wallet(s,'movers').balance,wb-2000);
// protected freight payment: fund → advance at loading → balance after POD with a disputed deduction held → dispute withdrawn → released
s=fresh();const inv=F.createInvoice(s,{issuer:'transporter',tripId:'TRP-503',billTo:'goods',freight:40000,terms:{type:'advance_balance',advance:10000,creditDays:0}}).inv;
assert.match(F.protectFund(s,inv,'transporter'),/Only the party being billed/);assert.equal(F.protectFund(s,inv,'goods'),'');
const tr=s.trips.find(x=>x.id==='TRP-503');const done=k=>{const m=tr.milestones.find(x=>x.key===k);if(m)m.status='done';else tr.milestones.push({key:k,status:'done'})};
done('loaded');F.ensureFreight(s);assert.equal(inv.protected.advanceReleased,10000);
inv.adjustments.push({id:'A1',kind:'shortage',amount:2000,note:'short',status:'disputed',by:'goods'});done('delivered');F.ensureFreight(s);
assert.equal(inv.protected.held,2000,'disputed amount stays held');F.decideAdjustment(s,inv,'A1','withdraw','goods');F.ensureFreight(s);assert.equal(inv.protected.held,0);assert.equal(F.amounts(s,inv).outstanding,F.amounts(s,inv).tdsPending);
// early payment needs POD; fee 1.5%
s=fresh();const i2=F.createInvoice(s,{issuer:'transporter',tripId:'TRP-503',billTo:'goods',freight:20000}).inv;assert.match(F.earlyPay(s,i2,'transporter'),/delivery proof/);
s.trips.find(x=>x.id==='TRP-503').milestones.push({key:'delivered',status:'done'});assert.equal(F.earlyPay(s,i2,'transporter'),'');assert.ok(i2.factored.fee>0);
// fuel card
s.selectedTripId='TRP-503';assert.equal(F.fuelAction(s,'load',{amount:5000}),'');assert.match(F.fuelAction(s,'spend',{amount:6000}),/Not enough/);assert.equal(F.fuelAction(s,'spend',{amount:3000,place:'IOCL'}),'');
// PF/ESI export
s.currentWorkspace='transporter';const pf=W.statutoryExport(s,'pf'),esi=W.statutoryExport(s,'esi');assert.match(pf,/^UAN,Member name/);assert.match(esi,/^IP number/);
console.log(JSON.stringify({status:'PASS',suite:'Phases 3–5: notifications, maps/GPS, claims, protected payment, notes, early pay, fuel card, payroll exports'},null,2));
