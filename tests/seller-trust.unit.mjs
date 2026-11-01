// Seller trust: pincode checks, risk tiers, strict-state identity and shop checks (Bihar), probation,
// expiry controls, strikes, and the fixed UPI payment flow.
import assert from 'node:assert/strict';
import * as SO from '../js/seller-onboarding.js';
import * as T from '../js/seller-trust.js';
import * as SL from '../js/shelf-life.js';
import * as Inventory from '../js/grocery-inventory.js';
import * as O from '../js/product-orders.js';
import * as Plus from '../js/commerce-plus.js';
import {SEED} from '../js/mock-data.js';

const iso = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const DATES = {batch: 'B-1', mfgDate: iso(-30), expiryDate: iso(300)};
const fresh = (id = 'P-NEW', name = 'Ramesh Gupta') => ({...JSON.parse(JSON.stringify(SEED)), person: {id, name}});
const UP = {gstin: '09ABCDE1234F1Z5', pan: 'ABCDE1234F', store: {storeName: 'Gupta Mart', branchName: 'Sector 62', address: '12 Sector 62, Noida', city: 'Noida', pincode: '201301', stateCode: '09', open: '00:00', close: '23:59', radiusKm: 5}};
const BR = {gstin: '10ABCDE1234F1Z5', pan: 'ABCDE1234F', store: {storeName: 'Patna Bazaar', branchName: 'Boring Road', address: '4 Boring Road, Patna', city: 'Patna', pincode: '800001', stateCode: '10', open: '00:00', close: '23:59', radiusKm: 5}};
function draft(s, {where = UP, cats = ['household'], account = '123456789012', products = [['Floor Cleaner', 'household']], pan} = {}) {
  const a = SO.startApplication(s, {});
  assert.equal(SO.saveType(s, a, {sellerType: 'shop', categories: cats, legalName: 'Gupta Traders'}), '');
  assert.equal(SO.saveKyc(s, a, {pan: pan || where.pan, gstin: pan ? where.gstin.slice(0, 2) + pan + where.gstin.slice(12) : where.gstin, account, ifsc: 'SBIN0001234', chequeFile: 'cheque.jpg'}), '');
  if (cats.some(c => ['food', 'fresh', 'electrical'].includes(c))) SO.saveLicences(s, a, {fssai: '12345678901234', fssaiExpiry: '2030-01-01', brandProof: 'invoice.pdf'});
  assert.equal(SO.saveStore(s, a, where.store), '');
  assert.equal(SO.saveDelivery(s, a, {mode: 'own'}), '');
  assert.equal(SO.saveAgreement(s, a, {accept: true}), '');
  for (const [name, category] of products) assert.equal(SO.addProduct(s, a, {name, category, price: 100, mrp: 120, size: '1 kg', stock: 10, ...DATES}), '');
  return a;
}
const approveAll = (s, a) => { for (const k of Object.keys(a.sections)) if (a.sections[k].status === 'pending') assert.equal(SO.decide(s, a.id, k, 'approved', 'Checked documents and evidence'), '', k); };
const TRUST = {aadhaar: '234567890123', otp: '123456', consent: true, selfie: 'selfie.jpg', photoSignboard: 'sign.jpg', photoInside: 'inside.jpg', photoStock: 'stock.jpg', invoices: 'invoice.pdf', policeCert: 'police.pdf'};

// 1. The screenshot case: Noida with a Bihar pincode, state Uttar Pradesh → refused.
{
  const s = fresh(), a = SO.startApplication(s, {}); SO.saveType(s, a, {sellerType: 'shop', categories: ['household'], legalName: 'Gupta'}); SO.saveKyc(s, a, {pan: UP.pan, gstin: UP.gstin, account: '123456789012', ifsc: 'SBIN0001234'});
  assert.match(SO.saveStore(s, a, {...UP.store, address: 'noida, noida 845401', pincode: '845401'}), /Pincode 845401 is in Bihar, but you chose Uttar Pradesh/);
  assert.equal(T.pincodeState('834001'), '20', 'Jharkhand split from Bihar'); assert.equal(T.pincodeState('248001'), '05', 'Uttarakhand split from UP');
}
// 2. Standard state, low risk (household, all checks pass): approved automatically, live on probation.
{
  const s = fresh(), a = draft(s);
  assert.deepEqual(a.trustRequired, []); assert.ok(!SO.visibleSteps(a).some(x => x.key === 'trust'));
  assert.equal(SO.submit(s, a), ''); assert.equal(a.risk.level, 'low'); assert.ok(a.autoApproved);
  assert.equal(a.status, 'live'); const p = s.shopPartners[a.storeKey];
  assert.ok(p.probation.active); assert.deepEqual(p.probation.limits, {maxProducts: 50, maxOrderValue: 3000, cod: false, extraHoldDays: 7});
  assert.equal(p.verification.policy, 'standard');
}
// 3. Standard state, food → medium risk → people review; no extra checks.
{
  const s = fresh(), a = draft(s, {cats: ['food'], products: [['Toor Dal', 'food']]});
  SO.submit(s, a); assert.equal(a.risk.level, 'medium'); assert.equal(a.status, 'submitted'); assert.equal(a.storeKey, null);
  assert.ok(!a.sections.trust); approveAll(s, a); assert.equal(a.status, 'live');
}
// 4. Standard state, flagged (bank name mismatch) → high risk → video KYC before approval; overrides need a reason.
{
  const s = fresh(), a = draft(s, {account: '123456789000'});
  SO.submit(s, a); assert.equal(a.risk.level, 'high'); assert.deepEqual(a.trustRequired, ['videoKyc']); assert.equal(a.sections.trust.status, 'pending');
  assert.match(SO.decide(s, a.id, 'kyc', 'approved'), /Automatic checks failed \(Bank account name check/);
  assert.equal(SO.decide(s, a.id, 'kyc', 'approved', 'Cancelled cheque matches the GST name'), '');
  assert.match(SO.decide(s, a.id, 'trust', 'approved', 'ok'), /Video KYC/);
  assert.match(T.recordTrust(s, a, 'videoKyc', 'verified', ''), /Write what you saw/);
  assert.equal(T.recordTrust(s, a, 'videoKyc', 'verified', 'Owner matched Aadhaar; shop and stock seen'), '');
  approveAll(s, a); assert.equal(a.status, 'live');
}
// 5. Bihar (strict), low risk: identity and shop checks are a step; submit refused until done.
{
  const s = fresh(), a = draft(s, {where: BR});
  assert.deepEqual(a.trustRequired, ['digilocker', 'selfie', 'shopPhotos', 'videoKyc']);
  assert.ok(SO.visibleSteps(a).some(x => x.key === 'trust')); assert.match(SO.submit(s, a), /Identity and shop checks/);
  assert.match(SO.saveTrust(s, a, TRUST), /Verify Aadhaar with DigiLocker first/);
  const dl = (st, x, mobile = '9876543210') => { T.dlStart(st, x); assert.equal(T.dlSendOtp(st, x, mobile), ''); assert.equal(T.dlVerifyOtp(st, x, '123456'), ''); return T.dlConsent(st, x, true); };
  assert.equal(dl(s, a), '');
  assert.match(SO.saveTrust(s, a, {...TRUST, photoStock: ''}), /all three shop photos/);
  assert.equal(SO.saveTrust(s, a, TRUST), ''); assert.equal(a.trust.items.digilocker.status, 'verified');
  assert.equal(SO.submit(s, a), ''); assert.ok(!a.autoApproved, 'strict states never auto-approve'); assert.equal(a.status, 'submitted');
  assert.match(SO.decide(s, a.id, 'trust', 'approved', 'looks fine'), /Geo-tagged shop photos/);
  T.recordTrust(s, a, 'shopPhotos', 'verified', 'Signboard and stock match the address'); T.recordTrust(s, a, 'videoKyc', 'verified', 'Owner and shop seen on call');
  approveAll(s, a); assert.equal(a.status, 'live');
  assert.deepEqual(s.shopPartners[a.storeKey].probation.limits, {maxProducts: 30, maxOrderValue: 2000, cod: false, extraHoldDays: 14});
  assert.match(T.evidenceHtml(s, a), /strict state/);
}
// 6. Bihar food (medium) adds supplier invoices + field visit; flagged (high) adds a police certificate.
{
  const s = fresh(), a = draft(s, {where: BR, cats: ['food'], products: [['Toor Dal', 'food']]});
  assert.deepEqual(a.trustRequired, ['digilocker', 'selfie', 'shopPhotos', 'videoKyc', 'supplierInvoices', 'fieldVisit']);
  const s2 = fresh(), b = draft(s2, {where: BR, cats: ['food'], account: '123456789000', products: [['Toor Dal', 'food']]});
  assert.ok(b.trustRequired.includes('policeCert'));
  T.dlStart(s2, b); T.dlSendOtp(s2, b, '9876543210'); T.dlVerifyOtp(s2, b, '123456'); T.dlConsent(s2, b, true);
  assert.match(SO.saveTrust(s2, b, {...TRUST, policeCert: ''}), /police character certificate/);
}
// 7. Policy per state: strict needs a reason; switching Bihar to standard removes the extra step.
{
  const s = fresh();
  assert.equal(T.policyFor(s, '10'), 'strict'); assert.match(T.setPolicy(s, '08', 'strict', ''), /reason/);
  assert.equal(T.setPolicy(s, '08', 'strict', 'Fraud cases in Q3 seller audit'), ''); assert.equal(T.policyFor(s, '08'), 'strict');
  assert.equal(T.setPolicy(s, '10', 'standard'), ''); const a = draft(s, {where: BR}); assert.deepEqual(a.trustRequired, []);
  assert.match(T.policyHtml(s, SO.STATES), /strict in Rajasthan/);
}
// 8. Same PAN used by a different person → high risk; reviewers can't review their own application.
{
  const s = fresh(), a = draft(s); s.person = {id: 'P-OTHER', name: 'Other Person'};
  const b = SO.startApplication(s, {}); SO.saveType(s, b, {sellerType: 'shop', categories: ['household'], legalName: 'Other Traders'});
  b.kyc = {...a.kyc}; b.store = {...UP.store, name: 'Other Mart'};
  assert.equal(T.risk(s, b).level, 'high'); assert.ok(T.duplicates(s, b)[0].includes('Same PAN'));
  SO.submit(s, a); assert.match(SO.decide(s, a.id, 'store', 'approved', 'fine', {id: 'P-NEW', name: 'Ramesh'}), /own application/);
}
// 9. Probation limits: product cap, no COD, order cap, extra payout hold; early end needs a reason.
{
  const s = fresh(), a = draft(s); SO.submit(s, a); const k = a.storeKey, p = s.shopPartners[k];
  p.probation.limits.maxProducts = 2;
  const prod = (n, o = {}) => ({name: n, size: '1 l', category: 'Home cleaning', vegStatus: 'not_applicable', price: 90, mrp: 120, quantity: 50, lowStockAt: 3, status: 'active', ...o});
  assert.equal(Inventory.saveProduct(s, k, null, prod('Glass Cleaner')), '');
  assert.match(Inventory.saveProduct(s, k, null, prod('Tile Cleaner')), /up to 2 products during probation/);
  const item = Inventory.forStore(s, k).find(x => x.name === 'Glass Cleaner');
  assert.match(O.placeOrder(s, {productId: item.id, qty: 1, address: '12 Road', method: 'cod'}).error, /new store: pay by UPI or card/);
  p.probation.limits.maxOrderValue = 150;
  assert.match(O.placeOrder(s, {productId: item.id, qty: 2, address: '12 Road', method: 'upi', vpa: 'c@okaxis'}).error, /orders up to ₹150/);
  assert.equal(Plus.holdDays(s, {party: p.party, items: [{productId: item.id}]}) >= 7, true);
  assert.match(T.endProbation(s, k, 'Admin', ''), /Write why/); assert.equal(T.endProbation(s, k, 'Admin', 'Verified offline sales history'), ''); assert.equal(p.probation.active, false);
}
// 10. Expiry rules (FSSAI: 30% or 45 days at delivery) and date checks.
{
  assert.equal(SL.sellable({mfgDate: iso(-30), expiryDate: iso(50)}), true);
  assert.equal(SL.sellable({mfgDate: iso(-300), expiryDate: iso(40)}), false, '40 days and 12% left');
  assert.equal(SL.sellable({mfgDate: iso(-2), expiryDate: iso(5)}), true, 'short-life item with 70% left');
  assert.equal(SL.sellable({expiryDate: iso(-1)}), false); assert.equal(SL.sellable({}), true, 'no dates = older listing');
  assert.match(SL.checkDates({category: 'Rice, grains & cereals', batch: '', mfgDate: iso(-1), expiryDate: iso(200)}), /batch/);
  assert.match(SL.checkDates({category: 'Rice, grains & cereals', batch: 'B', mfgDate: iso(-300), expiryDate: iso(20)}), /too close to expiry/);
  assert.equal(SL.checkDates({category: 'Fresh vegetables'}), '', 'loose produce has no pack dates');
  const s = fresh(), a = SO.startApplication(s, {}); SO.saveType(s, a, {sellerType: 'shop', categories: ['food'], legalName: 'X Foods'});
  assert.match(SO.addProduct(s, a, {name: 'Toor Dal', category: 'food', price: 100, mrp: 120, size: '1 kg', stock: 5}), /batch/);
  // Catalogue: a published item that reaches the cut-off is hidden automatically.
  const p = s.products.find(x => x.fulfilmentPartner === 'ABC Grocery' && Inventory.published(x));
  Object.assign(p, {mfgDate: iso(-300), expiryDate: iso(10)}); assert.equal(Inventory.published(p), false);
}
// 11. Customer reports an expired item: line refunded, product paused, seller strike; 3 strikes suspend.
{
  const s = fresh(), a = draft(s); SO.submit(s, a); const k = a.storeKey, partner = s.shopPartners[k];
  const item = s.products.find(x => x.fulfilmentPartner === partner.name);
  const o = {id: 'ORD-X1', status: 'delivered', deliveredAt: Date.now(), items: [{productId: item.id, quantity: 1, name: item.name, unitPrice: 100}], fulfilmentPartner: partner.name, party: partner.party, history: []};
  s.customerOrders.unshift(o);
  assert.match(O.reportExpired(s, o, {productId: item.id, photo: ''}), /photo/);
  assert.equal(O.reportExpired(s, o, {productId: item.id, photo: 'expiry.jpg'}), '');
  assert.equal(partner.strikes, 1); assert.equal(item.status, 'paused'); assert.ok(s.ledger.some(x => x.orderId === 'ORD-X1' && x.type === 'refund'));
  assert.match(O.reportExpired(s, o, {productId: item.id, photo: 'expiry.jpg'}), /already reported/);
  T.addStrike(s, k, 'test'); T.addStrike(s, k, 'test'); assert.equal(partner.suspended, true);
  assert.ok(s.notifications.some(n => n.to === 'admin' && /suspended after 3 strikes/.test(n.text)));
}
// 12. UPI: pays MoveAI (not the customer), only the bank confirms, unpaid orders expire and release stock.
{
  const s = fresh(), p = s.products.find(x => x.fulfilmentPartner === 'ABC Grocery' && Inventory.published(x)), before = Inventory.available(p);
  const r = O.placeOrder(s, {productId: p.id, qty: 1, address: '12 Road', method: 'upi', vpa: 'customer@okaxis'});
  assert.equal(r.order.status, 'payment_pending'); assert.match(r.upiLink, /pa=moveai\.orders%40example/); assert.doesNotMatch(r.upiLink, /customer/);
  assert.equal(O.checkPayment(s, r.order), 'waiting'); assert.equal(O.minutesLeft(r.order), 15);
  assert.equal(O.expireUnpaid(s, Date.now() + 16 * 60000), 1); assert.equal(r.order.status, 'cancelled'); assert.equal(Inventory.available(p), before);
  const r2 = O.placeOrder(s, {productId: p.id, qty: 1, address: '12 Road', method: 'upi', vpa: 'customer@okaxis'});
  assert.equal(O.bankConfirmPayment(s, r2.order, true), ''); assert.equal(r2.order.status, 'paid');
}
console.log(JSON.stringify({status: 'PASS', suite: 'Seller trust: pincode, risk tiers, Bihar strict checks, policy, duplicates, self-review, probation, expiry, strikes, UPI fix'}));
