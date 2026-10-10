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
  for (const o of s.customerOrders || []) if (!o.dest && o.fulfilment !== 'pickup' && !['cancelled'].includes(o.status)) { const st = storeOf(s, o.fulfilmentPartner); if (st) { o.origin = st.coords; o.dest = [s.customerPin.lat, s.customerPin.lng]; o.destLabel = s.customerPin.label; o.deliveryKm ??= Math.round(roadKm(o.origin, o.dest) * 10) / 10; o.geo ||= {phase: o.status === 'delivered' ? 'delivered' : 'waiting', live: false}; } }
  return s;
}
const storeOf = (s, name) => Object.values(s.shopPartners || {}).find(p => p.name === name);
export function pinFrom(s, v = {}) {
  ensureGeo(s);
  if (Number(v.geoLat) && Number(v.geoLng)) return {label: v.geoLabel || 'My current location', lat: Number(v.geoLat), lng: Number(v.geoLng)};
  if (v.geoArea && AREAS[v.geoArea]) return {label: v.geoArea, lat: AREAS[v.geoArea][0], lng: AREAS[v.geoArea][1]};
  return s.customerPin;
}
export function inPolygon(pt, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [yi, xi] = poly[i], [yj, xj] = poly[j]; if (((yi > pt[0]) !== (yj > pt[0])) && (pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
export function serviceable(s, storeName, pin) { const p = storeOf(s, storeName), d = km(p?.coords, [pin.lat, pin.lng]); if (p?.area?.length >= 3) return {ok: inPolygon([pin.lat, pin.lng], p.area), km: d, radius: p.radiusKm || 12, shape: true}; return {ok: !p || d <= p.radiusKm, km: d, radius: p?.radiusKm || 12}; }
export function checkServiceable(s, stores, pin) {
  for (const n of stores) { const r = serviceable(s, n, pin); if (!r.ok) return r.shape ? `${n} does not deliver to this location (outside its delivery area). Choose another location or remove its items.` : `${n} delivers up to ${r.radius} km; your pin is ${r.km.toFixed(1)} km away. Choose another location or remove its items.`; }
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
export function startDemoLocation(s,o) {
 ensureGeo(s);
 if(!o?.origin||o.deliveryAssignment?.status!=='accepted')return 'An accepted delivery with a store location is required.';
 o.geo={...(o.geo||{}),mode:'demo',live:true,everStarted:true,lastAt:Date.now()};
 return recordPosition(s,o,o.origin[0],o.origin[1],'demo');
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

// ---------- gate / entrance notes (last 200 m) ----------
export const pinKey = p => p ? `${Number(p[0]).toFixed(3)},${Number(p[1]).toFixed(3)}` : '';
export const gateNote = (s, p) => (s.addressNotes || {})[pinKey(p)]?.text || '';
export function saveGateNote(s, o, text) { const t = String(text || '').trim(); if (!t) return 'Write the note (e.g. "Gate 2, Tower B lift").'; if (!o.dest) return 'This order has no map pin.'; (s.addressNotes ||= {})[pinKey(o.dest)] = {text: t.slice(0, 120), by: courierOf(s, o)?.name || 'Courier', at: new Date().toLocaleDateString('en-IN')}; return ''; }

// ---------- late / stuck alerts ----------
export function alerts(s) {
  const now = Date.now();
  for (const o of (s.customerOrders || []).filter(o => o.deliveryAssignment && ['accepted', 'picked_up'].includes(o.deliveryAssignment.status) && o.geo)) {
    if (o.etaMinutes && o.createdAt && now - o.createdAt > (o.etaMinutes + 10) * 60000 && !o.geo.lateAlerted) { o.geo.lateAlerted = true; note(s, o, `Running late (promised ~${o.etaMinutes} min)`, 'admin'); }
    if (o.geo.live && o.geo.lastAt && now - o.geo.lastAt > 10 * 60000 && !o.geo.stuckAlerted) { o.geo.stuckAlerted = true; note(s, o, 'No location update for 10 minutes', 'admin'); }
  }
}

// ---------- truck trips and moving jobs ----------
const TRIP_COORDS = {'TRP-501': [[25.5941, 85.1376], [28.5355, 77.2639]], 'TRP-502': [[25.5541, 84.6630], [25.5596, 84.8686]], 'TRP-503': [[26.9124, 75.7873], [28.6139, 77.2090]], 'TRP-504': [[25.5941, 85.1376], [28.5355, 77.2639]]};
export function ensureJobGeo(s) {
  for (const t of s.trips || []) if (!t.route) { const c = TRIP_COORDS[t.id] || [[28.6139, 77.2090], [28.4595, 77.0266]]; t.route = {from: c[0], to: c[1]}; }
  for (const j of s.movingJobs || []) if (!j.route) j.route = {from: [28.6270, 77.3727], to: [28.4595, 77.0266]};
}
const jobHere = j => j.gtrack?.length ? [j.gtrack.at(-1).lat, j.gtrack.at(-1).lng] : j.route.from;
const offRoute = (p, a, b) => { const d = km(a, b), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) || 1))); return km(p, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); };
export function jobPosition(s, j, kind, lat, lng, src = 'gps') {
  ensureJobGeo(s); if (['closed', 'cancelled', 'delivered'].includes(j.status)) return 'Tracking is only on during an active job.';
  (j.gtrack ||= []).push({lat, lng, at: Date.now(), src}); j.geo ||= {}; j.geo.live = true; j.geo.lastAt = Date.now();
  const here = [lat, lng], owner = j.owner;
  const loadedDone = kind === 'trip' ? (j.milestones || []).some(m => m.key === 'loaded' && m.status === 'done') : ['loaded', 'in_transit', 'unloaded', 'otp_verified', 'paid', 'closed'].includes(j.status);
  if (!loadedDone && km(here, j.route.from) <= 0.5 && !j.geo.atPickupAt) { j.geo.atPickupAt = Date.now(); jobNote(s, j, 'Reached pickup (GPS)', owner); if (kind === 'trip') { const m = (j.milestones || []).find(x => x.key === 'pickup_reached'); if (m && m.status !== 'done') { m.status = 'done'; m.at = new Date().toLocaleString('en-IN'); m.by = 'GPS'; } } }
  if (loadedDone && j.geo.atPickupAt && !j.geo.loadingWaitMin) j.geo.loadingWaitMin = Math.round((Date.now() - j.geo.atPickupAt) / 60000);
  if (loadedDone && km(here, j.route.to) <= 0.5 && !j.geo.atDropAt) { j.geo.atDropAt = Date.now(); jobNote(s, j, 'Reached drop location (GPS) — complete the delivery steps', owner); }
  const dev = offRoute(here, j.route.from, j.route.to); if (dev > (kind === 'trip' ? 25 : 5) && !j.geo.deviationAlerted) { j.geo.deviationAlerted = true; jobNote(s, j, `Off the expected route by ${dev.toFixed(0)} km`, owner); }
  return '';
}
function jobNote(s, j, text, to) { (j.history ||= []).push({at: new Date().toLocaleString('en-IN'), by: 'GPS', status: text}); (s.notifications ||= []).unshift({id: `NT-${Date.now()}${Math.random().toString(36).slice(2, 4)}`, to, text: `${j.id}: ${text}`, ref: j.id, at: new Date().toLocaleString('en-IN'), read: false}); }
export function jobDemoStep(s, j, kind) {
  ensureJobGeo(s); const loadedDone = kind === 'trip' ? (j.milestones || []).some(m => m.key === 'loaded' && m.status === 'done') : ['loaded', 'in_transit', 'unloaded'].includes(j.status);
  const here = jobHere(j), target = loadedDone ? j.route.to : j.route.from, d = km(here, target), step = kind === 'trip' ? 40 : 3;
  if (d < 0.05) { if (!j.gtrack?.length) return jobPosition(s, j, kind, here[0], here[1], 'demo'); return 'Already there.'; }
  const f = Math.min(1, step / d); return jobPosition(s, j, kind, here[0] + (target[0] - here[0]) * f, here[1] + (target[1] - here[1]) * f, 'demo');
}
export function jobPanel(s, j, kind) {
  ensureJobGeo(s); const here = jobHere(j), loadedDone = kind === 'trip' ? (j.milestones || []).some(m => m.key === 'loaded' && m.status === 'done') : ['loaded', 'in_transit', 'unloaded'].includes(j.status), target = loadedDone ? j.route.to : j.route.from;
  return `<section class="panel geo-track"><h2>GPS · ${loadedDone ? 'to drop' : 'to pickup'} · ${roadKm(here, target).toFixed(0)} km · about ${Math.max(1, Math.round(roadKm(here, target) / (kind === 'trip' ? 45 : 25) * 60))} min</h2>
  ${mapSvg([{at: j.route.from, icon: '📦', label: 'Pickup'}, {at: j.route.to, icon: '🏁', label: 'Drop'}, {at: here, icon: kind === 'trip' ? '🚚' : '🚛', label: 'Vehicle', fill: '#0b6655'}], {path: (j.gtrack || []).map(p => [p.lat, p.lng]), plan: [j.route.from, j.route.to], label: 'Vehicle route'})}
  <small class="block muted">${j.geo?.live ? 'Live location' : 'Not sharing yet'}${j.geo?.atPickupAt ? ' · reached pickup' : ''}${j.geo?.loadingWaitMin != null ? ` · waited ${j.geo.loadingWaitMin} min at loading` : ''}${j.geo?.atDropAt ? ' · reached drop' : ''}${j.geo?.deviationAlerted ? ' · <b>route deviation flagged</b>' : ''}</small>
  <div class="row-actions"><a class="button secondary compact" target="_blank" rel="noopener" href="${gmaps(target[0], target[1])}">Navigate</a><button class="button secondary compact" data-geo-job="${esc(j.id)}" data-kind="${kind}" data-mode="live">Share live location</button><button class="button text compact" data-geo-job="${esc(j.id)}" data-kind="${kind}" data-mode="step">Demo: move ${kind === 'trip' ? '40' : '3'} km</button></div></section>`;
}

// ---------- maps ----------
export function mapSvg(points, opts = {}) {
  const pts = points.filter(p => p && p.at); if (!pts.length) return '';
  const data = esc(JSON.stringify({pts: pts.map(p => ({at: p.at, icon: p.icon, label: p.label || ''})), path: opts.path || [], plan: opts.plan || null, drag: Boolean(opts.drag), poly: opts.poly || null}));
  return `<div class="geo-map-wrap" data-geo-map="${data}">${sketch(pts, opts)}</div>`;
}
function sketch(pts, opts) {
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
  ${mapSvg([{at: [pin.lat, pin.lng], icon: '🏠', label: 'You'}, ...checks.map(c => ({at: storeOf(s, c.n)?.coords, icon: '🏪', label: c.n, stroke: c.ok ? '#0b6655' : '#a63838'}))], {label: 'Your pin and the stores', drag: true, poly: storeOf(s, stores[0])?.area || null})}<small class="block muted">On street maps you can drag 🏠 to your exact gate.</small>
  ${checks.map(c => `<small class="block ${c.ok ? 'muted' : 'field-error'}">${esc(c.n)}: ${c.km.toFixed(1)} km away · ${c.ok ? (c.shape ? 'inside its delivery area' : `delivers here (up to ${c.radius} km)`) : (c.shape ? 'outside its delivery area' : `outside its ${c.radius} km delivery area`)}</small>`).join('')}${gateNote(s, [pin.lat, pin.lng]) ? `<small class="block">Couriers noted at this location: <b>${esc(gateNote(s, [pin.lat, pin.lng]))}</b></small>` : ''}<p class="geo-msg muted" hidden></p></fieldset>`;
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
  <div class="row-actions"><a class="button secondary compact" target="_blank" rel="noopener" href="${gmaps(target[0], target[1])}">Navigate to ${toStore?'store':'customer'}</a>${o.geo?.live && ACTIVE_DELIVERY_STATUSES.includes(o.status) ? `<span class="status-pill">${o.geo?.mode==='demo'?'Demo location active':'Sharing location — stays on until delivered'}</span>` : `<button class="button ${o.geo?.live ? 'secondary' : 'primary'} compact" data-geo-live="${esc(o.id)}">${o.geo?.live ? 'Stop sharing' : 'Share live location'}</button>`}${!o.geo?.everStarted?`<button class="button secondary compact" data-geo-start-demo="${esc(o.id)}">Use demo location</button>`:''}<button class="button text compact" data-geo-step="${esc(o.id)}">Demo: move 400 m</button><button class="button text compact" data-geo-auto="${esc(o.id)}">Demo: auto-drive</button></div>${o.geo?.lastAt?`<small class="block">Last location update: ${esc(new Date(o.geo.lastAt).toLocaleString('en-IN'))}${o.geo.mode==='demo'?' · simulated':''}</small>`:''}${gateNote(s, o.dest) ? `<small class="block">📍 Entrance note: <b>${esc(gateNote(s, o.dest))}</b></small>` : ''}<form class="inline-form" data-geo-gate="${esc(o.id)}"><input name="note" placeholder="Entrance note for next time (e.g. Gate 2, Tower B lift)"><button class="button secondary compact">Save note</button></form></div>`;
}
export function adminLive(s) {
  ensureGeo(s);
  const act = (s.customerOrders || []).filter(o => o.deliveryAssignment && ['accepted', 'picked_up'].includes(o.deliveryAssignment.status) && o.dest);
  const now = Date.now();
  return `<section class="panel"><h2>Live deliveries</h2>${act.length ? mapSvg([...Object.values(s.shopPartners || {}).map(p => ({at: p.coords, icon: '🏪', label: p.name})), ...act.map(o => ({at: current(s, o), icon: '🛵', label: o.id, fill: '#0b6655'}))], {label: 'Live deliveries'}) : ''}${act.map(o => { const late = o.etaMinutes && o.createdAt && (now - o.createdAt) / 60000 > o.etaMinutes + 10, stuck = o.geo?.live && now - (o.geo.lastAt || now) > 10 * 60000; return `<div class="ledger-row static"><span><b>${esc(o.id)} · ${esc(PHASE[o.geo?.phase || 'to_store'] || '')}</b><small>${esc(courierOf(s, o)?.name || '')} · ${o.geo?.live ? 'live' : 'not sharing'} · ${roadKm(current(s, o), o.status === 'out_for_delivery' ? o.dest : o.origin).toFixed(1)} km to go</small></span>${late ? '<span class="status-pill danger">Late</span>' : ''}${stuck ? '<span class="status-pill danger">No update 10 min</span>' : ''}</div>`; }).join('') || '<p class="muted">No active deliveries.</p>'}</section>`;
}

// ---------- bindings ----------
// Keyed by order id, not a single shared variable — a courier can legitimately carry more than one
// order at once (capacityPerCourier already allows this), and a single shared handle meant stopping
// tracking on one order could silently clear the wrong order's GPS watch.
const watchIds = new Map();
let autoTimer = null;
// Statuses where a delivery is genuinely in progress — manual "Stop sharing" is disabled here; it only
// re-enables once the order reaches a real end state (the auto-clear in the position callback already
// handles the normal case; this is specifically about a courier choosing to stop early).
const ACTIVE_DELIVERY_STATUSES = ['accepted', 'picked_up', 'out_for_delivery'];
let leafletState = 'none';
function loadLeaflet(cb) {
  if (window.L) return cb(); if (leafletState === 'failed') return; if (leafletState === 'loading') return setTimeout(() => loadLeaflet(cb), 300);
  leafletState = 'loading'; const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
  const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; sc.onload = () => { leafletState = 'ready'; cb(); }; sc.onerror = () => { leafletState = 'failed'; }; document.head.appendChild(sc);
}
function hydrate(root, api) {
  const wraps = root.querySelectorAll('.geo-map-wrap'); if (!wraps.length || api.getState().mapMode === 'sketch') return;
  loadLeaflet(() => wraps.forEach(w => { if (w.dataset.live) return; let d; try { d = JSON.parse(w.dataset.geoMap); } catch { return; }
    const L = window.L, div = document.createElement('div'); div.className = 'leaflet-host'; w.innerHTML = ''; w.appendChild(div); w.dataset.live = '1';
    const map = L.map(div, {scrollWheelZoom: false}); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap contributors'}).addTo(map);
    const icon = (e) => L.divIcon({className: 'geo-pin-icon', html: `<span>${e}</span>`, iconSize: [30, 30]});
    const all = []; d.pts.forEach(p => { const m = L.marker(p.at, {icon: icon(p.icon), draggable: d.drag && p.icon === '🏠'}).addTo(map); if (p.label) m.bindTooltip(p.label); all.push(p.at);
      if (d.drag && p.icon === '🏠') m.on('dragend', () => { const ll = m.getLatLng(), s = api.getState(); s.checkoutPin = {label: 'Pinned on map', lat: ll.lat, lng: ll.lng}; api.save(); api.render(); }); });
    if (d.plan) L.polyline(d.plan, {dashArray: '6 6', color: '#9aa8a3'}).addTo(map); if (d.path?.length) L.polyline(d.path, {color: '#0b6655', weight: 4}).addTo(map); if (d.poly) L.polygon(d.poly, {color: '#3d3f94', weight: 1, fillOpacity: .08}).addTo(map);
    map.fitBounds(L.latLngBounds(all).pad(0.3)); }));
}
export function bind(root, api) {
  hydrate(root, api);
  root.querySelectorAll('form[data-geo-gate]').forEach(f => f.onsubmit = e => { e.preventDefault(); const s = api.getState(), o = (s.customerOrders || []).find(x => x.id === f.dataset.geoGate); const err = saveGateNote(s, o, new FormData(f).get('note')); if (err) return api.toast(err); api.save(); api.render(); api.toast('Entrance note saved for the next delivery here'); });
  root.querySelectorAll('[data-geo-job]').forEach(b => b.onclick = () => { const s = api.getState(), kind = b.dataset.kind, j = (kind === 'trip' ? s.trips : s.movingJobs).find(x => x.id === b.dataset.geoJob);
    if (b.dataset.mode === 'step') { const e = jobDemoStep(s, j, kind); api.save(); api.render(); if (e) api.toast(e); return; }
    if (!navigator.geolocation) return api.toast('This browser cannot share location. Use the demo button.');
    navigator.geolocation.watchPosition(p => { jobPosition(api.getState(), j, kind, p.coords.latitude, p.coords.longitude, 'gps'); api.save(); api.render(); }, err => api.toast(`Location permission needed (${err.message})`), {enableHighAccuracy: true, maximumAge: 10000}); api.toast('Sharing live location for this job'); });
  const S = () => api.getState(), find = id => (S().customerOrders || []).find(o => o.id === id);
  root.querySelector('[data-geo-area]')?.addEventListener('change', e => { const a = e.target.value; if (!AREAS[a]) return; S().checkoutPin = {label: a, lat: AREAS[a][0], lng: AREAS[a][1]}; api.save(); api.render(); });
  root.querySelector('[data-geo="locate"]')?.addEventListener('click', () => { const msg = root.querySelector('.geo-msg'); if (!navigator.geolocation) { msg.hidden = false; msg.textContent = 'This browser cannot share location. Choose an area.'; return; } msg.hidden = false; msg.textContent = 'Asking for location permission…'; navigator.geolocation.getCurrentPosition(p => { S().checkoutPin = {label: 'My current location', lat: p.coords.latitude, lng: p.coords.longitude}; api.save(); api.render(); }, err => { msg.textContent = `Location not available (${err.message}). Choose an area instead.`; }, {enableHighAccuracy: true, timeout: 10000}); });
  root.querySelectorAll('[data-geo-step]').forEach(b => b.onclick = () => { const e = demoStep(S(), find(b.dataset.geoStep)); api.save(); api.render(); if (e) api.toast(e); });
  root.querySelectorAll('[data-geo-start-demo]').forEach(b => b.onclick = () => { const o=find(b.dataset.geoStartDemo),error=startDemoLocation(S(),o);if(error)return api.toast(error);api.save();api.render();api.toast('Simulated location started for this delivery'); });
  root.querySelectorAll('[data-geo-auto]').forEach(b => b.onclick = () => { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; return api.toast('Auto-drive stopped'); } const id = b.dataset.geoAuto; autoTimer = setInterval(() => { const o = find(id); const e = o ? demoStep(S(), o) : 'stop'; api.save(); api.render(); if (e) { clearInterval(autoTimer); autoTimer = null; } }, 1200); api.toast('Auto-drive started (moves 400 m every second)'); });
  root.querySelectorAll('[data-geo-live]').forEach(b => b.onclick = () => { const s = S(), o = find(b.dataset.geoLive);
    if (o.geo?.live) {
      // Hard guard, not just a hidden button — stopping mid-delivery is blocked here regardless of how
      // the click was triggered. It only ever auto-clears, inside the position callback below, once
      // the order reaches a real end state.
      if (ACTIVE_DELIVERY_STATUSES.includes(o.status)) return api.toast('Location sharing stays on until this delivery is complete.');
      stopTracking(o); const wid = watchIds.get(o.id); if (wid != null && navigator.geolocation) navigator.geolocation.clearWatch(wid); watchIds.delete(o.id); api.save(); api.render(); return api.toast('Location sharing stopped');
    }
    if (!navigator.geolocation) return api.toast('This browser cannot share location. Use the demo buttons.');
    const wid = navigator.geolocation.watchPosition(p => { const x = find(o.id); if (!x || ['delivered', 'cancelled'].includes(x.status)) { const w = watchIds.get(o.id); if (w != null) navigator.geolocation.clearWatch(w); watchIds.delete(o.id); return; } recordPosition(S(), x, p.coords.latitude, p.coords.longitude, 'gps'); api.save(); api.render(); }, err => {const x=find(o.id);if(x&&!x.track?.length){x.geo.live=false;x.geo.everStarted=false;api.save();api.render()}api.toast(`Location unavailable (${err.message}). Use demo location for this prototype.`)}, {enableHighAccuracy: true, maximumAge: 5000});
    watchIds.set(o.id, wid);
    o.geo = {...(o.geo || {}), mode:'gps', live: true, everStarted: true, lastAt: Date.now()}; api.save(); api.render(); api.toast('Sharing live location for this delivery only'); });
  root.querySelectorAll('[data-geo-share]').forEach(b => b.onclick = async () => { const url = `${location.origin}${location.pathname}#/orderTracking`; try { await navigator.clipboard.writeText(`Track my MoveAI order ${b.dataset.geoShare}: ${url}`); api.toast('Tracking link copied'); } catch { api.toast(url); } });
}
