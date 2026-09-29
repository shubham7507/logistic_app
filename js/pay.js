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
export const TEST = 'Prototype: UPI fail@upi or card ending 0002 → payment fails. Payout account ending 000 or fail@upi → payout fails.';
const PAID = ['paid', 'confirmed', 'closed', 'released', 'refunded'];
const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
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
    return {ok: true, ref: `pay_${Math.random().toString(36).slice(2, 12)}`};
  },
  refund(ref, amount) { return {ok: true, ref: `rfnd_${Math.random().toString(36).slice(2, 10)}`, amount}; },
  payout(account, amount) {
    if (!account) return {ok: false, reason: 'Add a payout account first.'};
    const id = String(account.vpa || account.accountNumber || '');
    if (id.toLowerCase() === 'fail@upi' || /000$/.test(id)) return {ok: false, reason: 'Bank rejected the transfer (account details do not match). Update the payout account and retry.'};
    return {ok: true, ref: `pout_${Math.random().toString(36).slice(2, 10)}`, amount};
  },
};

// ---------- ledger access (the one place that writes money records) ----------
export function record(state, e, actor = 'MoveAI Pay') {
  const entry = {id: uid('PAY'), channel: 'moveai_pay', history: [{action: 'created', status: e.status, actor, at: stamp()}], ...e};
  state.ledger.unshift(entry);
  return entry;
}
const setStatus = (e, status, actor, note) => { e.status = status; (e.history ||= []).push({action: status, status, actor, at: stamp(), note}); };

// ---------- consumer bookings ----------
export const serviceType = r => r.type === 'moving' ? 'moving' : r.type === 'driver' ? 'driver' : 'general';
export function bookingAmount(type, total) { const b = POLICY.booking[type] || {pct: 0, min: 0}; return b.pct ? Math.min(total, Math.max(b.min, round(total * b.pct))) : 0; }
export const payeeOf = (state, r) => r.movingJobId ? (state.movingJobs.find(j => j.id === r.movingJobId)?.owner || 'movers') : r.type === 'driver' ? (r.provider || 'personalDriver') : 'external:service-partner';
export const holdsOf = (state, r) => state.ledger.filter(x => x.serviceId === r.id && x.type === 'customer_payment');
export function paySummary(state, r) {
  const total = round(r.quote?.total);
  const hs = holdsOf(state, r).filter(x => x.status !== 'refunded');
  const paidOnline = hs.filter(x => x.channel !== 'cash').reduce((s, x) => s + x.amount, 0);
  const cash = hs.filter(x => x.channel === 'cash').reduce((s, x) => s + x.amount, 0);
  const refunded = state.ledger.filter(x => x.serviceId === r.id && x.type === 'refund').reduce((s, x) => s + x.amount, 0);
  const fee = state.ledger.filter(x => x.serviceId === r.id && x.type === 'cancellation_fee').reduce((s, x) => s + x.amount, 0);
  return {total, paidOnline, cash, held: hs.filter(x => x.status === 'held').reduce((s, x) => s + x.amount, 0), due: r.status === 'cancelled' ? 0 : Math.max(0, total - paidOnline - cash), refunded, fee};
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
export function holdBooking(state, r, pm, ref, amount) {
  return record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'booking', payer: 'personal', payee: payeeOf(state, r), responsible: 'personal', amount, method: pm.method, reference: ref, status: 'held', note: `Booking amount ${r.id} · held until the job is done`}, 'Customer');
}
export function payBalance(state, r, pm) {
  const s = paySummary(state, r); if (!s.due) return {error: 'Nothing left to pay.'};
  if (pm.method === 'cash') {
    const e = record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'balance', payer: 'personal', payee: payeeOf(state, r), responsible: 'personal', amount: s.due, method: 'cash', channel: 'cash', reference: `CASH-${r.id}`, status: 'confirmed', note: `Balance paid in cash ${r.id}`}, 'Customer');
    cashCommission(state, r, e.amount);
    r.paid = true; return {ok: true, amount: s.due, cash: true};
  }
  const g = gateway.collect({...pm, amount: s.due}); if (!g.ok) return {error: g.reason};
  record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'balance', payer: 'personal', payee: payeeOf(state, r), responsible: 'personal', amount: s.due, method: pm.method, reference: g.ref, status: 'held', note: `Balance ${r.id}`}, 'Customer');
  r.paid = true;
  return {ok: true, amount: s.due};
}
// Partner collected cash: commission becomes wallet debt.
export function cashCommission(state, r, amount) {
  const rate = POLICY.commission[serviceType(r)], party = payeeOf(state, r);
  record(state, {owner: party, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'cash_commission', payer: party, payee: 'moveai', responsible: party, amount: round(amount * rate), method: 'wallet', reference: `COMM-${r.id}`, status: 'confirmed', note: `${Math.round(rate * 100)}% commission on ${inr(amount)} cash · recovered from wallet`});
}
// Job done (completion OTP / customer confirmation): release everything held to the partner, minus commission.
export function release(state, r, actor = 'MoveAI Pay') {
  const held = holdsOf(state, r).filter(x => x.status === 'held');
  if (!held.length) return {ok: true, amount: 0};
  const gross = held.reduce((s, x) => s + x.amount, 0), rate = POLICY.commission[serviceType(r)], party = payeeOf(state, r);
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
  const c = POLICY.cancellation, fee = assigned ? Math.min(c.max, Math.max(c.min, round(s.total * c.pct)), s.paidOnline || c.max) : 0;
  return {allowed: true, fee: Math.min(fee, s.paidOnline), refund: s.paidOnline - Math.min(fee, s.paidOnline), note: assigned ? 'Crew or driver already assigned, so a cancellation fee applies.' : 'Free cancellation before crew is assigned.'};
}
export function cancel(state, r, by = 'customer', reason = '') {
  const q = cancellationQuote(state, r, by); if (!q.allowed) return {error: q.reason};
  const party = payeeOf(state, r);
  const held = holdsOf(state, r).filter(x => x.status === 'held');
  held.forEach(x => setStatus(x, 'refunded', by, reason));
  if (q.refund) { const g = gateway.refund(held[0]?.reference, q.refund); record(state, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: party, amount: q.refund, method: held[0]?.method || 'upi', reference: g.ref, status: 'refunded', note: `Refund to original payment method · ${r.id}`}); }
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
  const e = record(state, {owner: party, sourceType: 'wallet', sourceId: party, type: 'payout', payer: 'moveai', payee: party, responsible: 'moveai', amount, fee, method: account?.method || 'bank', reference: g.ref || 'failed', status: g.ok ? 'paid' : 'failed', failReason: g.reason || '', instant, note: `${instant ? 'Instant' : 'Weekly'} payout to ${account ? (account.vpa || `A/c ••${String(account.accountNumber).slice(-4)}`) : 'no account'}${fee ? ` (₹${fee} fee)` : ''}`}, actor);
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

// ---------- screens ----------
export function checkoutHtml(type, total) {
  const now = bookingAmount(type, total);
  if (!now) return `<div class="pay-box"><h3>Payment</h3><p>Nothing to pay now. You pay ${inr(total)} after the work is done — by UPI, card or cash. MoveAI holds online payments until you confirm the work.</p></div>`;
  return `<div class="pay-box"><h3>Pay the booking amount to confirm</h3><p>${inr(now)} now · ${inr(total - now)} after the job. MoveAI Pay holds your money until you share the completion OTP.</p>
  <div class="pay-methods"><label><input type="radio" name="pay-method" value="upi" checked> UPI</label><label><input type="radio" name="pay-method" value="card"> Card</label></div>
  <label class="pay-field" data-for="upi"><span>UPI ID</span><input id="pay-vpa" value="shubham@okaxis" autocomplete="off"></label><label class="pay-field" data-for="card" hidden><span>Card number</span><input id="pay-card" inputmode="numeric" placeholder="4111 1111 1111 1111"></label>
  <p class="muted">Free cancellation until crew is assigned; after that ${Math.round(POLICY.cancellation.pct * 100)}% (min ${inr(POLICY.cancellation.min)}, max ${inr(POLICY.cancellation.max)}). Full refund if the partner does not show up.</p><p class="mock-hint">${esc(TEST)}</p><p id="pay-error" class="field-error" hidden></p></div>`;
}
export function servicePayPanel(state, r) {
  const s = paySummary(state, r), q = cancellationQuote(state, r);
  const refunds = state.ledger.filter(x => x.serviceId === r.id && x.type === 'refund');
  return `<section class="panel pay-panel"><h2>Payment · MoveAI Pay</h2><table class="price-table"><tbody><tr><td>Total</td><td>${inr(s.total)}</td></tr><tr><td>Paid online${s.held ? ' (held until done)' : ''}</td><td>${inr(s.paidOnline)}</td></tr>${s.cash ? `<tr><td>Paid in cash</td><td>${inr(s.cash)}</td></tr>` : ''}${s.fee ? `<tr><td>Cancellation fee</td><td>${inr(s.fee)}</td></tr>` : ''}${s.refunded ? `<tr><td>Refunded</td><td>${inr(s.refunded)}</td></tr>` : ''}<tr class="total"><td>${r.status === 'cancelled' ? 'Status' : 'Still to pay'}</td><td>${r.status === 'cancelled' ? 'Cancelled' : inr(s.due)}</td></tr></tbody></table>
  ${refunds.map(x => `<p class="muted">Refund ${inr(x.amount)} to your ${esc(x.method.toUpperCase())} · ${esc(x.reference)} · usually 3–5 working days</p>`).join('')}
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
  return `<div class="page-header"><div><h1>MoveAI Pay</h1><p>Money held for customers, refunds, partner wallets and payouts. Funds sit with the licensed payment aggregator, not in MoveAI's own account.</p></div><button class="button primary" data-pay-weekly>Run weekly payouts</button></div>
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
  root.querySelector('[data-pay-weekly]')?.addEventListener('click', () => { const res = runWeeklyPayouts(S()); api.save(); api.render(); api.toast(`${res.filter(r => r.ok).length} payouts sent, ${res.filter(r => r.error).length} failed`); });
}
