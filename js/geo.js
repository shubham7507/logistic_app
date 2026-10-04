// MoveAI One — GPS for shop deliveries (prototype phase 1, no backend).
// Checkout map pin + store delivery radius, courier location only during a job (browser GPS with permission,
// or a demo drive), automatic "arrived at store / arriving / arrived at door", live ETA, customer tracking map,
// Navigate link, location on delivery proof, location check on failed delivery, distance from real coordinates.
// Maps are drawn as simple SVG (no tile provider yet); "Open in Google Maps" links use real coordinates.
import {esc, inr} from './ops.js';

export const AREAS = {'Rajendra Place, Delhi': [28.6420, 77.1780], 'Karol Bagh, Delhi': [28.6519, 77.1909], 'Connaught Place, Delhi': [28.6315, 77.2167], 'Lajpat Nagar, Delhi': [28.5677, 77.2433], 'Dwarka Sector 10, Delhi': [28.5810, 77.0590], 'Sector 62, Noida': [28.6270, 77.3727]};
const STORE_COORDS = {'ABC Grocery': [28.6512, 77.1903], 'Fresh Mart': [28.5683, 77.2420], 'Sharma Electricals': [28.6505, 77.1880], 'City Fashion': [28.6328, 77.2195]};
const SPEED_KMH = 20, ARRIVE_KM = 0.1, ARRIVING_KM = 0.5, ISSUE_MAX_KM = 0.2, PICKUP_MAX_KM = 0.3;
const stamp = () => new Date().toLocaleString('en-IN', {hour: 'numeric', minute: '2-digit', second: '2-digit'});
export const km = (a, b) => { if (!a || !b) return 0; const R = 6371, r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
export const roadKm = (a, b) => km(a, b) * 1.3;
export function ensureGeo(s) {
  for (const p of Object.values(s.shopPartners || {})) { p.coords ||= STORE_COORDS[p.name] || [28.6315, 77.2167]; p.radiusKm ??= 12; }
  Object.values(s.deliveryPartners || {}).forEach((d, i) => { d.coords ||= [[28.6470, 77.1850], [28.5750, 77.2380], [28.6300, 77.2200]][i % 3]; });
  s.customerPin ||= {label: 'Rajendra Place, Delhi', lat: AREAS['Rajendra Place, Delhi'][0], lng: AREAS['Rajendra Place, Delhi'][1]};
  return s;
}
const storeOf = (s, name) => Object.values(s.shopPartners || {}).find(p => p.name === name);
export function pinFrom(s, v = {}) {
  ensureGeo(s);
  if (Number(v.geoLat) && Number(v.geoLng)) return {label: v.geoLabel || 'My current location', lat: Number(v.geoLat), lng: Number(v.geoLng)};
  if (v.geoArea && AREAS[v.geoArea]) return {label: v.geoArea, lat: AREAS[v.geoArea][0], lng: AREAS[v.geoArea][1]};
  return s.customerPin;
}
export function serviceable(s, storeName, pin) { const p = storeOf(s, storeName), d = km(p?.coords, [pin.lat, pin.lng]); return {ok: !p || d <= p.radiusKm, km: d, radius: p?.radiusKm || 12}; }
export function checkServiceable(s, stores, pin) {
  for (const n of stores) { const r = serviceable(s, n, pin); if (!r.ok) return `${n} delivers up to ${r.radius} km; your pin is ${r.km.toFixed(1)} km away. Choose another location or remove its items.`; }
  return '';
}
export function applyOrder(s, o, pin) {
  ensureGeo(s); if (!pin) return;
  const st = storeOf(s, o.fulfilmentPartner); o.origin = st?.coords; o.dest = [pin.lat, pin.lng]; o.destLabel = pin.label;
  if (o.origin) { o.deliveryKm = Math.round(roadKm(o.origin, o.dest) * 10) / 10; if (o.etaMinutes != null) o.etaMinutes = Math.round(8 + (st?.busy ? 15 : 0) + o.deliveryKm / SPEED_KMH * 60); }
  o.geo = {phase: 'waiting', live: false};
}

// ---------- courier position ----------
const courierOf = (s, o) => Object.values(s.deliveryPartners || {}).find(d => d.id === o.deliveryAssignment?.partnerId);
export const current = (s, o) => { const t = o.track || []; return t.length ? [t.at(-1).lat, t.at(-1).lng] : courierOf(s, o)?.coords || o.origin; };
const toStorePhase = o => ['offered', 'accepted'].includes(o.deliveryAssignment?.status) && o.status !== 'out_for_delivery';
export function recordPosition(s, o, lat, lng, src = 'gps') {
  if (!o.deliveryAssignment || ['delivered', 'cancelled', 'returned'].includes(o.status)) return 'Tracking is only on during an active delivery.';
  (o.track ||= []).push({lat, lng, at: Date.now(), src}); if (o.track.length > 300) o.track.shift();
  o.geo ||= {}; o.geo.live = true; o.geo.lastAt = Date.now();
  const here = [lat, lng], c = courierOf(s, o); if (c) c.coords = here;
  if (toStorePhase(o)) { o.geo.phase = 'to_store'; if (o.origin && km(here, o.origin) <= ARRIVE_KM && !o.geo.arrivedStoreAt) { o.geo.arrivedStoreAt = Date.now(); o.geo.phase = 'at_store'; note(s, o, 'Courier arrived at the store', 'store'); } }
  else if (o.status === 'out_for_delivery') {
    const d = km(here, o.dest); o.geo.phase = d <= ARRIVE_KM ? 'at_door' : d <= ARRIVING_KM ? 'arriving' : 'to_customer';
    if (d <= ARRIVING_KM && !o.geo.arrivingAt) { o.geo.arrivingAt = Date.now(); note(s, o, 'Your order is arriving', 'personal'); }
    if (d <= ARRIVE_KM && !o.geo.arrivedDoorAt) { o.geo.arrivedDoorAt = Date.now(); note(s, o, 'Courier has arrived at your location', 'personal'); }
  }
  return '';
}
function note(s, o, text, to) {
  (o.history ||= []).push({at: stamp(), actor: 'GPS', text});
  const store = Object.keys(s.shopPartners || {}).find(k => s.shopPartners[k].name === o.fulfilmentPartner);
  (s.notifications ||= []).unshift({id: `NT-${Date.now()}${Math.random().toString(36).slice(2, 4)}`, to: to === 'store' ? store : to, text: `${o.id}: ${text}`, ref: o.id, at: new Date().toLocaleString('en-IN'), read: false});
}
export function demoStep(s, o, stepKm = 0.4) {
  const here = current(s, o), target = toStorePhase(o) ? o.origin : o.dest; if (!here || !target) return 'No route.';
  const d = km(here, target); if (d < 0.02) return 'Already there.';
  const f = Math.min(1, stepKm / d), lat = here[0] + (target[0] - here[0]) * f, lng = here[1] + (target[1] - here[1]) * f;
  return recordPosition(s, o, lat, lng, 'demo');
}
export const etaMin = (s, o) => { const here = current(s, o), target = toStorePhase(o) ? o.origin : o.dest; return here && target ? Math.max(1, Math.round(roadKm(here, target) / SPEED_KMH * 60)) : null; };
export const travelledKm = o => (o.track || []).reduce((a, p, i, t) => a + (i ? km([t[i - 1].lat, t[i - 1].lng], [p.lat, p.lng]) : 0), 0);
// called from commerce.js
export function pickupCheck(s, o) { const t = o.track || []; if (!t.length || !o.origin) return ''; const d = km(current(s, o), o.origin); return d > PICKUP_MAX_KM ? `Your live location is ${d.toFixed(1)} km from the store. Go to the store to collect the order.` : ''; }
export function issueCheck(s, o) { const t = o.track || []; if (!t.length || !o.dest) return ''; const d = km(current(s, o), o.dest); return d > ISSUE_MAX_KM ? `Your live location is ${d.toFixed(1)} km from the customer's pin. Reach the address before reporting a failed delivery.` : ''; }
export function onDelivered(s, o) { o.deliveredLocation = current(s, o); if (o.geo) { o.geo.live = false; o.geo.phase = 'delivered'; } o.actualKm = Math.round(travelledKm(o) * 10) / 10; }
export function stopTracking(o) { if (o.geo) o.geo.live = false; }

// ---------- maps ----------
export function mapSvg(points, opts = {}) {
  const pts = points.filter(p => p && p.at); if (!pts.length) return '';
  const lats = pts.map(p => p.at[0]), lngs = pts.map(p => p.at[1]), pad = 0.006;
  const minLa = Math.min(...lats) - pad, maxLa = Math.max(...lats) + pad, minLo = Math.min(...lngs) - pad, maxLo = Math.max(...lngs) + pad, W = 360, H = 220;
  const X = lo => ((lo - minLo) / (maxLo - minLo || 1)) * W, Y = la => H - ((la - minLa) / (maxLa - minLa || 1)) * H;
  const line = (opts.path || []).map(p => `${X(p[1]).toFixed(1)},${Y(p[0]).toFixed(1)}`).join(' ');
  const plan = opts.plan ? `<line x1="${X(opts.plan[0][1])}" y1="${Y(opts.plan[0][0])}" x2="${X(opts.plan[1][1])}" y2="${Y(opts.plan[1][0])}" stroke="#9aa8a3" stroke-dasharray="5 5" stroke-width="2"/>` : '';
  return `<svg class="geo-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Map')}"><rect width="${W}" height="${H}" rx="12" fill="#eef4f1"/>${Array.from({length: 7}, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="${H}" stroke="#dde7e3"/>`).join('')}${Array.from({length: 4}, (_, i) => `<line x1="0" y1="${i * 60}" x2="${W}" y2="${i * 60}" stroke="#dde7e3"/>`).join('')}${plan}${line ? `<polyline points="${line}" fill="none" stroke="#0b6655" stroke-width="3"/>` : ''}${pts.map(p => `<g><circle cx="${X(p.at[1])}" cy="${Y(p.at[0])}" r="${p.r || 13}" fill="${p.fill || '#fff'}" stroke="${p.stroke || '#0b6655'}" stroke-width="2"/><text x="${X(p.at[1])}" y="${Y(p.at[0]) + 5}" text-anchor="middle" font-size="14">${p.icon}</text>${p.label ? `<text x="${X(p.at[1])}" y="${Y(p.at[0]) + 28}" text-anchor="middle" font-size="10" fill="#33433e">${esc(p.label)}</text>` : ''}</g>`).join('')}</svg>`;
}
export const gmaps = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

// ---------- screens ----------
export function pinHtml(s, lines) {
  ensureGeo(s); const pin = s.checkoutPin || s.customerPin, stores = [...new Set(lines.map(l => l.product.fulfilmentPartner))];
  const checks = stores.map(n => ({n, ...serviceable(s, n, pin)}));
  return `<fieldset class="wide geo-pin"><legend>Delivery location (map pin)</legend><div class="form-grid two"><label><span>Area</span><select name="geoArea" data-geo-area>${Object.keys(AREAS).map(a => `<option ${pin.label === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}${pin.label === 'My current location' ? '<option selected>My current location</option>' : ''}</select></label><span class="row-actions"><button type="button" class="button secondary compact" data-geo="locate">📍 Use my current location</button></span></div>
  <input type="hidden" name="geoLat" value="${pin.label === 'My current location' ? pin.lat : ''}"><input type="hidden" name="geoLng" value="${pin.label === 'My current location' ? pin.lng : ''}"><input type="hidden" name="geoLabel" value="${esc(pin.label)}">
  ${mapSvg([{at: [pin.lat, pin.lng], icon: '🏠', label: 'You'}, ...checks.map(c => ({at: storeOf(s, c.n)?.coords, icon: '🏪', label: c.n, stroke: c.ok ? '#0b6655' : '#a63838'}))], {label: 'Your pin and the stores'})}
  ${checks.map(c => `<small class="block ${c.ok ? 'muted' : 'field-error'}">${esc(c.n)}: ${c.km.toFixed(1)} km away · ${c.ok ? `delivers here (up to ${c.radius} km)` : `outside its ${c.radius} km delivery area`}</small>`).join('')}<p class="geo-msg muted" hidden></p></fieldset>`;
}
const PHASE = {waiting: 'Waiting for a courier', to_store: 'Courier going to the store', at_store: 'Courier at the store', to_customer: 'On the way to you', arriving: 'Arriving now', at_door: 'Courier has arrived', delivered: 'Delivered'};
export function trackPanel(s, o) {
  ensureGeo(s); if (!o.dest || o.fulfilment === 'pickup') return '';
  const here = current(s, o), live = o.geo?.live && o.track?.length, eta = ['out_for_delivery', 'ready_for_pickup', 'accepted', 'paid', 'confirmed'].includes(o.status) && o.deliveryAssignment ? etaMin(s, o) : null;
  const phase = o.status === 'delivered' ? 'delivered' : o.geo?.phase || 'waiting', c = courierOf(s, o);
  return `<section class="panel geo-track"><h2>${esc(PHASE[phase] || 'Tracking')}${eta && phase !== 'delivered' ? ` · about ${eta} min${o.status === 'out_for_delivery' ? '' : ' to the store'}` : ''}</h2>
  ${mapSvg([{at: o.origin, icon: '🏪', label: o.fulfilmentPartner}, {at: o.dest, icon: '🏠', label: 'You'}, ...(here && o.deliveryAssignment && phase !== 'delivered' ? [{at: here, icon: '🛵', label: c?.name || 'Courier', fill: '#0b6655', stroke: '#0b6655'}] : [])], {path: (o.track || []).map(p => [p.lat, p.lng]), plan: [o.origin, o.dest], label: 'Live tracking map'})}
  <p class="muted">${live ? `Live location · updated ${Math.max(0, Math.round((Date.now() - o.geo.lastAt) / 1000))} s ago` : o.deliveryAssignment ? 'Courier location appears once they start sharing.' : 'A courier will be assigned when the store packs your order.'} · ${(o.deliveryKm || 0).toFixed(1)} km route${o.actualKm ? ` · driven ${o.actualKm} km` : ''}</p>
  ${phase !== 'delivered' ? `<div class="row-actions"><button class="button text compact" data-geo-share="${esc(o.id)}">Share tracking link</button></div>` : o.deliveredLocation ? `<p class="muted">Delivered at ${o.deliveredLocation.map(x => x.toFixed(4)).join(', ')}</p>` : ''}</section>`;
}
export function courierPanel(s, o) {
  ensureGeo(s); if (!o.origin || !o.dest) return '';
  const toStore = toStorePhase(o), target = toStore ? o.origin : o.dest, here = current(s, o);
  return `<div class="geo-courier">${mapSvg([{at: o.origin, icon: '🏪', label: 'Store'}, {at: o.dest, icon: '🏠', label: 'Customer'}, {at: here, icon: '🛵', label: 'You', fill: '#0b6655'}], {path: (o.track || []).map(p => [p.lat, p.lng]), plan: [o.origin, o.dest], label: 'Your route'})}
  <small class="block"><b>${esc(PHASE[o.geo?.phase || (toStore ? 'to_store' : 'to_customer')] || '')}</b> · ${roadKm(here, target).toFixed(1)} km to ${toStore ? 'the store' : 'the customer'} · about ${etaMin(s, o)} min ${o.geo?.live ? '· <b class="live-dot">● Location on</b>' : ''}</small>
  <div class="row-actions"><a class="button secondary compact" target="_blank" rel="noopener" href="${gmaps(target[0], target[1])}">Navigate</a><button class="button ${o.geo?.live ? 'secondary' : 'primary'} compact" data-geo-live="${esc(o.id)}">${o.geo?.live ? 'Stop sharing' : 'Share live location'}</button><button class="button text compact" data-geo-step="${esc(o.id)}">Demo: move 400 m</button><button class="button text compact" data-geo-auto="${esc(o.id)}">Demo: auto-drive</button></div></div>`;
}
export function adminLive(s) {
  ensureGeo(s);
  const act = (s.customerOrders || []).filter(o => o.deliveryAssignment && ['accepted', 'picked_up'].includes(o.deliveryAssignment.status) && o.dest);
  const now = Date.now();
  return `<section class="panel"><h2>Live deliveries</h2>${act.length ? mapSvg([...Object.values(s.shopPartners || {}).map(p => ({at: p.coords, icon: '🏪', label: p.name})), ...act.map(o => ({at: current(s, o), icon: '🛵', label: o.id, fill: '#0b6655'}))], {label: 'Live deliveries'}) : ''}${act.map(o => { const late = o.etaMinutes && o.createdAt && (now - o.createdAt) / 60000 > o.etaMinutes + 10, stuck = o.geo?.live && now - (o.geo.lastAt || now) > 10 * 60000; return `<div class="ledger-row static"><span><b>${esc(o.id)} · ${esc(PHASE[o.geo?.phase || 'to_store'] || '')}</b><small>${esc(courierOf(s, o)?.name || '')} · ${o.geo?.live ? 'live' : 'not sharing'} · ${roadKm(current(s, o), o.status === 'out_for_delivery' ? o.dest : o.origin).toFixed(1)} km to go</small></span>${late ? '<span class="status-pill danger">Late</span>' : ''}${stuck ? '<span class="status-pill danger">No update 10 min</span>' : ''}</div>`; }).join('') || '<p class="muted">No active deliveries.</p>'}</section>`;
}

// ---------- bindings ----------
let watchId = null, autoTimer = null;
export function bind(root, api) {
  const S = () => api.getState(), find = id => (S().customerOrders || []).find(o => o.id === id);
  root.querySelector('[data-geo-area]')?.addEventListener('change', e => { const a = e.target.value; if (!AREAS[a]) return; S().checkoutPin = {label: a, lat: AREAS[a][0], lng: AREAS[a][1]}; api.save(); api.render(); });
  root.querySelector('[data-geo="locate"]')?.addEventListener('click', () => { const msg = root.querySelector('.geo-msg'); if (!navigator.geolocation) { msg.hidden = false; msg.textContent = 'This browser cannot share location. Choose an area.'; return; } msg.hidden = false; msg.textContent = 'Asking for location permission…'; navigator.geolocation.getCurrentPosition(p => { S().checkoutPin = {label: 'My current location', lat: p.coords.latitude, lng: p.coords.longitude}; api.save(); api.render(); }, err => { msg.textContent = `Location not available (${err.message}). Choose an area instead.`; }, {enableHighAccuracy: true, timeout: 10000}); });
  root.querySelectorAll('[data-geo-step]').forEach(b => b.onclick = () => { const e = demoStep(S(), find(b.dataset.geoStep)); api.save(); api.render(); if (e) api.toast(e); });
  root.querySelectorAll('[data-geo-auto]').forEach(b => b.onclick = () => { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; return api.toast('Auto-drive stopped'); } const id = b.dataset.geoAuto; autoTimer = setInterval(() => { const o = find(id); const e = o ? demoStep(S(), o) : 'stop'; api.save(); api.render(); if (e) { clearInterval(autoTimer); autoTimer = null; } }, 1200); api.toast('Auto-drive started (moves 400 m every second)'); });
  root.querySelectorAll('[data-geo-live]').forEach(b => b.onclick = () => { const s = S(), o = find(b.dataset.geoLive);
    if (o.geo?.live) { stopTracking(o); if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; api.save(); api.render(); return api.toast('Location sharing stopped'); }
    if (!navigator.geolocation) return api.toast('This browser cannot share location. Use the demo buttons.');
    watchId = navigator.geolocation.watchPosition(p => { const x = find(o.id); if (!x || ['delivered', 'cancelled'].includes(x.status)) { navigator.geolocation.clearWatch(watchId); watchId = null; return; } recordPosition(S(), x, p.coords.latitude, p.coords.longitude, 'gps'); api.save(); api.render(); }, err => api.toast(`Location permission needed (${err.message})`), {enableHighAccuracy: true, maximumAge: 5000});
    o.geo = {...(o.geo || {}), live: true, lastAt: Date.now()}; api.save(); api.render(); api.toast('Sharing live location for this delivery only'); });
  root.querySelectorAll('[data-geo-share]').forEach(b => b.onclick = async () => { const url = `${location.origin}${location.pathname}#/orderTracking`; try { await navigator.clipboard.writeText(`Track my MoveAI order ${b.dataset.geoShare}: ${url}`); api.toast('Tracking link copied'); } catch { api.toast(url); } });
}
