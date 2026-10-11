import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {ROLE_CONFIG,allowedRoutes} from '../js/config.js';
import {screen,deliveryWallet,deliveryAction,reconcileCash,instantDeliveryPayout} from '../js/commerce.js';
import {record,runWeeklyPayouts} from '../js/pay.js';
import * as Hub from '../js/worker-hub.js';
import {ensureDeliveryPartners} from '../js/delivery-onboarding.js';

const state=structuredClone(SEED);
Hub.ensureHub(state);
for(const ws of ['deliveryPartner','deliveryPartner2']){
  assert.deepEqual(ROLE_CONFIG[ws].nav.map(([route])=>route),['home','deliveryJobs','deliveryEarnings','deliveryCash','deliveryProfile','helpDesk']);
  assert.equal(allowedRoutes(ws).has('myWork'),false);
}
const ravi=state.deliveryPartners.deliveryPartner;
assert.equal(Hub.jobs(state,Hub.whoAmI(state,'deliveryPartner')).filter(j=>j.kind==='partner').length,1);
assert.equal(Hub.jobs(state,Hub.whoAmI(state,'deliveryPartner')).filter(j=>j.kind==='employment'&&j.e.business==='platform').length,0);
record(state,{type:'wallet_credit',payer:'moveai',payee:ravi.id,amount:37,status:'confirmed',orderId:'PREPAID'},'Demo');
assert.equal(Hub.jobs(state,Hub.whoAmI(state,'deliveryPartner')).find(j=>j.kind==='partner').money.wallet,37);
let html=screen(state,'deliveryEarnings','deliveryPartner');
assert.match(html,/Earned from deliveries<\/span><b>₹37/);
assert.match(html,/Available to transfer<\/span><b>₹37/);
assert.match(html,/Transfer ₹27 now \(₹10 fee\)/);
assert.doesNotMatch(screen(state,'deliveryProfile','deliveryPartner'),/Wallet & payouts/);
assert.doesNotMatch(screen(state,'deliveryEarnings','deliveryPartner2'),/₹37/,'Sana cannot see Ravi’s money');

const cod={id:'COD-ORDER',party:'ABC Grocery',items:[{productId:'PRD-103',quantity:1}],total:500,status:'delivered',cod:true,history:[],deliveryAssignment:{partnerId:ravi.id,status:'delivered'},deliveryPayoutStatus:'awaiting_cod_reconciliation',feeBreakdown:{deliveryPartnerEarning:35},codCash:{partnerId:ravi.id,status:'collected',amount:500}};
state.customerOrders=[cod];
html=screen(state,'deliveryEarnings','deliveryPartner');
assert.match(html,/Waiting for COD handover and review<\/span><b>₹35/);
assert.match(html,/COD-ORDER · ₹35/);
assert.match(html,/Waiting for COD cash review/);
assert.equal(deliveryWallet(state,'deliveryPartner').balance,37,'customer cash is not rider income');
assert.equal(deliveryAction(state,'deliveryPartner',cod.id,'remit','','',{amount:500,receiver:'Admin cash desk'}),'');
assert.equal(deliveryWallet(state,'deliveryPartner').balance,37,'cash submission does not release pay');
assert.equal(reconcileCash(state,cod.id,500,'CASH-RECEIPT','Admin'),'');
assert.equal(deliveryWallet(state,'deliveryPartner').balance,72);
assert.match(screen(state,'deliveryEarnings','deliveryPartner'),/Credited to wallet/);
assert.equal(instantDeliveryPayout(state,'deliveryPartner','bank'),'');
assert.equal(deliveryWallet(state,'deliveryPartner').balance,0);
html=screen(state,'deliveryEarnings','deliveryPartner');
assert.match(html,/₹62 · bank · paid · Fee ₹10/);
assert.match(html,/Available to transfer<\/span><b>₹0/);

const weekly=structuredClone(SEED);
record(weekly,{type:'wallet_credit',payer:'moveai',payee:weekly.deliveryPartners.deliveryPartner.id,amount:40,status:'confirmed'},'Demo');
ensureDeliveryPartners(weekly);
assert.equal(runWeeklyPayouts(weekly).find(p=>p.party===ravi.id)?.amount,40);
assert.match(screen(weekly,'deliveryEarnings','deliveryPartner'),/₹40 · (bank|upi) · paid/);
console.log('Delivery Money: Ravi/Sana isolation, prepaid, COD, instant and weekly payout passed.');
