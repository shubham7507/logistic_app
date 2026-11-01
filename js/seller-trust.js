// MoveAI One — seller trust: automatic checks, risk level, per-state verification policy, the extra
// identity and shop checks for strict states, and probation limits for new stores.
// Chosen design: risk-tiered review (low risk auto-approved with probation; flagged or higher-risk
// applications reviewed by people) plus a "strict" policy per state — Bihar strict by default — where
// sellers also prove who they are, that the shop exists and where the stock comes from.
// Every check here is simulated; in production each calls a licensed provider (see the report).
import {gstLookup, aadhaarEkyc} from './verify-sim.js';

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
export const trustDone = (a, k) => a.trust?.items?.[k]?.status === 'verified' || a.trust?.items?.[k]?.status === 'submitted';
export function missingTrust(state, a) { return sellerItems(state, a).filter(k => !trustDone(a, k)); }

// Seller-provided evidence. v: {aadhaar, otp, consent, selfie, photoSignboard, photoInside, photoStock, invoices, policeCert}
export function saveTrust(state, a, v, canEditFn = () => true) {
  if (!canEditFn(a, 'trust')) return 'This section is locked while it is reviewed.';
  const need = sellerItems(state, a); a.trust ||= {items: {}};
  const set = (k, data) => { a.trust.items[k] = {status: 'submitted', at: now(), ...data}; };
  if (need.includes('digilocker') && !trustDone(a, 'digilocker')) {
    const r = aadhaarEkyc({aadhaar: v.aadhaar, otp: v.otp, consent: v.consent});
    if (!r.ok) return r.reason; set('digilocker', {detail: `${r.data.masked} · ${r.data.source}`, status: 'verified'});
  }
  if (need.includes('selfie') && !trustDone(a, 'selfie')) { if (!v.selfie) return 'Take a live selfie so it can be matched to the Aadhaar photo.'; set('selfie', {detail: `${v.selfie} · face match 96% (simulated)`, status: 'verified'}); }
  if (need.includes('shopPhotos') && !trustDone(a, 'shopPhotos')) {
    if (!v.photoSignboard || !v.photoInside || !v.photoStock) return 'Add all three shop photos: signboard, inside the shop and the stock shelves.';
    set('shopPhotos', {detail: `${v.photoSignboard}, ${v.photoInside}, ${v.photoStock} · location matches pincode ${a.store.pincode || ''} (simulated)`});
  }
  if (need.includes('supplierInvoices') && !trustDone(a, 'supplierInvoices')) { if (!v.invoices) return 'Upload at least one recent purchase invoice from your distributor or wholesaler.'; set('supplierInvoices', {detail: v.invoices}); }
  if (need.includes('policeCert') && !trustDone(a, 'policeCert')) { if (!v.policeCert) return 'Upload the police character certificate (apply on your state police citizen portal).'; set('policeCert', {detail: v.policeCert}); }
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
  const st = k => done(k) ? `<span class="status-pill">${item(k).status === 'verified' ? 'Verified' : 'Sent for review'}</span>` : '';
  const strict = policyFor(state, a.store?.stateCode) === 'strict';
  return `<div class="info-banner ${strict ? 'warning' : ''}"><b>${strict ? 'Extra checks for sellers in this state' : 'Extra checks for this application'}</b><span>${strict ? 'To protect customers from fraud and expired goods, MoveAI verifies every seller here before going live.' : 'A reviewer will do a short video call before approving.'} Your documents are encrypted and used only for verification.</span></div>
  ${need.includes('digilocker') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.digilocker.label)} ${st('digilocker')}</legend>${done('digilocker') ? `<p class="muted">${esc(item('digilocker').detail)}</p>` : `<div class="form-grid two"><label><span>Aadhaar number</span><input name="aadhaar" inputmode="numeric" maxlength="12" placeholder="12 digits"></label><label><span>OTP from UIDAI</span><input name="otp" inputmode="numeric" maxlength="6"></label></div><label class="consent-row"><input type="checkbox" name="consent"><span>I agree to share my Aadhaar details from DigiLocker with MoveAI for verification.</span></label><p class="mock-hint"><b>Prototype</b><span>Any 12 digits starting 2–9; OTP 123456.</span></p>`}</fieldset>` : ''}
  ${need.includes('selfie') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.selfie.label)} ${st('selfie')}</legend>${done('selfie') ? `<p class="muted">${esc(item('selfie').detail)}</p>` : '<label><span>Take a selfie now (front camera)</span><input type="file" name="selfie" accept="image/*" capture="user"></label>'}</fieldset>` : ''}
  ${need.includes('shopPhotos') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.shopPhotos.label)} ${st('shopPhotos')}</legend>${done('shopPhotos') ? `<p class="muted">${esc(item('shopPhotos').detail)}</p>` : '<p class="muted">Take the photos at the shop: the location is recorded with each photo.</p><div class="form-grid two"><label><span>Signboard with shop name</span><input type="file" name="photoSignboard" accept="image/*" capture="environment"></label><label><span>Inside the shop</span><input type="file" name="photoInside" accept="image/*" capture="environment"></label><label><span>Stock shelves</span><input type="file" name="photoStock" accept="image/*" capture="environment"></label></div>'}</fieldset>` : ''}
  ${need.includes('supplierInvoices') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.supplierInvoices.label)} ${st('supplierInvoices')}</legend>${done('supplierInvoices') ? `<p class="muted">${esc(item('supplierInvoices').detail)}</p>` : '<label><span>Recent invoice from a distributor or wholesaler (last 3 months)</span><input type="file" name="invoices" accept="image/*,.pdf"></label>'}</fieldset>` : ''}
  ${need.includes('policeCert') ? `<fieldset class="trust-item"><legend>${esc(TRUST_ITEMS.policeCert.label)} ${st('policeCert')}</legend>${done('policeCert') ? `<p class="muted">${esc(item('policeCert').detail)}</p>` : '<label><span>Character certificate from your state police citizen portal</span><input type="file" name="policeCert" accept="image/*,.pdf"></label>'}</fieldset>` : ''}
  ${requirements(state, a).some(k => TRUST_ITEMS[k].who === 'admin') ? `<p class="muted">After you submit, MoveAI will ${requirements(state, a).includes('fieldVisit') ? 'book a video call and send an agent to visit your shop (they check the shop, stock and expiry dates)' : 'book a short video call'}. Keep your Aadhaar and shop ready.</p>` : ''}`;
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
