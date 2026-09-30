// MoveAI One — buying products with MoveAI Pay.
// Checkout: quantity, delivery address, price (items + delivery fee under ₹499), pay by UPI / card (held until
// delivered) or cash on delivery (up to ₹5,000). Cancel before dispatch → full refund. Return within 7 days of
// delivery → refund after pickup. Delivered → released to the store partner minus commission.
// COD → the delivery partner collects cash; commission becomes the store partner's wallet debt.
import {esc, pill, inr} from './ops.js';
import {gateway, record, TEST, clock} from './pay.js';
import {issueInvoice, billingFieldsHtml, readBilling} from './customer-billing.js';

export const PRODUCT_POLICY = {commission: 0.08, freeDeliveryAbove: 499, deliveryFee: 40, codLimit: 5000, returnDays: 7};
const DAY = 86400000;
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const partyOf = name => `store:${String(name || 'store').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const STEPS = ['paid', 'packed', 'out_for_delivery', 'delivered'];

export function quote(p, qty) {
  const items = p.price * qty, delivery = items >= PRODUCT_POLICY.freeDeliveryAbove ? 0 : PRODUCT_POLICY.deliveryFee;
  return {items, delivery, total: items + delivery};
}
export function placeOrder(state, v) {
  const p = state.products.find(x => x.id === v.productId); if (!p) return {error: 'Product not found.'};
  const qty = Math.max(1, Math.min(10, Number(v.qty) || 1));
  if (!String(v.address || '').trim()) return {error: 'Enter the delivery address.'};
  const q = quote(p, qty), party = partyOf(p.fulfilmentPartner);
  const id = `ORD-${Date.now().toString().slice(-5)}`;
  const order = {id, billing: v.billing, customer: state.person?.name, items: [{productId: p.id, quantity: qty}], itemTotal: q.items, deliveryFee: q.delivery, total: q.total, fulfilmentPartner: p.fulfilmentPartner, party, address: v.address.trim(), method: v.method, eta: 'Today, 6:30 PM', history: [{at: stamp(), text: 'Order placed'}]};
  if (v.method === 'cod') {
    if (q.total > PRODUCT_POLICY.codLimit) return {error: `Cash on delivery is available up to ${inr(PRODUCT_POLICY.codLimit)}. Pay online for this order.`};
    order.status = 'confirmed'; order.cod = true;
  } else {
    const g = gateway.collect({method: v.method, vpa: v.vpa, card: v.card, amount: q.total});
    if (!g.ok) return {error: g.reason};
    record(state, {owner: 'personal', orderId: id, sourceType: 'order', sourceId: id, type: 'customer_payment', purpose: 'order', payer: 'personal', payee: party, responsible: 'personal', amount: q.total, method: v.method, reference: g.ref, status: g.pending ? 'pending' : 'held', gatewayFinal: g.final || null, note: `Order ${id} · held until delivered`}, 'Customer');
    order.status = g.pending ? 'payment_pending' : 'paid';
  }
  state.customerOrders.unshift(order);
  return {ok: true, order};
}
const orderPayments = (state, o) => state.ledger.filter(x => x.orderId === o.id);
export function checkPayment(state, o) {
  const x = orderPayments(state, o).find(e => e.status === 'pending'); if (!x) return 'Nothing pending.';
  if (x.gatewayFinal === 'success') { x.status = 'held'; o.status = 'paid'; o.history.push({at: stamp(), text: 'Payment confirmed by the bank'}); return ''; }
  x.status = 'failed'; o.status = 'cancelled'; o.cancelReason = 'Payment failed — nothing was charged'; o.history.push({at: stamp(), text: o.cancelReason}); return '';
}
function refund(state, o, amount, why) {
  const src = orderPayments(state, o).find(e => e.type === 'customer_payment' && e.status === 'held'); if (!src) return;
  src.status = 'refunded';
  const g = gateway.refund(src.reference, amount);
  record(state, {owner: 'personal', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: o.party, amount, method: src.method, reference: g.ref, status: 'refund_initiated', expectedBy: clock() + 5 * DAY, gatewayFinal: 'refunded', note: `${why} · ${o.id}`});
}
export function cancelOrder(state, o) {
  if (!['paid', 'confirmed', 'packed', 'payment_pending'].includes(o.status)) return 'The order has left the store. Refuse it at the door or return it after delivery.';
  if (o.status === 'payment_pending') return 'Wait for the payment to confirm or fail first.';
  if (!o.cod) refund(state, o, o.total, 'Cancelled before dispatch — full refund');
  o.status = 'cancelled'; o.history.push({at: stamp(), text: o.cod ? 'Cancelled (cash on delivery, nothing to refund)' : 'Cancelled · full refund started'});
  return '';
}
export function advanceOrder(state, o) {
  const i = STEPS.indexOf(o.status === 'confirmed' ? 'paid' : o.status);
  if (i < 0 || i >= STEPS.length - 1) return 'No further step.';
  o.status = STEPS[i + 1]; o.history.push({at: stamp(), text: o.status.replace(/_/g, ' ')});
  if (o.status === 'delivered') {
    o.deliveredAt = clock();
    issueInvoice(state, {kind: 'order', o, party: o.party});
    const rate = PRODUCT_POLICY.commission, commission = Math.round(o.total * rate);
    if (o.cod) {
      record(state, {owner: 'personal', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'customer_payment', purpose: 'order', payer: 'personal', payee: o.party, responsible: 'personal', amount: o.total, method: 'cash', channel: 'cash', reference: `COD-${o.id}`, status: 'confirmed', note: `Cash collected on delivery · ${o.id}`}, 'Delivery partner');
      record(state, {owner: o.party, orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'cash_commission', payer: o.party, payee: 'moveai', responsible: o.party, amount: commission, method: 'wallet', reference: `COMM-${o.id}`, status: 'confirmed', note: `8% commission on cash order ${o.id}`});
    } else {
      const held = orderPayments(state, o).filter(e => e.type === 'customer_payment' && e.status === 'held');
      held.forEach(e => { e.status = 'released'; });
      record(state, {owner: o.party, orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'wallet_credit', payer: 'moveai', payee: o.party, responsible: 'moveai', amount: o.total - commission, method: 'wallet', reference: `REL-${o.id}`, status: 'confirmed', gross: o.total, commission, note: `${o.id} delivered: ${inr(o.total)} − 8% commission`});
      record(state, {owner: 'moveai', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'commission', payer: o.party, payee: 'moveai', responsible: o.party, amount: commission, method: 'wallet', reference: `COM-${o.id}`, status: 'confirmed', note: `Commission ${o.id}`});
    }
  }
  return '';
}
export function returnOrder(state, o, reason) {
  if (o.status !== 'delivered') return 'Only delivered orders can be returned.';
  if (clock() - (o.deliveredAt || 0) > PRODUCT_POLICY.returnDays * DAY) return `Returns are allowed within ${PRODUCT_POLICY.returnDays} days of delivery.`;
  if (!String(reason || '').trim()) return 'Tell us why you are returning it.';
  o.status = 'return_requested'; o.returnReason = reason; o.history.push({at: stamp(), text: `Return requested: ${reason}`});
  return '';
}
export function completeReturn(state, o) {
  if (o.status !== 'return_requested') return 'No return in progress.';
  // Refund from the store's wallet (reverse the release) — to the original method, or by UPI for COD.
  record(state, {owner: o.party, orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'penalty', payer: o.party, payee: 'moveai', responsible: o.party, amount: o.total - Math.round(o.total * PRODUCT_POLICY.commission), method: 'wallet', reference: `RTN-${o.id}`, status: 'confirmed', note: `Return ${o.id}: amount taken back from the store`});
  const g = gateway.refund(`ret_${o.id}`, o.total);
  record(state, {owner: 'personal', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: o.party, amount: o.total, method: o.cod ? 'upi' : o.method, reference: g.ref, status: 'refund_initiated', expectedBy: clock() + 5 * DAY, gatewayFinal: 'refunded', note: `Return refund · ${o.id}${o.cod ? ' (to your UPI, as it was cash on delivery)' : ''}`});
  o.status = 'returned'; o.history.push({at: stamp(), text: 'Picked up · refund started'});
  return '';
}

// ---------- screens ----------
export function checkoutScreen(state) {
  const p = state.products.find(x => x.id === state.checkoutProductId) || state.products[0];
  const qty = Number(state.checkoutQty || 1), q = quote(p, qty);
  return `${head('Checkout', `${p.name} · ${p.size} · delivered by a MoveAI store partner`)}
  <section class="panel form-panel narrow"><form data-po-form="checkout" class="form-grid two">
    <label><span>Quantity</span><select name="qty" data-po-qty>${[1, 2, 3, 4, 5].map(n => `<option ${n === qty ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="wide"><span>Delivery address</span><textarea name="address" rows="2">Flat 402, Sector 62, Noida 201301</textarea></label>
    <table class="price-table wide"><tbody><tr><td>${qty} × ${esc(p.name)}</td><td>${inr(q.items)}</td></tr><tr><td>Delivery${q.delivery ? ` (free above ${inr(PRODUCT_POLICY.freeDeliveryAbove)})` : ''}</td><td>${q.delivery ? inr(q.delivery) : 'Free'}</td></tr><tr class="total"><td>Total</td><td>${inr(q.total)}</td></tr></tbody></table>
    <div class="pay-box wide"><div class="pay-methods"><label><input type="radio" name="method" value="upi" checked> UPI</label><label><input type="radio" name="method" value="card"> Card</label><label><input type="radio" name="method" value="cod"> Cash on delivery${q.total > PRODUCT_POLICY.codLimit ? ' (not available above ₹5,000)' : ''}</label></div>
    <label class="pay-field" data-for="upi"><span>UPI ID</span><input name="vpa" id="pay-vpa" value="shubham@okaxis"></label><label class="pay-field" data-for="card" hidden><span>Card number</span><input name="card" id="pay-card" inputmode="numeric"></label>
    <p class="muted">Online payments are held by MoveAI Pay until the order is delivered. Cancel before dispatch for a full refund; return within ${PRODUCT_POLICY.returnDays} days of delivery.</p><p class="mock-hint">${esc(TEST)}</p></div>
    ${billingFieldsHtml(state)}
    <p id="po-error" class="field-error wide" hidden></p><div class="form-actions wide"><button type="button" class="button secondary" data-route="search">Back</button><button class="button primary" type="submit">Place order · ${inr(q.total)}</button></div></form></section>`;
}
export function ordersScreen(state) {
  const name = id => state.products.find(p => p.id === id)?.name || id;
  return `${head('My orders', 'Online payments are held until delivery. Cancel before dispatch or return within 7 days.', '<button class="button primary" data-route="search">Buy products</button>')}
  ${state.customerOrders.map(o => { const refunds = state.ledger.filter(x => x.orderId === o.id && x.type === 'refund'); return `<section class="panel order-card"><div class="panel-header"><div><h2>${esc(o.id)} · ${inr(o.total)}</h2><p>${o.items.map(i => `${i.quantity} × ${esc(name(i.productId))}`).join(', ')} · ${esc(o.fulfilmentPartner || 'Store partner')}${o.method ? ` · ${o.cod ? 'Cash on delivery' : esc(String(o.method).toUpperCase())}` : ''}</p></div>${pill(o.status)}</div>
    ${o.status === 'payment_pending' ? `<div class="info-banner"><b>Payment processing</b><span>Do not pay again.</span><button class="button secondary compact" data-po="check" data-id="${o.id}">Check status</button></div>` : ''}
    ${o.cancelReason ? `<p class="muted">${esc(o.cancelReason)}</p>` : ''}
    ${refunds.map(x => `<p class="muted">Refund ${inr(x.amount)} · ${x.status === 'refunded' ? 'reached your account' : `expected by ${new Date(x.expectedBy).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})}`}</p>`).join('')}
    <div class="row-actions">${['paid', 'confirmed', 'packed'].includes(o.status) ? `<button class="button secondary compact" data-po="cancel" data-id="${o.id}">Cancel order</button>` : ''}${o.status === 'delivered' && o.deliveredAt ? `<details><summary class="button secondary compact">Return</summary><form class="inline-form" data-po-form="return" data-id="${o.id}"><input name="reason" placeholder="Reason (damaged, wrong item…)"><button class="button secondary compact">Request return</button></form></details>` : ''}${['paid', 'confirmed', 'packed', 'out_for_delivery'].includes(o.status) && o.method ? `<button class="button text compact" data-po="advance" data-id="${o.id}">Prototype: next delivery step</button>` : ''}${o.status === 'return_requested' ? `<button class="button text compact" data-po="pickup" data-id="${o.id}">Prototype: return picked up</button>` : ''}</div>
    <div class="row-actions">${state.ledger.filter(x => x.orderId === o.id && x.receiptNo).map(x => `<button class="button text compact" data-bill-doc="receipt" data-id="${x.id}">Receipt ${esc(x.receiptNo.split('/').pop())}</button>`).join('')}${(state.customerInvoices || []).filter(i => i.ref === o.id).map(i => `<button class="button text compact" data-bill-doc="invoice" data-id="${i.id}">${esc(i.docType)}</button>`).join('')}${refunds.map(x => `<button class="button text compact" data-bill-doc="credit" data-id="${x.id}">Credit note</button>`).join('')}</div>
    <details><summary class="muted">History</summary>${(o.history || []).map(h => `<small class="block">${esc(h.at)} · ${esc(h.text)}</small>`).join('')}</details></section>`; }).join('') || '<div class="empty-inline"><b>No orders yet</b></div>'}`;
}
export function bindOrders(root, api) {
  const S = () => api.getState(), find = id => S().customerOrders.find(o => o.id === id);
  const done = (e, ok) => { if (e) return api.toast(e); api.save(); api.render(); if (ok) api.toast(ok); };
  root.querySelectorAll('[data-action="buy-product"]').forEach(b => b.onclick = ev => { ev.stopImmediatePropagation(); S().checkoutProductId = b.dataset.product; S().checkoutQty = 1; api.save(); api.navigate('productCheckout'); });
  root.querySelector('[data-po-qty]')?.addEventListener('change', e => { S().checkoutQty = Number(e.target.value); api.save(); api.render(); });
  root.querySelectorAll('input[name="method"]').forEach(r => r.onchange = () => root.querySelectorAll('.pay-field').forEach(f => { f.hidden = f.dataset.for !== r.value; }));
  root.querySelectorAll('[data-po]').forEach(b => b.onclick = () => { const s = S(), o = find(b.dataset.id), k = b.dataset.po;
    if (k === 'check') return done(checkPayment(s, o), o.status === 'paid' ? 'Payment confirmed' : 'Payment failed — order cancelled, nothing charged');
    if (k === 'cancel') return done(cancelOrder(s, o), o.cod ? 'Order cancelled' : `Cancelled · ${inr(o.total)} refund started`);
    if (k === 'advance') return done(advanceOrder(s, o), `Order ${o.status.replace(/_/g, ' ')}`);
    if (k === 'pickup') return done(completeReturn(s, o), 'Return picked up · refund started'); });
  root.querySelectorAll('form[data-po-form]').forEach(f => f.onsubmit = e => { e.preventDefault(); const s = S(), fd = Object.fromEntries(new FormData(f));
    if (f.dataset.poForm === 'return') return done(returnOrder(s, find(f.dataset.id), fd.reason), 'Return requested · pickup will be arranged');
    const b = readBilling(root); if (b.error) { const el = root.querySelector('#po-error'); el.textContent = b.error; el.hidden = false; return; }
    const r = placeOrder(s, {productId: s.checkoutProductId, ...fd, billing: b.billing}); if (r.error) { const el = root.querySelector('#po-error'); el.textContent = r.error; el.hidden = false; return; }
    api.save(); api.navigate('orders'); api.toast(r.order.status === 'payment_pending' ? 'Payment processing — we will confirm shortly' : r.order.cod ? 'Order placed · pay cash on delivery' : `Paid ${inr(r.order.total)} · order placed`); });
}
