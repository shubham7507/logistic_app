// MoveAI One — how a seller's orders reach customers (onboarding step 5 and Store setup → Delivery).
// Pure rules + markup. Modelled on Amazon (Easy Ship / Self Ship), Grab (delivery / self pick-up) and
// Lazada (pick-up or drop-off first mile, Delivered by Seller): the seller sees who packs, who delivers,
// what it costs and whether COD works before choosing, and can combine modes.
// Rates and coverage are prototype values; in production they come from the pricing and dispatch services.

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));

export const MODES = {
  moveai: {label: 'MoveAI couriers', short: 'MoveAI couriers'},
  own: {label: 'Your own delivery staff', short: 'Own delivery'},
  pickup: {label: 'Customer picks up at your store', short: 'Store pickup'},
};
// Courier coverage by pincode prefix (prototype). Speed is what the customer is promised.
export const COURIER_PINCODES = [
  {prefix: '110', city: 'Delhi', speed: 'Same day', hub: 'MoveAI hub, Okhla Phase 2'},
  {prefix: '2013', city: 'Noida', speed: 'Same day', hub: 'MoveAI hub, Sector 63 Noida'},
  {prefix: '2010', city: 'Ghaziabad', speed: 'Same day', hub: 'MoveAI hub, Raj Nagar Extension'},
  {prefix: '1220', city: 'Gurugram', speed: 'Same day', hub: 'MoveAI hub, Udyog Vihar'},
  {prefix: '3020', city: 'Jaipur', speed: 'Next day', hub: 'MoveAI hub, Malviya Nagar Industrial Area'},
  {prefix: '8000', city: 'Patna', speed: 'Next day', hub: 'MoveAI hub, Patliputra Industrial Area'},
];
export const PICKUP_WINDOWS = {'09-12': '9 am – 12 pm', '12-15': '12 – 3 pm', '15-18': '3 – 6 pm', '18-21': '6 – 9 pm'};
// Prototype rate card for MoveAI couriers (charged to the seller per delivered order).
export const RATE = {base: 30, baseKm: 3, perKm: 6, baseKg: 1, perKg: 10, codPct: 1.5, codMin: 15};

export function coverage(pincode) {
  const p = String(pincode || '').trim();
  if (!/^\d{6}$/.test(p)) return null;
  return COURIER_PINCODES.find(c => p.startsWith(c.prefix)) || false;
}
export function courierFee({km = 3, kg = 1, cod = false, amount = 0} = {}) {
  const dist = Math.max(0, Math.ceil(km - RATE.baseKm)) * RATE.perKm, weight = Math.max(0, Math.ceil(kg - RATE.baseKg)) * RATE.perKg;
  const codFee = cod ? Math.max(RATE.codMin, Math.round(amount * RATE.codPct / 100)) : 0;
  return {ship: RATE.base + dist + weight, cod: codFee, total: RATE.base + dist + weight + codFee};
}

// Fresh produce must arrive the same day; electricals travel with the courier's open-box check.
export function categoryAdvice(categories = []) {
  const tips = [];
  if (categories.includes('fresh')) tips.push({key: 'fresh', text: 'Fresh food: same-day only. Own delivery or store pickup works best; MoveAI couriers take fresh orders only where same-day delivery is available.'});
  if (categories.includes('electrical')) tips.push({key: 'electrical', text: 'Electricals: MoveAI couriers recommended. Pack in a sturdy box; the open-box check lets the customer see the item works before accepting.'});
  if (categories.includes('fashion')) tips.push({key: 'fashion', text: 'Fashion: couriers suit most orders. Returns are collected by the courier.'});
  return tips;
}

// Older applications stored one mode as a string; read both shapes.
export function plan(raw) {
  if (!raw) return {modes: {}, moveai: {}, own: {}, pickup: {}};
  if (typeof raw === 'string') return {modes: {[raw]: true}, moveai: {}, own: {}, pickup: {}, legacy: true};
  return {modes: {...raw.modes}, moveai: {...raw.moveai}, own: {...raw.own}, pickup: {...raw.pickup}, pincode: raw.pincode, ownUpToKm: raw.ownUpToKm};
}
export const chosen = raw => Object.keys(MODES).filter(k => plan(raw).modes[k]);
export const delivers = raw => { const c = chosen(raw); return c.includes('moveai') || c.includes('own'); };
// Stores from before this change (no plan, or one mode as a string) keep allowing pickup as they did.
export const allowsPickup = raw => !raw || typeof raw === 'string' ? true : chosen(raw).includes('pickup');
// One word for older code paths that only knew a single mode.
export function primaryMode(raw) { const c = chosen(raw); return c.includes('moveai') ? 'moveai' : c.includes('own') ? 'own' : c[0] || ''; }
export function codAllowed(raw) {
  const p = plan(raw); if (p.legacy || !raw) return true;
  return (p.modes.moveai && p.moveai.cod) || (p.modes.own && p.own.cod) || false;
}

const int = v => (v === '' || v === undefined || v === null) ? NaN : Number(v);
// v: form values. store: {pincode, radiusKm, city}. Returns {error} or {plan}.
export function validate(v, store = {}, categories = []) {
  const modes = {moveai: !!v.moveai, own: !!v.own, pickup: !!v.pickup};
  if (!modes.moveai && !modes.own && !modes.pickup) return {error: 'Choose at least one way for orders to reach customers.'};
  const out = {modes, moveai: {}, own: {}, pickup: {}, pincode: store.pincode || ''};
  const area = Number(store.radiusKm || 5);
  if (modes.moveai) {
    const cov = coverage(store.pincode);
    if (cov === null) return {error: 'Add your store pincode in step “Store and first branch” to check courier coverage.'};
    if (!cov) return {error: `MoveAI couriers do not cover pincode ${store.pincode} yet. Choose own delivery or store pickup.`};
    if (categories.length && categories.every(c => c === 'fresh') && cov.speed !== 'Same day') return {error: `Fresh produce needs same-day delivery, which ${cov.city} does not have yet. Choose own delivery or store pickup.`};
    const handover = v.handover === 'dropoff' ? 'dropoff' : v.handover === 'pickup' ? 'pickup' : '';
    if (!handover) return {error: 'Choose whether a rider collects from your store or you drop parcels at the MoveAI hub.'};
    const windows = [].concat(v.windows || []).filter(w => PICKUP_WINDOWS[w]);
    if (handover === 'pickup' && !windows.length) return {error: 'Choose at least one pickup window for MoveAI riders.'};
    const maxKg = int(v.maxKg); if (!Number.isFinite(maxKg) || maxKg < 1 || maxKg > 30) return {error: 'Largest parcel must be 1 to 30 kg.'};
    const cod = !!v.courierCod, codLimit = cod ? int(v.codLimit) : 0;
    if (cod && (!Number.isInteger(codLimit) || codLimit < 500 || codLimit > 50000)) return {error: 'COD limit must be ₹500 to ₹50,000.'};
    if (!v.packaging) return {error: 'Confirm the packaging rules for courier orders.'};
    out.moveai = {handover, windows: handover === 'pickup' ? windows : [], hub: cov.hub, speed: cov.speed, city: cov.city, maxKg, cod, codLimit, packaging: true, openBox: categories.includes('electrical') && !!v.openBox};
  }
  if (modes.own) {
    const radius = int(v.ownRadius), fee = int(v.ownFee), freeAbove = int(v.freeAbove || 0), minOrder = int(v.minOrder || 0), eta = int(v.eta);
    if (!Number.isFinite(radius) || radius < 1 || radius > area) return {error: `Own delivery distance must be 1 to ${area} km (your delivery area).`};
    if (!Number.isInteger(fee) || fee < 0 || fee > 200) return {error: 'Delivery fee for customers must be ₹0 to ₹200.'};
    if (!Number.isInteger(freeAbove) || freeAbove < 0 || !Number.isInteger(minOrder) || minOrder < 0) return {error: 'Free-delivery amount and minimum order must be whole rupees.'};
    if (!Number.isInteger(eta) || eta < 15 || eta > 240) return {error: 'Promised delivery time must be 15 to 240 minutes.'};
    if (modes.moveai && radius >= area) return {error: `With both modes on, your staff deliver up to ${radius} km and MoveAI couriers beyond that. Set own delivery below ${area} km, or turn off MoveAI couriers.`};
    out.own = {radiusKm: radius, fee, freeAbove, minOrder, etaMins: eta, cod: !!v.ownCod};
    if (modes.moveai) out.ownUpToKm = radius;
  }
  if (modes.pickup) {
    const prep = int(v.prepMins); if (!Number.isInteger(prep) || prep < 5 || prep > 120) return {error: 'Order preparation time for pickup must be 5 to 120 minutes.'};
    out.pickup = {prepMins: prep, instructions: String(v.instructions || '').trim().slice(0, 200)};
  }
  return {plan: out};
}

export function summary(raw) {
  const p = plan(raw), parts = [];
  if (p.legacy) return MODES[chosen(raw)[0]]?.label || '—';
  if (p.modes.own) parts.push(`Own delivery up to ${p.own.radiusKm} km${p.own.fee ? ` (₹${p.own.fee} fee${p.own.freeAbove ? `, free above ₹${p.own.freeAbove}` : ''})` : ' (free)'} in ~${p.own.etaMins} min`);
  if (p.modes.moveai) parts.push(`MoveAI couriers${p.modes.own ? ` beyond ${p.ownUpToKm} km` : ''} · ${p.moveai.speed || ''} · ${p.moveai.handover === 'dropoff' ? `drop-off at ${p.moveai.hub}` : `rider pickup ${p.moveai.windows.map(w => PICKUP_WINDOWS[w]).join(', ')}`}${p.moveai.cod ? ` · COD up to ₹${p.moveai.codLimit}` : ' · prepaid only'}`);
  if (p.modes.pickup) parts.push(`Store pickup (ready in ${p.pickup.prepMins} min)`);
  return parts.join(' · ') || '—';
}

// ---------- markup ----------
const card = (k, on, rows, extra = '') => `<label class="service-choice delivery-mode ${on ? 'selected' : ''}"><input type="checkbox" name="${k}" ${on ? 'checked' : ''}><span><b>${esc(MODES[k].label)}</b><dl class="delivery-facts">${rows.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>${extra}</span></label>`;
const num = (name, label, value, attrs = '') => `<label><span>${esc(label)}</span><input type="number" name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;

// ctx: {store:{pincode,radiusKm,city}, categories:[]}
export function formHtml(raw, ctx = {}) {
  const p = plan(raw), store = ctx.store || {}, cov = coverage(store.pincode), example = courierFee({km: 4, kg: 1}), exCod = courierFee({km: 4, kg: 1, cod: true, amount: 600});
  const covLine = cov === null ? '<div class="info-banner warning"><b>No pincode yet</b><span>Add your store pincode in “Store and first branch” to check MoveAI courier coverage.</span></div>'
    : cov ? `<div class="info-banner"><b>MoveAI couriers cover ${esc(store.pincode)} (${esc(cov.city)})</b><span>${esc(cov.speed)} delivery · nearest drop-off: ${esc(cov.hub)}</span></div>`
    : `<div class="info-banner warning"><b>MoveAI couriers don't cover ${esc(store.pincode)} yet</b><span>Choose own delivery or store pickup. We'll tell you when couriers reach your area.</span></div>`;
  const tips = categoryAdvice(ctx.categories || []);
  const m = p.moveai, o = p.own, k = p.pickup, area = Number(store.radiusKm || 5);
  return `<p class="muted">Choose one or more. You can change this later in Store setup → Delivery. Nothing is chosen for you.</p>${covLine}
  ${tips.map(t => `<p class="mock-hint delivery-tip" data-tip="${t.key}"><b>Tip</b><span>${esc(t.text)}</span></p>`).join('')}
  <div class="service-grid delivery-modes">
   ${card('moveai', p.modes.moveai, [['You pack', 'Yes, to MoveAI packaging rules'], ['Who delivers', 'A MoveAI rider collects from you, or you drop at the hub'], ['Cost to you', `₹${example.total} for a 1 kg order 4 km away`], ['COD', `MoveAI collects cash and settles to you (fee ${RATE.codPct}%, min ₹${RATE.codMin})`]])}
   ${card('own', p.modes.own, [['You pack', 'Yes'], ['Who delivers', 'Your staff; customer gives a delivery code'], ['Cost to you', '₹0 to MoveAI. You set the customer fee'], ['COD', 'Your staff collect; it shows in your ledger']])}
   ${card('pickup', p.modes.pickup, [['You pack', 'Yes'], ['Who delivers', 'Customer collects with a pickup code'], ['Cost to you', '₹0'], ['COD', 'Customer pays online or at the counter']])}
  </div>
  <fieldset class="delivery-detail" data-for="moveai" ${p.modes.moveai ? '' : 'hidden'}><legend>MoveAI couriers</legend>
   <div class="radio-row"><label class="consent-row"><input type="radio" name="handover" value="pickup" ${m.handover === 'pickup' ? 'checked' : ''}><span><b>Rider picks up from my store</b></span></label><label class="consent-row"><input type="radio" name="handover" value="dropoff" ${m.handover === 'dropoff' ? 'checked' : ''}><span><b>I drop parcels at the MoveAI hub</b>${cov ? `<small>${esc(cov.hub)}</small>` : ''}</span></label></div>
   <p class="field-label">Pickup windows (choose all that suit you)</p><div class="chip-row">${Object.entries(PICKUP_WINDOWS).map(([w, l]) => `<label class="chip-check"><input type="checkbox" name="windows" value="${w}" ${(m.windows || []).includes(w) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
   <div class="form-grid two">${num('maxKg', 'Largest parcel (kg)', m.maxKg ?? 10, 'min="1" max="30"')}${num('codLimit', 'COD limit per order (₹)', m.codLimit || 2000, 'min="500" max="50000" step="100"')}</div>
   <label class="consent-row"><input type="checkbox" name="courierCod" ${m.cod ? 'checked' : ''}><span>Offer cash on delivery on courier orders (example: a ₹600 COD order costs ₹${exCod.total} = ₹${exCod.ship} delivery + ₹${exCod.cod} COD fee)</span></label>
   ${(ctx.categories || []).includes('electrical') ? `<label class="consent-row"><input type="checkbox" name="openBox" ${m.openBox !== false ? 'checked' : ''}><span>Open-box check for electricals: the rider lets the customer see the item before accepting</span></label>` : ''}
   <label class="consent-row"><input type="checkbox" name="packaging" ${m.packaging ? 'checked' : ''}><span>I will seal every order, label it with the MoveAI order slip and use a sturdy box for fragile items. Late handovers may be reassigned.</span></label>
   <p class="muted">Prototype rates: ₹${RATE.base} up to ${RATE.baseKm} km and ${RATE.baseKg} kg, then ₹${RATE.perKm}/km and ₹${RATE.perKg}/kg. Final rates come from MoveAI settings.</p>
  </fieldset>
  <fieldset class="delivery-detail" data-for="own" ${p.modes.own ? '' : 'hidden'}><legend>Own delivery</legend>
   <div class="form-grid two">${num('ownRadius', `Deliver up to (km, max ${area})`, o.radiusKm ?? Math.min(3, area), `min="1" max="${area}"`)}${num('ownFee', 'Delivery fee for customers (₹)', o.fee ?? 20, 'min="0" max="200"')}${num('freeAbove', 'Free delivery above (₹, 0 = never)', o.freeAbove ?? 299, 'min="0"')}${num('minOrder', 'Minimum order (₹)', o.minOrder ?? 0, 'min="0"')}${num('eta', 'Promised delivery time (minutes)', o.etaMins ?? 45, 'min="15" max="240"')}</div>
   <label class="consent-row"><input type="checkbox" name="ownCod" ${o.cod ? 'checked' : ''}><span>My staff collect cash on delivery</span></label>
   <p class="muted">With MoveAI couriers also on, your staff take orders up to this distance and couriers take the rest. Add delivery staff later in Team.</p>
  </fieldset>
  <fieldset class="delivery-detail" data-for="pickup" ${p.modes.pickup ? '' : 'hidden'}><legend>Store pickup</legend>
   <div class="form-grid two">${num('prepMins', 'Order ready in (minutes)', k.prepMins ?? 20, 'min="5" max="120"')}<label><span>Instructions for customers</span><input name="instructions" value="${esc(k.instructions || '')}" placeholder="e.g. Counter 2, parking at the back" maxlength="200"></label></div>
   <p class="muted">Pickup uses your store hours. Customers show a pickup code at the counter.</p>
  </fieldset>`;
}
// Read the form (FormData) into validate() input.
export function readForm(fd) {
  const v = Object.fromEntries(fd);
  for (const k of ['moveai', 'own', 'pickup', 'courierCod', 'ownCod', 'packaging', 'openBox']) v[k] = fd.has(k);
  v.windows = fd.getAll('windows');
  return v;
}
// Show the detail block for each ticked mode without a re-render.
export function bindForm(form) {
  if (!form) return;
  const sync = () => form.querySelectorAll('.delivery-detail').forEach(f => { const box = form.querySelector(`input[name="${f.dataset.for}"]`); f.hidden = !box?.checked; box?.closest('.service-choice')?.classList.toggle('selected', !!box?.checked); });
  form.querySelectorAll('.delivery-modes input[type=checkbox]').forEach(i => i.addEventListener('change', sync)); sync();
}

// ---------- after go-live: Store setup → Delivery ----------
// A change is a request that MoveAI approves (dispatch, COD float and courier capacity depend on it).
const now = () => new Date().toLocaleString('en-IN');
export function areaOf(partner, branches = []) {
  const p = partner?.deliveryPlan || {};
  return {pincode: partner?.deliveryArea?.pincode || p.pincode || '', radiusKm: partner?.deliveryArea?.radiusKm || 5, city: branches[0]?.serviceArea || ''};
}
export function requestChange(state, key, v) {
  const partner = state.shopPartners?.[key];
  if (!partner || partner.status !== 'approved') return 'Store owner access required.';
  if (partner.deliveryChange?.status === 'pending') return 'A delivery change is already waiting for MoveAI review.';
  const area = {pincode: String(v.pincode || '').trim(), radiusKm: Number(v.radiusKm || 5)};
  if (!/^[1-9]\d{5}$/.test(area.pincode)) return 'Enter the 6-digit pincode of the store.';
  if (!(area.radiusKm >= 1 && area.radiusKm <= 20)) return 'Delivery area must be 1 to 20 km.';
  const app = (state.sellerApplications || []).find(a => a.id === partner.createdFrom);
  const r = validate(v, area, app?.categories || partner.approvedGroups || []);
  if (r.error) return r.error;
  partner.deliveryChange = {plan: r.plan, area, status: 'pending', requestedAt: now()};
  (state.notifications ||= []).unshift({id: `NT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, to: 'admin', route: 'sellerReview', text: `${partner.name} asked to change delivery: ${summary(r.plan)}`, read: false});
  return '';
}
export function decideChange(state, key, decision, note = '') {
  const partner = state.shopPartners?.[key], ch = partner?.deliveryChange;
  if (!ch || ch.status !== 'pending') return 'No delivery change waiting.';
  if (decision === 'rejected' && !String(note).trim()) return 'Give a reason so the seller knows what to fix.';
  if (decision === 'approved') {
    partner.deliveryPlan = ch.plan; partner.deliveryArea = ch.area;
    partner.deliveryMode = delivers(ch.plan) ? primaryMode(ch.plan) : 'pickup';
  }
  partner.deliveryChange = {...ch, status: decision, decidedAt: now(), note: String(note).trim()};
  (state.notifications ||= []).unshift({id: `NT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, to: key, route: 'plusStore', text: decision === 'approved' ? `Delivery change approved: ${summary(ch.plan)}` : `Delivery change not approved: ${note}`, read: false});
  return '';
}
export function storePanelHtml(state, key, branches = []) {
  const partner = state.shopPartners?.[key]; if (!partner) return '';
  const area = areaOf(partner, branches), ch = partner.deliveryChange, app = (state.sellerApplications || []).find(a => a.id === partner.createdFrom);
  const current = partner.deliveryPlan ? summary(partner.deliveryPlan) : `${MODES[partner.deliveryMode || 'moveai']?.label || 'MoveAI couriers'} (set up before delivery settings existed)`;
  const status = ch?.status === 'pending' ? `<div class="info-banner"><b>Change waiting for MoveAI review</b><span>${esc(summary(ch.plan))} · asked ${esc(ch.requestedAt)}</span></div>`
    : ch?.status === 'rejected' ? `<div class="info-banner warning"><b>Last change not approved</b><span>${esc(ch.note)}</span></div>` : '';
  return `<section class="panel store-delivery" id="store-delivery"><h2>Delivery</h2><p><b>Now:</b> ${esc(current)}</p>${status}
   <details ${ch?.status === 'pending' ? '' : ''}><summary>Change delivery settings</summary>
   <form class="form-panel" data-store-delivery="${esc(key)}" novalidate><div class="form-grid two"><label><span>Store pincode</span><input name="pincode" inputmode="numeric" maxlength="6" value="${esc(area.pincode)}"></label><label><span>Delivery area (km)</span><input type="number" name="radiusKm" min="1" max="20" value="${esc(area.radiusKm)}"></label></div>
   ${formHtml(ch?.status === 'pending' ? ch.plan : partner.deliveryPlan, {store: area, categories: app?.categories || partner.approvedGroups || []})}
   <p class="field-error store-delivery-error" hidden></p><button class="button primary" ${ch?.status === 'pending' ? 'disabled' : ''}>Send change for review</button></form></details></section>`;
}
export function reviewHtml(state) {
  const list = Object.entries(state.shopPartners || {}).filter(([, p]) => p.deliveryChange?.status === 'pending');
  if (!list.length) return '';
  return `<section class="panel"><h2>Delivery change requests</h2>${list.map(([k, p]) => `<div class="claim-row"><b>${esc(p.name)}</b><small class="block muted">Now: ${esc(p.deliveryPlan ? summary(p.deliveryPlan) : MODES[p.deliveryMode || 'moveai']?.label)}</small><small class="block">Asked: ${esc(summary(p.deliveryChange.plan))} · pincode ${esc(p.deliveryChange.area.pincode)}, ${esc(p.deliveryChange.area.radiusKm)} km</small><form class="inline-form" data-delivery-decide="${esc(k)}"><input name="note" placeholder="Reason (needed to decline)"><button class="button primary compact" name="decision" value="approved">Approve</button><button class="button secondary compact" name="decision" value="rejected">Decline</button></form></div>`).join('')}</section>`;
}
// api: {getState, save, render, toast}
export function bindStore(root, api) {
  root.querySelectorAll('form[data-store-delivery]').forEach(f => {
    bindForm(f);
    f.onsubmit = e => { e.preventDefault(); const fd = new FormData(f), error = requestChange(api.getState(), f.dataset.storeDelivery, readForm(fd)); const el = f.querySelector('.store-delivery-error'); if (error) { el.textContent = error; el.hidden = false; return; } api.save(); api.render(); api.toast('Sent to MoveAI for review'); };
  });
  root.querySelectorAll('form[data-delivery-decide]').forEach(f => f.onsubmit = e => { e.preventDefault(); const d = e.submitter?.value || 'approved', error = decideChange(api.getState(), f.dataset.deliveryDecide, d, new FormData(f).get('note')); if (error) return api.toast(error); api.save(); api.render(); api.toast(d === 'approved' ? 'Delivery change approved' : 'Delivery change declined'); });
}
