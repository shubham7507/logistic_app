// MoveAI One — customer billing (option C): extras approved by the customer, instant payment receipts,
// one bill per order, tax invoice from the seller on completion / delivery, credit notes for refunds,
// a customer-friendly Payments screen, and partner earnings views showing what MoveAI keeps.
import {esc, pill, inr} from './ops.js';
import {DRIVER_RATE_CARD, MOVE_RATE_CARD, GENERAL_RATE_CARD} from './ops-rules.js';

const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'});
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const fy = () => { const d = new Date(), y = d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear(); return `${y % 100}-${(y + 1) % 100}`; };
export function nextNo(state, prefix) { state.docSeq ||= {}; state.docSeq[prefix] = (state.docSeq[prefix] || 0) + 1; return `${prefix}/${fy()}/${String(state.docSeq[prefix]).padStart(6, '0')}`; }
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// ---------- sellers ----------
export function seller(state, party) {
  if (party === 'movers') { const f = state.freightSettings?.movers || {}; return {name: f.legalName || 'SafeMove Packers', gstin: f.gstin || '09AAOCS3321P1Z9', address: f.address || 'Sector 18, Noida', registered: true, prefix: 'SM'}; }
  if (party === 'personalDriver') return {name: 'Anil Kumar (independent driver)', gstin: '', address: 'Noida', registered: false, prefix: 'AK'};
  if (String(party).startsWith('store:')) { const n = party.slice(6).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); return {name: n, gstin: '09AABCF1234K1Z5', address: 'Noida', registered: true, prefix: n.split(' ').map(w => w[0]).join('')}; }
  return {name: 'Verified service partner', gstin: '', address: 'Noida', registered: false, prefix: 'SP'};
}
export const sellerName = (state, party) => seller(state, party).name;

// ---------- extras (customer approves) ----------
export const EXTRA_KINDS = {
  driver: {extra_hour: {label: 'Extra hour', rate: DRIVER_RATE_CARD.extraHour, unit: 'hour'}, night: {label: 'Night charge (after 10 pm)', rate: DRIVER_RATE_CARD.night, unit: 'once'}, toll_parking: {label: 'Toll / parking paid by driver', rate: 0, unit: 'at cost', passThrough: true, needsProof: true}},
  moving: {extra_carton: {label: 'Extra cartons', rate: MOVE_RATE_CARD.extraCarton, unit: 'carton'}, extra_floor: {label: 'Extra floor without lift', rate: MOVE_RATE_CARD.floorNoLift, unit: 'floor', needsProof: true}, long_carry: {label: 'Long carry', rate: MOVE_RATE_CARD.longCarry, unit: 'once', needsProof: true}, waiting: {label: 'Waiting', rate: MOVE_RATE_CARD.waitingHour, unit: 'hour'}, storage: {label: 'Storage', rate: MOVE_RATE_CARD.storageDay, unit: 'day'}},
  general: {extra_labour: {label: 'Extra labour', rate: GENERAL_RATE_CARD.extraLabourHour, unit: 'hour'}, parts: {label: 'Spare part (shop bill)', rate: 0, unit: 'at cost', passThrough: true, needsProof: true}},
};
const svc = r => r.type === 'moving' ? 'moving' : r.type === 'driver' ? 'driver' : 'general';
export const extrasTotal = r => (r.extras || []).filter(x => x.status === 'approved').reduce((a, x) => a + x.amount, 0);
export const pendingExtras = r => (r.extras || []).filter(x => x.status === 'proposed');
export function proposeExtra(state, r, v, by) {
  const k = EXTRA_KINDS[svc(r)]?.[v.kind]; if (!k) return 'Choose a charge from the rate card.';
  if (r.paid || ['closed', 'cancelled'].includes(r.status)) return 'This job is already paid or closed.';
  const qty = Math.max(1, Number(v.qty) || 1), amount = k.rate ? k.rate * qty : Math.round(Number(v.amount) || 0);
  if (!(amount > 0)) return 'Enter the amount.';
  if (k.needsProof && !String(v.proof || '').trim()) return 'Attach a photo (slip, bill or the situation).';
  (r.extras ||= []).push({id: `EX-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4)}`, kind: v.kind, label: `${k.label}${k.rate ? ` × ${qty}` : ''}`, qty, amount, passThrough: Boolean(k.passThrough), proof: v.proof || '', note: String(v.note || '').trim(), by, status: 'proposed', at: stamp()});
  (state.notifications ||= []).unshift({id: `NT-${Date.now()}`, to: 'personal', text: `${r.id}: ${k.label} ${inr(amount)} needs your approval`, ref: r.id, at: stamp(), read: false});
  return '';
}
export function decideExtra(state, r, id, decision) {
  const x = (r.extras || []).find(e => e.id === id); if (!x || x.status !== 'proposed') return 'Nothing to decide.';
  x.status = decision === 'approve' ? 'approved' : 'rejected'; x.decidedAt = stamp(); return '';
}

// ---------- invoices ----------
export function issueInvoice(state, {kind, r, o, party}) {
  state.customerInvoices ||= [];
  const ref = r ? r.id : o.id;
  if (state.customerInvoices.some(i => i.ref === ref && !i.feeInvoice)) return null;
  const s = seller(state, party), billing = (r || o).billing || {name: state.person?.name || 'Customer'};
  let lines = [], gst = 0, gstRate = 0, reimb = [];
  if (r) {
    lines = (r.quote?.partnerLines || [[r.title, r.quote?.total || 0]]).map(([d, a]) => ({desc: d, amount: a}));
    for (const x of (r.extras || []).filter(e => e.status === 'approved')) (x.passThrough ? reimb : lines).push({desc: x.label + (x.note ? ` · ${x.note}` : ''), amount: x.amount});
    gst = r.quote?.gst || 0; gstRate = r.quote?.gstRate || 0;
  } else {
    lines = o.items.map(i => { const p = state.products.find(x => x.id === i.productId); return {desc: `${i.quantity} × ${p?.name || i.productId}`, amount: (p?.price || 0) * i.quantity}; });
    if (o.deliveryFee) lines.push({desc: 'Delivery', amount: o.deliveryFee});
  }
  const taxable = lines.reduce((a, l) => a + l.amount, 0);
  const inv = {id: `CI-${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 4)}`, number: nextNo(state, `${s.prefix}-INV`), ref, kind, party, seller: s, billing, lines, reimb, taxable, gst, gstRate, total: taxable + gst + reimb.reduce((a, l) => a + l.amount, 0), docType: s.registered ? 'Tax invoice' : 'Bill of supply', note: r ? '' : 'Prices include GST where applicable.', issuedAt: stamp()};
  state.customerInvoices.unshift(inv);
  if (r?.quote?.fee) { const base = (r.quote.feeLines || [])[0]?.[1] || r.quote.fee, feeGst = r.quote.fee - base; state.customerInvoices.unshift({id: `${inv.id}-F`, number: nextNo(state, 'MA-INV'), ref, kind, party: 'moveai', feeInvoice: true, seller: {name: 'MoveAI Technologies (platform fee)', gstin: '09AAMCM0001A1Z5', address: 'Noida', registered: true}, billing, lines: [{desc: 'Booking fee', amount: base}], reimb: [], taxable: base, gst: feeGst, gstRate: 18, total: r.quote.fee, docType: 'Tax invoice', issuedAt: stamp()}); }
  return inv;
}

// ---------- bill ----------
const receiptsFor = (state, ref) => state.ledger.filter(x => (x.serviceId === ref || x.orderId === ref) && x.payer === 'personal' && x.type === 'customer_payment');
const refundsFor = (state, ref) => state.ledger.filter(x => (x.serviceId === ref || x.orderId === ref) && x.type === 'refund');
const statusText = x => ({held: 'Paid · held until done', released: 'Paid', confirmed: x.channel === 'cash' ? 'Paid in cash · confirmed' : 'Paid', pending: 'Processing', failed: 'Failed · not charged', refunded: 'Refunded'}[x.status] || x.status);
export function billPanel(state, r, summary) {
  const q = r.quote || {}, ex = r.extras || [], k = EXTRA_KINDS[svc(r)] || {};
  const invs = (state.customerInvoices || []).filter(i => i.ref === r.id);
  return `<section class="panel bill"><h2>Bill · ${esc(r.id)}</h2>
  <table class="price-table"><tbody>
    <tr class="sub"><td colspan="2"><b>${r.type === 'moving' ? 'Mover’s charges' : r.type === 'driver' ? 'Driver’s charges (the driver gets all of this)' : 'Service partner’s charges'}</b></td></tr>
    ${(q.partnerLines || []).map(([d, a]) => `<tr><td>${esc(d)}</td><td>${inr(a)}</td></tr>`).join('')}
    ${ex.filter(x => x.status !== 'rejected').map(x => `<tr class="${x.status === 'proposed' ? 'pending' : ''}"><td>${esc(x.label)}${x.passThrough ? ' (reimbursed at cost)' : ''}${x.status === 'proposed' ? ' — <b>needs your approval</b>' : ''}</td><td>${inr(x.amount)}</td></tr>`).join('')}
    ${(q.feeLines || []).map(([d, a]) => `<tr><td>${esc(d)}</td><td>${inr(a)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${inr(summary.total)}</td></tr>
    ${receiptsFor(state, r.id).map(x => `<tr><td>${x.purpose === 'booking' ? 'Booking amount' : 'Payment'} · ${esc(String(x.method).toUpperCase())} · ${statusText(x)} ${x.receiptNo ? `<button class="button text compact" data-bill-doc="receipt" data-id="${x.id}">Receipt</button>` : ''}</td><td>−${inr(x.amount)}</td></tr>`).join('')}
    ${refundsFor(state, r.id).map(x => `<tr><td>Refund · ${x.status === 'refunded' ? 'reached your account' : 'on the way'} <button class="button text compact" data-bill-doc="credit" data-id="${x.id}">Credit note</button></td><td>+${inr(x.amount)}</td></tr>`).join('')}
    <tr class="total"><td>${r.status === 'cancelled' ? 'Cancelled' : 'Balance due'}</td><td>${r.status === 'cancelled' ? '—' : inr(summary.due)}</td></tr></tbody></table>
  ${pendingExtras(r).map(x => `<div class="extra-approve"><div><b>${esc(x.label)} · ${inr(x.amount)}</b><small class="block muted">${esc(x.note || '')}${x.proof ? ` · photo: ${esc(x.proof)}` : ''} · proposed ${esc(x.at)}</small></div><span class="row-actions"><button class="button primary compact" data-extra="approve" data-id="${x.id}">Approve</button><button class="button secondary compact" data-extra="reject" data-id="${x.id}">Reject</button></span></div>`).join('')}
  ${invs.length ? `<div class="row-actions">${invs.map(i => `<button class="button secondary compact" data-bill-doc="invoice" data-id="${i.id}">${esc(i.feeInvoice ? 'MoveAI fee invoice' : i.docType)}</button>`).join('')}</div>` : `<p class="muted">The ${r.type === 'driver' ? 'driver’s bill' : 'tax invoice'} is issued when the job is completed.</p>`}
  <details class="rate-card"><summary>Rate card for anything extra</summary>${(q.rateCard || []).map(([a, b]) => `<small class="block"><b>${esc(a)}:</b> ${esc(b)}</small>`).join('')}</details>
  ${!r.paid && !['closed', 'cancelled'].includes(r.status) && r.type === 'general' ? `<details><summary class="button text compact">Prototype: provider proposes an extra</summary>${extraForm(r, 'general')}</details>` : ''}</section>`;
}
export function extraForm(r, s) {
  return `<form class="inline-form" data-extra-form="${r.id}"><select name="kind">${Object.entries(EXTRA_KINDS[s]).map(([key, e]) => `<option value="${key}">${esc(e.label)}${e.rate ? ` · ₹${e.rate}/${e.unit}` : ''}</option>`).join('')}</select><input name="qty" type="number" min="1" value="1" title="Quantity"><input name="amount" type="number" placeholder="₹ if at cost"><input name="note" placeholder="Note"><input name="proof" type="file" accept="image/*,application/pdf"><button class="button secondary compact">Send to customer</button></form><p class="extra-error field-error" hidden></p>`;
}
export function partnerEarnings(state, r, who) {
  const q = r.quote || {}, rate = r.pricing?.commission ?? ({moving: 0.10, driver: 0, general: 0.15}[svc(r)]);
  const extras = extrasTotal(r), pass = (r.extras || []).filter(x => x.status === 'approved' && x.passThrough).reduce((a, x) => a + x.amount, 0);
  const base = (q.partnerTotal || 0) + (q.gst || 0) + extras - pass, commission = Math.round(base * rate);
  return `<section class="panel earnings"><h2>${who === 'driver' ? 'Your earnings' : 'What you earn'}</h2><table class="price-table"><tbody><tr><td>${who === 'driver' ? 'Driver’s charges' : 'Your charges'}${q.gst ? ' incl. GST' : ''}</td><td>${inr((q.partnerTotal || 0) + (q.gst || 0))}</td></tr>${extras - pass ? `<tr><td>Approved extras</td><td>${inr(extras - pass)}</td></tr>` : ''}<tr><td>${rate ? `MoveAI commission ${Math.round(rate * 100)}%` : 'MoveAI commission'}</td><td>${rate ? `−${inr(commission)}` : '₹0 — MoveAI’s booking fee is paid by the customer'}</td></tr>${pass ? `<tr><td>Reimbursed at cost (tolls, parking, parts)</td><td>${inr(pass)}</td></tr>` : ''}<tr class="total"><td>You receive</td><td>${inr(base - commission + pass)}</td></tr></tbody></table>${q.rateCard ? `<details class="rate-card"><summary>Rate card the customer saw</summary>${q.rateCard.map(([a, b]) => `<small class="block"><b>${esc(a)}:</b> ${esc(b)}</small>`).join('')}</details>` : ''}${!r.paid && !['closed', 'cancelled'].includes(r.status) ? `<h3>Add an extra charge</h3>${extraForm(r, svc(r))}` : ''}</section>`;
}

// ---------- documents ----------
export function docScreen(state) {
  const d = state.billDoc || {}; const back = `<button class="button secondary" data-route="money">Back to payments</button><button class="button secondary" data-bill-print>Print / save PDF</button>`;
  if (d.type === 'receipt' || d.type === 'credit') {
    const x = state.ledger.find(e => e.id === d.id); if (!x) return head('Receipt', 'Not found.');
    const ref = x.serviceId || x.orderId, r = state.serviceRequests.find(q => q.id === ref), o = (state.customerOrders || []).find(q => q.id === ref);
    const party = x.type === 'refund' ? (x.responsible || '') : x.payee, bill = (r || o)?.billing || {name: state.person?.name};
    const title = x.type === 'refund' ? 'Credit note' : 'Payment receipt', no = x.type === 'refund' ? x.creditNoteNo : x.receiptNo;
    const share = encodeURIComponent(`${title} ${no}: ${inr(x.amount)} ${x.type === 'refund' ? 'refund' : 'paid'} to ${sellerName(state, party)} via MoveAI for ${ref}.`);
    return `${head(title, `${no} · ${ref}`, `<span class="row-actions">${back}<a class="button secondary" target="_blank" rel="noopener" href="https://wa.me/?text=${share}">WhatsApp</a><a class="button secondary" href="mailto:${esc(bill.email || '')}?subject=${encodeURIComponent(`${title} ${no}`)}&body=${share}">Email</a></span>`)}
    <section class="panel doc"><div class="doc-head"><div><b>MoveAI Pay</b><small>${title === 'Credit note' ? 'Refund on behalf of' : 'Payment collected on behalf of'} ${esc(sellerName(state, party))}</small></div><div class="align-right"><b>${esc(no)}</b><small>${esc(x.history?.[0]?.at || '')}</small></div></div>
    <table class="price-table"><tbody><tr><td>${x.type === 'refund' ? 'Refunded to' : 'Received from'}</td><td>${esc(bill.name || 'Customer')}${bill.gstin ? ` · GSTIN ${esc(bill.gstin)}` : ''}</td></tr><tr><td>For</td><td>${esc(r?.title || (o ? `Order ${o.id}` : ref))}</td></tr><tr><td>Method</td><td>${esc(String(x.method).toUpperCase())}${x.channel === 'cash' ? ' (collected by the partner)' : ''}</td></tr><tr><td>Reference</td><td>${esc(x.reference)}</td></tr><tr><td>Status</td><td>${esc(x.type === 'refund' ? (x.status === 'refunded' ? 'Refunded' : `On the way · by ${new Date(x.expectedBy).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})}`) : statusText(x))}</td></tr><tr class="total"><td>Amount</td><td>${inr(x.amount)}</td></tr></tbody></table>
    <p class="muted">${x.type === 'refund' ? `Reason: ${esc(x.note || '')}` : `This is a payment receipt. ${seller(state, party).registered ? 'The tax invoice' : 'The bill'} is issued by ${esc(sellerName(state, party))} when the work is completed or the order is delivered.`}</p></section>`;
  }
  const inv = (state.customerInvoices || []).find(i => i.id === d.id); if (!inv) return head('Invoice', 'Not found.');
  return `${head(inv.docType, `${inv.number} · ${inv.ref}`, `<span class="row-actions">${back}</span>`)}
  <section class="panel doc"><div class="doc-head"><div><b>${esc(inv.seller.name)}</b><small>${esc(inv.seller.address)}</small><small>${inv.seller.gstin ? `GSTIN ${esc(inv.seller.gstin)}` : 'Not GST-registered — bill of supply, no GST charged'}</small></div><div class="align-right"><b>${esc(inv.docType)}</b><small>${esc(inv.number)} · ${esc(inv.issuedAt)}</small></div></div>
  <div class="invoice-to"><small>Bill to</small><b>${esc(inv.billing.name || 'Customer')}</b>${inv.billing.gstin ? `<small>GSTIN ${esc(inv.billing.gstin)} (business purchase)</small>` : ''}</div>
  <table class="price-table"><tbody>${inv.lines.map(l => `<tr><td>${esc(l.desc)}</td><td>${inr(l.amount)}</td></tr>`).join('')}<tr><td>Taxable value</td><td>${inr(inv.taxable)}</td></tr><tr><td>${inv.gst ? `GST @ ${inv.gstRate}%` : inv.note || 'GST'}</td><td>${inv.gst ? inr(inv.gst) : '—'}</td></tr>${inv.reimb.map(l => `<tr><td>Reimbursement at cost: ${esc(l.desc)}</td><td>${inr(l.amount)}</td></tr>`).join('')}<tr class="total"><td>Total</td><td>${inr(inv.total)}</td></tr></tbody></table>
  <p class="muted">${inv.feeInvoice ? 'MoveAI’s own fee, invoiced separately from the service.' : 'Facilitated by MoveAI. Payment collected by MoveAI Pay on behalf of the seller.'} Who issues the invoice for each service follows GST rules for e-commerce platforms — confirm with a CA.</p></section>`;
}
export function customerPaymentsScreen(state, paySummary) {
  const rs = state.serviceRequests.filter(r => r.customer === 'personal'), os = state.customerOrders || [];
  const row = (ref, title, total, paid, due, status) => `<article class="market-row"><span class="market-icon">🧾</span><span><b>${esc(title)}</b><small>${esc(ref)} · total ${inr(total)} · paid ${inr(paid)}${due ? ` · <b>${inr(due)} due</b>` : ''}</small></span>${pill(status)}<button class="button secondary compact" data-bill-open="${esc(ref)}">Bill</button></article>`;
  const refunds = state.ledger.filter(x => x.type === 'refund' && x.payee === 'personal');
  return `${head('Payments', 'Every booking and order with what you paid, what is due and any refunds.', '<button class="button secondary" data-route="account">Account</button>')}
  <section class="panel"><h2>Bookings</h2>${rs.map(r => { const s = paySummary(state, r); return row(r.id, r.title, s.total, s.paidOnline + s.cash, s.due, r.status === 'cancelled' ? 'cancelled' : s.pending ? 'processing' : s.held && !r.paid ? 'held_until_done' : s.due ? 'balance_due' : 'paid'); }).join('') || '<p class="muted">No bookings yet.</p>'}</section>
  <section class="panel"><h2>Product orders</h2>${os.map(o => { const paid = state.ledger.filter(x => x.orderId === o.id && x.type === 'customer_payment' && !['failed', 'pending', 'refunded'].includes(x.status)).reduce((a, x) => a + x.amount, 0); return row(o.id, `Order · ${o.fulfilmentPartner || 'store'}`, o.total, paid, o.cod && !paid && o.status !== 'cancelled' ? o.total : 0, o.status); }).join('') || '<p class="muted">No orders yet.</p>'}</section>
  <section class="panel"><h2>Refunds</h2>${refunds.map(x => `<article class="market-row"><span class="market-icon">↩</span><span><b>${inr(x.amount)} · ${esc(x.serviceId || x.orderId)}</b><small>${esc(x.creditNoteNo || '')} · ${x.status === 'refunded' ? 'reached your account' : `on the way · by ${new Date(x.expectedBy).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})}`}</small></span>${pill(x.status)}<button class="button secondary compact" data-bill-doc="credit" data-id="${x.id}">Credit note</button></article>`).join('') || '<p class="muted">No refunds.</p>'}</section>`;
}
export function billingFieldsHtml(state, b = {}) {
  return `<fieldset class="billing-fields wide"><legend>Receipt details</legend><div class="form-grid two"><label><span>Name on receipt</span><input id="bill-name" value="${esc(b.name || state.person?.name || '')}"></label><label><span>GSTIN (optional, for a business purchase)</span><input id="bill-gstin" value="${esc(b.gstin || '')}" placeholder="09ABCDE1234F1Z5" autocapitalize="characters"></label><label class="wide"><span>Email for copies (optional)</span><input id="bill-email" type="email" value="${esc(b.email || '')}"></label></div></fieldset>`;
}
export function readBilling(root) {
  const name = String(root.querySelector('#bill-name')?.value || '').trim(), gstin = String(root.querySelector('#bill-gstin')?.value || '').trim().toUpperCase(), email = String(root.querySelector('#bill-email')?.value || '').trim();
  if (!name) return {error: 'Enter the name for the receipt.'};
  if (gstin && !GSTIN_RE.test(gstin)) return {error: 'That GSTIN is not valid (15 characters, e.g. 09ABCDE1234F1Z5).'};
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return {error: 'Enter a valid email or leave it blank.'};
  return {billing: {name, gstin, email}};
}

// ---------- bindings ----------
export function bindBilling(root, api) {
  const S = () => api.getState();
  root.querySelectorAll('[data-bill-doc]').forEach(b => b.onclick = () => { S().billDoc = {type: b.dataset.billDoc, id: b.dataset.id}; api.save(); api.navigate('billDoc'); });
  root.querySelector('[data-bill-print]')?.addEventListener('click', () => window.print());
  root.querySelectorAll('[data-bill-open]').forEach(b => b.onclick = () => { const ref = b.dataset.billOpen; if (ref.startsWith('ORD')) return api.navigate('orders'); S().selectedServiceId = ref; api.save(); api.navigate('serviceDetail'); });
  root.querySelectorAll('[data-extra]').forEach(b => b.onclick = () => { const s = S(), r = s.serviceRequests.find(q => (q.extras || []).some(x => x.id === b.dataset.id)); const e = decideExtra(s, r, b.dataset.id, b.dataset.extra); if (e) return api.toast(e); api.save(); api.render(); api.toast(b.dataset.extra === 'approve' ? 'Extra approved and added to the bill' : 'Extra rejected'); });
  root.querySelectorAll('form[data-extra-form]').forEach(f => f.onsubmit = e => { e.preventDefault(); const s = S(), r = s.serviceRequests.find(q => q.id === f.dataset.extraForm), fd = new FormData(f); const who = s.currentWorkspace === 'personal' ? 'Service partner (prototype)' : s.currentWorkspace; const err = proposeExtra(s, r, {kind: fd.get('kind'), qty: fd.get('qty'), amount: fd.get('amount'), note: fd.get('note'), proof: fd.get('proof')?.name}, who); if (err) { const el = f.nextElementSibling; if (el) { el.textContent = err; el.hidden = false; } return; } api.save(); api.render(); api.toast('Sent to the customer for approval'); });
}
