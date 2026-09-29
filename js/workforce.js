// MoveAI One — business workforce (W4: one directory, two working views) and worker money
// (P4: one ledger underneath; payroll run, trip settlement and per-worker khata on top).
// Khata balance = what the business owes the worker:
//   posted accruals (salary, trip wage, bata, allowances, incentives, approved reimbursements, minus deductions and loan recovery)
//   − payments to the worker (salary, trip advances, reimbursements) + cash the worker returned.
// Salary advances (loans) are recovered in instalments by payroll, so they do not hit the balance at once.
import {esc, pill, inr, opsCtx} from './ops.js';
import {ROLE_TEMPLATES} from './people-rules.js';

const DAY = 86400000;
const FIELD_ROLES = ['driver', 'helper'];
const PAID = ['paid', 'confirmed', 'closed'];
const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const todayKey = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const monthKey = () => new Date().toISOString().slice(0, 7);
const uid = p => `${p}-${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 4)}`;
const head = (title, text, action = '') => `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
const tabs = active => `<div class="people-tabs">${[['people', 'Team'], ['workforce', 'Workforce'], ['dutyBoard', 'Duty board'], ['payroll', 'Payroll'], ['hiring', 'Hiring'], ['staffEvents', 'Leave & attendance']].map(([r, l]) => `<button ${r === active ? 'class="active"' : `data-route="${r}"`}>${l}</button>`).join('')}</div>`;

export const ENGAGEMENTS = {permanent: 'Permanent', temporary: 'Temporary (fixed days)', per_trip: 'Per-trip (platform)', partner: 'Partner crew', contractor: 'Contractor-supplied'};
export const EXPENSE_CATEGORIES = {fuel: 'Fuel', toll_cash: 'Toll (cash)', toll_fastag: 'Toll (FASTag — paid by business)', food: 'Food', dharamkata: 'Dharamkata', parking: 'Parking', repair: 'Roadside repair', other: 'Other'};
export const DEDUCTION_REASONS = {shortage: 'Goods shortage', damage: 'Damage', fine_driver: 'Traffic fine — driver at fault', fine_vehicle: 'Traffic fine — vehicle papers / business fault', absence: 'Absence without leave', other: 'Other'};

// ---------- setup ----------
export function ensureWorkforce(state) {
  state.workforceSettings ||= {};
  for (const ws of ['goods', 'transporter', 'vehicle', 'movers']) state.workforceSettings[ws] ||= {bataPerDay: 300, workingDays: 26, deductionCap: 5000, statutory: {pf: false, esi: false, pt: false}};
  state.accruals ||= [];
  state.tripExpenses ||= [];
  state.payrollRuns ||= [];
  state.contractors ||= [{id: 'CON-1', workspace: 'movers', name: 'Bihar Labour Services', contact: '9811002200', supplies: 'Moving helpers and packers', ratePerHelperDay: 800, crew: 6, status: 'active'}, {id: 'CON-2', workspace: 'transporter', name: 'Okhla Loading Crew', contact: '9811002211', supplies: 'Loading / unloading gang', ratePerHelperDay: 750, crew: 4, status: 'active'}];
  const mohan = (state.peopleByWorkspace.transporter || []).find(m => m.id === 'WORKER-001');
  if (mohan && !mohan.loan) mohan.loan = {total: 6000, balance: 6000, installment: 2000, reason: 'Salary advance for family medical need', givenAt: '10 Sep 2026'};
  for (const list of Object.values(state.peopleByWorkspace)) for (const m of list) m.attendanceSummary ||= {present: 24 - (m.id.charCodeAt(m.id.length - 1) % 3), leave: 1, absent: m.id.charCodeAt(m.id.length - 1) % 3, overtimeHours: 4};
  return state;
}
const settings = (state, ws) => ensureWorkforce(state).workforceSettings[ws] || {bataPerDay: 300, workingDays: 26, deductionCap: 5000, statutory: {}};
const ownerOf = state => opsCtx(state).ownerWs;

// ---------- directory ----------
function aliasKeys(state, ws, m) {
  const keys = [`staff:${m.id}`];
  for (const t of state.trips.filter(t => t.owner === ws)) for (const c of t.crew || []) if (c.id === m.id && c.persona) keys.push(c.persona);
  return [...new Set(keys)];
}
export function workforceOf(state, ws) {
  ensureWorkforce(state);
  const team = (state.peopleByWorkspace[ws] || []).filter(m => !['rejected'].includes(m.status)).map(m => ({
    key: `staff:${m.id}`, keys: aliasKeys(state, ws, m), id: m.id, kind: 'team', name: m.name, mobile: m.mobile, role: m.role, roleLabel: m.designation || ROLE_TEMPLATES[m.role]?.label,
    family: FIELD_ROLES.includes(m.role) ? 'field' : 'office', engagement: m.employmentType === 'fixed_term' ? 'temporary' : m.employmentType === 'trip_only' ? 'per_trip' : 'permanent',
    branchIds: m.branchIds || [], status: m.status, payType: m.payType, payAmount: m.payAmount, member: m,
  }));
  const seen = new Set(team.map(x => x.id));
  const hired = [];
  for (const t of state.trips.filter(t => t.owner === ws)) for (const c of t.crew || []) {
    if (seen.has(c.id)) continue; seen.add(c.id);
    const pw = state.platformWorkers.find(w => w.id === c.id || (c.persona && w.persona === c.persona));
    const partner = c.classification === 'partner';
    hired.push({key: c.persona || `pw:${c.id}`, keys: [c.persona || `pw:${c.id}`], id: c.id, kind: partner ? 'partner' : 'platform', name: c.name, mobile: pw?.mobile || (state.candidates || []).find(x => x.id === c.id)?.mobile || '', role: c.role, roleLabel: c.role === 'driver' ? 'Driver' : 'Khalasi / Helper', family: 'field', engagement: partner ? 'partner' : 'per_trip', branchIds: t.branchId ? [t.branchId] : [], status: 'engaged', payType: 'per_trip', payAmount: pw?.tripRate || (c.role === 'driver' ? 3500 : 1200), partnerOf: partner ? t.vehicleOwner || 'vehicle' : null});
  }
  const contractors = state.contractors.filter(c => c.workspace === ws && c.status === 'active').map(c => ({key: `con:${c.id}`, keys: [`con:${c.id}`], id: c.id, kind: 'contractor', name: c.name, mobile: c.contact, role: 'helper', roleLabel: `${c.supplies} · ${c.crew} people`, family: 'field', engagement: 'contractor', branchIds: [], status: 'active', payType: 'per_helper_day', payAmount: c.ratePerHelperDay, contractor: c}));
  return [...team, ...hired, ...contractors];
}
export const findWorker = (state, ws, key) => workforceOf(state, ws).find(w => w.key === key);

// ---------- duty ----------
export function dutyStatus(state, ws, w, day) {
  const d0 = new Date(`${day}T00:00`).getTime(), d1 = d0 + DAY;
  const leave = w.member?.leave;
  if (leave && leave.from <= day && leave.to >= day) return {status: 'on_leave', label: 'On leave', detail: leave.reason || ''};
  if (w.member && ['offboarded', 'suspended'].includes(w.member.status)) return {status: 'unavailable', label: 'Unavailable', detail: w.member.status};
  const trips = state.trips.filter(t => t.owner === ws && (t.crew || []).some(c => c.id === w.id) && t.window);
  const onTrip = trips.find(t => t.status !== 'closed' && new Date(t.window.from).getTime() < d1 && new Date(t.window.to).getTime() > d0);
  if (onTrip) return {status: 'on_trip', label: `On ${onTrip.id}`, detail: onTrip.title, ref: onTrip.id};
  const job = state.movingJobs.find(j => j.owner === ws && (j.crew || []).some(c => c.id === w.id) && j.date === day && !['closed', 'completed'].includes(j.status));
  if (job) return {status: 'on_job', label: `On ${job.id}`, detail: `${job.size} move`, ref: job.id};
  const rest = trips.find(t => { const end = new Date(t.window.to).getTime(); const hours = (end - new Date(t.window.from).getTime()) / 3600000; return hours >= 24 && end <= d0 + 10 * 3600000 && end > d0 - 10 * 3600000; });
  if (rest && w.family === 'field') return {status: 'resting', label: 'Resting', detail: `Rest after long haul ${rest.id}`};
  return {status: 'free', label: 'Free', detail: ''};
}

// ---------- khata ----------
export function khata(state, ws, w) {
  ensureWorkforce(state);
  const keys = new Set(w.keys || [w.key]);
  const acc = state.accruals.filter(a => a.workspace === ws && keys.has(a.workerKey));
  const pays = state.ledger.filter(x => x.owner === ws && keys.has(x.payee) && PAID.includes(x.status) && !x.loan && ['salary', 'advance', 'reimbursement', 'freight'].includes(x.type));
  const returns = state.ledger.filter(x => keys.has(x.payer) && x.payee === ws && PAID.includes(x.status));
  const posted = acc.filter(a => a.status === 'posted');
  const earned = posted.filter(a => a.amount > 0 && a.type !== 'reimbursement').reduce((s, a) => s + a.amount, 0);
  const reimb = posted.filter(a => a.type === 'reimbursement').reduce((s, a) => s + a.amount, 0);
  const deducted = -posted.filter(a => a.amount < 0).reduce((s, a) => s + a.amount, 0);
  const paid = pays.reduce((s, x) => s + Number(x.amount), 0), returned = returns.reduce((s, x) => s + Number(x.amount), 0);
  const lines = [...acc.map(a => ({at: a.at, text: a.note, type: a.type, amount: a.amount, status: a.status, id: a.id, kind: 'accrual', evidence: a.evidence})), ...pays.map(x => ({at: x.history?.[0]?.at || '', text: `${x.type === 'advance' ? 'Advance paid' : 'Paid'} · ${x.method || ''} ${x.reference || ''}`.trim(), type: x.type, amount: -Number(x.amount), status: x.status, id: x.id, kind: 'payment'})), ...returns.map(x => ({at: x.history?.[0]?.at || '', text: 'Cash returned to business', type: 'return', amount: Number(x.amount), status: x.status, id: x.id, kind: 'payment'}))];
  return {earned, reimb, deducted, paid, returned, balance: earned + reimb - deducted - paid + returned, disputed: acc.filter(a => a.status === 'disputed'), lines};
}
export function postAccrual(state, ws, workerKey, type, amount, note, extra = {}) {
  const a = {id: uid('ACR'), workspace: ws, workerKey, type, amount: Math.round(Number(amount)), note, status: 'posted', at: stamp(), ...extra};
  ensureWorkforce(state).accruals.unshift(a); return a;
}
export function addDeduction(state, ws, w, v) {
  const amount = Number(v.amount), cap = settings(state, ws).deductionCap;
  if (!DEDUCTION_REASONS[v.reason]) return 'Choose a reason.';
  if (v.reason === 'fine_vehicle') return 'Fines caused by vehicle papers or business decisions are paid by the business, not deducted from the worker.';
  if (!(amount > 0)) return 'Enter an amount.';
  if (amount > cap && !v.override) return `Deductions above ${inr(cap)} need owner override. Tick “Owner override” to confirm.`;
  if (!String(v.evidence || '').trim()) return 'Attach evidence (photo, POD note or challan).';
  if (!String(v.note || '').trim()) return 'Explain the deduction so the worker understands it.';
  postAccrual(state, ws, w.key, 'deduction', -amount, `${DEDUCTION_REASONS[v.reason]} · ${v.note.trim()}`, {evidence: v.evidence, override: Boolean(v.override)});
  (state.audit ||= []).unshift({id: uid('AUD'), event: `Deduction ${inr(amount)} for ${w.name}: ${DEDUCTION_REASONS[v.reason]}`, at: stamp(), workspace: ws});
  return '';
}
export function disputeAccrual(state, id, reason) { const a = state.accruals.find(x => x.id === id); if (!a || a.amount >= 0) return 'Only deductions can be disputed.'; if (!String(reason || '').trim()) return 'Say why you disagree.'; a.status = 'disputed'; a.disputeReason = reason.trim(); return ''; }
export function resolveDispute(state, id, decision) { const a = state.accruals.find(x => x.id === id); if (!a || a.status !== 'disputed') return 'Not in dispute.'; a.status = decision === 'uphold' ? 'posted' : 'waived'; a.resolvedAt = stamp(); return ''; }

// ---------- trip settlement ----------
export function tripDays(t) { return Math.max(1, Math.ceil((new Date(t.window.to) - new Date(t.window.from)) / DAY)); }
export function tripCrewSettlement(state, t) {
  const ws = t.owner, set = settings(state, ws), wf = workforceOf(state, ws);
  return (t.crew || []).map(c => {
    const w = wf.find(x => x.id === c.id) || {key: c.persona || `pw:${c.id}`, keys: [c.persona || `pw:${c.id}`], name: c.name, engagement: 'per_trip'};
    if (w.engagement === 'partner') return {c, w, partner: true};
    const keys = new Set(w.keys);
    const days = tripDays(t), bata = days * set.bataPerDay;
    const wage = w.engagement === 'per_trip' || w.payType === 'per_job' ? Number(w.payAmount || 0) : 0;
    const advances = state.ledger.filter(x => x.sourceId === t.id && x.type === 'advance' && keys.has(x.payee) && PAID.includes(x.status) && !x.loan).reduce((s, x) => s + Number(x.amount), 0);
    const exp = state.tripExpenses.filter(e => e.tripId === t.id && keys.has(e.workerKey));
    const approved = exp.filter(e => e.status === 'approved' && e.category !== 'toll_fastag').reduce((s, e) => s + e.amount, 0);
    const settled = Boolean(t.crewSettled?.[w.key]);
    return {c, w, days, bata, wage, advances, expenses: exp, approved, pendingExpenses: exp.filter(e => e.status === 'submitted').length, net: wage + bata + approved - advances, settled};
  });
}
export function addExpense(state, t, workerKey, v) {
  if (!EXPENSE_CATEGORIES[v.category]) return 'Choose a category.';
  if (!(Number(v.amount) > 0)) return 'Enter the amount.';
  if (v.category !== 'toll_fastag' && !String(v.proof || '').trim()) return 'Attach the receipt photo.';
  state.tripExpenses.push({id: uid('EXP'), tripId: t.id, workerKey, category: v.category, amount: Math.round(Number(v.amount)), proof: v.proof || 'FASTag statement', status: v.category === 'toll_fastag' ? 'approved' : 'submitted', at: stamp()});
  return '';
}
export function postTripSettlement(state, t, row) {
  if (row.partner) return 'Partner crew is paid by their Truck Owner.';
  if (row.settled) return 'Already posted.';
  if (row.pendingExpenses) return 'Approve or reject every receipt first.';
  const ws = t.owner, key = row.w.key;
  if (row.wage) postAccrual(state, ws, key, 'wage', row.wage, `Trip wage · ${t.id}`, {ref: t.id});
  postAccrual(state, ws, key, 'bata', row.bata, `Bata ${row.days} day(s) × ${inr(settings(state, ws).bataPerDay)} · ${t.id}`, {ref: t.id});
  if (row.approved) postAccrual(state, ws, key, 'reimbursement', row.approved, `Trip expenses (receipts) · ${t.id}`, {ref: t.id});
  (t.crewSettled ||= {})[key] = {at: stamp(), net: row.net};
  return '';
}

// ---------- payroll ----------
export function payrollLines(state, ws, month = monthKey()) {
  const set = settings(state, ws);
  return workforceOf(state, ws).filter(w => w.kind === 'team' && w.status === 'active' && ['monthly', 'daily'].includes(w.payType)).map(w => {
    const a = w.member.attendanceSummary; const rate = Number(w.payAmount || 0);
    const gross = w.payType === 'monthly' ? Math.min(rate, Math.round(rate * (a.present + a.leave) / set.workingDays)) : rate * a.present;
    const st = set.statutory || {};
    const pf = st.pf ? Math.round(Math.min(gross, 15000) * 0.12) : 0, esi = st.esi && gross <= 21000 ? Math.round(gross * 0.0075) : 0, pt = st.pt ? 200 : 0;
    const recovery = w.member.loan?.balance > 0 ? Math.min(w.member.loan.installment, w.member.loan.balance) : 0;
    const before = khata(state, ws, w).balance;
    return {key: w.key, memberId: w.id, name: w.name, role: w.roleLabel, basis: w.payType, rate, present: a.present, leave: a.leave, absent: a.absent, gross, statutory: pf + esi + pt, statutoryParts: {pf, esi, pt}, recovery, carry: before, net: gross - pf - esi - pt - recovery + before, hold: false};
  });
}
export function currentRun(state, ws, month = monthKey()) { return ensureWorkforce(state).payrollRuns.find(r => r.workspace === ws && r.month === month); }
export function preparePayroll(state, ws, actor) {
  const run = currentRun(state, ws);
  if (run && run.status !== 'draft') return 'This month is already prepared.';
  const lines = payrollLines(state, ws);
  if (!lines.length) return 'No salaried staff to pay.';
  const r = run || {id: uid('PR'), workspace: ws, month: monthKey(), history: []};
  Object.assign(r, {lines, status: 'prepared', preparedBy: actor, preparedAt: stamp(), total: lines.reduce((s, l) => s + Math.max(0, l.net), 0)});
  r.history.push({status: 'prepared', by: actor, at: stamp()});
  if (!run) state.payrollRuns.unshift(r);
  return '';
}
export function toggleHold(state, ws, memberId) { const r = currentRun(state, ws); const l = r?.lines.find(x => x.memberId === memberId); if (!l || r.status !== 'prepared') return 'Only a prepared run can be changed.'; l.hold = !l.hold; r.total = r.lines.filter(x => !x.hold).reduce((s, x) => s + Math.max(0, x.net), 0); return ''; }
export function approvePayroll(state, ws, actor, limit = Infinity) {
  const r = currentRun(state, ws); if (!r || r.status !== 'prepared') return 'Prepare the payroll first.';
  if (r.total > limit) return `The total ${inr(r.total)} is above your approval limit of ${inr(limit)}. The owner must approve.`;
  if (r.preparedBy === actor && limit !== Infinity) return 'The person who prepared the payroll cannot also approve it.';
  r.status = 'approved'; r.approvedBy = actor; r.history.push({status: 'approved', by: actor, at: stamp()}); return '';
}
export function payPayroll(state, ws, actor) {
  const r = currentRun(state, ws); if (!r || r.status !== 'approved') return 'Approve the payroll first.';
  for (const l of r.lines.filter(x => !x.hold)) {
    const w = findWorker(state, ws, l.key); if (!w) continue;
    postAccrual(state, ws, l.key, 'salary', l.gross, `Salary ${r.month} · ${l.present} present, ${l.leave} leave`, {ref: r.id});
    if (l.statutory) postAccrual(state, ws, l.key, 'statutory', -l.statutory, `Statutory deductions ${r.month}`, {ref: r.id});
    if (l.recovery) { postAccrual(state, ws, l.key, 'advance_recovery', -l.recovery, `Salary advance recovery ${r.month}`, {ref: r.id}); w.member.loan.balance -= l.recovery; }
    const net = khata(state, ws, w).balance;
    if (net > 0) state.ledger.unshift({id: uid('PAY'), owner: ws, sourceType: 'payroll', sourceId: r.id, type: 'salary', direction: 'payable', payer: ws, payee: `staff:${l.memberId}`, responsible: ws, amount: net, method: 'bank', reference: `PAYROLL-${r.month}-${l.memberId}`, channel: 'platform', status: 'paid', note: `Salary ${r.month} (payslip)`, history: [{action: 'payroll', status: 'paid', actor, at: stamp()}]});
    l.paid = net;
  }
  r.status = 'paid'; r.paidAt = stamp(); r.history.push({status: 'paid', by: actor, at: stamp()});
  return '';
}

// ---------- screens ----------
const canPayroll = state => { const {ws, perms} = opsCtx(state); return ['goods', 'transporter', 'vehicle', 'movers'].includes(ws) || (ws === 'staff' && perms.includes('money.prepare')); };
const canDuty = state => { const {ws, perms} = opsCtx(state); return ['goods', 'transporter', 'vehicle', 'movers'].includes(ws) || (ws === 'staff' && perms.some(p => ['work.manage', 'work.update'].includes(p))); };
const denied = what => `${head(what, 'Your role does not include this.')}<div class="empty-inline"><b>Not available</b><small>Ask the owner to change your access.</small></div>`;

export function workforceScreen(state) {
  const ws = ownerOf(state); if (!canDuty(state) && !canPayroll(state)) return denied('Workforce');
  const f = state.workforceFilter || 'all';
  const all = workforceOf(state, ws);
  const list = all.filter(w => f === 'all' || w.family === f || w.engagement === f);
  const count = k => all.filter(w => w.family === k || w.engagement === k).length;
  const showMoney = canPayroll(state);
  return `${head('Workforce', 'Everyone who works for you — staff, drivers, khalasi, helpers, platform hires, partner crew and contractors — in one list.', '<button class="button primary" data-route="addStaff">+ Invite staff</button>')}${tabs('workforce')}
  <div class="chip-row filter-row">${[['all', `All (${all.length})`], ['field', `Field crew (${count('field')})`], ['office', `Office (${count('office')})`], ...Object.entries(ENGAGEMENTS).map(([k, l]) => [k, `${l} (${count(k)})`])].map(([k, l]) => `<button class="chip ${f === k ? 'active' : ''}" data-wf-filter="${k}">${esc(l)}</button>`).join('')}</div>
  <section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Name</th><th>Role</th><th>Engagement</th><th>Today</th><th>Pay</th>${showMoney ? '<th>Balance</th>' : ''}<th></th></tr></thead><tbody>
  ${list.map(w => { const d = dutyStatus(state, ws, w, todayKey()); const k = showMoney && !['partner'].includes(w.engagement) ? khata(state, ws, w) : null; return `<tr><td><b>${esc(w.name)}</b><small class="block muted">${esc(w.mobile ? `+91 ••••••${String(w.mobile).slice(-4)}` : '')}</small></td><td>${esc(w.roleLabel || '')}<small class="block muted">${w.family === 'field' ? 'Field crew' : 'Office'}</small></td><td>${esc(ENGAGEMENTS[w.engagement])}${w.partnerOf ? `<small class="block muted">via ${esc(w.partnerOf)}</small>` : ''}</td><td>${pill(d.status)}<small class="block muted">${esc(d.label)}</small></td><td>${w.engagement === 'partner' ? '<small class="muted">Paid by their Truck Owner</small>' : `${inr(w.payAmount || 0)} <small class="muted">${esc(String(w.payType || '').replace(/_/g, ' '))}</small>`}</td>${showMoney ? `<td>${k ? `<b class="${k.balance < 0 ? 'amount out' : 'amount in'}">${inr(Math.abs(k.balance))}</b><small class="block muted">${k.balance < 0 ? 'worker owes' : k.balance > 0 ? 'you owe' : 'settled'}</small>` : '—'}</td>` : ''}<td class="row-actions">${w.kind === 'team' ? `<button class="button secondary compact" data-action="open-staff" data-staff="${w.id}">Profile</button>` : ''}${showMoney && w.engagement !== 'partner' ? `<button class="button secondary compact" data-wf-khata="${esc(w.key)}">Khata</button>` : ''}${['per_trip', 'temporary'].includes(w.engagement) && w.mobile ? `<button class="button secondary compact" data-wf-convert="${esc(w.key)}">Make permanent</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7">No one matches this filter.</td></tr>'}
  </tbody></table></div></section>`;
}

export function dutyBoardScreen(state) {
  const ws = ownerOf(state); if (!canDuty(state)) return denied('Duty board');
  const crew = workforceOf(state, ws).filter(w => w.family === 'field' && w.kind !== 'contractor');
  const days = [0, 1, 2].map(todayKey);
  const free = crew.filter(w => dutyStatus(state, ws, w, days[0]).status === 'free').length;
  const waiting = state.trips.filter(t => t.owner === ws && t.status === 'awaiting_assignment');
  return `${head('Duty board', 'Field crew for today and the next two days. Leave, trips, moving jobs and rest after long hauls are checked automatically.')}${tabs('dutyBoard')}
  <div class="metrics"><div class="metric"><span>Free today</span><b>${free}</b><small>Ready to assign</small></div><div class="metric"><span>On work today</span><b>${crew.filter(w => ['on_trip', 'on_job'].includes(dutyStatus(state, ws, w, days[0]).status)).length}</b><small>Trips and moving jobs</small></div><div class="metric"><span>On leave / resting</span><b>${crew.filter(w => ['on_leave', 'resting'].includes(dutyStatus(state, ws, w, days[0]).status)).length}</b><small>Not assignable</small></div><div class="metric"><span>Trips waiting</span><b>${waiting.length}</b><small>Need crew</small></div></div>
  <section class="panel"><div class="table-scroll"><table class="data-table duty-table"><thead><tr><th>Crew</th>${days.map((d, i) => `<th>${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(d).toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric'})}</th>`).join('')}</tr></thead><tbody>
  ${crew.map(w => `<tr><td><b>${esc(w.name)}</b><small class="block muted">${esc(w.roleLabel || '')} · ${esc(ENGAGEMENTS[w.engagement])}</small></td>${days.map(d => { const s = dutyStatus(state, ws, w, d); return `<td class="duty ${s.status}"><b>${esc(s.label)}</b>${s.detail ? `<small>${esc(s.detail)}</small>` : ''}${s.status === 'free' && d === days[0] && waiting.length ? `<button class="button text compact" data-op="open-assign" data-id="${waiting[0].id}">Assign to ${esc(waiting[0].id)}</button>` : ''}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table></div><div class="legend"><span class="free">Free</span><span class="on_trip">On trip / job</span><span class="on_leave">Leave</span><span class="resting">Resting</span></div></section>`;
}

export function khataScreen(state) {
  const ws = ownerOf(state); const w = findWorker(state, ws, state.khataWorker);
  if (!w) return `${head('Khata', 'Choose a worker from Workforce.')}`;
  const self = opsCtx(state).member && `staff:${opsCtx(state).member.id}` === w.key;
  if (!self && !canPayroll(state)) return denied('Khata');
  return khataView(state, ws, w, self);
}
export function khataView(state, ws, w, self = false) {
  const k = khata(state, ws, w);
  const loan = w.member?.loan;
  return `${head(self ? 'My khata' : `Khata · ${w.name}`, `${w.roleLabel || ''} · ${ENGAGEMENTS[w.engagement] || ''} · ${state.businessProfiles[ws]?.legalName || ws}`, self ? '' : '<button class="button secondary" data-route="workforce">Back</button>')}
  <div class="metrics"><div class="metric"><span>Earned</span><b>${inr(k.earned)}</b><small>Salary, wages, bata, incentives</small></div><div class="metric"><span>Reimbursements</span><b>${inr(k.reimb)}</b><small>Not earnings</small></div><div class="metric"><span>Deductions</span><b>${inr(k.deducted)}</b><small>${k.disputed.length ? `${k.disputed.length} in dispute (not counted)` : 'With evidence'}</small></div><div class="metric"><span>${k.balance < 0 ? (self ? 'You owe' : 'Worker owes') : self ? 'Due to you' : 'You owe'}</span><b class="${k.balance < 0 ? 'amount out' : 'amount in'}">${inr(Math.abs(k.balance))}</b><small>After ${inr(k.paid)} paid${k.returned ? ` and ${inr(k.returned)} returned` : ''}</small></div></div>
  ${loan && loan.balance > 0 ? `<div class="info-banner"><b>Salary advance: ${inr(loan.balance)} left of ${inr(loan.total)}</b><span>${inr(loan.installment)} is recovered each payroll · ${esc(loan.reason)}</span></div>` : ''}
  <section class="panel ledger"><h2>Entries</h2>${k.lines.map(l => `<div class="ledger-row static"><span><b>${esc(l.text)}</b><small>${esc(l.at)} · ${esc(String(l.type).replace(/_/g, ' '))}${l.evidence ? ` · evidence: ${esc(l.evidence)}` : ''}</small></span><span class="amount ${l.amount < 0 ? 'out' : 'in'}">${l.amount < 0 ? '−' : '+'}${inr(Math.abs(l.amount))}</span>${pill(l.status)}${self && l.kind === 'accrual' && l.amount < 0 && l.status === 'posted' && l.type === 'deduction' ? `<button class="button secondary compact" data-wf-dispute="${l.id}">Dispute</button>` : ''}${!self && l.status === 'disputed' ? `<span class="row-actions"><button class="button secondary compact" data-wf-resolve="${l.id}" data-decision="uphold">Uphold</button><button class="button secondary compact" data-wf-resolve="${l.id}" data-decision="waive">Waive</button></span>` : ''}</div>`).join('') || '<div class="empty-inline"><b>No entries yet</b></div>'}</section>
  ${self ? '' : `<div class="grid two"><section class="panel"><h2>Settle balance</h2>${k.balance > 0 ? `<p>Pay ${inr(k.balance)} to ${esc(w.name)}.</p><button class="button primary" data-wf-pay="${esc(w.key)}">Pay ${inr(k.balance)} now</button>` : k.balance < 0 ? `<p>${esc(w.name)} holds ${inr(-k.balance)} of unspent advance.</p><button class="button secondary" data-wf-return="${esc(w.key)}">Record cash returned</button>` : '<p class="muted">Nothing due either way.</p>'}</section>
  <section class="panel"><h2>Add a deduction</h2><form data-wf-form="deduction" data-key="${esc(w.key)}" class="form-grid"><label><span>Reason</span><select name="reason">${Object.entries(DEDUCTION_REASONS).map(([a, b]) => `<option value="${a}">${esc(b)}</option>`).join('')}</select></label><label><span>Amount (₹)</span><input type="number" name="amount" min="1"></label><label><span>Explanation for the worker</span><input name="note"></label><label><span>Evidence</span><input type="file" name="evidence" accept="image/*,application/pdf"></label><label class="consent-row"><input type="checkbox" name="override"> Owner override for amounts above ${inr(settings(state, ws).deductionCap)}</label><p id="wf-error" class="field-error" hidden></p><button class="button secondary" type="submit">Add deduction</button><p class="mock-hint">The worker sees it immediately and can dispute it. Disputed amounts are not counted until you decide.</p></form></section></div>`}`;
}

export function tripSettlementScreen(state) {
  const t = state.trips.find(x => x.id === state.selectedTripId);
  if (!t) return head('Crew settlement', 'Trip not found.');
  if (!canPayroll(state) || ownerOf(state) !== t.owner) return denied('Crew settlement');
  const rows = tripCrewSettlement(state, t);
  return `${head(`Crew settlement · ${t.id}`, `${t.title} · ${tripDays(t)} day(s) away · bata ${inr(settings(state, t.owner).bataPerDay)}/day`, '<button class="button secondary" data-route="tripDetail">Back to trip</button>')}
  ${rows.map(r => r.partner ? `<section class="panel"><h2>${esc(r.c.name)}</h2><p class="muted">Partner crew · paid by their Truck Owner. You pay the Truck Owner under Money; crew amounts are private to them.</p></section>` : `<section class="panel settlement-card"><div class="panel-header"><div><h2>${esc(r.w.name)}</h2><p>${esc(r.c.role === 'driver' ? 'Driver' : 'Khalasi / Helper')} · ${esc(ENGAGEMENTS[r.w.engagement] || '')}</p></div>${r.settled ? pill('settled') : pill('open')}</div>
    <table class="price-table"><tbody><tr><td>Trip wage</td><td>${r.wage ? inr(r.wage) : '<small class="muted">In monthly salary</small>'}</td></tr><tr><td>Bata · ${r.days} day(s)</td><td>${inr(r.bata)}</td></tr><tr><td>Approved receipts</td><td>${inr(r.approved)}</td></tr><tr><td>Advance given</td><td>−${inr(r.advances)}</td></tr><tr class="total"><td>${r.net >= 0 ? 'Due to worker' : 'Worker returns'}</td><td>${inr(Math.abs(r.net))}</td></tr></tbody></table>
    <h3>Receipts</h3>${r.expenses.map(e => `<div class="ledger-row static"><span><b>${esc(EXPENSE_CATEGORIES[e.category])}</b><small>${esc(e.proof)} · ${esc(e.at)}</small></span><span class="amount">${inr(e.amount)}</span>${pill(e.status)}${e.status === 'submitted' ? `<span class="row-actions"><button class="button secondary compact" data-wf-expense="${e.id}" data-decision="approved">Approve</button><button class="button secondary compact" data-wf-expense="${e.id}" data-decision="rejected">Reject</button></span>` : ''}</div>`).join('') || '<p class="muted">No receipts yet.</p>'}
    ${r.settled ? `<p class="muted">Posted to khata ${esc(r.settled.at || '')}.</p><button class="button secondary" data-wf-khata="${esc(r.w.key)}">Open khata</button>` : `<form data-wf-form="expense" data-key="${esc(r.w.key)}" class="inline-form"><select name="category">${Object.entries(EXPENSE_CATEGORIES).map(([a, b]) => `<option value="${a}">${esc(b)}</option>`).join('')}</select><input type="number" name="amount" placeholder="₹" min="1"><input type="file" name="proof" accept="image/*,application/pdf"><button class="button secondary" type="submit">Add receipt</button></form><div class="row-actions"><button class="button primary" data-wf-post="${esc(r.w.key)}">Post to khata</button></div>`}
  </section>`).join('')}<p id="wf-error" class="field-error" hidden></p>`;
}

export function payrollScreen(state) {
  const ws = ownerOf(state); if (!canPayroll(state)) return denied('Payroll');
  const r = currentRun(state, ws), lines = r?.lines || payrollLines(state, ws), set = settings(state, ws);
  const status = r?.status || 'draft';
  const total = lines.filter(l => !l.hold).reduce((s, l) => s + Math.max(0, l.net), 0);
  return `${head(`Payroll · ${new Date(`${monthKey()}-01`).toLocaleDateString('en-IN', {month: 'long', year: 'numeric'})}`, 'Attendance → gross → deductions → net. Prepared by accounts, approved by the owner, paid in one go. Field crew trip money comes from trip settlements into each khata.')}${tabs('payroll')}
  <div class="payroll-steps">${['draft', 'prepared', 'approved', 'paid'].map(s => `<span class="${['draft', 'prepared', 'approved', 'paid'].indexOf(s) <= ['draft', 'prepared', 'approved', 'paid'].indexOf(status) ? 'done' : ''}">${s[0].toUpperCase() + s.slice(1)}</span>`).join('')}</div>
  <section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Staff</th><th>Basis</th><th>Present / leave / absent</th><th>Gross</th><th>Statutory</th><th>Advance recovery</th><th>Carried balance</th><th>Net pay</th><th></th></tr></thead><tbody>
  ${lines.map(l => `<tr class="${l.hold ? 'held' : ''}"><td><b>${esc(l.name)}</b><small class="block muted">${esc(l.role || '')}</small></td><td>${inr(l.rate)} ${esc(l.basis)}</td><td>${l.present} / ${l.leave} / ${l.absent}</td><td>${inr(l.gross)}</td><td>${l.statutory ? `−${inr(l.statutory)}` : '—'}</td><td>${l.recovery ? `−${inr(l.recovery)}` : '—'}</td><td>${l.carry ? `${l.carry < 0 ? '−' : '+'}${inr(Math.abs(l.carry))}` : '—'}</td><td><b>${inr(Math.max(0, l.net))}</b>${l.paid ? '<small class="block muted">Paid</small>' : ''}${l.hold ? '<small class="block muted">On hold</small>' : ''}</td><td>${status === 'prepared' ? `<button class="button text compact" data-wf-hold="${l.memberId}">${l.hold ? 'Release' : 'Hold'}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9">No salaried staff.</td></tr>'}
  </tbody><tfoot><tr><td colspan="7"><b>Total to pay</b></td><td colspan="2"><b>${inr(total)}</b></td></tr></tfoot></table></div>
  <p class="mock-hint">Working days ${set.workingDays}. Statutory deductions: ${Object.entries(set.statutory || {}).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(', ') || 'none enabled'} — simplified rates; confirm with your accountant. <button class="button text compact" data-wf-statutory>${set.statutory?.pf ? 'Turn off PF/ESI/PT' : 'Enable PF, ESI and PT'}</button></p>
  <p id="wf-error" class="field-error" hidden></p>
  <div class="row-actions">${status === 'draft' ? '<button class="button primary" data-wf-payroll="prepare">Prepare payroll</button>' : ''}${status === 'prepared' ? '<button class="button primary" data-wf-payroll="approve">Approve</button>' : ''}${status === 'approved' ? `<button class="button primary" data-wf-payroll="pay">Pay ${inr(total)}</button>` : ''}${status === 'paid' ? `<span class="muted">Paid ${esc(r.paidAt)} · payslips are in each person’s My Money</span>` : ''}</div></section>
  ${r?.history?.length ? `<section class="panel"><h2>History</h2><div class="timeline">${r.history.map(h => `<div><i></i><span><b>${esc(h.status)}</b><small>${esc(h.by)} · ${esc(h.at)}</small></span></div>`).join('')}</div></section>` : ''}`;
}

// Worker's own view inside My Money (staff or field personas who are team members).
export function selfKhataPanel(state) {
  const {ws, ownerWs, member} = opsCtx(state);
  let w = null, owner = ownerWs;
  if (ws === 'staff' && member) w = findWorker(state, ownerWs, `staff:${member.id}`);
  if (['commercialDriver', 'helper'].includes(ws)) for (const b of ['transporter', 'movers', 'vehicle', 'goods']) { const x = workforceOf(state, b).find(v => v.kind === 'team' && v.keys.includes(ws)); if (x) { w = x; owner = b; break; } }
  if (!w) return '';
  return `<div class="self-khata">${khataView(state, owner, w, true)}</div>`;
}

// ---------- bindings ----------
function err(root, msg) { const e = root.querySelector('#wf-error'); if (e) { e.textContent = msg; e.hidden = !msg; } }
export function bindWorkforce(root, api) {
  const S = () => api.getState(); const ws = () => ownerOf(S()); const actor = () => opsCtx(S()).persona.name;
  root.querySelectorAll('[data-wf-filter]').forEach(b => b.onclick = () => { S().workforceFilter = b.dataset.wfFilter; api.save(); api.render(); });
  root.querySelectorAll('[data-wf-khata]').forEach(b => b.onclick = () => { S().khataWorker = b.dataset.wfKhata; api.save(); api.navigate('khata'); });
  root.querySelectorAll('[data-wf-convert]').forEach(b => b.onclick = () => { const w = findWorker(S(), ws(), b.dataset.wfConvert); api.convert(w); });
  root.querySelectorAll('[data-wf-dispute]').forEach(b => b.onclick = () => { const reason = prompt('Why do you disagree with this deduction?'); const e = disputeAccrual(S(), b.dataset.wfDispute, reason); if (e) return api.toast(e); api.save(); api.render(); api.toast('Dispute sent. The amount is not counted until the owner decides.'); });
  root.querySelectorAll('[data-wf-resolve]').forEach(b => b.onclick = () => { const e = resolveDispute(S(), b.dataset.wfResolve, b.dataset.decision); if (e) return api.toast(e); api.save(); api.render(); api.toast(b.dataset.decision === 'uphold' ? 'Deduction upheld' : 'Deduction waived'); });
  root.querySelectorAll('[data-wf-pay]').forEach(b => b.onclick = () => { const s = S(), w = findWorker(s, ws(), b.dataset.wfPay), k = khata(s, ws(), w); if (k.balance <= 0) return; s.ledger.unshift({id: uid('PAY'), owner: ws(), sourceType: 'khata', sourceId: w.key, type: 'salary', direction: 'payable', payer: ws(), payee: w.key, responsible: ws(), amount: k.balance, method: 'upi', reference: `KHATA-${Date.now().toString().slice(-6)}`, channel: 'platform', status: 'paid', note: `Khata settlement · ${w.name}`, history: [{action: 'khata', status: 'paid', actor: actor(), at: stamp()}]}); api.save(); api.render(); api.toast(`${inr(k.balance)} paid to ${w.name}`); });
  root.querySelectorAll('[data-wf-return]').forEach(b => b.onclick = () => { const s = S(), w = findWorker(s, ws(), b.dataset.wfReturn), k = khata(s, ws(), w); s.ledger.unshift({id: uid('PAY'), owner: ws(), sourceType: 'khata', sourceId: w.key, type: 'reimbursement', direction: 'receivable', payer: w.key, payee: ws(), responsible: w.key, amount: -k.balance, method: 'cash', reference: `RETURN-${Date.now().toString().slice(-6)}`, channel: 'outside', status: 'confirmed', note: `Unspent advance returned by ${w.name}`, history: [{action: 'return', status: 'confirmed', actor: actor(), at: stamp()}]}); api.save(); api.render(); api.toast('Cash return recorded'); });
  root.querySelectorAll('[data-wf-expense]').forEach(b => b.onclick = () => { const e = S().tripExpenses.find(x => x.id === b.dataset.wfExpense); if (e) { e.status = b.dataset.decision; e.decidedBy = actor(); } api.save(); api.render(); });
  root.querySelectorAll('[data-wf-post]').forEach(b => b.onclick = () => { const s = S(), t = s.trips.find(x => x.id === s.selectedTripId), row = tripCrewSettlement(s, t).find(r => r.w?.key === b.dataset.wfPost); const e = postTripSettlement(s, t, row); if (e) return err(root, e); api.save(); api.render(); api.toast(`Posted to ${row.w.name}'s khata`); });
  root.querySelectorAll('[data-wf-hold]').forEach(b => b.onclick = () => { const e = toggleHold(S(), ws(), b.dataset.wfHold); if (e) return err(root, e); api.save(); api.render(); });
  root.querySelector('[data-wf-statutory]')?.addEventListener('click', () => { const set = settings(S(), ws()); const on = !set.statutory?.pf; set.statutory = {pf: on, esi: on, pt: on}; api.save(); api.render(); });
  root.querySelectorAll('[data-wf-payroll]').forEach(b => b.onclick = () => {
    const s = S(), step = b.dataset.wfPayroll, {ws: cur, member} = opsCtx(s);
    const limit = cur === 'staff' ? Number(member?.access?.approvalLimit ?? (member?.role === 'manager' ? 25000 : 0)) : Infinity;
    const e = step === 'prepare' ? preparePayroll(s, ws(), actor()) : step === 'approve' ? approvePayroll(s, ws(), actor(), limit) : payPayroll(s, ws(), actor());
    if (e) return err(root, e); api.save(); api.render(); api.toast({prepare: 'Payroll prepared', approve: 'Payroll approved', pay: 'Salaries paid · payslips sent'}[step]);
  });
  root.querySelectorAll('form[data-wf-form]').forEach(f => f.onsubmit = ev => {
    ev.preventDefault(); const s = S(), fd = new FormData(f), key = f.dataset.key;
    if (f.dataset.wfForm === 'deduction') { const w = findWorker(s, ws(), key); const e = addDeduction(s, ws(), w, {reason: fd.get('reason'), amount: fd.get('amount'), note: fd.get('note'), evidence: fd.get('evidence')?.name, override: fd.get('override')}); if (e) return err(root, e); api.save(); api.render(); api.toast('Deduction added. The worker can see and dispute it.'); }
    if (f.dataset.wfForm === 'expense') { const t = s.trips.find(x => x.id === s.selectedTripId); const e = addExpense(s, t, key, {category: fd.get('category'), amount: fd.get('amount'), proof: fd.get('proof')?.name}); if (e) return err(root, e); api.save(); api.render(); api.toast('Receipt added'); }
  });
}
