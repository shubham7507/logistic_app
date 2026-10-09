// MoveAI One — notification centre like other platforms: action items pinned, one live card per active
// order/booking, finished orders collapsed under Past, payments & refunds, opt-in offers, and remaining
// updates grouped per order ("3 earlier updates"). Works for customers, sellers, pickers, couriers and admin.
import {esc, pill, inr} from './ops.js';
import * as Geo from './geo.js';

const FINAL = ['delivered', 'collected', 'cancelled', 'returned', 'refunded', 'closed', 'rated', 'completed_closed'];
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const refOf = n => n.ref || (String(n.text).match(/^([A-Z]{2,4}-[A-Z0-9-]+):/) || [])[1] || 'general';
export function mine(s, ws) {
  const key = ws === 'staff' ? `staff:${s.selectedStaffId}` : ws;
  const selected=s.activePicker?.[ws]||s.activeStoreManager?.[ws];
  return (s.notifications || []).filter(n => (n.to === ws || n.to === key || (n.parties || []).includes(ws)) && (!n.staffId || n.staffId === selected || ws === 'staff' && n.staffId === s.selectedStaffId) && (!n.pickerId || n.pickerId === s.activePicker?.[ws]) && (!n.managerId || n.managerId === s.activeStoreManager?.[ws]));
}
function groups(list) {
  const g = new Map(); for (const n of list) { const r = refOf(n); if (!g.has(r)) g.set(r, []); g.get(r).push(n); }
  return [...g.entries()].map(([ref, items]) => ({ref, items, latest: items[0], unread: items.filter(x => !x.read).length}));
}
const STATUS = {paid: 'Placed', confirmed: 'Placed', payment_pending: 'Payment processing', accepted: 'Store preparing', ready_for_pickup: 'Packed · waiting for courier', out_for_delivery: 'On the way', delivery_issue: 'Delivery problem', delivered: 'Delivered', collected: 'Collected', cancelled: 'Cancelled', returned: 'Returned', ready_for_collection: 'Ready to collect'};
const BOOKING = {searching: 'Finding a partner', confirmed: 'Booked', accepted: 'Partner confirmed', in_progress: 'In progress', provider_done: 'Work done — confirm and pay', completed: 'Completed — pay now', paid: 'Paid — rate the service', survey_requested: 'Video survey requested'};
const PROGRESS = {paid: 15, confirmed: 15, accepted: 35, ready_for_pickup: 60, out_for_delivery: 80, delivered: 100, collected: 100};

// ---------- what needs the user's action ----------
export function actions(s, ws) {
  const out = [];
  if (ws === 'personal') {
    for (const o of s.customerOrders || []) {
      if (o.status === 'payment_pending') out.push({ref: o.id, text: 'Payment processing — check status', route: 'orders', cta: 'Check'});
      if (o.pendingItemId && o.status !== 'cancelled') out.push({ref: o.id, text: 'An item is unavailable — choose a replacement or remove it', route: 'orders', cta: 'Choose'});
      if (['delivered', 'collected'].includes(o.status) && o.deliveredAt && Date.now() - o.deliveredAt < 7 * 864e5 && !(s.reviews || []).some(r => r.orderId === o.id)) out.push({ref: o.id, text: 'Rate your items, store and delivery', route: 'orders', cta: 'Rate'});
    }
    for (const c of s.claims || []) if (c.status === 'pickup_assigned') out.push({ref: c.orderId, text: `Return pickup: show code ${c.pickup.code} to ${c.pickup.partnerName}`, route: 'orders', cta: 'View'});
    for (const r of (s.serviceRequests || []).filter(x => x.customer === 'personal')) {
      if ((r.extras || []).some(x => x.status === 'proposed')) out.push({ref: r.id, text: 'Approve or reject extra charges', route: 'serviceDetail', id: r.id, cta: 'Review'});
      if (r.status === 'provider_done') out.push({ref: r.id, text: 'Partner marked the work done — confirm and pay', route: 'serviceDetail', id: r.id, cta: 'Confirm'});
      if (r.fixedQuote && !r.fixedQuoteAccepted) out.push({ref: r.id, text: `Fixed quote ${inr(r.fixedQuote.amount)} is ready`, route: 'serviceDetail', id: r.id, cta: 'Accept'});
    }
  }
  const store = s.shopPartners?.[ws] || s.shopPartners?.[ws?.replace(/Manager$/, '')];
  if (store) {
    for (const o of (s.customerOrders || []).filter(x => x.fulfilmentPartner === store.name)) {
      if (['paid', 'confirmed'].includes(o.status)) out.push({ref: o.id, text: `New order ${inr(o.itemTotal)} — accept it`, route: 'shopOrders', cta: 'Open'});
      if (o.status === 'ready_for_pickup' && o.deliveryAssignment && o.geo?.live) out.push({ref: o.id, text: `Courier arriving in about ${Geo.etaMin(s, o)} min — keep the bags ready`, route: 'shopOrders', cta: 'Open'});
    }
    for (const c of (s.claims || []).filter(x => x.store === store.name && x.status === 'refunded' && !x.dispute && Date.now() - (x.refundedAt || 0) < 2 * 864e5)) out.push({ref: c.orderId, text: `Return ${c.id} refunded ${inr(c.amount)} — dispute within 48 h if not valid`, route: 'plusReturns', cta: 'Review'});
  }
  const courier = s.deliveryPartners?.[ws];
  if (courier) {
    for (const o of (s.customerOrders || []).filter(x => x.deliveryAssignment?.partnerId === courier.id && x.deliveryAssignment.status === 'offered')) out.push({ref: o.id, text: `New delivery offer · ${(o.deliveryKm || 0).toFixed(1)} km · earn ${inr(o.feeBreakdown?.deliveryPartnerEarning || 0)}`, route: 'deliveryJobs', cta: 'Open'});
    for (const c of (s.claims || []).filter(x => x.pickup?.partnerId === courier.id && x.status === 'pickup_assigned')) out.push({ref: c.id, text: 'Return pickup assigned', route: 'deliveryJobs', cta: 'Open'});
  }
  if (ws === 'admin') {
    const pend = (s.products || []).filter(p => p.approval === 'pending').length, rev = (s.claims || []).filter(c => c.status === 'review' || c.dispute?.status === 'open').length, iss = (s.customerOrders || []).filter(o => o.status === 'delivery_issue').length;
    if (pend) out.push({ref: 'approvals', text: `${pend} listing(s) waiting for approval`, route: 'plusApprovals', cta: 'Review'});
    if (rev) out.push({ref: 'claims', text: `${rev} claim(s) or store dispute(s) to decide`, route: 'plusClaims', cta: 'Review'});
    if (iss) out.push({ref: 'issues', text: `${iss} delivery problem(s)`, route: 'commerceIssues', cta: 'Open'});
  }
  // business, partner and staff apps beyond shop orders
  const BIZ = ['goods', 'transporter', 'vehicle', 'movers'];
  if (BIZ.includes(ws)) {
    for (const t of (s.trips || []).filter(t => t.owner === ws && t.status === 'awaiting_assignment')) out.push({ref: t.id, text: 'Trip needs a vehicle and crew', route: 'trips', cta: 'Assign'});
    for (const x of (s.ledger || []).filter(x => x.owner === ws && x.status === 'pending_approval')) out.push({ref: x.id, text: `Payment of ${inr(x.amount)} waiting for your approval`, route: 'money', cta: 'Approve'});
    for (const i of (s.freightInvoices || []).filter(i => i.billTo === ws && i.status !== 'cancelled' && (i.charges || []).some(c => c.status === 'proposed'))) out.push({ref: i.number, text: 'Extra charge on a freight invoice needs your approval', route: 'invoices', cta: 'Review'});
    for (const o of (s.workOffers || []).filter(o => o.to === ws && o.status === 'pending')) out.push({ref: o.id, text: `Offer: ${o.title || o.kind}`, route: 'trips', cta: 'Open'});
    if (ws === 'movers') for (const j of (s.movingJobs || []).filter(j => j.owner === ws && j.status === 'auto_assigned')) out.push({ref: j.id, text: `New moving job ${j.size || ''} on ${j.date || ''} — confirm the slot`, route: 'work', cta: 'Open'});
    for (const m of (s.peopleByWorkspace?.[ws] || []).filter(m => m.status === 'submitted')) out.push({ref: m.id, text: `${m.name} submitted joining details — review`, route: 'people', cta: 'Review'});
  }
  if (['commercialDriver', 'personalDriver', 'helper'].includes(ws)) {
    for (const o of (s.workOffers || []).filter(o => o.to === ws && o.status === 'pending')) out.push({ref: o.id, text: `Work offer: ${o.title || o.kind} · ${inr(o.pay || 0)}`, route: 'myJobs', cta: 'Respond'});
    if (ws === 'personalDriver') for (const r of (s.serviceRequests || []).filter(r => r.type === 'driver' && r.status === 'searching')) out.push({ref: r.id, text: 'New customer request near you', route: 'myJobs', cta: 'View'});
  }
  if (ws === 'admin') { const v = (s.verificationQueue || []).filter(x => x.status === 'pending').length; if (v) out.push({ref: 'verification', text: `${v} verification(s) waiting`, route: 'verification', cta: 'Review'}); }
  if (/picker/i.test(ws)) for (const o of (s.customerOrders || []).filter(x => x.status === 'accepted' && x.pick && !x.pick.completedAt && x.pick.pickerWs === ws)) out.push({ref: o.id, text: 'Order assigned to you — start picking', route: 'pickTasks', cta: 'Open'});
  return out;
}
export const badge = (s, unreadList, ws) => new Set(unreadList.map(refOf)).size + actions(s, ws || s.currentWorkspace).length;

// ---------- screen ----------
function orderCard(s, o, past) {
  const eta = !past && o.deliveryAssignment && o.dest ? Geo.etaMin(s, o) : o.etaMinutes;
  return `<article class="nc-card"><div><b>${esc(o.id)} · ${esc(o.fulfilmentPartner || '')}</b><small class="block">${esc(STATUS[o.status] || o.status)}${!past && eta ? ` · about ${eta} min` : ''} · ${inr(o.total)}</small>${past ? '' : `<span class="progress"><i style="width:${PROGRESS[o.status] || 20}%"></i></span>`}</div>
  <span class="row-actions">${past ? `<button class="button secondary compact" data-nc-go="orders">Receipt & help</button><button class="button text compact" data-nc-again="${esc(o.id)}">Buy again</button>` : `<button class="button primary compact" data-nc-track="${esc(o.id)}">Track</button>`}</span></article>`;
}
export function screen(s) {
  const ws = s.currentWorkspace, list = mine(s, ws), acts = actions(s, ws), gs = groups(list);
  const isCustomer = ws === 'personal';
  const active = isCustomer ? (s.customerOrders || []).filter(o => !FINAL.includes(o.status)) : [];
  const past = isCustomer ? (s.customerOrders || []).filter(o => FINAL.includes(o.status)).slice(0, 8) : [];
  const bookings = isCustomer ? (s.serviceRequests || []).filter(r => r.customer === 'personal' && !['closed', 'cancelled', 'rated'].includes(r.status)) : [];
  const refunds = isCustomer ? (s.ledger || []).filter(x => x.type === 'refund' && x.payee === 'personal').slice(0, 5) : [];
  const bizActive = !isCustomer ? [...(s.trips || []).filter(t => (t.owner === ws || (t.parties || []).includes(ws) || (t.crew || []).some(c => c.persona === ws)) && !['closed', 'cancelled'].includes(t.status)).map(t => ({ref: t.id, title: t.title, status: t.hold ? 'On hold' : t.status, route: 'tripDetail', key: 'selectedTripId'})), ...(s.movingJobs || []).filter(j => (j.owner === ws || (j.crew || []).some(c => c.persona === ws)) && !['closed', 'cancelled'].includes(j.status)).map(j => ({ref: j.id, title: `${j.size || ''} move · ${j.from || ''} → ${j.to || ''}`, status: j.status, route: 'movingJob', key: 'selectedMovingJobId'}))] : [];
  const covered = new Set([...active, ...past].map(o => o.id).concat(bookings.map(b => b.id)));
  const other = gs.filter(g => !covered.has(g.ref));
  const orderRef = g => /^(ORD|SR|MOV|TRP|CLM)-/.test(g.ref);
  return `${head('Notifications', 'What needs you first, then live orders, then everything else.', `<button class="button secondary" data-nc-readall>Mark all read</button>`)}
  ${acts.length ? `<section class="panel nc-actions"><h2>Needs your action (${acts.length})</h2>${acts.map(a => `<article class="nc-card action"><div><b>${esc(a.ref)}</b><small class="block">${esc(a.text)}</small></div><button class="button primary compact" data-nc-go="${esc(a.route)}" data-nc-id="${esc(a.id || a.ref)}">${esc(a.cta)}</button></article>`).join('')}</section>` : ''}
  ${isCustomer ? `<section class="panel"><h2>Active (${active.length + bookings.length})</h2>${active.map(o => orderCard(s, o, false)).join('')}${bookings.map(r => `<article class="nc-card"><div><b>${esc(r.id)} · ${esc(r.title)}</b><small class="block">${esc(BOOKING[r.status] || r.status)}</small></div><button class="button secondary compact" data-nc-go="serviceDetail" data-nc-id="${esc(r.id)}">Open</button></article>`).join('') || (active.length ? '' : '<p class="muted">Nothing in progress.</p>')}</section>` : ''}
  ${!isCustomer && bizActive.length ? `<section class="panel"><h2>Active (${bizActive.length})</h2>${bizActive.map(a => `<article class="nc-card"><div><b>${esc(a.ref)} · ${esc(a.title)}</b><small class="block">${esc(String(a.status).replace(/_/g, ' '))}</small></div><button class="button secondary compact" data-nc-job="${esc(a.ref)}" data-route-to="${a.route}" data-key="${a.key}">Open</button></article>`).join('')}</section>` : ''}
  ${other.length ? `<section class="panel"><h2>${isCustomer ? 'Account & other updates' : 'Updates'}</h2>${other.map(g => `<details class="nc-group ${g.unread ? 'unread' : ''}"><summary><b>${esc(orderRef(g) ? g.ref : 'MoveAI')}</b> · ${esc(String(g.latest.text).replace(/^[A-Z]{2,4}-[A-Z0-9-]+:\s*/, ''))} <small class="muted">${esc(g.latest.at || '')}${g.items.length > 1 ? ` · ${g.items.length - 1} earlier update${g.items.length > 2 ? 's' : ''}` : ''}</small></summary>${g.items.slice(1).map(n => `<small class="block muted">${esc(n.at || '')} · ${esc(String(n.text).replace(/^[A-Z]{2,4}-[A-Z0-9-]+:\s*/, ''))}</small>`).join('')}${orderRef(g) ? `<button class="button text compact" data-nc-open="${esc(g.ref)}">Open</button>` : ''}</details>`).join('')}</section>` : ''}
  ${settingsHtml(s, ws)}
  ${isCustomer ? `<section class="panel"><h2>Past orders</h2>${past.map(o => orderCard(s, o, true)).join('') || '<p class="muted">Finished orders appear here.</p>'}</section>
  <section class="panel"><h2>Payments & refunds</h2>${refunds.map(x => `<div class="ledger-row static"><span><b>${inr(x.amount)} refund · ${esc(x.orderId || x.serviceId || '')}</b><small>${x.status === 'refunded' ? 'Reached your account / wallet' : 'On the way'}</small></span></div>`).join('') || '<p class="muted">No refunds.</p>'}${s.customerWallet?.balance ? `<p>MoveAI wallet: <b>${inr(s.customerWallet.balance)}</b></p>` : ''}</section>
  <section class="panel"><h2>Offers</h2><label class="consent-row"><input type="checkbox" data-nc-offers ${s.offersOptIn ? 'checked' : ''}> Show offers and coupons here</label>${s.offersOptIn ? (s.coupons || []).filter(c => c.active).map(c => `<small class="block"><b>${esc(c.code)}</b> · ${esc(c.label)}</small>`).join('') : ''}</section>` : ''}`;
}
export function bind(root, api) {
  root.querySelector('[data-nc-prefs]')?.addEventListener('submit', e => { e.preventDefault(); const s = api.getState(), p = prefs(s, s.currentWorkspace), fd = new FormData(e.target); for (const k of Object.keys(TYPES)) for (const c of ['push', 'sms', 'whatsapp']) p[k][c] = fd.has(`${k}.${c}`); p.quietStart = fd.get('quietStart'); p.quietEnd = fd.get('quietEnd'); api.save(); api.render(); api.toast('Notification settings saved'); });
  root.querySelectorAll('[data-nc-job]').forEach(b => b.onclick = () => { const s = api.getState(); s[b.dataset.key] = b.dataset.ncJob; for (const n of mine(s, s.currentWorkspace)) if (refOf(n) === b.dataset.ncJob) n.read = true; api.save(); api.navigate(b.dataset.routeTo); });
  const S = () => api.getState();
  const readRef = ref => { for (const n of mine(S(), S().currentWorkspace)) if (refOf(n) === ref) n.read = true; };
  root.querySelector('[data-nc-readall]')?.addEventListener('click', () => { for (const n of mine(S(), S().currentWorkspace)) n.read = true; api.save(); api.render(); });
  root.querySelectorAll('[data-nc-track]').forEach(b => b.onclick = () => { readRef(b.dataset.ncTrack); S().selectedTrackingOrderId = b.dataset.ncTrack; api.save(); api.navigate('orderTracking'); });
  root.querySelectorAll('[data-nc-go]').forEach(b => b.onclick = () => { const id = b.dataset.ncId; if (id) { readRef(id); if (/^SR-/.test(id)) S().selectedServiceId = id; } api.save(); api.navigate(b.dataset.ncGo); });
  root.querySelectorAll('[data-nc-open]').forEach(b => b.onclick = () => { const r = b.dataset.ncOpen; readRef(r); if (/^ORD-/.test(r)) { S().selectedTrackingOrderId = r; api.save(); return api.navigate('orderTracking'); } if (/^SR-/.test(r)) { S().selectedServiceId = r; api.save(); return api.navigate('serviceDetail'); } api.save(); api.render(); });
  root.querySelectorAll('details.nc-group').forEach(d => d.addEventListener('toggle', () => { if (d.open) { const r = d.querySelector('[data-nc-open]')?.dataset.ncOpen; if (r) { readRef(r); api.save(); } } }));
  root.querySelectorAll('[data-nc-again]').forEach(b => b.onclick = () => { const s = S(), o = s.customerOrders.find(x => x.id === b.dataset.ncAgain); s.productCart ||= []; for (const i of o.items) if (!s.productCart.some(c => c.productId === i.productId)) s.productCart.push({productId: i.productId, quantity: i.quantity, priceAtAdd: i.unitPrice}); api.save(); api.navigate('cart'); });
  root.querySelector('[data-nc-offers]')?.addEventListener('change', e => { S().offersOptIn = e.target.checked; api.save(); api.render(); });
}

// ---------- notification settings ----------
export const TYPES = {orders: 'Orders, jobs and trips', payments: 'Payments and refunds', offers: 'Offers and coupons', account: 'Account and security'};
export function prefs(s, ws) { s.notifyPrefs ||= {}; return (s.notifyPrefs[ws] ||= {orders: {push: true, sms: true, whatsapp: true}, payments: {push: true, sms: true, whatsapp: false}, offers: {push: false, sms: false, whatsapp: false}, account: {push: true, sms: true, whatsapp: false}, quietStart: '22:00', quietEnd: '07:00'}); }
export function typeOf(text) { return /refund|paid|payment|payout|wallet|₹/i.test(text) ? 'payments' : /offer|coupon|% off/i.test(text) ? 'offers' : /login|password|security|account/i.test(text) ? 'account' : 'orders'; }
const ist = () => new Date().toLocaleTimeString('en-GB', {timeZone: 'Asia/Kolkata', hour12: false}).slice(0, 5);
export function channelsFor(s, to, text) {
  const p = prefs(s, to), t = typeOf(text), c = p[t] || {}, urgent = /arriv|code|OTP|failed|declined/i.test(text);
  const quiet = p.quietStart > p.quietEnd ? (ist() >= p.quietStart || ist() < p.quietEnd) : (ist() >= p.quietStart && ist() < p.quietEnd);
  const ch = ['push', 'sms', 'whatsapp'].filter(k => c[k]).map(k => ({push: 'Push', sms: 'SMS', whatsapp: 'WhatsApp'}[k]));
  return quiet && !urgent ? ch.filter(x => x === 'Push').map(() => 'Push (silent, quiet hours)') : ch;
}
function settingsHtml(s, ws) {
  const p = prefs(s, ws);
  return `<details class="panel nc-settings"><summary><b>Notification settings</b></summary><form data-nc-prefs class="form-grid"><div class="table-scroll"><table class="data-table"><thead><tr><th>Type</th><th>Push</th><th>SMS</th><th>WhatsApp</th></tr></thead><tbody>${Object.entries(TYPES).map(([k, l]) => `<tr><td>${esc(l)}</td>${['push', 'sms', 'whatsapp'].map(c => `<td><input type="checkbox" name="${k}.${c}" ${p[k][c] ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><label>Quiet hours <input type="time" name="quietStart" value="${esc(p.quietStart)}"> to <input type="time" name="quietEnd" value="${esc(p.quietEnd)}"></label><small class="muted">During quiet hours only silent push is sent, except urgent alerts (arriving, codes, failed payments). In-app notifications always stay here.</small><button class="button secondary compact">Save settings</button></form></details>`;
}
