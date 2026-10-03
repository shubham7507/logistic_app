// Grocery staff and assignment rules for the single-browser demo.
const storeRole=ws=>['grocery','groceryFresh'].includes(ws);
const pickerRole=ws=>['picker','pickerFresh'].includes(ws);
export const pickerWorkspace=store=>store==='grocery'?'picker':store==='groceryFresh'?'pickerFresh':null;
export const storeWorkspace=picker=>picker==='picker'?'grocery':picker==='pickerFresh'?'groceryFresh':null;
export const staffFor=(s,store)=>s.pickerStaff?.filter(p=>p.store===store)||[];
export const currentPicker=(s,ws)=>pickerRole(ws)?staffFor(s,storeWorkspace(ws)).find(p=>p.id===s.activePicker?.[ws]):null;
const audit=(s,actor,event)=>{(s.audit||=[]).unshift({id:`AUD-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,event,actor,workspace:actor,at:new Date().toLocaleString('en-IN')})};
const alert=(s,to,route,text,ref,pickerId)=>{(s.notifications||=[]).unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,to,route,text,ref,pickerId,priority:'action',at:new Date().toLocaleString('en-IN'),read:false})};
export function invitePicker(s,ws,name,mobile){
 if(!storeRole(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 name=String(name||'').trim();mobile=String(mobile||'').trim();
 if(name.length<2)return 'Enter the picker name.';
 if(!/^\d{10}$/.test(mobile))return 'Enter a 10-digit mobile number.';
 if((s.pickerStaff||[]).some(p=>p.mobile===mobile&&p.status!=='removed'))return 'This mobile already has an active or pending grocery invitation.';
 const p={id:`PICK-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,store:ws,name,mobile,status:'invited',invitedBy:s.shopPartners[ws].name,invitedAt:new Date().toISOString()};
 (s.pickerStaff||=[]).push(p);audit(s,s.shopPartners[ws].name,`Invited ${name} as picker for ${s.shopPartners[ws].name}`);
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
 p.status='active';p.joinedAt=new Date().toISOString();audit(s,p.name,`Joined ${s.shopPartners[p.store].name} as picker`);
 alert(s,p.store,'shopTeam',`${p.name} accepted the store picker invitation`,p.id);
 return '';
}
export function pickerCanSee(s,ws,o){
 const p=currentPicker(s,ws),store=storeWorkspace(ws);
 return !!p&&p.status==='active'&&s.shopPartners?.[store]?.status==='approved'&&o.party===s.shopPartners[store].party&&o.pickerId===p.id;
}
export function assignPicker(s,ws,orderId,pickerId){
 if(!storeRole(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 const o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners[ws].party);
 if(!o||o.status!=='accepted'||o.pick?.completedAt)return 'Only an accepted, unfinished store order can be assigned.';
 const p=staffFor(s,ws).find(x=>x.id===pickerId&&x.status==='active');if(!p)return 'Choose an active picker from this store.';
 if(o.pick?.mode==='self')return 'The seller has already started picking this order.';
 if(o.pickerId===p.id)return 'This order is already assigned to that picker.';
 const prior=staffFor(s,ws).find(x=>x.id===o.pickerId);
 o.pickerId=p.id;o.pick=null;
 const event=prior?`Pick task reassigned from ${prior.name} to ${p.name}`:`Pick task assigned to ${p.name}`;
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:s.shopPartners[ws].name,text:event});audit(s,s.shopPartners[ws].name,`${o.id}: ${event}`);
 alert(s,pickerWorkspace(ws),'pickTasks',`${p.name}: ${event} · ${o.id}`,o.id,p.id);
 if(prior)alert(s,pickerWorkspace(ws),'pickTasks',`${prior.name}: ${o.id} was reassigned`,o.id,prior.id);
 return '';
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
