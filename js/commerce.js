// Shared mock commerce workflow. Role checks live in mutations, not just screens.
import {esc, pill, inr} from './ops.js';
import {clock, record, gateway} from './pay.js';
import {issueInvoice} from './customer-billing.js';

const DAY=86400000;
export const SHOP_POLICY={settlementReserveDays:7,storeCommission:0.08,deliveryEarning:35};
const sellerRole=ws=>['grocery','groceryFresh'].includes(ws);
const pickerRole=ws=>['picker','pickerFresh'].includes(ws);
const pickerStore=ws=>ws==='picker'?'grocery':'groceryFresh';
const driverRole=ws=>['deliveryPartner','deliveryPartner2'].includes(ws);
const stamp=()=>new Date(clock()).toLocaleString('en-IN');
const head=(title,detail,action='')=>`<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(detail)}</p></div>${action}</div>`;
const partner=(s,ws)=>s.shopPartners?.[ws];
const driver=(s,ws)=>s.deliveryPartners?.[ws];
const mine=(s,o,ws)=>sellerRole(ws)?o.party===partner(s,ws)?.party:pickerRole(ws)?o.party===partner(s,pickerStore(ws))?.party:driverRole(ws)?o.deliveryAssignment?.partnerId===driver(s,ws)?.id:ws==='admin';
const orders=s=>s.customerOrders.filter(o=>o.party && o.items?.every(i=>typeof i==='object'));
const log=(s,o,actor,text)=>{(o.history||=[]).push({at:stamp(),actor,text});(s.audit||=[]).unshift({id:`AUD-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,event:`${o.id}: ${text}`,actor,workspace:actor,at:stamp()});const store=Object.keys(s.shopPartners||{}).find(ws=>s.shopPartners[ws].party===o.party),courier=Object.keys(s.deliveryPartners||{}).find(ws=>s.deliveryPartners[ws].id===o.deliveryAssignment?.partnerId);for(const to of new Set(['personal',store,courier,'admin'].filter(Boolean)))(s.notifications||=[]).unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,to,text:`${o.id}: ${text}`,ref:o.id,at:stamp(),read:false});};
export function initializeOrder(s,o){o.paymentStatus=o.cod?'cod_due':o.status==='payment_pending'?'pending':'paid';o.settlementStatus='not_eligible';o.deliveryAssignment=null;o.createdAt=clock();o.pickupCode=String(Math.floor(1000+Math.random()*9000));o.deliveryCode=String(Math.floor(1000+Math.random()*9000));o.feeBreakdown={productCommission:Math.round(o.itemTotal*SHOP_POLICY.storeCommission),deliveryFee:o.deliveryFee||0,deliveryPartnerEarning:SHOP_POLICY.deliveryEarning};o.sellerDue=o.itemTotal-o.feeBreakdown.productCommission;o.history[0].actor='Customer';log(s,o,'Customer','Order sent to store');}
export const visibleOrders=(s,ws)=>orders(s).filter(o=>mine(s,o,ws));
export function sellerAction(s,ws,id,action,reason=''){
 const o=orders(s).find(x=>x.id===id);if(!o||!sellerRole(ws)||!mine(s,o,ws))return 'Order access denied.';
 if(partner(s,ws).status!=='approved')return 'Store must be approved.';
 const actor=partner(s,ws).name;
 if(action==='accept'&&['paid','confirmed'].includes(o.status)){o.status='accepted';log(s,o,actor,'Store accepted order');return '';}
 if(action==='reject'&&['paid','confirmed'].includes(o.status)){if(!reason.trim())return 'Enter a rejection reason.';return cancel(s,o,actor,`Store rejected: ${reason.trim()}`);}
 if(action==='pack'&&o.status==='accepted'){if(!o.pick?.completedAt||o.items.some(i=>o.pick.checked?.[i.productId]!==i.quantity))return 'Picker must confirm every item before packing.';o.status='ready_for_pickup';log(s,o,actor,'Packed and ready for pickup');autoOffer(s,o);return '';}
 return 'This store action is not available at the current stage.';
}
export function pickerAction(s,ws,id,action,productId=''){
 const o=orders(s).find(x=>x.id===id),store=pickerStore(ws);
 if(!o||!pickerRole(ws)||!mine(s,o,ws))return 'Pick task access denied.';
 if(partner(s,store)?.status!=='approved'||o.status!=='accepted')return 'Store order is not ready for picking.';
 const actor=s.mockUsers?.[ws]?.name||'Store picker';
 if(action==='start'){if(o.pick?.startedAt)return 'Picking has already started.';o.pick={picker:actor,startedAt:clock(),checked:{}};log(s,o,actor,'Picking started');return '';}
 if(!o.pick?.startedAt||o.pick.completedAt)return 'Start an open pick task first.';
 if(action==='check'){const item=o.items.find(i=>i.productId===productId);if(!item)return 'Item is not in this order.';o.pick.checked[productId]=item.quantity;log(s,o,actor,`Picked ${item.quantity} × ${item.name}`);return '';}
 if(action==='uncheck'){if(!o.items.some(i=>i.productId===productId))return 'Item is not in this order.';delete o.pick.checked[productId];log(s,o,actor,'Item needs picking again');return '';}
 if(action==='unavailable')return unavailableItem(s,store,id,productId);
 if(action==='complete'){if(o.items.some(i=>o.pick.checked[i.productId]!==i.quantity))return 'Confirm every ordered item before completing the pick.';o.pick.completedAt=clock();log(s,o,actor,'All items picked; awaiting store packing');return '';}
 return 'Unknown pick action.';
}
export function unavailableItem(s,ws,id,productId){const o=orders(s).find(x=>x.id===id);if(!o||!sellerRole(ws)||!mine(s,o,ws))return 'Order access denied.';
 if(o.status!=='accepted'||!o.items.some(i=>i.productId===productId))return 'This item cannot be changed now.';
 if(o.items.length===1)return cancel(s,o,partner(s,ws).name,'Only item unavailable at store');
 o.pendingItemId=productId;o.status='item_review';if(o.pick)o.pick.completedAt=null;log(s,o,partner(s,ws).name,`Item unavailable: ${o.items.find(i=>i.productId===productId).name}`);
 if(o.substitution==='refund')return removeUnavailable(s,id);
 return '';
}
export function removeUnavailable(s,id){const o=orders(s).find(x=>x.id===id);if(!o||o.status!=='item_review'||!o.pendingItemId)return 'No unavailable item to resolve.';
 const item=o.items.find(i=>i.productId===o.pendingItemId),amount=item.unitPrice*item.quantity;
 if(!o.cod)refund(s,o,amount,'Unavailable item removed');
 o.items=o.items.filter(i=>i!==item);o.itemTotal-=amount;o.total-=amount;o.feeBreakdown.productCommission=Math.round(o.itemTotal*SHOP_POLICY.storeCommission);o.sellerDue=o.itemTotal-o.feeBreakdown.productCommission;o.pendingItemId=null;o.status='accepted';if(o.pick){delete o.pick.checked[item.productId];o.pick.completedAt=null;}log(s,o,'Customer',`${item.name} removed · ${o.cod?'COD total reduced':`refund ${inr(amount)} initiated`}`);return '';
}
export function autoOffer(s,o){
 if(o.status!=='ready_for_pickup'||o.deliveryAssignment)return;
 const choice=Object.values(s.deliveryPartners||{}).find(p=>p.status==='approved'&&p.available);
 if(!choice){log(s,o,'MoveAI','Waiting for an available delivery partner');return;}
 o.deliveryAssignment={partnerId:choice.id,partnerName:choice.name,status:'offered',offeredAt:clock()};log(s,o,'MoveAI',`Delivery offered to ${choice.name}`);
}
export function assign(s,id,partnerId){
 const o=orders(s).find(x=>x.id===id),p=Object.values(s.deliveryPartners||{}).find(x=>x.id===partnerId&&x.status==='approved'&&x.available);
 if(!o||o.status!=='ready_for_pickup'||!p)return 'Order or available partner not found.';
 if(o.deliveryAssignment?.status==='accepted')return 'The current partner already accepted. Resolve that assignment first.';
 o.deliveryAssignment={partnerId:p.id,partnerName:p.name,status:'offered',offeredAt:clock()};log(s,o,'Admin',`Delivery offered to ${p.name}`);return '';
}
export function deliveryAction(s,ws,id,action,code=''){
 const o=orders(s).find(x=>x.id===id);if(!o||!driverRole(ws)||!mine(s,o,ws))return 'Delivery access denied.';
 if(driver(s,ws).status!=='approved')return 'Delivery profile must be approved.';
 const a=o.deliveryAssignment,actor=driver(s,ws).name;
 if(action==='accept'&&a.status==='offered'){a.status='accepted';log(s,o,actor,'Delivery offer accepted');return '';}
 if(action==='decline'&&a.status==='offered'){a.status='declined';log(s,o,actor,'Delivery offer declined');o.deliveryAssignment=null;const choices=Object.values(s.deliveryPartners||{}).filter(p=>p.id!==driver(s,ws).id&&p.available&&p.status==='approved');if(choices[0])assign(s,id,choices[0].id);return '';}
 if(action==='pickup'&&a.status==='accepted'&&o.status==='ready_for_pickup'){if(String(code)!==o.pickupCode)return 'Enter the pickup code shown to the store.';a.status='picked_up';o.status='out_for_delivery';log(s,o,actor,'Package collected from store');return '';}
 if(action==='deliver'&&a.status==='picked_up'&&o.status==='out_for_delivery'){if(String(code)!==o.deliveryCode)return 'Enter the delivery code shown to the customer.';a.status='delivered';o.status='delivered';o.deliveredAt=clock();o.settlementEligibleAt=clock()+SHOP_POLICY.settlementReserveDays*DAY;o.settlementStatus='pending';o.paymentStatus=o.cod?'cod_collected':'paid';log(s,o,actor,'Delivered with customer code');
   if(o.cod){o.codCash={status:'collected',amount:o.total,partnerId:a.partnerId,collectedAt:clock()};record(s,{owner:'personal',orderId:o.id,sourceType:'order',sourceId:o.id,type:'customer_payment',purpose:'order',payer:'personal',payee:'moveai',responsible:a.partnerId,amount:o.total,method:'cash',channel:'cash',reference:`COD-${o.id}`,status:'confirmed',note:`COD collected by ${actor}`},actor);}
   else{const pay=s.ledger.find(x=>x.orderId===o.id&&x.type==='customer_payment'&&x.status==='held');if(pay)pay.status='captured';}
   record(s,{owner:o.party,orderId:o.id,sourceType:'order',sourceId:o.id,type:'seller_settlement',payer:'moveai',payee:o.party,responsible:'moveai',amount:o.sellerDue,method:'bank',reference:`SET-${o.id}`,status:'pending',commission:o.feeBreakdown.productCommission,eligibleAt:o.settlementEligibleAt,note:'Pending store settlement after delivery'},'MoveAI');
   o.deliveryPayoutStatus='pending';record(s,{owner:a.partnerId,orderId:o.id,sourceType:'order',sourceId:o.id,type:'delivery_earning',payer:'moveai',payee:a.partnerId,responsible:'moveai',amount:SHOP_POLICY.deliveryEarning,method:'bank',reference:`DEL-${o.id}`,status:'pending',note:'Completed grocery delivery · awaiting payout'},'MoveAI');
   issueInvoice(s,{kind:'order',o,party:o.party});return '';}
 if(action==='remit'&&o.codCash?.status==='collected'&&o.codCash.partnerId===driver(s,ws).id){o.codCash.status='handed_over';o.codCash.handedOverAt=clock();log(s,o,actor,`COD cash ${inr(o.total)} handed over for reconciliation`);return '';}
 if(action==='issue'&&a.status==='picked_up'&&o.status==='out_for_delivery'){o.status='delivery_issue';a.status='issue';log(s,o,actor,'Delivery issue reported; admin review required');return '';}
 return 'This delivery action is not available at the current stage.';
}
export function updateLocation(s,ws,id,checkpoint){const o=orders(s).find(x=>x.id===id);if(!o||!driverRole(ws)||!mine(s,o,ws)||o.status!=='out_for_delivery')return 'Location update is allowed only for your active delivery.';
 if(!['En route','Near destination','At destination'].includes(checkpoint))return 'Choose a known checkpoint.';
 o.latestLocation={label:checkpoint,at:clock()};log(s,o,driver(s,ws).name,`Location update: ${checkpoint}`);return '';
}
export function retryDelivery(s,id){const o=orders(s).find(x=>x.id===id);if(!o||o.status!=='delivery_issue'||o.deliveryAssignment?.status!=='issue')return 'No delivery issue to retry.';o.status='out_for_delivery';o.deliveryAssignment.status='picked_up';log(s,o,'Admin','Delivery reattempt approved');return '';}
function refund(s,o,amount,reason,destination){
 const pay=s.ledger.find(x=>x.orderId===o.id&&x.type==='customer_payment'&&['held','captured','confirmed'].includes(x.status));
 if(!pay)return;
 if(pay.status==='held'&&amount>=o.total)pay.status='refunded';
 const g=gateway.refund(pay.reference,amount);
 record(s,{owner:'personal',orderId:o.id,sourceType:'order',sourceId:o.id,type:'refund',payer:'moveai',payee:'personal',responsible:o.party,amount,method:o.cod?'upi':o.method,reference:g.ref,status:'refund_initiated',expectedBy:clock()+5*DAY,gatewayFinal:'refunded',destination:o.cod?destination:null,note:`${reason} · ${o.id}`},'MoveAI');
}
function cancel(s,o,actor,reason){
 if(!['paid','confirmed','accepted','item_review','ready_for_pickup'].includes(o.status))return 'Cancellation is available before pickup only.';
 if(!o.cod)refund(s,o,o.total,reason);
 o.status='cancelled';o.paymentStatus=o.cod?'not_charged':'refund_pending';o.settlementStatus='not_eligible';o.deliveryAssignment=null;log(s,o,actor,reason);return '';
}
export function customerCancel(s,id){const o=orders(s).find(x=>x.id===id);return o?cancel(s,o,'Customer','Customer cancelled before pickup'):'Order not found.';}
export function requestReturn(s,id,reason,destination=''){
 const o=orders(s).find(x=>x.id===id);if(!o||o.status!=='delivered')return 'Only delivered orders can be returned.';
 if(Math.floor((clock()-o.deliveredAt)/DAY)>7)return 'Return window expired (7 days in this demo).';
 if(!reason.trim())return 'Enter the return reason.';
 if(o.cod&&!/^[\w.-]+@[a-z]{2,}$/i.test(destination))return 'Enter a UPI ID for the COD refund.';
 o.status='return_requested';o.returnReason=reason.trim();o.refundDestination=destination;log(s,o,'Customer','Return requested');return '';
}
export function resolveReturn(s,id,approved){const o=orders(s).find(x=>x.id===id);if(!o||o.status!=='return_requested')return 'No return request to resolve.';
 if(!approved){o.status='delivered';log(s,o,'Admin','Return declined after review');return '';}
 o.status='returned';o.paymentStatus='refund_pending';refund(s,o,o.total,'Return approved',o.refundDestination);const settlement=s.ledger.find(x=>x.orderId===o.id&&x.type==='seller_settlement');
 if(settlement?.status==='pending'){settlement.status='adjusted';o.settlementStatus='adjusted';}
 else if(o.settlementStatus==='paid'){record(s,{owner:o.party,orderId:o.id,sourceType:'order',sourceId:o.id,type:'settlement_adjustment',payer:o.party,payee:'moveai',responsible:o.party,amount:o.sellerDue,method:'bank',reference:`ADJ-${o.id}`,status:'due',note:'Return after store payout; deduct from future settlement'},'MoveAI');o.settlementStatus='adjustment_due';}
 log(s,o,'Admin','Return approved; refund initiated');return '';
}
export function reconcileCash(s,id){const o=orders(s).find(x=>x.id===id);if(!o||o.codCash?.status!=='handed_over')return 'Delivery partner must hand over COD cash first.';o.codCash.status='reconciled';o.codCash.reconciledAt=clock();log(s,o,'Admin',`COD cash ${inr(o.total)} reconciled`);return '';}
export function settle(s,id){const o=orders(s).find(x=>x.id===id);if(!o||o.settlementStatus!=='pending'||o.status!=='delivered')return 'Order is not ready for settlement.';
 if(clock()<o.settlementEligibleAt)return 'Settlement reserve period has not ended.';
 if(o.cod&&o.codCash?.status!=='reconciled')return 'COD cash has not been reconciled.';
 const x=s.ledger.find(e=>e.orderId===id&&e.type==='seller_settlement'&&e.status==='pending');if(!x)return 'Pending settlement record missing.';
 const account=Object.values(s.shopPartners||{}).find(p=>p.party===o.party)?.payoutAccount,g=gateway.payout(account,o.sellerDue);if(!g.ok)return g.reason;
 x.status='paid';x.paidAt=clock();x.payoutReference=g.ref;o.settlementStatus='paid';o.settledAt=clock();log(s,o,'Admin',`Store settlement ${inr(o.sellerDue)} paid · ${g.ref}`);return '';
}
export function payDelivery(s,id){const o=orders(s).find(x=>x.id===id);if(!o||o.deliveryPayoutStatus!=='pending'||!['delivered','return_requested','returned'].includes(o.status))return 'Delivery payout is not ready.';
 if(o.cod&&o.codCash?.status!=='reconciled')return 'Reconcile COD cash before paying the delivery partner.';
 const p=Object.values(s.deliveryPartners||{}).find(x=>x.id===o.deliveryAssignment?.partnerId),g=gateway.payout(p?.payoutAccount,SHOP_POLICY.deliveryEarning);if(!g.ok)return g.reason;
 const x=s.ledger.find(e=>e.orderId===id&&e.type==='delivery_earning'&&e.status==='pending');if(!x)return 'Pending delivery earning missing.';
 x.status='paid';x.payoutReference=g.ref;x.paidAt=clock();o.deliveryPayoutStatus='paid';log(s,o,'Admin',`Delivery earning ${inr(SHOP_POLICY.deliveryEarning)} paid to ${p.name}`);return '';
}
export function setPartnerStatus(s,kind,ws,status){const list=kind==='store'?s.shopPartners:s.deliveryPartners,item=list?.[ws];if(!item||!['approved','under_review','suspended'].includes(status))return 'Profile not found.';
 if(status==='suspended'&&orders(s).some(o=>!['delivered','cancelled','returned'].includes(o.status)&&(kind==='store'?o.party===item.party:o.deliveryAssignment?.partnerId===item.id)))return 'Resolve active orders before suspending this profile.';
 item.status=status;if(kind==='delivery'&&status!=='approved')item.available=false;(s.audit||=[]).unshift({id:`AUD-${Date.now()}`,event:`${kind} ${ws}: ${status}`,actor:'Admin',workspace:'admin',at:stamp()});return '';}
export function advanceDemoClock(s){s.simClockDays=(s.simClockDays||0)+7;globalThis.__moveaiClockOffset=s.simClockDays;}
const buttons=(o,ws)=>{
 if(sellerRole(ws))return `${['paid','confirmed'].includes(o.status)?`<button class="button primary compact" data-commerce="accept" data-id="${esc(o.id)}">Accept</button><button class="button danger compact" data-commerce="reject" data-id="${esc(o.id)}">Reject</button>`:''}${o.status==='accepted'?`<span class="muted">Picker: ${o.pick?.completedAt?'All items confirmed':`${Object.keys(o.pick?.checked||{}).length}/${o.items.length} item lines confirmed`}</span><button class="button primary compact" data-commerce="pack" data-id="${esc(o.id)}" ${o.pick?.completedAt?'':'disabled'}>Packed · ready for pickup</button>${o.items.map(i=>`<button class="button secondary compact" data-commerce="unavailable" data-id="${esc(o.id)}" data-product="${esc(i.productId)}">Unavailable: ${esc(i.name)}</button>`).join('')}`:''}${o.status==='item_review'?'<small>Waiting for customer to remove the unavailable item or cancel.</small>':''}${o.status==='ready_for_pickup'?`<small>Pickup code: <b>${esc(o.pickupCode)}</b> · share with assigned partner</small>`:''}`;
 if(pickerRole(ws))return o.status==='accepted'?`<div class="pick-checklist">${!o.pick?.startedAt?`<button class="button primary compact" data-commerce="pick-start" data-id="${esc(o.id)}">Start picking</button>`:o.pick.completedAt?'<b>Picking complete · store will pack</b>':`${o.items.map(i=>`<div class="market-row"><span><b>${i.quantity} × ${esc(i.name)}</b><small>${o.pick.checked?.[i.productId]===i.quantity?'Picked':'To pick'}</small></span><button class="button secondary compact" data-commerce="${o.pick.checked?.[i.productId]===i.quantity?'pick-uncheck':'pick-check'}" data-id="${esc(o.id)}" data-product="${esc(i.productId)}">${o.pick.checked?.[i.productId]===i.quantity?'Undo':'Mark picked'}</button><button class="button secondary compact" data-commerce="pick-unavailable" data-id="${esc(o.id)}" data-product="${esc(i.productId)}">Unavailable</button></div>`).join('')}<button class="button primary compact" data-commerce="pick-complete" data-id="${esc(o.id)}" ${o.items.every(i=>o.pick.checked?.[i.productId]===i.quantity)?'':'disabled'}>Complete picking</button>`}</div>`:o.status==='item_review'?'<small>Waiting for customer to resolve unavailable item.</small>':`<small>${o.pick?.completedAt?'Picked · ':''}${esc(o.status)}</small>`;
 if(driverRole(ws))return `${o.deliveryAssignment?.status==='offered'?`<button class="button primary compact" data-commerce="accept-job" data-id="${esc(o.id)}">Accept job</button><button class="button secondary compact" data-commerce="decline-job" data-id="${esc(o.id)}">Decline</button>`:''}${o.deliveryAssignment?.status==='accepted'?`<label>Store pickup code <input class="form-control" data-code="${esc(o.id)}" inputmode="numeric" maxlength="4"></label><button class="button primary compact" data-commerce="pickup" data-id="${esc(o.id)}">Confirm pickup</button>`:''}${o.deliveryAssignment?.status==='picked_up'?`<label>Customer delivery code <input class="form-control" data-code="${esc(o.id)}" inputmode="numeric" maxlength="4"></label><button class="button primary compact" data-commerce="deliver" data-id="${esc(o.id)}">Confirm delivery</button><label>Location <select data-location="${esc(o.id)}"><option>En route</option><option>Near destination</option><option>At destination</option></select></label><button class="button secondary compact" data-commerce="location" data-id="${esc(o.id)}">Share location</button><button class="button secondary compact" data-commerce="issue" data-id="${esc(o.id)}">Report delivery issue</button>`:''}${o.codCash?.status==='collected'?`<button class="button primary compact" data-commerce="remit" data-id="${esc(o.id)}">Hand over COD ${inr(o.total)}</button>`:''}`;
 return `${o.codCash?.status==='handed_over'?`<button class="button primary compact" data-commerce="reconcile" data-id="${esc(o.id)}">Reconcile cash</button>`:''}${o.status==='delivery_issue'?`<button class="button primary compact" data-commerce="retry" data-id="${esc(o.id)}">Approve reattempt</button>`:''}${o.status==='ready_for_pickup'?`<button class="button secondary compact" data-commerce="reassign" data-id="${esc(o.id)}">Offer to other partner</button>`:''}${o.status==='return_requested'?`<button class="button primary compact" data-commerce="approve-return" data-id="${esc(o.id)}">Approve return</button><button class="button secondary compact" data-commerce="decline-return" data-id="${esc(o.id)}">Decline return</button>`:''}${o.settlementStatus==='pending'?`<button class="button primary compact" data-commerce="settle" data-id="${esc(o.id)}">Settle ${inr(o.sellerDue)}</button>`:''}${o.deliveryPayoutStatus==='pending'?`<button class="button secondary compact" data-commerce="pay-driver" data-id="${esc(o.id)}">Pay delivery partner</button>`:''}`;
};
const driverAddresses=(o,s)=>{
 const pickup=Object.values(s.shopPartners||{}).find(p=>p.party===o.party)?.pickupAddress||'Pickup address unavailable';
 const dropoff=o.address||'Delivery address unavailable';
 const mapLink=a=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
 return `<p><b>Pick up:</b> ${esc(o.fulfilmentPartner)} · ${esc(pickup)} <a target="_blank" rel="noopener" href="${mapLink(pickup)}">Directions to store</a></p><p><b>Deliver to:</b> ${esc(dropoff)} <a target="_blank" rel="noopener" href="${mapLink(dropoff)}">Directions to customer</a></p>`;
};
const orderCard=(o,ws,s)=>`<section class="panel order-card"><div class="panel-header"><div><h2>${esc(o.id)} · ${inr(o.total)}</h2><p>${o.items.map(i=>`${i.quantity} × ${esc(i.name||i.productId)}`).join(', ')} · ${esc(o.fulfilmentPartner)}</p></div>${pill(o.status)}</div><p class="muted">Payment: ${esc(o.paymentStatus||'legacy')} · Store settlement: ${esc(o.settlementStatus||'legacy')} · Delivery: ${esc(o.deliveryAssignment?.partnerName||'Not assigned')}${o.latestLocation?` · Last location: ${esc(o.latestLocation.label)}`:''}</p>${driverRole(ws)?driverAddresses(o,s):''}${ws==='admin'?`<p class="muted">Customer: ${esc(o.customer||'Customer')} · Address: ${esc(o.address||'Not recorded')} · Picker: ${esc(o.pick?.picker||'Not started')} (${Object.keys(o.pick?.checked||{}).length}/${o.items.length} item lines) · COD: ${esc(o.codCash?.status||'N/A')} · Delivery payout: ${esc(o.deliveryPayoutStatus||'N/A')}</p>`:''}<div class="row-actions">${buttons(o,ws)}</div><details><summary>Order history</summary>${(o.history||[]).map(h=>`<small class="block">${esc(h.at)} · ${esc(h.actor||'MoveAI')}: ${esc(h.text)}</small>`).join('')}</details></section>`;
export function screen(s,route,ws){
 if(['grocery','groceryFresh'].includes(ws)){
  const p=partner(s,ws),os=visibleOrders(s,ws),prods=s.products.filter(x=>x.fulfilmentPartner===p.name);
  if(route==='home')return `${head(p.name,'Store dashboard · only your products and orders')}<div class="metrics"><div class="metric"><span>Orders</span><b>${os.length}</b></div><div class="metric"><span>To accept</span><b>${os.filter(o=>['paid','confirmed'].includes(o.status)).length}</b></div><div class="metric"><span>Awaiting payout</span><b>${inr(os.filter(o=>o.settlementStatus==='pending').reduce((a,o)=>a+o.sellerDue,0))}</b></div></div><button class="button primary" data-route="shopOrders">Open store orders</button>`;
  if(route==='shopOrders')return `${head('Store orders','Accept orders, review picker progress, pack and hand over')}<p class="info-banner">Picker tasks are in the separate MoveAI Picker page. Open it after accepting an order.</p>${os.map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No orders for this store yet.</section>'}`;
  if(route==='shopCatalog')return `${head('Products and stock','Demo catalogue owned by this store')}${prods.map(x=>`<section class="panel order-card"><h2>${esc(x.name)} · ${inr(x.price)}</h2><p>${esc(x.size)} · ${esc(x.stock)}</p><button class="button secondary" data-commerce="toggle-stock" data-id="${esc(x.id)}">${x.stock==='In stock'?'Mark unavailable':'Mark in stock'}</button></section>`).join('')}`;
  if(route==='shopEarnings')return `${head('Store settlements','Product commission: 8% in this mock policy. Delivery fee is separate.')}${os.map(o=>`<section class="panel order-card"><h2>${esc(o.id)} · ${esc(o.settlementStatus||'Not eligible')}</h2><p>Products ${inr(o.itemTotal)} − commission ${inr(o.feeBreakdown?.productCommission||0)} = seller due <b>${inr(o.sellerDue||0)}</b></p><p class="muted">Eligible ${o.settlementEligibleAt?new Date(o.settlementEligibleAt).toLocaleDateString('en-IN'):'after delivery'} · bank ${esc(p.bank)}</p></section>`).join('')||'<section class="panel">No settlements yet.</section>'}`;
  if(route==='shopProfile')return `${head('Store profile',p.name)}<section class="panel"><p>Status: ${esc(p.status)} · Payout bank: ${esc(p.bank)}</p><p>Courier pickup: ${esc(p.pickupAddress||'Not set')}</p><p>Your store sees only its own products, orders and payout records. Admin reviews approvals and suspensions.</p></section>`;
 }
 if(pickerRole(ws)){
  const store=pickerStore(ws),p=partner(s,store),os=visibleOrders(s,ws);
  if(route==='home')return `${head(`Hi ${esc(s.mockUsers?.[ws]?.name||'Picker')}`,`Pick tasks for ${p.name}`)}<div class="metrics"><div class="metric"><span>Ready to pick</span><b>${os.filter(o=>o.status==='accepted'&&!o.pick?.completedAt).length}</b></div><div class="metric"><span>Completed</span><b>${os.filter(o=>o.pick?.completedAt).length}</b></div></div><button class="button primary" data-route="pickTasks">Open pick tasks</button>`;
  if(route==='pickTasks')return `${head('Pick tasks',`Only accepted orders for ${p.name}. Confirm every item and quantity.`)}${os.filter(o=>['accepted','item_review','ready_for_pickup'].includes(o.status)).map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No pick tasks right now.</section>'}`;
  if(route==='pickProfile')return `${head('Picker profile',s.mockUsers?.[ws]?.name||'Picker')}<section class="panel"><p>Assigned store: ${esc(p.name)}</p><p>Store address: ${esc(p.pickupAddress)}</p><p>Your checklist is shared with the seller. Customer delivery and payment are managed by other roles.</p></section>`;
 }
 if(driverRole(ws)){
  const p=driver(s,ws),os=visibleOrders(s,ws);
  if(route==='home')return `${head(`Hi ${p.name}`,'Grocery delivery jobs assigned to you')}<section class="panel"><p>Status: ${p.available?'Available':'Offline'}</p><button class="button secondary" data-commerce="toggle-availability">${p.available?'Go offline':'Go online'}</button></section>${os.some(o=>o.codCash?.status==='collected')?'<div class="info-banner"><b>COD cash to hand over</b><button class="button secondary compact" data-route="deliveryCash">Open COD cash</button></div>':''}<button class="button primary" data-route="deliveryJobs">Open deliveries (${os.length})</button>`;
  if(route==='deliveryJobs')return `${head('My deliveries','Accept, verify pickup and deliver with customer code')}${os.map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No assigned deliveries.</section>'}`;
  if(route==='deliveryCash')return `${head('COD cash','Hand over collected cash for admin reconciliation')}${os.filter(o=>o.cod).map(o=>`<section class="panel order-card"><h2>${esc(o.id)} · ${inr(o.total)}</h2><p>Cash: ${esc(o.codCash?.status||'Not collected')}</p><div class="row-actions">${buttons(o,ws)}</div></section>`).join('')||'<section class="panel">No COD cash assigned.</section>'}`;
  if(route==='deliveryEarnings')return `${head('Delivery earnings','Completed grocery deliveries')}<section class="panel"><h2>COD cash</h2><p>${os.filter(o=>o.codCash?.status==='collected').length} collection(s) waiting for handover</p><button class="button secondary" data-route="deliveryCash">View COD cash and hand over</button></section>${os.filter(o=>o.deliveryPayoutStatus).map(o=>`<section class="panel"><b>${esc(o.id)} · ${inr(SHOP_POLICY.deliveryEarning)}</b><p>${esc(o.deliveryPayoutStatus)}</p></section>`).join('')||'<section class="panel">No completed deliveries.</section>'}`;
  if(route==='deliveryProfile')return `${head('Delivery profile',p.name)}<section class="panel"><p>Status: ${esc(p.status)} · ID: ${esc(p.id)}</p><p>Only your assigned jobs and cash collection appear here. Admin reviews approvals and suspensions.</p></section>`;
 }
 if(ws==='admin'&&['commerceOps','commerceOrders','commercePartners','commercePayments','commerceIssues'].includes(route)){
  const os=orders(s),issues=os.filter(o=>['delivery_issue','return_requested','item_review'].includes(o.status)||o.status==='ready_for_pickup'&&!o.deliveryAssignment);
  const metrics=`<div class="metrics"><div class="metric"><span>Orders</span><b>${os.length}</b></div><div class="metric"><span>Issues</span><b>${issues.length}</b></div><div class="metric"><span>COD to reconcile</span><b>${os.filter(o=>o.codCash?.status==='handed_over').length}</b></div><div class="metric"><span>Pending settlement</span><b>${os.filter(o=>o.settlementStatus==='pending').length}</b></div></div>`;
  if(route==='commerceOps')return `${head('Shop operations','Choose the area to review')}${metrics}<div class="grid two">${[['commerceOrders','Orders'],['commercePartners','Partners'],['commercePayments','Payments'],['commerceIssues','Issues']].map(([r,t])=>`<button class="button secondary" data-route="${r}">${t}</button>`).join('')}</div>`;
  if(route==='commerceOrders')return `${head('Grocery orders','All store packages and their delivery history')}${metrics}${os.map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No orders yet.</section>'}`;
  if(route==='commercePartners')return `${head('Grocery partners','Review sellers, pickers and delivery partners')}<section class="panel"><h2>Sellers</h2>${Object.entries(s.shopPartners||{}).map(([key,p])=>`<div class="market-row"><span class="market-icon">🏪</span><span><b>${esc(p.name)}</b><small>${esc(p.status)} · ${esc(p.bank)}</small></span><button class="button secondary compact" data-commerce="${p.status==='approved'?'suspend-store':'approve-store'}" data-id="${esc(key)}">${p.status==='approved'?'Suspend':'Approve'}</button></div>`).join('')}<h2>Pickers</h2>${['picker','pickerFresh'].map(ws=>`<div class="market-row"><span class="market-icon">▦</span><span><b>${esc(s.mockUsers?.[ws]?.name||'Picker')}</b><small>${esc(partner(s,pickerStore(ws))?.name||'Store unavailable')} · ${orders(s).filter(o=>mine(s,o,ws)&&o.status==='accepted').length} active pick task(s)</small></span></div>`).join('')}<h2>Delivery partners</h2>${Object.entries(s.deliveryPartners||{}).map(([key,p])=>`<div class="market-row"><span class="market-icon">🛵</span><span><b>${esc(p.name)}</b><small>${esc(p.status)} · ${p.available?'Available':'Offline'}</small></span><button class="button secondary compact" data-commerce="${p.status==='approved'?'suspend-driver':'approve-driver'}" data-id="${esc(key)}">${p.status==='approved'?'Suspend':'Approve'}</button></div>`).join('')}</section>`;
  if(route==='commercePayments')return `${head('Grocery payments','COD, refunds, seller settlements and delivery payouts',`<button class="button secondary" data-commerce="advance-clock">Demo: advance 7 days</button>`)}${metrics}${os.filter(o=>o.cod||o.settlementStatus==='pending'||o.deliveryPayoutStatus==='pending'||['refund_pending','refund_initiated'].includes(o.paymentStatus)).map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No payment actions waiting.</section>'}`;
  if(route==='commerceIssues')return `${head('Grocery issues','Review returns, unavailable items and delivery exceptions')}${metrics}${issues.map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No open issues.</section>'}`;
 }
 return '';
}
export function bind(root,api){
 root.querySelectorAll('[data-commerce]').forEach(b=>b.onclick=()=>{
  const s=api.getState(),ws=s.currentWorkspace,o=orders(s).find(x=>x.id===b.dataset.id),action=b.dataset.commerce;
  let error='';
  if(['accept','pack'].includes(action))error=sellerAction(s,ws,b.dataset.id,action);
  else if(action.startsWith('pick-'))error=pickerAction(s,ws,b.dataset.id,action.slice(5),b.dataset.product);
  else if(action==='unavailable')error=unavailableItem(s,ws,b.dataset.id,b.dataset.product);
  else if(action==='reject'){const reason=prompt('Why is this order rejected?');if(reason===null)return;error=sellerAction(s,ws,b.dataset.id,'reject',reason);}
  else if(action==='toggle-stock'){if(!sellerRole(ws))error='Access denied.';else{const p=s.products.find(x=>x.id===b.dataset.id&&x.fulfilmentPartner===partner(s,ws)?.name);if(!p)error='Product access denied.';else p.stock=p.stock==='In stock'?'Unavailable':'In stock';}}
  else if(action==='toggle-availability'){if(!driverRole(ws))error='Access denied.';else driver(s,ws).available=!driver(s,ws).available;}
  else if(['accept-job','decline-job','pickup','deliver','remit','issue'].includes(action))error=deliveryAction(s,ws,b.dataset.id,({'accept-job':'accept','decline-job':'decline'})[action]||action,root.querySelector(`[data-code="${b.dataset.id}"]`)?.value||'');
  else if(action==='location')error=updateLocation(s,ws,b.dataset.id,root.querySelector(`[data-location="${b.dataset.id}"]`)?.value||'');
  else if(ws!=='admin')error='Admin access required.';
  else if(action==='reconcile')error=reconcileCash(s,b.dataset.id);
  else if(action==='retry')error=retryDelivery(s,b.dataset.id);
  else if(action==='settle')error=settle(s,b.dataset.id);
  else if(action==='pay-driver')error=payDelivery(s,b.dataset.id);
  else if(['suspend-store','approve-store','suspend-driver','approve-driver'].includes(action))error=setPartnerStatus(s,action.endsWith('store')?'store':'delivery',b.dataset.id,action.startsWith('approve')?'approved':'suspended');
  else if(action==='reassign'){const next=Object.values(s.deliveryPartners).find(p=>p.id!==o?.deliveryAssignment?.partnerId&&p.available&&p.status==='approved');error=next?assign(s,b.dataset.id,next.id):'No other partner available.';}
  else if(action==='approve-return'||action==='decline-return')error=resolveReturn(s,b.dataset.id,action==='approve-return');
  else if(action==='advance-clock')advanceDemoClock(s);
  if(error)return api.toast(error);api.save();api.render();api.toast('Updated');
 });
}
