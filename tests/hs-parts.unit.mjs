// Spare parts during a home-service job: kit part, shop delivery order, price can't exceed the shop's,
// Motihari market bill with MRP check and "higher than usual" flag, "I'll buy it myself", waiting for part,
// part money goes to the shop after payment, "Report price" → admin refund + strike.
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as HS from '../js/home-services.js';
import * as P from '../js/hs-parts.js';
import * as Pay from '../js/pay.js';
import * as LOC from '../js/location.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}, currentWorkspace: 'personal'});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const arrive = (s, r) => { for (let i = 0; i < 80 && !r.arrivedAt; i++) HS.demoDrive(s, 'homePro', r.id, 1); };
// Booked, accepted by Suresh, work started.
function started(s, o = {}) {
  const r = HS.createBooking(s, {category: 'electrician', items: [{id: 'fan', qty: 1}], addressId: 'AD-HOME', date: day(1), slot: '10', ...o}).request;
  assert.equal(HS.acceptJob(s, 'homePro', r.id), ''); HS.onTheWay(s, 'homePro', r.id); arrive(s, r); assert.equal(HS.startJob(s, 'homePro', r.id, r.startOtp), ''); return r;
}
const pay = (s, r) => { r.status = 'completed'; const res = Pay.payBalance(s, r, {method: 'upi', vpa: 'shubham@okaxis'}); assert.ok(!res.error, res.error); r.status = 'paid'; r.paid = true; Pay.release(s, r, 'Customer'); HS.tick(s); };

// 1. Kit part: search nearby shops (closest first), price from the shop, one approval card, then done
{ const s = fresh(), r = started(s);
  const found = P.search(s, r, 'capacitor'); assert.ok(found.length >= 2); assert.ok(found[0].km <= found[1].km, 'closest shop first');
  assert.ok(found.every(p => p.km <= 15)); assert.ok(!found.some(p => p.shop.city === 'Patna'), 'Patna shop not offered in Noida');
  assert.match(P.addPart(s, 'homePro', r.id, {productId: found[0].id, mode: 'kit'}), /photo of the old/);
  assert.equal(P.addPart(s, 'homePro', r.id, {productId: found[0].id, mode: 'kit', qty: 1, photo: 'old-cap.jpg', price: 999}), '');
  const part = r.parts[0]; assert.equal(part.price, found[0].price, 'price comes from the shop, never typed by the pro'); assert.equal(part.pickupFee, 0);
  assert.ok(s.notifications.some(n => n.to === 'personal' && /needs Fan capacitor/.test(n.text)));
  assert.match(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'done.jpg'}), /not answered your part/);
  assert.match(P.customerCard(s, r), /See it in the shop/); assert.match(P.customerCard(s, r), /Approve/);
  assert.equal(P.decide(s, r.id, 'approve'), ''); assert.equal(part.status, 'approved');
  const ex = r.extras.find(x => x.partId === part.id); assert.equal(ex.status, 'approved'); assert.equal(ex.passThrough, true); assert.equal(ex.amount, part.price);
  assert.equal(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'done.jpg'}), '');
  pay(s, r); assert.ok(!s.ledger.some(x => x.type === 'part_settlement' && x.serviceId === r.id), 'kit part: the pro keeps the part money'); }

// 2. Shop order for delivery: shop is told, "on the way · 35 min", can't finish until delivered; shop gets the part money
{ const s = fresh(), r = started(s); const cap = P.search(s, r, 'capacitor havells')[0]; assert.equal(cap.shopKey, 'electrical');
  assert.equal(P.addPart(s, 'homePro', r.id, {productId: cap.id, mode: 'delivery', qty: 2, photo: 'old.jpg'}), '');
  assert.equal(P.decide(s, r.id, 'approve'), ''); const part = r.parts[0];
  assert.equal(part.order.status, 'placed'); assert.ok(s.notifications.some(n => n.to === 'electrical' && /Part order/.test(n.text)));
  assert.match(P.shopPanel(s, 'electrical'), /Part orders from MoveAI pros/);
  assert.match(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}), /on the way/);
  assert.equal(P.orderStep(s, r.id, part.id, 'packed'), ''); assert.equal(P.orderStep(s, r.id, part.id, 'on_the_way'), '');
  assert.ok(s.notifications.some(n => n.to === 'personal' && /on the way from Sharma Electricals \(about 35 min\)/.test(n.text)));
  assert.equal(P.orderStep(s, r.id, part.id, 'delivered'), ''); assert.equal(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}), '');
  const before = Pay.wallet(s, 'homePro').balance; pay(s, r);
  const toShop = s.ledger.find(x => x.type === 'wallet_credit' && x.payee === 'store:sharma-electricals' && x.serviceId === r.id); assert.equal(toShop.amount, cap.price * 2);
  const fromPro = s.ledger.find(x => x.type === 'part_settlement' && x.serviceId === r.id); assert.equal(fromPro.amount, cap.price * 2);
  const credit = s.ledger.find(x => x.type === 'wallet_credit' && x.payee === 'homePro' && x.serviceId === r.id);
  assert.equal(credit.amount, (249 + cap.price * 2) - Math.round(249 * 0.15), '15% only on labour; the part passes through');
  assert.equal(Pay.wallet(s, 'homePro').balance - before, credit.amount - fromPro.amount, 'the pro keeps labour minus 15%');
  HS.tick(s); assert.equal(s.ledger.filter(x => x.type === 'part_settlement' && x.serviceId === r.id).length, 1, 'settled once'); }

// 3. "I'll buy it myself" and Reject: nothing added to the bill
{ const s = fresh(), r = started(s, {category: 'plumber', items: [{id: 'tap', qty: 1}], slot: '12'}); const tap = P.search(s, r, 'cartridge')[0];
  P.addPart(s, 'homePro', r.id, {productId: tap.id, mode: 'pickup', photo: 'old.jpg'}); assert.equal(P.decide(s, r.id, 'self'), '');
  assert.equal(r.parts[0].status, 'self'); assert.equal(r.extras.filter(x => x.partId).length, 0);
  P.addPart(s, 'homePro', r.id, {productId: tap.id, mode: 'kit', photo: 'old.jpg'}); P.addPart(s, 'homePro', r.id, {productId: P.search(s, r, 'teflon')[0].id, mode: 'kit', photo: 'old.jpg'});
  assert.match(P.customerCard(s, r), /2 parts need your OK/); assert.match(P.customerCard(s, r), /Approve all/);
  assert.equal(P.decide(s, r.id, 'approve'), ''); assert.equal(P.pending(r).length, 0); assert.equal(r.extras.filter(x => x.partId).length, 2); }

// 4. Pickup from the shop: pro taps "Picked up" before finishing
{ const s = fresh(), r = started(s, {category: 'plumber', items: [{id: 'tap', qty: 1}], slot: '14'}); const tap = P.search(s, r, 'bib tap')[0];
  P.addPart(s, 'homePro', r.id, {productId: tap.id, mode: 'pickup', photo: 'old.jpg'}); P.decide(s, r.id, 'approve');
  assert.match(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}), /on the way/); assert.equal(P.orderStep(s, r.id, r.parts[0].id, 'picked_up'), '');
  assert.equal(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}), ''); }

// 5. Motihari (no MoveAI shop): market bill + MRP photo, never above MRP, "higher than usual" flagged, visible pickup charge
{ const s = fresh(); const sur = s.homePros.find(p => p.id === 'HP-SURESH'); delete sur.base; delete sur.coords; s.homePros = [sur];
  const loc = LOC.makeLocation({source: 'gps', lat: LOC.DEMO_SPOTS.motihari.at[0], lng: LOC.DEMO_SPOTS.motihari.at[1], accuracy: 15, line: 'Ram Prasad ji ka ghar', pincode: '845401'});
  const r = started(s, {category: 'plumber', items: [{id: 'geyser', qty: 1}], addressId: null, address: loc});
  assert.equal(P.search(s, r, '').length, 0); assert.equal(P.nearbyShops(s, r).length, 0); assert.match(P.proForm(s, r), /No MoveAI shop within 15 km/);
  const v = {mode: 'market', name: 'Geyser thermostat', qty: 1, photo: 'old.jpg', bill: 'bill.jpg', mrpPhoto: 'mrp.jpg'};
  assert.match(P.addPart(s, 'homePro', r.id, {...v, price: 650, mrp: 600}), /above the MRP/);
  assert.match(P.addPart(s, 'homePro', r.id, {...v, price: 560, mrp: 600, bill: ''}), /bill/);
  assert.equal(P.addPart(s, 'homePro', r.id, {...v, price: 560, mrp: 600}), ''); const part = r.parts[0];
  assert.equal(part.pickupFee, P.PICKUP_FEE); assert.equal(part.usual, 420); assert.equal(part.flag, 'higher');
  assert.match(P.customerCard(s, r), /higher than usual/); assert.match(P.customerCard(s, r), /pickup charge of ₹40/);
  assert.ok(P.reviewQueue(s).some(x => x.p.id === part.id), 'flagged for admin');
  // 6. Waiting for part → free return visit, job paused
  assert.equal(P.decide(s, r.id, 'approve'), ''); assert.equal(P.waitForPart(s, 'homePro', r.id, {date: day(2), slot: '10', note: 'Thermostat'}), '');
  assert.match(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}), /waiting for a part/); assert.ok(s.notifications.some(n => n.to === 'personal' && /no extra charge/.test(n.text)));
  assert.equal(P.resume(s, 'homePro', r.id), ''); assert.equal(HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}), '');
  // 7. Report price → admin refunds the overcharge and adds a strike
  assert.match(P.report(s, r.id, part.id, 'Same part is ₹420 in the market'), /after paying/);
  pay(s, r); assert.ok(!s.ledger.some(x => x.type === 'part_settlement' && x.serviceId === r.id), 'market part: no shop to pay');
  assert.equal(P.report(s, r.id, part.id, 'Same part is ₹420 in the market'), ''); assert.ok(s.notifications.some(n => n.to === 'admin' && /reported the price/.test(n.text)));
  assert.equal(P.overcharge(s, part), 140); assert.equal(P.resolve(s, r.id, part.id, 'refund'), '');
  const ref = s.ledger.find(x => x.type === 'refund' && x.reference === `PRF-${part.id}`); assert.equal(ref.amount, 140); assert.equal(ref.payee, 'personal');
  assert.ok(s.ledger.some(x => x.type === 'penalty' && x.reference === `PPEN-${part.id}` && x.amount === 140));
  assert.equal(sur.stats.strikes, 1); assert.equal(P.reviewQueue(s).length, 0); assert.match(P.resolve(s, r.id, part.id, 'refund'), /Nothing to review/); }

// 8. Fair shop price reported → nothing to refund
{ const s = fresh(), r = started(s, {category: 'plumber', items: [{id: 'tap', qty: 1}], slot: '16'}); const tap = P.search(s, r, 'cartridge')[0];
  P.addPart(s, 'homePro', r.id, {productId: tap.id, mode: 'kit', photo: 'old.jpg'}); P.decide(s, r.id, 'approve'); HS.markDone(s, 'homePro', r.id, {afterPhoto: 'x.jpg'}); pay(s, r);
  P.report(s, r.id, r.parts[0].id, 'seems high'); assert.match(P.resolve(s, r.id, r.parts[0].id, 'refund'), /nothing to refund/); assert.equal(P.resolve(s, r.id, r.parts[0].id, 'dismiss'), ''); }

// 9. A newly onboarded hardware seller's products appear as parts near its PIN code
{ const s = fresh(); s.shopPartners.shopX = {name: 'Patel Hardware', party: 'store:patel', status: 'approved', deliveryArea: {pincode: '201309'}};
  s.products.push({id: 'PRD-X1', name: 'Angle valve', size: '½ inch', price: 199, mrp: 260, category: 'Hardware & sanitary', fulfilmentPartner: 'Patel Hardware', status: 'active'});
  const r = started(s, {category: 'plumber', items: [{id: 'tap', qty: 1}], slot: '18'}); assert.ok(P.search(s, r, 'angle').some(p => p.shop.name === 'Patel Hardware')); }
console.log(JSON.stringify({status: 'PASS', suite: 'Parts: kit, shop delivery (35 min), pickup, price from shop, approve all / buy myself, Motihari market bill + MRP + flag + pickup charge, waiting for part, shop settlement, report price refund + strike, onboarded hardware seller'}));
