// Product listing by a seller who joined through "Sell products": the store owner can add, edit and
// import products, but only in approved categories, with MRP and restricted-item checks.
import assert from 'node:assert/strict';
import * as SO from '../js/seller-onboarding.js';
import * as Inventory from '../js/grocery-inventory.js';
import * as CSV from '../js/catalog-csv.js';
import {SEED} from '../js/mock-data.js';
import {selectedBranch} from '../js/seller-branches.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'P-NEW', name: 'Ramesh Gupta'}});
const iso = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const DATES = {batch: 'B-2611', mfgDate: iso(-30), expiryDate: iso(300)};
const GOOD = {pan: 'ABCDE1234F', gstin: '09ABCDE1234F1Z5', account: '123456789012', ifsc: 'SBIN0001234'};
const STORE = {storeName: 'Gupta Mart', branchName: 'Sector 62', address: '12 Sector 62, Noida', city: 'Noida', pincode: '201301', stateCode: '09', open: '00:00', close: '23:59', radiusKm: 5};
function liveStore(cats = ['food', 'electrical'], {brand = false, products = [['Toor Dal', 'food'], ['LED Bulb 12W', 'electrical']]} = {}) {
  const s = fresh(), a = SO.startApplication(s, {});
  assert.equal(SO.saveType(s, a, {sellerType: 'shop', categories: cats, legalName: 'Gupta Traders'}), '');
  assert.equal(SO.saveKyc(s, a, GOOD), '');
  assert.equal(SO.saveLicences(s, a, {fssai: '12345678901234', fssaiExpiry: '2030-01-01', brandProof: brand ? 'invoice.pdf' : ''}), '');
  assert.equal(SO.saveStore(s, a, STORE), '');
  assert.equal(SO.saveDelivery(s, a, {mode: 'moveai'}), '');
  assert.equal(SO.saveAgreement(s, a, {accept: true}), '');
  for (const [name, category] of products) assert.equal(SO.addProduct(s, a, {name, category, price: 100, mrp: 120, size: '1 kg', stock: 10, ...DATES}), '');
  assert.equal(SO.submit(s, a), '');
  for (const k of Object.keys(a.sections)) if (a.sections[k].status === 'pending') assert.equal(SO.decide(s, a.id, k, 'approved'), '');
  return {s, a, k: a.storeKey};
}
const item = (o = {}) => ({name: 'Basmati Rice', size: '5 kg', category: 'Rice, grains & cereals', vegStatus: 'vegetarian', price: 450, mrp: 520, quantity: 20, lowStockAt: 3, status: 'active', ...DATES, ...o});

// 1. The bug: a new store owner could not add products at all (form hidden, save refused).
{
  const {s, k} = liveStore();
  assert.equal(Inventory.canCatalog(s, k), true, 'new store owner manages the catalogue');
  const html = Inventory.catalogScreen(s, k);
  assert.ok(html.includes('id="catalog-add-product"'), 'Add product form shown');
  assert.ok(html.includes('data-commerce="catalog-csv-preview"'), 'CSV import shown');
  assert.ok(html.includes('data-catalog-mrp'), 'MRP field shown');
  assert.match(html, /You can list in: Packaged food/);
  assert.match(html, /Locked until approved: Electricals/);
  assert.match(html, /locked — awaiting category approval/, 'locked onboarding product labelled');
  assert.equal(Inventory.saveProduct(s, k, null, item()), '');
  const p = Inventory.forStore(s, k).find(x => x.name === 'Basmati Rice');
  assert.equal(p.mrp, 520); assert.equal(p.fulfilmentPartner, 'Gupta Mart');
  assert.equal(Inventory.published(p), true, 'live for customers straight away in an approved category');
}
// 2. Only approved categories are offered and accepted.
{
  const {s, k} = liveStore();
  const html = Inventory.catalogScreen(s, k);
  const select = html.match(/<select class="form-control" data-catalog-category>([\s\S]*?)<\/select>/)[1];
  assert.ok(select.includes('Rice, grains &amp; cereals')); assert.ok(!select.includes('Electrical &amp; lighting')); assert.ok(!select.includes('Fashion'));
  assert.ok(!select.includes('Fresh vegetables'), 'packaged food does not open fresh produce');
  assert.match(Inventory.saveProduct(s, k, null, item({name: 'Bulb 9W', size: '9 W', category: 'Electrical & lighting', vegStatus: 'not_applicable'})), /not approved for your store yet/);
}
// 3. Listing checks: MRP required for packaged goods, price ≤ MRP, restricted items, duplicates.
{
  const {s, k} = liveStore();
  assert.match(Inventory.saveProduct(s, k, null, item({mrp: ''})), /MRP printed on the pack/);
  assert.match(Inventory.saveProduct(s, k, null, item({price: 600})), /above the MRP/);
  assert.match(Inventory.saveProduct(s, k, null, item({mrp: 'abc'})), /MRP must be/);
  assert.match(Inventory.saveProduct(s, k, null, item({name: 'Cough Syrup', size: '100 ml'})), /restricted item/);
  assert.equal(Inventory.saveProduct(s, k, null, item()), '');
  assert.match(Inventory.saveProduct(s, k, null, item()), /already exist/);
  assert.equal(Inventory.saveProduct(s, k, null, item({name: 'Rice draft', status: 'draft'})), '', 'drafts allowed');
}
// 4. Fresh produce: loose items have no printed MRP, so it is optional.
{
  const {s, k} = liveStore(['fresh'], {products: [['Tomato', 'fresh']]});
  assert.equal(Inventory.saveProduct(s, k, null, item({name: 'Onion', size: '1 kg', category: 'Fresh vegetables', mrp: '', price: 40})), '');
}
// 5. Editing price and stock later; MRP still enforced.
{
  const {s, k} = liveStore();
  Inventory.saveProduct(s, k, null, item());
  const p = Inventory.forStore(s, k).find(x => x.name === 'Basmati Rice');
  assert.equal(Inventory.saveProduct(s, k, p.id, item({price: 480, quantity: 12})), '');
  assert.equal(p.price, 480); assert.equal(Inventory.available(p, selectedBranch(s, k)), 12);
  assert.match(Inventory.saveProduct(s, k, p.id, item({price: 700})), /above the MRP/);
}
// 6. CSV import for the new store: template uses an approved category; mrp column optional.
{
  const {s, k} = liveStore();
  const tpl = CSV.template(k, Inventory.approvedCategories(s, k)[0]);
  assert.match(tpl.split('\r\n')[0], /,mrp,batch,mfg_date,expiry_date$/);
  const csv = tpl.replace('EXAMPLE-001', 'GM-001').replace('Example item', 'Sona Masoori').replace('Example,draft', 'Example,active');
  const pv = CSV.preview(s, k, csv, Inventory); assert.equal(pv.error, undefined, pv.error);
  assert.equal(CSV.commit(s, k, pv, Inventory), '');
  assert.ok(Inventory.forStore(s, k).some(x => x.sku === 'GM-001' && x.mrp === 199));
  const noMrp = `${CSV.HEADERS.join(',')}\r\nGM-002,Poha,500 g,"Rice, grains & cereals",,vegetarian,40,5,2,X,active\r\n`;
  assert.match(CSV.preview(s, k, noMrp, Inventory).error, /Row 2: Enter the MRP/, 'new store still needs MRP');
  const bad = `${CSV.HEADERS_MRP.join(',')}\r\nGM-003,Bulb,9 W,"Electrical & lighting",,not_applicable,90,5,2,X,active,120\r\n`;
  assert.match(CSV.preview(s, k, bad, Inventory).error, /not approved/);
}
// 7. Brand papers approved later unlock electrical listings.
{
  const {s, a, k} = liveStore();
  assert.equal(SO.saveLicences(s, a, {fssai: '12345678901234', fssaiExpiry: '2030-01-01', brandProof: 'invoice.pdf'}), '');
  assert.equal(SO.decide(s, a.id, 'brand', 'approved'), '');
  assert.equal(Inventory.saveProduct(s, k, null, item({name: 'Bulb 9W', size: '9 W', category: 'Electrical & lighting', vegStatus: 'not_applicable', price: 90, mrp: 120})), '');
  assert.doesNotMatch(Inventory.catalogScreen(s, k), /Locked until approved/);
}
// 8. Demo stores keep their old behaviour (MRP optional, same category rules).
{
  const s = fresh();
  assert.equal(Inventory.saveProduct(s, 'grocery', null, item({mrp: ''})), '');
  assert.match(Inventory.saveProduct(s, 'electrical', null, item({name: 'X rice'})), /approved for this store/);
  assert.doesNotMatch(Inventory.catalogScreen(s, 'grocery'), /You can list in/);
}
console.log(JSON.stringify({status: 'PASS', suite: 'Seller listing: new store can add, edit and import products; approved categories, MRP and restricted-item checks'}));
