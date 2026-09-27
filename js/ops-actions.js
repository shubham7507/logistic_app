// MoveAI One — operations actions. Every handler re-checks permissions (never rely on hidden buttons)
// and writes an audit event. `api` is supplied by app.js so state stays single-sourced.
import {
  advanceMilestone, canAdvanceMilestone, validateAssignment, crewEligible, docsValid, findConflict, canMoveJob, MOVING_STEPS,
  validatePayment, applyMoneyAction, parseVoiceCommand, validateAdminDecision, adminResultStatus, EXCEPTION_TYPES, validateException,
  affectedParties, recalcDues, gpsAllowed, buildMilestones, validateLeave, assignMoverBranch, DOC_TYPES, currentMilestone,
} from './ops-rules.js';
import {opsCtx, can, allVehicles, bookingQuote, approvalLimit, summarize, partyName, visibleTrips, inr} from './ops.js';

const now = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 9)}`;

export function audit(state, event, extra = {}) {
  const {persona, ws} = opsCtx(state);
  state.audit.unshift({id: uid('AUD'), event, at: new Date().toLocaleString('en-IN'), actor: persona.name, role: persona.role, workspace: ws, ...extra});
}
export function notify(state, parties, text, ref) {
  [...new Set(parties)].filter(Boolean).forEach(to => state.notifications.unshift({id: uid('N'), to, text, ref, at: now(), read: false, staffVisible: true}));
}

// ---------- trip creation hooks used by P4 flows ----------
export function createTripFromLoad(state, load, op) {
  if (state.trips.some(t => t.loadId === load.id)) return null;
  const route = op?.terms?.route || 'Jaipur → Delhi';
  const [from, to] = route.split('→').map(x => x.trim());
  const id = `TRP-${++state.tripSeq}`;
  const parties = [...new Set(load.parties || ['goods', 'transporter'])];
  const trip = {id, loadId: load.id, title: `${load.title}`, goods: load.title.split(' ')[0], quantity: Number((load.title.match(/(\d+)\s*tonnes/) || [])[1] || 12), unit: 'tonnes', from, to, branchId: 'BR-002', service: 'transport', goodsRole: 'seller', receiver: 'Buyer',
    arrangement: 'opportunity', parties, owner: parties.includes('transporter') ? 'transporter' : parties[0], vehicleSource: null, vehicleId: null, vehicleOwner: null, registration: null, crew: [],
    window: {from: '2026-10-01T06:00', to: '2026-10-02T18:00'}, dharamkata: Boolean(op?.terms?.dharamkata),
    terms: {freight: Number(op?.terms?.freight || 0), advance: Number(op?.terms?.advance || 0), truckOwnerPayout: Math.round(Number(op?.terms?.freight || 0) * 0.85), driverWage: 3500, khalasiWage: 1600, paymentTerms: `${op?.terms?.advancePayer || 'Goods Owner'} pays advance; ${op?.terms?.reimbursements || ''}`},
    milestones: buildMilestones(Boolean(op?.terms?.dharamkata)), status: 'pending', gps: {consent: false, status: 'not_started', points: []}, conversationId: null, exceptions: [], settlementCreated: false, receipt: null};
  trip.milestones[0] = {...trip.milestones[0], status: 'done', at: now(), by: 'All parties'};
  trip.status = 'terms_confirmed';
  const conv = {id: `CNV-${id}`, kind: 'job', ref: id, title: `${id} · ${trip.title}`, participants: parties, status: 'open', messages: [{id: 'M1', from: 'MoveAI', type: 'text', body: 'Trip created from confirmed terms. Assign vehicle and crew next.', at: now()}]};
  trip.conversationId = conv.id;
  state.trips.unshift(trip); state.conversations.unshift(conv);
  notify(state, parties, `${id} created from ${load.id}. Vehicle and crew assignment is next.`, id);
  return trip;
}

export function createTripFromRequirement(state, req, vehicle, driver, helper) {
  if (state.trips.some(t => t.requirementId === req.id && t.status !== 'cancelled')) return null;
  const id = `TRP-${++state.tripSeq}`;
  const crew = [driver && {id: driver.id, name: driver.name, role: 'driver', persona: null, classification: 'marketplace', accepted: true}, helper && {id: helper.id, name: helper.name, role: 'helper', persona: null, classification: 'marketplace', accepted: true}].filter(Boolean);
  const trip = {id, requirementId: req.id, goodsOrderId: req.goodsOrderId, title: `${req.goods} · ${req.pickup.split(',')[0]} → ${req.drop.split(',')[0]}`, goods: req.goods, quantity: Number(req.capacity), unit: 'tonnes', from: req.pickup, to: req.drop, branchId: vehicle.branchId, service: 'transport', goodsRole: 'seller', receiver: 'Buyer',
    arrangement: 'own_vehicle', parties: ['goods'], owner: 'goods', vehicleSource: 'own_fleet', vehicleId: vehicle.id, vehicleOwner: 'goods', registration: vehicle.registration, crew,
    window: {from: `${req.pickupDate}T06:00`, to: `${req.pickupDate}T22:00`}, dharamkata: Boolean(req.dharamkata), terms: {freight: 0, driverWage: 3200, paymentTerms: 'Own vehicle'},
    milestones: buildMilestones(Boolean(req.dharamkata)), status: 'pending', gps: {consent: false, status: 'not_started', points: []}, conversationId: null, exceptions: [], settlementCreated: false, receipt: null};
  ['terms_confirmed', 'vehicle_assigned', 'crew_accepted'].forEach(k => { const m = trip.milestones.find(x => x.key === k); Object.assign(m, {status: 'done', at: now(), by: 'Vijay Sharma'}) });
  trip.status = 'crew_accepted';
  state.bookings.push({id: uid('BK'), resourceId: vehicle.id, ref: id, label: `${id} ${trip.title}`, service: 'transport', from: trip.window.from, to: trip.window.to, owner: 'goods'});
  state.trips.unshift(trip);
  return trip;
}

// ---------- helpers ----------
function findWorker(state, id, ownerWs) {
  const staff = (state.peopleByWorkspace[ownerWs] || []).find(p => p.id === id);
  if (staff) return {id: staff.id, name: staff.name, capabilities: [staff.role], licences: staff.role === 'driver' ? ['Heavy vehicle'] : [], status: staff.status, classification: 'staff', persona: staff.name === 'Mohan Yadav' ? 'commercialDriver' : staff.name === 'Ramesh Yadav' ? 'helper' : null};
  const pw = state.platformWorkers.find(w => w.id === id);
  if (pw) return {...pw};
  const c = state.candidates.find(w => w.id === id);
  return c ? {...c, classification: 'marketplace'} : null;
}
function bookResources(state, trip, owner) {
  state.bookings = state.bookings.filter(b => b.ref !== trip.id);
  [trip.vehicleId, ...trip.crew.map(c => c.id)].filter(Boolean).forEach(r => state.bookings.push({id: uid('BK'), resourceId: r, ref: trip.id, label: `${trip.id} ${trip.title}`, service: 'transport', from: trip.window.from, to: trip.window.to, owner}));
}
function markDone(trip, key, by) { const m = trip.milestones.find(x => x.key === key); if (m && m.status !== 'done') Object.assign(m, {status: 'done', at: now(), by}); }
function addLedger(state, e) {
  const entry = {id: uid('PAY'), history: [{action: 'created', status: e.status || 'pending_approval', actor: opsCtx(state).persona.name, at: now()}], status: 'pending_approval', channel: e.method === 'platform' ? 'platform' : 'outside', ...e};
  state.ledger.unshift(entry);
  return entry;
}
function roleForMilestones(state) {
  const {ws, perms} = opsCtx(state);
  if (ws === 'staff') return perms.some(p => ['work.update', 'work.manage', 'work.assigned'].includes(p)) ? 'staff' : 'none';
  return ws;
}
const fileName = input => input?.files?.[0]?.name || '';

// ---------- main binder ----------
export function bindOps(root, api) {
  const S = () => api.getState();
  const done = (msg, route) => { api.save(); if (route) api.navigate(route); else api.render(); if (msg) api.toast(msg); };
  const err = (id, msg) => { const el = root.querySelector(`#${id}`); if (el) { el.textContent = msg; el.hidden = false; } else api.toast(msg); };

  const openers = {
    'open-service': (id) => { S().selectedServiceId = id; return 'serviceDetail'; },
    'open-trip': (id) => { S().selectedTripId = id; return 'tripDetail'; },
    'open-moving': (id) => { S().selectedMovingJobId = id; return 'movingJob'; },
    'open-conversation': (id) => { S().selectedConversationId = id; return 'conversation'; },
    'open-vehicle': (id) => { S().selectedVehicleId = id; return 'vehicleDetail'; },
    'open-payment': (id) => { S().selectedPaymentId = id; return 'paymentDetail'; },
    'open-exception': (id) => { S().selectedExceptionId = id; return 'exceptionDetail'; },
    'open-verification': (id) => { S().selectedVerificationId = id; return 'verificationItem'; },
    'open-vehicle-offer': (id) => { S().selectedVehicleOfferId = id; return 'vehicleOffer'; },
    'open-assign': (id) => { S().selectedTripId = id; S().assignDraft = {tripId: id, vehicleSource: 'own_fleet', crewSource: 'staff'}; return 'assignTrip'; },
    'open-driver-job': (id) => { S().selectedServiceId = id; return 'driverJob'; },
  };

  const ops = {
    // ---- 02 customer booking ----
    'booking-voice': () => {
      const box = root.querySelector('textarea[name="description"]');
      const apply = text => { const cmd = parseVoiceCommand(text); const f = new FormData(root.querySelector('#booking-form')); const d = {...Object.fromEntries(f), description: text}; if (cmd.intent === 'fill_moving') Object.assign(d, {service: 'moving'}, Object.fromEntries(Object.entries(cmd.fields).filter(([, v]) => v))); if (cmd.intent === 'fill_driver') Object.assign(d, {service: 'driver'}, cmd.fields); d.voiceNote = `Heard: “${text}” — ${cmd.readBack}`; S().bookingDraft = d; done('Form filled from voice. Check the details.'); };
      listen(text => apply(text), () => apply(box?.value?.trim() || 'Move 2 BHK from Sector 62 Noida to DLF Phase 3 Gurugram on 4 October'), m => { const st = root.querySelector('#booking-voice-status'); if (st) st.textContent = m; });
    },
    'booking-publish': () => {
      const s = S(); const d = s.bookingDraft; if (!d) return;
      if (s.currentWorkspace !== 'personal') return api.toast('Only the customer can book.');
      const q = bookingQuote(d); const id = `SR-${700 + s.serviceRequests.length + 1}`;
      const base = {id, customer: 'personal', date: d.date, quote: q, paid: false, rating: null, createdAt: now()};
      if (d.service === 'moving') {
        const branch = assignMoverBranch(d, s.movingBranches.filter(b => b.workspace === 'movers'));
        if (!branch) return api.toast('No approved Mover covers this pickup yet. Your request is saved; we will notify you.');
        const jobId = `MOV-${600 + s.movingJobs.length + 1}`; const conv = `CNV-${jobId}`;
        s.movingJobs.unshift({id: jobId, owner: branch.workspace, branchId: branch.id, customer: 'personal', customerName: s.person?.name || 'Shubham Kumar', serviceRequestId: id, from: d.from, to: d.to, date: d.date, size: d.size, pkg: d.pkg, vehicleNeed: q.vehicle, price: q.components, total: q.total, customerOtp: String(1000 + Math.floor(Math.random() * 8999)), status: 'auto_assigned', vehicle: null, vehicleSource: null, crew: [], inventory: [{item: 'Beds and mattresses', packed: false}, {item: 'Wardrobe', packed: false}, {item: 'Kitchen cartons', packed: false}, {item: 'TV and electronics', packed: false}], loadingProof: null, gps: {consent: false, status: 'not_started', points: []}, parties: ['personal', branch.workspace], conversationId: conv, window: {from: `${d.date}T08:00`, to: `${d.date}T18:00`}, payoutsCreated: false, history: [{status: 'auto_assigned', at: now(), by: 'Platform'}]});
        branch.openJobs = (branch.openJobs || 0) + 1;
        s.conversations.unshift({id: conv, kind: 'job', ref: jobId, title: `${jobId} · ${d.size} ${d.from} → ${d.to}`, participants: ['personal', branch.workspace], status: 'open', messages: [{id: 'M1', from: 'MoveAI', type: 'text', body: `Assigned to ${branch.name}. The branch confirms your slot next.`, at: now()}]});
        s.serviceRequests.unshift({...base, type: 'moving', title: `${d.size} move · ${d.from} → ${d.to}`, movingJobId: jobId, status: 'confirmed', conversationId: conv});
        notify(s, [branch.workspace], `New auto-assigned request ${jobId} for ${branch.name}.`, jobId);
      } else if (d.service === 'driver') {
        const conv = `CNV-${id}`;
        s.serviceRequests.unshift({...base, type: 'driver', title: `Personal Driver · ${d.hireType} · ${d.carType}`, hireType: d.hireType, duration: Number(d.duration), carType: d.carType, location: d.location, provider: null, providerName: null, status: 'searching', conversationId: conv});
        s.conversations.unshift({id: conv, kind: 'job', ref: id, title: `${id} · Personal Driver booking`, participants: ['personal', 'personalDriver'], status: 'open', messages: []});
        notify(s, ['personalDriver'], `New customer request ${id} near ${d.location}.`, id);
      } else {
        s.serviceRequests.unshift({...base, type: 'general', title: `${d.category} visit`, category: d.category, provider: 'partner', providerName: 'Verified service partner', status: 'accepted', conversationId: null});
      }
      audit(s, `Customer booked ${id} (${d.service})`);
      s.bookingDraft = null; s.selectedServiceId = id;
      done(d.service === 'moving' ? 'Booked. The nearest eligible Mover branch was assigned.' : 'Request sent', 'serviceDetail');
    },
    'service-confirm': id => { const r = S().serviceRequests.find(x => x.id === id && x.customer === S().currentWorkspace); if (!r || r.status !== 'provider_done') return api.toast('Nothing to confirm yet.'); r.status = 'completed'; audit(S(), `Customer confirmed completion of ${id}`); done('Completion confirmed. Pay when ready.'); },
    'service-pay': id => {
      const s = S(); const r = s.serviceRequests.find(x => x.id === id && x.customer === s.currentWorkspace); if (!r) return;
      const job = r.movingJobId && s.movingJobs.find(j => j.id === r.movingJobId);
      const method = root.querySelector('#service-pay-method')?.value || 'platform'; const reference = root.querySelector('#service-pay-ref')?.value || '';
      const amount = job ? job.total - 2000 : r.quote.total; const payee = job ? job.owner : r.provider === 'personalDriver' ? 'personalDriver' : 'external:service-partner';
      const v = validatePayment({type: 'customer_payment', payer: 'personal', payee, amount, method, reference, sourceId: `${id}-final`}, s.ledger);
      if (v.error) return api.toast(v.error);
      addLedger(s, {owner: 'personal', sourceType: 'service', sourceId: `${id}-final`, type: 'customer_payment', direction: 'payable', payer: 'personal', payee, responsible: 'personal', amount, method, reference, status: 'paid', note: `Final payment ${id}`});
      if (r.provider === 'personalDriver') addLedger(s, {owner: 'personal', sourceType: 'service', sourceId: id, type: 'salary', direction: 'payable', payer: 'personal', payee: 'personalDriver', responsible: 'personal', amount: r.quote.driverEarning, method, reference: `${reference}-drv`, status: 'paid', note: `Driver earning ${id} (booking fee kept separate)`});
      r.paid = true; if (!job) r.status = 'paid'; else if (job.status === 'otp_verified') { job.status = 'paid'; job.history.push({status: 'paid', at: now(), by: 'Customer'}); }
      audit(s, `Customer paid ${inr(amount)} for ${id} (${method === 'platform' ? 'platform' : 'recorded outside'})`);
      notify(s, [payee], `Customer payment received for ${id}. Confirm in Money.`, id);
      done('Payment recorded');
    },
    'service-rate': id => { const s = S(); const r = s.serviceRequests.find(x => x.id === id); if (!r) return; r.rating = Number(root.querySelector('input[name="service-rating"]:checked')?.value || 5); r.comment = root.querySelector('#service-comment')?.value || ''; r.status = 'closed'; if (r.provider) notify(s, [r.provider], `${id} rated ${r.rating}★ and closed.`, id); audit(s, `Customer rated ${id} ${r.rating}★`); done('Thanks. Booking closed.'); },

    // ---- trips ----
    'trip-milestone': (id, el) => {
      const s = S(); const t = visibleTrips(s).find(x => x.id === id); const key = el.dataset.key;
      if (!t) return api.toast('Trip not visible to you.');
      let proof = root.querySelector('#milestone-proof')?.value?.trim() || fileName(root.querySelector('#milestone-proof-file'));
      if (key === 'dharamkata' && proof) proof += ` · net ${root.querySelector('#dharamkata-weight')?.value || t.quantity} t`;
      if (key === 'settled' && !t.settlementCreated) return api.toast('Create settlement entries first.');
      const role = key === 'settled' ? (can(s, 'trip.settle', t) ? 'transporter' : 'none') : roleForMilestones(s);
      const res = advanceMilestone(t, key, {role, proof, by: opsCtx(s).persona.name, manual: Boolean(t.manualMode)});
      if (res.error) return api.toast(res.error);
      if (key === 'in_transit' && !t.gps.points.length) t.gps.points.push({place: t.from.split(',')[0], at: now()});
      if (key === 'settled') { state_release(s, t); }
      const msg = `${t.id}: ${t.milestones.find(m => m.key === key).label}${proof ? ` · 📎 ${proof}` : ''}`;
      s.conversations.find(c => c.id === t.conversationId)?.messages.push({id: uid('M'), from: `${opsCtx(s).persona.name} · ${opsCtx(s).persona.role}`, type: proof ? 'proof' : 'text', body: msg, at: now()});
      notify(s, affectedParties(t).filter(p => p !== s.currentWorkspace), msg, t.id);
      audit(s, `Milestone ${key} on ${t.id}${t.manualMode ? ' (manual, GPS down)' : ''}`);
      done(`${t.milestones.find(m => m.key === key).label} ✓`);
    },
    'crew-accept': id => { const s = S(); const t = s.trips.find(x => x.id === id); const me = t?.crew.find(c => c.persona === s.currentWorkspace); if (!me) return api.toast('You are not on this crew.'); me.accepted = true; if (t.crew.every(c => c.accepted)) markDone(t, 'crew_accepted', me.name), t.status = 'crew_accepted'; audit(s, `${me.name} accepted assignment ${id}`); notify(s, [t.owner], `${me.name} accepted ${id}.`, id); done('Assignment accepted'); },
    'gps-consent': id => { const s = S(); const t = s.trips.find(x => x.id === id); if (!root.querySelector('#gps-consent')?.checked) return api.toast('Tick the consent box first.'); t.gps.consent = true; t.gps.consentAt = now(); if (t.status === 'in_transit' || currentMilestone(t)?.key === 'delivered') t.gps.status = 'active'; audit(s, `GPS consent given for ${id}`); done('Consent saved for this trip only'); },
    'gps-ping': id => {
      const s = S(); const t = s.trips.find(x => x.id === id); const block = gpsAllowed(t, s.currentWorkspace); if (block) return api.toast(block);
      const path = ['Aurangabad (Bihar)', 'Varanasi bypass', 'Prayagraj NH-19', 'Kanpur ring road', 'Agra–Lucknow Expressway', 'Greater Noida', t.to.split(',')[0]];
      const place = path[Math.min(t.gps.points.length - 1, path.length - 1)] || path[0];
      const push = p => { t.gps.points.push({place: p, at: now()}); t.gps.lastSeen = now(); if (t.gps.status !== 'stopped') t.gps.status = 'active'; done(`Location shared: ${p}`); };
      if (navigator.geolocation && location.protocol === 'https:') navigator.geolocation.getCurrentPosition(pos => push(`${place} · ${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`), () => push(place), {timeout: 3000}); else push(place);
    },
    'trip-settlement': id => {
      const s = S(); const t = s.trips.find(x => x.id === id);
      if (!t || !can(s, 'trip.settle', t)) return api.toast('Only the business running this trip can settle it.');
      if (t.settlementCreated) return api.toast('Settlement entries already exist.');
      const x = t.terms; const received = s.ledger.filter(e => e.sourceId === id && e.payee === t.owner && e.type === 'freight' && e.status !== 'reversed').reduce((a, e) => a + Number(e.amount), 0);
      const paidOwner = s.ledger.filter(e => e.sourceId === id && e.payee === t.vehicleOwner && e.type === 'advance' && e.status !== 'reversed').reduce((a, e) => a + Number(e.amount), 0);
      const shortage = t.receipt?.deduction || 0;
      if (x.freight && t.owner !== 'goods') addLedger(s, {owner: t.owner, sourceType: 'trip', sourceId: id, type: 'freight', direction: 'receivable', payer: 'goods', payee: t.owner, responsible: 'goods', amount: x.freight - received - shortage, method: 'bank', reference: `BAL-${id}`, status: 'approved', note: `Freight balance${shortage ? ` after ${inr(shortage)} shortage deduction` : ''}`});
      if (t.vehicleOwner && t.vehicleOwner !== t.owner && x.truckOwnerPayout) addLedger(s, {owner: t.owner, sourceType: 'trip', sourceId: id, type: 'freight', direction: 'payable', payer: t.owner, payee: t.vehicleOwner, responsible: t.owner, amount: x.truckOwnerPayout - paidOwner, method: 'bank', reference: `FIN-${id}`, status: 'pending_approval', note: 'Truck Owner final amount (advance adjusted)'});
      t.crew.forEach(c => { const wage = c.role === 'driver' ? x.driverWage : x.khalasiWage; const adv = s.ledger.filter(e => e.sourceId === id && e.payee === (c.persona || `worker:${c.id}`) && e.type === 'advance').reduce((a, e) => a + Number(e.amount), 0); if (wage) addLedger(s, {owner: t.owner, sourceType: 'trip', sourceId: id, type: 'salary', direction: 'payable', payer: t.vehicleOwner && t.vehicleOwner !== t.owner && c.classification === 'staff' && c.persona === 'helper' ? t.vehicleOwner : t.owner, payee: c.persona || `worker:${c.id}`, responsible: t.owner, amount: Math.max(0, wage - adv), method: 'upi', reference: `WAGE-${id}-${c.id}`, status: 'pending_approval', note: `${c.name} wage (advance ${inr(adv)} adjusted)`}); });
      t.settlementCreated = true; audit(s, `Settlement entries created for ${id}`); notify(s, affectedParties(t), `Settlement created for ${id}. Check Money.`, id);
      done('Settlement entries created in Money');
    },
    'offer-next-load': (id, el) => {
      const s = S(); const t = s.trips.find(x => x.id === id); const load = [...s.availableLoads, ...(s.nextLoadPool || [])].find(l => l.id === el.dataset.load);
      if (!t || !load) return;
      if (s.currentWorkspace === 'transporter' && t.vehicleOwner && t.vehicleOwner !== 'transporter') { s.vehicleOffers.unshift({id: uid('VO'), tripId: null, loadId: load.id, to: t.vehicleOwner, from: 'transporter', fromName: partyName(s, 'transporter'), title: load.route || `${load.pickup} → ${load.drop}`, goods: load.goods, date: load.date, payout: 26000, advance: 6000, vehicleId: t.vehicleId, registration: t.registration, status: 'sent', ownerProvidesCrew: true}); notify(s, [t.vehicleOwner], `Next load offered near ${t.to}: ${load.route}.`, load.id); }
      else notify(s, ['transporter'], `${partyName(s, s.currentWorkspace)} asks for next load ${load.route} for ${t.registration}.`, load.id);
      audit(s, `Next load ${load.id} offered/requested after ${id}`); done('Next load sent');
    },
    'vehicle-offer-decline': id => { const s = S(); const o = s.vehicleOffers.find(x => x.id === id && x.to === s.currentWorkspace); if (!o) return; o.status = 'declined'; notify(s, [o.from], `${partyName(s, o.to)} declined ${o.title}.`, o.tripId); audit(s, `Vehicle offer ${id} declined`); done('Offer declined', 'trips'); },

    // ---- fleet ----
    'vehicle-owner-review': id => {
      const s = S(); if (!can(s, 'fleet.review')) return api.toast('Only the owner reviews documents before Admin.');
      const {ownerWs} = opsCtx(s); const v = (s.ownedVehicles[ownerWs] || []).find(x => x.id === id); const docs = s.vehicleDocs[id];
      if (!docs.every(d => ['uploaded', 'approved'].includes(d.status))) return api.toast('All five documents are needed.');
      docs.forEach(d => { if (d.status === 'uploaded') d.status = 'owner_reviewed'; });
      v.documents = 'submitted';
      s.verificationQueue.unshift({id: uid('VER'), kind: 'vehicle', subject: v.registration, ownerWorkspace: ownerWs, vehicleId: id, capability: 'Commercial vehicle documents', documents: docs.map(d => `${d.type}${d.file ? ` · ${d.file}` : ''}`), version: (s.verificationQueue.filter(q => q.vehicleId === id).length || 0) + 1, status: 'pending', history: [], submittedAt: now()});
      notify(s, ['admin'], `${v.registration} documents submitted for approval.`, id); audit(s, `Owner reviewed documents for ${v.registration}`);
      done('Submitted to Admin for approval');
    },
    'vehicle-use': (id, el) => { const s = S(); const {ownerWs} = opsCtx(s); const v = (s.ownedVehicles[ownerWs] || []).find(x => x.id === id); if (!docsValid(v)) return api.toast('Approve documents before using this vehicle.'); v.status = 'own_work'; audit(s, `${v.registration} reserved for own work`); done('Reserved for own goods / own work'); },
    'vehicle-partner': id => {
      const s = S(); const v = (s.ownedVehicles.vehicle || []).find(x => x.id === id); if (!v) return;
      if (!docsValid(v)) return api.toast('Movers only accept vehicles with approved documents.');
      if (s.partnerships.some(p => p.vehicleId === id && p.status !== 'declined')) return api.toast('Partnership already requested.');
      s.partnerships.push({id: uid('PRT'), vehicleOwner: 'vehicle', vehicleId: id, registration: v.registration, mover: 'movers', status: 'requested', requestedAt: now()}); notify(s, ['movers'], `${v.registration} asks to join as vehicle partner.`, id); audit(s, `Partnership requested for ${v.registration}`); done('Request sent to SafeMove Packers');
    },
    'approve-partner': id => { const s = S(); const p = s.partnerships.find(x => x.id === id && x.mover === s.currentWorkspace); if (!p) return api.toast('Only the Mover can approve.'); p.status = 'approved'; notify(s, [p.vehicleOwner], `${p.registration} approved as SafeMove vehicle partner.`, p.vehicleId); audit(s, `Vehicle partner ${p.registration} approved`); done('Partner approved'); },

    // ---- moving ----
    'moving-step': (id, el) => {
      const s = S(); const j = s.movingJobs.find(x => x.id === id); const next = el.dataset.next;
      if (!j || !can(s, 'moving.manage', j)) return api.toast('Only the assigned Mover branch can update this job.');
      const {ownerWs} = opsCtx(s);
      if (next === 'resources_allocated') {
        const [vid, src] = String(root.querySelector('#moving-vehicle')?.value || '').split('|');
        const crewSel = [...(root.querySelector('#moving-crew')?.selectedOptions || [])].map(o => o.value.split('|'));
        if (!vid || !crewSel.length) return err('moving-error', 'Choose a vehicle and at least one crew member.');
        const vehicle = allVehicles(s).find(v => v.id === vid);
        if (!docsValid(vehicle, j.date)) return err('moving-error', `${vehicle.registration} has expired documents.`);
        const clash = findConflict(s.bookings, vid, j.window, j.id);
        if (clash) return err('moving-error', `${vehicle.registration} is booked for ${clash.label}. Overlapping assignments are blocked.`);
        j.vehicle = {id: vid, registration: vehicle.registration, source: src, owner: vehicle.owner}; j.vehicleSource = src;
        j.crew = crewSel.map(([kind, cid]) => { const w = findWorker(s, cid, ownerWs); return {id: cid, name: w?.name || cid, role: w?.capabilities?.[0] || 'helper', persona: w?.persona || null, classification: kind === 'staff' ? 'staff' : 'marketplace', accepted: kind === 'staff'}; });
        [vid, ...j.crew.map(c => c.id)].forEach(r => s.bookings.push({id: uid('BK'), resourceId: r, ref: j.id, label: `${j.id} moving`, service: 'movers', from: j.window.from, to: j.window.to, owner: ownerWs}));
        j.crew.filter(c => c.persona).forEach(c => { if (!s.workOffers.some(o => o.ref === j.id && o.to === c.persona)) s.workOffers.unshift({id: uid('OFF'), to: c.persona, kind: 'job', from: ownerWs, fromName: partyName(s, ownerWs), ref: j.id, title: `Moving job ${j.size} · ${j.from} → ${j.to}`, vehicle: vehicle.registration, pay: 1500, advance: 0, platformFee: c.classification === 'marketplace' ? 60 : 0, feePaidBy: partyName(s, ownerWs), date: j.date, status: 'pending'}); if (!j.parties.includes(c.persona)) j.parties.push(c.persona); const conv = s.conversations.find(x => x.id === j.conversationId); if (conv && !conv.participants.includes(c.persona)) conv.participants.push(c.persona); });
        if (src === 'partner' && !j.parties.includes(vehicle.owner)) j.parties.push(vehicle.owner);
      }
      if (next === 'packed' && j.inventory.some(x => !x.packed)) return err('moving-error', 'Tick every inventory item as packed.');
      const proof = root.querySelector('#moving-proof')?.value?.trim() || fileName(root.querySelector('#moving-proof-file'));
      const e = canMoveJob(j, next, {otp: root.querySelector('#moving-otp')?.value, proof});
      if (e) return err('moving-error', e);
      if (next === 'loaded') j.loadingProof = proof;
      if (next === 'in_transit') { j.gps = {consent: true, status: 'active', points: [{place: j.from, at: now()}, {place: 'NH-48 toll plaza', at: now()}]}; }
      if (next === 'unloaded') { j.gps.status = 'stopped'; j.gps.points.push({place: j.to, at: now()}); }
      if (next === 'paid') { const r = s.serviceRequests.find(x => x.id === j.serviceRequestId); if (!r?.paid) addLedger(s, {owner: j.owner, sourceType: 'moving', sourceId: j.id, type: 'customer_payment', direction: 'receivable', payer: j.customer, payee: j.owner, responsible: j.customer, amount: j.total - (j.customer === 'personal' ? 2000 : 0), method: root.querySelector('#moving-pay-method')?.value || 'upi', reference: `MOVE-${j.id}`, status: 'confirmed', note: 'Customer balance'}); if (r) r.paid = true; }
      if (next === 'closed') {
        if (!j.payoutsCreated) { if (j.vehicle?.source === 'partner') addLedger(s, {owner: j.owner, sourceType: 'moving', sourceId: j.id, type: 'freight', direction: 'payable', payer: j.owner, payee: j.vehicle.owner, responsible: j.owner, amount: Math.round(j.total * 0.35), method: 'bank', reference: `PRT-${j.id}`, status: 'approved', note: 'Vehicle partner payout'}); j.crew.forEach(c => addLedger(s, {owner: j.owner, sourceType: 'moving', sourceId: j.id, type: 'salary', direction: 'payable', payer: j.owner, payee: c.persona || (c.classification === 'staff' ? `staff:${c.id}` : `worker:${c.id}`), responsible: j.owner, amount: c.classification === 'staff' ? 400 : 1500, method: 'upi', reference: `CREW-${j.id}-${c.id}`, status: 'approved', note: `${c.name} ${c.classification === 'staff' ? 'job allowance (salary separate)' : 'per-job wage'}`})); j.payoutsCreated = true; }
        s.bookings.forEach(b => { if (b.ref === j.id) b.status = 'released'; });
        const r = s.serviceRequests.find(x => x.id === j.serviceRequestId); if (r && r.status !== 'closed') r.status = 'completed';
      }
      j.status = next; j.history.push({status: next, at: now(), by: opsCtx(s).persona.name});
      notify(s, j.parties.filter(p => p !== s.currentWorkspace), `${j.id}: ${MOVING_STEPS.find(x => x[0] === next)[1]}`, j.id);
      audit(s, `Moving ${j.id} → ${next}`); done(MOVING_STEPS.find(x => x[0] === next)[1]);
    },
    'inventory-add': id => { const s = S(); const j = s.movingJobs.find(x => x.id === id); const v = root.querySelector('#inventory-new')?.value?.trim(); if (!v) return; j.inventory.push({item: v, packed: false}); done('Item added'); },

    // ---- workers ----
    'offer-accept': id => {
      const s = S(); const o = s.workOffers.find(x => x.id === id && x.to === s.currentWorkspace); if (!o || o.status !== 'pending') return;
      const worker = s.platformWorkers.find(w => w.persona === o.to);
      if (o.kind === 'trip' && o.ref) {
        const t = s.trips.find(x => x.id === o.ref);
        if (t) {
          const role = o.to === 'helper' ? 'helper' : 'driver';
          const eligible = crewEligible(worker, role);
          if (eligible) return api.toast(eligible);
          const clash = findConflict(s.bookings, worker.id, t.window, t.id);
          if (clash) return api.toast(`You are already booked: ${clash.label}.`);
          const existing = t.crew.find(c => c.id === worker.id);
          if (existing) existing.accepted = true; else t.crew.push({id: worker.id, name: worker.name, role, persona: o.to, classification: 'marketplace', accepted: true});
          if (!t.parties.includes(o.to)) t.parties.push(o.to);
          const conv = s.conversations.find(c => c.id === t.conversationId); if (conv && !conv.participants.includes(o.to)) conv.participants.push(o.to);
          s.bookings.push({id: uid('BK'), resourceId: worker.id, ref: t.id, label: `${t.id} ${t.title}`, service: 'transport', from: t.window.from, to: t.window.to, owner: t.owner});
          if (t.vehicleId && t.crew.some(c => c.role === 'driver')) markDone(t, 'vehicle_assigned', 'System');
          if (t.crew.every(c => c.accepted) && t.milestones.find(m => m.key === 'vehicle_assigned')?.status === 'done') { markDone(t, 'crew_accepted', worker.name); t.status = 'crew_accepted'; }
        }
        if (o.platformFee) addLedger(s, {owner: o.from, sourceType: 'hiring', sourceId: o.id, type: 'platform_fee', direction: 'payable', payer: o.from, payee: 'platform', responsible: o.from, amount: o.platformFee, method: 'platform', reference: `PF-${o.id}`, status: 'paid', forWorker: o.to, note: `Hiring fee for ${worker?.name} (paid by business)`});
        if (o.advance) addLedger(s, {owner: o.from, sourceType: 'trip', sourceId: o.ref, type: 'advance', direction: 'payable', payer: o.from, payee: o.to, responsible: o.from, amount: o.advance, method: 'upi', reference: `ADV-${o.id}`, status: 'approved', note: `Trip advance for ${worker?.name}`});
      }
      if (o.kind === 'job') { const j = s.movingJobs.find(x => x.id === o.ref); const c = j?.crew.find(x => x.persona === o.to); if (c) c.accepted = true; else if (j) { j.crew.push({id: worker.id, name: worker.name, role: 'helper', persona: o.to, classification: 'marketplace', accepted: true}); j.parties.push(o.to); const conv = s.conversations.find(x => x.id === j.conversationId); if (conv && !conv.participants.includes(o.to)) conv.participants.push(o.to); } if (o.platformFee) addLedger(s, {owner: o.from, sourceType: 'hiring', sourceId: o.id, type: 'platform_fee', direction: 'payable', payer: o.from, payee: 'platform', responsible: o.from, amount: o.platformFee, method: 'platform', reference: `PF-${o.id}`, status: 'paid', forWorker: o.to, note: 'Hiring fee (paid by business)'}); }
      if (o.kind === 'invite' && worker) worker.status = 'employed';
      o.status = 'accepted';
      notify(s, [o.from], `${worker?.name || partyName(s, o.to)} accepted: ${o.title}.`, o.ref || o.id);
      audit(s, `Worker accepted offer ${o.id} (${o.kind})`);
      done(o.kind === 'invite' ? 'Invite accepted. Staff onboarding opens with the business.' : 'Accepted. It is now in your assigned work.');
    },
    'offer-decline': id => { const s = S(); const o = s.workOffers.find(x => x.id === id && x.to === s.currentWorkspace); if (!o) return; o.status = 'declined'; notify(s, [o.from], `${partyName(s, o.to)} declined: ${o.title}.`, o.ref); audit(s, `Worker declined offer ${o.id}`); done('Offer declined'); },
    'driver-accept-request': id => { const s = S(); if (s.currentWorkspace !== 'personalDriver') return; const r = s.serviceRequests.find(x => x.id === id); if (!r || r.status !== 'searching') return api.toast('Another Driver already accepted.'); r.provider = 'personalDriver'; r.providerName = 'Anil Kumar'; r.status = 'accepted'; if (!r.conversationId) { r.conversationId = `CNV-${id}`; s.conversations.unshift({id: r.conversationId, kind: 'job', ref: id, title: `${id} · Personal Driver`, participants: [r.customer, 'personalDriver'].filter(p => !p.startsWith('external')), status: 'open', messages: []}); } notify(s, [r.customer], `Anil Kumar accepted ${id}.`, id); audit(s, `Personal Driver accepted ${id}`); s.selectedServiceId = id; done('Booking accepted', 'driverJob'); },
    'driver-job-step': (id, el) => { const s = S(); const r = s.serviceRequests.find(x => x.id === id && x.provider === s.currentWorkspace); if (!r) return api.toast('Not your booking.'); r.status = el.dataset.next; notify(s, [r.customer], `${id}: ${r.status === 'provider_done' ? 'Driver marked work complete. Please confirm and pay.' : 'Driver started work.'}`, id); audit(s, `Personal Driver ${id} → ${r.status}`); done(r.status === 'provider_done' ? 'Marked complete. Customer confirms next.' : 'Work started'); },

    // ---- messages ----
    'toggle-direct': () => { S().directDraftOpen = !S().directDraftOpen; done(); },
    'msg-audio': id => {
      const s = S(); const c = s.conversations.find(x => x.id === id);
      const post = body => { c.messages.push({id: uid('M'), from: `${opsCtx(s).persona.name} · ${opsCtx(s).persona.role}`, type: 'audio', body, at: now()}); done('Voice note sent'); };
      listen(text => post(`Voice note — “${text}”`), () => post('Voice note 0:09 (recorded)'), m => api.toast(m));
    },
    'msg-location': id => { const s = S(); const c = s.conversations.find(x => x.id === id); const post = body => { c.messages.push({id: uid('M'), from: `${opsCtx(s).persona.name} · ${opsCtx(s).persona.role}`, type: 'location', body, at: now()}); done('Location shared'); }; if (navigator.geolocation && location.protocol === 'https:') navigator.geolocation.getCurrentPosition(p => post(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`), () => post('Location unavailable · shared last known place'), {timeout: 4000}); else post('Current place · 28.61, 77.21 (demo)'); },

    // ---- money ----
    'money-filter': (id, el) => { S().moneyFilter = el.dataset.filter; done(); },
    'new-payment': () => { S().paymentDraft = null; done(null, 'payment'); },
    'money-action': (id, el) => {
      const s = S(); const x = s.ledger.find(e => e.id === id); const action = el.dataset.actionName; const reason = root.querySelector('#money-reason')?.value;
      const need = {approve: 'money.approve', pay: 'money.pay', confirm: 'money.confirm', close: 'money.reverse', reverse: 'money.reverse', release: 'money.reverse'}[action];
      if (need && !can(s, need, x)) return api.toast('Your role cannot do this. The server would reject it too.');
      if (action === 'approve' && s.currentWorkspace === 'staff' && Number(x.amount) > approvalLimit(s)) return api.toast(`Above your approval limit of ${inr(approvalLimit(s))}.`);
      const res = applyMoneyAction(x, action, {reason, actor: opsCtx(s).persona.name});
      if (res.error) return api.toast(res.error);
      if (action === 'hold') s.cases.unshift({id: uid('CASE'), kind: 'payment', subject: `${x.id} ${inr(x.amount)} dispute`, raisedBy: partyName(s, s.currentWorkspace), status: 'open', severity: 'medium', at: now(), notes: reason});
      if (action === 'pay') notify(s, [x.payee], `${partyName(s, x.payer)} ${x.channel === 'platform' ? 'paid' : 'recorded a payment of'} ${inr(x.amount)} (${x.id}). Please confirm.`, x.id);
      if (action === 'confirm') notify(s, [x.payer, x.owner], `${partyName(s, x.payee)} confirmed ${inr(x.amount)} (${x.id}).`, x.id);
      audit(s, `Money ${x.id}: ${action}${reason ? ` — ${reason}` : ''}`);
      done(`${x.id} ${x.status.replace(/_/g, ' ')}`);
    },

    // ---- exceptions ----
    'report-exception': (id, el) => { S().exceptionDraft = {ref: el.dataset.ref}; done(null, 'exceptions'); },
    'exception-action': (id, el) => {
      const s = S(); const e = s.exceptions.find(x => x.id === id); const choice = el.dataset.choice; e.action = choice; e.history.push({event: `Action chosen: ${choice} (${opsCtx(s).persona.name})`, at: now()});
      const t = s.trips.find(x => x.id === e.ref); const v = allVehicles(s).find(x => x.id === e.ref || x.id === t?.vehicleId);
      if (t && /Replace vehicle|Reassign crew|Hire from platform/.test(choice)) {
        if (/Replace vehicle/.test(choice)) { t.previousVehicles = [...(t.previousVehicles || []), t.registration]; t.vehicleId = null; t.registration = null; t.vehicleSource = null; }
        if (/Reassign crew|Hire/.test(choice)) t.crew = t.crew.filter(c => c.role !== (e.crewRole || 'driver'));
        const vm = t.milestones.find(m => m.key === 'vehicle_assigned'); const cm = t.milestones.find(m => m.key === 'crew_accepted');
        if (!['loaded', 'dharamkata', 'in_transit', 'delivered'].some(k => t.milestones.find(m => m.key === k)?.status === 'done')) { vm.history = [...(vm.history || []), {...vm}]; vm.status = 'pending'; cm.status = 'pending'; }
        s.bookings.forEach(b => { if (b.ref === t.id && (b.resourceId === v?.id)) b.status = 'released'; });
        t.hold = null; t.needsReassignment = true; s.selectedTripId = t.id; s.assignDraft = {tripId: t.id, vehicleSource: /Replace/.test(choice) ? 'posted' : 'own_fleet', crewSource: 'platform'};
        audit(s, `${e.id}: ${choice} on ${t.id} (history kept)`); return done('Choose the replacement now', 'assignTrip');
      }
      if (choice === 'Continue with manual milestones' && t) { t.manualMode = true; t.gps.status = 'failed'; }
      if (/Hold vehicle/.test(choice) && v) { const list = s.ownedVehicles[v.owner]; list.find(x => x.id === v.id).status = 'on_hold'; }
      if (/Hold payment/.test(choice)) { const x = s.ledger.find(p => p.id === e.ref); if (x) applyMoneyAction(x, 'hold', {reason: e.reason, actor: opsCtx(s).persona.name}); }
      if (/Reverse duplicate/.test(choice)) { const x = s.ledger.find(p => p.id === e.ref); if (x && can(s, 'money.reverse', x)) applyMoneyAction(x, 'reverse', {reason: `Duplicate · ${e.id}`, actor: opsCtx(s).persona.name}); else return api.toast('Only the paying business can reverse.'); }
      if (/Cancel with agreed fee/.test(choice) && t) { t.status = 'cancelled'; t.gps.status = 'stopped'; s.bookings.forEach(b => { if (b.ref === t.id) b.status = 'released'; }); }
      audit(s, `${e.id}: ${choice}`); done(choice);
    },
    'exception-recalc': id => {
      const s = S(); const e = s.exceptions.find(x => x.id === id); const adj = Number(root.querySelector('#exception-adjust')?.value || 0);
      if (!(adj > 0)) return api.toast('Enter an adjustment above zero.');
      const entries = s.ledger.filter(x => x.sourceId === e.ref);
      const r = recalcDues(entries, adj);
      const payer = e.responsible === 'external' ? 'external:metro' : e.responsible;
      const owner = s.trips.find(t => t.id === e.ref)?.owner || s.movingJobs.find(j => j.id === e.ref)?.owner || s.currentWorkspace;
      addLedger(s, {owner, sourceType: 'exception', sourceId: e.ref, type: 'deduction', direction: 'receivable', payer, payee: owner, responsible: payer, amount: adj, method: 'bank', reference: `ADJ-${e.id}`, status: 'pending_approval', note: `Adjustment for ${e.id} · dues ${inr(r.original)} → ${inr(r.revised)}`});
      e.history.push({event: `Dues recalculated: ${inr(r.original)} → ${inr(r.revised)} (adjustment entry added, nothing deleted)`, at: now()}); audit(s, `${e.id} dues recalculated by ${inr(adj)}`); done('Adjustment entry added');
    },
    'exception-resolve': (id, el) => {
      const s = S(); const e = s.exceptions.find(x => x.id === id); const mode = el.dataset.mode;
      if (mode === 'resume' && !e.action) return api.toast('Choose a safe next action first.');
      const t = s.trips.find(x => x.id === e.ref); if (t && mode === 'resume' && t.status !== 'cancelled') t.hold = null;
      const v = allVehicles(s).find(x => x.id === e.ref); if (v && mode === 'resume') { if (!docsValid(v)) return api.toast('Documents are still expired. Renew and get Admin approval first.'); s.ownedVehicles[v.owner].find(x => x.id === v.id).status = 'idle'; }
      e.status = mode === 'resume' ? 'resolved' : 'closed'; e.history.push({event: mode === 'resume' ? 'Work resumed' : 'Closed safely', at: now()});
      notify(s, e.parties, `${e.id} ${e.status}: ${EXCEPTION_TYPES[e.type].label} on ${e.ref}.`, e.ref); audit(s, `${e.id} ${e.status}`); done(e.status === 'resolved' ? 'Work resumed' : 'Closed safely');
    },

    // ---- admin / people / notifications ----
    'case-resolve': id => { const s = S(); if (!can(s, 'admin')) return; const c = s.cases.find(x => x.id === id); c.status = 'resolved'; audit(s, `Case ${id} resolved`); done('Case resolved'); },
    'rehire': id => {
      const s = S(); const {ownerWs} = opsCtx(s); if (!can(s, 'people.manage')) return api.toast('Only the business can rehire.');
      const f = [...(s.formerStaff?.[ownerWs] || []), ...(s.peopleByWorkspace[ownerWs] || [])].find(x => x.id === id); if (!f) return;
      if (s.staffInvitations.some(i => i.rehireOf === id && i.status === 'pending')) return api.toast('A rehire invitation is already pending.');
      s.staffInvitations.push({id: uid('SINV'), workspace: ownerWs, mobile: f.mobile || '9876501177', name: f.name, role: 'operations', branchId: s.businessProfiles[ownerWs]?.branches?.[0]?.id, responsibilities: ['Trip updates'], payType: 'monthly', employmentType: 'permanent', status: 'pending', expires: '10 Oct 2026', invitedBy: opsCtx(s).persona.name, rehireOf: id});
      s.staffEvents.unshift({workspace: ownerWs, text: `Rehire invitation sent to ${f.name} · new employment period`, at: now()}); audit(s, `Rehire started for ${f.name}`); done('Rehire invitation sent. Old employment history is kept.');
    },
    'notif-read-all': () => { const s = S(); s.notifications.forEach(n => { if (n.to === s.currentWorkspace) n.read = true; }); done('All read'); },
    'notif-open': id => {
      const s = S(); const n = s.notifications.find(x => x.id === id); if (!n) return; n.read = true; const r = n.ref || '';
      const route = r.startsWith('TRP') ? (s.selectedTripId = r, 'tripDetail') : r.startsWith('MOV') ? (s.currentWorkspace === 'personal' ? (s.selectedServiceId = s.movingJobs.find(j => j.id === r)?.serviceRequestId, 'serviceDetail') : (s.selectedMovingJobId = r, 'movingJob')) : r.startsWith('SR') ? (s.currentWorkspace === 'personalDriver' ? (s.selectedServiceId = r, 'driverJob') : (s.selectedServiceId = r, 'serviceDetail')) : r.startsWith('VEH') ? (s.selectedVehicleId = r, 'vehicleDetail') : r.startsWith('OFF') ? 'myJobs' : r.startsWith('PAY') ? (s.selectedPaymentId = r, 'paymentDetail') : 'home';
      done(null, route);
    },
  };

  const changes = {
    'booking-service': el => { const f = new FormData(el.form); S().bookingDraft = {...(S().bookingDraft || {}), ...Object.fromEntries(f), service: el.value}; done(); },
    'assign-draft': el => { const f = new FormData(el.form); S().assignDraft = {...(S().assignDraft || {}), tripId: el.form.dataset.id, ...Object.fromEntries(f)}; if (el.name === 'vehicleSource') delete S().assignDraft.vehicleId; done(); },
    'inventory-tick': el => { const j = S().movingJobs.find(x => x.id === el.dataset.id); if (!can(S(), 'moving.manage', j)) return; j.inventory[Number(el.dataset.index)].packed = el.checked; api.save(); },
  };

  const files = {
    'vehicle-doc': el => { const s = S(); if (!can(s, 'fleet.manage')) return api.toast('Your role cannot upload vehicle documents.'); const docs = s.vehicleDocs[el.dataset.id] ||= DOC_TYPES.map(type => ({type, status: 'missing', file: ''})); const d = docs.find(x => x.type === el.dataset.doc); Object.assign(d, {status: 'uploaded', file: fileName(el) || `${d.type.toLowerCase()}.pdf`, uploadedBy: `${opsCtx(s).persona.name} · ${opsCtx(s).persona.role}`, expiry: '2027-09-30'}); audit(s, `${d.type} uploaded for ${el.dataset.id}`); done(`${d.type} uploaded`); },
    'msg-proof': el => { const s = S(); const c = s.conversations.find(x => x.id === el.dataset.id); c.messages.push({id: uid('M'), from: `${opsCtx(s).persona.name} · ${opsCtx(s).persona.role}`, type: 'proof', body: fileName(el) || 'proof.jpg', at: now()}); done('Proof shared'); },
  };

  const forms = {
    'booking-review': (f, form) => {
      const d = {...(S().bookingDraft || {}), ...Object.fromEntries(f)};
      if (d.service === 'products') return api.navigate('search');
      if (d.service === 'moving' && (!d.from?.trim() || !d.to?.trim())) return err('booking-error', 'Enter both pickup and drop locations.');
      if (d.service === 'moving' && d.from.trim().toLowerCase() === d.to.trim().toLowerCase()) return err('booking-error', 'Pickup and drop cannot be the same.');
      if (d.service === 'driver' && !d.location?.trim()) return err('booking-error', 'Enter the pickup location.');
      S().bookingDraft = d; done(null, 'bookingReview');
    },
    'trip-receipt': (f, form) => {
      const s = S(); const t = s.trips.find(x => x.id === form.dataset.id); if (s.currentWorkspace !== 'goods') return api.toast('Only the goods party confirms receipt.');
      const qty = Number(f.get('quantity')); const condition = f.get('condition');
      if (!(qty >= 0) || qty > t.quantity) return err('receipt-error', `Quantity must be between 0 and ${t.quantity}.`);
      const shortage = t.quantity - qty; const perTonne = Math.round((s.goodsOrders.find(o => o.id === t.goodsOrderId)?.goodsPrice || 0) / (s.goodsOrders.find(o => o.id === t.goodsOrderId)?.quantity || 1));
      t.receipt = {quantity: qty, condition, note: f.get('note'), deduction: shortage > 0 ? Math.round(shortage * perTonne * 0.02) : 0, at: now()};
      const res = advanceMilestone(t, 'received', {role: 'goods', by: opsCtx(s).persona.name}); if (res.error) return api.toast(res.error);
      if (shortage > 0 || condition !== 'Good') { const e = {id: uid('EXC'), type: 'damage', ref: t.id, refKind: 'trip', reason: `${shortage > 0 ? `Short by ${shortage} ${t.unit}. ` : ''}Condition: ${condition}.`, location: t.to, proof: f.get('note'), responsible: t.vehicleOwner && t.vehicleOwner !== t.owner ? t.vehicleOwner : t.owner, reportedBy: opsCtx(s).persona.name, reportedByWs: s.currentWorkspace, parties: affectedParties(t), status: 'open', action: null, at: now(), history: [{event: 'Opened automatically from receipt', at: now()}]}; s.exceptions.unshift(e); notify(s, e.parties.filter(p => p !== 'goods'), `Receipt dispute on ${t.id}: ${e.reason}`, t.id); }
      if (t.goodsRole === 'buyer' && t.owner === 'goods') { const o = s.goodsOrders.find(x => x.id === t.goodsOrderId); if (o) s.paymentDraft = {sourceId: t.id, type: 'freight', payer: 'goods', payee: 'external:bihar-agro', amount: o.goodsPrice, method: 'bank', note: `Goods payment for ${o.id} after receipt`}; }
      audit(s, `Receipt confirmed on ${t.id}: ${qty} ${t.unit}, ${condition}`); done(shortage > 0 || condition !== 'Good' ? 'Receipt recorded; a dispute was opened for the difference.' : 'Receipt confirmed');
    },
    'assign-trip': (f, form) => {
      const s = S(); const t = s.trips.find(x => x.id === form.dataset.id); const {ownerWs, persona} = opsCtx(s);
      if (!can(s, 'trip.assign', t)) return err('assign-error', 'Your role cannot assign this trip.');
      const d = Object.fromEntries(f); s.assignDraft = {...d, tripId: t.id};
      if (!d.vehicleId) return err('assign-error', 'Choose a vehicle.');
      const vehicle = allVehicles(s).find(v => v.id === d.vehicleId);
      const crew = [];
      if (d.crewSource !== 'owner') {
        if (!d.driverId) return err('assign-error', 'Choose a Driver.');
        const drv = findWorker(s, d.driverId, ownerWs); const hlp = d.helperId ? findWorker(s, d.helperId, ownerWs) : null;
        crew.push({id: drv.id, name: drv.name, role: 'driver', persona: drv.persona || null, classification: drv.classification || 'marketplace', accepted: d.crewSource === 'staff' || !drv.persona});
        if (hlp) crew.push({id: hlp.id, name: hlp.name, role: 'helper', persona: hlp.persona || null, classification: hlp.classification || 'marketplace', accepted: d.crewSource === 'staff' || !hlp.persona});
        const workers = [drv, hlp].filter(Boolean);
        const e = validateAssignment({trip: t, vehicle, crew, bookings: s.bookings, workers});
        if (e) return err('assign-error', e);
      } else {
        if (!docsValid(vehicle, t.window.from)) return err('assign-error', `${vehicle.registration} has expired documents.`);
        const clash = findConflict(s.bookings, vehicle.id, t.window, t.id); if (clash) return err('assign-error', `${vehicle.registration} is booked for ${clash.label}.`);
      }
      if (d.vehicleSource === 'own_fleet') {
        Object.assign(t, {vehicleId: vehicle.id, registration: vehicle.registration, vehicleSource: 'own_fleet', vehicleOwner: ownerWs, crew, needsReassignment: false});
        bookResources(s, t, ownerWs); markDone(t, 'vehicle_assigned', persona.name); t.status = 'vehicle_assigned';
        if (crew.every(c => c.accepted)) { markDone(t, 'crew_accepted', persona.name); t.status = 'crew_accepted'; }
        crew.filter(c => !c.accepted && c.persona).forEach(c => { s.workOffers.unshift({id: uid('OFF'), to: c.persona, kind: 'trip', from: ownerWs, fromName: partyName(s, ownerWs), ref: t.id, title: `${c.role === 'driver' ? 'Driver' : 'Khalasi'} · ${t.from.split(',')[0]} → ${t.to.split(',')[0]}`, vehicle: vehicle.registration, pay: c.role === 'driver' ? t.terms.driverWage : t.terms.khalasiWage, advance: c.role === 'driver' ? 1000 : 300, platformFee: 150, feePaidBy: partyName(s, ownerWs), date: t.window.from.slice(0, 10), status: 'pending'}); notify(s, [c.persona], `New trip offer ${t.id} from ${partyName(s, ownerWs)}.`, t.id); });
        audit(s, `${t.id} assigned: ${vehicle.registration} + ${crew.map(c => c.name).join(', ')}`); notify(s, t.parties.filter(p => p !== s.currentWorkspace), `${t.id}: vehicle ${vehicle.registration} assigned.`, t.id);
        s.selectedTripId = t.id; return done(crew.every(c => c.accepted) ? 'Validated and assigned' : 'Assigned. Waiting for platform crew to accept.', 'tripDetail');
      }
      const offer = {id: uid('VO'), tripId: t.id, to: vehicle.owner, from: ownerWs, fromName: partyName(s, ownerWs), title: `${t.from.split(',')[0]} → ${t.to.split(',')[0]} · ${t.goods}`, goods: t.goods, date: t.window.from.slice(0, 10), payout: Number(d.payout || t.terms.truckOwnerPayout), advance: Number(d.advance || t.terms.advance), vehicleId: vehicle.id, registration: vehicle.registration, crew, ownerProvidesCrew: d.crewSource === 'owner', status: 'sent'};
      s.vehicleOffers.unshift(offer); t.pendingOfferId = offer.id; t.vehicleSource = d.vehicleSource;
      notify(s, [vehicle.owner], `${partyName(s, ownerWs)} offers ${offer.title} for ${vehicle.registration}.`, t.id); audit(s, `Vehicle offer ${offer.id} sent for ${t.id}`);
      s.selectedTripId = t.id; done(`Offer sent to ${partyName(s, vehicle.owner)}. Switch to Raj Transport to accept.`, 'tripDetail');
    },
    'vehicle-offer-accept': (f, form) => {
      const s = S(); const o = s.vehicleOffers.find(x => x.id === form.dataset.id && x.to === s.currentWorkspace); if (!o) return;
      const vehicle = allVehicles(s).find(v => v.id === f.get('vehicleId'));
      if (!o.tripId) { o.status = 'accepted'; audit(s, `Next-load offer ${o.id} accepted`); notify(s, [o.from], `${partyName(s, o.to)} accepted next load ${o.title}.`, o.loadId); return done('Next load accepted. The Transporter creates the trip once goods terms are confirmed.', 'trips'); }
      const t = s.trips.find(x => x.id === o.tripId);
      let crew = o.crew || [];
      if (o.ownerProvidesCrew) { crew = []; const dId = f.get('driverId'), hId = f.get('helperId'); if (!dId) return err('offer-error', 'Assign your Driver.'); const drv = findWorker(s, dId, 'vehicle'); crew.push({id: drv.id, name: drv.name, role: 'driver', persona: drv.persona || null, classification: drv.classification, accepted: !drv.persona}); if (hId) { const h = findWorker(s, hId, 'vehicle'); crew.push({id: h.id, name: h.name, role: 'helper', persona: h.persona || null, classification: h.classification, accepted: !h.persona}); } }
      const e = validateAssignment({trip: t, vehicle, crew, bookings: s.bookings, workers: crew.map(c => findWorker(s, c.id, 'vehicle') || c)});
      if (e) return err('offer-error', e);
      Object.assign(t, {vehicleId: vehicle.id, registration: vehicle.registration, vehicleOwner: 'vehicle', crew, pendingOfferId: null}); t.terms.truckOwnerPayout = o.payout;
      if (!t.parties.includes('vehicle')) t.parties.push('vehicle'); const conv = s.conversations.find(c => c.id === t.conversationId); if (conv && !conv.participants.includes('vehicle')) conv.participants.push('vehicle');
      crew.forEach(c => { if (c.persona && !t.parties.includes(c.persona)) t.parties.push(c.persona); if (c.persona && conv && !conv.participants.includes(c.persona)) conv.participants.push(c.persona); if (!c.accepted && c.persona) s.workOffers.unshift({id: uid('OFF'), to: c.persona, kind: 'trip', from: 'vehicle', fromName: partyName(s, 'vehicle'), ref: t.id, title: `${c.role === 'driver' ? 'Driver' : 'Khalasi'} · ${t.from.split(',')[0]} → ${t.to.split(',')[0]}`, vehicle: vehicle.registration, pay: c.role === 'driver' ? t.terms.driverWage : t.terms.khalasiWage, advance: 0, platformFee: 150, feePaidBy: 'Raj Transport', date: t.window.from.slice(0, 10), status: 'pending'}); });
      bookResources(s, t, 'vehicle'); markDone(t, 'vehicle_assigned', 'Rajesh Kumar'); t.status = 'vehicle_assigned'; if (crew.every(c => c.accepted)) { markDone(t, 'crew_accepted', 'Rajesh Kumar'); t.status = 'crew_accepted'; }
      o.status = 'accepted';
      if (o.advance) addLedger(s, {owner: o.from, sourceType: 'trip', sourceId: t.id, type: 'advance', direction: 'payable', payer: o.from, payee: 'vehicle', responsible: o.from, amount: o.advance, method: 'bank', reference: `ADV-${t.id}`, status: 'approved', note: 'Truck Owner advance'});
      notify(s, [o.from], `Raj Transport accepted ${t.id} with ${vehicle.registration}.`, t.id); audit(s, `Vehicle offer ${o.id} accepted with ${vehicle.registration}`);
      s.selectedTripId = t.id; done('Accepted and assigned', 'tripDetail');
    },
    'add-vehicle': f => {
      const s = S(); if (!can(s, 'fleet.manage')) return err('vehicle-error', 'Your role cannot add vehicles.');
      const {ownerWs} = opsCtx(s); const reg = String(f.get('registration')).toUpperCase().replace(/\s+/g, ' ').trim();
      if (!/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4}$/.test(reg)) return err('vehicle-error', 'Enter a valid registration like BR01 GX 7744.');
      if (allVehicles(s).some(v => v.registration.replace(/\s/g, '') === reg.replace(/\s/g, ''))) return err('vehicle-error', 'This vehicle is already registered on MoveAI. Ask the current owner to transfer it.');
      const id = uid('VEH'); (s.ownedVehicles[ownerWs] ||= []).push({id, registration: reg, truckType: f.get('truckType'), capacity: Number(f.get('capacity')), status: 'idle', documents: 'missing', documentExpiry: '', branchId: f.get('branchId'), crew: 'Not assigned'});
      s.vehicleDocs[id] = DOC_TYPES.map(type => ({type, status: 'missing', file: ''})); s.selectedVehicleId = id; audit(s, `Vehicle ${reg} added`); done('Vehicle saved. Upload the five documents next.', 'vehicleDetail');
    },
    'helper-skills': f => { const s = S(); const w = s.platformWorkers.find(x => x.persona === 'helper'); w.skills = f.getAll('skills'); if (!w.skills.length) return api.toast('Select at least one capability.'); audit(s, 'Helper capabilities updated'); done('Capabilities saved on your one profile'); },
    'upgrade-driver': f => { const s = S(); if (!/^[A-Z]{2}\d{2}\s?\w{6,}/i.test(String(f.get('licence')))) return err('upgrade-error', 'Enter a valid licence number.'); s.verificationQueue.unshift({id: uid('VER'), kind: 'person', subject: 'Anil Kumar', ownerWorkspace: 'personalDriver', capability: `Commercial Driver upgrade (${f.get('cls')})`, documents: [`Commercial licence ${f.get('licence')}`, `${f.get('years')} years · ${f.get('types')}`], version: 1, status: 'pending', history: [], submittedAt: now()}); notify(s, ['admin'], 'Anil Kumar requested Commercial Driver upgrade.', null); audit(s, 'Commercial Driver upgrade requested'); done('Submitted for verification'); },
    'start-direct': f => { const s = S(); if (!can(s, 'direct.chat')) return; const w = f.get('with'); const id = uid('CNV'); s.conversations.unshift({id, kind: 'direct', ref: null, title: `${partyName(s, s.currentWorkspace)} ↔ ${partyName(s, w)}`, participants: [s.currentWorkspace, w], status: 'open', createdBy: s.currentWorkspace, messages: [{id: 'M1', from: `${opsCtx(s).persona.name} · ${opsCtx(s).persona.role}`, type: 'text', body: f.get('body'), at: now()}]}); s.directDraftOpen = false; s.selectedConversationId = id; notify(s, [w], `${partyName(s, s.currentWorkspace)} started a direct chat.`, null); audit(s, `Direct chat started with ${partyName(s, w)}`); done('Direct chat started', 'conversation'); },
    'send-message': (f, form) => { const s = S(); const {ws, member, ownerWs} = opsCtx(s); const c = s.conversations.find(x => x.id === form.dataset.id); const body = String(f.get('body') || '').trim(); if (!body) return; if (!c || c.status === 'closed') return api.toast('This conversation is closed.'); c.messages.push({id: uid('M'), from: `${opsCtx(s).persona.name} · ${opsCtx(s).persona.role}`, type: 'text', body, at: now()}); done(); setTimeout(() => { const l = document.getElementById('chat-list'); if (l) l.scrollTop = l.scrollHeight; }, 0); },
    'create-payment': f => {
      const s = S(); if (!can(s, 'money.create')) return err('payment-error', 'Your role cannot record payments.');
      const entry = Object.fromEntries(f); entry.amount = Number(entry.amount); entry.proof = f.get('proofFile')?.name || ''; delete entry.proofFile;
      const {ws, ownerWs} = opsCtx(s);
      if (ws !== 'personal' && ![ownerWs].includes(entry.payer) && !entry.payer.startsWith('staff:') && entry.payee !== ownerWs) return err('payment-error', 'You can only record payments your business makes or receives.');
      const v = validatePayment(entry, s.ledger, {approvalLimit: approvalLimit(s)});
      if (v.error) return err('payment-error', v.error);
      const x = addLedger(s, {...entry, owner: ownerWs, sourceType: /^TRP/.test(entry.sourceId) ? 'trip' : /^MOV/.test(entry.sourceId) ? 'moving' : entry.sourceId.toLowerCase(), direction: entry.payer === ownerWs ? 'payable' : 'receivable', status: v.needsApproval ? 'pending_approval' : 'approved'});
      s.paymentDraft = null; s.selectedPaymentId = x.id; audit(s, `Payment ${x.id} ${inr(x.amount)} created (${x.status})`);
      done(v.needsApproval ? `Above your ${inr(approvalLimit(s))} limit — sent for approval` : 'Checked and approved. Pay or record it next.', 'paymentDetail');
    },
    'report-exception': f => {
      const s = S(); const x = Object.fromEntries(f); x.proof = x.proof || f.get('proofFile')?.name || ''; delete x.proofFile;
      const e = validateException(x); if (e) { s.exceptionDraft = x; return err('exception-error', e); }
      const work = s.trips.find(t => t.id === x.ref) || s.movingJobs.find(j => j.id === x.ref) || s.serviceRequests.find(r => r.id === x.ref);
      const v = allVehicles(s).find(v => v.id === x.ref); const pay = s.ledger.find(p => p.id === x.ref);
      const parties = [...new Set([...(work ? affectedParties(work) : []), ...(work?.customer && !String(work.customer).startsWith('external') ? [work.customer] : []), ...(work?.provider ? [work.provider] : []), ...(v ? [v.owner] : []), ...(pay ? [pay.payer, pay.payee].filter(p => !p.includes(':')) : []), s.currentWorkspace === 'staff' ? opsCtx(s).ownerWs : s.currentWorkspace])];
      const exc = {id: uid('EXC'), ...x, refKind: work ? 'work' : v ? 'vehicle' : 'payment', reportedBy: opsCtx(s).persona.name, reportedByWs: s.currentWorkspace, parties, status: 'open', action: null, at: now(), history: [{event: `Reported by ${opsCtx(s).persona.name}`, at: now()}]};
      s.exceptions.unshift(exc);
      const def = EXCEPTION_TYPES[x.type];
      if (def.holds && s.trips.find(t => t.id === x.ref)) s.trips.find(t => t.id === x.ref).hold = def.label;
      if (x.type === 'gps_failure' && s.trips.find(t => t.id === x.ref)) { const t = s.trips.find(t => t.id === x.ref); t.manualMode = true; t.gps.status = 'failed'; }
      if (x.type === 'payment_dispute' && pay && ['pending_approval', 'approved', 'paid'].includes(pay.status)) applyMoneyAction(pay, 'hold', {reason: x.reason, actor: opsCtx(s).persona.name});
      if (x.type === 'crew_unavailable') exc.crewRole = /khalasi|helper/i.test(x.reason) ? 'helper' : 'driver';
      notify(s, parties.filter(p => p !== s.currentWorkspace), `${def.label} reported on ${x.ref}: ${x.reason}`, x.ref);
      s.exceptionDraft = null; s.selectedExceptionId = exc.id; audit(s, `Exception ${exc.id}: ${def.label} on ${x.ref}`);
      done(`Reported. ${parties.length - 1} affected part${parties.length === 2 ? 'y' : 'ies'} notified.`, 'exceptionDetail');
    },
    'admin-decision': (f, form) => {
      const s = S(); if (!can(s, 'admin')) return;
      const x = s.verificationQueue.find(i => i.id === form.dataset.id); const decision = f.get('decision'); const reason = String(f.get('reason') || '').trim();
      const e = validateAdminDecision(x, decision, reason); if (e) return err('decision-error', e);
      x.status = adminResultStatus(decision); x.history.unshift({decision, reason: reason || 'Checks passed', at: now(), by: 'Admin Neha'});
      if (x.kind === 'vehicle' && x.vehicleId) { const v = allVehicles(s).find(v => v.id === x.vehicleId); const ref = s.ownedVehicles[v.owner].find(y => y.id === v.id); const docs = s.vehicleDocs[v.id] || []; if (x.status === 'approved') { ref.documents = 'approved'; ref.documentExpiry = '2027-09-30'; if (ref.status === 'on_hold') ref.status = 'idle'; docs.forEach(d => { d.status = 'approved'; d.expiry = '2027-09-30'; }); } else if (x.status === 'correction_required') { ref.documents = 'correction_required'; docs.forEach(d => { if (d.status !== 'approved') d.status = 'correction_required'; }); } else if (['suspended', 'rejected'].includes(x.status)) ref.documents = x.status; }
      if (x.kind === 'person' && x.ownerWorkspace === 'commercialDriver') { const w = s.platformWorkers.find(p => p.persona === 'commercialDriver'); if (w) w.verified = x.status === 'approved'; }
      if (x.kind === 'person' && x.ownerWorkspace === 'personalDriver' && /Commercial/.test(x.capability) && x.status === 'approved') { const w = s.platformWorkers.find(p => p.persona === 'personalDriver'); w.licences = [...new Set([...w.licences, 'Heavy vehicle (HMV) · commercial'])]; }
      if (decision === 'escalate') s.cases.unshift({id: uid('CASE'), kind: /pay/i.test(reason) ? 'payment' : /safe/i.test(reason) ? 'safety' : 'fraud', subject: `${x.subject} · ${x.capability}`, raisedBy: 'Admin Neha', status: 'open', severity: 'high', at: now(), notes: reason});
      notify(s, [x.ownerWorkspace], `Admin decision on ${x.capability}: ${x.status.replace(/_/g, ' ')}${reason ? ` — ${reason}` : ''}.`, x.vehicleId || x.id);
      audit(s, `Admin ${decision}: ${x.id} ${x.subject} v${x.version}${reason ? ` — ${reason}` : ''}`, {immutable: true});
      done(`Decision recorded: ${x.status.replace(/_/g, ' ')}`);
    },
    'staff-leave': f => {
      const s = S(); if (!can(s, 'people.manage')) return; const {ownerWs} = opsCtx(s); const v = Object.fromEntries(f);
      const e = validateLeave(v); if (e) return err('leave-error', e);
      const list = s.peopleByWorkspace[ownerWs]; const m = list.find(p => p.id === v.memberId); const to = list.find(p => p.id === v.reassignTo);
      if (to && to.id === m.id) return err('leave-error', 'Reassign to someone else.');
      const moved = [...(m.activeAssignments || [])];
      if (to) { to.activeAssignments = [...new Set([...(to.activeAssignments || []), ...moved])]; m.activeAssignments = []; }
      m.status = 'on_leave'; m.leave = {from: v.from, to: v.to, reason: v.reason};
      s.staffEvents.unshift({workspace: ownerWs, text: `${m.name}: ${v.reason} ${v.from} → ${v.to}${to ? ` · ${moved.length} item(s) reassigned to ${to.name}` : ' · work on hold'}`, at: now()});
      audit(s, `${m.name} marked ${v.reason.toLowerCase()} (${v.from}–${v.to})`); done('Saved. Active work reassigned.');
    },
  };

  root.querySelectorAll('[data-op]').forEach(el => el.addEventListener('click', ev => {
    const op = el.dataset.op; const id = el.dataset.id;
    if (openers[op]) { ev.preventDefault(); const route = openers[op](id); api.save(); api.navigate(route); return; }
    if (ops[op]) { ev.preventDefault(); ops[op](id, el); }
  }));
  root.querySelectorAll('[data-op-change]').forEach(el => el.addEventListener('change', () => changes[el.dataset.opChange]?.(el)));
  root.querySelectorAll('[data-op-file]').forEach(el => el.addEventListener('change', () => files[el.dataset.opFile]?.(el)));
  root.querySelectorAll('form[data-op-form]').forEach(form => form.addEventListener('submit', ev => { ev.preventDefault(); forms[form.dataset.opForm]?.(new FormData(form), form); }));
}

function state_release(s, t) { s.bookings.forEach(b => { if (b.ref === t.id) b.status = 'released'; }); const v = allVehicles(s).find(x => x.id === t.vehicleId); if (v) { const ref = s.ownedVehicles[v.owner].find(x => x.id === v.id); if (ref.status === 'on_trip' || ref.status === 'reserved') ref.status = 'idle'; } }

// ---------- speech ----------
export function listen(onText, fallback, onStatus = () => {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onStatus('Voice input is not supported in this browser — using the typed text.'); fallback(); return; }
  try {
    const r = new SR(); r.lang = 'en-IN'; r.interimResults = false; r.maxAlternatives = 1;
    let got = false; r.onresult = e => { got = true; onText(e.results[0][0].transcript); };
    r.onerror = () => { if (!got) { onStatus('Could not hear clearly — using the typed text.'); fallback(); } };
    r.onend = () => { if (!got) { /* handled by onerror or silence */ } };
    onStatus('Listening… speak now'); r.start();
    setTimeout(() => { if (!got) { try { r.stop(); } catch {} } }, 7000);
  } catch { fallback(); }
}

// ---------- AI assistant (draw.io 18: voice → transcribe → critical? → read back → execute + audit) ----------
export function runAssistant(state, text) {
  const cmd = parseVoiceCommand(text);
  const {ws} = opsCtx(state);
  if (cmd.intent === 'summarize') return {...cmd, answer: summarize(state, cmd.ref)};
  if (cmd.intent === 'payment' && !can(state, 'money.create')) return {...cmd, critical: false, blocked: true, answer: 'Your role cannot record payments. AI cannot bypass permissions.'};
  if (cmd.intent === 'milestone') { const t = cmd.ref ? visibleTrips(state).find(x => x.id === cmd.ref) : visibleTrips(state).find(x => currentMilestone(x)?.key === cmd.key); if (!t) return {...cmd, critical: false, blocked: true, answer: 'No trip of yours is waiting for that milestone.'}; cmd.ref = t.id; const e = canAdvanceMilestone(t, cmd.key, {role: ws === 'staff' ? 'staff' : ws, proof: 'Voice note'}); if (e) return {...cmd, critical: false, blocked: true, answer: `${e} Nothing was changed.`}; cmd.readBack = `Mark ${t.id} “${t.milestones.find(m => m.key === cmd.key).label}” with a voice-note proof.`; }
  if (cmd.intent === 'exception' && !cmd.ref) { const t = visibleTrips(state).find(x => !['closed', 'cancelled'].includes(x.status)); cmd.ref = t?.id; if (!t) return {...cmd, blocked: true, critical: false, answer: 'No active work found to report against.'}; cmd.readBack = `Report ${cmd.type} on ${t.id} and notify only its parties.`; }
  return cmd;
}
export function executeAssistant(state, cmd) {
  const {ws, ownerWs, persona} = opsCtx(state);
  if (cmd.intent === 'payment') {
    const payee = Object.entries(PARTY_LOOKUP(state)).find(([, n]) => n.toLowerCase() === String(cmd.to || '').toLowerCase())?.[0];
    if (!payee) return {error: `I could not find a payee called “${cmd.to}”. Open Record payment to choose one.`, route: 'payment'};
    const v = validatePayment({type: 'advance', payer: ownerWs, payee, amount: cmd.amount, method: 'upi', reference: `VOICE-${Date.now().toString().slice(-6)}`, sourceId: cmd.ref}, state.ledger);
    if (v.error) return {error: v.error};
    const x = addLedger(state, {owner: ownerWs, sourceType: cmd.ref ? 'trip' : 'voice', sourceId: cmd.ref || 'VOICE', type: 'advance', direction: 'payable', payer: ownerWs, payee, responsible: ownerWs, amount: cmd.amount, method: 'upi', reference: `VOICE-${Date.now().toString().slice(-6)}`, status: 'pending_approval', note: 'Created by voice · awaiting approval and payee confirmation'});
    audit(state, `Voice: payment ${x.id} ${inr(x.amount)} to ${partyName(state, payee)} (pending approval)`, {via: 'MoveAI voice'});
    state.selectedPaymentId = x.id; return {ok: `Created ${x.id} for approval. Nothing was paid yet.`, route: 'paymentDetail'};
  }
  if (cmd.intent === 'milestone') { const t = state.trips.find(x => x.id === cmd.ref); const res = advanceMilestone(t, cmd.key, {role: ws === 'staff' ? 'staff' : ws, proof: 'Voice note', by: `${persona.name} (voice)`}); if (res.error) return {error: res.error}; notify(state, affectedParties(t).filter(p => p !== ws), `${t.id}: ${t.milestones.find(m => m.key === cmd.key).label} (voice)`, t.id); audit(state, `Voice: ${cmd.key} on ${t.id}`, {via: 'MoveAI voice'}); state.selectedTripId = t.id; return {ok: 'Done and recorded in the audit log.', route: 'tripDetail'}; }
  if (cmd.intent === 'exception') { state.exceptionDraft = {type: cmd.type, ref: cmd.ref, reason: 'Reported by voice'}; audit(state, `Voice: ${cmd.type} report started on ${cmd.ref}`, {via: 'MoveAI voice'}); return {ok: 'Report form filled. Add proof and submit.', route: 'exceptions'}; }
  if (cmd.intent === 'fill_moving' || cmd.intent === 'fill_driver') { if (ws !== 'personal') return {error: 'Bookings are made from the Personal workspace.'}; state.bookingDraft = {service: cmd.intent === 'fill_moving' ? 'moving' : 'driver', ...Object.fromEntries(Object.entries(cmd.fields).filter(([, v]) => v))}; return {ok: 'Form filled. Review before booking.', route: 'book'}; }
  return {ok: cmd.readBack};
}
const PARTY_LOOKUP = state => ({goods: 'Sharma Foods', transporter: 'Raj Logistics', vehicle: 'Raj Transport', movers: 'SafeMove Packers', commercialDriver: 'Mohan Yadav', helper: 'Ramesh Yadav', personalDriver: 'Anil Kumar', ...Object.fromEntries(Object.values(state.peopleByWorkspace).flat().map(p => [`staff:${p.id}`, p.name]))});
