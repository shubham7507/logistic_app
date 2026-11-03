// Truck-driver safeguards (document expiry, driving hours, waiting time, delivery code) and drivers with
// their own vehicle (sign-up with vehicle papers, matching small vehicle bookings, pickup/drop codes, payout).
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as TX from '../js/trip-extras.js';
import * as OD from '../js/owner-driver.js';
import * as DD from '../js/driver-dispatch.js';
import * as WO from '../js/worker-onboarding.js';
import * as LOC from '../js/location.js';
import * as Pay from '../js/pay.js';
import * as MB from '../js/move-booking.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}, currentWorkspace: 'personal'});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// 1. Document expiry: reminder at 30 days, blocked once expired, renew
{ const s = fresh(), w = TX.workerOf(s, 'commercialDriver');
  const st = TX.docStatus(w.docs); assert.equal(st[0].key, 'police'); assert.equal(st[0].state, 'soon'); assert.equal(TX.expiryBlock(s, 'commercialDriver'), '');
  assert.match(TX.docsPanel(s, 'commercialDriver'), /Police verification expires in \d+ days/);
  w.docs.police = day(-1); assert.match(TX.expiryBlock(s, 'commercialDriver'), /police verification expired/);
  assert.match(TX.renew(s, 'commercialDriver', 'police', ''), /Upload/); assert.equal(TX.renew(s, 'commercialDriver', 'police', 'pcc-2026.pdf'), '');
  assert.equal(TX.expiryBlock(s, 'commercialDriver'), ''); assert.ok(s.notifications.some(n => n.to === 'admin' && /renewed police/.test(n.text)));
  const p = s.driverPros.find(x => x.id === 'DP-ANIL'); p.docs.licence = day(-2); assert.equal(DD.ineligible(s, p, {date: day(1), startTime: '10:00', car: {body: 'sedan', transmission: 'manual'}, hireType: 'hourly', pickup: s.savedAddresses[0]}), 'documents expired'); }

// 2. Driving hours, waiting time and the delivery code on a trip
{ const s = fresh(), t = s.trips.find(x => x.id === 'TRP-501');
  for (const k of ['pickup_reached']) { const m = t.milestones.find(x => x.key === k); m.status = 'done'; TX.stampMilestone(t, k); }
  assert.equal(TX.waiting(t).pickup.charge, 0); assert.equal(TX.demoWait(t, 'pickup', 3), '');
  const loaded = t.milestones.find(x => x.key === 'loaded'); loaded.status = 'done'; TX.stampMilestone(t, 'loaded');
  const w = TX.waiting(t); assert.equal(w.pickup.hours, 3); assert.equal(w.pickup.charge, TX.DETENTION_RATE, '1 hour past the 2 free hours');
  const tr = t.milestones.find(x => x.key === 'in_transit'); tr.status = 'done'; TX.stampMilestone(t, 'in_transit'); TX.startDriving(t);
  assert.equal(TX.checkDriving(s, t), false); TX.demoDriving(t, 4.2); assert.equal(TX.checkDriving(s, t), true); assert.equal(TX.checkDriving(s, t), false, 'told once');
  assert.ok(s.notifications.some(n => /without a break/.test(n.text)));
  assert.equal(TX.breakStep(s, t, true), ''); t.drive.onBreak -= 31 * 60000; assert.equal(TX.breakStep(s, t, false), ''); assert.ok(TX.drivingHours(t) < 0.1, 'a 30-minute break resets the clock');
  assert.equal(TX.reachedDrop(s, t), ''); TX.demoWait(t, 'drop', 2.5); assert.equal(TX.waiting(t).drop.running, true);
  const code = TX.ensureCode(t); assert.match(TX.checkCode(t, '0000'), /delivery code/); assert.equal(TX.checkCode(t, code), '');
  assert.match(TX.tripPanel(s, t, 'goods'), new RegExp(code)); assert.doesNotMatch(TX.tripPanel(s, t, 'commercialDriver'), new RegExp(`<b>${code}</b>`)); }

// 3. Driver with own vehicle: vehicle papers check, activation
{ assert.match(WO.vehicleLookup({vehicleId: 'ace', plate: 'X1'}).reason, /number plate/);
  assert.match(WO.vehicleLookup({vehicleId: 'ace', plate: 'BR01 GA 4521', insurance: day(-1), fitness: day(100), puc: day(100), rcPhoto: 'rc.jpg'}).reason, /Insurance/);
  assert.equal(WO.vehicleLookup({vehicleId: 'ace', plate: 'BR01 GA 0000', insurance: day(10), fitness: day(10), puc: day(10), rcPhoto: 'rc.jpg'}).fallback, true);
  const ok = WO.vehicleLookup({vehicleId: '3w', plate: 'BR01 PC 1234', insurance: day(200), fitness: day(200), puc: day(90), rcPhoto: 'rc.jpg'}); assert.equal(ok.ok, true);
  assert.deepEqual(WO.levelChecks({workerType: 'vehicleDriver'}).l2, ['licence', 'selfie', 'vehicle']);
  const s = fresh(), c = {id: 'CAND-V1', workerType: 'vehicleDriver', name: 'Ramu Yadav', mobile: '9000000002', level: 2, locations: ['Patna'], checks: {vehicle: {status: 'verified', ...ok.data}}};
  assert.equal(OD.activate(s, c), ''); const me = OD.meOf(s); assert.equal(me.name, 'Ramu Yadav'); assert.equal(me.vehicleId, '3w'); assert.ok(s.workspaces.includes('ownerDriver')); assert.equal(s.lastWorkspace, 'ownerDriver'); }

// 4. Small vehicle booking → owner-drivers; bigger or with helpers → mover branch
{ const patna = LOC.makeLocation({source: 'gps', lat: LOC.DEMO_SPOTS.patna.at[0], lng: LOC.DEMO_SPOTS.patna.at[1], accuracy: 12, line: 'Flat 3B', pincode: '800001'});
  const drop = LOC.makeLocation({source: 'gps', lat: 25.5941, lng: 85.1376, accuracy: 15, line: 'House 22, Kankarbagh', pincode: '800020'});
  const d = {service: 'moving', moveQuote: {bookingKind: 'vehicle', total: 900}, vehicleId: 'ace', help: 'driver', title: 'Few items · Tata Ace', fromLoc: patna, toLoc: drop, from: 'Boring Road', to: 'Kankarbagh', distanceKm: 4, date: day(1), slot: '10'};
  assert.equal(OD.forOwner(d), true); assert.equal(OD.forOwner({...d, help: 'h2'}), false); assert.equal(OD.forOwner({...d, vehicleId: '407'}), false);
  const s = fresh(); const r = OD.createJob(s, {id: 'SR-OD1', customer: 'personal', date: d.date, quote: {total: 900}, paid: false, extras: []}, d);
  assert.deepEqual(r.dispatch.current.ids, ['OD-MANOJ'], 'only the Tata Ace driver'); assert.equal(DD.ineligible(s, s.ownerDrivers.find(p => p.id === 'OD-RAJU'), r), 'has a 3w, job needs ace');
  assert.ok(OD.offersFor(s).some(x => x.id === r.id)); assert.equal(OD.acceptJob(s, 'ownerDriver', r.id), ''); assert.equal(r.provider, 'ownerDriver');
  assert.equal(OD.onTheWay(s, 'ownerDriver', r.id), ''); assert.match(OD.pickedUp(s, 'ownerDriver', r.id, {otp: r.startOtp, photo: 'x.jpg'}), /Reach the pickup/);
  for (let i = 0; i < 30 && !r.arrivedAt; i++) OD.demoDrive(s, 'ownerDriver', r.id); assert.ok(r.arrivedAt);
  assert.match(OD.pickedUp(s, 'ownerDriver', r.id, {otp: '0000', photo: 'x.jpg'}), /wrong/); assert.equal(OD.pickedUp(s, 'ownerDriver', r.id, {otp: r.startOtp, photo: 'loaded.jpg'}), ''); assert.equal(r.status, 'in_transit');
  for (let i = 0; i < 30 && !r.atDropAt; i++) OD.demoDrive(s, 'ownerDriver', r.id); assert.ok(r.atDropAt);
  assert.match(OD.delivered(s, 'ownerDriver', r.id, {otp: r.startOtp, photo: 'd.jpg'}), /drop code is wrong/);
  assert.equal(OD.delivered(s, 'ownerDriver', r.id, {otp: r.dropOtp, photo: 'delivered.jpg'}), ''); assert.equal(r.status, 'completed', 'balance due');
  r.status = 'completed'; const res = Pay.payBalance(s, r, {method: 'upi', vpa: 'a@okaxis'}); assert.ok(!res.error, res.error); r.status = 'paid'; r.paid = true; Pay.release(s, r, 'Customer');
  const credit = s.ledger.find(x => x.type === 'wallet_credit' && x.serviceId === r.id); assert.equal(credit.payee, 'ownerDriver'); assert.equal(credit.amount, 900 - 90, '10% MoveAI'); }
console.log(JSON.stringify({status: 'PASS', suite: 'Driver extras: document expiry + renew, driving hours + break, waiting/detention, delivery code, own-vehicle papers, activation, small-vehicle matching, pickup/drop codes, payout'}));
