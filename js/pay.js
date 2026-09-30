// MoveAI Pay — the single payments service every screen calls (option E, step 1).
// The ledger stays the record of truth. MoveAI Pay adds: a simulated licensed payment aggregator
// (collect, hold, release, refund, payout), partner wallets with cash-job commission debt, cancellation
// and no-show rules, weekly and instant payouts, and an admin view of held money.
// In production the aggregator calls go to Razorpay / Cashfree / PayU; MoveAI never holds funds itself.
import {esc, pill, inr} from './ops.js';

export const POLICY = {
  commission: {moving: 0.10, driver: 0.12, general: 0.15},
  booking: {moving: {pct: 0.2, min: 500}, driver: {pct: 0, min: 0}, general: {pct: 0, min: 0}},
  cancellation: {pct: 0.1, min: 299, max: 1500},
  noShowPenalty: 500, instantFee: 10, cashDebtLimit: 2000, payoutDay: 1, // Monday
};
export const TEST = 'Prototype: UPI fail@upi or card ending 0002 → declined. pending@upi → processing, then succeeds; pendingfail@upi → processing, then fails. Payout account ending 000 → rejected; containing 999 → paid, then returned by the bank next day.';
const PAID = ['paid', 'confirmed', 'closed', 'released', 'refunded'];
export const clock = () => Date.now() + ((globalThis.__moveaiClockOffset || 0) * 86400000);
const stamp = t => new Date(t ?? clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 4)}`;
const round = n => Math.round(Number(n) || 0);

// ---------- simulated payment aggregator ----------
export const gateway = {
  collect({method, vpa, card, amount}) {
    if (!(amount > 0)) return {ok: false, reason: 'Nothing to pay.'};
    if (method === 'upi' && !/^[\w.-]+@[a-z]{2,}$/i.test(String(vpa || ''))) return {ok: false, reason: 'Enter a valid UPI ID, e.g. name@okaxis.'};
    if (method === 'upi' && String(vpa).toLowerCase() === 'fail@upi') return {ok: false, reason: 'Payment declined by your bank. No money was taken. Try another UPI ID or a card.'};
    if (method === 'card' && !/^\d{12,19}$/.test(String(card || '').replace(/\s/g, ''))) return {ok: false, reason: 'Enter the card number.'};
    if (method === 'card' && String(card).replace(/\s/g, '').endsWith('0002')) return {ok: false, reason: 'Card declined. No money was taken.'};
    const v = String(vpa || '').toLowerCase();
    if (method === 'upi' && (v === 'pending@upi' || v === 'pendingfail@upi')) return {ok: true, pending: true, final: v === 'pending@upi' ? 'success' : 'failed', ref: `pay_${Math.random().toString(36).slice(2, 12)}`};
    return {ok: true, ref: `pay_${Math.random().toString(36).slice(2, 12)}`};
  },
  refund(ref, amount) { return {ok: true, ref: `rfnd_${Math.random().toString(36).slice(2, 10)}`, amount}; },
  payout(account, amount) {
    if (!account) return {ok: false, reason: 'Add a payout account first.'};
    const id = String(account.vpa || account.accountNumber || '');
    if (id.toLowerCase() === 'fail@upi' || /000$/.test(id)) return {ok: false, reason: 'Bank rejected the transfer (account details do not match). Update the payout account and retry.'};
    return {ok: true, ref: `pout_${Math.random().toString(36).slice(2, 10)}`, amount, later: /999/.test(id) ? 'returned' : null};
  },
};

// ---------- ledger access (the one place that writes money records) ----------
export function record(state, e, actor = 'MoveAI Pay') {
  const entry = {id: uid('PAY'), channel: 'moveai_pay', createdAt: clock(), history: [{action: 'created', status: e.status, actor, at: stamp()}], ...e};
  if (entry.channel === 'moveai_pay' && entry.reference && /^(pay|rfnd|pout)_/.test(entry.reference)) (state.gatewayLog ||= []).unshift({ref: entry.reference, ledgerId: entry.id, type: entry.type, amount: entry.amount, status: entry.status, final: entry.gatewayFinal || null, at: clock()});
  state.ledger.unshift(entry);
  return entry;
}
const setStatus = (e, status, actor, note) => { e.status = status; (e.history ||= []).push({action: status, status, actor, at: stamp(), note}); };

// ---------- pricing rules (admin) ----------
export const DEFAULT_PRICING = svc => ({commission: POLICY.commission[svc], bookingPct: POLICY.booking[svc]?.pct || 0, bookingMin: POLICY.booking[svc]?.min || 0, cancelPct: POLICY.cancellation.pct, cancelMin: POLICY.cancellation.min, cancelMax: POLICY.cancellation.max});
const FIELDS = ['commission', 'bookingPct', 'bookingMin', 'cancelPct', 'cancelMin', 'cancelMax'];
export function resolvePricing(state, {service, city = '', partner = '', date}) {
  const d = date || new Date(clock()).toISOString().slice(0, 10), out = {...DEFAULT_PRICING(service), rules: [], service};
  const match = (state.pricingRules || []).filter(r => r.active && (r.service === 'all' || r.service === service) && (!r.city || String(city).toLowerCase().includes(r.city.toLowerCase())) && (!r.partner || r.partner === partner) && (!r.from || d >= r.from) && (!r.to || d <= r.to));
  match.sort((a, b) => ((a.partner ? 4 : 0) + (a.city ? 2 : 0) + (a.service !== 'all' ? 1 : 0)) - ((b.partner ? 4 : 0) + (b.city ? 2 : 0) + (b.service !== 'all' ? 1 : 0)));
  for (const r of match) { for (const f of FIELDS) if (r[f] !== '' && r[f] != null) out[f] = Number(r[f]); out.rules.push(r.id); }
  out.label = out.rules.length ? `Rules ${out.rules.join(', ')}` : 'Standard rates';
  return out;
}
export function validateRule(v) {
  if (!['all', 'moving', 'driver', 'general'].includes(v.service)) return 'Choose a service.';
  const pct = ['commission', 'bookingPct', 'cancelPct'].filter(f => v[f] !== '' && v[f] != null);
  if (pct.some(f => !(Number(v[f]) >= 0 && Number(v[f]) <= 0.5))) return 'Percentages must be between 0% and 50%.';
  if (v.from && v.to && v.to < v.from) return 'End date is before the start date.';
  if (!FIELDS.some(f => v[f] !== '' && v[f] != null)) return 'Set at least one value to change.';
  if (!String(v.note || '').trim()) return 'Add a note explaining why (for the audit trail).';
  if (v.cancelMin !== '' && v.cancelMax !== '' && v.cancelMin != null && v.cancelMax != null && Number(v.cancelMax) < Number(v.cancelMin)) return 'Maximum cancellation fee is below the minimum.';
  return '';
}
export function addRule(state, v, actor) {
  const e = validateRule(v); if (e) return {error: e};
  const r = {id: `PR-${String((state.pricingRules || []).length + 1).padStart(3, '0')}`, active: true, createdBy: actor, createdAt: stamp(), service: v.service, city: String(v.city || '').trim(), partner: v.partner || '', from: v.from || '', to: v.to || '', note: String(v.note).trim()};
  for (const f of FIELDS) r[f] = v[f] === '' || v[f] == null ? '' : Number(v[f]);
  (state.pricingRules ||= []).push(r);
  return {ok: true, rule: r};
}
const pr = (state, r) => r.pricing || DEFAULT_PRICING(serviceType(r));

// ---------- consumer bookings ----------
export const serviceType = r => r.type === 'moving' ? 'moving' : r.type === 'driver' ? 'driver' : 'general';
export function bookingAmount(type, total, p) { const b = p ? {pct: p.bookingPct, min: p.bookingMin} : (POLICY.booking[type] || {pct: 0, min: 0}); return b.pct ? Math.min(total, Math.max(b.min || 0, round(total * b.pct))) : 0; }
export const payeeOf = (state, r) => r.movingJobId ? (state.movingJobs.find(j => j.id === r.movingJobId)?.owner || 'movers') : r.type === 'driver' ? (r.provider || 'personalDriver') : 'external:service-partner';
export const holdsOf = (state, r) => state.ledger.filter(x => x.serviceId === r.id && x.type === 'customer_payment');
export function paySummary(state, r) {
  const total = round(r.quote?.total);
  const hs = holdsOf(state, r).filter(x => !['refunded', 'failed', 'pending'].includes(x.status));
  const pending = holdsOf(state, r).filter(x => x.status === 'pending').reduce((s, x) => s + x.amount, 0);
  const paidOnline = hs.filter(x => x.channel !== 'cash').reduce((s, x) => s + x.amount, 0);
  const cash = hs.filter(x => x.channel === 'cash').reduce((s, x) => s + x.amount, 0);
  const refunded = state.ledger.filter(x => x.serviceId === r.id && x.type === 'refund').reduce((s, x) => s + x.amount, 0);
  const refundPending = state.ledger.filter(x => x.serviceId === r.id && x.type === 'refund' && x.status === 'refund_initiated');
  const fee = state.ledger.filter(x => x.serviceId === r.id && x.type === 'cancellation_fee').reduce((s, x) => s + x.amount, 0);
  return {total, pending, paidOnline, cash, held: hs.filter(x => x.status === 'held').reduce((s, x) => s + x.amount, 0), due: r.status === 'cancelled' ? 0 : Math.max(0, total - paidOnline - cash - pending), refunded, refundPending, fee};
}
// Seeded bookings made before MoveAI Pay existed get their ₹2,000 booking amount as a hold.
export function ensurePay(state) {
  state.payoutAccounts ||= {movers: {method: 'bank', accountNumber: '50100231845521', ifsc: 'HDFC0001842', holder: 'SafeMove Packers'}, personalDriver: {method: 'upi', vpa: 'anil.kumar@okicici', holder: 'Anil Kumar'}, transporter: {method: 'bank', accountNumber: '3921004455', ifsc: 'SBIN0001234', holder: 'Raj Logistics'}, vehicle: {method: 'upi', vpa: 'rajtransport@ybl', holder: 'Raj Transport'}};
  for (const r of state.serviceRequests.filter(x => x.customer === 'personal' && x.movingJobId && !x.payMigrated)) {
    r.payMigrated = true;
    const legacy = state.ledger.find(x => x.type === 'customer_payment' && !x.serviceId && (x.sourceId === r.id || x.sourceId === r.movingJobId || String(x.sourceId || '').startsWith(`${r.id}-`)));
    if (legacy) { legacy.serviceId = r.id; legacy.purpose = legacy.purpose || 'booking'; if (!r.paid && legacy.status !== 'reversed') legacy.status = 'held'; continue; }
    if (!holdsOf(state, r).length && !['cancelled'].includes(r.status)) record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'booking', payer: 'personal', payee: payeeOf(state, r), responsible: 'personal', amount: 2000, method: 'upi', reference: `pay_legacy_${r.id}`, status: r.paid ? 'released' : 'held', note: `Booking amount ${r.id}`});
  }
  return state;
}
export function payBooking(state, r, pm) {
  const type = serviceType(r), amount = bookingAmount(type, round(r.quote?.total));
  if (!amount) return {ok: true, amount: 0};
  const g = gateway.collect({...pm, amount});
  if (!g.ok) return {error: g.reason};
  record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'booking', payer: 'personal', payee: payeeOf(state, r), responsible: 'personal', amount, method: pm.method, reference: g.ref, status: 'held', note: `Booking amount ${r.id} · held until the job is done`}, 'Customer');
  return {ok: true, amount};
}
export function holdBooking(state, r, pm, ref, amount, g = {}) {
  if (g.pending) r.paymentPending = true;
  return record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'booking', payer: 'personal', payee: payeeOf(state, r), responsible: 'personal', amount, method: pm.method, reference: ref, status: g.pending ? 'pending' : 'held', gatewayFinal: g.final || null, note: `Booking amount ${r.id}${g.pending ? ' · processing' : ' · held until the job is done'}`}, 'Customer');
}
export function payBalance(state, r, pm) {
  const s = paySummary(state, r); if (!s.due) return {error: 'Nothing left to pay.'};
  if (pm.method === 'cash') {
    const e = record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'balance', payer: 'personal', payee: payeeOf(state, r), responsible: 'personal', amount: s.due, method: 'cash', channel: 'cash', reference: `CASH-${r.id}`, status: 'confirmed', note: `Balance paid in cash ${r.id}`}, 'Customer');
    cashCommission(state, r, e.amount);
    r.paid = true; return {ok: true, amount: s.due, cash: true};
  }
  const g = gateway.collect({...pm, amount: s.due}); if (!g.ok) return {error: g.reason};
  record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'balance', payer: 'personal', payee: payeeOf(state, r), responsible: 'personal', amount: s.due, method: pm.method, reference: g.ref, status: g.pending ? 'pending' : 'held', gatewayFinal: g.final || null, note: `Balance ${r.id}${g.pending ? ' · processing' : ''}`}, 'Customer');
  if (g.pending) { r.paymentPending = true; return {ok: true, amount: s.due, pending: true}; }
  r.paid = true;
  return {ok: true, amount: s.due};
}
// Partner collected cash: commission becomes wallet debt.
export function cashCommission(state, r, amount) {
  const rate = pr(state, r).commission, party = payeeOf(state, r);
  record(state, {owner: party, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'cash_commission', payer: party, payee: 'moveai', responsible: party, amount: round(amount * rate), method: 'wallet', reference: `COMM-${r.id}`, status: 'confirmed', note: `${Math.round(rate * 100)}% commission on ${inr(amount)} cash · recovered from wallet`});
}
// Job done (completion OTP / customer confirmation): release everything held to the partner, minus commission.
export function release(state, r, actor = 'MoveAI Pay') {
  const held = holdsOf(state, r).filter(x => x.status === 'held');
  if (!held.length) return {ok: true, amount: 0};
  const gross = held.reduce((s, x) => s + x.amount, 0), rate = pr(state, r).commission, party = payeeOf(state, r);
  const commission = round(gross * rate);
  held.forEach(x => setStatus(x, 'released', actor));
  record(state, {owner: party, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'wallet_credit', payer: 'moveai', payee: party, responsible: 'moveai', amount: gross - commission, method: 'wallet', reference: `REL-${r.id}`, status: 'confirmed', gross, commission, note: `${r.id} released: ${inr(gross)} − ${Math.round(rate * 100)}% commission ${inr(commission)}`});
  record(state, {owner: 'moveai', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'commission', payer: party, payee: 'moveai', responsible: party, amount: commission, method: 'wallet', reference: `COM-${r.id}`, status: 'confirmed', note: `Commission ${r.id}`});
  return {ok: true, amount: gross - commission, commission};
}
export function cancellationQuote(state, r, by = 'customer') {
  const job = r.movingJobId && state.movingJobs.find(j => j.id === r.movingJobId);
  const started = job ? ['in_transit', 'unloaded', 'otp_verified', 'paid', 'closed'].includes(job.status) : ['in_progress', 'provider_done', 'completed', 'paid', 'closed'].includes(r.status);
  if (started) return {allowed: false, reason: 'The job has started. Raise a problem instead so it can be reviewed.'};
  if (['cancelled', 'closed'].includes(r.status)) return {allowed: false, reason: 'Already closed.'};
  const s = paySummary(state, r);
  if (by === 'partner_no_show') return {allowed: true, fee: 0, refund: s.paidOnline, penalty: POLICY.noShowPenalty, note: 'Partner did not show up: full refund and a penalty on the partner.'};
  const assigned = job ? ['resources_allocated', 'packed', 'loaded'].includes(job.status) : ['accepted'].includes(r.status) && r.type === 'driver';
  const p0 = pr(state, r), c = {pct: p0.cancelPct, min: p0.cancelMin, max: p0.cancelMax}, fee = assigned ? Math.min(c.max, Math.max(c.min, round(s.total * c.pct)), s.paidOnline || c.max) : 0;
  return {allowed: true, fee: Math.min(fee, s.paidOnline), refund: s.paidOnline - Math.min(fee, s.paidOnline), note: assigned ? 'Crew or driver already assigned, so a cancellation fee applies.' : 'Free cancellation before crew is assigned.'};
}
export function cancel(state, r, by = 'customer', reason = '') {
  const q = cancellationQuote(state, r, by); if (!q.allowed) return {error: q.reason};
  const party = payeeOf(state, r);
  const held = holdsOf(state, r).filter(x => x.status === 'held');
  held.forEach(x => setStatus(x, 'refunded', by, reason));
  if (q.refund) { const g = gateway.refund(held[0]?.reference, q.refund); record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: party, amount: q.refund, method: held[0]?.method || 'upi', reference: g.ref, status: 'refund_initiated', expectedBy: clock() + 5 * 86400000, gatewayFinal: 'refunded', note: `Refund to original payment method · ${r.id}`}); }
  if (q.fee) record(state, {owner: party, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'cancellation_fee', payer: 'personal', payee: party, responsible: 'personal', amount: q.fee, method: 'wallet', reference: `CXL-${r.id}`, status: 'confirmed', note: `Cancellation fee kept for the partner · ${r.id}`});
  if (q.fee) record(state, {owner: party, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'wallet_credit', payer: 'moveai', payee: party, responsible: 'moveai', amount: q.fee, method: 'wallet', reference: `CXLW-${r.id}`, status: 'confirmed', note: `Cancellation fee credited · ${r.id}`});
  if (q.penalty) record(state, {owner: party, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'penalty', payer: party, payee: 'moveai', responsible: party, amount: q.penalty, method: 'wallet', reference: `NOSHOW-${r.id}`, status: 'confirmed', note: `No-show penalty · ${r.id}`});
  r.status = 'cancelled'; r.cancelledBy = by; r.cancelReason = reason;
  const job = r.movingJobId && state.movingJobs.find(j => j.id === r.movingJobId);
  if (job) { job.status = 'cancelled'; (job.history ||= []).push({status: 'cancelled', at: stamp(), by}); (state.bookings || []).forEach(b => { if (b.ref === job.id) b.status = 'released'; }); }
  return {ok: true, ...q};
}

// ---------- partner wallets ----------
export function wallet(state, party) {
  const L = state.ledger;
  const credits = L.filter(x => x.type === 'wallet_credit' && x.payee === party && x.status === 'confirmed').reduce((s, x) => s + x.amount, 0);
  const debts = L.filter(x => ['cash_commission', 'penalty'].includes(x.type) && x.payer === party && x.status === 'confirmed').reduce((s, x) => s + x.amount, 0);
  const payouts = L.filter(x => x.type === 'payout' && x.payee === party && ['paid', 'processing'].includes(x.status)).reduce((s, x) => s + x.amount + (x.fee || 0), 0);
  const held = L.filter(x => x.type === 'customer_payment' && x.payee === party && x.status === 'held').reduce((s, x) => s + x.amount, 0);
  const balance = credits - debts - payouts;
  return {credits, debts, payouts, held, balance, blocked: balance < -POLICY.cashDebtLimit, failed: L.filter(x => x.type === 'payout' && x.payee === party && x.status === 'failed')};
}
export const partnerBlocked = (state, party) => wallet(state, party).blocked ? `Your MoveAI Pay wallet owes ${inr(-wallet(state, party).balance)} in cash-job commission (limit ${inr(POLICY.cashDebtLimit)}). Pay it to take new jobs.` : '';
export function nextPayoutDate() { const d = new Date(); const add = (POLICY.payoutDay + 7 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + add); return d.toLocaleDateString('en-IN', {weekday: 'short', day: '2-digit', month: 'short'}); }
export function payout(state, party, {instant = false, actor = 'MoveAI Pay'} = {}) {
  const w = wallet(state, party), fee = instant ? POLICY.instantFee : 0;
  if (w.balance - fee <= 0) return {error: w.balance < 0 ? 'Your wallet is negative (cash-job commission). Nothing to pay out.' : 'No balance to pay out.'};
  const account = (state.payoutAccounts || {})[party];
  const amount = w.balance - fee, g = gateway.payout(account, amount);
  const e = record(state, {owner: party, sourceType: 'wallet', sourceId: party, type: 'payout', payer: 'moveai', payee: party, responsible: 'moveai', amount, fee, method: account?.method || 'bank', reference: g.ref || 'failed', status: g.ok ? 'paid' : 'failed', gatewayFinal: g.later || (g.ok ? 'paid' : 'failed'), failReason: g.reason || '', instant, note: `${instant ? 'Instant' : 'Weekly'} payout to ${account ? (account.vpa || `A/c ••${String(account.accountNumber).slice(-4)}`) : 'no account'}${fee ? ` (₹${fee} fee)` : ''}`}, actor);
  return g.ok ? {ok: true, amount, entry: e} : {error: g.reason, entry: e};
}
export function retryPayout(state, id) { const e = state.ledger.find(x => x.id === id && x.status === 'failed'); if (!e) return {error: 'Not a failed payout.'}; setStatus(e, 'retried', 'Partner'); return payout(state, e.payee, {instant: e.instant}); }
export function settleDebt(state, party, pm) {
  const w = wallet(state, party); if (w.balance >= 0) return {error: 'Nothing owed.'};
  const g = gateway.collect({...pm, amount: -w.balance}); if (!g.ok) return {error: g.reason};
  record(state, {owner: party, sourceType: 'wallet', sourceId: party, type: 'wallet_credit', payer: party, payee: party, responsible: party, amount: -w.balance, method: pm.method, reference: g.ref, status: 'confirmed', note: 'Cash-job commission paid into wallet'});
  return {ok: true};
}
// Business → worker disbursement (khata, payroll) through the aggregator's payout API.
export function disburse(state, e, account) {
  const g = gateway.payout(account || {method: 'bank', accountNumber: 'on-file'}, e.amount);
  return record(state, {...e, channel: 'moveai_pay', reference: g.ok ? g.ref : 'failed', status: g.ok ? 'paid' : 'failed', failReason: g.reason || ''});
}
export function runWeeklyPayouts(state) { const parties = [...new Set(state.ledger.filter(x => x.type === 'wallet_credit').map(x => x.payee))]; return parties.map(p => ({party: p, ...payout(state, p, {actor: 'Weekly run'})})).filter(r => r.ok || r.entry); }

// ---------- realistic behaviour: pending, delayed refunds, returned payouts, daily reconciliation ----------
function notify(state, to, text, ref) { (state.notifications ||= []).unshift({id: uid('NT'), to, text, ref, at: stamp(), read: false}); }
export function resolvePending(state, onlyServiceId) {
  const out = [];
  for (const x of state.ledger.filter(e => e.status === 'pending' && e.type === 'customer_payment' && (!onlyServiceId || e.serviceId === onlyServiceId))) {
    const r = state.serviceRequests.find(q => q.id === x.serviceId);
    if (x.gatewayFinal === 'success') { setStatus(x, 'held', 'Payment company'); if (r) { r.paymentPending = false; if (x.purpose === 'balance') r.paid = true; } out.push({x, result: 'confirmed'}); }
    else { setStatus(x, 'failed', 'Payment company'); if (r) { r.paymentPending = false; if (x.purpose === 'booking' && r.status !== 'cancelled') { r.status = 'cancelled'; r.cancelReason = 'Booking payment failed — nothing was charged'; const job = r.movingJobId && state.movingJobs.find(j => j.id === r.movingJobId); if (job) job.status = 'cancelled'; notify(state, 'personal', `${r.id}: your payment did not go through, so the booking was cancelled. No money was taken.`, r.id); } } out.push({x, result: 'failed'}); }
    const log = (state.gatewayLog || []).find(l => l.ref === x.reference); if (log) log.status = x.status;
  }
  return out;
}
export function runReconciliation(state) {
  const t = clock(), rep = {at: stamp(t), matched: 0, resolved: [], refundsCompleted: [], payoutsReturned: [], mismatches: []};
  rep.resolved = resolvePending(state).map(r => `${r.x.serviceId}: payment ${r.result}`);
  for (const x of state.ledger.filter(e => e.type === 'refund' && e.status === 'refund_initiated' && e.expectedBy <= t)) { setStatus(x, 'refunded', 'Bank'); rep.refundsCompleted.push(`${x.serviceId}: ${inr(x.amount)} reached the customer`); notify(state, 'personal', `Refund of ${inr(x.amount)} for ${x.serviceId} has reached your account.`, x.serviceId); }
  for (const x of state.ledger.filter(e => e.type === 'payout' && e.status === 'paid' && e.gatewayFinal === 'returned' && t - (e.createdAt || 0) >= 86400000)) { setStatus(x, 'returned', 'Bank', 'Beneficiary account closed or name mismatch'); rep.payoutsReturned.push(`${x.payee}: ${inr(x.amount)} returned by the bank — back in wallet`); notify(state, x.payee, `Payout of ${inr(x.amount)} was returned by your bank. It is back in your wallet; update your payout account.`, x.id); }
  for (const l of state.gatewayLog || []) {
    const e = state.ledger.find(x => x.id === l.ledgerId);
    if (!e) rep.mismatches.push(`${l.ref}: on the payment company's report but not in MoveAI's ledger`);
    else if (Number(e.amount) !== Number(l.amount)) rep.mismatches.push(`${l.ref}: amount ₹${l.amount} at the payment company vs ₹${e.amount} in MoveAI`);
    else rep.matched += 1;
  }
  for (const e of state.ledger.filter(x => x.channel === 'moveai_pay' && /^(pay|rfnd|pout)_/.test(x.reference || '') && !(state.gatewayLog || []).some(l => l.ref === x.reference))) rep.mismatches.push(`${e.reference}: in MoveAI's ledger but missing from the payment company's report`);
  (state.reconReports ||= []).unshift(rep);
  return rep;
}

// ---------- screens ----------
export function checkoutHtml(type, total, p) {
  const now = bookingAmount(type, total, p); const c = p ? {pct: p.cancelPct, min: p.cancelMin, max: p.cancelMax} : POLICY.cancellation;
  if (!now) return `<div class="pay-box"><h3>Payment</h3><p>Nothing to pay now. You pay ${inr(total)} after the work is done — by UPI, card or cash. MoveAI holds online payments until you confirm the work.</p></div>`;
  return `<div class="pay-box"><h3>Pay the booking amount to confirm</h3><p>${inr(now)} now · ${inr(total - now)} after the job. MoveAI Pay holds your money until you share the completion OTP.</p>
  <div class="pay-methods"><label><input type="radio" name="pay-method" value="upi" checked> UPI</label><label><input type="radio" name="pay-method" value="card"> Card</label></div>
  <label class="pay-field" data-for="upi"><span>UPI ID</span><input id="pay-vpa" value="shubham@okaxis" autocomplete="off"></label><label class="pay-field" data-for="card" hidden><span>Card number</span><input id="pay-card" inputmode="numeric" placeholder="4111 1111 1111 1111"></label>
  <p class="muted">Free cancellation until crew is assigned; after that ${Math.round(c.pct * 100)}% (min ${inr(c.min)}, max ${inr(c.max)}). Full refund if the partner does not show up.${p?.rules?.length ? ` <span class="chip">Offer applied</span>` : ''}</p><p class="mock-hint">${esc(TEST)}</p><p id="pay-error" class="field-error" hidden></p></div>`;
}
export function servicePayPanel(state, r) {
  const s = paySummary(state, r), q = cancellationQuote(state, r);
  const refunds = state.ledger.filter(x => x.serviceId === r.id && x.type === 'refund');
  const pend = s.pending ? `<div class="info-banner"><b>Payment processing · ${inr(s.pending)}</b><span>Your bank has not confirmed yet. This usually takes a few minutes. Do not pay again.</span><button class="button secondary compact" data-pay-check="${r.id}">Check status</button></div>` : '';
  const rfp = (s.refundPending || []).map(x => `<p class="muted">Refund ${inr(x.amount)} started · expected by ${new Date(x.expectedBy).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})} (usually 5 working days)</p>`).join('');
  return `<section class="panel pay-panel"><h2>Payment · MoveAI Pay</h2>${pend}${rfp}${r.cancelReason && r.status === 'cancelled' ? `<p class="muted">${esc(r.cancelReason)}</p>` : ''}<table class="price-table"><tbody><tr><td>Total</td><td>${inr(s.total)}</td></tr><tr><td>Paid online${s.held ? ' (held until done)' : ''}</td><td>${inr(s.paidOnline)}</td></tr>${s.cash ? `<tr><td>Paid in cash</td><td>${inr(s.cash)}</td></tr>` : ''}${s.fee ? `<tr><td>Cancellation fee</td><td>${inr(s.fee)}</td></tr>` : ''}${s.refunded ? `<tr><td>Refunded</td><td>${inr(s.refunded)}</td></tr>` : ''}<tr class="total"><td>${r.status === 'cancelled' ? 'Status' : 'Still to pay'}</td><td>${r.status === 'cancelled' ? 'Cancelled' : inr(s.due)}</td></tr></tbody></table>
  ${refunds.filter(x => x.status === 'refunded').map(x => `<p class="muted">Refund ${inr(x.amount)} reached your ${esc(x.method.toUpperCase())} · ${esc(x.reference)}</p>`).join('')}
  ${q.allowed && r.status !== 'cancelled' ? `<details class="cancel-box"><summary>Cancel booking</summary><p>${esc(q.note)} Fee ${inr(q.fee)} · refund ${inr(q.refund)}.</p><input id="cancel-reason" placeholder="Reason (optional)"><button class="button secondary" data-pay-cancel="${r.id}">Cancel and refund ${inr(q.refund)}</button></details>` : ''}</section>`;
}
export function balanceFormHtml(state, r) {
  const s = paySummary(state, r); if (!s.due) return '';
  return `<div class="pay-box"><h3>Pay ${inr(s.due)}</h3><div class="pay-methods"><label><input type="radio" name="pay-method" value="upi" checked> UPI</label><label><input type="radio" name="pay-method" value="card"> Card</label><label><input type="radio" name="pay-method" value="cash"> Cash to crew</label></div>
  <label class="pay-field" data-for="upi"><span>UPI ID</span><input id="pay-vpa" value="shubham@okaxis"></label><label class="pay-field" data-for="card" hidden><span>Card number</span><input id="pay-card" inputmode="numeric"></label>
  <p class="mock-hint">${esc(TEST)}</p><p id="pay-error" class="field-error" hidden></p><button class="button primary full" data-pay-balance="${r.id}">Pay ${inr(s.due)}</button></div>`;
}
export function walletPanel(state, party) {
  ensurePay(state);
  const w = wallet(state, party), acc = (state.payoutAccounts || {})[party];
  const rows = state.ledger.filter(x => (['wallet_credit', 'payout'].includes(x.type) && x.payee === party) || (['cash_commission', 'penalty'].includes(x.type) && x.payer === party)).slice(0, 8);
  return `<section class="panel wallet-panel"><div class="panel-header"><div><h2>MoveAI Pay wallet</h2><p>Customer payments are held until the job is done, then released here minus commission. Weekly payout every Monday.</p></div>${w.blocked ? pill('blocked') : ''}</div>
  <div class="metrics"><div class="metric"><span>Available</span><b class="${w.balance < 0 ? 'amount out' : 'amount in'}">${w.balance < 0 ? '−' : ''}${inr(Math.abs(w.balance))}</b><small>${w.balance < 0 ? 'Cash-job commission owed' : `Next payout ${nextPayoutDate()}`}</small></div><div class="metric"><span>Held for jobs in progress</span><b>${inr(w.held)}</b><small>Released on completion</small></div><div class="metric"><span>Paid out</span><b>${inr(w.payouts)}</b><small>All time</small></div><div class="metric"><span>Commission on cash jobs</span><b>${inr(w.debts)}</b><small>Recovered from wallet</small></div></div>
  ${w.blocked ? `<div class="action-warning"><b>New jobs paused</b><span>${esc(partnerBlocked(state, party))}</span><button class="button primary" data-pay-debt="${party}">Pay ${inr(-w.balance)} by UPI</button></div>` : ''}
  ${w.failed.filter(f => f.status === 'failed').map(f => `<div class="action-warning"><b>Payout of ${inr(f.amount)} failed</b><span>${esc(f.failReason)}</span><button class="button secondary" data-pay-retry="${f.id}">Retry</button></div>`).join('')}
  <div class="row-actions">${w.balance > POLICY.instantFee ? `<button class="button primary" data-pay-instant="${party}">Instant payout ${inr(w.balance - POLICY.instantFee)} (₹${POLICY.instantFee} fee)</button>` : ''}</div>
  <form class="inline-form" data-pay-account="${party}"><input name="vpa" placeholder="Payout UPI ID or bank account" value="${esc(acc?.vpa || acc?.accountNumber || '')}"><button class="button secondary" type="submit">Save payout account</button></form><p class="mock-hint">${esc(TEST)}</p>
  <div class="ledger">${rows.map(x => `<div class="ledger-row static"><span><b>${esc(x.note || x.type)}</b><small>${esc(x.reference)} · ${esc(x.history?.[0]?.at || '')}</small></span><span class="amount ${x.type === 'wallet_credit' ? 'in' : 'out'}">${x.type === 'wallet_credit' ? '+' : '−'}${inr(x.amount)}</span>${pill(x.status)}</div>`).join('') || '<div class="empty-inline"><b>No wallet activity yet</b></div>'}</div></section>`;
}
export function payOpsScreen(state) {
  ensurePay(state);
  const L = state.ledger;
  const held = L.filter(x => x.type === 'customer_payment' && x.status === 'held');
  const refunds = L.filter(x => x.type === 'refund');
  const failed = L.filter(x => x.type === 'payout' && x.status === 'failed');
  const commission = L.filter(x => x.type === 'commission' || x.type === 'cash_commission').reduce((s, x) => s + x.amount, 0);
  const parties = [...new Set(L.filter(x => ['wallet_credit', 'cash_commission'].includes(x.type)).flatMap(x => [x.payee, x.payer]).filter(p => p && !['moveai', 'personal'].includes(p)))];
  const list = (title, rows, fn) => `<section class="panel"><h2>${title} (${rows.length})</h2>${rows.map(fn).join('') || '<p class="muted">None</p>'}</section>`;
  const row = x => `<div class="ledger-row static"><span><b>${esc(x.note || x.type)}</b><small>${esc(x.reference)} · ${esc(x.payee)}</small></span><span class="amount">${inr(x.amount)}</span>${pill(x.status)}</div>`;
  const rep = (state.reconReports || [])[0];
  return `<div class="page-header"><div><h1>MoveAI Pay</h1><p>Money held for customers, refunds, partner wallets and payouts. Funds sit with the licensed payment aggregator, not in MoveAI's own account.</p></div><span class="row-actions"><button class="button secondary" data-pay-clock>Prototype: move clock +1 day (now ${new Date(clock()).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})})</button><button class="button secondary" data-pay-recon>Run daily reconciliation</button><button class="button primary" data-pay-weekly>Run weekly payouts</button><button class="button secondary" data-route="pricingRules">Pricing rules</button></span></div>
  ${rep ? `<section class="panel"><h2>Reconciliation · ${esc(rep.at)}</h2><p>${rep.matched} records matched the payment company's report · ${rep.mismatches.length} mismatch(es)</p>${[['Pending payments resolved', rep.resolved], ['Refunds completed', rep.refundsCompleted], ['Payouts returned by banks', rep.payoutsReturned], ['Mismatches to investigate', rep.mismatches]].filter(([, l]) => l.length).map(([h, l]) => `<h3>${h}</h3>${l.map(x => `<small class="block">${esc(x)}</small>`).join('')}`).join('') || '<p class="muted">Nothing needed attention.</p>'}</section>` : ''}
  <div class="metrics"><div class="metric"><span>Held for customers</span><b>${inr(held.reduce((s, x) => s + x.amount, 0))}</b><small>${held.length} bookings</small></div><div class="metric"><span>Refunded</span><b>${inr(refunds.reduce((s, x) => s + x.amount, 0))}</b><small>${refunds.length} refunds</small></div><div class="metric"><span>Commission earned</span><b>${inr(commission)}</b><small>Online + cash jobs</small></div><div class="metric"><span>Failed payouts</span><b>${failed.length}</b><small>Need partner action</small></div></div>
  <section class="panel"><h2>Partner wallets</h2><div class="table-scroll"><table class="data-table"><thead><tr><th>Partner</th><th>Available</th><th>Held</th><th>Cash commission</th><th>Status</th></tr></thead><tbody>${parties.map(p => { const w = wallet(state, p); return `<tr><td><b>${esc(p)}</b></td><td>${w.balance < 0 ? '−' : ''}${inr(Math.abs(w.balance))}</td><td>${inr(w.held)}</td><td>${inr(w.debts)}</td><td>${w.blocked ? pill('blocked') : pill('active')}</td></tr>`; }).join('') || '<tr><td colspan="5">No wallets yet</td></tr>'}</tbody></table></div></section>
  <div class="grid two">${list('Held payments', held, row)}${list('Refunds', refunds, row)}</div>${list('Failed payouts', failed, x => `<div class="ledger-row static"><span><b>${esc(x.note)}</b><small>${esc(x.failReason)}</small></span><span class="amount">${inr(x.amount)}</span>${pill('failed')}</div>`)}`;
}

// ---------- bindings ----------
function pm(root) { const m = root.querySelector('input[name="pay-method"]:checked')?.value || 'upi'; return {method: m, vpa: root.querySelector('#pay-vpa')?.value, card: root.querySelector('#pay-card')?.value}; }
function err(root, msg) { const e = root.querySelector('#pay-error'); if (e) { e.textContent = msg; e.hidden = !msg; } }
export function bindPay(root, api) {
  const S = () => api.getState();
  root.querySelectorAll('input[name="pay-method"]').forEach(r => r.onchange = () => root.querySelectorAll('.pay-field').forEach(f => { f.hidden = f.dataset.for !== r.value; }));
  root.querySelectorAll('[data-pay-balance]').forEach(b => b.onclick = () => { const s = S(), r = s.serviceRequests.find(x => x.id === b.dataset.payBalance); const res = payBalance(s, r, pm(root)); if (res.error) return err(root, res.error); api.after(r, res); });
  root.querySelectorAll('[data-pay-cancel]').forEach(b => b.onclick = () => { const s = S(), r = s.serviceRequests.find(x => x.id === b.dataset.payCancel); const res = cancel(s, r, 'customer', root.querySelector('#cancel-reason')?.value || ''); if (res.error) return api.toast(res.error); api.save(); api.render(); api.toast(res.refund ? `Cancelled · ${inr(res.refund)} refund started` : 'Cancelled'); });
  root.querySelectorAll('[data-pay-instant]').forEach(b => b.onclick = () => { const res = payout(S(), b.dataset.payInstant, {instant: true, actor: 'Partner'}); api.save(); api.render(); api.toast(res.error || `${inr(res.amount)} sent to your account`); });
  root.querySelectorAll('[data-pay-retry]').forEach(b => b.onclick = () => { const res = retryPayout(S(), b.dataset.payRetry); api.save(); api.render(); api.toast(res.error || `${inr(res.amount)} sent`); });
  root.querySelectorAll('[data-pay-debt]').forEach(b => b.onclick = () => { const res = settleDebt(S(), b.dataset.payDebt, {method: 'upi', vpa: 'partner@okaxis'}); api.save(); api.render(); api.toast(res.error || 'Commission paid. You can take new jobs.'); });
  root.querySelectorAll('form[data-pay-account]').forEach(f => f.onsubmit = e => { e.preventDefault(); const v = String(new FormData(f).get('vpa') || '').trim(); if (!v) return; const s = S(); (s.payoutAccounts ||= {})[f.dataset.payAccount] = v.includes('@') ? {method: 'upi', vpa: v} : {method: 'bank', accountNumber: v.replace(/\D/g, '')}; api.save(); api.render(); api.toast('Payout account saved'); });
  root.querySelectorAll('[data-pay-check]').forEach(b => b.onclick = () => { const res = resolvePending(S(), b.dataset.payCheck); api.save(); api.render(); api.toast(res.length ? (res[0].result === 'confirmed' ? 'Payment confirmed by your bank' : 'Payment failed — nothing was charged') : 'Still processing'); });
  root.querySelector('[data-pay-clock]')?.addEventListener('click', () => { S().simClockDays = (S().simClockDays || 0) + 1; globalThis.__moveaiClockOffset = S().simClockDays; api.save(); api.render(); api.toast('Simulated clock moved forward 1 day'); });
  root.querySelector('[data-pay-recon]')?.addEventListener('click', () => { const r = runReconciliation(S()); api.save(); api.render(); api.toast(`Reconciliation: ${r.matched} matched, ${r.mismatches.length} mismatches`); });
  root.querySelector('[data-pay-weekly]')?.addEventListener('click', () => { const res = runWeeklyPayouts(S()); api.save(); api.render(); api.toast(`${res.filter(r => r.ok).length} payouts sent, ${res.filter(r => r.error).length} failed`); });
}

export function pricingRulesScreen(state) {
  const rules = state.pricingRules || [];
  const t = state.pricingTest || {service: 'moving', city: 'Noida', partner: 'movers'};
  const res = resolvePricing(state, t);
  const pc = v => v === '' || v == null ? '—' : `${Math.round(Number(v) * 1000) / 10}%`, rs = v => v === '' || v == null ? '—' : inr(v);
  return `<div class="page-header"><div><h1>Pricing rules</h1><p>Standard: moving 10% commission, 20% booking (min ₹500); drivers 12%; home services 15%; cancellation 10% (₹299–₹1,500) after crew is assigned. Rules override these by service, city, dates or partner — the most specific wins. Every booking keeps the rules it was made under.</p></div><button class="button secondary" data-route="payOps">Back to MoveAI Pay</button></div>
  <section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Rule</th><th>Applies to</th><th>Commission</th><th>Booking</th><th>Cancellation</th><th>Dates</th><th>Why</th><th></th></tr></thead><tbody>${rules.map(r => `<tr class="${r.active ? '' : 'held'}"><td><b>${esc(r.id)}</b><small class="block muted">${esc(r.createdBy)} · ${esc(r.createdAt)}</small></td><td>${esc(r.service)}${r.city ? ` · ${esc(r.city)}` : ''}${r.partner ? ` · ${esc(r.partner)}` : ''}</td><td>${pc(r.commission)}</td><td>${pc(r.bookingPct)}${r.bookingMin !== '' ? ` min ${rs(r.bookingMin)}` : ''}</td><td>${pc(r.cancelPct)} ${r.cancelMin !== '' || r.cancelMax !== '' ? `(${rs(r.cancelMin)}–${rs(r.cancelMax)})` : ''}</td><td>${esc(r.from || 'any')} → ${esc(r.to || 'any')}</td><td>${esc(r.note)}</td><td>${r.active ? `<button class="button secondary compact" data-pr-off="${r.id}">Deactivate</button>` : pill('inactive')}</td></tr>`).join('') || '<tr><td colspan="8">No rules yet — standard rates apply.</td></tr>'}</tbody></table></div></section>
  <div class="grid two"><section class="panel"><h2>Add a rule</h2><form class="form-grid two" data-pr-form="add"><label><span>Service</span><select name="service"><option value="moving">Moving</option><option value="driver">Personal driver</option><option value="general">Home services</option><option value="all">All services</option></select></label><label><span>City (in pickup address, optional)</span><input name="city" placeholder="e.g. Patna"></label><label><span>Partner (optional)</span><select name="partner"><option value="">Any partner</option><option value="movers">SafeMove Packers</option><option value="personalDriver">Anil Kumar (driver)</option></select></label><label><span>From</span><input type="date" name="from"></label><label><span>To</span><input type="date" name="to"></label><label><span>Commission %</span><input type="number" step="0.5" name="commission"></label><label><span>Booking %</span><input type="number" step="1" name="bookingPct"></label><label><span>Booking minimum ₹</span><input type="number" name="bookingMin"></label><label><span>Cancellation %</span><input type="number" step="1" name="cancelPct"></label><label><span>Cancellation min ₹</span><input type="number" name="cancelMin"></label><label><span>Cancellation max ₹</span><input type="number" name="cancelMax"></label><label class="wide"><span>Why (audit note)</span><input name="note" placeholder="e.g. Patna launch offer"></label><p id="pr-error" class="field-error wide" hidden></p><button class="button primary wide" type="submit">Add rule</button><p class="mock-hint wide">Leave a value blank to keep the standard rate for it.</p></form></section>
  <section class="panel"><h2>Which rates apply?</h2><form class="form-grid two" data-pr-form="test"><label><span>Service</span><select name="service">${['moving', 'driver', 'general'].map(x => `<option ${t.service === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label><span>Pickup city</span><input name="city" value="${esc(t.city)}"></label><label><span>Partner</span><select name="partner"><option value="">—</option><option value="movers" ${t.partner === 'movers' ? 'selected' : ''}>SafeMove Packers</option><option value="personalDriver" ${t.partner === 'personalDriver' ? 'selected' : ''}>Anil Kumar</option></select></label><label><span>Date</span><input type="date" name="date" value="${esc(t.date || '')}"></label><button class="button secondary wide" type="submit">Check</button></form>
  <table class="price-table"><tbody><tr><td>Commission</td><td>${pc(res.commission)}</td></tr><tr><td>Booking</td><td>${pc(res.bookingPct)} (min ${rs(res.bookingMin)})</td></tr><tr><td>Cancellation</td><td>${pc(res.cancelPct)} (${rs(res.cancelMin)}–${rs(res.cancelMax)})</td></tr><tr class="total"><td>Source</td><td>${esc(res.label)}</td></tr></tbody></table></section></div>`;
}
export function bindPricing(root, api) {
  const S = () => api.getState();
  root.querySelectorAll('[data-pr-off]').forEach(b => b.onclick = () => { const r = S().pricingRules.find(x => x.id === b.dataset.prOff); r.active = false; r.deactivatedAt = stamp(); api.save(); api.render(); api.toast(`${r.id} deactivated. Existing bookings keep their rates.`); });
  root.querySelectorAll('form[data-pr-form]').forEach(f => f.onsubmit = e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(f));
    if (f.dataset.prForm === 'test') { S().pricingTest = fd; api.save(); return api.render(); }
    for (const k of ['commission', 'bookingPct', 'cancelPct']) if (fd[k] !== '') fd[k] = Number(fd[k]) / 100;
    const r = addRule(S(), fd, 'Admin Neha'); if (r.error) { const el = root.querySelector('#pr-error'); el.textContent = r.error; el.hidden = false; return; }
    api.save(); api.render(); api.toast(`${r.rule.id} added. It applies to new bookings only.`);
  });
}
