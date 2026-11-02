// Live home screens for logistics businesses, workers and the MoveAI admin.
// Every number comes from the current state (no fixed demo text), and each home follows the same order:
// status → what to do now → new offers → money → alerts → shortcuts.
import {HOME_CONTENT} from './mock-data.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const sum = (list, f = x => x.amount) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const metric = (label, value, note, route) => `<button class="metric metric-link" ${route ? `data-route="${route}"` : 'disabled'}><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></button>`;
const quick = ws => `<section class="panel"><h2>Shortcuts</h2><div class="shortcut-grid">${(HOME_CONTENT[ws]?.quick || []).map(x => `<button class="shortcut" data-route="${x[0]}"><span class="shortcut-icon" aria-hidden="true">${x[1]}</span><b>${esc(x[2])}</b><small>${esc(x[3])}</small></button>`).join('')}</div></section>`;
const alerts = (state, ws, extra = []) => {
  // An alert about an offer already on this screen scrolls to it instead of reopening the same page.
  const pending = (state.workOffers || []).filter(o => (o.to === ws || (o.to === 'helper' && ws === 'helper')) && o.status === 'pending');
  const toItem = n => { const o = pending.find(x => x.id === n.ref || x.ref === n.ref); if (o) return {text: n.text, at: n.at, scroll: o.id, cta: 'View offer'}; if (!n.route || n.route === 'home') return {text: n.text, at: n.at, route: n.ref && /^(TRP|MOV)-/.test(n.ref) ? (n.ref.startsWith('TRP') ? 'trips' : 'myJobs') : 'notifications', cta: 'Open'}; return {text: n.text, at: n.at, route: n.route}; };
  const list = [...extra, ...(state.notifications || []).filter(n => n.to === ws && !n.read).slice(0, 4).map(toItem)];
  return `<section class="panel"><h2>Needs your attention</h2>${list.length ? `<div class="attention-list">${list.map(a => `<div class="attention-item"><span class="attention-icon">${a.icon || '!'}</span><span class="attention-copy"><b>${esc(a.text)}</b>${a.at ? `<small>${esc(a.at)}</small>` : ''}</span>${a.scroll ? `<button class="status-pill info pill-button" data-scroll-offer="${esc(a.scroll)}">${esc(a.cta)}</button>` : a.route ? `<button class="status-pill info pill-button" data-route="${a.route}">${esc(a.cta || 'Open')}</button>` : a.op ? `<button class="status-pill info pill-button" data-op="${a.op}" data-id="${esc(a.id)}">${esc(a.cta || 'Open')}</button>` : ''}</div>`).join('')}</div>` : '<p class="muted">Nothing waiting. You are all caught up.</p>'}</section>`;
};
const OPEN_TRIP = t => !['delivered', 'received', 'closed', 'settled', 'cancelled'].includes(t.status);
const nameOf = (state, ws) => (state.platformWorkers || []).find(w => w.persona === ws)?.name || (HOME_CONTENT[ws]?.greeting || '').replace(/^Good morning,\s*/, '') || 'there';

// ---------- business and admin homes ----------
function businessFigures(state, ws) {
  const L = state.ledger || [], trips = (state.trips || []).filter(t => (t.parties || []).includes(ws) || t.owner === ws || t.vehicleOwner === ws);
  const live = trips.filter(OPEN_TRIP), fleet = (state.ownedVehicles || {})[ws] || [];
  const due = L.filter(x => x.payer === ws && ['pending_approval', 'approved'].includes(x.status)), incoming = L.filter(x => x.payee === ws && ['pending_approval', 'approved', 'paid'].includes(x.status));
  if (ws === 'goods') {
    const orders = (state.goodsOrders || []).filter(o => o.workspace === ws && o.status !== 'closed');
    return [metric('Open goods orders', orders.length, `${orders.filter(o => o.status === 'draft' || o.status === 'created').length} need a transport plan`, 'work'), metric('Trips on the road', live.length, live[0] ? live[0].title : 'None right now', 'trips'), metric('Own vehicles', fleet.length, `${fleet.filter(v => v.status === 'idle').length} idle`, 'fleet'), metric('To pay', inr(sum(due)), `${due.length} payment(s) waiting`, 'money')];
  }
  if (ws === 'transporter') {
    const loads = (state.availableLoads || []).filter(l => l.status === 'open'), reqs = (state.transportRequirements || []).filter(r => r.status === 'published' && !(state.availableLoads || []).some(l => l.requirementId === r.id));
    return [metric('Loads to handle', loads.length + reqs.length, `${reqs.length} new request(s) from goods owners`, 'work'), metric('Trips running', live.length, live.filter(t => !(t.crew || []).some(c => c.role === 'driver')).length ? 'Some need a driver' : 'All assigned', 'trips'), metric('Trucks', fleet.length, `${fleet.filter(v => v.status === 'idle' || v.status === 'available').length} free`, 'fleet'), metric('Money to approve', inr(sum(due)), `${due.length} item(s)`, 'money')];
  }
  if (ws === 'vehicle') {
    const free = (state.truckAvailability || []).filter(a => a.workspace === ws && a.status !== 'withdrawn');
    return [metric('My trucks', fleet.length, `${(state.exceptions || []).filter(e => e.responsible === ws && e.status !== 'resolved').length} document problem(s)`, 'fleet'), metric('On trip', live.length, live[0] ? live[0].title : 'None right now', 'trips'), metric('Posted as free', free.length, free[0] ? `${free[0].registration} · ${free[0].location}` : 'Post a free truck', 'work'), metric('To receive', inr(sum(incoming)), `${incoming.length} payment(s)`, 'money')];
  }
  if (ws === 'movers') {
    const jobs = (state.movingJobs || []).filter(j => j.owner === ws), fresh = jobs.filter(j => j.status === 'auto_assigned'), running = jobs.filter(j => !['auto_assigned', 'otp_verified', 'completed', 'cancelled'].includes(j.status));
    const paid = L.filter(x => x.payee === ws && x.status === 'confirmed');
    return [metric('New requests', fresh.length, fresh[0] ? `${fresh[0].size} · ${fresh[0].date}` : 'None waiting', 'work'), metric('Moves in progress', running.length, running[0] ? running[0].id : 'None right now', 'work'), metric('Vehicles', fleet.length, `${fleet.filter(v => v.status === 'idle').length} free`, 'fleet'), metric('Received', inr(sum(paid)), `${paid.length} customer payment(s)`, 'money')];
  }
  if (ws === 'admin') {
    const apps = (state.businessApplications || []).filter(a => ['submitted', 'under_review'].includes(a.status)), people = (state.verificationQueue || []).filter(q => q.status === 'pending');
    const riders = Object.values(state.deliveryPartners || {}).filter(p => p.status === 'submitted'), cases = (state.cases || []).filter(c => c.status !== 'resolved'), exc = (state.exceptions || []).filter(e => e.status !== 'resolved');
    return [metric('Businesses to approve', apps.length, 'Logistics and seller applications', 'approvals'), metric('People to verify', people.length + riders.length, `${riders.length} delivery partner(s)`, 'documents'), metric('Open cases', cases.length, cases[0] ? cases[0].subject : 'None', 'cases'), metric('Problems reported', exc.length, exc[0] ? exc[0].reason : 'None', 'exceptions')];
  }
  return [];
}
export function businessHome(state, ws) {
  const h = HOME_CONTENT[ws] || {};
  const extra = ws === 'transporter' ? (state.trips || []).filter(t => t.owner === ws && OPEN_TRIP(t) && !(t.crew || []).some(c => c.role === 'driver')).map(t => ({text: `${t.title}: assign a truck and driver`, op: 'open-trip', id: t.id, cta: 'Assign'}))
    : ws === 'movers' ? (state.movingJobs || []).filter(j => j.owner === ws && j.status === 'auto_assigned').map(j => ({text: `${j.size} move for ${j.customerName} on ${j.date}: confirm the slot`, op: 'open-moving', id: j.id, cta: 'Open'}))
      : ws === 'vehicle' ? (state.exceptions || []).filter(e => e.responsible === ws && e.status !== 'resolved').map(e => ({text: e.reason, op: 'open-vehicle', id: e.ref, cta: 'Fix'})) : [];
  return `<div class="page-header"><div><h1>${esc(greeting())}, ${esc(String(h.greeting || '').replace(/^Good morning,\s*/, ''))}</h1><p>${esc(String(h.summary || '').replace(/ testing /, ' · ').replace(/mock user · /i, ''))}</p></div></div>
  <div class="metrics">${businessFigures(state, ws).join('')}</div>
  <div class="grid two">${alerts(state, ws, extra)}${quick(ws)}</div>`;
}

// ---------- worker homes (commercial driver, personal driver, helper) ----------
export const WORKER_WS = ['commercialDriver', 'personalDriver', 'helper'];
const milestoneStrip = t => `<ol class="wh-strip">${(t.milestones || []).filter(m => ['pickup_reached', 'loaded', 'dharamkata', 'in_transit', 'delivered'].includes(m.key)).map(m => `<li class="${m.status === 'done' ? 'done' : m === (t.milestones || []).find(x => x.status !== 'done') ? 'current' : ''}">${esc(m.label.replace(' complete', '').replace(' weighment', ''))}</li>`).join('')}</ol>`;
export function workerNow(state, ws) {
  const trip = (state.trips || []).find(t => OPEN_TRIP(t) && (t.crew || []).some(c => c.persona === ws));
  if (trip) { const next = (trip.milestones || []).find(m => m.status !== 'done'); return {kind: 'trip', html: `<p class="wh-kicker">On a trip</p><h2>${esc(trip.title)}</h2>${milestoneStrip(trip)}<button class="button primary wh-big" data-op="open-trip" data-id="${trip.id}">${!next ? 'Open trip' : ws === 'helper' ? `Open trip · next: ${esc(next.label)}` : `Next: ${esc(next.label)}${next.key === 'dharamkata' ? ' – add slip photo' : ''}`}</button>`}; }
  const move = (state.movingJobs || []).find(j => !['otp_verified', 'completed', 'cancelled'].includes(j.status) && (j.crew || []).some(c => c.persona === ws));
  if (move) return {kind: 'move', html: `<p class="wh-kicker">Moving job</p><h2>${esc(move.size)} · ${esc(move.from)} → ${esc(move.to)}</h2><p>${esc(move.date)} · ${esc(move.customerName)}</p><button class="button primary wh-big" data-op="open-moving" data-id="${move.id}">Open job</button>`};
  const booking = ws === 'personalDriver' ? (state.serviceRequests || []).find(r => r.type === 'driver' && r.provider === ws && ['accepted', 'started', 'in_progress'].includes(r.status)) : null;
  if (booking) return {kind: 'booking', html: `<p class="wh-kicker">Next booking</p><h2>${esc(booking.title)}</h2><p>${esc(booking.customerName || 'Customer')} · ${esc(booking.location)} · ${esc(booking.date)} · ${esc(booking.hireType || '')}</p><button class="button primary wh-big" data-route="myJobs">Open booking</button>`};
  return null;
}
export function workerMoney(state, ws) {
  const L = (state.ledger || []).filter(x => x.payee === ws || x.payee === `worker:${ws}`);
  const got = L.filter(x => ['confirmed', 'paid'].includes(x.status) && x.type !== 'advance'), adv = L.filter(x => x.type === 'advance' && ['confirmed', 'paid'].includes(x.status)), pending = L.filter(x => ['pending_approval', 'approved'].includes(x.status));
  return {earned: sum(got), advances: sum(adv), pending: sum(pending), pendingCount: pending.length};
}
export function workerHome(state, ws, {availabilityHtml = ''} = {}) {
  const online = state.workerStatus?.[ws]?.online !== false;
  const now = workerNow(state, ws), money = workerMoney(state, ws), worker = (state.platformWorkers || []).find(w => w.persona === ws);
  const offers = (state.workOffers || []).filter(o => o.to === ws && o.status === 'pending');
  const requests = ws === 'personalDriver' ? (state.serviceRequests || []).filter(r => r.type === 'driver' && r.status === 'searching') : [];
  const role = worker?.capabilities?.includes('driver') ? 'driver' : 'helper';
  const openings = (state.vacancies || []).filter(v => v.status === 'open' && v.role === role).length;
  const extra = [];
  if (worker && !worker.verified) extra.push({text: 'Verify your ID and take a selfie to apply for work', route: 'workerVerify', cta: 'Verify'});
  if (state.workerStatus?.[ws]?.trainingDone !== true && ws === 'commercialDriver') extra.push({text: 'Watch the 3-minute safety training before your first MoveAI trip', route: 'driverTraining', cta: 'Start', icon: '▶'});
  if (state.workerStatus?.[ws]?.selfieDate !== new Date().toISOString().slice(0, 10) && ws !== 'helper') extra.push({text: 'Take today\'s selfie check before starting work', route: 'dailySelfie', cta: 'Take selfie', icon: '📷'});
  return `<div class="page-header"><div><h1>${esc(greeting())}, ${esc(nameOf(state, ws).split(' ')[0])}</h1><p>${online ? 'You are online. New offers come to you.' : 'You are offline. Go online to get offers.'}</p></div>
    <button class="button ${online ? 'secondary' : 'primary'} wh-toggle" data-work-online="${online ? 'off' : 'on'}">${online ? 'Go offline' : 'Go online'}</button></div>
  <div class="wh-grid">
    <section class="panel wh-now">${now ? now.html : `<p class="wh-kicker">Right now</p><h2>No work assigned</h2><p>${offers.length + requests.length ? 'You have offers below.' : 'Post when you are free, or find work nearby.'}</p><button class="button primary wh-big" data-route="work">Find work (${openings} near you)</button>`}</section>
    <section class="panel"><h2>Money</h2><div class="wh-money"><div><span>Earned</span><b>${inr(money.earned)}</b></div><div><span>Advances taken</span><b>${inr(money.advances)}</b></div><div><span>Waiting approval</span><b>${inr(money.pending)}</b><small>${money.pendingCount} item(s)</small></div></div><button class="button secondary" data-route="money">My khata</button></section>
  </div>
  <section class="panel"><h2>New offers ${offers.length + requests.length ? `<span class="status-pill info">${offers.length + requests.length}</span>` : ''}</h2>
    ${offers.map(o => `<article class="market-row offer-row" data-offer-row="${esc(o.id)}"><span class="market-icon">${o.kind === 'invite' ? '✉' : '📨'}</span><span><b>${esc(o.title)}</b><small>${esc(o.fromName)} · ${esc(o.date)} · <b>${inr(o.pay)}</b>${o.payType ? ' ' + esc(o.payType) : ''}${o.advance ? ` · advance ${inr(o.advance)}` : ''}</small></span><span class="row-actions"><button class="button secondary compact" data-op="offer-decline" data-id="${o.id}">Decline</button><button class="button primary compact" data-op="offer-accept" data-id="${o.id}">Accept</button></span></article>`).join('')}
    ${requests.map(r => `<article class="market-row offer-row"><span class="market-icon">🧑‍✈️</span><span><b>${esc(r.title)}</b><small>Customer request · ${esc(r.location)} · ${esc(r.date)} · you earn ${inr(r.quote?.driverEarning || 0)}</small></span><button class="button primary compact" data-route="myJobs">View</button></article>`).join('')}
    ${offers.length + requests.length ? '' : '<p class="muted">No new offers right now.</p>'}</section>
  ${availabilityHtml}
  ${alerts(state, ws, extra)}`;
}

export function bindWorkHome(root, api) {
  root.querySelectorAll('[data-scroll-offer]').forEach(b => b.onclick = () => { const row = root.querySelector(`[data-offer-row="${b.dataset.scrollOffer}"]`); if (!row) return api.navigate('myJobs'); row.scrollIntoView({behavior: 'smooth', block: 'center'}); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); });
  root.querySelectorAll('[data-work-online]').forEach(b => b.onclick = () => {
    const s = api.getState(), ws = s.currentWorkspace; (s.workerStatus ||= {})[ws] = {...(s.workerStatus[ws] || {}), online: b.dataset.workOnline === 'on'};
    const w = (s.platformWorkers || []).find(x => x.persona === ws); if (w && w.status !== 'employed') w.status = b.dataset.workOnline === 'on' ? 'available' : 'offline';
    api.save(); api.render(); api.toast(b.dataset.workOnline === 'on' ? 'You are online' : 'You are offline');
  });
}
