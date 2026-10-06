// Unified payroll engine — step 1 of replacing four disconnected pay systems (store-hr.js's ledger,
// grocery-picker-pay.js's shift pay-runs, grocery-manager-pay.js's manager pay-runs, workforce.js's
// accruals/khata) with one shared ledger and one balance calculation, for every pay type and every
// vertical. Built the same non-destructive way as people-core.js: migrates and reads existing records
// without deleting them, so nothing already relying on the old systems breaks.
//
// SCOPE: covers everyone with a real employment record (anyone ensureCore() already models — logistics
// staff, retail pickers/packers/cashiers/managers). Trip-based independent/platform crew in logistics
// (workforce.js's 'per_trip'/'partner' engagement, keyed by a candidate persona rather than a real
// employment record) are NOT covered here — there's no shared identity bridge for them yet, and
// building one is a separate, large task of its own. Their pay stays on the existing trip-settlement
// system for now; this is a deliberate boundary, not an oversight.
import {esc, inr} from './ops.js';
import * as PC from './people-core.js';

const SIGN = {earning: 1, allowance: 1, reimbursement: 1, deduction: -1, payment: -1, advance_recovery: -1, cash_return: 1};
const uid = p => `${p}-${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const stamp = () => new Date().toLocaleString('en-IN');

function events(s) { return (s.payEvents ||= []); }
function advances(s) { return (s.payAdvances ||= []); }

// Finds whether this person's payout is actually verified, by checking their real employment source
// record — reuses the exact same lookup people-core.js's reusableIdentity() already built, so there is
// one answer to "is this person's bank/UPI verified", not a different check per screen.
function payoutVerified(s, personId) {
  const emp = s.employments?.find(e => e.personId === personId && e.status === 'active');
  if (!emp) return false;
  const rec = emp.source.kind === 'people' ? (s.peopleByWorkspace?.[emp.business] || []).find(x => x.id === emp.source.id)
    : emp.source.kind === 'picker' ? (s.pickerStaff || []).find(x => x.id === emp.source.id)
    : emp.source.kind === 'manager' ? (s.storeManagers || []).find(x => x.id === emp.source.id)
    : emp.source.kind === 'delivery' ? Object.values(s.deliveryPartners || {}).find(x => x.id === emp.source.id)
    : null;
  if (rec?.bank?.accountNumber) return ['verified', 'complete'].includes(rec.bankStatus);
  // Legacy retail records kept their own verified flag separately (store-hr.js's staffHR.payout) —
  // fall back to it only when the employment's own record has nothing newer to say.
  return !!s.staffHR?.[emp.source.id]?.payout?.verified;
}

function personName(s, personId) { return s.persons?.[personId]?.name || 'This person'; }

// ---------- one-time, non-destructive migration from the four old systems ----------
export function ensurePayrollCore(s) {
  PC.ensureCore(s); events(s); advances(s);
  const seen = new Set(events(s).map(e => e.migratedFrom ? `${e.migratedFrom.system}:${e.migratedFrom.id}` : null).filter(Boolean));
  const add = (personId, business, type, amount, status, at, note, source, migratedFrom) => {
    if (migratedFrom && seen.has(`${migratedFrom.system}:${migratedFrom.id}`)) return;
    if (migratedFrom) seen.add(`${migratedFrom.system}:${migratedFrom.id}`);
    events(s).push({id: uid('PE'), personId, business, type, amount, status, at: at || stamp(), note, source, migratedFrom});
  };
  const personFor = (kind, id) => s.employments?.find(e => e.source.kind === kind && e.source.id === id)?.personId;

  // Source 1: store-hr.js's ledger (already has personId directly on each entry)
  for (const e of s.ledger || []) {
    if (!e.personId || !(e.type in SIGN)) continue;
    const emp = s.employments?.find(x => x.personId === e.personId);
    if (!emp) continue; // not a real staff employment (e.g. a customer/business-level ledger entry)
    add(e.personId, emp.business, e.type === 'payment' ? 'payment' : e.type, SIGN[e.type] * Math.abs(e.amount), e.status === 'disputed' ? 'disputed' : 'posted', e.at, e.note, 'monthly', {system: 'store-hr', id: e.id});
  }
  // Source 2: workforce.js's accruals (amount is already signed; workerKey needs resolving to a person)
  for (const a of s.accruals || []) {
    const emp = s.employments?.find(e => e.source.kind === 'people' && (s.peopleByWorkspace?.[e.business] || []).some(r => (r.workerKey || r.id) === a.workerKey) && e.business === a.workspace);
    if (!emp) continue; // independent/per-trip crew — out of scope, see file header
    add(emp.personId, a.workspace, a.amount >= 0 ? (a.type === 'reimbursement' ? 'reimbursement' : 'earning') : 'deduction', a.amount, a.status === 'disputed' ? 'disputed' : a.status === 'waived' ? 'waived' : 'posted', a.at, a.note, 'monthly', {system: 'workforce-accrual', id: a.id});
  }
  // Source 3: grocery-picker-pay.js's pay runs (only ones actually paid become history; drafts are
  // left alone — they're still "in flight" on the old screen until this is fully cut over)
  for (const r of s.pickerPayRuns || []) {
    if (r.status !== 'paid') continue;
    const personId = personFor('picker', r.pickerId); if (!personId) continue;
    add(personId, r.store, 'earning', Math.abs(r.amount), 'posted', r.paidAt ? new Date(r.paidAt).toLocaleString('en-IN') : stamp(), `${r.period} shift pay (${r.shiftIds?.length || 0} shift(s))`, 'shift', {system: 'picker-pay-run', id: r.id});
  }
  // Source 4: grocery-manager-pay.js's pay runs (same "paid only" rule)
  for (const r of s.managerPayRuns || []) {
    if (r.status !== 'paid') continue;
    const personId = personFor('manager', r.managerId); if (!personId) continue;
    add(personId, r.store, 'earning', Math.abs(r.amount), 'posted', r.paidAt ? new Date(r.paidAt).toLocaleString('en-IN') : stamp(), `${r.period} manager pay`, 'monthly', {system: 'manager-pay-run', id: r.id});
  }
  // Advances: store-hr.js's s.staffAdvances already has the right shape (declining balance +
  // instalment plan) — reused as-is rather than flattened, since it models a loan correctly and
  // flattening it into simple ledger entries would lose the "how much is still outstanding" concept.
  for (const a of s.staffAdvances || []) {
    if (!advances(s).some(x => x.migratedFrom?.id === a.id)) advances(s).push({...a, migratedFrom: {system: 'store-hr-advance', id: a.id}});
  }
  return s;
}

// ---------- unified balance + history ----------
export function balance(s, personId) {
  const ledgerTotal = events(s).filter(e => e.personId === personId && !['disputed', 'waived'].includes(e.status)).reduce((sum, e) => sum + e.amount, 0);
  const advanceOutstanding = advances(s).filter(a => a.personId === personId && a.status === 'active').reduce((sum, a) => sum + a.balance, 0);
  return ledgerTotal - advanceOutstanding;
}
export function history(s, personId) {
  const own = events(s).filter(e => e.personId === personId).map(e => ({...e, kind: 'event'}));
  const adv = advances(s).filter(a => a.personId === personId).map(a => ({id: a.id, at: a.at, amount: -a.amount, type: 'advance', status: a.status, note: `Advance: ${a.reason}`, kind: 'advance'}));
  return [...own, ...adv].sort((x, y) => new Date(y.at) - new Date(x.at));
}

// ---------- unified actions ----------
export function giveAdvance(s, business, personId, v) {
  ensurePayrollCore(s);
  const amount = Math.round(Number(v.amount)), instalment = Math.round(Number(v.instalment));
  if (!(amount > 0) || !(instalment > 0)) return 'Enter the advance amount and the monthly instalment.';
  if (!String(v.reason || '').trim()) return 'Add a reason.';
  const method = v.method || 'cash';
  if (['upi', 'bank'].includes(method) && !payoutVerified(s, personId)) {
    return `${personName(s, personId)} has not added a verified UPI/bank account. Pay in cash or ask them to add it first.`;
  }
  advances(s).push({id: uid('ADV'), personId, business, amount, balance: amount, instalment, reason: v.reason.trim(), method, status: 'active', at: stamp()});
  return '';
}
export function addReimbursement(s, business, personId, v) {
  ensurePayrollCore(s);
  const amount = Math.round(Number(v.amount));
  if (!(amount > 0)) return 'Enter the reimbursement amount.';
  if (!String(v.note || '').trim()) return 'Add what this reimbursement is for.';
  events(s).push({id: uid('PE'), personId, business, type: 'reimbursement', amount, status: 'approved', at: stamp(), note: v.note.trim(), source: 'manual'});
  return '';
}
export function addDeduction(s, business, personId, v) {
  ensurePayrollCore(s);
  const amount = Math.round(Number(v.amount));
  if (!(amount > 0)) return 'Enter the deduction amount.';
  if (!String(v.note || '').trim()) return 'Add a reason for this deduction.';
  events(s).push({id: uid('PE'), personId, business, type: 'deduction', amount: -amount, status: 'posted', at: stamp(), note: v.note.trim(), source: 'manual'});
  return '';
}
export function disputeDeduction(s, eventId, reason) {
  const e = events(s).find(x => x.id === eventId && x.type === 'deduction');
  if (!e) return 'Only a deduction can be disputed.';
  if (!String(reason || '').trim()) return 'Say why you disagree.';
  e.status = 'disputed'; e.disputeReason = reason.trim();
  return '';
}
export function payNow(s, business, personId, amount, method, reference) {
  ensurePayrollCore(s);
  const amt = Math.round(Number(amount));
  if (!(amt > 0)) return 'Enter a valid amount to pay.';
  if (['upi', 'bank'].includes(method) && !payoutVerified(s, personId)) {
    return `${personName(s, personId)} has not added a verified UPI/bank account. Pay in cash or ask them to add it first.`;
  }
  if (['upi', 'bank', 'cash', 'card_transfer'].includes(method) && method !== 'cash' && !String(reference || '').trim()) {
    return 'Enter the payment reference or a signed receipt note.';
  }
  events(s).push({id: uid('PE'), personId, business, type: 'payment', amount: -amt, status: 'posted', at: stamp(), note: `Paid via ${method}${reference ? ` · ${reference}` : ''}`, source: 'manual', method, reference});
  return '';
}

// ---------- the one screen ----------
export function payPersonScreen(s, personId, business) {
  ensurePayrollCore(s);
  const bal = balance(s, personId);
  const name = personName(s, personId);
  const h = history(s, personId).slice(0, 25);
  const verified = payoutVerified(s, personId);
  const owedLine = bal > 0 ? `<b class="amount in">You owe ${esc(name)} ${inr(bal)}</b>` : bal < 0 ? `<b class="amount out">${esc(name)} owes you ${inr(Math.abs(bal))}</b>` : `<b>Settled up with ${esc(name)}</b>`;
  const activeAdvances = advances(s).filter(a => a.personId === personId && a.status === 'active');
  return `<section class="panel">
    <h2>${esc(name)} · Pay</h2>
    <div class="info-banner">${owedLine}<span>${verified ? 'UPI/bank verified — can be paid directly from here.' : 'No verified UPI/bank yet — pay in cash, or ask them to add one.'}</span></div>
    ${activeAdvances.length ? `<p><b>Outstanding advance(s):</b> ${activeAdvances.map(a => `${inr(a.balance)} of ${inr(a.amount)} (${esc(a.reason)})`).join(', ')}</p>` : ''}
    <div class="form-actions">
      <button class="button primary compact" data-payroll-action="pay-now" data-person="${esc(personId)}" data-business="${esc(business)}">Pay now</button>
      <button class="button secondary compact" data-payroll-action="give-advance" data-person="${esc(personId)}" data-business="${esc(business)}">Give advance</button>
      <button class="button secondary compact" data-payroll-action="add-reimbursement" data-person="${esc(personId)}" data-business="${esc(business)}">Add reimbursement</button>
      <button class="button secondary compact" data-payroll-action="add-deduction" data-person="${esc(personId)}" data-business="${esc(business)}">Add deduction</button>
    </div>
    <h3>History</h3>
    <div class="review-checklist">${h.length ? h.map(e => `<div class="market-row"><span><b>${esc(e.note || e.type)}</b><small class="block muted">${esc(e.at)} · ${esc(e.type)}${e.status === 'disputed' ? ' · disputed' : ''}</small></span><b class="${e.amount >= 0 ? 'amount in' : 'amount out'}">${e.amount >= 0 ? '+' : '−'}${inr(Math.abs(e.amount))}</b></div>`).join('') : '<p class="muted">No pay history yet.</p>'}</div>
  </section>`;
}
