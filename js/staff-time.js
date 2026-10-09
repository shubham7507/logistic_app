// Shared store staff schedule, attendance and leave. Browser-local demo records; no real clock or payroll provider.
import {clock} from './pay.js';
const uid=p=>`${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
const today=()=>new Date(clock()).toISOString().slice(0,10);
const at=()=>new Date(clock()).toLocaleString('en-IN');
const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(`${d}T12:00:00Z`))&&new Date(`${d}T12:00:00Z`).toISOString().slice(0,10)===d;
const weekday=d=>new Date(`${d}T12:00:00Z`).getUTCDay();
const daysBetween=(from,to)=>{const out=[];for(let t=Date.parse(`${from}T12:00:00Z`),end=Date.parse(`${to}T12:00:00Z`);t<=end&&out.length<63;t+=86400000)out.push(new Date(t).toISOString().slice(0,10));return out;};
const notify=(s,to,route,text,ref,staffId)=>{(s.notifications||=[]).unshift({id:uid('NT'),to,route,text,ref,staffId,priority:'action',at:at(),read:false});};
const storeWorker=(s,store,pid)=>(s.pickerStaff||[]).concat(s.storeManagers||[]).find(p=>p.id===pid&&p.store===store&&p.status==='active');
const workerWs=(s,store,pid)=>{const suffix={grocery:'',groceryFresh:'Fresh',electrical:'Electrical',fashion:'Fashion'}[store];return (s.storeManagers||[]).some(x=>x.id===pid&&x.store===store)?`${store}Manager`:`picker${suffix??''}`;};
const locked=(s,store,m)=>!!s.staffMonthLocks?.some(x=>x.store===store&&x.month===m&&x.status==='locked');
export function schedule(s,pid,date=today()){
 const all=s.staffWorkRules?.[pid]||[];
 return [...all].filter(x=>x.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]||null;
}
export function scheduled(s,pid,date){const r=schedule(s,pid,date);return !!r&&r.weekdays.includes(weekday(date));}
export function saveSchedule(s,store,pid,v,actor){
 if(!storeWorker(s,store,pid))return 'Choose an active worker at this store.';
 const weekdays=[...new Set([].concat(v.weekdays||[]).map(Number))].sort();
 if(!weekdays.length||weekdays.some(n=>n<0||n>6||!Number.isInteger(n)))return 'Choose at least one working day.';
 if(!validDay(v.effectiveFrom)||v.effectiveFrom<today())return 'Start the new schedule today or later.';
 if(!/^\d\d:\d\d$/.test(v.start||'')||!/^\d\d:\d\d$/.test(v.end||'')||v.start>=v.end)return 'Choose valid shift start and end times.';
 const rules=(s.staffWorkRules||={})[pid]||=[];
 if(rules.some(x=>x.effectiveFrom===v.effectiveFrom))return 'There is already a schedule starting on this date. Choose another effective date.';
 rules.push({id:uid('SCH'),store,personId:pid,weekdays,start:v.start,end:v.end,effectiveFrom:v.effectiveFrom,by:actor,at:at()});s.staffWorkRules[pid]=rules;
 notify(s,workerWs(s,store,pid),'myHR',`Your work schedule at ${s.shopPartners?.[store]?.name||store} changes on ${v.effectiveFrom}`,pid,pid);
 return '';
}
export function checkIn(s,store,pid,branchId,date=today()){
 if(!storeWorker(s,store,pid))return 'Your store employment is not active.';
 if(!validDay(date)||date>today())return 'Choose today or an earlier date.';
 if(locked(s,store,date.slice(0,7)))return 'This month is locked. Ask the owner for a payroll correction.';
 if(schedule(s,pid,date)&&!scheduled(s,pid,date))return 'This is your rest day. Ask the owner to record an extra shift.';
 const hr=s.staffHR?.[pid],branches=[hr?.homeBranch,...(hr?.cover||[])];if(!branches.includes(branchId))return 'Choose your assigned branch.';
 s.staffDays||=[];if(s.staffDays.some(d=>d.store===store&&d.personId===pid&&d.date===date&&d.status!=='rejected'))return 'Attendance is already recorded for this day.';
 if((s.staffLeaveRequests||[]).some(l=>l.store===store&&l.personId===pid&&l.status==='approved'&&l.dates.includes(date)&&l.units===1))return 'Full-day leave is approved for this date. Ask the owner to correct it.';
 const row={id:uid('DAY'),store,personId:pid,date,branchId,cover:branchId!==hr?.homeBranch,status:'pending',units:1,by:storeWorker(s,store,pid).name,source:'worker',at:at()};s.staffDays.push(row);
 notify(s,store,'storeHR',`${row.by} says they are present on ${date} · approve attendance`,row.id);
 return '';
}
export function checkOut(s,store,pid,date=today()){
 const d=(s.staffDays||[]).find(x=>x.store===store&&x.personId===pid&&x.date===date&&['pending','approved'].includes(x.status));
 if(!d)return 'Mark yourself present before leaving.';
 if(d.leftAt)return 'You already marked that you left today.';
 d.leftAt=at();notify(s,store,'storeHR',`${storeWorker(s,store,pid)?.name||'Worker'} finished the shift on ${date}`,d.id);return '';
}
export function markByOwner(s,store,pid,branchId,date,actor){
 if(!storeWorker(s,store,pid))return 'Choose an active worker at this store.';
 if(!validDay(date)||date>today())return 'Choose today or an earlier date.';
 if(locked(s,store,date.slice(0,7)))return 'This month is locked. Ask the owner for a payroll correction.';
 if((s.staffLeaveRequests||[]).some(l=>l.store===store&&l.personId===pid&&l.status==='approved'&&l.units===1&&l.dates.includes(date)))return 'Full-day leave is approved. Correct the leave record first.';
 s.staffDays||=[];if(s.staffDays.some(d=>d.store===store&&d.personId===pid&&d.date===date&&d.status!=='rejected'))return 'Attendance already marked for that day.';
 s.staffDays.push({id:uid('DAY'),store,personId:pid,date,branchId,cover:branchId!==s.staffHR?.[pid]?.homeBranch,status:'approved',units:1,by:actor,source:'seller',at:at(),extraShift:!!schedule(s,pid,date)&&!scheduled(s,pid,date)});
 notify(s,workerWs(s,store,pid),'myHR',`${actor} marked you present on ${date}`,pid,pid);
 return '';
}
export function decideAttendance(s,store,id,decision,actor,branch){
 const d=(s.staffDays||[]).find(x=>x.id===id&&x.store===store&&x.status==='pending');if(!d)return 'Pending attendance not found.';
 if(branch&&d.branchId!==branch)return 'This attendance belongs to another branch.';
 if(locked(s,store,d.date.slice(0,7)))return 'This month is locked.';
 if(!['approve','reject'].includes(decision))return 'Choose approve or reject.';
 if(decision==='approve'&&(s.staffLeaveRequests||[]).some(l=>l.store===store&&l.personId===d.personId&&l.status==='approved'&&l.units===1&&l.dates.includes(d.date)))return 'Full-day leave is approved. Resolve the leave before approving attendance.';
 d.status=decision==='approve'?'approved':'rejected';d.decidedBy=actor;d.decidedAt=at();
 notify(s,workerWs(s,store,d.personId),'myHR',`Your ${d.date} attendance was ${d.status} by ${actor}`,d.id,d.personId);return '';
}
export function disputeAttendance(s,store,pid,id,reason){const d=(s.staffDays||[]).find(x=>x.id===id&&x.store===store&&x.personId===pid&&x.status==='approved');if(!d)return 'Approved attendance not found.';if(!String(reason||'').trim())return 'Explain what needs correcting.';if(locked(s,store,d.date.slice(0,7)))return 'This month is locked; ask the owner for a payroll correction.';d.dispute=String(reason).trim();d.status='disputed';notify(s,store,'storeHR',`Attendance correction requested for ${d.date}: ${d.dispute}`,d.id);return '';}
export function resolveDispute(s,store,id,decision,actor,branch){const d=(s.staffDays||[]).find(x=>x.id===id&&x.store===store&&x.status==='disputed');if(!d)return 'Disputed attendance not found.';if(branch&&d.branchId!==branch)return 'This attendance belongs to another branch.';if(locked(s,store,d.date.slice(0,7)))return 'This month is locked.';if(!['approve','remove'].includes(decision))return 'Choose keep present or remove.';d.status=decision==='approve'?'approved':'rejected';d.resolvedBy=actor;d.resolvedAt=at();notify(s,workerWs(s,store,d.personId),'myHR',`Your ${d.date} attendance correction was reviewed`,d.id,d.personId);return '';}
export function requestLeave(s,store,pid,v){
 if(!storeWorker(s,store,pid))return 'Your store employment is not active.';
 const {from,to}=v;if(!validDay(from)||!validDay(to)||to<from||daysBetween(from,to).length>62)return 'Choose a date range of up to 62 days.';
 if(from<today())return 'For a past date, ask the owner to record an attendance correction.';
 const units=Number(v.units||1);if(![.5,1].includes(units))return 'Choose full day or half day.';
 const dates=daysBetween(from,to).filter(d=>scheduled(s,pid,d));if(!dates.length)return 'These dates contain no scheduled workdays. Ask the owner to set your schedule first.';
 if(units===1&&dates.some(d=>(s.staffDays||[]).some(a=>a.store===store&&a.personId===pid&&a.date===d&&a.status==='approved')))return 'You are already marked present on one of these days. Request an attendance correction first.';
 if(dates.some(d=>locked(s,store,d.slice(0,7))))return 'A month in this request is locked.';
 if(dates.some(d=>(s.staffLeaveRequests||[]).some(x=>x.store===store&&x.personId===pid&&['pending','approved'].includes(x.status)&&x.dates.includes(d))))return 'Leave is already requested for one of these workdays.';
 const row={id:uid('LV'),store,personId:pid,from,to,dates,units,reason:String(v.reason||'').trim()||'Personal leave',status:'pending',requestedAt:at()};(s.staffLeaveRequests||=[]).push(row);
 notify(s,store,'storeHR',`${storeWorker(s,store,pid).name} requested ${dates.length*units} day(s) of leave, ${from} to ${to}`,row.id);return '';
}
export function decideLeave(s,store,id,decision,treatment,actor,branch,reason=''){
 const l=(s.staffLeaveRequests||[]).find(x=>x.id===id&&x.store===store&&x.status==='pending');if(!l)return 'Pending leave request not found.';
 if(branch&&s.staffHR?.[l.personId]?.homeBranch!==branch)return 'This worker belongs to another branch.';
 if(l.dates.some(d=>locked(s,store,d.slice(0,7))))return 'A month in this request is locked.';
 if(!['approve','decline'].includes(decision)||decision==='approve'&&!['paid','unpaid'].includes(treatment))return 'Choose paid leave, unpaid leave or decline.';
 if(decision==='approve'&&l.units===1&&l.dates.some(d=>(s.staffDays||[]).some(a=>a.store===store&&a.personId===l.personId&&a.date===d&&['pending','approved','disputed'].includes(a.status))))return 'Resolve recorded attendance before approving full-day leave.';
 l.status=decision==='approve'?'approved':'declined';l.treatment=decision==='approve'?treatment:null;l.decisionReason=String(reason||'').trim();l.decidedBy=actor;l.decidedAt=at();
 notify(s,workerWs(s,store,l.personId),'myHR',`Your leave ${l.from}–${l.to} was ${l.status}${l.treatment?` as ${l.treatment} leave`:''}`,l.id,l.personId);return '';
}
export function cancelLeave(s,store,pid,id){const l=(s.staffLeaveRequests||[]).find(x=>x.id===id&&x.store===store&&x.personId===pid&&['pending','approved'].includes(x.status));if(!l)return 'Leave cannot be cancelled.';if(l.dates.some(d=>d<today()||locked(s,store,d.slice(0,7))))return 'Ask the owner to correct leave that has started or is in a locked month.';l.status='cancelled';l.cancelledAt=at();notify(s,store,'storeHR',`Leave request ${l.from}–${l.to} was cancelled`,l.id);return '';}
export function decideAbsence(s,store,pid,date,treatment,actor,reason=''){
 if(!storeWorker(s,store,pid)||!scheduled(s,pid,date))return 'Choose a scheduled day for an active worker.';
 if(date>today()||locked(s,store,date.slice(0,7)))return 'Choose an unlocked day up to today.';
 if(!['paid','unpaid'].includes(treatment))return 'Choose paid exception or unpaid absence.';
 if(treatment==='paid'&&!String(reason||'').trim())return 'Add a reason for paying this absent day.';
 if((s.staffDays||[]).some(d=>d.store===store&&d.personId===pid&&d.date===date&&d.status==='approved'))return 'This worker was present; correct attendance first.';
 if((s.staffLeaveRequests||[]).some(l=>l.store===store&&l.personId===pid&&l.status==='approved'&&l.units===1&&l.dates.includes(date)))return 'Full-day leave already explains this day.';
 const all=s.staffAbsenceDecisions||=[],existing=all.find(x=>x.store===store&&x.personId===pid&&x.date===date);
 if(existing)Object.assign(existing,{treatment,by:actor,reason:String(reason).trim(),at:at()});else all.push({id:uid('ABS'),store,personId:pid,date,treatment,by:actor,reason:String(reason).trim(),at:at()});s.staffAbsenceDecisions=all;
 notify(s,workerWs(s,store,pid),'myHR',`${date} recorded as ${treatment==='paid'?'paid exception':'unpaid absence'} by ${actor}`,pid,pid);return '';
}
export function summary(s,store,pid,m){
 const dates=daysBetween(`${m}-01`,new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10)).filter(d=>scheduled(s,pid,d));
 const attend=(s.staffDays||[]).filter(x=>x.store===store&&x.personId===pid&&x.date.startsWith(m));
 const leaves=(s.staffLeaveRequests||[]).filter(x=>x.store===store&&x.personId===pid&&x.status==='approved');
 let present=0,paidLeave=0,unpaidLeave=0,paidException=0,unpaidAbsence=0,unresolved=0;
 for(const date of dates){const a=attend.find(x=>x.date===date&&x.status==='approved'),pending=attend.some(x=>x.date===date&&['pending','disputed'].includes(x.status));const l=leaves.find(x=>x.dates.includes(date));const exception=(s.staffAbsenceDecisions||[]).find(x=>x.store===store&&x.personId===pid&&x.date===date);
  if(pending)unresolved++;
  if(date>today())continue;
  const p=Math.min(l?.units===.5?.5:1,a?.units||0),left=1-p,lv=Math.min(left,l?.units||0);
  present+=p;if(l?.treatment==='paid')paidLeave+=lv;else if(l?.treatment==='unpaid')unpaidLeave+=lv;
  const rest=left-lv;if(exception?.treatment==='paid')paidException+=rest;else unpaidAbsence+=rest;
 }
 const extra=attend.filter(a=>a.status==='approved'&&a.extraShift&&!dates.includes(a.date)).reduce((n,a)=>n+(a.units||1),0);
 return {scheduled:dates.length,present,extra,paidLeave,unpaidLeave,paidException,unpaidAbsence,unresolved,paidUnits:present+paidLeave+paidException+extra,dates,locked:locked(s,store,m)};
}
export function lockMonth(s,store,m,actor){
 if(!/^\d{4}-\d{2}$/.test(m))return 'Choose a month.';
 if(locked(s,store,m))return 'This month is already locked.';
 if(m>today().slice(0,7))return 'Cannot lock a future month.';
  if(m===today().slice(0,7)&&today()!==new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10))return 'Wait until the month ends. In this demo, use Advance demo to month end.';
 const people=(s.pickerStaff||[]).concat(s.storeManagers||[]).filter(p=>p.store===store&&p.status==='active'&&schedule(s,p.id,`${m}-01`));
 if((s.staffDays||[]).some(d=>d.store===store&&d.date.startsWith(m)&&['pending','disputed'].includes(d.status)))return 'Resolve pending or disputed attendance before locking.';
 if(people.some(p=>summary(s,store,p.id,m).unresolved))return 'Resolve pending or disputed attendance before locking.';
  if((s.staffLeaveRequests||[]).some(l=>l.store===store&&l.status==='pending'&&l.dates.some(d=>d.startsWith(m))))return 'Review pending leave requests before locking.';
 (s.staffMonthLocks||=[]).push({id:uid('LOCK'),store,month:m,status:'locked',by:actor,at:at()});
 for(const p of people)notify(s,workerWs(s,store,p.id),'myHR',`${m} attendance is ready for payroll`,m,p.id);return '';
}
export function advanceDemoToMonthEnd(s){const d=today(),m=d.slice(0,7),last=new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);const delta=Math.round((Date.parse(last+'T12:00:00Z')-Date.parse(d+'T12:00:00Z'))/86400000);s.simClockDays=(s.simClockDays||0)+Math.max(0,delta);globalThis.__moveaiClockOffset=s.simClockDays;return last;}
