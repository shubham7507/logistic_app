// Store manager, roster and staff exit rules for the grocery prototype.
import {currentPicker,staffFor,storeWorkspace,removePicker} from './grocery-staff.js';
import {pill} from './ops.js';
import {payPeriod,payRunFor,shiftsFor} from './grocery-picker-pay.js';
import {SELLER_WORKSPACES,STORE_BY_MANAGER,WORKER_BY_STORE} from './seller-roles.js';
import {selectedBranch,defaultBranch,staffAt,staffBranches,branch} from './seller-branches.js';

const owner=ws=>SELLER_WORKSPACES.includes(ws);
export const manager=ws=>!!STORE_BY_MANAGER[ws];
export const managerStore=ws=>STORE_BY_MANAGER[ws]||null;
export const activeManager=(s,ws)=>manager(ws)?(s.storeManagers||[]).find(m=>m.id===s.activeStoreManager?.[ws]&&m.store===managerStore(ws)):null;
export const operatorStore=ws=>owner(ws)?ws:managerStore(ws);
export const canOperate=(s,ws)=>owner(ws)||manager(ws)&&activeManager(s,ws)?.status==='active';
const who=(s,ws)=>owner(ws)?s.shopPartners?.[ws]?.name:activeManager(s,ws)?.name;
const stamp=()=>new Date().toISOString();
const today=()=>stamp().slice(0,10);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const audit=(s,ws,event)=>{(s.audit||=[]).unshift({id:`AUD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,event,actor:who(s,ws)||ws,workspace:ws,at:new Date().toLocaleString('en-IN')})};
const pickerWorkspace=store=>WORKER_BY_STORE[store];
const notify=(s,store,pickerId,route,text,ref)=>{(s.notifications||=[]).unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,to:pickerWorkspace(store),pickerId,route,ref,priority:'action',text,at:new Date().toLocaleString('en-IN'),read:false})};
const person=(s,store,id)=>staffFor(s,store).find(p=>p.id===id);

export function inviteStoreManager(s,ws,name,mobile){
 if(!owner(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Store owner access required.';
 name=String(name||'').trim();mobile=String(mobile||'').trim();
 if(name.length<2||!/^\d{10}$/.test(mobile))return 'Enter manager name and a 10-digit mobile number.';
 if((s.storeManagers||[]).some(m=>m.mobile===mobile&&m.status!=='removed'))return 'This manager mobile is already in use.';
 (s.storeManagers||=[]).push({id:`MGR-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,store:ws,name,mobile,branchIds:[selectedBranch(s,ws)],status:'invited',permissions:['orders','schedule','timecards'],invitedAt:stamp()});
 audit(s,ws,`Invited ${name} as store manager`);return '';
}
export function selectStoreManager(s,ws,id){
 if(!manager(ws)||!(s.storeManagers||[]).some(m=>m.id===id&&m.store===managerStore(ws)&&m.status!=='removed'))return 'Manager account is unavailable at this store.';
 (s.activeStoreManager||={})[ws]=id;return '';
}
export function acceptStoreManager(s,ws){
 const m=activeManager(s,ws);if(!m||m.status!=='invited')return 'No manager invitation to accept.';
 m.status='active';m.joinedAt=stamp();audit(s,ws,`${m.name} accepted manager invitation`);return '';
}
export function removeStoreManager(s,ws,id){
 if(!owner(ws))return 'Store owner access required.';
 const m=(s.storeManagers||[]).find(x=>x.id===id&&x.store===ws&&x.status!=='removed');if(!m)return 'Manager not found.';
 m.status='removed';m.removedAt=stamp();audit(s,ws,`Removed ${m.name} manager access`);return '';
}

export function publishPickerShift(s,ws,pickerId,day,start,end){
 const store=operatorStore(ws),p=person(s,store,pickerId);
 if(!canOperate(s,ws)||!store||s.shopPartners?.[store]?.status!=='approved')return 'Store owner or active manager access required.';
 if(!p||p.status!=='active'||!staffAt(s,p,selectedBranch(s,store))||p.offboarding?.effectiveDate&&p.offboarding.effectiveDate<day)return 'Choose an active picker available on this date.';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day))||day<today())return 'Choose today or a future date.';
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(start))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(end))||start>=end)return 'Enter a valid start and end time on the same day.';
 if((s.pickerSchedules||[]).some(x=>x.pickerId===pickerId&&x.date===day&&x.status!=='cancelled'))return 'This picker already has a shift on that date.';
 (s.pickerSchedules||=[]).push({branchId:selectedBranch(s,store),id:`PSCH-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,store,pickerId,date:day,start,end,status:'published',publishedAt:stamp(),publishedBy:who(s,ws)});
 audit(s,ws,`Published ${p.name} shift ${day} ${start}–${end}`);notify(s,store,p.id,'pickSchedule',`${p.name}: new shift ${day} ${start}–${end}`,p.id);return '';
}
export function respondPickerShift(s,ws,id,action){
 const p=currentPicker(s,ws),x=(s.pickerSchedules||[]).find(y=>y.id===id&&y.pickerId===p?.id);
 if(!p||p.status!=='active'||!x||!['published','confirmed'].includes(x.status))return 'This scheduled shift is unavailable.';
 if(action==='confirm'){x.status='confirmed';x.confirmedAt=stamp();return '';}
 if(action==='cover'){x.status='cover_requested';x.coverRequestedAt=stamp();return '';}
 return 'Choose confirm or request cover.';
}
export function reassignPickerShift(s,ws,id,newPickerId){
 const store=operatorStore(ws),x=(s.pickerSchedules||[]).find(y=>y.id===id&&y.store===store&&y.status==='cover_requested');
 if(!canOperate(s,ws)||!x)return 'Cover request unavailable for this store.';
 const p=person(s,store,newPickerId);if(!p||p.status!=='active'||!staffAt(s,p,x.branchId||defaultBranch(s,store))||p.id===x.pickerId)return 'Choose another active picker from this store.';
 if((s.pickerSchedules||[]).some(y=>y.id!==x.id&&y.pickerId===p.id&&y.date===x.date&&y.status!=='cancelled'))return 'Replacement picker already has a shift on this date.';
 if(shiftsFor(s,x.pickerId,x.date).some(y=>y.status==='open'))return 'The original picker is already working this shift.';
 const old=person(s,store,x.pickerId);x.history||=[];x.history.push({pickerId:x.pickerId,at:stamp(),reason:'Cover approved'});x.pickerId=p.id;x.status='published';x.publishedBy=who(s,ws);
 audit(s,ws,`Approved cover: ${old?.name||'Picker'} → ${p.name} on ${x.date}`);notify(s,store,p.id,'pickSchedule',`${p.name}: cover shift ${x.date} ${x.start}–${x.end}`,p.id);return '';
}

export function requestPickerTimeCorrection(s,ws,id,start,end,reason){
 const p=currentPicker(s,ws),x=(s.pickerShifts||[]).find(y=>y.id===id&&y.pickerId===p?.id);
 if(!p||!x||!['submitted','approved'].includes(x.status))return 'Completed shift for this picker not found.';
 if(payRunFor(s,p.id,payPeriod(p,x.date)))return 'Pay period has a run; ask the store for an adjustment.';
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(start))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(end))||start>=end||!String(reason||'').trim())return 'Enter valid times and a reason.';
 if((s.pickerTimeCorrections||[]).some(c=>c.shiftId===id&&c.status==='pending'))return 'A correction is already pending.';
 (s.pickerTimeCorrections||=[]).push({id:`PCOR-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,store:x.store,pickerId:p.id,shiftId:id,start,end,reason:String(reason).trim(),status:'pending',requestedAt:stamp()});return '';
}
export function decidePickerTimeCorrection(s,ws,id,approve){
 const store=operatorStore(ws),c=(s.pickerTimeCorrections||[]).find(x=>x.id===id&&x.store===store&&x.status==='pending');
 if(!canOperate(s,ws)||!c)return 'Pending correction unavailable for this store.';
 const x=(s.pickerShifts||[]).find(y=>y.id===c.shiftId);if(!x||payRunFor(s,x.pickerId,x.planType==='daily'?x.date:x.date.slice(0,7)))return 'Shift is already in a pay run.';
 c.status=approve?'approved':'declined';c.decidedAt=stamp();c.decidedBy=who(s,ws);
 if(approve){x.originalTime??={startAt:x.startAt,endAt:x.endAt};x.startAt=`${x.date}T${c.start}:00`;x.endAt=`${x.date}T${c.end}:00`;x.status='submitted';}
 audit(s,ws,`${approve?'Approved':'Declined'} time correction ${c.id}`);return '';
}

export function planPickerOffboarding(s,ws,id,day,reason){
 if(!owner(ws))return 'Store owner access required.';
 const p=person(s,ws,id);
 if(!p||p.status!=='active')return 'Choose an active picker at this store.';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day))||day<today()||!String(reason||'').trim())return 'Choose today or a future last day and give a reason.';
 p.offboarding={effectiveDate:day,reason:String(reason).trim(),plannedAt:stamp(),status:'planned'};audit(s,ws,`Planned ${p.name} offboarding on ${day}`);return '';
}
export function revokePickerAccess(s,ws,id){
 if(!owner(ws))return 'Store owner access required.';
 const p=person(s,ws,id);if(!p||!['active','invited'].includes(p.status))return 'Picker is not active.';
 const result=removePicker(s,ws,id);if(result)return result;
 p.offboarding={...p.offboarding,effectiveDate:today(),reason:p.offboarding?.reason||'Immediate access removal',status:'access_removed',revokedAt:stamp()};
 for(const x of s.pickerSchedules||[])if(x.pickerId===id&&x.date>=today()&&x.status!=='cancelled')x.status='cancelled';
 return '';
}
export function pickerExitChecklist(s,store,id){
 const p=person(s,store,id);if(!p)return null;
 const tasks=(s.customerOrders||[]).filter(o=>o.pickerId===id&&['accepted','item_review'].includes(o.status)&&!o.pick?.completedAt);
 const shifts=(s.pickerShifts||[]).filter(x=>x.pickerId===id&&x.status!=='approved');
 const unpaid=(s.pickerPayRuns||[]).filter(r=>r.pickerId===id&&r.status!=='paid');
 const unbilled=(s.pickerShifts||[]).filter(x=>x.pickerId===id&&x.status==='approved'&&!((s.pickerPayRuns||[]).some(r=>r.pickerId===id&&r.shiftIds?.includes(x.id))));
 const corrections=(s.pickerTimeCorrections||[]).filter(c=>c.pickerId===id&&c.status==='pending');
 return {tasks,shifts,unpaid,unbilled,corrections};
}
export function finalizePickerOffboarding(s,ws,id){
 if(!owner(ws))return 'Store owner access required.';
 const p=person(s,ws,id),c=pickerExitChecklist(s,ws,id);
 if(!p?.offboarding||p.status==='offboarded')return 'Plan or revoke access before finalizing this exit.';
 if(p.offboarding.effectiveDate>today())return 'The planned last day has not arrived.';
 if(Object.values(c).some(xs=>xs.length))return 'Resolve open tasks, shifts, corrections and final pay first.';
 if(p.status==='active'){const error=revokePickerAccess(s,ws,id);if(error)return error;}
 p.status='offboarded';p.offboarding.status='completed';p.offboarding.completedAt=stamp();audit(s,ws,`Completed ${p.name} offboarding with final pay reviewed`);return '';
}

export function managerProfile(s,ws){
 const store=managerStore(ws),m=activeManager(s,ws);
 return `<div class="page-header"><div><h1>Store manager</h1><p>${esc(s.shopPartners?.[store]?.name||'Store')} · operational oversight</p></div></div><section class="panel"><label>Demo manager account <select data-manager-account>${(s.storeManagers||[]).filter(x=>x.store===store&&x.status!=='removed').map(x=>`<option value="${esc(x.id)}" ${x.id===m?.id?'selected':''}>${esc(x.name)} · ${esc(x.status)}</option>`).join('')}</select></label><button class="button secondary" data-commerce="select-manager">Switch manager</button><p>${esc(m?.name||'No account')} · ${esc(m?.status||'Unavailable')}</p>${m?.status==='invited'?'<button class="button primary" data-commerce="accept-manager">Accept manager invitation</button>':''}<p>Can run store orders, schedules and timecard review. The owner controls pay rates, payment records and staff exit.</p></section>`;
}
export function scheduleScreen(s,ws){
 const store=operatorStore(ws);if(!store||!canOperate(s,ws))return '<section class="panel">Store manager access required.</section>';
 const people=staffFor(s,store).filter(p=>p.status==='active');
 return `<div class="page-header"><div><h1>Staff schedule</h1><p>Publish shifts, review cover requests and time corrections</p></div></div><section class="panel"><h2>Publish shift</h2><label>Staff member <select data-schedule-picker>${people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label>Date <input class="form-control" data-schedule-date type="date" min="${today()}" value="${today()}"></label><label>From <input class="form-control compact" data-schedule-start type="time" value="09:00"></label><label>To <input class="form-control compact" data-schedule-end type="time" value="17:00"></label><button class="button primary" data-commerce="publish-picker-shift">Publish shift</button></section><section class="panel"><h2>Published and requested shifts</h2>${(s.pickerSchedules||[]).filter(x=>x.store===store).map(x=>`<div class="market-row"><span><b>${esc(person(s,store,x.pickerId)?.name||'Picker')} · ${esc(x.date)} ${esc(x.start)}–${esc(x.end)}</b><small> ${pill(x.status)}${x.history?.length?` · cover history ${x.history.length}`:''}</small></span>${x.status==='cover_requested'?`<label>Cover with <select data-cover-picker="${esc(x.id)}">${people.filter(p=>p.id!==x.pickerId).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><button class="button secondary compact" data-commerce="reassign-picker-shift" data-id="${esc(x.id)}">Approve cover</button>`:''}</div>`).join('')||'<p>No shifts published.</p>'}</section><section class="panel"><h2>Time corrections</h2>${(s.pickerTimeCorrections||[]).filter(x=>x.store===store).map(c=>`<div class="market-row"><span><b>${esc(person(s,store,c.pickerId)?.name||'Picker')} · ${esc(c.start)}–${esc(c.end)}</b><small>${esc(c.reason)} · ${pill(c.status)}</small></span>${c.status==='pending'?`<button class="button primary compact" data-commerce="approve-time-correction" data-id="${esc(c.id)}">Approve</button><button class="button secondary compact" data-commerce="decline-time-correction" data-id="${esc(c.id)}">Decline</button>`:''}</div>`).join('')||'<p>No corrections.</p>'}</section>`;
}
export function pickerScheduleScreen(s,ws){
 const p=currentPicker(s,ws),items=(s.pickerSchedules||[]).filter(x=>x.pickerId===p?.id&&x.status!=='cancelled');
 const shifts=(s.pickerShifts||[]).filter(x=>x.pickerId===p?.id&&['submitted','approved'].includes(x.status));
 return `<div class="page-header"><div><h1>My schedule</h1><p>${esc(p?.name||'Picker')} · confirm a shift or request cover</p></div></div><section class="panel">${items.map(x=>`<div class="market-row"><span><b>${esc(x.date)} · ${esc(x.start)}–${esc(x.end)}</b><small>${esc(x.status)}</small></span>${['published','confirmed'].includes(x.status)?`<button class="button primary compact" data-commerce="confirm-picker-shift" data-id="${esc(x.id)}">Confirm</button><button class="button secondary compact" data-commerce="request-picker-cover" data-id="${esc(x.id)}">Request cover</button>`:''}</div>`).join('')||'<p>No scheduled shifts. The picker can start an unscheduled store shift in Earnings.</p>'}</section><section class="panel"><h2>Correct a time record</h2>${shifts.map(x=>`<div class="market-row"><span><b>${esc(x.date)} · ${esc(x.status)}</b><small>Recorded ${esc(x.startAt)} → ${esc(x.endAt||'Open')}</small></span><label>Start <input data-correction-start="${esc(x.id)}" type="time" value="09:00"></label><label>End <input data-correction-end="${esc(x.id)}" type="time" value="17:00"></label><label>Reason <input data-correction-reason="${esc(x.id)}" placeholder="e.g. forgot to clock out"></label><button class="button secondary compact" data-commerce="request-time-correction" data-id="${esc(x.id)}">Request correction</button></div>`).join('')||'<p>No submitted shifts.</p>'}</section>`;
}
export function offboardingScreen(s,ws){
 if(!owner(ws))return '';
 return `<div class="page-header"><div><h1>Staff offboarding</h1><p>Set a last day, resolve work and pay, then complete the exit</p></div></div>${staffFor(s,ws).filter(p=>p.status!=='invited').map(p=>{
  const c=pickerExitChecklist(s,ws,p.id);
  return `<section class="panel order-card"><h2>${esc(p.name)} · ${esc(p.status)}</h2><p>Last day: ${esc(p.offboarding?.effectiveDate||'Not set')} · ${esc(p.offboarding?.status||(p.status==='offboarded'?'Offboarded':p.status==='removed'?'Removed':'Active'))}</p><p>Open tasks ${c.tasks.length} · shifts awaiting approval ${c.shifts.length} · pending corrections ${c.corrections.length} · approved shifts without pay run ${c.unbilled.length} · unpaid pay runs ${c.unpaid.length}</p>${p.status==='active'?`<label>Last day <input class="form-control" data-exit-date="${esc(p.id)}" type="date" min="${today()}" value="${today()}"></label><label>Reason <input class="form-control" data-exit-reason="${esc(p.id)}" placeholder="e.g. resigned or end of seasonal work"></label><button class="button secondary compact" data-commerce="plan-picker-exit" data-id="${esc(p.id)}">Set last day</button><button class="button danger compact" data-commerce="revoke-picker-access" data-id="${esc(p.id)}">Remove access now</button>`:''}${p.offboarding&&p.status!=='offboarded'?`<button class="button primary compact" data-commerce="finalize-picker-exit" data-id="${esc(p.id)}">Complete exit</button>`:''}<p class="muted">Open work can be reassigned in Orders. Review shifts in Schedule and final dues in Staff pay.</p></section>`;
 }).join('')||'<section class="panel">No picker to offboard.</section>'}`;
}
