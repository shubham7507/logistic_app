// Seller delivery settings (onboarding step 5 and Store setup → Delivery).
import assert from 'node:assert/strict';
import * as SD from '../js/seller-delivery.js';
import * as SO from '../js/seller-onboarding.js';
import {SEED} from '../js/mock-data.js';

const NOIDA = {pincode: '201301', radiusKm: 5, city: 'Noida'}, JAIPUR = {pincode: '302017', radiusKm: 5}, AJMER = {pincode: '305001', radiusKm: 5};
const courier = {moveai: true, handover: 'pickup', windows: ['09-12'], maxKg: 10, packaging: true};
const own = {own: true, ownRadius: 3, ownFee: 20, freeAbove: 299, minOrder: 0, eta: 45};

// Coverage by pincode, not city; prototype rate card.
assert.equal(SD.coverage('201301').city, 'Noida'); assert.equal(SD.coverage('302017').speed, 'Next day');
assert.equal(SD.coverage('305001'), false); assert.equal(SD.coverage('12'), null);
assert.deepEqual(SD.courierFee({km: 3, kg: 1}), {ship: 30, cod: 0, total: 30});
assert.equal(SD.courierFee({km: 5, kg: 2}).ship, 30 + 12 + 10);
assert.equal(SD.courierFee({km: 3, kg: 1, cod: true, amount: 600}).cod, 15, 'COD minimum');
assert.equal(SD.courierFee({km: 3, kg: 1, cod: true, amount: 4000}).cod, 60, '1.5%');

// Nothing chosen → error; each mode's details are required.
assert.match(SD.validate({}, NOIDA).error, /at least one/);
assert.match(SD.validate({moveai: true}, {radiusKm: 5}).error, /pincode/);
assert.match(SD.validate({...courier}, AJMER).error, /do not cover pincode 305001/);
assert.match(SD.validate({...courier, handover: ''}, NOIDA).error, /rider collects/);
assert.match(SD.validate({...courier, windows: []}, NOIDA).error, /pickup window/);
assert.equal(SD.validate({...courier, handover: 'dropoff', windows: []}, NOIDA).plan.moveai.hub, 'MoveAI hub, Sector 63 Noida', 'drop-off needs no window');
assert.match(SD.validate({...courier, maxKg: 50}, NOIDA).error, /1 to 30 kg/);
assert.match(SD.validate({...courier, courierCod: true, codLimit: 100}, NOIDA).error, /COD limit/);
assert.match(SD.validate({...courier, packaging: false}, NOIDA).error, /packaging/);
assert.match(SD.validate({...own, ownRadius: 9}, NOIDA).error, /1 to 5 km/);
assert.match(SD.validate({...own, ownFee: 500}, NOIDA).error, /₹0 to ₹200/);
assert.match(SD.validate({...own, eta: 5}, NOIDA).error, /15 to 240/);
assert.match(SD.validate({pickup: true, prepMins: 0}, NOIDA).error, /5 to 120/);

// Combined modes: own up to N km, couriers beyond; pickup alongside.
{
  const r = SD.validate({...courier, ...own, pickup: true, prepMins: 15, courierCod: true, codLimit: 2000}, NOIDA);
  assert.equal(r.error, undefined); assert.equal(r.plan.ownUpToKm, 3);
  assert.match(SD.summary(r.plan), /Own delivery up to 3 km[\s\S]*MoveAI couriers beyond 3 km[\s\S]*COD up to ₹2000[\s\S]*Store pickup \(ready in 15 min\)/);
  assert.match(SD.validate({...courier, ...own, ownRadius: 5}, NOIDA).error, /below 5 km/, 'own must leave room for couriers');
  assert.equal(SD.primaryMode(r.plan), 'moveai'); assert.equal(SD.allowsPickup(r.plan), true); assert.equal(SD.codAllowed(r.plan), true);
}
// Category rules: fresh needs same-day; electricals get the open-box check.
assert.match(SD.validate({...courier}, JAIPUR, ['fresh']).error, /same-day/);
assert.equal(SD.validate({...courier}, JAIPUR, ['fresh', 'food']).error, undefined, 'mixed store may still use next-day couriers');
assert.equal(SD.validate({...courier, openBox: true}, NOIDA, ['electrical']).plan.moveai.openBox, true);
assert.equal(SD.validate({...courier, openBox: true}, NOIDA, ['food']).plan.moveai.openBox, false);
assert.ok(SD.categoryAdvice(['fresh', 'electrical']).length === 2);
// Pickup / COD rules used at checkout; older stores keep old behaviour.
{
  const pickupOnly = SD.validate({pickup: true, prepMins: 20}, NOIDA).plan, prepaid = SD.validate({...courier}, NOIDA).plan;
  assert.equal(SD.delivers(pickupOnly), false); assert.equal(SD.allowsPickup(prepaid), false); assert.equal(SD.codAllowed(prepaid), false);
  assert.equal(SD.allowsPickup(undefined), true); assert.equal(SD.codAllowed(undefined), true); assert.equal(SD.allowsPickup('moveai'), true);
  assert.equal(SD.summary('own'), 'Your own delivery staff', 'legacy single-mode application');
}
// The form: nothing preselected; every card shows pack / who delivers / cost / COD.
{
  const html = SD.formHtml(null, {store: NOIDA, categories: ['electrical']});
  assert.ok(!/delivery-modes[\s\S]*?type="checkbox" name="(moveai|own|pickup)" checked/.test(html));
  assert.equal((html.match(/<dt>Cost to you<\/dt>/g) || []).length, 3); assert.equal((html.match(/<dt>COD<\/dt>/g) || []).length, 3);
  assert.match(html, /MoveAI couriers cover 201301 \(Noida\)/); assert.match(html, /Open-box check/);
  assert.match(SD.formHtml(null, {store: AJMER}), /don't cover 305001/);
}
// Onboarding: step numbering skips hidden steps; quick setup; plan copied to the live store.
{
  const s = {...JSON.parse(JSON.stringify(SEED)), person: {id: 'P-D', name: 'Dev'}}, a = SO.startApplication(s, {});
  SO.saveType(s, a, {sellerType: 'shop', categories: ['household'], legalName: 'Dev Stores'});
  assert.deepEqual(SO.visibleSteps(a).map(x => x.key), ['type', 'kyc', 'store', 'delivery', 'agreement', 'products', 'review']);
  assert.match(SO.startScreen(s), /<button type="button" data-sell-goto="4">3\. Store and first branch/);
  SO.saveKyc(s, a, {pan: 'ABCDE1234F', gstin: '09ABCDE1234F1Z5', account: '123456789012', ifsc: 'SBIN0001234'});
  SO.saveStore(s, a, {storeName: 'Dev Stores', branchName: 'Main', address: '1 Market Road, Noida', city: 'Noida', pincode: '201301', stateCode: '09', open: '00:00', close: '23:59', radiusKm: 5});
  assert.equal(SO.saveDelivery(s, a, {...courier, ...own}), '');
  SO.saveAgreement(s, a, {accept: true}); SO.addProduct(s, a, {name: 'Floor Cleaner', category: 'household', price: 99, mrp: 120, size: '1 l', stock: 5});
  SO.submit(s, a); for (const k of Object.keys(a.sections)) if (a.sections[k].status === 'pending') SO.decide(s, a.id, k, 'approved');
  const p = s.shopPartners[a.storeKey];
  assert.equal(p.deliveryMode, 'moveai'); assert.equal(p.deliveryPlan.ownUpToKm, 3); assert.equal(p.deliveryArea.pincode, '201301');

  // Store setup → Delivery: change goes to MoveAI review; reject needs a reason; approve applies it.
  assert.match(SD.requestChange(s, a.storeKey, {pickup: true, prepMins: 10, pincode: '20130', radiusKm: 5}), /6-digit/);
  assert.equal(SD.requestChange(s, a.storeKey, {pickup: true, prepMins: 10, pincode: '201301', radiusKm: 5}), '');
  assert.match(SD.requestChange(s, a.storeKey, {pickup: true, prepMins: 10, pincode: '201301', radiusKm: 5}), /already waiting/);
  assert.ok(s.notifications.some(n => n.to === 'admin' && /Dev Stores asked to change delivery/.test(n.text)));
  assert.match(SD.reviewHtml(s), /Delivery change requests[\s\S]*Dev Stores/);
  assert.match(SD.decideChange(s, a.storeKey, 'rejected', ''), /reason/);
  assert.equal(SD.decideChange(s, a.storeKey, 'approved'), '');
  assert.equal(p.deliveryMode, 'pickup'); assert.equal(SD.delivers(p.deliveryPlan), false);
  assert.match(SD.storePanelHtml(s, a.storeKey).replace(/<[^>]+>/g, ""), /Now: Store pickup \(ready in 10 min\)/);
  assert.ok(s.notifications.some(n => n.to === a.storeKey && /Delivery change approved/.test(n.text)));
  // A demo store (no plan yet) can set one up too.
  assert.match(SD.storePanelHtml(s, 'grocery'), /set up before delivery settings existed/);
  assert.equal(SD.requestChange(s, 'grocery', {...own, pincode: '110017', radiusKm: 5}), '');
}
console.log(JSON.stringify({status: 'PASS', suite: 'Seller delivery: coverage by pincode, rate card, per-mode details, combined modes, category rules, checkout rules, step numbering, Store setup change with review'}));
