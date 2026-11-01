// Seller onboarding ("Add a business → Sell products"): every scenario from the onboarding design.
import assert from 'node:assert/strict';
import * as SO from '../js/seller-onboarding.js';
import {SEED} from '../js/mock-data.js';
import {ROLE_CONFIG, allowedRoutes} from '../js/config.js';
import {PRODUCTS, productForWorkspace} from '../js/products.js';
import {SELLER_WORKSPACES, STORE_BY_MANAGER, storeTemplate} from '../js/seller-roles.js';
import * as WH from '../js/workspace-hub.js';

const fresh = (person = {id: 'P-NEW', name: 'Ramesh Gupta'}) => ({...JSON.parse(JSON.stringify(SEED)), person});
const GOOD = {pan: 'ABCDE1234F', gstin: '09ABCDE1234F1Z5', account: '123456789012', ifsc: 'SBIN0001234'};
const STORE = {storeName: 'Gupta Mart', branchName: 'Sector 62', address: '12 Sector 62, Noida', city: 'Noida', stateCode: '09', open: '08:00', close: '21:00', radiusKm: 5};
function filled(s, {type = 'shop', cats = ['food', 'electrical'], kyc = GOOD, fssai = true, brand = false, store = STORE, mode = 'moveai', products = [['Toor Dal', 'food'], ['LED Bulb 12W', 'electrical']], source = null} = {}) {
  const a = SO.startApplication(s, {sourceBusiness: source});
  assert.equal(SO.saveType(s, a, {sellerType: type, categories: cats, legalName: source ? a.legalName : 'Gupta Traders'}), '');
  assert.equal(SO.saveKyc(s, a, kyc), '');
  assert.equal(SO.saveLicences(s, a, {fssai: fssai ? '12345678901234' : '', fssaiExpiry: '2030-01-01', brandProof: brand ? 'brand-invoice.pdf' : ''}), '');
  assert.equal(SO.saveStore(s, a, store), '');
  assert.equal(SO.saveDelivery(s, a, {mode}), '');
  assert.equal(SO.saveAgreement(s, a, {accept: true}), '');
  for (const [name, category] of products) assert.equal(SO.addProduct(s, a, {name, category, price: 100, mrp: 120, size: '1 kg', stock: 10}), '');
  return a;
}
const approveAll = (s, a) => { for (const k of Object.keys(a.sections)) if (a.sections[k].status === 'pending') assert.equal(SO.decide(s, a.id, k, 'approved'), ''); };

// 1. A customer opens a grocery shop with GST: full flow, store workspace appears after approval.
{
  const s = fresh(), a = filled(s, {cats: ['food'], products: [['Toor Dal', 'food']]});
  assert.equal(SO.submit(s, a), ''); assert.equal(a.status, 'submitted');
  assert.equal(a.storeKey, null, 'no store before approval');
  approveAll(s, a);
  assert.equal(a.status, 'live'); const k = a.storeKey;
  assert.ok(s.workspaces.includes(k) && SELLER_WORKSPACES.includes(k));
  assert.equal(ROLE_CONFIG[k].label, 'Gupta Mart'); assert.equal(storeTemplate(k), 'grocery');
  assert.equal(productForWorkspace(k), 'seller'); assert.ok(PRODUCTS.seller.roles.includes(k)); assert.equal(WH.appOf(productForWorkspace(k)), 'business');
  for (const r of ['shopOrders', 'shopCatalog', 'shopTeam', 'shopEarnings']) assert.ok(allowedRoutes(k).has(r), r);
  assert.ok(STORE_BY_MANAGER[`${k}Manager`] === k, 'manager workspace registered for later invites');
  assert.equal(s.products.find(p => p.fulfilmentPartner === 'Gupta Mart').status, 'active');
  assert.equal(s.shopPartners[k].onboarding.gstin, GOOD.gstin);
  assert.ok(s.notifications.some(n => n.to === k && /approved/.test(n.text)));
}
// 2. Home seller without GST: only GST-exempt (fresh) categories; Aadhaar required.
{
  const s = fresh(), a = SO.startApplication(s);
  SO.saveType(s, a, {sellerType: 'individual', categories: ['fresh', 'food'], legalName: 'Asha Home Foods'});
  assert.match(SO.saveKyc(s, a, {pan: 'ABCDE1234F', nonGst: true, aadhaar: '234567890123', account: '123456789012', ifsc: 'SBIN0001234'}), /GSTIN is needed to sell Packaged food/);
  SO.saveType(s, a, {sellerType: 'individual', categories: ['fresh'], legalName: 'Asha Home Foods'});
  assert.match(SO.saveKyc(s, a, {pan: 'ABCDE1234F', nonGst: true, aadhaar: '12', account: '123456789012', ifsc: 'SBIN0001234'}), /Aadhaar/);
  assert.equal(SO.saveKyc(s, a, {pan: 'ABCDE1234F', nonGst: true, aadhaar: '234567890123', account: '123456789012', ifsc: 'SBIN0001234'}), '');
  assert.equal(a.kyc.aadhaarLast4, '0123'); assert.equal(a.kyc.gstState, '');
  const shop = SO.startApplication(fresh({id: 'P-2', name: 'X'}));
  SO.saveType(s, shop, {sellerType: 'shop', categories: ['fresh'], legalName: 'Shop Co'});
  assert.match(SO.saveKyc(s, shop, {pan: 'ABCDE1234F', nonGst: true, aadhaar: '234567890123', account: '123456789012', ifsc: 'SBIN0001234'}), /Only individual sellers/);
}
// 3. Electricals without brand papers: store goes live for other categories; electricals locked until papers are approved.
{
  const s = fresh(), a = filled(s);
  SO.submit(s, a); assert.equal(a.sections.brand.status, 'not_provided');
  approveAll(s, a);
  assert.equal(a.status, 'live_partial'); assert.deepEqual(SO.liveCategories(a), ['food']);
  const bulb = s.products.find(p => p.name === 'LED Bulb 12W'); assert.equal(bulb.status, 'paused');
  assert.equal(SO.saveLicences(s, a, {brandProof: 'invoice.pdf'}), ''); assert.equal(a.sections.brand.status, 'pending');
  assert.equal(SO.decide(s, a.id, 'brand', 'approved'), ''); assert.equal(a.status, 'live'); assert.equal(bulb.status, 'active');
  assert.equal(storeTemplate(a.storeKey), 'grocery', 'template follows the first live category');
}
// 4. Existing logistics business adds "Sell products": PAN, GST and bank reused; KYC auto-approved.
{
  const s = fresh(), a = SO.startApplication(s, {sourceBusiness: 'transporter'});
  assert.equal(a.legalName, 'Raj Logistics'); assert.ok(a.kyc.reused && a.kyc.gstin);
  assert.equal(SO.saveType(s, a, {sellerType: 'shop', categories: ['household'], legalName: 'Raj Logistics'}), '');
  assert.equal(SO.saveKyc(s, a, {}), '', 'nothing to re-enter');
  const store = {...STORE, storeName: 'Raj Home Needs', stateCode: a.kyc.gstState, city: 'Noida'};
  assert.equal(SO.saveStore(s, a, store), ''); SO.saveDelivery(s, a, {mode: 'own'}); SO.saveAgreement(s, a, {accept: true});
  SO.addProduct(s, a, {name: 'Floor Cleaner', category: 'household', price: 99, mrp: 120, size: '1 l', stock: 5});
  assert.equal(SO.submit(s, a), ''); assert.equal(a.sections.kyc.status, 'approved');
  approveAll(s, a); assert.equal(a.status, 'live'); assert.equal(s.shopPartners[a.storeKey].deliveryMode, 'own');
}
// 5. Chain with a branch in another state: blocked until that state's GSTIN is used.
{
  const s = fresh(), a = SO.startApplication(s);
  SO.saveType(s, a, {sellerType: 'brand', categories: ['fashion'], legalName: 'City Wear'}); SO.saveKyc(s, a, GOOD);
  assert.match(SO.saveStore(s, a, {...STORE, storeName: 'City Wear', stateCode: '27', city: 'Mumbai'}), /GSTIN is registered in Uttar Pradesh/);
}
// 6. Grocery and electricals in one store, different return rules (both categories live once papers approved).
{ const s = fresh(), a = filled(s, {brand: true}); SO.submit(s, a); approveAll(s, a); assert.deepEqual(SO.liveCategories(a).sort(), ['electrical', 'food']); }
// 7. Store staff member opens their own shop: separate business, staff membership untouched.
{
  const s = fresh({id: 'PICK-001', name: 'Asha Picker'}); const before = JSON.stringify(s.pickerStaff);
  const a = filled(s, {cats: ['fashion'], products: [['Cotton Kurta', 'fashion']], store: {...STORE, storeName: 'Asha Kurtis'}}); SO.submit(s, a); approveAll(s, a);
  assert.equal(JSON.stringify(s.pickerStaff), before); assert.ok(s.workspaces.includes(a.storeKey) && s.workspaces.includes('picker'));
}
// 8–13. KYC problems.
{
  const s = fresh(), a = SO.startApplication(s); SO.saveType(s, a, {sellerType: 'shop', categories: ['food'], legalName: 'Test Co'});
  assert.match(SO.saveKyc(s, a, {...GOOD, gstin: '09ABCDE1234F1Z9'}), /cancelled/, 'cancelled GSTIN');
  assert.match(SO.saveKyc(s, a, {...GOOD, account: '123456789000'}), /cancelled cheque/, 'bank name mismatch needs cheque');
  assert.equal(SO.saveKyc(s, a, {...GOOD, account: '123456789000', chequeFile: 'cheque.jpg'}), ''); assert.equal(a.kyc.bank.verified, false, 'payouts stay off');
  assert.match(SO.saveKyc(s, a, {...GOOD, pan: 'ZZZZZ9999Z'}), /does not match the GSTIN/, 'PAN/GSTIN mismatch');
  assert.match(SO.saveKyc(s, a, {...GOOD, pan: 'BAD'}), /valid PAN/);
  s.shopPartners.grocery.onboarding = {gstin: GOOD.gstin};
  assert.match(SO.saveKyc(s, a, GOOD), /already registered by ABC Grocery/, 'duplicate GSTIN');
  assert.match(SO.saveLicences(s, a, {fssai: '123', fssaiExpiry: '2030-01-01'}), /14 digits/);
  assert.match(SO.saveLicences(s, a, {fssai: '12345678901234', fssaiExpiry: '2020-01-01'}), /expired/, 'expired FSSAI');
}
// FSSAI missing: food locked, other categories still go live.
{
  const s = fresh(), a = filled(s, {cats: ['food', 'household'], fssai: false, products: [['Toor Dal', 'food'], ['Floor Cleaner', 'household']]});
  SO.submit(s, a); assert.equal(a.sections.food.status, 'not_provided'); approveAll(s, a);
  assert.deepEqual(SO.liveCategories(a), ['household']); assert.equal(a.status, 'live_partial');
  assert.equal(storeTemplate(a.storeKey), 'grocery');
}
// Only food chosen and no FSSAI: core approved but nothing can go live.
{
  const s = fresh(), a = filled(s, {cats: ['food'], fssai: false, products: [['Toor Dal', 'food']]}); SO.submit(s, a); approveAll(s, a);
  assert.equal(a.storeKey, null); assert.match(a.blocker, /No category can go live/);
}
// 14–15. Listing checks: price above MRP, restricted items, category not selected, stock.
{
  const s = fresh(), a = SO.startApplication(s); SO.saveType(s, a, {sellerType: 'shop', categories: ['food'], legalName: 'Test Co'});
  assert.match(SO.addProduct(s, a, {name: 'Toor Dal', category: 'food', price: 200, mrp: 150, size: '1 kg', stock: 1}), /above the MRP/);
  for (const n of ['Paracetamol tablet', 'Kingfisher Beer', 'Gold Flake Cigarette', 'Diwali Crackers']) assert.match(SO.addProduct(s, a, {name: n, category: 'food', price: 10, mrp: 10, size: '1', stock: 1}), /restricted/, n);
  assert.match(SO.addProduct(s, a, {name: 'LED Bulb', category: 'electrical', price: 10, mrp: 10, size: '9 W', stock: 1}), /selected categories/);
  assert.match(SO.addProduct(s, a, {name: 'Toor Dal', category: 'food', price: 10, mrp: 10, size: '1 kg', stock: -1}), /Stock/);
}
// Submit needs every step and at least one product.
{
  const s = fresh(), a = SO.startApplication(s); SO.saveType(s, a, {sellerType: 'shop', categories: ['food'], legalName: 'Test Co'});
  assert.match(SO.submit(s, a), /At least one product/); assert.deepEqual(SO.missingSteps(a), [2, 4, 5, 6, 7]);
}
// Correction reopens only that section; resubmission goes back to review; rejection of a core section rejects.
{
  const s = fresh(), a = filled(s, {cats: ['food'], products: [['Toor Dal', 'food']]}); SO.submit(s, a);
  assert.match(SO.decide(s, a.id, 'store', 'correction', ''), /reason/);
  assert.equal(SO.decide(s, a.id, 'store', 'correction', 'Shop photo address does not match'), '');
  approveAll(s, a); assert.equal(a.status, 'correction_required'); assert.equal(a.storeKey, null);
  assert.match(SO.saveDelivery(s, a, {mode: 'pickup'}), /locked/, 'approved sections stay locked');
  assert.equal(SO.saveStore(s, a, {...STORE, address: '12 Main Market, Sector 62, Noida'}), ''); assert.equal(a.sections.store.status, 'pending');
  assert.equal(SO.submit(s, a), ''); assert.equal(a.status, 'submitted');
  assert.equal(SO.decide(s, a.id, 'store', 'approved'), ''); assert.equal(a.status, 'live');
  const s2 = fresh(), b = filled(s2, {cats: ['food'], products: [['Toor Dal', 'food']]}); SO.submit(s2, b);
  assert.equal(SO.decide(s2, b.id, 'kyc', 'rejected', 'Documents appear altered'), ''); assert.equal(b.status, 'rejected');
}
// 21–23. Delivery choice: outside courier coverage; pickup-only enforced at checkout.
{
  const s = fresh(), a = SO.startApplication(s); SO.saveType(s, a, {sellerType: 'shop', categories: ['food'], legalName: 'Test Co'}); SO.saveKyc(s, a, {...GOOD, gstin: '08ABCDE1234F1Z5'});
  assert.equal(SO.saveStore(s, a, {...STORE, storeName: 'Ajmer Kirana', city: 'Ajmer', stateCode: '08'}), '');
  assert.match(SO.saveDelivery(s, a, {mode: 'moveai'}), /do not cover Ajmer/);
  assert.equal(SO.saveDelivery(s, a, {mode: 'pickup'}), '');
  const s3 = fresh(), c = filled(s3, {cats: ['food'], mode: 'pickup', products: [['Toor Dal', 'food']]}); SO.submit(s3, c); approveAll(s3, c);
  assert.equal(SO.deliveryModeOf(s3, 'Gupta Mart'), 'pickup');
}
// Duplicate store names are refused.
{ const s = fresh(), a = SO.startApplication(s); SO.saveType(s, a, {sellerType: 'shop', categories: ['food'], legalName: 'Test'}); SO.saveKyc(s, a, GOOD); assert.match(SO.saveStore(s, a, {...STORE, storeName: 'ABC Grocery'}), /already exists/); }
// Registration survives a reload (registerAll from saved onboardedStores).
{
  const s = fresh(), a = filled(s, {cats: ['fashion'], products: [['Cotton Kurta', 'fashion']], store: {...STORE, storeName: 'Kurta Corner'}}); SO.submit(s, a); approveAll(s, a);
  const saved = JSON.parse(JSON.stringify(s)); SO.registerAll(saved);
  assert.equal(ROLE_CONFIG[a.storeKey].label, 'Kurta Corner'); assert.equal(storeTemplate(a.storeKey), 'fashion');
  assert.ok(SO.inProgress(saved).every(x => x.id !== a.id), 'live stores leave the in-progress list');
}
console.log(JSON.stringify({status: 'PASS', suite: 'Seller onboarding: full flow, home seller, licences, KYC failures, reuse, listings, corrections, delivery choice, persistence'}));
