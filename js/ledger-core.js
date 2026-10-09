// MoveAI One — unified pay & ledgers (step 2). One screen, one entry schema, one approvals inbox, one approval policy
// (team lead → branch manager → owner), one petty-cash book per branch and one payroll register for every business
// type. It reads and acts on both existing engines — the khata in workforce.js (transporter, goods, truck owner,
// movers) and store-hr.js (stores) — so older screens keep working. Adds cash payments that the worker confirms.
import {esc, pill, inr} from './ops.js';
import {record} from './pay.js';
import * as PC from './people-core.js';
import * as WF from './workforce.js';
import * as HR from './store-hr.js';
import * as Payroll from './payroll-core.js';

const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const isStore = b => PC.STORES.includes(b);
export const TYPES = {earning: 'Earning', allowance: 'Allowance', reimbursement: 'Reimbursement', advance: 'Advance', deduction: 'Deduction', payment: 'Payment', cash_returned: 'Cash returned', recovery: 'Advance recovery'};

// ---------- approval policy (same everywhere) ----------
export function policy(s, b) { s.approvalPolicy ||= {}; return (s.approvalPolicy[b] ||= {lead: 200, manager: 5000}); }
export function levelFor(s, b, amount) { const p = policy(s, b); return amount <= p.lead ? 'lead' : amount <= p.manager ? 'manager' : 'owner'; }
export function canApprove(s, ws, b, branchId, amount, teamId = null) {
  const sc = PC.scopeOf(s, ws), p = policy(s, b); if (!sc || sc.business !== b) return 'Not allowed.';
  if (sc.kind === 'owner') return '';
  if (sc.kind === 'manager') { if (branchId && sc.branch && branchId !== sc.branch) return 'This belongs to another branch.'; return amount <= p.manager ? '' : `Above ${inr(p.manager)} — the owner must approve.`; }
  const lead = (s.teams || []).some(t => t.business === b && t.lead === sc.empId && (!teamId || t.id === teamId) && (!branchId || t.branchId === branchId));
  if (lead) return amount <= p.lead ? '' : `Team leads approve up to ${inr(p.lead)}; ${amount <= p.manager ? 'the branch manager' : 'the owner'} must approve this.`;
  return 'Only a team lead, branch manager or the owner can approve.';
}
export const approverLabel = (s, b, amount) => ({lead: 'Team lead', manager: 'Branch manager', owner: 'Owner'}[levelFor(s, b, amount)]);

// ---------- people and balances (one schema) ----------
function wfWorker(s, b, e) { const list = WF.workforceOf(s, b); return list.find(w => w.id === e.source.id || w.key === `staff:${e.source.id}` || (w.keys || []).includes(`staff:${e.source.id}`)); }
export function rows(s, ws) {
  const sc = PC.scopeOf(s, ws); if (!sc) return [];
  return s.employments.filter(e => e.business === sc.business && e.status === 'active' && (sc.kind === 'owner' || e.homeBranch === sc.branch || e.cover.includes(sc.branch))).map(e => {
    const p = s.persons[e.personId], teams = (s.teams || []).filter(t => t.members.includes(e.id) && !t.ended).map(t => t.name);
    // Same fix as worker-hub.js's jobs() — e.personId is already the real shared id. 'engine'/'key'
    // are kept as before since entries() below still needs them to read the right underlying history
    // for display; only the balance/advance figures themselves now come from the unified engine.
    Payroll.ensurePayrollCore(s);
    const unifiedBalance = Payroll.balance(s, e.personId), unifiedAdvance = Payroll.advanceOutstanding(s, e.personId);
    if (isStore(e.business)) return {e, p, teams, balance: unifiedBalance, advance: unifiedAdvance, engine: 'store', key: e.source.id};
    const w = wfWorker(s, e.business, e); if (!w) return {e, p, teams, balance: unifiedBalance, advance: unifiedAdvance, engine: 'business', key: null};
    return {e, p, teams, balance: unifiedBalance, advance: unifiedAdvance, engine: 'business', key: w.key, w};
  });
}
export function entries(s, r) {
  if (r.engine === 'store') return (s.staffLedger || []).filter(x => x.personId === r.key).map(x => ({at: x.at, type: ({earning: 'earning', allowance: 'allowance', reimbursement: 'reimbursement', deduction: 'deduction', payment: 'payment', advance_paid: 'advance', advance_recovery: 'recovery', cash_return: 'cash_returned'})[x.type] || x.type, amount: x.amount, note: x.note, status: x.status, branchId: x.branchId, method: x.method}));
  if (!r.w) return [];
  return WF.khata(s, r.e.business, r.w).lines.map(l => ({at: l.at, type: l.kind === 'payment' ? 'payment' : l.type === 'reimbursement' ? 'reimbursement' : l.amount < 0 ? 'deduction' : ['bata', 'allowance'].includes(l.type) ? 'allowance' : 'earning', amount: Math.abs(l.amount), note: l.text, status: l.status, branchId: r.e.homeBranch}));
}

// ---------- approvals inbox (both engines + cover requests) ----------
export function inbox(s, ws) {
  const sc = PC.scopeOf(s, ws); if (!sc) return []; const b = sc.business, out = [];
  if (isStore(b)) {
    for (const x of (s.staffLedger || []).filter(x => x.store === b && x.type === 'reimbursement' && x.status === 'submitted')) out.push({kind: 'store_reimb', id: x.id, amount: x.amount, branchId: x.branchId, text: `Reimbursement · ${x.note}`, who: x.personId});
    for (const x of (s.staffLedger || []).filter(x => x.store === b && x.status === 'disputed')) out.push({kind: 'store_dispute', id: x.id, amount: x.amount, branchId: x.branchId, text: `Disputed deduction · ${x.note}`, who: x.personId, ownerOnly: true});
    for (const x of (s.staffAdvances || []).filter(x => x.store === b && x.status === 'pending_approval')) out.push({kind: 'store_advance', id: x.id, amount: x.amount, branchId: s.staffHR?.[x.personId]?.homeBranch, text: `Advance request · ${x.reason}`, who: x.personId, ownerOnly: true});
  } else {
    for (const x of (s.tripExpenses || []).filter(x => x.status === 'submitted')) { const t = (s.trips || []).find(t => t.id === x.tripId); if (t?.owner !== b) continue; out.push({kind: 'trip_expense', id: x.id, amount: x.amount, branchId: t.branchId, teamId: t.teamId, text: `Trip receipt ${x.category.replace(/_/g, ' ')} · ${t.id}`, who: x.workerKey}); }
    for (const x of (s.accruals || []).filter(x => x.workspace === b && x.status === 'disputed')) out.push({kind: 'wf_dispute', id: x.id, amount: Math.abs(x.amount), text: `Disputed deduction · ${x.note}`, who: x.workerKey, ownerOnly: true});
  }
  for (const r of (s.coverRequests || []).filter(r => r.business === b && r.status === 'requested')) out.push({kind: 'cover', id: r.id, amount: 0, branchId: r.fromBranch, text: `Cover on ${r.date}`, who: r.empId});
  return out.map(x => ({...x, level: x.ownerOnly ? 'owner' : levelFor(s, b, x.amount), can: x.kind === 'cover' ? '' : x.ownerOnly ? (sc.kind === 'owner' ? '' : 'Only the owner decides this.') : canApprove(s, ws, b, x.branchId, x.amount, x.teamId)}));
}
export function decide(s, ws, item, ok) {
  if (item.can) return item.can;
  if (item.kind === 'store_reimb') { const e = s.staffLedger.find(x => x.id === item.id); e.status = ok ? 'approved' : 'rejected'; e.decidedBy = ws; return ''; }
  if (item.kind === 'store_dispute') return HR.decideEntry(s, PC.scopeOf(s, ws).business, item.id, ok ? 'approve' : 'reject');
  if (item.kind === 'store_advance') { if (!ok) { const x = s.staffAdvances.find(y => y.id === item.id); x.status = 'declined'; return ''; } return HR.approveAdvance(s, PC.scopeOf(s, ws).business, item.id); }
  if (item.kind === 'trip_expense') { const e = s.tripExpenses.find(x => x.id === item.id); e.status = ok ? 'approved' : 'rejected'; e.decidedBy = ws; return ''; }
  if (item.kind === 'wf_dispute') return WF.resolveDispute(s, item.id, ok ? 'uphold' : 'waive');
  if (item.kind === 'cover') return PC.decideCover(s, ws, item.id, ok);
  return 'Unknown item.';
}

// ---------- cash payments the worker confirms (business staff) ----------
export function payCash(s, ws, r, amount) {
  const sc = PC.scopeOf(s, ws); if (sc?.kind !== 'owner') return 'Only the owner pays staff.';
  amount = Math.round(Number(amount)); if (!(amount > 0)) return 'Enter the amount.'; if (amount > r.balance) return `Balance due is only ${inr(r.balance)}. Use an advance for more.`;
  if (r.engine === 'store') { HR.post(s, {store: r.e.business, personId: r.key, branchId: r.e.homeBranch, type: 'payment', amount, note: 'Paid in cash', method: 'cash', reference: `CASH-${Date.now().toString().slice(-6)}`, status: 'pending_ack'}); return ''; }
  record(s, {owner: r.e.business, sourceType: 'khata', sourceId: r.key, type: 'salary', direction: 'payable', payer: r.e.business, payee: r.key, responsible: r.e.business, amount, method: 'cash', reference: `CASH-${Date.now().toString().slice(-6)}`, status: 'paid', ack: 'pending', note: `Paid in cash · ${r.p.name}`}, 'Owner');
  return '';
}
export function ackPanel(s, ws) {
  const keys = [ws, s.selectedStaffId ? `staff:${s.selectedStaffId}` : null].filter(Boolean);
  if (['commercialDriver', 'helper'].includes(ws)) for (const b of PC.BUSINESS) { const w = WF.workforceOf(s, b).find(v => v.kind === 'team' && (v.keys || []).includes(ws)); if (w) keys.push(...(w.keys || [w.key])); }
  const list = (s.ledger || []).filter(x => x.ack === 'pending' && keys.includes(x.payee)); if (!list.length) return '';
  return `<section class="panel nc-actions"><h2>Confirm cash you received</h2>${list.map(x => `<div class="ledger-row static"><span><b>${inr(x.amount)} · ${esc(x.note || 'Cash payment')}</b><small>${esc(x.history?.[0]?.at || '')}</small></span><span class="row-actions"><button class="button primary compact" data-lc-ack="${x.id}" data-ok="1">I received it</button><button class="button secondary compact" data-lc-ack="${x.id}" data-ok="">Not received</button></span></div>`).join('')}</section>`;
}

// ---------- petty cash for any branch (uses the same book as stores) ----------
export function pettyAction(s, ws, branchId, v) {
  const sc = PC.scopeOf(s, ws); if (!sc || !['owner', 'manager'].includes(sc.kind)) return 'Not allowed.';
  if (sc.kind === 'manager' && branchId !== sc.branch) return 'Managers handle petty cash only at their branch.';
  const amount = Math.round(Number(v.amount)), book = HR.petty(s, branchId);
  if (v.type === 'topup') { if (sc.kind !== 'owner') return 'Only the owner gives the float.'; if (!(amount > 0)) return 'Enter the amount.'; book.entries.push({type: 'topup', amount, by: 'Owner', at: stamp(), note: 'Float given'}); return ''; }
  if (v.type === 'expense') { if (!(amount > 0) || !String(v.note || '').trim()) return 'Enter amount and what it was for.'; if (!v.receipt) return 'Attach the receipt photo.'; const can = canApprove(s, ws, sc.business, branchId, amount); if (can) return can; if (amount > HR.pettyBalance(s, branchId)) return 'Not enough petty cash. Ask the owner to top up.'; book.entries.push({type: 'expense', amount, note: v.note.trim(), receipt: v.receipt, by: sc.kind, at: stamp()}); return ''; }
  if (v.type === 'count') { const counted = Math.round(Number(v.counted)); if (!(counted >= 0)) return 'Enter the cash counted.'; const diff = counted - HR.pettyBalance(s, branchId); book.entries.push({type: 'count_diff', amount: diff, by: sc.kind, at: stamp(), note: diff ? `Day-end count ${inr(counted)} · ${diff < 0 ? 'short' : 'extra'} ${inr(Math.abs(diff))}` : `Day-end count ${inr(counted)} · matches`}); return ''; }
  return 'Unknown action.';
}

// ---------- payroll register (both engines) ----------
export function register(s, b) {
  if (isStore(b)) return (s.staffLedger || []).filter(x => x.store === b && ['payment', 'advance_paid'].includes(x.type)).map(x => ({at: x.at, who: (s.pickerStaff || []).concat(s.storeManagers || []).find(p => p.id === x.personId)?.name, type: x.type === 'advance_paid' ? 'Advance' : 'Pay', amount: x.amount, method: x.method, status: x.status}));
  return (s.ledger || []).filter(x => x.owner === b && ['salary', 'advance'].includes(x.type) && /^staff:|^(commercialDriver|helper|personalDriver)$/.test(String(x.payee))).map(x => ({at: x.history?.[0]?.at || '', who: x.note || x.payee, type: x.type === 'advance' ? 'Advance' : 'Pay', amount: x.amount, method: x.method, status: x.ack === 'pending' ? 'waiting for staff confirmation' : x.ack === 'not_received' ? 'reported not received' : x.status}));
}

// ---------- screen ----------
export function screen(s, route, ws) {
  if (route !== 'payLedgers') return ''; const sc = PC.scopeOf(s, ws); if (!sc || !['owner', 'manager'].includes(sc.kind)) return '';
  PC.ensureCore(s); const b = sc.business, tab = s.lcTab || 'balances', rs = rows(s, ws), brs = PC.branchesFor(s, b).filter(x => sc.kind === 'owner' || x.id === sc.branch), inb = inbox(s, ws), pol = policy(s, b);
  const sel = rs.find(r => r.e.id === s.lcPerson);
  const tabs = [['balances', 'Staff balances'], ['approvals', `Approvals (${inb.length})`], ['petty', 'Petty cash'], ['register', 'Payroll register'], ['policy', 'Approval limits']];
  return `${head('Pay & ledgers', `${PC.bizName(s, b)}${sc.kind === 'manager' ? ` · ${PC.branchesFor(s, b).find(x => x.id === sc.branch)?.name || ''} only` : ''} · one ledger for everyone: earnings, allowances, reimbursements, advances, deductions and payments`, isStore(b) ? '<button class="button secondary" data-route="storeHR">Payroll & attendance</button>' : '<button class="button secondary" data-route="payroll">Payroll</button>')}
  <div class="people-tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-lc-tab="${k}">${l}</button>`).join('')}</div>
  ${tab === 'balances' ? `<section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Person</th><th>Home branch · teams</th><th>Balance due</th><th>Advance left</th><th></th></tr></thead><tbody>${rs.map(r => `<tr><td><b>${esc(r.p.name)}</b><small class="block muted">${esc(r.e.designation || r.e.role)} · ${esc(PC.EMP_TYPES[r.e.type] || r.e.type)}</small></td><td>${esc(PC.branchesFor(s, b).find(x => x.id === r.e.homeBranch)?.name || '—')}<small class="block muted">${esc(r.teams.join(', ') || 'no team')}</small></td><td><b>${inr(r.balance)}</b></td><td>${inr(r.advance)}</td><td><button class="button text compact" data-lc-person="${r.e.id}">Ledger</button></td></tr>`).join('') || '<tr><td colspan="5">No active staff.</td></tr>'}</tbody></table></div></section>
  ${sel ? `<section class="panel"><div class="panel-header"><div><h2>${esc(sel.p.name)} · balance ${inr(sel.balance)}</h2><p>Advance left ${inr(sel.advance)}</p></div><button class="button text compact" data-lc-person="">Close</button></div>${entries(s, sel).slice(-12).reverse().map(x => `<div class="ledger-row static"><span><b>${esc(x.note || TYPES[x.type])}</b><small>${esc(x.at || '')} · ${esc(TYPES[x.type] || x.type)}${x.method ? ` · ${esc(x.method)}` : ''}</small></span><span class="amount ${['deduction', 'payment', 'advance', 'recovery'].includes(x.type) ? 'out' : 'in'}">${['deduction', 'payment', 'advance', 'recovery'].includes(x.type) ? '−' : '+'}${inr(x.amount)}</span>${x.status && !['posted', 'paid', 'confirmed'].includes(x.status) ? pill(x.status) : ''}</div>`).join('') || '<p class="muted">No entries yet.</p>'}${sc.kind === 'owner' && sel.balance > 0 ? `<form class="inline-form" data-lc-form="cash" data-id="${sel.e.id}"><input name="amount" type="number" value="${sel.balance}"><button class="button primary compact">Pay in cash (staff confirms)</button></form>` : ''}</section>` : ''}` : ''}
  ${tab === 'approvals' ? `<section class="panel"><p class="muted">Who approves: up to ${inr(pol.lead)} team lead · up to ${inr(pol.manager)} branch manager · above that the owner. Disputes and advances: owner.</p>${inb.map(x => `<div class="ledger-row static"><span><b>${esc(x.text)}${x.amount ? ` · ${inr(x.amount)}` : ''}</b><small>${esc(x.kind === 'cover' ? 'Branch cover' : ({lead: 'Team lead', manager: 'Branch manager', owner: 'Owner'})[x.level] + ' approves')}${x.can ? ` · ${esc(x.can)}` : ''}</small></span>${x.can ? '' : `<span class="row-actions"><button class="button primary compact" data-lc-decide="${x.kind}|${x.id}" data-ok="1">Approve</button><button class="button secondary compact" data-lc-decide="${x.kind}|${x.id}" data-ok="">${x.kind.endsWith('dispute') ? 'Waive' : 'Reject'}</button></span>`}</div>`).join('') || '<p class="muted">Nothing waiting.</p>'}</section>` : ''}
  ${tab === 'petty' ? brs.map(br => { const book = HR.petty(s, br.id); return `<section class="panel"><h2>${esc(br.name)} · petty cash ${inr(HR.pettyBalance(s, br.id))}</h2>${book.entries.slice(-6).reverse().map(e => `<div class="ledger-row static"><span><b>${esc(e.note)}</b><small>${esc(e.at)} · ${esc(e.by)}${e.receipt ? ` · receipt ${esc(e.receipt)}` : ''}</small></span><span class="amount">${e.type === 'expense' || e.amount < 0 ? '−' : '+'}${inr(Math.abs(e.amount))}</span></div>`).join('') || '<p class="muted">No entries.</p>'}<div class="row-actions">${sc.kind === 'owner' ? `<form class="inline-form" data-lc-form="petty" data-branch="${br.id}" data-type="topup"><input name="amount" type="number" placeholder="Float ₹"><button class="button secondary compact">Give float</button></form>` : ''}<form class="inline-form" data-lc-form="petty" data-branch="${br.id}" data-type="expense"><input name="amount" type="number" placeholder="₹"><input name="note" placeholder="Tea / tape / labour"><input name="receipt" type="file" accept="image/*"><button class="button secondary compact">Record expense</button></form><form class="inline-form" data-lc-form="petty" data-branch="${br.id}" data-type="count"><input name="counted" type="number" placeholder="Counted ₹"><button class="button secondary compact">Day-end count</button></form></div></section>`; }).join('') : ''}
  ${tab === 'register' ? `<section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>When</th><th>Who</th><th>Type</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>${register(s, b).slice(-30).reverse().map(x => `<tr><td>${esc(x.at)}</td><td>${esc(x.who || '')}</td><td>${esc(x.type)}</td><td>${inr(x.amount)}</td><td>${esc(x.method || '')}</td><td>${esc(String(x.status || '').replace(/_/g, ' '))}</td></tr>`).join('') || '<tr><td colspan="6">No payments yet.</td></tr>'}</tbody></table></div></section>` : ''}
  ${tab === 'policy' ? `<section class="panel"><h2>Approval limits</h2>${sc.kind === 'owner' ? `<form class="inline-form" data-lc-form="policy"><label>Team lead up to ₹ <input name="lead" type="number" value="${pol.lead}"></label><label>Branch manager up to ₹ <input name="manager" type="number" value="${pol.manager}"></label><button class="button primary compact">Save</button></form>` : `<p>Team lead up to ${inr(pol.lead)} · branch manager up to ${inr(pol.manager)} · above that the owner.</p>`}<p class="muted">Applies to reimbursements, trip receipts and petty-cash expenses in every branch. Branches without a manager go to the owner.</p></section>` : ''}<p class="lc-error field-error" hidden></p>`;
}
export function bind(root, api) {
  const S = () => api.getState(), ws = () => S().currentWorkspace, err = m => { const e = root.querySelector('.lc-error'); if (e) { e.textContent = m; e.hidden = !m; } else api.toast(m); };
  const done = (e, ok) => { if (e) return err(e); api.save(); api.render(); if (ok) api.toast(ok); };
  root.querySelectorAll('[data-lc-tab]').forEach(b => b.onclick = () => { S().lcTab = b.dataset.lcTab; done(''); });
  root.querySelectorAll('[data-lc-person]').forEach(b => b.onclick = () => { S().lcPerson = b.dataset.lcPerson || null; done(''); });
  root.querySelectorAll('[data-lc-decide]').forEach(b => b.onclick = () => { const [kind, id] = b.dataset.lcDecide.split('|'), item = inbox(S(), ws()).find(x => x.kind === kind && x.id === id); if (!item) return; if(kind==='store_advance'&&b.dataset.ok){S().hrTab='ledgers';api.save();api.navigate('storeHR');return;} done(decide(S(), ws(), item, Boolean(b.dataset.ok)), b.dataset.ok ? 'Approved' : 'Done'); });
  root.querySelectorAll('[data-lc-ack]').forEach(b => b.onclick = () => { const x = S().ledger.find(y => y.id === b.dataset.lcAck); if (x) { x.ack = b.dataset.ok ? 'confirmed' : 'not_received'; (x.history ||= []).push({action: x.ack, at: stamp()}); } done('', b.dataset.ok ? 'Thanks — confirmed' : 'Reported as not received'); });
  root.querySelectorAll('form[data-lc-form]').forEach(f => f.onsubmit = e => { e.preventDefault(); const s = S(), fd = new FormData(f), v = Object.fromEntries(fd), k = f.dataset.lcForm;
    if (k === 'cash') { const r = rows(s, ws()).find(x => x.e.id === f.dataset.id); return done(payCash(s, ws(), r, v.amount), 'Cash payment recorded — waiting for staff confirmation'); }
    if (k === 'petty') return done(pettyAction(s, ws(), f.dataset.branch, {...v, type: f.dataset.type, receipt: fd.get('receipt')?.name}), 'Petty cash updated');
    if (k === 'policy') { const p = policy(s, PC.scopeOf(s, ws()).business), lead = Number(v.lead), mgr = Number(v.manager); if (!(lead >= 0) || !(mgr >= lead)) return err('The manager limit must be at least the team-lead limit.'); p.lead = lead; p.manager = mgr; return done('', 'Approval limits saved'); }
  });
}
