import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {validateGoodsOrder,validateTransportRequirement,validateLoadRequirement,validateTruckAvailability,routeMatch,canConvertOpportunity,privatePartyLabel} from '../js/marketplace-rules.js';
import {canOpen} from '../js/permissions.js';

assert.equal(validateGoodsOrder(SEED.goodsOrders[0]),'');
assert.equal(validateGoodsOrder({...SEED.goodsOrders[0],quantity:0}),'Quantity must be greater than zero.');
assert.equal(validateTransportRequirement(SEED.transportRequirements[0]),'');
assert.equal(validateTransportRequirement({...SEED.transportRequirements[0],drop:SEED.transportRequirements[0].pickup}),'Pickup and delivery locations must be different.');
assert.equal(validateLoadRequirement(SEED.loadRequirements[0]),'');
assert.equal(validateTruckAvailability(SEED.truckAvailability[0]),'');
assert.equal(validateTruckAvailability({...SEED.truckAvailability[0],documents:'expired'}),'Only a truck with approved documents can be published.');
assert.equal(routeMatch(SEED.truckAvailability[0],SEED.loadRequirements[0]),true);
assert.equal(routeMatch({...SEED.truckAvailability[0],truckType:'Pickup'},SEED.loadRequirements[0]),false);
assert.equal(canConvertOpportunity(SEED.opportunities[0]),true);
assert.equal(canConvertOpportunity({...SEED.opportunities[0],canonicalLoadId:'LD-1'}),false);
assert.equal(privatePartyLabel(SEED.availableLoads[0],'vehicle'),'Verified Goods Business');
assert.equal(privatePartyLabel({...SEED.availableLoads[0],status:'accepted'},'vehicle'),SEED.availableLoads[0].goodsOwnerPrivate);
assert.equal(canOpen('goods','goodsOrder','authenticated'),true);
assert.equal(canOpen('goods','postAvailableLoad','authenticated'),false);
assert.equal(canOpen('transporter','postAvailableLoad','authenticated'),true);
assert.equal(canOpen('vehicle','postAvailableTruck','authenticated'),true);
assert.equal(canOpen('commercialDriver','goodsOrder','authenticated'),false);

console.log(JSON.stringify({status:'PASS',goodsOrder:true,transportRequirement:true,routeMatching:true,privacy:true,idempotency:true,roleBoundaries:true},null,2));
