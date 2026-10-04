// MoveAI One — freight billing, phase 1 (records only; money moves by the businesses' own bank transfers).
// Invoices per trip with GST mode and TDS, credit terms or advance + balance tied to trip milestones,
// extra charges and shortage adjustments with approval, part payments confirmed by the issuer, reminders,
// credit limits / overdue rules, e-way bill check and a Tally-friendly export.
// Tax defaults are placeholders the business must confirm with its CA; every rate is a setting.
import {esc, pill, inr, opsCtx} from './ops.js';
import {record, gateway} from './pay.js';
import * as Gst from './gst-portal.js';

const DAY = 86400000;
const BIZ = ['goods', 'transporter', 'vehicle', 'movers'];
const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const iso = d => new Date(d).toISOString().slice(0, 10);
const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}) : '—';
const today = () => iso(Date.now());
const addDays = (d, n) => iso(new Date(d).getTime() + n * DAY);
const round = n => Math.round(Number(n) || 0);
const head = (title, text, action = '') => `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
export const CHARGE_KINDS = {detention: 'Detention / waiting', extra_drop: 'Extra drop point', loading: 'Loading / unloading', toll: 'Toll (if billed)', other: 'Other'};
export const GST_MODES = {rcm: 'GST paid by the recipient (reverse charge)', forward: 'GST charged on this invoice (forward charge)', exempt: 'No GST on this invoice (exempt / unregistered)'};

let syncing = false;
// ---------- setup ----------
export function ensureFreight(state) {
  state.freightSettings ||= {
    transporter: {legalName: 'Raj Logistics', gstin: '09AAEFR4521K1Z3', pan: 'AAEFR4521K', entity: 'Partnership', prefix: 'RL', nextNo: 3, gstMode: 'rcm', rcmRate: 5, forwardRate: 12, address: 'Sector 63, Noida, Uttar Pradesh', einvoice: true, gtaExempt: true},
    goods: {legalName: 'Sharma Foods', gstin: '10AAKFS7788M1Z2', pan: 'AAKFS7788M', entity: 'Partnership', prefix: 'SF', nextNo: 1, gstMode: 'rcm', rcmRate: 5, forwardRate: 12, address: 'Bihta Industrial Area, Patna, Bihar', tdsDeductor: true},
    vehicle: {legalName: 'Raj Transport', gstin: '', pan: 'BKQPG4412C', entity: 'Proprietorship', prefix: 'RT', nextNo: 2, gstMode: 'exempt', rcmRate: 5, forwardRate: 12, address: 'Transport Nagar, Patna, Bihar', trucksOwned: 8, tdsDeclaration: true},
    movers: {legalName: 'SafeMove Packers', gstin: '09AAOCS3321P1Z9', pan: 'AAOCS3321P', entity: 'Private Limited', prefix: 'SM', nextNo: 1, gstMode: 'forward', rcmRate: 5, forwardRate: 18, address: 'Sector 18, Noida, Uttar Pradesh'},
  };
  for (const k of BIZ) state.freightSettings[k].tds ||= {single: 30000, annual: 100000, rateIndividual: 1, rateOthers: 2};
  state.freightSettings.transporter.tdsDeductor ??= true;
  state.freightParties ||= {transporter: {goods: {creditDays: 30, creditLimit: 150000, blockWhenOverdueDays: 15}}, vehicle: {transporter: {creditDays: 7, creditLimit: 100000, blockWhenOverdueDays: 0}}};
  state.ewayBills ||= {};
  if (!state.freightInvoices) {
    state.freightInvoices = [];
    const t501 = state.trips.find(t => t.id === 'TRP-501'), t504 = state.trips.find(t => t.id === 'TRP-504');
    createInvoice(state, {issuer: 'transporter', tripId: 'TRP-488', tripTitle: 'Sugar bags · Muzaffarpur → Noida', billTo: 'goods', freight: 36000, terms: {type: 'credit', creditDays: 30}, issueDate: addDays(today(), -50), gstMode: 'rcm'}, true);
    if (t504) createInvoice(state, {issuer: 'transporter', tripId: 'TRP-504', billTo: 'goods', freight: t504.terms?.freight || 41000, terms: {type: 'advance_balance', advance: 8000, creditDays: 30}, issueDate: '2026-09-26', gstMode: 'rcm'}, true);
    if (t501) createInvoice(state, {issuer: 'transporter', tripId: 'TRP-501', billTo: 'goods', freight: t501.terms?.freight || 62000, terms: {type: 'advance_balance', advance: t501.terms?.advance || 12000, creditDays: 0}, issueDate: '2026-09-27', gstMode: 'rcm'}, true);
    if (t501) createInvoice(state, {issuer: 'vehicle', tripId: 'TRP-501', billTo: 'transporter', freight: t501.terms?.truckOwnerPayout || 54000, terms: {type: 'advance_balance', advance: 10000, creditDays: 7}, issueDate: '2026-09-27', gstMode: 'exempt'}, true);
  }
  if (!syncing) { syncing = true; try { for (const inv of state.freightInvoices) if (inv.protected) protectSync(state, inv); } finally { syncing = false; } }
  return state;
}
const S = (state, ws) => ensureFreight(state).freightSettings[ws] || {};
const partyTerms = (state, issuer, payer) => state.freightParties?.[issuer]?.[payer] || {creditDays: 0, creditLimit: 0, blockWhenOverdueDays: 0};
export const nameOf = (state, ws) => state.freightSettings?.[ws]?.legalName || state.businessProfiles?.[ws]?.legalName || ws;

// ---------- invoice maths ----------
export function tdsFor(state, inv) {
  const payer = S(state, inv.billTo), payee = S(state, inv.issuer), cfg = payee.tds || {single: 30000, annual: 100000, rateIndividual: 1, rateOthers: 2};
  if (!payer.tdsDeductor) return {applicable: false, reason: `${nameOf(state, inv.billTo)} is not set up to deduct TDS`, rate: 0, amount: 0};
  if (payee.tdsDeclaration && (payee.trucksOwned || 0) <= 10 && payee.pan) return {applicable: false, reason: `${nameOf(state, inv.issuer)} declared ≤10 trucks with PAN ${payee.pan} — exempt`, rate: 0, amount: 0};
  const annual = state.freightInvoices.filter(x => x.issuer === inv.issuer && x.billTo === inv.billTo && x.id !== inv.id && x.status !== 'cancelled').reduce((s, x) => s + amounts(state, x, true).taxable, 0);
  const base = amounts(state, inv, true).taxable;
  if (base <= cfg.single && annual + base <= cfg.annual) return {applicable: false, reason: `Below the thresholds (₹${cfg.single.toLocaleString('en-IN')} single / ₹${cfg.annual.toLocaleString('en-IN')} a year)`, rate: 0, amount: 0};
  const rate = ['Proprietorship', 'Individual', 'HUF'].includes(payee.entity) ? cfg.rateIndividual : cfg.rateOthers;
  return {applicable: true, section: '194C', rate, amount: round(base * rate / 100), reason: `${rate}% under section 194C on ₹${base.toLocaleString('en-IN')} (excluding GST)`};
}
export function amounts(state, inv, skipTds = false) {
  const charges = inv.charges.filter(c => c.status === 'approved').reduce((s, c) => s + c.amount, 0);
  const adjust = inv.adjustments.filter(a => a.status === 'accepted').reduce((s, a) => s + a.amount, 0);
  const held = inv.adjustments.filter(a => a.status === 'disputed').reduce((s, a) => s + a.amount, 0);
  const taxable = inv.freight + charges - adjust;
  const set = S(state, inv.issuer);
  const gstRate = inv.gstMode === 'forward' ? set.forwardRate : inv.gstMode === 'rcm' ? set.rcmRate : 0;
  const gst = inv.gstMode === 'forward' ? round(taxable * gstRate / 100) : 0;
  const total = taxable + gst;
  const pays = paymentsOf(state, inv);
  const cash = pays.filter(p => p.type === 'freight' && p.status !== 'reversed').reduce((s, p) => s + p.amount, 0);
  const confirmed = pays.filter(p => p.type === 'freight' && p.status === 'confirmed').reduce((s, p) => s + p.amount, 0);
  const tdsDone = pays.filter(p => p.type === 'tds' && p.status !== 'reversed').reduce((s, p) => s + p.amount, 0);
  const tds = skipTds ? {amount: 0} : tdsFor(state, inv);
  const outstanding = Math.max(0, total - cash - tdsDone - held);
  return {charges, adjust, held, taxable, gstRate, gst, rcmGst: inv.gstMode === 'rcm' ? round(taxable * gstRate / 100) : 0, total, cash, confirmed, tdsDone, tds, tdsPending: Math.max(0, (tds.amount || 0) - tdsDone), outstanding};
}
export function paymentsOf(state, inv) {
  return state.ledger.filter(x => x.invoiceId === inv.id || (!x.invoiceId && x.type === 'freight' && x.sourceId === inv.tripId && x.payer === inv.billTo && x.payee === inv.issuer && inv.tripId));
}
function podDate(state, inv) {
  const t = state.trips.find(x => x.id === inv.tripId);
  const m = t?.milestones?.find(x => x.key === 'delivered' && x.status === 'done');
  return m ? iso(m.at && !isNaN(new Date(m.at)) ? m.at : t.window?.to || Date.now()) : null;
}
function loaded(state, inv) { const t = state.trips.find(x => x.id === inv.tripId); return !t || t.milestones?.some(m => m.key === 'loaded' && m.status === 'done'); }
export function schedule(state, inv) {
  const a = amounts(state, inv);
  if (inv.terms.type === 'credit') return [{label: `Full amount · ${inv.terms.creditDays} days credit`, amount: a.total, due: addDays(inv.issueDate, inv.terms.creditDays), trigger: 'invoice date'}];
  const adv = Math.min(inv.terms.advance || 0, a.total), pod = podDate(state, inv);
  return [{label: 'Advance at loading', amount: adv, due: loaded(state, inv) ? inv.issueDate : null, trigger: loaded(state, inv) ? 'loaded ✓' : 'when loaded'}, {label: `Balance after delivery proof${inv.terms.creditDays ? ` + ${inv.terms.creditDays} days` : ''}`, amount: a.total - adv, due: pod ? addDays(pod, inv.terms.creditDays || 0) : null, trigger: pod ? `POD ${fmt(pod)}` : 'after POD'}];
}
export function dueState(state, inv) {
  const a = amounts(state, inv); if (inv.status === 'cancelled') return {status: 'cancelled', overdueDays: 0, dueNow: 0};
  if (a.outstanding <= 0 && !a.held) return {status: a.cash > a.confirmed ? 'awaiting_confirmation' : 'paid', overdueDays: 0, dueNow: 0};
  let paidSoFar = a.cash + a.tdsDone, dueNow = 0, overdueDays = 0, next = null;
  for (const st of schedule(state, inv)) {
    const covered = Math.min(paidSoFar, st.amount); paidSoFar -= covered; const left = st.amount - covered;
    if (left <= 0) continue;
    if (st.due && st.due <= today()) { dueNow += left; overdueDays = Math.max(overdueDays, Math.floor((new Date(today()) - new Date(st.due)) / DAY)); }
    else if (!next) next = st;
  }
  dueNow = Math.max(0, dueNow - a.held);
  return {status: overdueDays > 0 && dueNow > 0 ? 'overdue' : dueNow > 0 ? 'due' : a.cash > 0 ? 'part_paid' : 'issued', overdueDays: dueNow > 0 ? overdueDays : 0, dueNow, next};
}
export function creditStatus(state, issuer, payer) {
  const invs = state.freightInvoices.filter(x => x.issuer === issuer && x.billTo === payer && x.status !== 'cancelled');
  const outstanding = invs.reduce((s, x) => s + amounts(state, x).outstanding, 0);
  const overdue = invs.map(x => dueState(state, x)).filter(d => d.status === 'overdue');
  const t = partyTerms(state, issuer, payer), maxDays = Math.max(0, ...overdue.map(d => d.overdueDays));
  const overLimit = t.creditLimit && outstanding > t.creditLimit;
  const blocked = (t.blockWhenOverdueDays && maxDays >= t.blockWhenOverdueDays) || overLimit;
  return {outstanding, overdueAmount: overdue.reduce((s, d) => s + d.dueNow, 0), maxDays, overLimit, blocked, terms: t, reason: blocked ? (overLimit ? `Outstanding ${inr(outstanding)} is above the ${inr(t.creditLimit)} credit limit` : `Overdue ${maxDays} days (your rule: pause new trips after ${t.blockWhenOverdueDays})`) : ''};
}

// ---------- actions ----------
export function createInvoice(state, v, seeding = false) {
  const set = S(state, v.issuer);
  if (!v.billTo || v.billTo === v.issuer) return {error: 'Choose who you are billing.'};
  if (!(Number(v.freight) > 0)) return {error: 'Enter the freight amount.'};
  if (!seeding && v.tripId && state.freightInvoices.some(x => x.issuer === v.issuer && x.tripId === v.tripId && x.billTo === v.billTo && x.status !== 'cancelled')) return {error: 'An invoice already exists for this trip. Open it instead.'};
  const t = state.trips.find(x => x.id === v.tripId);
  const order = t?.goodsOrderId && (state.goodsOrders || []).find(o => o.id === t.goodsOrderId);
  const dt = new Date(v.issueDate || Date.now()), fy = dt.getMonth() < 3 ? dt.getFullYear() - 1 : dt.getFullYear(); // Indian financial year starts 1 April
  const no = `${set.prefix}/${fy % 100}-${(fy + 1) % 100}/${String(set.nextNo++).padStart(4, '0')}`;
  const inv = {id: `INV-${v.issuer.slice(0, 2).toUpperCase()}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4)}`, number: no, issuer: v.issuer, billTo: v.billTo, tripId: v.tripId || null, tripTitle: v.tripTitle || t?.title || '', goodsValue: order?.goodsPrice || v.goodsValue || 0, freight: round(v.freight), sac: '996511', gstMode: v.gstMode || set.gstMode, terms: v.terms || {type: 'credit', creditDays: partyTerms(state, v.issuer, v.billTo).creditDays}, issueDate: v.issueDate || today(), charges: [], adjustments: [], reminders: [], revision: 1, status: 'issued', history: [{at: stamp(), text: `Invoice ${no} issued`}]};
  if (t?.receipt?.deduction && v.issuer !== 'vehicle') inv.adjustments.push({id: `ADJ-${Date.now().toString().slice(-4)}`, kind: 'shortage', amount: round(t.receipt.deduction), note: `Shortage at receipt: ${t.receipt.quantity} ${t.unit} received`, status: 'proposed', by: v.billTo});
  state.freightInvoices.unshift(inv);
  if (!seeding) (state.notifications ||= []).unshift({id: `NT-${Date.now()}`, to: v.billTo, text: `${nameOf(state, v.issuer)} sent invoice ${no} for ${inr(amounts(state, inv).total)}`, ref: inv.id, at: stamp(), read: false});
  return {ok: true, inv};
}
export function proposeCharge(state, inv, v) {
  if (!CHARGE_KINDS[v.kind]) return 'Choose the charge type.';
  if (!(Number(v.amount) > 0)) return 'Enter the amount.';
  if (!String(v.evidence || '').trim()) return 'Attach evidence (gate-in slip, photo or message).';
  if (dueState(state, inv).status === 'paid') return 'This invoice is already paid. Raise a new invoice for extra charges.';
  inv.charges.push({id: `CHG-${Date.now().toString().slice(-5)}`, kind: v.kind, amount: round(v.amount), note: String(v.note || '').trim(), evidence: v.evidence, status: 'proposed', at: stamp()});
  inv.history.push({at: stamp(), text: `${CHARGE_KINDS[v.kind]} ${inr(v.amount)} proposed`});
  return '';
}
export function decideCharge(state, inv, id, decision, actorWs) {
  const c = inv.charges.find(x => x.id === id); if (!c || c.status !== 'proposed') return 'Nothing to decide.';
  if (actorWs !== inv.billTo) return 'Only the party being billed can approve a charge.';
  c.status = decision === 'approve' ? 'approved' : 'rejected';
  if (decision === 'approve' && inv.locked) { addNote(state, inv, 'debit', c.amount, `${CHARGE_KINDS[c.kind]}${c.note ? ` · ${c.note}` : ''}`); } else inv.revision += decision === 'approve' ? 1 : 0;
  inv.history.push({at: stamp(), text: `${CHARGE_KINDS[c.kind]} ${inr(c.amount)} ${c.status}${decision === 'approve' ? ` · invoice revised to v${inv.revision}` : ''}`});
  return '';
}
export function decideAdjustment(state, inv, id, decision, actorWs) {
  const a = inv.adjustments.find(x => x.id === id); if (!a) return 'Not found.';
  if (decision === 'accept' || decision === 'dispute') { if (actorWs !== inv.issuer) return 'Only the invoice issuer can accept or dispute a deduction.'; a.status = decision === 'accept' ? 'accepted' : 'disputed'; }
  else if (decision === 'withdraw') { if (actorWs !== inv.billTo) return 'Only the party that proposed it can withdraw.'; a.status = 'withdrawn'; }
  else if (decision === 'settle') { a.status = 'accepted'; a.note += ' · settled after review'; }
  inv.history.push({at: stamp(), text: `Shortage deduction ${inr(a.amount)} ${a.status}`});
  if (a.status === 'accepted') { if (inv.locked) addNote(state, inv, 'credit', a.amount, a.note); else inv.revision += 1; }
  return '';
}
export function recordPayment(state, inv, v, actor) {
  const a = amounts(state, inv), amount = round(v.amount), tds = round(v.tds || 0);
  if (!(amount > 0) && !(tds > 0)) return 'Enter the amount paid.';
  if (amount + tds > a.outstanding + 1) return `That is more than the ${inr(a.outstanding)} outstanding${a.held ? ` (₹${a.held.toLocaleString('en-IN')} is held in dispute)` : ''}.`;
  if (amount > 0 && v.method !== 'cash' && !String(v.reference || '').trim()) return 'Enter the UTR / cheque number so the other side can match it.';
  if (tds > a.tdsPending) return `TDS is ${inr(a.tdsPending)} at most for this invoice.`;
  if (amount > 0) record(state, {owner: inv.billTo, invoiceId: inv.id, sourceType: 'invoice', sourceId: inv.tripId || inv.id, type: 'freight', direction: 'payable', payer: inv.billTo, payee: inv.issuer, responsible: inv.billTo, amount, method: v.method, reference: String(v.reference || `CASH-${Date.now().toString().slice(-5)}`).trim(), channel: 'outside', status: 'paid', paidOn: v.date || today(), note: `${inv.number} · ${v.kind || 'payment'}`}, actor);
  if (tds > 0) record(state, {owner: inv.billTo, invoiceId: inv.id, sourceType: 'invoice', sourceId: inv.id, type: 'tds', direction: 'payable', payer: inv.billTo, payee: 'govt', responsible: inv.billTo, amount: tds, method: 'challan', reference: `TDS-194C-${inv.number}`, channel: 'outside', status: 'deducted', certificate: 'pending', note: `TDS 194C on ${inv.number} for ${nameOf(state, inv.issuer)}`}, actor);
  inv.history.push({at: stamp(), text: `${nameOf(state, inv.billTo)} recorded ${amount ? `${inr(amount)} by ${String(v.method).toUpperCase()}` : ''}${amount && tds ? ' + ' : ''}${tds ? `TDS ${inr(tds)}` : ''}`});
  (state.notifications ||= []).unshift({id: `NT-${Date.now()}`, to: inv.issuer, text: `${nameOf(state, inv.billTo)} recorded ${inr(amount)} against ${inv.number}. Confirm when it reaches your bank.`, ref: inv.id, at: stamp(), read: false});
  return '';
}
export function confirmPayment(state, inv, ledgerId, actorWs) {
  const p = state.ledger.find(x => x.id === ledgerId && (x.invoiceId === inv.id || paymentsOf(state, inv).includes(x))); if (!p) return 'Payment not found.';
  if (actorWs !== inv.issuer) return 'Only the receiver confirms a payment.';
  p.status = 'confirmed'; (p.history ||= []).push({action: 'confirmed', status: 'confirmed', at: stamp()}); inv.history.push({at: stamp(), text: `Receipt of ${inr(p.amount)} confirmed`});
  return '';
}
export function tdsCertificate(state, ledgerId, actorWs) { const p = state.ledger.find(x => x.id === ledgerId && x.type === 'tds'); if (!p) return 'Not found.'; if (actorWs === p.payer) { p.certificate = 'issued'; return ''; } if (actorWs === (state.freightInvoices.find(i => i.id === p.invoiceId)?.issuer)) { p.certificate = p.certificate === 'issued' ? 'received' : p.certificate; return ''; } return 'Not allowed.'; }
export function remindersFor(state, inv) {
  const d = dueState(state, inv); const due = d.status === 'overdue' || d.status === 'due' ? schedule(state, inv).find(s => s.due && s.due <= today())?.due : d.next?.due;
  if (!due) return [];
  return [[-7, '7 days before'], [-1, '1 day before'], [0, 'On the due date'], [3, '3 days overdue'], [10, '10 days overdue']].map(([n, l]) => ({date: addDays(due, n), label: l, sent: inv.reminders.some(r => r.label === l)}));
}
export function sendReminder(state, inv) {
  const r = remindersFor(state, inv).filter(x => x.date <= today() && !x.sent).at(-1) || {label: 'Manual reminder', date: today()};
  inv.reminders.push({label: r.label, at: stamp()});
  (state.notifications ||= []).unshift({id: `NT-${Date.now()}`, to: inv.billTo, text: `Reminder from ${nameOf(state, inv.issuer)}: ${inv.number} has ${inr(amounts(state, inv).outstanding)} outstanding${dueState(state, inv).overdueDays ? ` (${dueState(state, inv).overdueDays} days overdue)` : ''}.`, ref: inv.id, at: stamp(), read: false});
  return r.label;
}
export function exportRows(state, ws) {
  const rows = [['Voucher Type', 'Date', 'Voucher No', 'Party', 'Party GSTIN', 'Ledger', 'Taxable', 'GST', 'GST mode', 'TDS', 'Amount', 'Reference', 'Narration']];
  for (const inv of state.freightInvoices.filter(i => i.issuer === ws || i.billTo === ws)) {
    const a = amounts(state, inv), sales = inv.issuer === ws, party = sales ? inv.billTo : inv.issuer;
    rows.push([sales ? 'Sales' : 'Purchase', inv.issueDate, inv.number, nameOf(state, party), S(state, party).gstin || '', 'Freight (SAC 996511)', a.taxable, a.gst, inv.gstMode, a.tds.amount || 0, a.total, inv.tripId || '', inv.tripTitle]);
    for (const p of paymentsOf(state, inv)) rows.push([p.type === 'tds' ? 'Journal (TDS)' : sales ? 'Receipt' : 'Payment', p.paidOn || inv.issueDate, p.id, nameOf(state, party), '', p.type === 'tds' ? 'TDS 194C' : 'Bank', '', '', '', p.type === 'tds' ? p.amount : '', p.amount, p.reference, `${inv.number} · ${p.status}`]);
  }
  return rows;
}
export const toCsv = rows => rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');

// ---------- screens ----------
const allowed = state => { const {ws, perms} = opsCtx(state); return BIZ.includes(ws) || (ws === 'staff' && perms.some(p => ['money.prepare', 'money.view'].includes(p))); };
export function invoicesScreen(state) {
  if (!allowed(state)) return head('Freight billing', 'Your role does not include billing.');
  const ws = opsCtx(state).ownerWs; ensureFreight(state);
  const tab = state.invoiceTab || (state.freightInvoices.some(i => i.issuer === ws) ? 'receivable' : 'payable');
  const list = state.freightInvoices.filter(i => tab === 'receivable' ? i.issuer === ws : i.billTo === ws);
  const sum = f => list.reduce((s, i) => s + f(i), 0);
  const overdue = list.filter(i => dueState(state, i).status === 'overdue');
  const tdsPend = tab === 'payable' ? sum(i => amounts(state, i).tdsPending) : state.ledger.filter(x => x.type === 'tds' && x.certificate !== 'received' && state.freightInvoices.some(i => i.id === x.invoiceId && i.issuer === ws)).length;
  const parties = [...new Set(state.freightInvoices.filter(i => i.issuer === ws).map(i => i.billTo))];
  return `${head('Freight billing', 'Invoices, credit terms, GST and TDS. Money moves by your own bank transfers; MoveAI keeps both sides in step.', `<span class="row-actions"><button class="button secondary" data-fr-export>Export for Tally (CSV)</button>${['transporter', 'vehicle'].includes(ws) ? '<button class="button primary" data-route="invoiceNew">+ New invoice</button>' : ''}</span>`)}
  <div class="people-tabs">${[['receivable', 'To receive'], ['payable', 'To pay']].map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-fr-tab="${k}">${l}</button>`).join('')}</div>
  <div class="metrics"><div class="metric"><span>Outstanding</span><b>${inr(sum(i => amounts(state, i).outstanding))}</b><small>${list.length} invoices</small></div><div class="metric"><span>Overdue</span><b class="${overdue.length ? 'amount out' : ''}">${inr(overdue.reduce((s, i) => s + dueState(state, i).dueNow, 0))}</b><small>${overdue.length} invoice(s)</small></div><div class="metric"><span>Held in dispute</span><b>${inr(sum(i => amounts(state, i).held))}</b><small>Not demanded until resolved</small></div><div class="metric"><span>${tab === 'payable' ? 'TDS to deduct' : 'TDS certificates pending'}</span><b>${tab === 'payable' ? inr(tdsPend) : tdsPend}</b><small>Section 194C</small></div></div>
  ${tab === 'receivable' ? parties.map(p => { const c = creditStatus(state, ws, p); return c.blocked ? `<div class="action-warning"><b>${esc(nameOf(state, p))}: new trips paused</b><span>${esc(c.reason)}. Change the rule under customer terms below.</span></div>` : ''; }).join('') : ''}
  <section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Invoice</th><th>${tab === 'receivable' ? 'Customer' : 'From'}</th><th>Trip</th><th>Total</th><th>Outstanding</th><th>Status</th><th>Next due</th><th></th></tr></thead><tbody>
  ${list.map(i => { const a = amounts(state, i), d = dueState(state, i); return `<tr><td><b>${esc(i.number)}</b><small class="block muted">${fmt(i.issueDate)}${i.revision > 1 ? ` · v${i.revision}` : ''}</small></td><td>${esc(nameOf(state, tab === 'receivable' ? i.billTo : i.issuer))}</td><td>${esc(i.tripId || '')}<small class="block muted">${esc(i.tripTitle)}</small></td><td>${inr(a.total)}</td><td><b>${inr(a.outstanding)}</b>${a.held ? `<small class="block muted">${inr(a.held)} held</small>` : ''}</td><td>${pill(d.status)}${d.overdueDays ? `<small class="block muted">${d.overdueDays} days</small>` : ''}</td><td>${d.dueNow ? `${inr(d.dueNow)} now` : d.next ? `${d.next.due ? fmt(d.next.due) : esc(d.next.trigger)}` : '—'}</td><td><button class="button secondary compact" data-fr-open="${i.id}">Open</button></td></tr>`; }).join('') || '<tr><td colspan="8">No invoices here yet.</td></tr>'}
  </tbody></table></div></section>
  ${tab === 'receivable' && parties.length ? `<section class="panel"><h2>Customer terms</h2>${parties.map(p => { const t = partyTerms(state, ws, p), c = creditStatus(state, ws, p); return `<form class="inline-form" data-fr-terms="${p}"><b>${esc(nameOf(state, p))}</b><label>Credit days <input type="number" name="creditDays" value="${t.creditDays}" min="0"></label><label>Credit limit ₹ <input type="number" name="creditLimit" value="${t.creditLimit}" min="0"></label><label>Pause new trips after overdue days (0 = never) <input type="number" name="blockWhenOverdueDays" value="${t.blockWhenOverdueDays}" min="0"></label><span class="muted">Outstanding ${inr(c.outstanding)}</span><button class="button secondary compact">Save</button></form>`; }).join('')}</section>` : ''}
  ${S(state, ws).einvoice ? `<section class="panel"><h2>E-invoicing</h2><p class="muted">${esc(nameOf(state, ws))} is above the e-invoicing turnover limit (setting).</p><label class="consent-row"><input type="checkbox" data-fr-gta ${S(state, ws).gtaExempt ? 'checked' : ''}> Our freight invoices are exempt as a goods transport agency (confirm with your CA). Untick to register IRNs.</label></section>` : ''}
  <p class="mock-hint">GST mode, rates and TDS thresholds are settings with placeholder defaults. Confirm them with your CA. <a href="#/ewayBills">E-way bills →</a></p>`;
}

export function invoiceNewScreen(state) {
  const ws = opsCtx(state).ownerWs; ensureFreight(state);
  const trips = state.trips.filter(t => ws === 'vehicle' ? t.vehicleOwner === 'vehicle' || t.parties?.includes('vehicle') : t.owner === ws).filter(t => (t.terms?.freight || t.terms?.truckOwnerPayout));
  const billTo = ws === 'vehicle' ? 'transporter' : 'goods';
  const set = S(state, ws), pt = partyTerms(state, ws, billTo);
  return `${head('New freight invoice', `${set.legalName} · GSTIN ${set.gstin || 'not registered'}`)}
  <form class="panel form-panel narrow" data-fr-form="new"><div class="form-grid two">
    <label class="wide"><span>Trip</span><select name="tripId">${trips.map(t => `<option value="${t.id}" data-amount="${ws === 'vehicle' ? t.terms.truckOwnerPayout : t.terms.freight}" data-advance="${ws === 'vehicle' ? 10000 : t.terms.advance || 0}">${esc(t.id)} · ${esc(t.title)}</option>`).join('')}</select></label>
    <label><span>Bill to</span><select name="billTo"><option value="${billTo}">${esc(nameOf(state, billTo))}</option></select></label>
    <label><span>Freight (₹, before GST)</span><input type="number" name="freight" value="${trips[0] ? (ws === 'vehicle' ? trips[0].terms.truckOwnerPayout : trips[0].terms.freight) : ''}"></label>
    <label><span>Payment terms</span><select name="termsType"><option value="advance_balance">Advance at loading, balance after delivery proof</option><option value="credit">Full amount on credit</option></select></label>
    <label><span>Advance (₹)</span><input type="number" name="advance" value="${trips[0] ? (ws === 'vehicle' ? 10000 : trips[0].terms.advance || 0) : 0}"></label>
    <label><span>Credit days</span><input type="number" name="creditDays" value="${pt.creditDays}" min="0"></label>
    <label class="wide"><span>GST</span><select name="gstMode">${Object.entries(GST_MODES).map(([k, l]) => `<option value="${k}" ${set.gstMode === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
  </div><p id="fr-error" class="field-error" hidden></p><div class="form-actions"><button type="button" class="button secondary" data-route="invoices">Cancel</button><button class="button primary" type="submit">Issue invoice</button></div></form>`;
}

export function invoiceDetailScreen(state) {
  ensureFreight(state);
  const inv = state.freightInvoices.find(i => i.id === state.selectedInvoiceId); if (!inv) return invoicesScreen(state);
  const ws = opsCtx(state).ownerWs, a = amounts(state, inv), d = dueState(state, inv), issuer = S(state, inv.issuer), buyer = S(state, inv.billTo);
  const isIssuer = ws === inv.issuer, isPayer = ws === inv.billTo;
  const trip = state.trips.find(t => t.id === inv.tripId); const ewbList = trip ? Gst.ewbsForTrip(state, trip.id) : []; const ewbNeeded = trip && Gst.needsEwb(state, trip) && !ewbList.length;
  const pays = paymentsOf(state, inv);
  return `${head(`Invoice ${inv.number}`, `${nameOf(state, inv.issuer)} → ${nameOf(state, inv.billTo)} · ${inv.tripId || ''}`, `<span class="row-actions"><button class="button secondary" data-route="invoices">Back</button><button class="button secondary" data-fr-print>Print / PDF</button>${isIssuer && a.outstanding ? `<button class="button primary" data-fr-remind="${inv.id}">Send reminder</button>` : ''}</span>`)}
  ${ewbNeeded ? `<div class="action-warning"><b>E-way bill missing</b><span>Goods value is above ₹50,000. Generate it from the trip.</span><button class="button secondary compact" data-op="open-trip" data-id="${inv.tripId}">Open trip</button></div>` : ewbList.length ? `<p class="muted">E-way bill ${ewbList.map(e => `${esc(e.no)} (${esc(Gst.ewbStatus(e).label)})`).join(', ')}</p>` : ''}${Gst.invoiceEinvoicePanel(state, inv, amounts)}
  <div class="grid two"><section class="panel invoice-doc"><div class="invoice-head"><div><b>${esc(issuer.legalName)}</b><small>${esc(issuer.address || '')}</small><small>GSTIN ${esc(issuer.gstin || 'Not registered')} · PAN ${esc(issuer.pan || '—')}</small></div><div class="align-right"><b>Tax invoice ${pill(d.status)}</b><small>${esc(inv.number)} · ${fmt(inv.issueDate)}${inv.revision > 1 ? ` · revision ${inv.revision}` : ''}</small></div></div>
    <div class="invoice-to"><small>Bill to</small><b>${esc(buyer.legalName || nameOf(state, inv.billTo))}</b><small>GSTIN ${esc(buyer.gstin || '—')} · ${esc(buyer.address || '')}</small></div>
    <table class="price-table"><tbody><tr><td>Freight · ${esc(inv.tripTitle)} · SAC ${inv.sac}</td><td>${inr(inv.freight)}</td></tr>${inv.charges.filter(c => c.status === 'approved').map(c => `<tr><td>${esc(CHARGE_KINDS[c.kind])}${c.note ? ` · ${esc(c.note)}` : ''}</td><td>${inr(c.amount)}</td></tr>`).join('')}${inv.adjustments.filter(x => x.status === 'accepted').map(x => `<tr><td>Less: ${esc(x.note)}</td><td>−${inr(x.amount)}</td></tr>`).join('')}
    <tr><td>Taxable value</td><td>${inr(a.taxable)}</td></tr><tr><td>${inv.gstMode === 'forward' ? `GST @ ${a.gstRate}%` : inv.gstMode === 'rcm' ? `GST @ ${a.gstRate}% payable by recipient (reverse charge): ${inr(a.rcmGst)}` : 'GST not charged'}</td><td>${inr(a.gst)}</td></tr><tr class="total"><td>Invoice total</td><td>${inr(a.total)}</td></tr>
    <tr><td>TDS ${a.tds.applicable ? `@ ${a.tds.rate}% (194C)` : ''}<small class="block muted">${esc(a.tds.reason)}</small></td><td>${a.tds.applicable ? `−${inr(a.tds.amount)}` : '—'}</td></tr>
    <tr><td>Paid${a.confirmed < a.cash ? ` (${inr(a.cash - a.confirmed)} awaiting confirmation)` : ''}</td><td>−${inr(a.cash)}</td></tr>${a.held ? `<tr><td>Held in dispute</td><td>−${inr(a.held)}</td></tr>` : ''}<tr class="total"><td>Outstanding</td><td>${inr(a.outstanding)}</td></tr></tbody></table>
    <h3>Payment schedule</h3>${schedule(state, inv).map(s => `<div class="ledger-row static"><span><b>${esc(s.label)}</b><small>${esc(s.trigger)}${s.due ? ` · due ${fmt(s.due)}` : ''}</small></span><span class="amount">${inr(s.amount)}</span></div>`).join('')}
  </section>
  <div class="stack">
    ${isPayer && a.outstanding ? `<section class="panel"><h2>Record a payment</h2><form data-fr-form="pay" class="form-grid two"><label><span>Amount paid (₹)</span><input type="number" name="amount" value="${Math.max(0, (d.dueNow || a.outstanding) - a.tdsPending)}"></label><label><span>TDS deducted (₹)</span><input type="number" name="tds" value="${a.tdsPending}"></label><label><span>Method</span><select name="method"><option value="neft">NEFT</option><option value="rtgs">RTGS</option><option value="imps">IMPS</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option></select></label><label><span>UTR / cheque no.</span><input name="reference"></label><label><span>Paid on</span><input type="date" name="date" value="${today()}"></label><label><span>Against</span><select name="kind"><option value="advance">Advance</option><option value="balance" ${loaded(state, inv) ? 'selected' : ''}>Balance</option><option value="part payment">Part payment</option></select></label><p id="fr-error" class="field-error wide" hidden></p><button class="button primary wide" type="submit">Record payment</button></form><p class="mock-hint">Pay from your bank as usual, then record it here with the UTR. ${esc(nameOf(state, inv.issuer))} confirms when it arrives.</p></section>` : ''}
    ${protectHtml(state, inv)}${earlyHtml(state, inv)}${notesHtml(inv)}
    <section class="panel"><h2>Payments</h2>${pays.map(p => `<div class="ledger-row static"><span><b>${p.type === 'tds' ? 'TDS deducted' : `${esc(String(p.method).toUpperCase())} ${esc(p.reference)}`}</b><small>${esc(p.paidOn ? fmt(p.paidOn) : p.history?.[0]?.at || '')}${p.type === 'tds' ? ` · certificate ${esc(p.certificate || 'pending')}` : ''}</small></span><span class="amount">${inr(p.amount)}</span>${pill(p.status)}${isIssuer && p.type === 'freight' && p.status === 'paid' ? `<button class="button secondary compact" data-fr-confirm="${p.id}">Confirm received</button>` : ''}${p.type === 'tds' && ((isPayer && p.certificate === 'pending') || (isIssuer && p.certificate === 'issued')) ? `<button class="button secondary compact" data-fr-cert="${p.id}">${isPayer ? 'Mark certificate issued' : 'Mark certificate received'}</button>` : ''}</div>`).join('') || '<p class="muted">No payments recorded yet.</p>'}</section>
    <section class="panel"><h2>Extra charges</h2>${inv.charges.map(c => `<div class="ledger-row static"><span><b>${esc(CHARGE_KINDS[c.kind])} · ${inr(c.amount)}</b><small>${esc(c.note)} · evidence ${esc(c.evidence)}</small></span>${pill(c.status)}${isPayer && c.status === 'proposed' ? `<span class="row-actions"><button class="button secondary compact" data-fr-charge="${c.id}" data-decision="approve">Approve</button><button class="button secondary compact" data-fr-charge="${c.id}" data-decision="reject">Reject</button></span>` : ''}</div>`).join('') || '<p class="muted">None</p>'}
      ${isIssuer ? `<form class="inline-form" data-fr-form="charge"><select name="kind">${Object.entries(CHARGE_KINDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select><input type="number" name="amount" placeholder="₹"><input name="note" placeholder="e.g. 9 hours at Okhla gate"><input type="file" name="evidence" accept="image/*,application/pdf"><button class="button secondary compact">Propose</button></form><p id="fr-charge-error" class="field-error" hidden></p>` : ''}</section>
    <section class="panel"><h2>Deductions</h2>${inv.adjustments.map(x => `<div class="ledger-row static"><span><b>${esc(x.note)}</b><small>${inr(x.amount)} proposed by ${esc(nameOf(state, x.by))}</small></span>${pill(x.status)}${isIssuer && x.status === 'proposed' ? `<span class="row-actions"><button class="button secondary compact" data-fr-adj="${x.id}" data-decision="accept">Accept</button><button class="button secondary compact" data-fr-adj="${x.id}" data-decision="dispute">Dispute</button></span>` : ''}${x.status === 'disputed' && (isIssuer || isPayer) ? `<span class="row-actions"><button class="button secondary compact" data-fr-adj="${x.id}" data-decision="${isPayer ? 'withdraw' : 'settle'}">${isPayer ? 'Withdraw deduction' : 'Accept after review'}</button></span>` : ''}</div>`).join('') || '<p class="muted">None. Shortage at receipt is added here automatically.</p>'}</section>
    ${isIssuer ? `<section class="panel"><h2>Reminders</h2>${remindersFor(state, inv).map(r => `<div class="ledger-row static"><span><b>${esc(r.label)}</b><small>${fmt(r.date)}</small></span>${pill(r.sent ? 'sent' : r.date <= today() ? 'due' : 'scheduled')}</div>`).join('') || '<p class="muted">Reminders are scheduled once a due date is known.</p>'}</section>` : ''}
    <section class="panel"><h2>History</h2><div class="timeline">${inv.history.slice().reverse().map(h => `<div><i></i><span><b>${esc(h.text)}</b><small>${esc(h.at)}</small></span></div>`).join('')}</div></section>
  </div></div>`;
}

export function tripInvoiceBanner(state, t) {
  ensureFreight(state);
  const ws = opsCtx(state).ownerWs;
  const mine = state.freightInvoices.filter(i => i.tripId === t.id && (i.issuer === ws || i.billTo === ws));
  const credit = t.owner === ws && ws === 'transporter' ? creditStatus(state, ws, 'goods') : null;
  const canIssue = (ws === 'transporter' && t.owner === ws) || (ws === 'vehicle' && (t.vehicleOwner === 'vehicle' || (t.parties || []).includes('vehicle')));
  return `${canIssue && !mine.some(i => i.issuer === ws) ? '<button class="button secondary full" data-route="invoiceNew">Create freight invoice</button>' : ''}${credit?.blocked ? `<div class="action-warning"><b>Credit rule: ${esc(nameOf(state, 'goods'))}</b><span>${esc(credit.reason)}</span></div>` : ''}${mine.map(i => { const a = amounts(state, i), d = dueState(state, i); return `<button class="document-row as-button" data-fr-open="${i.id}"><span class="document-icon">🧾</span><span class="document-copy"><b>${esc(i.number)} · ${i.issuer === ws ? 'to ' + esc(nameOf(state, i.billTo)) : 'from ' + esc(nameOf(state, i.issuer))}</b><small>${inr(a.total)} · outstanding ${inr(a.outstanding)}</small></span>${pill(d.status)}</button>`; }).join('')}`;
}

// ---------- bindings ----------
function err(root, id, msg) { const e = root.querySelector(`#${id}`); if (e) { e.textContent = msg; e.hidden = !msg; } }
export function bindFreight(root, api) {
  { const S0 = () => api.getState(), w0 = () => opsCtx(S0()).ownerWs, find0 = id => S0().freightInvoices.find(i => i.id === id), d0 = (e, ok) => { if (e) return api.toast(e); api.save(); api.render(); api.toast(ok); };
    root.querySelectorAll('[data-fr-protect]').forEach(b => b.onclick = () => d0(protectFund(S0(), find0(b.dataset.frProtect), w0()), 'Funded into the protected account'));
    root.querySelectorAll('[data-fr-early]').forEach(b => b.onclick = () => d0(earlyPay(S0(), find0(b.dataset.frEarly), w0()), 'Early payment received'));
    root.querySelectorAll('form[data-fr-fuel]').forEach(f => f.onsubmit = e => { e.preventDefault(); d0(fuelAction(S0(), f.dataset.frFuel, Object.fromEntries(new FormData(f))), f.dataset.frFuel === 'load' ? 'Fuel card loaded' : 'Fuel spend recorded'); }); }
  const Sx = () => api.getState(); const ws = () => opsCtx(Sx()).ownerWs; const inv = () => Sx().freightInvoices.find(i => i.id === Sx().selectedInvoiceId); const actor = () => opsCtx(Sx()).persona.name;
  const done = (msg) => { api.save(); api.render(); if (msg) api.toast(msg); };
  root.querySelectorAll('[data-fr-tab]').forEach(b => b.onclick = () => { Sx().invoiceTab = b.dataset.frTab; done(); });
  root.querySelectorAll('[data-fr-open]').forEach(b => b.onclick = () => { Sx().selectedInvoiceId = b.dataset.frOpen; api.save(); api.navigate('invoiceDetail'); });
  root.querySelector('[data-fr-print]')?.addEventListener('click', () => window.print());
  root.querySelector('[data-fr-gta]')?.addEventListener('change', ev => { S(Sx(), ws()).gtaExempt = ev.target.checked; done(ev.target.checked ? 'Freight invoices treated as exempt from e-invoicing' : 'E-invoicing switched on for freight invoices'); });
  root.querySelector('[data-fr-export]')?.addEventListener('click', () => { const csv = toCsv(exportRows(Sx(), ws())); const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); const a = document.createElement('a'); a.href = url; a.download = `moveai-freight-${ws()}-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); api.toast('CSV downloaded — import it into Tally or Zoho'); });
  root.querySelectorAll('[data-fr-remind]').forEach(b => b.onclick = () => done(`${sendReminder(Sx(), inv())} sent to ${nameOf(Sx(), inv().billTo)}`));
  root.querySelectorAll('[data-fr-confirm]').forEach(b => b.onclick = () => { const e = confirmPayment(Sx(), inv(), b.dataset.frConfirm, ws()); done(e || 'Receipt confirmed'); });
  root.querySelectorAll('[data-fr-cert]').forEach(b => b.onclick = () => { const e = tdsCertificate(Sx(), b.dataset.frCert, ws()); done(e || 'TDS certificate updated'); });
  root.querySelectorAll('[data-fr-charge]').forEach(b => b.onclick = () => { const e = decideCharge(Sx(), inv(), b.dataset.frCharge, b.dataset.decision, ws()); done(e || 'Charge updated'); });
  root.querySelectorAll('[data-fr-adj]').forEach(b => b.onclick = () => { const e = decideAdjustment(Sx(), inv(), b.dataset.frAdj, b.dataset.decision, ws()); done(e || 'Deduction updated'); });
  root.querySelectorAll('form[data-fr-terms]').forEach(f => f.onsubmit = e => { e.preventDefault(); const fd = new FormData(f); const s = Sx(); ((s.freightParties ||= {})[ws()] ||= {})[f.dataset.frTerms] = {creditDays: Number(fd.get('creditDays')), creditLimit: Number(fd.get('creditLimit')), blockWhenOverdueDays: Number(fd.get('blockWhenOverdueDays'))}; done('Customer terms saved'); });
  const newForm = root.querySelector('form[data-fr-form="new"]');
  newForm?.tripId?.addEventListener('change', () => { const o = newForm.tripId.selectedOptions[0]; newForm.freight.value = o.dataset.amount; newForm.advance.value = o.dataset.advance; });
  root.querySelectorAll('form[data-fr-form]').forEach(f => f.onsubmit = e => {
    e.preventDefault(); const s = Sx(), fd = new FormData(f), kind = f.dataset.frForm;
    if (kind === 'new') { const r = createInvoice(s, {issuer: ws(), tripId: fd.get('tripId'), billTo: fd.get('billTo'), freight: fd.get('freight'), gstMode: fd.get('gstMode'), terms: fd.get('termsType') === 'credit' ? {type: 'credit', creditDays: Number(fd.get('creditDays'))} : {type: 'advance_balance', advance: Number(fd.get('advance')), creditDays: Number(fd.get('creditDays'))}}); if (r.error) return err(root, 'fr-error', r.error); s.selectedInvoiceId = r.inv.id; api.save(); api.navigate('invoiceDetail'); return api.toast(`Invoice ${r.inv.number} issued`); }
    if (kind === 'pay') { const x = recordPayment(s, inv(), {amount: fd.get('amount'), tds: fd.get('tds'), method: fd.get('method'), reference: fd.get('reference'), date: fd.get('date'), kind: fd.get('kind')}, actor()); if (x) return err(root, 'fr-error', x); return done('Payment recorded. Waiting for the receiver to confirm.'); }
    if (kind === 'charge') { const x = proposeCharge(s, inv(), {kind: fd.get('kind'), amount: fd.get('amount'), note: fd.get('note'), evidence: fd.get('evidence')?.name}); if (x) return err(root, 'fr-charge-error', x); return done('Charge sent for approval'); }
    if (kind === 'ewb') { const v = String(fd.get('ewb') || '').replace(/\D/g, ''); if (!/^\d{12}$/.test(v)) return api.toast('E-way bill numbers have 12 digits.'); s.ewayBills[inv().tripId] = v; return done('E-way bill saved'); }
  });
}

// ---------- debit / credit notes after an e-invoice ----------
function addNote(state, inv, type, amount, reason) {
  const n = (inv.notes ||= []).filter(x => x.type === type).length + 1;
  const note = {type, number: `${inv.number}/${type === 'debit' ? 'DN' : 'CN'}-${n}`, amount, reason, at: new Date().toLocaleDateString('en-IN'), irn: Array.from({length: 64}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')};
  inv.notes.push(note); inv.history.push({at: new Date().toLocaleString('en-IN'), text: `${type === 'debit' ? 'Debit' : 'Credit'} note ${note.number} for ${inr(amount)} registered (simulated IRN)`});
}
export function notesHtml(inv) {
  if (!inv.notes?.length) return inv.locked ? '<p class="muted">Invoice has an IRN: approved extra charges become debit notes and accepted deductions become credit notes.</p>' : '';
  return `<section class="panel"><h2>Debit / credit notes</h2>${inv.notes.map(n => `<div class="ledger-row static"><span><b>${esc(n.number)}</b><small>${n.type === 'debit' ? 'Debit' : 'Credit'} note · ${esc(n.reason)} · ${esc(n.at)} · IRN ${esc(n.irn.slice(0, 10))}…</small></span><span class="amount">${n.type === 'debit' ? '+' : '−'}${inr(n.amount)}</span></div>`).join('')}</section>`;
}

// ---------- protected payment (escrow-style, simulated) ----------
const tripDone = (state, inv, key) => (state.trips.find(t => t.id === inv.tripId)?.milestones || []).some(m => m.key === key && m.status === 'done');
export function protectFund(state, inv, actorWs) {
  if (actorWs !== inv.billTo) return 'Only the party being billed can fund the protected payment.';
  if (inv.protected) return 'Already funded.';
  const a = amounts(state, inv); if (!(a.outstanding > 0)) return 'Nothing outstanding.';
  const fund = a.outstanding - a.tdsPending, g = gateway.collect({method: 'netbanking', amount: fund}); if (!g.ok) return g.reason;
  inv.protected = {funded: fund, at: new Date().toLocaleString('en-IN'), advanceReleased: 0, balanceReleased: 0, refunded: 0};
  record(state, {owner: inv.billTo, invoiceId: inv.id, sourceType: 'invoice', sourceId: inv.id, type: 'escrow_in', payer: inv.billTo, payee: 'escrow', responsible: inv.billTo, amount: fund, method: 'netbanking', reference: g.ref, channel: 'moveai_pay', status: 'held', note: `Protected payment for ${inv.number}`});
  inv.history.push({at: new Date().toLocaleString('en-IN'), text: `${nameOf(state, inv.billTo)} funded ${inr(fund)} into the protected account`});
  protectSync(state, inv); return '';
}
function releaseEsc(state, inv, amount, label) {
  if (amount <= 0) return; record(state, {owner: inv.billTo, invoiceId: inv.id, sourceType: 'invoice', sourceId: inv.tripId || inv.id, type: 'freight', direction: 'payable', payer: inv.billTo, payee: inv.issuer, responsible: inv.billTo, amount, method: 'escrow', reference: `ESC-${label}-${inv.number}`, channel: 'moveai_pay', status: 'confirmed', paidOn: new Date().toISOString().slice(0, 10), note: `${label === 'ADV' ? 'Advance at loading' : label === 'BAL' ? 'Balance after delivery proof' : 'Released after dispute'} · protected payment`});
  inv.history.push({at: new Date().toLocaleString('en-IN'), text: `${inr(amount)} released from the protected account to ${nameOf(state, inv.issuer)}`});
}
export function protectSync(state, inv) {
  const p = inv.protected; if (!p) return; p.released ||= 0;
  const avail = () => p.funded - p.released - p.refunded, owed = () => { const a = amounts(state, inv); return Math.max(0, a.outstanding - a.tdsPending); };
  if (!p.advDone && (tripDone(state, inv, 'loaded') || !inv.tripId)) { p.advDone = true; const adv = Math.min(inv.terms?.advance || 0, avail(), owed()); if (adv > 0) { p.released += adv; p.advanceReleased = adv; releaseEsc(state, inv, adv, 'ADV'); } }
  if (!p.balDone && (tripDone(state, inv, 'delivered') || tripDone(state, inv, 'received'))) { p.balDone = true; const pay = Math.min(avail(), owed()); if (pay > 0) { p.released += pay; p.balanceReleased = pay; releaseEsc(state, inv, pay, 'BAL'); } }
  if (p.balDone && !amounts(state, inv).held && avail() > 0) {
    const pay = Math.min(avail(), owed()); if (pay > 0) { p.released += pay; p.disputeReleased = (p.disputeReleased || 0) + pay; releaseEsc(state, inv, pay, 'DIS'); }
    const back = avail(); if (back > 0) { p.refunded += back; record(state, {owner: inv.billTo, invoiceId: inv.id, sourceType: 'invoice', sourceId: inv.id, type: 'escrow_refund', payer: 'escrow', payee: inv.billTo, responsible: inv.issuer, amount: back, method: 'netbanking', reference: `ESC-RF-${inv.number}`, channel: 'moveai_pay', status: 'refunded', note: 'Deduction accepted — returned to the payer'}); inv.history.push({at: new Date().toLocaleString('en-IN'), text: `${inr(back)} returned to ${nameOf(state, inv.billTo)} after the deduction`}); }
  }
  p.held = avail();
}

export function protectHtml(state, inv) {
  const ws = opsCtx(state).ownerWs, p = inv.protected, a = amounts(state, inv);
  if (!p) return ws === inv.billTo && a.outstanding > 0 && !inv.factored ? `<section class="panel"><h2>Protected payment</h2><p class="muted">Pay the full amount into a protected account now. The advance is released when the truck is loaded and the balance after delivery proof; any disputed amount stays held until settled.</p><button class="button primary" data-fr-protect="${esc(inv.id)}">Fund ${inr(a.outstanding - a.tdsPending)} (net banking)</button></section>` : '';
  return `<section class="panel"><h2>Protected payment ${pill(p.held ? 'held' : 'settled')}</h2><table class="price-table"><tbody><tr><td>Funded by ${esc(nameOf(state, inv.billTo))} · ${esc(p.at)}</td><td>${inr(p.funded)}</td></tr><tr><td>Advance released at loading</td><td>${inr(p.advanceReleased || 0)}</td></tr><tr><td>Balance released after delivery proof</td><td>${inr(p.balanceReleased || 0)}</td></tr>${p.disputeReleased ? `<tr><td>Released after dispute</td><td>${inr(p.disputeReleased)}</td></tr>` : ''}${p.refunded ? `<tr><td>Returned to payer</td><td>${inr(p.refunded)}</td></tr>` : ''}<tr class="total"><td>Still held</td><td>${inr(p.held || 0)}</td></tr></tbody></table></section>`;
}

// ---------- early payment against delivery proof (simulated lending partner) ----------
export const EARLY_FEE = 0.015;
export function earlyPay(state, inv, actorWs) {
  if (actorWs !== inv.issuer) return 'Only the invoice issuer can take early payment.';
  if (inv.protected) return 'This invoice already has protected payment.'; if (inv.factored) return 'Already paid early.';
  if (inv.tripId && !tripDone(state, inv, 'delivered')) return 'Early payment needs the delivery proof (POD) first.';
  const a = amounts(state, inv), base = a.outstanding - a.tdsPending; if (!(base > 0)) return 'Nothing outstanding.';
  const fee = Math.round(base * EARLY_FEE); inv.factored = {lender: 'MoveAI Capital partner (simulated)', advanced: base - fee, fee, at: new Date().toLocaleString('en-IN')};
  record(state, {owner: inv.issuer, invoiceId: inv.id, sourceType: 'invoice', sourceId: inv.id, type: 'early_payment', payer: 'lender', payee: inv.issuer, responsible: 'lender', amount: base - fee, method: 'bank', reference: `EP-${inv.number}`, status: 'confirmed', note: `Early payment for ${inv.number} · fee ${inr(fee)} (${EARLY_FEE * 100}%) · ${nameOf(state, inv.billTo)} now pays the lending partner`});
  inv.history.push({at: new Date().toLocaleString('en-IN'), text: `Early payment ${inr(base - fee)} received from the lending partner (fee ${inr(fee)}). ${nameOf(state, inv.billTo)} pays the partner on the due date.`});
  return '';
}
export function earlyHtml(state, inv) {
  const ws = opsCtx(state).ownerWs, a = amounts(state, inv);
  if (inv.factored) return `<section class="panel"><h2>Early payment</h2><p>${inr(inv.factored.advanced)} received ${esc(inv.factored.at)} · fee ${inr(inv.factored.fee)} · ${esc(inv.factored.lender)}. ${ws === inv.billTo ? 'Pay this invoice to the lending partner on the due date.' : 'The payer now pays the lending partner.'}</p></section>`;
  if (ws !== inv.issuer || inv.protected || !(a.outstanding > 0)) return '';
  return `<section class="panel"><h2>Get paid now</h2><p class="muted">After delivery proof, a lending partner pays you today: ${inr(Math.round((a.outstanding - a.tdsPending) * (1 - EARLY_FEE)))} (fee ${EARLY_FEE * 100}%). ${esc(nameOf(state, inv.billTo))} pays the partner on the due date.</p><button class="button secondary" data-fr-early="${esc(inv.id)}">Get paid early</button></section>`;
}

// ---------- fuel card for a trip (simulated) ----------
export function fuelCardHtml(state) {
  const t = state.trips.find(x => x.id === state.selectedTripId); if (!t) return '';
  const f = t.fuelCard || {loaded: 0, spends: []}, spent = f.spends.reduce((a, x) => a + x.amount, 0);
  return `<section class="panel"><h2>Fuel card · ${esc(t.id)}</h2><p>Loaded ${inr(f.loaded)} · spent ${inr(spent)} · balance <b>${inr(f.loaded - spent)}</b></p><p class="muted">Fuel paid by card is a business expense — it is not added to or deducted from the driver's khata.</p><div class="row-actions"><form class="inline-form" data-fr-fuel="load"><input name="amount" type="number" placeholder="Load ₹"><button class="button secondary compact">Load card</button></form><form class="inline-form" data-fr-fuel="spend"><input name="amount" type="number" placeholder="Spent ₹"><input name="place" placeholder="Pump / place"><button class="button secondary compact">Record fuel</button></form></div>${f.spends.map(x => `<small class="block muted">${esc(x.at)} · ${inr(x.amount)} · ${esc(x.place)}</small>`).join('')}</section>`;
}
export function fuelAction(state, kind, v) {
  const t = state.trips.find(x => x.id === state.selectedTripId), f = (t.fuelCard ||= {loaded: 0, spends: []}), amt = Math.round(Number(v.amount));
  if (!(amt > 0)) return 'Enter an amount.';
  if (kind === 'load') { f.loaded += amt; record(state, {owner: t.owner, sourceType: 'trip', sourceId: t.id, type: 'fuel_card_load', payer: t.owner, payee: 'fuel_card', responsible: t.owner, amount: amt, method: 'fuel_card', reference: `FC-${t.id}-${Date.now().toString().slice(-5)}`, status: 'confirmed', note: `Fuel card loaded for ${t.id}`}); return ''; }
  const spent = f.spends.reduce((a, x) => a + x.amount, 0); if (amt > f.loaded - spent) return 'Not enough balance on the fuel card.';
  f.spends.push({amount: amt, place: String(v.place || 'Fuel pump').trim(), at: new Date().toLocaleString('en-IN')}); return '';
}
