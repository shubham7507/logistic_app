// Order-scoped communication. Phone relay is deliberately unavailable in the static demo:
// a tel: link with a personal number cannot be expired after delivery.
import {esc} from './ops.js';
import {SELLER_WORKSPACES,STORE_BY_MANAGER} from './seller-roles.js';

const closed=o=>['cancelled','delivered','collected','return_requested','returned'].includes(o.status);
const storeKey=(s,o)=>Object.keys(s.shopPartners||{}).find(k=>s.shopPartners[k].party===o.party);
export function contactTargets(s,o,ws){
 if(!o||closed(o))return [];
 const store=storeKey(s,o),seller=ws===store||STORE_BY_MANAGER[ws]===store;
 const courier=Object.entries(s.deliveryPartners||{}).find(([,d])=>d.id===o.deliveryAssignment?.partnerId);
 const driver=!!courier&&ws===courier[0]&&['accepted','picked_up'].includes(o.deliveryAssignment?.status);
 const customer=ws==='personal'&&(o.channel!=='counter_delivery'||o.customerId===s.person?.id);
 if(customer)return [store?{key:'store',label:s.shopPartners[store].name}:null,courier&&['accepted','picked_up'].includes(o.deliveryAssignment?.status)?{key:'courier',label:courier[1].name}:null].filter(Boolean);
 if(seller)return [o.channel!=='counter_delivery'?{key:'customer',label:o.customer||'Customer'}:null,courier&&['accepted','picked_up'].includes(o.deliveryAssignment?.status)?{key:'courier',label:courier[1].name}:null].filter(Boolean);
 if(driver)return [{key:'store',label:s.shopPartners[store]?.name||'Store'},{key:'customer',label:o.customer||'Customer'}];
 return [];
}
const pair=(role,target)=>[role,target].sort().join(':');
const roleFor=(s,ws,o)=>ws==='personal'?'customer':SELLER_WORKSPACES.includes(ws)||STORE_BY_MANAGER[ws]?'store':`courier-${s.deliveryPartners?.[ws]?.id||'unknown'}`;
const peerFor=(o,target)=>target==='courier'?`courier-${o.deliveryAssignment?.partnerId||'unknown'}`:target;
export function sendOrderMessage(s,ws,id,target,body){
 const o=(s.customerOrders||[]).find(x=>x.id===id),peer=contactTargets(s,o,ws).find(x=>x.key===target),message=String(body||'').trim();
 if(!peer)return 'This order contact is closed or unavailable.';
 if(!message||message.length>300)return 'Enter a message of 1 to 300 characters.';
 const role=roleFor(s,ws,o);
 (o.contactMessages||=[]).push({pair:pair(role,peerFor(o,target)),from:ws==='personal'?'customer':role==='store'?'store':s.deliveryPartners[ws].name,body:message,at:new Date().toLocaleString('en-IN')});
 const to=target==='customer'?'personal':target==='store'?storeKey(s,o):Object.keys(s.deliveryPartners||{}).find(k=>s.deliveryPartners[k].id===o.deliveryAssignment?.partnerId);
 if(to)(s.notifications||=[]).unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,to,ref:o.id,text:`${o.id}: New order message`,route:target==='customer'?'orderTracking':target==='store'?'shopOrders':'deliveryJobs',priority:'action',at:new Date().toLocaleString('en-IN'),read:false});
 return '';
}
export function contactPanel(s,o,ws){
 const targets=contactTargets(s,o,ws),role=roleFor(s,ws,o);
 if(!targets.length)return '';
 return `<details class="order-contact"><summary>Message about this package</summary><p class="muted">Messages work in this browser demo. Normal calls need a temporary masked phone relay when a backend is connected.</p>${targets.map(t=>`<div class="contact-conversation"><strong>${esc(t.label)}</strong><div>${(o.contactMessages||[]).filter(m=>m.pair===pair(role,peerFor(o,t.key))).map(m=>`<p><small>${esc(m.at)} · ${esc(m.from)}:</small> ${esc(m.body)}</p>`).join('')||'<p class="muted">No messages yet.</p>'}</div><label>Message <input class="form-control" maxlength="300" data-order-message="${esc(o.id)}|${t.key}" placeholder="Type an order-related message"></label><button class="button secondary compact" data-order-contact="send" data-id="${esc(o.id)}" data-target="${t.key}">Send message</button> <button class="button secondary compact" data-order-contact="call" data-id="${esc(o.id)}" data-target="${t.key}">Normal call</button></div>`).join('')}</details>`;
}
export function bind(root,api){
 root.querySelectorAll('[data-order-contact]').forEach(b=>b.onclick=()=>{
  const s=api.getState(),o=(s.customerOrders||[]).find(x=>x.id===b.dataset.id),ws=s.currentWorkspace;
  if(!contactTargets(s,o,ws).some(t=>t.key===b.dataset.target))return api.toast('This order contact is closed or unavailable.');
  if(b.dataset.orderContact==='call')return api.toast('Normal calls need a temporary masked number. This static demo cannot safely place or expire a real call.');
  const input=root.querySelector(`[data-order-message="${b.dataset.id}|${b.dataset.target}"]`);
  const error=sendOrderMessage(s,ws,b.dataset.id,b.dataset.target,input?.value);
  if(error)return api.toast(error);
  api.save();api.render();api.toast('Message sent for this order.');
 });
}
