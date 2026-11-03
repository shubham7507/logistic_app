// Hire a personal driver: steps and validation, price with protection, best-matched driver (car skill, area,
// favourite first, cancel → backup), selfie before accepting, start code + car photos + odometer at the car,
// actual-time bill (extra hours + night charge for approval), tolls, SOS / share / long-stop, monthly driver
// (check-in, leave paid/unpaid, extra hours, salary through MoveAI, replacement day, notice).
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as PD from '../js/personal-driver.js';
import * as DD from '../js/driver-dispatch.js';
import * as LOC from '../js/location.js';
import * as Bill from '../js/customer-billing.js';
import * as Pay from '../js/pay.js';
import {quoteDriver} from '../js/ops-rules.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}, currentWorkspace: 'personal'});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const selfie = s => { (s.workerStatus ||= {}).personalDriver = {...(s.workerStatus.personalDriver || {}), selfieDate: new Date().toISOString().slice(0, 10)}; };
// Mimics booking-publish: the request built from the draft, then afterCreate.
function book(s, o = {}) {
  const d = PD.draftOf(s); Object.assign(d, {hireType: 'hourly', duration: 4, addressId: 'AD-HOME', date: day(1), startTime: '10:00', car: {make: 'Hyundai Creta', body: 'suv', transmission: 'automatic', plate: 'UP16 AB 1234'}, protection: true}, o);
  const t = PD.toBookingDraft(s); assert.ok(t.draft, t.error); const dr = t.draft;
  const r = {id: `SR-T${Math.random().toString(36).slice(2, 6)}`, customer: 'personal', customerName: 'Shubham Kumar', type: 'driver', title: dr.title, hireType: dr.hireType, duration: dr.duration, carType: dr.carType, location: dr.location, date: dr.date, quote: dr.driverQuote, status: 'searching', provider: null, providerName: null, paid: false, rating: null, extras: [], conversationId: null, payMigrated: true};
  s.serviceRequests.unshift(r); return PD.afterCreate(s, r, dr);
}

// 1. Steps: validation per step and the price
{ const s = fresh(), d = PD.draftOf(s);
  d.hireType = 'hourly'; d.duration = 2; assert.match(PD.stepError(s, 1), /at least 4 hours/); d.duration = 4; assert.equal(PD.stepError(s, 1), '');
  d.hireType = 'oneway'; assert.match(PD.stepError(s, 1), /Drop/); d.hireType = 'hourly';
  assert.equal(PD.stepError(s, 2), '', 'saved home selected');
  d.date = day(-1); d.startTime = '10:00'; assert.match(PD.stepError(s, 3), /passed/); d.date = day(1); assert.equal(PD.stepError(s, 3), '');
  d.car = {make: '', body: 'suv', transmission: 'automatic'}; assert.match(PD.stepError(s, 4), /car/); d.car.make = 'Creta'; d.car.plate = '1234'; assert.match(PD.stepError(s, 4), /Number plate/); d.car.plate = 'UP16 AB 1234'; assert.equal(PD.stepError(s, 4), '');
  const q = PD.quoteOf(s); const base = quoteDriver({hireType: 'hourly', duration: 4, carType: 'SUV automatic'});
  assert.equal(q.total, base.total + PD.PROTECTION.fee, 'protection added'); assert.equal(q.driverEarning, 720 + 72, 'driver gets 4 h + 10% SUV premium'); }

// 2. Best-matched driver: only drivers who can drive the car; Anil (closest, police verified) beats Vikas
{ const s = fresh(); selfie(s); const r = book(s);
  assert.equal(r.status, 'searching'); assert.deepEqual([...r.dispatch.current.ids].sort(), ['DP-ANIL', 'DP-VIKAS'], 'Rajesh drives manual only and is 5 km away');
  assert.equal(DD.ineligible(s, s.driverPros.find(p => p.id === 'DP-RAJESH'), r), 'cannot drive automatic');
  assert.ok(PD.offersFor(s).some(x => x.id === r.id));
  assert.equal(PD.acceptJob(s, 'personalDriver', r.id), ''); assert.equal(r.provider, 'personalDriver'); assert.equal(r.driverId, 'DP-ANIL'); assert.deepEqual(r.dispatch.backups, ['DP-VIKAS']);
  assert.ok(s.notifications.some(n => n.to === 'personal' && /Anil Kumar.*police verified/.test(n.text))); }

// 3. Selfie before accepting; nobody answers → Vikas
{ const s = fresh(); const r = book(s);
  assert.match(PD.acceptJob(s, 'personalDriver', r.id), /selfie/); assert.equal(DD.timePasses(s, r), ''); assert.equal(r.driverId, 'DP-VIKAS'); assert.equal(r.provider, 'drv:DP-VIKAS'); }

// 4. Luxury car → only Vikas; manual hatchback far away → wider area; favourite first; cancel → backup
{ const s = fresh(); selfie(s); const r = book(s, {car: {make: 'Mercedes C-Class', body: 'luxury', transmission: 'automatic'}});
  assert.equal(r.driverId, 'DP-VIKAS', 'only Vikas drives luxury cars');
  const s2 = fresh(); selfie(s2); const fav = book(s2, {favouriteDriverId: 'DP-ANIL'}); assert.deepEqual(fav.dispatch.current.ids, ['DP-ANIL']); assert.equal(fav.dispatch.current.windowMs, DD.FAVOURITE_MS);
  assert.equal(PD.acceptJob(s2, 'personalDriver', fav.id), ''); assert.equal(fav.dispatch.winner.parts.favourite, 5);
  const s3 = fresh(); selfie(s3); const c = book(s3); PD.acceptJob(s3, 'personalDriver', c.id);
  assert.match(PD.cancelByDriver(s3, 'personalDriver', c.id, ''), /why/); assert.equal(PD.cancelByDriver(s3, 'personalDriver', c.id, 'Unwell'), '');
  assert.equal(c.driverId, 'DP-VIKAS'); assert.equal(DD.statsOf(s3.driverPros[0]).cancels, 1); assert.ok(s3.notifications.some(n => /had to cancel. Vikas Sharma will come instead/.test(n.text))); }

// 5. The trip: on the way, arrive, start code + photos + odometer, 5 h on a 4 h booking → 1 extra hour for approval
{ const s = fresh(); selfie(s); const r = book(s); PD.acceptJob(s, 'personalDriver', r.id);
  assert.match(PD.startTrip(s, 'personalDriver', r.id, {otp: r.startOtp, photos: ['f.jpg'], odometer: 100}), /On the way/);
  assert.equal(PD.onTheWay(s, 'personalDriver', r.id), ''); assert.ok(s.notifications.some(n => n.to === 'personal' && n.text.includes(r.startOtp)));
  assert.match(PD.startTrip(s, 'personalDriver', r.id, {otp: r.startOtp, photos: ['f.jpg'], odometer: 100}), /live location/);
  for (let i = 0; i < 20 && !r.arrivedAt; i++) PD.demoDrive(s, 'personalDriver', r.id, 1); assert.ok(r.arrivedAt);
  assert.match(PD.startTrip(s, 'personalDriver', r.id, {otp: r.startOtp, photos: [], odometer: 100}), /photos/);
  assert.match(PD.startTrip(s, 'personalDriver', r.id, {otp: r.startOtp, photos: ['f.jpg'], odometer: ''}), /odometer/);
  assert.match(PD.startTrip(s, 'personalDriver', r.id, {otp: '0000', photos: ['f.jpg'], odometer: 100}), /wrong/);
  assert.equal(PD.startTrip(s, 'personalDriver', r.id, {otp: r.startOtp, photos: ['front.jpg', 'back.jpg'], odometer: 23450}), ''); assert.equal(r.status, 'in_progress');
  assert.match(PD.addToll(s, 'personalDriver', r.id, {amount: 60, proof: ''}), /photo/); assert.equal(PD.addToll(s, 'personalDriver', r.id, {amount: 60, proof: 'toll.jpg'}), '');
  assert.equal(PD.longStop(s, r.id), ''); assert.equal(r.rideCheck.status, 'open'); assert.equal(PD.answerCheck(s, r.id, 'customer', true), ''); assert.equal(r.rideCheck.status, 'ok');
  assert.equal(PD.demoHours(s, r.id, 5), '');
  assert.match(PD.endTrip(s, 'personalDriver', r.id, {photos: ['a.jpg'], odometer: 23000}), /at least 23450/);
  assert.equal(PD.endTrip(s, 'personalDriver', r.id, {photos: ['after.jpg'], odometer: 23512}), ''); assert.equal(r.status, 'provider_done'); assert.equal(r.kmDriven, 62);
  const extraH = r.extras.find(x => x.kind === 'extra_hour'); assert.equal(extraH.qty, 1); assert.equal(extraH.status, 'proposed');
  assert.ok(PD.shareTrip(s, r.id).startsWith('https://moveai.in/t/'));
  assert.equal(PD.sos(s, 'customer', r.id), ''); assert.ok(s.cases.some(c => /SOS from Shubham Kumar \(customer\)/.test(c.subject)));
  for (const x of r.extras.filter(e => e.status === 'proposed')) Bill.decideExtra(s, r, x.id, 'approve'); // the night charge also appears when the test runs late at night
  r.status = 'completed'; const res = Pay.payBalance(s, r, {method: 'upi', vpa: 'a@okaxis'}); assert.ok(!res.error, res.error); r.status = 'paid'; r.paid = true; Pay.release(s, r, 'Customer');
  const credit = s.ledger.find(x => x.type === 'wallet_credit' && x.serviceId === r.id); assert.equal(credit.payee, 'personalDriver'); assert.equal(credit.amount, 792 + r.extras.reduce((t, e) => t + e.amount, 0), 'driver gets all charges + extra hour + toll (+ night)'); assert.ok(r.extras.some(e => e.kind === 'extra_hour' && e.amount === 150)); }

// 6. Monthly driver: check-in, leave (2 paid, then unpaid), extra hours, salary through MoveAI, replacement, notice
{ const s = fresh(); selfie(s);
  const r = {id: 'SR-M1', customer: 'personal', customerName: 'Shubham Kumar', type: 'driver', title: 'Monthly', hireType: 'monthly', duration: 1, carType: 'SUV automatic', car: {make: 'Creta', body: 'suv', transmission: 'automatic'}, location: 'Sector 62, Noida', pickup: s.savedAddresses[0], startTime: '09:00', date: day(0), quote: quoteDriver({hireType: 'monthly', carType: 'SUV automatic'}), status: 'accepted', provider: 'personalDriver', providerName: 'Anil Kumar', driverId: 'DP-ANIL', extras: [], timeline: []};
  s.serviceRequests.unshift(r);
  assert.equal(PD.checkIn(s, 'personalDriver', r.id), ''); assert.match(PD.checkIn(s, 'personalDriver', r.id), /Already/);
  for (const n of [2, 3, 4]) { assert.equal(PD.requestLeave(s, 'personalDriver', r.id, day(n), 'family'), ''); assert.equal(PD.decideLeave(s, r.id, day(n), true), ''); }
  const ym = day(0).slice(0, 7), sameMonth = [2, 3, 4].filter(n => day(n).slice(0, 7) === ym).length;
  assert.equal(PD.logExtraHours(s, 'personalDriver', r.id, 2), ''); assert.equal(PD.approveExtraHours(s, r.id, day(0)), '');
  const sal = PD.salaryFor(r, ym), rate = r.quote.partnerTotal;
  assert.equal(sal.total, rate - Math.max(0, sameMonth - 2) * Math.round(rate / 26) + 2 * 120);
  assert.equal(PD.paySalary(s, r.id, ym), ''); assert.match(PD.paySalary(s, r.id, ym), /already paid/);
  assert.ok(s.ledger.some(x => x.type === 'wallet_credit' && x.payee === 'personalDriver' && x.amount === sal.total));
  const rep = PD.replacement(s, r.id, day(1)); assert.ok(rep.request); assert.equal(rep.request.hireType, 'daily'); assert.ok(rep.request.dispatch.offered.includes('DP-ANIL'), 'the monthly driver is not asked');
  assert.equal(PD.giveNotice(s, r.id, 'customer'), ''); assert.match(PD.giveNotice(s, r.id, 'driver'), /already/); assert.equal(r.monthly.notice.endDate, day(7)); }
console.log(JSON.stringify({status: 'PASS', suite: 'Personal driver: steps, price + protection, best-matched driver, selfie, favourite, cancel, start code + photos + odometer, actual-time bill, tolls, safety, payout, monthly tools'}));
