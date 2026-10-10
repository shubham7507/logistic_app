import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
const seedState=()=>structuredClone(SEED);
import {requestAadhaarOtp,confirmAadhaarOtp,submitManualIdentity,saveDeliveryDriving,saveDeliveryVehicle,saveDeliveryPayout,submitDeliveryOnboarding,deliveryReviewDecision,deliveryEligibility,deliveryOnboardingScreen,ensureDeliveryPartners} from '../js/delivery-onboarding.js';
import {screen,assign,deliveryAction,createCounterDelivery} from '../js/commerce.js';
import {pickCourier} from '../js/commerce-plus.js';
import {placeOrder} from '../js/product-orders.js';
import * as Geo from '../js/geo.js';

const img={name:'test.jpg'},pdf={name:'test.pdf'};
const s=seedState(),ws='deliveryPartner2',p=s.deliveryPartners[ws];
assert.match(deliveryOnboardingScreen(s,ws),/Verify Aadhaar/);
assert.match(requestAadhaarOtp(s,ws,'234567890123',false),/Consent/);
assert.equal(requestAadhaarOtp(s,ws,'234567890123',true),'');
assert.match(confirmAadhaarOtp(s,ws,'111111','1990-01-01',img),/incorrect/);
assert.equal(confirmAadhaarOtp(s,ws,'123456','1990-01-01',img),'');
assert.equal(p.identity.aadhaarMasked,'XXXX XXXX 0123');
assert.equal(p.otpRequest,undefined);
assert.equal(saveDeliveryDriving(s,ws,{vehicleType:'two_wheeler',licenceNumber:'RJ1420220012345',licenceExpiry:'2031-12-31'}),'');
assert.equal(saveDeliveryVehicle(s,ws,{vehicleNumber:'DL01AB1234',ownership:'borrowed',rc:pdf,insurance:pdf,insuranceExpiry:'2031-12-31',puc:img,pucExpiry:'2030-12-31'}).includes('permission'),true);
assert.equal(saveDeliveryVehicle(s,ws,{vehicleNumber:'DL01AB1234',ownership:'borrowed',authorization:pdf,rc:pdf,insurance:pdf,insuranceExpiry:'2031-12-31',puc:img,pucExpiry:'2030-12-31'}),'');
assert.equal(saveDeliveryPayout(s,ws,{pan:'ABCDE1234F',accountName:'Sana Delivery',accountNumber:'123456789012',ifsc:'SBIN0001234',upi:'sana@okaxis'}),'');
assert.equal(submitDeliveryOnboarding(s,ws),'');
assert.equal(p.available,false);
assert.match(deliveryReviewDecision(s,ws,'approve'),/background/);
assert.equal(deliveryReviewDecision(s,ws,'approve','identity','',{background:true,training:true}),'');
assert.equal(deliveryEligibility(p),'');
assert.equal(p.available,true);
assert.equal(s.payoutAccounts['DP-002'].accountNumber,p.bank.accountNumber);
assert.match(screen({...s,selectedDeliveryWs:ws},'deliveryReview','admin'),/Review Sana Delivery/);
assert.match(screen({...s,selectedDeliveryWs:'deliveryPartner'},'deliveryReview','admin'),/Driving licence ending 2345/);
assert.equal((screen(s,'commercePartners','admin').match(/View verification/g)||[]).length,2);
assert.match(screen(s,'deliveryProfile','deliveryPartner'),/My verification and payout/);
assert.match(screen(s,'deliveryProfile',ws),/My verification and payout/);

// Two independent deliveries, one for each partner, share the same GPS and payout rules.
for(const role of ['deliveryPartner','deliveryPartner2']){
 const r=placeOrder(s,{productId:'PRD-103',qty:1,address:'Flat 4, Connaught Place',method:'upi',vpa:'customer@okaxis',billing:{name:'Customer'},geoArea:'Connaught Place, Delhi'});
 assert.ok(r.order,r.error);const order=r.order;order.status='ready_for_pickup';order.bagCount=1;
 assert.equal(assign(s,order.id,s.deliveryPartners[role].id),'');
 assert.equal(deliveryAction(s,role,order.id,'accept'),'');
 assert.equal(Geo.startDemoLocation(s,order),'');
 assert.match(screen(s,'deliveryJobs',role),/Navigate to store/);
 const other=role==='deliveryPartner'?'deliveryPartner2':'deliveryPartner';
 assert.ok(!screen(s,'deliveryJobs',other).includes(order.id),'other partner cannot see this delivery');
 assert.match(deliveryAction(s,other,order.id,'pickup',order.pickupCode,1),/denied/);
 assert.equal(deliveryAction(s,role,order.id,'pickup',order.pickupCode,1),'');
 assert.match(screen(s,'deliveryJobs',role),/Navigate to customer/);
 for(let n=0;n<70&&!order.geo.arrivedDoorAt;n++)Geo.demoStep(s,order);
 assert.equal(deliveryAction(s,role,order.id,'deliver',order.deliveryCode),'');
 assert.equal(order.status,'delivered');assert.equal(order.geo.live,false);
}
p.documents.puc.expiry='2020-01-01';
assert.match(deliveryEligibility(p),/PUC expired/);
assert.match(screen(s,'deliveryProfile',ws),/Delivery profile/);
assert.equal(pickCourier(s,{id:'mock',pickupAddress:'ABC Grocery',fulfilmentPartner:'ABC Grocery'})?.id,'DP-001');
const older=seedState();delete older.deliveryPartners.deliveryPartner.onboardingVersion;delete older.deliveryPartners.deliveryPartner.verification;
ensureDeliveryPartners(older);assert.equal(deliveryEligibility(older.deliveryPartners.deliveryPartner),'');

const manual=seedState();
assert.equal(submitManualIdentity(manual,ws,{dob:'1990-01-01',front:pdf,back:pdf,selfie:img,consent:true}),'');
assert.equal(manual.deliveryPartners[ws].verification.identity,'manual_review');
const walkIn=seedState();
const unpinned=createCounterDelivery(walkIn,'grocery','PRD-101',1,'Customer street','Walk-in');
assert.ok(unpinned.order,unpinned.error);Geo.ensureGeo(walkIn);
assert.equal(unpinned.order.dest,undefined,'walk-in address must not inherit another customer pin');
unpinned.order.deliveryAssignment={partnerId:'DP-001',partnerName:'Ravi Delivery',status:'accepted'};
assert.match(Geo.courierPanel(walkIn,unpinned.order),/Map pin is missing/);
const pinned=createCounterDelivery(walkIn,'grocery','PRD-101',1,'Flat 2, Connaught Place','Walk-in',false,'cod','','Connaught Place, Delhi');
assert.ok(pinned.order,pinned.error);assert.deepEqual(pinned.order.dest,Geo.AREAS['Connaught Place, Delhi']);
assert.ok(pinned.order.origin);

const mapState=seedState();
// Use the seeded partner to check the phase-specific destination and in-card map.
mapState.customerOrders=[{id:'ORD-MAP',party:'ABC Grocery',fulfilmentPartner:'ABC Grocery',items:[{productId:'x',name:'Rice',quantity:1}],status:'ready_for_pickup',total:100,paymentStatus:'paid',deliveryAssignment:{partnerId:'DP-001',partnerName:'Ravi Delivery',status:'accepted'},pickupAddress:'Store street',address:'Customer street',history:[],origin:[28.65,77.2],dest:[28.67,77.3]}];
let html=screen(mapState,'deliveryJobs','deliveryPartner');
assert.match(html,/Navigate to store/);assert.match(html,/Your route/);assert.match(html,/Directions to customer/);
mapState.customerOrders[0].deliveryAssignment.status='picked_up';mapState.customerOrders[0].status='out_for_delivery';
html=screen(mapState,'deliveryJobs','deliveryPartner');assert.match(html,/Navigate to customer/);
mapState.customerOrders[0].geo={mode:'gps',live:true,everStarted:true};
Geo.reconcileCourierTracking(mapState);
assert.equal(mapState.customerOrders[0].geo.live,false,'stale browser GPS session is not shown as live after reload');
mapState.customerOrders[0].geo={mode:'demo',live:true,everStarted:true};
Geo.pauseCourierTracking(mapState,'deliveryPartner');
assert.equal(mapState.customerOrders[0].geo.live,false,'switching away from Ravi pauses his location');
console.log('delivery joining and active map: passed');
