// MoveAI One — "Add a business → Sell products": seller onboarding for any signed-in person.
// Modelled on Grab (store form → review in 3–5 working days → contract → menu → open), Amazon India
// (reuse the customer login, GSTIN or "non-GST categories only", pickup address in the GST state, list at
// least one product before launch, Easy Ship vs Self Ship) and Lazada (individual vs company sellers,
// bank name must match). Each section is reviewed on its own, so one bad document never blocks the rest.
//
// PROTOTYPE LIMIT: GST, bank and licence checks use the simulated providers in verify-sim.js, and all
// records live in browser storage. In production every check and decision runs on the server.
import {gstLookup, pennyDrop} from './verify-sim.js';
import {ROLE_CONFIG} from './config.js';
import {registerStoreKeys, MANAGER_BY_STORE, WORKER_BY_STORE, SELLER_WORKSPACES} from './seller-roles.js';
import {WORKER_WS} from './worker-hub.js';
import {buyingProfiles} from './workspace-hub.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const pill = s => `<span class="status-pill ${s === 'approved' ? '' : s === 'pending' || s === 'submitted' ? 'info' : 'warning'}">${esc(LABEL[s] || s)}</span>`;
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const LABEL = {draft: 'Draft', submitted: 'Under review', pending: 'Under review', approved: 'Approved', correction: 'Needs correction', correction_required: 'Needs correction', rejected: 'Rejected', not_provided: 'Not provided', live: 'Live', live_partial: 'Live (some categories locked)', locked: 'Locked'};

// ---------- categories, seller types and coverage ----------
export const CATEGORIES = {
  fresh: {label: 'Fresh food (fruit, vegetables, dairy, bakery)', productCategory: 'Fresh vegetables', subcategory: 'Other vegetables', veg: 'vegetarian', food: true, gstExempt: true, template: 'grocery', commission: 8, holdDays: 7},
  food: {label: 'Packaged food', productCategory: 'Canned & packaged food', subcategory: 'Pickles', veg: 'vegetarian', food: true, gstExempt: false, template: 'grocery', commission: 8, holdDays: 7},
  household: {label: 'Home & personal care', productCategory: 'Home cleaning', subcategory: 'Surfaces', veg: 'not_applicable', food: false, gstExempt: false, template: 'grocery', commission: 8, holdDays: 7},
  electrical: {label: 'Electricals', productCategory: 'Electrical & lighting', subcategory: 'Bulbs', veg: 'not_applicable', food: false, gstExempt: false, template: 'electrical', brandProof: true, commission: 8, holdDays: 7},
  fashion: {label: 'Fashion', productCategory: 'Fashion & clothing', subcategory: 'Other clothing', veg: 'not_applicable', food: false, gstExempt: false, template: 'fashion', commission: 8, holdDays: 7},
};
export const SELLER_TYPES = {
  individual: {label: 'Individual / home seller', note: 'PAN and Aadhaar. Without GST you can sell only GST-exempt categories (fresh produce).'},
  shop: {label: 'Registered shop', note: 'Shop or business with a GSTIN.'},
  brand: {label: 'Brand or chain', note: 'Brand owner or authorised distributor; GSTIN and brand papers.'},
};
export const STATES = {'07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '06': 'Haryana', '27': 'Maharashtra', '29': 'Karnataka', '24': 'Gujarat', '19': 'West Bengal', '33': 'Tamil Nadu'};
export const COURIER_CITIES = ['Delhi', 'Noida', 'Gurugram', 'Ghaziabad', 'Jaipur', 'Patna'];
export const DELIVERY = {moveai: 'MoveAI couriers deliver', own: 'Our own delivery staff', pickup: 'Customers pick up at the store'};
// Shown steps only: step 3 (licences) is skipped when no chosen category needs one.
export const visibleSteps = a => STEPS.filter(s => s.key !== 'licences' || a.categories.some(c => CATEGORIES[c].food || c === 'electrical'));
import {RESTRICTED} from './grocery-categories.js';
import * as SD from './seller-delivery.js';
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const CORE = ['type', 'kyc', 'store', 'delivery', 'agreement', 'products'];

// ---------- application lifecycle ----------
const uid = p => `${p}-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const now = () => new Date().toLocaleString('en-IN');
export function apps(state) { return (state.sellerApplications ||= []); }
export function current(state) { return apps(state).find(a => a.id === state.currentSellerAppId) || null; }
export function mine(state) { const pid = state.person?.id || 'me'; return apps(state).filter(a => a.ownerId === pid); }

export function startApplication(state, {sourceBusiness = null} = {}) {
  const pid = state.person?.id || 'me';
  const open = apps(state).find(a => a.ownerId === pid && a.sourceBusiness === sourceBusiness && ['draft', 'correction_required'].includes(a.status));
  if (open) { state.currentSellerAppId = open.id; return open; }
  const a = {id: uid('SELL'), ownerId: pid, ownerName: state.person?.name || 'Seller', status: 'draft', step: 1, sourceBusiness,
    sellerType: sourceBusiness ? 'shop' : '', categories: [], legalName: sourceBusiness ? (ROLE_CONFIG[sourceBusiness]?.label || '') : '',
    kyc: {}, licences: {}, store: {}, delivery: '', agreement: {}, products: [], sections: {}, history: [{at: now(), text: 'Application started'}], storeKey: null};
  if (sourceBusiness) prefillFromBusiness(state, a);
  apps(state).unshift(a); state.currentSellerAppId = a.id; return a;
}
// An approved business adding "Sell products" reuses its verified PAN, GSTIN and bank.
export function prefillFromBusiness(state, a) {
  const prof = buyingProfiles(state, ROLE_CONFIG).find(p => p.key === a.sourceBusiness);
  const bp = state.businessProfiles?.[a.sourceBusiness];
  if (!prof?.gstin) return;
  a.kyc = {pan: prof.gstin.slice(2, 12), gstin: prof.gstin, gstState: prof.gstin.slice(0, 2), nonGst: false, reused: true,
    bank: {masked: bp?.bank?.maskedAccount || 'Verified account', verified: bp?.bank?.verificationStatus === 'verified', reused: true}};
}
export function requiredSections(a) {
  const s = ['type', 'kyc'];
  if (a.categories.some(c => CATEGORIES[c]?.food)) s.push('food');
  if (a.categories.includes('electrical')) s.push('brand');
  return [...s, 'store', 'delivery', 'agreement', 'products'];
}
export const STEPS = [
  {n: 1, key: 'type', title: 'Seller type and categories'},
  {n: 2, key: 'kyc', title: 'PAN, GST and bank'},
  {n: 3, key: 'licences', title: 'Licences for your categories'},
  {n: 4, key: 'store', title: 'Store and first branch'},
  {n: 5, key: 'delivery', title: 'How orders reach customers'},
  {n: 6, key: 'agreement', title: 'Fees and seller agreement'},
  {n: 7, key: 'products', title: 'First products'},
  {n: 8, key: 'review', title: 'Review and submit'},
];
const canEdit = (a, section) => a.status === 'draft' || (a.status === 'correction_required' && ['correction', 'not_provided'].includes(a.sections[section]?.status)) || (a.status !== 'draft' && ['food', 'brand'].includes(section) && a.sections[section]?.status === 'not_provided');

// ---------- step validation (each returns '' or an error) ----------
export function saveType(state, a, {sellerType, categories = [], legalName}) {
  if (!canEdit(a, 'type')) return 'This section is locked while it is reviewed.';
  if (!SELLER_TYPES[sellerType]) return 'Choose a seller type.';
  const cats = [...new Set([].concat(categories).filter(c => CATEGORIES[c]))];
  if (!cats.length) return 'Choose at least one category to sell.';
  if (String(legalName || '').trim().length < 3) return 'Enter the legal or business name (at least 3 characters).';
  Object.assign(a, {sellerType, categories: cats, legalName: String(legalName).trim()});
  if (a.kyc.nonGst && cats.some(c => !CATEGORIES[c].gstExempt)) a.kyc.needsGst = true;
  touch(a, 'type'); return '';
}
export function duplicateGstin(state, gstin, appId) {
  if (!gstin) return '';
  const used = Object.entries(state.shopPartners || {}).find(([, p]) => p.onboarding?.gstin === gstin);
  if (used) return used[1].name;
  const other = apps(state).find(x => x.id !== appId && x.kyc?.gstin === gstin && !x.kyc?.reused && x.status !== 'rejected');
  return other ? (other.legalName || 'another seller') : '';
}
export function saveKyc(state, a, {pan, gstin, nonGst, aadhaar, account, ifsc, holder, chequeFile}) {
  if (!canEdit(a, 'kyc')) return 'This section is locked while it is reviewed.';
  if (a.kyc.reused) { touch(a, 'kyc'); return ''; }
  const P = String(pan || '').toUpperCase().trim(), G = String(gstin || '').toUpperCase().trim(), noGst = nonGst === true || nonGst === 'on' || nonGst === 'true';
  if (!PAN_RE.test(P)) return 'Enter a valid PAN, e.g. ABCDE1234F.';
  if (noGst) {
    if (a.sellerType !== 'individual') return 'Shops and brands need a GSTIN. Only individual sellers can start without GST.';
    const taxable = a.categories.filter(c => !CATEGORIES[c].gstExempt);
    if (taxable.length) return `A GSTIN is needed to sell ${taxable.map(c => CATEGORIES[c].label).join(', ')}. Add a GSTIN or keep only fresh produce.`;
    if (!/^[2-9]\d{11}$/.test(String(aadhaar || '').replace(/\D/g, ''))) return 'Individual sellers without GST verify Aadhaar: enter the 12-digit number.';
  } else {
    const g = gstLookup(G, a.legalName);
    if (!g.ok) return g.reason;
    if (G.slice(2, 12) !== P) return 'This PAN does not match the GSTIN (characters 3–12 of a GSTIN are the PAN). Check both.';
    const dup = duplicateGstin(state, G, a.id);
    if (dup) return `This GSTIN is already registered by ${dup}. Ask the owner to add you as staff, or contact MoveAI support if it is yours.`;
  }
  const bank = pennyDrop({account, ifsc, name: holder || a.legalName});
  if (!bank.ok && !bank.fallback) return bank.reason;
  if (!bank.ok && bank.fallback && !chequeFile) return `${bank.reason} Attach the cancelled cheque to continue; payouts stay off until it is checked.`;
  a.kyc = {pan: P, gstin: noGst ? '' : G, gstState: noGst ? '' : G.slice(0, 2), nonGst: noGst, aadhaarLast4: noGst ? String(aadhaar).replace(/\D/g, '').slice(-4) : '',
    bank: bank.ok ? {masked: bank.data.masked, ifsc: bank.data.ifsc, verified: true} : {masked: `•••• ${String(account).replace(/\D/g, '').slice(-4)}`, ifsc: String(ifsc).toUpperCase(), verified: false, chequeFile: String(chequeFile)}};
  touch(a, 'kyc'); return '';
}
export function saveLicences(state, a, {fssai, fssaiExpiry, brandProof}) {
  const errs = [];
  if (a.categories.some(c => CATEGORIES[c].food) && (canEdit(a, 'food') || a.status === 'draft')) {
    const f = String(fssai || '').replace(/\D/g, '');
    if (f) {
      if (!/^\d{14}$/.test(f)) errs.push('FSSAI licence numbers have 14 digits.');
      else if (!fssaiExpiry || fssaiExpiry <= new Date().toISOString().slice(0, 10)) errs.push('This FSSAI licence has expired or has no expiry date. Renew it to sell food.');
      else a.licences.fssai = {number: f, expiry: fssaiExpiry};
    } else delete a.licences.fssai;
    reopen(a, 'food');
  }
  if (a.categories.includes('electrical') && (canEdit(a, 'brand') || a.status === 'draft')) {
    if (String(brandProof || '').trim()) a.licences.brandProof = String(brandProof).trim(); else delete a.licences.brandProof;
    reopen(a, 'brand');
  }
  if (errs.length) return errs.join(' ');
  touch(a, 'licences'); return '';
}
export function saveStore(state, a, {storeName, branchName, address, city, pincode, stateCode, open, close, radiusKm}) {
  if (!canEdit(a, 'store')) return 'This section is locked while it is reviewed.';
  if (String(storeName || '').trim().length < 3) return 'Enter the store name customers will see.';
  if (String(branchName || '').trim().length < 2) return 'Name the first branch, e.g. Sector 62.';
  if (String(address || '').trim().length < 8) return 'Enter the full pickup address.';
  if (String(city || '').trim().length < 2) return 'Enter the city.';
  if (!/^[1-9]\d{5}$/.test(String(pincode || '').trim())) return 'Enter the 6-digit pincode of the store.';
  if (!STATES[stateCode]) return 'Choose the state.';
  if (a.kyc.gstState && a.kyc.gstState !== stateCode) return `The store is in ${STATES[stateCode]}, but the GSTIN is registered in ${STATES[a.kyc.gstState] || 'another state'}. Add a GSTIN for ${STATES[stateCode]} or use an address in ${STATES[a.kyc.gstState]}.`;
  if (!open || !close || open >= close) return 'Opening time must be before closing time.';
  const r = Number(radiusKm); if (!Number.isFinite(r) || r < 1 || r > 20) return 'Delivery area must be 1 to 20 km.';
  const nameTaken = Object.values(state.shopPartners || {}).some(p => p.name.toLowerCase() === String(storeName).trim().toLowerCase()) || apps(state).some(x => x.id !== a.id && x.status !== 'rejected' && x.store?.name?.toLowerCase() === String(storeName).trim().toLowerCase());
  if (nameTaken) return 'A store with this name already exists. Choose a different store name.';
  a.store = {name: String(storeName).trim(), branchName: String(branchName).trim(), address: String(address).trim(), city: String(city).trim(), pincode: String(pincode).trim(), stateCode, open, close, radiusKm: r};
  touch(a, 'store'); return '';
}
// Quick setup used by the API and tests: one mode with sensible defaults (the form sends full details).
export function quickDelivery(mode, store = {}) {
  const v = {[mode]: true};
  if (mode === 'moveai') Object.assign(v, {handover: 'pickup', windows: ['09-12', '15-18'], maxKg: 10, packaging: true, courierCod: true, codLimit: 2000, openBox: true});
  if (mode === 'own') Object.assign(v, {ownRadius: Math.min(3, Number(store.radiusKm || 5)), ownFee: 20, freeAbove: 299, minOrder: 0, eta: 45, ownCod: true});
  if (mode === 'pickup') Object.assign(v, {prepMins: 20});
  return v;
}
export function saveDelivery(state, a, v = {}) {
  if (!canEdit(a, 'delivery')) return 'This section is locked while it is reviewed.';
  if (v.mode !== undefined) { if (!DELIVERY[v.mode]) return 'Choose how orders reach customers.'; v = quickDelivery(v.mode, a.store); }
  const r = SD.validate(v, a.store, a.categories);
  if (r.error) return r.error;
  a.delivery = r.plan; touch(a, 'delivery'); return '';
}
export function saveAgreement(state, a, {accept}) {
  if (!canEdit(a, 'agreement')) return 'This section is locked while it is reviewed.';
  if (!(accept === true || accept === 'on' || accept === 'true')) return 'Accept the seller agreement to continue.';
  a.agreement = {accepted: true, at: now(), terms: a.categories.map(c => ({category: c, commission: CATEGORIES[c].commission, holdDays: CATEGORIES[c].holdDays}))};
  touch(a, 'agreement'); return '';
}
export function checkProduct(a, p) {
  const name = String(p.name || '').trim(), price = Number(p.price), mrp = Number(p.mrp), stock = Number(p.stock);
  if (name.length < 3) return 'Enter the product name.';
  if (RESTRICTED.test(name)) return `“${name}” is a restricted item (medicines, alcohol, tobacco, firecrackers and similar cannot be sold here).`;
  if (!a.categories.includes(p.category)) return 'Choose one of your selected categories for this product.';
  if (!(price > 0) || !(mrp > 0)) return 'Enter a price and MRP above ₹0.';
  if (price > mrp) return 'Selling price cannot be above the MRP printed on the pack.';
  if (!Number.isInteger(stock) || stock < 0 || stock > 10000) return 'Stock must be a whole number from 0 to 10,000.';
  if (!String(p.size || '').trim()) return 'Enter the pack size, e.g. 1 kg or 9 W.';
  return '';
}
export function addProduct(state, a, p) {
  if (!canEdit(a, 'products')) return 'This section is locked while it is reviewed.';
  const e = checkProduct(a, p); if (e) return e;
  if (a.products.length >= 20) return 'Add up to 20 products here; upload more after approval.';
  a.products.push({id: uid('NP'), name: String(p.name).trim(), category: p.category, price: Number(p.price), mrp: Number(p.mrp), size: String(p.size).trim(), stock: Number(p.stock), brand: String(p.brand || '').trim()});
  touch(a, 'products'); return '';
}
export function removeProduct(state, a, id) {
  if (!canEdit(a, 'products')) return 'This section is locked while it is reviewed.';
  a.products = a.products.filter(p => p.id !== id); touch(a, 'products'); return '';
}
function touch(a, key) { a.history.unshift({at: now(), text: `Saved: ${key}`}); reopen(a, key); }
// A fixed section goes back to review; untouched sections keep their decision.
function reopen(a, key) {
  const k = key === 'licences' ? null : key;
  if (k && a.status !== 'draft' && ['correction', 'not_provided'].includes(a.sections[k]?.status)) a.sections[k] = {status: 'pending', note: ''};
}
export function missingSteps(a) {
  const m = [];
  if (!a.sellerType || !a.categories.length) m.push(1);
  if (!a.kyc.pan && !a.kyc.reused) m.push(2);
  if (!a.store.name) m.push(4);
  if (!a.delivery) m.push(5);
  if (!a.agreement.accepted) m.push(6);
  if (!a.products.length) m.push(7);
  return m;
}
export function submit(state, a) {
  if (!['draft', 'correction_required'].includes(a.status)) return 'Already submitted.';
  const m = missingSteps(a);
  if (m.length) return `Finish these steps first: ${m.map(n => STEPS.find(s => s.n === n).title).join(', ')}. At least one product is needed before review.`;
  if (a.status === 'draft') {
    for (const s of requiredSections(a)) {
      const provided = s === 'food' ? !!a.licences.fssai : s === 'brand' ? !!a.licences.brandProof : true;
      a.sections[s] = {status: s === 'kyc' && a.kyc.reused ? 'approved' : provided ? 'pending' : 'not_provided', note: s === 'kyc' && a.kyc.reused ? 'Reused from the approved business' : ''};
    }
  }
  if (Object.values(a.sections).some(x => x.status === 'correction')) return 'Fix the sections marked “Needs correction” first.';
  a.status = 'submitted'; a.submittedAt = now(); a.history.unshift({at: now(), text: 'Submitted for review (target 3–5 working days)'});
  (state.notifications ||= []).unshift({id: uid('NT'), to: 'admin', ref: a.id, text: `${a.id}: new seller application · ${a.store.name}`, read: false});
  return '';
}

// ---------- admin review, one section at a time ----------
export function decide(state, appId, section, decision, note = '') {
  const a = apps(state).find(x => x.id === appId);
  if (!a || !a.sections[section]) return 'Section not found.';
  if (!['approved', 'correction', 'rejected'].includes(decision)) return 'Choose approve, correction or reject.';
  if (decision !== 'approved' && String(note).trim().length < 5) return 'Write a reason the seller can act on.';
  if (a.sections[section].status === 'not_provided' && decision === 'approved') return 'Nothing was provided for this section yet.';
  a.sections[section] = {status: decision, note: String(note).trim(), at: now()};
  a.history.unshift({at: now(), text: `${section}: ${decision}${note ? ` — ${note}` : ''}`});
  evaluate(state, a);
  const to = a.sourceBusiness || 'personal';
  (state.notifications ||= []).unshift({id: uid('NT'), to, ref: a.id, route: 'sellStatus', text: `${a.id}: ${LABEL[decision] || decision} · ${section}${note ? ` — ${note}` : ''}`, read: false});
  return '';
}
export function liveCategories(a) {
  return a.categories.filter(c => {
    if (CATEGORIES[c].food && a.sections.food?.status !== 'approved') return false;
    if (c === 'electrical' && a.sections.brand?.status !== 'approved') return false;
    if (a.kyc.nonGst && !CATEGORIES[c].gstExempt) return false;
    return true;
  });
}
export function evaluate(state, a) {
  if (CORE.some(s => a.sections[s]?.status === 'rejected')) { a.status = 'rejected'; return; }
  if (Object.values(a.sections).some(x => x.status === 'correction')) { a.status = a.storeKey ? 'live' : 'correction_required'; return; }
  const coreOk = CORE.every(s => a.sections[s]?.status === 'approved');
  if (!coreOk) { if (!a.storeKey) a.status = 'submitted'; return; }
  const live = liveCategories(a);
  if (!live.length) { a.status = 'submitted'; a.blocker = 'No category can go live yet: approve a licence section or add an allowed category.'; return; }
  a.blocker = '';
  goLive(state, a, live);
  a.status = live.length === a.categories.length ? 'live' : 'live_partial';
}

// ---------- creating the store ----------
const slug = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const initials = n => String(n || '').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
export function registerRuntimeStore(state, rec) {
  const keys = registerStoreKeys(rec.key, rec.template);
  const cat = CATEGORIES[rec.mainCategory] || {label: 'Store'};
  ROLE_CONFIG[rec.key] = {...ROLE_CONFIG[rec.template], label: rec.name, subtitle: `${cat.label} · Approved`};
  ROLE_CONFIG[keys.manager] = {...ROLE_CONFIG[MANAGER_BY_STORE[rec.template]], label: `${rec.name} manager`};
  ROLE_CONFIG[keys.worker] = {...ROLE_CONFIG[WORKER_BY_STORE[rec.template]], label: `${rec.name} staff`};
  if (!WORKER_WS.includes(keys.worker)) WORKER_WS.push(keys.worker);
  return keys;
}
export function registerAll(state) { for (const rec of state.onboardedStores || []) registerRuntimeStore(state, rec); }
export function goLive(state, a, live) {
  if (!a.storeKey) {
    const key = `shop${a.id.replace(/[^A-Z0-9]/gi, '').slice(-5)}`, template = CATEGORIES[live[0]].template;
    const rec = {key, template, name: a.store.name, mainCategory: live[0], appId: a.id};
    (state.onboardedStores ||= []).push(rec);
    registerRuntimeStore(state, rec);
    const acct = String(a.kyc.bank?.masked || '').replace(/\D/g, '');
    state.shopPartners ||= {};
    state.shopPartners[key] = {name: a.store.name, party: `store:${slug(a.store.name)}`, pickupAddress: a.store.address, status: 'approved', bank: a.kyc.bank?.masked || 'Not verified',
      payoutAccount: {accountNumber: acct ? `00000000${acct}` : ''}, payoutsEnabled: !!a.kyc.bank?.verified, deliveryMode: SD.delivers(a.delivery) ? SD.primaryMode(a.delivery) : 'pickup', deliveryPlan: SD.plan(a.delivery), deliveryArea: {pincode: a.store.pincode || '', radiusKm: a.store.radiusKm || 5}, createdFrom: a.id,
      onboarding: {gstin: a.kyc.gstin || '', pan: a.kyc.pan || '', fssai: a.licences.fssai?.number || '', fssaiExpiry: a.licences.fssai?.expiry || '', bankVerified: !!a.kyc.bank?.verified, status: 'approved'},
      approvedGroups: [], categoryRequests: [], hours: {open: a.store.open, close: a.store.close}, paused: false, busy: false};
    state.sellerBranches ||= {};
    state.sellerBranches[key] = [{id: `${key}-B1`, store: key, name: `${a.store.name} · ${a.store.branchName}`, address: a.store.address, serviceArea: a.store.city, status: 'active', open: true, priority: 1}];
    (state.activeSellerBranch ||= {})[key] = `${key}-B1`;
    (state.mockUsers ||= {})[key] = {name: a.store.name, role: 'Store Owner', initials: initials(a.store.name)};
    if (!(state.workspaces ||= []).includes(key)) state.workspaces.push(key);
    a.storeKey = key;
    a.products.forEach((p, i) => (state.products ||= []).push({id: `PRD-${key}-${i + 1}`, name: p.name, size: p.size, price: p.price, mrp: p.mrp, brand: p.brand || p.name.split(' ')[0],
      category: CATEGORIES[p.category].productCategory, subcategory: CATEGORIES[p.category].subcategory, vegStatus: CATEGORIES[p.category].veg,
      fulfilmentPartner: a.store.name, stock: p.stock > 0 ? 'In stock' : 'Out of stock', quantity: p.stock, reserved: 0, lowStockAt: 5, status: 'paused', approval: 'pending', onboardingCategory: p.category}));
    a.history.unshift({at: now(), text: `Store created: ${a.store.name} (${key})`});
    (state.notifications ||= []).unshift({id: uid('NT'), to: key, ref: a.id, text: `${a.id}: your store ${a.store.name} is approved. Invite a manager and staff from Team.`, read: false});
  }
  // (Re)apply which categories and products are live — later licence approvals unlock more.
  const partner = state.shopPartners[a.storeKey];
  partner.approvedGroups = [...new Set([...(partner.approvedGroups || []), ...live.map(c => c === 'fresh' ? 'fresh' : c)])];
  const productsOk = a.sections.products?.status === 'approved';
  for (const p of state.products || []) if (p.fulfilmentPartner === a.store.name && p.onboardingCategory) {
    const on = productsOk && live.includes(p.onboardingCategory);
    p.status = on ? 'active' : 'paused'; p.approval = on ? 'approved' : 'pending';
  }
  return a.storeKey;
}
// Store pickup only: home delivery is refused at checkout for that store.
export function deliveryModeOf(state, storeName) { return Object.values(state.shopPartners || {}).find(p => p.name === storeName)?.deliveryMode || 'moveai'; }

// ---------- screens ----------
const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
const stepNav = a => `<ol class="sell-steps">${visibleSteps(a).map((s, i) => `<li class="${s.n === a.step ? 'current' : ''} ${missingSteps(a).includes(s.n) ? '' : 'done'}"><button type="button" data-sell-goto="${s.n}">${i + 1}. ${esc(s.title)}</button></li>`).join('')}</ol>`;
const err = e => `<p class="field-error sell-error" ${e ? '' : 'hidden'}>${esc(e || '')}</p>`;
const actions = (a, back = true) => `<div class="form-actions">${back && a.step > 1 ? '<button type="button" class="button secondary" data-sell-back>Back</button>' : '<button type="button" class="button secondary" data-route="home">Save and exit</button>'}<button class="button primary" type="submit">Save and continue</button></div>`;
const lockNote = (a, sec) => a.status !== 'draft' && !canEdit(a, sec) ? `<div class="info-banner"><b>${pill(a.sections[sec]?.status || 'pending')} This section is ${a.sections[sec]?.status === 'approved' ? 'approved' : 'with the review team'}</b><span>You can change it only if a correction is requested.</span></div>` : a.sections[sec]?.status === 'correction' ? `<div class="info-banner warning"><b>Correction requested</b><span>${esc(a.sections[sec].note)}</span></div>` : '';

export function startScreen(state, error = '') {
  const a = current(state) || startApplication(state, {sourceBusiness: state.sellSource || null});
  const step = a.step, body = {
    1: () => `<form class="panel form-panel" data-sell-step="1">${lockNote(a, 'type')}<label class="field-label">Legal or business name</label><input class="text-field" name="legalName" value="${esc(a.legalName)}" placeholder="e.g. Gupta Kirana Store" ${a.sourceBusiness ? 'readonly' : ''}>
      <fieldset><legend>Seller type</legend><div class="service-grid">${Object.entries(SELLER_TYPES).map(([k, t]) => `<label class="service-choice ${a.sellerType === k ? 'selected' : ''}"><input type="radio" name="sellerType" value="${k}" ${a.sellerType === k ? 'checked' : ''}><span><b>${esc(t.label)}</b><small>${esc(t.note)}</small></span></label>`).join('')}</div></fieldset>
      <fieldset><legend>What will you sell?</legend><div class="service-grid">${Object.entries(CATEGORIES).map(([k, c]) => `<label class="service-choice ${a.categories.includes(k) ? 'selected' : ''}"><input type="checkbox" name="categories" value="${k}" ${a.categories.includes(k) ? 'checked' : ''}><span><b>${esc(c.label)}</b><small>${c.food ? 'Needs FSSAI licence' : k === 'electrical' ? 'Brand invoice or authorisation for branded items' : 'No extra licence'} · ${c.commission}% commission</small></span></label>`).join('')}</div></fieldset>${err(error)}${actions(a)}</form>`,
    2: () => a.kyc.reused ? `<form class="panel form-panel" data-sell-step="2"><div class="info-banner"><b>Using ${esc(a.legalName)}'s verified details</b><span>PAN ${esc(a.kyc.pan)} · GSTIN ${esc(a.kyc.gstin)} · bank ${esc(a.kyc.bank.masked)}. Nothing to upload again.</span></div>${err(error)}${actions(a)}</form>` : `<form class="panel form-panel" data-sell-step="2">${lockNote(a, 'kyc')}<div class="form-grid two"><label><span>PAN</span><input name="pan" maxlength="10" value="${esc(a.kyc.pan || '')}" placeholder="ABCDE1234F" autocapitalize="characters"></label><label><span>GSTIN</span><input name="gstin" maxlength="15" value="${esc(a.kyc.gstin || '')}" placeholder="09ABCDE1234F1Z5" autocapitalize="characters"></label></div>
      <label class="consent-row"><input type="checkbox" name="nonGst" ${a.kyc.nonGst ? 'checked' : ''}><span>I am an individual seller without GST and sell only GST-exempt items (fresh produce). Confirm GST rules with your CA.</span></label>
      <label><span>Aadhaar (individual sellers without GST)</span><input name="aadhaar" inputmode="numeric" maxlength="12" placeholder="12 digits" class="text-field"></label>
      <h3>Payout bank account</h3><div class="form-grid two"><label><span>Account holder name</span><input name="holder" value="${esc(a.legalName)}"></label><label><span>Account number</span><input name="account" inputmode="numeric" placeholder="9–18 digits"></label><label><span>IFSC</span><input name="ifsc" placeholder="SBIN0001234" autocapitalize="characters"></label><label><span>Cancelled cheque (only if the name check fails)</span><input name="chequeFile" type="file" accept="image/*,.pdf"></label></div>
      <p class="mock-hint"><b>Prototype checks</b><span>Any valid GSTIN works; one ending in 9 is cancelled. PAN must be characters 3–12 of the GSTIN. A bank account ending 000 fails the name check.</span></p>${err(error)}${actions(a)}</form>`,
    3: () => `<form class="panel form-panel" data-sell-step="3">${a.categories.some(c => CATEGORIES[c].food) ? `${lockNote(a, 'food')}<h3>FSSAI food licence</h3><div class="form-grid two"><label><span>Licence number (14 digits)</span><input name="fssai" inputmode="numeric" maxlength="14" value="${esc(a.licences.fssai?.number || '')}"></label><label><span>Valid until</span><input type="date" name="fssaiExpiry" value="${esc(a.licences.fssai?.expiry || '')}"></label></div><p class="muted">No licence yet? Leave it empty: your other categories can still go live, food stays locked until it is added.</p>` : ''}
      ${a.categories.includes('electrical') ? `${lockNote(a, 'brand')}<h3>Brand papers for electricals</h3><label><span>Brand authorisation or purchase invoice</span><input type="file" name="brandProof" accept="image/*,.pdf"></label>${a.licences.brandProof ? `<p class="muted">Added: ${esc(a.licences.brandProof)}</p>` : '<p class="muted">Without this, electricals stay locked; other categories can go live.</p>'}` : ''}${err(error)}${actions(a)}</form>`,
    4: () => `<form class="panel form-panel" data-sell-step="4">${lockNote(a, 'store')}<div class="form-grid two"><label><span>Store name customers see</span><input name="storeName" value="${esc(a.store.name || '')}" placeholder="e.g. Gupta Kirana"></label><label><span>First branch</span><input name="branchName" value="${esc(a.store.branchName || '')}" placeholder="e.g. Sector 62"></label><label class="wide"><span>Pickup address</span><input name="address" value="${esc(a.store.address || '')}"></label><label><span>City</span><input name="city" value="${esc(a.store.city || '')}"></label><label><span>Pincode</span><input name="pincode" inputmode="numeric" maxlength="6" value="${esc(a.store.pincode || '')}" placeholder="201301"></label><label><span>State</span><select name="stateCode"><option value="">Choose</option>${Object.entries(STATES).map(([k, v]) => opt(k, a.store.stateCode || a.kyc.gstState, v)).join('')}</select></label><label><span>Opens</span><input type="time" name="open" value="${esc(a.store.open || '08:00')}"></label><label><span>Closes</span><input type="time" name="close" value="${esc(a.store.close || '21:00')}"></label><label><span>Delivery area (km)</span><input type="number" name="radiusKm" min="1" max="20" value="${esc(a.store.radiusKm || 5)}"></label></div>${a.kyc.gstState ? `<p class="muted">The address must be in ${esc(STATES[a.kyc.gstState] || 'the GSTIN state')}, the state of your GSTIN.</p>` : ''}${err(error)}${actions(a)}</form>`,
    5: () => `<form class="panel form-panel" data-sell-step="5" novalidate>${lockNote(a, 'delivery')}${SD.formHtml(a.delivery, {store: a.store, categories: a.categories})}${err(error)}${actions(a)}</form>`,
    6: () => `<form class="panel form-panel" data-sell-step="6">${lockNote(a, 'agreement')}<table class="price-table"><tbody>${a.categories.map(c => `<tr><td>${esc(CATEGORIES[c].label)}</td><td>${CATEGORIES[c].commission}% commission · payout ${CATEGORIES[c].holdDays} days after delivery</td></tr>`).join('')}</tbody></table><p class="muted">Returns and claims follow MoveAI's category rules. Tax collected at source (TCS) and TDS are deducted as required by law. Confirm the final terms with your CA.</p><label class="consent-row"><input type="checkbox" name="accept" ${a.agreement.accepted ? 'checked' : ''}><span>I accept the MoveAI seller agreement for ${esc(a.legalName || 'this business')}.</span></label>${err(error)}${actions(a)}</form>`,
    7: () => `<section class="panel form-panel">${lockNote(a, 'products')}<h3>Your products (${a.products.length})</h3>${a.products.map(p => `<div class="ledger-row static"><span><b>${esc(p.name)} · ${esc(p.size)}</b><small>${esc(CATEGORIES[p.category].label)} · ₹${p.price} (MRP ₹${p.mrp}) · stock ${p.stock}</small></span><button type="button" class="button secondary compact" data-sell-remove="${esc(p.id)}">Remove</button></div>`).join('') || '<p class="muted">Add at least one product. You can upload more after approval.</p>'}
      <form data-sell-product class="form-grid two"><label><span>Product name</span><input name="name" placeholder="e.g. Toor Dal"></label><label><span>Category</span><select name="category">${a.categories.map(c => opt(c, '', CATEGORIES[c].label)).join('')}</select></label><label><span>Pack size</span><input name="size" placeholder="1 kg"></label><label><span>Brand</span><input name="brand"></label><label><span>Price (₹)</span><input name="price" type="number" min="1"></label><label><span>MRP (₹)</span><input name="mrp" type="number" min="1"></label><label><span>Stock</span><input name="stock" type="number" min="0" value="10"></label><button class="button secondary">Add product</button></form>${err(error)}
      <div class="form-actions"><button type="button" class="button secondary" data-sell-back>Back</button><button type="button" class="button primary" data-sell-goto="8">Continue to review</button></div></section>`,
    8: () => { const m = missingSteps(a); return `<section class="panel form-panel"><dl class="sell-summary"><div><dt>Business</dt><dd>${esc(a.legalName)} · ${esc(SELLER_TYPES[a.sellerType]?.label || '')}</dd></div><div><dt>Categories</dt><dd>${esc(a.categories.map(c => CATEGORIES[c].label).join(', '))}</dd></div><div><dt>Tax and bank</dt><dd>${a.kyc.nonGst ? 'No GST (exempt items only)' : `GSTIN ${esc(a.kyc.gstin || '—')}`} · bank ${esc(a.kyc.bank?.masked || '—')}${a.kyc.bank && !a.kyc.bank.verified ? ' (manual check, payouts off until verified)' : ''}</dd></div><div><dt>Licences</dt><dd>${a.categories.some(c => CATEGORIES[c].food) ? `FSSAI ${a.licences.fssai ? esc(a.licences.fssai.number) : 'not added (food locked)'}` : ''}${a.categories.includes('electrical') ? ` · brand papers ${a.licences.brandProof ? 'added' : 'not added (electricals locked)'}` : ''}</dd></div><div><dt>Store</dt><dd>${esc(a.store.name || '—')} · ${esc(a.store.branchName || '')}, ${esc(a.store.city || '')}</dd></div><div><dt>Delivery</dt><dd>${esc(SD.summary(a.delivery))}</dd></div><div><dt>Products</dt><dd>${a.products.length}</dd></div></dl>${m.length ? `<div class="info-banner warning"><b>Still to do</b><span>${m.map(n => esc(STEPS.find(s => s.n === n).title)).join(' · ')}</span></div>` : ''}${err(error)}<div class="form-actions"><button type="button" class="button secondary" data-sell-back>Back</button><button type="button" class="button primary" data-sell-submit ${m.length ? 'disabled' : ''}>${a.status === 'correction_required' ? 'Resubmit corrections' : 'Submit for review'}</button></div><p class="muted">Review target: 3–5 working days. You will be notified at every decision.</p></section>`; },
  }[step] || (() => '');
  const shown = visibleSteps(a), idx = shown.findIndex(s => s.n === step), title = idx >= 0 ? `Step ${idx + 1} of ${shown.length} · ${shown[idx].title}` : '';
  return `${head(a.sourceBusiness ? `Add “Sell products” to ${a.legalName}` : 'Sell products on MoveAI', `${title} · ${a.id}${a.status !== 'draft' ? ` · ${LABEL[a.status] || a.status}` : ''}`, '<button class="button secondary" data-route="sellStatus">Application status</button>')}${stepNav(a)}${body()}`;
}

export function statusScreen(state) {
  const list = mine(state);
  if (!list.length) return `${head('Seller applications', 'You have not applied to sell yet.')}<section class="panel"><button class="button primary" data-sell-new>Start selling</button></section>`;
  return `${head('Seller applications', 'Each section is reviewed on its own. Fix only what is marked.', '<button class="button secondary" data-sell-new>New application</button>')}${list.map(a => `<section class="panel sell-app"><div class="panel-header"><div><h2>${esc(a.store.name || a.legalName || a.id)}</h2><p>${esc(a.id)} · ${esc(a.legalName)}${a.submittedAt ? ` · submitted ${esc(a.submittedAt)}` : ''}</p></div>${pill(a.status)}</div>
    ${a.blocker ? `<div class="info-banner warning"><b>Not live yet</b><span>${esc(a.blocker)}</span></div>` : ''}
    <div class="sell-sections">${requiredSections(a).map(s => { const x = a.sections[s] || {status: a.status === 'draft' ? 'draft' : 'pending'}; const step = {type: 1, kyc: 2, food: 3, brand: 3, store: 4, delivery: 5, agreement: 6, products: 7}[s]; return `<div class="ledger-row static"><span><b>${esc(SECTION_LABEL[s])}</b>${x.note ? `<small>${esc(x.note)}</small>` : ''}</span>${pill(x.status)}${['correction', 'not_provided'].includes(x.status) || a.status === 'draft' ? `<button class="button secondary compact" data-sell-fix="${esc(a.id)}" data-step="${step}">${x.status === 'not_provided' ? 'Add' : a.status === 'draft' ? 'Edit' : 'Fix'}</button>` : ''}</div>`; }).join('')}</div>
    ${a.storeKey ? `<p>Live categories: <b>${esc(liveCategories(a).map(c => CATEGORIES[c].label).join(', ') || 'none')}</b>${a.categories.length > liveCategories(a).length ? ` · locked: ${esc(a.categories.filter(c => !liveCategories(a).includes(c)).map(c => CATEGORIES[c].label).join(', '))}` : ''}</p><button class="button primary" data-sell-open="${esc(a.storeKey)}">Open ${esc(a.store.name)}</button>` : a.status === 'draft' || a.status === 'correction_required' ? `<button class="button primary" data-sell-fix="${esc(a.id)}" data-step="8">${a.status === 'draft' ? 'Continue application' : 'Review and resubmit'}</button>` : ''}
    <details><summary>History</summary>${a.history.slice(0, 12).map(h => `<small class="block muted">${esc(h.at)} · ${esc(h.text)}</small>`).join('')}</details></section>`).join('')}`;
}
export const SECTION_LABEL = {type: 'Seller type and categories', kyc: 'PAN, GST and bank', food: 'FSSAI food licence', brand: 'Brand papers (electricals)', store: 'Store and first branch', delivery: 'Delivery choice', agreement: 'Seller agreement', products: 'First products'};

export function reviewScreen(state) {
  const queue = apps(state).filter(a => ['submitted', 'correction_required', 'live_partial'].includes(a.status) || Object.values(a.sections).some(x => x.status === 'pending'));
  const detail = a => ({type: `${SELLER_TYPES[a.sellerType]?.label} · ${a.categories.map(c => CATEGORIES[c].label).join(', ')}`, kyc: a.kyc.reused ? 'Reused from approved business' : `${a.kyc.nonGst ? `No GST · Aadhaar ••••${a.kyc.aadhaarLast4}` : `GSTIN ${a.kyc.gstin}`} · PAN ${a.kyc.pan} · bank ${a.kyc.bank?.masked}${a.kyc.bank?.verified ? ' (₹1 check passed)' : ` (name mismatch — cheque ${a.kyc.bank?.chequeFile || 'missing'})`}`,
    food: a.licences.fssai ? `FSSAI ${a.licences.fssai.number} · valid until ${a.licences.fssai.expiry}` : 'Not provided', brand: a.licences.brandProof || 'Not provided', store: `${a.store.name} · ${a.store.branchName}, ${a.store.address}, ${a.store.city} ${a.store.pincode || ''} (${STATES[a.store.stateCode]}) · ${a.store.open}–${a.store.close} · ${a.store.radiusKm} km`,
    delivery: SD.summary(a.delivery), agreement: a.agreement.accepted ? `Accepted ${a.agreement.at}` : '—', products: a.products.map(p => `${p.name} ${p.size} ₹${p.price}/MRP ₹${p.mrp}`).join('; ')});
  return `${head('Seller onboarding review', 'Approve, request a correction or reject each section. A store goes live when the core sections are approved; licence sections unlock their categories.')}${SD.reviewHtml(state)}${queue.map(a => { const d = detail(a); return `<section class="panel"><div class="panel-header"><div><h2>${esc(a.store.name || a.legalName)}</h2><p>${esc(a.id)} · ${esc(a.ownerName)}${a.sourceBusiness ? ` · adding to ${esc(ROLE_CONFIG[a.sourceBusiness]?.label || a.sourceBusiness)}` : ''}</p></div>${pill(a.status)}</div>${requiredSections(a).map(s => `<div class="claim-row"><b>${esc(SECTION_LABEL[s])}</b> ${pill(a.sections[s]?.status || 'pending')}<small class="block muted">${esc(d[s] || '')}</small>${a.sections[s]?.note ? `<small class="block">${esc(a.sections[s].note)}</small>` : ''}${['pending'].includes(a.sections[s]?.status) ? `<form class="inline-form" data-sell-decide="${esc(a.id)}" data-section="${s}"><input name="note" placeholder="Reason (needed for correction or reject)"><button class="button primary compact" name="decision" value="approved">Approve</button><button class="button secondary compact" name="decision" value="correction">Request correction</button><button class="button secondary compact" name="decision" value="rejected">Reject</button></form>` : ''}</div>`).join('')}</section>`; }).join('') || '<section class="panel"><p class="muted">No seller applications waiting.</p></section>'}`;
}

// ---------- bindings ----------
// api: {getState, save, render, navigate, toast, switchTo(ws)}
export function bind(root, api) {
  const S = () => api.getState(), A = () => current(S());
  const show = e => { const el = root.querySelector('.sell-error'); if (el) { el.textContent = e; el.hidden = !e; } else if (e) api.toast(e); };
  const next = a => { a.step = Math.min(8, a.step + 1); if (a.step === 3 && !a.categories.some(c => CATEGORIES[c].food || c === 'electrical')) a.step = 4; api.save(); api.render(); };
  root.querySelectorAll('form[data-sell-step]').forEach(f => f.onsubmit = e => {
    e.preventDefault(); const s = S(), a = A(), fd = new FormData(f), n = Number(f.dataset.sellStep);
    const v = Object.fromEntries(fd); v.categories = fd.getAll('categories'); for (const k of ['chequeFile', 'brandProof']) { const file = fd.get(k); v[k] = file && file.name ? file.name : ''; }
    v.nonGst = fd.has('nonGst'); v.accept = fd.has('accept');
    if (n === 5) Object.assign(v, SD.readForm(fd));
    const error = {1: saveType, 2: saveKyc, 3: saveLicences, 4: saveStore, 5: saveDelivery, 6: saveAgreement}[n](s, a, v);
    if (error) return show(error);
    next(a);
  });
  SD.bindForm(root.querySelector('form[data-sell-step="5"]'));
  root.querySelector('form[data-sell-product]')?.addEventListener('submit', e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.currentTarget)); const error = addProduct(S(), A(), fd); if (error) return show(error); api.save(); api.render(); api.toast('Product added'); });
  root.querySelectorAll('[data-sell-remove]').forEach(b => b.onclick = () => { const error = removeProduct(S(), A(), b.dataset.sellRemove); if (error) return show(error); api.save(); api.render(); });
  root.querySelectorAll('[data-sell-goto]').forEach(b => b.onclick = () => { const a = A(); a.step = Number(b.dataset.sellGoto); api.save(); api.render(); });
  root.querySelectorAll('[data-sell-back]').forEach(b => b.onclick = () => { const a = A(); a.step = Math.max(1, a.step - 1); if (a.step === 3 && !a.categories.some(c => CATEGORIES[c].food || c === 'electrical')) a.step = 2; api.save(); api.render(); });
  root.querySelector('[data-sell-submit]')?.addEventListener('click', () => { const error = submit(S(), A()); if (error) return show(error); api.save(); api.navigate('sellStatus'); api.toast('Submitted. Review target 3–5 working days.'); });
  root.querySelectorAll('[data-sell-new]').forEach(b => b.onclick = () => { const s = S(); s.currentSellerAppId = null; startApplication(s, {sourceBusiness: s.sellSource || null}); api.save(); api.navigate('sellStart'); });
  root.querySelectorAll('[data-sell-fix]').forEach(b => b.onclick = () => { const s = S(); s.currentSellerAppId = b.dataset.sellFix; const a = current(s); a.step = Number(b.dataset.step); api.save(); api.navigate('sellStart'); });
  root.querySelectorAll('[data-sell-open]').forEach(b => b.onclick = () => api.switchTo(b.dataset.sellOpen));
  root.querySelectorAll('form[data-sell-decide]').forEach(f => f.onsubmit = e => { e.preventDefault(); const d = e.submitter?.value || 'approved', error = decide(S(), f.dataset.sellDecide, f.dataset.section, d, new FormData(f).get('note')); if (error) return api.toast(error); api.save(); api.render(); api.toast(`${SECTION_LABEL[f.dataset.section]}: ${LABEL[d] || d}`); });
}

// For the switcher: applications still in progress for this person.
export function inProgress(state) { return mine(state).filter(a => ['draft', 'submitted', 'correction_required'].includes(a.status)); }
export {SELLER_WORKSPACES};
