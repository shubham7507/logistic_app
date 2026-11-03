// Home services: catalogue prices, minimum charge, slots (no past dates, 1-hour lead, 14 days), address,
// booking → pro offers, accept rules (verified, skill, slot clash, taken), on the way, start code, extras
// must be answered, inspection quote approve/decline, no-work visit charge, payout to the pro, re-work,
// reschedule, cancel rules, admin assign, sign-up activation.
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as HS from '../js/home-services.js';
import * as Bill from '../js/customer-billing.js';
import * as Pay from '../js/pay.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}, currentWorkspace: 'personal'});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const arrive = (s, r) => { for (let i = 0; i < 40 && !r.arrivedAt; i++) HS.demoDrive(s, 'homePro', r.id, 1); };
const base = (o = {}) => ({category: 'electrician', items: [{id: 'fan', qty: 1}], addressId: 'AD-HOME', date: day(1), slot: '10', description: 'Fan wobbles', ...o});

// catalogue and minimum charge
{ assert.equal(HS.quoteFor('electrician', [{id: 'fan', qty: 2}, {id: 'switch', qty: 1}]).total, 597);
  const small = HS.quoteFor('electrician', [{id: 'switch', qty: 1}]); assert.equal(small.total, HS.MIN_ORDER); assert.ok(small.partnerLines.some(([l]) => /Minimum visit/.test(l)));
  assert.equal(HS.quoteFor('painting', [{id: 'inspect', qty: 1}]).total, 0); }

// slots
{ assert.match(HS.slotError(day(-1), '10'), /passed/); assert.match(HS.slotError(day(20), '10'), /14 days/); assert.match(HS.slotError(day(1), 'x'), /time slot/);
  assert.equal(HS.slotError(day(1), '08'), ''); assert.ok(HS.freeSlots(day(1)).length === 6); }

// booking validation and creation
{ const s = fresh();
  assert.match(HS.createBooking(s, base({items: []})).error, /at least one job/);
  assert.match(HS.createBooking(s, base({addressId: null, address: {line: 'Flat 1', pincode: '12'}})).error, /PIN code/);
  assert.match(HS.createBooking(s, base({addressId: null, address: {line: 'Flat 1', pincode: '201301'}})).error, /No map point/);
  assert.match(HS.createBooking(s, base({date: day(-2)})).error, /passed/);
  assert.match(HS.createBooking(s, base({category: 'painting', items: [], description: ''})).error, /what needs painting/);
  const r0 = HS.createBooking(s, base({addressId: null, address: {line: 'C-9', village: 'Sector 21', landmark: 'Near metro', pincode: '201301', name: 'Parents'}, saveAddress: true}));
  assert.ok(r0.request); assert.equal(HS.addresses(s).length, 2, 'new address saved');
  const {request: r, notified} = HS.createBooking(s, base());
  assert.equal(r.status, 'searching'); assert.equal(notified, 1, 'only the electrician pro is told'); assert.match(r.startOtp, /^\d{4}$/);
  assert.ok(s.notifications.some(n => n.to === 'homePro' && n.ref === r.id)); assert.ok(HS.offersFor(s).some(x => x.id === r.id)); }

// pro accept rules, decline, clash, taken
{ const s = fresh(); const {request: r} = HS.createBooking(s, base());
  const p = HS.proOf(s); p.verified = false; assert.match(HS.acceptJob(s, 'homePro', r.id), /ID verification/); p.verified = true;
  const {request: clean} = HS.createBooking(s, base({category: 'cleaning', items: [{id: '1bhk', qty: 1}]}));
  assert.ok(!HS.offersFor(s).some(x => x.id === clean.id), 'cleaning not offered to an electrician'); assert.match(HS.acceptJob(s, 'homePro', clean.id), /skills/);
  assert.equal(HS.acceptJob(s, 'homePro', r.id), ''); assert.equal(r.status, 'accepted'); assert.equal(r.provider, 'homePro'); assert.ok(s.conversations.some(c => c.id === r.conversationId));
  assert.match(HS.acceptJob(s, 'homePro', r.id), /taken/);
  const {request: same} = HS.createBooking(s, base({items: [{id: 'light', qty: 1}]})); assert.match(HS.acceptJob(s, 'homePro', same.id), /already have/);
  assert.equal(HS.declineJob(s, 'homePro', same.id), ''); assert.ok(!HS.offersFor(s).some(x => x.id === same.id)); }

// full job: on the way → start code → extra → done → confirm → pay → payout 85% → re-work
{ const s = fresh(); const {request: r} = HS.createBooking(s, base({items: [{id: 'fan', qty: 2}]})); HS.acceptJob(s, 'homePro', r.id);
  assert.match(HS.startJob(s, 'homePro', r.id, r.startOtp), /On the way/);
  assert.match(HS.reschedule(s, r.id, day(-1), '10'), /passed/); assert.equal(HS.reschedule(s, r.id, day(2), '14'), ''); assert.equal(r.date, day(2));
  assert.equal(HS.onTheWay(s, 'homePro', r.id), ''); assert.match(HS.reschedule(s, r.id, day(3), '10'), /on the way/);
  assert.match(Pay.cancellationQuote(s, r).note, /on the way/);
  assert.match(HS.startJob(s, 'homePro', r.id, r.startOtp), /live location/, 'exact address needs the pro there');
  HS.demoDrive(s, 'homePro', r.id); assert.match(HS.startJob(s, 'homePro', r.id, r.startOtp), /km from the customer/);
  arrive(s, r); assert.ok(r.arrivedAt);
  assert.match(HS.startJob(s, 'homePro', r.id, '0000'), /wrong/); assert.equal(HS.startJob(s, 'homePro', r.id, r.startOtp), ''); assert.equal(r.status, 'in_progress'); assert.equal(r.geo.live, false, 'sharing stops at start');
  assert.equal(HS.proposeExtra(s, 'homePro', r.id, {kind: 'extra_labour', qty: 1, note: 'capacitor'}), '');
  assert.match(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}), /not answered/);
  Bill.decideExtra(s, r, r.extras[0].id, 'approve');
  assert.match(HS.markDone(s, 'homePro', r.id, {}), /photo/);
  assert.equal(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}), ''); assert.equal(r.status, 'provider_done');
  r.status = 'completed';
  const res = Pay.payBalance(s, r, {method: 'upi', vpa: 'shubham@okaxis'}); assert.ok(!res.error, res.error); r.status = 'paid'; r.paid = true; Pay.release(s, r, 'Customer');
  const credit = s.ledger.find(x => x.type === 'wallet_credit' && x.serviceId === r.id); assert.equal(credit.payee, 'homePro'); assert.equal(credit.amount, 748 - Math.round(748 * 0.15));
  assert.ok(Pay.wallet(s, 'homePro').balance >= credit.amount);
  assert.ok(HS.inWarranty(r)); const rw = HS.requestRework(s, r.id, {problem: 'Fan wobbles again', date: day(3), slot: '10'});
  assert.ok(rw.request); assert.equal(rw.request.quote.total, 0); assert.equal(rw.request.provider, 'homePro'); assert.equal(rw.request.status, 'accepted');
  assert.match(HS.requestRework(s, r.id, {problem: 'again', date: day(3), slot: '10'}).error, /already booked/); }

// no work possible → visit charge only
{ const s = fresh(); const {request: r} = HS.createBooking(s, base()); HS.acceptJob(s, 'homePro', r.id); HS.onTheWay(s, 'homePro', r.id); arrive(s, r); HS.startJob(s, 'homePro', r.id, r.startOtp);
  assert.match(HS.markDone(s, 'homePro', r.id, {noWork: true}), /why/);
  assert.equal(HS.markDone(s, 'homePro', r.id, {noWork: true, reason: 'Fan motor burnt, needs a new fan'}), ''); assert.equal(r.quote.total, HS.NO_WORK_CHARGE); assert.ok(!HS.inWarranty({...r, status: 'paid'})); }

// painting: up to 3 painters quote, the customer chooses; the chosen painter visits and works at that price
{ const s = fresh(); HS.proOf(s).skills.push('painting');
  const {request: r} = HS.createBooking(s, base({category: 'painting', items: [], description: '2 bedrooms and hall'}));
  assert.equal(r.inspection, true); assert.equal(r.quote.total, 0); assert.equal(r.status, 'searching');
  assert.equal(r.quotes.length, 2, 'two demo painters quoted at once'); assert.ok(HS.offersFor(s).some(x => x.id === r.id), 'Suresh is asked for a price');
  assert.match(HS.acceptJob(s, 'homePro', r.id), /Send your price/);
  assert.match(HS.sendProQuote(s, 'homePro', r.id, {amount: 100, note: 'x'}), /full price/);
  assert.equal(HS.sendProQuote(s, 'homePro', r.id, {amount: 11900, note: '2 rooms + hall, 2 coats, 3 days'}), ''); assert.equal(r.quotes.length, 3);
  assert.equal(HS.chooseQuote(s, r.id, 'HP-SURESH'), ''); assert.equal(r.status, 'accepted'); assert.equal(r.provider, 'homePro'); assert.equal(r.quote.total, 11900);
  assert.ok(s.notifications.some(n => n.to === 'personal' && /Suresh Kumar/.test(n.text)));
  HS.onTheWay(s, 'homePro', r.id); arrive(s, r); HS.startJob(s, 'homePro', r.id, r.startOtp);
  assert.match(HS.proposeExtra(s, 'homePro', r.id, {kind: 'extra_labour'}), /quote/);
  assert.equal(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'walls.jpg'}), '');
  // given by admin without quotes: inspection, quote on site, customer declines → nothing to pay
  const s2 = fresh(); for (const id of ['HP-VINOD', 'HP-KAMAL']) HS.setPaused(s2, id, true); HS.proOf(s2).skills.push('painting');
  const {request: d} = HS.createBooking(s2, base({category: 'painting', items: [], description: 'Hall walls'}));
  assert.equal(HS.adminAssign(s2, d.id, 'HP-SURESH'), ''); HS.onTheWay(s2, 'homePro', d.id); arrive(s2, d); HS.startJob(s2, 'homePro', d.id, d.startOtp);
  assert.match(HS.markDone(s2, 'homePro', d.id, {afterPhoto: 'x.jpg'}), /quote/);
  assert.equal(HS.sendQuote(s2, 'homePro', d.id, {amount: 9000, note: 'Hall, 2 coats, 1 day'}), '');
  assert.equal(HS.decideQuote(s2, d.id, 'decline'), ''); assert.equal(d.status, 'closed'); assert.equal(Pay.paySummary(s2, d).due, 0, 'nothing to pay after a declined quote'); }

// cancel before the pro is on the way is free; seeded booking uses the pro as payee
{ const s = fresh(); const {request: r} = HS.createBooking(s, base()); HS.acceptJob(s, 'homePro', r.id);
  const q = Pay.cancellationQuote(s, r); assert.equal(q.fee, 0); assert.match(q.note, /Free cancellation until the pro is on the way/);
  assert.equal(Pay.payeeOf(s, s.serviceRequests.find(x => x.id === 'SR-703')), 'homePro'); }

// admin: flagged when no pro after 30 minutes; give to a pro
{ const s = fresh(); HS.setPaused(s, 'HP-MEENA', true); const {request: r} = HS.createBooking(s, base({category: 'cleaning', items: [{id: '2bhk', qty: 1}]}));
  r.createdAtMs -= 31 * 60000; assert.ok(HS.adminRows(s).find(x => x.r.id === r.id).flag.includes('30 min'));
  assert.equal(HS.adminAssign(s, r.id, 'HP-SURESH'), ''); assert.equal(r.provider, 'homePro'); }

// screens render
{ const s = fresh(); s.currentWorkspace = 'homePro';
  assert.match(HS.screen('home', s), /New jobs near you \(1\)/); assert.match(HS.screen('proJobs', s), /My Jobs/); assert.match(HS.screen('money', s), /MoveAI Pay wallet/);
  s.currentWorkspace = 'personal'; assert.match(HS.bookScreen(s), /Ceiling fan/); assert.match(HS.bookScreen(s), /Step 1 of 4/);
  assert.match(HS.bookStepError(s, 1), /at least one job/); s.homeDraft.qty = {fan: 1}; assert.equal(HS.bookStepError(s, 1), '');
  s.homeDraft.step = 2; assert.match(HS.bookScreen(s), /Flat 402/); assert.equal(HS.bookStepError(s, 2), '');
  s.homeDraft.step = 3; s.homeDraft.date = day(1); assert.match(HS.bookScreen(s), /10 AM–12 PM/); assert.match(HS.bookStepError(s, 3), /time slot/); s.homeDraft.slot = '10';
  s.homeDraft.step = 4; const rv = HS.bookScreen(s); assert.match(rv, /Check and book/); assert.match(rv, /₹249/); assert.match(rv, /✓ Job/);
  assert.match(HS.customerScreen(s, s.serviceRequests.find(x => x.id === 'SR-703')), /Confirm work is done/); }

// sign-up: a verified "Home service pro" gets the pro workspace
{ const s = fresh(); const c = {id: 'CAND-HP1', name: 'Raju Electric', mobile: '9123400001', workerType: 'homePro', skills: ['Electrician', 'Plumber'], locations: ['Patna'], level: 1};
  assert.match(HS.activatePro(s, c), /Verify/); c.level = 2;
  assert.equal(HS.activatePro(s, c), ''); const p = HS.proOf(s); assert.equal(p.name, 'Raju Electric'); assert.deepEqual(p.skills, ['electrician', 'plumber']); assert.ok(s.workspaces.includes('homePro')); }

console.log(JSON.stringify({status: 'PASS', suite: 'Home services: catalogue, slots, booking, pro accept/decline, on the way, start code, extras, inspection quote, no-work charge, payout, re-work, cancel, admin, sign-up'}));
