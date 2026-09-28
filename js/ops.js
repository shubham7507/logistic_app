// MoveAI One — operations screens (draw.io pages 02, 03–11, 13, 15–20).
import {ROLE_TEMPLATES} from './people-rules.js';
import {PARTY_NAMES} from './ops-data.js';
import {
  TRIP_STEPS, currentMilestone, stepMeta, tripProgress, docsValid, MOVING_PACKAGES, HOME_SIZES, DRIVER_RATES, GENERAL_SERVICES,
  quoteMoving, quoteDriver, quoteGeneral, MOVING_STEPS, movingStepIndex, MONEY_TYPES, earningsSummary, visibleLedger, visibleConversations,
  EXCEPTION_TYPES, nextLoadsNear, gpsAllowed, DOC_TYPES,
} from './ops-rules.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const head = (title, text, action = '') => `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
export const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const label = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const tone = s => /closed|confirmed|approved|done|completed|paid|active|verified|accepted|received|settled|available/.test(s) ? '' : /hold|expired|reject|suspend|cancel|dispute|overdue|missing|escalat|reversed/.test(s) ? 'danger' : /pending|correction|waiting|searching|sent|submitted|requested|open/.test(s) ? 'warning' : 'info';
export const pill = s => `<span class="status-pill ${tone(String(s))}">${esc(label(s))}</span>`;
const empty = (title, text, action = '') => `<div class="empty-inline"><b>${esc(title)}</b><small>${esc(text)}</small>${action}</div>`;
const facts = rows => `<dl class="fact-list">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

export function partyName(state, key) {
  if (!key) return '—';
  if (PARTY_NAMES[key]) return state.workspaceOverrides?.[key]?.label && !['personal', 'commercialDriver', 'personalDriver', 'helper'].includes(key) ? state.workspaceOverrides[key].label : PARTY_NAMES[key];
  if (key.startsWith('staff:')) return Object.values(state.peopleByWorkspace).flat().find(p => p.id === key.slice(6))?.name || key;
  if (key.startsWith('external:')) return label(key.slice(9));
  return state.mockUsers?.[key]?.name || key;
}

export function opsCtx(state) {
  const ws = state.currentWorkspace;
  const ownerWs = ws === 'staff' ? (state.staffSession?.ownerWorkspace || 'transporter') : ws;
  const member = ws === 'staff' ? (state.peopleByWorkspace[ownerWs] || []).find(x => x.id === state.selectedStaffId) : null;
  const persona = member ? {name: member.name, role: ROLE_TEMPLATES[member.role]?.label || 'Staff'} : (state.mockUsers?.[ws] || {name: 'User', role: ws});
  const perms = member ? (member.access?.permissions?.length ? member.access.permissions : (ROLE_TEMPLATES[member.role]?.permissions || [])) : [];
  return {ws, ownerWs, member, persona, perms};
}

// ---------- permissions shared by screens and actions ----------
export function can(state, action, obj) {
  const {ws, perms, member} = opsCtx(state);
  const business = ['goods', 'transporter', 'vehicle', 'movers'].includes(ws);
  switch (action) {
    case 'trip.assign': return (obj ? (obj.owner === ws) : ['transporter', 'goods'].includes(ws)) || (ws === 'staff' && perms.some(p => ['work.update', 'work.manage'].includes(p)));
    case 'trip.settle': return business && obj?.owner === ws;
    case 'fleet.manage': return business || (ws === 'staff' && perms.some(p => ['documents.prepare', 'fleet.view', 'work.manage'].includes(p)));
    case 'fleet.review': return business;
    case 'moving.manage': return ['movers', 'transporter'].includes(ws) && obj?.owner === ws || (ws === 'staff' && perms.includes('work.update'));
    case 'money.create': return business || ws === 'personal' || (ws === 'staff' && perms.includes('money.prepare'));
    case 'money.approve': return business && obj?.owner === ws || (ws === 'staff' && obj?.owner === opsCtx(state).ownerWs && perms.some(p => ['money.prepare', 'work.manage'].includes(p)) && Number(obj?.amount) <= approvalLimit(state));
    case 'money.pay': return obj?.payer === ws || (ws === 'staff' && perms.includes('money.prepare') && obj?.payer === opsCtx(state).ownerWs);
    case 'money.confirm': return obj?.payee === ws || (ws === 'staff' && obj?.payee === `staff:${member?.id}`);
    case 'money.reverse': return business && obj?.owner === ws;
    case 'direct.chat': return business;
    case 'admin': return ws === 'admin';
    case 'people.manage': return business;
    default: return false;
  }
}
export function approvalLimit(state) {
  const {ws, member} = opsCtx(state);
  if (ws === 'staff') return member?.access?.approvalLimit != null && member.access.approvalLimit !== '' ? Number(member.access.approvalLimit) : (['accounts', 'manager'].includes(member?.role) ? 25000 : 0);
  if (ws === 'personal') return 50000;
  return 100000;
}

// ---------- scoped data ----------
export function visibleTrips(state) {
  const {ws, member, ownerWs} = opsCtx(state);
  return state.trips.filter(t => {
    if (ws === 'staff') return t.owner === ownerWs && ((member?.branchIds || []).includes(t.branchId) || (member?.activeAssignments || []).includes(t.id));
    if (['commercialDriver', 'helper'].includes(ws)) return t.crew.some(c => c.persona === ws);
    return t.parties.includes(ws) || t.owner === ws || t.vehicleOwner === ws;
  });
}
export function visibleMovingJobs(state) {
  const {ws, member, ownerWs} = opsCtx(state);
  return state.movingJobs.filter(j => ws === 'staff' ? j.owner === ownerWs && (member?.branchIds || []).includes(j.branchId) : ['helper', 'commercialDriver'].includes(ws) ? j.crew.some(c => c.persona === ws) : j.owner === ws || j.customer === ws || j.vehicle?.owner === ws);
}
const selectedTrip = state => visibleTrips(state).find(t => t.id === state.selectedTripId) || visibleTrips(state)[0];
const selectedJob = state => visibleMovingJobs(state).find(j => j.id === state.selectedMovingJobId) || visibleMovingJobs(state)[0];
export const allVehicles = state => Object.entries(state.ownedVehicles).flatMap(([owner, list]) => list.map(v => ({...v, owner})));
const vehiclesOf = (state, ws) => (state.ownedVehicles[ws] || []);

// ---------- 02 General Customer ----------
export function bookScreen(state) {
  const d = state.bookingDraft || {service: 'moving'};
  const svc = d.service || 'moving';
  const choice = (id, icon, title, text) => `<label class="arrangement-choice"><input type="radio" name="service" value="${id}" ${svc === id ? 'checked' : ''} data-op-change="booking-service"><span class="arrangement-icon">${icon}</span><span><b>${title}</b><small>${text}</small></span></label>`;
  const fields = svc === 'moving' ? `
      <label><span>Moving from</span><input name="from" value="${esc(d.from || 'Sector 62, Noida')}" required></label>
      <label><span>Moving to</span><input name="to" value="${esc(d.to || 'DLF Phase 3, Gurugram')}" required></label>
      <label><span>Moving date</span><input type="date" name="date" value="${esc(d.date || '2026-10-04')}"></label>
      <label><span>Home size</span><select name="size">${Object.keys(HOME_SIZES).map(s => `<option ${d.size === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <fieldset class="wide"><legend>Package</legend><div class="check-grid">${Object.entries(MOVING_PACKAGES).map(([id, p]) => `<label><input type="radio" name="pkg" value="${id}" ${(d.pkg || 'standard') === id ? 'checked' : ''}> ${p.label} · <small>${p.includes}</small></label>`).join('')}</div></fieldset>
      <label><span>Floor at pickup</span><input type="number" name="floors" min="0" value="${esc(d.floors ?? 3)}"></label>
      <label><span>Lift available?</span><select name="lift"><option value="yes">Yes</option><option value="no" ${d.lift === 'no' ? 'selected' : ''}>No</option></select></label>
      <label><span>Approx. distance (km)</span><input type="number" name="distanceKm" value="${esc(d.distanceKm || 32)}"></label>
      <label class="wide"><span>Inventory (one item per line or comma separated)</span><textarea name="inventory" rows="3">${esc(d.inventory || 'Beds and mattresses, Wardrobe, Kitchen cartons, TV and electronics')}</textarea></label>`
    : svc === 'driver' ? `
      <label><span>Hire for</span><select name="hireType">${Object.entries(DRIVER_RATES).map(([id, r]) => `<option value="${id}" ${(d.hireType || 'daily') === id ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
      <label><span>Duration</span><input type="number" name="duration" min="1" value="${esc(d.duration || 1)}"></label>
      <label><span>Car</span><select name="carType">${['Hatchback manual', 'Sedan manual', 'SUV automatic', 'SUV manual'].map(c => `<option ${d.carType === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label><span>Start date</span><input type="date" name="date" value="${esc(d.date || '2026-09-29')}"></label>
      <label class="wide"><span>Pickup location</span><input name="location" value="${esc(d.location || 'Sector 62, Noida')}"></label>`
    : svc === 'general' ? `
      <label><span>Service</span><select name="category">${Object.keys(GENERAL_SERVICES).map(c => `<option value="${c}" ${d.category === c ? 'selected' : ''}>${label(c)}</option>`).join('')}</select></label>
      <label><span>Preferred date</span><input type="date" name="date" value="${esc(d.date || '2026-09-29')}"></label>` : '';
  return `${head('Book a service', 'Choose what you need. You see the full price before anything is booked.')}
  <form id="booking-form" data-op-form="booking-review" class="panel form-panel narrow">
    <div class="arrangement-grid service-picker">${choice('moving', '🚚', 'Moving', 'House or office shifting with vehicle and package')}${choice('driver', '🧑‍✈️', 'Hire a personal Driver', 'By the hour, day or month')}${choice('products', '🛒', 'Buy products', 'Search products; the platform picks the store')}${choice('general', '🛠', 'General service', 'Carpenter, electrician, plumber, cleaning')}</div>
    ${svc === 'products' ? `<div class="info-banner"><b>Product search</b><span>You search products, not stores. The platform assigns an eligible fulfilment partner.</span></div><div class="form-actions"><button type="button" class="button primary" data-route="search">Open product search</button></div>` : `
    <div class="voice-row"><label class="wide"><span>Describe your need</span><textarea name="description" rows="2" placeholder="e.g. Move 2 BHK from Noida to Gurugram on 4 October">${esc(d.description || '')}</textarea></label><button type="button" class="button secondary voice-button" data-op="booking-voice" aria-label="Speak your need">🎙 Speak</button></div>
    <p class="mock-hint" id="booking-voice-status">${esc(d.voiceNote || 'Voice fills the form; you still review the price.')}</p>
    <div class="form-grid two">${fields}</div>
    <p id="booking-error" class="field-error" hidden></p>
    <div class="form-actions"><button type="button" class="button secondary" data-route="services">My services</button><button class="button primary" type="submit">Review price</button></div>`}
  </form>`;
}

export function bookingQuote(d) { return d.service === 'moving' ? quoteMoving(d) : d.service === 'driver' ? quoteDriver(d) : quoteGeneral(d) }

export function bookingReviewScreen(state) {
  const d = state.bookingDraft;
  if (!d) return `${head('Review price', 'Start a booking first.')}<button class="button primary" data-route="book">Book a service</button>`;
  const q = bookingQuote(d);
  const title = d.service === 'moving' ? `${d.size} move · ${d.from} → ${d.to}` : d.service === 'driver' ? `Personal Driver · ${DRIVER_RATES[d.hireType]?.label} · ${d.carType}` : `${label(d.category)} visit`;
  return `${head('Review price', 'Check every price component before you book.')}
  <div class="grid two"><section class="panel"><h2>${esc(title)}</h2>
    ${d.service === 'moving' ? `<p class="muted">Date: <b>${esc(d.date)}</b> · Vehicle: <b>${esc(q.vehicle)}</b> · Package: <b>${esc(MOVING_PACKAGES[d.pkg]?.label)}</b></p><div class="chip-row">${inventoryList(d.inventory).map(i => `<span class="chip">${esc(i)}</span>`).join('')}</div>` : ''}
    <table class="price-table"><tbody>${q.components.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${inr(v)}</td></tr>`).join('')}<tr class="total"><td>Total</td><td>${inr(q.total)}</td></tr></tbody></table>
    <div class="form-actions"><button class="button secondary" data-route="book">Edit request</button><button class="button primary" data-op="booking-publish">${d.service === 'moving' ? 'Book move' : d.service === 'driver' ? 'Send to nearby Drivers' : 'Book service'}</button></div></section>
  <aside class="panel"><h2>What happens next</h2><ol class="plain-steps">${d.service === 'moving' ? '<li>The platform assigns the best eligible Mover branch near your pickup. You do not need to pick a company.</li><li>The branch confirms your slot, vehicle and crew.</li><li>You track the move and chat in one job conversation.</li><li>Share your completion OTP only after unloading.</li>' : d.service === 'driver' ? '<li>Verified personal Drivers nearby see your request.</li><li>The first Driver to accept is confirmed; you can chat before the start.</li><li>Confirm completion, then pay.</li>' : '<li>A verified partner accepts the visit.</li><li>Confirm completion, pay and rate.</li>'}</ol></aside></div>`;
}

export function servicesScreen(state) {
  const list = state.serviceRequests.filter(r => r.customer === 'personal');
  const icon = t => ({moving: '🚚', driver: '🧑‍✈️', general: '🛠'}[t] || '▦');
  return `${head('My services', 'Every booking from request to rating.', '<button class="button primary" data-route="book">Book a service</button>')}
  <div class="market-list panel">${list.map(r => `<article class="market-row"><span class="market-icon">${icon(r.type)}</span><span><b>${esc(r.title)}</b><small>${esc(r.id)} · ${esc(r.date)} · ${inr(r.quote?.total)}</small></span>${pill(r.status)}<button class="button secondary" data-op="open-service" data-id="${r.id}">Open</button></article>`).join('') || empty('No bookings yet', 'Book a move, a Driver or a home service.')}</div>`;
}

export function serviceDetailScreen(state) {
  const r = state.serviceRequests.find(x => x.id === state.selectedServiceId && x.customer === 'personal') || state.serviceRequests.find(x => x.customer === 'personal');
  if (!r) return servicesScreen(state);
  const job = r.movingJobId ? state.movingJobs.find(j => j.id === r.movingJobId) : null;
  const steps = job ? MOVING_STEPS : r.type === 'driver' ? [['searching', 'Finding a Driver'], ['accepted', 'Driver confirmed'], ['in_progress', 'Driving in progress'], ['provider_done', 'Driver marked complete'], ['completed', 'You confirmed completion'], ['paid', 'Paid'], ['closed', 'Rated and closed']] : [['requested', 'Requested'], ['accepted', 'Partner confirmed'], ['provider_done', 'Partner marked complete'], ['completed', 'You confirmed completion'], ['paid', 'Paid'], ['closed', 'Rated and closed']];
  const cur = job ? movingStepIndex(job) : steps.findIndex(s => s[0] === r.status);
  const jobDone = job && ['closed'].includes(job.status);
  const canConfirm = job ? false : r.status === 'provider_done';
  const canPay = job ? ['otp_verified'].includes(job.status) && !r.paid : r.status === 'completed' && !r.paid;
  const canRate = (job ? jobDone || job.status === 'paid' : r.status === 'paid') && !r.rating;
  const showOtp = job && ['in_transit', 'unloaded'].includes(job.status);
  return `${head(r.title, `${r.id} · ${label(r.type)} · ${inr(r.quote?.total)}`, r.conversationId ? `<button class="button secondary" data-op="open-conversation" data-id="${r.conversationId}">Message</button>` : '')}
  <div class="grid two"><section class="panel"><h2>Progress</h2><ol class="milestones">${steps.map((s, i) => `<li class="ms ${i < cur || (i === cur && ['closed', 'paid'].includes(s[0])) ? 'done' : i === cur ? 'current' : ''}"><i></i><span><b>${esc(s[1])}</b></span></li>`).join('')}</ol></section>
  <section class="panel"><h2>Your next step</h2>
    ${job ? facts([['Assigned branch', esc(state.movingBranches.find(b => b.id === job.branchId)?.name || 'Assigning…')], ['Vehicle', esc(job.vehicle?.registration || job.vehicleNeed)], ['Crew', esc(job.crew.map(c => c.name).join(', ') || 'Allocating')], ['Live location', job.gps.status === 'active' ? `${esc(job.gps.points.at(-1)?.place || 'Moving')} · live` : label(job.gps.status)]]) : facts([['Provider', esc(r.providerName || 'Finding a match')], ['Date', esc(r.date)], ['Status', pill(r.status)]])}
    ${showOtp ? `<div class="otp-share"><small>Share this completion OTP only after everything is unloaded</small><b>${esc(job.customerOtp)}</b></div>` : ''}
    ${canConfirm ? `<button class="button primary full" data-op="service-confirm" data-id="${r.id}">Confirm work is complete</button>` : ''}
    ${canPay ? `<div class="form-grid two pay-inline"><label><span>Pay with</span><select id="service-pay-method"><option value="platform">UPI via MoveAI</option><option value="cash">Cash (record only)</option></select></label><label><span>Reference</span><input id="service-pay-ref" value="UPI-${esc(r.id)}"></label></div><button class="button primary full" data-op="service-pay" data-id="${r.id}">Pay ${inr(job ? job.total - 2000 : r.quote?.total)}</button>` : ''}
    ${canRate ? `<div class="rating" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="service-rating" value="${n}" ${n === 5 ? 'checked' : ''}><span>★</span></label>`).join('')}</div><input id="service-comment" class="text-field" placeholder="Anything to share? (optional)"><button class="button primary full" data-op="service-rate" data-id="${r.id}">Rate and close</button>` : ''}
    ${r.rating ? `<div class="info-banner"><b>Closed · rated ${'★'.repeat(r.rating)}</b><span>${esc(r.comment || 'Thank you for your feedback.')}</span></div>` : ''}
    ${!canConfirm && !canPay && !canRate && !r.rating && !showOtp ? `<p class="muted">${job ? 'The Mover branch is working on the next step. You will be notified.' : r.status === 'searching' ? 'Waiting for a verified Driver to accept.' : 'Waiting for the provider to finish.'}</p>` : ''}
    <button class="button secondary full" data-op="report-exception" data-ref="${job ? job.id : r.id}">Report a problem</button>
  </section></div>`;
}

// ---------- Trips (03, 04, 05, 15) ----------
export function tripsScreen(state) {
  const {ws} = opsCtx(state);
  const trips = visibleTrips(state);
  const offers = ws === 'vehicle' ? state.vehicleOffers.filter(o => o.to === 'vehicle' && o.status === 'sent') : [];
  const moving = ['transporter', 'staff', 'vehicle'].includes(ws) ? visibleMovingJobs(state) : [];
  const orders = ws === 'goods' ? state.goodsOrders.filter(o => o.workspace === 'goods') : [];
  const row = t => { const cm = currentMilestone(t); return `<article class="market-row trip-row"><span class="market-icon">🚚</span><span><b>${esc(t.title)}</b><small>${esc(t.id)} · ${esc(t.registration || 'Vehicle not assigned')} · ${t.quantity} ${esc(t.unit)} · Next: ${esc(cm?.label || 'Closed')}</small><span class="progress" aria-label="${tripProgress(t)}% complete"><i style="width:${tripProgress(t)}%"></i></span></span>${pill(t.hold ? 'on_hold' : t.status)}<button class="button secondary" data-op="open-trip" data-id="${t.id}">Open</button></article>` };
  return `${head(ws === 'commercialDriver' || ws === 'helper' ? 'My trips' : 'Trips', ws === 'staff' ? 'Only trips in your assigned branches.' : 'One canonical trip per load, seen differently by each party.', ['goods', 'transporter', 'vehicle', 'movers', 'staff', 'commercialDriver', 'helper'].includes(ws) ? '<button class="button secondary" data-route="exceptions">Exceptions</button>' : '')}
  ${offers.length ? `<section class="panel attention"><h2>Load offers from Transporters</h2>${offers.map(o => `<article class="market-row"><span class="market-icon">📨</span><span><b>${esc(o.title)}</b><small>${esc(o.fromName)} · ${esc(o.date)} · Payout ${inr(o.payout)} · Advance ${inr(o.advance)}${o.vehicleId ? ` · for ${esc(o.registration)}` : ''}</small></span>${pill(o.status)}<button class="button primary" data-op="open-vehicle-offer" data-id="${o.id}">Review</button></article>`).join('')}</section>` : ''}
  ${orders.length ? `<section class="panel"><h2>Orders and delivery progress</h2><p class="muted">One order can create several loads. Quantities add up here.</p>${orders.map(o => { const ts = state.trips.filter(t => t.goodsOrderId === o.id); const delivered = ts.filter(t => ['delivered', 'received', 'settled', 'closed'].includes(t.status) || t.milestones.find(m => m.key === 'delivered')?.status === 'done').reduce((a, t) => a + t.quantity, 0); const pct = Math.min(100, Math.round(delivered / o.quantity * 100)); const convs = state.conversations.filter(c => ts.some(t => t.id === c.ref)).length; const money = state.ledger.filter(x => x.status !== 'reversed' && (ts.some(t => t.id === x.sourceId) || x.sourceId === o.id)).reduce((a, x) => a + Number(x.amount), 0); const closable = orderCloseBlock(state, o) === ''; return `<article class="market-row"><span class="market-icon">📦</span><span><b>${esc(o.goods)} · ${o.type === 'sell' ? 'to' : 'from'} ${esc(o.counterparty)}</b><small>${esc(o.id)} · ${ts.length} load(s) · ${delivered} of ${o.quantity} ${esc(o.unit)} delivered · ${convs} conversation(s) · Money ${inr(money)} · Goods ${inr(o.goodsPrice)}</small><span class="progress"><i style="width:${pct}%"></i></span></span>${pill(o.status)}${o.status !== 'closed' && closable ? `<button class="button secondary" data-op="close-order" data-id="${o.id}">Close order</button>` : '<span></span>'}</article>` }).join('')}</section>` : ''}
  <section class="panel"><h2>${ws === 'vehicle' ? 'Trips on my trucks' : 'Transport trips'}</h2><div class="market-list">${trips.map(row).join('') || empty('No trips here', ws === 'staff' ? 'Trips from other branches stay hidden.' : 'Confirmed loads appear here once terms are agreed.')}</div></section>
  ${moving.length ? `<section class="panel"><h2>${ws === 'vehicle' ? 'Moving jobs on my trucks (vehicle partner)' : 'Moving jobs (same team, same fleet)'}</h2>${moving.map(j => `<article class="market-row"><span class="market-icon">📦</span><span><b>${esc(j.size)} · ${esc(j.from)} → ${esc(j.to)}</b><small>${esc(j.id)} · ${esc(j.date)} · ${esc(j.vehicle?.registration || j.vehicleNeed)}</small></span>${pill(j.status)}<button class="button secondary" data-op="open-moving" data-id="${j.id}">Open</button></article>`).join('')}</section>` : ''}`;
}

function tripTermsFor(state, t) {
  const {ws, perms} = opsCtx(state);
  const x = t.terms || {};
  if (ws === 'transporter' || (t.owner === ws)) return [['Freight', inr(x.freight)], x.truckOwnerPayout ? ['Truck Owner payout', inr(x.truckOwnerPayout)] : null, x.advance ? ['Advance', inr(x.advance)] : null, x.driverWage ? ['Driver wage', inr(x.driverWage)] : null, x.khalasiWage ? ['Khalasi wage', inr(x.khalasiWage)] : null, ['Terms', esc(x.paymentTerms)]];
  if (ws === 'goods') return [['Freight', inr(x.freight)], ['Terms', esc(x.paymentTerms)]];
  if (ws === 'vehicle') return [['Your payout', inr(x.truckOwnerPayout)], ['Advance', inr(x.advance ? Math.min(x.advance, 10000) : 0)]];
  if (ws === 'commercialDriver') return [['Your wage', inr(x.driverWage)], ['Reimbursements', 'Toll, food and Dharamkata receipts paid separately']];
  if (ws === 'helper') return [['Your wage', inr(x.khalasiWage)]];
  if (ws === 'staff') return perms.includes('money.view') ? [['Freight', inr(x.freight)], ['Terms', esc(x.paymentTerms)]] : [['Money', 'Hidden for your role']];
  return [];
}

export function tripDetailScreen(state) {
  const t = selectedTrip(state);
  if (!t) return `${head('Trip', 'No trip is visible in this workspace.')}<button class="button primary" data-route="home">Home</button>`;
  const {ws} = opsCtx(state);
  const cm = currentMilestone(t);
  const meta = cm ? stepMeta(cm.key) : null;
  const roleKey = ws;
  const canAct = cm && meta && (meta.roles.includes(roleKey) || (ws === 'staff' && meta.roles.includes('staff'))) && !t.hold && !['closed', 'cancelled'].includes(t.status);
  const vehicle = allVehicles(state).find(v => v.id === t.vehicleId);
  const isDriver = ws === 'commercialDriver' && t.crew.some(c => c.persona === ws && c.role === 'driver');
  const gpsBlock = gpsAllowed(t, ws);
  const next = ['delivered', 'received', 'settled', 'closed'].includes(t.status) && ['transporter', 'vehicle'].includes(ws) ? nextLoadsNear(t.to, [...state.availableLoads, ...(state.nextLoadPool || [])]) : [];
  const myCrew = t.crew.find(c => c.persona === ws);
  const receiptDue = cm?.key === 'received' && ws === 'goods';
  const assignDue = cm?.key === 'vehicle_assigned' && can(state, 'trip.assign', t);
  const settleReady = cm?.key === 'settled' && can(state, 'trip.settle', t);
  return `${head(t.title, `${t.id} · ${t.quantity} ${t.unit} · ${t.from} → ${t.to}`, `<button class="button secondary" data-op="open-conversation" data-id="${t.conversationId}">Trip chat</button>`)}
  ${t.hold ? `<div class="action-warning"><b>On hold: ${esc(t.hold)}</b><span>Only affected parties were notified. Open the exception for the safe next action.</span><button class="button secondary" data-route="exceptions">Open exceptions</button></div>` : ''}
  <div class="route-strip" aria-label="Route"><span><small>Pickup</small><b>${esc(t.from)}</b></span><i aria-hidden="true"></i><span class="truck-dot" style="--p:${tripProgress(t)}%">🚚</span><span><small>Drop</small><b>${esc(t.to)}</b></span></div>
  <div class="grid two trip-grid">
    <section class="panel"><div class="panel-header"><div><h2>Milestones</h2><p>${t.dharamkata ? 'Dharamkata was selected, so weighment is mandatory with proof.' : 'Dharamkata not selected for this trip.'}</p></div></div>
      <ol class="milestones">${t.milestones.map(m => `<li class="ms ${m.status === 'done' ? 'done' : cm?.key === m.key ? 'current' : ''}"><i></i><span><b>${esc(m.label)}</b><small>${m.status === 'done' ? `${esc(m.at)} · ${esc(m.by || '')}${m.proof ? ` · 📎 ${esc(m.proof)}` : ''}${m.manual ? ' · manual' : ''}` : cm?.key === m.key ? 'Next step' : 'Pending'}</small></span></li>`).join('')}</ol>
      ${canAct && !receiptDue && !assignDue && !settleReady ? `<div class="milestone-action">${meta.proof ? `<label><span>${esc(meta.proof)}</span><input type="file" id="milestone-proof-file" accept="image/*,application/pdf"><input id="milestone-proof" class="text-field" placeholder="or type the file / slip number"></label>` : ''}${cm.key === 'dharamkata' ? '<label><span>Net weight (tonnes)</span><input id="dharamkata-weight" type="number" step="0.01" value="' + t.quantity + '"></label>' : ''}<button class="button primary full" data-op="trip-milestone" data-id="${t.id}" data-key="${cm.key}">Confirm: ${esc(cm.label)}</button>${t.manualMode ? '<p class="mock-hint">GPS is down — milestones are recorded manually with your location note.</p>' : ''}</div>` : ''}
      ${assignDue ? `<button class="button primary full" data-op="open-assign" data-id="${t.id}">Choose vehicle and crew</button>` : ''}
      ${cm?.key === 'crew_accepted' && t.crew.some(c => !c.accepted) ? `<p class="mock-hint">Waiting for ${esc(t.crew.filter(c => !c.accepted).map(c => c.name).join(', '))} to accept in their own app.</p>` : ''}
      ${receiptDue ? receiptForm(t) : ''}
      ${settleReady ? `<div class="milestone-action">${t.settlementCreated ? '<p>Settlement entries are in Money. Close the trip when parties have been paid or recorded.</p>' : '<p>Create freight balance, Truck Owner final amount, crew wages and reimbursements as separate entries.</p>'}<button class="button ${t.settlementCreated ? 'secondary' : 'primary'} full" data-op="trip-settlement" data-id="${t.id}" ${t.settlementCreated ? 'disabled' : ''}>${t.settlementCreated ? 'Settlement entries created' : 'Create settlement entries'}</button>${t.settlementCreated ? `<button class="button primary full" data-op="trip-milestone" data-id="${t.id}" data-key="settled">Close trip as settled</button>` : ''}</div>` : ''}
    </section>
    <div class="stack">
      <section class="panel"><h2>Vehicle and crew</h2>${facts([['Vehicle', vehicle ? `${esc(vehicle.registration)} · ${esc(vehicle.truckType)}` : 'Not assigned'], ['Vehicle source', esc(label(t.vehicleSource || 'pending'))], ['Documents', vehicle ? (docsValid(vehicle) ? pill('valid') : pill('expired')) : '—'], ...t.crew.map(c => [label(c.role === 'helper' ? 'Khalasi / Helper' : c.role), `${esc(c.name)} ${c.accepted ? '' : pill('waiting')} <small class="muted">${esc(c.classification)}</small>`])])}
        ${myCrew && !myCrew.accepted ? `<button class="button primary full" data-op="crew-accept" data-id="${t.id}">Accept this assignment</button>` : ''}</section>
      <section class="panel"><h2>Live location</h2><div class="gps-track">${(t.gps.points || []).map(p => `<span><i></i><b>${esc(p.place)}</b><small>${esc(p.at)}</small></span>`).join('') || '<small class="muted">Tracking starts after assignment and Driver consent.</small>'}</div>
        <p class="muted">Status: ${pill(t.gps.status)} ${t.gps.consent ? '· Driver consented for this trip only' : '· Driver consent pending'}</p>
        ${isDriver ? (!t.gps.consent ? `<label class="consent-row"><input type="checkbox" id="gps-consent"> I allow location sharing for ${esc(t.id)} only, until the trip closes.</label><button class="button secondary full" data-op="gps-consent" data-id="${t.id}">Save consent</button>` : gpsBlock ? `<p class="mock-hint">${esc(gpsBlock)}</p>` : `<button class="button secondary full" data-op="gps-ping" data-id="${t.id}">Send location update</button>`) : ''}
      </section>
      <section class="panel"><h2>${ws === 'commercialDriver' || ws === 'helper' ? 'Your pay' : 'Money'}</h2>${facts(tripTermsFor(state, t))}<button class="button secondary full" data-route="money">Open Money</button></section>
      ${next.length ? `<section class="panel"><h2>Next load near ${esc(t.to.split(',')[0])}</h2>${next.map(l => `<article class="market-row"><span class="market-icon">🧭</span><span><b>${esc(l.route || `${l.pickup} → ${l.drop}`)}</b><small>${esc(l.goods || '')} · ${esc(l.capacity)} t · ${esc(l.date)}</small></span><span></span><button class="button secondary" data-op="offer-next-load" data-id="${t.id}" data-load="${l.id}">${ws === 'vehicle' ? 'Request' : 'Offer to truck'}</button></article>`).join('')}</section>` : ''}
      ${ws === 'goods' && t.milestones.find(m => m.key === 'received')?.status === 'done' ? closeOutPanel(state, t) : ''}
      <button class="button secondary full" data-op="report-exception" data-ref="${t.id}">Report a problem on this trip</button>
    </div>
  </div>`;
}

function receiptForm(t) {
  return `<form class="milestone-action" data-op-form="trip-receipt" data-id="${t.id}"><h3>${t.goodsRole === 'buyer' ? 'Receive goods' : 'Record receiver confirmation'}</h3><div class="form-grid two"><label><span>Quantity received (${esc(t.unit)})</span><input name="quantity" type="number" step="0.01" value="${t.quantity}"></label><label><span>Condition</span><select name="condition"><option>Good</option><option>Minor damage</option><option>Damaged</option></select></label><label class="wide"><span>Note</span><input name="note" value="Seals intact, count verified"></label></div><p class="field-error" id="receipt-error" hidden></p><div class="form-actions"><button class="button primary" type="submit">Confirm receipt</button></div><p class="mock-hint">Short quantity or damage opens a dispute automatically and holds the balance.</p></form>`;
}

export function assignTripScreen(state) {
  const t = selectedTrip(state);
  const {ws, ownerWs} = opsCtx(state);
  if (!t || !can(state, 'trip.assign', t)) return `${head('Assign vehicle and crew', 'Only the business running this trip can assign it.')}<button class="button primary" data-route="trips">Back to trips</button>`;
  const own = vehiclesOf(state, ownerWs);
  const external = (state.ownedVehicles.vehicle || []).filter(() => ownerWs !== 'vehicle');
  const posted = state.truckAvailability.filter(a => a.status === 'available');
  const staffCrew = (state.peopleByWorkspace[ownerWs] || []).filter(p => ['driver', 'helper'].includes(p.role) && p.status === 'active');
  const d = state.assignDraft?.tripId === t.id ? state.assignDraft : {vehicleSource: 'own_fleet', crewSource: 'staff'};
  const radio = (name, value, text, small) => `<label class="arrangement-choice"><input type="radio" name="${name}" value="${value}" ${d[name] === value ? 'checked' : ''} data-op-change="assign-draft"><span><b>${text}</b><small>${small}</small></span></label>`;
  return `${head('Assign vehicle and crew', `${t.id} · ${t.from} → ${t.to} · ${t.quantity} t · ${t.window.from.slice(0, 10)}`)}
  <form data-op-form="assign-trip" data-id="${t.id}" class="panel form-panel">
    <h2>1. Vehicle source</h2><div class="arrangement-grid three-col">${radio('vehicleSource', 'own_fleet', 'Own fleet', `${own.length} vehicle(s) in this business`)}${ownerWs !== 'vehicle' ? radio('vehicleSource', 'external_owner', 'Offer to a Vehicle Owner', 'Owner accepts and may bring crew') + radio('vehicleSource', 'posted', 'Trucks posted as available', `${posted.length} verified post(s)`) : ''}</div>
    ${d.vehicleSource === 'own_fleet' ? `<label class="field-label">Vehicle</label><div class="choice-list">${own.map(v => { const ok = docsValid(v, t.window.from); return `<label class="choice-item ${ok ? '' : 'blocked'}"><input type="radio" name="vehicleId" value="${v.id}" ${d.vehicleId === v.id ? 'checked' : ''}><span><b>${esc(v.registration)}</b><small>${esc(v.truckType)} · ${v.capacity} t · ${ok ? 'documents valid' : 'documents expired'}</small></span></label>` }).join('') || empty('No owned vehicles', 'Add a vehicle in Fleet or use another source.')}</div>` : ''}
    ${d.vehicleSource === 'external_owner' ? `<label class="field-label">Vehicle Owner's approved truck</label><div class="choice-list">${external.map(v => `<label class="choice-item"><input type="radio" name="vehicleId" value="${v.id}" ${d.vehicleId === v.id ? 'checked' : ''}><span><b>${esc(v.registration)} · Raj Transport</b><small>${esc(v.truckType)} · ${v.capacity} t · ${esc(v.status)}</small></span></label>`).join('')}</div><label><span>Payout offered to owner</span><input name="payout" type="number" value="${t.terms.truckOwnerPayout || 30000}"></label><label><span>Advance</span><input name="advance" type="number" value="${t.terms.advance || 8000}"></label>` : ''}
    ${d.vehicleSource === 'posted' ? `<label class="field-label">Available truck posts</label><div class="choice-list">${posted.map(a => `<label class="choice-item"><input type="radio" name="vehicleId" value="${a.vehicleId}" ${d.vehicleId === a.vehicleId ? 'checked' : ''}><span><b>${esc(a.registration)} · ${esc(a.location)}</b><small>${esc(a.truckType)} · ${a.capacity} t · from ${esc(a.availableDate)} · ${esc(a.crew)}</small></span></label>`).join('')}</div><label><span>Payout offered</span><input name="payout" type="number" value="${t.terms.truckOwnerPayout || 30000}"></label><label><span>Advance</span><input name="advance" type="number" value="${t.terms.advance || 8000}"></label>` : ''}
    <h2>2. Driver and Khalasi source</h2><div class="arrangement-grid three-col">${radio('crewSource', 'staff', 'Existing staff / partner crew', `${staffCrew.length} active`)}${radio('crewSource', 'platform', 'Hire from platform', `${state.platformWorkers.filter(w => w.status === 'available').length} verified workers`)}${d.vehicleSource !== 'own_fleet' ? radio('crewSource', 'owner', 'Vehicle Owner provides crew', 'Owner assigns own Driver/Khalasi') : ''}</div>
    ${d.crewSource === 'owner' ? '<p class="mock-hint">The Vehicle Owner assigns crew when accepting your offer.</p>' : crewPickers(state, d.crewSource === 'platform' ? state.platformWorkers.filter(w => w.status === 'available').map(w => ({...w})) : staffCrew.map(p => ({id: p.id, name: p.name, capabilities: [p.role], licences: p.role === 'driver' ? ['Heavy vehicle'] : [], status: p.status, classification: 'staff'})), d)}
    <p id="assign-error" class="field-error" hidden></p>
    <div class="form-actions"><button type="button" class="button secondary" data-op="open-trip" data-id="${t.id}">Back</button><button class="button primary" type="submit">${d.vehicleSource === 'own_fleet' ? 'Validate and assign' : 'Validate and send offer'}</button></div>
  </form>`;
}

function crewPickers(state, workers, d) {
  const opt = role => workers.filter(w => w.capabilities.includes(role)).map(w => `<option value="${w.id}" ${d[role + 'Id'] === w.id ? 'selected' : ''}>${esc(w.name)} · ${esc((w.licences || []).join(', ') || (w.skills || []).join(', ') || 'No licence needed')}${w.rating ? ` · ★${w.rating}` : ''}</option>`).join('');
  return `<div class="form-grid two"><label><span>Driver</span><select name="driverId"><option value="">Select Driver</option>${opt('driver')}</select></label><label><span>Khalasi / Helper (optional)</span><select name="helperId"><option value="">None</option>${opt('helper')}</select></label></div><p class="mock-hint">Commercial trucks need a commercial licence. A personal-car licence is rejected here, and a Khalasi needs no licence.</p>`;
}

export function vehicleOfferScreen(state) {
  const o = state.vehicleOffers.find(x => x.id === state.selectedVehicleOfferId);
  if (!o) return tripsScreen(state);
  const mine = (state.ownedVehicles.vehicle || []);
  const crew = (state.peopleByWorkspace.vehicle || []).filter(p => ['driver', 'helper'].includes(p.role));
  return `${head('Transporter load offer', `${o.fromName} · ${o.title}`)}<div class="grid two"><section class="panel">${facts([['Route', esc(o.title)], ['Date', esc(o.date)], ['Payout', inr(o.payout)], ['Advance', inr(o.advance)], ['Goods', esc(o.goods)], ['Crew', o.ownerProvidesCrew ? 'You assign your crew' : 'Transporter assigns crew']])}</section>
  <form class="panel form-panel" data-op-form="vehicle-offer-accept" data-id="${o.id}"><label><span>Truck</span><select name="vehicleId">${mine.map(v => `<option value="${v.id}" ${v.id === o.vehicleId ? 'selected' : ''}>${esc(v.registration)} · ${esc(v.truckType)} · ${docsValid(v) ? 'documents valid' : 'documents expired'}</option>`).join('')}</select></label>
  ${o.ownerProvidesCrew ? `<label><span>Your Driver</span><select name="driverId"><option value="">Select</option>${crew.filter(c => c.role === 'driver').map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}${state.platformWorkers.filter(w => w.capabilities.includes('driver')).map(w => `<option value="${w.id}">${esc(w.name)} · platform · ${esc(w.licences.join(', '))}</option>`).join('')}</select></label><label><span>Khalasi</span><select name="helperId"><option value="">None</option>${state.platformWorkers.filter(w => w.capabilities.includes('helper')).map(w => `<option value="${w.id}">${esc(w.name)} · platform</option>`).join('')}</select></label>` : ''}
  <p id="offer-error" class="field-error" hidden></p><div class="form-actions"><button type="button" class="button secondary" data-op="vehicle-offer-decline" data-id="${o.id}">Decline</button><button class="button primary">Accept and assign</button></div></form></div>`;
}

// ---------- Fleet (06, 07) ----------
const DAYS = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
export function fleetScreen(state) {
  const {ownerWs, ws} = opsCtx(state);
  const list = vehiclesOf(state, ownerWs);
  const ids = new Set(list.map(v => v.id));
  const bookings = state.bookings.filter(b => ids.has(b.resourceId) && b.status !== 'released');
  const cell = (v, day) => { const b = bookings.find(x => x.resourceId === v.id && x.from.slice(0, 10) <= day && x.to.slice(0, 10) >= day); return `<td class="${b ? `busy ${b.service}` : ''}" title="${b ? esc(b.label) : 'Free'}">${b ? esc(b.ref) : ''}</td>` };
  return `${head(ws === 'vehicle' ? 'My Trucks' : 'Fleet', 'Documents, availability and one shared calendar for transport and moving work.', can(state, 'fleet.manage') ? '<button class="button primary" data-route="addVehicle">+ Add vehicle</button>' : '')}
  <div class="metrics"><div class="metric"><span>Vehicles</span><b>${list.length}</b><small>${list.filter(v => v.status === 'idle').length} idle</small></div><div class="metric"><span>Documents valid</span><b>${list.filter(v => docsValid(v)).length}</b><small>${list.filter(v => !docsValid(v)).length} need action</small></div><div class="metric"><span>Booked this week</span><b>${new Set(bookings.map(b => b.resourceId)).size}</b><small>Overlaps are blocked</small></div><div class="metric"><span>Partners</span><b>${state.partnerships.filter(p => p.vehicleOwner === ownerWs || p.mover === ownerWs).length}</b><small>Mover partnerships</small></div></div>
  <section class="panel"><h2>Vehicles</h2><div class="market-list">${list.map(v => `<article class="market-row"><span class="market-icon">🚛</span><span><b>${esc(v.registration)}</b><small>${esc(v.truckType)} · ${v.capacity} t · Documents ${esc(v.documents)} until ${esc(v.documentExpiry || '—')}</small></span>${pill(docsValid(v) ? v.status : 'documents_' + v.documents)}<button class="button secondary" data-op="open-vehicle" data-id="${v.id}">Open</button></article>`).join('') || empty('No vehicles yet', 'Add your first vehicle and upload its documents.')}</div></section>
  <section class="panel"><div class="panel-header"><div><h2>Fleet calendar</h2><p>Transport and moving bookings share one calendar, so one truck cannot be double-booked.</p></div><div class="legend"><span class="transport">Transport</span><span class="movers">Moving</span></div></div>
    <div class="table-scroll"><table class="calendar"><thead><tr><th>Vehicle</th>${DAYS.map(d => `<th>${d.slice(8)}/${d.slice(5, 7)}</th>`).join('')}</tr></thead><tbody>${list.map(v => `<tr><th>${esc(v.registration)}</th>${DAYS.map(d => cell(v, d)).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}

export function vehicleDetailScreen(state) {
  const {ownerWs, ws} = opsCtx(state);
  const v = vehiclesOf(state, ownerWs).find(x => x.id === state.selectedVehicleId) || vehiclesOf(state, ownerWs)[0];
  if (!v) return fleetScreen(state);
  const docs = state.vehicleDocs[v.id] || DOC_TYPES.map(type => ({type, status: 'missing', file: ''}));
  const allUp = docs.every(d => ['uploaded', 'approved'].includes(d.status));
  const pendingAdmin = state.verificationQueue.some(q => q.vehicleId === v.id && ['pending', 'correction_required'].includes(q.status));
  const trips = state.trips.filter(t => t.vehicleId === v.id);
  const partnership = state.partnerships.find(p => p.vehicleId === v.id);
  return `${head(v.registration, `${v.truckType} · ${v.capacity} t · ${label(v.status)}`, '<button class="button secondary" data-route="fleet">Back to fleet</button>')}
  <div class="grid two"><section class="panel"><div class="panel-header"><div><h2>Documents</h2><p>Staff upload → Owner review → Admin approval. Expired documents block new assignments.</p></div></div>
    <div class="document-list">${docs.map(d => `<div class="document-row"><span class="document-icon">▣</span><span class="document-copy"><b>${esc(d.type)}</b><small>${d.file ? esc(d.file) : 'Not uploaded'}${d.expiry ? ` · valid until ${esc(d.expiry)}` : ''}${d.uploadedBy ? ` · ${esc(d.uploadedBy)}` : ''}</small></span>${pill(d.status)}${can(state, 'fleet.manage') && d.status !== 'approved' ? `<label class="button secondary compact upload-label">Upload<input type="file" hidden data-op-file="vehicle-doc" data-id="${v.id}" data-doc="${esc(d.type)}" accept="image/*,application/pdf"></label>` : ''}</div>`).join('')}</div>
    ${can(state, 'fleet.review') && allUp && docs.some(d => d.status === 'uploaded') && !pendingAdmin ? `<button class="button primary full" data-op="vehicle-owner-review" data-id="${v.id}">Owner reviewed · submit to Admin</button>` : ''}
    ${pendingAdmin ? '<div class="info-banner"><b>Waiting for Admin approval</b><span>You will be notified. The vehicle stays blocked for new trips until approved.</span></div>' : ''}
  </section>
  <div class="stack"><section class="panel"><h2>How will this vehicle be used?</h2><div class="arrangement-grid">
    <button class="arrangement-choice as-button" data-op="vehicle-use" data-id="${v.id}" data-use="own"><span class="arrangement-icon">🏠</span><span><b>Own goods / own work</b><small>Reserve for this business</small></span></button>
    ${['goods', 'transporter', 'vehicle'].includes(ownerWs) ? `<button class="arrangement-choice as-button" data-route="postAvailableTruck"><span class="arrangement-icon">📣</span><span><b>Post availability</b><small>Transporters and goods owners see it</small></span></button>` : ''}
    ${ownerWs === 'vehicle' ? `<button class="arrangement-choice as-button" data-route="trips"><span class="arrangement-icon">📨</span><span><b>Transporter offers</b><small>${state.vehicleOffers.filter(o => o.to === 'vehicle' && o.status === 'sent').length} waiting</small></span></button>
    <button class="arrangement-choice as-button" data-op="vehicle-partner" data-id="${v.id}"><span class="arrangement-icon">🤝</span><span><b>Join a Mover as vehicle partner</b><small>${partnership ? `SafeMove Packers · ${esc(partnership.status)}` : 'SafeMove Packers approves partners'}</small></span></button>` : ''}
  </div></section>
  <section class="panel"><h2>Trips and earnings</h2>${trips.map(t => `<article class="market-row"><span class="market-icon">🚚</span><span><b>${esc(t.title)}</b><small>${esc(t.id)} · ${esc(t.crew.map(c => c.name).join(', ') || 'No crew')}</small></span>${pill(t.status)}<button class="button secondary" data-op="open-trip" data-id="${t.id}">Open</button></article>`).join('') || empty('No trips yet', 'Accepted offers and own work appear here.')}</section></div></div>`;
}

export function addVehicleScreen(state) {
  const {ownerWs} = opsCtx(state);
  const branches = state.businessProfiles[ownerWs]?.branches || [];
  return `${head('Add vehicle', 'Save the vehicle first; documents can be uploaded by staff and reviewed by the owner.')}<form class="panel form-panel narrow" data-op-form="add-vehicle"><div class="form-grid two"><label class="wide"><span>Registration number — lookup fills details and document dates from Vahan</span><span class="inline-add"><input name="registration" value="BR01 GX 7744" required autocapitalize="characters"><button type="button" class="button secondary" data-rc-fetch>Look up RC</button></span><span id="rc-note" class="verify-note" hidden></span><input type="hidden" name="rcSource" value=""></label><label><span>Vehicle type</span><select name="truckType">${['14-wheel open', '22-ft closed', '19-ft closed', '14-ft closed', '8-ft mini truck'].map(x => `<option>${x}</option>`).join('')}</select></label><label><span>Capacity (tonnes)</span><input name="capacity" type="number" value="12" min="1"></label><label><span>Branch</span><select name="branchId">${branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label></div><p class="mock-hint">Prototype test data: Any registration. Ending 0000 → not found on Vahan. Ending 1111 → insurance expired.</p><p id="vehicle-error" class="field-error" hidden></p><div class="form-actions"><button type="button" class="button secondary" data-route="fleet">Cancel</button><button class="button primary">Save vehicle</button></div></form>`;
}

// ---------- Moving (08, 16) ----------
export function movingQueueScreen(state) {
  const jobs = visibleMovingJobs(state);
  const byBranch = {};
  jobs.forEach(j => (byBranch[j.branchId] ||= []).push(j));
  const partners = state.partnerships.filter(p => p.mover === 'movers');
  return `${head('Moving jobs', 'Customers see a vehicle/package price; the platform assigns requests to the best eligible branch.')}
  <div class="metrics"><div class="metric"><span>New requests</span><b>${jobs.filter(j => j.status === 'auto_assigned').length}</b><small>Confirm slot and price</small></div><div class="metric"><span>In progress</span><b>${jobs.filter(j => !['auto_assigned', 'closed'].includes(j.status)).length}</b><small>Crew and GPS</small></div><div class="metric"><span>Partner requests</span><b>${partners.filter(p => p.status === 'requested').length}</b><small>Vehicle owners</small></div><div class="metric"><span>Closed</span><b>${jobs.filter(j => j.status === 'closed').length}</b><small>Payouts released</small></div></div>
  ${Object.entries(byBranch).map(([b, list]) => `<section class="panel"><h2>${esc(state.movingBranches.find(x => x.id === b)?.name || b)} queue</h2>${list.map(j => `<article class="market-row"><span class="market-icon">📦</span><span><b>${esc(j.size)} · ${esc(j.customerName)}</b><small>${esc(j.id)} · ${esc(j.from)} → ${esc(j.to)} · ${esc(j.date)} · ${inr(j.total)}</small></span>${pill(j.status)}<button class="button secondary" data-op="open-moving" data-id="${j.id}">Open</button></article>`).join('')}</section>`).join('') || empty('No moving requests', 'Auto-assigned requests appear here.')}
  ${partners.length ? `<section class="panel"><h2>Vehicle owners asking to partner</h2>${partners.map(p => `<article class="market-row"><span class="market-icon">🤝</span><span><b>${esc(p.registration)} · Raj Transport</b><small>Requested ${esc(p.requestedAt)} · documents verified by Admin</small></span>${pill(p.status)}${p.status === 'requested' ? `<button class="button primary" data-op="approve-partner" data-id="${p.id}">Approve partner</button>` : '<span></span>'}</article>`).join('')}</section>` : ''}`;
}

export function movingJobScreen(state) {
  const j = selectedJob(state);
  if (!j) return movingQueueScreen(state);
  const {ws, ownerWs} = opsCtx(state);
  const manage = can(state, 'moving.manage', j);
  const i = movingStepIndex(j);
  const next = MOVING_STEPS[i + 1];
  const ownV = vehiclesOf(state, ownerWs);
  const partnerV = state.partnerships.filter(p => p.mover === ownerWs && p.status === 'approved').map(p => ({id: p.vehicleId, registration: p.registration, source: 'partner', owner: p.vehicleOwner}));
  const staffCrew = (state.peopleByWorkspace[ownerWs] || []).filter(p => p.status === 'active' && ['driver', 'helper', 'operations'].includes(p.role));
  const crewItem = c => `<span class="chip">${esc(c.name)} · ${esc(c.role)} · <small>${esc(c.classification)}</small></span>`;
  let action = '';
  if (manage && next) {
    const k = next[0];
    action = k === 'slot_confirmed' ? `<div class="form-grid two"><label><span>Slot</span><select id="moving-slot"><option>${esc(j.date)} · 8–11 AM</option><option>${esc(j.date)} · 11 AM–2 PM</option><option>${esc(j.date)} · 2–5 PM</option></select></label></div><table class="price-table">${j.price.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${inr(b)}</td></tr>`).join('')}<tr class="total"><td>Customer price</td><td>${inr(j.total)}</td></tr></table>`
      : k === 'resources_allocated' ? `<div class="form-grid two"><label><span>Vehicle</span><select id="moving-vehicle"><option value="">Select</option>${ownV.map(v => `<option value="${v.id}|owned">${esc(v.registration)} · owned · ${esc(v.truckType)}</option>`).join('')}${partnerV.map(v => `<option value="${v.id}|partner">${esc(v.registration)} · approved partner</option>`).join('')}</select></label><label><span>Crew</span><select id="moving-crew" multiple size="4">${staffCrew.map(p => `<option value="staff|${p.id}">${esc(p.name)} · staff ${esc(p.role)}</option>`).join('')}${state.platformWorkers.filter(w => w.capabilities.includes('helper') || w.capabilities.includes('driver')).map(w => `<option value="platform|${w.id}">${esc(w.name)} · platform ${esc(w.capabilities.join('/'))}</option>`).join('')}</select></label></div><p class="mock-hint">Staff crew see internal chat; platform workers see only this job's chat and are paid per job.</p>`
        : k === 'packed' ? `<div class="checklist">${j.inventory.map((x, n) => `<label><input type="checkbox" data-op-change="inventory-tick" data-id="${j.id}" data-index="${n}" ${x.packed ? 'checked' : ''}> ${esc(x.item)}</label>`).join('')}</div><div class="inline-add"><input id="inventory-new" class="text-field" placeholder="Add an item"><button type="button" class="button secondary" data-op="inventory-add" data-id="${j.id}">Add</button></div>`
          : k === 'loaded' ? `<label><span>Loading proof</span><input type="file" id="moving-proof-file" accept="image/*"><input id="moving-proof" class="text-field" placeholder="or type photo name"></label>`
            : k === 'otp_verified' ? `<label><span>Customer completion OTP</span><input id="moving-otp" class="otp-input" inputmode="numeric" maxlength="4" placeholder="4 digits"></label><p class="mock-hint">Demo OTP for this job: ${esc(j.customerOtp)} (shown to the customer in My services).</p>`
              : k === 'paid' ? `<label><span>Customer balance received by</span><select id="moving-pay-method"><option value="upi">UPI</option><option value="cash">Cash</option><option value="platform">Paid in app</option></select></label>` : '';
    action = `<div class="milestone-action">${action}<p id="moving-error" class="field-error" hidden></p><button class="button primary full" data-op="moving-step" data-id="${j.id}" data-next="${k}">${esc(k === 'closed' ? 'Release partner and crew payouts, close job' : next[1])}</button></div>`;
  }
  return `${head(`${j.size} · ${j.customerName}`, `${j.id} · ${j.from} → ${j.to} · ${j.date}`, j.conversationId ? `<button class="button secondary" data-op="open-conversation" data-id="${j.conversationId}">Job chat</button>` : '')}
  <div class="grid two"><section class="panel"><h2>Job steps</h2><ol class="milestones">${MOVING_STEPS.map((s, n) => `<li class="ms ${n <= i ? 'done' : n === i + 1 ? 'current' : ''}"><i></i><span><b>${esc(s[1])}</b><small>${esc(j.history.find(h => h.status === s[0])?.at || '')}</small></span></li>`).join('')}</ol>${action}</section>
  <div class="stack"><section class="panel"><h2>Resources</h2>${facts([['Package', esc(MOVING_PACKAGES[j.pkg]?.label)], ['Vehicle need', esc(j.vehicleNeed)], ['Vehicle', j.vehicle ? `${esc(j.vehicle.registration)} · ${esc(j.vehicle.source)}` : 'Not allocated'], ['Loading proof', esc(j.loadingProof || '—')], ['GPS', pill(j.gps.status)]])}<div class="chip-row">${j.crew.map(crewItem).join('') || '<small class="muted">No crew yet</small>'}</div></section>
  <section class="panel"><h2>Inventory</h2><div class="checklist readonly">${j.inventory.map(x => `<span>${x.packed ? '✓' : '○'} ${esc(x.item)}</span>`).join('')}</div></section>
  <button class="button secondary full" data-op="report-exception" data-ref="${j.id}">Report a problem</button></div></div>`;
}

// ---------- Workers (09, 10, 11) ----------
export function myJobsScreen(state) {
  const {ws} = opsCtx(state);
  const offers = state.workOffers.filter(o => o.to === ws);
  const trips = state.trips.filter(t => t.crew.some(c => c.persona === ws));
  const moves = state.movingJobs.filter(j => j.crew.some(c => c.persona === ws));
  const worker = state.platformWorkers.find(w => w.persona === ws);
  const bookings = ws === 'personalDriver' ? state.serviceRequests.filter(r => r.type === 'driver' && (r.provider === ws || r.status === 'searching')) : [];
  const upgrade = ws === 'personalDriver' ? state.verificationQueue.find(q => q.ownerWorkspace === 'personalDriver' && /Commercial/.test(q.capability)) : null;
  const kindLabel = {trip: 'One-trip offer', invite: 'Business invite', job: 'Per moving job', fixed_days: 'Fixed days / temporary'};
  return `${head(ws === 'personalDriver' ? 'Bookings' : 'My jobs', ws === 'personalDriver' ? 'Customer requests near you and your confirmed bookings.' : 'Offers, invites and the work you are assigned to. You only see assigned work.')}
  ${ws === 'helper' ? `<section class="panel"><div class="panel-header"><div><h2>My capabilities</h2><p>One profile, several skills. A driving licence is not needed unless you also drive.</p></div></div><form class="check-grid" data-op-form="helper-skills">${['Truck Khalasi', 'Loading / unloading', 'Moving helper / packer', 'Warehouse / assembly'].map(s => `<label><input type="checkbox" name="skills" value="${s}" ${worker?.skills?.includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}<button class="button secondary compact">Save skills</button></form></section>` : ''}
  ${ws === 'personalDriver' ? `<section class="panel"><div class="panel-header"><div><h2>Customer requests</h2><p>Personal Driver work is separate from commercial trucks.</p></div><button class="button secondary" data-route="upgradeDriver">${upgrade ? `Upgrade: ${esc(label(upgrade.status))}` : 'Upgrade to Commercial Driver'}</button></div>${bookings.map(r => `<article class="market-row"><span class="market-icon">🧑‍✈️</span><span><b>${esc(r.title)}</b><small>${esc(r.id)} · ${esc(r.customerName || 'Shubham Kumar')} · ${esc(r.location)} · ${esc(r.date)} · You earn ${inr(r.quote.driverEarning)}</small></span>${pill(r.status)}<button class="button ${r.status === 'searching' ? 'primary' : 'secondary'}" data-op="${r.status === 'searching' ? 'driver-accept-request' : 'open-driver-job'}" data-id="${r.id}">${r.status === 'searching' ? 'Accept' : 'Open'}</button></article>`).join('') || empty('No requests nearby', 'Keep availability on to receive requests.')}</section>` : ''}
  <section class="panel"><h2>Offers and invites</h2>${offers.map(o => `<article class="market-row offer-row"><span class="market-icon">${o.kind === 'invite' ? '✉' : '📨'}</span><span><b>${esc(o.title)}</b><small>${esc(kindLabel[o.kind] || o.kind)} · ${esc(o.fromName)} · ${esc(o.date)}${o.vehicle ? ` · ${esc(o.vehicle)}` : ''} · ${inr(o.pay)}${o.payType ? ' ' + esc(o.payType) : ''}${o.advance ? ` · advance ${inr(o.advance)}` : ''}${o.platformFee ? ` · platform fee ${inr(o.platformFee)} paid by ${esc(o.feePaidBy)}, not deducted from you` : ''}</small></span>${pill(o.status)}${o.status === 'pending' ? `<span class="row-actions"><button class="button secondary" data-op="offer-decline" data-id="${o.id}">Decline</button><button class="button primary" data-op="offer-accept" data-id="${o.id}">Accept</button></span>` : '<span></span>'}</article>`).join('') || empty('No offers right now', 'Post your availability in Profile to get offers.')}</section>
  ${trips.length || moves.length ? `<section class="panel"><h2>Assigned work</h2>${trips.map(t => `<article class="market-row"><span class="market-icon">🚚</span><span><b>${esc(t.title)}</b><small>${esc(t.id)} · Next: ${esc(currentMilestone(t)?.label || 'Closed')}</small></span>${pill(t.status)}<button class="button secondary" data-op="open-trip" data-id="${t.id}">Open</button></article>`).join('')}${moves.map(j => `<article class="market-row"><span class="market-icon">📦</span><span><b>${esc(j.size)} move · ${esc(j.from)} → ${esc(j.to)}</b><small>${esc(j.id)} · ${esc(j.date)}</small></span>${pill(j.status)}<button class="button secondary" data-op="open-conversation" data-id="${j.conversationId || ''}" ${j.conversationId ? '' : 'disabled'}>Job chat</button></article>`).join('')}</section>` : ''}
  <div class="info-banner"><b>Status: ${esc(label(worker?.status || 'available'))}</b><span>Available → employed → closed. Accepting a permanent invite starts staff onboarding with that business.</span></div>`;
}

export function driverJobScreen(state) {
  const r = state.serviceRequests.find(x => x.id === state.selectedServiceId && x.provider === 'personalDriver') || state.serviceRequests.find(x => x.provider === 'personalDriver');
  if (!r) return myJobsScreen(state);
  const next = {accepted: ['in_progress', 'Start work'], in_progress: ['provider_done', 'Mark work complete']}[r.status];
  return `${head(r.title, `${r.id} · ${r.customerName || 'Shubham Kumar'} · ${r.date}`, r.conversationId ? `<button class="button secondary" data-op="open-conversation" data-id="${r.conversationId}">Customer chat</button>` : '')}<div class="grid two"><section class="panel">${facts([['Schedule', `${esc(DRIVER_RATES[r.hireType]?.label)} × ${esc(r.duration)}`], ['Car', esc(r.carType)], ['Pickup', esc(r.location)], ['You earn', inr(r.quote.driverEarning)], ['Status', pill(r.status)], ['Payment', r.paid ? pill('paid') : pill('pending')], r.rating ? ['Customer rating', '★'.repeat(r.rating)] : null])}${next ? `<button class="button primary full" data-op="driver-job-step" data-id="${r.id}" data-next="${next[0]}">${next[1]}</button>` : ''}</section><aside class="panel"><h2>After completion</h2><p>The customer confirms completion, then pays. You get a rating and become available again.</p></aside></div>`;
}

export function upgradeDriverScreen(state) {
  const q = state.verificationQueue.find(x => x.ownerWorkspace === 'personalDriver' && /Commercial/.test(x.capability));
  if (q) return `${head('Upgrade to Commercial Driver', 'Extra verification before commercial truck work.')}<section class="panel">${facts([['Request', esc(q.capability)], ['Status', pill(q.status)], ['Submitted', esc(q.submittedAt)], ['Documents', esc(q.documents.join(', '))]])}<p class="muted">Until Admin approves, commercial truck offers stay blocked for your profile.</p><button class="button secondary" data-route="myJobs">Back</button></section>`;
  return `${head('Upgrade to Commercial Driver', 'Commercial trucks need a commercial licence and extra verification. Your personal Driver work continues.')}<form class="panel form-panel narrow" data-op-form="upgrade-driver"><div class="form-grid two"><label><span>Commercial licence number</span><input name="licence" value="DL09 2021HMV8812"></label><label><span>Licence class</span><select name="cls"><option>HMV · heavy goods</option><option>LMV-TR · light commercial</option></select></label><label><span>Commercial experience (years)</span><input name="years" type="number" value="2"></label><label><span>Vehicle types driven</span><input name="types" value="14-ft and 19-ft closed trucks"></label></div><p id="upgrade-error" class="field-error" hidden></p><div class="form-actions"><button type="button" class="button secondary" data-route="myJobs">Cancel</button><button class="button primary">Submit for verification</button></div></form>`;
}

// ---------- Messages (18) ----------
export function messagesScreen(state) {
  const {ws, member, ownerWs} = opsCtx(state);
  const list = visibleConversations(state.conversations, ws, {member, ownerWorkspace: ownerWs});
  const groups = [['job', 'Job and trip groups'], ['internal', 'Internal team'], ['direct', 'Direct business chats']];
  const opp = (state.opportunities || []).filter(o => (o.participantWorkspaces || o.participants || []).includes(ws));
  return `${head('Messages', 'Every conversation is scoped to its business, branch, job and role.', can(state, 'direct.chat') ? '<button class="button secondary" data-op="toggle-direct">Start direct business chat</button>' : '')}
  ${state.directDraftOpen && can(state, 'direct.chat') ? `<form class="panel form-panel" data-op-form="start-direct"><label><span>Business</span><select name="with">${['goods', 'transporter', 'vehicle', 'movers'].filter(k => k !== ws).map(k => `<option value="${k}">${esc(partyName(state, k))}</option>`).join('')}</select></label><label><span>First message</span><input name="body" value="Hello, can we discuss a load?"></label><p class="mock-hint">Businesses stay private until one of you starts a chat here or shares a job.</p><button class="button primary">Start chat</button></form>` : ''}
  ${groups.map(([k, t]) => { const items = list.filter(c => c.kind === k); return items.length ? `<section class="panel"><h2>${t}</h2>${items.map(c => `<button class="job-row conv-row" data-op="open-conversation" data-id="${c.id}"><span class="job-icon">${k === 'internal' ? '🔒' : k === 'direct' ? '⇄' : '◌'}</span><span><b>${esc(c.title)}</b><small>${esc(c.messages.at(-1)?.from || '')}: ${esc(String(c.messages.at(-1)?.body || '').slice(0, 70))}</small></span><i>›</i></button>`).join('')}</section>` : '' }).join('') || empty('No conversations', 'Job chats open automatically when you are assigned.')}
  ${opp.length ? `<section class="panel"><h2>Opportunity conversations</h2>${opp.map(o => `<button class="job-row" data-action="open-opportunity" data-opportunity="${o.id}"><span class="job-icon">◌</span><span><b>${esc(o.title)}</b><small>${esc(o.status)}</small></span><i>›</i></button>`).join('')}</section>` : ''}`;
}

export function conversationScreen(state) {
  const {ws, member, ownerWs} = opsCtx(state);
  const c = visibleConversations(state.conversations, ws, {member, ownerWorkspace: ownerWs}).find(x => x.id === state.selectedConversationId);
  if (!c) return `${head('Conversation', 'This conversation is not available in your workspace.')}<button class="button primary" data-route="messages">Back to messages</button>`;
  const icon = t => ({audio: '🎙', proof: '📎', location: '📍'}[t] || '');
  return `${head(c.title, c.kind === 'internal' ? 'Internal · never visible to customers, partners or other businesses' : c.kind === 'direct' ? 'Direct chat started explicitly by one business' : `Job group · ${c.participants.map(p => partyName(state, p)).join(', ')}`, '<button class="button secondary" data-route="messages">All messages</button>')}
  <section class="panel"><div class="chat-list" id="chat-list">${c.messages.map(m => `<div class="chat-message ${m.type}"><b>${esc(m.from)}</b><p>${icon(m.type)} ${esc(m.body)}</p><small>${esc(m.at)}</small></div>`).join('')}</div>
  <form class="chat-compose ops-compose" data-op-form="send-message" data-id="${c.id}"><input name="body" placeholder="Type a message" aria-label="Message"><button type="button" class="button secondary" data-op="msg-audio" data-id="${c.id}" aria-label="Record voice note">🎙</button><label class="button secondary" aria-label="Attach proof">📎<input type="file" hidden data-op-file="msg-proof" data-id="${c.id}"></label><button type="button" class="button secondary" data-op="msg-location" data-id="${c.id}" aria-label="Share location">📍</button><button class="button primary">Send</button></form></section>`;
}

// ---------- Money (17) ----------
export function moneyScreen(state) {
  const {ws, member, ownerWs} = opsCtx(state);
  const list = visibleLedger(state.ledger, ws, {member, ownerWs});
  const worker = ['commercialDriver', 'helper', 'personalDriver'].includes(ws);
  const partyKey = ws === 'staff' ? `staff:${member?.id}` : ws;
  const s = earningsSummary(state.ledger, partyKey);
  const receivable = list.filter(x => x.payee === ws && !['reversed', 'closed', 'confirmed'].includes(x.status)).reduce((a, x) => a + Number(x.amount), 0);
  const payable = list.filter(x => x.payer === ws && !['reversed', 'closed', 'confirmed'].includes(x.status)).reduce((a, x) => a + Number(x.amount), 0);
  const filter = state.moneyFilter || 'all';
  const shown = filter === 'all' ? list : list.filter(x => filter === 'action' ? needsMyAction(state, x) : x.status === filter);
  const metrics = worker || ws === 'staff' ? [['Earnings', inr(s.earnings), 'Wages, salary and freight'], ['Advances received', inr(s.advances), 'Adjusted at settlement'], ['Reimbursements', inr(s.reimbursements), 'Never counted as earnings'], ['Platform fees', inr(s.platformFeesPaidByOthers), 'Paid by businesses, not deducted']] : [['To receive', inr(receivable), 'Open receivables'], ['To pay', inr(payable), 'Open payables'], ['Needs approval', list.filter(x => x.status === 'pending_approval').length, `Your limit ${inr(approvalLimit(state))}`], ['On hold', list.filter(x => x.status === 'on_hold').length, 'Disputes and duplicates']];
  return `${head(worker || ws === 'staff' ? 'My Money' : ws === 'personal' ? 'Payments' : 'Money', 'Each transaction is stored once and shown in the job, person and ledger views.', can(state, 'money.create') ? '<button class="button primary" data-op="new-payment">+ Record payment</button>' : '')}
  <div class="metrics">${metrics.map(m => `<div class="metric"><span>${m[0]}</span><b>${m[1]}</b><small>${m[2]}</small></div>`).join('')}</div>
  <div class="people-tabs" role="tablist">${[['all', 'All'], ['action', 'Needs my action'], ['pending_approval', 'Approval'], ['paid', 'Awaiting confirmation'], ['on_hold', 'On hold'], ['reversed', 'Reversed']].map(([k, t]) => `<button class="${filter === k ? 'active' : ''}" data-op="money-filter" data-filter="${k}">${t}</button>`).join('')}</div>
  <section class="panel ledger">${shown.map(x => `<button class="job-row ledger-row" data-op="open-payment" data-id="${x.id}"><span class="job-icon">₹</span><span><b>${esc(MONEY_TYPES[x.type]?.label.split(' (')[0] || x.type)} · ${esc(partyName(state, x.payer))} → ${esc(partyName(state, x.payee))}</b><small>${esc(x.id)} · ${esc(x.sourceId || '')} · ${esc(x.note || '')} · ${x.channel === 'outside' ? 'Recorded outside platform' : 'Platform transfer'}</small></span><span class="amount ${x.payee === partyKey ? 'in' : 'out'}">${x.payee === partyKey ? '+' : '−'}${inr(x.amount)}</span>${pill(x.status)}</button>`).join('') || empty('Nothing here', 'Money entries created from trips, jobs, salaries and expenses appear here.')}</section>`;
}
export function needsMyAction(state, x) {
  return (x.status === 'pending_approval' && can(state, 'money.approve', x)) || (x.status === 'approved' && can(state, 'money.pay', x)) || (x.status === 'paid' && can(state, 'money.confirm', x));
}

export function paymentFormScreen(state) {
  const {ws, ownerWs} = opsCtx(state);
  const d = state.paymentDraft || {};
  const payerDefault = ws === 'staff' ? ownerWs : ws;
  const parties = [...new Set([payerDefault, 'goods', 'transporter', 'vehicle', 'movers', 'commercialDriver', 'helper', 'personalDriver', 'personal', 'platform', ...(state.peopleByWorkspace[ownerWs] || []).map(p => `staff:${p.id}`), 'external:metro', 'external:bihar-agro'])];
  const sources = [...visibleTrips(state).map(t => [t.id, `Trip · ${t.title}`]), ...visibleMovingJobs(state).map(j => [j.id, `Moving · ${j.id}`]), ...state.serviceRequests.filter(r => r.customer === ws).map(r => [r.id, `Service · ${r.title}`]), ['SALARY', 'Salary / staff pay'], ['EXPENSE', 'Business expense'], ['HIRING', 'Hiring event']];
  return `${head('Record payment', 'Choose who pays whom and why. Limits, duplicate checks and approvals run before anything is paid.')}
  <form class="panel form-panel" data-op-form="create-payment"><div class="form-grid two">
    <label><span>For</span><select name="sourceId">${sources.map(([id, t]) => `<option value="${esc(id)}" ${d.sourceId === id ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label><span>Type</span><select name="type">${Object.entries(MONEY_TYPES).map(([k, v]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <label><span>Payer</span><select name="payer">${parties.map(p => `<option value="${esc(p)}" ${(d.payer || payerDefault) === p ? 'selected' : ''}>${esc(partyName(state, p))}</option>`).join('')}</select></label>
    <label><span>Payee</span><select name="payee">${parties.map(p => `<option value="${esc(p)}" ${d.payee === p ? 'selected' : ''}>${esc(partyName(state, p))}</option>`).join('')}</select></label>
    <label><span>Responsible party</span><select name="responsible">${parties.map(p => `<option value="${esc(p)}" ${(d.responsible || payerDefault) === p ? 'selected' : ''}>${esc(partyName(state, p))}</option>`).join('')}</select></label>
    <label><span>Amount (₹)</span><input name="amount" type="number" min="1" value="${esc(d.amount || '')}" required></label>
    <label><span>Method</span><select name="method">${[['platform', 'Pay through MoveAI'], ['upi', 'UPI (outside, record)'], ['bank', 'Bank transfer (outside, record)'], ['cash', 'Cash (record)'], ['cheque', 'Cheque (record)']].map(([k, t]) => `<option value="${k}" ${d.method === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label><span>Reference (UTR / receipt no.)</span><input name="reference" value="${esc(d.reference || '')}"></label>
    <label><span>Proof</span><input type="file" name="proofFile" accept="image/*,application/pdf"></label>
    <label><span>Note</span><input name="note" value="${esc(d.note || '')}"></label>
  </div><p id="payment-error" class="field-error" hidden></p>
  <div class="info-banner"><b>Rules</b><span>Reimbursement never reduces earnings. Platform fees are separate from worker wages. Payments recorded outside are never shown as platform transfers. Your approval limit is ${inr(approvalLimit(state))}.</span></div>
  <div class="form-actions"><button type="button" class="button secondary" data-route="money">Cancel</button><button class="button primary">Check and save</button></div></form>`;
}

export function paymentDetailScreen(state) {
  const {ws, member, ownerWs} = opsCtx(state);
  const x = visibleLedger(state.ledger, ws, {member, ownerWs}).find(e => e.id === state.selectedPaymentId);
  if (!x) return `${head('Payment', 'Not visible in this workspace.')}<button class="button primary" data-route="money">Back</button>`;
  const btn = (op, text, cls = 'secondary') => `<button class="button ${cls}" data-op="money-action" data-action-name="${op}" data-id="${x.id}">${text}</button>`;
  const actions = [
    x.status === 'pending_approval' && can(state, 'money.approve', x) ? btn('approve', 'Approve', 'primary') : '',
    x.status === 'approved' && can(state, 'money.pay', x) ? btn('pay', x.channel === 'platform' ? 'Pay now' : 'Record as paid outside', 'primary') : '',
    x.status === 'paid' && can(state, 'money.confirm', x) ? btn('confirm', 'Confirm I received it', 'primary') : '',
    x.status === 'confirmed' && can(state, 'money.reverse', x) ? btn('close', 'Close entry') : '',
    x.status === 'on_hold' && can(state, 'money.reverse', x) ? btn('release', 'Release hold') : '',
    ['pending_approval', 'approved', 'paid'].includes(x.status) && (x.payer === ws || x.payee === ws || x.owner === ws) ? btn('hold', 'Raise dispute / hold') : '',
    ['approved', 'paid', 'confirmed', 'closed', 'on_hold'].includes(x.status) && can(state, 'money.reverse', x) ? btn('reverse', 'Reverse with reason', 'danger') : '',
  ].join('');
  return `${head(`${inr(x.amount)} · ${MONEY_TYPES[x.type]?.label.split(' (')[0]}`, `${x.id} · ${partyName(state, x.payer)} → ${partyName(state, x.payee)}`, '<button class="button secondary" data-route="money">Back to Money</button>')}
  <div class="grid two"><section class="panel">${facts([['Status', pill(x.status)], ['Source', esc(x.sourceId || '—')], ['Direction', esc(label(x.direction || 'payable'))], ['Responsible party', esc(partyName(state, x.responsible))], ['Method', esc(label(x.method))], ['Reference', esc(x.reference || '—')], ['Proof', esc(x.proof || '—')], ['Channel', x.channel === 'outside' ? 'Recorded outside platform' : 'Platform transfer'], ['Note', esc(x.note || '—')]])}
    ${actions ? `<div class="money-actions"><input id="money-reason" class="text-field" placeholder="Reason (needed to hold or reverse)"><div class="screen-actions">${actions}</div></div>` : '<p class="muted">No action for your role at this step.</p>'}</section>
  <section class="panel"><h2>History</h2><div class="timeline">${(x.history || []).map(h => `<div><i></i><span><b>${esc(label(h.action))} → ${esc(label(h.status))}</b><small>${esc(h.at)} · ${esc(h.actor)}${h.reason ? ` · ${esc(h.reason)}` : ''}</small></span></div>`).join('') || '<p class="muted">Created from seed data.</p>'}</div></section></div>`;
}

// ---------- Exceptions (20) ----------
export function exceptionsScreen(state) {
  const {ws} = opsCtx(state);
  const list = state.exceptions.filter(e => ws === 'admin' || e.parties.includes(ws) || e.reportedByWs === ws || (ws === 'staff' && e.parties.includes(opsCtx(state).ownerWs)));
  const refs = exceptionRefs(state);
  const d = state.exceptionDraft || {};
  return `${head('Exceptions and recovery', 'Report a problem once. Only affected parties are told; history is never deleted.')}
  <div class="grid two"><form class="panel form-panel" data-op-form="report-exception"><h2>Report a problem</h2><div class="form-grid two">
    <label><span>What happened?</span><select name="type">${Object.entries(EXCEPTION_TYPES).map(([k, v]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <label><span>Affected work</span><select name="ref"><option value="">Select</option>${refs.map(([id, t]) => `<option value="${esc(id)}" ${d.ref === id ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="wide"><span>Reason</span><input name="reason" value="${esc(d.reason || '')}" placeholder="e.g. Clutch plate failure near Varanasi"></label>
    <label><span>Location</span><input name="location" value="${esc(d.location || '')}" placeholder="Place or highway km"></label>
    <label><span>Proof</span><input type="file" name="proofFile" accept="image/*,application/pdf"><input name="proof" class="text-field" placeholder="or photo / document name"></label>
    <label class="wide"><span>Responsible party</span><select name="responsible">${['vehicle', 'transporter', 'goods', 'commercialDriver', 'helper', 'movers', 'personal', 'external'].map(k => `<option value="${k}">${esc(partyName(state, k))}</option>`).join('')}</select></label>
  </div><p id="exception-error" class="field-error" hidden></p><button class="button primary full">Report and notify affected parties</button></form>
  <section class="panel"><h2>Open and resolved</h2>${list.map(e => `<article class="market-row"><span class="market-icon">!</span><span><b>${esc(EXCEPTION_TYPES[e.type]?.label)} · ${esc(e.ref)}</b><small>${esc(e.reason)} · ${esc(e.at)}</small></span>${pill(e.status)}<button class="button secondary" data-op="open-exception" data-id="${e.id}">Open</button></article>`).join('') || empty('No exceptions', 'Everything is running normally.')}</section></div>`;
}
export function exceptionRefs(state) {
  const {ws, ownerWs} = opsCtx(state);
  return [...visibleTrips(state).map(t => [t.id, `Trip ${t.id} · ${t.title}`]), ...visibleMovingJobs(state).map(j => [j.id, `Moving ${j.id} · ${j.from}`]), ...state.serviceRequests.filter(r => r.customer === ws || r.provider === ws).map(r => [r.id, `Service ${r.id}`]), ...vehiclesOf(state, ownerWs).map(v => [v.id, `Vehicle ${v.registration}`]), ...visibleLedger(state.ledger, ws, {member: opsCtx(state).member, ownerWs}).map(x => [x.id, `Payment ${x.id} · ${inr(x.amount)}`])];
}

export function exceptionDetailScreen(state) {
  const e = state.exceptions.find(x => x.id === state.selectedExceptionId);
  if (!e) return exceptionsScreen(state);
  const {ws} = opsCtx(state);
  const def = EXCEPTION_TYPES[e.type];
  const mayAct = ws === 'admin' || e.parties.includes(ws) || e.reportedByWs === ws;
  return `${head(`${def.label} · ${e.ref}`, `${e.id} · reported by ${e.reportedBy} · ${e.at}`, '<button class="button secondary" data-route="exceptions">All exceptions</button>')}
  <div class="grid two"><section class="panel">${facts([['Status', pill(e.status)], ['Reason', esc(e.reason)], ['Location', esc(e.location || '—')], ['Proof', esc(e.proof || '—')], ['Responsible', esc(partyName(state, e.responsible))], ['Notified', esc(e.parties.map(p => partyName(state, p)).join(', '))], ['Chosen action', esc(e.action || 'Not chosen yet')]])}
  ${mayAct && e.status !== 'closed' ? `<h3>Safe next action</h3><div class="arrangement-grid">${def.actions.map(a => `<button class="arrangement-choice as-button ${e.action === a ? 'selected' : ''}" data-op="exception-action" data-id="${e.id}" data-choice="${esc(a)}"><span><b>${esc(a)}</b></span></button>`).join('')}</div>
  ${['damage', 'cancellation', 'breakdown', 'payment_dispute'].includes(e.type) ? `<label><span>Due adjustment (₹, deducted from the responsible party's balance)</span><input id="exception-adjust" type="number" value="${e.type === 'damage' ? 2500 : e.type === 'cancellation' ? 1500 : 0}"></label><button class="button secondary full" data-op="exception-recalc" data-id="${e.id}">Recalculate dues (keeps history)</button>` : ''}
  <div class="screen-actions"><button class="button primary" data-op="exception-resolve" data-id="${e.id}" data-mode="resume">Resume work</button><button class="button secondary" data-op="exception-resolve" data-id="${e.id}" data-mode="close">Close safely</button></div>` : ''}</section>
  <section class="panel"><h2>History</h2><div class="timeline">${e.history.map(h => `<div><i></i><span><b>${esc(h.event)}</b><small>${esc(h.at)}</small></span></div>`).join('')}</div></section></div>`;
}

// ---------- Admin (19) ----------
export function verificationScreen(state) {
  if (!adminStepUpValid(state)) return adminStepUpScreen();
  const q = state.verificationQueue;
  const kinds = [['person', 'People and capabilities'], ['vehicle', 'Vehicles'], ['business', 'Businesses']];
  return `${head('Verification queue', 'Admin verifies and supports; Admin never operates a business as its owner.')}
  <div class="metrics"><div class="metric"><span>Pending</span><b>${q.filter(x => x.status === 'pending').length}</b><small>Waiting for decision</small></div><div class="metric"><span>Corrections</span><b>${q.filter(x => x.status === 'correction_required').length}</b><small>With the user</small></div><div class="metric"><span>Suspended</span><b>${q.filter(x => x.status === 'suspended').length}</b><small>Appeals possible</small></div><div class="metric"><span>Cases</span><b>${state.cases.filter(c => c.status === 'open').length}</b><small>Fraud, safety, payment</small></div></div>
  ${kinds.map(([k, t]) => `<section class="panel"><h2>${t}</h2>${q.filter(x => x.kind === k).map(x => `<article class="market-row"><span class="market-icon">${k === 'vehicle' ? '🚛' : k === 'business' ? '▤' : '○'}</span><span><b>${esc(x.subject)} · ${esc(x.capability)}</b><small>${esc(x.id)} · v${x.version} · submitted ${esc(x.submittedAt)}${x.appeal ? ' · appeal received' : ''}</small></span>${pill(x.status)}<button class="button secondary" data-op="open-verification" data-id="${x.id}">Review</button></article>`).join('') || empty('Nothing waiting', '')}</section>`).join('')}
  <p class="muted">Business applications continue in <button class="inline-link" data-route="approvals">Approvals</button>.</p>`;
}

export function verificationItemScreen(state) {
  if (!adminStepUpValid(state)) return adminStepUpScreen();
  const x = state.verificationQueue.find(i => i.id === state.selectedVerificationId) || state.verificationQueue[0];
  return `${head(`${x.subject} · ${x.capability}`, `${x.id} · version ${x.version}`, '<button class="button secondary" data-route="verification">Back to queue</button>')}
  <div class="grid two"><section class="panel"><h2>Submitted data</h2><div class="document-list">${x.documents.map(d => `<div class="document-row"><span class="document-icon">▣</span><span class="document-copy"><b>${esc(d)}</b><small>Current version · secure preview</small></span><button class="button secondary compact" data-toast="Secure preview opened (watermarked)">View</button></div>`).join('')}</div>${x.appeal ? `<div class="info-banner"><b>Appeal</b><span>${esc(x.appeal)}</span></div>` : ''}
  <form data-op-form="admin-decision" data-id="${x.id}" class="decision-form"><label><span>Decision</span><select name="decision">${x.status === 'suspended' || x.status === 'rejected' ? '<option value="restore">Restore after appeal</option>' : ''}<option value="approve">Approve capability</option><option value="correction">Request correction</option><option value="reject">Reject</option><option value="suspend">Suspend</option><option value="escalate">Escalate (fraud / safety / payment)</option></select></label><label><span>Reason shared with user</span><input name="reason" placeholder="Required except for approval"></label><p id="decision-error" class="field-error" hidden></p><button class="button primary full">Record decision and notify</button></form></section>
  <section class="panel"><h2>Decision history</h2><div class="timeline">${x.history.map(h => `<div><i></i><span><b>${esc(label(h.decision))}</b><small>${esc(h.at)} · ${esc(h.by)} · ${esc(h.reason)}</small></span></div>`).join('') || '<p class="muted">First review.</p>'}</div><p class="mock-hint">Every decision writes an immutable audit event.</p></section></div>`;
}

export function casesScreen(state) {
  return `${head('Safety and dispute cases', 'Escalations from verification, payments and exceptions.')}<section class="panel">${state.cases.map(c => `<article class="market-row"><span class="market-icon">⚑</span><span><b>${esc(c.subject)}</b><small>${esc(c.id)} · ${esc(label(c.kind))} · ${esc(c.raisedBy)} · ${esc(c.at)} · ${esc(c.notes)}</small></span>${pill(c.status)}${c.status === 'open' ? `<button class="button secondary" data-op="case-resolve" data-id="${c.id}">Resolve</button>` : '<span></span>'}</article>`).join('') || empty('No cases', '')}</section>`;
}

// ---------- Staff events (13) ----------
export function staffEventsScreen(state) {
  const {ownerWs} = opsCtx(state);
  const people = (state.peopleByWorkspace[ownerWs] || []).filter(p => p.status !== 'offboarded');
  const former = [...(state.formerStaff?.[ownerWs] || []), ...(state.peopleByWorkspace[ownerWs] || []).filter(p => p.status === 'offboarded').map(p => ({id: p.id, name: p.name, designation: p.designation, offboardedAt: p.offboardedAt || 'Recently', finalSettlement: `Dues ${inr(p.dues)}`}))];
  return `${head('Employment events', 'Leave, unavailability and rehiring keep history attached to the same person.', '<button class="button secondary" data-route="people">Back to People</button>')}
  <div class="grid two"><form class="panel form-panel" data-op-form="staff-leave"><h2>Leave / unavailable</h2><div class="form-grid two"><label class="wide"><span>Staff member</span><select name="memberId"><option value="">Select</option>${people.map(p => `<option value="${p.id}">${esc(p.name)} · ${esc(p.designation || p.role)} · ${(p.activeAssignments || []).length} active</option>`).join('')}</select></label><label><span>From</span><input type="date" name="from" value="2026-09-29"></label><label><span>Until</span><input type="date" name="to" value="2026-10-03"></label><label><span>Reason</span><select name="reason"><option>Leave</option><option>Sick</option><option>Unavailable</option></select></label><label><span>Reassign active work to</span><select name="reassignTo"><option value="">Keep unassigned (hold)</option>${people.filter(p => p.status === 'active').map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label></div><p id="leave-error" class="field-error" hidden></p><button class="button primary full">Save and reassign</button></form>
  <section class="panel"><h2>Former staff</h2>${former.map(f => `<article class="market-row"><span class="market-icon">↺</span><span><b>${esc(f.name)}</b><small>${esc(f.designation || '')} · left ${esc(f.offboardedAt)} · ${esc(f.finalSettlement || '')}</small></span><span></span><button class="button secondary" data-op="rehire" data-id="${f.id}">Rehire</button></article>`).join('') || empty('No former staff', '')}<p class="mock-hint">Rehire starts a new employment period with a new invitation; the old period stays in history.</p>
  <h2>Today’s attendance</h2>${attendanceTable(state, ownerWs)}
  <h2>Recent events</h2><div class="timeline">${(state.staffEvents || []).filter(e => e.workspace === ownerWs).map(e => `<div><i></i><span><b>${esc(e.text)}</b><small>${esc(e.at)}</small></span></div>`).join('') || '<p class="muted">No events yet.</p>'}</div></section></div>`;
}

// ---------- Notifications ----------
export function notificationsScreen(state) {
  const {ws, ownerWs} = opsCtx(state);
  const list = state.notifications.filter(n => n.to === ws || (ws === 'staff' && n.to === ownerWs && n.staffVisible));
  return `${head('Notifications', 'Only updates about your own work.', list.some(n => !n.read) ? '<button class="button secondary" data-op="notif-read-all">Mark all read</button>' : '')}<section class="panel">${list.map(n => `<article class="market-row ${n.read ? '' : 'unread'}"><span class="market-icon">●</span><span><b>${esc(n.text)}</b><small>${esc(n.at)} · ${esc(n.ref || '')}</small></span><span></span><button class="button secondary" data-op="notif-open" data-id="${n.id}">Open</button></article>`).join('') || empty('All caught up', 'New updates about your work appear here.')}</section>`;
}

// ---------- AI summary ----------
export function summarize(state, ref) {
  const t = state.trips.find(x => x.id === ref) || (!ref && visibleTrips(state)[0]);
  if (t) { const cm = currentMilestone(t); return `${t.id} ${t.title}: ${tripProgress(t)}% complete. ${cm ? `Next: ${cm.label}.` : 'Closed.'} Vehicle ${t.registration || 'not assigned'}. Last location ${t.gps.points.at(-1)?.place || 'not available'}.${t.hold ? ` On hold: ${t.hold}.` : ''}` }
  const j = state.movingJobs.find(x => x.id === ref);
  if (j) return `${j.id}: ${j.size} ${j.from} → ${j.to} on ${j.date}. Step: ${MOVING_STEPS[movingStepIndex(j)][1]}.`;
  return 'No matching work found in this workspace.';
}

// ---------- gap fixes against draw.io (04, 13, 14, 16, 19, 07) ----------
export const inventoryList = v => String(v || '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
export const todayKey = () => new Date().toISOString().slice(0, 10);
export function orderCloseBlock(state, o) {
  const ts = state.trips.filter(t => t.goodsOrderId === o.id);
  if (!ts.length) return 'No loads have been delivered for this order yet.';
  if (ts.some(t => t.milestones.find(m => m.key === 'received')?.status !== 'done' && t.status !== 'closed')) return 'Every load must be received first.';
  if (state.exceptions.some(e => ts.some(t => t.id === e.ref) && e.status !== 'resolved' && e.status !== 'closed')) return 'Resolve open disputes before closing.';
  if (o.type === 'buy' && !state.ledger.some(x => (x.sourceId === o.id || ts.some(t => t.id === x.sourceId)) && x.type === 'customer_payment' && ['paid', 'confirmed', 'closed'].includes(x.status))) return 'Pay the seller (or record the outside payment) before closing.';
  if (o.type === 'sell' && ts.some(t => t.status !== 'closed')) return 'Settle every load before closing.';
  return '';
}
function closeOutPanel(state, t) {
  const o = state.goodsOrders.find(x => x.id === t.goodsOrderId);
  const disputes = state.exceptions.filter(e => e.ref === t.id && !['resolved', 'closed'].includes(e.status));
  const block = o ? orderCloseBlock(state, o) : 'No goods order linked.';
  const buyer = t.goodsRole === 'buyer';
  return `<section class="panel"><h2>${buyer ? 'Pay, dispute or close' : 'Receipt and order close-out'}</h2>${facts([['Received', `${esc(t.receipt?.quantity ?? t.quantity)} ${esc(t.unit)} · ${esc(t.receipt?.condition || 'Good')}`], t.receipt?.deduction ? ['Proposed shortage deduction', inr(t.receipt.deduction)] : null, ['Open disputes', String(disputes.length)], o ? ['Order', `${esc(o.id)} · ${pill(o.status)}`] : null])}
    <div class="row-actions">${buyer ? `<button class="button primary" data-op="pay-seller" data-id="${t.id}">Pay seller</button>` : ''}<button class="button secondary" data-op="report-exception" data-ref="${t.id}">${disputes.length ? 'Add to dispute' : 'Raise dispute'}</button>${o && o.status !== 'closed' ? `<button class="button secondary" data-op="close-order" data-id="${o.id}" ${block ? 'disabled' : ''}>Close order</button>` : ''}</div>${block && o?.status !== 'closed' ? `<p class="mock-hint">${esc(block)}</p>` : ''}</section>`;
}
export function adminStepUpValid(state) { return Boolean(state.adminStepUp?.at && Date.now() - state.adminStepUp.at < 30 * 60 * 1000); }
function adminStepUpScreen() {
  return `${head('Confirm it is you', 'Verification decisions need strong authentication. Admins verify and support; they never operate a business.')}
  <form class="panel form-panel narrow" data-op-form="admin-stepup"><div class="info-banner"><b>Strong authentication</b><span>Enter the code from your registered security app. Sessions expire after 30 minutes. Prototype code: 246810.</span></div><label><span>Security code</span><input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label><p id="stepup-error" class="field-error" hidden></p><div class="form-actions"><button class="button primary" type="submit">Verify and open queue</button></div></form>`;
}
function attendanceTable(state, ownerWs) {
  const rows = (state.attendance || []).filter(a => a.workspace === ownerWs && a.date === todayKey());
  return rows.length ? `<div class="timeline">${rows.map(a => `<div><i></i><span><b>${esc(a.name)}</b><small>In ${esc(a.in)}${a.out ? ` · Out ${esc(a.out)}` : ' · working'}</small></span></div>`).join('')}</div>` : '<p class="muted">No one has checked in yet today.</p>';
}
export function staffWorkScreen(state) {
  const {member, ownerWs, perms} = opsCtx(state);
  if (!member) return `${head('My Work', 'Staff profile not found.')}`;
  if (member.status !== 'active') return `${head('My Work', `${member.name} · work starts after owner approval`)}${empty('Waiting for approval', 'Assigned jobs, attendance and pay appear once your owner approves your joining details.')}`;
  const trips = visibleTrips(state), jobs = visibleMovingJobs(state);
  const mine = (member.activeAssignments || []);
  const att = (state.attendance || []).find(a => a.memberId === member.id && a.date === todayKey());
  const pay = state.ledger.filter(x => x.payee === `staff:${member.id}` && x.status !== 'reversed');
  const fleetOk = perms.some(p => ['documents.prepare', 'fleet.view', 'work.manage'].includes(p));
  const row = (icon, title, sub, status, op, id) => `<article class="market-row"><span class="market-icon">${icon}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${pill(status)}<button class="button secondary" data-op="${op}" data-id="${id}">Open</button></article>`;
  return `${head('My Work', `${member.name} · ${ROLE_TEMPLATES[member.role]?.label || 'Staff'} · only assigned branch and tasks`, fleetOk ? '<button class="button secondary" data-route="fleet">Fleet documents</button>' : '')}
  <div class="grid two"><section class="panel"><h2>My assigned tasks</h2><p class="muted">Transport loads and moving jobs from the same team, filtered to your branches and assignments.</p>
    ${trips.map(t => row('🚚', t.title, `${t.id} · ${mine.includes(t.id) ? 'assigned to you' : 'your branch'} · Next: ${currentMilestone(t)?.label || 'Closed'}`, t.hold ? 'on_hold' : t.status, 'open-trip', t.id)).join('')}
    ${jobs.map(j => row('📦', `${j.size} move · ${j.from} → ${j.to}`, `${j.id} · ${j.date}`, j.status, 'open-moving', j.id)).join('')}
    ${!trips.length && !jobs.length ? empty('No assigned work', 'Unassigned business work stays hidden.') : ''}</section>
  <div class="stack"><section class="panel"><h2>Attendance</h2>${att ? `<p>Checked in at <b>${esc(att.in)}</b>${att.out ? ` · checked out at <b>${esc(att.out)}</b>` : ''}</p>` : '<p class="muted">Not checked in today.</p>'}
    ${!att ? '<button class="button primary full" data-op="attendance-in">Check in</button>' : !att.out ? '<button class="button secondary full" data-op="attendance-out">Check out</button>' : ''}</section>
    <section class="panel"><h2>My pay</h2>${facts([['Salary / wages', inr(pay.filter(x => ['salary', 'freight'].includes(x.type)).reduce((a, x) => a + Number(x.amount), 0))], ['Advances', inr(pay.filter(x => x.type === 'advance').reduce((a, x) => a + Number(x.amount), 0))], ['Reimbursements (not earnings)', inr(pay.filter(x => x.type === 'reimbursement').reduce((a, x) => a + Number(x.amount), 0))]])}<div class="row-actions"><button class="button secondary" data-route="money">Open My Money</button><button class="button secondary" data-route="messages">Messages</button></div></section></div></div>`;
}
