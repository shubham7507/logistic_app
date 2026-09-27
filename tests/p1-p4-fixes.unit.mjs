import assert from 'node:assert/strict';
import {accessAllows,canAcceptStaffInvitation} from '../js/people-rules.js';
import {routeMatch,matchBreakdown,requirementVisibleTo,canViewOpportunity,validateOffer,validateTransportRequirement,validateTruckAvailability,canConvertOpportunity} from '../js/marketplace-rules.js';

const now=new Date('2026-09-27T12:00:00Z');
const session={verified:true,inviteId:'INV-1',mobile:'9876501199'};
assert.equal(canAcceptStaffInvitation({id:'INV-1',mobile:'9876501199',status:'pending',expires:'2026-09-30'},session,now),true);
assert.equal(canAcceptStaffInvitation({id:'INV-1',mobile:'9876501199',status:'pending',expires:'2026-09-20'},session,now),false);
assert.equal(canAcceptStaffInvitation({id:'INV-1',mobile:'9876501199',status:'revoked',expires:'2026-09-30'},session,now),false);

const scoped={status:'active',permissions:['work.update'],branchIds:['BR-JAI'],services:['transport'],from:'2026-09-01',to:'2026-10-01'};
assert.equal(accessAllows(scoped,{permission:'work.update',branchId:'BR-JAI',service:'transport',now}),true);
assert.equal(accessAllows(scoped,{permission:'work.update',branchId:'BR-NOI',service:'transport',now}),false);
assert.equal(accessAllows(scoped,{permission:'bank.change',branchId:'BR-JAI',service:'transport',now}),false);

const businesses=[{name:'Raj Logistics',verified:true,services:['transport'],routes:['Jaipur','Delhi NCR']},{name:'FastRoad Transport',verified:true,services:['transport'],routes:['Mumbai']}];
assert.equal(requirementVisibleTo({arrangement:'selected_transporters',selectedTransporters:['Raj Logistics']},'Raj Logistics',businesses),true);
assert.equal(requirementVisibleTo({arrangement:'selected_transporters',selectedTransporters:['Raj Logistics']},'FastRoad Transport',businesses),false);
assert.equal(requirementVisibleTo({arrangement:'own_vehicle'},'Raj Logistics',businesses),false);

const truck={status:'available',documents:'approved',location:'Jaipur',destinationPreference:'Delhi NCR',availableDate:'2026-10-01',truckType:'22-ft closed',capacity:12,crew:'Driver + Khalasi ready'};
const load={from:'Jaipur',to:'Delhi NCR',date:'2026-10-01',truckType:'22-ft closed',capacity:12};
assert.equal(routeMatch(truck,load),true);
assert.equal(routeMatch({...truck,crew:'Need Driver and Khalasi'},load),false);
assert.equal(routeMatch({...truck,availableDate:'2026-10-02'},load),false);
assert.equal(matchBreakdown(truck,load).score,100);
assert.ok(matchBreakdown({...truck,documents:'expired'},load).score<100);

assert.equal(canViewOpportunity({participantWorkspaces:['goods','transporter']},'goods'),true);
assert.equal(canViewOpportunity({participantWorkspaces:['goods','transporter']},'vehicle'),false);
assert.equal(canConvertOpportunity({status:'discussion',confirmations:{goods:true,transporter:false},participantWorkspaces:['goods','transporter']}),false);
assert.equal(canConvertOpportunity({status:'terms_agreed',confirmations:{goods:true,transporter:true},participantWorkspaces:['goods','transporter']}),true);

assert.match(validateOffer({freight:10000,advance:12000,pickupDate:'2026-10-01',expiresAt:'2026-09-30',conditions:'POD'}),/Advance/);
assert.equal(validateOffer({freight:10000,advance:2000,pickupDate:'2026-10-01',expiresAt:'2026-09-30',conditions:'POD'}),'');
assert.match(validateTransportRequirement({goodsOrderId:'GO',pickup:'A',drop:'B',pickupDate:'2026-10-01',truckType:'Pickup',capacity:1,dharamkata:true,paymentTerms:''}),/payment terms/i);
assert.match(validateTruckAvailability({...truck,registration:'RJ01AA1234',destinationPreference:'',location:'Jaipur'}),/destination/i);

console.log('P1-P4 fix rules: PASS');
