// Seller staff and assignment rules for the single-browser demo.
import {SELLER_WORKSPACES,MANAGER_BY_STORE,WORKER_BY_STORE,STORE_BY_MANAGER,STORE_BY_WORKER} from './seller-roles.js';
import {defaultBranch,selectedBranch,staffAt,staffBranches} from './seller-branches.js';
const storeRole=ws=>SELLER_WORKSPACES.includes(ws);
const managerStore=ws=>STORE_BY_MANAGER[ws]||null;
const canAssign=(s,ws)=>storeRole(ws)||!!managerStore(ws)&&(s.storeManagers||[]).some(m=>m.id===s.activeStoreManager?.[ws]&&m.store===managerStore(ws)&&m.status==='active');
const pickerRole=ws=>!!STORE_BY_WORKER[ws];
export const pickerWorkspace=store=>WORKER_BY_STORE[store]||null;
export const storeWorkspace=picker=>STORE_BY_WORKER[picker]||null;
export const staffFor=(s,store)=>s.pickerStaff?.filter(p=>p.store===store)||[];
export const currentPicker=(s,ws)=>pickerRole(ws)?staffFor(s,storeWorkspace(ws)).find(p=>p.id===s.activePicker?.[ws]):null;
const audit=(s,actor,event)=>{(s.audit||=[]).unshift({id:`AUD-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,event,actor,workspace:actor,at:new Date().toLocaleString('en-IN')})};
const alert=(s,to,route,text,ref,pickerId)=>{(s.notifications||=[]).unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,to,route,text,ref,pickerId,priority:'action',at:new Date().toLocaleString('en-IN'),read:false})};
export function invitePicker(s,ws,name,mobile){
 if(!storeRole(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 name=String(name||'').trim();mobile=String(mobile||'').trim();
 if(name.length<2)return 'Enter the picker name.';
 if(!/^\d{10}$/.test(mobile))return 'Enter a 10-digit mobile number.';
 if((s.pickerStaff||[]).some(p=>p.mobile===mobile&&p.status!=='removed'))return 'This mobile already has an active or pending store invitation.';
 const p={id:`PICK-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,store:ws,name,mobile,role:ws==='electrical'||ws==='fashion'?'fulfilment':'picker',branchIds:[selectedBranch(s,ws)],status:'invited',invitedBy:s.shopPartners[ws].name,invitedAt:new Date().toISOString()};
 (s.pickerStaff||=[]).push(p);audit(s,s.shopPartners[ws].name,`Invited ${name} as store worker for ${s.shopPartners[ws].name}`);
 alert(s,pickerWorkspace(ws),'pickProfile',`${name}: invitation to join ${s.shopPartners[ws].name}`,p.id,p.id);
 return '';
}
export function selectPicker(s,ws,id){
 if(!pickerRole(ws)||!staffFor(s,storeWorkspace(ws)).some(p=>p.id===id&&p.status!=='removed'))return 'Picker account unavailable for this store.';
 (s.activePicker||={})[ws]=id;return '';
}
export function acceptPickerInvite(s,ws){
 const p=currentPicker(s,ws);if(!p||p.status!=='invited')return 'No pending invitation for this picker.';
 if(s.shopPartners?.[p.store]?.status!=='approved')return 'Store is not approved.';
 p.status='active';p.joinedAt=new Date().toISOString();audit(s,p.name,`Joined ${s.shopPartners[p.store].name} as store worker`);
 alert(s,p.store,'shopTeam',`${p.name} accepted the store staff invitation`,p.id);
 return '';
}
export function pickerCanSee(s,ws,o){
 const p=currentPicker(s,ws),store=storeWorkspace(ws);
 return !!p&&p.status==='active'&&s.shopPartners?.[store]?.status==='approved'&&o.party===s.shopPartners[store].party&&staffAt(s,p,o.branchId||defaultBranch(s,store))&&o.pickerId===p.id;
}
export function assignPicker(s,ws,orderId,pickerId){
 const store=managerStore(ws)||ws;
 if(!canAssign(s,ws)||s.shopPartners?.[store]?.status!=='approved')return 'Approved store access required.';
 const o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners[store].party);
 if(!o||o.status!=='accepted'||o.pick?.completedAt)return 'Only an accepted, unfinished store order can be assigned.';
 const p=staffFor(s,store).find(x=>x.id===pickerId&&x.status==='active'&&staffAt(s,x,o.branchId||defaultBranch(s,store))&&(!x.offboarding?.effectiveDate||x.offboarding.effectiveDate>=new Date().toISOString().slice(0,10)));if(!p)return 'Choose an active picker from this store.';
 if(o.pick?.mode==='self')return 'The seller has already started picking this order.';
 if(o.pickerId===p.id)return 'This order is already assigned to that picker.';
 const prior=staffFor(s,store).find(x=>x.id===o.pickerId);
 o.pickerId=p.id;o.pick=null;o.pickerOffer=null;
 const event=prior?`Pick task reassigned from ${prior.name} to ${p.name}`:`Pick task assigned to ${p.name}`;
 const actor=storeRole(ws)?s.shopPartners[store].name:(s.storeManagers||[]).find(x=>x.id===s.activeStoreManager?.[ws])?.name||'Store manager';
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor,text:event});audit(s,actor,`${o.id}: ${event}`);
 alert(s,pickerWorkspace(store),'pickTasks',`${p.name}: ${event} · ${o.id}`,o.id,p.id);
 if(prior)alert(s,pickerWorkspace(store),'pickTasks',`${prior.name}: ${o.id} was reassigned`,o.id,prior.id);
 return '';
}
export function releasePickTask(s,ws,orderId){
 const store=managerStore(ws)||ws,o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners?.[store]?.party);
 if(!canAssign(s,ws)||!o||o.status!=='accepted'||o.pick?.startedAt)return 'Only an unstarted store pick task can be released.';
 const old=o.pickerId;o.pickerId=null;o.pickerOffer=null;o.pick=null;
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:s.shopPartners[store].name,text:'Store took back pick task for manual picking'});
 if(old)alert(s,pickerWorkspace(store),'pickTasks',`${o.id} is now being picked in store`,o.id,old);
 return '';
}
export function availablePickers(s,store,now=new Date(),branchId=null){
 const day=now.toISOString().slice(0,10),time=now.toISOString().slice(11,16);
 return staffFor(s,store).filter(p=>p.status==='active'&&(!branchId||staffAt(s,p,branchId))&&(!p.offboarding?.effectiveDate||p.offboarding.effectiveDate>=day)&&!p.onBreak&&
  (s.pickerShifts||[]).some(x=>x.store===store&&(!branchId||x.branchId===branchId||!x.branchId&&branchId===defaultBranch(s,store))&&x.pickerId===p.id&&x.status==='open'&&x.date===day)&&
  !(s.pickerSchedules||[]).some(x=>x.store===store&&x.pickerId===p.id&&x.date===day&&['cover_requested','cancelled'].includes(x.status))&&
  (s.pickerSchedules||[]).filter(x=>x.store===store&&x.pickerId===p.id&&x.date===day&&x.status!=='cancelled').every(x=>x.start<=time&&time<x.end)&&
  (s.customerOrders||[]).filter(o=>o.pickerId===p.id&&['accepted','item_review'].includes(o.status)&&!o.pick?.completedAt).length<3);
}
export function autoAssignPicker(s,store,orderId,excluded=[]){
 const o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners?.[store]?.party);
 if(!o||o.status!=='accepted'||o.pick?.startedAt)return 'Order is unavailable for automatic assignment.';
 const eligible=availablePickers(s,store,new Date(),o.branchId||defaultBranch(s,store)).filter(p=>!excluded.includes(p.id));
 eligible.sort((a,b)=>{
  const load=p=>(s.customerOrders||[]).filter(x=>x.pickerId===p.id&&['accepted','item_review'].includes(x.status)&&!x.pick?.completedAt).length;
  return load(a)-load(b)||String(a.joinedAt||'').localeCompare(String(b.joinedAt||''))||a.id.localeCompare(b.id);
 });
 const p=eligible[0];if(!p){o.pickerId=null;o.pickerOffer=null;alert(s,store,'shopOrders',`${o.id}: no on-shift worker available; assign manually or prepare in store`,o.id);return 'No on-shift picker available.';}
 const old=o.pickerId;o.pickerId=p.id;o.pick=null;o.pickerOffer={pickerId:p.id,status:'offered',offeredAt:Date.now(),expiresAt:Date.now()+2*60000};
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:'MoveAI',text:`Pick task offered to ${p.name}`});
 alert(s,pickerWorkspace(store),'pickTasks',`${p.name}: accept pick task ${o.id}`,o.id,p.id);
 if(old&&old!==p.id)alert(s,pickerWorkspace(store),'pickTasks',`${o.id} was offered to another picker`,o.id,old);
 return '';
}
export function respondPickOffer(s,ws,orderId,accept){
 const p=currentPicker(s,ws),store=storeWorkspace(ws),o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners?.[store]?.party);
 if(!p||p.status!=='active'||!o||o.status!=='accepted'||o.pickerId!==p.id||o.pickerOffer?.status!=='offered')return 'This pick offer is no longer available.';
 if(Date.now()>=o.pickerOffer.expiresAt)return 'This pick offer expired. Ask the store to reoffer it.';
 if(accept){if(!availablePickers(s,store,new Date(),o.branchId||defaultBranch(s,store)).some(x=>x.id===p.id))return 'Start your shift and end your break before accepting.';o.pickerOffer.status='accepted';o.pickerOffer.respondedAt=Date.now();(o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:p.name,text:'Pick task accepted'});return '';}
 o.pickerOffer.status='declined';(o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:p.name,text:'Pick task declined'});
 autoAssignPicker(s,store,orderId,[p.id]);return '';
}
export function setPickerBreak(s,ws,onBreak){
 const p=currentPicker(s,ws),store=storeWorkspace(ws);
 if(!p||p.status!=='active')return 'Active picker required.';
 if(!onBreak&&!(s.pickerShifts||[]).some(x=>x.pickerId===p.id&&x.store===store&&x.status==='open'))return 'Start a shift before becoming available.';
 p.onBreak=!!onBreak;return '';
}
export function reofferExpiredPick(s,ws,orderId){
 const store=managerStore(ws)||ws,o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners?.[store]?.party);
 if(!canAssign(s,ws)||!o||o.pickerOffer?.status!=='offered'||Date.now()<o.pickerOffer.expiresAt)return 'No expired pick offer to reassign.';
 const old=o.pickerId;(o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:'MoveAI',text:'Pick offer timed out'});
 const result=autoAssignPicker(s,store,orderId,[old]);return result==='No on-shift picker available.'?'':result;
}
export function removePicker(s,ws,id){
 if(!storeRole(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 const p=staffFor(s,ws).find(x=>x.id===id&&x.status!=='removed');if(!p)return 'Picker is unavailable.';
 p.status='removed';p.removedAt=new Date().toISOString();
 for(const shift of s.pickerShifts||[])if(shift.pickerId===id&&shift.status==='open'){shift.status='submitted';shift.endAt=p.removedAt;shift.note='Closed when store removed picker access';}
 let released=0;
 for(const o of s.customerOrders||[]){if(o.pickerId!==id||!['accepted','item_review'].includes(o.status)||o.pick?.completedAt)continue;o.pickerId=null;o.pick=null;released++;(o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:s.shopPartners[ws].name,text:`${p.name} access removed; assign another picker or pick in store`})}
 audit(s,s.shopPartners[ws].name,`Removed ${p.name} picker access; ${released} open tasks released`);
 alert(s,ws,'shopOrders',`${p.name} access removed; ${released} open tasks need assignment`,p.id);
 return '';
}
