// MoveAI One — operations rules (P5–P8). Pure functions only: no DOM, no storage.
// Every screen action calls these guards, so hidden buttons are never the only protection.

export const DOC_TYPES = ['RC', 'Insurance', 'Permit', 'Fitness', 'Pollution'];

// ---------- Canonical trip milestones (draw.io 03, 04, 05, 15) ----------
export const TRIP_STEPS = [
  {key: 'terms_confirmed', label: 'Terms confirmed', roles: ['goods', 'transporter']},
  {key: 'vehicle_assigned', label: 'Vehicle and crew assigned', roles: ['transporter', 'vehicle', 'goods']},
  {key: 'crew_accepted', label: 'Crew accepted assignment', roles: ['commercialDriver', 'helper', 'transporter', 'vehicle', 'goods']},
  {key: 'pickup_reached', label: 'Reached pickup', roles: ['commercialDriver', 'helper', 'transporter', 'staff']},
  {key: 'loaded', label: 'Loading complete', proof: 'Loading photo', roles: ['commercialDriver', 'helper', 'transporter', 'staff']},
  {key: 'dharamkata', label: 'Dharamkata weighment', proof: 'Weighbridge slip', roles: ['commercialDriver', 'helper', 'transporter', 'staff'], optional: true},
  {key: 'in_transit', label: 'In transit with GPS', roles: ['commercialDriver', 'transporter', 'staff']},
  {key: 'delivered', label: 'Delivered with POD', proof: 'Signed POD', roles: ['commercialDriver', 'helper', 'transporter', 'staff']},
  {key: 'received', label: 'Receiver confirmed quantity and condition', roles: ['goods']},
  {key: 'settled', label: 'Parties settled', roles: ['transporter', 'goods']},
];

export function buildMilestones(dharamkata) {
  return TRIP_STEPS.filter(s => !s.optional || dharamkata).map(s => ({key: s.key, label: s.label, status: 'pending', at: null, proof: null, by: null}));
}
export function currentMilestone(trip) { return trip?.milestones?.find(m => m.status !== 'done') || null }
export function stepMeta(key) { return TRIP_STEPS.find(s => s.key === key) }

export function canAdvanceMilestone(trip, key, {role, proof} = {}) {
  if (!trip) return 'Trip not found.';
  if (trip.status === 'closed' || trip.status === 'cancelled') return 'This trip is closed. History stays read-only.';
  if (trip.hold) return `Trip is on hold: ${trip.hold}. Resolve the exception first.`;
  const current = currentMilestone(trip);
  if (!current) return 'Every milestone is already complete.';
  if (current.key !== key) return `Complete "${current.label}" first.`;
  const meta = stepMeta(key);
  if (meta && !meta.roles.includes(role)) return 'Your role cannot confirm this milestone.';
  if (key === 'vehicle_assigned' && (!trip.vehicleId || !trip.crew?.some(c => c.role === 'driver'))) return 'Assign an approved vehicle and a Driver first.';
  if (key === 'crew_accepted' && trip.crew?.some(c => !c.accepted)) return `Waiting for ${trip.crew.filter(c => !c.accepted).map(c => c.name).join(', ')} to accept.`;
  if (meta?.proof && !String(proof || '').trim()) return `${meta.proof} is required for this milestone.`;
  return '';
}

export function advanceMilestone(trip, key, {role, proof, by, at = new Date().toLocaleString('en-IN'), manual = false} = {}) {
  const error = canAdvanceMilestone(trip, key, {role, proof});
  if (error) return {error};
  const m = trip.milestones.find(x => x.key === key);
  Object.assign(m, {status: 'done', at, proof: proof || null, by: by || role, manual});
  trip.status = key === 'settled' ? 'closed' : key;
  if (key === 'in_transit' && trip.gps && trip.gps.consent) trip.gps.status = 'active';
  if (['delivered', 'settled'].includes(key) && trip.gps) trip.gps.status = 'stopped';
  return {trip};
}

export function tripProgress(trip) {
  const done = trip.milestones.filter(m => m.status === 'done').length;
  return Math.round((done / trip.milestones.length) * 100);
}

// ---------- Calendar & assignment (draw.io 05, 06, 07) ----------
export function overlaps(a, b) { return new Date(a.from) < new Date(b.to) && new Date(b.from) < new Date(a.to) }
export function findConflict(bookings, resourceId, window, ignoreRef) {
  return (bookings || []).find(b => b.resourceId === resourceId && b.ref !== ignoreRef && b.status !== 'released' && overlaps(b, window)) || null;
}

export function docsValid(vehicle, onDate = new Date()) {
  if (!vehicle) return false;
  if (vehicle.documents !== 'approved') return false;
  if (vehicle.documentExpiry && new Date(vehicle.documentExpiry) < new Date(onDate)) return false;
  return true;
}

export function crewEligible(worker, role, vehicleKind = 'truck') {
  if (!worker) return 'Select a worker.';
  if (worker.status && !['available', 'active', 'employed'].includes(worker.status)) return `${worker.name} is not available.`;
  if (role === 'driver') {
    if (!worker.capabilities?.includes('driver')) return `${worker.name} is not registered as a Driver.`;
    const commercial = (worker.licences || []).some(l => /heavy|commercial|hmv|transport/i.test(l));
    if (vehicleKind === 'truck' && !commercial) return `${worker.name} holds a personal licence only. Commercial trucks need a commercial licence.`;
  }
  if (role === 'helper' && !worker.capabilities?.includes('helper')) return `${worker.name} is not registered as a Khalasi / Helper.`;
  return '';
}

export function validateAssignment({trip, vehicle, crew = [], bookings = [], workers = []}) {
  if (!trip) return 'Trip not found.';
  if (!vehicle) return 'Choose a vehicle source and vehicle.';
  if (!docsValid(vehicle, trip.window?.from)) return `${vehicle.registration} has expired or unapproved documents. Renew them before assignment.`;
  if (Number(vehicle.capacity || 0) < Number(trip.quantity || 0)) return `${vehicle.registration} carries ${vehicle.capacity} t; this trip needs ${trip.quantity} t.`;
  const clash = findConflict(bookings, vehicle.id, trip.window, trip.id);
  if (clash) return `${vehicle.registration} is already booked for ${clash.label} (${clash.from.slice(0, 10)}). Overlapping assignments are blocked.`;
  if (!crew.some(c => c.role === 'driver')) return 'Assign a Driver.';
  for (const c of crew) {
    const worker = workers.find(w => w.id === c.id) || c;
    const err = crewEligible(worker, c.role);
    if (err) return err;
    const personClash = findConflict(bookings, c.id, trip.window, trip.id);
    if (personClash) return `${worker.name} is already assigned to ${personClash.label}.`;
  }
  return '';
}

// ---------- Customer pricing (draw.io 02, 08, 16) ----------
export const MOVING_PACKAGES = {
  basic: {label: 'Basic', includes: 'Vehicle, loading and unloading', rate: 1},
  standard: {label: 'Standard', includes: 'Basic + packing material and packing', rate: 1.35},
  premium: {label: 'Premium', includes: 'Standard + unpacking, assembly and transit cover', rate: 1.7},
};
export const HOME_SIZES = {'1 BHK': {vehicle: '8-ft mini truck', base: 5200}, '2 BHK': {vehicle: '14-ft closed truck', base: 8400}, '3 BHK': {vehicle: '19-ft closed truck', base: 12600}, 'Office': {vehicle: '19-ft closed truck', base: 15000}};
export const DRIVER_RATES = {
  hourly: {label: 'Per hour (local)', rate: 180, unit: 'hours', min: 4},
  daily: {label: 'Full day (10 hours)', rate: 1200, unit: 'days'},
  outstation: {label: 'Outstation (per day)', rate: 1200, unit: 'days'},
  oneway: {label: 'One-way drop (up to 6 hours)', rate: 1100, unit: 'trips'},
  monthly: {label: 'Monthly driver (8 h × 26 days)', rate: 22000, unit: 'months'},
};
export const DRIVER_RATE_CARD = {extraHour: 150, night: 200, foodPerDay: 300, stayPerNight: 400, returnTravel: 450, monthlyExtraHour: 120, monthlyExtraDay: 900, carPremiumPct: 0.1};
export const BOOKING_FEE = {driver: 49, driverMonthly: 499, gstOnFee: 0.18};
export const GENERAL_SERVICES = {carpenter: 650, electrician: 450, plumber: 450, cleaning: 1800, painting: 3200};
export const GENERAL_RATE_CARD = {extraLabourHour: 250, visitIfNoWork: 199};

// Driver price (model 1): driver's charges go 100% to the driver; MoveAI earns only the booking fee (+ GST on the fee).
export function quoteDriver({hireType = 'daily', duration = 1, carType = 'Hatchback manual', nights = 0}) {
  const t = DRIVER_RATES[hireType] ? hireType : 'daily', r = DRIVER_RATES[t], rc = DRIVER_RATE_CARD;
  const n = Math.max(t === 'hourly' ? r.min : 1, Number(duration) || 1);
  const lines = [[`${r.label} × ${n}${t === 'hourly' ? ' h' : ''}`, r.rate * n]];
  if (/suv|automatic|luxury/i.test(carType)) lines.push([`${carType} premium (10%)`, Math.round(r.rate * n * rc.carPremiumPct)]);
  if (t === 'outstation') { lines.push([`Food allowance × ${n} day(s)`, rc.foodPerDay * n]); const nt = Math.max(0, Number(nights) || n - 1); if (nt) lines.push([`Night stay allowance × ${nt} (or you arrange a stay)`, rc.stayPerNight * nt]); }
  if (t === 'oneway') lines.push(['Driver’s return travel (fixed)', rc.returnTravel]);
  const partnerTotal = lines.reduce((a, [, v]) => a + v, 0);
  const feeBase = t === 'monthly' ? BOOKING_FEE.driverMonthly : BOOKING_FEE.driver, feeGst = Math.round(feeBase * BOOKING_FEE.gstOnFee);
  const feeLines = [['MoveAI booking fee', feeBase], ['GST on booking fee (18%)', feeGst]];
  const rateCard = t === 'monthly'
    ? [['Extra hour', `₹${rc.monthlyExtraHour}`], ['Extra day beyond 26', `₹${rc.monthlyExtraDay}`], ['Unpaid leave', `−₹${Math.round(r.rate / 26)} per day`], ['Notice', '7 days either side'], ['Police verification', 'Required for monthly / live-in']]
    : [['Extra time beyond the booking', `₹${rc.extraHour} per hour — you approve`], ['Driving after 10 pm', `₹${rc.night} night charge`], ['Tolls / parking', 'You pay, or reimbursed with a slip photo'], ['Fuel', 'Your car, your fuel']];
  return {kind: 'driver', partnerLines: lines, partnerTotal, gst: 0, feeLines, fee: feeBase + feeGst, rateCard, components: [...lines, ...feeLines], total: partnerTotal + feeBase + feeGst, driverEarning: partnerTotal};
}

// Movers price from the inventory (B + C); big or intercity moves recommend a video survey (D).
const MOVE_ITEMS = [
  {re: /bed|mattress/, label: 'Bed', units: 12, dismantle: true}, {re: /wardrobe|almirah|cupboard/, label: 'Wardrobe', units: 10, dismantle: true},
  {re: /sofa|couch/, label: 'Sofa', units: 10}, {re: /fridge|refrigerator/, label: 'Fridge', units: 8, special: 300},
  {re: /washing machine/, label: 'Washing machine', units: 6, special: 250}, {re: /\bac\b|air ?condition/, label: 'AC', units: 4, install: 900},
  {re: /piano/, label: 'Piano', units: 15, special: 2500}, {re: /bike|scooter|motorcycle/, label: 'Two-wheeler', units: 8, special: 1200},
  {re: /tv|television|electronic/, label: 'TV / electronics', units: 3, special: 150}, {re: /dining|table|desk/, label: 'Table', units: 6},
  {re: /carton|box|kitchen|books|clothes/, label: 'Cartons', units: 1, carton: true},
];
export const MOVE_RATE_CARD = {cartonPack: 45, wrapPerBigItem: 120, dismantle: 300, perKm: 38, intercityPerKm: 32, tollPerKm: 2.5, floorNoLift: 350, longCarry: 500, worker: 750, peakPct: 0.1, insurancePct: 0.01, extraCarton: 25, waitingHour: 300, storageDay: 400};
const TRUCKS = [[40, '8-ft mini truck', 2800, 2], [90, '14-ft closed truck', 4800, 3], [150, '19-ft closed truck', 7200, 4], [Infinity, '32-ft container', 13000, 6]];
export function parseInventory(text) {
  return String(text || '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean).map(raw => {
    const qty = Number((raw.match(/^(\d+)\s*[x×]?\s*/i) || [])[1] || 0);
    const it = MOVE_ITEMS.find(m => m.re.test(raw.toLowerCase())) || {label: raw, units: 3};
    const count = qty || (it.carton ? 15 : 1);
    return {raw, ...it, count, re: undefined};
  });
}
export function quoteMoving({size = '2 BHK', pkg = 'standard', floors = 0, lift = true, dropFloors = 0, dropLift = true, distanceKm = 32, inventory = '', longCarry = false, declaredValue = 0, date = '', gstRate = 18}) {
  const items = parseInventory(inventory || {'1 BHK': 'Bed, Wardrobe, Fridge, 20 cartons', '2 BHK': 'Beds and mattresses, Wardrobe, Kitchen cartons, TV and electronics', '3 BHK': '3 beds, 3 wardrobes, Sofa, Fridge, Washing machine, 60 cartons', Office: '12 desks, 60 cartons'}[size] || '');
  const units = items.reduce((a, i) => a + i.units * i.count, 0);
  const [, vehicle, truckRate, workers] = TRUCKS.find(([max]) => units <= max);
  const km = Math.max(0, Number(distanceKm) || 0), intercity = km > 300, rc = MOVE_RATE_CARD;
  const noLift = v => v === false || v === 'no';
  const lines = [[intercity ? `${vehicle} · door to door` : vehicle, intercity ? Math.round(km * rc.intercityPerKm) + truckRate : truckRate], [`${workers} workers`, workers * rc.worker]];
  if (pkg !== 'basic') { const cartons = items.filter(i => i.carton).reduce((a, i) => a + i.count, 0), big = items.filter(i => !i.carton).reduce((a, i) => a + i.count, 0); lines.push([`Packing: ${cartons} cartons + wrap for ${big} items`, cartons * rc.cartonPack + big * rc.wrapPerBigItem]); }
  for (const i of items.filter(i => i.special)) lines.push([`${i.label} handling × ${i.count}`, i.special * i.count]);
  const dis = items.filter(i => i.dismantle).reduce((a, i) => a + i.count, 0); if (dis) lines.push([`Dismantle & reassemble × ${dis}`, dis * rc.dismantle]);
  const acs = items.filter(i => i.install).reduce((a, i) => a + i.count, 0); if (acs) lines.push([`AC uninstall & install × ${acs}`, acs * 900]);
  if (!intercity && km > 20) lines.push([`Distance beyond 20 km (${km - 20} km × ₹${rc.perKm})`, (km - 20) * rc.perKm]);
  if (intercity) lines.push(['Tolls and state entry (estimate)', Math.round(km * rc.tollPerKm)]);
  if (noLift(lift) && Number(floors) > 0) lines.push([`Pickup floor ${floors}, no lift`, Number(floors) * rc.floorNoLift]);
  if (noLift(dropLift) && Number(dropFloors) > 0) lines.push([`Drop floor ${dropFloors}, no lift`, Number(dropFloors) * rc.floorNoLift]);
  if (longCarry === true || longCarry === 'on' || longCarry === 'yes') lines.push(['Long carry (truck parks 50 m+ away)', rc.longCarry]);
  const d = date ? new Date(date) : null;
  if (d && !isNaN(d) && (d.getDay() === 0 || d.getDay() === 6 || d.getDate() >= 28)) { const sub = lines.reduce((a, [, v]) => a + v, 0); lines.push(['Peak date (weekend / month-end) 10%', Math.round(sub * rc.peakPct)]); }
  const partnerTotal = lines.reduce((a, [, v]) => a + v, 0), gst = Math.round(partnerTotal * gstRate / 100);
  const insurance = Number(declaredValue) > 0 ? Math.round(Number(declaredValue) * rc.insurancePct) : 0;
  const feeLines = [[`GST ${gstRate}% (per the mover’s GST setting)`, gst], ...(insurance ? [[`Transit insurance (1% of ₹${Number(declaredValue).toLocaleString('en-IN')})`, insurance]] : [])];
  const survey = ['3 BHK', 'Office'].includes(size) || intercity || units > 150;
  return {kind: 'moving', vehicle, units, items, workers, partnerLines: lines, partnerTotal, gst, gstRate, insurance, feeLines, fee: 0, survey,
    rateCard: [['Extra carton on the day', `₹${rc.extraCarton} each`], ['Extra floor without lift', `₹${rc.floorNoLift} per floor`], ['Long carry', `₹${rc.longCarry}`], ['Waiting after the first hour', `₹${rc.waitingHour} per hour`], ['Storage if the drop is delayed', `₹${rc.storageDay} per day`]],
    components: [...lines, ...feeLines], total: partnerTotal + gst + insurance};
}
export function quoteGeneral({category = 'carpenter'}) {
  const visit = GENERAL_SERVICES[category] || 500;
  return {kind: 'general', partnerLines: [['Visit and first hour of labour', visit]], partnerTotal: visit, gst: 0, feeLines: [], fee: 0,
    rateCard: [['Extra labour', `₹${GENERAL_RATE_CARD.extraLabourHour} per hour — you approve`], ['Spare parts', 'At shop price, with a photo of the bill'], ['If no work is possible', `Visit charge ₹${GENERAL_RATE_CARD.visitIfNoWork} only`]],
    components: [['Visit and first hour of labour', visit]], total: visit};
}

export function assignMoverBranch(request, branches) {
  const city = String(request.from || '').toLowerCase();
  const eligible = branches.filter(b => b.approved !== false && (b.coverage || []).some(c => city.includes(c.toLowerCase())));
  eligible.sort((a, b) => (a.openJobs || 0) - (b.openJobs || 0));
  return eligible[0] || null;
}

// ---------- Moving job (draw.io 08, 16) ----------
export const MOVING_STEPS = [
  ['auto_assigned', 'Auto-assigned to branch'], ['slot_confirmed', 'Slot and price confirmed'], ['resources_allocated', 'Vehicle and crew allocated'],
  ['packed', 'Inventory and packing done'], ['loaded', 'Loading proof uploaded'], ['in_transit', 'GPS movement'], ['unloaded', 'Unloaded and unpacked'],
  ['otp_verified', 'Customer OTP verified'], ['paid', 'Customer payment recorded'], ['closed', 'Payouts released and job closed'],
];
export function movingStepIndex(job) { return MOVING_STEPS.findIndex(s => s[0] === job.status) }
export function canMoveJob(job, next, {otp, proof} = {}) {
  const i = movingStepIndex(job), j = MOVING_STEPS.findIndex(s => s[0] === next);
  if (j !== i + 1) return `Complete "${MOVING_STEPS[i + 1]?.[1] || 'the current step'}" first.`;
  if (next === 'resources_allocated' && (!job.vehicle || !job.crew?.length)) return 'Allocate a vehicle and at least one crew member.';
  if (next === 'packed' && job.inventory.some(x => !x.packed)) return 'Pack and tick every inventory item first.';
  if (next === 'loaded' && !String(proof || '').trim()) return 'Loading proof is required.';
  if (next === 'otp_verified' && String(otp || '').trim() !== job.customerOtp) return 'OTP does not match. Ask the customer for the 4-digit completion OTP.';
  return '';
}

// ---------- Money (draw.io 17) ----------
export const MONEY_TYPES = {
  freight: {label: 'Freight / partner payout', earning: true},
  advance: {label: 'Advance (Truck Owner, Driver, Khalasi or staff)', earning: false},
  salary: {label: 'Salary, wage, bonus or final settlement', earning: true},
  deduction: {label: 'Deduction', earning: false, reducesEarnings: true},
  reimbursement: {label: 'Expense / reimbursement', earning: false},
  platform_fee: {label: 'Platform hiring / sourcing fee', earning: false},
  customer_payment: {label: 'Customer / goods payment', earning: false},
  wallet_credit: {label: 'Released to wallet', earning: true},
  commission: {label: 'MoveAI commission', earning: false},
  cash_commission: {label: 'Commission on cash job', earning: false},
  payout: {label: 'Payout to bank / UPI', earning: false},
  refund: {label: 'Refund', earning: false},
  cancellation_fee: {label: 'Cancellation fee', earning: false},
  penalty: {label: 'No-show penalty', earning: false},
};
export const MONEY_STATUSES = ['pending_approval', 'approved', 'paid', 'confirmed', 'closed', 'reversed', 'on_hold'];

export function validatePayment(entry, ledger = [], {approvalLimit = Infinity} = {}) {
  if (!MONEY_TYPES[entry.type]) return {error: 'Choose a payment type.'};
  if (!entry.payer || !entry.payee) return {error: 'Select payer and payee.'};
  if (entry.payer === entry.payee) return {error: 'Payer and payee cannot be the same party.'};
  if (!(Number(entry.amount) > 0)) return {error: 'Amount must be greater than zero.'};
  if (!entry.method) return {error: 'Choose a payment method.'};
  if (entry.method !== 'platform' && !String(entry.reference || '').trim()) return {error: 'Add a UTR, cheque number or cash receipt reference for outside payments.'};
  const dup = ledger.find(x => x.status !== 'reversed' && x.payee === entry.payee && Number(x.amount) === Number(entry.amount) && x.type === entry.type && ((entry.reference && x.reference === entry.reference) || (entry.sourceId && x.sourceId === entry.sourceId)));
  if (dup) return {error: `Possible duplicate of ${dup.id} (same payee, amount and reference). Reverse that entry or change the reference.`, duplicateOf: dup.id};
  return {error: '', needsApproval: Number(entry.amount) > approvalLimit};
}

export function moneyTransition(entry, action, {reason, actor} = {}) {
  const allowed = {
    approve: ['pending_approval'], pay: ['approved'], confirm: ['paid'], close: ['confirmed'], reverse: ['approved', 'paid', 'confirmed', 'closed', 'on_hold'], hold: ['pending_approval', 'approved', 'paid'], release: ['on_hold'],
  };
  if (!allowed[action]) return 'Unknown action.';
  if (!allowed[action].includes(entry.status)) return `Cannot ${action} an entry that is ${entry.status.replace(/_/g, ' ')}.`;
  if (['reverse', 'hold'].includes(action) && !String(reason || '').trim()) return 'A reason is required. The original entry is kept for audit.';
  return '';
}

export function applyMoneyAction(entry, action, {reason, actor, at = new Date().toLocaleString('en-IN')} = {}) {
  const error = moneyTransition(entry, action, {reason});
  if (error) return {error};
  const next = {approve: 'approved', pay: 'paid', confirm: 'confirmed', close: 'closed', reverse: 'reversed', hold: 'on_hold', release: entry.previousStatus || 'approved'}[action];
  if (action === 'hold') entry.previousStatus = entry.status;
  entry.status = next;
  entry.history = [...(entry.history || []), {action, status: next, reason: reason || '', actor, at}];
  return {entry};
}

export function earningsSummary(ledger, partyKey) {
  const mine = ledger.filter(x => x.payee === partyKey && x.status !== 'reversed');
  const sum = types => mine.filter(x => types.includes(x.type)).reduce((a, x) => a + Number(x.amount) * (x.type === 'deduction' ? -1 : 1), 0);
  const deductions = ledger.filter(x => x.payer === partyKey && x.type === 'deduction' && x.status !== 'reversed').reduce((a, x) => a + Number(x.amount), 0);
  return {
    earnings: sum(['freight', 'salary']) - deductions,
    advances: sum(['advance']),
    reimbursements: sum(['reimbursement']),
    platformFeesPaidByOthers: ledger.filter(x => x.type === 'platform_fee' && x.forWorker === partyKey).reduce((a, x) => a + Number(x.amount), 0),
    pendingConfirmation: mine.filter(x => x.status === 'paid').length,
  };
}

export function visibleLedger(ledger, workspace, {member, ownerWs} = {}) {
  if (workspace === 'admin') return ledger.filter(x => x.status === 'on_hold' || x.disputed);
  if (workspace === 'staff' && member) return ledger.filter(x => x.payee === `staff:${member.id}` || (member.role === 'accounts' && x.owner === ownerWs));
  return ledger.filter(x => x.owner === workspace || x.payee === workspace || x.payer === workspace);
}

// ---------- Messages, GPS, Voice (draw.io 18) ----------
export function visibleConversations(conversations, workspace, {member, ownerWorkspace} = {}) {
  return conversations.filter(c => {
    if (c.kind === 'internal') return c.owner === workspace || (workspace === 'staff' && c.owner === ownerWorkspace && (!c.branchIds || c.branchIds.some(b => member?.branchIds?.includes(b))));
    if (workspace === 'staff') return c.participants.includes(ownerWorkspace) && (member?.activeAssignments || []).includes(c.ref);
    return c.participants.includes(workspace);
  });
}
export function canSendMessage(conversation, workspace, opts) { return visibleConversations([conversation], workspace, opts).length === 1 && conversation.status !== 'closed' }

export function gpsAllowed(trip, workspace) {
  if (!trip?.gps) return 'No tracking session for this work.';
  if (!['commercialDriver'].includes(workspace)) return 'Only the assigned Driver device can send location.';
  if (!trip.crew?.some(c => c.persona === workspace && c.role === 'driver')) return 'You are not the assigned Driver.';
  if (!trip.gps.consent) return 'Give location consent for this trip first.';
  if (['closed', 'cancelled', 'settled'].includes(trip.status) || trip.gps.status === 'stopped') return 'Tracking stopped at closure. Off-duty tracking is not allowed.';
  return '';
}

const NUM = /(\d[\d,]*)/;
export function parseVoiceCommand(text) {
  const t = String(text || '').trim();
  const lower = t.toLowerCase();
  const ref = (t.match(/\b(TRP|MOV|SR|PAY)-?\d+\b/i) || [])[0]?.toUpperCase().replace(/^(TRP|MOV|SR|PAY)(\d)/, '$1-$2');
  if (!t) return {intent: 'empty', critical: false};
  if (/\b(i (am|'m) an? |i drive|i can drive|i work as|looking for|want) ?.*\b(trucks?|tempos?|lorry|lorries|trailers?|cars?|drivers?|khalasi|helpers?|loaders?|packers?|loading)\b/.test(lower) && !/\b(book|hire|need a)\b/.test(lower)) {
    const workerType = /\b(khalasi|helpers?|loaders?|packers?|loading)\b/.test(lower) ? 'helper' : /\b(trucks?|tempos?|lorry|lorries|trailers?|heavy)\b/.test(lower) ? 'commercialDriver' : 'personalDriver';
    const city = (t.match(/\b(?:in|at|near|from)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/) || [])[1] || '';
    const label = {commercialDriver: 'Commercial Driver (trucks)', personalDriver: 'Personal Driver (cars)', helper: 'Khalasi / Helper'}[workerType];
    return {intent: 'work_profile', critical: false, fields: {workerType, city}, readBack: `Start a work profile as ${label}${city ? ` in ${city}` : ''}. You can check it before saving.`};
  }
  const noRef = lower.replace(/\b(trp|mov|sr|pay)-?\d+\b/g, ' ');
  if (/\b(pay|paid|send|transfer|record|advance)\b/.test(lower) && NUM.test(noRef)) {
    const amount = Number(noRef.match(NUM)[1].replace(/,/g, ''));
    const to = (t.match(/\bto\s+([A-Za-z][A-Za-z ]+?)(?:\s+for\b|$|\s+on\b|\s+against\b)/i) || [])[1]?.trim();
    return {intent: 'payment', critical: true, amount, to, ref, readBack: `Record ₹${amount.toLocaleString('en-IN')} payment to ${to || 'the selected payee'}${ref ? ` for ${ref}` : ''}. It will wait for approval and payee confirmation.`};
  }
  if (/\b(loaded|loading done|reached pickup|delivered|pod|weigh|dharamkata|start trip|in transit)\b/.test(lower)) {
    const key = /deliver|pod/.test(lower) ? 'delivered' : /weigh|dharamkata/.test(lower) ? 'dharamkata' : /reached pickup/.test(lower) ? 'pickup_reached' : /start trip|in transit/.test(lower) ? 'in_transit' : 'loaded';
    return {intent: 'milestone', critical: true, key, ref, readBack: `Mark ${ref || 'your current trip'} as "${stepMeta(key)?.label || key}" with a voice-note proof.`};
  }
  if (/\b(breakdown|broke down|puncture|accident|damage|cancel)\b/.test(lower)) {
    const type = /cancel/.test(lower) ? 'cancellation' : /damage/.test(lower) ? 'damage' : 'breakdown';
    return {intent: 'exception', critical: true, type, ref, readBack: `Report ${type} on ${ref || 'your current work'} and notify only the affected parties.`};
  }
  if (/\b(move|shift|moving)\b/.test(lower)) {
    const size = (t.match(/\b([123])\s?bhk\b/i) || [])[1];
    const from = (t.match(/\bfrom\s+([A-Za-z ]+?)\s+to\b/i) || [])[1];
    const to = (t.match(/\bto\s+([A-Za-z ]+?)(?:\s+on\b|\s+tomorrow\b|$|,)/i) || [])[1];
    return {intent: 'fill_moving', critical: false, fields: {size: size ? `${size} BHK` : '2 BHK', from: from?.trim(), to: to?.trim()}, readBack: `Fill a moving request${from ? ` from ${from.trim()}` : ''}${to ? ` to ${to.trim()}` : ''}. You review the price before booking.`};
  }
  if (/\bdriver\b/.test(lower) && /\b(hire|need|book)\b/.test(lower)) {
    const hireType = /month/.test(lower) ? 'monthly' : /hour/.test(lower) ? 'hourly' : 'daily';
    return {intent: 'fill_driver', critical: false, fields: {hireType}, readBack: `Fill a personal Driver request (${DRIVER_RATES[hireType].label.toLowerCase()}).`};
  }
  if (/\b(summar\w*|status|where is|update|progress)\b/.test(lower)) return {intent: 'summarize', critical: false, ref, readBack: `Summarise ${ref || 'your open work'}.`};
  return {intent: 'note', critical: false, readBack: 'Saved as a voice note. No action was taken.'};
}

// ---------- Admin verification (draw.io 19) ----------
export function validateAdminDecision(item, decision, reason) {
  if (!['approve', 'correction', 'reject', 'suspend', 'escalate', 'restore'].includes(decision)) return 'Choose a decision.';
  if (decision !== 'approve' && !String(reason || '').trim()) return 'A reason is required and is shared with the affected user.';
  if (decision === 'restore' && !['suspended', 'rejected'].includes(item.status)) return 'Only suspended or rejected items can be restored after appeal.';
  if (decision !== 'restore' && ['approved', 'rejected', 'suspended'].includes(item.status) && decision !== 'suspend') return `This item is already ${item.status}.`;
  return '';
}
export function adminResultStatus(decision) { return {approve: 'approved', correction: 'correction_required', reject: 'rejected', suspend: 'suspended', escalate: 'escalated', restore: 'approved'}[decision] }

// ---------- Exceptions (draw.io 20) ----------
export const EXCEPTION_TYPES = {
  breakdown: {label: 'Vehicle breakdown', actions: ['Repair on site', 'Replace vehicle', 'Hold trip'], holds: true},
  crew_unavailable: {label: 'Driver / Khalasi / Helper unavailable', actions: ['Reassign crew', 'Hire from platform', 'Hold trip'], holds: true},
  cancellation: {label: 'Cancellation / rejection', actions: ['Cancel with agreed fee', 'Offer to another partner'], holds: true},
  damage: {label: 'Damage / partial delivery', actions: ['Record partial delivery', 'Raise claim'], holds: false},
  gps_failure: {label: 'GPS / network failure', actions: ['Continue with manual milestones'], holds: false},
  payment_dispute: {label: 'Payment dispute / duplicate', actions: ['Hold payment', 'Reverse duplicate'], holds: false},
  document_expired: {label: 'Document expired', actions: ['Hold vehicle until renewal', 'Replace vehicle'], holds: true},
};
export function validateException(x) {
  if (!EXCEPTION_TYPES[x.type]) return 'Choose what happened.';
  if (!x.ref) return 'Choose the affected trip, job or payment.';
  if (!String(x.reason || '').trim()) return 'Describe what happened.';
  if (['damage', 'breakdown'].includes(x.type) && !String(x.proof || '').trim()) return 'Add a photo or document as proof.';
  return '';
}
export function affectedParties(work) { return [...new Set([...(work?.parties || []), ...((work?.crew || []).map(c => c.persona).filter(Boolean))])] }

export function recalcDues(ledgerEntries, adjustment) {
  // Never delete: add a signed adjustment entry and return the new balance.
  const original = ledgerEntries.filter(x => x.status !== 'reversed').reduce((a, x) => a + Number(x.amount) * (x.type === 'deduction' ? -1 : 1), 0);
  return {original, adjustment: Number(adjustment || 0), revised: original - Number(adjustment || 0)};
}

// ---------- Next load (draw.io 05, 06) ----------
export function nextLoadsNear(city, loads) {
  const c = String(city || '').toLowerCase().split(/[ ,]/)[0];
  return loads.filter(l => String(l.pickup || l.from || '').toLowerCase().includes(c));
}

// ---------- Staff events (draw.io 13) ----------
export function validateLeave(v) {
  if (!v.memberId) return 'Select the staff member.';
  if (!v.from || !v.to || new Date(v.to) < new Date(v.from)) return 'Enter a valid leave period.';
  return '';
}
