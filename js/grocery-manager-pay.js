import {SELLER_WORKSPACES,STORE_BY_MANAGER} from './seller-roles.js';
// Store-owned manager compensation records. This mock never sends funds.
import {record} from './pay.js';
const owner=ws=>SELLER_WORKSPACES.includes(ws);
const storeOf=ws=>STORE_BY_MANAGER[ws]||null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`₹${Number(n||0).toLocaleString('en-IN')}`;
const month=()=>new Date().toISOString().slice(0,7);
const runs=s=>s.managerPayRuns||=[];
export function setManagerPayPlan(s,ws,id,amount){
 if(!owner(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store owner access required.';
 const m=(s.storeManagers||[]).find(x=>x.id===id&&x.store===ws&&x.status==='active'),n=Number(amount);
 if(!m)return 'Active manager at this store not found.';
 if(!Number.isInteger(n)||n<1||n>1000000)return 'Enter a monthly manager amount between ₹1 and ₹10,00,000.';
 m.monthlyPay=n;return '';
}
export function prepareManagerPay(s,ws,id,period=month()){
 if(!owner(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store owner access required.';
 const m=(s.storeManagers||[]).find(x=>x.id===id&&x.store===ws&&x.status==='active');
 if(!m?.monthlyPay)return 'Set a monthly pay amount for an active manager first.';
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||period>month())return 'Choose this or an earlier month.';
 if(runs(s).some(x=>x.managerId===id&&x.period===period))return 'This manager already has a pay run for this month.';
 runs(s).unshift({id:`MPAY-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,managerId:id,store:ws,period,amount:m.monthlyPay,status:'draft',createdAt:new Date().toISOString()});return '';
}
export function approveManagerPay(s,ws,id){
 if(!owner(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store owner access required.';
 const r=runs(s).find(x=>x.id===id&&x.store===ws&&x.status==='draft');if(!r)return 'Draft manager pay run not found.';
 r.status='approved';r.approvedAt=new Date().toISOString();return '';
}
export function recordManagerPayment(s,ws,id,method,reference){
 if(!owner(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store owner access required.';
 const r=runs(s).find(x=>x.id===id&&x.store===ws&&x.status==='approved');if(!r)return 'Approve manager pay before recording payment.';
 if(!['bank','upi','cash','card_transfer'].includes(method)||!String(reference||'').trim())return 'Choose bank, UPI, cash or card payout and enter a reference or signed receipt note.';
 r.method=method;r.reference=String(reference).trim().slice(0,80);r.status='paid';r.paidAt=new Date().toISOString();
 record(s,{owner:s.shopPartners[ws].party,sourceType:'manager_pay',sourceId:r.id,type:'manager_wage_payment',payer:s.shopPartners[ws].party,payee:r.managerId,responsible:ws,amount:r.amount,method,channel:'outside_app',reference:r.reference,status:'confirmed',note:`Store-paid manager compensation · ${r.period}`},s.shopPartners[ws].name);return '';
}
export function sellerManagerPayScreen(s,ws){
 if(!owner(ws))return '';
 return `<section class="panel"><h2>Manager pay · store expense</h2><p class="muted">Monthly amount is entered by the owner. Review and approve a run before recording an external payment. No card number or funds are handled here.</p>${(s.storeManagers||[]).filter(m=>m.store===ws).map(m=>{
  const current=runs(s).find(r=>r.managerId===m.id&&r.period===month()),history=runs(s).filter(r=>r.managerId===m.id);
  return `<div class="order-card"><h3>${esc(m.name)} · ${esc(m.status)}</h3><p>Monthly plan ${m.monthlyPay?money(m.monthlyPay):'Not set'}</p>${m.status==='active'?`<label>Monthly pay ₹ <input type="number" min="1" max="1000000" class="form-control compact" data-manager-rate="${esc(m.id)}" value="${esc(m.monthlyPay||'')}"></label><button class="button secondary compact" data-commerce="set-manager-pay" data-id="${esc(m.id)}">Save amount</button>${!current?`<button class="button primary compact" data-commerce="prepare-manager-pay" data-id="${esc(m.id)}">Prepare ${esc(month())} pay</button>`:''}`:''}${history.map(r=>`<div class="market-row"><span><b>${esc(r.period)} · ${money(r.amount)} · ${esc(r.status)}</b><small>${r.status==='paid'?`${esc(r.method)} · ${esc(r.reference)}`:'Store expense · payment pending'}</small></span>${r.status==='draft'?`<button class="button primary compact" data-commerce="approve-manager-pay" data-id="${esc(r.id)}">Approve pay</button>`:''}${r.status==='approved'?`<button class="button primary compact" data-unified-pay="${esc(m.id)}" data-pay-kind="manager">Pay ${money(r.amount)}</button>`:''}</div>`).join('')}</div>`;
 }).join('')||'<p>No store managers.</p>'}</section>`;
}
export function managerPayHistory(s,ws){const store=storeOf(ws),id=s.activeStoreManager?.[ws];return `<section class="panel"><h2>My pay history</h2>${(s.managerPayRuns||[]).filter(x=>x.managerId===id&&x.store===store).map(x=>`<p>${esc(x.period)} · ${money(x.amount)} · ${esc(x.status)}${x.status==='paid'?` · ${esc(x.method)} · ${esc(x.reference)}`:''}</p>`).join('')||'<p>No pay runs recorded. Ask the store owner to prepare one.</p>'}<p class="muted">Payment is recorded by the store; the app does not transfer funds.</p></section>`}
