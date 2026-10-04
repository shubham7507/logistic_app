// MoveAI One — e-commerce additions (frontend prototype; no backend).
// Catalogue: MRP + % off, variants, category details, images, HSN/GST, listing approval, bulk upload, batches/expiry (FEFO).
// Shopping: synonym/typo search, filters & sort, ratings & reviews, wishlist / buy again / saved lists, coupons, tips,
// delivery promise & slots, repeat orders. Picking: barcode match, weight items, aisle order, packing photo.
// Delivery: nearest courier with capacity & batching, distance pay + tips, proof of delivery, 2 attempts then return to store,
// COD refusal tracking. After delivery: category return rules, item-level returns / replacements / size exchange,
// return pickup with QC, "Help with this order" claims (auto refund for small fresh claims), MoveAI wallet refunds,
// store disputes. Money: commission & payout hold by category, seller- vs platform-funded discounts, TCS/TDS settings,
// HSN/MRP on invoices. Admin: approvals, claims centre, settings, reports, fraud flags, notification outbox.
import {esc, pill, inr} from './ops.js';
import * as NC from './notify-center.js';
import * as Geo from './geo.js';
import {gateway, record, clock} from './pay.js';
import * as Commerce from './commerce.js';
import {rcLookup, gstLookup, pennyDrop} from './verify-sim.js';

const DAY = 86400000, H = 3600000;
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const hash = t => [...String(t)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const today = () => new Date(clock()).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY).toISOString().slice(0, 10);

// ---------- category groups and their rules ----------
export const GROUPS = {
  fresh: {label: 'Fresh food', returns: 'claim_only', windowH: 48, holdDays: 7, commission: 0.08, gst: 0, hsn: '0709', details: ['Best before', 'Origin', 'Storage'], policy: 'No returns. Report missing, damaged or poor-quality items within 48 hours with a photo.'},
  food: {label: 'Packaged food', returns: 'damaged_only', windowH: 7 * 24, holdDays: 7, commission: 0.08, gst: 5, hsn: '1006', details: ['Ingredients', 'Allergens', 'Best before', 'FSSAI licence', 'Manufacturer', 'Country of origin'], policy: 'Return only if damaged, wrong or expired at delivery, within 7 days.'},
  household: {label: 'Home & personal care', returns: 'damaged_only', windowH: 7 * 24, holdDays: 7, commission: 0.08, gst: 18, hsn: '3401', details: ['Manufacturer', 'Country of origin', 'Usage'], policy: 'Return only if damaged, wrong or leaking at delivery, within 7 days.'},
  electrical: {label: 'Electricals', returns: 'replace', windowH: 10 * 24, holdDays: 7, commission: 0.08, gst: 18, hsn: '8539', details: ['Brand', 'Model', 'Wattage / rating', 'Warranty (months)', 'Manufacturer', 'Country of origin'], policy: 'Replacement within 10 days if defective (serial number checked). After that, manufacturer warranty.'},
  fashion: {label: 'Fashion', returns: 'return_or_exchange', windowH: 15 * 24, holdDays: 7, commission: 0.08, gst: 5, hsn: '6205', details: ['Fabric', 'Fit', 'Size chart', 'Wash care', 'Country of origin'], policy: 'Return or exchange size within 15 days, tags intact and unused.'},
};
export function groupOf(p) {
  const c = `${p?.category || ''} ${p?.subcategory || ''}`.toLowerCase();
  if (/vegetable|fruit|dairy|paneer|milk|bakery|bread|egg/.test(c)) return 'fresh';
  if (/electric|lighting|bulb|batter|hardware/.test(c)) return 'electrical';
  if (/fashion|cloth|apparel|wear|shirt|footwear/.test(c)) return 'fashion';
  if (/personal care|laundry|cleaning|dish|paper|garbage|pest|kitchen|storage|bath|bed|baby|pet|tools/.test(c)) return 'household';
  return 'food';
}
export const settings = s => (s.plusSettings ||= {commission: {}, holdDays: {}, tcsPct: 0, tdsPct: 0, claimAutoLimit: 200, claimMax30d: 3, codRefusalLimit: 2, newSellerExtraHoldDays: 0, capacityPerCourier: 2, peakStart: '18:00', peakEnd: '22:00', peakBonus: 10, dailyTarget: 10, dailyBonus: 100});
export const RECOMMENDED = {commission: {fresh: 6, food: 7, household: 8, electrical: 8, fashion: 18}, holdDays: {fresh: 3, food: 9, household: 9, electrical: 12, fashion: 17}, tcsPct: 0.5, tdsPct: 0.1};
export const commissionRate = (s, o) => { const g = orderGroup(s, o), st = settings(s); return st.commission[g] ?? GROUPS[g].commission; };
export const holdDays = (s, o) => { const g = orderGroup(s, o), st = settings(s), base = st.holdDays[g] ?? GROUPS[g].holdDays, partner = Object.values(s.shopPartners || {}).find(p => p.party === o.party); return base + ((partner?.completedOrders || 0) < 5 ? st.newSellerExtraHoldDays : 0); };
export function orderGroup(s, o) { const gs = (o?.items || []).map(i => groupOf(s.products.find(p => p.id === i.productId))); return ['fashion', 'electrical', 'household', 'food', 'fresh'].find(g => gs.includes(g)) || 'food'; }

// ---------- seed / enrichment ----------
const EXTRA_PRODUCTS = [
  {id: 'PRD-105', name: 'India Gate Basmati Rice', size: '1 kg', price: 160, mrp: 185, category: 'Rice, grains & cereals', subcategory: 'Rice', vegStatus: 'vegetarian', fulfilmentPartner: 'ABC Grocery', variantGroup: 'VG-RICE-IG', variantLabel: '1 kg', brand: 'India Gate'},
  {id: 'PRD-106', name: 'Tomato (Hybrid)', size: '1 kg', price: 40, mrp: 48, category: 'Fresh vegetables', subcategory: 'Other vegetables', vegStatus: 'vegetarian', fulfilmentPartner: 'Fresh Mart', soldByWeight: true, nominalKg: 1, brand: 'Farm fresh'},
  {id: 'PRD-107', name: 'Amul Taaza Toned Milk', size: '500 ml', price: 28, mrp: 28, category: 'Dairy & paneer', subcategory: 'Milk', vegStatus: 'vegetarian', fulfilmentPartner: 'Fresh Mart', brand: 'Amul'},
  {id: 'PRD-108', name: 'Banana Robusta', size: '1 kg (approx. 6 pcs)', price: 60, mrp: 70, category: 'Fresh fruits', subcategory: 'Local fruits', vegStatus: 'vegetarian', fulfilmentPartner: 'Fresh Mart', soldByWeight: true, nominalKg: 1, brand: 'Farm fresh'},
  {id: 'PRD-202', name: 'Philips LED Batten 20 W', size: '4 ft', price: 349, mrp: 499, category: 'Electrical & lighting', subcategory: 'Bulbs', vegStatus: 'not_applicable', fulfilmentPartner: 'Sharma Electricals', brand: 'Philips'},
  {id: 'PRD-302', name: 'Cotton Shirt', size: 'M', price: 799, mrp: 1299, category: 'Fashion & clothing', subcategory: '', vegStatus: 'not_applicable', fulfilmentPartner: 'City Fashion', variantGroup: 'VG-SHIRT', variantLabel: 'M', brand: 'City Basics'},
  {id: 'PRD-303', name: 'Cotton Shirt', size: 'L', price: 799, mrp: 1299, category: 'Fashion & clothing', subcategory: '', vegStatus: 'not_applicable', fulfilmentPartner: 'City Fashion', variantGroup: 'VG-SHIRT', variantLabel: 'L', brand: 'City Basics'},
];
const DETAIL_DEFAULTS = {
  fresh: p => ({'Best before': '2–3 days from delivery', Origin: 'Nashik / local farms', Storage: 'Keep refrigerated'}),
  food: p => ({Ingredients: p.name.includes('Salt') ? 'Iodised salt' : p.name.includes('Rice') ? 'Basmati rice' : 'Whole wheat', Allergens: 'None declared', 'Best before': '12 months from packing', 'FSSAI licence': '10012011000123', Manufacturer: p.brand || p.name.split(' ')[0], 'Country of origin': 'India'}),
  household: p => ({Manufacturer: p.brand || p.name.split(' ')[0], 'Country of origin': 'India', Usage: 'See pack'}),
  electrical: p => ({Brand: p.brand || p.name.split(' ')[0], Model: p.name.replace(/\s+/g, '-').toUpperCase().slice(0, 14), 'Wattage / rating': (p.name.match(/\d+\s?W/) || ['—'])[0], 'Warranty (months)': '12', Manufacturer: p.brand || 'OEM', 'Country of origin': 'India'}),
  fashion: p => ({Fabric: '100% cotton', Fit: 'Regular', 'Size chart': 'M: chest 40 in · L: chest 42 in · XL: chest 44 in', 'Wash care': 'Machine wash cold', 'Country of origin': 'India'}),
};
export function ensurePlus(s) {
  settings(s);
  if (!s.plusSeeded) {
    s.plusSeeded = 2;
    for (const x of EXTRA_PRODUCTS) if (!s.products.some(p => p.id === x.id)) s.products.push({stock: 'In stock', quantity: x.soldByWeight ? 40 : 20, reserved: 0, lowStockAt: 5, status: 'active', approval: 'approved', ...x});
    const shirt = s.products.find(p => p.id === 'PRD-301'); if (shirt) Object.assign(shirt, {variantGroup: 'VG-SHIRT', variantLabel: shirt.size || 'S'});
    const rice = s.products.find(p => p.id === 'PRD-101'); if (rice) Object.assign(rice, {variantGroup: 'VG-RICE-IG', variantLabel: rice.size});
    s.reviews ||= [{id: 'RV-1', productId: 'PRD-101', rating: 5, text: 'Long grains, good aroma.', by: 'Neha', at: '20 Sep'}, {id: 'RV-2', productId: 'PRD-101', rating: 4, text: 'Good, slightly pricey.', by: 'Arun', at: '24 Sep'}, {id: 'RV-3', productId: 'PRD-201', rating: 4, text: 'Bright, works fine.', by: 'Imran', at: '22 Sep'}, {id: 'RV-4', productId: 'PRD-301', rating: 3, text: 'Fabric good, runs small — size up.', by: 'Pooja', at: '25 Sep'}];
    s.coupons ||= [{code: 'FIRST50', label: '₹50 off your first order above ₹299', type: 'flat', value: 50, min: 299, fundedBy: 'platform', firstOrderOnly: true, active: true}, {code: 'SAVE10', label: '10% off up to ₹100 above ₹499', type: 'pct', value: 10, max: 100, min: 499, fundedBy: 'platform', active: true}, {code: 'ABC20', label: '₹20 off ABC Grocery above ₹200 (store offer)', type: 'flat', value: 20, min: 200, fundedBy: 'seller', store: 'ABC Grocery', active: true}, {code: 'CARD5', label: '5% off with a card, up to ₹75', type: 'pct', value: 5, max: 75, min: 300, method: 'card', fundedBy: 'platform', active: true}];
    for (const [k, p] of Object.entries(s.shopPartners || {})) { p.onboarding ||= {gstin: p.gstin || '07AABCA1234K1Z5', pan: 'AABCA1234K', bankVerified: true, fssai: /grocery|fresh/i.test(k) ? '13321999000123' : '', status: 'approved'}; p.approvedGroups ||= [...new Set(s.products.filter(x => x.fulfilmentPartner === p.name).map(groupOf))]; p.hours ||= {open: '00:00', close: '23:59'}; p.completedOrders ??= 8; }
  }
  s.wishlist ||= []; s.savedLists ||= []; s.schedules ||= []; s.claims ||= []; s.couponUses ||= []; s.outbox ||= []; s.codRefusals ||= {}; s.customerWallet ||= {balance: 0, entries: []};
  for (const p of s.products) {
    const g = groupOf(p);
    p.mrp ??= Math.max(p.price, Math.ceil(p.price * 1.15 / 5) * 5); p.brand ??= p.name.split(' ')[0];
    p.hsn ??= GROUPS[g].hsn; p.gstRate ??= g === 'fashion' && p.price > 1000 ? 12 : GROUPS[g].gst;
    p.images ??= [p.photo].filter(Boolean); p.approval ??= 'approved'; p.barcode ??= p.sku || `890${String(hash(p.id)).slice(0, 10)}`;
    p.aisle ??= `${String.fromCharCode(65 + (hash(p.category) % 6))}${1 + hash(p.category) % 9}`;
    p.details ??= DETAIL_DEFAULTS[g](p);
    if (g === 'fresh' || g === 'food') p.batches ??= [{id: `${p.id}-B1`, qty: Number(p.quantity ?? 20), expiry: addDays(today(), g === 'fresh' ? 3 : 150)}];
  }
  // Expired batches leave sellable stock automatically.
  for (const p of s.products) for (const b of p.batches || []) if (b.qty > 0 && b.expiry < today() && !b.writtenOff) { p.quantity = Math.max(0, Number(p.quantity || 0) - b.qty); b.writtenOff = b.qty; b.qty = 0; (p.stockLog ||= []).push({at: stamp(), text: `Batch ${b.id} expired — ${b.writtenOff} written off`}); }
  return s;
}
export const variantsOf = (s, p) => p.variantGroup ? s.products.filter(x => x.variantGroup === p.variantGroup) : [p];
export const ratingOf = (s, pid) => { const p = s.products.find(x => x.id === pid), ids = p?.variantGroup ? s.products.filter(x => x.variantGroup === p.variantGroup).map(x => x.id) : [pid], r = (s.reviews || []).filter(x => ids.includes(x.productId)); return {avg: r.length ? Math.round(r.reduce((a, x) => a + x.rating, 0) / r.length * 10) / 10 : 0, count: r.length}; };
export const offPct = p => p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;

// ---------- search ----------
const SYN = {chawal: 'rice', chaawal: 'rice', doodh: 'milk', dudh: 'milk', aata: 'atta', namak: 'salt', tamatar: 'tomato', tamaatar: 'tomato', kela: 'banana', aloo: 'potato', pyaz: 'onion', dahi: 'curd', chai: 'tea', cheeni: 'sugar', tel: 'oil', ande: 'egg', batti: 'bulb', bijli: 'electrical', kameez: 'shirt', kapde: 'clothing', sabzi: 'vegetables', sabji: 'vegetables', phal: 'fruits'};
function lev(a, b) { const m = a.length, n = b.length, d = Array.from({length: m + 1}, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
export function matches(p, query) {
  const text = `${p.name} ${p.category} ${p.subcategory || ''} ${p.size} ${p.brand || ''}`.toLowerCase(), words = text.split(/[^a-z0-9]+/).filter(Boolean);
  return String(query || '').toLowerCase().split(/\s+/).filter(Boolean).every(q0 => { const q = SYN[q0] || q0; if (text.includes(q)) return true; if (q.length < 4) return false; const tol = q.length >= 7 ? 2 : 1; return words.some(w => Math.abs(w.length - q.length) <= tol && lev(w, q) <= tol); });
}
export function searchProducts(s, query, published) {
  ensurePlus(s); const f = s.shopFilters || {};
  let list = s.products.filter(p => published(p) && matches(p, query));
  if (f.brand) list = list.filter(p => p.brand === f.brand);
  if (f.veg) list = list.filter(p => p.vegStatus === 'vegetarian');
  if (f.maxPrice) list = list.filter(p => p.price <= Number(f.maxPrice));
  if (f.minRating) list = list.filter(p => ratingOf(s, p.id).avg >= Number(f.minRating));
  if (f.discount) list = list.filter(p => offPct(p) >= 10);
  const seen = new Set(); list = list.filter(p => !p.variantGroup || (seen.has(p.variantGroup) ? false : (seen.add(p.variantGroup), true)));
  const sorts = {price_asc: (a, b) => a.price - b.price, price_desc: (a, b) => b.price - a.price, discount: (a, b) => offPct(b) - offPct(a), rating: (a, b) => ratingOf(s, b.id).avg - ratingOf(s, a.id).avg};
  return f.sort && sorts[f.sort] ? list.sort(sorts[f.sort]) : list;
}
export function filterBar(s) {
  const f = s.shopFilters || {}, brands = [...new Set(s.products.map(p => p.brand).filter(Boolean))].sort();
  return `<form class="panel shop-filters" data-plus-form="filters"><select name="sort"><option value="">Sort: relevance</option>${[['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['discount', 'Biggest discount'], ['rating', 'Top rated']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select><select name="brand"><option value="">All brands</option>${brands.map(b => `<option ${f.brand === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select><input name="maxPrice" type="number" placeholder="Max ₹" value="${esc(f.maxPrice || '')}"><select name="minRating"><option value="">Any rating</option><option value="4" ${f.minRating === '4' ? 'selected' : ''}>4★ & above</option></select><label><input type="checkbox" name="veg" ${f.veg ? 'checked' : ''}> Veg only</label><label><input type="checkbox" name="discount" ${f.discount ? 'checked' : ''}> 10%+ off</label><button class="button secondary compact">Apply</button>${Object.values(f).some(Boolean) ? '<button type="button" class="button text compact" data-plus="clear-filters">Clear</button>' : ''}<small class="muted">Search understands Hindi words (chawal, doodh, tamatar) and small spelling mistakes.</small></form>`;
}
export const cardBadge = (s, p) => `${p.mrp > p.price ? `<small class="mrp"><s>₹${p.mrp}</s> <b>${offPct(p)}% off</b></small>` : ''}${ratingOf(s, p.id).count ? `<small class="stars">★ ${ratingOf(s, p.id).avg} (${ratingOf(s, p.id).count})</small>` : ''}`;

// ---------- delivery promise ----------
const storeOfName = (s, name) => Object.entries(s.shopPartners || {}).find(([, p]) => p.name === name);
export const distanceKm = (from, to) => 1 + (hash(`${from}|${to}`) % 60) / 10;
const courierKm = (id, store) => 1 + (hash(`${id}|${store}`) % 15) / 10;
export function etaMinutes(s, storeName, address) {
  const [, p] = storeOfName(s, storeName) || [], open = Commerce.visibleOrders ? (s.customerOrders || []).filter(o => o.fulfilmentPartner === storeName && ['paid', 'confirmed', 'accepted'].includes(o.status)).length : 0;
  return Math.round(8 + open * 4 + (p?.busy ? 15 : 0) + distanceKm(p?.pickupAddress || storeName, address || 'customer') * 3);
}
export function storeOpen(s, name) {
  const [, p] = storeOfName(s, name) || []; if (!p) return {open: false, reason: 'Store not found'};
  if (p.paused) return {open: false, reason: `${name} has paused new orders`};
  const t = new Date(clock()).toLocaleTimeString('en-GB', {timeZone: 'Asia/Kolkata', hour12: false}).slice(0, 5); if (p.hours && (t < p.hours.open || t > p.hours.close)) return {open: false, reason: `${name} is closed now (opens ${p.hours.open})`};
  return {open: true};
}

// ---------- product page extras ----------
export function productExtras(s, p) {
  ensurePlus(s); const g = groupOf(p), r = ratingOf(s, p.id), vs = variantsOf(s, p), reviews = (s.reviews || []).filter(x => vs.some(v => v.id === x.productId)).slice(-5).reverse();
  const inWish = s.wishlist.includes(p.id), eta = etaMinutes(s, p.fulfilmentPartner, s.deliveryAddress);
  return `<section class="panel plus-product"><div class="plus-price"><b class="price">${inr(p.price)}</b>${p.mrp > p.price ? ` <s class="muted">MRP ${inr(p.mrp)}</s> <span class="chip">${offPct(p)}% off</span>` : ` <small class="muted">MRP ${inr(p.mrp)}</small>`}<small class="block muted">Inclusive of all taxes · HSN ${esc(p.hsn)} · GST ${p.gstRate}%${p.soldByWeight ? ' · sold by weight: final price follows the weighed amount (you authorise up to 10% more)' : ''}</small></div>
  ${vs.length > 1 ? `<div class="chip-row variants">${vs.map(v => `<button class="chip ${v.id === p.id ? 'active' : ''}" data-plus-variant="${esc(v.id)}" ${v.quantity - (v.reserved || 0) <= 0 ? 'disabled' : ''}>${esc(v.variantLabel || v.size)}${v.price !== p.price ? ` · ${inr(v.price)}` : ''}${v.quantity - (v.reserved || 0) <= 0 ? ' · sold out' : ''}</button>`).join('')}</div>` : ''}
  ${p.images?.length > 1 ? `<div class="thumbs">${p.images.map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>` : ''}
  <p><b>Arrives in about ${eta} min</b> <small class="muted">· from ${esc(p.fulfilmentPartner)}${storeOpen(s, p.fulfilmentPartner).open ? '' : ` · ${esc(storeOpen(s, p.fulfilmentPartner).reason)}`}</small></p>
  <div class="row-actions"><button class="button secondary compact" data-plus="wish" data-id="${esc(p.id)}">${inWish ? '♥ In wishlist' : '♡ Add to wishlist'}</button></div>
  <details open><summary><b>Product details</b></summary><table class="price-table"><tbody>${[['Brand', p.brand], ...Object.entries(p.details || {})].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></details>
  <p class="muted"><b>Returns:</b> ${esc(GROUPS[g].policy)}</p>
  <details ${reviews.length ? 'open' : ''}><summary><b>Ratings & reviews</b> ${r.count ? `★ ${r.avg} · ${r.count} review${r.count > 1 ? 's' : ''}` : '· no reviews yet'}</summary>${reviews.map(x => `<div class="review"><b>${'★'.repeat(x.rating)}${'☆'.repeat(5 - x.rating)}</b> ${esc(x.text)}<small class="block muted">${esc(x.by)} · ${esc(x.at)} · verified purchase</small></div>`).join('') || '<p class="muted">Only customers who received this product can review it.</p>'}</details></section>`;
}

// ---------- checkout: coupons, tip, slot, repeat ----------
const firstOrder = s => !(s.customerOrders || []).some(o => !['cancelled'].includes(o.status));
export function couponDiscount(s, code, lines, method) {
  const c = (s.coupons || []).find(x => x.active && x.code === String(code || '').trim().toUpperCase()); if (!code) return {discount: 0};
  if (!c) return {error: 'That coupon code is not valid.'};
  if (c.expires && c.expires < today()) return {error: `${c.code} expired on ${c.expires}.`};
  const used = (s.couponUses || []).filter(u => u.code === c.code);
  if (c.budget && used.reduce((a, u) => a + (u.discount || 0), 0) >= c.budget) return {error: `${c.code} has reached its offer budget.`};
  if (c.perCustomer && used.length >= c.perCustomer) return {error: `You have already used ${c.code} ${c.perCustomer === 1 ? 'once' : `${c.perCustomer} times`}.`};
  const base = lines.filter(l => !c.store || l.product.fulfilmentPartner === c.store).reduce((a, l) => a + l.product.price * l.quantity, 0);
  if (c.firstOrderOnly && !firstOrder(s)) return {error: `${c.code} is only for your first order.`};
  if (c.method && c.method !== method) return {error: `${c.code} needs payment by ${c.method}.`};
  if (base < c.min) return {error: `${c.code} needs ${c.store ? `${c.store} items worth ` : ''}at least ${inr(c.min)}.`};
  const d = c.type === 'flat' ? c.value : Math.min(c.max || Infinity, Math.round(base * c.value / 100));
  return {discount: Math.min(d, base), coupon: c};
}
export function previewCheckout(s, lines, q) {
  ensurePlus(s); const cp = s.checkoutPlus || {}; const r = couponDiscount(s, cp.coupon, lines, cp.method);
  q.discount = r.discount || 0; q.tip = Number(cp.tip || 0); q.couponError = r.error || ''; q.total = q.total - q.discount + q.tip; return q;
}
export function checkoutExtrasHtml(s, lines, q) {
  ensurePlus(s); const cp = s.checkoutPlus || {}, stores = [...new Set(lines.map(l => l.product.fulfilmentPartner))];
  const eta = Math.max(...stores.map(n => etaMinutes(s, n, s.deliveryAddress))), weight = lines.some(l => l.product.soldByWeight), refusals = s.codRefusals[s.person?.id || 'me'] || 0;
  const slots = [0, 1].flatMap(d => ['09:00–11:00', '12:00–14:00', '18:00–20:00'].map(w => `${d ? 'Tomorrow' : 'Today'} ${w}`));
  return `${Geo.pinHtml(s, lines)}<fieldset class="wide plus-checkout"><legend>Offers, tip and delivery time</legend>
  <div class="form-grid two"><label><span>Coupon code</span><span class="inline-add"><input name="plusCoupon" value="${esc(cp.coupon || '')}" placeholder="e.g. SAVE10" autocapitalize="characters"><button type="button" class="button secondary compact" data-plus="apply-checkout">Apply</button></span>${q.couponError ? `<small class="field-error">${esc(q.couponError)}</small>` : q.discount ? `<small class="chip">−${inr(q.discount)} applied</small>` : ''}</label>
  <label><span>Tip your delivery partner (100% goes to them)</span><select name="plusTip">${[0, 10, 20, 30, 50].map(t => `<option value="${t}" ${Number(cp.tip || 0) === t ? 'selected' : ''}>${t ? inr(t) : 'No tip'}</option>`).join('')}</select></label>
  <label><span>Delivery time</span><select name="plusSlot"><option value="express">Express · arrives in about ${eta} min</option>${slots.map(x => `<option ${cp.slot === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
  <label><span>Repeat this order</span><select name="plusRepeat"><option value="">No</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></label></div>
  <details><summary class="muted">Available offers</summary>${(s.coupons || []).filter(c => c.active).map(c => `<small class="block"><b>${esc(c.code)}</b> · ${esc(c.label)}${c.fundedBy === 'seller' ? ' (store offer)' : ''}</small>`).join('')}</details>
  ${weight ? '<p class="muted">Some items are sold by weight. The store weighs them; you pay for the actual weight, up to 10% more than ordered, and get the difference back if it is less.</p>' : ''}
  ${refusals >= settings(s).codRefusalLimit ? '<p class="field-error">Cash on delivery is unavailable after repeated refused deliveries. Pay online.</p>' : ''}
  ${q.discount || q.tip ? `<p><b>Total after offers and tip: ${inr(q.total)}</b></p>` : ''}</fieldset>`;
}
export function checkoutAdjust(s, v, lines, q) {
  ensurePlus(s);
  for (const n of [...new Set(lines.map(l => l.product.fulfilmentPartner))]) { const o = storeOpen(s, n); if (!o.open) return {error: `${o.reason}. Remove its items or try later.`}; }
  if (v.method === 'cod' && (s.codRefusals[s.person?.id || 'me'] || 0) >= settings(s).codRefusalLimit) return {error: 'Cash on delivery is unavailable after repeated refused deliveries. Pay online.'};
  const pin = Geo.pinFrom(s, v), geoErr = Geo.checkServiceable(s, [...new Set(lines.map(l => l.product.fulfilmentPartner))], pin); if (geoErr && v.fulfilment !== 'pickup') return {error: geoErr}; s.customerPin = pin;
  const r = couponDiscount(s, v.plusCoupon, lines, v.method); if (r.error) return {error: r.error};
  const tip = v.fulfilment === 'pickup' ? 0 : Math.max(0, Math.min(500, Number(v.plusTip || 0)));
  const weightExtra = lines.filter(l => l.product.soldByWeight).reduce((a, l) => a + Math.round(l.product.price * l.quantity * 0.1), 0);
  return {discount: r.discount || 0, coupon: r.coupon || null, tip, slot: v.plusSlot || 'express', repeat: v.plusRepeat || '', itemsAll: q.items, weightExtra, pin};
}
export function applyToOrder(s, o, adj, index, count, ordersSoFar = []) {
  o.createdAt ??= clock();
  if (!adj) return;
  let share = 0;
  if (adj.discount) { if (adj.coupon?.store) share = o.fulfilmentPartner === adj.coupon.store ? adj.discount : 0; else share = index === count - 1 ? adj.discount - ordersSoFar.reduce((a, x) => a + (x.discount || 0), 0) : Math.round(adj.discount * o.itemTotal / adj.itemsAll); }
  const tip = index === 0 && o.fulfilment !== 'pickup' ? adj.tip : 0;
  Object.assign(o, {discount: share, couponCode: share ? adj.coupon.code : '', couponFunding: share ? adj.coupon.fundedBy : '', tip, slot: adj.slot, total: o.itemTotal + o.deliveryFee - share + tip, weightPreauth: o.items.some(i => s.products.find(p => p.id === i.productId)?.soldByWeight)});
  o.etaMinutes = adj.slot === 'express' ? etaMinutes(s, o.fulfilmentPartner, o.address) : null;
  o.deliveryKm = distanceKm(o.pickupAddress || o.fulfilmentPartner, o.address);
  if (o.fulfilment !== 'pickup') Geo.applyOrder(s, o, adj.pin);
}
export function afterInitialize(s, o) {
  const st = settings(s);
  o.feeBreakdown.productCommission = Math.round(o.itemTotal * commissionRate(s, o));
  if (o.couponFunding === 'seller') o.feeBreakdown.sellerDiscount = o.discount;
  if (o.couponFunding === 'platform') o.feeBreakdown.platformDiscount = o.discount;
  const taxable = o.items.reduce((a, i) => { const p = s.products.find(x => x.id === i.productId); return a + i.unitPrice * i.quantity / (1 + (p?.gstRate || 0) / 100); }, 0) - (o.feeBreakdown.sellerDiscount || 0);
  o.feeBreakdown.tcs = Math.round(taxable * st.tcsPct / 100); o.feeBreakdown.tds = Math.round(o.itemTotal * st.tdsPct / 100);
  o.feeBreakdown.deliveryPartnerEarning = deliveryPay(s, o);
  o.sellerDue = o.itemTotal - o.feeBreakdown.productCommission - (o.feeBreakdown.sellerDiscount || 0) - o.feeBreakdown.tcs - o.feeBreakdown.tds;
}
export function afterPlace(s, orders, adj, v, lines) {
  if (!adj) return;
  if (adj.coupon) s.couponUses.push({code: adj.coupon.code, orders: orders.map(o => o.id), discount: adj.discount, fundedBy: adj.coupon.fundedBy, at: stamp()});
  if (adj.repeat) s.schedules.push({id: uid('SCH'), frequency: adj.repeat, items: lines.map(l => ({productId: l.productId || l.product.id, quantity: l.quantity})), nextDue: addDays(today(), adj.repeat === 'daily' ? 1 : 7), active: true, address: v.address});
  s.checkoutPlus = {};
}
export const istTime = t => new Date(t ?? clock()).toLocaleTimeString('en-GB', {timeZone: 'Asia/Kolkata', hour12: false}).slice(0, 5);
export const isPeak = (s, t) => { const st = settings(s), x = istTime(t); return st.peakStart <= st.peakEnd ? x >= st.peakStart && x < st.peakEnd : x >= st.peakStart || x < st.peakEnd; };
export const deliveryPay = (s, o) => Math.max(30, Math.round(20 + 8 * (o.deliveryKm || distanceKm(o.pickupAddress || '', o.address || '')))) + (o.tip || 0) + (isPeak(s, o.createdAt) ? (settings(s).peakBonus || 0) : 0);

// ---------- picking ----------
export const aisleSort = (s, items) => [...items].sort((a, b) => String(s.products.find(p => p.id === a.productId)?.aisle).localeCompare(String(s.products.find(p => p.id === b.productId)?.aisle)));
export function pickInputs(s, o, i) {
  const p = s.products.find(x => x.id === i.productId); if (!p) return '';
  return `<small class="muted">Aisle ${esc(p.aisle)} · barcode ${esc(p.barcode)}</small><input class="scan-input" data-scan="${esc(o.id)}|${esc(p.id)}" placeholder="Scan or type barcode"><button type="button" class="button text compact" data-plus-demo-scan="${esc(o.id)}|${esc(p.id)}" data-code="${esc(p.barcode)}">Demo: simulate scan</button>${p.soldByWeight ? `<input class="scan-input" type="number" step="0.01" data-weight="${esc(o.id)}|${esc(p.id)}" placeholder="Weighed kg (ordered ${i.quantity * (p.nominalKg || 1)})">` : ''}`;
}
export function pickVerify(s, oid, pid, root) {
  ensurePlus(s);
  const o = (s.customerOrders || []).find(x => x.id === oid), p = s.products.find(x => x.id === pid), item = o?.items.find(x => x.productId === pid); if (!o || !p || !item) return 'Item not found.';
  const scanned = String(root.querySelector(`[data-scan="${oid}|${pid}"]`)?.value || '').trim();
  if (scanned !== String(p.barcode)) return `Barcode does not match ${p.name}. Scan the correct product (prototype: ${p.barcode}).`;
  if (p.soldByWeight) {
    const kg = Number(root.querySelector(`[data-weight="${oid}|${pid}"]`)?.value), ordered = item.quantity * (p.nominalKg || 1);
    if (!(kg > 0)) return 'Enter the weighed amount in kg.';
    if (kg > ordered * 1.1) return `That is more than 10% over the ordered ${ordered} kg. Remove some and weigh again.`;
    applyWeight(s, o, item, p, kg, ordered);
  }
  return '';
}
function applyWeight(s, o, item, p, kg, ordered) {
  const amount = Math.round(item.unitPrice * item.quantity * kg / ordered), diff = amount - (item.finalAmount ?? item.unitPrice * item.quantity);
  item.weighedKg = kg; item.finalAmount = amount; if (!diff) return;
  o.itemTotal += diff; o.total += diff; o.feeBreakdown.productCommission = Math.round(o.itemTotal * commissionRate(s, o)); afterInitialize(s, o);
  if (!o.cod && !o.payAtStore) record(s, {owner: 'personal', orderId: o.id, sourceType: 'order', sourceId: o.id, type: diff < 0 ? 'refund' : 'customer_payment', purpose: 'weight_adjustment', payer: diff < 0 ? 'moveai' : 'personal', payee: diff < 0 ? 'personal' : o.party, responsible: o.party, amount: Math.abs(diff), method: diff < 0 ? 'wallet' : 'preauth', reference: `WT-${o.id}-${p.id}`, status: diff < 0 ? 'refunded' : 'held', note: `${p.name}: weighed ${kg} kg instead of ${ordered} kg`}, 'Store');
  if (diff < 0 && !o.cod) walletCredit(s, -diff, `Weight difference · ${p.name} · ${o.id}`);
  (o.history ||= []).push({at: stamp(), text: `${p.name} weighed ${kg} kg · ${diff < 0 ? `₹${-diff} back to your MoveAI wallet` : `₹${diff} extra (pre-authorised)`}`});
}
export const needsPackPhoto = (s, o) => o.itemTotal >= 2000 || (['electrical', 'fashion'].includes(orderGroup(s, o)) && o.itemTotal >= 1000);
export const packPhotoHtml = (s, o) => needsPackPhoto(s, o) ? `<div class="pack-photo">${o.packPhoto ? `<small>Packing photo: ${esc(o.packPhoto)} ✓</small>` : `<label class="upload-label">Packing photo required <input type="file" accept="image/*" capture="environment" data-plus-file="pack-photo" data-id="${esc(o.id)}"></label>`}</div>` : '';

// ---------- delivery ----------
export function pickCourier(s, o) {
  const cap = settings(s).capacityPerCourier, active = id => (s.customerOrders || []).filter(x => x.deliveryAssignment?.partnerId === id && ['offered', 'accepted', 'picked_up'].includes(x.deliveryAssignment.status)).length;
  const sameStore = id => (s.customerOrders || []).some(x => x.id !== o.id && x.fulfilmentPartner === o.fulfilmentPartner && x.deliveryAssignment?.partnerId === id && ['offered', 'accepted'].includes(x.deliveryAssignment.status));
  const list = Object.values(s.deliveryPartners || {}).filter(p => p.status === 'approved' && p.available && active(p.id) < cap).map((p, order) => ({p, order, km: courierKm(p.id, o.pickupAddress || o.fulfilmentPartner), batch: sameStore(p.id)})).sort((a, b) => (b.batch - a.batch) || (Math.abs(a.km - b.km) < 1 ? a.order - b.order : a.km - b.km));
  if (list[0]) (o.history ||= []).push({at: stamp(), text: `Courier chosen: ${list[0].p.name} · ${list[0].km.toFixed(1)} km from the store${list[0].batch ? ' · batched with another order from this store' : ''}`});
  return list[0]?.p || null;
}
export const podRequired = o => o.podMode && o.podMode !== 'customer' && !o.podPhoto;
export function failedAttempt(s, o, reason) {
  o.attempts = (o.attempts || 0) + 1;
  if (/refus/i.test(reason) && o.cod) { const k = s.person?.id || 'me'; s.codRefusals[k] = (s.codRefusals[k] || 0) + 1; }
  return o.attempts < 2 ? 'reattempt' : 'return_to_store';
}

// ---------- returns, replacements, exchanges and help claims ----------
export function eligibility(s, o, item) {
  const p = s.products.find(x => x.id === item.productId), g = groupOf(p), rule = GROUPS[g], since = (clock() - (o.deliveredAt || clock())) / H;
  const done = (s.claims || []).filter(c => c.orderId === o.id && c.items.some(x => x.productId === item.productId) && !['rejected', 'qc_failed'].includes(c.status)).reduce((a, c) => a + c.items.find(x => x.productId === item.productId).qty, 0);
  const left = item.quantity - done, open = since <= rule.windowH;
  const kinds = !open ? [] : rule.returns === 'claim_only' ? ['missing', 'damaged', 'poor_quality'] : rule.returns === 'damaged_only' ? ['damaged', 'wrong_item', 'expired', 'missing'] : rule.returns === 'replace' ? ['defective', 'damaged', 'wrong_item', 'missing'] : ['return', 'exchange', 'damaged', 'wrong_item', 'missing'];
  return {p, g, rule, left, open, kinds, warranty: g === 'electrical' && !open ? `Window closed. Manufacturer warranty: ${p.details?.['Warranty (months)'] || 12} months — contact ${p.brand}.` : ''};
}
const KIND_LABEL = {missing: 'Missing item', damaged: 'Damaged', poor_quality: 'Poor quality / not fresh', wrong_item: 'Wrong item', expired: 'Expired at delivery', defective: 'Defective — replace', return: 'Return for refund', exchange: 'Exchange size'};
export function orderHelp(s, o) {
  ensurePlus(s);
  if (!['delivered', 'collected', 'return_requested', 'returned'].includes(o.status)) return '';
  const claims = s.claims.filter(c => c.orderId === o.id);
  const rows = o.items.map(i => { const e = eligibility(s, o, i), vs = variantsOf(s, e.p).filter(v => v.id !== i.productId); return `<div class="help-item"><b>${esc(i.name)}</b> <small class="muted">· ${esc(e.rule.label)} · ${esc(e.rule.policy)}</small>${e.warranty ? `<small class="block">${esc(e.warranty)}</small>` : ''}${e.kinds.length && e.left > 0 ? `<form class="inline-form" data-plus-form="claim" data-id="${esc(o.id)}" data-product="${esc(i.productId)}"><select name="kind">${e.kinds.map(k => `<option value="${k}">${KIND_LABEL[k]}</option>`).join('')}</select><input name="qty" type="number" min="1" max="${e.left}" value="${e.left}" title="Quantity"><input name="reason" placeholder="What happened?"><input name="photo" type="file" accept="image/*"><input name="serial" placeholder="${e.g === 'electrical' ? 'Serial number on the product' : ''}" ${e.g === 'electrical' ? '' : 'hidden'}>${e.g === 'fashion' ? `<select name="exchangeTo"><option value="">Exchange to size…</option>${vs.map(v => `<option value="${esc(v.id)}">${esc(v.variantLabel || v.size)}</option>`).join('')}</select><label><input type="checkbox" name="tags"> Tags intact, unused</label>` : ''}<select name="refundTo"><option value="wallet">Refund to MoveAI wallet (instant)</option><option value="source">${o.cod ? 'Refund to UPI' : 'Refund to original payment (3–5 days)'}</option></select>${o.cod ? '<input name="upi" placeholder="UPI ID for refund">' : ''}<button class="button secondary compact">Submit</button></form>` : `<small class="block muted">${e.left <= 0 ? 'Already raised for all units.' : 'The return window for this item has closed.'}</small>`}</div>`; }).join('');
  return `<details class="order-help" ${claims.some(c => !['refunded', 'replaced', 'exchanged', 'rejected', 'qc_failed', 'closed'].includes(c.status)) ? 'open' : ''}><summary class="button secondary compact">Help with this order</summary>${rows}<p class="plus-error field-error" hidden></p>${claims.map(c => `<div class="claim-row">${pill(c.status)} <b>${esc(c.id)}</b> · ${esc(KIND_LABEL[c.kind])} · ${c.items.map(x => `${x.qty} × ${esc(s.products.find(p => p.id === x.productId)?.name || x.productId)}`).join(', ')} · ${inr(c.amount)}<small class="block muted">${esc(c.history.at(-1)?.text || '')}</small></div>`).join('')}${reviewForm(s, o)}</details>`;
}
export function raiseClaim(s, o, pid, v) {
  const item = o.items.find(i => i.productId === pid), e = eligibility(s, o, item); if (!e.open) return 'The window for this item has closed.';
  if (!e.kinds.includes(v.kind)) return 'That option is not available for this item.';
  const qty = Math.max(1, Math.min(e.left, Number(v.qty) || 1));
  if (!['missing'].includes(v.kind) && !String(v.photo || '').trim()) return 'Add a photo of the item.';
  if (v.kind === 'defective' && !String(v.serial || '').trim()) return 'Enter the serial number printed on the product.';
  if (['return', 'exchange'].includes(v.kind) && !v.tags) return 'Fashion returns need tags intact and the item unused.';
  if (v.kind === 'exchange' && !v.exchangeTo) return 'Choose the size you want.';
  if (o.cod && v.refundTo === 'source' && !/^[\w.-]+@[a-z]{2,}$/i.test(String(v.upi || ''))) return 'Enter a UPI ID for the refund.';
  const unit = item.finalAmount != null ? item.finalAmount / item.quantity : item.unitPrice, amount = Math.round(unit * qty);
  const recent = s.claims.filter(c => clock() - c.createdAt < 30 * DAY).length;
  const c = {id: uid('CLM'), orderId: o.id, store: o.fulfilmentPartner, party: o.party, kind: v.kind, group: e.g, items: [{productId: pid, qty}], reason: String(v.reason || '').trim(), photo: v.photo || '', serial: v.serial || '', exchangeTo: v.exchangeTo || '', refundTo: v.refundTo || 'wallet', upi: v.upi || '', amount, createdAt: clock(), status: 'requested', history: [{at: stamp(), text: `${KIND_LABEL[v.kind]} raised by customer`}]};
  s.claims.unshift(c);
  const needsPickup = !['missing', 'poor_quality'].includes(v.kind) && e.g !== 'fresh';
  if (!needsPickup && amount <= settings(s).claimAutoLimit && recent < settings(s).claimMax30d) { refundClaim(s, c, o, 'Auto-approved small claim'); return ''; }
  if (needsPickup) { const courier = pickCourier(s, {...o, id: c.id}); c.pickup = {partnerId: courier?.id || null, partnerName: courier?.name || 'Waiting for a partner', code: String(1000 + hash(c.id) % 9000), status: courier ? 'assigned' : 'waiting'}; c.status = 'pickup_assigned'; c.history.push({at: stamp(), text: `Return pickup assigned to ${c.pickup.partnerName}. Show code ${c.pickup.code} to the partner.`}); }
  else { c.status = 'review'; c.history.push({at: stamp(), text: recent >= settings(s).claimMax30d ? 'Sent for review (several claims this month)' : 'Sent to the store and MoveAI for review'}); }
  notify(s, 'personal', `${c.id}: ${c.history.at(-1).text}`, o.id);
  return '';
}
export function walletCredit(s, amount, note) { s.customerWallet.balance += amount; s.customerWallet.entries.unshift({amount, note, at: stamp()}); }
export function refundClaim(s, c, o, why) {
  if (c.refundTo === 'wallet') walletCredit(s, c.amount, `Refund ${c.id} · ${o.id}`);
  record(s, {owner: 'personal', orderId: o.id, sourceType: 'claim', sourceId: c.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: o.party, amount: c.amount, method: c.refundTo === 'wallet' ? 'moveai_wallet' : o.cod ? 'upi' : o.method, reference: gateway.refund(c.id, c.amount).ref, status: c.refundTo === 'wallet' ? 'refunded' : 'refund_initiated', expectedBy: clock() + 5 * DAY, gatewayFinal: 'refunded', note: `${KIND_LABEL[c.kind]} · ${c.id}`}, 'MoveAI');
  // the seller bears the refunded amount minus the commission already charged on it
  const recover = Math.round(c.amount * (1 - commissionRate(s, o)));
  if (o.settlementStatus === 'paid') record(s, {owner: o.party, orderId: o.id, sourceType: 'claim', sourceId: c.id, type: 'return_recovery', payer: o.party, payee: 'moveai', responsible: o.party, amount: recover, method: 'next_payout', reference: `RR-${c.id}`, status: 'due', note: `Recovered from next payout · ${c.id}`}, 'MoveAI');
  else o.sellerDue = Math.max(0, (o.sellerDue || 0) - recover);
  c.status = 'refunded'; c.refundedAt = clock(); c.history.push({at: stamp(), text: `${why} · ${inr(c.amount)} ${c.refundTo === 'wallet' ? 'added to your MoveAI wallet' : 'refund started (3–5 days)'}`});
}
export function pickupAction(s, c, action, v = {}) {
  const o = (s.customerOrders || []).find(x => x.id === c.orderId);
  if (action === 'collect') {
    if (String(v.code) !== c.pickup.code) return 'Enter the return code the customer shows.';
    const checks = QC[c.group] || QC.food; if (checks.some((_, i) => !v[`qc${i}`])) { c.status = 'qc_failed'; c.history.push({at: stamp(), text: `Pickup refused at the door: ${checks.filter((_, i) => !v[`qc${i}`]).join(', ')}`}); return ''; }
    c.pickup.status = 'collected'; c.status = 'picked_up'; c.history.push({at: stamp(), text: 'Collected · condition check passed at the door'});
    if (c.kind === 'exchange') { c.status = 'exchanged'; const to = s.products.find(p => p.id === c.exchangeTo); if (to) to.quantity = Math.max(0, to.quantity - c.items[0].qty); restock(s, c); c.history.push({at: stamp(), text: `Size ${to?.variantLabel || ''} dispatched with the partner`}); return ''; }
    if (c.kind === 'defective') { c.status = 'replaced'; const p = s.products.find(x => x.id === c.items[0].productId); if (p) p.quantity = Math.max(0, p.quantity - c.items[0].qty); c.history.push({at: stamp(), text: 'Replacement unit dispatched; defective unit returned to the store as damaged stock'}); return ''; }
    if (['return', 'damaged', 'wrong_item', 'expired'].includes(c.kind)) { if (c.kind === 'return' || c.kind === 'wrong_item') restock(s, c); refundClaim(s, c, o, 'Refund on pickup'); }
    return '';
  }
  return 'Unknown action.';
}
const QC = {fashion: ['Tags intact', 'Unused and unwashed', 'Same item and size'], electrical: ['Serial number matches', 'All parts and box present'], food: ['Same product and batch', 'Damage / expiry visible as reported'], household: ['Same product', 'Damage / leak visible as reported']};
function restock(s, c) { for (const x of c.items) { const p = s.products.find(y => y.id === x.productId); if (p) { p.quantity += x.qty; (p.stockLog ||= []).push({at: stamp(), text: `+${x.qty} returned (${c.id})`}); } } }
export function storeDispute(s, c, note) { if (!['refunded', 'picked_up'].includes(c.status)) return 'Only refunded returns can be disputed.'; if (!String(note || '').trim()) return 'Explain what is wrong with the returned item.'; c.dispute = {note: note.trim(), at: stamp(), status: 'open'}; c.history.push({at: stamp(), text: 'Store disputed the return'}); return ''; }
export function adminDecide(s, c, decision) {
  if (c.service) return decideService(s, c, decision);
  const o = (s.customerOrders || []).find(x => x.id === c.orderId);
  if (c.status === 'review') { if (decision === 'approve') refundClaim(s, c, o, 'Approved after review'); else { c.status = 'rejected'; c.history.push({at: stamp(), text: 'Not approved after review'}); } return ''; }
  if (c.dispute?.status === 'open') { c.dispute.status = decision === 'approve' ? 'store_upheld' : 'store_rejected'; if (decision === 'approve') { record(s, {owner: o.party, orderId: o.id, sourceType: 'claim', sourceId: c.id, type: 'claim_compensation', payer: 'moveai', payee: o.party, responsible: 'moveai', amount: Math.round(c.amount * (1 - commissionRate(s, o))), method: 'next_payout', reference: `CC-${c.id}`, status: 'due', note: `MoveAI covers ${c.id} after the store's dispute was upheld`}, 'Admin'); } c.history.push({at: stamp(), text: decision === 'approve' ? 'Dispute upheld: MoveAI compensates the store' : 'Dispute rejected: refund stands'}); return ''; }
  return 'Nothing to decide.';
}
function reviewForm(s, o) {
  if (!['delivered', 'collected'].includes(o.status)) return '';
  const todo = o.items.filter(i => !(s.reviews || []).some(r => r.orderId === o.id && r.productId === i.productId));
  return todo.length ? `<form class="inline-form" data-plus-form="review" data-id="${esc(o.id)}"><b>Rate your items</b><select name="productId">${todo.map(i => `<option value="${esc(i.productId)}">${esc(i.name)}</option>`).join('')}</select><select name="rating">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}</select><input name="text" placeholder="Your review (optional)"><select name="storeRating"><option value="">Rate store</option>${[5, 4, 3, 2, 1].map(n => `<option>${n}</option>`).join('')}</select><select name="deliveryRating"><option value="">Rate delivery</option>${[5, 4, 3, 2, 1].map(n => `<option>${n}</option>`).join('')}</select><button class="button secondary compact">Submit</button></form>` : '';
}

// ---------- notifications outbox (simulated SMS / WhatsApp / push) ----------
export function notify(s, to, text, ref) { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, at: stamp(), read: false}); channelLog(s, to, text); }
export function channelLog(s, to, text) { (s.outbox ||= []).unshift({to, text, channels: NC.channelsFor(s, to, text), at: stamp()}); s.outbox.length = Math.min(s.outbox.length, 200); }

// ---------- seller tools ----------
const REQUIRED = {fresh: ['Best before'], food: ['Ingredients', 'Best before', 'FSSAI licence'], household: ['Manufacturer'], electrical: ['Brand', 'Model', 'Warranty (months)'], fashion: ['Fabric', 'Size chart']};
const BANNED = /\b(alcohol|beer|wine|whisky|cigarette|tobacco|gutkha|vape|gun|knife|drug|medicine|prescription)\b/i;
export function listingCheck(s, p) {
  const g = groupOf(p), problems = [];
  if (!(p.mrp >= p.price)) problems.push('Price is above MRP');
  for (const f of REQUIRED[g]) if (!String(p.details?.[f] || '').trim()) problems.push(`${f} is required for ${GROUPS[g].label}`);
  if (BANNED.test(`${p.name} ${p.description || ''}`)) problems.push('Restricted item');
  if (s.products.some(x => x.id !== p.id && x.fulfilmentPartner === p.fulfilmentPartner && x.name === p.name && x.size === p.size)) problems.push('Duplicate of another listing');
  const partner = Object.values(s.shopPartners || {}).find(x => x.name === p.fulfilmentPartner); if (partner && !partner.approvedGroups?.includes(g)) problems.push(`Store is not approved to sell ${GROUPS[g].label}`);
  return problems;
}
export function saveListing(s, p, v) {
  const before = `${p.name}|${p.category}|${p.size}`;
  Object.assign(p, {mrp: Number(v.mrp) || p.mrp, brand: String(v.brand || p.brand).trim(), hsn: String(v.hsn || p.hsn).trim(), gstRate: Number(v.gstRate ?? p.gstRate), aisle: String(v.aisle || p.aisle).trim(), soldByWeight: Boolean(v.soldByWeight), variantGroup: String(v.variantGroup || '').trim() || undefined, variantLabel: String(v.variantLabel || '').trim() || undefined, images: String(v.images || '').split(/\s+/).filter(x => /^https?:/.test(x))});
  p.details = {...(p.details || {})}; for (const [k, val] of Object.entries(v)) if (k.startsWith('d:')) p.details[k.slice(2)] = String(val).trim();
  if (!(p.mrp >= p.price)) return 'Selling price cannot be above MRP.';
  const issues = listingCheck(s, p).filter(x => !/Duplicate/.test(x));
  if (issues.length) { p.approval = 'changes_needed'; p.approvalNote = issues.join('; '); return `Saved, but not live: ${issues.join('; ')}.`; }
  if (before !== `${p.name}|${p.category}|${p.size}` || p.approval !== 'approved') { p.approval = 'pending'; p.approvalNote = 'Waiting for MoveAI review'; }
  return '';
}
export function bulkUpload(s, store, csv) {
  const rows = String(csv || '').trim().split(/\n+/).map(r => (r.match(/("[^"]*"|(?:\\,|[^,])+)/g) || []).map(x => x.trim().replace(/^"|"$/g, '').replace(/\\,/g, ','))).filter(r => r.length >= 6 && !/^name$/i.test(r[0]));
  const out = {created: 0, updated: 0, errors: []};
  rows.forEach((r, i) => { const [name, category, size, price, mrp, qty, brand = '', barcode = '', hsn = ''] = r; if (!name || !(Number(price) > 0) || !(Number(mrp) >= Number(price))) { out.errors.push(`Row ${i + 1}: check name, price and MRP`); return; }
    let p = s.products.find(x => x.fulfilmentPartner === store && x.name === name && x.size === size);
    if (p) { Object.assign(p, {price: Number(price), mrp: Number(mrp)}); p.quantity = Number(qty) || p.quantity; out.updated += 1; }
    else { p = {id: `PRD-U${Date.now().toString().slice(-5)}${i}`, name, category, size, price: Number(price), mrp: Number(mrp), quantity: Number(qty) || 0, reserved: 0, lowStockAt: 5, status: 'active', stock: 'In stock', vegStatus: 'vegetarian', fulfilmentPartner: store, brand: brand || name.split(' ')[0], barcode: barcode || undefined, hsn: hsn || undefined, approval: 'pending', approvalNote: 'New listing · waiting for MoveAI review'}; s.products.push(p); out.created += 1; } });
  ensurePlus(s); return out;
}
export function addBatch(s, p, qty, expiry) { if (!(Number(qty) > 0) || !expiry) return 'Enter quantity and expiry date.'; if (expiry <= today()) return 'Expiry must be in the future.'; (p.batches ||= []).push({id: `${p.id}-B${p.batches.length + 1}`, qty: Number(qty), expiry}); p.quantity = Number(p.quantity || 0) + Number(qty); return ''; }
export function consumeBatches(s, o) {
  for (const x of o.inventoryCommitted || o.items || []) { const p = s.products.find(y => y.id === x.productId); if (!p?.batches) continue; let left = x.quantity; for (const b of [...p.batches].sort((a, c) => a.expiry.localeCompare(c.expiry))) { if (!left) break; const take = Math.min(left, b.qty); b.qty -= take; left -= take; } }
}
export function analytics(s, name) {
  const os = (s.customerOrders || []).filter(o => o.fulfilmentPartner === name), done = os.filter(o => ['delivered', 'collected'].includes(o.status));
  const sales = done.reduce((a, o) => a + o.itemTotal, 0), claims = (s.claims || []).filter(c => c.store === name);
  const top = {}; for (const o of done) for (const i of o.items) top[i.name] = (top[i.name] || 0) + i.quantity;
  const ratings = (s.reviews || []).filter(r => r.store === name && r.storeRating);
  return {orders: os.length, delivered: done.length, sales, aov: done.length ? Math.round(sales / done.length) : 0, cancelRate: os.length ? Math.round(os.filter(o => o.status === 'cancelled').length / os.length * 100) : 0, returnRate: done.length ? Math.round(claims.length / done.length * 100) : 0, rating: ratings.length ? Math.round(ratings.reduce((a, r) => a + r.storeRating, 0) / ratings.length * 10) / 10 : null, top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5), pendingPayout: os.filter(o => o.settlementStatus === 'pending').reduce((a, o) => a + (o.sellerDue || 0), 0), paidPayout: os.filter(o => o.settlementStatus === 'paid').reduce((a, o) => a + (o.sellerDue || 0), 0), tcs: os.reduce((a, o) => a + (o.feeBreakdown?.tcs || 0), 0), tds: os.reduce((a, o) => a + (o.feeBreakdown?.tds || 0), 0)};
}

// ---------- screens ----------
const SELLER_WS = ['grocery', 'groceryFresh', 'electrical', 'fashion'];
const storeWs = ws => SELLER_WS.includes(ws) ? ws : SELLER_WS.find(k => ws === `${k}Manager`) || null;
export function screen(s, route, ws) {
  ensurePlus(s);
  if (route === 'wishlist' && ws === 'personal') return wishlistScreen(s);
  if (route === 'moveaiWallet' && ws === 'personal') return walletScreen(s);
  if (route === 'monthlyStatement' && ws === 'personal') return customerStatementScreen(s);
  const sw = storeWs(ws);
  if (sw && route === 'plusListings') return listingsScreen(s, sw);
  if (sw && route === 'plusStore') return storeScreen(s, sw);
  if (sw && route === 'plusAnalytics') return analyticsScreen(s, sw);
  if (sw && route === 'plusReturns') return sellerReturnsScreen(s, sw);
  if (ws === 'admin' && route === 'plusApprovals') return approvalsScreen(s);
  if (ws === 'admin' && route === 'plusClaims') return claimsScreen(s);
  if (ws === 'admin' && route === 'plusSettings') return settingsScreen(s);
  if (ws === 'admin' && route === 'plusReports') return reportsScreen(s);
  return '';
}
function wishlistScreen(s) {
  const prods = s.wishlist.map(id => s.products.find(p => p.id === id)).filter(Boolean);
  const bought = {}; for (const o of (s.customerOrders || []).filter(o => ['delivered', 'collected'].includes(o.status))) for (const i of o.items) bought[i.productId] = (bought[i.productId] || 0) + i.quantity;
  const again = Object.keys(bought).map(id => s.products.find(p => p.id === id)).filter(Boolean);
  const card = p => `<article class="market-row"><span><b>${esc(p.name)}</b><small>${esc(p.size)} · ${inr(p.price)}${p.mrp > p.price ? ` · <s>${inr(p.mrp)}</s>` : ''}</small></span><button class="button secondary compact" data-po-add="${esc(p.id)}">Add to cart</button></article>`;
  return `${head('Wishlist & buy again', 'Saved products, your regular items and repeat orders.', '<button class="button secondary" data-route="search">Shop</button>')}
  <section class="panel"><h2>Buy again</h2>${again.map(card).join('') || '<p class="muted">Items from delivered orders appear here.</p>'}${again.length ? '<button class="button primary" data-plus="add-all-again">Add all to cart</button>' : ''}</section>
  <section class="panel"><h2>Wishlist</h2>${prods.map(p => card(p) + `<button class="button text compact" data-plus="wish" data-id="${esc(p.id)}">Remove</button>`).join('') || '<p class="muted">Tap ♡ on a product to save it.</p>'}</section>
  <section class="panel"><h2>Saved lists</h2>${s.savedLists.map((l, i) => `<article class="market-row"><span><b>${esc(l.name)}</b><small>${l.items.length} items</small></span><button class="button secondary compact" data-plus="list-to-cart" data-id="${i}">Add to cart</button></article>`).join('') || '<p class="muted">Save your current cart as a list (e.g. "Monthly groceries").</p>'}<form class="inline-form" data-plus-form="save-list"><input name="name" placeholder="List name"><button class="button secondary compact">Save current cart as a list</button></form></section>
  <section class="panel"><h2>Repeat orders</h2>${s.schedules.map(x => `<article class="market-row"><span><b>${x.frequency === 'daily' ? 'Every day' : 'Every week'} · ${x.items.length} items</b><small>Next: ${esc(x.nextDue)}${x.active ? '' : ' · paused'}</small></span>${x.nextDue <= today() && x.active ? `<button class="button primary compact" data-plus="schedule-cart" data-id="${esc(x.id)}">Due — review & order</button>` : ''}<button class="button secondary compact" data-plus="schedule-toggle" data-id="${esc(x.id)}">${x.active ? 'Pause' : 'Resume'}</button></article>`).join('') || '<p class="muted">Choose "Repeat this order" at checkout.</p>'}<button class="button text compact" data-plus="schedule-advance">Prototype: move repeat dates to today</button></section>`;
}
function walletScreen(s) { const w = s.customerWallet; return `${head('MoveAI wallet', 'Instant refunds and weight differences. Used automatically at your next checkout in a real launch.')}<div class="metrics"><div class="metric"><span>Balance</span><b>${inr(w.balance)}</b></div></div><section class="panel">${w.entries.map(e => `<div class="ledger-row static"><span><b>${esc(e.note)}</b><small>${esc(e.at)}</small></span><span class="amount in">+${inr(e.amount)}</span></div>`).join('') || '<p class="muted">No wallet activity yet.</p>'}</section>`; }
function listingsScreen(s, ws) {
  const p0 = s.shopPartners[ws], prods = s.products.filter(p => p.fulfilmentPartner === p0.name), edit = prods.find(p => p.id === s.plusEditProduct);
  const exp = prods.flatMap(p => (p.batches || []).filter(b => b.qty > 0 && b.expiry <= addDays(today(), 3)).map(b => `${p.name}: ${b.qty} expire ${b.expiry}`));
  return `${head('Listings & stock', `${p0.name} · MRP, details, approval, variants, batches and bulk upload`)}
  ${exp.length ? `<div class="action-warning"><b>Expiring within 3 days</b><span>${esc(exp.join(' · '))}. Sell first or mark down; expired batches are removed from stock automatically.</span></div>` : ''}
  <section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Product</th><th>Price / MRP</th><th>Stock & batches</th><th>Listing</th><th></th></tr></thead><tbody>${prods.map(p => `<tr><td><b>${esc(p.name)}</b><small class="block muted">${esc(p.size)} · ${esc(GROUPS[groupOf(p)].label)} · aisle ${esc(p.aisle)}${p.variantGroup ? ` · variant ${esc(p.variantLabel || '')}` : ''}</small></td><td>${inr(p.price)} / ${inr(p.mrp)}<small class="block muted">${offPct(p)}% off · HSN ${esc(p.hsn)} · GST ${p.gstRate}%</small></td><td>${p.quantity - (p.reserved || 0)} available${(p.batches || []).filter(b => b.qty > 0).map(b => `<small class="block muted">${b.qty} · exp ${b.expiry}</small>`).join('')}</td><td>${pill(p.approval)}${p.approvalNote ? `<small class="block muted">${esc(p.approvalNote)}</small>` : ''}</td><td><button class="button secondary compact" data-plus="edit-listing" data-id="${esc(p.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div></section>
  ${edit ? listingForm(s, edit) : ''}
  <div class="grid two"><section class="panel"><h2>Bulk upload (CSV)</h2><p class="muted">One product per line: name, category, size, price, MRP, quantity, brand, barcode, HSN. New products wait for MoveAI review.</p><form data-plus-form="bulk" class="form-grid"><textarea name="csv" rows="5" placeholder="Toor Dal,Pulses\\, dal & beans,1 kg,165,180,30,Tata Sampann,8901234567890,0713"></textarea><button class="button secondary">Upload</button></form></section>
  <section class="panel"><h2>Receive stock (batch)</h2><form class="inline-form" data-plus-form="batch"><select name="productId">${prods.filter(p => ['fresh', 'food'].includes(groupOf(p))).map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.size)}</option>`).join('')}</select><input name="qty" type="number" min="1" placeholder="Qty"><input name="expiry" type="date"><button class="button secondary compact">Add batch</button></form><p class="muted">Pickers are guided to the oldest expiry first (first expiry, first out).</p></section></div><p class="plus-error field-error" hidden></p>`;
}
function listingForm(s, p) {
  const g = groupOf(p);
  return `<section class="panel"><h2>Edit listing · ${esc(p.name)} ${esc(p.size)}</h2><form class="form-grid two" data-plus-form="listing" data-id="${esc(p.id)}"><label><span>MRP (₹)</span><input name="mrp" type="number" value="${p.mrp}"></label><label><span>Brand</span><input name="brand" value="${esc(p.brand || '')}"></label><label><span>HSN code</span><input name="hsn" value="${esc(p.hsn || '')}"></label><label><span>GST %</span><select name="gstRate">${[0, 5, 12, 18, 28].map(r => `<option ${p.gstRate === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label><label><span>Aisle / shelf</span><input name="aisle" value="${esc(p.aisle || '')}"></label><label><span>Variant group (same product, other size / pack)</span><input name="variantGroup" value="${esc(p.variantGroup || '')}" placeholder="e.g. VG-SHIRT"></label><label><span>Variant label</span><input name="variantLabel" value="${esc(p.variantLabel || '')}" placeholder="e.g. M, 1 kg"></label><label class="consent-row"><input type="checkbox" name="soldByWeight" ${p.soldByWeight ? 'checked' : ''}> Sold by weight (picker weighs it)</label><label class="wide"><span>Image links (space-separated, http…)</span><input name="images" value="${esc((p.images || []).join(' '))}"></label>${GROUPS[g].details.map(f => `<label><span>${esc(f)}${REQUIRED[g].includes(f) ? ' *' : ''}</span><input name="d:${esc(f)}" value="${esc(p.details?.[f] || '')}"></label>`).join('')}<button class="button primary wide">Save listing</button></form></section>`;
}
function storeScreen(s, ws) {
  const p = s.shopPartners[ws], ob = p.onboarding, groups = Object.keys(GROUPS);
  return `${head('Store setup', `${p.name} · onboarding, categories, hours and order intake`)}
  <div class="grid two"><section class="panel"><h2>Verification ${pill(ob.status)}</h2><form class="form-grid" data-plus-form="onboard"><label><span>GSTIN</span><input name="gstin" value="${esc(ob.gstin || '')}"></label><label><span>PAN</span><input name="pan" value="${esc(ob.pan || '')}"></label><label><span>Payout account (₹1 check)</span><input name="account" value="${esc(p.payoutAccount?.accountNumber || '')}"></label><label><span>IFSC</span><input name="ifsc" value="SBIN0001234"></label><label><span>FSSAI licence (food sellers)</span><input name="fssai" value="${esc(ob.fssai || '')}" placeholder="14 digits"></label><button class="button secondary">Verify and submit</button></form><p class="muted">Changes go to MoveAI for approval; payouts continue to the verified account meanwhile.</p></section>
  <section class="panel"><h2>Categories you can sell</h2>${groups.map(g => `<div class="ledger-row static"><span><b>${GROUPS[g].label}</b><small>Commission ${Math.round((settings(s).commission[g] ?? GROUPS[g].commission) * 100)}% · payout after ${settings(s).holdDays[g] ?? GROUPS[g].holdDays} days</small></span>${p.approvedGroups.includes(g) ? pill('approved') : (p.categoryRequests || []).includes(g) ? pill('pending') : `<button class="button secondary compact" data-plus="request-group" data-id="${g}">Request</button>`}</div>`).join('')}</section></div>
  <section class="panel"><h2>Order intake</h2><form class="inline-form" data-plus-form="hours"><label>Opens <input type="time" name="open" value="${esc(p.hours.open)}"></label><label>Closes <input type="time" name="close" value="${esc(p.hours.close)}"></label><button class="button secondary compact">Save hours</button></form><div class="row-actions"><button class="button ${p.paused ? 'primary' : 'secondary'}" data-plus="toggle-pause">${p.paused ? 'Resume orders' : 'Pause new orders'}</button><button class="button secondary" data-plus="toggle-busy">${p.busy ? 'Back to normal prep time' : 'Busy: add 15 min to delivery estimates'}</button></div></section><p class="plus-error field-error" hidden></p>`;
}
function analyticsScreen(s, ws) {
  const p = s.shopPartners[ws], a = analytics(s, p.name);
  return `${head('Analytics', `${p.name} · sales, quality and payouts`)}<div class="metrics"><div class="metric"><span>Delivered sales</span><b>${inr(a.sales)}</b><small>${a.delivered} orders · AOV ${inr(a.aov)}</small></div><div class="metric"><span>Cancellation rate</span><b>${a.cancelRate}%</b></div><div class="metric"><span>Return / claim rate</span><b>${a.returnRate}%</b></div><div class="metric"><span>Store rating</span><b>${a.rating ?? '—'}</b></div></div>
  <div class="grid two"><section class="panel"><h2>Top products</h2>${a.top.map(([n, q]) => `<div class="ledger-row static"><span><b>${esc(n)}</b></span><span>${q} sold</span></div>`).join('') || '<p class="muted">No delivered orders yet.</p>'}</section><section class="panel"><h2>Payouts</h2><table class="price-table"><tbody><tr><td>Waiting (return window / hold)</td><td>${inr(a.pendingPayout)}</td></tr><tr><td>Paid</td><td>${inr(a.paidPayout)}</td></tr><tr><td>TCS collected (GST, ${settings(s).tcsPct}%)</td><td>${inr(a.tcs)}</td></tr><tr><td>TDS (194-O, ${settings(s).tdsPct}%)</td><td>${inr(a.tds)}</td></tr></tbody></table><p class="muted">Tax rates are settings to confirm with a CA. Certificates are issued quarterly in a real launch.</p></section></div>${sellerStatementHtml(s, p.name)}`;
}
function sellerReturnsScreen(s, ws) {
  const p = s.shopPartners[ws], list = (s.claims || []).filter(c => c.store === p.name);
  return `${head('Returns & claims', `${p.name} · refunds are deducted from your payout minus the commission charged`)}<section class="panel">${list.map(c => `<div class="claim-row">${pill(c.status)} <b>${esc(c.id)}</b> · ${esc(KIND_LABEL[c.kind])} · ${c.items.map(x => `${x.qty} × ${esc(s.products.find(pp => pp.id === x.productId)?.name || '')}`).join(', ')} · ${inr(c.amount)}<small class="block muted">${esc(c.reason)}${c.photo ? ` · photo ${esc(c.photo)}` : ''}${c.serial ? ` · serial ${esc(c.serial)}` : ''}</small>${c.dispute ? `<small class="block">Dispute: ${esc(c.dispute.note)} · ${esc(c.dispute.status)}</small>` : ['refunded', 'picked_up'].includes(c.status) ? `<form class="inline-form" data-plus-form="dispute" data-id="${esc(c.id)}"><input name="note" placeholder="Why the return is not valid (e.g. item used, wrong item returned)"><button class="button secondary compact">Dispute</button></form>` : ''}</div>`).join('') || '<p class="muted">No returns or claims.</p>'}</section><p class="plus-error field-error" hidden></p>`;
}
function approvalsScreen(s) {
  const pend = s.products.filter(p => ['pending', 'changes_needed'].includes(p.approval)), reqs = Object.entries(s.shopPartners || {}).flatMap(([k, p]) => (p.categoryRequests || []).map(g => ({k, p, g}))), ob = Object.entries(s.shopPartners || {}).filter(([, p]) => p.onboarding?.status === 'pending');
  return `${head('Seller & listing approvals', 'Listings are checked for MRP, required details, restricted items and duplicates before going live.')}
  <section class="panel"><h2>Listings (${pend.length})</h2>${pend.map(p => { const issues = listingCheck(s, p); return `<div class="claim-row"><b>${esc(p.name)} ${esc(p.size)}</b> · ${esc(p.fulfilmentPartner)} · ${inr(p.price)} / MRP ${inr(p.mrp)}<small class="block ${issues.length ? 'field-error' : 'muted'}">${issues.length ? esc(issues.join('; ')) : 'All checks passed'}</small><span class="row-actions"><button class="button primary compact" data-plus="listing-approve" data-id="${esc(p.id)}" ${issues.length ? 'disabled' : ''}>Approve</button><button class="button secondary compact" data-plus="listing-reject" data-id="${esc(p.id)}">Send back</button></span></div>`; }).join('') || '<p class="muted">Nothing waiting.</p>'}</section>
  <section class="panel"><h2>Category requests (${reqs.length})</h2>${reqs.map(r => `<div class="claim-row"><b>${esc(r.p.name)}</b> wants to sell <b>${GROUPS[r.g].label}</b>${r.g === 'food' || r.g === 'fresh' ? ` · FSSAI ${esc(r.p.onboarding?.fssai || 'missing')}` : ''}<span class="row-actions"><button class="button primary compact" data-plus="group-approve" data-id="${r.k}|${r.g}" ${(r.g === 'food' || r.g === 'fresh') && !/^\d{14}$/.test(r.p.onboarding?.fssai || '') ? 'disabled' : ''}>Approve</button></span></div>`).join('') || '<p class="muted">None.</p>'}</section>
  <section class="panel"><h2>Seller verification (${ob.length})</h2>${ob.map(([k, p]) => `<div class="claim-row"><b>${esc(p.name)}</b> · GSTIN ${esc(p.onboarding.gstin)} · PAN ${esc(p.onboarding.pan)} · bank ${p.onboarding.bankVerified ? 'verified' : 'not verified'}<span class="row-actions"><button class="button primary compact" data-plus="onboard-approve" data-id="${k}">Approve</button></span></div>`).join('') || '<p class="muted">None.</p>'}</section>`;
}
function claimsScreen(s) {
  const list = s.claims || [];
  return `${head('Returns & claims centre', 'Customer claims, return pickups and store disputes.')}<div class="metrics"><div class="metric"><span>Open</span><b>${list.filter(c => !['refunded', 'replaced', 'exchanged', 'rejected', 'qc_failed'].includes(c.status)).length}</b></div><div class="metric"><span>Refunded</span><b>${inr(list.filter(c => c.status === 'refunded').reduce((a, c) => a + c.amount, 0))}</b></div><div class="metric"><span>Store disputes</span><b>${list.filter(c => c.dispute?.status === 'open').length}</b></div></div>
  <section class="panel">${list.map(c => `<div class="claim-row">${pill(c.status)} <b>${esc(c.id)}</b> · ${esc(c.store)} · ${esc(KIND_LABEL[c.kind])} · ${inr(c.amount)}${c.dispute ? ` · dispute ${esc(c.dispute.status)}` : ''}<small class="block muted">${esc(c.reason)} · ${esc(c.history.at(-1)?.text || '')}</small>${c.status === 'review' || c.dispute?.status === 'open' ? `<span class="row-actions"><button class="button primary compact" data-plus="claim-approve" data-id="${esc(c.id)}">${c.dispute?.status === 'open' ? 'Uphold store' : 'Approve refund'}</button><button class="button secondary compact" data-plus="claim-reject" data-id="${esc(c.id)}">${c.dispute?.status === 'open' ? 'Reject dispute' : 'Reject'}</button></span>` : ''}</div>`).join('') || '<p class="muted">No claims yet.</p>'}</section>`;
}
function settingsScreen(s) {
  const st = settings(s);
  return `${head('Commerce settings', 'Commission and payout hold by category, tax rates, limits and coupons.')}
  <section class="panel"><form class="form-grid" data-plus-form="settings"><div class="table-scroll"><table class="data-table"><thead><tr><th>Category</th><th>Commission %</th><th>Payout after (days)</th><th>Returns</th></tr></thead><tbody>${Object.entries(GROUPS).map(([g, x]) => `<tr><td>${x.label}</td><td><input name="c:${g}" type="number" step="0.5" value="${Math.round((st.commission[g] ?? x.commission) * 1000) / 10}"></td><td><input name="h:${g}" type="number" value="${st.holdDays[g] ?? x.holdDays}"></td><td><small>${esc(x.policy)} Recommended: ${RECOMMENDED.commission[g]}% · ${RECOMMENDED.holdDays[g]} days.</small></td></tr>`).join('')}</tbody></table></div>
  <div class="form-grid two"><label><span>TCS on sales % (GST) — commonly 0.5%; confirm with a CA</span><input name="tcsPct" type="number" step="0.1" value="${st.tcsPct}"></label><label><span>TDS on payouts % (194-O) — commonly 0.1%; confirm with a CA</span><input name="tdsPct" type="number" step="0.1" value="${st.tdsPct}"></label><label><span>Auto-refund small claims up to ₹</span><input name="claimAutoLimit" type="number" value="${st.claimAutoLimit}"></label><label><span>Max claims per customer in 30 days</span><input name="claimMax30d" type="number" value="${st.claimMax30d}"></label><label><span>Block COD after refusals</span><input name="codRefusalLimit" type="number" value="${st.codRefusalLimit}"></label><label><span>Extra payout hold for new sellers (days)</span><input name="newSellerExtraHoldDays" type="number" value="${st.newSellerExtraHoldDays}"></label><label><span>Orders per courier at once</span><input name="capacityPerCourier" type="number" value="${st.capacityPerCourier}"></label><label><span>Peak bonus per delivery ₹ (${esc(st.peakStart)}–${esc(st.peakEnd)} IST)</span><input name="peakBonus" type="number" value="${st.peakBonus}"></label><label><span>Daily target (deliveries)</span><input name="dailyTarget" type="number" value="${st.dailyTarget}"></label><label><span>Daily target bonus ₹</span><input name="dailyBonus" type="number" value="${st.dailyBonus}"></label></div><button class="button primary">Save settings</button><p class="mock-hint">Tax rates are placeholders to confirm with a CA.</p></form></section>
  <section class="panel"><h2>Maps and delivery areas</h2><form class="form-grid" data-plus-form="areas"><label class="consent-row"><input type="checkbox" name="streets" ${s.mapMode === 'sketch' ? '' : 'checked'}> Show real street maps (OpenStreetMap; needs internet — falls back to a sketch)</label>${Object.entries(s.shopPartners || {}).map(([k, p]) => `<div class="claim-row"><b>${esc(p.name)}</b><label>Delivery radius km <input type="number" name="r:${k}" value="${p.radiusKm ?? 12}" min="1"></label><label>Delivery area shape (optional: one "lat,lng" per line, at least 3 points; replaces the radius)<textarea name="a:${k}" rows="3" placeholder="28.66,77.17&#10;28.66,77.23&#10;28.61,77.23&#10;28.61,77.17">${esc((p.area || []).map(x => x.join(',')).join('\n'))}</textarea></label></div>`).join('')}<button class="button primary">Save areas</button><p class="mock-hint">Google Maps or Mappls can replace OpenStreetMap once you have an API key (production).</p></form></section>
  <section class="panel"><h2>Coupons</h2>${s.coupons.map((c, i) => `<div class="ledger-row static"><span><b>${esc(c.code)}</b><small>${esc(c.label)} · funded by ${esc(c.fundedBy)} · used ${s.couponUses.filter(u => u.code === c.code).length}×${c.expires ? ` · expires ${esc(c.expires)}` : ''}${c.budget ? ` · budget ${inr(c.budget)} (${inr(Math.max(0, c.budget - s.couponUses.filter(u => u.code === c.code).reduce((a, u) => a + (u.discount || 0), 0)))} left)` : ''}${c.perCustomer ? ` · ${c.perCustomer} per customer` : ''}</small></span><button class="button secondary compact" data-plus="coupon-toggle" data-id="${i}">${c.active ? 'Turn off' : 'Turn on'}</button></div>`).join('')}<form class="inline-form" data-plus-form="coupon"><input name="code" placeholder="CODE"><select name="type"><option value="flat">₹ off</option><option value="pct">% off</option></select><input name="value" type="number" placeholder="Value"><input name="min" type="number" placeholder="Min order ₹"><select name="fundedBy"><option value="platform">MoveAI pays</option><option value="seller">Seller pays</option></select><input name="store" placeholder="Store name (seller-funded)"><input name="expires" type="date" title="Expires"><input name="budget" type="number" placeholder="Total budget ₹"><input name="perCustomer" type="number" placeholder="Uses per customer"><button class="button secondary compact">Add coupon</button></form></section><p class="plus-error field-error" hidden></p>`;
}
function reportsScreen(s) {
  const os = s.customerOrders || [], done = os.filter(o => ['delivered', 'collected'].includes(o.status)), by = {};
  for (const o of done) { const k = o.fulfilmentPartner; by[k] ||= {gmv: 0, commission: 0, orders: 0}; by[k].gmv += o.itemTotal; by[k].commission += o.feeBreakdown?.productCommission || 0; by[k].orders += 1; }
  const late = done.filter(o => o.etaMinutes && o.deliveredAt && o.createdAt && (o.deliveredAt - o.createdAt) / 60000 > o.etaMinutes).length;
  const claimsBy = {}; for (const c of s.claims || []) claimsBy[c.orderId] = 1;
  const flags = [...Object.entries(s.codRefusals || {}).filter(([, n]) => n >= 2).map(([k, n]) => `Customer ${k}: ${n} refused COD deliveries`), ...((s.claims || []).filter(c => clock() - c.createdAt < 30 * DAY).length >= settings(s).claimMax30d ? [`${(s.claims || []).filter(c => clock() - c.createdAt < 30 * DAY).length} claims in 30 days from one customer`] : []), ...Object.values(s.shopPartners || {}).filter(p => (p.stockouts || []).length >= 3).map(p => `${p.name}: ${(p.stockouts || []).length} items unavailable after ordering in 30 days`), ...Object.values(s.shopPartners || {}).filter(p => (p.completedOrders || 0) < 5).map(p => `${p.name}: new seller — payouts held ${settings(s).newSellerExtraHoldDays} extra days`)];
  return `${head('Commerce reports', 'Sales, commission, returns, delivery performance, fraud flags and outgoing notifications.')}${Geo.adminLive(s)}<div class="metrics"><div class="metric"><span>GMV (delivered)</span><b>${inr(done.reduce((a, o) => a + o.itemTotal, 0))}</b></div><div class="metric"><span>Commission</span><b>${inr(done.reduce((a, o) => a + (o.feeBreakdown?.productCommission || 0), 0))}</b></div><div class="metric"><span>Orders with claims</span><b>${Object.keys(claimsBy).length}</b></div><div class="metric"><span>Late vs promise</span><b>${late}/${done.filter(o => o.etaMinutes).length}</b></div></div>
  <div class="grid two"><section class="panel"><h2>By store</h2>${Object.entries(by).map(([k, x]) => `<div class="ledger-row static"><span><b>${esc(k)}</b><small>${x.orders} orders</small></span><span>${inr(x.gmv)} · ${inr(x.commission)}</span></div>`).join('') || '<p class="muted">No delivered orders yet.</p>'}</section><section class="panel"><h2>Fraud and risk flags</h2>${flags.map(f => `<p class="action-warning">${esc(f)}</p>`).join('') || '<p class="muted">No flags.</p>'}</section></div>
  <section class="panel"><h2>Notification outbox (simulated SMS / WhatsApp / push)</h2>${(s.outbox || []).slice(0, 15).map(m => `<small class="block">${esc(m.at)} · ${esc(m.channels.join(' + '))} → ${esc(m.to)}: ${esc(m.text)}</small>`).join('') || '<p class="muted">Nothing sent yet.</p>'}</section>`;
}
export function deliveryExtras(s, ws) {
  ensurePlus(s); const me = s.deliveryPartners?.[ws]; if (!me) return '';
  const jobs = (s.customerOrders || []).filter(o => o.deliveryAssignment?.partnerId === me.id && ['accepted', 'picked_up'].includes(o.deliveryAssignment.status));
  const pickups = (s.claims || []).filter(c => c.pickup?.partnerId === me.id && c.status === 'pickup_assigned');
  return `${courierIncentiveHtml(s, ws)}<section class="panel"><h2>Delivery details</h2>${jobs.map(o => `<div class="claim-row">${Geo.courierPanel(s, o)}<b>${esc(o.id)}</b> · ${(o.deliveryKm || distanceKm(o.pickupAddress || '', o.address)).toFixed(1)} km · you earn ${inr(o.feeBreakdown?.deliveryPartnerEarning ?? deliveryPay(s, o))}${o.tip ? ` (incl. ${inr(o.tip)} tip)` : ''}<small class="block muted">Call customer: masked number +91 80 4${String(hash(o.id)).slice(0, 3)} XX${String(hash(o.id)).slice(-2)} · attempts ${o.attempts || 0}/2</small><form class="inline-form" data-plus-form="pod" data-id="${esc(o.id)}"><select name="mode"><option value="customer" ${o.podMode === 'customer' ? 'selected' : ''}>Handed to customer (code)</option><option value="door" ${o.podMode === 'door' ? 'selected' : ''}>Left at door</option><option value="guard" ${o.podMode === 'guard' ? 'selected' : ''}>With guard / reception</option></select><input type="file" name="photo" accept="image/*" capture="environment"><button class="button secondary compact">Save proof</button>${o.podPhoto ? `<small>Photo ✓ ${esc(o.podPhoto)}</small>` : ''}</form></div>`).join('') || '<p class="muted">No active deliveries.</p>'}</section>
  <section class="panel"><h2>Return pickups</h2>${pickups.map(c => `<form class="claim-row" data-plus-form="pickup" data-id="${esc(c.id)}"><b>${esc(c.id)}</b> · ${esc(KIND_LABEL[c.kind])} · ${c.items.map(x => `${x.qty} × ${esc(s.products.find(p => p.id === x.productId)?.name || '')}`).join(', ')}<div class="chip-row">${(QC[c.group] || QC.food).map((q, i) => `<label><input type="checkbox" name="qc${i}"> ${esc(q)}</label>`).join('')}</div><input name="code" placeholder="Customer's return code"><button class="button primary compact">Collect</button></form>`).join('') || '<p class="muted">No return pickups.</p>'}</section><p class="plus-error field-error" hidden></p>`;
}

// ---------- bindings ----------
export function bind(root, api) {
  Geo.bind(root, api);
  const S = () => api.getState(), err = m => { const e = root.querySelector('.plus-error') || root.querySelector('#po-error'); if (e) { e.textContent = m; e.hidden = !m; } else api.toast(m); };
  const done = (e, ok) => { if (e) return err(e); api.save(); api.render(); if (ok) api.toast(ok); };
  const ws = () => S().currentWorkspace, sw = () => storeWs(ws());
  root.querySelectorAll('[data-plus-demo-scan]').forEach(b => b.onclick = () => { const i = root.querySelector(`[data-scan="${b.dataset.plusDemoScan}"]`); if (i) { i.value = b.dataset.code; i.focus(); } });
  root.querySelectorAll('[data-plus-month]').forEach(i => i.onchange = () => { S().statementMonth = i.value; done('', ''); });
  root.querySelectorAll('[data-plus-variant]').forEach(b => b.onclick = () => { S().selectedProductId = b.dataset.plusVariant; done('', ''); });
  root.querySelectorAll('[data-plus-file]').forEach(f => f.onchange = () => { const o = S().customerOrders.find(x => x.id === f.dataset.id); if (o && f.files[0]) { o.packPhoto = f.files[0].name; done('', 'Packing photo saved'); } });
  root.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => { const s = S(), a = b.dataset.plus, id = b.dataset.id;
    if (a === 'wish') { const i = s.wishlist.indexOf(id); i >= 0 ? s.wishlist.splice(i, 1) : s.wishlist.push(id); return done('', i >= 0 ? 'Removed from wishlist' : 'Saved to wishlist'); }
    if (a === 'clear-filters') { s.shopFilters = {}; return done(''); }
    if (a === 'apply-checkout') { const f = b.closest('form'); s.checkoutPlus = {coupon: f.querySelector('[name="plusCoupon"]').value.trim().toUpperCase(), tip: f.querySelector('[name="plusTip"]').value, slot: f.querySelector('[name="plusSlot"]').value, method: f.querySelector('[name="method"]:checked')?.value || f.querySelector('[name="method"]')?.value}; return done(''); }
    if (a === 'add-all-again') { for (const o of s.customerOrders.filter(o => ['delivered', 'collected'].includes(o.status))) for (const i of o.items) if (!s.productCart.some(c => c.productId === i.productId)) s.productCart.push({productId: i.productId, quantity: i.quantity, priceAtAdd: s.products.find(p => p.id === i.productId)?.price}); return done('', 'Added to cart'); }
    if (a === 'list-to-cart') { for (const i of s.savedLists[Number(id)].items) if (!s.productCart.some(c => c.productId === i.productId)) s.productCart.push({...i, priceAtAdd: s.products.find(p => p.id === i.productId)?.price}); return done('', 'List added to cart'); }
    if (a === 'schedule-cart') { const x = s.schedules.find(y => y.id === id); s.productCart = x.items.map(i => ({...i, priceAtAdd: s.products.find(p => p.id === i.productId)?.price})); x.nextDue = addDays(today(), x.frequency === 'daily' ? 1 : 7); api.save(); return api.navigate('cart'); }
    if (a === 'schedule-toggle') { const x = s.schedules.find(y => y.id === id); x.active = !x.active; return done(''); }
    if (a === 'schedule-advance') { s.schedules.forEach(x => { x.nextDue = today(); }); return done(''); }
    if (a === 'edit-listing') { s.plusEditProduct = id; return done(''); }
    if (a === 'request-group') { const p = s.shopPartners[sw()]; (p.categoryRequests ||= []).push(id); return done('', 'Request sent to MoveAI'); }
    if (a === 'toggle-pause') { const p = s.shopPartners[sw()]; p.paused = !p.paused; return done('', p.paused ? 'New orders paused' : 'Taking orders again'); }
    if (a === 'toggle-busy') { const p = s.shopPartners[sw()]; p.busy = !p.busy; return done(''); }
    if (a === 'listing-approve') { const p = s.products.find(x => x.id === id); p.approval = 'approved'; p.approvalNote = ''; return done('', 'Listing is live'); }
    if (a === 'listing-reject') { const p = s.products.find(x => x.id === id); p.approval = 'changes_needed'; p.approvalNote = listingCheck(s, p).join('; ') || 'Sent back by MoveAI'; return done(''); }
    if (a === 'group-approve') { const [k, g] = id.split('|'), p = s.shopPartners[k]; p.approvedGroups.push(g); p.categoryRequests = p.categoryRequests.filter(x => x !== g); return done('', 'Category approved'); }
    if (a === 'onboard-approve') { s.shopPartners[id].onboarding.status = 'approved'; return done('', 'Seller verified'); }
    if (a === 'claim-approve' || a === 'claim-reject') { const c = s.claims.find(x => x.id === id); return done(adminDecide(s, c, a === 'claim-approve' ? 'approve' : 'reject'), 'Decision recorded'); }
    if (a === 'cancel-item') { const o = s.customerOrders.find(x => x.id === id); return done(cancelItem(s, o, b.dataset.product), 'Item cancelled'); }
    if (a === 'print') return window.print();
    if (a === 'coupon-toggle') { const c = s.coupons[Number(id)]; c.active = !c.active; return done(''); }
  });
  root.querySelectorAll('form[data-plus-form]').forEach(f => f.onsubmit = e => { e.preventDefault(); const s = S(), fd = new FormData(f), v = Object.fromEntries(fd), k = f.dataset.plusForm;
    if (k === 'filters') { s.shopFilters = {sort: v.sort, brand: v.brand, maxPrice: v.maxPrice, minRating: v.minRating, veg: Boolean(v.veg), discount: Boolean(v.discount)}; return done(''); }
    if (k === 'claim') { const o = s.customerOrders.find(x => x.id === f.dataset.id); return done(raiseClaim(s, o, f.dataset.product, {...v, photo: fd.get('photo')?.name, tags: Boolean(v.tags)}), 'Request submitted'); }
    if (k === 'svc-claim') { const r = s.serviceRequests.find(x => x.id === f.dataset.id); return done(raiseServiceClaim(s, r, {...v, photo: fd.get('photo')?.name}), 'Claim submitted'); }
    if (k === 'review') { const o = s.customerOrders.find(x => x.id === f.dataset.id); s.reviews.push({id: uid('RV'), orderId: o.id, productId: v.productId, rating: Number(v.rating), text: String(v.text || '').trim() || 'No comment', by: s.person?.name?.split(' ')[0] || 'Customer', at: stamp(), store: o.fulfilmentPartner, storeRating: Number(v.storeRating) || null, deliveryRating: Number(v.deliveryRating) || null}); return done('', 'Thanks for your review'); }
    if (k === 'save-list') { if (!s.productCart?.length) return err('Your cart is empty.'); s.savedLists.push({name: String(v.name || 'My list').trim(), items: s.productCart.map(c => ({productId: c.productId, quantity: c.quantity}))}); return done('', 'List saved'); }
    if (k === 'listing') { const p = s.products.find(x => x.id === f.dataset.id); const m = saveListing(s, p, v); if (m && !/^Saved/.test(m)) return err(m); return done('', m || (p.approval === 'pending' ? 'Saved · waiting for MoveAI review' : 'Listing updated')); }
    if (k === 'bulk') { const r = bulkUpload(s, s.shopPartners[sw()].name, v.csv); return done('', `${r.created} new (waiting for review), ${r.updated} updated${r.errors.length ? ` · ${r.errors.join('; ')}` : ''}`); }
    if (k === 'batch') { const p = s.products.find(x => x.id === v.productId); return done(addBatch(s, p, v.qty, v.expiry), 'Batch added to stock'); }
    if (k === 'onboard') { const p = s.shopPartners[sw()]; const g = gstLookup(v.gstin, p.name); if (!g.ok) return err(g.reason); if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(String(v.pan).toUpperCase())) return err('Enter a valid PAN.'); const b = pennyDrop({account: v.account, ifsc: v.ifsc, name: p.name}); if (!b.ok) return err(b.reason); if (v.fssai && !/^\d{14}$/.test(v.fssai)) return err('FSSAI licence numbers have 14 digits.'); p.onboarding = {gstin: g.data.gstin, pan: String(v.pan).toUpperCase(), bankVerified: true, fssai: v.fssai || '', status: 'pending'}; return done('', 'Submitted to MoveAI for approval'); }
    if (k === 'hours') { s.shopPartners[sw()].hours = {open: v.open, close: v.close}; return done('', 'Hours saved'); }
    if (k === 'dispute') { const c = s.claims.find(x => x.id === f.dataset.id); return done(storeDispute(s, c, v.note), 'Dispute sent to MoveAI'); }
    if (k === 'settings') { const st = settings(s); for (const [kk, val] of Object.entries(v)) { if (kk.startsWith('c:')) st.commission[kk.slice(2)] = Number(val) / 100; else if (kk.startsWith('h:')) st.holdDays[kk.slice(2)] = Number(val); else st[kk] = Number(val); } return done('', 'Settings saved · applies to new orders'); }
    if (k === 'areas') { s.mapMode = v.streets ? 'streets' : 'sketch'; for (const [key, p] of Object.entries(s.shopPartners || {})) { p.radiusKm = Number(v[`r:${key}`]) || p.radiusKm; const pts = String(v[`a:${key}`] || '').split(/\n+/).map(l => l.split(',').map(Number)).filter(x => x.length === 2 && x.every(Number.isFinite)); if (pts.length && pts.length < 3) return err(`${p.name}: a shape needs at least 3 points.`); p.area = pts.length >= 3 ? pts : undefined; } return done('', 'Maps and delivery areas saved'); }
    if (k === 'coupon') { const code = String(v.code || '').trim().toUpperCase(); if (!/^[A-Z0-9]{4,12}$/.test(code) || !(Number(v.value) > 0)) return err('Enter a 4–12 character code and a value.'); s.coupons.push({code, label: `${v.type === 'flat' ? `₹${v.value}` : `${v.value}%`} off above ₹${Number(v.min) || 0}${v.store ? ` at ${v.store}` : ''}`, type: v.type, value: Number(v.value), max: v.type === 'pct' ? 200 : undefined, min: Number(v.min) || 0, fundedBy: v.fundedBy, store: v.store || undefined, expires: v.expires || undefined, budget: Number(v.budget) || undefined, perCustomer: Number(v.perCustomer) || undefined, active: true}); return done('', 'Coupon added'); }
    if (k === 'pod') { const o = s.customerOrders.find(x => x.id === f.dataset.id); o.podMode = v.mode; if (fd.get('photo')?.name) o.podPhoto = fd.get('photo').name; return done(podRequired(o) ? 'Add a photo when leaving the order at the door or with a guard.' : '', 'Proof saved'); }
    if (k === 'pickup') { const c = s.claims.find(x => x.id === f.dataset.id); return done(pickupAction(s, c, 'collect', v), c.status === 'qc_failed' ? 'Pickup refused — condition check failed' : 'Return collected'); }
  });
}

// ---------- phase 2: item cancellation, stock-outs, courier incentives, statements ----------
export function cancelItem(s, o, pid) {
  if (!['paid', 'confirmed', 'accepted'].includes(o.status)) return 'Items can be cancelled only before the order is packed.';
  const item = o.items.find(i => i.productId === pid); if (!item) return 'Item not found.';
  if (o.pick?.checked?.[pid]) return 'This item is already picked. Return it after delivery instead.';
  if (o.items.length === 1) return 'This is the only item — cancel the whole order instead.';
  const amount = Math.round((item.finalAmount ?? item.unitPrice * item.quantity));
  o.items = o.items.filter(i => i.productId !== pid);
  const p = s.products.find(x => x.id === pid); if (p) p.reserved = Math.max(0, (p.reserved || 0) - item.quantity);
  o.itemTotal -= amount; o.total -= amount; if (o.feeBreakdown) afterInitialize(s, o);
  if (!o.cod && !o.payAtStore && amount > 0) { const src = s.ledger.find(x => x.orderId === o.id && x.type === 'customer_payment'); record(s, {owner: 'personal', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: o.party, amount, method: src?.method || 'upi', reference: gateway.refund(o.id, amount).ref, status: 'refund_initiated', expectedBy: clock() + 5 * DAY, gatewayFinal: 'refunded', note: `Cancelled item: ${item.name} · ${o.id}`}, 'Customer'); }
  (o.history ||= []).push({at: stamp(), actor: 'Customer', text: `Cancelled ${item.quantity} × ${item.name}${o.cod ? '' : ` · ${inr(amount)} refund started`}`});
  notify(s, Object.keys(s.shopPartners || {}).find(k => s.shopPartners[k].name === o.fulfilmentPartner), `${o.id}: customer removed ${item.name}`, o.id);
  return '';
}
export function cancelItemsHtml(s, o) {
  if (!['paid', 'confirmed', 'accepted'].includes(o.status) || o.items.length < 2) return '';
  return `<details class="order-help"><summary class="button text compact">Cancel an item</summary>${o.items.filter(i => !o.pick?.checked?.[i.productId]).map(i => `<div class="ledger-row static"><span><b>${i.quantity} × ${esc(i.name)}</b><small>${inr(i.finalAmount ?? i.unitPrice * i.quantity)}${o.cod ? '' : ' refunded to your payment method'}</small></span><button class="button secondary compact" data-plus="cancel-item" data-id="${esc(o.id)}" data-product="${esc(i.productId)}">Cancel item</button></div>`).join('')}</details>`;
}
export function noteStockout(s, o) {
  const p = Object.values(s.shopPartners || {}).find(x => x.name === o.fulfilmentPartner); if (!p) return;
  (p.stockouts ||= []).push(clock()); p.stockouts = p.stockouts.filter(t => clock() - t < 30 * DAY);
  if (p.stockouts.length === 3) notify(s, 'admin', `${p.name}: 3 items unavailable after ordering in 30 days — check stock accuracy`, o.id);
}
export function onDelivered(s, o) {
  const partner = Object.entries(s.deliveryPartners || {}).find(([, d]) => d.id === o.deliveryAssignment?.partnerId); if (!partner) return;
  const [ws, d] = partner, day = today(), st = settings(s);
  const count = (s.customerOrders || []).filter(x => x.deliveryAssignment?.partnerId === d.id && x.status === 'delivered' && x.deliveredAt && new Date(x.deliveredAt).toISOString().slice(0, 10) === day).length;
  d.deliveredToday = {day, count};
  if (st.dailyBonus && count === st.dailyTarget) { record(s, {owner: ws, orderId: o.id, sourceType: 'incentive', sourceId: day, type: 'delivery_incentive', payer: 'moveai', payee: ws, responsible: 'moveai', amount: st.dailyBonus, method: 'next_payout', reference: `INC-${d.id}-${day}`, status: 'due', note: `Daily target ${st.dailyTarget} deliveries reached`}, 'MoveAI'); notify(s, ws, `Bonus ${inr(st.dailyBonus)}: you completed ${count} deliveries today`, o.id); }
}
export function courierIncentiveHtml(s, ws) {
  const d = s.deliveryPartners?.[ws]; if (!d) return ''; const st = settings(s), c = d.deliveredToday?.day === today() ? d.deliveredToday.count : 0;
  return `<section class="panel"><h2>Incentives</h2><p>Deliveries today: <b>${c}/${st.dailyTarget}</b> · bonus ${inr(st.dailyBonus)} at ${st.dailyTarget}</p><span class="progress"><i style="width:${Math.min(100, c / st.dailyTarget * 100)}%"></i></span><p class="muted">Peak hours ${esc(st.peakStart)}–${esc(st.peakEnd)}: +${inr(st.peakBonus)} per delivery${isPeak(s) ? ' · <b>peak now</b>' : ''}</p></section>`;
}
const monthKey = t => new Date(t ?? clock()).toISOString().slice(0, 7);
const quarterOf = t => { const d = new Date(t), m = d.getMonth(), y = m < 3 ? d.getFullYear() - 1 : d.getFullYear(); return `FY${y % 100}-${(y + 1) % 100} Q${m < 3 ? 4 : Math.floor((m - 3) / 3) + 1}`; };
export function sellerStatementHtml(s, name) {
  const m = s.statementMonth || monthKey(), os = (s.customerOrders || []).filter(o => o.fulfilmentPartner === name && o.createdAt && monthKey(o.createdAt) === m && o.feeBreakdown);
  const sum = k => os.reduce((a, o) => a + (k(o) || 0), 0), q = {};
  for (const o of (s.customerOrders || []).filter(o => o.fulfilmentPartner === name && o.feeBreakdown && o.createdAt)) { const k = quarterOf(o.createdAt); q[k] ||= {tcs: 0, tds: 0, gross: 0}; q[k].tcs += o.feeBreakdown.tcs || 0; q[k].tds += o.feeBreakdown.tds || 0; q[k].gross += o.itemTotal; }
  return `<section class="panel statement"><div class="panel-header"><div><h2>Payout statement · ${esc(m)}</h2><p>${esc(name)}</p></div><span class="row-actions"><input type="month" value="${esc(m)}" data-plus-month><button class="button secondary compact" data-plus="print">Print / PDF</button></span></div>
  <div class="table-scroll"><table class="data-table"><thead><tr><th>Order</th><th>Items</th><th>Commission</th><th>Seller discount</th><th>TCS</th><th>TDS</th><th>Payout</th><th>Status</th></tr></thead><tbody>${os.map(o => `<tr><td>${esc(o.id)}</td><td>${inr(o.itemTotal)}</td><td>−${inr(o.feeBreakdown.productCommission || 0)}</td><td>${o.feeBreakdown.sellerDiscount ? `−${inr(o.feeBreakdown.sellerDiscount)}` : '—'}</td><td>${o.feeBreakdown.tcs ? `−${inr(o.feeBreakdown.tcs)}` : '—'}</td><td>${o.feeBreakdown.tds ? `−${inr(o.feeBreakdown.tds)}` : '—'}</td><td><b>${inr(o.sellerDue || 0)}</b></td><td>${esc(o.settlementStatus || '')}</td></tr>`).join('') || '<tr><td colspan="8">No orders this month.</td></tr>'}</tbody><tfoot><tr><td><b>Total</b></td><td>${inr(sum(o => o.itemTotal))}</td><td>−${inr(sum(o => o.feeBreakdown.productCommission))}</td><td>−${inr(sum(o => o.feeBreakdown.sellerDiscount))}</td><td>−${inr(sum(o => o.feeBreakdown.tcs))}</td><td>−${inr(sum(o => o.feeBreakdown.tds))}</td><td><b>${inr(sum(o => o.sellerDue))}</b></td><td></td></tr></tfoot></table></div>
  <h3>TCS / TDS certificates</h3>${Object.entries(q).map(([k, x]) => `<div class="ledger-row static"><span><b>${esc(k)}</b><small>Sales ${inr(x.gross)} · TCS ${inr(x.tcs)} (GSTR-8 by MoveAI) · TDS ${inr(x.tds)} (Form 16A)</small></span>${pill(x.tcs || x.tds ? 'issued_after_quarter' : 'not_applicable')}</div>`).join('') || '<p class="muted">No tax collected yet.</p>'}<p class="mock-hint">Certificates are generated after each quarter's filing in a real launch; rates are admin settings to confirm with a CA.</p></section>`;
}
export function customerStatementScreen(s) {
  const m = s.statementMonth || monthKey(), inM = t => t && monthKey(typeof t === 'number' ? t : Date.parse(t) || clock()) === m;
  const os = (s.customerOrders || []).filter(o => inM(o.createdAt)), rs = (s.serviceRequests || []).filter(r => r.customer === 'personal' && inM(r.createdAt || Date.parse(r.date)));
  const pays = (s.ledger || []).filter(x => x.payer === 'personal' && ['customer_payment'].includes(x.type) && !['failed', 'pending'].includes(x.status) && inM(x.createdAt)), refs = (s.ledger || []).filter(x => x.payee === 'personal' && x.type === 'refund' && inM(x.createdAt));
  const tot = l => l.reduce((a, x) => a + Number(x.amount), 0);
  return `${head('Monthly statement', `${s.person?.name || 'Customer'} · ${m}`, `<span class="row-actions"><input type="month" value="${esc(m)}" data-plus-month><button class="button secondary" data-plus="print">Print / PDF</button></span>`)}
  <div class="metrics"><div class="metric"><span>Paid</span><b>${inr(tot(pays))}</b><small>${pays.length} payments</small></div><div class="metric"><span>Refunded</span><b>${inr(tot(refs))}</b><small>${refs.length} refunds</small></div><div class="metric"><span>Net spend</span><b>${inr(tot(pays) - tot(refs))}</b></div><div class="metric"><span>Orders & bookings</span><b>${os.length + rs.length}</b></div></div>
  <section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>For</th><th>Type</th><th>Amount</th><th>Reference</th></tr></thead><tbody>${[...pays.map(x => ({x, sign: 1})), ...refs.map(x => ({x, sign: -1}))].sort((a, b) => (b.x.createdAt || 0) - (a.x.createdAt || 0)).map(({x, sign}) => `<tr><td>${esc(new Date(x.createdAt || clock()).toLocaleDateString('en-IN'))}</td><td>${esc(x.orderId || x.serviceId || '')}</td><td>${sign > 0 ? 'Payment' : 'Refund'}</td><td>${sign > 0 ? '' : '−'}${inr(x.amount)}</td><td>${esc(x.receiptNo || x.creditNoteNo || x.reference || '')}</td></tr>`).join('') || '<tr><td colspan="5">Nothing this month.</td></tr>'}</tbody></table></div><p class="mock-hint">Companies can use this as one monthly document; individual receipts and invoices stay on each bill.</p></section>`;
}

// ---------- claims for movers, drivers and home services ----------
const SVC_KINDS = {damage: 'Damaged or missing item', overcharge: 'Charged more than agreed', incomplete: 'Work not completed', behaviour: 'Partner behaviour / safety'};
export function serviceClaimHtml(s, r) {
  if (!r || !(r.paid || ['closed', 'rated', 'paid'].includes(r.status))) return '';
  const mine = (s.claims || []).filter(c => c.orderId === r.id);
  return `<section class="panel"><h2>Report a problem with this ${r.type === 'moving' ? 'move' : r.type === 'driver' ? 'driver booking' : 'service'}</h2>${mine.map(c => `<div class="claim-row">${pill(c.status)} <b>${esc(c.id)}</b> · ${esc(SVC_KINDS[c.kind])} · ${inr(c.amount)}<small class="block muted">${esc(c.history.at(-1).text)}</small></div>`).join('')}
  ${mine.some(c => ['review'].includes(c.status)) ? '' : `<form class="form-grid two" data-plus-form="svc-claim" data-id="${esc(r.id)}"><label><span>Problem</span><select name="kind">${Object.entries(SVC_KINDS).filter(([k]) => r.type === 'moving' || k !== 'damage').map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label><span>Amount you are claiming (₹)</span><input name="amount" type="number" min="1"></label><label class="wide"><span>What happened</span><input name="reason" placeholder="e.g. TV screen cracked; photo of the item at pickup and at delivery"></label><label><span>Photo</span><input name="photo" type="file" accept="image/*"></label><label><span>Refund to</span><select name="refundTo"><option value="wallet">MoveAI wallet (instant once approved)</option><option value="source">Original payment method</option></select></label><button class="button secondary">Submit claim</button></form><p class="plus-error field-error" hidden></p>`}</section>`;
}
export function raiseServiceClaim(s, r, v) {
  const paid = (s.ledger || []).filter(x => x.serviceId === r.id && x.payer === 'personal' && x.type === 'customer_payment' && !['failed', 'refunded'].includes(x.status)).reduce((a, x) => a + x.amount, 0) || Number(r.quote?.total || 0);
  const amount = Math.round(Number(v.amount)); if (!(amount > 0)) return 'Enter the amount you are claiming.'; if (amount > paid) return `You can claim up to what you paid (${inr(paid)}).`;
  if (!String(v.reason || '').trim()) return 'Describe what happened.'; if (v.kind === 'damage' && !v.photo) return 'Add a photo of the damage.';
  const party = r.type === 'moving' ? 'movers' : r.provider || 'external:service-partner';
  s.claims.unshift({id: uid('CLM'), service: true, orderId: r.id, store: r.type === 'moving' ? 'SafeMove Packers' : r.type === 'driver' ? 'Anil Kumar' : 'Service partner', party, kind: v.kind, group: 'service', items: [], reason: String(v.reason).trim(), photo: v.photo || '', refundTo: v.refundTo || 'wallet', amount, createdAt: clock(), status: 'review', history: [{at: stamp(), text: 'Claim sent to MoveAI; the partner can respond'}]});
  notify(s, party, `${r.id}: customer raised a claim of ${inr(amount)} — respond in Returns & claims`, r.id); notify(s, 'admin', `${r.id}: service claim ${inr(amount)} to review`, r.id);
  return '';
}
function decideService(s, c, decision) {
  if (c.status !== 'review') return 'Nothing to decide.';
  if (decision !== 'approve') { c.status = 'rejected'; c.history.push({at: stamp(), text: 'Not approved after review'}); return ''; }
  if (c.refundTo === 'wallet') walletCredit(s, c.amount, `Claim ${c.id} · ${c.orderId}`);
  record(s, {owner: 'personal', serviceId: c.orderId, sourceType: 'claim', sourceId: c.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: c.party, amount: c.amount, method: c.refundTo === 'wallet' ? 'moveai_wallet' : 'upi', reference: gateway.refund(c.id, c.amount).ref, status: c.refundTo === 'wallet' ? 'refunded' : 'refund_initiated', expectedBy: clock() + 5 * DAY, gatewayFinal: 'refunded', note: `Claim ${c.id}`}, 'MoveAI');
  record(s, {owner: c.party, serviceId: c.orderId, sourceType: 'claim', sourceId: c.id, type: 'penalty', payer: c.party, payee: 'moveai', responsible: c.party, amount: c.amount, method: 'wallet', reference: `CLR-${c.id}`, status: 'confirmed', note: `Claim ${c.id} recovered from partner wallet`}, 'MoveAI');
  c.status = 'refunded'; c.history.push({at: stamp(), text: `Approved · ${inr(c.amount)} ${c.refundTo === 'wallet' ? 'added to the MoveAI wallet' : 'refund started'} · recovered from the partner`});
  return '';
}
