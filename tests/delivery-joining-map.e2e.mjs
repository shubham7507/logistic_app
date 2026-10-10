import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
const seedState=()=>structuredClone(SEED);
import {requestAadhaarOtp,confirmAadhaarOtp,submitManualIdentity,saveDeliveryDriving,saveDeliveryVehicle,saveDeliveryPayout,submitDeliveryOnboarding,deliveryReviewDecision,deliveryEligibility,deliveryOnboardingScreen} from '../js/delivery-onboarding.js';
import {screen,assign,deliveryAction} from '../js/commerce.js';
import {pickCourier} from '../js/commerce-plus.js';

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
p.documents.puc.expiry='2020-01-01';
assert.match(deliveryEligibility(p),/PUC expired/);
assert.match(screen(s,'deliveryProfile',ws),/Delivery profile/);
assert.equal(pickCourier(s,{id:'mock',pickupAddress:'ABC Grocery',fulfilmentPartner:'ABC Grocery'})?.id,'DP-001');

const manual=seedState();
assert.equal(submitManualIdentity(manual,ws,{dob:'1990-01-01',front:pdf,back:pdf,selfie:img,consent:true}),'');
assert.equal(manual.deliveryPartners[ws].verification.identity,'manual_review');

const mapState=seedState();
// Use the seeded partner to check the phase-specific destination and in-card map.
mapState.customerOrders=[{id:'ORD-MAP',party:'ABC Grocery',fulfilmentPartner:'ABC Grocery',items:[{productId:'x',name:'Rice',quantity:1}],status:'ready_for_pickup',total:100,paymentStatus:'paid',deliveryAssignment:{partnerId:'DP-001',partnerName:'Ravi Delivery',status:'accepted'},pickupAddress:'Store street',address:'Customer street',history:[],origin:[28.65,77.2],dest:[28.67,77.3]}];
let html=screen(mapState,'deliveryJobs','deliveryPartner');
assert.match(html,/Navigate to store/);assert.match(html,/Your route/);assert.match(html,/Directions to customer/);
mapState.customerOrders[0].deliveryAssignment.status='picked_up';mapState.customerOrders[0].status='out_for_delivery';
html=screen(mapState,'deliveryJobs','deliveryPartner');assert.match(html,/Navigate to customer/);
console.log('delivery joining and active map: passed');
