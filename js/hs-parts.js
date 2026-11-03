// MoveAI One — spare parts and hardware during a home-service job.
// The pro picks the part from nearby MoveAI shops (price and MRP come from the shop, he cannot type more),
// then: from my kit / order for delivery / I'll pick it up. The customer gets one card per request
// (Approve / I'll buy it myself / Reject) with "See it in the shop". No shop nearby (e.g. Motihari): he
// uploads the market bill + a photo of the MRP on the box; never above MRP, "higher than usual" is flagged and
// a small visible pickup charge is allowed. "Waiting for part" pauses the job with a free return visit.
// After payment the part money goes to the shop (labour keeps MoveAI's 15%). "Report price" → admin refund.
import {clock, record} from './pay.js';
import {km} from './geo.js';
import * as LOC from './location.js';

const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const notify = (s, to, text, ref, route) => { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, route, at: stamp(), read: false}); };
const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const PART_CATEGORIES = {'Electrical & lighting': ['electrician'], 'Hardware & sanitary': ['plumber', 'carpenter', 'electrician'], 'Paint & hardware': ['painting'], 'Home cleaning': ['cleaning']};
export const SHOP_RADIUS_KM = 15, PICKUP_FEE = 40, HIGHER_PCT = 1.25, DELIVERY_ETA = 35;

// Shops that sell parts: demo part shops plus any approved seller whose products are in a part category.
export function shops(s) {
  const out = {...(s.partShops || {})};
  for (const [k, sp] of Object.entries(s.shopPartners || {})) { const at = sp.coords || LOC.PIN_CENTRES[sp.deliveryArea?.pincode]?.slice(0, 2); if (!out[k] && at && sp.status !== 'suspended' && !Object.values(out).some(x => x.name === sp.name)) out[k] = {name: sp.name, coords: at, party: sp.party || `store:${k}`, workspace: k, city: '', address: sp.pickupAddress || ''}; }
  return out;
}
export function catalog(s) {
  const sh = shops(s), byName = Object.fromEntries(Object.entries(sh).map(([k, v]) => [v.name, k]));
  const own = (s.partCatalog || []).map(p => ({...p, shopKey: p.shop}));
  const sellers = (s.products || []).filter(p => p.status === 'active' && PART_CATEGORIES[p.category] && byName[p.fulfilmentPartner]).map(p => ({id: p.id, shopKey: byName[p.fulfilmentPartner], name: `${p.name}${p.size ? ` (${p.size})` : ''}`, price: p.price, mrp: p.mrp || p.price, category: p.category, fromProducts: true}));
  return [...own, ...sellers].filter(p => sh[p.shopKey]);
}
// Parts for this job's trade, from shops within 15 km of the job, matching the search words.
export function search(s, r, q = '') {
  const sh = shops(s), to = LOC.point(r.address) || LOC.PIN_CENTRES[r.address?.pincode]?.slice(0, 2), words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return catalog(s).filter(p => (PART_CATEGORIES[p.category] || []).includes(r.category) && words.every(w => p.name.toLowerCase().includes(w)))
    .map(p => ({...p, shop: sh[p.shopKey], km: to ? Math.round(km(to, sh[p.shopKey].coords) * 10) / 10 : null}))
    .filter(p => to && p.km <= SHOP_RADIUS_KM).sort((a, b) => (a.km ?? 99) - (b.km ?? 99) || a.price - b.price);
}
export const nearbyShops = (s, r) => { const keys = new Set(search(s, r).map(p => p.shopKey)); return Object.entries(shops(s)).filter(([k]) => keys.has(k)); };
// Typical price of a part across MoveAI shops (used to flag market bills).
export function usualPrice(s, name) {
  const key = String(name || '').toLowerCase().split(/[\s(]+/).filter(w => w.length > 2).slice(0, 2);
  const ps = catalog(s).filter(p => key.length && key.every(w => p.name.toLowerCase().includes(w))).map(p => p.price).sort((a, b) => a - b);
  return ps.length ? ps[Math.floor(ps.length / 2)] : null;
}

const job = (s, id) => (s.serviceRequests || []).find(x => x.id === id && x.type === 'general');
// Pro adds a part. v: {productId, qty, mode: kit|delivery|pickup|market, photo, name, price, mrp, bill, mrpPhoto}
export function addPart(s, ws, id, v) {
  const r = job(s, id); if (!r || r.provider !== ws || r.status !== 'in_progress') return 'Start the job first.';
  const qty = Math.max(1, Math.min(50, Math.round(Number(v.qty) || 1)));
  if (!v.photo) return 'Add a photo of the old or broken part.';
  let part;
  if (v.mode === 'market') {
    const name = String(v.name || '').trim(), price = Math.round(Number(v.price) || 0), mrp = Math.round(Number(v.mrp) || 0);
    if (name.length < 3) return 'Write the part name.';
    if (!(price > 0) || !(mrp > 0)) return 'Enter the price you paid and the MRP printed on the box.';
    if (price > mrp) return `The price (${inr(price)}) is above the MRP (${inr(mrp)}). Parts can never be charged above MRP.`;
    if (!v.bill || !v.mrpPhoto) return 'Add the shop bill and a photo of the MRP on the box.';
    const usual = usualPrice(s, name);
    part = {name, qty, price, mrp, mode: 'market', bill: v.bill, mrpPhoto: v.mrpPhoto, pickupFee: PICKUP_FEE, usual, flag: usual && price > usual * HIGHER_PCT ? 'higher' : ''};
  } else {
    const p = catalog(s).find(x => x.id === v.productId); if (!p) return 'Choose the part from a nearby MoveAI shop.';
    if (!['kit', 'delivery', 'pickup'].includes(v.mode)) return 'Choose: from my kit, order for delivery, or I\'ll pick it up.';
    const sh = shops(s)[p.shopKey];
    part = {productId: p.id, name: p.name, qty, price: p.price, mrp: p.mrp, mode: v.mode, shopKey: p.shopKey, shopName: sh.name, shopParty: sh.party, pickupFee: 0, flag: ''};
  }
  Object.assign(part, {id: uid('PT'), photo: v.photo, status: 'proposed', at: stamp()});
  (r.parts ||= []).push(part); r.timeline.push({at: stamp(), text: `Part requested: ${part.name} × ${qty}`});
  notify(s, 'personal', `${r.id}: ${r.providerName} needs ${part.name} (${inr(part.price * qty + part.pickupFee)}). Approve it before it is fitted.`, r.id, 'serviceDetail');
  return '';
}
export const pending = r => (r.parts || []).filter(p => p.status === 'proposed');
export const partTotal = p => p.price * p.qty + (p.pickupFee || 0);
// Customer: approve / self (I'll buy it myself) / reject — one part or all waiting parts.
export function decide(s, id, decision, partId = null) {
  const r = job(s, id); const list = pending(r || {}).filter(p => !partId || p.id === partId); if (!list.length) return 'No part is waiting for you.';
  for (const p of list) {
    if (decision === 'approve') {
      p.status = 'approved'; p.decidedAt = stamp();
      if (p.mode === 'delivery') { p.order = {status: 'placed', eta: DELIVERY_ETA, at: stamp()}; const sh = shops(s)[p.shopKey]; if (sh?.workspace) notify(s, sh.workspace, `Part order for a MoveAI pro: ${p.name} × ${p.qty} for job ${r.id}. Pack it for delivery.`, r.id, 'home'); }
      if (p.mode === 'pickup') p.order = {status: 'to_pickup', at: stamp()};
      (r.extras ||= []).push({id: `EX-${p.id}`, kind: 'parts', label: `${p.name} × ${p.qty}${p.shopName ? ` · ${p.shopName}` : ' · market bill'}`, qty: p.qty, amount: partTotal(p), passThrough: true, proof: p.bill || p.photo, note: p.mode, by: r.providerName, status: 'approved', at: stamp(), partId: p.id});
    } else if (decision === 'self') { p.status = 'self'; p.decidedAt = stamp(); }
    else { p.status = 'rejected'; p.decidedAt = stamp(); }
  }
  r.timeline.push({at: stamp(), text: `Customer ${decision === 'approve' ? 'approved' : decision === 'self' ? 'will buy' : 'rejected'} ${list.map(p => p.name).join(', ')}`});
  notify(s, r.provider, `${r.id}: customer ${decision === 'approve' ? 'approved' : decision === 'self' ? 'will buy it themselves:' : 'rejected'} ${list.map(p => p.name).join(', ')}.`, r.id, 'proJob');
  return '';
}
// Order progress: shop packs → courier → delivered; pickup → picked up.
export function orderStep(s, id, partId, step) {
  const r = job(s, id), p = (r?.parts || []).find(x => x.id === partId); if (!p?.order) return 'No order for this part.';
  const ok = {packed: ['placed'], on_the_way: ['packed', 'placed'], delivered: ['on_the_way', 'packed', 'placed'], picked_up: ['to_pickup']}[step];
  if (!ok || !ok.includes(p.order.status)) return 'That step is not possible now.';
  p.order.status = step; p.order[`${step}At`] = stamp();
  if (step === 'on_the_way') notify(s, 'personal', `${r.id}: ${p.name} is on the way from ${p.shopName} (about ${p.order.eta} min).`, r.id, 'serviceDetail');
  if (['delivered', 'picked_up'].includes(step)) { notify(s, r.provider, `${r.id}: ${p.name} ${step === 'delivered' ? 'delivered' : 'collected'} — fit it now.`, r.id, 'proJob'); r.timeline.push({at: stamp(), text: `${p.name} ${step === 'delivered' ? 'delivered by the shop' : 'collected from the shop'}`}); }
  return '';
}
export const partsReady = r => (r.parts || []).filter(p => p.status === 'approved' && p.order && !['delivered', 'picked_up'].includes(p.order.status));
// Pause for a part that is not available today; the return visit is free.
export function waitForPart(s, ws, id, {date, slot, note = ''}) {
  const r = job(s, id); if (!r || r.provider !== ws || r.status !== 'in_progress') return 'Start the job first.';
  if (!date || !slot) return 'Choose the day and time of the return visit.';
  r.waitingPart = {date, slot, note: String(note).trim(), since: stamp()}; r.timeline.push({at: stamp(), text: `Waiting for part · free return visit ${date}`});
  notify(s, 'personal', `${r.id}: waiting for a part. ${r.providerName} comes back on ${date} at no extra charge; only the part is billed.`, r.id, 'serviceDetail');
  return '';
}
export function resume(s, ws, id) { const r = job(s, id); if (!r || r.provider !== ws || !r.waitingPart) return 'The job is not paused.'; r.timeline.push({at: stamp(), text: 'Back for the return visit'}); delete r.waitingPart; return ''; }
// Blocks "Mark done" while parts are undecided, on the way, or the job is paused.
export function doneBlock(r) {
  if (r.waitingPart) return 'The job is waiting for a part. Tap "Back on site" on the return visit first.';
  if (pending(r).length) return 'The customer has not answered your part request yet.';
  if (partsReady(r).length) return 'A part is still on the way. Fit it before marking the job done.';
  return '';
}
// After the customer pays: part money for shop parts goes to the shop (taken back from the pro's wallet).
export function settle(s, r) {
  for (const p of (r.parts || []).filter(x => x.status === 'approved' && x.shopKey && ['delivery', 'pickup'].includes(x.mode) && !x.settled)) {
    const amt = p.price * p.qty;
    record(s, {owner: p.shopParty, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'wallet_credit', payer: 'moveai', payee: p.shopParty, responsible: 'moveai', amount: amt, method: 'wallet', reference: `PART-${p.id}`, status: 'confirmed', note: `Part for ${r.id}: ${p.name} × ${p.qty}`});
    record(s, {owner: r.provider, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'part_settlement', payer: r.provider, payee: p.shopParty, responsible: r.provider, amount: amt, method: 'wallet', reference: `PARTS-${p.id}`, status: 'confirmed', note: `Part paid to ${p.shopName}`});
    p.settled = true;
  }
}
// Customer: "Report price" after paying; admin decides.
export function report(s, id, partId, note) {
  const r = job(s, id), p = (r?.parts || []).find(x => x.id === partId && x.status === 'approved');
  if (!p) return 'Part not found.'; if (!r.paid) return 'You can report a price after paying.';
  if (String(note || '').trim().length < 3) return 'Say what looks wrong.';
  p.report = {note: String(note).trim(), at: stamp(), status: 'open'};
  notify(s, 'admin', `${r.id}: customer reported the price of ${p.name} (${inr(p.price)}, MRP ${inr(p.mrp)}).`, r.id, 'homeServicesAdmin');
  return '';
}
export const overcharge = (s, p) => Math.max(0, (p.price - Math.min(p.mrp || p.price, p.usual || usualPrice(s, p.name) || p.price)) * p.qty);
export function resolve(s, id, partId, decision) {
  const r = job(s, id), p = (r?.parts || []).find(x => x.id === partId); if (!p || !(p.report?.status === 'open' || p.flag === 'higher' && !p.reviewed)) return 'Nothing to review.';
  const amt = decision === 'refund' ? overcharge(s, p) : 0; if (decision === 'refund' && !amt) return 'The price is within MRP and the usual price — nothing to refund. Dismiss instead.';
  p.reviewed = true; if (p.report) p.report.status = decision === 'refund' ? 'refunded' : 'dismissed';
  if (decision === 'refund') {
    record(s, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: r.provider, amount: amt, method: 'upi', reference: `PRF-${p.id}`, status: 'refund_initiated', note: `Part overcharge refund: ${p.name}`});
    record(s, {owner: r.provider, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'penalty', payer: r.provider, payee: 'moveai', responsible: r.provider, amount: amt, method: 'wallet', reference: `PPEN-${p.id}`, status: 'confirmed', note: `Part overcharge: ${p.name}`});
    const pro = (s.homePros || []).find(x => x.id === r.proId); if (pro) { pro.stats ||= {}; pro.stats.strikes = (pro.stats.strikes || 0) + 1; }
    p.refunded = amt; notify(s, 'personal', `${r.id}: we refunded ${inr(amt)} for ${p.name}. Sorry about that.`, r.id, 'serviceDetail');
  }
  return '';
}
export const reviewQueue = s => (s.serviceRequests || []).filter(r => r.type === 'general').flatMap(r => (r.parts || []).filter(p => (p.report?.status === 'open') || (p.flag === 'higher' && !p.reviewed && p.status !== 'rejected')).map(p => ({r, p})));

// ---------- UI pieces ----------
export function customerCard(s, r) {
  const list = pending(r); if (!list.length) return '';
  const one = p => `<div class="part-card" data-part="${p.id}"><b>🔧 ${esc(p.name)}${p.qty > 1 ? ` × ${p.qty}` : ''}</b><span class="price-line"><span>${p.shopName ? `${esc(p.shopName)} (MoveAI shop)` : 'Bought at a local shop · bill attached'} · MRP ${inr(p.mrp)}</span><b>${inr(partTotal(p))}</b></span>
    ${p.pickupFee ? `<small class="muted">Includes a pickup charge of ${inr(p.pickupFee)}</small>` : ''}${p.flag === 'higher' ? `<small class="field-error">Price is higher than usual (MoveAI shops: about ${inr(p.usual)}). You can reject it or buy it yourself.</small>` : ''}
    <small class="muted">📷 ${esc(p.photo)}${p.bill ? ` · bill: ${esc(p.bill)} · MRP photo: ${esc(p.mrpPhoto)}` : ''}${p.mode === 'delivery' ? ` · delivered from the shop in about ${DELIVERY_ETA} min` : p.mode === 'pickup' ? ' · the pro collects it' : p.mode === 'kit' ? ' · the pro has it with him' : ''}</small>
    ${p.productId ? `<button type="button" class="button text compact" data-part-see="${p.id}">See it in the shop →</button>` : ''}</div>`;
  return `<section class="panel attention" data-part-approval><h2>${list.length > 1 ? `${list.length} parts need your OK` : 'Part needs your OK'}</h2>${list.map(one).join('')}
    ${list.length > 1 ? `<p class="price-line total"><span>Total for parts</span><b>${inr(list.reduce((a, p) => a + partTotal(p), 0))}</b></p>` : ''}
    <div class="row-actions"><button class="button primary" data-part-decide="approve" data-id="${r.id}">${list.length > 1 ? 'Approve all' : 'Approve'}</button><button class="button secondary" data-part-decide="self" data-id="${r.id}">I'll buy it myself</button><button class="button text" data-part-decide="reject" data-id="${r.id}">Reject</button></div>
    <small class="muted">Nothing is fitted until you approve. Parts are never charged above MRP.</small></section>`;
}
export function statusList(r, {pro = false, demo = true} = {}) {
  const ps = (r.parts || []).filter(p => p.status !== 'proposed' || pro); if (!ps.length) return '';
  const label = p => p.status === 'proposed' ? 'Waiting for customer' : p.status === 'self' ? 'Customer will buy it' : p.status === 'rejected' ? 'Rejected' : p.order ? ({placed: 'Order placed with the shop', packed: 'Packed at the shop', on_the_way: `On the way · about ${p.order.eta} min`, delivered: 'Delivered', to_pickup: 'Collect from the shop', picked_up: 'Collected'}[p.order.status]) : 'Approved';
  return `<section class="panel"><h2>Parts</h2>${ps.map(p => `<div class="document-row"><span class="document-icon">🔧</span><span class="document-copy"><b>${esc(p.name)}${p.qty > 1 ? ` × ${p.qty}` : ''} · ${inr(partTotal(p))}</b><small>${esc(label(p))}${p.shopName ? ` · ${esc(p.shopName)}` : ' · market bill'}${p.refunded ? ` · refunded ${inr(p.refunded)}` : ''}${p.report ? ` · price report ${esc(p.report.status)}` : ''}</small></span>
    ${pro && p.order?.status === 'to_pickup' ? `<button class="button secondary compact" data-part-step="picked_up" data-id="${r.id}" data-part="${p.id}">Picked up</button>` : ''}
    ${demo && p.order && ['placed', 'packed', 'on_the_way'].includes(p.order.status) ? `<button class="button text compact" data-part-step="${p.order.status === 'placed' ? 'packed' : p.order.status === 'packed' ? 'on_the_way' : 'delivered'}" data-id="${r.id}" data-part="${p.id}">Demo: shop ${p.order.status === 'placed' ? 'packs it' : p.order.status === 'packed' ? 'sends it' : 'delivers'}</button>` : ''}
    ${!pro && r.paid && p.status === 'approved' && !p.report ? `<details><summary class="button text compact">Report price</summary><form class="inline-form" data-part-report="${p.id}" data-id="${r.id}"><input name="note" placeholder="e.g. same part is ₹150 in the market"><button class="button secondary compact">Send</button></form></details>` : ''}</div>`).join('')}</section>`;
}
export function proForm(s, r) {
  const q = r.partQ || '', results = search(s, r, q).slice(0, 8), near = nearbyShops(s, r);
  return `<details class="part-add" ${r.partQ != null ? 'open' : ''}><summary class="button secondary compact">🔧 Add part</summary>
  <form class="part-form" data-part-search="${r.id}"><div class="loc-search"><input name="q" value="${esc(q)}" placeholder="Search part, e.g. capacitor, tap cartridge" aria-label="Search part"><button class="button secondary">Search</button></div></form>
  ${near.length ? `<form class="part-form" data-part-add="${r.id}"><fieldset><legend>Nearby MoveAI shops</legend>${results.length ? results.map((p, i) => `<label class="part-pick"><input type="radio" name="productId" value="${p.id}" ${i === 0 ? 'checked' : ''}><span><b>${esc(p.name)}</b><small>${esc(p.shop.name)} · ${p.km != null ? `${p.km} km` : ''} · MRP ${inr(p.mrp)}</small></span><b>${inr(p.price)}</b></label>`).join('') : '<p class="muted">No match. Try another word.</p>'}</fieldset>
    <div class="form-grid two"><label><span>Quantity</span><input type="number" name="qty" min="1" max="50" value="1"></label><label><span>How you get it</span><select name="mode"><option value="kit">From my kit</option><option value="delivery">Order for delivery</option><option value="pickup">I'll pick it up</option></select></label>
    <label class="wide"><span>Photo of the old part</span><input type="file" name="photo" accept="image/*" capture="environment"></label></div><small class="muted">The price comes from the shop. You cannot charge more.</small><button class="button primary">Send to customer</button></form>` : `<p class="muted">No MoveAI shop within ${SHOP_RADIUS_KM} km yet.</p>`}
  <details class="part-market" ${near.length ? '' : 'open'}><summary>Bought at a local market</summary><form class="form-grid two" data-part-market="${r.id}"><label class="wide"><span>Part name</span><input name="name" placeholder="e.g. Geyser thermostat"></label><label><span>Price paid ₹</span><input type="number" name="price" min="1"></label><label><span>MRP on the box ₹</span><input type="number" name="mrp" min="1"></label><label><span>Quantity</span><input type="number" name="qty" min="1" value="1"></label>
    <label><span>Shop bill</span><input type="file" name="bill" accept="image/*,application/pdf"></label><label><span>Photo of MRP on the box</span><input type="file" name="mrpPhoto" accept="image/*" capture="environment"></label><label class="wide"><span>Photo of the old part</span><input type="file" name="photo" accept="image/*" capture="environment"></label>
    <small class="muted wide">Never above MRP. A pickup charge of ${inr(PICKUP_FEE)} is added and shown to the customer.</small><button class="button secondary">Send to customer</button></form></details></details>`;
}
export function shopPanel(s, ws) {
  const rows = (s.serviceRequests || []).filter(r => r.type === 'general').flatMap(r => (r.parts || []).filter(p => p.order && p.shopKey === ws && ['placed', 'packed'].includes(p.order.status)).map(p => ({r, p})));
  if (!rows.length) return '';
  return `<section class="panel attention"><h2>Part orders from MoveAI pros (${rows.length})</h2>${rows.map(({r, p}) => `<div class="document-row"><span class="document-icon">🔧</span><span class="document-copy"><b>${esc(p.name)} × ${p.qty} · ${inr(p.price * p.qty)}</b><small>Job ${esc(r.id)} · ${esc(r.providerName || '')} · ${esc(LOC.oneLine(r.address))}</small></span><button class="button primary compact" data-part-step="${p.order.status === 'placed' ? 'packed' : 'on_the_way'}" data-id="${r.id}" data-part="${p.id}">${p.order.status === 'placed' ? 'Packed' : 'Hand to courier'}</button></div>`).join('')}</section>`;
}
export function itemScreen(s) {
  const r = job(s, s.partView?.jobId), p = (r?.parts || []).find(x => x.id === s.partView?.partId), sh = p && shops(s)[p.shopKey];
  if (!p || !sh) return '<div class="page-header"><div><h1>Part</h1><p>Part not found.</p></div></div>';
  return `<div class="page-header"><div><h1>${esc(p.name)}</h1><p>${esc(sh.name)} · MoveAI shop</p></div><button class="button secondary" data-route="serviceDetail">Back to the job</button></div>
  <section class="panel"><p class="price-line"><span>Shop price</span><b>${inr(p.price)}</b></p><p class="price-line"><span>MRP</span><b>${inr(p.mrp)}</b></p><p class="muted">${esc(sh.address || sh.city || '')}</p>
  <p>You can let ${esc(r.providerName)} bring it at this price, or buy it yourself from this shop and pay only for labour.</p><div class="row-actions"><button class="button primary" data-part-decide="approve" data-id="${r.id}">Approve at ${inr(partTotal(p))}</button><button class="button secondary" data-part-decide="self" data-id="${r.id}">I'll buy it myself</button></div></section>`;
}
const fileName = (form, n) => form.querySelector(`[name="${n}"]`)?.files?.[0]?.name || '';
export function bind(root, api) {
  const S = () => api.getState(), ws = () => S().currentWorkspace;
  const err = m => { const e = root.querySelector('#hs-pro-error'); if (e) { e.textContent = m; e.hidden = !m; e.scrollIntoView?.({block: 'center'}); } else api.toast(m); };
  const done = (e, ok) => { if (e) return err(e); api.save(); api.render(); if (ok) api.toast(ok); };
  root.querySelectorAll('[data-part-search]').forEach(f => f.onsubmit = e => { e.preventDefault(); const r = job(S(), f.dataset.partSearch); r.partQ = new FormData(f).get('q') || ''; done('', ''); });
  root.querySelectorAll('[data-part-add]').forEach(f => f.onsubmit = e => { e.preventDefault(); const d = new FormData(f); done(addPart(S(), ws(), f.dataset.partAdd, {productId: d.get('productId'), qty: d.get('qty'), mode: d.get('mode'), photo: fileName(f, 'photo')}), 'Sent to the customer for approval'); });
  root.querySelectorAll('[data-part-market]').forEach(f => f.onsubmit = e => { e.preventDefault(); const d = new FormData(f); done(addPart(S(), ws(), f.dataset.partMarket, {mode: 'market', name: d.get('name'), price: d.get('price'), mrp: d.get('mrp'), qty: d.get('qty'), bill: fileName(f, 'bill'), mrpPhoto: fileName(f, 'mrpPhoto'), photo: fileName(f, 'photo')}), 'Sent to the customer for approval'); });
  root.querySelectorAll('[data-part-decide]').forEach(b => b.onclick = () => { const k = b.dataset.partDecide; const e = decide(S(), b.dataset.id, k); if (e) return api.toast(e); api.save(); if (S().currentRoute === 'partItem') return api.navigate('serviceDetail'); api.render(); api.toast(k === 'approve' ? 'Approved' : k === 'self' ? 'OK — buy it yourself; you pay only for labour' : 'Rejected'); });
  root.querySelectorAll('[data-part-see]').forEach(b => b.onclick = () => { const s = S(), r = (s.serviceRequests || []).find(x => (x.parts || []).some(p => p.id === b.dataset.partSee)); s.partView = {jobId: r.id, partId: b.dataset.partSee}; api.save(); api.navigate('partItem'); });
  root.querySelectorAll('[data-part-step]').forEach(b => b.onclick = () => done(orderStep(S(), b.dataset.id, b.dataset.part, b.dataset.partStep), {packed: 'Marked packed', on_the_way: 'Handed to the courier', delivered: 'Delivered', picked_up: 'Collected'}[b.dataset.partStep]));
  root.querySelectorAll('[data-part-report]').forEach(f => f.onsubmit = e => { e.preventDefault(); const er = report(S(), f.dataset.id, f.dataset.partReport, new FormData(f).get('note')); if (er) return api.toast(er); api.save(); api.render(); api.toast('Sent to MoveAI. We check the bill and MRP.'); });
  root.querySelectorAll('[data-part-resolve]').forEach(b => b.onclick = () => { const [id, pid, dec] = b.dataset.partResolve.split('|'); const er = resolve(S(), id, pid, dec); if (er) return api.toast(er); api.save(); api.render(); api.toast(dec === 'refund' ? 'Refund started and strike added' : 'Dismissed'); });
}
