// MoveAI One — seller trust: automatic checks, risk level, per-state verification policy, the extra
// identity and shop checks for strict states, and probation limits for new stores.
// Chosen design: risk-tiered review (low risk auto-approved with probation; flagged or higher-risk
// applications reviewed by people) plus a "strict" policy per state — Bihar strict by default — where
// sellers also prove who they are, that the shop exists and where the stock comes from.
// Every check here is simulated; in production each calls a licensed provider (see the report).
import {gstLookup} from './verify-sim.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const now = () => new Date().toLocaleString('en-IN');

// ---------- pincode → state (prototype mapping by prefix; production uses the India Post directory) ----------
const PIN_RULES = [
  ['11', '07'], ['12', '06'], ['13', '06'],
  ['246', '05'], ['247', '05'], ['248', '05'], ['249', '05'], ['262', '05'], ['263', '05'],
  ['20', '09'], ['21', '09'], ['22', '09'], ['23', '09'], ['24', '09'], ['25', '09'], ['26', '09'], ['27', '09'], ['28', '09'],
  ['30', '08'], ['31', '08'], ['32', '08'], ['33', '08'], ['34', '08'],
  ['36', '24'], ['37', '24'], ['38', '24'], ['39', '24'],
  ['403', '30'], ['40', '27'], ['41', '27'], ['42', '27'], ['43', '27'], ['44', '27'],
  ['56', '29'], ['57', '29'], ['58', '29'], ['59', '29'],
  ['605', '34'], ['60', '33'], ['61', '33'], ['62', '33'], ['63', '33'], ['64', '33'],
  ['737', '11'], ['744', '35'], ['70', '19'], ['71', '19'], ['72', '19'], ['73', '19'], ['74', '19'],
  ['814', '20'], ['815', '20'], ['816', '20'], ['825', '20'], ['826', '20'], ['827', '20'], ['828', '20'], ['829', '20'], ['83', '20'],
  ['80', '10'], ['81', '10'], ['82', '10'], ['84', '10'], ['85', '10'],
];
export const PIN_STATE_NAMES = {'05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '19': 'West Bengal', '20': 'Jharkhand', '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar'};
const sn = c => PIN_STATE_NAMES[c] || c;
// Longest matching prefix wins. null = not covered by the prototype map (no check).
export function pincodeState(pin) {
  const p = String(pin || '').trim(); if (!/^[1-9]\d{5}$/.test(p)) return null;
  let best = null; for (const [prefix, code] of PIN_RULES) if (p.startsWith(prefix) && (!best || prefix.length > best[0].length)) best = [prefix, code];
  return best ? best[1] : null;
}

// ---------- per-state policy ----------
export const POLICY_LEVELS = {
  standard: {label: 'Standard', note: 'Automatic checks. Low-risk sellers go live on probation; flagged or higher-risk sellers are reviewed by people.'},
  strict: {label: 'Strict', note: 'Everything in Standard, plus identity, shop and stock checks before going live; longer probation.'},
};
export const DEFAULT_POLICY = {byState: {'10': 'strict'}, reason: {'10': 'High rates of seller fraud and expired-goods complaints (ops data)'}};
export function policy(state) { return (state.sellerPolicy ||= JSON.parse(JSON.stringify(DEFAULT_POLICY))); }
export function policyFor(state, stateCode) { return policy(state).byState[stateCode] || 'standard'; }
export function setPolicy(state, stateCode, level, reason = '') {
  if (!POLICY_LEVELS[level]) return 'Choose standard or strict.';
  if (!/^\d{2}$/.test(String(stateCode))) return 'Choose a state.';
  if (level === 'strict' && String(reason).trim().length < 5) return 'Give the reason for strict checks (for example fraud or complaint data). It is shown in the audit log.';
  const p = policy(state); p.byState[stateCode] = level; (p.reason ||= {})[stateCode] = String(reason).trim();
  (p.log ||= []).unshift({at: now(), text: `${stateCode}: ${level}${reason ? ` — ${reason}` : ''}`});
  return '';
}

// ---------- automatic checks ----------
const FOOD = c => ['fresh', 'food'].includes(c);
// Returns [{key, label, ok, detail, section}] — what an admin sees in the evidence panel.
export function checks(state, a) {
  const out = [], add = (key, section, label, ok, detail) => out.push({key, section, label, ok, detail});
  if (a.kyc.reused) add('kyc', 'kyc', 'KYC reused from approved business', true, 'PAN, GSTIN and bank already verified');
  else if (a.kyc.pan) {
    if (a.kyc.nonGst) add('gst', 'kyc', 'No GST — Aadhaar verified', !!a.kyc.aadhaarLast4, a.kyc.aadhaarLast4 ? `Aadhaar ••••${a.kyc.aadhaarLast4}` : 'Aadhaar missing');
    else { const g = gstLookup(a.kyc.gstin, a.legalName); add('gst', 'kyc', 'GSTIN active on GST portal', g.ok, g.ok ? `${a.kyc.gstin} · ${g.data.status}` : g.reason); add('pan', 'kyc', 'PAN matches GSTIN', a.kyc.gstin.slice(2, 12) === a.kyc.pan, a.kyc.pan); }
    add('bank', 'kyc', 'Bank account name check (₹1)', !!a.kyc.bank?.verified, a.kyc.bank?.verified ? `${a.kyc.bank.masked} · name matched` : `Name mismatch · cheque ${a.kyc.bank?.chequeFile || 'missing'}`);
  }
  if (a.store.pincode) {
    const ps = pincodeState(a.store.pincode);
    add('pincode', 'store', 'Pincode is in the chosen state', ps === null || ps === a.store.stateCode, ps === null ? `${a.store.pincode} · not in prototype map` : `${a.store.pincode} → ${sn(ps)} · chosen ${sn(a.store.stateCode)}`);
  }
  if (a.kyc.gstState && a.store.stateCode) add('gstState', 'store', 'Store state matches GSTIN state', a.kyc.gstState === a.store.stateCode, `GSTIN ${sn(a.kyc.gstState)} · store ${sn(a.store.stateCode)}`);
  if (a.licences?.fssai) add('fssai', 'food', 'FSSAI licence found (FoSCoS)', !a.licences.fssai.number.endsWith('0000'), a.licences.fssai.number.endsWith('0000') ? 'Not found on FoSCoS — ask for the licence copy' : `${a.licences.fssai.number} · valid to ${a.licences.fssai.expiry}`);
  const dup = duplicates(state, a); add('duplicate', 'kyc', 'No duplicate or blocked identity', !dup.length, dup.join('; ') || 'PAN, GSTIN, bank and phone not used by another seller');
  const badDates = (a.products || []).filter(p => p.dateError);
  if ((a.products || []).length) add('products', 'products', 'Products pass listing checks', !badDates.length, badDates.length ? `${badDates.length} product(s) with date problems` : `${a.products.length} product(s)`);
  return out;
}
// The same PAN, bank account or phone used by a different person, or on the blocked list.
export function duplicates(state, a) {
  const hits = [], blocked = state.blockedSellers || [];
  for (const b of blocked) if ((a.kyc.pan && b.pan === a.kyc.pan) || (a.kyc.bank?.masked && b.bank === a.kyc.bank.masked)) hits.push(`Matches blocked seller ${b.name} (${b.reason})`);
  for (const x of state.sellerApplications || []) {
    if (x.id === a.id || x.ownerId === a.ownerId || x.status === 'rejected' || x.kyc?.reused) continue;
    if (a.kyc.pan && x.kyc?.pan === a.kyc.pan) hits.push(`Same PAN as ${x.id} (${x.ownerName})`);
    else if (a.kyc.bank?.masked && x.kyc?.bank?.masked === a.kyc.bank.masked && x.kyc?.bank?.ifsc === a.kyc.bank?.ifsc) hits.push(`Same bank account as ${x.id} (${x.ownerName})`);
  }
  return hits;
}

// ---------- risk ----------
export const RISK_LABEL = {low: 'Low risk', medium: 'Medium risk', high: 'High risk'};
export function risk(state, a) {
  const flags = checks(state, a).filter(c => !c.ok).map(c => c.label);
  if (a.kyc.nonGst) flags.push('Seller has no GST');
  const dlm = a.trust?.items?.digilocker?.matches;
  if (dlm && !dlm.name) flags.push('Name on Aadhaar differs from PAN/bank name');
  if (dlm && !dlm.address) flags.push('Aadhaar address is in a different district from the store');
  if (a.kyc.bank && !a.kyc.bank.verified && !flags.includes('Bank account name check (₹1)')) flags.push('Bank name mismatch');
  const sensitive = (a.categories || []).some(c => FOOD(c) || c === 'electrical');
  const level = flags.length ? 'high' : sensitive ? 'medium' : 'low';
  return {level, flags, reasons: flags.length ? flags : sensitive ? ['Food or electricals (expiry, safety or counterfeit risk)'] : ['Low-risk category, all checks passed']};
}

// ---------- identity and shop checks (strict states; video KYC also for high risk anywhere) ----------
export const TRUST_ITEMS = {
  digilocker: {label: 'Aadhaar via DigiLocker', who: 'seller', why: 'Confirms the owner is a real person; only the last 4 digits are kept'},
  selfie: {label: 'Live selfie matched to Aadhaar photo', who: 'seller', why: 'Stops someone using another person\'s documents'},
  shopPhotos: {label: 'Geo-tagged shop photos (signboard, inside, stock)', who: 'seller', why: 'Proves the shop exists at the pincode given'},
  supplierInvoices: {label: 'Distributor or wholesaler purchase invoices', who: 'seller', why: 'Shows where the stock comes from (stolen-goods check)'},
  policeCert: {label: 'Police character certificate', who: 'seller', why: 'Background check for higher-risk sellers'},
  videoKyc: {label: 'Video KYC call with MoveAI', who: 'admin', why: 'Reviewer sees the owner, the ID and the shop live'},
  fieldVisit: {label: 'Field visit by MoveAI agent', who: 'admin', why: 'Agent checks the shop, stock and expiry dates in person'},
};
export function requirements(state, a) {
  const strict = a.store?.stateCode && policyFor(state, a.store.stateCode) === 'strict', r = risk(state, a).level;
  if (!strict) return r === 'high' ? ['videoKyc'] : [];
  const req = ['digilocker', 'selfie', 'shopPhotos', 'videoKyc'];
  if (r !== 'low') req.push('supplierInvoices', 'fieldVisit');
  if (r === 'high') req.push('policeCert');
  return req;
}
export const sellerItems = (state, a) => requirements(state, a).filter(k => TRUST_ITEMS[k].who === 'seller');
export const trustDone = (a, k) => ['verified', 'submitted', 'assisted'].includes(a.trust?.items?.[k]?.status);
export function missingTrust(state, a) { return sellerItems(state, a).filter(k => !trustDone(a, k)); }

// ---------- Aadhaar through DigiLocker (consent flow, as with Cashfree/HyperVerge/Signzy/Decentro) ----------
// The seller never types the Aadhaar number into MoveAI: they sign in on DigiLocker with their
// Aadhaar-linked mobile + OTP, approve sharing, and come back. Only a masked number and a reference are kept.
// Prototype test numbers: any mobile 6–9xxxxxxxxx, OTP 123456. Ends 0000 → no DigiLocker account;
// ends 1111 → name on Aadhaar differs; ends 2222 → address in another district; ends 3333 → under 18.
const DL_OTP_MIN = 10, DL_TRIES = 3;
const nameKey = v => String(v || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(x => x.length > 1);
export function namesMatch(a, b) { const x = nameKey(a), y = nameKey(b); return x.length > 0 && x.filter(w => y.includes(w)).length >= Math.min(2, x.length, y.length); }
const ageOn = (dob, at = Date.now()) => Math.floor((at - Date.parse(dob)) / (365.25 * 86400000));
function aadhaarProfile(state, a, mobile, source) {
  const owner = state.person?.name || a.ownerName || 'Seller', m = String(mobile || ''), city = a.store?.city || 'Patna';
  return {name: m.endsWith('1111') ? 'Rakesh Prasad Singh' : owner, dob: m.endsWith('3333') ? '2010-03-02' : '1990-06-15', gender: 'M',
    district: m.endsWith('2222') ? 'Muzaffarpur' : city, state: sn(a.store?.stateCode) || 'India', pincode: m.endsWith('2222') ? '842001' : (a.store?.pincode || ''),
    masked: `XXXX-XXXX-${String(Math.abs([...m].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % 9000 + 1000)}`, source, ref: `${source === 'DigiLocker' ? 'DL' : 'OFX'}-${Date.now().toString(36).toUpperCase()}`};
}
function verifyProfile(state, a, prof) {
  const owner = state.person?.name || a.ownerName, holder = a.kyc?.bank?.holder || a.legalName;
  const matches = {name: namesMatch(prof.name, owner) || namesMatch(prof.name, holder), age: ageOn(prof.dob) >= 18, address: !a.store?.city || nameKey(prof.district).join(' ') === nameKey(a.store.city).join(' ')};
  a.trust ||= {items: {}};
  a.trust.items.digilocker = {status: matches.age ? 'verified' : 'failed', at: now(), source: prof.source, ref: prof.ref,
    detail: `${prof.masked} · ${prof.name} · born ${prof.dob.slice(0, 4)} · ${prof.district}, ${prof.state} · via ${prof.source}`, profile: {name: prof.name, yob: prof.dob.slice(0, 4), district: prof.district, state: prof.state, masked: prof.masked}, matches};
  a.history.unshift({at: now(), text: `Aadhaar verified via ${prof.source}${matches.name ? '' : ' · name differs'}${matches.address ? '' : ' · district differs'}${matches.age ? '' : ' · under 18'}`});
  return matches.age ? '' : 'Aadhaar shows the owner is under 18. Sellers must be 18 or older.';
}
export function dlStart(state, a) { a.trust ||= {items: {}}; a.trust.dl = {step: 'mobile', startedAt: Date.now()}; return ''; }
export function dlCancel(state, a) { if (a.trust) delete a.trust.dl; return ''; }
export function dlSendOtp(state, a, mobile) {
  const dl = a.trust?.dl; if (!dl) return 'Start DigiLocker verification again.';
  const m = String(mobile || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(m)) return 'Enter the 10-digit mobile number linked to your Aadhaar.';
  if (m.endsWith('0000')) { dl.noAccount = true; return 'No DigiLocker account is linked to this mobile. Use your Aadhaar QR or offline XML below, or ask for a check on the video call.'; }
  Object.assign(dl, {step: 'otp', mobile: m, expiresAt: Date.now() + DL_OTP_MIN * 60000, tries: 0, noAccount: false}); return '';
}
export function dlVerifyOtp(state, a, otp, at = Date.now()) {
  const dl = a.trust?.dl; if (!dl || dl.step !== 'otp') return 'Send the OTP first.';
  if (at > dl.expiresAt) { dl.step = 'mobile'; return 'The OTP expired. Send a new one.'; }
  if (String(otp || '').trim() !== '123456') { dl.tries += 1; if (dl.tries >= DL_TRIES) { dl.step = 'mobile'; return 'Too many wrong OTPs. Start again with a new OTP.'; } return `OTP is incorrect. ${DL_TRIES - dl.tries} attempt(s) left. (Prototype OTP: 123456)`; }
  dl.step = 'consent'; return '';
}
export function dlConsent(state, a, allow) {
  const dl = a.trust?.dl; if (!dl || dl.step !== 'consent') return 'Verify the OTP first.';
  if (!allow) { delete a.trust.dl; a.trust.items.digilocker = {status: 'consent_denied', at: now(), detail: 'Seller declined to share Aadhaar from DigiLocker'}; return 'You chose not to share. Use your Aadhaar QR or offline XML below, or ask for a check on the video call.'; }
  const mobile = dl.mobile; delete a.trust.dl;
  return verifyProfile(state, a, aadhaarProfile(state, a, mobile, 'DigiLocker'));
}
// Fallback C: Aadhaar secure QR (photo of the QR) or the offline e-KYC XML/ZIP from myAadhaar with its share code.
export function dlOffline(state, a, {file, shareCode}) {
  const f = String(file || '').trim(); if (!f) return 'Choose the Aadhaar QR photo or the offline XML/ZIP file from myAadhaar.';
  const isXml = /\.(zip|xml)$/i.test(f), isQr = /\.(jpe?g|png|webp|heic)$/i.test(f);
  if (!isXml && !isQr) return 'Use a photo of the Aadhaar QR code, or the ZIP/XML file downloaded from myAadhaar.';
  if (isXml && !/^\d{4}$/.test(String(shareCode || '').trim())) return 'Enter the 4-digit share code you chose when downloading the file.';
  if (/old/i.test(f)) return 'This file is more than 3 days old. Download a fresh one from myAadhaar.';
  if (/fake|edit/i.test(f)) return 'The UIDAI signature on this file is not valid. Download it again from myAadhaar.';
  return verifyProfile(state, a, aadhaarProfile(state, a, f, isXml ? 'Offline Aadhaar XML' : 'Aadhaar secure QR'));
}
// Fallback D: no smartphone / Aadhaar mobile not linked → checked live on the video KYC call.
export function dlAssisted(state, a) {
  a.trust ||= {items: {}}; delete a.trust.dl;
  a.trust.items.digilocker = {status: 'assisted', at: now(), detail: 'Seller asked for Aadhaar to be checked on the video KYC call (scan of the Aadhaar QR by the reviewer)'};
  return '';
}

// ---------- the other seller items, each verified on its own ----------
export function trustItem(state, a, key, v) {
  a.trust ||= {items: {}};
  const set = data => { a.trust.items[key] = {status: 'submitted', at: now(), ...data}; return ''; };
  if (key === 'selfie') {
    if (!['verified', 'assisted'].includes(a.trust.items.digilocker?.status)) return 'Verify Aadhaar first, so there is a photo to match the selfie against.';
    if (!v.selfie) return 'Take a live selfie so it can be matched to the Aadhaar photo.';
    if (!/\.(jpe?g|png|webp|heic)$/i.test(v.selfie)) return 'Take a photo (JPG or PNG).';
    return set({status: 'verified', detail: `${v.selfie} · face match 96% · liveness passed (simulated)`});
  }
  if (key === 'shopPhotos') { if (!v.photoSignboard || !v.photoInside || !v.photoStock) return 'Add all three shop photos: signboard, inside the shop and the stock shelves.'; return set({detail: `${v.photoSignboard}, ${v.photoInside}, ${v.photoStock} · location matches pincode ${a.store?.pincode || ''} (simulated)`}); }
  if (key === 'supplierInvoices') { if (!v.invoices) return 'Upload at least one recent purchase invoice from your distributor or wholesaler.'; return set({detail: v.invoices}); }
  if (key === 'policeCert') { if (!v.policeCert) return 'Upload the police character certificate (apply on your state police citizen portal).'; return set({detail: v.policeCert}); }
  return 'Unknown check.';
}
// Save and continue: verifies whatever was filled in, then says what is still missing.
export function saveTrust(state, a, v, canEditFn = () => true) {
  if (!canEditFn(a, 'trust')) return 'This section is locked while it is reviewed.';
  const need = sellerItems(state, a); a.trust ||= {items: {}};
  const filled = {selfie: v.selfie, shopPhotos: v.photoSignboard || v.photoInside || v.photoStock, supplierInvoices: v.invoices, policeCert: v.policeCert};
  if (need.includes('digilocker') && !trustDone(a, 'digilocker')) return a.trust.items.digilocker?.status === 'failed' ? 'Aadhaar shows the owner is under 18. Sellers must be 18 or older.' : 'Verify Aadhaar with DigiLocker first (or choose another way under “Can\'t use DigiLocker?”).';
  for (const k of need) if (k !== 'digilocker' && !trustDone(a, k) && filled[k]) { const e = trustItem(state, a, k, v); if (e) return e; }
  const missing = need.filter(k => !trustDone(a, k));
  if (missing.length) { const e = trustItem(state, a, missing[0], v); if (e) return e; }
  a.history.unshift({at: now(), text: 'Saved: identity and shop checks'});
  return '';
}
// Reviewer records a seller item as checked, or the result of a video call or field visit.
export function recordTrust(state, a, key, result, note = '', reviewer = 'MoveAI reviewer') {
  if (!TRUST_ITEMS[key]) return 'Unknown check.';
  if (!['verified', 'failed'].includes(result)) return 'Choose passed or failed.';
  if (String(note).trim().length < 5) return 'Write what you saw (at least a few words). It is kept as evidence.';
  if (TRUST_ITEMS[key].who === 'seller' && !a.trust?.items?.[key]) return 'The seller has not provided this yet.';
  a.trust ||= {items: {}};
  a.trust.items[key] = {...(a.trust.items[key] || {}), status: result, reviewNote: String(note).trim(), reviewer, reviewedAt: now()};
  a.history.unshift({at: now(), text: `${TRUST_ITEMS[key].label}: ${result} — ${note}`});
  return '';
}
// The trust section can be approved only when every required item has passed.
export function trustBlockers(state, a) {
  return requirements(state, a).filter(k => a.trust?.items?.[k]?.status !== 'verified').map(k => TRUST_ITEMS[k].label);
}

// ---------- probation for new stores ----------
export function probationFor(state, a) {
  const strict = policyFor(state, a.store?.stateCode) === 'strict';
  return {active: true, since: new Date().toISOString(), strict,
    limits: {maxProducts: strict ? 30 : 50, maxOrderValue: strict ? 2000 : 3000, cod: false, extraHoldDays: strict ? 14 : 7},
    liftAfter: {orders: strict ? 50 : 30, days: 30}, strikes: 0};
}
export const onProbation = partner => !!partner?.probation?.active;
export function deliveredCount(state, partner) { return (state.customerOrders || []).filter(o => o.fulfilmentPartner === partner.name && ['delivered', 'collected'].includes(o.status)).length; }
export function probationProgress(state, partner, at = Date.now()) {
  const p = partner?.probation; if (!p?.active) return null;
  const days = Math.floor((at - Date.parse(p.since)) / 86400000), orders = deliveredCount(state, partner);
  return {days, orders, ready: orders >= p.liftAfter.orders && days >= p.liftAfter.days && !(partner.strikes > 0)};
}
export function endProbation(state, key, by = 'MoveAI', note = '') {
  const partner = state.shopPartners?.[key]; if (!partner?.probation?.active) return 'This store is not on probation.';
  const prog = probationProgress(state, partner);
  if (by !== 'system' && !prog.ready && String(note).trim().length < 5) return 'Probation targets are not met yet. Write why you are ending it early.';
  partner.probation = {...partner.probation, active: false, endedAt: new Date().toISOString(), endedBy: by, note: String(note).trim()};
  (state.notifications ||= []).unshift({id: `NT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, to: key, route: 'plusStore', text: 'Probation ended: COD and full product limits are now available.', read: false});
  return '';
}

// ---------- strikes (expired items, fraud reports) ----------
export function addStrike(state, key, reason) {
  const partner = state.shopPartners?.[key]; if (!partner) return 0;
  partner.strikes = (partner.strikes || 0) + 1; (partner.strikeLog ||= []).unshift({at: now(), reason});
  (state.notifications ||= []).unshift({id: `NT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, to: key, route: 'plusStore', text: `Strike ${partner.strikes} of 3: ${reason}`, read: false});
  if (partner.strikes >= 3 && !partner.suspended) {
    partner.suspended = true; partner.paused = true;
    (state.notifications ||= []).unshift({id: `NT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, to: 'admin', route: 'sellerReview', text: `${partner.name} suspended after 3 strikes. Review before reinstating.`, read: false});
  }
  return partner.strikes;
}

// ---------- review queue ----------
export const SLA_HOURS = 72;
export function ageHours(a, at = Date.now()) { const t = Date.parse(a.submittedIso || ''); return Number.isFinite(t) ? Math.max(0, Math.floor((at - t) / 3600000)) : 0; }
export function slaText(a, at = Date.now()) { const left = SLA_HOURS - ageHours(a, at); return left >= 0 ? `due in ${left} h` : `overdue by ${-left} h`; }

// ---------- markup ----------
export function trustFormHtml(state, a) {
  const need = sellerItems(state, a), item = k => a.trust?.items?.[k], done = k => trustDone(a, k);
  const st = k => done(k) ? `<span class="status-pill">${item(k).status === 'verified' ? 'Verified' : item(k).status === 'assisted' ? 'On video call' : 'Sent for review'}</span>` : '';
  const strict = policyFor(state, a.store?.stateCode) === 'strict', ro = a.status !== 'draft' && a.sections?.trust && !['correction', 'not_provided'].includes(a.sections.trust.status);
  const verifyBtn = k => ro || done(k) ? '' : `<button type="button" class="button secondary compact" data-trust-verify="${k}">Verify</button>`;
  const dlItem = item('digilocker'), m = dlItem?.matches;
  const dlBlock = done('digilocker') ? (dlItem.status === 'assisted' ? `<p class="muted">${esc(dlItem.detail)}</p>` : `<div class="dl-result"><p><b>${esc(dlItem.profile.name)}</b> · born ${esc(dlItem.profile.yob)} · ${esc(dlItem.profile.district)}, ${esc(dlItem.profile.state)} · ${esc(dlItem.profile.masked)}</p><ul class="evidence-list"><li class="${m.name ? 'ok' : 'bad'}"><span>${m.name ? '✓' : '!'}</span><b>${m.name ? 'Name matches your PAN / bank name' : 'Name on Aadhaar differs from your PAN / bank name'}</b>${m.name ? '' : '<small>A reviewer will check this. Make sure the business is registered to you.</small>'}</li><li class="${m.age ? 'ok' : 'bad'}"><span>${m.age ? '✓' : '✗'}</span><b>${m.age ? 'Age 18 or over' : 'Under 18'}</b></li><li class="${m.address ? 'ok' : 'bad'}"><span>${m.address ? '✓' : '!'}</span><b>${m.address ? 'Address district matches the store' : 'Aadhaar address is in a different district from the store'}</b>${m.address ? '' : '<small>Fine if you live elsewhere; the reviewer may ask about it.</small>'}</li></ul><p class="muted">Verified via ${esc(dlItem.source)} · ref ${esc(dlItem.ref)}. MoveAI keeps only the masked number.</p></div>`)
    : `${dlItem?.status === 'failed' ? `<div class="info-banner warning"><b>Not accepted</b><span>Aadhaar shows the owner is under 18. Sellers must be 18 or older.</span></div>` : ''}${dlItem?.status === 'consent_denied' ? '<div class="info-banner warning"><b>You chose not to share from DigiLocker</b><span>Use another way below.</span></div>' : ''}
      <p class="muted">You'll sign in on DigiLocker with your Aadhaar-linked mobile and approve sharing. MoveAI never sees or stores your full Aadhaar number.</p>
      ${ro ? '' : `<button type="button" class="button primary" data-dl="start">Verify with DigiLocker</button>
      <details class="dl-fallback" ${a.trust?.dlNoAccount || dlItem?.status === 'consent_denied' ? 'open' : ''}><summary>Can't use DigiLocker?</summary>
        <div class="dl-option"><b>Aadhaar QR or offline XML</b><p class="muted">Take a photo of the QR code on your Aadhaar card or e-Aadhaar, or download the offline e-KYC ZIP from the myAadhaar website (choose a 4-digit share code).</p><div class="form-grid two"><label><span>QR photo or ZIP/XML file</span><input type="file" name="offlineFile" accept="image/*,.zip,.xml"></label><label><span>Share code (for ZIP/XML)</span><input name="shareCode" inputmode="numeric" maxlength="4"></label></div><button type="button" class="button secondary compact" data-dl="offline">Verify file</button></div>
        <div class="dl-option"><b>No smartphone, or Aadhaar mobile not linked?</b><p class="muted">The MoveAI reviewer will scan your Aadhaar QR on the video KYC call.</p><button type="button" class="button secondary compact" data-dl="assisted">Check my Aadhaar on the video call</button></div>
      </details>`}`;
  return `<div class="info-banner ${strict ? 'warning' : ''}"><b>${strict ? 'Extra checks for sellers in this state' : 'Extra checks for this application'}</b><span>${strict ? 'To protect customers from fraud and expired goods, MoveAI verifies every seller here before going live.' : 'A reviewer will do a short video call before approving.'} Verify each item below; your documents are encrypted and used only for verification.</span></div>
  ${need.includes('digilocker') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.digilocker.label)} ${st('digilocker')}</legend>${dlBlock}</fieldset>` : ''}
  ${need.includes('selfie') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.selfie.label)} ${st('selfie')}</legend>${done('selfie') ? `<p class="muted">${esc(item('selfie').detail)}</p>` : `<label><span>Take a selfie now (front camera)</span><input type="file" name="selfie" accept="image/*" capture="user"></label>${verifyBtn('selfie')}`}</fieldset>` : ''}
  ${need.includes('shopPhotos') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.shopPhotos.label)} ${st('shopPhotos')}</legend>${done('shopPhotos') ? `<p class="muted">${esc(item('shopPhotos').detail)}</p>` : `<p class="muted">Take the photos at the shop: the location is recorded with each photo.</p><div class="form-grid two"><label><span>Signboard with shop name</span><input type="file" name="photoSignboard" accept="image/*" capture="environment"></label><label><span>Inside the shop</span><input type="file" name="photoInside" accept="image/*" capture="environment"></label><label><span>Stock shelves</span><input type="file" name="photoStock" accept="image/*" capture="environment"></label></div>${verifyBtn('shopPhotos')}`}</fieldset>` : ''}
  ${need.includes('supplierInvoices') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.supplierInvoices.label)} ${st('supplierInvoices')}</legend>${done('supplierInvoices') ? `<p class="muted">${esc(item('supplierInvoices').detail)}</p>` : `<label><span>Recent invoice from a distributor or wholesaler (last 3 months)</span><input type="file" name="invoices" accept="image/*,.pdf"></label>${verifyBtn('supplierInvoices')}`}</fieldset>` : ''}
  ${need.includes('policeCert') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.policeCert.label)} ${st('policeCert')}</legend>${done('policeCert') ? `<p class="muted">${esc(item('policeCert').detail)}</p>` : `<label><span>Character certificate from your state police citizen portal</span><input type="file" name="policeCert" accept="image/*,.pdf"></label>${verifyBtn('policeCert')}`}</fieldset>` : ''}
  ${requirements(state, a).some(k => TRUST_ITEMS[k].who === 'admin') ? `<p class="muted">After you submit, MoveAI will ${requirements(state, a).includes('fieldVisit') ? 'book a video call and send an agent to visit your shop (they check the shop, stock and expiry dates)' : 'book a short video call'}. Keep your Aadhaar and shop ready.</p>` : ''}`;
}
// The simulated DigiLocker window (outside the form). Production: the provider's hosted DigiLocker page.
export function dlSheetHtml(a, error = '') {
  const dl = a.trust?.dl; if (!dl) return '';
  const body = dl.step === 'mobile' ? `<label><span>Aadhaar-linked mobile number</span><input id="dl-mobile" inputmode="numeric" maxlength="10" value="${esc(dl.mobile || '')}"></label><button type="button" class="button primary" data-dl="send">Send OTP</button>`
    : dl.step === 'otp' ? `<p>OTP sent to ••••••${esc(dl.mobile.slice(-4))} by UIDAI. Valid ${DL_OTP_MIN} minutes.</p><label><span>Enter OTP</span><input id="dl-otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label><div class="row-actions"><button type="button" class="button primary" data-dl="verify">Verify OTP</button><button type="button" class="button secondary" data-dl="send" data-dl-resend="1">Resend OTP</button></div>`
    : `<p><b>MoveAI Commerce</b> is requesting access to:</p><ul><li>Aadhaar: name, year of birth, gender, address</li><li>Masked Aadhaar number (last 4 digits only)</li></ul><p class="muted">Purpose: seller identity verification. Valid for this request only.</p><div class="row-actions"><button type="button" class="button primary" data-dl="allow">Allow</button><button type="button" class="button secondary" data-dl="deny">Deny</button></div>`;
  return `<div class="dl-overlay" role="dialog" aria-modal="true" aria-labelledby="dl-title"><section class="dl-sheet"><header><b id="dl-title">DigiLocker</b><small>Simulated · Government of India sign-in</small><button type="button" class="button text compact" data-dl="cancel" aria-label="Close">✕</button></header>${body}<p class="field-error dl-error" ${error ? '' : 'hidden'}>${esc(error)}</p><p class="mock-hint"><b>Prototype</b><span>Any mobile, OTP 123456. Mobile ending 0000 → no account; 1111 → name differs; 2222 → other district; 3333 → under 18.</span></p></section></div>`;
}
export function readTrustForm(fd) {
  const v = Object.fromEntries(fd); for (const k of ['selfie', 'photoSignboard', 'photoInside', 'photoStock', 'invoices', 'policeCert']) { const f = fd.get(k); v[k] = f && f.name ? f.name : ''; }
  v.consent = fd.has('consent'); return v;
}
// Evidence panel for one application (admin).
export function evidenceHtml(state, a) {
  const r = risk(state, a), cs = checks(state, a), req = requirements(state, a);
  const row = c => `<li class="${c.ok ? 'ok' : 'bad'}"><span aria-hidden="true">${c.ok ? '✓' : '✗'}</span><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></li>`;
  const trustRow = k => { const it = a.trust?.items?.[k], st = it?.status || 'missing'; return `<li class="${st === 'verified' ? 'ok' : st === 'failed' ? 'bad' : 'wait'}"><span aria-hidden="true">${st === 'verified' ? '✓' : st === 'failed' ? '✗' : '…'}</span><b>${esc(TRUST_ITEMS[k].label)}</b><small>${esc(it?.detail || (TRUST_ITEMS[k].who === 'admin' ? 'To be done by MoveAI' : 'Not provided yet'))}${it?.reviewNote ? ` · reviewer: ${esc(it.reviewNote)}` : ''}</small>${a.status !== 'draft' && (TRUST_ITEMS[k].who === 'admin' || it) && st !== 'verified' ? `<form class="inline-form" data-trust-record="${esc(a.id)}" data-key="${k}"><input name="note" placeholder="What you checked"><button class="button secondary compact" name="result" value="verified">Passed</button><button class="button secondary compact" name="result" value="failed">Failed</button></form>` : ''}</li>`; };
  return `<div class="evidence"><p><span class="risk-pill risk-${r.level}">${RISK_LABEL[r.level]}</span> ${esc(r.reasons.join(' · '))}${a.store?.stateCode && policyFor(state, a.store.stateCode) === 'strict' ? ' · <b>strict state</b>' : ''}</p>
   <h3>Automatic checks</h3><ul class="evidence-list">${cs.map(row).join('')}</ul>
   ${req.length ? `<h3>Identity and shop checks</h3><ul class="evidence-list">${req.map(trustRow).join('')}</ul>` : ''}</div>`;
}
export function policyHtml(state, STATES) {
  const p = policy(state);
  return `<details class="panel seller-policy"><summary><b>Seller verification policy by state</b> · strict in ${Object.entries(p.byState).filter(([, v]) => v === 'strict').map(([k]) => esc(STATES[k] || k)).join(', ') || 'none'}</summary>
   <p class="muted">${Object.entries(POLICY_LEVELS).map(([k, v]) => `<b>${v.label}:</b> ${esc(v.note)}`).join('<br>')}</p>
   <table class="price-table"><tbody>${Object.entries(STATES).map(([k, n]) => `<tr><td>${esc(n)}</td><td>${esc(POLICY_LEVELS[policyFor(state, k)].label)}${p.reason?.[k] ? ` · ${esc(p.reason[k])}` : ''}</td></tr>`).join('')}</tbody></table>
   <form class="inline-form" data-seller-policy><select name="state">${Object.entries(STATES).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select><select name="level"><option value="strict">Strict</option><option value="standard">Standard</option></select><input name="reason" placeholder="Reason (needed for strict)"><button class="button secondary compact">Save</button></form></details>`;
}
