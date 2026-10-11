// Small, deterministic route planner for the browser demo. Each order remains its own package,
// payment and proof of delivery. Real travel times need backend routing before launch.
import {esc,inr} from './ops.js';
import * as Help from './help-desk.js';

const active=o=>['offered','accepted','picked_up'].includes(o.deliveryAssignment?.status)&&!['cancelled','delivered','returned','delivery_issue'].includes(o.status);
const distance=(a,b)=>a&&b&&a.length===2&&b.length===2?111*Math.hypot(a[0]-b[0],(a[1]-b[1])*Math.cos(a[0]*Math.PI/180)):null;
const close=(a,b,limit)=>distance(a,b)!=null&&distance(a,b)<=limit;
const pickup=o=>o.origin||null,drop=o=>o.dest||null;
const samePlace=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase()&&!!a;
const nearby=(a,b,limit,placeA,placeB)=>close(a,b,limit)||samePlace(placeA,placeB);
export function canAdd(s,candidate,partnerId){
 const assigned=(s.customerOrders||[]).filter(o=>o.id!==candidate.id&&o.deliveryAssignment?.partnerId===partnerId&&active(o));
 if((candidate.bagCount||1)>2||candidate.routeException?.kind==='oversized'&&candidate.routeException.status==='open')return 'Large package needs a suitable vehicle or a corrected packing plan.';
 if(candidate.routeException?.status==='open'||assigned.some(o=>o.routeException?.status==='open'))return 'Resolve the route problem before adding another package.';
 const capacity=Math.min(3,Math.max(1,Number(s.plusSettings?.capacityPerCourier||2)));
 if(assigned.length>=capacity)return 'Courier has reached the active order limit.';
 if(!assigned.length)return '';
 const all=[...assigned,candidate];
 if(all.reduce((n,o)=>n+(o.bagCount||1),0)>4)return 'Too many sealed packages for a two-wheeler. Split this route.';
 if(all.some(o=>o.bagCount>2||o.routeException?.kind==='oversized'))return 'Oversized package needs its own suitable vehicle.';
 for(const o of assigned){
  const sameCheckout=!!candidate.checkoutId&&candidate.checkoutId===o.checkoutId&&samePlace(candidate.address,o.address);
  const sameStore=candidate.party===o.party&&nearby(drop(candidate),drop(o),3,candidate.destLabel,o.destLabel);
  const scheduled=candidate.slot&&candidate.slot!=='express'&&o.slot&&o.slot!=='express';
  const nearStores=nearby(pickup(candidate),pickup(o),2.5,candidate.pickupAddress,o.pickupAddress);
  const nearCustomers=nearby(drop(candidate),drop(o),4,candidate.destLabel,o.destLabel);
  if(sameCheckout&&nearStores)continue;
  if(sameStore&&nearCustomers)continue;
  if(scheduled&&nearStores&&nearCustomers)continue;
  return 'Another pickup would delay an active delivery. Offer this package to a different courier.';
 }
 return '';
}
export function routeFor(s,partnerId){
 const os=(s.customerOrders||[]).filter(o=>o.deliveryAssignment?.partnerId===partnerId&&active(o));
 const accepted=os.filter(o=>o.deliveryAssignment.status==='accepted');
 const picked=os.filter(o=>o.deliveryAssignment.status==='picked_up');
 const offers=os.filter(o=>o.deliveryAssignment.status==='offered');
 const groups=new Map();for(const o of accepted){const key=o.pickupAddress||o.fulfilmentPartner||'Store';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}
 const drops=new Map();for(const o of picked){const key=o.address||'Customer address';if(!drops.has(key))drops.set(key,[]);drops.get(key).push(o);}
 const stops=[...[...drops].map(([address,orders])=>({kind:'drop',address,orders})),...[...groups].map(([address,orders])=>({kind:'pickup',address,orders}))];
 return {stops,offers,orders:os};
}
export function routePanel(s,partnerId){
 const r=routeFor(s,partnerId),earning=r.orders.reduce((n,o)=>n+(o.feeBreakdown?.deliveryPartnerEarning||35),0);
 return `<section class="panel"><h2>My route · ${r.orders.length} active package(s)</h2><p>Expected delivery earnings ${inr(earning)} · ${r.offers.length} offer(s) to review. Each package has its own pickup, delivery code and COD collection.</p>${r.stops.length?`<p class="info-banner"><b>Suggested next stop:</b> ${r.stops[0].kind==='pickup'?'Pick up':'Deliver to'} ${esc(r.stops[0].address)}</p><ol class="order-timeline">${r.stops.map(stop=>`<li><b>${stop.kind==='pickup'?'Pick up':'Deliver'}</b> · ${esc(stop.address)} · ${stop.orders.map(o=>esc(o.id)).join(', ')} · ${stop.orders.reduce((n,o)=>n+(o.bagCount||1),0)} package(s)</li>`).join('')}</ol>`:'<p>Accept an offer below to begin a route.</p>'}<p class="muted">Stop order is a suggestion in this mock; use each order card below to confirm the actual pickup or drop. New offers are checked for capacity and nearby stops.</p></section>`;
}
export function flagException(s,ws,id,kind,note=''){
 const o=(s.customerOrders||[]).find(x=>x.id===id),p=s.deliveryPartners?.[ws];
 if(!o||!p||o.deliveryAssignment?.partnerId!==p.id||!['accepted','picked_up'].includes(o.deliveryAssignment.status)||['cancelled','delivered'].includes(o.status))return 'Only an active assigned package can report a route problem.';
 if(!['store_delayed','missing_package','oversized','route_blocked'].includes(kind))return 'Choose a route problem.';
 o.routeException={kind,note:String(note).trim().slice(0,200),at:Date.now(),status:'open'};
 const result=Help.createCase(s,ws,{category:kind==='missing_package'?'missing_bag':kind,reference:id,description:`Courier reported ${kind.replaceAll('_',' ')} at ${o.fulfilmentPartner||'the store'}. ${String(note||'').trim()||'Admin review is needed before this package is collected.'}`});
 if(result.case)o.routeException.caseId=result.case.id;
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:p.name,text:`Route problem: ${kind.replaceAll('_',' ')}${o.routeException.note?` · ${o.routeException.note}`:''}`});
 const store=Object.keys(s.shopPartners||{}).find(k=>s.shopPartners[k].party===o.party);
 for(const [to,route] of [['admin','commerceIssues'],[store,'shopOrders']])if(to)(s.notifications||=[]).unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,to,ref:o.id,text:`${o.id}: Courier reported ${kind.replaceAll('_',' ')}`,route,priority:'action',at:new Date().toLocaleString('en-IN'),read:false});
 return '';
}
export function resolveException(s,id){
 const o=(s.customerOrders||[]).find(x=>x.id===id);
 if(!o?.routeException||o.routeException.status!=='open')return 'No open route problem to resolve.';
 o.routeException.status='resolved';o.routeException.resolvedAt=Date.now();
 if(o.routeException.caseId)Help.changeStatus(s,'admin',o.routeException.caseId,'resolved','The reported route problem was reviewed and corrected before pickup.');
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:'Admin',text:'Route problem resolved after review'});
 return '';
}
