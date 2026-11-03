// MoveAI One — moving, Lalamove / Porter style: the customer says what they are moving, picks the vehicle
// (smallest that fits is recommended, too-small ones are blocked) and how much help they want, sees each
// price for their distance, adds extras, picks a date + 2-hour slot, and books. Small jobs (a few items, 1 RK)
// are a vehicle booking (driver + chosen helpers); bigger homes use the packers & movers flow; 3 BHK, office
// or another city get a survey first. The booking then runs through the existing mover branch steps.
import * as LOC from './location.js';
import * as WIZ from './wizard.js';
import {SLOTS, slotError, slotLabel, todayIso, freeSlots} from './home-services.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const addDays = (date, n) => new Date(new Date(`${date}T12:00:00`).getTime() + n * 86400000).toISOString().slice(0, 10);

// ---------- vehicles (demo prices modelled on Indian apps; editable in pricing rules later) ----------
export const VEHICLES = [
  {id: 'bike', label: '2-wheeler', icon: '🛵', kg: 20, cft: 3, good: 'Bags, parcels', base: 50, incKm: 0, perKm: 10, freeMin: 15},
  {id: '3w', label: '3-wheeler', icon: '🛺', kg: 500, cft: 50, good: 'Fridge, washing machine, about 10 boxes', base: 250, incKm: 2, perKm: 22, freeMin: 30},
  {id: 'ace', label: 'Tata Ace 7 ft', icon: '🚐', kg: 750, cft: 150, good: '1 RK, a few furniture items', base: 350, incKm: 2, perKm: 28, freeMin: 45},
  {id: 'pickup', label: 'Pickup 8 ft', icon: '🛻', kg: 1250, cft: 220, good: '1 BHK', base: 450, incKm: 2, perKm: 32, freeMin: 60},
  {id: '407', label: 'Tata 407 / 10 ft', icon: '🚚', kg: 2500, cft: 300, good: '1–2 BHK', base: 900, incKm: 3, perKm: 40, freeMin: 60},
  {id: '14ft', label: '14 ft truck', icon: '🚛', kg: 3500, cft: 450, good: '2 BHK', base: 1800, incKm: 5, perKm: 48, freeMin: 90},
  {id: '19ft', label: '19 ft truck', icon: '🚛', kg: 5000, cft: 900, good: '3 BHK', base: 3000, incKm: 5, perKm: 60, freeMin: 120},
  {id: '32ft', label: '32 ft container', icon: '🚛', kg: 7000, cft: 1600, good: '3–4 BHK, office, another city', base: 6500, incKm: 10, perKm: 75, freeMin: 180},
];
export const HELPER_RATE = 400, DRIVER_HELP = 200, FLOOR_RATE = 100, DRIVER_MAX_KG = 25;
export const vehicleFare = (v, km) => v.base + Math.max(0, Math.round(Number(km) || 0) - v.incKm) * v.perKm;
export const vehicleById = id => VEHICLES.find(v => v.id === id);

// ---------- items (volume in cubic feet, weight in kg) ----------
export const ITEMS = {
  box: ['Carton / box', 2, 15], bag: ['Bag / suitcase', 1, 8], mattress: ['Mattress', 8, 15], single_bed: ['Single bed', 25, 40, 'dismantle'], double_bed: ['Double bed', 40, 60, 'dismantle'],
  wardrobe: ['Wardrobe / almirah', 30, 70, 'dismantle'], sofa: ['Sofa (3-seater)', 35, 50], dining: ['Dining table', 25, 40, 'dismantle'], chair: ['Chair', 4, 8], desk: ['Office desk', 20, 35, 'dismantle'],
  fridge: ['Fridge', 18, 60], washer: ['Washing machine', 10, 45], tv: ['TV', 4, 15], ac: ['AC (split)', 6, 35, 'ac'], cooler: ['Cooler', 8, 20], bike: ['Motorbike / scooter', 30, 120], cupboard: ['Steel cupboard', 25, 60],
};
const COMMON = ['box', 'bag', 'fridge', 'washer', 'sofa', 'double_bed', 'tv', 'bike'];
export const WHAT = {
  few: {label: 'A few items', hint: 'Fridge, sofa, boxes…', items: {}, kind: 'vehicle'},
  '1rk': {label: '1 RK', hint: 'Room + kitchen', items: {single_bed: 1, mattress: 1, box: 10, bag: 3, chair: 2}, kind: 'vehicle'},
  '1bhk': {label: '1 BHK', items: {double_bed: 1, mattress: 1, wardrobe: 1, fridge: 1, washer: 1, tv: 1, sofa: 1, box: 20}, kind: 'packers'},
  '2bhk': {label: '2 BHK', items: {double_bed: 2, mattress: 2, wardrobe: 2, fridge: 1, washer: 1, tv: 2, sofa: 1, dining: 1, box: 40, chair: 4}, kind: 'packers'},
  '3bhk': {label: '3 BHK', items: {double_bed: 3, mattress: 3, wardrobe: 3, fridge: 1, washer: 1, tv: 2, sofa: 2, dining: 1, ac: 2, box: 60, chair: 6}, kind: 'packers', survey: true},
  office: {label: 'Office', items: {desk: 12, chair: 12, cupboard: 4, box: 60}, kind: 'packers', survey: true},
};
export function load(items = {}) {
  let cft = 0, kg = 0, heavy = 0, big = 0, boxes = 0, dismantle = 0, ac = 0;
  for (const [k, n] of Object.entries(items)) { const it = ITEMS[k]; if (!it || !(n > 0)) continue; cft += it[1] * n; kg += it[2] * n; if (it[2] > DRIVER_MAX_KG) heavy += n; if (k === 'box' || k === 'bag') boxes += n; else big += n; if (it[3] === 'dismantle') dismantle += n; if (it[3] === 'ac') ac += n; }
  return {cft, kg, heavy, big, boxes, dismantle, ac, count: Object.values(items).reduce((a, n) => a + (n > 0 ? n : 0), 0)};
}
export const fits = (v, l) => v.cft >= l.cft && v.kg >= l.kg;
export const recommended = l => VEHICLES.find(v => fits(v, l)) || VEHICLES.at(-1);

// ---------- helpers ----------
export const HELP_OPTIONS = [['self', 'I\'ll load myself', 0], ['driver', 'Driver helps (items up to 25 kg)', 0], ['dh1', 'Driver + 1 helper', 1], ['h1', '1 helper', 1], ['h2', '2 helpers', 2], ['h3', '3 helpers', 3], ['h4', '4 helpers', 4]];
export function helperCost(opt, {fromFloor = 0, fromLift = true, toFloor = 0, toLift = true} = {}) {
  if (opt === 'self') return 0; if (opt === 'driver') return DRIVER_HELP;
  const n = Number(String(opt).replace(/\D/g, '')) || 0, extra = opt === 'dh1' ? DRIVER_HELP : 0, floors = (fromLift ? 0 : Number(fromFloor) || 0) + (toLift ? 0 : Number(toFloor) || 0);
  return extra + n * HELPER_RATE + n * floors * FLOOR_RATE;
}
export function suggestHelp(l, what) {
  if (!l.count) return 'self';
  if (!l.heavy && l.cft <= 40) return 'driver';
  if (['few', '1rk'].includes(what)) return l.heavy >= 3 ? 'h2' : 'dh1';
  return {'1bhk': 'h2', '2bhk': 'h3', '3bhk': 'h4', office: 'h4'}[what] || 'h2';
}
export const helpError = (opt, l) => opt === 'driver' && l.heavy ? `The driver can only help with items up to ${DRIVER_MAX_KG} kg. You have ${l.heavy} heavy item(s) — choose helpers.` : '';

// ---------- quote ----------
export const EXTRA_RATES = {carton: 45, wrap: 120, dismantle: 300, ac: 900, insurancePct: 0.01, stopSmall: 100, stopTruck: 300, returnPct: 0.7, waitingHour: 300};
const small = v => ['bike', '3w', 'ace', 'pickup'].includes(v.id);
export function quote(d) {
  const l = load(d.items), v = vehicleById(d.vehicle) || recommended(l), km = Math.max(1, Math.round(Number(d.distanceKm) || 1)), w = WHAT[d.what] || WHAT.few;
  const fare = vehicleFare(v, km), lines = [[`${v.label} · ${km} km`, fare]];
  const help = d.help || suggestHelp(l, d.what), hc = helperCost(help, d);
  if (hc) lines.push([help === 'driver' ? 'Driver helps load and unload' : help === 'dh1' ? `Driver + 1 helper${(!d.fromLift && d.fromFloor > 0) || (!d.toLift && d.toFloor > 0) ? ' (incl. stairs)' : ''}` : `${HELP_OPTIONS.find(([k]) => k === help)?.[1]}${(!d.fromLift && d.fromFloor > 0) || (!d.toLift && d.toFloor > 0) ? ' (incl. stairs)' : ''}`, hc]);
  const x = d.extras || {};
  if (x.packing) lines.push([`Packing: ${l.boxes} cartons + wrap for ${l.big} items`, l.boxes * EXTRA_RATES.carton + l.big * EXTRA_RATES.wrap]);
  if (x.dismantle && l.dismantle) lines.push([`Dismantle & reassemble × ${l.dismantle}`, l.dismantle * EXTRA_RATES.dismantle]);
  if (x.ac && l.ac) lines.push([`AC uninstall & install × ${l.ac}`, l.ac * EXTRA_RATES.ac]);
  if (x.stop) lines.push(['Extra stop on the way', small(v) ? EXTRA_RATES.stopSmall : EXTRA_RATES.stopTruck]);
  if (x.returnTrip) lines.push(['Return trip (70% of the vehicle fare)', Math.round(fare * EXTRA_RATES.returnPct)]);
  const kind = x.packing || w.survey || km > 300 || !small(v) ? 'packers' : 'vehicle';
  const partnerTotal = lines.reduce((a, [, n]) => a + n, 0), gstRate = kind === 'packers' ? 18 : 0, gst = Math.round(partnerTotal * gstRate / 100);
  const insurance = Number(x.declaredValue) > 0 ? Math.round(Number(x.declaredValue) * EXTRA_RATES.insurancePct) : 0;
  const feeLines = [...(gst ? [[`GST ${gstRate}% (mover's GST)`, gst]] : []), ...(insurance ? [[`Transit insurance (1% of ${inr(x.declaredValue)})`, insurance]] : [])];
  const survey = Boolean(w.survey) || km > 300;
  return {kind: 'moving', bookingKind: kind, vehicle: v.label, vehicleId: v.id, help, workers: Number(String(help).replace(/\D/g, '')) || 0, units: l.cft, items: [], partnerLines: lines, partnerTotal, gst, gstRate, insurance, feeLines, fee: 0, survey,
    rateCard: [['Free loading time', `${v.freeMin} min, then ₹${EXTRA_RATES.waitingHour} per hour`], ['Extra carton on the day', `₹25 each`], ['Extra floor without lift', `₹${FLOOR_RATE} per helper per floor`], ['Anything extra', 'Only with your approval in the app']],
    components: [...lines, ...feeLines], total: partnerTotal + gst + insurance};
}
export function validate(s, d) {
  const l = load(d.items); if (!l.count) return 'Add what you are moving.';
  const v = vehicleById(d.vehicle); if (!v) return 'Choose a vehicle.';
  if (!fits(v, l)) return `That won't fit in a ${v.label}. Choose ${recommended(l).label} or bigger.`;
  const he = helpError(d.help, l); if (he) return he;
  if (!d.from || !d.to) return 'Add both pickup and drop addresses.';
  if (d.from.line === d.to.line && d.from.pincode === d.to.pincode) return 'Pickup and drop cannot be the same.';
  return slotError(d.date, d.slot);
}

// ---------- screen ----------
export const draftOf = s => (s.moveDraft ||= {step: 1, what: '', items: {}, help: '', vehicle: '', extras: {}, fromFloor: 0, fromLift: true, toFloor: 0, toLift: true, date: '', slot: ''});
export const STEPS = ['Where?', 'What?', 'Vehicle', 'Help', 'When?'];
const FLOORS = [[0, 'Ground'], [1, '1'], [2, '2'], [3, '3'], [4, '4+']];
const locs = s => ({from: LOC.makeLocation(LOC.draftOf(s, 'move-from')), to: LOC.makeLocation(LOC.draftOf(s, 'move-to'))});
const kmOf = (s, d) => { const {from, to} = locs(s); return Number(d.distanceKm) || (!from.error && !to.error ? LOC.distanceKm(from, to) : null) || 10; };
const pickedVehicle = (d, l) => (vehicleById(d.vehicle) && fits(vehicleById(d.vehicle), l) ? d.vehicle : (l.count ? recommended(l).id : ''));
function floorChips(side, floor, lift) {
  return `<div class="floor-row"><span class="muted">${side === 'from' ? 'Pickup' : 'Drop'} floor</span><div class="chip-choices small">${FLOORS.map(([v, l]) => `<label class="choice-chip"><input type="radio" name="${side}Floor" value="${v}" ${Math.min(4, Number(floor) || 0) === v ? 'checked' : ''} data-wiz-field><span><b>${l}</b></span></label>`).join('')}</div>
    <span class="muted">Lift</span><div class="chip-choices small">${[['yes', 'Yes'], ['no', 'No']].map(([v, l]) => `<label class="choice-chip"><input type="radio" name="${side}Lift" value="${v}" ${(lift ? 'yes' : 'no') === v ? 'checked' : ''} data-wiz-field><span><b>${l}</b></span></label>`).join('')}</div></div>`;
}
function summaries(s, d) {
  const {from, to} = locs(s), l = load(d.items), v = vehicleById(pickedVehicle(d, l)), help = d.help || suggestHelp(l, d.what);
  const place = x => x.error ? '' : (x.village || x.city || x.line);
  return {1: !from.error && !to.error ? `📍 ${place(from)} → ${place(to)} · ${kmOf(s, d)} km` : '', 2: l.count ? `${WHAT[d.what]?.label || 'Items'} · ${Object.entries(d.items).filter(([, n]) => n > 0).slice(0, 3).map(([k, n]) => `${ITEMS[k][0]} ${n}`).join(' · ')}${Object.values(d.items).filter(n => n > 0).length > 3 ? ' …' : ''}` : '',
    3: v ? `${v.icon} ${v.label}` : '', 4: HELP_OPTIONS.find(([k]) => k === help)?.[1] || ''};
}
export function screen(s) {
  const d = draftOf(s), step = Math.min(5, Math.max(1, d.step || 1)), l = load(d.items), rec = recommended(l), km = kmOf(s, d);
  const vehicle = pickedVehicle(d, l), help = d.help || suggestHelp(l, d.what), q = l.count ? quote({...d, vehicle, help, distanceKm: km}) : null;
  const floors = {fromFloor: d.fromFloor, fromLift: d.fromLift, toFloor: d.toFloor, toLift: d.toLift};
  const {from, to} = locs(s), autoKm = !from.error && !to.error ? LOC.distanceKm(from, to) : null;
  let body = '';
  if (step === 1) body = `${LOC.pickerHtml(s, 'move-from', {title: 'Pickup'})}${floorChips('from', d.fromFloor, d.fromLift)}
    ${LOC.pickerHtml(s, 'move-to', {title: 'Drop'})}${floorChips('to', d.toFloor, d.toLift)}
    ${autoKm ? `<p class="wiz-note">About <b>${autoKm} km</b> by road. <button type="button" class="button text compact" data-mv-editkm>Change</button></p>` : ''}${d.editKm || !autoKm ? `<label class="wiz-km"><span>Distance (km)${autoKm ? '' : ' — estimated once both addresses have a map point'}</span><input type="number" min="1" name="distanceKm" value="${esc(d.distanceKm || autoKm || '')}" placeholder="${autoKm || 'e.g. 12'}" data-wiz-field></label>` : ''}`;
  if (step === 2) {
    const list = d.editItems || d.what === 'few' && !l.count;
    body = `<fieldset><legend>What are you moving?</legend><div class="hs-cats">${Object.entries(WHAT).map(([k, w]) => `<label class="hs-cat ${d.what === k ? 'selected' : ''}"><input type="radio" name="what" value="${k}" ${d.what === k ? 'checked' : ''} data-mv-what><b>${esc(w.label)}</b>${w.hint ? `<small>${esc(w.hint)}</small>` : ''}</label>`).join('')}</div></fieldset>
    ${d.what ? (list ? `<fieldset><legend>Items <small class="muted">${l.count} items · about ${l.cft} cu ft · ${l.kg} kg</small></legend><div class="hs-items">${Object.entries(ITEMS).filter(([k]) => (d.items[k] || 0) > 0 || d.showAll || COMMON.includes(k)).map(([k, it]) => `<div class="hs-item"><span><b>${esc(it[0])}</b><small>${it[2] > DRIVER_MAX_KG ? 'Heavy' : 'Light'}</small></span><span class="qty"><button type="button" class="button secondary compact" data-mv-qty="${k}" data-d="-1" aria-label="Fewer ${esc(it[0])}">−</button><output data-mv-count="${k}">${d.items[k] || 0}</output><button type="button" class="button secondary compact" data-mv-qty="${k}" data-d="1" aria-label="More ${esc(it[0])}">+</button></span></div>`).join('')}</div>${!d.showAll ? '<button type="button" class="button text compact" data-mv-all>+ More items (bike, AC, desk…)</button>' : ''}${d.what !== 'few' ? ' <button type="button" class="button text compact" data-mv-items="close">Done</button>' : ''}</fieldset>`
      : `<div class="wiz-items-sum"><div><b>${l.count} items</b><small class="muted">${Object.entries(d.items).filter(([, n]) => n > 0).map(([k, n]) => `${ITEMS[k][0]} ${n}`).join(' · ')}</small></div><button type="button" class="button secondary compact" data-mv-items="open">Edit items</button></div>`) : ''}`;
  }
  if (step === 3) {
    const ok = VEHICLES.filter(v => fits(v, l)), bad = VEHICLES.filter(v => !fits(v, l));
    const card = (v, fit) => `<label class="mv-vehicle ${vehicle === v.id ? 'selected' : ''} ${fit ? '' : 'disabled'}" data-mv-vehicle-card="${v.id}"><input type="radio" name="vehicle" value="${v.id}" ${vehicle === v.id ? 'checked' : ''} ${fit ? '' : 'disabled'} data-mv-pick><span class="mv-icon" aria-hidden="true">${v.icon}</span><span><b>${esc(v.label)}</b>${v.id === rec.id ? ' <span class="status-pill success">Recommended</span>' : ''}<small>${v.kg >= 1000 ? `${v.kg / 1000} t` : `${v.kg} kg`} · ${esc(v.good)}</small>${fit ? '' : '<small class="field-error">Won\'t fit</small>'}</span><b class="mv-price">${inr(vehicleFare(v, km))}</b></label>`;
    body = `<p class="muted">Prices for ${km} km. The recommended one is already selected.</p><div class="mv-vehicles">${ok.map(v => card(v, true)).join('')}</div>${bad.length ? `<details class="mv-too-small"><summary>Too small for your items (${bad.length})</summary><div class="mv-vehicles">${bad.map(v => card(v, false)).join('')}</div></details>` : ''}`;
  }
  if (step === 4) {
    const v = vehicleById(vehicle) || rec, x = d.extras || {}, anyExtra = Object.entries(x).some(([k, val]) => val && k !== 'packing') || d.extrasOpen || x.packing;
    body = `<div class="mv-help">${HELP_OPTIONS.map(([k, t]) => { const no = helpError(k, l); return `<label class="mv-help-opt ${help === k ? 'selected' : ''} ${no ? 'disabled' : ''}"><input type="radio" name="help" value="${k}" ${help === k ? 'checked' : ''} ${no ? 'disabled' : ''} data-mv-pick><span><b>${esc(t)}</b>${k === suggestHelp(l, d.what) ? ' <span class="status-pill info">Suggested</span>' : ''}${no ? `<small class="field-error">Not for heavy items</small>` : ''}</span><b class="mv-price">${inr(helperCost(k, floors))}</b></label>`; }).join('')}</div><small class="muted">₹${HELPER_RATE} per helper, plus ₹${FLOOR_RATE} per helper per floor without a lift.</small>
    <details class="mv-extras" data-mv-extras ${anyExtra ? 'open' : ''}><summary>Add extras (optional)</summary><div class="check-grid">
      <label><input type="checkbox" name="x-packing" ${x.packing ? 'checked' : ''} data-wiz-field> Packing: ${l.boxes} cartons + wrap ${l.big} items · ${inr(l.boxes * EXTRA_RATES.carton + l.big * EXTRA_RATES.wrap)}</label>
      ${l.dismantle ? `<label><input type="checkbox" name="x-dismantle" ${x.dismantle ? 'checked' : ''} data-wiz-field> Dismantle & reassemble ${l.dismantle} items · ${inr(l.dismantle * EXTRA_RATES.dismantle)}</label>` : ''}
      ${l.ac ? `<label><input type="checkbox" name="x-ac" ${x.ac ? 'checked' : ''} data-wiz-field> AC uninstall & install × ${l.ac} · ${inr(l.ac * EXTRA_RATES.ac)}</label>` : ''}
      <label><input type="checkbox" name="x-stop" ${x.stop ? 'checked' : ''} data-wiz-field> Extra stop on the way · ${inr(small(v) ? EXTRA_RATES.stopSmall : EXTRA_RATES.stopTruck)}</label>
      <label><input type="checkbox" name="x-return" ${x.returnTrip ? 'checked' : ''} data-wiz-field> Return trip · ${inr(Math.round(vehicleFare(v, km) * EXTRA_RATES.returnPct))}</label>
      <label class="wide"><span>Insure goods — declared value ₹ (1%)</span><input type="number" min="0" name="x-value" value="${esc(x.declaredValue || '')}" data-wiz-field></label></div></details>`;
  }
  if (step === 5) body = `${WIZ.whenHtml(d.date, d.slot, {days: 30})}${q ? `<section class="hs-summary" data-mv-summary><h3>Price</h3>${q.partnerLines.map(([a, b]) => `<p class="price-line"><span>${esc(a)}</span><b>${inr(b)}</b></p>`).join('')}${q.feeLines.map(([a, b]) => `<p class="price-line"><span>${esc(a)}</span><b>${inr(b)}</b></p>`).join('')}<p class="price-line total"><span>Total</span><b data-mv-total>${inr(q.total)}</b></p>
      <small class="muted">${q.bookingKind === 'vehicle' ? 'Vehicle booking: a driver with the help you chose. No packing team or survey.' : q.survey ? 'Packers & movers. For this size or distance a free survey comes first, then a fixed quote.' : 'Packers & movers: the nearest approved mover branch does the job.'}</small></section>` : ''}`;
  return `<div class="page-header"><div><h1>Move house or items</h1><p>Choose the vehicle and help you need. Every price is shown before you book.</p></div></div>
  <form id="move-book-form" class="panel form-panel narrow wiz" data-step="${step}">${WIZ.head(STEPS, step, summaries(s, d))}
    <section class="wiz-step" data-mv-step="${step}"><h2>${esc(STEPS[step - 1])}</h2>${body}</section>
    <p class="field-error" id="move-book-error" hidden></p>
    ${WIZ.bar({total: q ? q.total : null, totalNote: q ? (q.bookingKind === 'vehicle' ? 'Vehicle booking' : 'Packers & movers') : 'Price appears once you add items', cur: step, next: step === 5 ? 'Review and book' : 'Next'})}
  </form>`;
}

function read(root, s, {pickers = true} = {}) {
  const d = draftOf(s), f = new FormData(root), g = n => f.get(n);
  if (g('fromFloor') != null) { d.fromFloor = Number(g('fromFloor')) || 0; d.fromLift = g('fromLift') !== 'no'; }
  if (g('toFloor') != null) { d.toFloor = Number(g('toFloor')) || 0; d.toLift = g('toLift') !== 'no'; }
  if (g('distanceKm') != null) d.distanceKm = g('distanceKm') ? Number(g('distanceKm')) : '';
  if (g('vehicle')) d.vehicle = g('vehicle'); if (g('help')) d.help = g('help');
  if (root.querySelector('[name="x-stop"]')) d.extras = {packing: f.has('x-packing'), dismantle: f.has('x-dismantle'), ac: f.has('x-ac'), stop: f.has('x-stop'), returnTrip: f.has('x-return'), declaredValue: Number(g('x-value')) || 0};
  if (root.querySelector('[name="date"]')) { d.date = WIZ.readDate(f, d.date); d.slot = g('slot') || ''; }
  if (pickers) for (const k of ['move-from', 'move-to']) if (root.querySelector(`[data-loc-picker="${k}"]`)) LOC.readPicker(root, s, k);
  return d;
}
// Checks only the fields of one step.
export function stepError(s, step) {
  const d = draftOf(s), l = load(d.items);
  if (step === 1) { const from = LOC.finalLocation(s, 'move-from'), to = LOC.finalLocation(s, 'move-to'); if (from.error) return `Pickup: ${from.error}`; if (to.error) return `Drop: ${to.error}`; if (from.line === to.line && from.pincode === to.pincode) return 'Pickup and drop cannot be the same.'; return ''; }
  if (step === 2) return d.what ? (l.count ? '' : 'Add at least one item.') : 'Choose what you are moving.';
  if (step === 3) { const v = vehicleById(pickedVehicle(d, l)); return v && fits(v, l) ? '' : `Choose ${recommended(l).label} or bigger.`; }
  if (step === 4) return helpError(d.help || suggestHelp(l, d.what), l);
  if (step === 5) return slotError(d.date, d.slot);
  return '';
}
// Builds the booking draft used by the existing review + pay + mover-branch flow.
export function toBookingDraft(s) {
  const d = draftOf(s), l = load(d.items), from = LOC.finalLocation(s, 'move-from'), to = LOC.finalLocation(s, 'move-to');
  if (!l.count) return {error: 'Add what you are moving.'};
  if (from.error) return {error: `Pickup: ${from.error}`}; if (to.error) return {error: `Drop: ${to.error}`};
  const km = Number(d.distanceKm) || LOC.distanceKm(from, to) || 10;
  const vehicle = vehicleById(d.vehicle) && fits(vehicleById(d.vehicle), l) ? d.vehicle : d.vehicle || recommended(l).id;
  const v = {...d, vehicle, help: d.help || suggestHelp(l, d.what), distanceKm: km, from, to};
  const e = validate(s, v); if (e) return {error: e};
  const q = quote(v), items = Object.entries(d.items).filter(([, n]) => n > 0).map(([k, n]) => `${n} × ${ITEMS[k][0]}`);
  return {draft: {service: 'moving', moveQuote: q, title: `${WHAT[d.what]?.label || 'Items'} · ${q.vehicle} · ${from.village || from.city || from.line} → ${to.village || to.city || to.line}`,
    from: LOC.oneLine(from), to: LOC.oneLine(to), fromLoc: from, toLoc: to, date: v.date, slot: v.slot, size: WHAT[d.what]?.label || 'Items', pkg: v.extras?.packing ? 'standard' : 'basic', inventory: items.join('\n'), distanceKm: km,
    floors: Number(d.fromFloor) || 0, lift: d.fromLift ? 'yes' : 'no', dropFloors: Number(d.toFloor) || 0, dropLift: d.toLift ? 'yes' : 'no', what: d.what, help: v.help, vehicleId: vehicle, extras: v.extras || {}, declaredValue: v.extras?.declaredValue || 0}};
}
export function bind(root, api) {
  const form = root.querySelector('#move-book-form'); if (!form) return;
  const S = () => api.getState(), redraw = () => { api.save(); api.render(); };
  const show = m => { const el = form.querySelector('#move-book-error'); el.textContent = m; el.hidden = !m; if (m) el.scrollIntoView?.({block: 'center'}); };
  form.querySelectorAll('[data-mv-what]').forEach(r => r.onchange = () => { const s = S(); read(form, s); const d = draftOf(s); d.what = r.value; d.items = {...WHAT[r.value].items}; d.vehicle = ''; d.help = ''; d.showAll = false; d.editItems = r.value === 'few'; d.extras = {...d.extras, packing: WHAT[r.value].kind === 'packers'}; redraw(); });
  form.querySelectorAll('[data-mv-qty]').forEach(b => b.onclick = () => { const s = S(); read(form, s); const d = draftOf(s), k = b.dataset.mvQty; d.items[k] = Math.max(0, Math.min(99, (d.items[k] || 0) + Number(b.dataset.d))); d.editItems = true; if (d.vehicle && !fits(vehicleById(d.vehicle), load(d.items))) d.vehicle = ''; if (d.help === 'driver' && load(d.items).heavy) d.help = ''; redraw(); });
  form.querySelector('[data-mv-all]')?.addEventListener('click', () => { const s = S(); read(form, s); draftOf(s).showAll = true; redraw(); });
  form.querySelectorAll('[data-mv-items]').forEach(b => b.onclick = () => { const s = S(); read(form, s); draftOf(s).editItems = b.dataset.mvItems === 'open'; redraw(); });
  form.querySelector('[data-mv-editkm]')?.addEventListener('click', () => { const s = S(); read(form, s); draftOf(s).editKm = true; redraw(); });
  form.querySelector('[data-mv-extras]')?.addEventListener('toggle', e => { draftOf(S()).extrasOpen = e.target.open; });
  form.querySelectorAll('[data-mv-pick], [data-wiz-field]').forEach(x => x.addEventListener('change', () => { read(form, S()); redraw(); }));
  LOC.bind(form, api, {onChange: () => { read(form, S(), {pickers: false}); redraw(); }});
  form.querySelectorAll('[data-wiz-go]').forEach(b => b.onclick = () => { const s = S(); read(form, s); draftOf(s).step = Number(b.dataset.wizGo); redraw(); });
  form.querySelector('[data-wiz="back"]')?.addEventListener('click', () => { const s = S(); read(form, s); const d = draftOf(s); d.step = Math.max(1, (d.step || 1) - 1); redraw(); });
  form.onsubmit = e => {
    e.preventDefault(); const s = S(); read(form, s); const d = draftOf(s), step = d.step || 1;
    const err = stepError(s, step); if (err) return show(err);
    if (step < 5) { d.step = step + 1; if (d.step === 3 && !d.vehicle) d.vehicle = recommended(load(d.items)).id; if (d.step === 4 && !d.help) d.help = suggestHelp(load(d.items), d.what); if (d.step === 5 && !d.date) d.date = WIZ.defaultDate(); return redraw(); }
    const r = toBookingDraft(s); if (r.error) return show(r.error);
    s.bookingDraft = r.draft; api.save(); api.navigate('bookingReview');
  };
}
