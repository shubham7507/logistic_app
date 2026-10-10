// Guided staff money overview backed by the shared payroll ledger.
import {esc, inr} from './ops.js';
import * as PC from './people-core.js';
import * as Payroll from './payroll-core.js';
import * as HR from './store-hr.js';

export function screen(s, route, ws) {
  if(route!=='staffPay')return '';
  const sc=PC.scopeOf(s,ws);if(!sc||!['owner','manager'].includes(sc.kind))return '';
  Payroll.ensurePayrollCore(s);
  const br=PC.branchesFor(s,sc.business),selected=sc.kind==='manager'?sc.branch:(s.staffPayBranch?.[sc.business]||'all');
  const people=(s.employments||[]).filter(e=>e.business===sc.business&&e.status==='active'&&(selected==='all'||e.homeBranch===selected||e.cover.includes(selected)));
  const total=people.reduce((n,e)=>n+Math.max(0,Payroll.balance(s,e.personId)),0);
  const requests=(s.staffAdvances||[]).filter(a=>a.store===sc.business&&a.status==='pending_approval');
  return `<div class="page-header"><div><h1>Pay workers</h1><p>${esc(PC.bizName(s,sc.business))} · one balance and history for each worker</p></div><button class="button secondary compact" data-route="easyStaff">Back to Staff</button></div>
    <div class="info-banner"><b>Due to workers: ${inr(total)}</b><span>Demo payments only. Cash needs the worker's acknowledgment; UPI stays pending until both people confirm.</span></div>
    ${sc.kind==='owner'&&requests.length?`<section class="panel nc-actions"><h2>${requests.length} advance request${requests.length===1?'':'s'} waiting</h2><p>Review the amount and monthly repayment before paying.</p>${requests.map(a=>`<div class="ledger-row static"><span><b>${esc(s.pickerStaff?.find(x=>x.id===a.personId)?.name||s.storeManagers?.find(x=>x.id===a.personId)?.name||'Worker')} · ${inr(a.amount)}</b><small>${inr(a.instalment)} per month · ${esc(a.reason)}</small></span></div>`).join('')}<button class="button primary compact" data-staff-pay-requests>Review requests in People & pay</button></section>`:''}
    ${sc.kind==='owner'?`<section class="panel"><label>Branch <select data-staff-pay-branch><option value="all">All branches</option>${br.map(b=>`<option value="${esc(b.id)}" ${selected===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><button class="button primary compact" data-route="monthlyPayroll">GIRO monthly payroll</button><p class="muted">Prepare one bank batch for workers on monthly pay. Cash and UPI stay with each worker's Pay action.</p></section>`:`<p class="info-banner">Managers can review their branch and request an advance in People & pay. The owner approves and pays.</p>`}
    <section class="panel"><h2>Workers · ${people.length}</h2>${people.map(e=>`<div class="ledger-row static"><span><b>${esc(s.persons[e.personId]?.name||'Worker')}</b><small>${esc(e.role)} · ${esc(br.find(x=>x.id===e.homeBranch)?.name||'Branch')} · advance ${inr(Payroll.advanceOutstanding(s,e.personId))}</small></span><span class="row-actions"><b>Due ${inr(Payroll.balance(s,e.personId))}</b><button class="button primary compact" data-staff-pay-person="${esc(e.personId)}">${sc.kind==='owner'?'Open pay':'View history'}</button></span></div>`).join('')||'<p class="muted">No active workers in this branch.</p>'}</section>
    <details class="panel"><summary>Other money records</summary><button class="button secondary compact" data-route="${PC.STORES.includes(sc.business)?'storeHR':'payLedgers'}">Approvals and branch expenses</button></details>`;
}
export function bind(root,api){
  const attendanceLink=root.querySelector('[data-open-hr-time]');if(attendanceLink)attendanceLink.onclick=e=>{e.stopPropagation();api.getState().hrTab='time';api.save();api.navigate('storeHR')};
  const teamLink=root.querySelector('[data-open-hr-team]');if(teamLink)teamLink.onclick=e=>{e.stopPropagation();api.getState().hrTab='team';api.save();api.navigate('storeHR')};
  root.querySelector('[data-staff-pay-requests]')?.addEventListener('click',()=>{const s=api.getState();s.hrTab='ledgers';api.save();api.navigate('storeHR')});
  root.querySelector('[data-staff-post-earnings]')?.addEventListener('click',()=>{const s=api.getState(),sc=PC.scopeOf(s,s.currentWorkspace);if(sc?.kind!=='owner'||!PC.STORES.includes(sc.business))return api.toast('Only the seller owner posts earnings.');const error=HR.postEarnings(s,s.currentWorkspace);if(error)return api.toast(error);Payroll.ensurePayrollCore(s);api.save();api.render();api.toast('Earnings posted. Review the draft before paying.');});
  root.querySelector('[data-staff-pay-branch]')?.addEventListener('change',e=>{const s=api.getState(),sc=PC.scopeOf(s,s.currentWorkspace);if(sc?.kind!=='owner')return;(s.staffPayBranch||={})[sc.business]=e.target.value;api.save();api.render()});
  root.querySelectorAll('[data-staff-pay-person]').forEach(b=>b.onclick=()=>{const s=api.getState(),sc=PC.scopeOf(s,s.currentWorkspace),emp=s.employments?.find(e=>e.personId===b.dataset.staffPayPerson&&e.business===sc?.business&&e.status==='active'&&(sc.kind==='owner'||e.homeBranch===sc.branch||e.cover.includes(sc.branch)));if(!emp)return api.toast('Worker is outside your branch.');s.selectedPayPersonId=emp.personId;s.selectedPayBusiness=emp.business;api.save();api.navigate('unifiedPay')});
}
