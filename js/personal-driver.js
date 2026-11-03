// MoveAI One — hire a personal driver (DriveU style) and run the trip.
// Customer: Trip → Pickup → When → Car → Review, then the usual review & pay page. The best-matched driver
// is chosen (driver-dispatch.js). Driver: Navigate → On the way (live location) → at the car: customer's
// start code + photos of the car + odometer → End trip: photos + odometer → actual time is billed
// (extra hours and the night charge go to the customer to approve). SOS, share trip and a long-stop check
// for both. Monthly drivers: attendance, leave, salary through MoveAI, a replacement day and 7 days' notice.
import {clock, record} from './pay.js';
import * as Bill from './customer-billing.js';
import * as LOC from './location.js';
import * as WIZ from './wizard.js';
import * as DD from './driver-dispatch.js';
import * as TX from './trip-extras.js';
import * as GeoMap from './geo.js';
import {km, roadKm} from './geo.js';
import {DRIVER_RATES, DRIVER_RATE_CARD, quoteDriver} from './ops-rules.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const todayIso = () => new Date(clock()).toISOString().slice(0, 10);
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const notify = (s, to, text, ref, route) => { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, route, at: stamp(), read: false}); };
const HOUR = 3600000;

export const BODIES = {hatchback: 'Hatchback', sedan: 'Sedan', suv: 'SUV', luxury: 'Luxury'};
export const TRANSMISSIONS = {manual: 'Manual', automatic: 'Automatic'};
export const PROTECTION = {fee: 49, cover: 10000};
export const HIRE_ORDER = ['hourly', 'daily', 'oneway', 'outstation', 'monthly'];
export const carType = c => `${BODIES[c?.body] || 'Hatchback'} ${c?.transmission || 'manual'}`;
export const bookedHours = r => ({hourly: Math.max(DRIVER_RATES.hourly.min, Number(r.duration) || 4), daily: 10 * (Number(r.duration) || 1), oneway: 6}[r.hireType] ?? null);
export const pros = s => s.driverPros || [];
export const proOf = (s, ws = 'personalDriver') => pros(s).find(p => p.ws === ws) || null;
const job = (s, id) => (s.serviceRequests || []).find(x => x.id === id && x.type === 'driver');
const mine = (s, ws, id) => { const r = job(s, id); return r && r.provider === ws ? r : null; };

// ---------- booking steps ----------
export const STEPS = ['Trip', 'Pickup', 'When', 'Car', 'Review'];
export const draftOf = s => (s.driverDraft ||= {step: 1, hireType: 'hourly', duration: 4, nights: 0, addressId: (s.savedAddresses || [])[0]?.id || 'new', date: '', startTime: '', car: {make: '', body: 'hatchback', transmission: 'manual', plate: ''}, protection: true, favouriteDriverId: ''});
export const TIMES = Array.from({length: 37}, (_, i) => `${String(5 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
export function timeError(date, time) {
  if (!date) return 'Choose the date.'; if (!TIMES.includes(time)) return 'Choose the start time.';
  const t = Date.parse(`${date}T${time}:00`); if (date < todayIso()) return 'That date has passed.';
  if (t < clock() + HOUR) return 'Start at least 1 hour from now.'; if (date > WIZ.addDays(todayIso(), 30)) return 'Book up to 30 days ahead.';
  return '';
}
export const openTimes = date => TIMES.filter(t => !timeError(date, t));
const PLATE = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4}$/i;
function pickupOf(s, d) { if (d.addressId && d.addressId !== 'new') return (s.savedAddresses || []).find(a => a.id === d.addressId) || null; const l = LOC.finalLocation(s, 'drv-pickup'); return l.error ? null : l; }
export function stepError(s, step) {
  const d = draftOf(s);
  if (step === 1) { if (!DRIVER_RATES[d.hireType]) return 'Choose how long you need the driver.'; if (d.hireType === 'hourly' && Number(d.duration) < DRIVER_RATES.hourly.min) return `Book at least ${DRIVER_RATES.hourly.min} hours.`; if (!(Number(d.duration) >= 1)) return 'Enter how many.'; if (['oneway', 'outstation'].includes(d.hireType)) { const l = LOC.finalLocation(s, 'drv-drop'); if (l.error) return `Drop: ${l.error}`; } return ''; }
  if (step === 2) { if (d.addressId && d.addressId !== 'new') return (s.savedAddresses || []).some(a => a.id === d.addressId) ? '' : 'Choose the pickup.'; return LOC.finalLocation(s, 'drv-pickup').error || ''; }
  if (step === 3) return timeError(d.date, d.startTime);
  if (step === 4) { const c = d.car || {}; if (String(c.make || '').trim().length < 2) return 'Write the car, e.g. Hyundai Creta.'; if (!BODIES[c.body]) return 'Choose the car type.'; if (!TRANSMISSIONS[c.transmission]) return 'Manual or automatic?'; if (c.plate && !PLATE.test(String(c.plate).trim())) return 'Number plate looks wrong (e.g. UP16 AB 1234).'; return ''; }
  return '';
}
export function quoteOf(s, d = draftOf(s)) {
  const q = quoteDriver({hireType: d.hireType, duration: d.duration, carType: carType(d.car), nights: d.nights});
  if (d.protection && d.hireType !== 'monthly') { q.feeLines = [...q.feeLines, [`Trip protection (car damage up to ${inr(PROTECTION.cover)})`, PROTECTION.fee]]; q.fee += PROTECTION.fee; q.total += PROTECTION.fee; q.components = [...q.partnerLines, ...q.feeLines]; }
  q.rateCard = [...q.rateCard, ...(d.hireType === 'monthly' ? [] : [['Final bill', 'Uses the actual start and end time; extra time and the night charge need your approval']])];
  return q;
}
// Hands over to the existing review & pay page.
export function toBookingDraft(s) {
  for (const n of [1, 2, 3, 4]) { const e = stepError(s, n); if (e) return {error: e, step: n}; }
  const d = draftOf(s), pickup = pickupOf(s, d), drop = ['oneway', 'outstation'].includes(d.hireType) ? LOC.finalLocation(s, 'drv-drop') : null, q = quoteOf(s, d);
  const car = {make: String(d.car.make).trim(), body: d.car.body, transmission: d.car.transmission, plate: String(d.car.plate || '').trim().toUpperCase()};
  return {draft: {service: 'driver', flow: 'steps', driverQuote: q, title: `Personal Driver · ${DRIVER_RATES[d.hireType].label} · ${car.make} (${TRANSMISSIONS[car.transmission].toLowerCase()})`, hireType: d.hireType, duration: Number(d.duration), nights: Number(d.nights) || 0,
    carType: carType(car), car, location: LOC.oneLine(pickup), pickup: {...pickup}, drop: drop ? {...drop} : null, date: d.date, startTime: d.startTime, protection: !!d.protection && d.hireType !== 'monthly', favouriteDriverId: d.favouriteDriverId || ''}};
}
// Called by booking-publish once the request exists.
export function afterCreate(s, r, d) {
  Object.assign(r, {flow: 'steps', kind: 'personal', title: d.title || r.title, car: d.car, pickup: d.pickup, drop: d.drop, startTime: d.startTime, nights: d.nights, protection: d.protection, favouriteDriverId: d.favouriteDriverId || null,
    startOtp: String(1000 + Math.floor(Math.random() * 9000)), timeline: [{at: stamp(), text: 'Booked'}], createdAtMs: clock()});
  r.urgent = Date.parse(`${r.date}T${r.startTime}:00`) - clock() <= 3 * HOUR;
  s.driverDraft = null; if (s.locDrafts) { delete s.locDrafts['drv-pickup']; delete s.locDrafts['drv-drop']; }
  if (r.hireType !== 'monthly') DD.start(s, r);
  return r;
}

const dateChips = d => { const t = todayIso(), opts = [[t, 'Today'], [WIZ.addDays(t, 1), 'Tomorrow'], [WIZ.addDays(t, 2), 'Day after']], known = opts.some(([v]) => v === d.date);
  const pretty = x => new Date(`${x}T12:00:00`).toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric', month: 'short'});
  return `<fieldset><legend>${d.hireType === 'monthly' ? 'Start date' : 'Date'}</legend><div class="chip-choices">${opts.map(([v, l]) => `<label class="choice-chip"><input type="radio" name="date" value="${v}" ${d.date === v ? 'checked' : ''} data-wiz-field><span><b>${l}</b><small>${pretty(v)}</small></span></label>`).join('')}<label class="choice-chip"><input type="radio" name="date" value="other" ${!known && d.date ? 'checked' : ''} data-wiz-field><span><b>Pick date</b><small>${!known && d.date ? pretty(d.date) : 'Up to 30 days'}</small></span></label></div>
  ${!known && d.date ? `<label class="wiz-date"><span>Choose the date</span><input type="date" name="dateOther" value="${esc(d.date)}" min="${t}" max="${WIZ.addDays(t, 30)}" data-wiz-field></label>` : ''}</fieldset>`; };
export function bookScreen(s) {
  const d = draftOf(s), step = Math.min(5, Math.max(1, d.step || 1)), saved = s.savedAddresses || [], pickup = pickupOf(s, d), q = quoteOf(s, d), r8 = DRIVER_RATES[d.hireType];
  const unit = {hourly: 'Hours', daily: 'Days (10 hours each)', oneway: 'Trips', outstation: 'Days away', monthly: 'Months'}[d.hireType];
  const sums = {1: `${r8.label} × ${d.duration}`, 2: pickup ? `📍 ${LOC.oneLine(pickup)}` : '', 3: d.date && d.startTime ? `🕑 ${d.date} · ${d.startTime}` : '', 4: d.car?.make ? `🚗 ${d.car.make} · ${BODIES[d.car.body]} · ${TRANSMISSIONS[d.car.transmission]}` : ''};
  let body = '';
  if (step === 1) body = `<div class="chip-choices drv-hire">${HIRE_ORDER.map(k => `<label class="choice-chip"><input type="radio" name="hireType" value="${k}" ${d.hireType === k ? 'checked' : ''} data-drv-hire><span><b>${esc(DRIVER_RATES[k].label)}</b><small>${inr(DRIVER_RATES[k].rate)}${k === 'hourly' ? '/h' : k === 'monthly' ? '/month' : ''}</small></span></label>`).join('')}</div>
    <div class="form-grid two"><label><span>${esc(unit)}</span><input type="number" name="duration" min="${d.hireType === 'hourly' ? DRIVER_RATES.hourly.min : 1}" value="${esc(d.duration)}" data-wiz-field></label>${d.hireType === 'outstation' ? `<label><span>Nights away</span><input type="number" name="nights" min="0" value="${esc(d.nights || 0)}" data-wiz-field></label>` : ''}</div>
    ${['oneway', 'outstation'].includes(d.hireType) ? LOC.pickerHtml(s, 'drv-drop', {title: d.hireType === 'oneway' ? 'Drop at' : 'Going to'}) : ''}
    ${d.hireType === 'monthly' ? '<div class="info-banner"><b>Monthly driver: you choose</b><span>8 hours × 26 days. You see 3 verified drivers near you, book a paid trial day, then choose. Attendance, leave and salary are handled in the app.</span></div>' : ''}`;
  if (step === 2) body = `<div class="hs-addresses">${saved.map(a => `<label class="hs-address"><input type="radio" name="addressId" value="${a.id}" ${d.addressId === a.id ? 'checked' : ''} data-wiz-field><span><b>${esc(a.label)}</b> ${LOC.labelChip(a)}<small>${esc(LOC.oneLine(a))}</small></span></label>`).join('')}<label class="hs-address"><input type="radio" name="addressId" value="new" ${d.addressId === 'new' || !saved.length ? 'checked' : ''} data-wiz-field><span><b>+ Another place</b></span></label></div>
    ${d.addressId === 'new' || !saved.length ? LOC.pickerHtml(s, 'drv-pickup', {title: 'Where is the car?'}) : ''}`;
  if (step === 3) { const open = d.date ? openTimes(d.date) : []; body = `${dateChips(d)}<label><span>${d.hireType === 'monthly' ? 'Daily start time' : 'Start time'}</span><select name="startTime" data-wiz-field><option value="">Choose</option>${open.map(t => `<option ${d.startTime === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>${d.date && !open.length ? '<p class="muted">No times left on this day. Choose another date.</p>' : ''}`; }
  if (step === 4) { const favs = (s.favouriteDriverPros || []).map(id => pros(s).find(p => p.id === id)).filter(Boolean);
    body = `<label><span>Car (make and model)</span><input name="make" value="${esc(d.car?.make || '')}" placeholder="e.g. Hyundai Creta"></label>
    <fieldset><legend>Type</legend><div class="chip-choices">${Object.entries(BODIES).map(([k, l]) => `<label class="choice-chip"><input type="radio" name="body" value="${k}" ${d.car?.body === k ? 'checked' : ''} data-wiz-field><span><b>${l}</b></span></label>`).join('')}</div></fieldset>
    <fieldset><legend>Gears</legend><div class="chip-choices">${Object.entries(TRANSMISSIONS).map(([k, l]) => `<label class="choice-chip"><input type="radio" name="transmission" value="${k}" ${d.car?.transmission === k ? 'checked' : ''} data-wiz-field><span><b>${l}</b></span></label>`).join('')}</div></fieldset>
    <label><span>Number plate (optional)</span><input name="plate" value="${esc(d.car?.plate || '')}" placeholder="UP16 AB 1234" autocapitalize="characters"></label>
    ${d.hireType === 'monthly' ? '' : `<label class="consent-row"><input type="checkbox" name="protection" ${d.protection ? 'checked' : ''} data-wiz-field> Trip protection ${inr(PROTECTION.fee)} — covers damage to your car up to ${inr(PROTECTION.cover)} during the trip</label>`}
    ${favs.length ? `<label><span>Ask my driver first</span><select name="favouriteDriverId"><option value="">Best-matched driver near me</option>${favs.map(p => `<option value="${p.id}" ${d.favouriteDriverId === p.id ? 'selected' : ''}>★ ${esc(p.name)}</option>`).join('')}</select></label>` : ''}`; }
  if (step === 5) body = `<section class="hs-review drv-review">${q.partnerLines.map(([a, b]) => `<p class="price-line"><span>${esc(a)}</span><b>${inr(b)}</b></p>`).join('')}${q.feeLines.map(([a, b]) => `<p class="price-line"><span>${esc(a)}</span><b>${inr(b)}</b></p>`).join('')}<p class="price-line total"><span>Estimate</span><b>${inr(q.total)}</b></p>
    <p>📍 ${pickup ? esc(LOC.oneLine(pickup)) : ''}${['oneway', 'outstation'].includes(d.hireType) ? ` → ${esc(LOC.oneLine(LOC.draftOf(s, 'drv-drop')))}` : ''}</p><p>🕑 ${esc(d.date)} · ${esc(d.startTime)} · 🚗 ${esc(d.car?.make)} (${esc(BODIES[d.car?.body])}, ${esc(TRANSMISSIONS[d.car?.transmission])})</p>
    ${d.favouriteDriverId ? `<p class="avail-chip">★ We ask ${esc(pros(s).find(p => p.id === d.favouriteDriverId)?.name || 'your driver')} first for 2 minutes.</p>` : ''}
    <details class="rate-card"><summary>If anything extra comes up</summary>${q.rateCard.map(([a, b]) => `<small class="block"><b>${esc(a)}:</b> ${esc(b)}</small>`).join('')}</details></section>`;
  return `${head('Hire a driver', 'A verified driver for your car — by the hour, day, trip or month.')}
  <form id="drv-book-form" class="panel form-panel narrow wiz" data-step="${step}">${WIZ.head(STEPS, step, sums)}
    <section class="wiz-step" data-drv-step="${step}"><h2>${esc(['How long do you need the driver?', 'Where is the car?', 'When should the driver come?', 'Which car?', 'Check the price'][step - 1])}</h2>${body}</section>
    <p class="field-error" id="drv-book-error" hidden></p>${WIZ.bar({total: q.total, totalNote: d.hireType === 'monthly' ? 'Monthly salary + MoveAI fee' : 'Estimate · final bill uses actual time', cur: step, next: step === 5 ? 'Continue to pay' : 'Next'})}</form>`;
}
function read(form, s, {pickers = true} = {}) {
  const d = draftOf(s), f = new FormData(form), has = n => form.querySelector(`[name="${n}"]`);
  if (has('hireType')) d.hireType = f.get('hireType') || d.hireType;
  if (has('duration')) d.duration = Number(f.get('duration')) || d.duration; if (has('nights')) d.nights = Number(f.get('nights')) || 0;
  if (has('addressId')) d.addressId = f.get('addressId') || d.addressId;
  if (has('date')) d.date = WIZ.readDate(f, d.date); if (has('startTime')) d.startTime = f.get('startTime') || '';
  if (has('make')) d.car = {make: f.get('make') || '', body: f.get('body') || d.car.body, transmission: f.get('transmission') || d.car.transmission, plate: f.get('plate') || ''};
  if (has('make') && has('protection')) d.protection = f.has('protection'); if (has('favouriteDriverId')) d.favouriteDriverId = f.get('favouriteDriverId') || '';
  if (pickers) for (const k of ['drv-pickup', 'drv-drop']) if (form.querySelector(`[data-loc-picker="${k}"]`)) LOC.readPicker(form, s, k);
}

// ---------- the driver's side ----------
export function offersFor(s, ws = 'personalDriver') { const p = proOf(s, ws); return p ? (s.serviceRequests || []).filter(r => r.type === 'driver' && r.flow === 'steps' && DD.offeredTo(r, p)) : []; }
export const jobsOf = (s, ws = 'personalDriver') => (s.serviceRequests || []).filter(r => r.type === 'driver' && r.provider === ws && (r.flow === 'steps' || r.hireType === 'monthly'));
const selfieToday = (s, ws) => s.workerStatus?.[ws]?.selfieDate === new Date().toISOString().slice(0, 10) || s.workerStatus?.[ws]?.selfieDate === todayIso();
export function acceptJob(s, ws, id) {
  const p = proOf(s, ws), r = job(s, id); if (!p) return 'Driver profile not found.';
  if (!selfieToday(s, ws)) return 'Take today\'s selfie check first — it confirms it is really you driving.';
  { const xb = TX.expiryBlock(s, ws); if (xb) return xb; }
  if (!r || r.status !== 'searching') return 'This job was given to another driver or cancelled.';
  if (!DD.offeredTo(r, p)) return r.dispatch?.responses?.[p.id] === 'accept' ? 'You accepted. If other drivers also accept, the best match gets it.' : 'This job is no longer offered to you.';
  const e = DD.respond(s, r, p, 'accept'); if (e) return e;
  if (r.status === 'accepted' && r.driverId !== p.id) return 'This job went to a closer or better-matched driver. No penalty — you are first in line for the next one.';
  return '';
}
export function declineJob(s, ws, id) { const p = proOf(s, ws), r = job(s, id); if (!p || !r) return 'Job not found.'; return DD.offeredTo(r, p) ? DD.respond(s, r, p, 'decline') : ''; }
export function cancelByDriver(s, ws, id, reason) { const p = proOf(s, ws), r = mine(s, ws, id); if (!p || !r) return 'Job not found.'; return DD.cancelByDriver(s, r, p, reason); }
export function onTheWay(s, ws, id) {
  const r = mine(s, ws, id); if (!r || r.status !== 'accepted') return 'Accept the job first.';
  r.status = 'on_the_way'; r.timeline.push({at: stamp(), text: 'On the way'});
  notify(s, r.customer, `${r.id}: ${r.providerName} is on the way. Share your start code ${r.startOtp} only at the car.`, r.id, 'serviceDetail'); return '';
}
const dest = r => LOC.point(r.pickup);
export const here = r => (r.track?.length ? [r.track.at(-1).lat, r.track.at(-1).lng] : null);
export const distLeft = r => { const a = here(r), b = dest(r); return a && b ? km(a, b) : null; };
export const etaOf = r => { const d = distLeft(r); return d == null ? null : Math.max(1, Math.round(roadKm(here(r), dest(r)) / 25 * 60)); };
export function shareLocation(s, ws, id, lat, lng, src = 'gps') {
  const r = mine(s, ws, id); if (!r || !['on_the_way', 'in_progress'].includes(r.status)) return 'Location is shared only during the job.';
  (r.track ||= []).push({lat, lng, at: Date.now(), src}); r.geo = {...(r.geo || {}), live: true, lastAt: Date.now()};
  const d = distLeft(r); if (d == null || r.status !== 'on_the_way') return '';
  if (d <= 0.6 && !r.geo.arrivingSent) { r.geo.arrivingSent = true; notify(s, r.customer, `${r.id}: ${r.providerName} is arriving in about 2 minutes.`, r.id, 'serviceDetail'); }
  if (d <= 0.1 && !r.arrivedAt) { r.arrivedAt = stamp(); r.timeline.push({at: stamp(), text: 'Reached the car (GPS)'}); notify(s, r.customer, `${r.id}: ${r.providerName} has reached. Check the car together, then share your start code ${r.startOtp}.`, r.id, 'serviceDetail'); }
  return '';
}
export function demoDrive(s, ws, id, stepKm = 1) {
  const r = mine(s, ws, id); if (!r || r.status !== 'on_the_way') return 'Tap "On the way" first.';
  const to = dest(r); if (!to) return 'No map point for the pickup. Call the customer.';
  const p = proOf(s, ws), from = here(r) || (p?.base && km(p.base, to) < 30 ? p.base : [to[0] + 0.03, to[1] + 0.03]);
  if (!r.track?.length) return shareLocation(s, ws, id, from[0], from[1], 'demo');
  const d = km(from, to); if (d < 0.02) return 'You are at the car.';
  const f = Math.min(1, stepKm / d); return shareLocation(s, ws, id, from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, 'demo');
}
export function startTrip(s, ws, id, {otp, photos = [], odometer}) {
  const r = mine(s, ws, id); if (!r || r.status !== 'on_the_way') return 'Tap "On the way" first.';
  const lab = LOC.LABELS[r.pickup?.precision] || LOC.LABELS.area;
  if (lab.arriveKm != null) { const d = distLeft(r); if (d == null) return 'Share your live location first so we can confirm you are at the car.'; if (d > lab.arriveKm) return `You are ${d.toFixed(1)} km from the car. Start when you reach it.`; }
  if (!photos.length) return 'Add photos of the car (all four sides) before you start.';
  const odo = Math.round(Number(odometer) || 0); if (odo <= 0) return 'Enter the odometer reading.';
  if (String(otp || '').trim() !== r.startOtp) { r.otpTries = (r.otpTries || 0) + 1; return r.otpTries >= 3 ? 'Wrong code 3 times. Ask the customer to open the code in their MoveAI app, or call support.' : 'That code is wrong. Ask the customer for the 4-digit start code.'; }
  Object.assign(r, {status: 'in_progress', startedAtMs: clock(), startedAt: stamp(), carBefore: {photos, odometer: odo, at: stamp()}}); r.timeline.push({at: stamp(), text: `Trip started · odometer ${odo} km · ${photos.length} car photo(s)`});
  notify(s, r.customer, `${r.id}: trip started at ${new Date(clock()).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'})}. Time is counted from now.`, r.id, 'serviceDetail'); return '';
}
export const elapsedHours = r => r.startedAtMs ? Math.max(0, ((r.endedAtMs || clock()) - r.startedAtMs) / HOUR) : 0;
export function demoHours(s, id, h) { const r = job(s, id); if (!r?.startedAtMs || r.endedAtMs) return 'Start the trip first.'; r.startedAtMs -= h * HOUR; return ''; }
const night = (a, b) => { for (let t = a; t <= b; t += 30 * 60000) { const h = new Date(t).getHours(); if (h >= 22 || h < 5) return true; } return false; };
export function endTrip(s, ws, id, {photos = [], odometer}) {
  const r = mine(s, ws, id); if (!r || r.status !== 'in_progress') return 'Start the trip first.';
  if (!photos.length) return 'Add photos of the car at the end of the trip.';
  const odo = Math.round(Number(odometer) || 0); if (odo < (r.carBefore?.odometer || 0)) return `The end reading must be at least ${r.carBefore.odometer} km.`;
  r.endedAtMs = clock(); r.carAfter = {photos, odometer: odo, at: stamp()}; r.kmDriven = odo - (r.carBefore?.odometer || odo);
  const actual = Math.round(elapsedHours(r) * 10) / 10, booked = bookedHours(r); r.actualHours = actual;
  if (booked != null && actual > booked + 0.25) Bill.proposeExtra(s, r, {kind: 'extra_hour', qty: Math.ceil(actual - booked), note: `Trip ran ${actual} h; ${booked} h were booked`}, r.providerName);
  if (r.hireType !== 'monthly' && night(r.startedAtMs, r.endedAtMs)) Bill.proposeExtra(s, r, {kind: 'night', qty: 1, note: 'Driving after 10 pm'}, r.providerName);
  r.status = 'provider_done'; r.doneAt = stamp(); r.timeline.push({at: stamp(), text: `Trip ended · ${actual} h · ${r.kmDriven} km`}); if (r.geo) r.geo.live = false;
  notify(s, r.customer, `${r.id}: trip ended after ${actual} h and ${r.kmDriven} km. Check the car photos, approve any extra time, then pay.`, r.id, 'serviceDetail'); return '';
}
export function addToll(s, ws, id, {amount, proof, note}) { const r = mine(s, ws, id); if (!r || r.status !== 'in_progress') return 'Add tolls during the trip.'; return Bill.proposeExtra(s, r, {kind: 'toll_parking', amount, proof, note}, r.providerName); }

// ---------- safety ----------
export function sos(s, who, id) {
  const r = job(s, id); if (!r) return 'Booking not found.';
  const name = who === 'customer' ? (r.customerName || 'Customer') : (r.providerName || 'Driver');
  const c = {id: uid('SOS'), kind: 'safety', subject: `SOS from ${name} (${who}) on ${r.id}`, raisedBy: name, status: 'open', severity: 'urgent', at: stamp(), ref: r.id, notes: `Last location: ${here(r) ? here(r).map(x => x.toFixed(4)).join(', ') : LOC.oneLine(r.pickup)}. Emergency contact called.`};
  (s.cases ||= []).unshift(c); r.timeline.push({at: stamp(), text: `🚨 SOS by the ${who}`});
  notify(s, 'admin', `🚨 ${c.subject}. Call both now.`, c.id, 'cases'); notify(s, who === 'customer' ? r.provider : r.customer, `${r.id}: SOS raised. MoveAI safety team is calling.`, r.id);
  return '';
}
export function shareTrip(s, id) { const r = job(s, id); if (!r) return ''; r.shareToken ||= Math.random().toString(36).slice(2, 10); return `https://moveai.in/t/${r.shareToken}`; }
export function longStop(s, id, minutes = 15) { const r = job(s, id); if (!r || r.status !== 'in_progress') return 'Only during a trip.'; r.rideCheck = {minutes, at: stamp(), status: 'open'}; notify(s, r.customer, `${r.id}: the car has not moved for ${minutes} min. Is everything OK?`, r.id, 'serviceDetail'); notify(s, r.provider, `${r.id}: the car has not moved for ${minutes} min. Is everything OK?`, r.id, 'driverTrip'); return ''; }
export function answerCheck(s, id, who, ok) { const r = job(s, id); if (!r?.rideCheck) return ''; r.rideCheck = {...r.rideCheck, status: ok ? 'ok' : 'help', by: who}; return ok ? '' : sos(s, who, id); }

// ---------- monthly driver ----------
export const PAID_LEAVES = 2;
const month = d => d.slice(0, 7);
export function monthlyOf(r) { return (r.monthly ||= {startDate: r.date, days: {}, leaves: [], extraHours: {}, salaries: [], notice: null}); }
export function checkIn(s, ws, id, date = todayIso()) {
  const r = mine(s, ws, id); if (!r || r.hireType !== 'monthly' || r.status !== 'accepted') return 'No monthly job to check in for.';
  const m = monthlyOf(r); if (date < m.startDate) return `The job starts on ${m.startDate}.`; if (m.notice && date > m.notice.endDate) return 'This job has ended.';
  if (m.days[date] === 'present') return 'Already checked in today.'; m.days[date] = 'present'; notify(s, r.customer, `${r.providerName} checked in for today.`, r.id, 'serviceDetail'); return '';
}
export function logExtraHours(s, ws, id, hours, date = todayIso()) { const r = mine(s, ws, id); if (!r || r.hireType !== 'monthly') return 'No monthly job.'; const h = Math.round(Number(hours) || 0); if (h < 1 || h > 8) return 'Enter 1 to 8 extra hours.'; const m = monthlyOf(r); m.extraHours[date] = {hours: h, status: 'requested'}; notify(s, r.customer, `${r.providerName} worked ${h} extra hour(s) on ${date}. Approve in the app.`, r.id, 'serviceDetail'); return ''; }
export function approveExtraHours(s, id, date) { const r = job(s, id), x = r && monthlyOf(r).extraHours[date]; if (!x || x.status !== 'requested') return 'Nothing to approve.'; x.status = 'approved'; return ''; }
export function requestLeave(s, ws, id, date, reason = '') {
  const r = mine(s, ws, id); if (!r || r.hireType !== 'monthly') return 'No monthly job.'; if (!date || date < todayIso()) return 'Choose a date from today.';
  const m = monthlyOf(r); if (m.leaves.some(l => l.date === date)) return 'Leave already asked for that day.';
  m.leaves.push({date, reason: String(reason).trim(), status: 'requested', at: stamp()}); notify(s, r.customer, `${r.providerName} asked for leave on ${date}${reason ? ` (${reason})` : ''}.`, r.id, 'serviceDetail'); return '';
}
export function decideLeave(s, id, date, ok) {
  const r = job(s, id), m = r && monthlyOf(r), l = m?.leaves.find(x => x.date === date && x.status === 'requested'); if (!l) return 'No leave request for that day.';
  l.status = ok ? 'approved' : 'declined'; if (ok) { const paidUsed = m.leaves.filter(x => x.status === 'approved' && month(x.date) === month(date) && x !== l && x.paid).length; l.paid = paidUsed < PAID_LEAVES; m.days[date] = 'leave'; }
  notify(s, r.provider, `${r.id}: leave on ${date} ${ok ? `approved${l.paid ? ' (paid)' : ' (unpaid)'}` : 'not approved'}.`, r.id, 'driverTrip'); return '';
}
export function salaryFor(r, ym) {
  const m = monthlyOf(r), rate = r.quote?.partnerTotal || DRIVER_RATES.monthly.rate, perDay = Math.round(rate / 26);
  const unpaid = m.leaves.filter(l => l.status === 'approved' && !l.paid && month(l.date) === ym).length;
  const extraH = Object.entries(m.extraHours).filter(([d, x]) => month(d) === ym && x.status === 'approved').reduce((a, [, x]) => a + x.hours, 0);
  const present = Object.entries(m.days).filter(([d, v]) => month(d) === ym && v === 'present').length, extraDays = Math.max(0, present - 26);
  const lines = [['Monthly salary', rate], ...(unpaid ? [[`Unpaid leave × ${unpaid}`, -unpaid * perDay]] : []), ...(extraH ? [[`Extra hours × ${extraH}`, extraH * DRIVER_RATE_CARD.monthlyExtraHour]] : []), ...(extraDays ? [[`Extra days × ${extraDays}`, extraDays * DRIVER_RATE_CARD.monthlyExtraDay]] : [])];
  return {lines, total: lines.reduce((a, [, v]) => a + v, 0), present, unpaid, extraH};
}
export function paySalary(s, id, ym) {
  const r = job(s, id); if (!r || r.hireType !== 'monthly' || !r.provider) return 'No monthly driver.';
  const m = monthlyOf(r); if (m.salaries.some(x => x.month === ym)) return `Salary for ${ym} is already paid.`;
  const sal = salaryFor(r, ym);
  record(s, {owner: 'personal', serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'customer_payment', purpose: 'salary', payer: 'personal', payee: r.provider, responsible: 'personal', amount: sal.total, method: 'upi', reference: `SAL-${r.id}-${ym}`, status: 'confirmed', note: `Driver salary ${ym}`});
  record(s, {owner: r.provider, serviceId: r.id, sourceType: 'service', sourceId: r.id, type: 'wallet_credit', payer: 'personal', payee: r.provider, responsible: 'personal', amount: sal.total, commission: 0, method: 'wallet', reference: `SALW-${r.id}-${ym}`, status: 'confirmed', note: `Salary ${ym} from ${r.customerName || 'customer'}`});
  m.salaries.push({month: ym, amount: sal.total, at: stamp()}); notify(s, r.provider, `${r.id}: salary for ${ym} paid — ${inr(sal.total)} in your wallet.`, r.id, 'money'); return '';
}
export function replacement(s, id, date) {
  const r = job(s, id); if (!r || r.hireType !== 'monthly' || !r.provider) return {error: 'No monthly driver.'};
  if (!date || date < todayIso()) return {error: 'Choose a date from today.'};
  const time = r.startTime || '09:00', pickup = r.pickup || {line: r.location, pincode: '201309', lat: 28.6268, lng: 77.3731, precision: 'approx', city: 'Noida'};
  const q = quoteDriver({hireType: 'daily', duration: 1, carType: r.carType});
  const n = {id: uid('SR'), customer: r.customer, customerName: r.customerName, type: 'driver', flow: 'steps', kind: 'personal', title: `Replacement driver · ${date} · ${r.carType}`, hireType: 'daily', duration: 1, carType: r.carType, car: r.car || {body: /suv/i.test(r.carType) ? 'suv' : 'hatchback', transmission: /automatic/i.test(r.carType) ? 'automatic' : 'manual', make: r.carType},
    location: r.location, pickup, date, startTime: time, quote: q, status: 'searching', provider: null, providerName: null, paid: false, rating: null, extras: [], startOtp: String(1000 + Math.floor(Math.random() * 9000)), timeline: [{at: stamp(), text: `Replacement for ${r.providerName} (${r.id})`}], replacementFor: r.id, createdAt: stamp(), createdAtMs: clock(), payMigrated: true};
  s.serviceRequests.unshift(n); DD.start(s, n); if (r.driverId) n.dispatch.offered.push(r.driverId);
  return {request: n};
}
export function giveNotice(s, id, by) {
  const r = job(s, id); if (!r || r.hireType !== 'monthly' || r.status !== 'accepted') return 'No active monthly job.';
  const m = monthlyOf(r); if (m.notice) return `Notice already given — last day ${m.notice.endDate}.`;
  m.notice = {by, at: stamp(), endDate: WIZ.addDays(todayIso(), 7)}; notify(s, by === 'customer' ? r.provider : r.customer, `${r.id}: 7 days' notice given by the ${by}. Last day ${m.notice.endDate}.`, r.id); return '';
}

// ---------- screens ----------
const STEPS_C = [['searching', 'Finding a driver'], ['accepted', 'Driver assigned'], ['on_the_way', 'On the way'], ['in_progress', 'Trip running'], ['provider_done', 'Trip ended'], ['paid', 'Paid'], ['closed', 'Rated']];
function driverCard(s, r) {
  const p = pros(s).find(x => x.id === r.driverId); if (!p) return '';
  const rt = DD.ratingOf(s, p), w = r.dispatch?.winner;
  return `<div class="hs-pro"><span class="avatar">${esc(p.name.split(' ').map(x => x[0]).join(''))}</span><span><b>${esc(p.name)}</b><small>★ ${rt.avg || 'New'}${rt.n ? ` (${rt.n})` : ''} · ${p.tripsDone || 0} trips · ✓ Licence + ID${p.policeVerified ? ' · ✓ Police verified' : ''}</small></span><span class="row-actions"><button class="button secondary compact" data-wx="call" data-name="${esc(p.name)}">📞 Call</button>${r.conversationId ? `<button class="button secondary compact" data-op="open-conversation" data-id="${r.conversationId}">Message</button>` : ''}</span></div>
  ${w ? `<details class="hs-why"><summary>Why ${esc(p.name.split(' ')[0])}?</summary><small>${esc([w.km != null ? `${w.km} km away` : '', rt.avg ? `★ ${rt.avg}` : 'new driver', !(DD.statsOf(p).cancels) ? 'no cancellations' : '', p.policeVerified ? 'police verified' : '', w.parts?.favourite ? 'your driver from last time' : ''].filter(Boolean).join(' · '))} · match score ${w.total}/100</small></details>` : ''}`;
}
const liveMap = r => { const a = here(r), b = dest(r); return a || b ? GeoMap.mapSvg([b && {at: b, icon: '🚗', label: 'Car'}, a && {at: a, icon: '🧑‍✈️', label: r.providerName, fill: '#0b6655'}].filter(Boolean), {path: (r.track || []).map(p => [p.lat, p.lng]), label: 'Live tracking map'}) : ''; };
const safetyRow = (r, who) => `<div class="row-actions drv-safety"><button type="button" class="button danger compact" data-drv="sos" data-who="${who}" data-id="${r.id}">🚨 SOS</button>${who === 'customer' ? `<button type="button" class="button secondary compact" data-drv="share" data-id="${r.id}">Share trip</button>` : ''}</div>`;
const checkBanner = (r, who) => r.rideCheck?.status === 'open' ? `<div class="action-warning" data-drv-check><b>The car has not moved for ${r.rideCheck.minutes} min. Is everything OK?</b><span class="row-actions"><button class="button primary compact" data-drv="check-ok" data-who="${who}" data-id="${r.id}">I'm OK</button><button class="button danger compact" data-drv="check-help" data-who="${who}" data-id="${r.id}">Get help</button></span></div>` : '';
export function searchingPanel(s, r) {
  const d = r.dispatch || {}, cur = d.current, fav = cur && r.favouriteDriverId && cur.ids.length === 1 && cur.ids[0] === r.favouriteDriverId ? pros(s).find(p => p.id === r.favouriteDriverId) : null;
  if (r.hireType === 'monthly') return `<div class="info-banner"><b>Monthly driver: choose who you want</b><span>See 3 verified drivers near you, call them and book a paid trial day before choosing.</span><button class="button primary" data-route="driverChoice">Choose your driver</button></div>`;
  const msg = d.exhausted ? '<b>No driver is free within 15 km right now.</b> Our team has been told and will call you. You can change the time or cancel for free.' : fav ? `We asked <b>${esc(fav.name)}</b> first. If he can't come in 2 minutes, the next best driver gets it.` : `We sent your trip to the ${cur?.ids.length > 1 ? `${cur.ids.length} best-matched` : 'best-matched'} verified drivers who can drive your car${d.radiusKm > 5 ? ` (within ${d.radiusKm} km)` : ''}. The closest, best-rated one who accepts gets it.`;
  return `<p data-drv-searching>${msg}</p>${cur ? `<button class="button text compact" data-drv="time-passes" data-id="${r.id}">Demo: 60 seconds pass</button>` : ''}`;
}
export function monthlyPanel(s, r, who = 'customer') {
  if (r.hireType !== 'monthly' || !['accepted'].includes(r.status) || !r.provider) return '';
  const m = monthlyOf(r), ym = todayIso().slice(0, 7), sal = salaryFor(r, ym), paid = m.salaries.find(x => x.month === ym);
  const pending = m.leaves.filter(l => l.status === 'requested'), extra = Object.entries(m.extraHours).filter(([, x]) => x.status === 'requested');
  const days = Object.entries(m.days).filter(([d]) => month(d) === ym).sort();
  return `<section class="panel" data-drv-monthly><h2>Monthly driver · ${esc(ym)}</h2><p class="muted">${sal.present} day(s) present · ${m.leaves.filter(l => l.status === 'approved' && month(l.date) === ym).length} leave · ${PAID_LEAVES} paid leaves a month${m.notice ? ` · notice given, last day ${esc(m.notice.endDate)}` : ''}</p>
  ${days.length ? `<div class="chip-row">${days.map(([d, v]) => `<span class="chip">${esc(d.slice(8))}: ${v === 'present' ? '✓' : 'leave'}</span>`).join('')}</div>` : ''}
  ${who === 'driver' ? `<div class="row-actions"><button class="button primary" data-drv="check-in" data-id="${r.id}" ${m.days[todayIso()] === 'present' ? 'disabled' : ''}>${m.days[todayIso()] === 'present' ? '✓ Checked in today' : "I'm here today"}</button></div>
    <details><summary class="button text compact">Ask for leave</summary><form class="inline-form" data-drv-leave="${r.id}"><input type="date" name="date" min="${todayIso()}" value="${WIZ.addDays(todayIso(), 2)}" aria-label="Leave date"><input name="reason" placeholder="Reason (optional)" aria-label="Reason"><button class="button secondary compact">Send</button></form></details>
    <details><summary class="button text compact">Worked extra hours?</summary><form class="inline-form" data-drv-extrah="${r.id}"><input type="number" name="hours" min="1" max="8" value="1" aria-label="Extra hours"><button class="button secondary compact">Send</button></form></details>`
    : `${pending.map(l => `<div class="extra-approve"><div><b>Leave on ${esc(l.date)}</b><small class="block muted">${esc(l.reason || 'No reason given')}</small></div><span class="row-actions"><button class="button primary compact" data-drv="leave-ok" data-id="${r.id}" data-date="${l.date}">Approve</button><button class="button secondary compact" data-drv="leave-no" data-id="${r.id}" data-date="${l.date}">Decline</button></span></div>`).join('')}
    ${extra.map(([d, x]) => `<div class="extra-approve"><div><b>${x.hours} extra hour(s) on ${esc(d)}</b><small class="block muted">${inr(x.hours * DRIVER_RATE_CARD.monthlyExtraHour)}</small></div><button class="button primary compact" data-drv="extrah-ok" data-id="${r.id}" data-date="${d}">Approve</button></div>`).join('')}
    <div class="drv-salary">${sal.lines.map(([a, b]) => `<p class="price-line"><span>${esc(a)}</span><b>${inr(b)}</b></p>`).join('')}<p class="price-line total"><span>Salary for ${esc(ym)}</span><b>${inr(sal.total)}</b></p>${paid ? `<p class="avail-chip">✓ Paid ${esc(paid.at)}</p>` : `<button class="button primary" data-drv="pay-salary" data-id="${r.id}" data-month="${ym}">Pay ${inr(sal.total)} through MoveAI</button>`}</div>
    <details><summary class="button text compact">Driver on leave? Get a replacement</summary><form class="inline-form" data-drv-replace="${r.id}"><input type="date" name="date" min="${todayIso()}" value="${WIZ.addDays(todayIso(), 1)}" aria-label="Date"><button class="button secondary compact">Find a replacement for the day</button></form></details>`}
  ${m.notice ? '' : `<button class="button text compact" data-drv="notice" data-who="${who}" data-id="${r.id}">Give 7 days' notice</button>`}</section>`;
}
export function customerScreen(s, r) {
  const cur = Math.max(0, STEPS_C.findIndex(([k]) => k === (r.status === 'completed' ? 'provider_done' : r.status)));
  let next = '';
  if (r.status === 'searching') next = searchingPanel(s, r);
  if (['accepted', 'on_the_way'].includes(r.status) && r.hireType !== 'monthly') next = `${r.status === 'on_the_way' ? `<section class="hs-live" data-drv-live><b>${r.arrivedAt ? `${esc(r.providerName)} has reached the car` : distLeft(r) != null ? `${esc(r.providerName)} is ${distLeft(r).toFixed(1)} km away · about ${etaOf(r)} min` : `${esc(r.providerName)} is on the way`}</b>${liveMap(r)}</section>` : `<p>${esc(r.providerName)} will come on ${esc(r.date)} at ${esc(r.startTime)}.</p>`}
    <div class="otp-share"><small>Start code · share at the car, after you check it together</small><b data-drv-otp>${esc(r.startOtp)}</b></div>${r.status === 'on_the_way' ? safetyRow(r, 'customer') : ''}`;
  if (r.status === 'in_progress') next = `${checkBanner(r, 'customer')}<p data-drv-running>Trip running for <b>${elapsedHours(r).toFixed(1)} h</b>${bookedHours(r) ? ` of ${bookedHours(r)} h booked` : ''}. Extra time is billed only after you approve it.</p>${liveMap(r)}${safetyRow(r, 'customer')}
    <button class="button text compact" data-drv="long-stop" data-id="${r.id}">Demo: car stopped 15 min</button>`;
  if (r.status === 'provider_done') next = `<p>Trip ended: <b>${esc(r.actualHours)} h · ${esc(r.kmDriven)} km</b>.</p><div class="drv-photos"><small class="block">Car before: ${esc((r.carBefore?.photos || []).join(', '))} · odometer ${esc(r.carBefore?.odometer)} km</small><small class="block">Car after: ${esc((r.carAfter?.photos || []).join(', '))} · odometer ${esc(r.carAfter?.odometer)} km</small></div>
    ${Bill.pendingExtras(r).length ? '<p class="muted">Approve or reject the extra time below, then confirm.</p>' : ''}<button class="button primary full" data-op="service-confirm" data-id="${r.id}">Confirm trip is done</button>`;
  if (r.status === 'completed' && !r.paid) next = '<p>Pay the driver through MoveAI.</p>';
  if (r.status === 'paid' && !r.rating) next = `<p>How was ${esc(r.providerName)}?</p><div class="rating" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="service-rating" value="${n}" ${n === 5 ? 'checked' : ''}><span>★</span></label>`).join('')}</div><input id="service-comment" class="text-field" placeholder="Anything to share? (optional)"><button class="button primary full" data-op="service-rate" data-id="${r.id}">Rate and close</button>`;
  if (r.status === 'closed') next = `<div class="info-banner"><b>Closed${r.rating ? ` · rated ${'★'.repeat(r.rating)}` : ''}</b><span>${esc(r.comment || 'Thank you.')}</span></div>`;
  const again = ['paid', 'closed'].includes(r.status) && r.driverId && r.hireType !== 'monthly' ? `<button class="button secondary full" data-drv="again" data-id="${r.id}">★ Book ${esc((r.providerName || '').split(' ')[0])} again</button>` : '';
  return `${head(r.title, `${r.id} · ${r.date} ${r.startTime || ''} · ${LOC.oneLine(r.pickup)}${r.drop ? ` → ${LOC.oneLine(r.drop)}` : ''}`, r.conversationId && r.provider ? `<button class="button secondary" data-op="open-conversation" data-id="${r.conversationId}">Message</button>` : '')}
  <div class="grid two"><section class="panel"><h2>Progress</h2><ol class="milestones">${STEPS_C.map(([k, l], i) => `<li class="ms ${i < cur || (i === cur && ['closed'].includes(k)) ? 'done' : i === cur ? 'current' : ''}"><i></i><span><b>${esc(l)}</b></span></li>`).join('')}</ol><details><summary class="button text compact">What happened when</summary>${(r.timeline || []).map(t => `<small class="block">${esc(t.at)} · ${esc(t.text)}</small>`).join('')}</details></section>
  <section class="panel" data-drv-next><h2>Your next step</h2>${driverCard(s, r)}${next}${again}${r.protection ? `<small class="muted block">🛡 Trip protection: car damage up to ${inr(PROTECTION.cover)} covered during this trip.</small>` : ''}</section></div>${monthlyPanel(s, r, 'customer')}`;
}
export function offersPanel(s, ws = 'personalDriver') {
  const p = proOf(s, ws); if (!p) return ''; const list = offersFor(s, ws), mineJobs = jobsOf(s, ws).filter(r => !['closed', 'cancelled'].includes(r.status));
  const selfie = selfieToday(s, ws);
  return `<section class="panel attention" data-drv-offers><h2>New trips for you (${list.length})</h2>${selfie ? '' : '<div class="action-warning"><b>Take today\'s selfie first</b><span>It confirms it is really you driving. You can\'t accept trips until it is done.</span><button class="button primary compact" data-route="dailySelfie">Take selfie</button></div>'}
  ${list.map(r => `<article class="market-row drv-offer" data-drv-offer="${r.id}"><span class="market-icon">🧑‍✈️</span><span><b>${esc(r.title)}</b><small>${esc(r.date)} ${esc(r.startTime)} · ${esc(r.pickup?.village || r.pickup?.city || '')} · ${esc(BODIES[r.car?.body] || '')} ${esc(r.car?.transmission || '')} · You earn ${inr(r.quote?.driverEarning)}</small><small class="muted">If more drivers accept, the closest best-rated one gets it — no penalty.</small></span><span class="row-actions"><button class="button secondary compact" data-drv="decline" data-id="${r.id}">Not for me</button><button class="button primary compact" data-drv="accept" data-id="${r.id}">Accept</button></span></article>`).join('') || '<p class="muted">No new trips right now.</p>'}
  ${mineJobs.length ? `<h3>My trips</h3>${mineJobs.map(r => `<article class="market-row"><span class="market-icon">🚗</span><span><b>${esc(r.title)}</b><small>${esc(r.id)} · ${esc(r.date)} ${esc(r.startTime || '')} · ${esc(String(r.status).replace(/_/g, ' '))}</small></span><button class="button primary compact" data-drv="open" data-id="${r.id}">Open</button></article>`).join('')}` : ''}</section>`;
}
export function driverTripScreen(s) {
  const ws = s.currentWorkspace, r = jobsOf(s, ws).find(x => x.id === s.selectedServiceId) || jobsOf(s, ws)[0];
  if (!r) return `${head('Trip', 'No trip selected.')}<button class="button primary" data-route="myJobs">My bookings</button>`;
  if (r.hireType === 'monthly') return `${head(r.title, `${r.id} · ${r.customerName || 'Customer'} · ${r.location}`)}${monthlyPanel(s, r, 'driver')}`;
  const lab = LOC.LABELS[r.pickup?.precision] || LOC.LABELS.area, files = n => `<input type="file" name="${n}" accept="image/*" capture="environment" multiple>`;
  let act = '';
  if (r.status === 'accepted') act = `<a class="button secondary" target="_blank" rel="noopener" data-drv-nav href="${esc(LOC.navUrl(r.pickup, 'two-wheeler'))}">🧭 Navigate to the car</a><button class="button primary full" data-drv="on-the-way" data-id="${r.id}">On the way</button>`;
  if (r.status === 'on_the_way') act = `<a class="button secondary" target="_blank" rel="noopener" data-drv-nav href="${esc(LOC.navUrl(r.pickup, 'two-wheeler'))}">🧭 Navigate to the car</a>
    <div class="hs-live"><b>${r.geo?.live ? '● Sharing your location' : 'Location not shared yet'}</b>${distLeft(r) != null ? ` · ${distLeft(r).toFixed(1)} km to go` : ''}${r.arrivedAt ? '<p class="avail-chip">✓ At the car — check it with the customer</p>' : ''}<div class="row-actions"><button type="button" class="button text compact" data-drv="drive" data-id="${r.id}">Demo: drive 1 km</button></div></div>
    <form class="form-grid two" data-drv-start="${r.id}"><label class="wide"><span>Photos of the car — all four sides</span>${files('photos')}</label><label><span>Odometer (km)</span><input type="number" name="odometer" min="1"></label><label><span>Customer's start code</span><input name="otp" inputmode="numeric" maxlength="4" autocomplete="off"></label><button class="button primary">Start trip</button></form>${safetyRow(r, 'driver')}`;
  if (r.status === 'in_progress') act = `${checkBanner(r, 'driver')}<p data-drv-running>Trip running <b>${elapsedHours(r).toFixed(1)} h</b>${bookedHours(r) ? ` of ${bookedHours(r)} h booked` : ''}.</p>${r.drop ? `<a class="button secondary" target="_blank" rel="noopener" href="${esc(LOC.navUrl(r.drop, 'driving'))}">🧭 Navigate to the drop</a>` : ''}
    <button type="button" class="button text compact" data-drv="hours" data-id="${r.id}">Demo: 5 hours pass</button>
    <details><summary class="button secondary compact">Paid a toll or parking?</summary><form class="inline-form" data-drv-toll="${r.id}"><input type="number" name="amount" min="1" placeholder="₹" aria-label="Amount"><input type="file" name="proof" accept="image/*" aria-label="Slip photo"><button class="button secondary compact">Send to customer</button></form></details>
    <form class="form-grid two" data-drv-end="${r.id}"><label class="wide"><span>Photos of the car at the end</span>${files('photos')}</label><label><span>Odometer (km)</span><input type="number" name="odometer" min="1"></label><button class="button primary">End trip</button></form>${safetyRow(r, 'driver')}`;
  if (['provider_done', 'completed'].includes(r.status)) act = `<p class="muted">Trip ended · ${esc(r.actualHours)} h · ${esc(r.kmDriven)} km. Waiting for the customer to confirm and pay.</p>`;
  if (r.paid) act = '<p class="avail-chip">✓ Paid — the money is in your wallet.</p>';
  const cancel = ['accepted', 'on_the_way'].includes(r.status) ? `<details class="cancel-box"><summary class="button text compact">Can't make it?</summary><form class="inline-form" data-drv-cancel="${r.id}"><input name="reason" placeholder="e.g. unwell" aria-label="Reason"><button class="button secondary compact">Give the trip back</button></form><small class="muted">The next-best driver gets it at once. Cancelling lowers your reliability.</small></details>` : '';
  return `${head(r.title, `${r.id} · ${r.date} ${r.startTime}`, r.conversationId ? `<button class="button secondary" data-op="open-conversation" data-id="${r.conversationId}">Customer chat</button>` : '')}
  <div class="grid two"><section class="panel"><p><b>${esc(r.customerName || 'Customer')}</b> ${LOC.labelChip(r.pickup)}<small class="block">${esc(LOC.oneLine(r.pickup))}</small>${r.pickup?.landmark ? `<span class="hs-landmark">📌 ${esc(r.pickup.landmark)}</span>` : ''}${r.drop ? `<small class="block">Drop: ${esc(LOC.oneLine(r.drop))}</small>` : ''}</p>
  <p>🚗 ${esc(r.car?.make)} · ${esc(BODIES[r.car?.body])} · ${esc(TRANSMISSIONS[r.car?.transmission])}${r.car?.plate ? ` · ${esc(r.car.plate)}` : ''}</p><button class="button text compact" data-wx="call" data-name="${esc(r.customerName || 'Customer')}">📞 Call customer via MoveAI</button>
  <p id="drv-error" class="field-error" hidden></p>${act}${cancel}</section>${Bill.partnerEarnings(s, r, 'driver')}</div>`;
}

// ---------- admin ----------
export function adminScreen(s) {
  const rows = (s.serviceRequests || []).filter(r => r.type === 'driver' && r.flow === 'steps');
  return `${head('Drivers', 'Personal-driver trips, drivers and their documents.')}
  <section class="panel"><div class="table-wrap"><table class="price-table"><thead><tr><th>Trip</th><th>When</th><th>Status</th><th>Driver</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.id)}</b><small class="block">${esc(r.title)}</small></td><td>${esc(r.date)} ${esc(r.startTime)}</td><td>${esc(String(r.status).replace(/_/g, ' '))}${r.dispatch?.exhausted ? '<small class="block field-error">No eligible driver within 15 km</small>' : ''}</td><td>${esc(r.providerName || '—')}${r.dispatch?.winner ? `<small class="block muted">score ${r.dispatch.winner.total}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">No trips yet.</td></tr>'}</tbody></table></div></section>
  <section class="panel"><div class="table-wrap"><table class="price-table" data-drv-pros><thead><tr><th>Driver</th><th>Cars</th><th>Area</th><th>Rating</th><th>Cancels</th><th></th></tr></thead><tbody>${[...pros(s), ...(s.ownerDrivers || [])].map(p => `<tr><td><b>${esc(p.name)}</b><small class="block">${p.policeVerified ? '✓ Police' : 'Police pending'}${p.docsExpired ? ' · <span class="field-error">documents expired</span>' : ''}</small></td><td>${esc(p.vehicleId ? `Own ${p.vehicleId} · ${p.plate || ''}` : `${(p.transmissions || []).join(' + ')} · ${(p.bodies || []).join(', ')}`)}</td><td>${esc(p.city || '')} · ${p.radiusKm || 10} km</td><td>★ ${DD.ratingOf(s, p).avg || 'New'}</td><td>${DD.statsOf(p).cancels || 0}</td><td><button class="button ${p.active === false ? 'primary' : 'secondary'} compact" data-drv-pause="${p.id}">${p.active === false ? 'Resume' : 'Pause'}</button></td></tr>`).join('')}</tbody></table></div></section>`;
}
export const ROUTES = {driverBook: bookScreen, driverTrip: driverTripScreen, driversAdmin: adminScreen};

// ---------- bindings ----------
const names = (f, n) => [...(f.querySelector(`[name="${n}"]`)?.files || [])].map(x => x.name);
export function bind(root, api) {
  const S = () => api.getState(), ws = () => S().currentWorkspace;
  const err = m => { const e = root.querySelector('#drv-error') || root.querySelector('#drv-book-error'); if (e) { e.textContent = m; e.hidden = !m; e.scrollIntoView?.({block: 'center'}); } else api.toast(m); };
  const form = root.querySelector('#drv-book-form');
  if (form) {
    const redraw = () => { api.save(); api.render(); };
    LOC.bind(form, api, {onChange: () => { read(form, S(), {pickers: false}); redraw(); }});
    form.querySelectorAll('[data-drv-hire]').forEach(x => x.onchange = () => { read(form, S()); const d = draftOf(S()); d.duration = d.hireType === 'hourly' ? Math.max(4, d.duration) : 1; redraw(); });
    form.querySelectorAll('[data-wiz-field]').forEach(x => x.addEventListener('change', () => { read(form, S()); redraw(); }));
    form.querySelectorAll('[data-wiz-go]').forEach(b => b.onclick = () => { read(form, S()); draftOf(S()).step = Number(b.dataset.wizGo); redraw(); });
    form.querySelector('[data-wiz="back"]')?.addEventListener('click', () => { read(form, S()); const d = draftOf(S()); d.step = Math.max(1, (d.step || 1) - 1); redraw(); });
    form.onsubmit = e => { e.preventDefault(); const s = S(); read(form, s); const d = draftOf(s), step = d.step || 1;
      const se = stepError(s, step); if (se) return err(se);
      if (step < 5) { d.step = step + 1; if (d.step === 3 && !d.date) d.date = openTimes(todayIso()).length ? todayIso() : WIZ.addDays(todayIso(), 1); return redraw(); }
      const r = toBookingDraft(s); if (r.error) { d.step = r.step; redraw(); return api.toast(r.error); }
      s.bookingDraft = r.draft; api.save(); api.navigate('bookingReview'); };
  }
  const act = {
    accept: id => acceptJob(S(), ws(), id), decline: id => declineJob(S(), ws(), id), 'on-the-way': id => onTheWay(S(), ws(), id), drive: id => demoDrive(S(), ws(), id, 1),
    hours: id => demoHours(S(), id, 5), 'time-passes': id => DD.timePasses(S(), job(S(), id)), sos: (id, b) => sos(S(), b.dataset.who, id), 'long-stop': id => longStop(S(), id),
    'check-ok': (id, b) => answerCheck(S(), id, b.dataset.who, true), 'check-help': (id, b) => answerCheck(S(), id, b.dataset.who, false),
    'check-in': id => checkIn(S(), ws(), id), 'leave-ok': (id, b) => decideLeave(S(), id, b.dataset.date, true), 'leave-no': (id, b) => decideLeave(S(), id, b.dataset.date, false),
    'extrah-ok': (id, b) => approveExtraHours(S(), id, b.dataset.date), 'pay-salary': (id, b) => paySalary(S(), id, b.dataset.month), notice: (id, b) => giveNotice(S(), id, b.dataset.who),
  };
  const ok = {accept: 'Trip accepted. The customer has been told.', decline: 'Hidden from your list', 'on-the-way': 'Customer told you are on the way', drive: 'Moved 1 km (demo)', hours: '5 hours passed (demo)', 'time-passes': '60 seconds passed (demo)', sos: 'SOS sent — MoveAI safety team is calling', 'long-stop': 'Long stop detected (demo)', 'check-ok': 'Thanks — glad you are OK', 'check-help': 'Help is on the way', 'check-in': 'Checked in for today', 'leave-ok': 'Leave approved', 'leave-no': 'Leave declined', 'extrah-ok': 'Extra hours approved', 'pay-salary': 'Salary paid through MoveAI', notice: 'Notice given — 7 days'};
  root.querySelectorAll('[data-drv]').forEach(b => b.onclick = () => {
    const k = b.dataset.drv, id = b.dataset.id, s = S();
    if (k === 'open') { s.selectedServiceId = id; api.save(); return api.navigate('driverTrip'); }
    if (k === 'share') { const url = shareTrip(s, id); try { navigator.clipboard?.writeText(url); } catch {} api.save(); return api.toast(`Trip link copied: ${url}`); }
    if (k === 'again') { const r = job(s, id), a = (s.savedAddresses || []).find(x => x.line === r.pickup?.line); s.driverDraft = {step: 1, hireType: r.hireType, duration: r.duration, nights: r.nights || 0, addressId: a?.id || 'new', date: '', startTime: '', car: {...(r.car || {})}, protection: !!r.protection, favouriteDriverId: r.driverId}; (s.favouriteDriverPros ||= []).includes(r.driverId) || s.favouriteDriverPros.push(r.driverId); api.save(); return api.navigate('driverBook'); }
    const e = act[k]?.(id, b); if (e) return err(e);
    if (k === 'accept') { const r = job(s, id); api.save(); if (r?.provider === ws()) { s.selectedServiceId = id; api.navigate('driverTrip'); } else api.render(); return api.toast(r?.provider === ws() ? ok.accept : 'Accepted. If other drivers also accept, the best match gets it.'); }
    api.save(); api.render(); api.toast(ok[k] || 'Done');
  });
  const f = (sel, fn, msg, after) => root.querySelectorAll(sel).forEach(x => x.onsubmit = e => { e.preventDefault(); const r = fn(x, new FormData(x)); const m = typeof r === 'string' ? r : r?.error; if (m) return err(m); api.save(); if (after) after(r); else api.render(); api.toast(msg); });
  f('[data-drv-start]', (x, d) => startTrip(S(), ws(), x.dataset.drvStart, {otp: d.get('otp'), photos: names(x, 'photos'), odometer: d.get('odometer')}), 'Trip started — time is counted from now');
  f('[data-drv-end]', (x, d) => endTrip(S(), ws(), x.dataset.drvEnd, {photos: names(x, 'photos'), odometer: d.get('odometer')}), 'Trip ended — the customer checks and pays');
  f('[data-drv-toll]', (x, d) => addToll(S(), ws(), x.dataset.drvToll, {amount: d.get('amount'), proof: names(x, 'proof')[0] || ''}), 'Sent to the customer for approval');
  f('[data-drv-cancel]', (x, d) => cancelByDriver(S(), ws(), x.dataset.drvCancel, d.get('reason')), 'Trip handed to the next driver', () => api.navigate('myJobs'));
  f('[data-drv-leave]', (x, d) => requestLeave(S(), ws(), x.dataset.drvLeave, d.get('date'), d.get('reason')), 'Leave request sent');
  f('[data-drv-extrah]', (x, d) => logExtraHours(S(), ws(), x.dataset.drvExtrah, d.get('hours')), 'Sent to the customer');
  f('[data-drv-replace]', (x, d) => replacement(S(), x.dataset.drvReplace, d.get('date')), 'Finding a replacement driver for that day', r => { S().selectedServiceId = r.request.id; api.navigate('serviceDetail'); });
  root.querySelectorAll('[data-drv-pause]').forEach(b => b.onclick = () => { const s = S(), p = [...pros(s), ...(s.ownerDrivers || [])].find(x => x.id === b.dataset.drvPause); p.active = p.active === false; api.save(); api.render(); api.toast(p.active === false ? `${p.name} paused` : `${p.name} can get jobs again`); });
}
export const tick = s => DD.tick(s);
