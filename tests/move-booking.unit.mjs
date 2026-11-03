// Moving, Lalamove / Porter style: vehicle fits and recommendations, helper prices (stairs), driver help
// limits, extras, booking type (vehicle vs packers vs survey), the 8 scenarios with prices, validation,
// and the booking draft handed to review / pay / mover branch.
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as MB from '../js/move-booking.js';
import * as LOC from '../js/location.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}, currentWorkspace: 'personal'});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const Q = o => MB.quote({extras: {}, fromFloor: 0, fromLift: true, toFloor: 0, toLift: true, ...o});

// fits and recommendations by home size
{ const rec = w => MB.recommended(MB.load(MB.WHAT[w].items)).id;
  assert.equal(rec('1rk'), 'ace'); assert.equal(rec('1bhk'), 'pickup'); assert.equal(rec('2bhk'), '14ft'); assert.equal(rec('3bhk'), '19ft'); assert.equal(rec('office'), '19ft');
  assert.equal(MB.fits(MB.vehicleById('ace'), MB.load(MB.WHAT['2bhk'].items)), false, '2 BHK does not fit a Tata Ace');
  assert.equal(MB.vehicleFare(MB.vehicleById('3w'), 6), 338); assert.equal(MB.vehicleFare(MB.vehicleById('bike'), 10), 150); }

// helpers: price, stairs, driver limit, suggestion
{ assert.equal(MB.helperCost('self'), 0); assert.equal(MB.helperCost('driver'), 200); assert.equal(MB.helperCost('h2'), 800); assert.equal(MB.helperCost('dh1'), 600);
  assert.equal(MB.helperCost('h2', {fromFloor: 3, fromLift: false}), 800 + 2 * 3 * 100); assert.equal(MB.helperCost('h2', {fromFloor: 3, fromLift: true}), 800);
  const heavy = MB.load({fridge: 1}); assert.match(MB.helpError('driver', heavy), /up to 25 kg/); assert.equal(MB.helpError('driver', MB.load({box: 5})), '');
  assert.equal(MB.suggestHelp(MB.load({box: 5}), 'few'), 'driver'); assert.equal(MB.suggestHelp(heavy, 'few'), 'dh1'); assert.equal(MB.suggestHelp(MB.load(MB.WHAT['2bhk'].items), '2bhk'), 'h3'); }

// the scenarios
{ // 1. Student: bags + mattress, 6 km, loads himself → 3-wheeler ₹338, vehicle booking, no GST
  const a = Q({what: 'few', items: {bag: 3, mattress: 1}, vehicle: '3w', help: 'self', distanceKm: 6}); assert.equal(a.total, 338); assert.equal(a.bookingKind, 'vehicle'); assert.equal(a.gst, 0);
  // 2. Shop: 40 boxes to a godown, 10 km, extra stop → Tata Ace + driver helps + stop = ₹874
  const b = Q({what: 'few', items: {box: 40}, vehicle: 'ace', help: 'driver', distanceKm: 10, extras: {stop: true}}); assert.equal(b.total, 574 + 200 + 100);
  // 3. Fridge from a friend, 10 km, 2nd floor no lift at both ends, 2 helpers → 426 + 800 + 2×4×100 = ₹2,026
  const c = Q({what: 'few', items: {fridge: 1}, vehicle: '3w', help: 'h2', distanceKm: 10, fromFloor: 2, fromLift: false, toFloor: 2, toLift: false}); assert.equal(c.total, 426 + 800 + 800);
  // 4. Bachelor 1 RK, 12 km, lift → Tata Ace + driver + 1 helper = 630 + 600 = ₹1,230
  const d = Q({what: '1rk', items: MB.WHAT['1rk'].items, vehicle: 'ace', help: 'dh1', distanceKm: 12}); assert.equal(d.total, 1230); assert.equal(d.bookingKind, 'vehicle');
  // 5. 1 BHK, 15 km, 3rd floor no lift at pickup, no packing → Pickup 8 ft + 2 helpers = 866 + 800 + 600 = ₹2,266
  const e = Q({what: '1bhk', items: MB.WHAT['1bhk'].items, vehicle: 'pickup', help: 'h2', distanceKm: 15, fromFloor: 3, fromLift: false}); assert.equal(e.total, 2266); assert.equal(e.bookingKind, 'vehicle');
  // 6. 2 BHK with packing, 20 km, lift → 14 ft + 3 helpers + packing, packers & movers with 18% GST
  const f = Q({what: '2bhk', items: MB.WHAT['2bhk'].items, vehicle: '14ft', help: 'h3', distanceKm: 20, extras: {packing: true}});
  assert.equal(f.bookingKind, 'packers'); assert.equal(f.partnerTotal, 2520 + 1200 + (40 * 45 + 16 * 120)); assert.equal(f.gst, Math.round(f.partnerTotal * 0.18)); assert.equal(f.survey, false);
  // 7. Wrong pick: 2 BHK in a Tata Ace → blocked
  const s = fresh(); assert.match(MB.validate(s, {items: MB.WHAT['2bhk'].items, vehicle: 'ace', help: 'h3', from: {line: 'a', pincode: '1'}, to: {line: 'b', pincode: '2'}, date: day(1), slot: '10'}), /won't fit .* 14 ft truck or bigger/);
  // 8. 3 BHK to another city (350 km) → survey first; return trip and insurance
  const h = Q({what: '3bhk', items: MB.WHAT['3bhk'].items, vehicle: '19ft', help: 'h4', distanceKm: 350, extras: {returnTrip: true, declaredValue: 300000, ac: true}});
  assert.equal(h.survey, true); assert.equal(h.bookingKind, 'packers'); assert.ok(h.partnerLines.some(([l]) => /AC uninstall & install × 2/.test(l))); assert.equal(h.insurance, 3000);
  assert.ok(h.partnerLines.some(([l, v]) => /Return trip/.test(l) && v === Math.round(MB.vehicleFare(MB.vehicleById('19ft'), 350) * 0.7))); }

// validation: driver help with heavy items, no items, same address, past date
{ const s = fresh(), base = {items: {fridge: 1}, vehicle: '3w', help: 'h2', from: {line: 'A', pincode: '800001'}, to: {line: 'B', pincode: '800020'}, date: day(1), slot: '10'};
  assert.equal(MB.validate(s, base), ''); assert.match(MB.validate(s, {...base, help: 'driver'}), /25 kg/); assert.match(MB.validate(s, {...base, items: {}}), /what you are moving/);
  assert.match(MB.validate(s, {...base, to: base.from}), /cannot be the same/); assert.match(MB.validate(s, {...base, date: day(-1)}), /passed/); }

// booking draft: Patna pickup (GPS) → Kankarbagh drop (search); distance from the two pins; carried into review
{ const s = fresh(), sp = LOC.DEMO_SPOTS.patna, k = LOC.search('Kankarbagh Patna');
  Object.assign(LOC.draftOf(s, 'move-from'), {source: 'gps', lat: sp.at[0], lng: sp.at[1], accuracy: 12, line: 'Flat 3B, Ganga Apartments', pincode: '800001'});
  Object.assign(LOC.draftOf(s, 'move-to'), {source: 'search', lat: k.at[0], lng: k.at[1], line: 'House 22, Road 4', pincode: '800020'});
  Object.assign(MB.draftOf(s), {what: 'few', items: {fridge: 1, washer: 1}, vehicle: '', help: '', date: day(1), slot: '10', fromFloor: 2, fromLift: false});
  const r = MB.toBookingDraft(s); assert.ok(!r.error, r.error);
  assert.equal(r.draft.vehicleId, '3w'); assert.equal(r.draft.help, 'dh1'); assert.ok(r.draft.distanceKm >= 3 && r.draft.distanceKm <= 8, `distance ${r.draft.distanceKm}`);
  assert.equal(r.draft.moveQuote.bookingKind, 'vehicle'); assert.match(r.draft.title, /A few items · 3-wheeler/); assert.match(r.draft.inventory, /1 × Fridge/); assert.equal(r.draft.fromLoc.precision, 'exact');
  // screen renders vehicle cards with prices and won't-fit
  MB.draftOf(s).step = 3; const html = MB.screen(s); assert.match(html, /Step 3 of 5/); assert.match(html, /Recommended/); assert.match(html, /Too small for your items[\s\S]*2-wheeler[\s\S]*Won't fit/);
  assert.match(html, /✓ Where\?/); MB.draftOf(s).step = 4; assert.match(MB.screen(s), /Driver \+ 1 helper/);
  // each step checks only its own fields
  for (let st = 1; st <= 5; st++) assert.equal(MB.stepError(s, st), '', `step ${st}`);
  const s2 = fresh(); assert.match(MB.stepError(s2, 1), /Pickup/); assert.match(MB.stepError(s2, 2), /what you are moving/); MB.draftOf(s2).what = 'few'; assert.match(MB.stepError(s2, 2), /at least one item/);
  Object.assign(MB.draftOf(s2), {items: {fridge: 1}, help: 'driver'}); assert.match(MB.stepError(s2, 4), /25 kg/); assert.match(MB.stepError(s2, 5), /date|slot/i); }

console.log(JSON.stringify({status: 'PASS', suite: 'Moving: vehicle fit and prices, helpers and stairs, driver limit, extras, booking type, 8 scenarios, validation, booking draft'}));
