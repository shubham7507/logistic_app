// MoveAI One — store people & pay for sellers (prototype, no backend).
// Branches: every staff member has a home branch and optional cover branches; managers manage one branch.
// Onboarding: invite with role, home branch, pay type/rate, frequency and cover → staff accepts (existing flow) →
// staff verifies ID + selfie + age 18+ + emergency contact → adds UPI/bank (₹1 check) before the first payout.
// Money: attendance by branch → earnings, meal and cover allowances → reimbursements (receipt), advances (instalments),
// deductions (capped, disputable) → payroll paid by UPI/bank/MoveAI wallet or cash (staff acknowledges).
// Ledgers: staff khata, payroll register, advances register, petty cash book per branch, branch staff cost.
// Sellers: three onboarding levels (Draft → Verified to sell → Payout-ready), documents per business and per branch.
import {esc, pill, inr} from './ops.js';
import {gateway, record, clock} from './pay.js';
import {STORE_BY_MANAGER, STORE_BY_WORKER, SELLER_WORKSPACES} from './seller-roles.js';
import {gstLookup, pennyDrop, aadhaarEkyc, upiVerify} from './verify-sim.js';
import * as Cred from './staff-credentials.js';
import * as Payroll from './payroll-core.js';
import * as PC from './people-core.js';
import * as Time from './staff-time.js';

const DAY = 86400000;
const today = () => new Date(clock()).toISOString().slice(0, 10);
const month = () => today().slice(0, 7);
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
export const ROLES = {picker: 'Picker', packer: 'Packer', cashier: 'Cashier', manager: 'Branch manager'};
export function identityStatusLabel(k={}){
  if(k.status==='verified'&&!k.method&&!k.reviewStatus)return 'Demo identity prefilled / no review submitted';
  if(k.method==='otp')return `Demo OTP ${k.status==='verified'?'complete':'pending'} / store ${k.reviewStatus||'not requested'}`;
  if(k.method==='offline')return `Mock offline file / store ${k.reviewStatus||'not requested'}`;
  if(['aadhaar_document','other_document'].includes(k.method))return `Manual document / store ${k.reviewStatus||'not requested'}`;
  return `${k.status||'pending'} / ${k.reviewStatus||'not requested'}`;
}
export const LIMITS = {managerExpense: 500, managerAdvance: 0, deductionCap: 5000, advanceMaxMonths: 1, cashApproval: 5000};
const STATE_CODE = {Delhi: '07', Noida: '09', Gurugram: '06', Mumbai: '27', Bengaluru: '29'};

// ---------- who is who ----------
export function storeOf(ws) { return SELLER_WORKSPACES?.includes?.(ws) ? ws : STORE_BY_MANAGER[ws] || STORE_BY_WORKER[ws] || null; }
export const branchesOf = (s, store) => (s.sellerBranches?.[store] || []);
const branchName = (s, store, id) => branchesOf(s, store).find(b => b.id === id)?.name?.split(' · ').pop() || id || '—';
export function people(s, store) {
  const pk = (s.pickerStaff || []).filter(p => p.store === store).map(p => ({...p, kind: 'staff'})), mg = (s.storeManagers || []).filter(m => m.store === store).map(m => ({...m, kind: 'manager'}));
  return [...pk, ...mg].map(p => ({...p, hr: hr(s, p)}));
}
// Give existing demo staff a visible workweek when this UI is first opened. An owner can
// replace it with a dated rule; this starts today so older attendance is not rewritten.
export function ensureDemoWorkweeks(s, store) {
  for (const p of (s.pickerStaff || []).concat(s.storeManagers || []).filter(p => p.store === store && p.status === 'active')) {
    if ((s.staffWorkRules?.[p.id] || []).length) continue;
    (s.staffWorkRules ||= {})[p.id] = [{id:`SCH-DEMO-${p.id}`,store,personId:p.id,weekdays:[1,2,3,4,5,6],start:'09:00',end:'18:00',effectiveFrom:today(),by:'Demo workweek',at:stamp()}];
  }
}
export function hr(s, p) {
  s.staffHR ||= {}; const b0 = (p.branchIds || [])[0] || branchesOf(s, p.store)[0]?.id;
  return (s.staffHR[p.id] ||= {role: p.kind === 'manager' || /^MGR/.test(p.id) ? 'manager' : 'picker', homeBranch: b0, cover: (p.branchIds || []).slice(1), payType: p.payPlan?.type || 'monthly', rate: p.payPlan?.rate || 12000, freq: p.payPlan?.type === 'per_shift' ? 'weekly' : 'monthly', mealPerShift: 60, coverAllowance: 100, kyc: {status: p.status === 'active' ? 'verified' : 'pending'}, payout: p.status === 'active' ? {method: 'upi', upi: `${String(p.name || 'staff').split(' ')[0].toLowerCase()}@okaxis`, verified: true} : {method: '', verified: false}, transfers: []});
}
export function actor(s, ws) {
  if (SELLER_WORKSPACES.includes(ws)) return {kind: 'owner', store: ws, branch: null, name: s.shopPartners?.[ws]?.name || 'Owner'};
  if (STORE_BY_MANAGER[ws]) { const store = STORE_BY_MANAGER[ws], m = (s.storeManagers || []).find(x => x.id === s.activeStoreManager?.[ws] && x.store === store) || (s.storeManagers || []).find(x => x.store === store && x.status === 'active'); return {kind: 'manager', store, branch: m ? hr(s, {...m, kind: 'manager'}).homeBranch : null, name: m?.name || 'Manager', id: m?.id, person:m}; }
  if (STORE_BY_WORKER[ws]) { const store = STORE_BY_WORKER[ws], p = (s.pickerStaff || []).find(x => x.id === s.activePicker?.[ws] && x.store === store) || (s.pickerStaff || []).find(x => x.store === store && x.status === 'active'); return {kind: 'staff', store, person: p, name: p?.name}; }
  return null;
}
const inScope = (a, p) => a.kind === 'owner' || (a.kind === 'manager' && (p.hr.homeBranch === a.branch || p.hr.cover.includes(a.branch)));

// ---------- invite, branches, transfer ----------
export function invite(s, ws, v, inviteFn) {
  const a = actor(s, ws), store = a.store, name = String(v.name || '').trim(), mobile = String(v.mobile || '').replace(/\D/g, '');
  if (!name || !/^[6-9]\d{9}$/.test(mobile)) return {error: 'Enter a name and a valid 10-digit mobile.'};
  if (!ROLES[v.role]) return {error: 'Choose a role.'};
  if (!branchesOf(s, store).some(b => b.id === v.homeBranch)) return {error: 'Choose the home branch.'};
  if (a.kind === 'manager' && v.homeBranch !== a.branch) return {error: 'Managers can invite staff only for their own branch.'};
  if (!(Number(v.rate) > 0)) return {error: 'Enter the pay rate.'};
  const same = (s.pickerStaff || []).find(p => p.store === store && p.mobile === mobile);
  if (same && !['removed', 'offboarded'].includes(same.status)) return {error: `${same.name} already has an ${same.status} employment here. Open their existing profile instead.`};
  const elsewhere = (s.pickerStaff || []).filter(p => p.store !== store && p.mobile === mobile && p.status === 'active').map(p => s.shopPartners?.[p.store]?.name || p.store);
  let p;
  if (same) { same.status = 'invited'; same.rehiredAt = today(); (same.history ||= []).push({at: stamp(), text: 'Rehired'}); p = same; }
  else { const e = inviteFn ? inviteFn(s, store, name, mobile) : ''; if (e && !(elsewhere.length && /already has an active/.test(e))) return {error: e}; p = (s.pickerStaff || []).filter(x => x.store === store && x.mobile === mobile).at(-1); if (!p) { p = {id: uid('PICK'), store, name, mobile, status: 'invited', invitedBy: a.name, branchIds: []}; (s.pickerStaff ||= []).push(p); } }
  const cover = [].concat(v.cover || []).filter(id => id && id !== v.homeBranch);
  p.branchIds = [v.homeBranch, ...cover]; p.payPlan = {type: v.payType, rate: Number(v.rate), effectiveFrom: v.start || today()};
  s.staffHR ||= {}; s.staffHR[p.id] = {...hr(s, {...p, status: 'invited'}), role: v.role, homeBranch: v.homeBranch, cover, payType: v.payType, rate: Number(v.rate), freq: v.freq || 'monthly', mealPerShift: Number(v.meal ?? 60), coverAllowance: Number(v.coverAllowance ?? 100), start: v.start || today(), kyc: {status: 'pending'}, payout: {method: '', verified: false}};
  return {ok: true, person: p, note: globalThis.__moveaiPC?.inviteNote?.(s, mobile, store) || (elsewhere.length ? `${name} also works at ${elsewhere.join(', ')} — one MoveAI account, separate employment.` : '')};
}
export function setBranches(s, ws, pid, home, cover, reason = '') {
  const a = actor(s, ws), p = people(s, a.store).find(x => x.id === pid); if (!p) return 'Not found.';
  if (a.kind !== 'owner' && !inScope(a, p)) return 'You can change only your branch staff.';
  if (!branchesOf(s, a.store).some(b => b.id === home)) return 'Choose a home branch.';
  PC.ensureCore(s);const employment=s.employments.find(e=>e.business===a.store&&e.source.id===pid);
  if(employment){const error=PC.transfer(s,ws,employment.id,{home,cover,from:today(),reason});if(error)return error;}
  const h = s.staffHR[pid], was = h.homeBranch;
  if (was !== home) { if (a.kind === 'manager') return 'Only the owner can transfer staff to another branch.'; h.transfers.push({from: was, to: home, date: today(), reason}); }
  h.homeBranch = home; h.cover = [].concat(cover || []).filter(x => x && x !== home);
  const rec = (s.pickerStaff || []).find(x => x.id === pid) || (s.storeManagers || []).find(x => x.id === pid); if (rec) rec.branchIds = [home, ...h.cover];
  return '';
}
export function canDisableBranch(s, store, branchId) { const n = people(s, store).filter(p => p.status === 'active' && p.hr.homeBranch === branchId).length; return n ? `${n} staff have this as their home branch. Transfer them first.` : ''; }

// ---------- staff verification and payout details ----------
export function verifyStaff(s, pid, v) {
  const h = s.staffHR[pid]; if (!h) return 'Not found.';
  const method=v.method||'legacy',idType=method==='other_document'?'other':'aadhaar';
  if(!['legacy','otp','offline','aadhaar_document','other_document'].includes(method))return 'Choose an ID verification method.';
  if(method!=='otp'){
    const dob=new Date(v.dob);if(isNaN(dob))return 'Enter your date of birth.';
    if((clock()-dob.getTime())/(365.25*DAY)<18)return 'You must be 18 or older to work at a store.';
  }
  if(!(v.consent==='1'||v.consent===true))return 'Give consent to the mock ID check.';
  if(method==='otp'&&(!h.otpChallenge||h.otpChallenge.last4!==String(v.aadhaar||'').slice(-4)||clock()-h.otpChallenge.at>5*60*1000))return 'Tap Send demo OTP first; the test code expires after five minutes.';
  if(['aadhaar_document','other_document'].includes(method)&&(!v.front||!v.back))return 'Add both mock ID sides, or the same test PDF in both fields.';
  if(method==='legacy'&&!!v.front!==!!v.back)return 'Add both mock ID sides, or the same test PDF in both fields.';
  if(method==='offline'&&!v.offlineFile)return 'Add a mock QR image, PDF or offline XML file.';
  const k=['legacy','otp'].includes(method)?aadhaarEkyc({aadhaar:v.aadhaar,otp:v.otp,consent:true}):{ok:true};
  if(!k.ok)return k.reason;
  if(!['otp','legacy'].includes(method)&&!/^[0-9]{4}$/.test(String(v.idLast4||'')))return 'Enter the last four digits of the test ID.';
  if(method!=='otp'&&!v.selfie)return 'Add a mock selfie for manual review.';
  if(method==='legacy'&&!/^[6-9]\d{9}$/.test(String(v.emergencyMobile||'')))return 'Add an emergency contact mobile.';
  h.kyc={status:['otp','legacy'].includes(method)?'verified':'submitted',reviewStatus:'pending',method,idType,idLast4:['otp','legacy'].includes(method)?String(v.aadhaar).slice(-4):String(v.idLast4),dob:v.dob||'',selfie:v.selfie||'',front:v.front||null,back:v.back||null,offlineFile:v.offlineFile||null,documentType:method==='other_document'?String(v.documentType||'Other ID'):null,emergency:method==='legacy'?{name:v.emergencyName,mobile:v.emergencyMobile}:h.kyc?.emergency,version:(h.kyc?.version||0)+1,at:stamp()};
  delete h.otpChallenge;
  Cred.log(s,pid,'id','pending','Worker',method==='otp'?'Demo OTP completed; store joining confirmation pending':method==='offline'?'Mock offline file submitted; digital signature not checked':'Mock document submitted for manual review');
  const p=(s.pickerStaff||[]).concat(s.storeManagers||[]).find(x=>x.id===pid);
  (s.notifications||=[]).unshift({id:uid('NT'),to:p?.store,route:'storeHR',text:`${p?.name||'Worker'} submitted ${method==='otp'?'a mock OTP check':'mock ID documents'} · ID ending ${h.kyc.idLast4}`,ref:pid,at:stamp(),read:false});
  return '';
}
export function issueMockOtp(s,pid,aadhaar){
  const h=s.staffHR?.[pid],a=String(aadhaar||'').replace(/\D/g,'');
  if(!h)return 'Staff account not found.';
  if(!/^[2-9]\d{11}$/.test(a))return 'Enter a 12-digit test Aadhaar number first.';
  h.otpChallenge={last4:a.slice(-4),at:clock()};return '';
}
export function saveEmergencyContact(s,pid,v){
  const h=s.staffHR?.[pid];if(!h)return 'Staff account not found.';
  if(!String(v.name||'').trim()||!/^[6-9]\d{9}$/.test(String(v.mobile||'')))return 'Enter a name and valid 10-digit emergency mobile.';
  (h.kyc ||= {status:'pending'}).emergency={name:String(v.name).trim(),mobile:String(v.mobile)};
  Cred.log(s,pid,'personal','updated','Worker','Emergency contact updated');return '';
}
export function reviewIdentity(s,ws,pid,decision,reason=''){
  const a=actor(s,ws),p=people(s,a?.store).find(x=>x.id===pid);
  if(a?.kind!=='owner'||!p)return 'Only this store owner can review the worker identity.';
  const k=s.staffHR?.[pid]?.kyc;if(!['verified','submitted'].includes(k?.status)||k.reviewStatus!=='pending')return 'No verified ID is waiting for store review.';
  if(!['approve','correction'].includes(decision))return 'Choose approve or request correction.';
  if(decision==='correction'&&!String(reason).trim())return 'Explain what the worker should correct.';
  k.reviewStatus=decision==='approve'?'approved':'correction_required';k.reviewedBy=a.name;k.reviewedAt=stamp();k.reviewReason=String(reason).trim();
  if(decision==='approve')k.status='verified';
  Cred.log(s,pid,'id',k.reviewStatus,a.name,k.reviewReason);
  if(decision==='correction')k.status='pending';
  (s.notifications||=[]).unshift({id:uid('NT'),to:({grocery:'picker',groceryFresh:'pickerFresh',electrical:'pickerElectrical',fashion:'pickerFashion'}[a.store]||'picker'),route:'myHR',text:`${a.name} ${decision==='approve'?'confirmed your mock ID review':`requested ID correction: ${k.reviewReason}`}`,ref:pid,staffId:pid,at:stamp(),read:false});return '';
}
export function escalateIdentity(s,ws,pid,reason){
  const a=actor(s,ws),p=people(s,a?.store).find(x=>x.id===pid),k=s.staffHR?.[pid]?.kyc;
  if(a?.kind!=='owner'||!p||k?.reviewStatus!=='pending')return 'Only the owner can escalate a pending ID review.';
  if(!String(reason||'').trim())return 'Give the platform a reason for review.';
  k.reviewStatus='platform_pending';k.escalationReason=String(reason).trim();Cred.log(s,pid,'id','platform_pending',a.name,reason);return '';
}
export function platformIdentityDecision(s,pid,decision,reason=''){
  const k=s.staffHR?.[pid]?.kyc;if(k?.reviewStatus!=='platform_pending')return 'No platform review is pending.';
  if(!['cleared','correction_required'].includes(decision)||decision==='correction_required'&&!String(reason).trim())return 'Enter a correction reason.';
  k.reviewStatus=decision==='cleared'?'pending':'correction_required';k.platformDecision=decision;k.platformReason=String(reason).trim();
  if(decision==='correction_required')k.status='pending';
  Cred.log(s,pid,'id',decision,'Platform reviewer',reason);
  return '';
}
export function platformStaffReviews(s){
  const pending=(s.pickerStaff||[]).concat(s.storeManagers||[]).filter(p=>s.staffHR?.[p.id]?.kyc?.reviewStatus==='platform_pending');
  return `<section class="panel"><h2>Escalated staff ID reviews · mock</h2><p>Only escalated cases appear here. A platform clearance returns the case to the store owner for a final decision.</p>${pending.map(p=>{const k=s.staffHR[p.id].kyc;return `<div class="ledger-row static"><span><b>${esc(p.name)} · ${esc(p.store)}</b><small>ID ${esc(k.idType||'aadhaar')} ending ${esc(k.idLast4)} · ${esc(k.escalationReason)}</small>${Cred.preview(k.front,'ID front')}${Cred.preview(k.back,'ID back')}${k.offlineFile?`<small>Mock offline file: ${esc(k.offlineFile.name)}</small>${Cred.preview(k.offlineFile,'offline file')}`:''}</span><span class="row-actions"><button class="button primary compact" data-hr="platform-clear" data-id="${esc(p.id)}">Clear for store review</button><button class="button secondary compact" data-hr="platform-correction" data-id="${esc(p.id)}">Request correction</button></span></div>`}).join('')||'<p class="muted">No escalated staff cases.</p>'}</section>`;
}
export function setPayout(s, pid, v) {
  const h = s.staffHR[pid]; if (!h) return 'Not found.';
  // UPI now goes through an actual verification check (upiVerify), the same spirit as pennyDrop()
  // for bank accounts — a syntactically valid-looking VPA is no longer treated as automatically real.
  let next;
  if (v.method === 'upi') { const r = upiVerify({vpa: v.upi, name: v.name}); if (!r.ok) return r.reason; next = {method:'upi',upi:v.upi,proof:v.proof||null,verified:!v.reviewRequired,reviewStatus:v.reviewRequired?'pending':'approved',at:stamp()}; }
  else if (v.method === 'bank') { const r = pennyDrop({account: v.account, ifsc: v.ifsc, name: v.name}); if (!r.ok) return r.reason; if(v.reviewRequired&&!v.proof)return 'Add a small mock cancelled cheque or bank proof (image or PDF).'; next = {method:'bank',accountName:String(v.name||'').trim(),account:`••••${String(v.account).slice(-4)}`,accountNumber:String(v.account),ifsc:String(v.ifsc).toUpperCase(),proof:v.proof||null,verified:!v.reviewRequired,reviewStatus:v.reviewRequired?'pending':'approved',at:stamp()}; }
  else if (v.method === 'cash') next = {method: 'cash', verified: true, at: stamp()};
  if(next){const p=(s.pickerStaff||[]).concat(s.storeManagers||[]).find(x=>x.id===pid);if(h.payout?.verified)h.previousPayout={...h.payout};h.payout={...next,version:(h.payout?.version||0)+1};Cred.log(s,pid,'payout',next.reviewStatus||'approved','Worker',`${next.method} details updated`);(s.notifications||=[]).unshift({id:uid('NT'),to:p?.store,route:'storeHR',text:`${p?.name||'Worker'} updated mock payout method · ${next.method}${next.account?` ${next.account}`:''}`,ref:pid,at:stamp(),read:false});return '';}
  return 'Choose UPI, bank or cash.';
}
export function reviewPayout(s,ws,pid,decision,reason=''){
  const a=actor(s,ws),p=people(s,a?.store).find(x=>x.id===pid),h=s.staffHR?.[pid];
  if(a?.kind!=='owner'||!p)return 'Only this store owner reviews payout details.';
  if(h?.payout?.reviewStatus!=='pending')return 'No payout change is waiting for review.';
  if(decision==='correction'&&!String(reason).trim())return 'Explain the correction needed.';
  h.payout.reviewStatus=decision==='approve'?'approved':'correction_required';h.payout.verified=decision==='approve';
  h.payout.reviewedBy=a.name;h.payout.reviewReason=String(reason).trim();h.payout.reviewedAt=stamp();
  Cred.log(s,pid,'payout',h.payout.reviewStatus,a.name,reason);
  (s.notifications||=[]).unshift({id:uid('NT'),to:({grocery:'picker',groceryFresh:'pickerFresh',electrical:'pickerElectrical',fashion:'pickerFashion'}[a.store]||'picker'),route:'myHR',staffId:pid,text:`${a.name} ${decision==='approve'?'approved your payout details':`requested a payout correction: ${reason}`}`,at:stamp(),read:false});
  return '';
}

// ---------- attendance by branch ----------
export function markDay(s, ws, pid, date, branchId) {
  const a = actor(s, ws), p = people(s, a.store).find(x => x.id === pid); if (!p) return 'Not found.';
  if(a.kind==='manager'&&a.id===pid)return 'Managers request their own attendance in My pay; the owner approves it.';
  if (!inScope(a, p)) return 'Not your branch staff.';
  if (![p.hr.homeBranch, ...p.hr.cover].includes(branchId)) return 'That branch is not assigned to this person. Add it as a cover branch first.';
  if (a.kind === 'manager' && branchId !== a.branch) return 'Managers mark attendance only at their branch.';
  return Time.markByOwner(s,a.store,pid,branchId,date,a.name);
}
const days = (s, pid, m = month()) => (s.staffDays || []).filter(d => d.personId === pid && d.date.startsWith(m) && (!d.status || d.status === 'approved'));

// ---------- ledger ----------
const L = s => (s.staffLedger ||= []);
const SIGN = {earning: 1, allowance: 1, reimbursement: 1, deduction: -1, payment: -1, advance_recovery: -1, cash_return: 1};
export function post(s, e) { const x = {id: uid('SL'), at: stamp(), ts: clock(), status: 'posted', ...e}; L(s).push(x); return x; }
const counts = e => !['disputed', 'rejected', 'pending_approval', 'pending_ack', 'pending_ack_failed', 'failed', 'not_received'].includes(e.status) && !(e.type === 'reimbursement' && e.status !== 'approved');
export function balance(s, pid) { return L(s).filter(e => e.personId === pid && SIGN[e.type] && counts(e)).reduce((a, e) => a + SIGN[e.type] * e.amount, 0); }
export const advanceLeft = (s, pid) => (s.staffAdvances || []).filter(a => a.personId === pid && a.status === 'active').reduce((x, a) => x + a.balance, 0);
export function addReimbursement(s, pid, v, byStaff) {
  const amount = Math.round(Number(v.amount)); if (!(amount > 0)) return 'Enter the amount.'; if (!v.receipt) return 'Attach a photo of the receipt.';
  const p = (s.pickerStaff || []).find(x => x.id === pid) || (s.storeManagers || []).find(x => x.id === pid);
  post(s, {store: p.store, personId: pid, branchId: v.branchId || s.staffHR[pid].homeBranch, type: 'reimbursement', amount, note: String(v.note || 'Store purchase').trim(), receipt: v.receipt, status: 'submitted', by: byStaff ? p.name : 'Store'}); return '';
}
export function decideEntry(s, ws, id, decision) {
  const a = actor(s, ws), e = L(s).find(x => x.id === id); if (!e) return 'Not found.';
  if (e.type === 'reimbursement' && e.status === 'submitted') { const lc = globalThis.__moveaiLC?.canApprove?.(s, ws, a.store, e.branchId, e.amount); if (lc) return lc; if (!globalThis.__moveaiLC && a.kind === 'manager' && e.amount > LIMITS.managerExpense) return `Managers can approve up to ${inr(LIMITS.managerExpense)}; the owner must approve this.`; e.status = decision === 'approve' ? 'approved' : 'rejected'; e.decidedBy = a.name; return ''; }
  if (e.type === 'deduction' && e.status === 'disputed') { if (a.kind !== 'owner') return 'Only the owner decides disputes.'; e.status = decision === 'approve' ? 'posted' : 'rejected'; e.decidedBy = a.name; return ''; }
  return 'Nothing to decide.';
}
export function addDeduction(s, ws, pid, v) {
  const a = actor(s, ws), amount = Math.round(Number(v.amount));
  if (!(amount > 0) || !String(v.reason || '').trim() || !v.evidence) return 'A deduction needs an amount, reason and evidence.';
  if (amount > LIMITS.deductionCap && a.kind !== 'owner') return `Deductions above ${inr(LIMITS.deductionCap)} need the owner.`;
  post(s, {store: a.store, personId: pid, branchId: s.staffHR[pid].homeBranch, type: 'deduction', amount, note: v.reason.trim(), evidence: v.evidence, by: a.name}); return '';
}
export function dispute(s, pid, id, reason) { const e = L(s).find(x => x.id === id && x.personId === pid); if (!e || e.type !== 'deduction') return 'Only deductions can be disputed here.'; if (!String(reason || '').trim()) return 'Say why you disagree.'; e.status = 'disputed'; e.disputeReason = reason.trim(); return ''; }
export function giveAdvance(s, ws, pid, v) {
  const a = actor(s, ws), h = s.staffHR[pid], amount = Math.round(Number(v.amount)), inst = Math.round(Number(v.instalment));
  if (!(amount > 0) || !(inst > 0) || inst > amount) return 'Enter an advance and a monthly repayment no greater than the advance.';
  const cap = h.payType === 'monthly' ? h.rate * LIMITS.advanceMaxMonths : h.rate * 26;
  if (amount + (s.staffAdvances||[]).filter(x=>x.personId===pid&&x.store===a.store&&['active','pending_ack','pending_approval'].includes(x.status)).reduce((n,x)=>n+x.balance,0) > cap) return `Advances are limited to about one month's pay (${inr(cap)}).`;
  if (!String(v.reason || '').trim()) return 'Add a reason.';
  const status = a.kind === 'owner' ? 'active' : 'pending_approval', id=uid('ADV');
  // Attempt the real payout BEFORE recording the advance as given. Previously payOut()'s result was
  // discarded entirely — an owner choosing UPI for someone with no verified account would see
  // "Advance given" even though the money never moved, with an advance record left behind claiming
  // otherwise. Now a failed payout (unverified UPI/bank, gateway decline) is reported back and
  // nothing is recorded, instead of silently succeeding.
  if (status === 'active') {
    const payoutResult = payOut(s, a.store, pid, amount, v.method || 'upi', `Salary advance · ${v.reason.trim()}`, 'advance', id);
    if (payoutResult?.error) return payoutResult.error;
  }
  (s.staffAdvances ||= []).push({id, store: a.store, personId: pid, amount, balance: amount, instalment: inst, reason: v.reason.trim(), method: v.method || 'upi', status: status==='active'&&(v.method||'upi')==='cash'?'pending_ack':status, at: stamp(), by: a.name});
  return status === 'active' ? '' : 'sent';
}
export function requestAdvance(s, ws, pid, v){
  const a=actor(s,ws),p=people(s,a?.store).find(x=>x.id===pid&&x.status==='active');
  if(!p||!(a.kind==='owner'||a.kind==='manager'&&inScope(a,p)||a.kind==='staff'&&a.person?.id===pid))return 'You can request an advance only for your own active store worker.';
  if(a.kind==='owner')return 'Owners can give an advance from Pay workers.';
  const amount=Math.round(Number(v.amount)),instalment=Math.round(Number(v.instalment));
  if(!(amount>0)||!(instalment>0)||instalment>amount||!String(v.reason||'').trim())return 'Enter the amount, monthly repayment and reason.';
  const cap=p.hr.payType==='monthly'?p.hr.rate*LIMITS.advanceMaxMonths:p.hr.rate*26;
  const already=(s.staffAdvances||[]).filter(x=>x.store===a.store&&x.personId===pid&&['active','pending_ack','pending_approval'].includes(x.status)).reduce((n,x)=>n+x.balance,0);
  if(amount+already>cap)return `Total advance requests cannot exceed ${inr(cap)}.`;
  (s.staffAdvances||=[]).push({id:uid('ADV'),store:a.store,personId:pid,amount,balance:amount,instalment,reason:String(v.reason).trim(),method:a.kind==='staff'?p.hr.payout?.method||'cash':v.method||'cash',status:'pending_approval',at:stamp(),by:a.name});
  return '';
}
export function changeAdvanceOffer(s,ws,id,amount,instalment){
  const a=actor(s,ws),x=(s.staffAdvances||[]).find(v=>v.id===id&&v.store===a?.store&&v.status==='pending_approval');
  if(a?.kind!=='owner'||!x)return 'Only the store owner can change a pending request.';
  amount=Math.round(Number(amount));instalment=Math.round(Number(instalment));
  if(!(amount>0)||!(instalment>0)||instalment>amount)return 'Enter an amount and monthly repayment no greater than that amount.';
  const h=s.staffHR?.[x.personId],cap=h?.payType==='monthly'?h.rate:h?.rate*26;
  const other=(s.staffAdvances||[]).filter(v=>v.id!==id&&v.store===a.store&&v.personId===x.personId&&['active','pending_ack','pending_approval','counter_offer'].includes(v.status)).reduce((n,v)=>n+v.balance,0);
  if(cap>0&&amount+other>cap)return `Total advance requests cannot exceed ${inr(cap)}.`;
  x.offer={amount,instalment,at:stamp(),by:a.name};x.status='counter_offer';return '';
}
export function respondAdvanceOffer(s,ws,id,accept){
  const a=actor(s,ws),x=(s.staffAdvances||[]).find(v=>v.id===id&&v.store===a?.store&&v.personId===a?.person?.id&&v.status==='counter_offer');
  if(a?.kind!=='staff'||!x)return 'Only this worker can respond to the offer.';
  if(accept){x.amount=x.offer.amount;x.balance=x.offer.amount;x.instalment=x.offer.instalment;x.status='pending_approval';x.acceptedAt=stamp();}
  else x.status='declined';return '';
}
export function approveAdvance(s, ws, id) { const a = actor(s, ws), x = (s.staffAdvances || []).find(y => y.id === id); if (a.kind !== 'owner'||x?.store!==a.store) return 'Only this store owner approves advances.'; if (!x || x.status !== 'pending_approval') return 'Nothing to approve.';const released=Payroll.releaseRequestedAdvance(s,a.store,id);if(typeof released==='string')return released;x.approvedBy=a.name;s.latestAdvanceUpiLink=released.upiLink||null;return ''; }
// one payout routine for salary and advances: UPI/bank via the payment company, wallet, or cash needing acknowledgement
function payOut(s, store, pid, amount, method, note, kind = 'salary', advanceId = null, payrollRecovery = null) {
  const h = s.staffHR[pid], m = method || h.payout?.method || 'cash', partyName = (s.pickerStaff || []).concat(s.storeManagers || []).find(x => x.id === pid)?.name;
  if (['upi', 'bank'].includes(m) && (!h.payout?.verified || h.payout.method !== m || (m === 'bank' && !h.payout.accountNumber))) return {error: `${partyName} has not added a verified ${m.toUpperCase()} account. Pay in cash or ask them to add it.`};
  let status = 'paid', ref = `CASH-${Date.now().toString().slice(-6)}`;
  if (['upi', 'bank'].includes(m)) { const g = gateway.payout(m === 'upi' ? {method: 'upi', vpa: h.payout.upi} : {method: 'bank', accountNumber: h.payout.accountNumber}, amount); if (!g.ok) return {error: g.reason}; ref = g.ref; }
  if (m === 'wallet') record(s, {owner: `staff:${pid}`, sourceType: 'store_pay', sourceId: pid, type: 'wallet_credit', payer: store, payee: `staff:${pid}`, responsible: store, amount, method: 'wallet', reference: `WAL-${Date.now().toString().slice(-6)}`, status: 'confirmed', note});
  if (m === 'cash') status = 'pending_ack';
  const e = kind === 'advance' ? post(s, {store, personId: pid, branchId: h.homeBranch, type: 'advance_paid', amount, note, method: m, reference: ref, status, advanceId}) : post(s, {store, personId: pid, branchId: h.homeBranch, type: 'payment', amount, note, method: m, reference: ref, status, payrollRecovery});
  return {ok: true, entry: e};
}
export function acknowledge(s, pid, id, ok) { const e = L(s).find(x => x.id === id && x.personId === pid && x.status === 'pending_ack'); if (!e) return 'Nothing to confirm.'; e.status = ok ? 'acknowledged' : 'not_received'; e.ackAt = stamp(); if(e.advanceId){Payroll.ensurePayrollCore(s);const a=(s.payAdvances||[]).find(x=>x.migratedFrom?.id===e.advanceId&&x.status==='pending_ack');if(a){a.status=ok?'active':'disputed';const raw=(s.staffAdvances||[]).find(x=>x.id===e.advanceId);if(raw)raw.status=a.status;}}if(ok&&e.payrollRecovery)Payroll.applyRecovery(s,e.store,e.payrollRecovery.personId,e.payrollRecovery.period,e.payrollRecovery.plan); return ''; }

// ---------- payroll ----------
export function payrollLines(s, store, scopeBranch = null) {
  return people(s, store).filter(p => p.status === 'active' && (!scopeBranch || p.hr.homeBranch === scopeBranch || p.hr.cover.includes(scopeBranch))).map(p => {
    const h = p.hr, ds = days(s, p.id), byBranch = {};
    for (const d of ds) byBranch[d.branchId] = (byBranch[d.branchId] || 0) + 1;
    const worked = ds.length, coverDays = ds.filter(d => d.cover).length;
    const orders = (s.customerOrders || []).filter(o => o.pick?.pickerId === p.id && (o.deliveredAt ? new Date(o.deliveredAt).toISOString().slice(0, 7) === month() : true)).length;
    const hasRule=!!Time.schedule(s,p.id,`${month()}-28`),attendance=hasRule?Time.summary(s,store,p.id,month()):null;
    const base = h.payType === 'monthly' ? Math.round(h.rate * (attendance ? attendance.paidUnits / Math.max(1,attendance.scheduled) : Math.min(worked, 26) / 26)) : h.payType === 'per_order' ? h.rate * orders : h.rate * (attendance ? attendance.paidUnits : worked);
    const meal = worked * (h.mealPerShift || 0), coverPay = coverDays * (h.coverAllowance || 0);
    const posted = L(s).some(e => e.personId === p.id && e.type === 'earning' && e.period === month());
    const owed = balance(s, p.id) + (posted ? 0 : base + meal + coverPay);
    Payroll.ensurePayrollCore(s);
    const emp = s.employments.find(e => e.business === store && e.source.id === p.id && ['picker','manager'].includes(e.source.kind));
    const recovery = emp ? Payroll.recoveryPlan(s, store, emp.personId, month(), owed).reduce((sum, x) => sum + x.amount, 0) : 0;
    return {p, worked, coverDays, byBranch, attendance, base, meal, coverPay, posted, recovery, net: Math.max(0, owed - recovery), method: h.payout?.method || 'cash', payoutOk: h.payout?.verified};
  });
}
export function postEarnings(s, ws) {
  const a = actor(s, ws); if (!['owner', 'manager'].includes(a.kind)) return 'Not allowed.';
  if(people(s,a.store).some(p=>p.status==='active'&&Time.schedule(s,p.id,`${month()}-28`))&&!s.staffMonthLocks?.some(x=>x.store===a.store&&x.month===month()&&x.status==='locked'))return 'Review attendance and lock this month before posting earnings.';
  for (const l of payrollLines(s, a.store, a.kind === 'manager' ? a.branch : null)) {
    if (l.posted) continue;
    const workBase=l.attendance&&l.p.hr.payType!=='per_order'?Math.round(l.p.hr.rate*(l.attendance.present+l.attendance.extra)/(l.p.hr.payType==='monthly'?Math.max(1,l.attendance.scheduled):1)):l.base;
    const branchRows=Object.entries(l.byBranch);let allocated=0;
    for (const [index,[b,n]] of branchRows.entries()) { const share=l.worked?(index===branchRows.length-1?workBase-allocated:Math.round(workBase*n/l.worked)):0;allocated+=share;if(share)post(s,{store:a.store,personId:l.p.id,branchId:b,type:'earning',amount:share,period:month(),note:`${l.p.hr.payType==='monthly'?'Salary':l.p.hr.payType==='per_order'?'Per-order pay':'Shift pay'} · ${n} day(s) at ${branchName(s,a.store,b)}`}); }
    if(l.base-workBase)post(s,{store:a.store,personId:l.p.id,branchId:l.p.hr.homeBranch,type:'earning',amount:l.base-workBase,period:month(),note:'Approved paid leave / paid absence'});
    if(!l.worked&&workBase)post(s,{store:a.store,personId:l.p.id,branchId:l.p.hr.homeBranch,type:'earning',amount:workBase,period:month(),note:'Per-order or scheduled pay'});
    if (l.meal) post(s, {store: a.store, personId: l.p.id, branchId: l.p.hr.homeBranch, type: 'allowance', amount: l.meal, period: month(), note: `Meal allowance · ${l.worked} shift(s) — not recovered`});
    if (l.coverPay) post(s, {store: a.store, personId: l.p.id, branchId: Object.keys(l.byBranch).find(b => b !== l.p.hr.homeBranch) || l.p.hr.homeBranch, type: 'allowance', amount: l.coverPay, period: month(), note: `Cover allowance · ${l.coverDays} day(s) at another branch`});
  }
  return '';
}
export function payPerson(s, ws, pid, method) {
  const a = actor(s, ws); if (a.kind !== 'owner') return 'The owner pays staff (managers prepare).';
  const l = payrollLines(s, a.store).find(x => x.p.id === pid); if (!l) return 'Not found.'; if (!l.posted) return 'Post this month\'s earnings first.';
  Payroll.ensurePayrollCore(s);const emp=s.employments.find(e=>e.business===a.store&&e.source.id===pid);
  if(!emp)return 'Worker not found.';
  if(L(s).some(e=>e.store===a.store&&e.personId===pid&&e.type==='payment'&&e.status==='pending_ack'))return 'Wait for the worker to confirm the pending cash payment.';
  const preview=Payroll.monthlyPayPreview(s,a.store,emp.personId,month());
  if(!(preview.gross>0))return 'Nothing to pay.';
  if(!preview.net){Payroll.applyRecovery(s,a.store,emp.personId,month(),preview.recovery);return '';}
  const r=payOut(s,a.store,pid,preview.net,method||l.method,`Pay for ${month()}`,'salary',null,{personId:emp.personId,period:month(),plan:preview.recovery});
  if(r.error)return r.error;
  if(r.entry.status!=='pending_ack')Payroll.applyRecovery(s,a.store,emp.personId,month(),preview.recovery);
  return '';
}
export function payslip(s, store, pid) {
  const p = people(s, store).find(x => x.id === pid), es = L(s).filter(e => e.personId === pid && (e.period === month() || (e.ts && new Date(e.ts).toISOString().slice(0, 7) === month())));
  return {p, es, branches: Object.entries(days(s, pid).reduce((a, d) => (a[d.branchId] = (a[d.branchId] || 0) + 1, a), {})).map(([b, n]) => `${branchName(s, store, b)} ${n} day(s)`)};
}

// ---------- petty cash per branch ----------
export function petty(s, branchId) { s.pettyCash ||= {}; return (s.pettyCash[branchId] ||= {entries: []}); }
export const pettyBalance = (s, b) => petty(s, b).entries.reduce((a, e) => a + (e.type === 'topup' ? e.amount : e.type === 'expense' ? -e.amount : e.type === 'count_diff' ? e.amount : 0), 0);
export function pettyAction(s, ws, branchId, v) {
  const a = actor(s, ws); if (a.kind === 'manager' && branchId !== a.branch) return 'Managers handle petty cash only at their branch.';
  const amount = Math.round(Number(v.amount)), book = petty(s, branchId);
  if (v.type === 'topup') { if (a.kind !== 'owner') return 'Only the owner tops up petty cash.'; if (!(amount > 0)) return 'Enter the amount.'; book.entries.push({type: 'topup', amount, by: a.name, at: stamp(), note: 'Float given'}); return ''; }
  if (v.type === 'expense') { if (!(amount > 0) || !String(v.note || '').trim()) return 'Enter amount and what it was for.'; if (!v.receipt) return 'Attach the receipt photo.'; if (amount > pettyBalance(s, branchId)) return 'Not enough petty cash. Ask the owner to top up.'; book.entries.push({type: 'expense', amount, note: v.note.trim(), receipt: v.receipt, by: a.name, at: stamp()}); return ''; }
  if (v.type === 'count') { const counted = Math.round(Number(v.counted)); if (!(counted >= 0)) return 'Enter the cash counted.'; const diff = counted - pettyBalance(s, branchId); book.entries.push({type: 'count_diff', amount: diff, by: a.name, at: stamp(), note: diff ? `Day-end count ${inr(counted)} · ${diff < 0 ? 'short' : 'extra'} ${inr(Math.abs(diff))}` : `Day-end count ${inr(counted)} · matches`}); return ''; }
  return 'Unknown action.';
}
export function branchCost(s, store) {
  const out = {}; for (const e of L(s).filter(x => x.store === store && ['earning', 'allowance'].includes(x.type) && (x.period === month()))) out[e.branchId] = (out[e.branchId] || 0) + e.amount;
  for (const b of branchesOf(s, store)) for (const e of petty(s, b.id).entries.filter(x => x.type === 'expense')) out[b.id] = (out[b.id] || 0) + e.amount;
  return out;
}

// ---------- seller onboarding levels and branch documents ----------
const stateOf = b => Object.keys(STATE_CODE).find(k => String(b.serviceArea || b.address || '').includes(k)) || 'Delhi';
export function sellerLevel(s, ws) {
  const p = s.shopPartners?.[ws], ob = p?.onboarding || {}, food = (p?.approvedGroups || []).some(g => ['food', 'fresh'].includes(g));
  const brs = branchesOf(s, ws), branchOk = brs.every(b => !food || (b.docs?.fssai && b.docs.fssaiExpiry >= today())) && brs.every(b => (b.docs?.gstin || ob.gstin || '').startsWith(STATE_CODE[stateOf(b)] || '07') || !ob.gstin);
  if (!ob.pan || !ob.gstin || !branchOk || ob.status === 'pending' || ob.status === 'correction_required') return {level: 1, label: 'Draft', next: 'Add PAN, GSTIN and branch documents (FSSAI for food branches) to start selling.'};
  if (!ob.bankVerified) return {level: 2, label: 'Verified to sell', next: 'Verify the payout account to receive money.'};
  return {level: 3, label: 'Payout-ready', next: ''};
}
export function ensureBranchDocs(s) {
  for (const [ws, brs] of Object.entries(s.sellerBranches || {})) for (const b of brs) {
    const p = s.shopPartners?.[ws], st = stateOf(b);
    b.docs ||= {gstin: st === 'Noida' ? (p?.onboarding?.gstin || '07AABCA1234K1Z5').replace(/^\d\d/, '09') : p?.onboarding?.gstin || '07AABCA1234K1Z5', fssai: /grocery|fresh/i.test(ws) ? `1332199900${String(brs.indexOf(b) + 1).padStart(4, '0')}` : '', fssaiExpiry: '2028-03-31', photo: 'storefront.jpg'};
  }
}
export function saveBranchDocs(s, ws, branchId, v) {
  const b = branchesOf(s, ws).find(x => x.id === branchId); if (!b) return 'Branch not found.';
  const st = stateOf(b), code = STATE_CODE[st] || '07', g = String(v.gstin || '').toUpperCase();
  if (g && !g.startsWith(code)) return `${b.name} is in ${st === 'Noida' ? 'Uttar Pradesh' : st}; its GSTIN must start with ${code} (one GSTIN per state).`;
  if (g) { const r = gstLookup(g, s.shopPartners?.[ws]?.name); if (!r.ok) return r.reason; }
  if (v.fssai && !/^\d{14}$/.test(v.fssai)) return 'FSSAI numbers have 14 digits.';
  if (v.fssai && !(v.fssaiExpiry > today())) return 'Enter a future FSSAI expiry date.';
  b.docs = {...(b.docs || {}), gstin: g || b.docs?.gstin, fssai: v.fssai || b.docs?.fssai, fssaiExpiry: v.fssaiExpiry || b.docs?.fssaiExpiry, photo: v.photo || b.docs?.photo};
  return '';
}
export function dailyChecks(s) {
  const out = [];
  for (const [ws, p] of Object.entries(s.shopPartners || {})) {
    const g = p.onboarding?.gstin; if (g && !gstLookup(g, p.name).ok && !p.gstPaused) { p.gstPaused = true; p.paused = true; out.push(`${p.name}: GSTIN ${g} is no longer active — listings and payouts paused`); }
    for (const b of branchesOf(s, ws)) { const exp = b.docs?.fssaiExpiry; if (!b.docs?.fssai) continue; if (exp && exp < today() && b.open !== false) { b.open = false; b.pausedReason = 'FSSAI expired'; out.push(`${b.name}: FSSAI expired — branch paused`); } else if (exp && exp <= new Date(clock() + 30 * DAY).toISOString().slice(0, 10)) out.push(`${b.name}: FSSAI expires on ${exp} — renew within 30 days`); }
  }
  for (const t of out) (s.notifications ||= []).unshift({id: uid('NT'), to: 'admin', text: t, at: stamp(), read: false});
  s.lastDailyCheck = stamp(); return out;
}

// ---------- screens ----------
export function screen(s, route, ws) {
  const a = actor(s, ws); if (!a) return '';
  if (route === 'storeHR' || route === 'myHR') ensureDemoWorkweeks(s, a.store);
  if (route === 'storeHR' && ['owner', 'manager'].includes(a.kind)) return ownerScreen(s, ws, a);
  if (route === 'myHR' && ['staff','manager'].includes(a.kind)) return staffScreen(s, ws, a);
  return '';
}
function ownerScreen(s, ws, a) {
  ensureBranchDocs(s);
  const needsReview=(s.staffDays||[]).some(d=>d.store===a.store&&['pending','disputed'].includes(d.status))||(s.staffLeaveRequests||[]).some(l=>l.store===a.store&&l.status==='pending');
  const tab = s.hrTab || (needsReview?'time':'team'), brs = branchesOf(s, a.store), list = people(s, a.store).filter(p => inScope(a, p));
  const tabs = [['team', 'Team by branch'], ['time', 'Attendance & leave'], ['payroll', 'Payroll'], ['ledgers', 'Ledgers & advances'], ['petty', 'Petty cash'], ['reports', 'Branch cost']];
  return `${head('People & pay', `${s.shopPartners?.[a.store]?.name || a.store}${a.kind === 'manager' ? ` · you manage ${branchName(s, a.store, a.branch)}` : ' · owner'}`)}
  <div class="people-tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-hr-tab="${k}">${l}</button>`).join('')}</div>
  ${tab === 'team' ? teamTab(s, a, brs, list) : tab === 'time' ? timeTab(s,a,list) : tab === 'payroll' ? payrollTab(s, a) : tab === 'ledgers' ? ledgersTab(s, a, list) : tab === 'petty' ? pettyTab(s, a, brs) : reportsTab(s, a, brs)}<p class="hr-error field-error" hidden></p>`;
}
const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function timeTab(s,a,list){
 const m=month(),workers=list.filter(p=>p.status==='active'),ids=new Set(workers.map(p=>p.id));
 const pending=(s.staffDays||[]).filter(d=>d.store===a.store&&ids.has(d.personId)&&['pending','disputed'].includes(d.status)&&(!a.branch||d.branchId===a.branch)&&(a.kind!=='manager'||d.personId!==a.id));
 const leave=(s.staffLeaveRequests||[]).filter(l=>l.store===a.store&&ids.has(l.personId)&&l.status==='pending'&&(a.kind!=='manager'||l.personId!==a.id));
 const options=workers.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(branchName(s,a.store,p.hr.homeBranch))}</option>`).join('');
 return `<section class="panel"><h2>Attendance & leave · ${m}</h2><p>Review worker check-ins and leave, then lock the month before posting salary. Missing workdays are unpaid unless you mark a paid exception. This is a mock record.</p><div class="metrics"><div class="metric"><span>Attendance to review</span><b>${pending.length}</b></div><div class="metric"><span>Leave to review</span><b>${leave.length}</b></div></div></section>
 <section class="panel"><h3>Needs your decision</h3>${pending.map(d=>`<div class="ledger-row static"><span><b>${esc(workers.find(p=>p.id===d.personId)?.name||'Worker')} · ${esc(d.date)}</b><small>${d.status==='disputed'?`Correction: ${esc(d.dispute)}`:`Says present · ${esc(branchName(s,a.store,d.branchId))}`}</small></span><span class="row-actions"><button class="button primary compact" data-hr="${d.status==='pending'?'time-approve':'time-keep'}" data-id="${esc(d.id)}">${d.status==='pending'?'Approve':'Keep present'}</button><button class="button secondary compact" data-hr="${d.status==='pending'?'time-reject':'time-remove'}" data-id="${esc(d.id)}">${d.status==='pending'?'Reject':'Remove'}</button></span></div>`).join('')}${leave.map(l=>`<div class="ledger-row static"><span><b>${esc(workers.find(p=>p.id===l.personId)?.name||'Worker')} · ${esc(l.from)}–${esc(l.to)}</b><small>${l.dates.length*l.units} scheduled day(s) · ${esc(l.reason)}</small></span><span class="row-actions"><button class="button primary compact" data-hr="leave-paid" data-id="${esc(l.id)}">Paid leave</button><button class="button secondary compact" data-hr="leave-unpaid" data-id="${esc(l.id)}">Unpaid leave</button><button class="button secondary compact" data-hr="leave-decline" data-id="${esc(l.id)}">Decline</button></span></div>`).join('')||'<p class="muted">Nothing waiting for approval.</p>'}</section>
 ${a.kind==='owner'?`<section class="panel"><h3>Set a worker's week</h3><p>Changes start on the effective date and do not rewrite earlier days.</p><form class="form-grid two" data-hr-form="schedule"><label><span>Worker</span><select name="pid">${options}</select></label><label><span>Effective from</span><input name="effectiveFrom" type="date" value="${today()}"></label><div class="wide"><b>Works on</b><div class="row-actions">${dayNames.map((d,i)=>`<label><input name="weekdays" type="checkbox" value="${i}" ${i>0&&i<6?'checked':''}> ${d}</label>`).join('')}</div></div><label><span>Start</span><input name="start" type="time" value="09:00"></label><label><span>End</span><input name="end" type="time" value="18:00"></label><button class="button primary wide">Save schedule</button></form></section>
 <section class="panel"><h3>Absence decision</h3><p>Use this when a scheduled day has no approved attendance or leave.</p><form class="inline-form" data-hr-form="absence"><select name="pid">${options}</select><input name="date" type="date" value="${today()}"><select name="treatment"><option value="paid">Pay this day</option><option value="unpaid">Unpaid absence</option></select><input name="reason" placeholder="Reason shown to worker"><button class="button secondary compact">Save decision</button></form></section>`:`<section class="panel"><h3>Work rules</h3><p>The owner sets working days and makes paid absence decisions. You can review requests for workers at your branch.</p></section>`}
 <section class="panel"><h3>Month-end summary</h3>${workers.map(p=>{const q=Time.summary(s,a.store,p.id,m),r=Time.schedule(s,p.id,`${m}-28`);return `<div class="ledger-row static"><span><b>${esc(p.name)}</b><small>${r?`${r.weekdays.map(d=>dayNames[d]).join(', ')} · ${esc(r.start)}–${esc(r.end)}`:'Set a schedule to use the new payroll rules'} · scheduled ${q.scheduled}, present ${q.present}, paid leave ${q.paidLeave}, unpaid leave ${q.unpaidLeave}, paid exception ${q.paidException}, unresolved ${q.unresolved}</small></span><b>${q.paidUnits} paid day(s)</b></div>`}).join('')||'<p>No active workers.</p>'}<p class="muted">Rest days are excluded from scheduled-day counts. Approved days and leave feed the Payroll tab.</p>${a.kind==='owner'?`<div class="row-actions"><button class="button primary" data-hr="lock-month" ${s.staffMonthLocks?.some(x=>x.store===a.store&&x.month===m)?'disabled':''}>${s.staffMonthLocks?.some(x=>x.store===a.store&&x.month===m)?'Month locked':'Review and lock month'}</button><button class="button secondary" data-hr="demo-month-end">Advance demo to month end</button></div><small class="muted">Demo button changes the simulated date for all roles so you can test payroll. It does not change your device clock.</small>`:'<p>Ask the owner to lock the month after your branch reviews are complete.</p>'}</section>`;
}
// Shared resolver so every screen in this file that needs "this picker/manager's real balance" goes
// through the same lookup, rather than each one separately guessing at source.kind. Falls back to the
// old direct calculation only if no employment exists yet (e.g. mid-onboarding, before ensureCore has
// anything to link) — never silently returns 0 or throws.
function unifiedBalanceFor(s, p) {
  Payroll.ensurePayrollCore(s);
  const emp = s.employments?.find(e => e.source.kind === (p.kind === 'manager' ? 'manager' : 'picker') && e.source.id === p.id);
  return emp ? Payroll.balance(s, emp.personId) : balance(s, p.id);
}
function unifiedAdvanceLeftFor(s, p) {
  Payroll.ensurePayrollCore(s);
  const emp = s.employments?.find(e => e.source.kind === (p.kind === 'manager' ? 'manager' : 'picker') && e.source.id === p.id);
  return emp ? Payroll.advanceOutstanding(s, emp.personId) : advanceLeft(s, p.id);
}
function teamTab(s, a, brs, list) {
  const sel = (n, opts, v = '') => `<select name="${n}">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const myBrs = a.kind === 'manager' ? brs.filter(b => b.id === a.branch) : brs;
  return `<section class="panel"><h2>Invite staff</h2><form class="form-grid two" data-hr-form="invite"><label><span>Name</span><input name="name"></label><label><span>Mobile</span><input name="mobile" inputmode="numeric"></label><label><span>Role</span>${sel('role', Object.entries(ROLES).filter(([k]) => k !== 'manager'))}</label><label><span>Home branch</span>${sel('homeBranch', myBrs.map(b => [b.id, b.name]))}</label><label><span>Pay type</span>${sel('payType', [['monthly', 'Monthly salary'], ['per_shift', 'Per shift'], ['per_order', 'Per order picked']])}</label><label><span>Rate ₹</span><input name="rate" type="number" placeholder="e.g. 12000 / 450 / 8"></label><label><span>Pay frequency</span>${sel('freq', [['monthly', 'Monthly'], ['weekly', 'Weekly'], ['daily', 'Daily']])}</label><label><span>Start date</span><input name="start" type="date" value="${today()}"></label><label><span>Meal allowance per shift ₹</span><input name="meal" type="number" value="60"></label><label><span>Can also cover</span><span class="hr-cover">${brs.filter(b => !myBrs.some(m => m.id === b.id) || a.kind === 'owner').map(b => `<label><input type="checkbox" name="cover" value="${b.id}"> ${esc(b.name.split(' · ').pop())}</label>`).join('')}</span></label><button class="button primary wide">Send invitation</button></form><p class="muted">They accept with an OTP on their own phone, then verify their ID and add UPI/bank details before the first payout.</p></section>
  ${brs.filter(b => a.kind === 'owner' || b.id === a.branch).map(b => { const home = list.filter(p => p.hr.homeBranch === b.id && p.status !== 'offboarded'), covers = list.filter(p => p.hr.cover.includes(b.id)); const mgr = home.find(p => p.hr.role === 'manager');
    return `<section class="panel"><h2>${esc(b.name)} · ${home.filter(p => p.status === 'active').length} staff · ${mgr ? `Manager: ${esc(mgr.name)}` : 'No manager'}</h2>${home.map(p => personRow(s, a, p, brs)).join('') || '<p class="muted">No staff with this home branch.</p>'}${covers.length ? `<small class="muted">Can cover here: ${covers.map(p => esc(p.name)).join(', ')}</small>` : ''}
    <form class="inline-form" data-hr-form="day" data-branch="${b.id}"><b>Attendance at ${esc(b.name.split(' · ').pop())}</b><select name="pid">${list.filter(p => p.status === 'active' && [p.hr.homeBranch, ...p.hr.cover].includes(b.id) && (a.kind!=='manager'||p.id!==a.id)).map(p => `<option value="${p.id}">${esc(p.name)}${p.hr.homeBranch !== b.id ? ' (cover)' : ''}</option>`).join('')}</select><input type="date" name="date" value="${today()}"><button class="button secondary compact">Mark present</button></form></section>`; }).join('')}`;
}
function personRow(s, a, p, brs) {
  const h = p.hr;
  const review=a.kind==='owner'?`<div class="hr-review"><h4>Review staff details</h4><p>${esc(identityStatusLabel(h.kyc))}${h.kyc?.documentType?` · ${esc(h.kyc.documentType)}`:''} · ${h.kyc?.idType==='other'?'ID':'Aadhaar'} ending ${esc(h.kyc?.idLast4||'—')} · version ${h.kyc?.version||1}</p>${h.kyc?.reviewStatus==='pending'?`<p>${h.kyc.method==='otp'?'Demo OTP completed; confirm this worker joined the store. No card upload.':`DOB ${esc(h.kyc.dob)} · selfie ${esc(h.kyc.selfie||'—')}`}</p>${Cred.preview(h.kyc.front,'ID front')}${Cred.preview(h.kyc.back,'ID back')}${h.kyc.offlineFile?`<p>Mock offline file: ${esc(h.kyc.offlineFile.name)}; signature not checked.</p>${Cred.preview(h.kyc.offlineFile,'offline file')}`:''}<div class="row-actions"><button class="button primary compact" data-hr="id-approve" data-id="${esc(p.id)}">${h.kyc.method==='otp'?'Confirm worker joined':(!h.kyc.method||h.kyc.method==='legacy')?'Confirm ID match':'Approve documents'}</button><button class="button secondary compact" data-hr="id-correction" data-id="${esc(p.id)}">Request correction</button><button class="button secondary compact" data-hr="id-escalate" data-id="${esc(p.id)}">Ask platform to review</button></div>`:''}<p>Payout: ${esc(h.payout?.method||'not set')} · ${esc(h.payout?.reviewStatus||(h.payout?.verified?'approved':'not submitted'))}${h.payout?.account?` · ${esc(h.payout.accountName||p.name)} · ${esc(h.payout.account)} · IFSC ${esc(h.payout.ifsc)}`:''}${h.payout?.upi?` · ${esc(h.payout.upi)}`:''}</p>${h.payout?.reviewStatus==='pending'&&h.previousPayout?.verified?`<p class="muted">Previous approved ${esc(h.previousPayout.method)} destination remains in use until this change is approved${h.previousPayout.account?` · ${esc(h.previousPayout.account)}`:''}.</p>`:''}${h.payout?.reviewStatus==='pending'?`${Cred.preview(h.payout.proof,'payout proof')}<div class="row-actions"><button class="button primary compact" data-hr="payout-approve" data-id="${esc(p.id)}">Approve payout</button><button class="button secondary compact" data-hr="payout-correction" data-id="${esc(p.id)}">Request correction</button></div>`:''}<details><summary>Review history</summary>${Cred.history(s,p.id).map(x=>`<p>${esc(x.at)} · ${esc(x.kind)} ${esc(x.status)} · ${esc(x.actor)}${x.note?` · ${esc(x.note)}`:''}</p>`).join('')||'<p>No changes yet.</p>'}</details></div>`:'';
  return `<div class="ledger-row static hr-person"><span><b>${esc(p.name)}</b> <small class="muted">${esc(ROLES[h.role] || h.role)} · ${esc(p.mobile || '')}</small><small class="block">Home: <b>${esc(branchName(s, p.store, h.homeBranch))}</b>${h.cover.length ? ` · Also covers: ${h.cover.map(c => esc(branchName(s, p.store, c))).join(', ')}` : ''} · ${esc(h.payType === 'monthly' ? `₹${h.rate}/month` : h.payType === 'per_order' ? `₹${h.rate}/order` : `₹${h.rate}/shift`)} · paid ${esc(h.freq)}${h.payout?.method ? ` by ${esc(h.payout.method)}` : ' · payout details not added yet'}</small><small class="block">${pill(p.status)} ID ${pill(identityStatusLabel(h.kyc))}${a.kind==='owner'&&h.kyc?.idLast4?` · ${h.kyc.idType==='other'?'ID':'Aadhaar'} ending ${esc(h.kyc.idLast4)}`:''} · Store ID review ${pill(h.kyc?.reviewStatus||'not requested')} · Store joining ${pill(p.status==='active'?'approved':p.status)} · Payout ${pill(h.payout?.verified ? 'verified' : 'pending')}${a.kind==='owner'&&h.payout?.account?` · beneficiary ${esc(h.payout.accountName||p.name)} · account ${esc(h.payout.account)}${h.payout.ifsc?` · IFSC ${esc(h.payout.ifsc)}`:''}`:''}${a.kind==='owner'&&h.payout?.method==='upi'?' · UPI is for individual pay; add bank details for the monthly batch':''}${h.transfers.length ? ` · moved ${h.transfers.map(t => `${esc(branchName(s, p.store, t.from))} → ${esc(branchName(s, p.store, t.to))} on ${t.date}`).join('; ')}` : ''}</small></span>
  ${review}<details><summary class="button secondary compact">Change branches</summary><form class="inline-form" data-hr-form="branches" data-id="${p.id}"><label>Home <select name="home" ${a.kind === 'manager' ? 'disabled' : ''}>${brs.map(b => `<option value="${b.id}" ${b.id === h.homeBranch ? 'selected' : ''}>${esc(b.name.split(' · ').pop())}</option>`).join('')}</select></label>${brs.map(b => `<label><input type="checkbox" name="cover" value="${b.id}" ${h.cover.includes(b.id) ? 'checked' : ''}> covers ${esc(b.name.split(' · ').pop())}</label>`).join('')}<input name="reason" placeholder="Reason (for a transfer)"><button class="button primary compact">${a.kind === 'owner' ? 'Save / transfer' : 'Save cover'}</button></form></details></div>`;
}
function payrollTab(s, a) {
  const lines = payrollLines(s, a.store, a.kind === 'manager' ? a.branch : null), slip = s.hrSlip && payslip(s, a.store, s.hrSlip);
  return `<section class="panel"><div class="panel-header"><div><h2>Payroll · ${month()}</h2><p>${a.kind === 'owner' ? 'Post earnings, then pay each person.' : 'Managers prepare (post earnings); the owner pays.'}</p></div><button class="button secondary" data-hr="post">Post earnings for ${month()}</button></div>
  <div class="table-scroll"><table class="data-table"><thead><tr><th>Staff</th><th>Days by branch</th><th>Base</th><th>Meal</th><th>Cover</th><th>Advance recovery</th><th>To pay</th><th>Method</th><th></th></tr></thead><tbody>${lines.map(l => `<tr><td><b>${esc(l.p.name)}</b><small class="block muted">${esc(l.p.hr.payType)} · ${esc(l.p.hr.freq)}${l.attendance?` · ${l.attendance.scheduled} scheduled, ${l.attendance.present} present, ${l.attendance.paidLeave} paid leave, ${l.attendance.paidException} paid exception, ${l.attendance.unpaidAbsence+l.attendance.unpaidLeave} unpaid, ${l.attendance.extra} extra shift`:''}</small></td><td>${Object.entries(l.byBranch).map(([b, n]) => `${esc(branchName(s, a.store, b))} ${n}`).join(' · ') || '—'}</td><td>${inr(l.base)}</td><td>${inr(l.meal)}</td><td>${inr(l.coverPay)}</td><td>${l.recovery ? `−${inr(l.recovery)}` : '—'}</td><td><b>${inr(l.net)}</b>${l.posted ? '' : '<small class="block muted">not posted</small>'}</td><td>${esc(l.method)}${l.payoutOk ? '' : ' <small class="field-error">add UPI/bank</small>'}</td><td>${a.kind === 'owner' ? `<span class="row-actions"><button class="button primary compact" data-unified-pay="${esc(l.p.id)}" data-pay-kind="${l.p.kind === 'manager' ? 'manager' : 'picker'}">Pay</button></span>` : ''}<button class="button text compact" data-hr="slip" data-id="${l.p.id}">Payslip</button></td></tr>`).join('') || '<tr><td colspan="9">No active staff.</td></tr>'}</tbody></table></div><p class="mock-hint">With a configured schedule, base pay uses approved present days, paid leave and paid exceptions; rest days are excluded. Lock Attendance & leave before posting. Actual payment now happens through the "Pay" button above, using the one shared balance every screen agrees on.</p></section>
  ${slip ? `<section class="panel payslip"><div class="panel-header"><div><h2>Payslip · ${esc(slip.p.name)} · ${month()}</h2><p>${esc(slip.branches.join(' · ') || 'No attendance yet')}</p></div><span class="row-actions"><button class="button secondary compact" data-hr="print">Print / PDF</button><button class="button text compact" data-hr="slip" data-id="">Close</button></span></div><table class="price-table"><tbody>${slip.es.map(e => `<tr><td>${esc(e.note || e.type)}${e.status !== 'posted' ? ` · ${esc(e.status.replace(/_/g, ' '))}` : ''}</td><td>${SIGN[e.type] < 0 || e.type === 'advance_paid' ? '−' : ''}${inr(e.amount)}</td></tr>`).join('')}<tr class="total"><td>Balance due</td><td>${inr(unifiedBalanceFor(s, slip.p))}</td></tr><tr><td>Advance remaining</td><td>${inr(unifiedAdvanceLeftFor(s, slip.p))}</td></tr></tbody></table></section>` : ''}`;
}
function ledgersTab(s, a, list) {
  const pend = L(s).filter(e => e.store === a.store && e.type === 'reimbursement' && e.status === 'submitted' && list.some(p => p.id === e.personId)), disp = L(s).filter(e => e.store === a.store && e.status === 'disputed'), advP = (s.staffAdvances || []).filter(x => x.store === a.store && x.status === 'pending_approval');
  return `${pend.length || disp.length || advP.length ? `<section class="panel nc-actions"><h2>Needs your decision</h2>${pend.map(e => `<div class="ledger-row static"><span><b>Reimbursement ${inr(e.amount)} · ${esc(people(s, a.store).find(p => p.id === e.personId)?.name)}</b><small>${esc(e.note)} · receipt ${esc(e.receipt)}</small></span><span class="row-actions"><button class="button primary compact" data-hr="decide" data-id="${e.id}" data-d="approve">Approve</button><button class="button secondary compact" data-hr="decide" data-id="${e.id}" data-d="reject">Reject</button></span></div>`).join('')}${disp.map(e => `<div class="ledger-row static"><span><b>Disputed deduction ${inr(e.amount)}</b><small>${esc(e.note)} · staff says: ${esc(e.disputeReason)}</small></span><span class="row-actions"><button class="button secondary compact" data-hr="decide" data-id="${e.id}" data-d="approve">Uphold</button><button class="button secondary compact" data-hr="decide" data-id="${e.id}" data-d="reject">Waive</button></span></div>`).join('')}${advP.map(x => `<div class="ledger-row static"><span><b>Advance request ${inr(x.amount)} · ${esc(people(s, a.store).find(p => p.id === x.personId)?.name)}</b><small>${esc(x.reason)} · ${inr(x.instalment)}/month · by ${esc(x.by)}</small></span><span class="row-actions">${a.kind==='owner'?`<button class="button primary compact" data-hr="adv-approve" data-id="${x.id}">Approve & pay</button><button class="button secondary compact" data-hr="adv-change" data-id="${x.id}">Change plan</button><button class="button secondary compact" data-hr="adv-decline" data-id="${x.id}">Decline</button>`:'Waiting for owner'}</span></div>`).join('')}</section>` : ''}
  ${list.filter(p => p.status === 'active').map(p => `<section class="panel"><div class="panel-header"><div><h2>${esc(p.name)} · balance ${inr(unifiedBalanceFor(s, p))}</h2><p>Advance remaining ${inr(unifiedAdvanceLeftFor(s, p))}</p></div></div>${L(s).filter(e => e.personId === p.id).slice(-8).reverse().map(e => `<div class="ledger-row static"><span><b>${esc(e.note || e.type)}</b><small>${esc(e.at)} · ${esc(e.type.replace(/_/g, ' '))}${e.method ? ` · ${esc(e.method)}` : ''} · ${esc(branchName(s, a.store, e.branchId))}</small></span><span class="amount ${SIGN[e.type] < 0 || e.type === 'advance_paid' ? 'out' : 'in'}">${SIGN[e.type] < 0 || e.type === 'advance_paid' ? '−' : '+'}${inr(e.amount)}</span>${e.status !== 'posted' ? pill(e.status) : ''}</div>`).join('') || '<p class="muted">No entries yet.</p>'}
  <div class="row-actions">${a.kind === 'owner' ? `<button class="button primary compact" data-unified-pay="${p.id}" data-pay-kind="${p.kind === 'manager' ? 'manager' : 'picker'}">Give advance / reimbursement / deduction</button>` : `<details><summary class="button secondary compact">Ask for an advance</summary><form class="inline-form" data-hr-form="advance" data-id="${p.id}"><input name="amount" type="number" placeholder="Advance ₹"><input name="instalment" type="number" placeholder="Monthly instalment ₹"><input name="reason" placeholder="Reason"><select name="method"><option value="upi">UPI</option><option value="cash">Cash</option><option value="wallet">Wallet</option></select><button class="button primary compact">Request approval</button></form></details>`}
  <details><summary class="button secondary compact">Add reimbursement</summary><form class="inline-form" data-hr-form="reimb" data-id="${p.id}"><input name="amount" type="number" placeholder="₹"><input name="note" placeholder="What was bought (e.g. carry bags)"><input name="receipt" type="file" accept="image/*"><button class="button secondary compact">Add</button></form></details>
  <details><summary class="button secondary compact">Deduction</summary><form class="inline-form" data-hr-form="deduct" data-id="${p.id}"><input name="amount" type="number" placeholder="₹"><input name="reason" placeholder="Reason (e.g. scanner broken)"><input name="evidence" type="file"><button class="button secondary compact">Add</button></form></details></div></section>`).join('')}
  <section class="panel"><h2>Advances register</h2>${(s.staffAdvances || []).filter(x => x.store === a.store).map(x => `<div class="ledger-row static"><span><b>${esc(people(s, a.store).find(p => p.id === x.personId)?.name)} · ${inr(x.amount)}</b><small>${esc(x.reason)} · ${inr(x.instalment)}/month · given ${esc(x.at)} by ${esc(x.by)}</small></span><span>${inr(x.balance)} left</span>${pill(x.status)}</div>`).join('') || '<p class="muted">No advances.</p>'}</section>`;
}
function pettyTab(s, a, brs) {
  return brs.filter(b => a.kind === 'owner' || b.id === a.branch).map(b => { const book = petty(s, b.id); return `<section class="panel"><h2>${esc(b.name)} · petty cash ${inr(pettyBalance(s, b.id))}</h2>${book.entries.slice(-8).reverse().map(e => `<div class="ledger-row static"><span><b>${esc(e.note)}</b><small>${esc(e.at)} · ${esc(e.by)}${e.receipt ? ` · receipt ${esc(e.receipt)}` : ''}</small></span><span class="amount ${e.type === 'expense' || (e.type === 'count_diff' && e.amount < 0) ? 'out' : 'in'}">${e.type === 'expense' ? '−' : e.amount < 0 ? '−' : '+'}${inr(Math.abs(e.amount))}</span></div>`).join('') || '<p class="muted">No entries.</p>'}
  <div class="row-actions">${a.kind === 'owner' ? `<form class="inline-form" data-hr-form="petty" data-branch="${b.id}" data-type="topup"><input name="amount" type="number" placeholder="Top-up ₹"><button class="button secondary compact">Give float</button></form>` : ''}<form class="inline-form" data-hr-form="petty" data-branch="${b.id}" data-type="expense"><input name="amount" type="number" placeholder="₹"><input name="note" placeholder="Tea / snacks / bags"><input name="receipt" type="file" accept="image/*"><button class="button secondary compact">Record expense</button></form><form class="inline-form" data-hr-form="petty" data-branch="${b.id}" data-type="count"><input name="counted" type="number" placeholder="Cash counted ₹"><button class="button secondary compact">Day-end count</button></form></div></section>`; }).join('');
}
function reportsTab(s, a, brs) {
  const c = branchCost(s, a.store);
  return `<section class="panel"><h2>Staff cost by branch · ${month()}</h2>${brs.filter(b => a.kind === 'owner' || b.id === a.branch).map(b => `<div class="ledger-row static"><span><b>${esc(b.name)}</b><small>Pay + allowances + petty cash expenses</small></span><span class="amount">${inr(c[b.id] || 0)}</span></div>`).join('')}<p class="mock-hint">Pay is charged to the branch where each day was worked; cover days go to the branch covered.</p></section>`;
}
function identityPanel(s,p,h){
 const k=h.kyc||{},seeded=k.status==='verified'&&!k.method&&!k.reviewStatus;
 const label=seeded?'Demo identity prefilled · no document review submitted':k.reviewStatus==='pending'?(k.method==='otp'?'Demo OTP check complete · waiting for store joining confirmation':'Documents waiting for store review'):k.reviewStatus==='platform_pending'?'Platform review in progress':k.reviewStatus==='correction_required'?`Please correct your ID: ${esc(k.reviewReason||k.platformReason||'See the store request')}`:k.reviewStatus==='approved'?`${k.method==='otp'?'Demo OTP and store confirmation':'Store document review'} complete`:'Choose an ID method to get started';
 const consent='<label class="wide"><input type="checkbox" name="consent" value="1" required> I agree to this mock ID check and sharing the limited result with my store.</label>';
 const test='<p class="mock-hint">Demo only: use test details and files under 120 KB. No UIDAI connection or real digital signature check. Never submit real ID information.</p>';
 const start='<form class="form-grid two" data-hr-form="kyc">';
 const end='<button class="button primary wide">Submit for store review</button></form>';
 return `<section class="panel staff-id-panel"><h2>My ID</h2><p class="muted">${label}${k.idLast4?` · ID ending ${esc(k.idLast4)}`:''}</p>${Cred.preview(k.front,'my ID front')}${Cred.preview(k.back,'my ID back')}${k.offlineFile?`<p>Offline test file: ${esc(k.offlineFile.name)}</p>${Cred.preview(k.offlineFile,'offline QR or PDF')}`:''}
 ${!['pending','platform_pending'].includes(k.reviewStatus)?`<details ${k.status!=='verified'?'open':''}><summary class="button secondary compact">${seeded?'Start my own verification':k.reviewStatus==='correction_required'?'Correct and resubmit ID':k.reviewStatus==='approved'?'Update my ID':'Verify my ID'}</summary><fieldset class="id-method-choices"><legend>Choose one verification method</legend><label><input type="radio" name="idMethodChoice" value="otp" checked> Aadhaar OTP <small>Demo code; no card upload</small></label><label><input type="radio" name="idMethodChoice" value="offline"> Aadhaar QR / offline file <small>Mock file; signature not checked</small></label><label><input type="radio" name="idMethodChoice" value="aadhaar_document"> Aadhaar document <small>Front and back; store review</small></label><label><input type="radio" name="idMethodChoice" value="other_document"> Another ID <small>Manual store review</small></label></fieldset>
 <div data-id-path="otp"><h3>Aadhaar OTP</h3><p>Enter a test Aadhaar number and code. No card images are needed. Your store confirms your joining separately.</p>${start}<input type="hidden" name="method" value="otp"><label>Test Aadhaar number<input name="aadhaar" inputmode="numeric" required></label><button type="button" class="button secondary" data-hr="send-id-otp">Send demo OTP</button><label data-otp-step hidden>Enter demo OTP<input name="otp" inputmode="numeric" placeholder="123456" disabled required></label>${consent}<button class="button primary wide">Complete demo OTP check</button></form></div>
 <div data-id-path="offline"><h3>Aadhaar QR / offline e-KYC</h3><p>Upload a mock QR image, PDF or XML. This demo does not validate a UIDAI signature; the store reviews the submission.</p>${start}<input type="hidden" name="method" value="offline"><label>Last four test ID digits<input name="idLast4" inputmode="numeric" maxlength="4" required></label><label>Date of birth<input name="dob" type="date" required></label><label>Mock QR or offline file<input name="offlineFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,application/xml,text/xml,.xml" required></label><label>Mock selfie<input name="selfie" type="file" accept="image/*" required></label>${consent}${end}</div>
 <div data-id-path="aadhaar_document"><h3>Manual Aadhaar document review</h3><p>Upload both sides or select the same two-sided PDF twice. No OTP is required.</p>${start}<input type="hidden" name="method" value="aadhaar_document"><label>Last four test ID digits<input name="idLast4" inputmode="numeric" maxlength="4" required></label><label>Date of birth<input name="dob" type="date" required></label><label>Front image or PDF<input name="front" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label><label>Back image or PDF<input name="back" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label><label>Mock selfie<input name="selfie" type="file" accept="image/*" required></label>${consent}${end}</div>
 <div data-id-path="other_document"><h3>Another accepted ID</h3><p>Choose another ID for manual store review. No Aadhaar number or OTP is requested.</p>${start}<input type="hidden" name="method" value="other_document"><label>ID type<select name="documentType"><option>Voter ID</option><option>Driving licence</option><option>Passport</option></select></label><label>Last four test ID digits<input name="idLast4" inputmode="numeric" maxlength="4" required></label><label>Date of birth<input name="dob" type="date" required></label><label>Front image or PDF<input name="front" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label><label>Back image or PDF<input name="back" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label><label>Mock selfie<input name="selfie" type="file" accept="image/*" required></label>${consent}${end}</div>${test}</details>`:''}
 <details><summary>Personal details · emergency contact</summary><p>Keep this separate from ID verification.</p><form class="form-grid two" data-hr-form="emergency"><label>Contact name<input name="name" value="${esc(k.emergency?.name||'')}" required></label><label>Mobile number<input name="mobile" inputmode="numeric" value="${esc(k.emergency?.mobile||'')}" required></label><button class="button secondary wide">Save emergency contact</button></form></details></section>`;
}

function staffScreen(s, ws, a) {
  const p = a.person; if (!p) return head('My pay & details', 'No active store account.');
  const h = hr(s, {...p, kind: 'staff'}), others = (s.pickerStaff || []).filter(x => x.mobile === p.mobile && x.store !== p.store && x.status === 'active');
  const acks = L(s).filter(e => e.personId === p.id && e.status === 'pending_ack');
  // Balance shown here MUST match what the owner's unified Pay screen shows — same ledger, same
  // function, not a second calculation that could quietly drift from the owner's view. This was the
  // whole point of building payroll-core.js: an owner and a worker disagreeing on a number would make
  // the entire consolidation pointless.
  Payroll.ensurePayrollCore(s);
  const emp = s.employments?.find(e => ['picker','manager'].includes(e.source.kind) && e.source.id === p.id && e.business===p.store);
  const unifiedBalance = emp ? Payroll.balance(s, emp.personId) : balance(s, p.id);
  const pendingUpiForWorker = emp ? Payroll.history(s, emp.personId).filter(e => e.method === 'upi' && ['pending_confirmation', 'posted'].includes(e.status) && e.workerConfirmed === null) : [];
  const pendingAdvanceUpiForWorker = emp ? Payroll.history(s, emp.personId).filter(h => h.kind === 'advance' && h.method === 'upi' && ['pending_handoff', 'active'].includes(h.status) && h.workerConfirmed === null) : [];
  const pendingAdvanceCashForWorker = emp ? Payroll.history(s, emp.personId).filter(h => h.kind === 'advance' && h.method === 'cash' && h.status === 'pending_ack') : [];
  const r=Time.schedule(s,p.id,today()),q=Time.summary(s,p.store,p.id,month()),myDays=(s.staffDays||[]).filter(d=>d.store===p.store&&d.personId===p.id&&d.date.startsWith(month())).sort((x,y)=>y.date.localeCompare(x.date)),myLeave=(s.staffLeaveRequests||[]).filter(l=>l.store===p.store&&l.personId===p.id).slice().reverse();
  const leaveStart=Array.from({length:14},(_,i)=>new Date(clock()+i*DAY).toISOString().slice(0,10)).find(d=>Time.scheduled(s,p.id,d))||today();
  return `${head('My pay & details', `${p.name} · ${s.shopPartners?.[p.store]?.name || p.store} · home ${branchName(s, p.store, h.homeBranch)}`)}
  <section class="panel"><h2>My workdays & leave</h2><p>${r?`My schedule: ${r.weekdays.map(d=>dayNames[d]).join(', ')} · ${esc(r.start)}–${esc(r.end)} · from ${esc(r.effectiveFrom)}${r.by==='Demo workweek'?' (demo template; owner can change it)':''}`:'Ask your store to set your working days.'}</p><div class="metrics"><div class="metric"><span>Scheduled</span><b>${q.scheduled}</b></div><div class="metric"><span>Present</span><b>${q.present}</b></div><div class="metric"><span>Paid leave / exception</span><b>${q.paidLeave+q.paidException}</b></div><div class="metric"><span>Unpaid leave / absence</span><b>${q.unpaidLeave+q.unpaidAbsence}</b></div></div><p class="muted">${q.unresolved} day(s) waiting for review · ${q.locked?'Month locked for payroll':'Month not locked yet'}</p><div class="row-actions"><button class="button primary compact" data-hr="checkin">I'm here today</button><button class="button secondary compact" data-hr="checkout">I'm leaving</button></div><h3>Request time off</h3><p class="muted">Pick your workdays; the store decides paid or unpaid leave. Your request appears below while waiting.</p><form class="staff-form-row" data-hr-form="my-leave"><label>From <input name="from" type="date" min="${today()}" value="${leaveStart}"></label><label>To <input name="to" type="date" min="${today()}" value="${leaveStart}"></label><select name="units"><option value="1">Full day</option><option value="0.5">Half day</option></select><input name="reason" placeholder="Reason (optional)"><button class="button secondary compact">Request leave</button></form><h3>My attendance</h3>${myDays.map(d=>`<div class="ledger-row static"><span><b>${esc(d.date)} · ${esc(d.status||'approved')}</b><small>${esc(branchName(s,p.store,d.branchId))} · marked by ${esc(d.by||'Store')}${d.leftAt?` · left ${esc(d.leftAt)}`:''}${d.dispute?` · correction: ${esc(d.dispute)}`:''}</small></span>${(d.status||'approved')==='approved'&&!q.locked?`<button class="button text compact" data-hr="time-dispute" data-id="${esc(d.id)}">Report mistake</button>`:''}</div>`).join('')||'<p class="muted">No attendance yet this month.</p>'}<h3>My leave</h3>${myLeave.map(l=>`<div class="ledger-row static"><span><b>${esc(l.from)}–${esc(l.to)} · ${l.dates.length*l.units} workday(s)</b><small>${esc(l.status)}${l.treatment?` · ${esc(l.treatment)}`:''} · ${esc(l.reason)}${l.decidedBy?` · decided by ${esc(l.decidedBy)}`:''}</small></span>${['pending','approved'].includes(l.status)&&l.dates.every(d=>d>=today())?`<button class="button text compact" data-hr="leave-cancel" data-id="${esc(l.id)}">Cancel</button>`:''}</div>`).join('')||'<p class="muted">No leave requests.</p>'}</section>
  ${(s.staffAdvances||[]).filter(x=>x.store===p.store&&x.personId===p.id&&x.status==='counter_offer').map(x=>`<section class="panel nc-actions"><h2>Owner suggests a different advance plan</h2><p>Requested ${inr(x.amount)} at ${inr(x.instalment)}/month. Owner offers ${inr(x.offer.amount)} at ${inr(x.offer.instalment)}/month.</p><button class="button primary compact" data-hr="adv-offer-accept" data-id="${esc(x.id)}">Accept plan</button><button class="button secondary compact" data-hr="adv-offer-decline" data-id="${esc(x.id)}">Decline</button></section>`).join('')}${others.length ? `<p class="muted">You also work at ${others.map(x => esc(s.shopPartners?.[x.store]?.name || x.store)).join(', ')} — each employer sees only its own records.</p>` : ''}
  <div class="metrics"><div class="metric"><span>Balance due to you</span><b>${inr(unifiedBalance)}</b></div><div class="metric"><span>Advance remaining</span><b>${inr(emp ? Payroll.advanceOutstanding(s, emp.personId) : advanceLeft(s, p.id))}</b></div><div class="metric"><span>ID / store review</span><b>${esc(identityStatusLabel(h.kyc))}</b></div><div class="metric"><span>Payout</span><b>${esc(h.payout?.verified ? h.payout.method : 'not set')}</b></div></div>
  ${identityPanel(s,p,h)}
  <section class="panel"><h2>How you get paid</h2><p class="muted">Current mock destination: ${esc(h.payout?.method||'not set')}${h.payout?.account?` · ${esc(h.payout.account)}`:''}${h.payout?.upi?` · ${esc(h.payout.upi)}`:''} · ${esc(h.payout?.reviewStatus||(h.payout?.verified?'approved':'not submitted'))}${h.payout?.reviewReason?` · ${esc(h.payout.reviewReason)}`:''}. New details need owner review before payment.</p>${Cred.preview(h.payout?.proof,'my payout proof')}<details ${!h.payout?.verified?'open':''}><summary class="button secondary compact">Add or change bank, UPI or cash</summary><form class="form-grid two" data-hr-form="payout"><label><span>Method</span><select name="method"><option value="upi" ${h.payout?.method==='upi'?'selected':''}>UPI</option><option value="bank" ${h.payout?.method==='bank'?'selected':''}>Bank account</option><option value="cash" ${h.payout?.method==='cash'?'selected':''}>Cash at the store</option></select></label><label data-payout-field="upi"><span>UPI ID</span><input name="upi" value="${esc(h.payout?.upi||'')}"></label><label data-payout-field="bank"><span>Account holder name</span><input name="accountName" value="${esc(h.payout?.accountName||p.name)}"></label><label data-payout-field="bank"><span>Test bank account (enter again to change)</span><input name="account" autocomplete="off"></label><label data-payout-field="bank"><span>IFSC</span><input name="ifsc" value="${esc(h.payout?.ifsc||'')}" placeholder="SBIN0001234"></label><label data-payout-proof><span>Mock cancelled cheque, bank proof or UPI screenshot (PNG/JPG/WebP/PDF)</span><input name="proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label><button class="button secondary wide">Send payout details for review</button></form></details><details><summary>My review history</summary>${Cred.history(s,p.id).map(x=>`<p>${esc(x.at)} · ${esc(x.kind)} ${esc(x.status)} · ${esc(x.actor)}${x.note?` · ${esc(x.note)}`:''}</p>`).join('')||'<p>No submissions yet.</p>'}</details></section>
  ${emp ? Payroll.payPersonScreen(s, emp.personId, p.store, 'worker') : ''}
  <section class="panel"><h2>Requests</h2>
  <details><summary class="button secondary compact">Claim money you spent for the store</summary><form class="inline-form" data-hr-form="my-reimb"><input name="amount" type="number" placeholder="₹"><input name="note" placeholder="What did you buy?"><input name="receipt" type="file" accept="image/*"><button class="button secondary compact">Submit</button></form></details>
  <details><summary class="button secondary compact">Ask for an advance</summary><form class="inline-form" data-hr-form="my-advance"><input name="amount" type="number" placeholder="₹"><input name="instalment" type="number" placeholder="Pay back per month ₹"><input name="reason" placeholder="Reason"><button class="button secondary compact">Request</button></form></details></section>`;
}
export function storeSetupExtras(s, ws) {
  ensureBranchDocs(s); const lv = sellerLevel(s, ws), brs = branchesOf(s, ws);
  return `<section class="panel"><h2>Onboarding level: ${lv.level} of 3 · ${esc(lv.label)}</h2><div class="chip-row">${['Draft', 'Verified to sell', 'Payout-ready'].map((l, i) => `<span class="chip ${lv.level > i ? 'active' : ''}">${i + 1}. ${l}</span>`).join('')}</div>${lv.next ? `<p class="muted">${esc(lv.next)}</p>` : '<p class="muted">Listings are live and payouts are released.</p>'}${s.lastDailyCheck ? `<small class="muted">Last automatic check: ${esc(s.lastDailyCheck)}</small>` : ''}</section>
  <section class="panel"><h2>Branch documents</h2>${brs.map(b => `<form class="form-grid two" data-hr-form="branch-docs" data-branch="${b.id}"><b class="wide">${esc(b.name)} ${b.open === false ? pill(b.pausedReason || 'paused') : ''}</b><label><span>GSTIN for this state</span><input name="gstin" value="${esc(b.docs?.gstin || '')}"></label><label><span>FSSAI (food branches)</span><input name="fssai" value="${esc(b.docs?.fssai || '')}"></label><label><span>FSSAI expiry</span><input name="fssaiExpiry" type="date" value="${esc(b.docs?.fssaiExpiry || '')}"></label><label><span>Storefront photo</span><input name="photo" type="file" accept="image/*"></label><button class="button secondary compact">Save branch documents</button></form>`).join('')}<p class="hr-error field-error" hidden></p></section>`;
}

// ---------- bindings ----------
export function bind(root, api, inviteFn) {
  const S = () => api.getState(), ws = () => S().currentWorkspace, err = m => { const e = root.querySelector('.hr-error'); if (e) { e.textContent = m; e.hidden = !m; } else api.toast(m); };
  const done = (e, ok) => { if (e) return err(e); api.save(); api.render(); if (ok) api.toast(ok); };
  const me = () => actor(S(), ws())?.person?.id;
  root.querySelectorAll('[data-hr-tab]').forEach(b => b.onclick = () => { S().hrTab = b.dataset.hrTab; done(''); });
  root.querySelectorAll('[data-hr]').forEach(b => b.onclick = () => { const s = S(), k = b.dataset.hr, id = b.dataset.id;
    const who=actor(s,ws());
    if(k==='send-id-otp'){
      if(!['staff','manager'].includes(who?.kind))return err('Open your own staff account to request a demo code.');
      const input=root.querySelector('[data-id-path="otp"] [name="aadhaar"]'),message=issueMockOtp(s,who.person.id,input?.value);
      if(message)return err(message);
      api.save();const step=root.querySelector('[data-otp-step]');if(step){step.hidden=false;step.querySelector('input').disabled=false;}
      api.toast('Demo code: 123456 · valid for five minutes');return;
    }
    if(k==='checkin'&&['staff','manager'].includes(who?.kind))return done(Time.checkIn(s,who.store,who.person.id,s.activeStaffBranch?.[who.person.id]||hr(s,who.person).homeBranch),'Sent to store for approval');
    if(k==='checkout'&&['staff','manager'].includes(who?.kind))return done(Time.checkOut(s,who.store,who.person.id),'Shift finish recorded');
    if(k==='time-dispute'&&['staff','manager'].includes(who?.kind)){const reason=prompt('What is wrong with this attendance?');if(reason===null)return;return done(Time.disputeAttendance(s,who.store,who.person.id,id,reason),'Correction requested');}
    if(k==='leave-cancel'&&['staff','manager'].includes(who?.kind))return done(Time.cancelLeave(s,who.store,who.person.id,id),'Leave cancelled');
    if(k==='time-approve'||k==='time-reject'){if(!['owner','manager'].includes(who?.kind))return err('Only the store owner or branch manager approves attendance.');if(who.kind==='manager'&&(s.staffDays||[]).find(d=>d.id===id)?.personId===who.id)return err('The owner must review your own attendance.');return done(Time.decideAttendance(s,who.store,id,k==='time-approve'?'approve':'reject',who.name,who.kind==='manager'?who.branch:null),'Attendance reviewed');}
    if(k==='time-keep'||k==='time-remove'){if(!['owner','manager'].includes(who?.kind))return err('Only the store owner or branch manager reviews corrections.');if(who.kind==='manager'&&(s.staffDays||[]).find(d=>d.id===id)?.personId===who.id)return err('The owner must review your own correction.');return done(Time.resolveDispute(s,who.store,id,k==='time-keep'?'approve':'remove',who.name,who.kind==='manager'?who.branch:null),'Correction reviewed');}
    if(k.startsWith('leave-')&&['owner','manager'].includes(who?.kind)){if(who.kind==='manager'&&(s.staffLeaveRequests||[]).find(l=>l.id===id)?.personId===who.id)return err('The owner must review your own leave.');return done(Time.decideLeave(s,who.store,id,k==='leave-decline'?'decline':'approve',k==='leave-paid'?'paid':'unpaid',who.name,who.kind==='manager'?who.branch:null),'Leave reviewed');}
    if(k==='lock-month'&&who?.kind==='owner')return done(Time.lockMonth(s,who.store,month(),who.name),'Month locked; review Payroll before paying');
    if(k==='demo-month-end'&&who?.kind==='owner'){const date=Time.advanceDemoToMonthEnd(s);return done('',`Demo date moved to ${date}`);}
    if(k==='id-approve'||k==='id-correction'){const reason=k==='id-correction'?prompt('What should the worker correct?'):'';if(reason===null)return;return done(reviewIdentity(s,ws(),id,k==='id-approve'?'approve':'correction',reason),'Store ID review saved');}
    if(k==='id-escalate'){const reason=prompt('Why should the platform review this mock ID?');if(reason===null)return;return done(escalateIdentity(s,ws(),id,reason),'Sent to platform review');}
    if(k==='platform-clear'||k==='platform-correction'){
      if(ws()!=='admin')return err('Only a platform reviewer can make this decision.');
      const reason=k==='platform-correction'?prompt('What should the worker correct?'):'';
      if(reason===null)return;return done(platformIdentityDecision(s,id,k==='platform-clear'?'cleared':'correction_required',reason),'Platform review recorded');
    }
    if(k==='payout-approve'||k==='payout-correction'){const reason=k==='payout-correction'?prompt('What should the worker correct?'):'';if(reason===null)return;return done(reviewPayout(s,ws(),id,k==='payout-approve'?'approve':'correction',reason),'Payout review saved');}
    if (k === 'post') return done(postEarnings(s, ws()), 'Earnings posted for this month');
    if (k === 'pay') return done(payPerson(s, ws(), id, root.querySelector(`[data-hr-method="${id}"]`)?.value), 'Payment recorded');
    if (k === 'slip') { s.hrSlip = id || null; return done(''); }
    if (k === 'print') return window.print();
    if (k === 'decide') return done(decideEntry(s, ws(), id, b.dataset.d), 'Decision saved');
    if (k === 'adv-approve') {const error=approveAdvance(s,ws(),id);if(error)return err(error);const link=s.latestAdvanceUpiLink;done('','Advance offered; complete the payment handover');if(link){if(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||''))location.href=link;else if(typeof QRCode!=='undefined'){const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;background:#0008;display:grid;place-items:center;z-index:9999';const box=document.createElement('div');box.style.cssText='background:white;padding:24px;border-radius:16px;text-align:center';box.innerHTML='<h3>Scan to pay the worker</h3><div id="advance-request-qr"></div><p>Return here and confirm whether the UPI payment went through.</p><button class="button secondary">Close</button>';overlay.append(box);document.body.append(overlay);box.querySelector('button').onclick=()=>overlay.remove();QRCode.toCanvas(box.querySelector('#advance-request-qr'),link,{width:220},e=>{if(e)box.querySelector('#advance-request-qr').textContent=link;});}else alert('Open this UPI link on your phone: '+link);}return;}
    if (k === 'adv-change') {const x=(s.staffAdvances||[]).find(v=>v.id===id),amount=prompt('Advance amount to offer (₹)?',x?.amount),instalment=prompt('Monthly repayment to offer (₹)?',x?.instalment);if(amount===null||instalment===null)return;return done(changeAdvanceOffer(s,ws(),id,amount,instalment),'Offer sent to worker');}
    if (k === 'adv-decline') {const x=(s.staffAdvances||[]).find(v=>v.id===id);if(actor(s,ws())?.kind!=='owner'||x?.store!==actor(s,ws()).store)return err('Only this store owner can decline.');x.status='declined';return done('','Request declined');}
    if (k === 'adv-offer-accept'||k === 'adv-offer-decline') return done(respondAdvanceOffer(s,ws(),id,k==='adv-offer-accept'),k==='adv-offer-accept'?'Plan accepted; waiting for owner approval':'Offer declined');
    if (k === 'ack') return done(acknowledge(s, me(), id, Boolean(b.dataset.ok)), b.dataset.ok ? 'Thanks — confirmed' : 'Reported as not received; the owner will check');
  });
  root.querySelectorAll('form[data-hr-form]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const s = S(), fd = new FormData(f), v = Object.fromEntries(fd), k = f.dataset.hrForm, file = n => fd.get(n)?.name || '';
    const who=actor(s,ws());
    if(k==='schedule'){if(who?.kind!=='owner')return err('Only the owner changes working days.');return done(Time.saveSchedule(s,who.store,v.pid,{...v,weekdays:fd.getAll('weekdays')},who.name),'Work schedule saved and worker notified');}
    if(k==='absence'){if(who?.kind!=='owner')return err('Only the owner makes paid absence decisions.');return done(Time.decideAbsence(s,who.store,v.pid,v.date,v.treatment,who.name,v.reason),'Absence decision saved and worker notified');}
    if(k==='my-leave'&&['staff','manager'].includes(who?.kind))return done(Time.requestLeave(s,who.store,who.person.id,v),'Leave request sent to store');
    if (k === 'invite') { const r = invite(s, ws(), {...v, cover: fd.getAll('cover')}, inviteFn); return done(r.error, `Invitation sent to ${v.name}${r.note ? ` · ${r.note}` : ''}`); }
    if (k === 'branches') return done(setBranches(s, ws(), f.dataset.id, v.home || s.staffHR[f.dataset.id].homeBranch, fd.getAll('cover'), v.reason), 'Branches updated');
    if (k === 'day') return done(markDay(s, ws(), v.pid, v.date, f.dataset.branch), 'Attendance marked');
    if (k === 'advance') { const r = giveAdvance(s, ws(), f.dataset.id, v); return done(r === 'sent' ? '' : r, r === 'sent' ? 'Advance request sent to the owner' : 'Advance given'); }
    if (k === 'reimb') return done(addReimbursement(s, f.dataset.id, {...v, receipt: file('receipt')}), 'Reimbursement added for approval');
    if (k === 'deduct') return done(addDeduction(s, ws(), f.dataset.id, {...v, evidence: file('evidence')}), 'Deduction added');
    if (k === 'petty') return done(pettyAction(s, ws(), f.dataset.branch, {...v, type: f.dataset.type, receipt: file('receipt')}), 'Petty cash updated');
    if (k === 'kyc') {try {const front=await Cred.demoFile(fd.get('front')),back=await Cred.demoFile(fd.get('back')),offlineFile=await Cred.demoFile(fd.get('offlineFile'));return done(verifyStaff(s,me(),{...v,front,back,offlineFile,selfie:file('selfie'),name:actor(s,ws()).name}),'ID step submitted');}catch(x){return err(x.message);}}
    if (k === 'emergency') return done(saveEmergencyContact(s,me(),v),'Emergency contact saved');
    if (k === 'payout') {try {const proof=await Cred.demoFile(fd.get('proof'));return done(setPayout(s,me(),{...v,proof,reviewRequired:true,name:v.accountName||actor(s,ws()).name}),'Payout details sent for review');}catch(x){return err(x.message);}}
    if (k === 'dispute') return done(dispute(s, me(), f.dataset.id, v.reason), 'Dispute sent to the owner');
    if (k === 'my-reimb') return done(addReimbursement(s, me(), {...v, receipt: file('receipt')}, true), 'Claim sent for approval');
    if (k === 'my-advance') return done(requestAdvance(s,ws(),me(),v),'Advance request sent to the owner');
    if (k === 'branch-docs') return done(saveBranchDocs(s, ws(), f.dataset.branch, {...v, photo: file('photo')}), 'Branch documents saved');
  });
}
