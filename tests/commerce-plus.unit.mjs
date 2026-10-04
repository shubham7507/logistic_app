import assert from 'node:assert/strict';
import * as O from '../js/product-orders.js';
import * as C from '../js/commerce.js';
import * as X from '../js/commerce-plus.js';
import * as Inventory from '../js/grocery-inventory.js';
import {SEED} from '../js/mock-data.js';
const fresh=()=>{const s=structuredClone(SEED);s.person={id:'P1',name:'Shubham Kumar'};X.ensurePlus(s);return s};
const pub=Inventory.published;
let s=fresh();

// catalogue: MRP, details, variants grouped in search
const rice=s.products.find(p=>p.id==='PRD-101');assert.ok(rice.mrp>=rice.price&&rice.hsn&&rice.details['FSSAI licence']);
assert.equal(X.variantsOf(s,rice).length,2,'5 kg and 1 kg are variants');
// search: Hindi synonyms, typo tolerance, filters, sort
assert.ok(X.searchProducts(s,'chawal',pub).some(p=>p.variantGroup==='VG-RICE-IG'));
assert.ok(X.searchProducts(s,'tamatar',pub).some(p=>p.id==='PRD-106'));
assert.ok(X.searchProducts(s,'basmatti',pub).length>0,'typo tolerated');
assert.equal(X.searchProducts(s,'rice',pub).filter(p=>p.variantGroup==='VG-RICE-IG').length,1,'one card per variant group');
s.shopFilters={sort:'price_asc'};const sorted=X.searchProducts(s,'',pub);assert.ok(sorted.every((p,i)=>!i||sorted[i-1].price<=p.price));
s.shopFilters={brand:'Philips'};assert.ok(X.searchProducts(s,'',pub).every(p=>p.brand==='Philips'));s.shopFilters={};

// listing approval: price above MRP, required details, restricted items, pending review
const salt=s.products.find(p=>p.id==='PRD-103');
assert.match(X.saveListing(s,salt,{mrp:10}),/above MRP/);
assert.match(X.saveListing(s,salt,{mrp:30,'d:Ingredients':''}),/Ingredients is required/);
assert.equal(salt.approval,'changes_needed');assert.ok(!pub(salt),'not live until fixed');
X.saveListing(s,salt,{mrp:30,'d:Ingredients':'Iodised salt'});salt.approval='approved';assert.ok(pub(salt));
const up=X.bulkUpload(s,'ABC Grocery','Toor Dal,Pulses\\, dal & beans,1 kg,165,180,30,Tata Sampann\nBad,Rice,1 kg,200,150,5');assert.equal(up.created,1);assert.equal(up.errors.length,1);
assert.equal(s.products.at(-1).approval,'pending');assert.ok(!pub(s.products.at(-1)));
assert.ok(X.listingCheck(s,{...salt,id:'X',name:'Whisky 750 ml'}).includes('Restricted item'));
// batches: FEFO and expiry write-off
assert.equal(X.addBatch(s,salt,10,'2099-01-01'),'');const q0=salt.quantity;salt.batches.push({id:'old',qty:3,expiry:'2000-01-01'});X.ensurePlus(s);assert.equal(salt.quantity,q0-3,'expired batch removed from stock');

// checkout: coupons, tip, store paused, COD refusals
s.customerOrders=[];let lines=[{productId:'PRD-101',quantity:1,product:rice}];
assert.match(X.couponDiscount(s,'FIRST50',[{product:salt,quantity:1}]).error,/at least/);
assert.equal(X.couponDiscount(s,'FIRST50',lines).discount,50);
assert.match(X.couponDiscount(s,'CARD5',lines,'upi').error,/card/);
s.shopPartners.grocery.paused=true;let r=O.placeOrder(s,{productId:'PRD-101',qty:1,address:'Flat 4, Sector 62 Noida',method:'upi',vpa:'a@okaxis',billing:{name:'S'}});assert.match(r.error,/paused/);s.shopPartners.grocery.paused=false;
r=O.placeOrder(s,{productId:'PRD-101',qty:1,address:'Flat 4, Sector 62 Noida',method:'upi',vpa:'a@okaxis',billing:{name:'S'},plusCoupon:'FIRST50',plusTip:'20',plusSlot:'express'});
let o=r.order;assert.equal(o.discount,50);assert.equal(o.tip,20);assert.equal(o.total,o.itemTotal+o.deliveryFee-50+20);assert.ok(o.etaMinutes>0);
assert.equal(o.feeBreakdown.deliveryPartnerEarning,X.deliveryPay(s,o));assert.ok(o.feeBreakdown.deliveryPartnerEarning>=50,'tip goes to the courier');
assert.equal(o.sellerDue,o.itemTotal-o.feeBreakdown.productCommission,'platform-funded coupon does not reduce seller payout');
r=O.placeOrder(s,{productId:'PRD-103',qty:10,address:'Flat 4',method:'upi',vpa:'a@okaxis',billing:{name:'S'},plusCoupon:'ABC20'});assert.equal(r.order.sellerDue,r.order.itemTotal-r.order.feeBreakdown.productCommission-20,'seller-funded coupon reduces seller payout');
s.codRefusals.P1=2;assert.match(O.placeOrder(s,{productId:'PRD-103',qty:1,address:'Flat 4',method:'cod',billing:{name:'S'}}).error,/Cash on delivery is unavailable/);s.codRefusals.P1=0;
// category commission and TCS settings
X.settings(s).commission.food=0.07;X.settings(s).tcsPct=0.5;r=O.placeOrder(s,{productId:'PRD-103',qty:10,address:'Flat 4',method:'upi',vpa:'a@okaxis',billing:{name:'S'}});
assert.equal(r.order.feeBreakdown.productCommission,Math.round(r.order.itemTotal*0.07));assert.ok(r.order.feeBreakdown.tcs>0);X.settings(s).commission={};X.settings(s).tcsPct=0;

// picking: barcode must match, weight items adjust price
s=fresh();r=O.placeOrder(s,{productId:'PRD-106',qty:2,address:'Flat 4',method:'upi',vpa:'a@okaxis',billing:{name:'S'}});o=r.order;
const root=v=>({querySelector:q=>({value:v[q]??''})});
assert.match(X.pickVerify(s,o.id,'PRD-106',root({})),/Barcode does not match/);
const tomato=s.products.find(p=>p.id==='PRD-106');
assert.match(X.pickVerify(s,o.id,'PRD-106',root({[`[data-scan="${o.id}|PRD-106"]`]:tomato.barcode,[`[data-weight="${o.id}|PRD-106"]`]:'2.5'})),/more than 10%/);
const before=o.total;assert.equal(X.pickVerify(s,o.id,'PRD-106',root({[`[data-scan="${o.id}|PRD-106"]`]:tomato.barcode,[`[data-weight="${o.id}|PRD-106"]`]:'1.8'})),'');
assert.equal(o.total,before-8,'lighter weight → ₹8 back');assert.equal(s.customerWallet.balance,8);
// courier: capacity and batching
s=fresh();const mk=()=>O.placeOrder(s,{productId:'PRD-103',qty:1,address:'Flat 4',method:'upi',vpa:'a@okaxis',billing:{name:'S'}}).order;
const a1=mk(),a2=mk(),a3=mk();for(const x of [a1,a2,a3]){x.status='ready_for_pickup';C.autoOffer(s,x);}
const ids=[a1,a2,a3].map(x=>x.deliveryAssignment?.partnerId);assert.equal(ids[0],ids[1],'same-store orders batched');assert.notEqual(ids[2],ids[0],'capacity of 2 respected');
assert.equal(X.failedAttempt(s,{cod:true},'Customer refused (COD)'),'reattempt');

// returns by category
s=fresh();const deliver=(pid,qty=1,extra={})=>{const x=O.placeOrder(s,{productId:pid,qty,address:'Flat 4',method:'upi',vpa:'a@okaxis',billing:{name:'S'}}).order;Object.assign(x,{status:'delivered',deliveredAt:Date.now(),settlementStatus:'pending'},extra);return x};
// fresh: claim only, small claim auto-refunded to wallet
let f=deliver('PRD-107',2);assert.deepEqual(X.eligibility(s,f,f.items[0]).kinds,['missing','damaged','poor_quality']);
assert.equal(X.raiseClaim(s,f,'PRD-107',{kind:'missing',qty:1,refundTo:'wallet'}),'');assert.equal(s.claims[0].status,'refunded');assert.equal(s.customerWallet.balance,28);
// packaged food: damaged needs photo, goes to pickup → QC → refund, seller payout reduced
let g=deliver('PRD-103',2);assert.match(X.raiseClaim(s,g,'PRD-103',{kind:'damaged',qty:1}),/photo/);
assert.equal(X.raiseClaim(s,g,'PRD-103',{kind:'damaged',qty:1,photo:'p.jpg',refundTo:'source'}),'');let c=s.claims[0];assert.equal(c.status,'pickup_assigned');
const due=g.sellerDue;assert.match(X.pickupAction(s,c,'collect',{code:'0000'}),/return code/);
assert.equal(X.pickupAction(s,c,'collect',{code:c.pickup.code,qc0:'on',qc1:'on'}),'');assert.equal(c.status,'refunded');assert.ok(g.sellerDue<due);
assert.equal(X.storeDispute(s,c,'Pack was intact when returned'),'');assert.equal(X.adminDecide(s,c,'approve'),'');assert.equal(c.dispute.status,'store_upheld');
// electrical: replacement needs serial; after the window, warranty message
let e=deliver('PRD-201');assert.ok(X.eligibility(s,e,e.items[0]).kinds.includes('defective'));
assert.match(X.raiseClaim(s,e,'PRD-201',{kind:'defective',photo:'x.jpg'}),/serial/);
assert.equal(X.raiseClaim(s,e,'PRD-201',{kind:'defective',photo:'x.jpg',serial:'SN123'}),'');c=s.claims[0];X.pickupAction(s,c,'collect',{code:c.pickup.code,qc0:'on',qc1:'on'});assert.equal(c.status,'replaced');
let e2=deliver('PRD-201',1,{deliveredAt:Date.now()-20*86400000});assert.match(X.eligibility(s,e2,e2.items[0]).warranty,/warranty/);
// fashion: size exchange needs tags; QC failure refuses pickup
let h=deliver('PRD-301');assert.match(X.raiseClaim(s,h,'PRD-301',{kind:'exchange',photo:'x.jpg',exchangeTo:'PRD-303'}),/tags/);
assert.equal(X.raiseClaim(s,h,'PRD-301',{kind:'exchange',photo:'x.jpg',exchangeTo:'PRD-303',tags:true}),'');c=s.claims[0];X.pickupAction(s,c,'collect',{code:c.pickup.code,qc0:'on',qc1:'on',qc2:'on'});assert.equal(c.status,'exchanged');
let h2=deliver('PRD-301');X.raiseClaim(s,h2,'PRD-301',{kind:'return',photo:'x.jpg',tags:true,refundTo:'wallet'});c=s.claims[0];X.pickupAction(s,c,'collect',{code:c.pickup.code,qc0:'on'});assert.equal(c.status,'qc_failed');
// window closed
let old=deliver('PRD-107',1,{deliveredAt:Date.now()-3*86400000});assert.equal(X.eligibility(s,old,old.items[0]).kinds.length,0);
// analytics
assert.ok(X.analytics(s,'ABC Grocery').orders>0);

// every new screen renders without leaking undefined/NaN
for(const [route,ws] of [['wishlist','personal'],['moveaiWallet','personal'],['plusListings','grocery'],['plusStore','grocery'],['plusAnalytics','grocery'],['plusReturns','grocery'],['plusListings','groceryManager'],['plusApprovals','admin'],['plusClaims','admin'],['plusSettings','admin'],['plusReports','admin']]){const html=X.screen(s,route,ws);assert.ok(html.length>200,route);assert.doesNotMatch(html.replace(/<[^>]+>/g,' '),/\bundefined\b|NaN/,`${route} leaks`);}
for(const p of s.products.slice(0,8))assert.doesNotMatch(X.productExtras(s,p).replace(/<[^>]+>/g,' '),/\bundefined\b|NaN/);
assert.match(X.orderHelp(s,h2),/Help with this order/);assert.match(X.deliveryExtras(s,'deliveryPartner'),/Return pickups/);
console.log(JSON.stringify({status:'PASS',suite:'E-commerce additions (catalogue, search, checkout, picking, courier, returns, money, admin)'},null,2));
