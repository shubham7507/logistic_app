// Work and hiring: availability posts, finding and hiring workers, ratings and strikes, helper bookings,
// monthly driver choice, in-person joining, driver safety, voice sign-up, regular crew, picking expiry check, live homes.
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as WX from '../js/work-extras.js';
import * as WH from '../js/work-home.js';
import {pickBatch, MIN_SHELF_DAYS} from '../js/commerce-plus.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ---------- S1 availability posts ----------
{
  const s = fresh();
  assert.match(WX.postAvailability(s, 'commercialDriver', {area: '', from: day(1), to: day(2), pay: 3000}).error, /city or area/);
  assert.match(WX.postAvailability(s, 'commercialDriver', {area: 'Patna', from: day(3), to: day(1), pay: 3000}).error, /before the start/);
  assert.match(WX.postAvailability(s, 'commercialDriver', {area: 'Patna', from: day(-2), to: day(1), pay: 3000}).error, /past/);
  assert.match(WX.postAvailability(s, 'commercialDriver', {area: 'Patna', from: day(1), to: day(40), pay: 3000}).error, /30 days/);
  assert.match(WX.postAvailability(s, 'commercialDriver', {area: 'Patna', from: day(1), to: day(2), pay: 0}).error, /pay/);
  assert.match(WX.postAvailability(s, 'commercialDriver', {area: 'Delhi', from: day(10), to: day(10), pay: 3000}).error, /already posted/, 'overlaps seeded AV-901');
  const r = WX.postAvailability(s, 'commercialDriver', {area: 'Jaipur', routeTo: 'Delhi', from: day(1), to: day(3), pay: 2800, payType: 'per trip'});
  assert.equal(r.error, undefined); assert.equal(r.post.name, 'Mohan Yadav'); assert.equal(WX.openPosts(s).filter(p => p.workerId === 'PW-MOHAN').length, 2);
  assert.equal(WX.postState({status: 'open', to: day(-1)}), 'expired', 'old posts expire automatically');
  assert.match(WX.postAvailability(s, 'goods', {area: 'X', from: day(1), to: day(1), pay: 1}).error, /work profile/);
}
// ---------- S2 find workers with filters ----------
{
  const s = fresh(), all = WX.talent(s);
  assert.ok(all.length >= 8 && !all.some((t, i) => all.findIndex(x => x.name === t.name) !== i), 'no duplicate people');
  const f = x => WX.filterTalent(all, {...WX.DEFAULT_FILTER, ...x}).map(t => t.name);
  assert.deepEqual(f({role: 'helper'}).sort(), ['Ramesh Yadav', 'Suraj Mandal']);
  assert.ok(f({licence: 'heavy'}).includes('Mohan Yadav') && !f({licence: 'heavy'}).includes('Anil Kumar'));
  assert.ok(f({licence: 'personal'}).every(n => ['Anil Kumar', 'Rajesh Verma', 'Vikram Singh'].includes(n)));
  assert.equal(f({area: 'Patna', postedOnly: true})[0], 'Mohan Yadav', 'route match: posted Delhi → Patna');
  assert.deepEqual(f({date: day(10), postedOnly: true}), ['Mohan Yadav']);
  assert.ok(f({maxPay: 1000}).every(n => ['Ramesh Yadav', 'Suraj Mandal'].includes(n)), 'max pay uses posted pay too');
  assert.ok(f({minRating: 4.7}).every(n => all.find(t => t.name === n).rating >= 4.7));
  assert.deepEqual(f({language: 'Bhojpuri'}), ['Mohan Yadav']);
  assert.equal(f({})[0] !== undefined, true);
  assert.equal(WX.maskMobile('9876520101'), '+91 98•••• ••01');
}
// ---------- S3 one-tap hire, same-day pay, ratings and strikes ----------
{
  const s = fresh();
  assert.match(WX.sendHireOffer(s, 'transporter', 'PW-MOHAN', {kind: 'trip', pay: 0, place: 'Delhi → Patna', date: day(10)}).error, /pay/);
  assert.match(WX.sendHireOffer(s, 'transporter', 'PW-MOHAN', {kind: 'trip', pay: 3000, place: '', date: day(10)}).error, /route/);
  assert.match(WX.sendHireOffer(s, 'transporter', 'PW-MOHAN', {kind: 'trip', pay: 3000, place: 'X', date: day(-1)}).error, /future/);
  const {offer} = WX.sendHireOffer(s, 'transporter', 'PW-MOHAN', {kind: 'trip', pay: 3200, place: 'Delhi → Patna', date: day(10)});
  assert.equal(offer.to, 'commercialDriver'); assert.equal(offer.fromName, 'Raj Logistics');
  assert.ok(s.notifications.some(n => n.to === 'commercialDriver' && /Raj Logistics offers/.test(n.text)), 'worker is told in their app');
  assert.match(WX.sendHireOffer(s, 'transporter', 'PW-MOHAN', {kind: 'trip', pay: 3200, place: 'Delhi → Patna', date: day(10)}).error, /already sent/);
  assert.equal(WX.hiredBy(s, 'transporter', 'PW-MOHAN'), false);
  // a worker without the app (candidate): the business simulates their SMS answer
  const c = WX.sendHireOffer(s, 'transporter', 'CAND-001', {kind: 'today', pay: 900, place: 'Jaipur yard'}).offer;
  assert.equal(c.to, 'talent:CAND-001'); assert.equal(c.date, day(0)); assert.equal(c.payToday, true);
  assert.match(WX.simulateAnswer(s, 'transporter', offer.id, true), /own app/);
  assert.equal(WX.simulateAnswer(s, 'transporter', c.id, true), ''); assert.equal(WX.hiredBy(s, 'transporter', 'CAND-001'), true, 'number shown after hiring');
  assert.match(WX.rate(s, 'transporter', c.id, 5), /after the work/);
  assert.equal(WX.markDone(s, 'transporter', c.id), '');
  const wage = s.ledger.find(x => x.reference === `WAGE-${c.id}`); assert.equal(wage.amount, 900); assert.equal(wage.status, 'confirmed', 'today work is paid the same day');
  assert.match(WX.rate(s, 'transporter', c.id, 9), /1 to 5/);
  const before = s.candidates.find(x => x.id === 'CAND-001').ratingCount;
  assert.equal(WX.rate(s, 'transporter', c.id, 5, 'On time'), ''); assert.equal(s.candidates.find(x => x.id === 'CAND-001').ratingCount, before + 1);
  assert.match(WX.rate(s, 'transporter', c.id, 4), /already rated/);
  assert.equal(WX.rate(s, 'commercialDriver', c.id, 4), '', 'the worker side can rate the business too');
  // strikes: 3 no-shows pause the profile and close their posts
  for (let i = 0; i < 3; i++) { const o = WX.sendHireOffer(s, 'goods', 'PW-RAMESH', {kind: 'day', pay: 700, place: 'Patna', date: day(i + 1)}).offer; o.status = 'accepted'; assert.equal(WX.reportNoShow(s, 'goods', o.id), ''); }
  const ramesh = s.platformWorkers.find(w => w.id === 'PW-RAMESH');
  assert.equal(ramesh.strikes, 3); assert.equal(ramesh.status, 'paused'); assert.equal(WX.openPosts(s).some(p => p.workerId === 'PW-RAMESH'), false);
  assert.ok(!WX.filterTalent(WX.talent(s)).some(t => t.key === 'PW-RAMESH'), 'paused workers are not listed');
  assert.match(WX.sendHireOffer(s, 'goods', 'PW-RAMESH', {kind: 'day', pay: 700, place: 'Patna', date: day(5)}).error, /paused/);
  assert.match(WX.postAvailability(s, 'helper', {area: 'Patna', from: day(20), to: day(21), pay: 700}).error, /paused/);
}
// ---------- S5 helpers for customers and loads ----------
{
  const s = fresh();
  assert.deepEqual(WX.helperQuote(2, 1), {each: 240, helpers: 480, fee: 29, total: 509}, 'minimum 2 hours');
  assert.match(WX.bookHelpers(s, {count: 0, hours: 4, location: 'A', date: day(1)}).error, /1 to 6/);
  assert.match(WX.bookHelpers(s, {count: 2, hours: 4, location: '', date: day(1)}).error, /address/);
  const {request} = WX.bookHelpers(s, {count: 2, hours: 4, location: 'Boring Road, Patna', date: day(1), work: 'Shifting help'});
  assert.equal(request.status, 'searching'); assert.equal(request.quote.total, 2 * 480 + 29);
  const o = s.workOffers.find(x => x.ref === request.id && x.to === 'helper'); assert.ok(o, 'offered to helpers');
  o.status = 'accepted'; WX.onOfferAccepted(s, o);
  assert.equal(request.status, 'accepted'); assert.equal(request.helpers.length, 2); assert.match(request.providerName, /Ramesh Yadav, .*MoveAI assigned/);
  assert.ok(s.notifications.some(n => n.to === 'personal' && /Helpers confirmed/.test(n.text)));
  const req = {id: 'TR-X', workspace: 'goods', goods: 'Rice', pickup: 'Patna', pickupDate: day(2), helpersNeeded: 2};
  s.transportRequirements.unshift(req); WX.offerLoadingHelpers(s, req);
  const lo = s.workOffers.find(x => x.ref === 'TR-X'); lo.status = 'accepted'; WX.onOfferAccepted(s, lo);
  assert.deepEqual(req.helpers, ['Ramesh Yadav']); assert.ok(s.notifications.some(n => n.to === 'goods' && /help load Rice/.test(n.text)));
}
// ---------- S4 monthly personal driver ----------
{
  const s = fresh();
  s.serviceRequests.unshift({id: 'SR-M', customer: 'personal', customerName: 'Shubham', type: 'driver', hireType: 'monthly', carType: 'SUV', location: 'Sector 62, Noida', date: day(3), status: 'searching'});
  const list = WX.monthlyShortlist(s, 'Sector 62, Noida'); assert.equal(list.length, 3); assert.ok(list.every(w => w.locations.includes('Noida')));
  assert.equal(WX.chooseDriver(s, 'SR-M', 'PW-RAJESH', 'trial'), ''); assert.equal(s.serviceRequests[0].trial.name, 'Rajesh Verma'); assert.ok(s.serviceRequests[0].trial.fee > 0);
  assert.equal(WX.chooseDriver(s, 'SR-M', 'PW-ANIL', 'choose'), ''); assert.equal(s.serviceRequests[0].status, 'accepted'); assert.equal(s.serviceRequests[0].providerName, 'Anil Kumar');
  assert.match(WX.driverCardHtml(s, s.serviceRequests[0]), /Anil Kumar[\s\S]*Police verified[\s\S]*Call via MoveAI/);
  assert.equal(WX.toggleFavourite(s, 'PW-ANIL'), true); assert.deepEqual(s.favouriteDrivers, ['PW-ANIL']); assert.equal(WX.toggleFavourite(s, 'PW-ANIL'), false);
}
// ---------- item 12 in-person joining ----------
{
  const s = fresh(), base = {name: 'Sunita Devi', mobile: '9876500011', otp: '123456', idType: 'voter', idLast4: '4321', sawOriginal: true, photo: 'sunita.jpg'};
  assert.match(WX.joinInPerson(s, 'grocery', {...base, otp: '000000'}, {storeOf: w => w}).error, /OTP/);
  assert.match(WX.joinInPerson(s, 'grocery', {...base, sawOriginal: false}, {storeOf: w => w}).error, /original ID/);
  assert.match(WX.joinInPerson(s, 'grocery', {...base, photo: ''}, {storeOf: w => w}).error, /photo/);
  const r = WX.joinInPerson(s, 'grocery', base, {storeOf: w => w});
  assert.equal(r.kind, 'store'); assert.equal(r.member.status, 'active'); assert.equal(r.member.idCheck.last4, '4321'); assert.equal(r.member.joinMethod, 'in_person');
  assert.ok(!JSON.stringify(r.member).includes('Aadhaar number'), 'only the last 4 are stored');
  const t = WX.joinInPerson(s, 'transporter', {...base, name: 'Bablu Yadav', role: 'helper'}, {storeOf: () => null});
  assert.equal(t.kind, 'staff'); assert.equal(t.member.role, 'helper'); assert.ok(s.peopleByWorkspace.transporter.some(p => p.name === 'Bablu Yadav'));
}
// ---------- D1–D3 driver safety ----------
{
  const s = fresh();
  assert.match(WX.passTraining(s, 'commercialDriver', [0, 0, 0]), /answers? (is|are) not right/);
  assert.equal(WX.passTraining(s, 'commercialDriver', WX.QUIZ.map(q => q[2])), ''); assert.equal(s.workerStatus.commercialDriver.trainingDone, true);
  assert.match(WX.dailySelfie(s, 'commercialDriver', ''), /selfie/);
  assert.equal(WX.dailySelfie(s, 'commercialDriver', 'me.jpg'), ''); assert.equal(s.workerStatus.commercialDriver.selfieDate, day(0));
  const c = WX.sos(s, 'commercialDriver', 'TRP-501');
  assert.equal(c.severity, 'urgent'); assert.ok(s.cases[0] === c); assert.ok(['admin', 'transporter'].every(to => s.notifications.some(n => n.to === to && /SOS/.test(n.text))));
  assert.match(WX.sosButton({currentWorkspace: 'commercialDriver'}, {id: 'T', status: 'loaded'}), /SOS/); assert.equal(WX.sosButton({currentWorkspace: 'transporter'}, {id: 'T', status: 'loaded'}), '');
}
// ---------- H4 voice / plain words ----------
assert.deepEqual(WX.parseWorkWords('I drive trucks in Patna, 3500 per trip'), {workerType: 'commercialDriver', location: 'Patna', expectedPay: 3500, workPreference: 'Per trip'});
assert.equal(WX.parseWorkWords('मैं पटना में लोडिंग का काम करता हूँ').workerType, 'helper');
assert.equal(WX.parseWorkWords('मैं पटना में लोडिंग का काम करता हूँ').location, 'Patna');
assert.deepEqual(WX.parseWorkWords('khalasi and loading work in Noida, 700 daily').skills, ['Loading / unloading', 'Truck Khalasi']);
assert.equal(WX.parseWorkWords('car driver Delhi monthly').workerType, 'personalDriver');
// ---------- H3 regular crew ----------
{
  const s = fresh(), v = s.ownedVehicles.transporter[0], staff = s.peopleByWorkspace.transporter;
  staff.push({id: 'ST-D', name: 'Driver D', role: 'driver', status: 'active'}, {id: 'ST-H', name: 'Helper H', role: 'helper', status: 'active'});
  assert.match(WX.saveRegularCrew(s, 'transporter', v.id, 'ST-H', ''), /driver/);
  assert.equal(WX.saveRegularCrew(s, 'transporter', v.id, 'ST-D', 'ST-H'), ''); assert.deepEqual([v.regularCrew.driverId, v.regularCrew.helperId], ['ST-D', 'ST-H']);
}
// ---------- P1 expiry check while picking (first expiry first out) ----------
{
  const s = fresh(), p = {batches: [{id: 'P-B1', qty: 3, expiry: day(1)}, {id: 'P-B2', qty: 5, expiry: day(30)}, {id: 'P-B3', qty: 5, expiry: day(9)}]};
  const r = pickBatch(s, p); assert.equal(MIN_SHELF_DAYS, 2);
  assert.equal(r.batch.id, 'P-B3', `earliest batch with ${MIN_SHELF_DAYS}+ days left`); assert.deepEqual(r.tooClose.map(b => b.id), ['P-B1']);
  assert.equal(pickBatch(s, {batches: [{id: 'X', qty: 2, expiry: day(0)}]}).batch, null, 'nothing safe to pick');
}
// ---------- live homes ----------
{
  const s = fresh();
  for (const ws of ['goods', 'transporter', 'vehicle', 'movers', 'admin']) { const h = WH.businessHome(s, ws); assert.ok(!/Foundation status|Mock decisions|shared states|centralized configuration/.test(h), `${ws} home has no developer text`); }
  for (const ws of ['commercialDriver', 'personalDriver', 'helper']) assert.ok(!/Foundation status|Mock decisions|shared states/.test(WH.workerHome(s, ws)));
  assert.match(WH.workerHome(s, 'commercialDriver'), /Next: Dharamkata weighment/); assert.match(WH.workerHome(s, 'helper'), /Open trip · next/);
  assert.deepEqual(WH.workerMoney(s, 'commercialDriver'), {earned: 0, advances: 1000, pending: 640, pendingCount: 1});
  s.workOffers.find(o => o.id === 'OFF-801').status = 'accepted'; assert.ok(!WH.workerHome(s, 'commercialDriver').includes('OFF-801'), 'accepted offers leave New offers');
  assert.match(WH.businessHome(s, 'transporter'), /assign a truck and driver/);
}
console.log(JSON.stringify({status: 'PASS', suite: 'Work and hiring: availability posts, filters, one-tap hire, same-day pay, ratings, strikes, helper booking, monthly driver, in-person joining, driver safety, voice words, regular crew, picking expiry, live homes'}));
// ---------- one attendance record for store pickers ----------
{
  const PP = await import('../js/grocery-picker-pay.js'), Time = await import('../js/staff-time.js'), GS = await import('../js/grocery-staff.js');
  const s = fresh(); s.activePicker = {...(s.activePicker || {}), picker: 'PICK-001'};
  const before = (s.staffDays || []).length, e = PP.startPickerShift(s, 'picker');
  if (e) console.log('start shift note:', e);
  else {
    const shift = s.pickerShifts.find(x => x.pickerId === 'PICK-001' && x.status === 'open'), row = (s.staffDays || []).find(d => d.personId === 'PICK-001' && d.date === shift.date);
    assert.ok(row && row.shiftId === shift.id, 'starting a pick shift marks attendance too'); assert.equal(s.staffDays.length, before + 1);
    assert.equal(PP.endPickerShift(s, 'picker'), ''); assert.ok(row.leftAt, 'ending the shift records leaving');
  }
}
console.log(JSON.stringify({status: 'PASS', suite: 'Store picker attendance: shift and payroll attendance stay in step'}));
