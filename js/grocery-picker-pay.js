// Store-funded picker pay: mock tracking and recorded offline payment only.
import {currentPicker,staffFor,storeWorkspace} from './grocery-staff.js';

const seller=ws=>['grocery','groceryFresh'].includes(ws);
const managerStore=ws=>ws==='groceryManager'?'grocery':ws==='groceryFreshManager'?'groceryFresh':null;
const approver=(s,ws)=>seller(ws)||!!managerStore(ws)&&(s.storeManagers||[]).some(m=>m.id===s.activeStoreManager?.[ws]&&m.store===managerStore(ws)&&m.status==='active');
const picker=ws=>['picker','pickerFresh'].includes(ws);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`₹${Number(n||0).toLocaleString('en-IN')}`;
const date=()=>new Date().toISOString().slice(0,10);
const now=()=>new Date().toISOString();
const staff=(s,ws,id)=>staffFor(s,ws).find(p=>p.id===id);
const log=(s,who,message)=>{(s.audit||=[]).unshift({id:`AUD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,event:message,actor:who,workspace:who,at:new Date().toLocaleString('en-IN')})};
export const payPeriod=(p,d=date())=>p?.payPlan?.type==='daily'?d:d.slice(0,7);
export const shiftsFor=(s,id,period)=> (s.pickerShifts||[]).filter(x=>x.pickerId===id&&(!period||x.date.startsWith(period)));
export const payRunFor=(s,id,period)=> (s.pickerPayRuns||[]).find(x=>x.pickerId===id&&x.period===period);

export function setPickerPayPlan(s,ws,id,type,rate){
 if(!seller(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 const p=staff(s,ws,id),n=Number(rate);
 if(!p||p.status!=='active')return 'Choose an active picker at this store.';
 if(!['monthly','daily'].includes(type)||!Number.isInteger(n)||n<1||n>1000000)return 'Choose monthly or daily pay and enter a valid rupee amount.';
 if(shiftsFor(s,id,date().slice(0,7)).length||(s.pickerPayRuns||[]).some(r=>r.pickerId===id&&r.period.startsWith(date().slice(0,7))))return 'Finish the current pay period before changing this plan.';
 p.payPlan={type,rate:n,effectiveFrom:date()};log(s,s.shopPartners[ws].name,`Set ${p.name} picker pay: ${type} ${money(n)}`);return '';
}
export function startPickerShift(s,ws){
 if(!picker(ws))return 'Picker access required.';
 const p=currentPicker(s,ws),store=storeWorkspace(ws);
 if(!p||p.status!=='active'||s.shopPartners?.[store]?.status!=='approved')return 'Active picker and approved store required.';
 if(!p.payPlan)return 'Ask the store to set your pay arrangement first.';
 const day=date(),period=payPeriod(p,day);
 const planned=(s.pickerSchedules||[]).find(x=>x.pickerId===p.id&&x.date===day&&x.status!=='cancelled');
 if(planned&&planned.status!=='confirmed')return 'Confirm your scheduled shift before starting it.';
 if(payRunFor(s,p.id,period))return 'This pay period is already under review. Ask the store to correct it.';
 if(shiftsFor(s,p.id,day).length)return 'You already have a shift for today.';
 (s.pickerShifts||=[]).push({id:`SHIFT-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,pickerId:p.id,store,date:day,scheduleId:planned?.id||null,startAt:now(),endAt:null,status:'open',planType:p.payPlan.type,rate:p.payPlan.rate});
 log(s,p.name,`Started picker shift ${day}`);return '';
}
export function endPickerShift(s,ws){
 if(!picker(ws))return 'Picker access required.';
 const p=currentPicker(s,ws),x=(s.pickerShifts||[]).find(y=>y.pickerId===p?.id&&y.status==='open');
 if(!x)return 'No open shift to finish.';
 x.endAt=now();x.status='submitted';log(s,p.name,`Submitted picker shift ${x.date}`);return '';
}
export function approvePickerShift(s,ws,id){
 const store=managerStore(ws)||ws;
 if(!approver(s,ws)||s.shopPartners?.[store]?.status!=='approved')return 'Approved store access required.';
 const x=(s.pickerShifts||[]).find(y=>y.id===id&&y.store===store&&y.status==='submitted');
 if(!x)return 'Submitted shift for this store not found.';
 if((s.pickerTimeCorrections||[]).some(c=>c.shiftId===id&&c.status==='pending'))return 'Resolve the time correction before approving this shift.';
 if(payRunFor(s,x.pickerId,x.planType==='daily'?x.date:x.date.slice(0,7)))return 'Pay run already exists; resolve it before changing shifts.';
 x.status='approved';x.approvedAt=now();const actor=managerStore(ws)?(s.storeManagers||[]).find(m=>m.id===s.activeStoreManager[ws])?.name:s.shopPartners[ws].name;log(s,actor,`Approved ${staff(s,store,x.pickerId)?.name||'picker'} shift ${x.date}`);return '';
}
export function createPickerPayRun(s,ws,id){
 if(!seller(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 const p=staff(s,ws,id);if(!p?.payPlan)return 'Set a pay arrangement for this picker first.';
 const period=payPeriod(p),shifts=shiftsFor(s,id,period);
 if(payRunFor(s,id,period))return 'A pay run already exists for this period.';
 if(shifts.some(x=>x.status!=='approved'))return 'Finish and approve all shifts in this period first.';
 if(!shifts.length)return 'Approve at least one shift in this period first.';
 const amount=p.payPlan.rate*(p.payPlan.type==='daily'?shifts.length:1);
 (s.pickerPayRuns||=[]).push({id:`PPAY-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,pickerId:id,store:ws,period,type:p.payPlan.type,rate:p.payPlan.rate,shiftIds:shifts.map(x=>x.id),baseAmount:amount,adjustment:0,adjustmentReason:'',amount,status:'draft',createdAt:now()});
 log(s,s.shopPartners[ws].name,`Prepared ${p.name} ${period} picker pay ${money(amount)}`);return '';
}
export function adjustPickerPayRun(s,ws,id,amount,reason){
 if(!seller(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 const r=(s.pickerPayRuns||[]).find(x=>x.id===id&&x.store===ws&&x.status==='draft');
 if(!r)return 'Only a draft pay run at your store can be adjusted.';
 const n=Number(amount);if(!Number.isInteger(n)||Math.abs(n)>100000)return 'Enter a whole-rupee adjustment.';
 if(n&&!String(reason||'').trim())return 'Explain the adjustment.';
 if(r.baseAmount+n<0)return 'Final picker pay cannot be negative.';
 r.adjustment=n;r.adjustmentReason=String(reason||'').trim();r.amount=r.baseAmount+n;log(s,s.shopPartners[ws].name,`Adjusted picker pay ${r.id} by ${money(n)}: ${r.adjustmentReason||'cleared'}`);return '';
}
export function approvePickerPayRun(s,ws,id){
 if(!seller(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 const r=(s.pickerPayRuns||[]).find(x=>x.id===id&&x.store===ws&&x.status==='draft');if(!r)return 'Draft pay run not found.';
 r.status='approved';r.approvedAt=now();log(s,s.shopPartners[ws].name,`Approved picker pay ${r.id}: ${money(r.amount)}`);return '';
}
export function recordPickerPayment(s,ws,id,method,reference){
 if(!seller(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 const r=(s.pickerPayRuns||[]).find(x=>x.id===id&&x.store===ws&&x.status==='approved');if(!r)return 'Approve this pay run before recording payment.';
 if(!['bank','upi','cash'].includes(method)||!String(reference||'').trim())return 'Choose a payment method and enter its reference or receipt note.';
 r.status='paid';r.paidAt=now();r.method=method;r.reference=String(reference).trim().slice(0,80);log(s,s.shopPartners[ws].name,`Recorded store-paid picker pay ${r.id}: ${money(r.amount)} · ${method} · ${r.reference}`);return '';
}

export function sellerPickerPayScreen(s,ws){
 if(!seller(ws))return '';
 const people=staffFor(s,ws).filter(p=>p.status!=='invited'),runs=(s.pickerPayRuns||[]).filter(r=>r.store===ws);
 return `<div class="page-header"><div><h1>Picker Pay</h1><p>Store staff expense · mock tracking; record a payment made by your store</p></div></div><section class="panel"><p>1. Set monthly or daily pay in Team. 2. Picker submits a shift. 3. Approve the shift. 4. Review pay, approve and record payment.</p><p class="muted">Picker pay is separate from customer payments, seller settlement and courier earnings. This demo can close the current period early for testing; a real payroll cutoff and attendance policy will be set with the backend.</p></section>${people.map(p=>{
  const period=payPeriod(p),shifts=shiftsFor(s,p.id,period),run=payRunFor(s,p.id,period);
  return `<section class="panel order-card"><h2>${esc(p.name)} · ${esc(p.payPlan?.type||'Plan not set')} ${p.status==='removed'?'· Former picker':''}</h2><p>Rate ${p.payPlan?money(p.payPlan.rate):'Not set'} · Period ${esc(period)} · Approved shifts ${shifts.filter(x=>x.status==='approved').length}</p>${shifts.map(x=>`<div class="market-row"><span><b>${esc(x.date)} · ${esc(x.status)}</b><small>${esc(x.startAt)}${x.endAt?` → ${esc(x.endAt)}`:''}</small></span>${x.status==='submitted'?`<button class="button secondary compact" data-commerce="approve-picker-shift" data-id="${esc(x.id)}">Approve shift</button>`:''}</div>`).join('')}${!run?`<button class="button primary compact" data-commerce="create-picker-pay" data-id="${esc(p.id)}">Prepare pay</button>`:`<div class="info-banner"><b>${esc(run.period)} · ${money(run.amount)} · ${esc(run.status)}</b><small>Base ${money(run.baseAmount)}${run.adjustment?` · Adjustment ${money(run.adjustment)} (${esc(run.adjustmentReason)})`:''}${run.status==='paid'?` · ${esc(run.method)} ${esc(run.reference)}`:''}</small></div>${run.status==='draft'?`<label>Adjustment ₹ <input class="form-control compact" type="number" data-picker-adjustment="${esc(run.id)}" value="${run.adjustment}"></label><label>Reason <input class="form-control" data-picker-adjustment-reason="${esc(run.id)}" value="${esc(run.adjustmentReason)}"></label><button class="button secondary compact" data-commerce="adjust-picker-pay" data-id="${esc(run.id)}">Save adjustment</button><button class="button primary compact" data-commerce="approve-picker-pay" data-id="${esc(run.id)}">Approve ${money(run.amount)}</button>`:''}${run.status==='approved'?`<label>Paid using <select data-picker-payment-method="${esc(run.id)}"><option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option></select></label><label>Payment reference or receipt note <input class="form-control" data-picker-payment-ref="${esc(run.id)}" placeholder="e.g. bank ref or signed cash receipt"></label><button class="button primary compact" data-commerce="record-picker-payment" data-id="${esc(run.id)}">Record payment</button>`:''}`}</section>`;
 }).join('')||'<section class="panel">No active pickers. Invite staff in Team.</section>'}${runs.filter(r=>!people.some(p=>p.id===r.pickerId)).map(r=>`<section class="panel"><b>${esc(staff(s,ws,r.pickerId)?.name||'Former picker')} · ${esc(r.period)}</b><p>${money(r.amount)} · ${esc(r.status)}</p></section>`).join('')}`;
}
export function pickerPayScreen(s,ws){
 if(!picker(ws))return '';
 const p=currentPicker(s,ws),period=payPeriod(p),shifts=p?shiftsFor(s,p.id,period):[],runs=(s.pickerPayRuns||[]).filter(x=>x.pickerId===p?.id);
 return `<div class="page-header"><div><h1>My shifts and earnings</h1><p>${esc(p?.name||'Select an account')} · ${esc(s.shopPartners?.[p?.store]?.name||'Store')}</p></div></div>${p?.status==='active'?`<section class="panel"><h2>${esc(p.payPlan?.type||'Pay plan pending')} pay · ${p.payPlan?money(p.payPlan.rate):'Ask your store to set a rate'}</h2><p>Current period: ${esc(period)} · ${shifts.filter(x=>x.status==='approved').length} approved shift(s)</p>${shifts.some(x=>x.status==='open')?'<button class="button primary" data-commerce="end-picker-shift">Finish shift</button>':`<button class="button primary" data-commerce="start-picker-shift" ${p.payPlan?'':'disabled'}>Start shift</button>`}<p class="muted">Submit your shift; the store approves it and records any payment. This demo does not transfer money.</p></section>`:'<section class="panel">Accept your store invitation in Profile before recording shifts.</section>'}<section class="panel"><h2>Shift history</h2>${shifts.map(x=>`<p>${esc(x.date)} · ${esc(x.status)} · ${esc(x.planType)} ${money(x.rate)}</p>`).join('')||'<p>No shifts in this period.</p>'}</section><section class="panel"><h2>Pay history</h2>${runs.map(r=>`<p><b>${esc(r.period)} · ${money(r.amount)}</b> · ${esc(r.status)}${r.status==='paid'?` · ${esc(r.method)} ${esc(r.reference)}`:''}${r.adjustment?` · Adjustment ${money(r.adjustment)} (${esc(r.adjustmentReason)})`:''}</p>`).join('')||'<p>No pay run prepared yet.</p>'}</section>`;
}
export function managerTimecardsScreen(s,ws){
 const store=managerStore(ws),m=(s.storeManagers||[]).find(x=>x.id===s.activeStoreManager?.[ws]&&x.store===store&&x.status==='active');
 if(!m)return '<section class="panel">Manager access required.</section>';
 return `<div class="page-header"><div><h1>Picker timecards</h1><p>Review submitted shifts at ${esc(s.shopPartners?.[store]?.name||'your store')}</p></div></div><section class="panel"><p>Managers approve shift records. The store owner reviews pay rates, adjustments and payment.</p>${(s.pickerShifts||[]).filter(x=>x.store===store).map(x=>`<div class="market-row"><span><b>${esc(staff(s,store,x.pickerId)?.name||'Picker')} · ${esc(x.date)}</b><small>${esc(x.status)} · ${esc(x.startAt)} → ${esc(x.endAt||'Open')}</small></span>${x.status==='submitted'?`<button class="button primary compact" data-commerce="approve-picker-shift" data-id="${esc(x.id)}">Approve shift</button>`:''}</div>`).join('')||'<p>No time records yet.</p>'}</section>`;
}
