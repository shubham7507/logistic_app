// MoveAI One — home services (electrician, plumber, carpenter, cleaning, painting), Urban Company style.
//
// Customer: trade → specific jobs with fixed prices → address → date + 2-hour slot → book (pay after).
//   Painting is "free inspection, then a quote". The customer sees the pro (name, rating, ID verified),
//   calls / chats through MoveAI, shares a start code at the door, approves any extra, confirms, pays,
//   rates, and gets a 30-day re-work promise.
// Home-service pro (MoveAI Partner, workspace "homePro"): new jobs near them → accept / decline →
//   On the way → start with the customer's code → extras or inspection quote → before/after photos →
//   mark done → earnings after MoveAI's commission.
// Pure state functions are exported for unit tests; screens return HTML; bind() wires the buttons.
import {clock, partnerBlocked, wallet, walletPanel} from './pay.js';
import * as Bill from './customer-billing.js';
import * as LOC from './location.js';
import * as WIZ from './wizard.js';
import {km, roadKm} from './geo.js';
import * as GeoMap from './geo.js';
import * as D from './hs-dispatch.js';
import * as P from './hs-parts.js';
export {D as Dispatch, P as Parts};

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const iso = d => new Date(d).toISOString().slice(0, 10);
export const todayIso = () => iso(clock());
const addDays = (date, n) => iso(new Date(`${date}T12:00:00`).getTime() + n * 86400000);
const head = (title, text, action = '') => `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
const notify = (s, to, text, ref, route) => { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, route, at: stamp(), read: false}); };

// ---------- catalogue ----------
export const CATS = {
  electrician: {label: 'Electrician', icon: '💡', items: [['fan', 'Ceiling fan install or repair', 249], ['switch', 'Switch or socket repair', 99], ['light', 'Light or tube fitting', 129], ['mcb', 'MCB / fuse trips', 199], ['inverter', 'Inverter connection', 399], ['wiring', 'Wiring check (per room)', 349]]},
  plumber: {label: 'Plumber', icon: '🚰', items: [['tap', 'Tap leak or replace', 149], ['flush', 'Flush tank repair', 249], ['block', 'Sink or drain blockage', 299], ['pipe', 'Pipe leak repair', 349], ['geyser', 'Geyser install', 499], ['motor', 'Water motor check', 399]]},
  carpenter: {label: 'Carpenter', icon: '🪚', items: [['hinge', 'Door or cupboard hinge', 179], ['lock', 'Lock or handle fitting', 199], ['curtain', 'Curtain rod fitting', 199], ['shelf', 'Wall shelf fitting', 249], ['bed', 'Bed or furniture repair', 399]]},
  cleaning: {label: 'Home cleaning', icon: '🧽', items: [['1bhk', 'Full home deep clean · 1 BHK', 1799], ['2bhk', 'Full home deep clean · 2 BHK', 2499], ['3bhk', 'Full home deep clean · 3 BHK', 3299], ['bath', 'Bathroom deep clean (each)', 449], ['kitchen', 'Kitchen deep clean', 899], ['sofa', 'Sofa cleaning (per seat)', 199]]},
  painting: {label: 'Painting', icon: '🎨', inspection: true, items: [['inspect', 'Free inspection and quote', 0]]},
};
export const MIN_ORDER = 199;          // small jobs are charged at least this (covers the visit)
export const NO_WORK_CHARGE = 199;     // visit charge if no work is possible
export const WARRANTY_DAYS = 30;
export const EXTRA_HOUR = 250;
export const SLOTS = [['08', '8–10 AM'], ['10', '10 AM–12 PM'], ['12', '12–2 PM'], ['14', '2–4 PM'], ['16', '4–6 PM'], ['18', '6–8 PM']];
export const slotLabel = k => (SLOTS.find(([x]) => x === k) || [])[1] || k;
const itemOf = (cat, id) => (CATS[cat]?.items || []).find(([k]) => k === id);

export function quoteFor(cat, items = []) {
  const c = CATS[cat]; if (!c) return null;
  const lines = items.map(({id, qty}) => { const it = itemOf(cat, id); return it ? [`${it[1]}${qty > 1 ? ` × ${qty}` : ''}`, it[2] * qty] : null; }).filter(Boolean);
  let total = lines.reduce((a, [, x]) => a + x, 0);
  if (!c.inspection && total < MIN_ORDER) { lines.push(['Minimum visit charge top-up', MIN_ORDER - total]); total = MIN_ORDER; }
  return {kind: 'general', partnerLines: lines, partnerTotal: total, gst: 0, feeLines: [], fee: 0, components: lines, total,
    rateCard: c.inspection ? [['Inspection', 'Free — you get a written quote to approve'], ['If you decline the quote', 'Nothing to pay']]
      : [['Extra labour', `₹${EXTRA_HOUR} per hour — you approve in the app`], ['Spare parts', 'At shop price, with a photo of the bill'], ['If no work is possible', `Visit charge ₹${NO_WORK_CHARGE} only`], ['Re-work', `Free if the same problem comes back within ${WARRANTY_DAYS} days`]]};
}

// Slots: today (if the slot starts at least 1 hour from now) up to 14 days ahead.
export function slotError(date, slot) {
  if (!date) return 'Choose a date.';
  if (!SLOTS.some(([k]) => k === slot)) return 'Choose a time slot.';
  const today = todayIso();
  if (date < today) return 'That date has passed. Choose today or a later date.';
  if (date > addDays(today, 14)) return 'Book up to 14 days ahead.';
  if (date === today && new Date(`${date}T${slot}:00:00`).getTime() < clock() + 3600000) return 'That slot is too soon. Choose a slot at least 1 hour from now.';
  return '';
}
export const freeSlots = date => SLOTS.filter(([k]) => !slotError(date, k));

// ---------- people ----------
export const pros = s => s.homePros || [];
export const proOf = (s, ws = 'homePro') => pros(s).find(p => p.ws === ws) || null;
export const proById = (s, id) => pros(s).find(p => p.id === id) || null;
export function proRating(s, p) {
  const rs = (s.serviceRequests || []).filter(r => r.proId === p.id && r.rating);
  const n = (p.ratingCount || 0) + rs.length;
  return n ? {avg: Math.round((((p.rating || 0) * (p.ratingCount || 0)) + rs.reduce((a, r) => a + r.rating, 0)) / n * 10) / 10, n} : {avg: 0, n: 0};
}
export const addresses = s => (s.savedAddresses ||= []);
const areaOf = a => String(a?.area || a?.line || '').split(',').slice(-2).join(',').trim() || a?.city || '';

// ---------- booking ----------
export function validateBooking(s, v) {
  const c = CATS[v.category]; if (!c) return 'Choose a service.';
  const items = (v.items || []).filter(x => itemOf(v.category, x.id) && x.qty > 0);
  if (!c.inspection && !items.length) return 'Choose at least one job.';
  if (c.inspection && String(v.description || '').trim().length < 5) return 'Tell us what needs painting (rooms, walls or area) so the pro can plan the inspection.';
  if (v.addressId) { if (!addresses(s).find(x => x.id === v.addressId)) return 'Choose an address.'; }
  else { const loc = v.address?.precision ? v.address : LOC.makeLocation(v.address || {}); if (loc.error) return loc.error; }
  return slotError(v.date, v.slot);
}
export function createBooking(s, v, {pricing = null} = {}) {
  const err = validateBooking(s, v); if (err) return {error: err};
  const c = CATS[v.category];
  let address = v.addressId ? addresses(s).find(x => x.id === v.addressId) : (v.address.precision ? {...v.address} : LOC.makeLocation(v.address));
  if (!v.addressId && v.saveAddress) { address = {...address, id: uid('AD'), label: v.address.name || v.address.label || 'Home'}; addresses(s).push(address); }
  const items = c.inspection ? [{id: 'inspect', qty: 1}] : v.items.filter(x => itemOf(v.category, x.id) && x.qty > 0).map(x => ({id: x.id, qty: Math.min(10, Number(x.qty) || 1)}));
  const first = itemOf(v.category, items[0].id)[1];
  const id = uid('SR');
  const r = {id, customer: 'personal', customerName: s.person?.name || 'Customer', type: 'general', category: v.category, title: `${c.label} · ${first}${items.length > 1 ? ` + ${items.length - 1} more` : ''}`,
    items, inspection: !!c.inspection, description: String(v.description || '').trim(), photo: v.photo || '', address: {label: address.label || 'Home', line: address.line, pincode: address.pincode, city: address.city || '', village: address.village || '', landmark: address.landmark || '', postOffice: address.postOffice || '', voiceNote: address.voiceNote || '', lat: address.lat ?? null, lng: address.lng ?? null, accuracy: address.accuracy ?? null, source: address.source || 'landmark', precision: address.precision || LOC.labelFor(address.source, address.accuracy), digipin: address.digipin || (address.lat ? LOC.digipin(address.lat, address.lng) : '')},
    date: v.date, slot: v.slot, quote: quoteFor(v.category, items), pricing, status: 'searching', provider: null, providerName: null, proId: null, paid: false, rating: null, extras: [],
    startOtp: String(1000 + Math.floor(Math.random() * 9000)), createdAt: stamp(), createdAtMs: clock(), timeline: [{at: stamp(), text: 'Booked'}], conversationId: null, payMigrated: true};
  const startMs = new Date(`${v.date}T${v.slot}:00:00`).getTime();
  r.urgent = !!v.urgent || (v.date === todayIso() && startMs - clock() <= 3 * 3600000);
  if (v.favouriteProId && proById(s, v.favouriteProId)) r.favouriteProId = v.favouriteProId;
  s.serviceRequests.unshift(r); s.selectedServiceId = id;
  D.start(s, r);
  return {request: r, notified: r.status === 'accepted' ? 1 : (r.dispatch.current?.ids.length || 0), favourite: r.dispatch.round === 1 && !!r.favouriteProId && r.dispatch.current?.ids[0] === r.favouriteProId};
}
export const earningOf = (s, r) => { const rate = r.pricing?.commission ?? 0.15; const base = (r.quote?.total || 0) + Bill.extrasTotal(r); return Math.round(base - base * rate); };

// Customer can change the slot until the pro is on the way; cancelling uses MoveAI Pay's rules.
export function reschedule(s, id, date, slot) {
  const r = s.serviceRequests.find(x => x.id === id); if (!r) return 'Booking not found.';
  if (!['searching', 'accepted'].includes(r.status)) return 'The pro is already on the way. Call them through MoveAI instead.';
  const e = slotError(date, slot); if (e) return e;
  r.date = date; r.slot = slot; r.timeline.push({at: stamp(), text: `Moved to ${date} ${slotLabel(slot)}`});
  if (r.provider) notify(s, r.provider, `${r.id}: customer moved the visit to ${date} ${slotLabel(slot)}.`, r.id, 'proJob');
  return '';
}
export function stillSearching(s, r) { return r.status === 'searching' && clock() - (r.createdAtMs || clock()) > 30 * 60000; }

// ---------- pro actions ----------
const job = (s, id) => (s.serviceRequests || []).find(x => x.id === id && x.type === 'general');
const mine = (s, ws, id) => { const r = job(s, id); return r && r.provider === ws ? r : null; };
// Jobs offered to this pro right now (the dispatcher picks the top 3 eligible pros by score).
export function offersFor(s, ws = 'homePro') {
  const p = proOf(s, ws); if (!p) return [];
  return (s.serviceRequests || []).filter(r => D.offeredTo(s, r, p));
}
export const jobsOf = (s, ws = 'homePro') => (s.serviceRequests || []).filter(r => r.type === 'general' && r.provider === ws);
export function acceptJob(s, ws, id) {
  const p = proOf(s, ws), r = job(s, id);
  if (!p) return 'Set up your home-service profile first.';
  if (!p.verified) return 'Finish ID verification before taking jobs.';
  if (r && !(p.skills || []).includes(r.category)) return `Add ${CATS[r.category].label} to your skills to take this job.`;
  const clash = r && jobsOf(s, ws).find(x => x.id !== r.id && x.date === r.date && x.slot === r.slot && ['accepted', 'on_the_way', 'in_progress'].includes(x.status));
  if (clash) return `You already have ${clash.id} in this slot.`;
  if (!r || r.status !== 'searching') return 'This job was taken by another pro or cancelled.';
  const blocked = partnerBlocked(s, ws); if (blocked) return blocked;
  if (D.QUOTE_CATS.includes(r.category)) return 'Send your price for this job — the customer compares up to 3 quotes.';
  if (!r.dispatch) D.start(s, r);
  if (!D.offeredTo(s, r, p)) return r.dispatch?.responses?.[p.id] === 'accept' ? 'You accepted. If other pros also accept, the best match gets it.' : 'This job is no longer offered to you.';
  const e = D.respond(s, r, p, 'accept'); if (e) return e;
  if (r.status === 'accepted' && r.proId !== p.id) return `This job went to a closer or better-matched pro. You are first in line for the next job nearby.`;
  return '';
}
export function declineJob(s, ws, id) {
  const p = proOf(s, ws), r = job(s, id); if (!p || !r) return 'Job not found.';
  if (D.offeredTo(s, r, p)) return D.respond(s, r, p, 'decline');
  (r.declinedBy ||= []).push(p.id); return '';
}
// The assigned pro cannot come: the job goes to the next-best pro; their reliability drops.
export function cancelByPro(s, ws, id, reason) {
  const p = proOf(s, ws), r = mine(s, ws, id); if (!p || !r) return 'Job not found.';
  return D.proCancel(s, r, p, reason);
}
// Painting / big jobs: an offered pro sends a price instead of accepting.
export function sendProQuote(s, ws, id, v) { const p = proOf(s, ws), r = job(s, id); if (!p || !r) return 'Job not found.'; return D.sendQuote(s, r, p, v); }
export function chooseQuote(s, id, proId) { const r = job(s, id); if (!r) return 'Booking not found.'; return D.chooseQuote(s, r, proId); }
// Called on every render: round timers (60 s) and part settlement after payment.
export function tick(s) {
  const before = JSON.stringify((s.serviceRequests || []).filter(r => r.type === 'general' && (r.status === 'searching' || r.paid)).map(r => [r.id, r.status, r.dispatch?.round, (r.parts || []).map(p => p.settled)]));
  D.tick(s); for (const r of s.serviceRequests || []) if (r.type === 'general' && r.paid) P.settle(s, r);
  return before !== JSON.stringify((s.serviceRequests || []).filter(r => r.type === 'general' && (r.status === 'searching' || r.paid)).map(r => [r.id, r.status, r.dispatch?.round, (r.parts || []).map(p => p.settled)]));
}
export function onTheWay(s, ws, id) {
  const r = mine(s, ws, id); if (!r || r.status !== 'accepted') return 'Accept the job first.';
  r.status = 'on_the_way'; r.etaMins = 25; r.timeline.push({at: stamp(), text: 'On the way'});
  notify(s, 'personal', `${r.id}: ${r.providerName} is on the way (about 25 min). Share your start code ${r.startOtp} only when they reach your door.`, r.id, 'serviceDetail');
  return '';
}
// ---------- live location while on the way ----------
export const SPEED_KMH = 22;
const dest = r => LOC.point(r.address);
export const proHere = r => (r.track?.length ? [r.track.at(-1).lat, r.track.at(-1).lng] : null);
export function distLeft(r) { const a = proHere(r), b = dest(r); return a && b ? km(a, b) : null; }
export const etaOf = r => { const d = distLeft(r); return d == null ? null : Math.max(1, Math.round(roadKm(proHere(r), dest(r)) / SPEED_KMH * 60)); };
export const lastSeenMin = r => (r.geo?.lastAt ? Math.floor((Date.now() - r.geo.lastAt) / 60000) : null);
function startPoint(s, r) { const p = proById(s, r.proId), d = dest(r) || [26.647, 84.909]; return p?.coords && km(p.coords, d) < 30 ? p.coords : [d[0] + 0.03, d[1] + 0.03]; }
export function shareLocation(s, ws, id, lat, lng, src = 'gps') {
  const r = mine(s, ws, id); if (!r || r.status !== 'on_the_way') return 'Location is shared only while you are on the way.';
  (r.track ||= []).push({lat, lng, at: Date.now(), src}); r.geo = {...(r.geo || {}), live: true, lastAt: Date.now(), src};
  const d = distLeft(r), lab = LOC.LABELS[r.address?.precision] || LOC.LABELS.area;
  if (d == null) return '';
  r.etaMins = etaOf(r);
  if (lab.callKm && d <= lab.callKm && !r.geo.callPrompted) { r.geo.callPrompted = true; notify(s, ws, `${r.id}: you are about ${d.toFixed(1)} km away. The address is ${lab.text.toLowerCase()} — call ${r.customerName || 'the customer'} now for directions.`, r.id, 'proJob'); }
  if (d <= 0.6 && !r.geo.arrivingSent) { r.geo.arrivingSent = true; notify(s, 'personal', `${r.id}: ${r.providerName} is arriving in about 2 minutes.`, r.id, 'serviceDetail'); }
  if (d <= 0.1 && !r.arrivedAt) { r.arrivedAt = stamp(); r.timeline.push({at: stamp(), text: 'Arrived (GPS)'}); notify(s, 'personal', `${r.id}: ${r.providerName} has arrived. Share your start code ${r.startOtp}.`, r.id, 'serviceDetail'); }
  return '';
}
// Demo / prototype: move the pro towards the customer.
export function demoDrive(s, ws, id, stepKm = 1) {
  const r = mine(s, ws, id); if (!r || r.status !== 'on_the_way') return 'Tap "On the way" first.';
  const here = proHere(r) || startPoint(s, r), to = dest(r);
  if (!r.track?.length) return shareLocation(s, ws, id, here[0], here[1], 'demo');
  if (!to) return 'This address has no map point. Call the customer for directions.';
  const d = km(here, to); if (d < 0.02) return 'You are at the customer\'s place.';
  const f = Math.min(1, stepKm / d); return shareLocation(s, ws, id, here[0] + (to[0] - here[0]) * f, here[1] + (to[1] - here[1]) * f, 'demo');
}
// Area-only address: the customer shares their live location so the pro can find them.
export function customerShares(s, id, lat, lng) {
  const r = job(s, id); if (!r || !['accepted', 'on_the_way'].includes(r.status)) return 'Share your location once a pro is assigned.';
  Object.assign(r.address, {lat, lng, accuracy: 15, source: 'live', precision: 'exact', digipin: LOC.digipin(lat, lng)}); r.timeline.push({at: stamp(), text: 'Customer shared live location'});
  if (r.provider) notify(s, r.provider, `${r.id}: the customer shared their exact location. Navigate now goes to their door.`, r.id, 'proJob');
  return '';
}
export function startJob(s, ws, id, otp, beforePhoto = '') {
  const r = mine(s, ws, id); if (!r || r.status !== 'on_the_way') return 'Tap "On the way" first.';
  const lab = LOC.LABELS[r.address?.precision] || LOC.LABELS.area;
  if (lab.arriveKm != null) { const d = distLeft(r); if (d == null) return 'Share your live location first so we can confirm you are at the customer\'s place.'; if (d > lab.arriveKm) return `You are ${d.toFixed(1)} km from the customer. Start when you reach the place (within ${Math.round(lab.arriveKm * 1000)} m).`; }
  if (String(otp || '').trim() !== r.startOtp) { r.otpTries = (r.otpTries || 0) + 1; return r.otpTries >= 3 ? 'Wrong code 3 times. Ask the customer to read the code from their MoveAI app, or call support.' : 'That code is wrong. Ask the customer for the 4-digit start code in their app.'; }
  r.status = 'in_progress'; r.startedAt = stamp(); if (beforePhoto) r.beforePhoto = beforePhoto;
  if (r.geo) r.geo.live = false; // sharing stops when the job starts
  const at = proHere(r); if (at && r.address?.precision !== 'exact') { LOC.learn(s, r.address, at); r.timeline.push({at: stamp(), text: 'Exact location saved for next time'}); } r.timeline.push({at: stamp(), text: r.inspection ? 'Inspection started' : 'Work started'});
  notify(s, 'personal', `${r.id}: ${r.inspection ? 'inspection' : 'work'} started.`, r.id, 'serviceDetail');
  return '';
}
export function proposeExtra(s, ws, id, v) {
  const r = mine(s, ws, id); if (!r || r.status !== 'in_progress') return 'Start the job first.';
  if (r.inspection) return 'Send a quote for the whole job instead.';
  return Bill.proposeExtra(s, r, v, r.providerName);
}
export function sendQuote(s, ws, id, {amount, note}) {
  const r = mine(s, ws, id); if (!r || r.status !== 'in_progress' || !r.inspection) return 'Only an inspection job gets a quote.';
  const a = Math.round(Number(amount) || 0); if (a < 500) return 'Enter the full price for the job (at least ₹500).';
  if (String(note || '').trim().length < 5) return 'Write what is included (rooms, paint, coats, days).';
  r.inspectionQuote = {amount: a, note: String(note).trim(), status: 'proposed', at: stamp()}; r.timeline.push({at: stamp(), text: `Quote sent · ${inr(a)}`});
  notify(s, 'personal', `${r.id}: quote ${inr(a)} for your painting job. Approve or decline in the app.`, r.id, 'serviceDetail');
  return '';
}
export function decideQuote(s, id, decision) {
  const r = job(s, id); const q = r?.inspectionQuote; if (!q || q.status !== 'proposed') return 'No quote is waiting.';
  if (decision === 'approve') {
    q.status = 'approved'; r.quote = {...r.quote, partnerLines: [[`Painting as quoted: ${q.note}`, q.amount]], components: [[`Painting as quoted: ${q.note}`, q.amount]], partnerTotal: q.amount, total: q.amount,
      rateCard: [['Changes to the quote', 'Only with your approval in the app'], ['Re-work', `Free touch-up within ${WARRANTY_DAYS} days`]]};
    r.timeline.push({at: stamp(), text: 'Quote approved'}); notify(s, r.provider, `${r.id}: customer approved your quote of ${inr(q.amount)}. Start the work.`, r.id, 'proJob');
  } else {
    q.status = 'declined'; r.status = 'closed'; r.closedReason = 'Quote declined after free inspection'; r.timeline.push({at: stamp(), text: 'Quote declined · nothing to pay'});
    notify(s, r.provider, `${r.id}: customer declined the quote. The inspection is closed.`, r.id, 'proJob');
  }
  return '';
}
export function markDone(s, ws, id, {afterPhoto = '', noWork = false, reason = ''} = {}) {
  const r = mine(s, ws, id); if (!r || r.status !== 'in_progress') return 'Start the job first.';
  if (Bill.pendingExtras(r).length) return 'The customer has not answered your extra charge yet. Ask them to approve or reject it in the app.';
  const pb = P.doneBlock(r); if (pb) return pb;
  if (noWork) {
    if (String(reason).trim().length < 5) return 'Say why no work was possible.';
    r.quote = {...r.quote, partnerLines: [['Visit charge (no work possible)', NO_WORK_CHARGE]], components: [['Visit charge (no work possible)', NO_WORK_CHARGE]], partnerTotal: NO_WORK_CHARGE, total: NO_WORK_CHARGE};
    r.noWork = String(reason).trim();
  } else {
    if (r.inspection && r.inspectionQuote?.status !== 'approved') return 'Send a quote and wait for the customer to approve it.';
    if (!afterPhoto) return 'Add a photo of the finished work.';
    r.afterPhoto = afterPhoto;
  }
  r.status = 'provider_done'; r.doneAt = stamp(); r.timeline.push({at: stamp(), text: noWork ? 'No work possible · visit charge' : 'Work done'});
  notify(s, 'personal', `${r.id}: ${r.providerName} marked the work done. Check it, confirm and pay.`, r.id, 'serviceDetail');
  return '';
}

export function fixPin(s, ws, id, at) {
  const r = mine(s, ws, id); if (!r || !['on_the_way', 'in_progress'].includes(r.status)) return 'Fix the pin when you are at the customer\'s place.';
  const p = at || proHere(r); if (!p) return 'Share your live location first.';
  LOC.learn(s, r.address, p); r.timeline.push({at: stamp(), text: 'Pin fixed by the pro'}); return '';
}

// ---------- after the job ----------
export const warrantyUntil = r => r.date ? addDays(r.date, WARRANTY_DAYS) : '';
export const inWarranty = r => ['completed', 'paid', 'closed'].includes(r.status) && !r.noWork && todayIso() <= warrantyUntil(r) && !r.closedReason;
export function requestRework(s, id, {problem, date, slot}) {
  const r = job(s, id); if (!r) return {error: 'Booking not found.'};
  if (!inWarranty(r)) return {error: `Re-work is free within ${WARRANTY_DAYS} days of the job.`};
  if ((s.serviceRequests || []).some(x => x.reworkOf === id && !['closed', 'cancelled'].includes(x.status))) return {error: 'A re-work visit is already booked for this job.'};
  if (String(problem || '').trim().length < 5) return {error: 'Tell us what went wrong again.'};
  const e = slotError(date, slot); if (e) return {error: e};
  const nid = uid('SR');
  const n = {...JSON.parse(JSON.stringify(r)), id: nid, title: `Re-work · ${r.title}`, reworkOf: id, description: String(problem).trim(), date, slot, extras: [], rating: null, comment: '', paid: false,
    quote: {...r.quote, partnerLines: [['Re-work under the 30-day promise', 0]], components: [['Re-work under the 30-day promise', 0]], partnerTotal: 0, total: 0},
    status: 'accepted', startOtp: String(1000 + Math.floor(Math.random() * 9000)), otpTries: 0, inspectionQuote: null, afterPhoto: '', beforePhoto: '', createdAt: stamp(), createdAtMs: clock(), timeline: [{at: stamp(), text: `Re-work booked for ${r.id}`}], conversationId: r.conversationId};
  delete n.closedReason; delete n.noWork;
  s.serviceRequests.unshift(n); s.selectedServiceId = nid;
  notify(s, r.provider, `Re-work ${nid} for ${r.id}: ${String(problem).trim()} · ${date} ${slotLabel(slot)}. Free under the 30-day promise.`, nid, 'proJob');
  return {request: n};
}

// ---------- admin ----------
export function adminRows(s) {
  const slotStart = r => new Date(`${r.date}T${r.slot}:00:00`).getTime();
  return (s.serviceRequests || []).filter(r => r.type === 'general').map(r => ({r, flag: stillSearching(s, r) ? 'No pro yet after 30 min' : r.status === 'searching' && r.date < todayIso() ? 'Slot passed'
    : r.status === 'accepted' && clock() > slotStart(r) + 15 * 60000 ? 'Late — pro not on the way yet' : r.status === 'on_the_way' && (lastSeenMin(r) ?? 0) >= 10 ? `No location for ${lastSeenMin(r)} min` : r.status === 'on_the_way' && clock() > slotStart(r) + 2 * 3600000 ? 'Possible no-show' : ''}));
}
export function adminAssign(s, id, proId) {
  const r = job(s, id), p = proById(s, proId); if (!r || r.status !== 'searching' || !p || p.active === false) return 'Only an unassigned job can be given to an active pro.';
  if (!(p.skills || []).includes(r.category)) (p.skills ||= []).push(r.category);
  r.dispatch ||= {round: 0, radiusKm: 15, offered: [], responses: {}, log: [], current: null, backups: []}; r.dispatch.current = null;
  r.dispatch.log.push({at: stamp(), text: `Admin gave the job to ${p.name}`}); return D.assign(s, r, p);
}
export function setPaused(s, proId, paused) { const p = proById(s, proId); if (!p) return 'Pro not found.'; p.active = !paused; return ''; }
// Widened-area jobs and those with nobody left (for the admin list).
export const widened = s => (s.serviceRequests || []).filter(r => r.type === 'general' && r.dispatch?.widened);

// Sign-up: a verified "Home service pro" candidate gets the pro workspace (MoveAI Partner).
export function activatePro(s, c) {
  if (!c || c.workerType !== 'homePro') return 'Not a home-service sign-up.';
  if ((c.level || 1) < 2) return 'Verify your ID and selfie first.';
  for (const p of pros(s)) if (p.ws === 'homePro' && p.candidateId !== c.id) p.ws = null;
  let p = pros(s).find(x => x.candidateId === c.id);
  const skills = (c.skills || []).map(x => Object.keys(CATS).find(k => CATS[k].label === x || k === x)).filter(Boolean);
  if (!p) { p = {id: `HP-${c.id}`, candidateId: c.id, name: c.name, mobile: c.mobile, city: c.locations?.[0] || '', skills, rating: 0, ratingCount: 0, jobsDone: 0, verified: true, trained: false, active: true}; (s.homePros ||= []).push(p); }
  Object.assign(p, {ws: 'homePro', skills: skills.length ? skills : p.skills, verified: true});
  if (c.checks?.bank?.status === 'verified' && !p.bank) p.bank = {masked: c.checks.bank.masked, kind: 'account', at: stamp()};
  const id = (s.knownIdentities || []).find(x => x.mobile === (s.auth?.mobile || c.mobile)); if (id && !(id.workspaces || []).includes('homePro')) (id.workspaces ||= []).push('homePro');
  s.lastWorkspace = 'homePro';
  if (!(s.workspaces ||= []).includes('homePro')) s.workspaces.push('homePro');
  return '';
}

// ---------- customer screens ----------
const draftOf = s => (s.homeDraft ||= {step: 1, category: 'electrician', qty: {}, date: '', slot: '', addressId: addresses(s)[0]?.id || 'new'});
export const BOOK_STEPS = ['Job', 'Address', 'Time', 'Review'];
const draftItems = d => { const cat = CATS[d.category] ? d.category : 'electrician'; return CATS[cat].inspection ? [{id: 'inspect', qty: 1}] : Object.entries(d.qty || {}).filter(([k, q]) => q > 0 && itemOf(cat, k)).map(([id, qty]) => ({id, qty})); };
function draftAddress(s, d) { if (d.addressId && d.addressId !== 'new') return addresses(s).find(a => a.id === d.addressId) || null; const loc = LOC.makeLocation(LOC.draftOf(s, 'hs-addr')); return loc.error ? null : loc; }
export function bookStepError(s, step) {
  const d = draftOf(s), c = CATS[d.category] || CATS.electrician;
  if (step === 1) { if (!c.inspection && !draftItems(d).length) return 'Choose at least one job.'; if (c.inspection && String(d.description || '').trim().length < 5) return 'Tell us what needs painting (rooms, walls or area) so the pro can plan the inspection.'; return ''; }
  if (step === 2) { if (d.addressId && d.addressId !== 'new') return addresses(s).some(a => a.id === d.addressId) ? '' : 'Choose an address.'; const loc = LOC.finalLocation(s, 'hs-addr'); return loc.error || ''; }
  if (step === 3) return slotError(d.date, d.slot);
  return '';
}
export function bookScreen(s) {
  const d = draftOf(s), step = Math.min(4, Math.max(1, d.step || 1)), cat = CATS[d.category] ? d.category : 'electrician', c = CATS[cat];
  const items = draftItems(d), q = quoteFor(cat, items), saved = addresses(s), addr = draftAddress(s, d);
  const sums = {1: items.length && !c.inspection ? `${c.icon} ${c.label} · ${items.map(x => `${itemOf(cat, x.id)[1]}${x.qty > 1 ? ` × ${x.qty}` : ''}`).join(', ')}` : c.inspection ? `${c.icon} ${c.label} · free inspection` : '', 2: addr ? `📍 ${addr.label && addr.id ? `${addr.label}: ` : ''}${addr.line}${addr.village ? `, ${addr.village}` : ''}` : '', 3: d.date && d.slot ? `🕑 ${d.date} · ${slotLabel(d.slot)}` : ''};
  let body = '';
  if (step === 1) body = `<div class="hs-cats">${Object.entries(CATS).map(([k, x]) => `<label class="hs-cat ${k === cat ? 'selected' : ''}"><input type="radio" name="category" value="${k}" ${k === cat ? 'checked' : ''} data-hs-cat><span aria-hidden="true">${x.icon}</span><b>${esc(x.label)}</b></label>`).join('')}</div>
    ${c.inspection ? `<div class="info-banner"><b>Compare up to 3 quotes</b><span>Painters near you send a written price for your rooms. You choose one; they visit, check and do the work. Nothing to pay until you choose.</span></div>`
      : `<fieldset><legend>Choose jobs</legend><div class="hs-items">${c.items.map(([k, l, p]) => `<div class="hs-item"><span><b>${esc(l)}</b><small>${inr(p)}</small></span><span class="qty"><button type="button" class="button secondary compact" data-hs-qty="${k}" data-d="-1" aria-label="Fewer ${esc(l)}">−</button><output data-hs-count="${k}">${d.qty?.[k] || 0}</output><button type="button" class="button secondary compact" data-hs-qty="${k}" data-d="1" aria-label="More ${esc(l)}">+</button></span></div>`).join('')}</div></fieldset>`}
    <details class="hs-note" ${d.description || c.inspection ? 'open' : ''}><summary>${c.inspection ? 'What needs painting?' : 'Add a note or photo for the pro (optional)'}</summary><div class="form-grid"><label class="wide"><span>${c.inspection ? 'Rooms, walls or area' : 'Note'}</span><textarea name="description" rows="2" placeholder="${c.inspection ? 'e.g. 2 bedrooms and hall, walls only, some damp patches' : 'e.g. fan makes noise and wobbles'}">${esc(d.description || '')}</textarea></label><label class="wide"><span>Photo of the problem</span><input type="file" name="photo" accept="image/*"></label></div></details>
    ${!c.inspection && q.total === MIN_ORDER && items.length && items.reduce((a, x) => a + itemOf(cat, x.id)[2] * x.qty, 0) < MIN_ORDER ? `<small class="muted">Small jobs are charged at least ${inr(MIN_ORDER)}.</small>` : ''}`;
  if (step === 2) body = `<div class="hs-addresses">${saved.map(a => `<label class="hs-address"><input type="radio" name="addressId" value="${a.id}" ${d.addressId === a.id ? 'checked' : ''} data-hs-addr><span><b>${esc(a.label)}</b> ${LOC.labelChip(a)}<small>${esc(LOC.oneLine(a))}</small></span></label>`).join('')}<label class="hs-address"><input type="radio" name="addressId" value="new" ${d.addressId === 'new' || !saved.length ? 'checked' : ''} data-hs-addr><span><b>+ New address</b></span></label></div>
    ${d.addressId === 'new' || !saved.length ? `<div data-hs-new-address>${LOC.pickerHtml(s, 'hs-addr', {title: 'Where is the work?'})}<div class="form-grid two"><label><span>Save as</span><select name="addrName"><option>Home</option><option>Work</option><option>Parents</option><option>Shop</option></select></label><label class="check-inline"><input type="checkbox" name="saveAddress" ${d.saveAddress === false ? '' : 'checked'}> Save this address</label></div></div>` : ''}`;
  if (step === 3) body = WIZ.whenHtml(d.date, d.slot);
  if (step === 4) body = `<section class="hs-review"><p class="price-line"><span>${c.icon} ${esc(c.label)}</span><span></span></p>${q.partnerLines.map(([a, b]) => `<p class="price-line"><span>${esc(a)}</span><b>${inr(b)}</b></p>`).join('')}<p class="price-line total"><span>${c.inspection ? 'Inspection' : 'Total · pay after the work'}</span><b data-hs-total>${c.inspection ? 'Free' : inr(q.total)}</b></p>
    <p>📍 ${addr ? esc(LOC.oneLine(addr)) : ''} ${addr ? LOC.labelChip(addr) : ''}</p><p>🕑 ${esc(d.date)} · ${esc(slotLabel(d.slot))}</p>${d.description ? `<p class="muted">“${esc(d.description)}”</p>` : ''}${d.favouriteProId && proById(s, d.favouriteProId) ? `<p class="avail-chip" data-hs-fav>★ We ask ${esc(proById(s, d.favouriteProId).name)} first. If he can't come within 2 minutes, the next best pro gets it.</p>` : ''}
    <details class="rate-card"><summary>If anything extra comes up</summary>${q.rateCard.map(([a, b]) => `<small class="block"><b>${esc(a)}:</b> ${esc(b)}</small>`).join('')}</details><p class="muted">Free to change the time or cancel until the pro is on the way.</p></section>`;
  return `${head('Home services', 'Choose the job, see the fixed price, pick a time. Pay after the work is done.')}
  <form id="home-book-form" class="panel form-panel narrow wiz" data-step="${step}">${WIZ.head(BOOK_STEPS, step, sums)}
    <section class="wiz-step" data-hs-step="${step}"><h2>${esc(['What do you need?', 'Where is the work?', 'When should the pro come?', 'Check and book'][step - 1])}</h2>${body}</section>
    <p class="field-error" id="home-book-error" hidden></p>
    ${WIZ.bar({total: c.inspection ? null : (items.length ? q.total : null), totalNote: c.inspection ? 'Free inspection, quote later' : items.length ? 'Pay after the work' : 'Choose a job to see the price', cur: step, next: step === 4 ? (c.inspection ? 'Ask for quotes' : 'Book now') : 'Next'})}
  </form>`;
}

const STEPS = r => r.inspection
  ? [['searching', 'Finding a painter'], ['accepted', 'Painter assigned'], ['on_the_way', 'On the way'], ['in_progress', 'Inspection and work'], ['provider_done', 'Work done'], ['paid', 'Paid'], ['closed', 'Rated']]
  : [['searching', 'Finding a pro'], ['accepted', 'Pro assigned'], ['on_the_way', 'On the way'], ['in_progress', 'Work started'], ['provider_done', 'Work done'], ['paid', 'Paid'], ['closed', 'Rated']];
function proCard(s, r, {customer = true} = {}) {
  const p = proById(s, r.proId); if (!p) return '';
  const rt = proRating(s, p);
  return `<div class="hs-pro"><span class="avatar">${esc(p.name.split(' ').map(x => x[0]).join(''))}</span><span><b>${esc(p.name)}</b><small>★ ${rt.avg || 'New'}${rt.n ? ` (${rt.n})` : ''} · ${p.jobsDone || 0} jobs · ✓ ID verified${p.trained ? ' · ✓ Trained' : ''}</small></span>
    ${customer ? `<span class="row-actions"><button class="button secondary compact" data-wx="call" data-name="${esc(p.name)}">📞 Call</button>${r.conversationId ? `<button class="button secondary compact" data-op="open-conversation" data-id="${r.conversationId}">Message</button>` : ''}</span>` : ''}</div>`;
}
function liveCard(r) {
  const here = proHere(r), to = dest(r), d = distLeft(r), seen = lastSeenMin(r);
  const status = r.arrivedAt ? `${esc(r.providerName)} has arrived` : d != null ? `${esc(r.providerName)} is ${d.toFixed(1)} km away · about ${etaOf(r)} min` : `${esc(r.providerName)} is on the way`;
  const fresh = seen == null ? 'Location appears when they start sharing.' : seen < 1 ? 'Live location · updated just now' : `Last seen ${seen} min ago${seen >= 2 ? ' · weak network, it will update when their phone reconnects' : ''}`;
  return `<section class="hs-live" data-hs-live><b>${status}</b>${here || to ? mapSvgPts([to && {at: to, icon: '🏠', label: 'You'}, here && {at: here, icon: '🧰', label: r.providerName, fill: '#0b6655'}], (r.track || []).map(p => [p.lat, p.lng])) : ''}<small class="block muted">${fresh}</small></section>`;
}
function mapSvgPts(pts, path) { return GeoMap.mapSvg(pts.filter(Boolean), {path, label: 'Live tracking map'}); }
export function customerScreen(s, r) {
  const steps = STEPS(r), cur = Math.max(0, steps.findIndex(([k]) => k === (r.status === 'completed' ? 'provider_done' : r.status)));
  const status = r.status;
  const where = `${r.date} · ${slotLabel(r.slot)} · ${r.address ? `${r.address.label}: ${r.address.line}` : ''}`;
  let next = '';
  if (status === 'searching') next = searchingPanel(s, r);
  if (['accepted', 'on_the_way'].includes(status)) next = `${whyPro(s, r)}${demoStep(r)}${status === 'on_the_way' ? liveCard(r) : `<p>${esc(r.providerName)} will come on ${esc(r.date)}, ${esc(slotLabel(r.slot))}.</p>`}
    ${r.address?.precision === 'area' ? `<div class="action-warning"><b>Help ${esc(r.providerName)} find you</b><span>Your address has no exact map point.</span><button type="button" class="button primary compact" data-hs="cust-share" data-id="${r.id}">📍 Share my live location</button><button type="button" class="button text compact" data-hs="cust-share-demo" data-id="${r.id}">Demo: share from the house</button></div>` : ''}
    <div class="otp-share"><small>Start code · share only when the pro is at your door</small><b data-hs-otp>${esc(r.startOtp)}</b></div>`;
  if (status === 'in_progress') next = r.inspectionQuote?.status === 'proposed' ? `<div class="extra-approve"><div><b>Quote · ${inr(r.inspectionQuote.amount)}</b><small class="block muted">${esc(r.inspectionQuote.note)}</small></div><span class="row-actions"><button class="button primary compact" data-hs="quote-approve" data-id="${r.id}">Approve quote</button><button class="button secondary compact" data-hs="quote-decline" data-id="${r.id}">Decline (pay nothing)</button></span></div>`
    : `${r.waitingPart ? `<div class="info-banner" data-hs-waiting><b>Waiting for a part</b><span>${esc(r.providerName)} comes back on ${esc(r.waitingPart.date)}, ${esc(slotLabel(r.waitingPart.slot))} at no extra charge. Only the part is billed.</span></div>` : ''}${P.customerCard(s, r)}<p>${r.inspection && r.inspectionQuote?.status !== 'approved' ? 'The painter is inspecting. You will get a written quote here.' : 'Work in progress. Any extra charge or part appears here for you to approve first.'}</p>${demoStep(r)}`;
  if (status === 'provider_done') next = `${(r.parts || []).some(p => p.status === 'approved') ? `<p class="muted">Old part${(r.parts || []).filter(p => p.status === 'approved').length > 1 ? 's' : ''} replaced: ${(r.parts || []).filter(p => p.status === 'approved').map(p => `${esc(p.name)} (photo: ${esc(p.photo)})`).join(', ')}</p>` : ''}<p>${r.noWork ? `No work was possible: ${esc(r.noWork)}. Only the visit charge applies.` : 'The pro marked the work done. Check it, then confirm.'}</p>${r.afterPhoto ? `<p class="muted">Photo of the finished work: ${esc(r.afterPhoto)}</p>` : ''}<button class="button primary full" data-op="service-confirm" data-id="${r.id}">Confirm work is done</button>`;
  if (status === 'completed' && !r.paid) next = `<p>Pay the pro through MoveAI.</p>`;
  if (status === 'paid' && !r.rating) next = `<p>How was ${esc(r.providerName || 'the pro')}?</p><div class="rating" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="service-rating" value="${n}" ${n === 5 ? 'checked' : ''}><span>★</span></label>`).join('')}</div><input id="service-comment" class="text-field" placeholder="Anything to share? (optional)"><button class="button primary full" data-op="service-rate" data-id="${r.id}">Rate and close</button>`;
  const again = ['paid', 'closed'].includes(status) && r.proId && !r.closedReason && !r.reworkOf ? `<button class="button secondary full" data-hs="book-again" data-id="${r.id}">★ Book ${esc((r.providerName || 'my pro').split(' ')[0])} again</button>` : '';
  if (status === 'closed') next = r.closedReason ? `<div class="info-banner"><b>Closed</b><span>${esc(r.closedReason)}</span></div>` : `<div class="info-banner"><b>Closed${r.rating ? ` · rated ${'★'.repeat(r.rating)}` : ''}</b><span>${esc(r.comment || 'Thank you.')}</span></div>`;
  if (status === 'cancelled') next = `<div class="info-banner"><b>Cancelled</b><span>${esc(r.cancelReason || '')}</span></div>`;
  const resched = ['searching', 'accepted'].includes(status) ? `<details class="cancel-box"><summary>Change date or time</summary><form class="inline-form" data-hs-resched="${r.id}"><input type="date" name="date" value="${esc(r.date)}" min="${todayIso()}"><select name="slot">${SLOTS.map(([k, l]) => `<option value="${k}" ${r.slot === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="button secondary compact">Change</button></form></details>` : '';
  const warranty = inWarranty(r) && !r.reworkOf ? `<section class="panel"><h2>30-day re-work promise</h2><p class="muted">If the same problem comes back before ${esc(warrantyUntil(r))}, ${esc(r.providerName || 'the pro')} comes back for free.${(r.parts || []).some(p => p.status === 'approved' && p.shopName) ? ' If a part bought through MoveAI fails, the shop\'s warranty covers it — we arrange the replacement.' : ''}</p><details><summary class="button secondary compact">Problem came back?</summary><form class="form-grid two" data-hs-rework="${r.id}"><label class="wide"><span>What went wrong?</span><input name="problem"></label><label><span>Date</span><input type="date" name="date" min="${todayIso()}" value="${addDays(todayIso(), 1)}"></label><label><span>Time</span><select name="slot">${SLOTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><button class="button primary">Book free re-work</button></form></details></section>` : '';
  return `${head(r.title, `${r.id} · ${where}`, r.conversationId ? `<button class="button secondary" data-op="open-conversation" data-id="${r.conversationId}">Message</button>` : '')}
  <div class="grid two"><section class="panel"><h2>Progress</h2><ol class="milestones">${steps.map(([k, l], i) => `<li class="ms ${i < cur || (i === cur && ['closed', 'paid'].includes(k)) ? 'done' : i === cur ? 'current' : ''}"><i></i><span><b>${esc(l)}</b></span></li>`).join('')}</ol>
    <details><summary class="button text compact">What happened when</summary>${(r.timeline || []).map(t => `<small class="block">${esc(t.at)} · ${esc(t.text)}</small>`).join('')}</details></section>
  <section class="panel" data-hs-next><h2>Your next step</h2>${proCard(s, r)}${next}${again}${resched}<button class="button secondary full" data-op="report-exception" data-ref="${r.id}">Report a problem or damage</button></section></div>
  ${r.description || r.items?.length ? `<section class="panel"><h2>Job details</h2><ul>${(r.items || []).map(x => { const it = itemOf(r.category, x.id); return it ? `<li>${esc(it[1])}${x.qty > 1 ? ` × ${x.qty}` : ''}</li>` : ''; }).join('')}</ul>${r.description ? `<p class="muted">${esc(r.description)}</p>` : ''}</section>` : ''}${P.statusList(r)}${warranty}`;
}
// Searching: who we asked, favourite first, quotes to compare, and what happens if nobody accepts.
function searchingPanel(s, r) {
  const d = r.dispatch || {}, cur = d.current, quote = D.QUOTE_CATS.includes(r.category);
  if (quote && (r.quotes || []).length) return `<div data-hs-quotes><p><b>${r.quotes.length} quote${r.quotes.length > 1 ? 's' : ''} so far.</b> Choose one — the painter visits on ${esc(r.date)}, ${esc(slotLabel(r.slot))}.</p>${r.quotes.slice().sort((a, b) => a.amount - b.amount).map(q => { const p = proById(s, q.proId), rt = p ? proRating(s, p) : {avg: 0, n: 0}, k = p ? D.distanceTo(p, r) : null;
    return `<div class="hs-quote"><span><b>${esc(p?.name || 'Painter')} · ${inr(q.amount)}</b><small class="block">★ ${rt.avg || 'New'}${rt.n ? ` (${rt.n})` : ''}${p?.trained ? ' · ✓ Trained' : ''}${k != null ? ` · ${k.toFixed(1)} km away` : ''}</small><small class="block muted">${esc(q.note)}</small></span><button class="button primary compact" data-hs="choose-quote" data-id="${r.id}" data-pro="${q.proId}">Choose</button></div>`; }).join('')}</div>${cur ? `<button class="button text compact" data-hs="time-passes" data-id="${r.id}">Demo: 60 seconds pass</button>` : ''}`;
  const fav = cur && r.favouriteProId && cur.ids[0] === r.favouriteProId && cur.ids.length === 1 ? proById(s, r.favouriteProId) : null;
  const msg = d.exhausted ? `<b>No ${esc(CATS[r.category].label.toLowerCase())} is free within 15 km right now.</b> Our team has been told and will call you. You can also try another slot or cancel for free.`
    : fav ? `We asked <b>${esc(fav.name)}</b> first (your pro from last time). If he can't come in 2 minutes, the next best pro gets it.`
    : quote ? `We asked up to 3 painters near you for a price. Quotes appear here — compare and choose.`
    : `We sent your job to the ${cur?.ids.length > 1 ? `${cur.ids.length} best-matched` : 'best-matched'} verified pros near you${d.radiusKm > 5 ? ` (within ${d.radiusKm} km)` : ''}. The first to accept is not always the one who comes — the closest, best-rated match does.`;
  return `<p data-hs-searching>${msg}</p>${stillSearching(s, r) && !d.exhausted ? '<p><b>No pro has accepted yet.</b> Try another slot, or cancel for free.</p>' : ''}${cur ? `<button class="button text compact" data-hs="time-passes" data-id="${r.id}">Demo: 60 seconds pass</button>` : ''}`;
}
// "Why this pro": the short reason the customer sees once a pro is chosen.
function whyPro(s, r) {
  const w = r.dispatch?.winner; if (!w) return '';
  const p = proById(s, w.proId), rt = p ? proRating(s, p) : {avg: 0};
  const bits = [w.km != null ? `${w.km} km away` : '', rt.avg ? `★ ${rt.avg}` : 'New pro', (p?.stats?.cancels || 0) + (p?.stats?.noShows || 0) === 0 ? 'no cancellations' : '', p?.trained ? 'MoveAI trained' : '', w.parts?.favourite ? 'your pro from last time' : ''].filter(Boolean);
  return `<details class="hs-why"><summary>Why ${esc(p?.name?.split(' ')[0] || 'this pro')}?</summary><small>${esc(bits.join(' · '))} · match score ${w.total}/100</small></details>`;
}
const demoStep = r => String(r.provider || '').startsWith('pro:') ? `<button class="button text compact" data-hs="demo-pro-step" data-id="${r.id}">Demo: ${esc((r.providerName || 'pro').split(' ')[0])} does the next step</button>` : '';

// ---------- pro screens ----------
const nextAction = r => ({accepted: ['on-the-way', 'On the way'], on_the_way: ['start', 'Start job'], in_progress: ['done', 'Mark done']}[r.status]);
function offerRow(s, r) {
  return `<article class="panel hs-offer" data-hs-offer="${r.id}"><div><b>${esc(CATS[r.category].icon)} ${esc(r.title)}</b><small class="block">${esc(r.date)} · ${esc(slotLabel(r.slot))} · ${esc(areaOf(r.address))}${r.address?.pincode ? ` ${esc(r.address.pincode)}` : ''}</small><small class="block">${r.inspection ? 'Free inspection — you send the quote' : `You earn ${inr(earningOf(s, r))} (job ${inr(r.quote?.total)} − 15% MoveAI)`}</small>${r.description ? `<small class="block muted">“${esc(r.description)}”</small>` : ''}</div>
  ${D.QUOTE_CATS.includes(r.category) ? `<form class="inline-form" data-hs-pquote="${r.id}"><input type="number" name="amount" min="500" placeholder="Your price ₹" aria-label="Your price"><input name="note" placeholder="Rooms, coats, days, paint" aria-label="What is included"><button class="button primary compact">Send price</button></form><button class="button text compact" data-hs="decline" data-id="${r.id}">Not for me</button>`
    : `<div class="row-actions"><button class="button secondary compact" data-hs="decline" data-id="${r.id}">Not for me</button><button class="button primary compact" data-hs="accept" data-id="${r.id}">Accept</button></div><small class="muted">If more pros accept, the closest best-rated one gets it — no penalty for you.</small>`}</article>`;
}
function jobRow(r) {
  const a = nextAction(r);
  return `<div class="document-row"><span class="document-icon">${esc(CATS[r.category].icon)}</span><span class="document-copy"><b>${esc(r.title)}</b><small>${esc(r.date)} · ${esc(slotLabel(r.slot))} · ${esc(areaOf(r.address))} · ${esc(String(r.status).replace(/_/g, ' '))}</small></span><button class="button ${a ? 'primary' : 'secondary'} compact" data-hs="open" data-id="${r.id}">${a ? esc(a[1]) : 'Open'}</button></div>`;
}
export function proHomeScreen(s) {
  const p = proOf(s); if (!p) return `${head('Home services', 'Set up your profile to get jobs.')}`;
  const st = (s.workerStatus ||= {}).homePro ||= {online: true};
  const jobs = jobsOf(s), active = jobs.find(r => ['on_the_way', 'in_progress'].includes(r.status)) || jobs.filter(r => r.status === 'accepted').sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot))[0];
  const offers = st.online ? offersFor(s) : [], w = wallet(s, 'homePro'), rt = proRating(s, p);
  const week = jobs.filter(r => r.paid).reduce((a, r) => a + earningOf(s, r), 0);
  return `${head(`Namaste, ${p.name.split(' ')[0]}`, `${(p.skills || []).map(k => CATS[k]?.label).filter(Boolean).join(', ')} · ${p.city} · ★ ${rt.avg || 'New'}`)}
  <section class="panel wh-status"><div><b>${st.online ? 'You are online' : 'You are offline'}</b><small class="block muted">${st.online ? 'New jobs near you appear below.' : 'Go online to get new jobs.'}</small></div><button class="button ${st.online ? 'secondary' : 'primary'}" data-hs="toggle-online">${st.online ? 'Go offline' : 'Go online'}</button></section>
  ${active ? `<section class="panel attention"><h2>Now</h2>${jobRow(active)}</section>` : ''}
  ${setupGaps(p).length ? `<section class="panel" data-hs-setup><h2>Finish your set-up</h2>${!p.bank ? '<p class="info-banner"><b>Add your bank before your first payout</b><span>You can accept jobs now; your money waits safely in your wallet.</span></p>' : ''}${setupGaps(p).map(([k, l]) => `<div class="document-row"><span class="document-icon">○</span><span class="document-copy"><b>${esc(l)}</b></span><button class="button secondary compact" data-hs-setup-open="${k}">Do it</button></div>`).join('')}</section>` : ''}
  <section class="panel"><h2>New jobs near you (${offers.length})</h2>${offers.length ? offers.map(r => offerRow(s, r)).join('') : `<p class="muted">${st.online ? 'No new jobs right now. We will notify you.' : 'You are offline.'}</p>`}</section>
  <div class="grid two"><section class="panel"><h2>Money</h2><p class="price-line"><span>Wallet</span><b>${inr(w.balance)}</b></p><p class="price-line"><span>Earned (paid jobs)</span><b>${inr(week)}</b></p><button class="button secondary compact" data-route="money">My Money</button></section>
  <section class="panel"><h2>Upcoming</h2>${jobs.filter(r => r.status === 'accepted').map(jobRow).join('') || '<p class="muted">No upcoming jobs.</p>'}</section></div>`;
}
export function proJobsScreen(s) {
  const tab = s.proJobsTab || 'new', jobs = jobsOf(s);
  const lists = {new: offersFor(s).map(r => offerRow(s, r)).join(''), upcoming: jobs.filter(r => ['accepted', 'on_the_way', 'in_progress', 'provider_done'].includes(r.status)).map(jobRow).join(''), done: jobs.filter(r => ['completed', 'paid', 'closed', 'cancelled'].includes(r.status)).map(jobRow).join('')};
  return `${head('My Jobs', 'New jobs near you, your upcoming visits and finished jobs.')}
  <div class="segmented" role="tablist">${[['new', 'New'], ['upcoming', 'Upcoming'], ['done', 'Done']].map(([k, l]) => `<button type="button" role="tab" class="${tab === k ? 'active' : ''}" aria-selected="${tab === k}" data-hs-tab="${k}">${l}</button>`).join('')}</div>
  <section class="panel">${lists[tab] || '<p class="muted">Nothing here yet.</p>'}</section>`;
}
function navBlock(r) {
  const lab = LOC.LABELS[r.address?.precision] || LOC.LABELS.area;
  return `<div class="hs-nav"><a class="button primary" target="_blank" rel="noopener" data-hs-nav href="${esc(LOC.navUrl(r.address, 'two-wheeler'))}">🧭 Navigate in Google Maps</a><small class="muted">${r.address?.precision === 'exact' ? 'Goes to the customer\'s door.' : r.address?.precision === 'approx' ? 'Goes to the pin. Check the landmark and call when close.' : 'Goes to the landmark / village. Call the customer when you are 1 km away.'}${lab.callKm ? ` We remind you to call at ${lab.callKm} km.` : ''}</small></div>`;
}
function proLive(r) {
  const d = distLeft(r), seen = lastSeenMin(r);
  return `<div class="hs-live"><b>${r.geo?.live ? '● Sharing your location' : 'Location not shared yet'}</b>${d != null ? ` · ${d.toFixed(1)} km to go · about ${etaOf(r)} min` : ''}${r.geo?.callPrompted && !r.arrivedAt ? `<div class="info-banner"><b>Call the customer now</b><span>You are close and the address is ${esc((LOC.LABELS[r.address?.precision] || LOC.LABELS.area).text.toLowerCase())}.</span><button class="button secondary compact" data-wx="call" data-name="${esc(r.customerName || 'Customer')}">📞 Call</button></div>` : ''}${r.arrivedAt ? '<p class="avail-chip">✓ Arrived — ask for the start code</p>' : ''}
  <div class="row-actions"><button type="button" class="button secondary compact" data-hs="share-live" data-id="${r.id}">Share live location (GPS)</button><button type="button" class="button text compact" data-hs="drive" data-id="${r.id}">Demo: drive 1 km</button></div>${seen != null && seen >= 2 ? `<small class="muted">Last update ${seen} min ago</small>` : ''}</div>`;
}
export function proJobScreen(s) {
  const r = jobsOf(s).find(x => x.id === s.selectedProJobId) || offersFor(s).find(x => x.id === s.selectedProJobId);
  if (!r) return proJobsScreen(s);
  const assigned = r.provider === 'homePro';
  const extraForm = `<form class="form-grid two" data-hs-extra="${r.id}"><label><span>Extra</span><select name="kind"><option value="extra_labour">Extra labour · ₹${EXTRA_HOUR}/hour</option></select></label><label><span>Hours</span><input name="qty" type="number" min="1" value="1"></label><label class="wide"><span>Why?</span><input name="note" placeholder="e.g. capacitor needs replacing"></label><button class="button secondary">Send to customer for approval</button></form>`;
  const actions = !assigned ? `<div class="row-actions"><button class="button secondary" data-hs="decline" data-id="${r.id}">Not for me</button><button class="button primary" data-hs="accept" data-id="${r.id}">Accept</button></div>`
    : r.status === 'accepted' ? `${navBlock(r)}<button class="button primary full" data-hs="on-the-way" data-id="${r.id}">On the way</button>${cancelBox(r)}`
    : r.status === 'on_the_way' ? `${navBlock(r)}${proLive(r)}<form class="form-grid two" data-hs-start="${r.id}"><label><span>Customer's 4-digit start code</span><input name="otp" inputmode="numeric" maxlength="4" autocomplete="off"></label><label><span>Before photo (optional)</span><input name="before" type="file" accept="image/*" capture="environment"></label><button class="button primary">Start job</button></form>${cancelBox(r)}`
    : r.status === 'in_progress' ? `${r.inspection ? (r.inspectionQuote?.status === 'approved' ? '<p class="avail-chip">✓ Quote approved — do the work</p>' : r.inspectionQuote?.status === 'proposed' ? `<p class="muted">Quote ${inr(r.inspectionQuote.amount)} sent. Waiting for the customer.</p>` : `<form class="form-grid two" data-hs-quote="${r.id}"><label><span>Full price ₹</span><input name="amount" type="number" min="500"></label><label class="wide"><span>What is included</span><input name="note" placeholder="2 rooms + hall, 2 coats, 3 days, paint included"></label><button class="button primary">Send quote</button></form>`) : `${r.waitingPart ? `<div class="info-banner"><b>Waiting for part</b><span>Return visit ${esc(r.waitingPart.date)}, ${esc(slotLabel(r.waitingPart.slot))} — free for the customer.</span><button class="button primary compact" data-hs="resume" data-id="${r.id}">Back on site</button></div>` : ''}${P.proForm(s, r)}${P.pending(r).length ? `<p class="muted">Waiting for the customer to approve ${P.pending(r).length} part${P.pending(r).length > 1 ? 's' : ''}.</p>` : ''}${P.statusList(r, {pro: true})}<details><summary class="button secondary compact">Add extra labour</summary>${extraForm}</details>${Bill.pendingExtras(r).length ? `<p class="muted">Waiting for the customer to approve ${Bill.pendingExtras(r).length} extra.</p>` : ''}
      ${r.waitingPart ? '' : `<details><summary class="button text compact">Part not available today?</summary><form class="inline-form" data-hs-wait="${r.id}"><input type="date" name="date" min="${todayIso()}" value="${addDays(todayIso(), 1)}" aria-label="Return date"><select name="slot" aria-label="Return time">${SLOTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input name="note" placeholder="Which part?" aria-label="Which part"><button class="button secondary compact">Pause · free return visit</button></form></details>`}`}
      <button type="button" class="button text compact" data-hs="fix-pin" data-id="${r.id}">📍 Fix pin — save my location as the customer's door</button>
      <form class="form-grid two" data-hs-done="${r.id}"><label class="wide"><span>Photo of the finished work</span><input name="after" type="file" accept="image/*" capture="environment"></label><button class="button primary">Mark done</button></form>
      <details><summary class="button text compact">No work possible?</summary><form class="inline-form" data-hs-nowork="${r.id}"><input name="reason" placeholder="e.g. part not available, customer away"><button class="button secondary compact">Close with ${inr(NO_WORK_CHARGE)} visit charge</button></form></details>`
    : `<p class="muted">${r.status === 'provider_done' ? 'Waiting for the customer to confirm and pay.' : r.paid ? 'Paid. Thank you!' : String(r.status).replace(/_/g, ' ')}</p>`;
  return `${head(r.title, `${r.id} · ${r.date} · ${slotLabel(r.slot)}`, r.conversationId && assigned ? `<button class="button secondary" data-op="open-conversation" data-id="${r.conversationId}">Customer chat</button>` : '')}
  <div class="grid two"><section class="panel"><h2>Job</h2><ul>${(r.items || []).map(x => { const it = itemOf(r.category, x.id); return it ? `<li>${esc(it[1])}${x.qty > 1 ? ` × ${x.qty}` : ''}</li>` : ''; }).join('')}</ul>${r.description ? `<p class="muted">“${esc(r.description)}”</p>` : ''}${r.photo ? `<p class="muted">Customer photo: ${esc(r.photo)}</p>` : ''}
    <p><b>${assigned ? esc(r.customerName || 'Customer') : 'Customer'}</b> ${LOC.labelChip(r.address)}<small class="block">${assigned ? esc(LOC.oneLine(r.address)) : `${esc(areaOf(r.address))} (full address after you accept)`}</small>${assigned && r.address?.landmark ? `<span class="hs-landmark">📌 ${esc(r.address.landmark)}${r.address.village ? ` · ${esc(r.address.village)}` : ''}</span>` : ''}${assigned && r.address?.voiceNote ? `<small class="block">🎙 Voice note: ${esc(r.address.voiceNote)}</small>` : ''}${assigned && r.address?.digipin ? `<small class="block muted">DIGIPIN ${esc(r.address.digipin)}</small>` : ''}</p>${assigned ? `<button class="button text compact" data-wx="call" data-name="${esc(r.customerName || 'Customer')}">📞 Call customer via MoveAI</button>` : ''}
    <p id="hs-pro-error" class="field-error" hidden></p>${actions}</section>
  ${Bill.partnerEarnings(s, r, 'partner')}</div>`;
}
const cancelBox = r => `<details class="cancel-box"><summary class="button text compact">Can't make it?</summary><form class="inline-form" data-hs-cancel="${r.id}"><input name="reason" placeholder="e.g. bike broke down" aria-label="Reason"><button class="button secondary compact">Give the job back</button></form><small class="muted">The next-best pro gets it at once. Cancelling lowers your reliability score.</small></details>`;
export function proMoneyScreen(s) {
  const paid = jobsOf(s).filter(r => r.paid);
  return `${head('My Money', 'Customers pay through MoveAI. Your share reaches your wallet when the job is paid; payout every Monday.')}${walletPanel(s, 'homePro')}
  <section class="panel"><h2>Paid jobs</h2>${paid.length ? paid.map(r => `<p class="price-line"><span>${esc(r.id)} · ${esc(r.title)}</span><b>${inr(earningOf(s, r))}</b></p>`).join('') : '<p class="muted">No paid jobs yet.</p>'}</section>`;
}
// ---------- pro set-up: training, work area, hours, bank ----------
const PARTS_Q = ['The job needs a new part. You…', ['Add it in the MoveAI app from a nearby shop so the customer approves the price', 'Buy it and add the cost in cash', 'Use any old part from your bag without telling'], 0];
export const QUIZ = {
  electrician: [['Before opening a switchboard you…', ['Switch off the MCB and check with a tester', 'Work fast with dry hands', 'Ask the customer to hold the wire'], 0], ['A new fan wobbles. First check…', ['Blade screws and the canopy balance', 'Change the capacitor', 'Run it at full speed'], 0]],
  plumber: [['Before changing a tap you…', ['Close the main valve and open the tap to drain', 'Wrap cloth around it and unscrew', 'Ask the customer to hold a bucket'], 0], ['A joint still drips after fitting. You…', ['Re-do it with Teflon tape and test for 2 minutes', 'Tell the customer it will stop', 'Add sealant on top'], 0]],
  carpenter: [['Before drilling a wall you…', ['Ask about pipes and wires and check with a detector', 'Drill where the customer points', 'Drill fast to finish'], 0], ['After fitting a shelf you…', ['Check it is level and test the load', 'Leave quickly', 'Ask the customer to test it'], 0]],
  cleaning: [['Mixing bleach with another cleaner is…', ['Never safe — use one product at a time', 'Fine for tough stains', 'Fine with the window open'], 0], ['On an expensive floor you…', ['Test the cleaner on a small hidden spot first', 'Use the strongest cleaner', 'Skip the floor'], 0]],
  painting: [['Before painting you…', ['Cover furniture and floors and fill cracks', 'Start painting straight away', 'Ask the customer to move everything'], 0], ['Damp patches on a wall need…', ['Waterproof primer before paint', 'Two extra coats', 'Nothing special'], 0]],
};
export const quizFor = p => [...(p.skills || []).slice(0, 2).flatMap(k => QUIZ[k] || []), PARTS_Q];
export function submitTraining(s, p, {watched, answers = []}) {
  if (!watched) return 'Watch the 5-minute safety and service video first.';
  const qs = quizFor(p), right = qs.filter((q, i) => Number(answers[i]) === q[2]).length;
  if (right < qs.length) return `${right} of ${qs.length} right. Read the questions again and try once more.`;
  p.trained = true; p.trainedAt = stamp(); return '';
}
export function saveArea(s, p, loc, radiusKm) {
  const at = loc && !loc.error ? LOC.point(loc) : null; if (!at) return loc?.error || 'Choose where you start from (use my location or search your area).';
  const r = Number(radiusKm); if (![3, 5, 10, 15].includes(r)) return 'Choose how far you will travel.';
  p.base = at; p.baseLabel = LOC.oneLine(loc); p.radiusKm = r; if (loc.city) p.city = loc.city; return '';
}
export function saveHours(s, p, {days = [], from, to}) {
  const d = days.map(Number).filter(x => x >= 0 && x <= 6), f = Number(from), t = Number(to);
  if (!d.length) return 'Choose at least one day.'; if (!(t > f)) return 'The end time must be after the start time.';
  p.hours = {days: d, from: f, to: t}; return '';
}
export function saveBank(s, p, {upi = '', account = '', ifsc = ''}) {
  const u = String(upi).trim(), a = String(account).replace(/\D/g, ''), i = String(ifsc).trim().toUpperCase();
  if (u) { if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test(u)) return 'Enter a UPI ID like name@okaxis.'; p.bank = {masked: u, kind: 'upi', at: stamp()}; return ''; }
  if (a.length < 9 || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(i)) return 'Enter your account number and IFSC (like SBIN0001234), or a UPI ID.';
  p.bank = {masked: `XXXX${a.slice(-4)}`, ifsc: i, kind: 'account', at: stamp()}; return '';
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const hoursText = p => { const h = p.hours || {days: [0, 1, 2, 3, 4, 5, 6], from: 8, to: 20}; return `${h.days.length === 7 ? 'Every day' : h.days.map(d => DAYS[d]).join(', ')} · ${h.from}:00–${h.to}:00`; };
export const setupGaps = p => [!p.trained && ['train', 'Training video + short quiz → ✓ Trained badge'], !p.base && ['area', 'Your work area and how far you travel'], !p.hours && ['hours', 'Days and hours you work'], !p.bank && ['bank', 'Bank or UPI for payouts']].filter(Boolean);
export function proProfileScreen(s) {
  const p = proOf(s); if (!p) return head('Profile', 'No home-service profile yet.');
  const h = p.hours || {days: [0, 1, 2, 3, 4, 5, 6], from: 8, to: 20}, qs = quizFor(p), open = s.proProfileOpen || '';
  const hrs = n => Array.from({length: 17}, (_, i) => i + 6).map(x => `<option value="${x}" ${x === n ? 'selected' : ''}>${x}:00</option>`).join('');
  return `${head('My profile', `${p.name} · ${p.city}${p.trained ? ' · ✓ Trained' : ''}`)}
  <form class="panel form-panel narrow" id="hs-profile-form"><h2>Work I do</h2><div class="check-grid">${Object.entries(CATS).map(([k, c]) => `<label><input type="checkbox" name="skills" value="${k}" ${(p.skills || []).includes(k) ? 'checked' : ''}> ${c.icon} ${esc(c.label)}</label>`).join('')}</div>
  <label><span>Town or city</span><input name="city" value="${esc(p.city)}"></label><div class="review-checklist"><span class="${p.verified ? 'done' : ''}">${p.verified ? '✓' : '○'} ID verified (Aadhaar OTP + selfie)</span><span class="${p.trained ? 'done' : ''}">${p.trained ? '✓' : '○'} Safety and service training</span></div><p class="field-error" id="hs-profile-error" hidden></p><button class="button primary">Save</button></form>
  <details class="panel" data-hs-section="train" ${open === 'train' || (!p.trained && !open) ? 'open' : ''}><summary><b>${p.trained ? '✓ Trained' : '○ Get the Trained badge'}</b> <small class="muted">5-minute video + ${qs.length} questions · customers see the badge</small></summary>
    ${p.trained ? `<p class="avail-chip">✓ Trained on ${esc(p.trainedAt || '')}</p>` : `<form id="hs-train-form" class="form-grid"><div class="hs-video"><b>▶ Safety and service video (5 min)</b><small>Switching off power, water and gas · tools · behaving in a customer's home · photos before and after · parts only through the app</small><label class="check-inline"><input type="checkbox" name="watched"> I watched the video</label></div>
    ${qs.map(([q, opts], i) => `<fieldset class="wide"><legend>${i + 1}. ${esc(q)}</legend>${opts.map((o, j) => `<label class="check-inline"><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}<p class="field-error" id="hs-train-error" hidden></p><button class="button primary">Submit answers</button></form>`}</details>
  <details class="panel" data-hs-section="area" ${open === 'area' ? 'open' : ''}><summary><b>${p.base ? '✓' : '○'} Work area</b> <small class="muted">${p.base ? `${esc(p.baseLabel || p.city)} · up to ${p.radiusKm || 10} km` : 'Jobs come only from inside this area'}</small></summary>
    <form id="hs-area-form">${LOC.pickerHtml(s, 'pro-base', {title: 'Where do you start from?'})}<label><span>How far will you travel?</span><select name="radius">${[3, 5, 10, 15].map(k => `<option value="${k}" ${(p.radiusKm || 10) === k ? 'selected' : ''}>${k} km</option>`).join('')}</select></label><p class="field-error" id="hs-area-error" hidden></p><button class="button primary">Save work area</button></form></details>
  <details class="panel" data-hs-section="hours" ${open === 'hours' ? 'open' : ''}><summary><b>${p.hours ? '✓' : '○'} When I work</b> <small class="muted">${esc(hoursText(p))}</small></summary>
    <form id="hs-hours-form" class="form-grid two"><div class="chip-choices wide">${DAYS.map((d, i) => `<label class="check-inline"><input type="checkbox" name="days" value="${i}" ${h.days.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div><label><span>From</span><select name="from">${hrs(h.from)}</select></label><label><span>To</span><select name="to">${hrs(h.to)}</select></label><p class="field-error wide" id="hs-hours-error" hidden></p><button class="button primary">Save hours</button></form></details>
  <details class="panel" data-hs-section="bank" ${open === 'bank' ? 'open' : ''}><summary><b>${p.bank ? '✓' : '○'} Bank for payouts</b> <small class="muted">${p.bank ? esc(p.bank.masked) : 'Needed before your first payout — you can take jobs now'}</small></summary>
    <form id="hs-bank-form" class="form-grid two"><label class="wide"><span>UPI ID</span><input name="upi" placeholder="name@okaxis"></label><small class="muted wide">or bank account</small><label><span>Account number</span><input name="account" inputmode="numeric"></label><label><span>IFSC</span><input name="ifsc" placeholder="SBIN0001234"></label><p class="field-error wide" id="hs-bank-error" hidden></p><button class="button primary">Save</button></form></details>`;
}
export function adminScreen(s) {
  const tab = s.hsAdminTab || 'bookings', rows = adminRows(s), active = pros(s).filter(p => p.active !== false), queue = P.reviewQueue(s), wide = widened(s);
  const tabs = `<div class="segmented" role="tablist">${[['bookings', `Bookings (${rows.length})`], ['pros', `Pros (${pros(s).length})`], ['parts', `Part prices (${queue.length})`]].map(([k, l]) => `<button type="button" role="tab" class="${tab === k ? 'active' : ''}" aria-selected="${tab === k}" data-hs-admin-tab="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'bookings') body = `${wide.length ? `<section class="panel"><h2>Area widened (${wide.length})</h2>${wide.map(r => `<p class="price-line"><span>${esc(r.id)} · ${esc(CATS[r.category].label)} · ${esc(areaOf(r.address))}</span><b>${r.dispatch.exhausted ? 'Nobody within 15 km' : r.status === 'searching' ? `Searching · ${r.dispatch.radiusKm} km` : `${esc(r.providerName || '')} · ${r.dispatch.winner?.km ?? '—'} km`}</b></p>`).join('')}</section>` : ''}
  <section class="panel"><div class="table-wrap"><table class="price-table"><thead><tr><th>Booking</th><th>When</th><th>Status</th><th>Pro</th><th>Last location</th><th></th></tr></thead><tbody>${rows.map(({r, flag}) => `<tr data-hs-admin="${r.id}"><td><b>${esc(r.id)}</b><small class="block">${esc(r.title)}</small></td><td>${esc(r.date)} ${esc(slotLabel(r.slot))}</td><td>${esc(String(r.status).replace(/_/g, ' '))}${flag || r.dispatch?.exhausted ? `<small class="block field-error">${esc(flag || 'No eligible pro within 15 km')}</small>` : ''}${r.dispatch?.round ? `<small class="block muted">Round ${r.dispatch.round} · ${r.dispatch.radiusKm} km</small>` : ''}</td><td>${esc(r.providerName || '—')}${r.dispatch?.winner ? `<small class="block muted">score ${r.dispatch.winner.total}</small>` : ''}</td><td>${proHere(r) ? `${distLeft(r) != null ? `${distLeft(r).toFixed(1)} km from customer` : 'shared'} · ${lastSeenMin(r) ? `${lastSeenMin(r)} min ago` : 'now'}` : '—'}</td><td>${r.status === 'searching' ? `<select name="pro" aria-label="Pro">${active.filter(p => (p.skills || []).includes(r.category)).concat(active.filter(p => !(p.skills || []).includes(r.category))).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="button secondary compact" data-hs="admin-assign" data-id="${r.id}">Give to pro</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">No bookings yet.</td></tr>'}</tbody></table></div></section>`;
  if (tab === 'pros') body = `<section class="panel"><div class="table-wrap"><table class="price-table" data-hs-pros><thead><tr><th>Pro</th><th>Trades</th><th>Area</th><th>Rating</th><th>Reliability</th><th>Strikes</th><th></th></tr></thead><tbody>${pros(s).map(p => { const st = D.stats(p), rt = proRating(s, p), rel = Math.max(0, 100 - 25 * (st.cancels || 0) - 40 * (st.noShows || 0) - 10 * (st.late || 0));
    return `<tr data-hs-pro="${p.id}"><td><b>${esc(p.name)}</b><small class="block">${p.verified ? '✓ ID' : 'ID pending'}${p.trained ? ' · ✓ Trained' : ''}${p.ws ? ' · app' : ''}</small></td><td>${esc((p.skills || []).map(k => CATS[k]?.label).filter(Boolean).join(', '))}</td><td>${esc(p.city || '')}${p.radiusKm ? ` · ${p.radiusKm} km` : ''}</td><td>★ ${rt.avg || 'New'}${rt.n ? ` (${rt.n})` : ''}</td><td>${rel}%<small class="block muted">${st.cancels || 0} cancels · ${st.noShows || 0} no-shows</small></td><td>${st.strikes || 0}</td><td><button class="button ${p.active === false ? 'primary' : 'secondary'} compact" data-hs-pause="${p.id}">${p.active === false ? 'Resume' : 'Pause'}</button></td></tr>`; }).join('')}</tbody></table></div></section>`;
  if (tab === 'parts') body = `<section class="panel"><h2>Part prices to check</h2><p class="muted">Market bills priced higher than usual and prices customers reported. Compare the bill and MRP photo with MoveAI shop prices. Refund gives the customer the difference and adds a strike to the pro.</p>${queue.length ? queue.map(({r, p}) => `<div class="document-row" data-part-review="${p.id}"><span class="document-icon">🔧</span><span class="document-copy"><b>${esc(p.name)} × ${p.qty} · ${inr(p.price)} (MRP ${inr(p.mrp)})</b><small>${esc(r.id)} · ${esc(r.providerName || '')} · ${p.shopName ? esc(p.shopName) : `market bill ${esc(p.bill || '')} · MRP photo ${esc(p.mrpPhoto || '')}`} · usual ${p.usual || P.usualPrice(s, p.name) ? inr(p.usual || P.usualPrice(s, p.name)) : 'unknown'}${p.report ? ` · customer: “${esc(p.report.note)}”` : ' · flagged higher than usual'}</small></span><span class="row-actions"><button class="button primary compact" data-part-resolve="${r.id}|${p.id}|refund">Refund ${inr(P.overcharge(s, p))}</button><button class="button secondary compact" data-part-resolve="${r.id}|${p.id}|dismiss">Price is fair</button></span></div>`).join('') : '<p class="muted">Nothing to check.</p>'}</section>`;
  return `${head('Home services', 'Bookings, pros and part prices. Jobs nobody has taken are flagged so you can give them to a pro.')}${tabs}${body}`;
}

export const ROUTES = {homeBook: bookScreen, proJobs: proJobsScreen, proJob: proJobScreen, proProfile: proProfileScreen, homeServicesAdmin: adminScreen, partItem: P.itemScreen};
export function screen(route, s) {
  if (s.currentWorkspace === 'homePro' && route === 'home') return proHomeScreen(s);
  if (s.currentWorkspace === 'homePro' && route === 'money') return proMoneyScreen(s);
  if (s.currentWorkspace === 'homePro' && route === 'profile') return proProfileScreen(s);
  return ROUTES[route] ? ROUTES[route](s) : '';
}

// ---------- bindings ----------
let watchId = null;
const fileName = (form, n) => form.querySelector(`[name="${n}"]`)?.files?.[0]?.name || '';
export function bind(root, api) {
  const S = () => api.getState(), ws = () => S().currentWorkspace;
  const err = (id, m) => { const e = root.querySelector('#' + id); if (e) { e.textContent = m; e.hidden = !m; e.scrollIntoView?.({block: 'center'}); } else api.toast(m); };
  const book = root.querySelector('#home-book-form');
  if (book) {
    const keep = (pick) => { const s = S(), d = draftOf(s), f = new FormData(book);
      if (book.querySelector('[name="description"]')) d.description = f.get('description') || '';
      if (book.querySelector('[name="photo"]')) { const ph = fileName(book, 'photo'); if (ph) d.photo = ph; }
      if (book.querySelector('[name="date"]')) { d.date = WIZ.readDate(f, d.date); d.slot = f.get('slot') || ''; }
      if (book.querySelector('[name="addressId"]')) d.addressId = f.get('addressId') || d.addressId;
      if (book.querySelector('[name="addrName"]')) { d.addrName = f.get('addrName'); d.saveAddress = f.has('saveAddress'); }
      if (pick !== false && book.querySelector('[data-loc-picker="hs-addr"]')) LOC.readPicker(book, s, 'hs-addr'); };
    const redraw = () => { api.save(); api.render(); };
    LOC.bind(book, api, {onChange: () => { keep(false); redraw(); }});
    book.querySelectorAll('[data-hs-cat]').forEach(r => r.onchange = () => { keep(); const d = draftOf(S()); d.category = r.value; d.qty = {}; redraw(); });
    book.querySelectorAll('[data-hs-qty]').forEach(b => b.onclick = () => { keep(); const d = draftOf(S()), k = b.dataset.hsQty; d.qty[k] = Math.max(0, Math.min(10, (d.qty[k] || 0) + Number(b.dataset.d))); redraw(); });
    book.querySelectorAll('[data-hs-addr], [data-wiz-field]').forEach(x => x.addEventListener('change', () => { keep(); redraw(); }));
    book.querySelectorAll('[data-wiz-go]').forEach(b => b.onclick = () => { keep(); draftOf(S()).step = Number(b.dataset.wizGo); redraw(); });
    book.querySelector('[data-wiz="back"]')?.addEventListener('click', () => { keep(); const d = draftOf(S()); d.step = Math.max(1, (d.step || 1) - 1); redraw(); });
    book.onsubmit = e => {
      e.preventDefault(); keep(); const s = S(), d = draftOf(s), step = d.step || 1;
      const se = bookStepError(s, step); if (se) return err('home-book-error', se);
      if (step < 4) { d.step = step + 1; if (d.step === 3 && !d.date) d.date = WIZ.defaultDate(); return redraw(); }
      const v = {category: d.category, items: Object.entries(d.qty || {}).map(([id, qty]) => ({id, qty})), description: d.description, photo: d.photo || '', date: d.date, slot: d.slot, favouriteProId: d.favouriteProId || null,
        addressId: d.addressId && d.addressId !== 'new' ? d.addressId : null, address: null, saveAddress: d.saveAddress !== false};
      if (!v.addressId) { const loc = LOC.finalLocation(s, 'hs-addr'); if (loc.error) { d.step = 2; return err('home-book-error', loc.error); } v.address = {...loc, name: d.addrName || 'Home'}; }
      const r = createBooking(s, v, {pricing: api.pricing?.(s, 'general') || null});
      if (r.error) return err('home-book-error', r.error);
      s.homeDraft = null; if (s.locDrafts) delete s.locDrafts['hs-addr']; api.save(); api.navigate('serviceDetail');
      api.toast(r.favourite ? `Booked. We asked ${proById(s, v.favouriteProId)?.name || 'your pro'} first.` : r.request.status === 'accepted' ? `Booked. ${r.request.providerName} will come.` : r.notified ? 'Booked. We sent your job to the best-matched verified pros near you.' : 'Booked. We are looking for a pro near you.');
    };
  }
  const act = {
    accept: id => acceptJob(S(), ws(), id), decline: id => declineJob(S(), ws(), id), 'on-the-way': id => onTheWay(S(), ws(), id),
    'quote-approve': id => decideQuote(S(), id, 'approve'), 'quote-decline': id => decideQuote(S(), id, 'decline'),
    'admin-assign': (id, b) => adminAssign(S(), id, b.closest('tr')?.querySelector('[name="pro"]')?.value),
    drive: id => demoDrive(S(), ws(), id, 1), 'fix-pin': id => fixPin(S(), ws(), id),
    'time-passes': id => D.timePasses(S(), job(S(), id)), 'choose-quote': (id, b) => chooseQuote(S(), id, b.dataset.pro),
    'demo-pro-step': id => D.demoProStep(S(), job(S(), id)), resume: id => P.resume(S(), ws(), id),
    'cust-share-demo': id => { const r = job(S(), id), sp = /^845/.test(r?.address?.pincode || '') ? LOC.DEMO_SPOTS.motihari : /^80/.test(r?.address?.pincode || '') ? LOC.DEMO_SPOTS.patna : LOC.DEMO_SPOTS.noida; return customerShares(S(), id, sp.at[0], sp.at[1]); },
  };
  root.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => {
    const k = b.dataset.hs, id = b.dataset.id, s = S();
    if (k === 'toggle-online') { const st = ((s.workerStatus ||= {}).homePro ||= {online: true}); st.online = !st.online; api.save(); return api.render(); }
    if (k === 'open') { s.selectedProJobId = id; api.save(); return api.navigate('proJob'); }
    if (k === 'book-again') { const r = job(s, id), a = addresses(s).find(x => x.line === r.address?.line); s.homeDraft = {step: 1, category: r.category, qty: {}, date: '', slot: '', addressId: a?.id || addresses(s)[0]?.id || 'new', favouriteProId: r.proId}; api.save(); return api.navigate('homeBook'); }
    if (k === 'share-live' || k === 'cust-share') {
      if (!navigator.geolocation) return api.toast('This phone cannot share location. Use the demo button.');
      const fn = k === 'share-live' ? p => shareLocation(S(), ws(), id, p.coords.latitude, p.coords.longitude, 'gps') : p => customerShares(S(), id, p.coords.latitude, p.coords.longitude);
      if (k === 'share-live') { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = navigator.geolocation.watchPosition(p => { const e = fn(p); if (e) { navigator.geolocation.clearWatch(watchId); watchId = null; } api.save(); api.render(); }, e => api.toast(`Location permission needed (${e.message})`), {enableHighAccuracy: true, maximumAge: 10000}); }
      else navigator.geolocation.getCurrentPosition(p => { const e = fn(p); if (e) return api.toast(e); api.save(); api.render(); api.toast('Location shared with the pro'); }, e => api.toast(`Location permission needed (${e.message})`), {enableHighAccuracy: true, timeout: 10000});
      return api.toast(k === 'share-live' ? 'Sharing your location until the job starts' : 'Asking for location permission…');
    }
    const e = act[k]?.(id, b); if (e) return err(root.querySelector('#hs-pro-error') ? 'hs-pro-error' : 'none', e);
    if (k === 'accept') { const r = job(s, id); if (r?.provider !== ws()) { api.save(); api.render(); return api.toast('Accepted. If other pros also accept, the closest best-rated one gets it.'); } s.selectedProJobId = id; api.save(); api.navigate('proJob'); return api.toast('Job accepted. The customer has been told.'); }
    api.save(); api.render(); api.toast({drive: 'Moved 1 km (demo)', 'fix-pin': 'Saved as the exact door for next time', 'cust-share-demo': 'Location shared with the pro', decline: 'Hidden from your list', 'on-the-way': 'Customer told you are on the way', 'quote-approve': 'Quote approved', 'quote-decline': 'Quote declined · nothing to pay', 'admin-assign': 'Given to the pro', 'time-passes': '60 seconds passed (demo)', 'choose-quote': 'Quote chosen · the painter is booked', 'demo-pro-step': 'Done (demo)', resume: 'Back on site'}[k] || 'Done');
  });
  root.querySelectorAll('[data-hs-tab]').forEach(b => b.onclick = () => { S().proJobsTab = b.dataset.hsTab; api.save(); api.render(); });
  root.querySelectorAll('[data-hs-admin-tab]').forEach(b => b.onclick = () => { S().hsAdminTab = b.dataset.hsAdminTab; api.save(); api.render(); });
  root.querySelectorAll('[data-hs-pause]').forEach(b => b.onclick = () => { const p = proById(S(), b.dataset.hsPause); setPaused(S(), p.id, p.active !== false); api.save(); api.render(); api.toast(p.active === false ? `${p.name} paused — gets no new jobs` : `${p.name} can get jobs again`); });
  const form = (sel, fn, ok) => root.querySelectorAll(sel).forEach(f => f.onsubmit = e => { e.preventDefault(); const r = fn(f, new FormData(f)); const m = typeof r === 'string' ? r : r?.error; if (m) return err(root.querySelector('#hs-pro-error') ? 'hs-pro-error' : 'none', m); api.save(); api.render(); api.toast(ok); });
  form('[data-hs-start]', (f, d) => startJob(S(), ws(), f.dataset.hsStart, d.get('otp'), fileName(f, 'before')), 'Job started');
  form('[data-hs-extra]', (f, d) => proposeExtra(S(), ws(), f.dataset.hsExtra, {kind: d.get('kind'), qty: d.get('qty'), amount: d.get('amount'), note: d.get('note'), proof: fileName(f, 'proof')}), 'Sent to the customer for approval');
  form('[data-hs-quote]', (f, d) => sendQuote(S(), ws(), f.dataset.hsQuote, {amount: d.get('amount'), note: d.get('note')}), 'Quote sent');
  form('[data-hs-done]', (f) => markDone(S(), ws(), f.dataset.hsDone, {afterPhoto: fileName(f, 'after')}), 'Marked done · the customer will confirm and pay');
  form('[data-hs-nowork]', (f, d) => markDone(S(), ws(), f.dataset.hsNowork, {noWork: true, reason: d.get('reason')}), 'Closed with the visit charge');
  form('[data-hs-pquote]', (f, d) => sendProQuote(S(), ws(), f.dataset.hsPquote, {amount: d.get('amount'), note: d.get('note')}), 'Price sent · the customer compares up to 3 quotes');
  form('[data-hs-wait]', (f, d) => P.waitForPart(S(), ws(), f.dataset.hsWait, {date: d.get('date'), slot: d.get('slot'), note: d.get('note')}), 'Paused · the customer knows the return visit is free');
  root.querySelectorAll('[data-hs-cancel]').forEach(f => f.onsubmit = e => { e.preventDefault(); const er = cancelByPro(S(), ws(), f.dataset.hsCancel, new FormData(f).get('reason')); if (er) return err(root.querySelector('#hs-pro-error') ? 'hs-pro-error' : 'none', er); api.save(); api.navigate('proJobs'); api.toast('Job handed to the next pro'); });
  P.bind(root, api);
  form('[data-hs-resched]', (f, d) => reschedule(S(), f.dataset.hsResched, d.get('date'), d.get('slot')), 'Visit moved');
  root.querySelectorAll('[data-hs-rework]').forEach(f => f.onsubmit = e => { e.preventDefault(); const d = new FormData(f); const r = requestRework(S(), f.dataset.hsRework, {problem: d.get('problem'), date: d.get('date'), slot: d.get('slot')}); if (r.error) return api.toast(r.error); api.save(); api.navigate('serviceDetail'); api.toast('Free re-work booked with the same pro'); });
  root.querySelectorAll('[data-hs-activate]').forEach(b => b.onclick = () => { const s = S(), c = (s.candidates || []).find(x => x.id === b.dataset.hsActivate); const e = activatePro(s, c); if (e) return api.toast(e); api.save(); api.toast('Your home-service jobs are ready'); if (api.switchTo) api.switchTo('homePro'); else api.render(); });
  root.querySelectorAll('[data-hs-setup-open]').forEach(b => b.onclick = () => { S().proProfileOpen = b.dataset.hsSetupOpen; api.save(); api.navigate('profile'); });
  const pf = (id, fn, ok, sec) => root.querySelector(id)?.addEventListener('submit', e => { e.preventDefault(); const s = S(), p = proOf(s), er = fn(s, p, new FormData(e.currentTarget), e.currentTarget); if (er) return err(`${id.slice(1)}-error`.replace('-form-error', '-error'), er); s.proProfileOpen = sec; api.save(); api.render(); api.toast(ok); });
  pf('#hs-train-form', (s, p, d) => submitTraining(s, p, {watched: d.has('watched'), answers: quizFor(p).map((_, i) => d.get(`q${i}`))}), 'Well done — you are Trained. Customers now see the badge.', '');
  if (root.querySelector('#hs-area-form')) LOC.bind(root.querySelector('#hs-area-form'), api, {onChange: () => { S().proProfileOpen = 'area'; api.save(); api.render(); }});
  pf('#hs-area-form', (s, p, d, f) => { LOC.readPicker(f, s, 'pro-base'); return saveArea(s, p, LOC.finalLocation(s, 'pro-base'), d.get('radius')); }, 'Work area saved. Jobs come from inside it.', '');
  pf('#hs-hours-form', (s, p, d) => saveHours(s, p, {days: d.getAll('days'), from: d.get('from'), to: d.get('to')}), 'Working hours saved', '');
  pf('#hs-bank-form', (s, p, d) => saveBank(s, p, {upi: d.get('upi'), account: d.get('account'), ifsc: d.get('ifsc')}), 'Saved. Payouts go here every Monday.', '');
  root.querySelector('#hs-profile-form')?.addEventListener('submit', e => { e.preventDefault(); const s = S(), p = proOf(s), d = new FormData(e.currentTarget); const skills = d.getAll('skills'); if (!skills.length) return err('hs-profile-error', 'Choose at least one kind of work.'); p.skills = skills; p.city = String(d.get('city') || p.city).trim(); api.save(); api.render(); api.toast('Profile saved'); });
}
