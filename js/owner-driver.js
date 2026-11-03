// MoveAI One — drivers with their own vehicle (Porter model).
// Small "Choose vehicle and helpers" bookings (bike, 3-wheeler, Tata Ace, pickup, no extra helpers) go to
// verified owner-drivers through the same matching as personal drivers (driver-dispatch.js, pool "owner").
// Job: Navigate to pickup → On the way → pickup code from the customer → loaded → Navigate to drop →
// drop code from the receiver + photo → paid; the driver's share (after MoveAI's commission) goes to the
// wallet and is paid out weekly.
import {clock, paySummary, release} from './pay.js';
import * as LOC from './location.js';
import * as DD from './driver-dispatch.js';
import * as GeoMap from './geo.js';
import {km} from './geo.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const notify = (s, to, text, ref, route) => { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, route, at: stamp(), read: false}); };
export const SMALL = ['bike', '3w', 'ace', 'pickup'];
export const VEHICLE_NAMES = {bike: 'Two-wheeler', '3w': '3-wheeler', ace: 'Tata Ace', pickup: 'Pickup'};
export const COMMISSION = 0.10;

export const drivers = s => s.ownerDrivers || [];
export const meOf = (s, ws = 'ownerDriver') => drivers(s).find(p => p.ws === ws) || null;
const job = (s, id) => (s.serviceRequests || []).find(x => x.id === id && x.kind === 'owner');
const mine = (s, ws, id) => { const r = job(s, id); return r && r.provider === ws ? r : null; };

// Which moving bookings go to owner-drivers instead of a mover branch.
export const forOwner = d => d?.moveQuote?.bookingKind === 'vehicle' && SMALL.includes(d.vehicleId) && ['self', 'driver'].includes(d.help);
// Called from booking-publish for a small vehicle booking.
export function createJob(s, base, d) {
  const r = {...base, type: 'moving', kind: 'owner', ownerFlow: true, bookingKind: 'vehicle', title: d.title, vehicleId: d.vehicleId, help: d.help, slot: d.slot || '', startTime: d.slot ? `${d.slot}:00` : '09:00',
    pickup: d.fromLoc, drop: d.toLoc, from: d.from, to: d.to, distanceKm: d.distanceKm, status: 'searching', provider: null, providerName: null, customerName: s.person?.name || 'Customer', conversationId: null,
    startOtp: String(1000 + Math.floor(Math.random() * 9000)), dropOtp: String(1000 + Math.floor(Math.random() * 9000)), timeline: [{at: stamp(), text: 'Booked'}], createdAtMs: clock(), pricing: {commission: COMMISSION}};
  s.serviceRequests.unshift(r); DD.start(s, r); return r;
}
export function activate(s, c) {
  if (!c || c.workerType !== 'vehicleDriver') return 'Not a vehicle driver sign-up.';
  if ((c.level || 1) < 2) return 'Verify your licence, selfie and vehicle papers first.';
  const v = c.checks?.vehicle; if (v?.status !== 'verified') return 'Verify your vehicle papers first.';
  for (const p of drivers(s)) if (p.ws === 'ownerDriver' && p.candidateId !== c.id) p.ws = null;
  let p = drivers(s).find(x => x.candidateId === c.id);
  const base = LOC.PIN_CENTRES[Object.keys(LOC.PIN_CENTRES).find(k => LOC.PIN_CENTRES[k][2] === (c.locations?.[0] || ''))]?.slice(0, 2) || (/patna/i.test(c.locations?.[0] || '') ? [25.6120, 85.1400] : null);
  if (!p) { p = {id: `OD-${c.id}`, candidateId: c.id, name: c.name, mobile: c.mobile, city: c.locations?.[0] || '', base, radiusKm: 10, rating: 0, ratingCount: 0, tripsDone: 0, verified: true, trained: false, active: true, stats: {accepted: 0, cancels: 0, noShows: 0, late: 0, strikes: 0}}; (s.ownerDrivers ||= []).push(p); }
  Object.assign(p, {ws: 'ownerDriver', vehicleId: v.vehicleId, plate: v.plate, docs: {...v.docs}, verified: true, bank: c.checks?.bank?.status === 'verified' ? c.checks.bank.masked : p.bank});
  if (!(s.workspaces ||= []).includes('ownerDriver')) s.workspaces.push('ownerDriver');
  const id = (s.knownIdentities || []).find(x => x.mobile === (s.auth?.mobile || c.mobile)); if (id && !(id.workspaces || []).includes('ownerDriver')) (id.workspaces ||= []).push('ownerDriver');
  s.lastWorkspace = 'ownerDriver'; return '';
}
export const offersFor = (s, ws = 'ownerDriver') => { const p = meOf(s, ws); return p ? (s.serviceRequests || []).filter(r => r.kind === 'owner' && DD.offeredTo(r, p)) : []; };
export const jobsOf = (s, ws = 'ownerDriver') => (s.serviceRequests || []).filter(r => r.kind === 'owner' && r.provider === ws);
export function acceptJob(s, ws, id) {
  const p = meOf(s, ws), r = job(s, id); if (!p) return 'Driver profile not found.';
  if (Object.values(p.docs || {}).some(d => d < new Date(clock()).toISOString().slice(0, 10))) return 'Your vehicle papers or licence have expired. Renew them to take jobs.';
  if (!r || r.status !== 'searching') return 'This job was given to another driver or cancelled.';
  if (!DD.offeredTo(r, p)) return 'This job is no longer offered to you.';
  const e = DD.respond(s, r, p, 'accept'); if (e) return e;
  return r.status === 'accepted' && r.driverId !== p.id ? 'This job went to a closer or better-matched driver. No penalty.' : '';
}
export function declineJob(s, ws, id) { const p = meOf(s, ws), r = job(s, id); return p && r && DD.offeredTo(r, p) ? DD.respond(s, r, p, 'decline') : ''; }
const target = r => LOC.point(['in_transit'].includes(r.status) ? r.drop : r.pickup);
export const here = r => (r.track?.length ? [r.track.at(-1).lat, r.track.at(-1).lng] : null);
export const distLeft = r => { const a = here(r), b = target(r); return a && b ? km(a, b) : null; };
export function onTheWay(s, ws, id) { const r = mine(s, ws, id); if (!r || r.status !== 'accepted') return 'Accept the job first.'; r.status = 'on_the_way'; r.timeline.push({at: stamp(), text: 'On the way to pickup'}); notify(s, r.customer, `${r.id}: ${r.providerName} (${VEHICLE_NAMES[r.vehicleId]} ${meOf(s, ws)?.plate || ''}) is on the way. Pickup code ${r.startOtp}.`, r.id, 'serviceDetail'); return ''; }
export function demoDrive(s, ws, id, stepKm = 1) {
  const r = mine(s, ws, id); if (!r || !['on_the_way', 'in_transit'].includes(r.status)) return 'Start the trip first.';
  const to = target(r); if (!to) return 'No map point. Call the customer.';
  const from = here(r) || (meOf(s, ws)?.base && km(meOf(s, ws).base, to) < 30 ? meOf(s, ws).base : [to[0] + 0.03, to[1] + 0.03]);
  const d = km(from, to), f = r.track?.length ? Math.min(1, stepKm / Math.max(d, 0.0001)) : 0;
  (r.track ||= []).push({lat: from[0] + (to[0] - from[0]) * f, lng: from[1] + (to[1] - from[1]) * f, at: Date.now(), src: 'demo'}); r.geo = {live: true, lastAt: Date.now()};
  const left = distLeft(r); if (left != null && left <= 0.1) { if (r.status === 'on_the_way' && !r.arrivedAt) { r.arrivedAt = stamp(); notify(s, r.customer, `${r.id}: ${r.providerName} reached the pickup. Share the pickup code.`, r.id, 'serviceDetail'); } if (r.status === 'in_transit' && !r.atDropAt) { r.atDropAt = stamp(); notify(s, r.customer, `${r.id}: reached the drop. The receiver shares the drop code ${r.dropOtp}.`, r.id, 'serviceDetail'); } }
  return '';
}
export function pickedUp(s, ws, id, {otp, photo}) {
  const r = mine(s, ws, id); if (!r || r.status !== 'on_the_way') return 'Tap "On the way" first.';
  if (!r.arrivedAt) return 'Reach the pickup first (share your location).';
  if (!photo) return 'Add a photo of the loaded goods.';
  if (String(otp || '').trim() !== r.startOtp) return 'That pickup code is wrong. Ask the customer for the 4-digit code.';
  Object.assign(r, {status: 'in_transit', loadedAt: stamp(), loadPhoto: photo}); r.track = []; r.timeline.push({at: stamp(), text: 'Loaded · on the way to drop'});
  notify(s, r.customer, `${r.id}: goods loaded. Give the drop code ${r.dropOtp} to the receiver.`, r.id, 'serviceDetail'); return '';
}
export function delivered(s, ws, id, {otp, photo}) {
  const r = mine(s, ws, id); if (!r || r.status !== 'in_transit') return 'Load the goods first.';
  if (!r.atDropAt) return 'Reach the drop first (share your location).';
  if (!photo) return 'Add a photo of the delivered goods.';
  if (String(otp || '').trim() !== r.dropOtp) return 'That drop code is wrong. Ask the receiver for the 4-digit code.';
  Object.assign(r, {deliveredAt: stamp(), dropPhoto: photo}); r.timeline.push({at: stamp(), text: 'Delivered with the drop code'}); if (r.geo) r.geo.live = false;
  const p = meOf(s, ws); if (p) p.tripsDone = (p.tripsDone || 0) + 1;
  if (paySummary(s, r).due <= 0) { r.status = 'paid'; r.paid = true; release(s, r, 'MoveAI'); notify(s, r.customer, `${r.id}: delivered. Rate ${r.providerName}.`, r.id, 'serviceDetail'); }
  else { r.status = 'completed'; notify(s, r.customer, `${r.id}: delivered. Pay the balance ${inr(paySummary(s, r).due)} in the app.`, r.id, 'serviceDetail'); }
  return '';
}
export function cancelByDriver(s, ws, id, reason) { const p = meOf(s, ws), r = mine(s, ws, id); if (!p || !r) return 'Job not found.'; return DD.cancelByDriver(s, r, p, reason); }

// ---------- screens ----------
const STEPS = [['searching', 'Finding a vehicle'], ['accepted', 'Driver assigned'], ['on_the_way', 'Coming to pickup'], ['in_transit', 'Goods on the way'], ['completed', 'Delivered'], ['paid', 'Paid'], ['closed', 'Rated']];
const mapOf = r => { const a = here(r), b = target(r); return a || b ? GeoMap.mapSvg([b && {at: b, icon: r.status === 'in_transit' ? '🏁' : '📦', label: r.status === 'in_transit' ? 'Drop' : 'Pickup'}, a && {at: a, icon: '🛻', label: r.providerName, fill: '#0b6655'}].filter(Boolean), {path: (r.track || []).map(p => [p.lat, p.lng]), label: 'Live tracking map'}) : ''; };
export function customerScreen(s, r) {
  const cur = Math.max(0, STEPS.findIndex(([k]) => k === r.status)), p = drivers(s).find(x => x.id === r.driverId), w = r.dispatch?.winner;
  let next = '';
  if (r.status === 'searching') next = `<p data-od-searching>${r.dispatch?.exhausted ? '<b>No vehicle is free within 15 km right now.</b> Our team will call you.' : `We sent your booking to the best-matched verified ${esc(VEHICLE_NAMES[r.vehicleId])} drivers near the pickup. The closest, best-rated one who accepts gets it.`}</p>${r.dispatch?.current ? `<button class="button text compact" data-od="time-passes" data-id="${r.id}">Demo: 60 seconds pass</button>` : ''}`;
  if (['accepted', 'on_the_way'].includes(r.status)) next = `${r.status === 'on_the_way' ? `<section class="hs-live" data-od-live><b>${r.arrivedAt ? `${esc(r.providerName)} is at the pickup` : `${esc(r.providerName)} is coming${distLeft(r) != null ? ` · ${distLeft(r).toFixed(1)} km away` : ''}`}</b>${mapOf(r)}</section>` : `<p>${esc(r.providerName)} will come on ${esc(r.date)} at ${esc(r.startTime)}.</p>`}<div class="otp-share"><small>Pickup code · share when the goods are loaded</small><b data-od-pickup>${esc(r.startOtp)}</b></div>`;
  if (r.status === 'in_transit') next = `<section class="hs-live"><b>Goods on the way${distLeft(r) != null ? ` · ${distLeft(r).toFixed(1)} km to the drop` : ''}</b>${mapOf(r)}</section><div class="otp-share"><small>Drop code · the receiver gives it after checking the goods</small><b data-od-drop>${esc(r.dropOtp)}</b></div>`;
  if (r.status === 'completed') next = '<p>Delivered. Pay the balance through MoveAI.</p>';
  if (r.status === 'paid' && !r.rating) next = `<p>How was ${esc(r.providerName)}?</p><div class="rating" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="service-rating" value="${n}" ${n === 5 ? 'checked' : ''}><span>★</span></label>`).join('')}</div><button class="button primary full" data-op="service-rate" data-id="${r.id}">Rate and close</button>`;
  if (r.status === 'closed') next = `<div class="info-banner"><b>Closed${r.rating ? ` · rated ${'★'.repeat(r.rating)}` : ''}</b><span>Thank you.</span></div>`;
  return `${head(r.title, `${r.id} · ${r.date} ${r.startTime} · ${VEHICLE_NAMES[r.vehicleId]}`)}
  <div class="grid two"><section class="panel"><h2>Progress</h2><ol class="milestones">${STEPS.map(([k, l], i) => `<li class="ms ${i < cur || (i === cur && k === 'closed') ? 'done' : i === cur ? 'current' : ''}"><i></i><span><b>${esc(l)}</b></span></li>`).join('')}</ol><p class="muted">${esc(LOC.oneLine(r.pickup))} → ${esc(LOC.oneLine(r.drop))}</p></section>
  <section class="panel" data-od-next><h2>Your next step</h2>${p ? `<div class="hs-pro"><span class="avatar">${esc(p.name.split(' ').map(x => x[0]).join(''))}</span><span><b>${esc(p.name)}</b><small>${esc(VEHICLE_NAMES[p.vehicleId])} · ${esc(p.plate || '')} · ★ ${DD.ratingOf(s, p).avg || 'New'} · ✓ Licence, ID and vehicle papers</small></span><button class="button secondary compact" data-wx="call" data-name="${esc(p.name)}">📞 Call</button></div>${w ? `<small class="muted block">Why ${esc(p.name.split(' ')[0])}: ${w.km != null ? `${w.km} km away · ` : ''}match score ${w.total}/100</small>` : ''}` : ''}${next}</section></div>`;
}
export function homeScreen(s) {
  const p = meOf(s); if (!p) return head('Vehicle jobs', 'No vehicle profile yet.');
  const st = (s.workerStatus ||= {}).ownerDriver ||= {online: true}, offers = st.online ? offersFor(s) : [], jobs = jobsOf(s), active = jobs.find(r => ['accepted', 'on_the_way', 'in_transit'].includes(r.status));
  const earned = jobs.filter(r => r.paid).reduce((a, r) => a + Math.round((r.quote?.total || 0) * (1 - COMMISSION)), 0);
  return `${head(`Namaste, ${p.name.split(' ')[0]}`, `${VEHICLE_NAMES[p.vehicleId]} · ${p.plate || ''} · ${p.city} · ★ ${DD.ratingOf(s, p).avg || 'New'}`)}
  <section class="panel wh-status"><div><b>${st.online ? 'You are online' : 'You are offline'}</b><small class="block muted">${st.online ? 'Jobs near you appear below.' : 'Go online to get jobs.'}</small></div><button class="button ${st.online ? 'secondary' : 'primary'}" data-od="toggle">${st.online ? 'Go offline' : 'Go online'}</button></section>
  ${active ? `<section class="panel attention"><h2>Now</h2><article class="market-row"><span class="market-icon">🛻</span><span><b>${esc(active.title)}</b><small>${esc(active.id)} · ${esc(String(active.status).replace(/_/g, ' '))}</small></span><button class="button primary compact" data-od="open" data-id="${active.id}">Open</button></article></section>` : ''}
  <section class="panel" data-od-offers><h2>New jobs near you (${offers.length})</h2>${offers.map(r => `<article class="market-row" data-od-offer="${r.id}"><span class="market-icon">📦</span><span><b>${esc(r.title)}</b><small>${esc(r.date)} ${esc(r.startTime)} · ${esc(r.pickup?.village || r.pickup?.city || '')} → ${esc(r.drop?.village || r.drop?.city || '')} · ${esc(r.distanceKm)} km · You earn ${inr(Math.round((r.quote?.total || 0) * (1 - COMMISSION)))}</small></span><span class="row-actions"><button class="button secondary compact" data-od="decline" data-id="${r.id}">Not for me</button><button class="button primary compact" data-od="accept" data-id="${r.id}">Accept</button></span></article>`).join('') || '<p class="muted">No new jobs right now.</p>'}</section>
  <section class="panel"><h2>Money</h2><p class="price-line"><span>Earned (paid jobs, after ${Math.round(COMMISSION * 100)}% MoveAI)</span><b>${inr(earned)}</b></p><p class="muted">Paid out to your bank every Monday.${p.bank ? '' : ' Add your bank account in Verification to receive payouts.'}</p><button class="button secondary compact" data-route="money">My Money</button></section>`;
}
export function jobScreen(s) {
  const ws = s.currentWorkspace, r = jobsOf(s, ws).find(x => x.id === s.selectedServiceId) || jobsOf(s, ws)[0]; if (!r) return homeScreen(s);
  let act = '';
  if (r.status === 'accepted') act = `<a class="button secondary" target="_blank" rel="noopener" data-od-nav href="${esc(LOC.navUrl(r.pickup, 'driving'))}">🧭 Navigate to pickup</a><button class="button primary full" data-od="on-the-way" data-id="${r.id}">On the way</button>`;
  if (r.status === 'on_the_way') act = `<a class="button secondary" target="_blank" rel="noopener" data-od-nav href="${esc(LOC.navUrl(r.pickup, 'driving'))}">🧭 Navigate to pickup</a><div class="hs-live"><b>${r.arrivedAt ? '✓ At the pickup' : distLeft(r) != null ? `${distLeft(r).toFixed(1)} km to pickup` : 'Share your location'}</b><button type="button" class="button text compact" data-od="drive" data-id="${r.id}">Demo: drive 1 km</button></div>
    <form class="form-grid two" data-od-pickup="${r.id}"><label><span>Photo of the loaded goods</span><input type="file" name="photo" accept="image/*" capture="environment"></label><label><span>Customer's pickup code</span><input name="otp" inputmode="numeric" maxlength="4" autocomplete="off"></label><button class="button primary">Loaded — start trip</button></form>`;
  if (r.status === 'in_transit') act = `<a class="button secondary" target="_blank" rel="noopener" data-od-nav href="${esc(LOC.navUrl(r.drop, 'driving'))}">🧭 Navigate to drop</a><div class="hs-live"><b>${r.atDropAt ? '✓ At the drop' : distLeft(r) != null ? `${distLeft(r).toFixed(1)} km to drop` : 'Share your location'}</b><button type="button" class="button text compact" data-od="drive" data-id="${r.id}">Demo: drive 1 km</button></div>
    <form class="form-grid two" data-od-drop="${r.id}"><label><span>Photo of the delivered goods</span><input type="file" name="photo" accept="image/*" capture="environment"></label><label><span>Receiver's drop code</span><input name="otp" inputmode="numeric" maxlength="4" autocomplete="off"></label><button class="button primary">Delivered</button></form>`;
  if (['completed', 'paid', 'closed'].includes(r.status)) act = `<p class="avail-chip">✓ Delivered${r.paid ? ' · paid to your wallet' : ' · waiting for the customer to pay'}</p>`;
  const cancel = ['accepted', 'on_the_way'].includes(r.status) ? `<details class="cancel-box"><summary class="button text compact">Can't make it?</summary><form class="inline-form" data-od-cancel="${r.id}"><input name="reason" placeholder="e.g. vehicle breakdown" aria-label="Reason"><button class="button secondary compact">Give the job back</button></form></details>` : '';
  return `${head(r.title, `${r.id} · ${r.date} ${r.startTime}`)}<div class="grid two"><section class="panel"><p><b>Pickup</b><small class="block">${esc(LOC.oneLine(r.pickup))}</small></p><p><b>Drop</b><small class="block">${esc(LOC.oneLine(r.drop))}</small></p><p class="muted">${esc(r.distanceKm)} km · ${r.help === 'driver' ? 'You help with light loading' : 'Customer loads'}</p><button class="button text compact" data-wx="call" data-name="${esc(r.customerName || 'Customer')}">📞 Call customer via MoveAI</button><p id="od-error" class="field-error" hidden></p>${act}${cancel}</section>
  <section class="panel"><h2>You earn</h2><p class="price-line"><span>Job</span><b>${inr(r.quote?.total)}</b></p><p class="price-line"><span>MoveAI ${Math.round(COMMISSION * 100)}%</span><b>−${inr(Math.round((r.quote?.total || 0) * COMMISSION))}</b></p><p class="price-line total"><span>You receive</span><b>${inr(Math.round((r.quote?.total || 0) * (1 - COMMISSION)))}</b></p></section></div>`;
}
export function screen(route, s) {
  if (s.currentWorkspace === 'ownerDriver' && route === 'home') return homeScreen(s);
  if (route === 'odJob') return jobScreen(s);
  return '';
}
export function bind(root, api) {
  const S = () => api.getState(), ws = () => S().currentWorkspace;
  const err = m => { const e = root.querySelector('#od-error'); if (e) { e.textContent = m; e.hidden = !m; } else api.toast(m); };
  root.querySelectorAll('[data-od]').forEach(b => b.onclick = () => {
    const k = b.dataset.od, id = b.dataset.id, s = S();
    if (k === 'toggle') { const st = ((s.workerStatus ||= {}).ownerDriver ||= {online: true}); st.online = !st.online; api.save(); return api.render(); }
    if (k === 'open') { s.selectedServiceId = id; api.save(); return api.navigate('odJob'); }
    const e = {accept: () => acceptJob(s, ws(), id), decline: () => declineJob(s, ws(), id), 'on-the-way': () => onTheWay(s, ws(), id), drive: () => demoDrive(s, ws(), id), 'time-passes': () => DD.timePasses(s, job(s, id))}[k]?.(); if (e) return err(e);
    if (k === 'accept' && job(s, id)?.provider === ws()) { s.selectedServiceId = id; api.save(); api.navigate('odJob'); return api.toast('Job accepted. The customer has been told.'); }
    api.save(); api.render(); api.toast({accept: 'Accepted. If others also accept, the best match gets it.', decline: 'Hidden', 'on-the-way': 'Customer told you are coming', drive: 'Moved 1 km (demo)', 'time-passes': '60 seconds passed (demo)'}[k] || 'Done');
  });
  const file = (f, n) => f.querySelector(`[name="${n}"]`)?.files?.[0]?.name || '';
  const form = (sel, fn, msg) => root.querySelectorAll(sel).forEach(f => f.onsubmit = e => { e.preventDefault(); const er = fn(f, new FormData(f)); if (er) return err(er); api.save(); api.render(); api.toast(msg); });
  form('[data-od-pickup]', (f, d) => pickedUp(S(), ws(), f.dataset.odPickup, {otp: d.get('otp'), photo: file(f, 'photo')}), 'Loaded — drive safe');
  form('[data-od-drop]', (f, d) => delivered(S(), ws(), f.dataset.odDrop, {otp: d.get('otp'), photo: file(f, 'photo')}), 'Delivered');
  form('[data-od-cancel]', (f, d) => cancelByDriver(S(), ws(), f.dataset.odCancel, d.get('reason')), 'Job handed to the next driver');
  root.querySelectorAll('[data-od-activate]').forEach(b => b.onclick = () => { const s = S(), c = (s.candidates || []).find(x => x.id === b.dataset.odActivate); const e = activate(s, c); if (e) return api.toast(e); api.save(); api.toast('Your vehicle jobs are ready'); if (api.switchTo) api.switchTo('ownerDriver'); else api.render(); });
}
