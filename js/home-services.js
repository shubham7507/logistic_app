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
  const a = v.addressId ? addresses(s).find(x => x.id === v.addressId) : v.address;
  if (!a || !String(a.line || '').trim() || !/^\d{6}$/.test(String(a.pincode || ''))) return 'Add the address with house number, area and a 6-digit PIN code.';
  return slotError(v.date, v.slot);
}
export function createBooking(s, v, {pricing = null} = {}) {
  const err = validateBooking(s, v); if (err) return {error: err};
  const c = CATS[v.category];
  let address = v.addressId ? addresses(s).find(x => x.id === v.addressId) : {...v.address, line: String(v.address.line).trim()};
  if (!v.addressId && v.saveAddress) { address = {id: uid('AD'), label: v.address.label || 'Home', ...address}; addresses(s).push(address); }
  const items = c.inspection ? [{id: 'inspect', qty: 1}] : v.items.filter(x => itemOf(v.category, x.id) && x.qty > 0).map(x => ({id: x.id, qty: Math.min(10, Number(x.qty) || 1)}));
  const first = itemOf(v.category, items[0].id)[1];
  const id = uid('SR');
  const r = {id, customer: 'personal', customerName: s.person?.name || 'Customer', type: 'general', category: v.category, title: `${c.label} · ${first}${items.length > 1 ? ` + ${items.length - 1} more` : ''}`,
    items, inspection: !!c.inspection, description: String(v.description || '').trim(), photo: v.photo || '', address: {label: address.label || 'Home', line: address.line, pincode: address.pincode, city: address.city || ''},
    date: v.date, slot: v.slot, quote: quoteFor(v.category, items), pricing, status: 'searching', provider: null, providerName: null, proId: null, paid: false, rating: null, extras: [],
    startOtp: String(1000 + Math.floor(Math.random() * 9000)), createdAt: stamp(), createdAtMs: clock(), timeline: [{at: stamp(), text: 'Booked'}], conversationId: null, payMigrated: true};
  s.serviceRequests.unshift(r); s.selectedServiceId = id;
  const near = pros(s).filter(p => p.ws && p.active !== false && (p.skills || []).includes(v.category));
  near.forEach(p => notify(s, p.ws, `New ${c.label.toLowerCase()} job ${id} · ${slotLabel(v.slot)} ${v.date} · ${areaOf(r.address)} · you earn ${inr(earningOf(s, r))}`, id, 'proJobs'));
  return {request: r, notified: near.length};
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
export function offersFor(s, ws = 'homePro') {
  const p = proOf(s, ws); if (!p) return [];
  return (s.serviceRequests || []).filter(r => r.type === 'general' && r.status === 'searching' && (p.skills || []).includes(r.category) && !(r.declinedBy || []).includes(p.id));
}
export const jobsOf = (s, ws = 'homePro') => (s.serviceRequests || []).filter(r => r.type === 'general' && r.provider === ws);
export function acceptJob(s, ws, id) {
  const p = proOf(s, ws), r = job(s, id);
  if (!p) return 'Set up your home-service profile first.';
  if (!p.verified) return 'Finish ID verification before taking jobs.';
  if (!r || r.status !== 'searching') return 'This job was taken by another pro or cancelled.';
  if (!(p.skills || []).includes(r.category)) return `Add ${CATS[r.category].label} to your skills to take this job.`;
  const blocked = partnerBlocked(s, ws); if (blocked) return blocked;
  const clash = jobsOf(s, ws).find(x => x.date === r.date && x.slot === r.slot && ['accepted', 'on_the_way', 'in_progress'].includes(x.status));
  if (clash) return `You already have ${clash.id} in this slot.`;
  Object.assign(r, {status: 'accepted', provider: ws, providerName: p.name, proId: p.id, acceptedAt: stamp(), conversationId: `CNV-${r.id}`});
  (s.conversations ||= []).unshift({id: r.conversationId, kind: 'job', ref: r.id, title: `${r.id} · ${CATS[r.category].label} visit`, participants: ['personal', ws], status: 'open', messages: [{id: uid('M'), from: `${p.name} · ${CATS[r.category].label}`, type: 'text', body: `Namaste, I am ${p.name}. I will come on ${r.date}, ${slotLabel(r.slot)}.`, at: stamp()}]});
  r.timeline.push({at: stamp(), text: `${p.name} accepted`});
  const rt = proRating(s, p);
  notify(s, 'personal', `${r.id}: ${p.name} (★${rt.avg}, ID verified) will come on ${r.date}, ${slotLabel(r.slot)}.`, r.id, 'serviceDetail');
  return '';
}
export function declineJob(s, ws, id) {
  const p = proOf(s, ws), r = job(s, id); if (!p || !r) return 'Job not found.';
  (r.declinedBy ||= []).push(p.id); return '';
}
export function onTheWay(s, ws, id) {
  const r = mine(s, ws, id); if (!r || r.status !== 'accepted') return 'Accept the job first.';
  r.status = 'on_the_way'; r.etaMins = 25; r.timeline.push({at: stamp(), text: 'On the way'});
  notify(s, 'personal', `${r.id}: ${r.providerName} is on the way (about 25 min). Share your start code ${r.startOtp} only when they reach your door.`, r.id, 'serviceDetail');
  return '';
}
export function startJob(s, ws, id, otp, beforePhoto = '') {
  const r = mine(s, ws, id); if (!r || r.status !== 'on_the_way') return 'Tap "On the way" first.';
  if (String(otp || '').trim() !== r.startOtp) { r.otpTries = (r.otpTries || 0) + 1; return r.otpTries >= 3 ? 'Wrong code 3 times. Ask the customer to read the code from their MoveAI app, or call support.' : 'That code is wrong. Ask the customer for the 4-digit start code in their app.'; }
  r.status = 'in_progress'; r.startedAt = stamp(); if (beforePhoto) r.beforePhoto = beforePhoto; r.timeline.push({at: stamp(), text: r.inspection ? 'Inspection started' : 'Work started'});
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
  return (s.serviceRequests || []).filter(r => r.type === 'general').map(r => ({r, flag: stillSearching(s, r) ? 'No pro yet after 30 min' : r.status === 'searching' && r.date < todayIso() ? 'Slot passed' : ''}));
}
export function adminAssign(s, id, proId) {
  const r = job(s, id), p = proById(s, proId); if (!r || r.status !== 'searching' || !p?.ws) return 'Only an unassigned job can be given to an active pro.';
  if (!(p.skills || []).includes(r.category)) (p.skills ||= []).push(r.category);
  return acceptJob(s, p.ws, id);
}

// Sign-up: a verified "Home service pro" candidate gets the pro workspace (MoveAI Partner).
export function activatePro(s, c) {
  if (!c || c.workerType !== 'homePro') return 'Not a home-service sign-up.';
  if ((c.level || 1) < 2) return 'Verify your ID and selfie first.';
  for (const p of pros(s)) if (p.ws === 'homePro' && p.candidateId !== c.id) p.ws = null;
  let p = pros(s).find(x => x.candidateId === c.id);
  const skills = (c.skills || []).map(x => Object.keys(CATS).find(k => CATS[k].label === x || k === x)).filter(Boolean);
  if (!p) { p = {id: `HP-${c.id}`, candidateId: c.id, name: c.name, mobile: c.mobile, city: c.locations?.[0] || '', skills, rating: 0, ratingCount: 0, jobsDone: 0, verified: true, trained: false, active: true}; (s.homePros ||= []).push(p); }
  Object.assign(p, {ws: 'homePro', skills: skills.length ? skills : p.skills, verified: true});
  if (!(s.workspaces ||= []).includes('homePro')) s.workspaces.push('homePro');
  return '';
}

// ---------- customer screens ----------
const draftOf = s => (s.homeDraft ||= {category: 'electrician', qty: {}, date: '', slot: '', addressId: addresses(s)[0]?.id || 'new'});
export function bookScreen(s) {
  const d = draftOf(s), c = CATS[d.category] || CATS.electrician, cat = CATS[d.category] ? d.category : 'electrician';
  const minDate = todayIso(), date = d.date && d.date >= minDate ? d.date : (freeSlots(minDate).length ? minDate : addDays(minDate, 1));
  const items = Object.entries(d.qty || {}).filter(([k, q]) => q > 0 && itemOf(cat, k)).map(([id, qty]) => ({id, qty}));
  const q = quoteFor(cat, c.inspection ? [{id: 'inspect', qty: 1}] : items);
  const slots = SLOTS.map(([k, l]) => { const bad = slotError(date, k); return `<label class="slot-chip ${bad ? 'disabled' : ''}"><input type="radio" name="slot" value="${k}" ${d.slot === k && !bad ? 'checked' : ''} ${bad ? 'disabled' : ''}><span>${l}</span></label>`; }).join('');
  const saved = addresses(s);
  return `${head('Home services', 'Choose the job, see the fixed price, pick a time. Pay after the work is done.')}
  <form id="home-book-form" class="panel form-panel narrow">
    <fieldset><legend>What do you need?</legend><div class="hs-cats">${Object.entries(CATS).map(([k, x]) => `<label class="hs-cat ${k === cat ? 'selected' : ''}"><input type="radio" name="category" value="${k}" ${k === cat ? 'checked' : ''} data-hs-cat><span aria-hidden="true">${x.icon}</span><b>${esc(x.label)}</b></label>`).join('')}</div></fieldset>
    ${c.inspection ? `<div class="info-banner"><b>Free inspection, then a fixed quote</b><span>A painter visits, measures and sends a written quote in the app. You pay only if you approve it.</span></div>`
      : `<fieldset><legend>Choose jobs</legend><div class="hs-items">${c.items.map(([k, l, p]) => `<div class="hs-item"><span><b>${esc(l)}</b><small>${inr(p)}</small></span><span class="qty"><button type="button" class="button secondary compact" data-hs-qty="${k}" data-d="-1" aria-label="Fewer ${esc(l)}">−</button><output data-hs-count="${k}">${d.qty?.[k] || 0}</output><button type="button" class="button secondary compact" data-hs-qty="${k}" data-d="1" aria-label="More ${esc(l)}">+</button></span></div>`).join('')}</div></fieldset>`}
    <div class="form-grid"><label class="wide"><span>${c.inspection ? 'What needs painting?' : 'Anything the pro should know? (optional)'}</span><textarea name="description" rows="2" placeholder="${c.inspection ? 'e.g. 2 bedrooms and hall, walls only, some damp patches' : 'e.g. fan makes noise and wobbles'}">${esc(d.description || '')}</textarea></label>
    <label class="wide"><span>Photo of the problem (optional)</span><input type="file" name="photo" accept="image/*"></label></div>
    <fieldset><legend>Address</legend><div class="hs-addresses">${saved.map(a => `<label class="hs-address"><input type="radio" name="addressId" value="${a.id}" ${d.addressId === a.id ? 'checked' : ''}><span><b>${esc(a.label)}</b><small>${esc(a.line)} · ${esc(a.pincode)}</small></span></label>`).join('')}<label class="hs-address"><input type="radio" name="addressId" value="new" ${d.addressId === 'new' || !saved.length ? 'checked' : ''}><span><b>New address</b></span></label></div>
      <div class="form-grid two" data-hs-new-address ${d.addressId !== 'new' && saved.length ? 'hidden' : ''}><label class="wide"><span>House / flat, building, area</span><input name="line" placeholder="Flat 12, Shanti Apartments, Sector 50"></label><label><span>City</span><input name="city" value="Noida"></label><label><span>PIN code</span><input name="pincode" inputmode="numeric" maxlength="6"></label><label><span>Save as</span><select name="label"><option>Home</option><option>Work</option><option>Parents</option></select></label><label class="check-inline"><input type="checkbox" name="saveAddress" checked> Save this address</label></div></fieldset>
    <fieldset><legend>When?</legend><div class="form-grid"><label><span>Date</span><input type="date" name="date" value="${date}" min="${minDate}" max="${addDays(minDate, 14)}" data-hs-date></label></div><div class="slot-grid" role="radiogroup" aria-label="Time slot">${slots}</div>${freeSlots(date).length ? '' : '<p class="muted">No slots left today. Choose another date.</p>'}</fieldset>
    <section class="hs-summary"><div class="price-line"><span>${c.inspection ? 'Inspection' : 'Total (pay after the work)'}</span><b data-hs-total>${c.inspection ? 'Free' : inr(q.total)}</b></div>${!c.inspection && q.total === MIN_ORDER && items.reduce((a, x) => a + itemOf(cat, x.id)[2] * x.qty, 0) < MIN_ORDER && items.length ? `<small class="muted">Small jobs are charged at least ${inr(MIN_ORDER)}.</small>` : ''}
      <details class="rate-card"><summary>If anything extra comes up</summary>${q.rateCard.map(([a, b]) => `<small class="block"><b>${esc(a)}:</b> ${esc(b)}</small>`).join('')}</details></section>
    <p class="field-error" id="home-book-error" hidden></p>
    <div class="form-actions"><button type="button" class="button secondary" data-route="home">Back</button><button class="button primary">Book ${c.inspection ? 'free inspection' : 'now'}</button></div>
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
export function customerScreen(s, r) {
  const steps = STEPS(r), cur = Math.max(0, steps.findIndex(([k]) => k === (r.status === 'completed' ? 'provider_done' : r.status)));
  const status = r.status;
  const where = `${r.date} · ${slotLabel(r.slot)} · ${r.address ? `${r.address.label}: ${r.address.line}` : ''}`;
  let next = '';
  if (status === 'searching') next = `<p>${stillSearching(s, r) ? '<b>No pro has accepted yet.</b> Try another slot, or cancel for free.' : 'We sent your job to verified pros near you. Most jobs are accepted within 30 minutes.'}</p>`;
  if (['accepted', 'on_the_way'].includes(status)) next = `${status === 'on_the_way' ? `<div class="info-banner"><b>${esc(r.providerName)} is on the way</b><span>About ${r.etaMins || 25} minutes.</span></div>` : `<p>${esc(r.providerName)} will come on ${esc(r.date)}, ${esc(slotLabel(r.slot))}.</p>`}
    <div class="otp-share"><small>Start code · share only when the pro is at your door</small><b data-hs-otp>${esc(r.startOtp)}</b></div>`;
  if (status === 'in_progress') next = r.inspectionQuote?.status === 'proposed' ? `<div class="extra-approve"><div><b>Quote · ${inr(r.inspectionQuote.amount)}</b><small class="block muted">${esc(r.inspectionQuote.note)}</small></div><span class="row-actions"><button class="button primary compact" data-hs="quote-approve" data-id="${r.id}">Approve quote</button><button class="button secondary compact" data-hs="quote-decline" data-id="${r.id}">Decline (pay nothing)</button></span></div>`
    : `<p>${r.inspection && r.inspectionQuote?.status !== 'approved' ? 'The painter is inspecting. You will get a written quote here.' : 'Work in progress. Any extra charge appears below for you to approve first.'}</p>`;
  if (status === 'provider_done') next = `<p>${r.noWork ? `No work was possible: ${esc(r.noWork)}. Only the visit charge applies.` : 'The pro marked the work done. Check it, then confirm.'}</p>${r.afterPhoto ? `<p class="muted">Photo of the finished work: ${esc(r.afterPhoto)}</p>` : ''}<button class="button primary full" data-op="service-confirm" data-id="${r.id}">Confirm work is done</button>`;
  if (status === 'completed' && !r.paid) next = `<p>Pay the pro through MoveAI.</p>`;
  if (status === 'paid' && !r.rating) next = `<p>How was ${esc(r.providerName || 'the pro')}?</p><div class="rating" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="service-rating" value="${n}" ${n === 5 ? 'checked' : ''}><span>★</span></label>`).join('')}</div><input id="service-comment" class="text-field" placeholder="Anything to share? (optional)"><button class="button primary full" data-op="service-rate" data-id="${r.id}">Rate and close</button>`;
  if (status === 'closed') next = r.closedReason ? `<div class="info-banner"><b>Closed</b><span>${esc(r.closedReason)}</span></div>` : `<div class="info-banner"><b>Closed${r.rating ? ` · rated ${'★'.repeat(r.rating)}` : ''}</b><span>${esc(r.comment || 'Thank you.')}</span></div>`;
  if (status === 'cancelled') next = `<div class="info-banner"><b>Cancelled</b><span>${esc(r.cancelReason || '')}</span></div>`;
  const resched = ['searching', 'accepted'].includes(status) ? `<details class="cancel-box"><summary>Change date or time</summary><form class="inline-form" data-hs-resched="${r.id}"><input type="date" name="date" value="${esc(r.date)}" min="${todayIso()}"><select name="slot">${SLOTS.map(([k, l]) => `<option value="${k}" ${r.slot === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="button secondary compact">Change</button></form></details>` : '';
  const warranty = inWarranty(r) && !r.reworkOf ? `<section class="panel"><h2>30-day re-work promise</h2><p class="muted">If the same problem comes back before ${esc(warrantyUntil(r))}, ${esc(r.providerName || 'the pro')} comes back for free.</p><details><summary class="button secondary compact">Problem came back?</summary><form class="form-grid two" data-hs-rework="${r.id}"><label class="wide"><span>What went wrong?</span><input name="problem"></label><label><span>Date</span><input type="date" name="date" min="${todayIso()}" value="${addDays(todayIso(), 1)}"></label><label><span>Time</span><select name="slot">${SLOTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><button class="button primary">Book free re-work</button></form></details></section>` : '';
  return `${head(r.title, `${r.id} · ${where}`, r.conversationId ? `<button class="button secondary" data-op="open-conversation" data-id="${r.conversationId}">Message</button>` : '')}
  <div class="grid two"><section class="panel"><h2>Progress</h2><ol class="milestones">${steps.map(([k, l], i) => `<li class="ms ${i < cur || (i === cur && ['closed', 'paid'].includes(k)) ? 'done' : i === cur ? 'current' : ''}"><i></i><span><b>${esc(l)}</b></span></li>`).join('')}</ol>
    <details><summary class="button text compact">What happened when</summary>${(r.timeline || []).map(t => `<small class="block">${esc(t.at)} · ${esc(t.text)}</small>`).join('')}</details></section>
  <section class="panel" data-hs-next><h2>Your next step</h2>${proCard(s, r)}${next}${resched}<button class="button secondary full" data-op="report-exception" data-ref="${r.id}">Report a problem or damage</button></section></div>
  ${r.description || r.items?.length ? `<section class="panel"><h2>Job details</h2><ul>${(r.items || []).map(x => { const it = itemOf(r.category, x.id); return it ? `<li>${esc(it[1])}${x.qty > 1 ? ` × ${x.qty}` : ''}</li>` : ''; }).join('')}</ul>${r.description ? `<p class="muted">${esc(r.description)}</p>` : ''}</section>` : ''}${warranty}`;
}

// ---------- pro screens ----------
const nextAction = r => ({accepted: ['on-the-way', 'On the way'], on_the_way: ['start', 'Start job'], in_progress: ['done', 'Mark done']}[r.status]);
function offerRow(s, r) {
  return `<article class="panel hs-offer" data-hs-offer="${r.id}"><div><b>${esc(CATS[r.category].icon)} ${esc(r.title)}</b><small class="block">${esc(r.date)} · ${esc(slotLabel(r.slot))} · ${esc(areaOf(r.address))}${r.address?.pincode ? ` ${esc(r.address.pincode)}` : ''}</small><small class="block">${r.inspection ? 'Free inspection — you send the quote' : `You earn ${inr(earningOf(s, r))} (job ${inr(r.quote?.total)} − 15% MoveAI)`}</small>${r.description ? `<small class="block muted">“${esc(r.description)}”</small>` : ''}</div>
  <div class="row-actions"><button class="button secondary compact" data-hs="decline" data-id="${r.id}">Not for me</button><button class="button primary compact" data-hs="accept" data-id="${r.id}">Accept</button></div></article>`;
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
export function proJobScreen(s) {
  const r = jobsOf(s).find(x => x.id === s.selectedProJobId) || offersFor(s).find(x => x.id === s.selectedProJobId);
  if (!r) return proJobsScreen(s);
  const assigned = r.provider === 'homePro';
  const extraForm = `<form class="form-grid two" data-hs-extra="${r.id}"><label><span>Extra</span><select name="kind"><option value="extra_labour">Extra labour · ₹${EXTRA_HOUR}/hour</option><option value="parts">Spare part (shop bill)</option></select></label><label><span>Hours</span><input name="qty" type="number" min="1" value="1"></label><label><span>₹ (for parts)</span><input name="amount" type="number"></label><label><span>Bill photo (parts)</span><input name="proof" type="file" accept="image/*"></label><label class="wide"><span>Why?</span><input name="note" placeholder="e.g. capacitor needs replacing"></label><button class="button secondary">Send to customer for approval</button></form>`;
  const actions = !assigned ? `<div class="row-actions"><button class="button secondary" data-hs="decline" data-id="${r.id}">Not for me</button><button class="button primary" data-hs="accept" data-id="${r.id}">Accept</button></div>`
    : r.status === 'accepted' ? `<button class="button primary full" data-hs="on-the-way" data-id="${r.id}">On the way</button>`
    : r.status === 'on_the_way' ? `<form class="form-grid two" data-hs-start="${r.id}"><label><span>Customer's 4-digit start code</span><input name="otp" inputmode="numeric" maxlength="4" autocomplete="off"></label><label><span>Before photo (optional)</span><input name="before" type="file" accept="image/*" capture="environment"></label><button class="button primary">Start job</button></form>`
    : r.status === 'in_progress' ? `${r.inspection ? (r.inspectionQuote?.status === 'approved' ? '<p class="avail-chip">✓ Quote approved — do the work</p>' : r.inspectionQuote?.status === 'proposed' ? `<p class="muted">Quote ${inr(r.inspectionQuote.amount)} sent. Waiting for the customer.</p>` : `<form class="form-grid two" data-hs-quote="${r.id}"><label><span>Full price ₹</span><input name="amount" type="number" min="500"></label><label class="wide"><span>What is included</span><input name="note" placeholder="2 rooms + hall, 2 coats, 3 days, paint included"></label><button class="button primary">Send quote</button></form>`) : `<details><summary class="button secondary compact">Add an extra charge</summary>${extraForm}</details>${Bill.pendingExtras(r).length ? `<p class="muted">Waiting for the customer to approve ${Bill.pendingExtras(r).length} extra.</p>` : ''}`}
      <form class="form-grid two" data-hs-done="${r.id}"><label class="wide"><span>Photo of the finished work</span><input name="after" type="file" accept="image/*" capture="environment"></label><button class="button primary">Mark done</button></form>
      <details><summary class="button text compact">No work possible?</summary><form class="inline-form" data-hs-nowork="${r.id}"><input name="reason" placeholder="e.g. part not available, customer away"><button class="button secondary compact">Close with ${inr(NO_WORK_CHARGE)} visit charge</button></form></details>`
    : `<p class="muted">${r.status === 'provider_done' ? 'Waiting for the customer to confirm and pay.' : r.paid ? 'Paid. Thank you!' : String(r.status).replace(/_/g, ' ')}</p>`;
  return `${head(r.title, `${r.id} · ${r.date} · ${slotLabel(r.slot)}`, r.conversationId && assigned ? `<button class="button secondary" data-op="open-conversation" data-id="${r.conversationId}">Customer chat</button>` : '')}
  <div class="grid two"><section class="panel"><h2>Job</h2><ul>${(r.items || []).map(x => { const it = itemOf(r.category, x.id); return it ? `<li>${esc(it[1])}${x.qty > 1 ? ` × ${x.qty}` : ''}</li>` : ''; }).join('')}</ul>${r.description ? `<p class="muted">“${esc(r.description)}”</p>` : ''}${r.photo ? `<p class="muted">Customer photo: ${esc(r.photo)}</p>` : ''}
    <p><b>${assigned ? esc(r.customerName || 'Customer') : 'Customer'}</b><small class="block">${assigned ? `${esc(r.address?.line)} · ${esc(r.address?.pincode)}` : `${esc(areaOf(r.address))} (full address after you accept)`}</small></p>${assigned ? `<button class="button text compact" data-wx="call" data-name="${esc(r.customerName || 'Customer')}">📞 Call customer via MoveAI</button>` : ''}
    <p id="hs-pro-error" class="field-error" hidden></p>${actions}</section>
  ${Bill.partnerEarnings(s, r, 'partner')}</div>`;
}
export function proMoneyScreen(s) {
  const paid = jobsOf(s).filter(r => r.paid);
  return `${head('My Money', 'Customers pay through MoveAI. Your share reaches your wallet when the job is paid; payout every Monday.')}${walletPanel(s, 'homePro')}
  <section class="panel"><h2>Paid jobs</h2>${paid.length ? paid.map(r => `<p class="price-line"><span>${esc(r.id)} · ${esc(r.title)}</span><b>${inr(earningOf(s, r))}</b></p>`).join('') : '<p class="muted">No paid jobs yet.</p>'}</section>`;
}
export function proProfileScreen(s) {
  const p = proOf(s); if (!p) return head('Profile', 'No home-service profile yet.');
  return `${head('My profile', `${p.name} · ${p.city}`)}<form class="panel form-panel narrow" id="hs-profile-form"><fieldset><legend>Work I do</legend><div class="check-grid">${Object.entries(CATS).map(([k, c]) => `<label><input type="checkbox" name="skills" value="${k}" ${(p.skills || []).includes(k) ? 'checked' : ''}> ${c.icon} ${esc(c.label)}</label>`).join('')}</div></fieldset>
  <label><span>Area</span><input name="city" value="${esc(p.city)}"></label><div class="review-checklist"><span class="${p.verified ? 'done' : ''}">${p.verified ? '✓' : '○'} ID verified (Aadhaar OTP + selfie)</span><span class="${p.trained ? 'done' : ''}">${p.trained ? '✓' : '○'} Safety and service training</span></div><p class="field-error" id="hs-profile-error" hidden></p><button class="button primary">Save</button></form>`;
}
export function adminScreen(s) {
  const rows = adminRows(s), active = pros(s).filter(p => p.ws);
  return `${head('Home services', 'Every home-service booking. Jobs nobody has taken are flagged so you can give them to a pro.')}
  <section class="panel"><div class="table-wrap"><table class="price-table"><thead><tr><th>Booking</th><th>When</th><th>Status</th><th>Pro</th><th></th></tr></thead><tbody>${rows.map(({r, flag}) => `<tr data-hs-admin="${r.id}"><td><b>${esc(r.id)}</b><small class="block">${esc(r.title)}</small></td><td>${esc(r.date)} ${esc(slotLabel(r.slot))}</td><td>${esc(String(r.status).replace(/_/g, ' '))}${flag ? `<small class="block field-error">${esc(flag)}</small>` : ''}</td><td>${esc(r.providerName || '—')}</td><td>${r.status === 'searching' ? `<select name="pro">${active.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="button secondary compact" data-hs="admin-assign" data-id="${r.id}">Give to pro</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No bookings yet.</td></tr>'}</tbody></table></div></section>`;
}

export const ROUTES = {homeBook: bookScreen, proJobs: proJobsScreen, proJob: proJobScreen, proProfile: proProfileScreen, homeServicesAdmin: adminScreen};
export function screen(route, s) {
  if (s.currentWorkspace === 'homePro' && route === 'home') return proHomeScreen(s);
  if (s.currentWorkspace === 'homePro' && route === 'money') return proMoneyScreen(s);
  if (s.currentWorkspace === 'homePro' && route === 'profile') return proProfileScreen(s);
  return ROUTES[route] ? ROUTES[route](s) : '';
}

// ---------- bindings ----------
const fileName = (form, n) => form.querySelector(`[name="${n}"]`)?.files?.[0]?.name || '';
export function bind(root, api) {
  const S = () => api.getState(), ws = () => S().currentWorkspace;
  const err = (id, m) => { const e = root.querySelector('#' + id); if (e) { e.textContent = m; e.hidden = !m; e.scrollIntoView?.({block: 'center'}); } else api.toast(m); };
  const book = root.querySelector('#home-book-form');
  if (book) {
    const keep = () => { const s = S(), d = draftOf(s), f = new FormData(book); d.description = f.get('description') || ''; d.date = f.get('date') || d.date; d.slot = f.get('slot') || ''; d.addressId = f.get('addressId') || d.addressId; };
    book.querySelectorAll('[data-hs-cat]').forEach(r => r.onchange = () => { keep(); const d = draftOf(S()); d.category = r.value; d.qty = {}; api.save(); api.render(); });
    book.querySelectorAll('[data-hs-qty]').forEach(b => b.onclick = () => { keep(); const d = draftOf(S()), k = b.dataset.hsQty; d.qty[k] = Math.max(0, Math.min(10, (d.qty[k] || 0) + Number(b.dataset.d))); api.save(); api.render(); });
    book.querySelector('[data-hs-date]')?.addEventListener('change', () => { keep(); api.save(); api.render(); });
    book.querySelectorAll('[name="addressId"]').forEach(r => r.onchange = () => { const n = book.querySelector('[data-hs-new-address]'); if (n) n.hidden = r.value !== 'new'; });
    book.onsubmit = e => {
      e.preventDefault(); keep(); const s = S(), d = draftOf(s), f = new FormData(book);
      const v = {category: d.category, items: Object.entries(d.qty || {}).map(([id, qty]) => ({id, qty})), description: f.get('description'), photo: fileName(book, 'photo'), date: f.get('date'), slot: f.get('slot'),
        addressId: f.get('addressId') === 'new' ? null : f.get('addressId'), address: {line: String(f.get('line') || '').trim() ? `${String(f.get('line')).trim()}${f.get('city') ? `, ${f.get('city')}` : ''}` : '', city: f.get('city'), pincode: String(f.get('pincode') || '').trim(), label: f.get('label')}, saveAddress: f.has('saveAddress')};
      const r = createBooking(s, v, {pricing: api.pricing?.(s, 'general') || null});
      if (r.error) return err('home-book-error', r.error);
      s.homeDraft = null; api.save(); api.navigate('serviceDetail');
      api.toast(r.notified ? 'Booked. We sent your job to verified pros near you.' : 'Booked. We are looking for a pro near you.');
    };
  }
  const act = {
    accept: id => acceptJob(S(), ws(), id), decline: id => declineJob(S(), ws(), id), 'on-the-way': id => onTheWay(S(), ws(), id),
    'quote-approve': id => decideQuote(S(), id, 'approve'), 'quote-decline': id => decideQuote(S(), id, 'decline'),
    'admin-assign': (id, b) => adminAssign(S(), id, b.closest('tr')?.querySelector('[name="pro"]')?.value),
  };
  root.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => {
    const k = b.dataset.hs, id = b.dataset.id, s = S();
    if (k === 'toggle-online') { const st = ((s.workerStatus ||= {}).homePro ||= {online: true}); st.online = !st.online; api.save(); return api.render(); }
    if (k === 'open') { s.selectedProJobId = id; api.save(); return api.navigate('proJob'); }
    const e = act[k]?.(id, b); if (e) return err(root.querySelector('#hs-pro-error') ? 'hs-pro-error' : 'none', e);
    if (k === 'accept') { s.selectedProJobId = id; api.save(); api.navigate('proJob'); return api.toast('Job accepted. The customer has been told.'); }
    api.save(); api.render(); api.toast({decline: 'Hidden from your list', 'on-the-way': 'Customer told you are on the way', 'quote-approve': 'Quote approved', 'quote-decline': 'Quote declined · nothing to pay', 'admin-assign': 'Given to the pro'}[k] || 'Done');
  });
  root.querySelectorAll('[data-hs-tab]').forEach(b => b.onclick = () => { S().proJobsTab = b.dataset.hsTab; api.save(); api.render(); });
  const form = (sel, fn, ok) => root.querySelectorAll(sel).forEach(f => f.onsubmit = e => { e.preventDefault(); const r = fn(f, new FormData(f)); const m = typeof r === 'string' ? r : r?.error; if (m) return err(root.querySelector('#hs-pro-error') ? 'hs-pro-error' : 'none', m); api.save(); api.render(); api.toast(ok); });
  form('[data-hs-start]', (f, d) => startJob(S(), ws(), f.dataset.hsStart, d.get('otp'), fileName(f, 'before')), 'Job started');
  form('[data-hs-extra]', (f, d) => proposeExtra(S(), ws(), f.dataset.hsExtra, {kind: d.get('kind'), qty: d.get('qty'), amount: d.get('amount'), note: d.get('note'), proof: fileName(f, 'proof')}), 'Sent to the customer for approval');
  form('[data-hs-quote]', (f, d) => sendQuote(S(), ws(), f.dataset.hsQuote, {amount: d.get('amount'), note: d.get('note')}), 'Quote sent');
  form('[data-hs-done]', (f) => markDone(S(), ws(), f.dataset.hsDone, {afterPhoto: fileName(f, 'after')}), 'Marked done · the customer will confirm and pay');
  form('[data-hs-nowork]', (f, d) => markDone(S(), ws(), f.dataset.hsNowork, {noWork: true, reason: d.get('reason')}), 'Closed with the visit charge');
  form('[data-hs-resched]', (f, d) => reschedule(S(), f.dataset.hsResched, d.get('date'), d.get('slot')), 'Visit moved');
  root.querySelectorAll('[data-hs-rework]').forEach(f => f.onsubmit = e => { e.preventDefault(); const d = new FormData(f); const r = requestRework(S(), f.dataset.hsRework, {problem: d.get('problem'), date: d.get('date'), slot: d.get('slot')}); if (r.error) return api.toast(r.error); api.save(); api.navigate('serviceDetail'); api.toast('Free re-work booked with the same pro'); });
  root.querySelectorAll('[data-hs-activate]').forEach(b => b.onclick = () => { const s = S(), c = (s.candidates || []).find(x => x.id === b.dataset.hsActivate); const e = activatePro(s, c); if (e) return api.toast(e); api.save(); api.toast('Your home-service jobs are ready'); if (api.switchTo) api.switchTo('homePro'); else api.render(); });
  root.querySelector('#hs-profile-form')?.addEventListener('submit', e => { e.preventDefault(); const s = S(), p = proOf(s), d = new FormData(e.currentTarget); const skills = d.getAll('skills'); if (!skills.length) return err('hs-profile-error', 'Choose at least one kind of work.'); p.skills = skills; p.city = String(d.get('city') || p.city).trim(); api.save(); api.render(); api.toast('Profile saved'); });
}
