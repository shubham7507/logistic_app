import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {marketplaceHomeScreen,goodsOrderScreen,transportRequirementScreen,arrangementScreen,buyWithDeliveryScreen,goodsRequirementsScreen,postAvailableLoadScreen,postLoadRequirementScreen,transporterRequirementsScreen,postAvailableTruckScreen,routeOpportunitiesScreen,opportunityDetailScreen,opportunityChatScreen} from '../js/marketplace.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const screens=[];
for(const workspace of ['goods','transporter','vehicle']){
  const state=clone(SEED);state.currentWorkspace=workspace;
  screens.push(marketplaceHomeScreen(state));
}
const goods=clone(SEED);goods.currentWorkspace='goods';
screens.push(goodsOrderScreen(goods),transportRequirementScreen(goods),arrangementScreen(goods),buyWithDeliveryScreen(goods),transporterRequirementsScreen(goods),opportunityDetailScreen(goods),opportunityChatScreen(goods));
const transporter=clone(SEED);transporter.currentWorkspace='transporter';
screens.push(goodsRequirementsScreen(transporter),postAvailableLoadScreen(transporter),postLoadRequirementScreen(transporter),postAvailableTruckScreen(transporter),routeOpportunitiesScreen(transporter));
const vehicle=clone(SEED);vehicle.currentWorkspace='vehicle';screens.push(postAvailableTruckScreen(vehicle),routeOpportunitiesScreen(vehicle));

for(const html of screens){assert.ok(html.length>250);assert.ok(!html.includes('undefined'))}
assert.ok(goodsOrderScreen(goods).includes('Goods and freight stay separate'));
assert.ok(arrangementScreen(goods).includes('Send to selected Transporters'));
assert.ok(postAvailableLoadScreen(transporter).includes('Privacy before matching'));
assert.ok(routeOpportunitiesScreen(vehicle).includes('100% match'));
assert.ok(opportunityChatScreen(goods).includes('AI voice-note summary'));
console.log(JSON.stringify({status:'PASS',screens:screens.length,goodsFlow:true,transporterFlow:true,vehicleFlow:true,privacy:true,chat:true},null,2));
