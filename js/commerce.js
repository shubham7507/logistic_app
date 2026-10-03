// Shared mock commerce workflow. Role checks live in mutations, not just screens.
import {esc, pill, inr} from './ops.js';
import {clock, record, gateway} from './pay.js';
import {issueInvoice} from './customer-billing.js';
import {notifyOrder} from './commerce-notifications.js';
import {staffFor,currentPicker,pickerCanSee,storeWorkspace,pickerWorkspace,invitePicker,selectPicker,acceptPickerInvite,assignPicker,removePicker} from './grocery-staff.js';
import * as PickerPay from './grocery-picker-pay.js';

const DAY=86400000;
export const SHOP_POLICY={settlementReserveDays:7,storeCommission:0.08,deliveryEarning:35};
const sellerRole=ws=>['grocery','groceryFresh'].includes(ws);
const pickerRole=ws=>['picker','pickerFresh'].includes(ws);
const pickerStore=storeWorkspace;
const driverRole=ws=>['deliveryPartner','deliveryPartner2'].includes(ws);
const stamp=()=>new Date(clock()).toLocaleString('en-IN');
const head=(title,detail,action='')=>`<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(detail)}</p></div>${action}</div>`;
const partner=(s,ws)=>s.shopPartners?.[ws];
const driver=(s,ws)=>s.deliveryPartners?.[ws];
const mine=(s,o,ws)=>sellerRole(ws)?o.party===partner(s,ws)?.party:pickerRole(ws)?pickerCanSee(s,ws,o):driverRole(ws)?o.deliveryAssignment?.partnerId===driver(s,ws)?.id:ws==='admin';
const orders=s=>s.customerOrders.filter(o=>o.party && o.items?.every(i=>typeof i==='object'));
const log=(s,o,actor,text)=>{(o.history||=[]).push({at:stamp(),actor,text});(s.audit||=[]).unshift({id:`AUD-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,event:`${o.id}: ${text}`,actor,workspace:actor,at:stamp()});notifyOrder(s,o,text);};
export function initializeOrder(s,o){o.paymentStatus=o.cod?'cod_due':o.status==='payment_pending'?'pending':'paid';o.settlementStatus='not_eligible';o.deliveryAssignment=null;o.createdAt=clock();o.pickupCode=String(Math.floor(1000+Math.random()*9000));o.deliveryCode=String(Math.floor(1000+Math.random()*9000));o.feeBreakdown={productCommission:Math.round(o.itemTotal*SHOP_POLICY.storeCommission),deliveryFee:o.deliveryFee||0,deliveryPartnerEarning:SHOP_POLICY.deliveryEarning};o.sellerDue=o.itemTotal-o.feeBreakdown.productCommission;o.history[0].actor='Customer';log(s,o,'Customer','Order sent to store');}
export const visibleOrders=(s,ws)=>orders(s).filter(o=>mine(s,o,ws));
export function sellerAction(s,ws,id,action,reason=''){
 const o=orders(s).find(x=>x.id===id);if(!o||!sellerRole(ws)||!mine(s,o,ws))return 'Order access denied.';
 if(partner(s,ws).status!=='approved')return 'Store must be approved.';
 const actor=partner(s,ws).name;
 if(action==='accept'&&['paid','confirmed'].includes(o.status)){o.status='accepted';log(s,o,actor,'Store accepted order');return '';}
 if(action==='reject'&&['paid','confirmed'].includes(o.status)){if(!reason.trim())return 'Enter a rejection reason.';return cancel(s,o,actor,`Store rejected: ${reason.trim()}`);}
 if(action==='pack'&&o.status==='accepted'){if(!o.pick?.completedAt||o.items.some(i=>o.pick.checked?.[i.productId]!==i.quantity))return 'Confirm every item before packing.';const bags=Number(reason||1);if(!Number.isInteger(bags)||bags<1||bags>10)return 'Enter 1 to 10 sealed bags.';o.bagCount=bags;o.status='ready_for_pickup';log(s,o,actor,'Packed and ready for pickup');autoOffer(s,o);return '';}
 return 'This store action is not available at the current stage.';
}
export function pickerAction(s,ws,id,action,productId=''){
 const o=orders(s).find(x=>x.id===id),store=sellerRole(ws)?ws:pickerStore(ws);
 if(!o||!(pickerRole(ws)||sellerRole(ws))||!mine(s,o,ws))return 'Pick task access denied.';
 if(partner(s,store)?.status!=='approved'||o.status!=='accepted')return 'Store order is not ready for picking.';
 const actor=sellerRole(ws)?partner(s,ws).name:currentPicker(s,ws)?.name||'Store picker';
 if(action==='start'){if(o.pick?.startedAt)return 'Picking has already started.';if(pickerRole(ws)&&!pickerCanSee(s,ws,o))return 'Assign this order to the active picker first.';if(sellerRole(ws)&&o.pickerId)return 'Reassign or remove the staff assignment before picking yourself.';o.pick={picker:actor,mode:sellerRole(ws)?'self':'staff',startedAt:clock(),checked:{}};for(const n of s.notifications||[])if(n.ref===o.id&&n.to===(store==='grocery'?'picker':'pickerFresh')&&/Items ready to pick/.test(n.text))n.read=true;log(s,o,actor,'Picking started');return '';}
 if(o.pick?.mode==='self'&&!sellerRole(ws)||o.pick?.mode==='staff'&&!pickerRole(ws))return 'This task belongs to another store worker.';
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
 o.pendingItemId=productId;o.suggestedProductId=null;o.status='item_review';if(o.pick)o.pick.completedAt=null;log(s,o,partner(s,ws).name,`Item unavailable: ${o.items.find(i=>i.productId===productId).name}`);
 if(o.substitution==='refund')return removeUnavailable(s,id);
 return '';
}
export function removeUnavailable(s,id){const o=orders(s).find(x=>x.id===id);if(!o||o.status!=='item_review'||!o.pendingItemId)return 'No unavailable item to resolve.';
 const item=o.items.find(i=>i.productId===o.pendingItemId),amount=item.unitPrice*item.quantity;
 if(!o.cod)refund(s,o,amount,'Unavailable item removed');
 o.items=o.items.filter(i=>i!==item);o.itemTotal-=amount;o.total-=amount;o.feeBreakdown.productCommission=Math.round(o.itemTotal*SHOP_POLICY.storeCommission);o.sellerDue=o.itemTotal-o.feeBreakdown.productCommission;o.pendingItemId=null;o.suggestedProductId=null;o.status='accepted';if(o.pick){delete o.pick.checked[item.productId];o.pick.completedAt=null;}log(s,o,'Customer',`${item.name} removed · ${o.cod?'COD total reduced':`refund ${inr(amount)} initiated`}`);return '';
}
export function suggestReplacement(s,ws,id,newProductId){
 const o=orders(s).find(x=>x.id===id);if(!o||!sellerRole(ws)||!mine(s,o,ws)||o.status!=='item_review')return 'Replacement access denied.';
 const old=o.items.find(i=>i.productId===o.pendingItemId),p=s.products.find(x=>x.id===newProductId);
 if(!old||!p||p.fulfilmentPartner!==o.fulfilmentPartner||p.stock!=='In stock'||p.price>old.unitPrice||o.items.some(i=>i.productId===p.id))return 'Choose an available item from this store at the same or a lower unit price.';
 o.suggestedProductId=p.id;log(s,o,partner(s,ws).name,`Replacement suggested: ${p.name}`);return '';
}
export function approveReplacement(s,id){
 const o=orders(s).find(x=>x.id===id),old=o?.items.find(i=>i.productId===o.pendingItemId),p=s.products.find(x=>x.id===o?.suggestedProductId);
 if(!o||o.status!=='item_review'||!old||!p||p.fulfilmentPartner!==o.fulfilmentPartner||p.stock!=='In stock'||p.price>old.unitPrice)return 'Suggested item is no longer available; remove the item or ask the store.';
 const difference=(old.unitPrice-p.price)*old.quantity;
 if(difference&&!o.cod)refund(s,o,difference,'Replacement price difference');
 old.productId=p.id;old.name=p.name;old.unitPrice=p.price;o.itemTotal-=difference;o.total-=difference;o.feeBreakdown.productCommission=Math.round(o.itemTotal*SHOP_POLICY.storeCommission);o.sellerDue=o.itemTotal-o.feeBreakdown.productCommission;
 if(o.pick){delete o.pick.checked[o.pendingItemId];o.pick.completedAt=null;}
 o.pendingItemId=null;o.suggestedProductId=null;o.status='accepted';log(s,o,'Customer',`Replacement approved: ${p.name}${difference?` · ${o.cod?'COD reduced':'refund initiated'} ${inr(difference)}`:''}`);return '';
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
export function expireOffer(s,id){
 const o=orders(s).find(x=>x.id===id),a=o?.deliveryAssignment;
 if(!o||o.status!=='ready_for_pickup'||a?.status!=='offered')return 'There is no open delivery offer.';
 if(clock()-a.offeredAt<10*60000)return 'The courier still has time to respond (10-minute demo window).';
 const old=a.partnerId,oldWs=Object.keys(s.deliveryPartners||{}).find(ws=>s.deliveryPartners[ws].id===old);for(const n of s.notifications||[])if(n.ref===id&&n.to===oldWs&&/New delivery offer/.test(n.text))n.read=true;o.deliveryAssignment=null;log(s,o,'Admin','Delivery offer expired');
 const next=Object.values(s.deliveryPartners||{}).find(p=>p.id!==old&&p.status==='approved'&&p.available);
 if(next)assign(s,id,next.id);else log(s,o,'MoveAI','Waiting for an available delivery partner');return '';
}
export function deliveryAction(s,ws,id,action,code='',bagCount=''){
 const o=orders(s).find(x=>x.id===id);if(!o||!driverRole(ws)||!mine(s,o,ws))return 'Delivery access denied.';
 if(driver(s,ws).status!=='approved')return 'Delivery profile must be approved.';
 const a=o.deliveryAssignment,actor=driver(s,ws).name;
 if(action==='accept'&&a.status==='offered'){a.status='accepted';log(s,o,actor,'Delivery offer accepted');return '';}
 if(action==='decline'&&a.status==='offered'){a.status='declined';for(const n of s.notifications||[])if(n.ref===id&&n.to===ws&&/New delivery offer/.test(n.text))n.read=true;log(s,o,actor,'Delivery offer declined');o.deliveryAssignment=null;const choices=Object.values(s.deliveryPartners||{}).filter(p=>p.id!==driver(s,ws).id&&p.available&&p.status==='approved');if(choices[0])assign(s,id,choices[0].id);else log(s,o,'MoveAI','Waiting for an available delivery partner');return '';}
 if(action==='pickup'&&a.status==='accepted'&&o.status==='ready_for_pickup'){if(String(code)!==o.pickupCode)return 'Enter the pickup code shown to the store.';if(Number(bagCount)!==(o.bagCount||1))return `Confirm ${o.bagCount||1} sealed bag(s) with the store.`;a.status='picked_up';a.bagsCollected=o.bagCount||1;o.status='out_for_delivery';log(s,o,actor,'Package collected from store');return '';}
 if(action==='deliver'&&a.status==='picked_up'&&o.status==='out_for_delivery'){if(String(code)!==o.deliveryCode)return 'Enter the delivery code shown to the customer.';a.status='delivered';o.status='delivered';o.deliveredAt=clock();o.settlementEligibleAt=clock()+SHOP_POLICY.settlementReserveDays*DAY;o.settlementStatus='pending';o.paymentStatus=o.cod?'cod_collected':'paid';log(s,o,actor,'Delivered with customer code');
   if(o.cod){o.codCash={status:'collected',amount:o.total,partnerId:a.partnerId,collectedAt:clock()};record(s,{owner:'personal',orderId:o.id,sourceType:'order',sourceId:o.id,type:'customer_payment',purpose:'order',payer:'personal',payee:'moveai',responsible:a.partnerId,amount:o.total,method:'cash',channel:'cash',reference:`COD-${o.id}`,status:'confirmed',note:`COD collected by ${actor}`},actor);}
   else{const pay=s.ledger.find(x=>x.orderId===o.id&&x.type==='customer_payment'&&x.status==='held');if(pay)pay.status='captured';}
   record(s,{owner:o.party,orderId:o.id,sourceType:'order',sourceId:o.id,type:'seller_settlement',payer:'moveai',payee:o.party,responsible:'moveai',amount:o.sellerDue,method:'bank',reference:`SET-${o.id}`,status:'pending',commission:o.feeBreakdown.productCommission,eligibleAt:o.settlementEligibleAt,note:'Pending store settlement after delivery'},'MoveAI');
   o.deliveryPayoutStatus='pending';record(s,{owner:a.partnerId,orderId:o.id,sourceType:'order',sourceId:o.id,type:'delivery_earning',payer:'moveai',payee:a.partnerId,responsible:'moveai',amount:SHOP_POLICY.deliveryEarning,method:'bank',reference:`DEL-${o.id}`,status:'pending',note:'Completed grocery delivery · awaiting payout'},'MoveAI');
   issueInvoice(s,{kind:'order',o,party:o.party});return '';}
 if(action==='remit'&&o.codCash?.status==='collected'&&o.codCash.partnerId===driver(s,ws).id){o.codCash.status='handed_over';o.codCash.handedOverAt=clock();log(s,o,actor,`COD cash ${inr(o.total)} handed over for reconciliation`);return '';}
 if(action==='issue'&&a.status==='picked_up'&&o.status==='out_for_delivery'){if(!['Customer unavailable','Wrong address','Package damaged','Other'].includes(code))return 'Choose a delivery issue reason.';o.status='delivery_issue';o.deliveryIssueReason=code;a.status='issue';log(s,o,actor,`Delivery issue reported: ${code}; admin review required`);return '';}
 return 'This delivery action is not available at the current stage.';
}
export function updateLocation(s,ws,id,checkpoint){const o=orders(s).find(x=>x.id===id);if(!o||!driverRole(ws)||!mine(s,o,ws)||o.status!=='out_for_delivery')return 'Location update is allowed only for your active delivery.';
 if(!['En route','Near destination','At destination'].includes(checkpoint))return 'Choose a known checkpoint.';
 if(o.latestLocation?.label===checkpoint)return 'This checkpoint is already shared.';
 o.latestLocation={label:checkpoint,at:clock()};log(s,o,driver(s,ws).name,`Location update: ${checkpoint}`);return '';
}
export function retryDelivery(s,id){const o=orders(s).find(x=>x.id===id);if(!o||o.status!=='delivery_issue'||o.deliveryAssignment?.status!=='issue')return 'No delivery issue to retry.';o.status='out_for_delivery';o.deliveryAssignment.status='picked_up';log(s,o,'Admin','Delivery reattempt approved');return '';}
export function cancelFailedDelivery(s,id){const o=orders(s).find(x=>x.id===id);if(!o||o.status!=='delivery_issue'||o.deliveryAssignment?.status!=='issue')return 'No delivery issue to cancel.';
 if(!o.cod)refund(s,o,o.total,'Delivery cancelled after pickup');o.status='cancelled';o.paymentStatus=o.cod?'not_charged':'refund_pending';o.settlementStatus='not_eligible';o.deliveryAssignment.status='cancelled';log(s,o,'Admin','Delivery cancelled after pickup; refund initiated');return '';
}
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
const pickChecklist=(o,mode)=>`<div class="pick-checklist">${!o.pick?.startedAt?`<button class="button primary compact" data-commerce="pick-start" data-id="${esc(o.id)}">${mode==='self'?'Pick items myself':'Start picking'}</button>`:o.pick.completedAt?'<b>All items confirmed · ready to pack</b>':`${o.items.map(i=>`<div class="market-row"><span><b>${i.quantity} × ${esc(i.name)}</b><small>${o.pick.checked?.[i.productId]===i.quantity?'Picked':'To pick'}</small></span><button class="button secondary compact" data-commerce="${o.pick.checked?.[i.productId]===i.quantity?'pick-uncheck':'pick-check'}" data-id="${esc(o.id)}" data-product="${esc(i.productId)}">${o.pick.checked?.[i.productId]===i.quantity?'Undo':'Mark picked'}</button><button class="button secondary compact" data-commerce="pick-unavailable" data-id="${esc(o.id)}" data-product="${esc(i.productId)}">Unavailable</button></div>`).join('')}<button class="button primary compact" data-commerce="pick-complete" data-id="${esc(o.id)}" ${o.items.every(i=>o.pick.checked?.[i.productId]===i.quantity)?'':'disabled'}>Complete picking</button>`}</div>`;
const staffAssignment=(o,ws,s)=>{
 if(o.pick?.mode==='self')return '<small>Store owner is picking this order.</small>';
 const staff=staffFor(s,ws).filter(p=>p.status==='active');
 const selected=staff.find(p=>p.id===o.pickerId);
 return `<div class="info-banner"><b>${selected?`Assigned to ${esc(selected.name)}`:'Choose who will pick this order'}</b>${!o.pick?.completedAt?`${staff.length?`<label>Store picker <select data-picker-assignment="${esc(o.id)}">${staff.map(p=>`<option value="${esc(p.id)}" ${p.id===o.pickerId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><button class="button secondary compact" data-commerce="assign-picker" data-id="${esc(o.id)}">${selected?'Reassign picker':'Assign picker'}</button>`:`<span>No active picker. Invite staff in Store team, or pick items yourself.</span>`}`:''}${selected?`<small>${o.pick?.completedAt?'All items confirmed':o.pick?.startedAt?`${Object.keys(o.pick.checked||{}).length}/${o.items.length} item lines checked`:'Awaiting picker to start'}</small>`:''}</div>`;
};
const buttons=(o,ws,s)=>{
 if(sellerRole(ws))return `${['paid','confirmed'].includes(o.status)?`<button class="button primary compact" data-commerce="accept" data-id="${esc(o.id)}">Accept order</button><button class="button danger compact" data-commerce="reject" data-id="${esc(o.id)}">Reject</button>`:''}${o.status==='accepted'?`${staffAssignment(o,ws,s)}${!o.pickerId?pickChecklist(o,'self'):''}<label>Sealed bags <input class="form-control compact" data-bags="${esc(o.id)}" type="number" min="1" max="10" value="${esc(o.bagCount||1)}"></label><button class="button primary compact" data-commerce="pack" data-id="${esc(o.id)}" ${o.pick?.completedAt?'':'disabled'}>Pack and ready for pickup</button>`:''}${o.status==='item_review'?'<small>Customer must approve removal or a suggested replacement.</small>':''}${o.status==='ready_for_pickup'?`<small>${o.bagCount||1} sealed bag(s) · Pickup code: <b>${esc(o.pickupCode)}</b> · share with assigned courier</small>`:''}`;
 if(pickerRole(ws))return o.status==='accepted'?(o.pick?.mode==='self'?'<small>Store owner is picking this order.</small>':pickChecklist(o,'staff')):o.status==='item_review'?'<small>Waiting for customer to resolve unavailable item.</small>':`<small>${o.pick?.completedAt?'Picked · ':''}${esc(o.status)}</small>`;
 if(driverRole(ws))return `${o.deliveryAssignment?.status==='offered'?`<p class="info-banner">Offer: ${o.bagCount||1} sealed bag(s) · ${o.items.reduce((n,i)=>n+i.quantity,0)} items · ${inr(SHOP_POLICY.deliveryEarning)} earning · ${o.cod?`Collect COD ${inr(o.total)}`:'Prepaid'}</p><button class="button primary compact" data-commerce="accept-job" data-id="${esc(o.id)}">Accept job</button><button class="button secondary compact" data-commerce="decline-job" data-id="${esc(o.id)}">Decline</button>`:''}${o.deliveryAssignment?.status==='accepted'?`<p>Next: collect ${o.bagCount||1} sealed bag(s) from the store.</p><label>Store pickup code <input class="form-control" data-code="${esc(o.id)}" inputmode="numeric" maxlength="4"></label><label>Bags collected <input class="form-control compact" data-collected-bags="${esc(o.id)}" type="number" min="1" max="10" value="${o.bagCount||1}"></label><button class="button primary compact" data-commerce="pickup" data-id="${esc(o.id)}">Confirm pickup</button>`:''}${o.deliveryAssignment?.status==='picked_up'?`<p>Next: deliver ${o.bagCount||1} bag(s) to the customer${o.cod?` and collect ${inr(o.total)} COD`:''}.</p><label>Customer delivery code <input class="form-control" data-code="${esc(o.id)}" inputmode="numeric" maxlength="4"></label><button class="button primary compact" data-commerce="deliver" data-id="${esc(o.id)}">Confirm delivery</button><label>Manual checkpoint <select data-location="${esc(o.id)}"><option>En route</option><option>Near destination</option><option>At destination</option></select></label><button class="button secondary compact" data-commerce="location" data-id="${esc(o.id)}">Share checkpoint</button><label>Problem <select data-issue="${esc(o.id)}"><option>Customer unavailable</option><option>Wrong address</option><option>Package damaged</option><option>Other</option></select></label><button class="button secondary compact" data-commerce="issue" data-id="${esc(o.id)}">Report delivery issue</button>`:''}${o.codCash?.status==='collected'?`<button class="button primary compact" data-commerce="remit" data-id="${esc(o.id)}">Hand over COD ${inr(o.total)}</button>`:''}`;
 return `${o.codCash?.status==='handed_over'?`<button class="button primary compact" data-commerce="reconcile" data-id="${esc(o.id)}">Reconcile cash</button>`:''}${o.status==='delivery_issue'?`<span>Reason: ${esc(o.deliveryIssueReason||'Not recorded')}</span><button class="button primary compact" data-commerce="retry" data-id="${esc(o.id)}">Approve reattempt</button><button class="button secondary compact" data-commerce="cancel-failed" data-id="${esc(o.id)}">Cancel and refund</button>`:''}${o.status==='ready_for_pickup'?`<button class="button secondary compact" data-commerce="reassign" data-id="${esc(o.id)}">Offer to other partner</button>${o.deliveryAssignment?.status==='offered'?`<button class="button secondary compact" data-commerce="expire-offer" data-id="${esc(o.id)}">Reoffer after 10 min</button>`:''}`:''}${o.status==='return_requested'?`<button class="button primary compact" data-commerce="approve-return" data-id="${esc(o.id)}">Approve return</button><button class="button secondary compact" data-commerce="decline-return" data-id="${esc(o.id)}">Decline return</button>`:''}${o.settlementStatus==='pending'?`<button class="button primary compact" data-commerce="settle" data-id="${esc(o.id)}">Settle ${inr(o.sellerDue)}</button>`:''}${o.deliveryPayoutStatus==='pending'?`<button class="button secondary compact" data-commerce="pay-driver" data-id="${esc(o.id)}">Pay delivery partner</button>`:''}`;
};
const driverAddresses=(o,s)=>{
 const pickup=Object.values(s.shopPartners||{}).find(p=>p.party===o.party)?.pickupAddress||'Pickup address unavailable';
 const dropoff=o.address||'Delivery address unavailable';
 const mapLink=a=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
 return `<p><b>Pick up:</b> ${esc(o.fulfilmentPartner)} · ${esc(pickup)} <a target="_blank" rel="noopener" href="${mapLink(pickup)}">Directions to store</a></p><p><b>Deliver to:</b> ${esc(dropoff)} <a target="_blank" rel="noopener" href="${mapLink(dropoff)}">Directions to customer</a></p>`;
};
const replacementPicker=(o,ws,s)=>{
 if(!sellerRole(ws)||o.status!=='item_review')return '';
 const old=o.items.find(i=>i.productId===o.pendingItemId),choices=s.products.filter(p=>p.fulfilmentPartner===o.fulfilmentPartner&&p.stock==='In stock'&&old&&p.price<=old.unitPrice&&!o.items.some(i=>i.productId===p.id));
 return `<div class="info-banner"><b>Unavailable: ${esc(old?.name||'Item')}</b><span>Customer can remove it or approve a same-store replacement at or below ${inr(old?.unitPrice||0)} per unit.</span>${choices.length?`<label>Suggest replacement <select data-replacement="${esc(o.id)}">${choices.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${inr(p.price)}</option>`).join('')}</select></label><button class="button secondary compact" data-commerce="suggest-replacement" data-id="${esc(o.id)}">Send suggestion</button>`:'<span>No eligible replacement available.</span>'}</div>`;
};
const nextAction=(o,ws)=>{
 if(sellerRole(ws))return ['paid','confirmed'].includes(o.status)?'Next: accept or reject the order.':o.status==='accepted'?o.pick?.completedAt?'Next: verify sealed bags and mark ready for pickup.':o.pickerId?'Next: picker completes the checklist; reassign here if needed.':'Next: assign a store picker or pick items yourself.':o.status==='item_review'?'Next: suggest an eligible replacement or wait for the customer.':o.status==='ready_for_pickup'?'Next: hand the sealed bags and pickup code to the courier.':'';
 if(pickerRole(ws))return o.status==='accepted'&&o.pick?.mode!=='self'?(o.pick?.completedAt?'Picking complete; seller packs next.':'Next: check every item and quantity.') : '';
 if(driverRole(ws))return o.deliveryAssignment?.status==='offered'?'Next: review and accept or decline the offer.':o.deliveryAssignment?.status==='accepted'?'Next: collect sealed bags and verify the store pickup code.':o.deliveryAssignment?.status==='picked_up'?'Next: deliver and verify the customer code.':o.codCash?.status==='collected'?'Next: hand over collected COD cash.':'';
 return '';
};
const orderCard=(o,ws,s)=>`<section class="panel order-card"><div class="panel-header"><div><h2>${esc(o.id)} · ${inr(o.total)}</h2><p>${o.items.map(i=>`${i.quantity} × ${esc(i.name||i.productId)}`).join(', ')} · ${esc(o.fulfilmentPartner)}</p></div>${pill(o.status)}</div>${nextAction(o,ws)?`<p class="info-banner">${esc(nextAction(o,ws))}</p>`:''}<p class="muted">Payment: ${esc(o.paymentStatus||'legacy')} · Store settlement: ${esc(o.settlementStatus||'legacy')} · Delivery: ${esc(o.deliveryAssignment?.partnerName||'Not assigned')}${o.latestLocation?` · Last location: ${esc(o.latestLocation.label)}`:''}</p>${driverRole(ws)?driverAddresses(o,s):''}${ws==='admin'?`<p class="muted">Customer: ${esc(o.customer||'Customer')} · Address: ${esc(o.address||'Not recorded')} · Picker: ${esc(o.pick?.picker||staffFor(s,Object.keys(s.shopPartners||{}).find(k=>s.shopPartners[k].party===o.party)).find(p=>p.id===o.pickerId)?.name||'Not assigned')} (${Object.keys(o.pick?.checked||{}).length}/${o.items.length} item lines) · COD: ${esc(o.codCash?.status||'N/A')} · Delivery payout: ${esc(o.deliveryPayoutStatus||'N/A')}</p>`:''}${replacementPicker(o,ws,s)}<div class="row-actions">${buttons(o,ws,s)}</div><details><summary>Order history</summary>${(o.history||[]).map(h=>`<small class="block">${esc(h.at)} · ${esc(h.actor||'MoveAI')}: ${esc(h.text)}</small>`).join('')}</details></section>`;
export function screen(s,route,ws){
 if(['grocery','groceryFresh'].includes(ws)){
  const p=partner(s,ws),os=visibleOrders(s,ws),prods=s.products.filter(x=>x.fulfilmentPartner===p.name);
  if(route==='home')return `${head(p.name,'Store dashboard · only your products and orders')}<div class="metrics"><div class="metric"><span>Orders</span><b>${os.length}</b></div><div class="metric"><span>To accept</span><b>${os.filter(o=>['paid','confirmed'].includes(o.status)).length}</b></div><div class="metric"><span>Awaiting payout</span><b>${inr(os.filter(o=>o.settlementStatus==='pending').reduce((a,o)=>a+o.sellerDue,0))}</b></div><div class="metric"><span>Picker pay to record</span><b>${(s.pickerPayRuns||[]).filter(x=>x.store===ws&&x.status==='approved').length}</b></div></div><button class="button primary" data-route="shopOrders">Open store orders</button><button class="button secondary" data-route="shopPickerPay">Picker Pay</button>`;
  if(route==='shopOrders')return `${head('Store orders','Accept, assign a store picker or pick yourself, then pack')}<p class="info-banner">Invite staff in Store team. Assign an active picker on each accepted order. For a small store, choose Pick items myself.</p>${os.map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No orders for this store yet.</section>'}`;
  if(route==='shopTeam')return `${head('Store team',`Picker access for ${p.name}`)}<section class="panel"><h2>Invite a picker</h2><p>Enter a staff name and 10-digit mobile number. In this demo, open the matching Picker workspace and select the invited account to accept.</p><label>Name <input class="form-control" data-picker-name maxlength="80" placeholder="e.g. Priya Sharma"></label><label>Mobile <input class="form-control" data-picker-mobile inputmode="numeric" maxlength="10" placeholder="10-digit mobile"></label><button class="button primary" data-commerce="invite-picker">Send invitation</button></section><section class="panel"><h2>Pickers at this store</h2>${staffFor(s,ws).map(x=>`<div class="market-row"><span><b>${esc(x.name)}</b><small>${esc(x.mobile)} · ${esc(x.status)} · ${os.filter(o=>o.pickerId===x.id&&o.status==='accepted'&&!o.pick?.completedAt).length} open tasks</small></span>${x.status!=='removed'?`<button class="button secondary compact" data-commerce="remove-picker" data-id="${esc(x.id)}">Remove access</button>`:''}</div>${x.status==='active'?`<div class="row-actions"><label>Pay type <select data-picker-plan-type="${esc(x.id)}"><option value="monthly" ${x.payPlan?.type==='monthly'?'selected':''}>Monthly</option><option value="daily" ${x.payPlan?.type==='daily'?'selected':''}>Daily</option></select></label><label>Rate ₹ <input class="form-control compact" data-picker-plan-rate="${esc(x.id)}" type="number" min="1" value="${esc(x.payPlan?.rate||'')}"></label><button class="button secondary compact" data-commerce="set-picker-pay" data-id="${esc(x.id)}">Save pay plan</button></div>`:''}`).join('')||'<p>No staff yet.</p>'}<button class="button primary" data-route="shopPickerPay">Review picker pay</button></section>`;
  if(route==='shopPickerPay')return PickerPay.sellerPickerPayScreen(s,ws);
  if(route==='shopCatalog')return `${head('Products and stock','Demo catalogue owned by this store')}${prods.map(x=>`<section class="panel order-card"><h2>${esc(x.name)} · ${inr(x.price)}</h2><p>${esc(x.size)} · ${esc(x.stock)}</p><button class="button secondary" data-commerce="toggle-stock" data-id="${esc(x.id)}">${x.stock==='In stock'?'Mark unavailable':'Mark in stock'}</button></section>`).join('')}`;
  if(route==='shopEarnings')return `${head('Store settlements','Product commission: 8% in this mock policy. Delivery fee is separate.',`<button class="button secondary" data-route="shopPickerPay">Picker Pay</button>`)}<p class="info-banner">Picker wages are your store expense. Track and record them separately in Picker Pay.</p>${os.map(o=>`<section class="panel order-card"><h2>${esc(o.id)} · ${esc(o.settlementStatus||'Not eligible')}</h2><p>Products ${inr(o.itemTotal)} − commission ${inr(o.feeBreakdown?.productCommission||0)} = seller due <b>${inr(o.sellerDue||0)}</b></p><p class="muted">Eligible ${o.settlementEligibleAt?new Date(o.settlementEligibleAt).toLocaleDateString('en-IN'):'after delivery'} · bank ${esc(p.bank)}</p></section>`).join('')||'<section class="panel">No settlements yet.</section>'}`;
  if(route==='shopProfile')return `${head('Store profile',p.name)}<section class="panel"><p>Status: ${esc(p.status)} · Payout bank: ${esc(p.bank)}</p><p>Courier pickup: ${esc(p.pickupAddress||'Not set')}</p><button class="button primary" data-route="shopTeam">Manage store pickers</button><p>Your store sees only its own products, orders and payout records. Admin reviews approvals and suspensions.</p></section>`;
 }
 if(pickerRole(ws)){
  const store=pickerStore(ws),p=partner(s,store),os=visibleOrders(s,ws),active=currentPicker(s,ws);
  if(route==='home')return `${head(`Hi ${esc(active?.name||'Picker')}`,`Pick tasks for ${p.name}`)}<div class="metrics"><div class="metric"><span>Ready to pick</span><b>${os.filter(o=>o.status==='accepted'&&!o.pick?.completedAt).length}</b></div><div class="metric"><span>Completed</span><b>${os.filter(o=>o.pick?.completedAt).length}</b></div></div>${active?.status==='invited'?'<p class="info-banner">Accept your invitation in Profile to access orders.</p>':''}<button class="button primary" data-route="pickTasks">Open pick tasks</button><button class="button secondary" data-route="pickEarnings">My shifts and earnings</button>`;
  if(route==='pickTasks')return `${head('Pick tasks',`Only orders assigned to ${active?.name||'this picker'} at ${p.name}. Confirm each item and quantity.`)}${active?.status==='invited'?'<p class="info-banner">Accept your store invitation in Profile first.</p>':''}${os.filter(o=>['accepted','item_review','ready_for_pickup'].includes(o.status)).map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No pick tasks assigned right now.</section>'}`;
  if(route==='pickEarnings')return PickerPay.pickerPayScreen(s,ws);
  if(route==='pickProfile')return `${head('Picker profile',active?.name||'Picker')}<section class="panel"><p><b>Demo picker account</b></p><label>Choose picker for this store <select data-picker-account>${staffFor(s,store).filter(x=>x.status!=='removed').map(x=>`<option value="${esc(x.id)}" ${x.id===active?.id?'selected':''}>${esc(x.name)} · ${esc(x.status)}</option>`).join('')}</select></label><button class="button secondary" data-commerce="select-picker">Switch picker</button><p>Assigned store: ${esc(p.name)} · ${esc(p.pickupAddress)}</p><p>Account: ${esc(active?.mobile||'Not selected')} · ${esc(active?.status||'Unavailable')}</p>${active?.status==='invited'?'<button class="button primary" data-commerce="accept-picker">Accept store invitation</button>':''}<button class="button secondary" data-route="pickEarnings">My shifts and earnings</button><p>Your checklist is shared with the seller. Customer delivery and payment are managed by other roles.</p></section>`;
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
  const os=orders(s),issues=os.filter(o=>['delivery_issue','return_requested','item_review'].includes(o.status)||o.status==='ready_for_pickup'&&(!o.deliveryAssignment||o.deliveryAssignment.status==='offered'&&clock()-o.deliveryAssignment.offeredAt>=10*60000));
  const metrics=`<div class="metrics"><div class="metric"><span>Orders</span><b>${os.length}</b></div><div class="metric"><span>Issues</span><b>${issues.length}</b></div><div class="metric"><span>COD to reconcile</span><b>${os.filter(o=>o.codCash?.status==='handed_over').length}</b></div><div class="metric"><span>Pending settlement</span><b>${os.filter(o=>o.settlementStatus==='pending').length}</b></div></div>`;
  if(route==='commerceOps')return `${head('Shop operations','Choose the area to review')}${metrics}<div class="grid two">${[['commerceOrders','Orders'],['commercePartners','Partners'],['commercePayments','Payments'],['commerceIssues','Issues']].map(([r,t])=>`<button class="button secondary" data-route="${r}">${t}</button>`).join('')}</div>`;
  if(route==='commerceOrders')return `${head('Grocery orders','All store packages and their delivery history')}${metrics}${os.map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No orders yet.</section>'}`;
  if(route==='commercePartners')return `${head('Grocery partners','Review sellers, pickers and delivery partners')}<section class="panel"><h2>Sellers</h2>${Object.entries(s.shopPartners||{}).map(([key,p])=>`<div class="market-row"><span class="market-icon">🏪</span><span><b>${esc(p.name)}</b><small>${esc(p.status)} · ${esc(p.bank)}</small></span><button class="button secondary compact" data-commerce="${p.status==='approved'?'suspend-store':'approve-store'}" data-id="${esc(key)}">${p.status==='approved'?'Suspend':'Approve'}</button></div>`).join('')}<h2>Pickers</h2>${(s.pickerStaff||[]).map(x=>`<div class="market-row"><span class="market-icon">▦</span><span><b>${esc(x.name)}</b><small>${esc(partner(s,x.store)?.name||'Store unavailable')} · ${esc(x.status)} · ${orders(s).filter(o=>o.pickerId===x.id&&o.status==='accepted').length} active pick task(s)</small></span></div>`).join('')}<h2>Delivery partners</h2>${Object.entries(s.deliveryPartners||{}).map(([key,p])=>`<div class="market-row"><span class="market-icon">🛵</span><span><b>${esc(p.name)}</b><small>${esc(p.status)} · ${p.available?'Available':'Offline'}</small></span><button class="button secondary compact" data-commerce="${p.status==='approved'?'suspend-driver':'approve-driver'}" data-id="${esc(key)}">${p.status==='approved'?'Suspend':'Approve'}</button></div>`).join('')}</section>`;
  if(route==='commercePayments')return `${head('Grocery payments','COD, refunds, seller settlements and delivery payouts',`<button class="button secondary" data-commerce="advance-clock">Demo: advance 7 days</button>`)}${metrics}<section class="panel"><h2>Store-funded Picker Pay · tracking only</h2>${(s.pickerPayRuns||[]).map(r=>`<p><b>${esc(staffFor(s,r.store).find(p=>p.id===r.pickerId)?.name||'Picker')}</b> · ${esc(partner(s,r.store)?.name||'Store')} · ${esc(r.period)} · ${inr(r.amount)} · ${esc(r.status)}${r.status==='paid'?` · ${esc(r.method)} ${esc(r.reference)}`:''}</p>`).join('')||'<p>No picker pay runs yet.</p>'}<small>Seller records picker payment outside the platform. It is separate from customer receipts and marketplace settlement.</small></section>${os.filter(o=>o.cod||o.settlementStatus==='pending'||o.deliveryPayoutStatus==='pending'||['refund_pending','refund_initiated'].includes(o.paymentStatus)||s.ledger.some(e=>e.orderId===o.id&&e.type==='refund')).map(o=>`<div>${orderCard(o,ws,s)}<section class="panel"><h3>Payment records · ${esc(o.id)}</h3>${s.ledger.filter(e=>e.orderId===o.id&&['customer_payment','refund','seller_settlement','delivery_earning','settlement_adjustment'].includes(e.type)).map(e=>`<p><b>${esc(e.type.replaceAll('_',' '))}</b> · ${inr(e.amount)} · ${esc(e.status)} · Ref ${esc(e.payoutReference||e.reference||'Pending')} ${e.expectedBy?`· Expected ${new Date(e.expectedBy).toLocaleDateString('en-IN')}`:''}</p>`).join('')||'<p>No payment record yet.</p>'}</section></div>`).join('')||'<section class="panel">No payment actions waiting.</section>'}`;
  if(route==='commerceIssues')return `${head('Grocery issues','Review returns, unavailable items and delivery exceptions')}${metrics}${issues.map(o=>orderCard(o,ws,s)).join('')||'<section class="panel">No open issues.</section>'}`;
 }
 return '';
}
export function bind(root,api){
 root.querySelectorAll('[data-commerce]').forEach(b=>b.onclick=()=>{
  const s=api.getState(),ws=s.currentWorkspace,o=orders(s).find(x=>x.id===b.dataset.id),action=b.dataset.commerce;
  let error='';
 if(['accept','pack'].includes(action))error=sellerAction(s,ws,b.dataset.id,action,action==='pack'?root.querySelector(`[data-bags="${b.dataset.id}"]`)?.value||'':'');
  else if(action==='invite-picker')error=invitePicker(s,ws,root.querySelector('[data-picker-name]')?.value,root.querySelector('[data-picker-mobile]')?.value);
  else if(action==='select-picker')error=selectPicker(s,ws,root.querySelector('[data-picker-account]')?.value);
  else if(action==='accept-picker')error=acceptPickerInvite(s,ws);
  else if(action==='assign-picker')error=assignPicker(s,ws,b.dataset.id,root.querySelector(`[data-picker-assignment="${b.dataset.id}"]`)?.value);
  else if(action==='remove-picker')error=removePicker(s,ws,b.dataset.id);
  else if(action==='set-picker-pay')error=PickerPay.setPickerPayPlan(s,ws,b.dataset.id,root.querySelector(`[data-picker-plan-type="${b.dataset.id}"]`)?.value,root.querySelector(`[data-picker-plan-rate="${b.dataset.id}"]`)?.value);
  else if(action==='start-picker-shift')error=PickerPay.startPickerShift(s,ws);
  else if(action==='end-picker-shift')error=PickerPay.endPickerShift(s,ws);
  else if(action==='approve-picker-shift')error=PickerPay.approvePickerShift(s,ws,b.dataset.id);
  else if(action==='create-picker-pay')error=PickerPay.createPickerPayRun(s,ws,b.dataset.id);
  else if(action==='adjust-picker-pay')error=PickerPay.adjustPickerPayRun(s,ws,b.dataset.id,root.querySelector(`[data-picker-adjustment="${b.dataset.id}"]`)?.value,root.querySelector(`[data-picker-adjustment-reason="${b.dataset.id}"]`)?.value);
  else if(action==='approve-picker-pay')error=PickerPay.approvePickerPayRun(s,ws,b.dataset.id);
  else if(action==='record-picker-payment')error=PickerPay.recordPickerPayment(s,ws,b.dataset.id,root.querySelector(`[data-picker-payment-method="${b.dataset.id}"]`)?.value,root.querySelector(`[data-picker-payment-ref="${b.dataset.id}"]`)?.value);
  else if(action.startsWith('pick-'))error=pickerAction(s,ws,b.dataset.id,action.slice(5),b.dataset.product);
  else if(action==='unavailable')error=unavailableItem(s,ws,b.dataset.id,b.dataset.product);
  else if(action==='suggest-replacement')error=suggestReplacement(s,ws,b.dataset.id,root.querySelector(`[data-replacement="${b.dataset.id}"]`)?.value);
  else if(action==='reject'){const reason=prompt('Why is this order rejected?');if(reason===null)return;error=sellerAction(s,ws,b.dataset.id,'reject',reason);}
  else if(action==='toggle-stock'){if(!sellerRole(ws))error='Access denied.';else{const p=s.products.find(x=>x.id===b.dataset.id&&x.fulfilmentPartner===partner(s,ws)?.name);if(!p)error='Product access denied.';else p.stock=p.stock==='In stock'?'Unavailable':'In stock';}}
  else if(action==='toggle-availability'){if(!driverRole(ws))error='Access denied.';else driver(s,ws).available=!driver(s,ws).available;}
  else if(['accept-job','decline-job','pickup','deliver','remit','issue'].includes(action))error=deliveryAction(s,ws,b.dataset.id,({'accept-job':'accept','decline-job':'decline'})[action]||action,action==='issue'?root.querySelector(`[data-issue="${b.dataset.id}"]`)?.value||'':root.querySelector(`[data-code="${b.dataset.id}"]`)?.value||'',root.querySelector(`[data-collected-bags="${b.dataset.id}"]`)?.value||'');
  else if(action==='location')error=updateLocation(s,ws,b.dataset.id,root.querySelector(`[data-location="${b.dataset.id}"]`)?.value||'');
  else if(ws!=='admin')error='Admin access required.';
  else if(action==='reconcile')error=reconcileCash(s,b.dataset.id);
  else if(action==='retry')error=retryDelivery(s,b.dataset.id);
  else if(action==='cancel-failed')error=cancelFailedDelivery(s,b.dataset.id);
  else if(action==='expire-offer')error=expireOffer(s,b.dataset.id);
  else if(action==='settle')error=settle(s,b.dataset.id);
  else if(action==='pay-driver')error=payDelivery(s,b.dataset.id);
  else if(['suspend-store','approve-store','suspend-driver','approve-driver'].includes(action))error=setPartnerStatus(s,action.endsWith('store')?'store':'delivery',b.dataset.id,action.startsWith('approve')?'approved':'suspended');
  else if(action==='reassign'){const next=Object.values(s.deliveryPartners).find(p=>p.id!==o?.deliveryAssignment?.partnerId&&p.available&&p.status==='approved');error=next?assign(s,b.dataset.id,next.id):'No other partner available.';}
  else if(action==='approve-return'||action==='decline-return')error=resolveReturn(s,b.dataset.id,action==='approve-return');
  else if(action==='advance-clock')advanceDemoClock(s);
  if(error)return api.toast(error);api.save();api.render();api.toast('Updated');
 });
}
