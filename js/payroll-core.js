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
import {gateway} from './pay.js';

const SIGN = {earning: 1, allowance: 1, reimbursement: 1, deduction: -1, payment: -1, advance_recovery: -1, cash_return: 1};
const uid = p => `${p}-${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const stamp = () => new Date().toLocaleString('en-IN');

function events(s) { return (s.payEvents ||= []); }
function advances(s) { return (s.payAdvances ||= []); }
// Bumped on every write so a polling screen can cheaply ask "did anything change" before re-rendering,
// without comparing the whole ledger every few seconds. Not persisted/synced across devices — this is
// a single shared browser state in this prototype; see payPersonScreen's note on what that does and
// doesn't mean once a real backend exists.
function touch(s) { s.payVersion = (s.payVersion || 0) + 1; }

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
  // store-hr.js's post()/payOut() always write personId as the raw picker/manager id (e.g. 'PICK-1'),
  // never the shared cross-business personId — a real bug found while tracing a picker's own advance
  // request: comparing against employments[].personId (the shared id) could never match, so every
  // store-hr-originated payment or earning was silently invisible to the unified balance, regardless
  // of how many times this migration re-ran. Fixed by resolving through business + raw id instead.
  // 'advance_paid' is deliberately excluded (not just absent from SIGN by coincidence) — the advance's
  // own declining balance (migrated separately, below) already accounts for that reduction; adding it
  // again here would double-count the same money leaving.
  // Was reading s.ledger — a real, pre-existing array, but the wrong one. pay.js uses s.ledger for
  // marketplace payments (customer payments, refunds, settlements); store-hr.js's own post()/balance()/
  // advanceLeft() all read and write s.staffLedger specifically. This migration found "0 entries" in
  // every test because it was checking an empty shelf, not because there was nothing to migrate — a
  // real bug, not a quiet edge case, caught only by tracing the actual array name store-hr.js uses.
  for (const e of s.staffLedger || []) {
    if (!e.personId || !e.store || !(e.type in SIGN)) continue;
    const emp = s.employments?.find(x => x.business === e.store && ['picker', 'manager'].includes(x.source.kind) && x.source.id === e.personId);
    if (!emp) continue; // not a real staff employment (e.g. a customer/business-level ledger entry)
    add(emp.personId, emp.business, e.type === 'payment' ? 'payment' : e.type, SIGN[e.type] * Math.abs(e.amount), e.status === 'disputed' ? 'disputed' : 'posted', e.at, e.note, 'monthly', {system: 'store-hr', id: e.id});
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
  // Logistics' own salary-advance convention — a single m.loan object per worker on their
  // peopleByWorkspace record (not an array, no id of its own, no method field — the recovery itself
  // stays inside workforce.js's own payroll, this migration only mirrors it for display/balance
  // purposes). Found to be a completely separate, unreconciled silo: a logistics owner giving an
  // advance via easy-mode created this and nothing else ever saw it. Synced the same way as
  // staffAdvances — a stable synthetic id so repeated passes update the same record rather than
  // creating duplicates, and the balance is kept current as workforce.js's own recovery reduces it.
  for (const business of Object.keys(s.peopleByWorkspace || {})) {
    for (const m of s.peopleByWorkspace[business] || []) {
      if (!m.loan) continue;
      const loanId = `LOAN-${business}-${m.id}`;
      const existing = advances(s).find(x => x.migratedFrom?.id === loanId);
      if (existing) { existing.balance = m.loan.balance; existing.status = m.loan.balance > 0 ? 'active' : 'repaid'; continue; }
      const emp = s.employments.find(e => e.business === business && e.source.kind === 'people' && e.source.id === m.id);
      if (!emp) continue;
      advances(s).push({id: uid('ADV'), personId: emp.personId, business, amount: m.loan.total, balance: m.loan.balance, instalment: m.loan.installment, reason: m.loan.reason, method: 'cash', status: m.loan.balance > 0 ? 'active' : 'repaid', at: m.loan.givenAt || stamp(), migratedFrom: {system: 'workforce-loan', id: loanId}});
    }
  }
  // Advances: store-hr.js's s.staffAdvances already has the right shape (declining balance +
  // instalment plan) — reused as-is rather than flattened, since it models a loan correctly and
  // flattening it into simple ledger entries would lose the "how much is still outstanding" concept.
  // store-hr.js's own advances are keyed by the raw picker/manager id (a.personId is literally the
  // staffId, not a shared personId) — a real bug found while tracing this: without resolving it
  // through the matching employment, Payroll.balance() would never find this advance for the correct
  // person, no matter how many times migration re-runs. Advances whose employment can't be found
  // (e.g. the person was later removed) are skipped rather than migrated with a broken reference.
  // Advances are mutable at the source (pending_approval -> active as the owner approves, balance
  // declines as instalments are recovered) — a one-time copy-and-forget would leave the migrated
  // record permanently stale the moment the source changes after its first migration, exactly what
  // happened here: an advance migrated while still pending_approval never picked up becoming active.
  // Existing migrated copies are updated in place on every pass instead of being skipped outright.
  for (const a of s.staffAdvances || []) {
    const existing = advances(s).find(x => x.migratedFrom?.id === a.id);
    if (existing) { existing.status = a.status; existing.balance = a.balance; existing.approvedBy = a.approvedBy; continue; }
    const emp = s.employments.find(e => e.business === a.store && ['picker', 'manager'].includes(e.source.kind) && e.source.id === a.personId);
    if (!emp) continue;
    advances(s).push({...a, personId: emp.personId, migratedFrom: {system: 'store-hr-advance', id: a.id}});
  }
  return s;
}

// ---------- unified balance + history ----------
// Separated out from balance() so callers that specifically need "how much advance is still
// outstanding" (not the net balance) have a real primitive to call, instead of each reimplementing
// the same filter over advances() themselves.
export function advanceOutstanding(s, personId) {
  return advances(s).filter(a => a.personId === personId && a.status === 'active').reduce((sum, a) => sum + a.balance, 0);
}
export function balance(s, personId) {
  // A pending_confirmation UPI payment deliberately does NOT reduce the counted balance yet — until
  // someone actually confirms the money moved, treating it as settled would be an assumption, not a
  // fact, and could show "settled up" to a worker who was never actually paid.
  const ledgerTotal = events(s).filter(e => e.personId === personId && !['disputed', 'waived', 'pending_confirmation', 'cancelled'].includes(e.status)).reduce((sum, e) => sum + e.amount, 0);
  return ledgerTotal - advanceOutstanding(s, personId);
}
export function history(s, personId) {
  const own = events(s).filter(e => e.personId === personId).map(e => ({...e, kind: 'event'}));
  const adv = advances(s).filter(a => a.personId === personId).map(a => ({id: a.id, at: a.at, amount: -a.amount, type: 'advance', status: a.status, note: `Advance: ${a.reason}`, kind: 'advance', method: a.method, ownerConfirmed: a.ownerConfirmed, workerConfirmed: a.workerConfirmed}));
  return [...own, ...adv].sort((x, y) => new Date(y.at) - new Date(x.at));
}

// ---------- unified actions ----------
// Returns a plain error string on failure; {ok:true, advanceId, upiLink?} on success. Matches payNow()'s
// treatment exactly — an advance given via UPI is just as real a payment as any other, and had no
// business being treated as instantly "done" when payNow() already wasn't. Bank goes through the real
// gateway (resolves immediately, like payNow); UPI gets a real deep link and sits pending until
// confirmed; cash needs the worker's own acknowledgment, the same existing pattern salary cash
// payments already use, rather than being marked given the moment the owner clicks a button.
export function giveAdvance(s, business, personId, v) {
  ensurePayrollCore(s);
  const amount = Math.round(Number(v.amount)), instalment = Math.round(Number(v.instalment));
  if (!(amount > 0) || !(instalment > 0)) return 'Enter the advance amount and the monthly instalment.';
  if (!String(v.reason || '').trim()) return 'Add a reason.';
  const method = v.method || 'cash';
  if (['upi', 'bank'].includes(method) && !payoutVerified(s, personId)) {
    return `${personName(s, personId)} has not added a verified UPI/bank account. Pay in cash or ask them to add it first.`;
  }
  const base = {id: uid('ADV'), personId, business, amount, balance: amount, instalment, reason: v.reason.trim(), method, at: stamp()};
  if (method === 'bank') {
    const bank = resolveBankRecord(s, personId);
    if (!bank?.accountNumber) return `${personName(s, personId)} does not have a bank account on file. Give it via UPI or cash instead.`;
    const g = gateway.payout({accountNumber: bank.accountNumber}, amount);
    if (!g.ok) return g.reason;
    advances(s).push({...base, status: 'active', reference: g.ref});
    touch(s);
    return '';
  }
  if (method === 'upi') {
    const bank = resolveBankRecord(s, personId);
    if (!bank?.upi) return `${personName(s, personId)} has a verified bank account but no UPI ID on file. Give it via bank transfer or cash instead.`;
    advances(s).push({...base, status: 'pending_handoff', ownerConfirmed: null, workerConfirmed: null});
    touch(s);
    const upiLink = `upi://pay?pa=${encodeURIComponent(bank.upi)}&pn=${encodeURIComponent(personName(s, personId))}&am=${amount}&tn=${encodeURIComponent('Salary advance')}&cu=INR`;
    return {ok: true, advanceId: base.id, upiLink};
  }
  // cash: not counted until the worker acknowledges actually receiving it in hand
  advances(s).push({...base, status: 'pending_ack'});
  touch(s);
  return '';
}

// side is 'owner' or 'worker' — same two-sided, recompute-fresh-every-time logic as confirmPayment(),
// for the UPI advance handoff specifically.
function recomputeAdvanceUpiStatus(a) {
  if (a.ownerConfirmed === false || a.workerConfirmed === false) {
    return (a.ownerConfirmed === true || a.workerConfirmed === true) ? 'disputed' : 'cancelled';
  }
  if (a.ownerConfirmed === true || a.workerConfirmed === true) return 'active';
  return 'pending_handoff';
}
export function confirmAdvanceUpi(s, advanceId, side, confirmed) {
  ensurePayrollCore(s);
  const a = advances(s).find(x => x.id === advanceId && x.method === 'upi' && ['pending_handoff', 'active'].includes(x.status));
  if (!a) return 'Nothing to confirm for this advance — it may already be disputed and needs manual review.';
  if (!['owner', 'worker'].includes(side)) return 'Invalid confirmation side.';
  a[side === 'owner' ? 'ownerConfirmed' : 'workerConfirmed'] = !!confirmed;
  a.status = recomputeAdvanceUpiStatus(a);
  touch(s);
  return '';
}

// Single-sided — the worker is the only one who knows whether cash physically changed hands, same as
// the existing salary-cash acknowledgment pattern this reuses the spirit of.
export function confirmAdvanceCash(s, advanceId, received) {
  ensurePayrollCore(s);
  const a = advances(s).find(x => x.id === advanceId && x.method === 'cash' && x.status === 'pending_ack');
  if (!a) return 'Nothing pending to confirm for this advance.';
  a.status = received ? 'active' : 'cancelled';
  touch(s);
  return '';
}
export function addReimbursement(s, business, personId, v) {
  ensurePayrollCore(s);
  const amount = Math.round(Number(v.amount));
  if (!(amount > 0)) return 'Enter the reimbursement amount.';
  if (!String(v.note || '').trim()) return 'Add what this reimbursement is for.';
  events(s).push({id: uid('PE'), personId, business, type: 'reimbursement', amount, status: 'approved', at: stamp(), note: v.note.trim(), source: 'manual'});
  touch(s);
  return '';
}
export function addDeduction(s, business, personId, v) {
  ensurePayrollCore(s);
  const amount = Math.round(Number(v.amount));
  if (!(amount > 0)) return 'Enter the deduction amount.';
  if (!String(v.note || '').trim()) return 'Add a reason for this deduction.';
  events(s).push({id: uid('PE'), personId, business, type: 'deduction', amount: -amount, status: 'posted', at: stamp(), note: v.note.trim(), source: 'manual'});
  touch(s);
  return '';
}
export function disputeDeduction(s, eventId, reason) {
  const e = events(s).find(x => x.id === eventId && x.type === 'deduction');
  if (!e) return 'Only a deduction can be disputed.';
  if (!String(reason || '').trim()) return 'Say why you disagree.';
  e.status = 'disputed'; e.disputeReason = reason.trim();
  touch(s);
  return '';
}
// Returns a plain error string on failure, or {ok:true, eventId, upiLink?} on success — a UPI payment
// returns a deep link for the caller to act on (redirect on mobile, QR on desktop) instead of marking
// itself paid, since we have no real gateway here to confirm the transfer actually happened.
// Resolves a person's actual bank record from their real employment source — one lookup shared by
// both the UPI and bank branches below, instead of two copies of the same kind-switch drifting apart.
function resolveBankRecord(s, personId) {
  const emp = s.employments?.find(e => e.personId === personId && e.status === 'active');
  if (!emp) return null;
  const rec = emp.source.kind === 'people' ? (s.peopleByWorkspace?.[emp.business] || []).find(x => x.id === emp.source.id)
    : emp.source.kind === 'picker' ? (s.pickerStaff || []).find(x => x.id === emp.source.id)
    : emp.source.kind === 'manager' ? (s.storeManagers || []).find(x => x.id === emp.source.id)
    : emp.source.kind === 'delivery' ? Object.values(s.deliveryPartners || {}).find(x => x.id === emp.source.id)
    : null;
  return rec?.bank || null;
}
export function payNow(s, business, personId, amount, method, reference) {
  ensurePayrollCore(s);
  const amt = Math.round(Number(amount));
  if (!(amt > 0)) return 'Enter a valid amount to pay.';
  if (['upi', 'bank'].includes(method) && !payoutVerified(s, personId)) {
    return `${personName(s, personId)} has not added a verified UPI/bank account. Pay in cash or ask them to add it first.`;
  }
  if (method === 'upi') {
    const bank = resolveBankRecord(s, personId);
    if (!bank?.upi) return `${personName(s, personId)} has a verified bank account but no UPI ID on file. Pay via bank transfer or cash instead.`;
    const id = uid('PE');
    events(s).push({id, personId, business, type: 'payment', amount: -amt, status: 'pending_confirmation', at: stamp(), note: `UPI payment initiated to ${bank.upi}`, source: 'manual', method: 'upi', ownerConfirmed: null, workerConfirmed: null});
    touch(s);
    const upiLink = `upi://pay?pa=${encodeURIComponent(bank.upi)}&pn=${encodeURIComponent(personName(s, personId))}&am=${amt}&tn=${encodeURIComponent('Salary/wage payment')}&cu=INR`;
    return {ok: true, eventId: id, upiLink};
  }
  if (method === 'bank') {
    // Bank transfers DO have a gateway here (unlike UPI), so they resolve immediately — success or
    // failure — the same way a real batch payroll run would confirm back right away. No pending-
    // confirmation step: that mechanism exists specifically for UPI's lack of a gateway, not for this.
    const bank = resolveBankRecord(s, personId);
    if (!bank?.accountNumber) return `${personName(s, personId)} does not have a bank account on file. Pay via UPI or cash instead.`;
    const g = gateway.payout({accountNumber: bank.accountNumber}, amt);
    if (!g.ok) return g.reason;
    events(s).push({id: uid('PE'), personId, business, type: 'payment', amount: -amt, status: 'posted', at: stamp(), note: `Paid via bank transfer · ${g.ref}`, source: 'manual', method: 'bank', reference: g.ref});
    touch(s);
    return '';
  }
  if (method === 'card_transfer' && !String(reference || '').trim()) {
    return 'Enter the payment reference or a signed receipt note.';
  }
  events(s).push({id: uid('PE'), personId, business, type: 'payment', amount: -amt, status: 'posted', at: stamp(), note: `Paid via ${method}${reference ? ` · ${reference}` : ''}`, source: 'manual', method, reference});
  touch(s);
  return '';
}

// side is 'owner' or 'worker'; confirmed is true ('I received it'/'yes, it went through') or false.
// Either side's "yes" alone settles it (no need to wait for both) — but the status is recomputed fresh
// from BOTH recorded answers every time, not finalized irreversibly on the first response. That's what
// lets a genuine mismatch surface: if the owner says yes and the event settles, then the worker later
// says they never received it, the status re-opens into 'disputed' instead of the worker's answer
// having nowhere to go because the event already looked "done." Once disputed, it requires a human to
// resolve it elsewhere (not more automatic confirm calls), same as the existing deduction-dispute flow.
function recomputeUpiStatus(e) {
  if (e.ownerConfirmed === false || e.workerConfirmed === false) {
    return (e.ownerConfirmed === true || e.workerConfirmed === true) ? 'disputed' : 'cancelled';
  }
  if (e.ownerConfirmed === true || e.workerConfirmed === true) return 'posted';
  return 'pending_confirmation';
}
export function confirmPayment(s, eventId, side, confirmed) {
  ensurePayrollCore(s);
  const e = events(s).find(x => x.id === eventId && x.method === 'upi' && ['pending_confirmation', 'posted'].includes(x.status));
  if (!e) return 'Nothing to confirm for this payment — it may already be disputed and needs manual review.';
  if (!['owner', 'worker'].includes(side)) return 'Invalid confirmation side.';
  e[side === 'owner' ? 'ownerConfirmed' : 'workerConfirmed'] = !!confirmed;
  e.status = recomputeUpiStatus(e);
  touch(s);
  return '';
}

// ---------- the one screen ----------
// viewerSide is 'owner' (default) or 'worker' — determines which confirmation button set shows for a
// pending UPI payment and the wording used, since the owner and the worker ask each other opposite
// questions about the same pending event ("did it go through" vs "did you receive it").
// ---------- batch payroll (GIRO-style: one submission, whole team) ----------
// Separate from workforce.js's own s.payrollRuns (logistics' pre-existing monthly payroll) — a
// different name on purpose, to avoid colliding with that already-established field.
function runs(s) { return (s.unifiedPayrollRuns ||= []); }

// Computes a draft, does not pay anyone yet. Idempotent — calling it again for the same business and
// period while a draft already exists returns that same draft rather than creating a duplicate.
export function runMonthlyPayroll(s, business, period) {
  ensurePayrollCore(s);
  const existing = runs(s).find(r => r.business === business && r.period === period && r.status === 'draft');
  if (existing) return existing;
  const emps = s.employments.filter(e => e.business === business && e.status === 'active' && e.payPlan?.type === 'monthly');
  const lines = emps.map(e => ({
    personId: e.personId, name: personName(s, e.personId),
    amount: Math.max(0, balance(s, e.personId)),
    // A batch run can only ever pay via bank transfer — UPI needs a per-person interactive app
    // confirmation (exactly why the two-sided flow exists) and genuinely can't be done unattended in
    // a batch, in this app or in reality. So this checks specifically for a bank account on file, not
    // payoutVerified() generally — someone verified only for UPI would otherwise misleadingly show as
    // "ready" for a batch they can't actually be included in.
    verified: payoutVerified(s, e.personId) && !!resolveBankRecord(s, e.personId)?.accountNumber,
    hold: false,
  }));
  const run = {id: uid('RUN'), business, period, status: 'draft', lines, createdAt: stamp()};
  runs(s).push(run);
  touch(s);
  return run;
}

export function toggleHold(s, runId, personId) {
  const run = runs(s).find(r => r.id === runId && r.status === 'draft');
  if (!run) return 'Payroll run not found, or it has already been finalized.';
  const line = run.lines.find(l => l.personId === personId);
  if (!line) return 'This person is not in this payroll run.';
  line.hold = !line.hold;
  touch(s);
  return '';
}

// One click processes everyone not on hold, through the same payNow() used for individual payments —
// not a separate code path that could drift from it. Anyone without a verified bank account, or with
// nothing due, is skipped with a clear reason rather than silently failing or silently paying nothing.
// People who are held stay in the draft for a later run, not lost.
export function approveMonthlyPayroll(s, runId) {
  const run = runs(s).find(r => r.id === runId && r.status === 'draft');
  if (!run) return {error: 'Payroll run not found, or it has already been finalized.'};
  const results = [];
  for (const line of run.lines) {
    if (line.hold) { results.push({personId: line.personId, name: line.name, outcome: 'held'}); continue; }
    if (!(line.amount > 0)) { results.push({personId: line.personId, name: line.name, outcome: 'skipped', reason: 'Nothing due'}); continue; }
    const r = payNow(s, run.business, line.personId, line.amount, 'bank', '');
    if (r === '') results.push({personId: line.personId, name: line.name, outcome: 'paid', amount: line.amount});
    else results.push({personId: line.personId, name: line.name, outcome: 'failed', reason: r});
  }
  run.status = 'completed';
  run.completedAt = stamp();
  run.results = results;
  touch(s);
  return {ok: true, results};
}

export function monthlyPayrollScreen(s, business, period) {
  ensurePayrollCore(s);
  const run = runs(s).find(r => r.business === business && r.period === period) || runMonthlyPayroll(s, business, period);
  const isDraft = run.status === 'draft';
  const totalDue = run.lines.filter(l => !l.hold).reduce((sum, l) => sum + l.amount, 0);
  const rows = isDraft ? run.lines.map(l => `<div class="ledger-row static"><span><b>${esc(l.name)}</b><small>${l.verified?'Bank verified':'⚠ No verified bank account — will be skipped'}${l.hold?' · on hold':''}</small></span><span class="row-actions"><b>${inr(l.amount)}</b><button type="button" class="button secondary compact" data-payroll-hold="${esc(run.id)}" data-person="${esc(l.personId)}">${l.hold?'Resume':'Hold'}</button></span></div>`).join('')
    : (run.results||[]).map(r => `<div class="ledger-row static"><span><b>${esc(r.name)}</b><small>${r.outcome==='paid'?`Paid ${inr(r.amount)}`:r.outcome==='held'?'Held — not processed this run':r.outcome==='skipped'?esc(r.reason):`Failed — ${esc(r.reason)}`}</small></span></div>`).join('');
  return `<section class="panel"><h2>Monthly payroll · ${esc(period)}</h2><p class="muted">${isDraft?`Review before approving — ${inr(totalDue)} total across ${run.lines.filter(l=>!l.hold).length} ${run.lines.filter(l=>!l.hold).length===1?'person':'people'} not on hold.`:`Completed ${esc(run.completedAt)}.`}</p>
  ${rows || '<p class="muted">No one with a monthly pay plan found for this business.</p>'}
  ${isDraft && run.lines.length ? `<button class="button primary full" data-payroll-approve-run="${esc(run.id)}">Approve and pay all (not on hold)</button>` : ''}
  </section>`;
}

export function payPersonScreen(s, personId, business, viewerSide = 'owner') {
  ensurePayrollCore(s);
  const bal = balance(s, personId);
  const name = personName(s, personId);
  const h = history(s, personId).slice(0, 25);
  const verified = payoutVerified(s, personId);
  const owedLine = bal > 0 ? `<b class="amount in">You owe ${esc(name)} ${inr(bal)}</b>` : bal < 0 ? `<b class="amount out">${esc(name)} owes you ${inr(Math.abs(bal))}</b>` : `<b>Settled up with ${esc(name)}</b>`;
  const activeAdvances = advances(s).filter(a => a.personId === personId && a.status === 'active');
  const pendingUpi = events(s).filter(e => e.personId === personId && e.method === 'upi' && ['pending_confirmation', 'posted'].includes(e.status) && (viewerSide === 'owner' ? e.ownerConfirmed === null : e.workerConfirmed === null));
  const pendingUpiAdvances = advances(s).filter(a => a.personId === personId && a.method === 'upi' && ['pending_handoff', 'active'].includes(a.status) && (viewerSide === 'owner' ? a.ownerConfirmed === null : a.workerConfirmed === null));
  const pendingCashAdvances = viewerSide === 'worker' ? advances(s).filter(a => a.personId === personId && a.method === 'cash' && a.status === 'pending_ack') : [];
  return `<section class="panel">
    <h2>${esc(name)} · Pay</h2>
    <div class="info-banner">${owedLine}<span>${verified ? 'UPI/bank verified — can be paid directly from here.' : 'No verified UPI/bank yet — pay in cash, or ask them to add one.'}</span></div>
    ${activeAdvances.length ? `<p><b>Outstanding advance(s):</b> ${activeAdvances.map(a => `${inr(a.balance)} of ${inr(a.amount)} (${esc(a.reason)})`).join(', ')}</p>` : ''}
    ${pendingUpi.length ? `<section class="panel nc-actions"><h2>Confirm UPI payment${pendingUpi.length>1?'s':''}</h2>${pendingUpi.map(e => `<div class="ledger-row static"><span><b>${inr(Math.abs(e.amount))}</b><small>${esc(e.at)} · ${viewerSide==='owner'?'Did this go through?':'Did you receive this?'}</small></span><span class="row-actions"><button class="button primary compact" data-payroll-confirm="${esc(e.id)}" data-side="${viewerSide}" data-ok="1">${viewerSide==='owner'?'Yes, paid':'Yes, received'}</button><button class="button secondary compact" data-payroll-confirm="${esc(e.id)}" data-side="${viewerSide}" data-ok="">${viewerSide==='owner'?'No, failed':'Not received'}</button></span></div>`).join('')}</section>` : ''}
    ${pendingUpiAdvances.length ? `<section class="panel nc-actions"><h2>Confirm advance (UPI)</h2>${pendingUpiAdvances.map(a => `<div class="ledger-row static"><span><b>${inr(a.amount)}</b><small>${esc(a.reason)} · ${viewerSide==='owner'?'Did this go through?':'Did you receive this?'}</small></span><span class="row-actions"><button class="button primary compact" data-payroll-advance-confirm="${esc(a.id)}" data-side="${viewerSide}" data-ok="1">${viewerSide==='owner'?'Yes, paid':'Yes, received'}</button><button class="button secondary compact" data-payroll-advance-confirm="${esc(a.id)}" data-side="${viewerSide}" data-ok="">${viewerSide==='owner'?'No, failed':'Not received'}</button></span></div>`).join('')}</section>` : ''}
    ${pendingCashAdvances.length ? `<section class="panel nc-actions"><h2>Confirm cash advance</h2>${pendingCashAdvances.map(a => `<div class="ledger-row static"><span><b>${inr(a.amount)}</b><small>${esc(a.reason)} · Did you receive this in cash?</small></span><span class="row-actions"><button class="button primary compact" data-payroll-advance-ack="${esc(a.id)}" data-ok="1">I received it</button><button class="button secondary compact" data-payroll-advance-ack="${esc(a.id)}" data-ok="">Not received</button></span></div>`).join('')}</section>` : ''}
    <div class="form-actions">
      ${viewerSide==='owner' ? `<button class="button primary compact" data-payroll-action="pay-now" data-person="${esc(personId)}" data-business="${esc(business)}">Pay now</button>
      <button class="button secondary compact" data-payroll-action="give-advance" data-person="${esc(personId)}" data-business="${esc(business)}">Give advance</button>
      <button class="button secondary compact" data-payroll-action="add-reimbursement" data-person="${esc(personId)}" data-business="${esc(business)}">Add reimbursement</button>
      <button class="button secondary compact" data-payroll-action="add-deduction" data-person="${esc(personId)}" data-business="${esc(business)}">Add deduction</button>` : ''}
    </div>
    <h3>History</h3>
    <div class="review-checklist">${h.length ? h.map(e => `<div class="market-row"><span><b>${esc(e.note || e.type)}</b><small class="block muted">${esc(e.at)} · ${esc(e.type)}${e.status === 'disputed' ? ' · disputed, under review' : e.status === 'pending_confirmation' ? ' · pending confirmation' : e.status === 'pending_handoff' ? ' · waiting for UPI confirmation' : e.status === 'pending_ack' ? ' · waiting for cash acknowledgment' : e.status === 'cancelled' ? ' · cancelled' : ''}</small></span><b class="${e.amount >= 0 ? 'amount in' : 'amount out'}">${e.amount >= 0 ? '+' : '−'}${inr(Math.abs(e.amount))}</b></div>`).join('') : '<p class="muted">No pay history yet.</p>'}</div>
  </section>`;
}
