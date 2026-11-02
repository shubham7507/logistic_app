// Work and hiring extras:
//  · workers post when and where they are free (availability posts, like "Available truck" but for people)
//  · businesses find drivers and helpers with real filters, keep a shortlist, call through MoveAI and hire in one tap
//  · ratings both ways after a job, strikes for no-shows
//  · customers book helpers; a transport request can ask for loading helpers
//  · customers choose a monthly personal driver from a shortlist, with a trial day, and rebook a favourite
//  · owners can join a worker in person (no smartphone / Aadhaar not linked to mobile)
//  · drivers: daily selfie check, short safety training, SOS during a trip
// Pure state functions are exported for unit tests; screens return HTML; bindWorkExtras wires the buttons.
import * as IDV from './id-verify.js';
import {record} from './pay.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString(36).slice(-5).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const head = (t, d, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(d)}</p></div>${a}</div>`;
const BUSINESS = {goods: 'Sharma Foods', transporter: 'Raj Logistics', vehicle: 'Raj Transport', movers: 'SafeMove Packers', staff: 'Raj Logistics'};
export const businessName = (s, ws) => s.businessProfiles?.[ws]?.legalName || BUSINESS[ws] || 'Business';
export const notify = (s, to, text, ref, route) => { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, route, at: stamp(), read: false}); };
const audit = (s, text) => { (s.audit ||= []).unshift({at: stamp(), text}); };
export const maskMobile = m => m ? `+91 ${String(m).slice(0, 2)}•••• ••${String(m).slice(-2)}` : 'Hidden';
const WORKER_WS = ['commercialDriver', 'personalDriver', 'helper'];
const workerOf = (s, ws) => (s.platformWorkers || []).find(w => w.persona === ws);

// ---------- availability posts (S1) ----------
export function validateAvailability(v) {
  if (!String(v.area || '').trim()) return 'Enter the city or area where you are free.';
  if (!v.from || !v.to) return 'Choose the dates you are free.';
  if (v.to < v.from) return 'The end date is before the start date.';
  if (v.from < today()) return 'The start date is in the past.';
  if ((new Date(v.to) - new Date(v.from)) / 86400000 > 30) return 'Post up to 30 days at a time; you can post again later.';
  if (!(Number(v.pay) > 0)) return 'Enter the pay you expect.';
  return '';
}
export function postAvailability(s, ws, v) {
  const w = workerOf(s, ws); if (!w) return {error: 'Create your work profile first.'};
  if (w.strikes >= 3) return {error: 'Your profile is paused after 3 no-shows. Contact MoveAI support to appeal.'};
  const error = validateAvailability(v); if (error) return {error};
  for (const p of s.availabilityPosts || []) if (p.workerId === w.id && p.status === 'open' && !(v.to < p.from || v.from > p.to)) return {error: `You already posted ${p.from} to ${p.to}. Close that post first or pick other dates.`};
  const post = {id: uid('AV'), workerId: w.id, persona: ws, name: w.name, role: w.capabilities.includes('driver') ? 'driver' : 'helper', area: String(v.area).trim(), routeTo: String(v.routeTo || '').trim(), from: v.from, to: v.to, shift: v.shift || 'Any', pay: Number(v.pay), payType: v.payType || 'per day', note: String(v.note || '').trim().slice(0, 200), status: 'open', createdAt: today()};
  (s.availabilityPosts ||= []).unshift(post);
  audit(s, `${w.name} posted availability ${post.area} ${post.from}–${post.to}`);
  return {post};
}
export const postState = p => p.status !== 'open' ? p.status : p.to < today() ? 'expired' : 'open';
export const openPosts = s => (s.availabilityPosts || []).filter(p => postState(p) === 'open');

// ---------- talent: everyone a business can hire (S2) ----------
export function talent(s) {
  const seen = new Set(), list = [];
  for (const w of s.platformWorkers || []) { seen.add(w.name); list.push({key: w.id, source: 'worker', persona: w.persona, name: w.name, role: w.capabilities.includes('driver') ? 'driver' : 'helper', licence: (w.licences || []).join(', '), heavy: (w.licences || []).some(l => /HMV|heavy/i.test(l)), personal: (w.licences || []).some(l => /personal|LMV-NT|car/i.test(l)), skills: w.skills || [], areas: w.locations || [], rating: w.rating, ratingCount: w.ratingCount || 0, experienceYears: w.experienceYears ?? 0, languages: w.languages || ['Hindi'], tripsDone: w.tripsDone || 0, expectedPay: w.expectedPay, verified: !!w.verified, policeVerified: !!w.policeVerified, strikes: w.strikes || 0, status: w.status, mobile: w.mobile}); }
  for (const c of s.candidates || []) { if (seen.has(c.name) || c.status !== 'available' || !c.capabilities?.some(x => ['driver', 'helper'].includes(x))) continue; list.push({key: c.id, source: 'candidate', persona: null, name: c.name, role: c.capabilities.includes('driver') ? 'driver' : 'helper', licence: (c.licences || []).join(', '), heavy: (c.licences || []).some(l => /heavy|HMV/i.test(l)), personal: (c.licences || []).some(l => /personal|car/i.test(l)), skills: c.skills || [], areas: c.locations || [], rating: c.rating, ratingCount: c.ratingCount || 0, experienceYears: c.experienceYears ?? 0, languages: c.languages || ['Hindi'], tripsDone: c.tripsDone || 0, expectedPay: c.expectedPay, verified: !!c.verified, policeVerified: false, strikes: c.strikes || 0, status: c.status, mobile: c.mobile}); }
  return list.map(t => ({...t, posts: openPosts(s).filter(p => p.workerId === t.key)}));
}
export const DEFAULT_FILTER = {role: 'any', licence: 'any', area: '', date: '', maxPay: '', verifiedOnly: true, minRating: '', language: 'any', postedOnly: false};
export function filterTalent(list, f = DEFAULT_FILTER) {
  const area = String(f.area || '').trim().toLowerCase();
  return list.filter(t => (f.role === 'any' || t.role === f.role)
    && (f.licence === 'any' || (f.licence === 'heavy' ? t.heavy : f.licence === 'personal' ? t.personal : true))
    && (!area || t.areas.some(a => a.toLowerCase().includes(area)) || t.posts.some(p => p.area.toLowerCase().includes(area) || p.routeTo.toLowerCase().includes(area)))
    && (!f.date || t.posts.some(p => p.from <= f.date && p.to >= f.date) || (!f.postedOnly && t.status === 'available'))
    && (!f.maxPay || Math.min(...[t.expectedPay, ...t.posts.map(p => p.pay)].filter(x => x > 0)) <= Number(f.maxPay))
    && (!f.verifiedOnly || t.verified)
    && (!f.minRating || (t.rating || 0) >= Number(f.minRating))
    && (f.language === 'any' || t.languages.includes(f.language))
    && (!f.postedOnly || t.posts.length)
    && t.strikes < 3)
    .sort((a, b) => (b.posts.length - a.posts.length) || ((b.rating || 0) - (a.rating || 0)));
}
export const hiredBy = (s, ws, key) => (s.workOffers || []).some(o => o.from === ws && o.talentKey === key && ['accepted', 'done'].includes(o.status));

// ---------- one-tap hire (S3) and same-day work (H2) ----------
export const HIRE_KINDS = {trip: 'One trip', day: 'One day', today: 'Today · paid today'};
export function sendHireOffer(s, ws, key, v) {
  const t = talent(s).find(x => x.key === key); if (!t) return {error: 'Worker not found.'};
  if (t.strikes >= 3) return {error: `${t.name}'s profile is paused.`};
  if (!HIRE_KINDS[v.kind]) return {error: 'Choose one trip, one day or today.'};
  if (!(Number(v.pay) > 0)) return {error: 'Enter the pay.'};
  if (!String(v.place || '').trim()) return {error: v.kind === 'trip' ? 'Enter the route, for example Delhi → Patna.' : 'Enter where the work is.'};
  const date = v.kind === 'today' ? today() : v.date; if (!date || date < today()) return {error: 'Choose today or a future date.'};
  if ((s.workOffers || []).some(o => o.from === ws && o.talentKey === key && o.status === 'pending' && o.date === date)) return {error: `You already sent ${t.name} an offer for ${date}.`};
  const role = t.role === 'driver' ? 'Driver' : 'Helper';
  const offer = {id: uid('OFF'), to: t.persona || `talent:${key}`, talentKey: key, talentName: t.name, kind: v.kind, from: ws, fromName: businessName(s, ws), title: `${HIRE_KINDS[v.kind]} ${role} · ${String(v.place).trim()}`, place: String(v.place).trim(), pay: Number(v.pay), payType: v.kind === 'trip' ? 'per trip' : 'per day', payToday: v.kind === 'today', date, note: String(v.note || '').trim(), status: 'pending', sentAt: stamp()};
  (s.workOffers ||= []).unshift(offer);
  if (t.persona) notify(s, t.persona, `${offer.fromName} offers ${offer.title} on ${date} for ${inr(offer.pay)}.`, offer.id, 'home');
  audit(s, `${offer.fromName} sent ${offer.id} to ${t.name}`);
  return {offer};
}
// Workers without the app (candidates) get the offer by SMS in real life; the demo lets the business simulate their answer.
export function simulateAnswer(s, ws, id, accept) {
  const o = (s.workOffers || []).find(x => x.id === id && x.from === ws); if (!o || o.status !== 'pending') return 'This offer is not waiting for an answer.';
  if (!String(o.to).startsWith('talent:')) return 'This worker answers in their own app.';
  o.status = accept ? 'accepted' : 'declined'; o.answeredAt = stamp(); onOfferAccepted(s, o); return '';
}
// Called by the app's offer-accept handler (ops-actions) and by simulateAnswer, so every kind of offer settles the same way.
export function onOfferAccepted(s, o) {
  if (o.status !== 'accepted' && o.status !== 'pending') return;
  if (o.kind === 'helpers') {
    const r = (s.serviceRequests || []).find(x => x.id === o.ref);
    if (r) { const w = workerOf(s, o.to) || {name: o.talentName}; (r.helpers ||= []).includes(w.name) || r.helpers.push(w.name); const fill = (s.platformWorkers || []).filter(x => x.capabilities.includes('helper') && !r.helpers.includes(x.name) && x.status === 'available'); while (r.helpers.length < r.count && fill.length) r.helpers.push(`${fill.shift().name} (MoveAI assigned)`); r.status = 'accepted'; r.provider = 'helper'; r.providerName = r.helpers.join(', '); notify(s, 'personal', `Helpers confirmed for ${r.date}: ${r.providerName}.`, r.id, 'serviceDetail'); }
    const req = (s.transportRequirements || []).find(x => x.id === o.ref);
    if (req) { (req.helpers ||= []).push(workerOf(s, o.to)?.name || o.talentName); notify(s, req.workspace, `${workerOf(s, o.to)?.name || 'A helper'} will help load ${req.goods} on ${req.pickupDate}.`, req.id); }
  }
}
export function markDone(s, ws, id) {
  const o = (s.workOffers || []).find(x => x.id === id && x.from === ws); if (!o || o.status !== 'accepted') return 'Only accepted work can be marked done.';
  o.status = 'done'; o.doneAt = stamp();
  const payee = o.to.startsWith('talent:') ? o.to : o.to;
  record(s, {owner: ws, sourceType: 'hire', sourceId: o.id, type: 'wage', direction: 'payable', payer: ws, payee, responsible: ws, amount: o.pay, method: 'upi', reference: `WAGE-${o.id}`, status: o.payToday ? 'confirmed' : 'approved', note: `${o.title} · ${o.talentName || ''}${o.payToday ? ' · paid the same day' : ''}`}, businessName(s, ws));
  if (o.to && WORKER_WS.includes(o.to)) notify(s, o.to, o.payToday ? `${o.fromName} paid ${inr(o.pay)} for today's work.` : `${o.fromName} marked ${o.title} done; ${inr(o.pay)} is approved for payment.`, o.id, 'money');
  return '';
}

// ---------- ratings and strikes (S6) ----------
export function rate(s, fromWs, id, stars, comment = '') {
  const o = (s.workOffers || []).find(x => x.id === id); stars = Number(stars);
  if (!o || o.status !== 'done') return 'You can rate after the work is marked done.';
  if (!(stars >= 1 && stars <= 5)) return 'Choose 1 to 5 stars.';
  const side = fromWs === o.from ? 'business' : 'worker';
  if ((s.workRatings || []).some(r => r.offerId === id && r.side === side)) return 'You already rated this job.';
  (s.workRatings ||= []).push({offerId: id, side, from: fromWs, to: side === 'business' ? o.talentKey : o.from, stars, comment: String(comment).slice(0, 200), at: stamp()});
  if (side === 'business') { const w = (s.platformWorkers || []).find(x => x.id === o.talentKey) || (s.candidates || []).find(x => x.id === o.talentKey); if (w) { const n = w.ratingCount || 0; w.rating = Math.round((((w.rating || 0) * n) + stars) / (n + 1) * 10) / 10; w.ratingCount = n + 1; } }
  return '';
}
export function reportNoShow(s, ws, id) {
  const o = (s.workOffers || []).find(x => x.id === id && x.from === ws); if (!o || o.status !== 'accepted') return 'Only accepted work can be reported as a no-show.';
  o.status = 'no_show'; o.noShowAt = stamp();
  const w = (s.platformWorkers || []).find(x => x.id === o.talentKey) || (s.candidates || []).find(x => x.id === o.talentKey);
  if (w) { w.strikes = (w.strikes || 0) + 1; if (w.strikes >= 3) { w.status = 'paused'; for (const p of s.availabilityPosts || []) if (p.workerId === w.id && p.status === 'open') p.status = 'closed'; } }
  if (WORKER_WS.includes(o.to)) notify(s, o.to, `${o.fromName} reported that you did not come for ${o.title}. Strike ${w?.strikes || 1} of 3. Reply in Help if this is wrong.`, o.id, 'helpDesk');
  return '';
}

// ---------- helpers for customers and loads (S5 / H1) ----------
export const HELPER_RATE = 120, HELPER_MIN_HOURS = 2, HELPER_FEE = 29;
export function helperQuote(count, hours) { const c = Number(count), h = Math.max(HELPER_MIN_HOURS, Number(hours)); const each = HELPER_RATE * h; return {each, helpers: each * c, fee: HELPER_FEE, total: each * c + HELPER_FEE}; }
export function bookHelpers(s, v) {
  const count = Number(v.count), hours = Number(v.hours);
  if (!(count >= 1 && count <= 6)) return {error: 'Choose 1 to 6 helpers.'};
  if (!(hours >= 1 && hours <= 10)) return {error: 'Choose 1 to 10 hours.'};
  if (!String(v.location || '').trim()) return {error: 'Enter the address.'};
  if (!v.date || v.date < today()) return {error: 'Choose today or a future date.'};
  const q = helperQuote(count, hours), id = uid('SR');
  const r = {id, customer: 'personal', customerName: s.person?.name || 'Customer', type: 'helpers', title: `${count} helper${count > 1 ? 's' : ''} · ${v.work || 'Loading / unloading'} · ${Math.max(HELPER_MIN_HOURS, hours)} h`, work: v.work || 'Loading / unloading', count, hours: Math.max(HELPER_MIN_HOURS, hours), date: v.date, time: v.time || '10:00', location: String(v.location).trim(), quote: {total: q.total, helperEarning: q.each, lines: [[`${count} × ${Math.max(HELPER_MIN_HOURS, hours)} h × ${inr(HELPER_RATE)}`, q.helpers], ['MoveAI fee', q.fee]]}, helpers: [], status: 'searching', paid: false, createdAt: stamp()};
  (s.serviceRequests ||= []).unshift(r);
  (s.workOffers ||= []).unshift({id: uid('OFF'), to: 'helper', kind: 'helpers', ref: id, from: 'personal', fromName: `${r.customerName} (customer)`, title: `Helper needed · ${r.work} · ${r.location}`, pay: q.each, payType: `for ${r.hours} h`, date: r.date, status: 'pending', sentAt: stamp()});
  notify(s, 'helper', `New helper job near ${r.location} on ${r.date}: ${inr(q.each)} for ${r.hours} h.`, id, 'home');
  return {request: r};
}
export function offerLoadingHelpers(s, req) {
  const each = HELPER_RATE * 4;
  (s.workOffers ||= []).unshift({id: uid('OFF'), to: 'helper', kind: 'helpers', ref: req.id, from: req.workspace, fromName: businessName(s, req.workspace), title: `Loading helper × ${req.helpersNeeded} · ${req.goods} · ${req.pickup}`, pay: each, payType: 'for 4 h', date: req.pickupDate, status: 'pending', sentAt: stamp()});
  notify(s, 'helper', `${businessName(s, req.workspace)} needs ${req.helpersNeeded} loading helper(s) at ${req.pickup} on ${req.pickupDate}.`, req.id, 'home');
}

// ---------- personal drivers for customers (S4) ----------
export function monthlyShortlist(s, location = '') {
  const loc = String(location).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return (s.platformWorkers || []).filter(w => w.capabilities.includes('driver') && (w.licences || []).some(l => /personal|LMV-NT/i.test(l)) && w.status !== 'paused' && (w.strikes || 0) < 3)
    .sort((a, b) => (loc.length ? (b.locations || []).some(x => loc.some(l => l.includes(x.toLowerCase()) || x.toLowerCase().includes(l))) - (a.locations || []).some(x => loc.some(l => l.includes(x.toLowerCase()) || x.toLowerCase().includes(l))) : 0) || (b.rating - a.rating)).slice(0, 3);
}
export function chooseDriver(s, requestId, workerId, mode) {
  const r = (s.serviceRequests || []).find(x => x.id === requestId && x.type === 'driver'); const w = (s.platformWorkers || []).find(x => x.id === workerId);
  if (!r || !w) return 'Booking or driver not found.';
  if (mode === 'trial') { r.trial = {workerId, name: w.name, date: r.date, fee: Math.round((w.expectedPay || 20000) / 26), status: 'booked'}; notify(s, w.persona || 'personalDriver', `Trial day with ${r.customerName || 'a customer'} on ${r.date}.`, r.id); return ''; }
  r.provider = w.persona || 'personalDriver'; r.providerName = w.name; r.chosenWorkerId = w.id; r.status = 'accepted';
  if (w.persona) notify(s, w.persona, `${r.customerName || 'A customer'} chose you for a monthly job (${r.carType}).`, r.id, 'myJobs');
  return '';
}
export function toggleFavourite(s, workerId) { const f = (s.favouriteDrivers ||= []); const i = f.indexOf(workerId); if (i >= 0) f.splice(i, 1); else f.push(workerId); return i < 0; }
export const driverCardFor = (s, r) => { const w = (s.platformWorkers || []).find(x => x.id === r.chosenWorkerId) || (s.platformWorkers || []).find(x => x.persona === r.provider) || null; return w; };
export function driverCardHtml(s, r) {
  const w = driverCardFor(s, r); if (!w || r.status === 'searching') return '';
  const fav = (s.favouriteDrivers || []).includes(w.id);
  return `<section class="panel driver-card"><div class="profile-summary"><span class="avatar">${esc(w.name.split(' ').map(x => x[0]).join(''))}</span><span><h2>${esc(w.name)}</h2><p>★ ${esc(w.rating)} (${w.ratingCount || 0}) · ${w.tripsDone || 0} trips · ${w.experienceYears || 0} yrs</p></span></div><div class="service-tags"><span>✓ Licence checked</span>${w.policeVerified ? '<span>✓ Police verified</span>' : ''}<span>${esc((w.languages || []).join(', '))}</span></div><div class="row-actions"><button class="button secondary" data-wx="call" data-name="${esc(w.name)}">📞 Call via MoveAI</button><button class="button ${fav ? 'primary' : 'secondary'}" data-wx="favourite" data-id="${esc(w.id)}">${fav ? '★ Favourite' : '☆ Save as favourite'}</button></div><small class="muted">Your number and the driver's stay hidden; calls go through MoveAI.</small></section>`;
}

// ---------- in-person joining (item 12) ----------
export function joinInPerson(s, ws, v, {storeOf} = {}) {
  const name = String(v.name || '').trim(), mobile = String(v.mobile || '').replace(/\D/g, '');
  if (name.length < 2) return {error: 'Enter the worker\'s name as on their ID.'};
  if (!/^[6-9]\d{9}$/.test(mobile)) return {error: 'Enter a valid 10-digit mobile number (theirs, or a family member\'s).'};
  if (!['aadhaar', 'voter', 'dl', 'pan'].includes(v.idType) || !/^\d{4}$|^[A-Z0-9]{4}$/i.test(String(v.idLast4 || ''))) return {error: 'Choose the ID you saw and enter its last 4 characters.'};
  if (!v.sawOriginal) return {error: 'Confirm you saw the original ID and the person matches the photo.'};
  if (!v.photo) return {error: 'Take a photo of the worker.'};
  const otpErr = IDV.checkPhoneOtp(s, mobile, v.otp); if (otpErr) return {error: otpErr};
  const rec = {name, mobile, joinMethod: 'in_person', idCheck: {type: v.idType, last4: String(v.idLast4).toUpperCase(), checkedBy: businessName(s, ws), at: stamp(), photo: v.photo}, joinedAt: today()};
  IDV.markInReview(s, mobile, {last4: v.idType === 'aadhaar' ? String(v.idLast4) : '', method: `ID seen in person (${v.idType})`, name, purpose: `Joined by ${businessName(s, ws)}`});
  const store = storeOf?.(ws);
  if (store) { const p = {id: uid('PICK'), store, ...rec, status: 'active', invitedBy: s.shopPartners?.[store]?.name || 'Store', payPlan: {type: 'monthly', rate: Number(v.pay) || 12000, effectiveFrom: today()}}; (s.pickerStaff ||= []).push(p); audit(s, `${p.invitedBy} joined ${name} in person`); return {member: p, kind: 'store'}; }
  const role = v.role === 'helper' ? 'helper' : v.role === 'driver' ? 'driver' : 'operations';
  const m = {id: uid('STAFF'), ...rec, role, designation: role === 'driver' ? 'Driver' : role === 'helper' ? 'Khalasi / helper' : 'Staff', branchIds: [], services: ['transport'], payType: 'monthly', payAmount: Number(v.pay) || 15000, status: 'active', documentsStatus: 'checked_in_person', bankStatus: 'not_added', emergencyStatus: 'skipped', activeAssignments: [], vehicleAssignments: [], dues: 0};
  ((s.peopleByWorkspace ||= {})[ws] ||= []).push(m); audit(s, `${businessName(s, ws)} joined ${name} in person`);
  return {member: m, kind: 'staff'};
}

// ---------- regular crew linked to a truck (H3) ----------
export function saveRegularCrew(s, ownerWs, vehicleId, driverId, helperId) {
  const v = ((s.ownedVehicles || {})[ownerWs] || []).find(x => x.id === vehicleId); if (!v) return 'Vehicle not found.';
  const staff = (s.peopleByWorkspace?.[ownerWs] || []).filter(p => p.status === 'active');
  if (driverId && !staff.some(p => p.id === driverId && p.role === 'driver')) return 'Choose an active driver from your staff.';
  if (helperId && !staff.some(p => p.id === helperId && p.role === 'helper')) return 'Choose an active helper from your staff.';
  v.regularCrew = {driverId: driverId || '', helperId: helperId || '', savedAt: stamp()}; return '';
}
export function regularCrewPanel(s, ownerWs, v) {
  const staff = (s.peopleByWorkspace?.[ownerWs] || []).filter(p => p.status === 'active'), rc = v.regularCrew || {};
  const opt = role => staff.filter(p => p.role === role).map(p => `<option value="${esc(p.id)}" ${rc[role + 'Id'] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<section class="panel"><h2>Regular crew</h2><p class="muted">The driver and khalasi who usually work on this truck. They are picked automatically when you assign it to a trip.</p><div class="form-grid two"><label><span>Driver</span><select data-crew-driver><option value="">None</option>${opt('driver')}</select></label><label><span>Khalasi / helper</span><select data-crew-helper><option value="">None</option>${opt('helper')}</select></label></div><button class="button secondary" data-wx="save-crew" data-id="${esc(v.id)}" data-owner="${esc(ownerWs)}">Save regular crew</button></section>`;
}

// ---------- driver safety (D1–D3) ----------
export const TRAINING = [
  ['Proof at every step', 'Take a clear photo at pickup, the dharamkata (weighbridge) slip, and delivery. Without proof the step is refused and payment waits.'],
  ['Money rules', 'Only take cash the app tells you to collect. Advances and wages show in your khata; never pay anyone to get a trip.'],
  ['Safety on the road', 'Rest every 4 hours of driving. If anything goes wrong, press SOS in the trip: your emergency contact and the business are alerted with your location.'],
];
export const QUIZ = [
  ['What must you add at the dharamkata?', ['The weighbridge slip photo and weight', 'Nothing, just drive on', 'A selfie'], 0],
  ['Someone asks ₹500 to give you a trip. What do you do?', ['Pay them', 'Refuse and tell MoveAI in Help', 'Share your OTP'], 1],
  ['Something goes wrong on the road. What do you press?', ['Go offline', 'SOS in the trip', 'Decline'], 1],
];
export function passTraining(s, ws, answers) {
  const wrong = QUIZ.filter((q, i) => Number(answers[i]) !== q[2]).length;
  if (wrong) return `${wrong} answer${wrong > 1 ? 's are' : ' is'} not right. Read the cards again and retry.`;
  (s.workerStatus ||= {})[ws] = {...(s.workerStatus[ws] || {}), trainingDone: true, trainingAt: stamp()}; return '';
}
export function dailySelfie(s, ws, photo) {
  if (!photo) return 'Take a selfie.';
  (s.workerStatus ||= {})[ws] = {...(s.workerStatus[ws] || {}), selfieDate: today(), selfieAt: stamp(), selfiePhoto: photo, faceMatch: 'demo_match_98'}; return '';
}
export function sos(s, ws, tripId) {
  const t = (s.trips || []).find(x => x.id === tripId); const w = workerOf(s, ws);
  const c = {id: uid('SOS'), kind: 'safety', subject: `SOS from ${w?.name || ws} on ${t?.id || 'a trip'}`, raisedBy: w?.name || ws, status: 'open', severity: 'urgent', at: stamp(), notes: `Last location: ${t?.gps?.last || t?.from || 'shared from phone'}. Emergency contact called.`};
  (s.cases ||= []).unshift(c);
  for (const to of ['admin', t?.owner].filter(Boolean)) notify(s, to, `🚨 SOS: ${c.subject}. Call the driver now.`, c.id, to === 'admin' ? 'cases' : 'trips');
  return c;
}
export const sosButton = (state, t) => WORKER_WS.includes(state.currentWorkspace) && !['delivered', 'closed', 'settled'].includes(t.status) ? `<button class="button danger full sos-button" data-wx="sos" data-id="${esc(t.id)}">🚨 SOS – I need help</button>` : '';

// ---------- voice / plain-words sign-up (H4) ----------
const CITIES = ['Patna', 'Delhi', 'Noida', 'Gurugram', 'Jaipur', 'Mumbai', 'Kolkata', 'Lucknow', 'Ranchi', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Varanasi', 'Kanpur', 'Pune', 'Hyderabad', 'Bengaluru', 'Chennai', 'Ahmedabad', 'Indore'];
export function parseWorkWords(text) {
  const t = String(text || '').toLowerCase(), out = {};
  if (/truck|lorry|tempo|trailer|tanker|ट्रक|टेम्पो|लॉरी|heavy/.test(t)) out.workerType = 'commercialDriver';
  else if (/khalasi|helper|loading|unloading|packing|labour|labor|majdoor|मजदूर|खलासी|हेल्पर|लोडिंग|warehouse/.test(t)) out.workerType = 'helper';
  else if (/car|driver|gaadi|गाड़ी|कार|ड्राइवर|chauffeur/.test(t)) out.workerType = 'personalDriver';
  else if (/office|accounts|computer|dispatch|ऑफिस/.test(t)) out.workerType = 'officeStaff';
  const city = CITIES.find(c => t.includes(c.toLowerCase())) || ({'पटना': 'Patna', 'दिल्ली': 'Delhi', 'जयपुर': 'Jaipur', 'नोएडा': 'Noida'})[Object.keys({'पटना': 1, 'दिल्ली': 1, 'जयपुर': 1, 'नोएडा': 1}).find(k => t.includes(k))];
  if (city) out.location = city;
  const pay = t.match(/(?:₹|rs\.?|rupees?|रुपये)?\s*(\d{3,6})/); if (pay) out.expectedPay = Number(pay[1]);
  const skills = [['Loading / unloading', /loading|unloading|लोडिंग/], ['Truck Khalasi', /khalasi|खलासी/], ['Moving helper / packer', /packing|packer|shifting|moving/], ['Warehouse / assembly', /warehouse|assembly|godown/]].filter(([, r]) => r.test(t)).map(([k]) => k);
  if (skills.length) out.skills = skills;
  if (/monthly|mahina|महीना/.test(t)) out.workPreference = 'Monthly'; else if (/daily|roz|रोज|per day/.test(t)) out.workPreference = 'Daily'; else if (/trip/.test(t)) out.workPreference = 'Per trip';
  return out;
}
export const voiceBox = () => `<section class="panel voice-box"><h2>🎤 Tell us your work</h2><p>Say or type it in your own words, for example “I drive trucks in Patna, ₹3,500 per trip” or “मैं पटना में लोडिंग का काम करता हूँ”. We fill the form for you.</p><div class="row-actions"><button type="button" class="button primary" data-wx="voice">🎤 Speak</button><input class="form-control" data-voice-text placeholder="Or type here"><button type="button" class="button secondary" data-wx="voice-fill">Fill the form</button></div><small class="muted" data-voice-status></small></section>`;


// ---------- open work for a worker (Find Work → Jobs near you today) ----------
const near = (c, where) => (c.locations || []).some(x => x && String(where || '').toLowerCase().includes(String(x).toLowerCase()));
export function openWorkFor(s, c) {
  if (!c) return [];
  const helper = (c.capabilities || []).includes('helper') || c.workerType === 'helper', carDriver = c.workerType === 'personalDriver' || (c.licences || []).some(l => /personal|car/i.test(l));
  const out = [];
  if (helper) for (const o of s.workOffers || []) if (o.kind === 'helpers' && o.status === 'pending' && (o.to === 'helper' || o.to === c.persona)) {
    const r = (s.serviceRequests || []).find(x => x.id === o.ref) || (s.transportRequirements || []).find(x => x.id === o.ref);
    const where = r?.location || r?.pickup || o.title.split('·').pop().trim();
    if (near(c, where) || near(c, o.title)) out.push({kind: 'offer', id: o.id, icon: '💪', title: o.title, where, when: o.date, pay: o.pay, payType: o.payType});
  }
  if (carDriver) for (const r of s.serviceRequests || []) if (r.type === 'driver' && r.status === 'searching' && near(c, r.location)) out.push({kind: 'driver', id: r.id, icon: '🧑‍✈️', title: r.title, where: r.location, when: r.date, pay: r.quote?.driverEarning || 0, payType: r.hireType || ''});
  return out;
}
export function takeOpenWork(s, c, kind, id) {
  if (!c) return 'Create your work profile first.';
  if ((c.level || 0) < 3) return 'Become trip-ready first: add Aadhaar, bank account and an emergency contact.';
  if (kind === 'offer') {
    const o = (s.workOffers || []).find(x => x.id === id && x.status === 'pending'); if (!o) return 'Someone else already took this job.';
    o.status = 'accepted'; o.talentKey = c.id; o.talentName = c.name; if (!o.to || o.to === 'helper') o.acceptedBy = c.persona || `candidate:${c.id}`;
    onOfferAccepted(s, o); notify(s, o.from, `${c.name} accepted: ${o.title}.`, o.ref || o.id); return '';
  }
  if (kind === 'driver') {
    const r = (s.serviceRequests || []).find(x => x.id === id && x.status === 'searching'); if (!r) return 'Someone else already took this booking.';
    r.status = 'accepted'; r.provider = c.persona || `candidate:${c.id}`; r.providerName = c.name; notify(s, 'personal', `${c.name} accepted your driver booking ${r.id}.`, r.id, 'serviceDetail'); return '';
  }
  return 'Unknown job.';
}


// ---------- job applications: tell the worker at each step; worker accepts or declines an offer ----------
const APP_TEXT = {reviewed: 'viewed your application for', shortlisted: 'shortlisted you for', interview: 'wants to interview you for', offer: 'offered you the job', hired: 'confirmed your joining as', rejected: 'did not select you this time for'};
export function notifyApplicant(s, a) {
  const c = (s.candidates || []).find(x => x.id === a.candidateId), j = (s.vacancies || []).find(x => x.id === a.openingId); if (!c || !j || !APP_TEXT[a.status]) return;
  const to = c.persona || (c.personId ? 'personal' : null); if (!to) return;
  notify(s, to, `${businessName(s, j.workspace)} ${APP_TEXT[a.status]}${a.status === 'offer' ? ':' : ''} ${j.title}.${a.status === 'offer' ? ' Open My applications to accept.' : ''}`, a.id, 'work');
}
export function replyToOffer(s, id, reply) {
  const a = (s.jobApplications || []).find(x => x.id === id); if (!a || a.status !== 'offer') return 'This offer is no longer open.';
  a.workerResponse = reply === 'accepted' ? 'accepted' : 'declined'; a.history.push({status: `offer ${a.workerResponse} by worker`, at: stamp()});
  if (a.workerResponse === 'declined') a.status = 'withdrawn';
  const c = (s.candidates || []).find(x => x.id === a.candidateId), j = (s.vacancies || []).find(x => x.id === a.openingId);
  notify(s, j?.workspace, `${c?.name || 'The worker'} ${a.workerResponse} your offer for ${j?.title || 'the job'}.${a.workerResponse === 'accepted' ? ' Mark them hired to start joining.' : ''}`, a.id, 'applications');
  return '';
}

// ---------- screens ----------
const stars = n => n ? `★ ${n}` : 'New';
const talentCard = (s, ws, t, short) => `<article class="panel candidate-card talent-card"><div class="profile-summary"><span class="avatar">${esc(t.name.split(' ').map(n => n[0]).join(''))}</span><span><h2>${esc(t.name)}</h2><p>${t.verified ? '✓ Verified' : 'Not verified'} · ${stars(t.rating)}${t.ratingCount ? ` (${t.ratingCount})` : ''}${t.strikes ? ` · ${t.strikes} strike(s)` : ''}</p></span></div>
  <div class="service-tags"><span>${t.role === 'driver' ? (t.heavy ? '🚚 Heavy vehicle' : t.personal ? '🚗 Car driver' : '🚐 Light vehicle') : '📦 Helper'}</span><span>${t.experienceYears} yrs</span><span>${t.tripsDone} jobs</span><span>${esc(t.languages.join(', '))}</span>${t.policeVerified ? '<span>✓ Police</span>' : ''}</div>
  ${t.posts.map(p => `<p class="avail-chip">🟢 Free ${esc(p.from)} → ${esc(p.to)} · ${esc(p.area)}${p.routeTo ? ` → ${esc(p.routeTo)}` : ''} · ${inr(p.pay)} ${esc(p.payType)}</p>`).join('') || `<p class="muted">Areas: ${esc(t.areas.join(', '))} · expects ${inr(t.expectedPay)}</p>`}
  <p class="muted">📞 ${hiredBy(s, ws, t.key) ? esc(t.mobile) : esc(maskMobile(t.mobile))}</p>
  <div class="row-actions"><button class="button primary" data-wx="open-talent" data-id="${esc(t.key)}">Hire</button><button class="button secondary" data-wx="shortlist" data-id="${esc(t.key)}">${short ? '★ Shortlisted' : '☆ Shortlist'}</button><button class="button text" data-wx="call" data-name="${esc(t.name)}">Call via MoveAI</button></div></article>`;
export function findTalentScreen(s) {
  const ws = s.currentWorkspace, f = {...DEFAULT_FILTER, ...(s.talentFilter || {})}, short = s.talentShortlist?.[ws] || [], all = talent(s), list = filterTalent(all, f);
  const sel = (name, opts) => `<select class="form-control" name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[name]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `${head('Find drivers & helpers', 'Verified workers near you, with who is free and when. Numbers stay hidden until you hire.', `<button class="button secondary" data-route="hireOffers">Offers I sent (${(s.workOffers || []).filter(o => o.from === ws).length})</button>`)}
  <form class="panel talent-filters" data-talent-filter><label>Work${sel('role', [['any', 'Drivers and helpers'], ['driver', 'Drivers'], ['helper', 'Helpers']])}</label><label>Licence${sel('licence', [['any', 'Any'], ['heavy', 'Heavy vehicle (HMV)'], ['personal', 'Car (LMV)']])}</label><label>Area or route<input class="form-control" name="area" value="${esc(f.area)}" placeholder="e.g. Patna"></label><label>Free on<input class="form-control" type="date" name="date" value="${esc(f.date)}"></label><label>Max pay ₹<input class="form-control" type="number" name="maxPay" value="${esc(f.maxPay)}" min="0"></label><label>Rating${sel('minRating', [['', 'Any'], ['4', '4★ and up'], ['4.5', '4.5★ and up']])}</label><label>Language${sel('language', [['any', 'Any'], ['Hindi', 'Hindi'], ['English', 'English'], ['Bhojpuri', 'Bhojpuri'], ['Maithili', 'Maithili'], ['Punjabi', 'Punjabi']])}</label><label class="check-inline"><input type="checkbox" name="verifiedOnly" ${f.verifiedOnly ? 'checked' : ''}> Verified only</label><label class="check-inline"><input type="checkbox" name="postedOnly" ${f.postedOnly ? 'checked' : ''}> Posted availability</label><button type="button" class="button text" data-wx="clear-filter">Clear</button></form>
  <p class="muted"><b data-talent-count>${list.length}</b> of ${all.length} workers match${short.length ? ` · ${short.length} shortlisted` : ''}</p>
  <div class="candidate-grid">${list.map(t => talentCard(s, ws, t, short.includes(t.key))).join('') || '<div class="empty-inline"><b>No one matches</b><small>Widen the area, date or pay.</small></div>'}</div>`;
}
export function talentProfileScreen(s) {
  const ws = s.currentWorkspace, t = talent(s).find(x => x.key === s.selectedTalent); if (!t) return findTalentScreen(s);
  const p = t.posts[0];
  return `${head(t.name, `${t.role === 'driver' ? 'Driver' : 'Helper'} · ${t.areas.join(', ')}`, '<button class="button secondary" data-route="findTalent">Back to list</button>')}
  <div class="grid two"><section class="panel"><h2>About</h2><dl class="facts"><div><dt>Rating</dt><dd>${stars(t.rating)} (${t.ratingCount} reviews)</dd></div><div><dt>Experience</dt><dd>${t.experienceYears} years · ${t.tripsDone} jobs on MoveAI</dd></div><div><dt>Licence</dt><dd>${esc(t.licence || 'Not needed')}</dd></div>${t.skills.length ? `<div><dt>Skills</dt><dd>${esc(t.skills.join(', '))}</dd></div>` : ''}<div><dt>Languages</dt><dd>${esc(t.languages.join(', '))}</dd></div><div><dt>Checks</dt><dd>${t.verified ? 'ID and selfie verified' : 'Not verified'}${t.policeVerified ? ' · police verified' : ''}</dd></div><div><dt>Phone</dt><dd>${hiredBy(s, ws, t.key) ? esc(t.mobile) : `${esc(maskMobile(t.mobile))} (shown after hiring)`}</dd></div></dl>${t.posts.map(x => `<p class="avail-chip">🟢 Free ${esc(x.from)} → ${esc(x.to)} · ${esc(x.area)}${x.routeTo ? ` → ${esc(x.routeTo)}` : ''} · ${esc(x.shift)} · ${inr(x.pay)} ${esc(x.payType)}${x.note ? `<br><small>${esc(x.note)}</small>` : ''}</p>`).join('')}</section>
  <form class="panel form-panel" id="hire-form" data-key="${esc(t.key)}"><h2>Send an offer</h2><fieldset><legend>What for?</legend><div class="check-grid">${Object.entries(HIRE_KINDS).map(([k, l], i) => `<label><input type="radio" name="kind" value="${k}" ${i === (t.role === 'driver' ? 0 : 1) ? 'checked' : ''}> ${l}</label>`).join('')}</div></fieldset>
    <div class="form-grid two"><label><span>Date</span><input type="date" name="date" value="${esc(p?.from || today())}"></label><label><span>Pay ₹</span><input type="number" name="pay" min="1" value="${esc(p?.pay || t.expectedPay)}"></label><label class="wide"><span>${t.role === 'driver' ? 'Route or place' : 'Where'}</span><input name="place" value="${esc(p ? (p.routeTo ? `${p.area} → ${p.routeTo}` : p.area) : t.areas[0] || '')}"></label><label class="wide"><span>Note (optional)</span><input name="note" placeholder="Truck type, timing, what to bring"></label></div>
    <p class="field-error" id="hire-error" hidden></p><button class="button primary full">Send offer to ${esc(t.name.split(' ')[0])}</button><small class="muted">${t.persona ? 'They get it in their MoveAI app and can accept in one tap.' : 'They get it by SMS and answer by tapping the link.'}</small></form></div>`;
}
export function hireOffersScreen(s) {
  const ws = s.currentWorkspace, list = (s.workOffers || []).filter(o => o.from === ws);
  const rated = id => (s.workRatings || []).some(r => r.offerId === id && r.side === 'business');
  return `${head('Offers I sent', 'Follow each offer: waiting → accepted → done and paid. Rate the worker after the job.', '<button class="button primary" data-route="findTalent">Find workers</button>')}
  <section class="panel">${list.map(o => `<article class="market-row offer-row"><span class="market-icon">${o.kind === 'today' ? '⚡' : o.kind === 'trip' ? '🚚' : '📅'}</span><span><b>${esc(o.talentName || o.to)} · ${esc(o.title)}</b><small>${esc(o.date)} · ${inr(o.pay)} ${esc(o.payType || '')} · sent ${esc(o.sentAt || '')}</small></span><span class="status-pill ${o.status === 'accepted' || o.status === 'done' ? 'success' : o.status === 'pending' ? 'info' : 'warning'}">${esc(o.status.replace('_', '-'))}</span>
    <span class="row-actions">${o.status === 'pending' && String(o.to).startsWith('talent:') ? `<button class="button text compact" data-wx="sim-accept" data-id="${o.id}">Demo: worker accepts</button>` : ''}${o.status === 'accepted' ? `<button class="button primary compact" data-wx="done" data-id="${o.id}">${o.payToday ? 'Done · pay now' : 'Mark done'}</button><button class="button secondary compact" data-wx="no-show" data-id="${o.id}">Didn't come</button>` : ''}${o.status === 'done' && !rated(o.id) ? `<span class="rate-row" data-rate="${o.id}">${[1, 2, 3, 4, 5].map(n => `<button class="button text compact" data-wx="rate" data-id="${o.id}" data-stars="${n}">${n}★</button>`).join('')}</span>` : ''}${o.status === 'done' && rated(o.id) ? '<small>Rated ✓</small>' : ''}</span></article>`).join('') || '<p class="muted">No offers yet. Find a worker and send an offer.</p>'}</section>`;
}
export function myAvailabilityScreen(s) {
  const ws = s.currentWorkspace, w = workerOf(s, ws), mine = (s.availabilityPosts || []).filter(p => p.workerId === w?.id);
  return `${head('When I am free', 'Post the dates and place you are free. Businesses nearby see it and can send you an offer.')}
  <div class="grid two"><form class="panel form-panel" id="availability-form"><h2>New post</h2><div class="form-grid two"><label><span>City or area</span><input name="area" value="${esc(w?.locations?.[0] || '')}"></label><label><span>${w?.capabilities?.includes('driver') ? 'Want a trip back to (optional)' : 'Also OK to travel to (optional)'}</span><input name="routeTo" placeholder="e.g. Patna"></label><label><span>From</span><input type="date" name="from" value="${today()}"></label><label><span>To</span><input type="date" name="to" value="${new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)}"></label><label><span>Shift</span><select name="shift"><option>Any</option><option>Day</option><option>Night</option></select></label><label><span>Pay ₹</span><input type="number" name="pay" min="1" value="${esc(w?.expectedPay || '')}"></label><label><span>Per</span><select name="payType"><option>per day</option><option>per trip</option><option>per month</option></select></label><label class="wide"><span>Note (optional)</span><input name="note" maxlength="200" placeholder="Licence, team size, tools…"></label></div><p class="field-error" id="availability-error" hidden></p><button class="button primary full">Post availability</button></form>
  <section class="panel"><h2>My posts</h2>${mine.map(p => `<article class="market-row"><span class="market-icon">${postState(p) === 'open' ? '🟢' : '⚪'}</span><span><b>${esc(p.area)}${p.routeTo ? ` → ${esc(p.routeTo)}` : ''}</b><small>${esc(p.from)} → ${esc(p.to)} · ${esc(p.shift)} · ${inr(p.pay)} ${esc(p.payType)}</small></span><span class="status-pill">${esc(postState(p))}</span>${postState(p) === 'open' ? `<button class="button secondary compact" data-wx="close-post" data-id="${p.id}">Close</button>` : ''}</article>`).join('') || '<p class="muted">No posts yet.</p>'}</section></div>`;
}
export function availabilityCard(s, ws) {
  const w = workerOf(s, ws); if (!w) return '';
  const p = openPosts(s).find(x => x.workerId === w.id);
  return `<section class="panel"><h2>When I am free</h2>${p ? `<p class="avail-chip">🟢 Posted: ${esc(p.area)}${p.routeTo ? ` → ${esc(p.routeTo)}` : ''} · ${esc(p.from)} → ${esc(p.to)} · ${inr(p.pay)} ${esc(p.payType)}</p><button class="button secondary" data-route="myAvailability">Change</button>` : `<p>Tell businesses when and where you are free, for example a return trip after a delivery.</p><button class="button primary" data-route="myAvailability">Post when I'm free</button>`}</section>`;
}
export function bookHelpersScreen(s) {
  const q = helperQuote(2, 4);
  return `${head('Book helpers', 'Verified helpers for loading, unloading, shifting or packing. Pay after the work.')}
  <form class="panel form-panel narrow" id="book-helpers-form"><div class="form-grid two"><label><span>Work</span><select name="work"><option>Loading / unloading</option><option>Shifting help</option><option>Packing</option><option>Warehouse / assembly</option></select></label><label><span>How many helpers</span><input type="number" name="count" min="1" max="6" value="2" data-helper-calc></label><label><span>Hours</span><input type="number" name="hours" min="1" max="10" value="4" data-helper-calc></label><label><span>Date</span><input type="date" name="date" value="${today()}"></label><label><span>Time</span><input type="time" name="time" value="10:00"></label><label class="wide"><span>Address</span><input name="location" placeholder="House, street, area" value="${esc(s.person?.address || '')}"></label></div>
  <p class="price-line" data-helper-price>${inr(q.total)} total · ${inr(HELPER_RATE)} per helper per hour (minimum ${HELPER_MIN_HOURS} h) + ${inr(HELPER_FEE)} MoveAI fee</p><p class="field-error" id="book-helpers-error" hidden></p><button class="button primary full">Book helpers</button></form>`;
}
export function driverChoiceScreen(s) {
  const r = (s.serviceRequests || []).find(x => x.id === s.selectedServiceId && x.type === 'driver') || (s.serviceRequests || []).find(x => x.type === 'driver' && x.hireType === 'monthly' && x.status === 'searching');
  if (!r) return `${head('Choose your monthly driver', 'Book a monthly driver first.')}<button class="button primary" data-route="book">Hire a driver</button>`;
  const list = monthlyShortlist(s, r.location);
  return `${head('Choose your monthly driver', `${r.carType} · ${r.location}. Three verified drivers near you: call them, book a paid trial day, then choose.`)}
  <div class="candidate-grid">${list.map(w => `<article class="panel candidate-card"><div class="profile-summary"><span class="avatar">${esc(w.name.split(' ').map(x => x[0]).join(''))}</span><span><h2>${esc(w.name)}</h2><p>★ ${esc(w.rating)} (${w.ratingCount || 0}) · ${w.experienceYears || 0} yrs · ${w.tripsDone || 0} trips</p></span></div><div class="service-tags"><span>✓ Licence</span>${w.policeVerified ? '<span>✓ Police verified</span>' : '<span>Police check pending</span>'}<span>${esc((w.languages || []).join(', '))}</span></div><p class="muted">Areas: ${esc((w.locations || []).join(', '))} · asks ${inr(w.expectedPay)}${w.expectedPay > 5000 ? '/month' : '/day'}</p>${r.trial?.workerId === w.id ? `<p class="avail-chip">Trial day booked for ${esc(r.trial.date)} · ${inr(r.trial.fee)}</p>` : ''}<div class="row-actions"><button class="button text" data-wx="call" data-name="${esc(w.name)}">📞 Call</button><button class="button secondary" data-wx="trial" data-req="${esc(r.id)}" data-id="${esc(w.id)}" ${r.trial ? 'disabled' : ''}>Trial day</button><button class="button primary" data-wx="choose-driver" data-req="${esc(r.id)}" data-id="${esc(w.id)}">Choose</button></div></article>`).join('')}</div>`;
}
export function inPersonJoinScreen(s) {
  const store = /^(grocery|groceryFresh|electrical|fashion)/.test(s.currentWorkspace);
  return `${head('Join a worker in person', 'For staff without a smartphone, or whose Aadhaar is not linked to their mobile. You check their ID face to face.')}
  <form class="panel form-panel narrow" id="in-person-form"><div class="form-grid two"><label class="wide"><span>Worker's name (as on ID)</span><input name="name"></label><label><span>Mobile (theirs or family)</span><input name="mobile" inputmode="numeric" maxlength="10"></label><div class="wide">${IDV.phoneOtpBlock({keyFrom: 'mobile'})}</div>${store ? '' : '<label><span>Role</span><select name="role"><option value="driver">Driver</option><option value="helper">Khalasi / helper</option><option value="operations">Office staff</option></select></label>'}<label><span>ID you checked</span><select name="idType"><option value="aadhaar">Aadhaar card</option><option value="voter">Voter ID</option><option value="dl">Driving licence</option><option value="pan">PAN card</option></select></label><label><span>Last 4 characters of the ID</span><input name="idLast4" maxlength="4"></label><label><span>Monthly pay ₹</span><input type="number" name="pay" value="${store ? 12000 : 15000}"></label><label class="wide"><span>Photo of the worker</span><input type="file" name="photo" accept="image/*" capture="user"></label><label class="wide check-inline"><input type="checkbox" name="sawOriginal"> I saw the original ID and the person matches its photo</label></div><p class="muted">Only the last 4 characters are stored. The worker can add bank details later in their own profile.</p><p class="field-error" id="in-person-error" hidden></p><button class="button primary full">Add worker</button></form>`;
}
export function dailySelfieScreen(s) {
  const st = s.workerStatus?.[s.currentWorkspace] || {};
  return `${head('Today\'s selfie check', 'A quick selfie each day confirms it is really you working. It stops account sharing and keeps customers safe.')}
  <section class="panel form-panel narrow">${st.selfieDate === today() ? `<p class="avail-chip">✓ Done today at ${esc(st.selfieAt)} · face matches your ID</p><button class="button primary" data-route="home">Back to home</button>` : `<form id="selfie-form"><label><span>Take a selfie</span><input type="file" name="selfie" accept="image/*" capture="user"></label><p class="field-error" id="selfie-error" hidden></p><button class="button primary full">Check my face</button></form>`}</section>`;
}
export function driverTrainingScreen(s) {
  const st = s.workerStatus?.[s.currentWorkspace] || {};
  return `${head('Safety training', '3 short cards and 3 questions. Takes about 3 minutes; needed once before your first MoveAI trip.')}
  ${st.trainingDone ? `<section class="panel"><p class="avail-chip">✓ Training complete (${esc(st.trainingAt)})</p><button class="button primary" data-route="home">Back to home</button></section>` : `<div class="grid three">${TRAINING.map(([t, d], i) => `<section class="panel"><p class="wh-kicker">Card ${i + 1}</p><h2>${esc(t)}</h2><p>${esc(d)}</p></section>`).join('')}</div>
  <form class="panel" id="training-form"><h2>Quick check</h2>${QUIZ.map(([q, opts], i) => `<fieldset><legend>${i + 1}. ${esc(q)}</legend><div class="check-grid">${opts.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join('')}</div></fieldset>`).join('')}<p class="field-error" id="training-error" hidden></p><button class="button primary full">Finish training</button></form>`}`;
}
export const SCREENS = {findTalent: findTalentScreen, talentProfile: talentProfileScreen, hireOffers: hireOffersScreen, myAvailability: myAvailabilityScreen, bookHelpers: bookHelpersScreen, driverChoice: driverChoiceScreen, inPersonJoin: inPersonJoinScreen, dailySelfie: dailySelfieScreen, driverTraining: driverTrainingScreen};
export const screen = (route, s) => SCREENS[route] ? SCREENS[route](s) : '';

// ---------- binding ----------
export function bindWorkExtras(root, api, {storeOf} = {}) {
  const S = () => api.getState(), ws = () => S().currentWorkspace;
  const err = (id, msg) => { const e = root.querySelector(`#${id}`); if (e) { e.textContent = msg; e.hidden = !msg; e.scrollIntoView?.({block: 'center'}); } else if (msg) api.toast(msg); };
  const done = (msg, route) => { api.save(); if (route) api.navigate(route); else api.render(); if (msg) api.toast(msg); };
  const form = sel => { const f = root.querySelector(sel); return f ? Object.fromEntries(new FormData(f)) : null; };
  const fileName = (sel, name) => root.querySelector(`${sel} [name="${name}"]`)?.files?.[0]?.name || '';
  root.querySelectorAll('[data-work-tab]').forEach(b => b.addEventListener('click', () => { S().workTab = b.dataset.workTab; done(); }));
  root.querySelectorAll('[data-talent-role]').forEach(b => b.addEventListener('click', () => { const r = b.dataset.talentRole; S().talentFilter = {...DEFAULT_FILTER, role: ['driver', 'helper'].includes(r) ? r : 'any'}; api.save(); }));
  root.querySelector('[data-talent-filter]')?.addEventListener('change', e => { const f = e.currentTarget, v = Object.fromEntries(new FormData(f)); S().talentFilter = {...DEFAULT_FILTER, ...v, verifiedOnly: f.verifiedOnly.checked, postedOnly: f.postedOnly.checked}; done(); });
  root.querySelector('[data-talent-filter] [name="area"]')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.dispatchEvent(new Event('change', {bubbles: true})); } });
  root.querySelector('#availability-form')?.addEventListener('submit', e => { e.preventDefault(); const r = postAvailability(S(), ws(), form('#availability-form')); if (r.error) return err('availability-error', r.error); done('Posted. Businesses near you can now see you are free.'); });
  root.querySelector('#hire-form')?.addEventListener('submit', e => { e.preventDefault(); const r = sendHireOffer(S(), ws(), e.currentTarget.dataset.key, form('#hire-form')); if (r.error) return err('hire-error', r.error); done(`Offer sent to ${r.offer.talentName}.`, 'hireOffers'); });
  root.querySelector('#book-helpers-form')?.addEventListener('submit', e => { e.preventDefault(); const r = bookHelpers(S(), form('#book-helpers-form')); if (r.error) return err('book-helpers-error', r.error); S().selectedServiceId = r.request.id; done('Request sent to verified helpers near you.', 'serviceDetail'); });
  root.querySelectorAll('[data-helper-calc]').forEach(x => x.addEventListener('input', () => { const f = form('#book-helpers-form'), q = helperQuote(f.count || 1, f.hours || 1), el = root.querySelector('[data-helper-price]'); if (el) el.textContent = `${inr(q.total)} total · ${inr(HELPER_RATE)} per helper per hour (minimum ${HELPER_MIN_HOURS} h) + ${inr(HELPER_FEE)} MoveAI fee`; }));
  root.querySelector('#in-person-form')?.addEventListener('submit', e => { e.preventDefault(); const v = form('#in-person-form'); v.photo = fileName('#in-person-form', 'photo'); v.sawOriginal = e.currentTarget.sawOriginal.checked; const r = joinInPerson(S(), ws(), v, {storeOf}); if (r.error) return err('in-person-error', r.error); done(`${r.member.name} joined. They can start work now.`, r.kind === 'store' ? 'shopTeam' : 'people'); });
  root.querySelector('#selfie-form')?.addEventListener('submit', e => { e.preventDefault(); const m = dailySelfie(S(), ws(), fileName('#selfie-form', 'selfie')); if (m) return err('selfie-error', m); done('Selfie checked. Have a safe day.', 'home'); });
  root.querySelector('#training-form')?.addEventListener('submit', e => { e.preventDefault(); const f = form('#training-form'); const m = passTraining(S(), ws(), QUIZ.map((_, i) => f[`q${i}`])); if (m) return err('training-error', m); done('Training complete. You are ready for MoveAI trips.', 'home'); });
  root.querySelectorAll('[data-wx]').forEach(b => b.addEventListener('click', e => {
    const a = b.dataset.wx, id = b.dataset.id, s = S(); let m = '';
    if (a === 'open-talent') { s.selectedTalent = id; return done('', 'talentProfile'); }
    if (a === 'shortlist') { const l = ((s.talentShortlist ||= {})[ws()] ||= []); const i = l.indexOf(id); i >= 0 ? l.splice(i, 1) : l.push(id); return done(i >= 0 ? 'Removed from shortlist' : 'Added to shortlist'); }
    if (a === 'clear-filter') { s.talentFilter = {...DEFAULT_FILTER}; return done(); }
    if (a === 'call') return api.toast(`Calling ${b.dataset.name} through MoveAI… both numbers stay hidden (demo).`);
    if (a === 'close-post') { const p = (s.availabilityPosts || []).find(x => x.id === id); if (p) p.status = 'closed'; return done('Post closed'); }
    if (a === 'save-crew') { m = saveRegularCrew(s, b.dataset.owner, id, root.querySelector('[data-crew-driver]')?.value, root.querySelector('[data-crew-helper]')?.value); if (!m) return done('Regular crew saved. They are picked when you assign this truck.'); }
    if (a === 'take-work') { m = takeOpenWork(s, globalThis.__moveaiWorkerCandidate?.(s), b.dataset.kind, id); if (!m) return done('Accepted. The details are in My jobs.'); }
    if (a === 'offer-reply') { m = replyToOffer(s, id, b.dataset.reply); if (!m) return done(b.dataset.reply === 'accepted' ? 'Offer accepted. The business will confirm your joining.' : 'Offer declined.'); }
    if (a === 'sim-accept') m = simulateAnswer(s, ws(), id, true);
    if (a === 'done') m = markDone(s, ws(), id);
    if (a === 'no-show') m = reportNoShow(s, ws(), id);
    if (a === 'rate') m = rate(s, ws(), id, b.dataset.stars);
    if (a === 'favourite') { const on = toggleFavourite(s, id); return done(on ? 'Saved as favourite. Rebook from Hire a driver.' : 'Removed from favourites'); }
    if (a === 'trial') m = chooseDriver(s, b.dataset.req, id, 'trial');
    if (a === 'choose-driver') { m = chooseDriver(s, b.dataset.req, id, 'choose'); if (!m) { s.selectedServiceId = b.dataset.req; return done('Driver chosen. They will call you to confirm the start date.', 'serviceDetail'); } }
    if (a === 'sos') { const c = sos(s, ws(), id); return done(`SOS sent (${c.id}). MoveAI and the business are calling you now. Stay where it is safe.`); }
    if (a === 'voice') return startVoice(root, api);
    if (a === 'voice-fill') return fillFromWords(root, root.querySelector('[data-voice-text]')?.value || '');
    if (m) return api.toast(m);
    done({'sim-accept': 'The worker accepted.', done: 'Marked done.', 'no-show': 'No-show recorded. The worker gets a strike.', rate: 'Thanks for rating.', trial: 'Trial day booked.'}[a] || '');
  }));
}
function fillFromWords(root, text) {
  const v = parseWorkWords(text), status = root.querySelector('[data-voice-status]'), f = root.querySelector('#candidate-profile-form');
  if (!f || !Object.keys(v).length) { if (status) status.textContent = 'Could not understand. Try: “I drive trucks in Patna, 3500 per trip”.'; return v; }
  if (v.workerType) { const r = f.querySelector(`input[name="workerType"][value="${v.workerType}"]`); if (r && !r.checked) r.click(); }
  const f2 = root.querySelector('#candidate-profile-form');
  if (v.location && f2.location) f2.location.value = v.location;
  if (v.expectedPay && f2.expectedPay) f2.expectedPay.value = v.expectedPay;
  if (v.workPreference && f2.workPreference) f2.workPreference.value = v.workPreference;
  for (const sk of v.skills || []) { const c = f2.querySelector(`input[name="skills"][value="${sk}"]`); if (c && !c.checked) c.checked = true; }
  const st = root.querySelector('[data-voice-status]'); if (st) st.textContent = `Filled: ${Object.entries(v).map(([k, x]) => `${k} = ${Array.isArray(x) ? x.join(', ') : x}`).join(' · ')}. Check and save.`;
  return v;
}
function startVoice(root, api) {
  const R = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!R) { api.toast('Speech is not available in this browser. Type your words instead.'); root.querySelector('[data-voice-text]')?.focus(); return; }
  const r = new R(); r.lang = document.documentElement.lang === 'hi' ? 'hi-IN' : 'en-IN'; r.interimResults = false;
  const st = root.querySelector('[data-voice-status]'); if (st) st.textContent = 'Listening… speak now.';
  r.onresult = e => { const text = e.results[0][0].transcript; const box = root.querySelector('[data-voice-text]'); if (box) box.value = text; fillFromWords(root, text); };
  r.onerror = () => { if (st) st.textContent = 'Could not hear you. Type your words instead.'; };
  r.start();
}
