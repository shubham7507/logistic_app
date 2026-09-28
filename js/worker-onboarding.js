// MoveAI One — worker onboarding with verification levels (draw.io 09, 10, 11; recommendation B + D + C + E).
// Level 1 Browse: OTP + work type + city → see jobs and pay.
// Level 2 Verified: licence (drivers) or Aadhaar (others) checked instantly + live selfie → apply, receive offers, appear in search.
// Level 3 Trip-ready: Aadhaar + bank penny-drop + emergency contact → accept paid work and receive payouts.
// Instant checks fall back to manual upload → admin queue. Badges (police, medical, hazardous) are optional,
// except police verification for Personal Driver monthly/live-in family jobs.
import {esc, pill} from './ops.js';
import {licenceLookup, aadhaarEkyc, pennyDrop, faceMatch, TEST_DATA, normaliseLicence} from './verify-sim.js';

export const WORKER_TYPES = {
  commercialDriver: {label: 'Commercial Driver', icon: '🚚', drives: 'commercial', summary: 'Trucks, tempos and goods vehicles'},
  personalDriver: {label: 'Personal Driver', icon: '🚗', drives: 'personal', summary: 'Cars for families and companies'},
  helper: {label: 'Khalasi / Helper', icon: '📦', drives: null, summary: 'Loading, packing, moving and warehouse work'},
  officeStaff: {label: 'Office staff', icon: '🗂', drives: null, summary: 'Operations, dispatch, accounts or documents'},
};
export const CHECKS = {
  licence: {label: 'Driving licence', via: 'Instant check with Sarathi via DigiLocker', manualDocs: [['dl_front', 'Licence — front'], ['dl_back', 'Licence — back']]},
  selfie: {label: 'Live selfie', via: 'Face match with your licence or Aadhaar photo', manualDocs: []},
  aadhaar: {label: 'Aadhaar e-KYC', via: 'Instant from DigiLocker with OTP', manualDocs: [['id_proof', 'Government ID'], ['address_proof', 'Address proof']]},
  bank: {label: 'Bank account', via: '₹1 penny-drop name match', manualDocs: [['bank', 'Cancelled cheque or passbook']]},
  emergency: {label: 'Emergency contact', via: 'Someone we can call during a trip', manualDocs: []},
  police: {label: 'Police verification', via: 'Upload certificate for review', manualDocs: [['police', 'Police verification certificate']], badge: true},
  medical: {label: 'Medical fitness', via: 'Upload certificate for review', manualDocs: [['medical', 'Medical fitness certificate']], badge: true},
  hazardous: {label: 'Hazardous goods training', via: 'Upload certificate for review', manualDocs: [['hazardous', 'Training certificate']], badge: true},
};
export const LEVELS = [
  {n: 1, name: 'Browse', unlocks: 'See jobs and pay near you'},
  {n: 2, name: 'Verified', unlocks: 'Apply, receive offers and appear in business searches'},
  {n: 3, name: 'Trip-ready', unlocks: 'Accept paid trips and jobs, receive payouts'},
];
const drives = c => WORKER_TYPES[c.workerType]?.drives;
export function levelChecks(c) {
  const type = c.workerType;
  const l2 = drives(c) ? ['licence', 'selfie'] : ['aadhaar', 'selfie'];
  const l3 = drives(c) ? ['aadhaar', 'bank', 'emergency'] : ['bank', 'emergency'];
  const badges = type === 'commercialDriver' ? ['police', 'medical', 'hazardous'] : ['police'];
  return {l2, l3, badges};
}
const today = () => new Date(new Date().toISOString().slice(0, 10));
export function checkOk(c, k) {
  const x = c.checks?.[k]; if (x?.status !== 'verified') return false;
  if (k === 'licence') {
    if (x.expiry && new Date(x.expiry) < today()) return false;
    if (c.workerType === 'commercialDriver' && !(x.classes || []).some(v => ['HMV', 'HGMV', 'HPMV', 'MGV', 'LGV', 'TRANS'].includes(v))) return false;
  }
  return true;
}
export function levelOf(c) {
  if (!c?.workerType) return 0;
  const {l2, l3} = levelChecks(c);
  if (!l2.every(k => checkOk(c, k))) return 1;
  return l3.every(k => checkOk(c, k)) ? 3 : 2;
}
function refresh(c) {
  c.level = levelOf(c);
  c.verified = c.level >= 2 && !c.suspended;
  c.status = c.suspended ? 'suspended' : c.level >= 2 ? 'available' : 'browsing';
  c.onboarding = c.suspended ? 'suspended' : ['browse', 'browse', 'verified', 'trip_ready'][c.level];
  return c;
}

export function inferWorkerType(c) {
  if (c.workerType) return c.workerType;
  const caps = c.capabilities || [];
  if (caps.includes('driver')) return (c.licences || []).some(l => /personal|car/i.test(l)) ? 'personalDriver' : 'commercialDriver';
  if (caps.includes('helper')) return 'helper';
  return 'officeStaff';
}
// Seeded, already-verified workers become fully trip-ready so existing demos keep working.
export function ensureOnboarding(c) {
  if (!c) return c;
  if (!c.checks) {
    c.workerType = inferWorkerType(c);
    c.checks = {};
    if (c.verified) {
      const at = 'Before 27 Sep 2026';
      if (drives(c)) c.checks.licence = {status: 'verified', number: normaliseLicence(c.licenceNumber || 'RJ1420220012345'), classes: c.workerType === 'commercialDriver' ? ['LMV', 'HMV', 'TRANS'] : ['LMV'], expiry: '2031-03-31', source: 'Sarathi via DigiLocker', at};
      Object.assign(c.checks, {selfie: {status: 'verified', score: 95, at}, aadhaar: {status: 'verified', masked: 'XXXX XXXX 4821', at}, bank: {status: 'verified', masked: 'XXXX XXXX 1842', at}, emergency: {status: 'verified', name: 'Family contact', phone: '9811100000', at}});
    }
  }
  return refresh(c);
}

// Gates used across the app.
export function canTakeWork(c) { // apply, receive offers, appear in search
  if (!c) return 'Create your work profile first.';
  ensureOnboarding(c);
  if (c.suspended) return 'Your work profile is suspended. Open Work profile for the reason and how to appeal.';
  if (c.level < 2) return drives(c) ? 'Verify your licence and take a live selfie to apply for work. It takes about two minutes.' : 'Verify your Aadhaar and take a live selfie to apply for work. It takes about two minutes.';
  return '';
}
export function canStartPaidWork(c, job = {}) { // accept a paid trip, job or joining offer
  const e = canTakeWork(c); if (e) return e;
  if (c.level < 3) return 'Become trip-ready first: add Aadhaar, bank account and an emergency contact before accepting paid work.';
  if (c.workerType === 'personalDriver' && ['monthly', 'live-in'].includes(String(job.payType || '').toLowerCase()) && !checkOk(c, 'police')) return 'Monthly and live-in family jobs need police verification. Add it under Work profile → Badges.';
  return '';
}

export function validateQuickStart(v) {
  if (!WORKER_TYPES[v.workerType]) return 'Choose the kind of work you want.';
  if (!String(v.name || '').trim()) return 'Enter your full name.';
  if (!String(v.location || '').trim()) return 'Enter your city or area.';
  if (v.workerType === 'helper' && !(v.skills || []).length) return 'Select at least one skill.';
  return '';
}
export function validateUpload(file) {
  if (!file || !file.name) return 'Choose a file.';
  if (!/\.(jpe?g|png|webp|heic|pdf)$/i.test(file.name)) return 'Upload a photo (JPG, PNG, WEBP, HEIC) or a PDF.';
  if (file.size > 5 * 1024 * 1024) return 'The file is larger than 5 MB. Take a smaller photo.';
  return '';
}
export function validateEmergency(v, ownMobile = '') {
  const p = String(v.phone || '').replace(/\D/g, '');
  if (!String(v.name || '').trim() || !/^[6-9]\d{9}$/.test(p)) return 'Add a name and a valid 10-digit mobile.';
  if (ownMobile && p === String(ownMobile).replace(/\D/g, '').slice(-10)) return 'The emergency contact must be someone else’s number.';
  return '';
}

// Runs an instant check. Returns {error, fallback}. Mutates the candidate on success.
export function runCheck(state, c, key, input) {
  const stamp = new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
  let r;
  if (key === 'licence') r = licenceLookup({number: input.number, dob: input.dob, name: c.name, type: c.workerType});
  else if (key === 'aadhaar') r = aadhaarEkyc(input);
  else if (key === 'bank') { if (String(input.account).replace(/\D/g, '') !== String(input.confirm).replace(/\D/g, '')) return {error: 'Account numbers do not match.'}; r = pennyDrop({account: input.account, ifsc: input.ifsc, name: c.name}); }
  else if (key === 'selfie') r = faceMatch(input.file, checkOk(c, 'licence') ? 'licence photo' : checkOk(c, 'aadhaar') ? 'Aadhaar photo' : null);
  else if (key === 'emergency') { const e = validateEmergency(input, c.mobile || state.auth?.mobile); if (e) return {error: e}; r = {ok: true, data: {name: input.name.trim(), phone: String(input.phone).replace(/\D/g, '')}}; }
  else return {error: 'This item needs a document upload.'};
  if (!r.ok) { if (r.fallback) c.checks[key] = {status: 'failed', reason: r.reason, at: stamp}; refresh(c); return {error: r.reason, fallback: Boolean(r.fallback)}; }
  c.checks[key] = {status: 'verified', ...r.data, at: stamp};
  if (key === 'licence') c.dob = input.dob;
  refresh(c);
  (state.audit ||= []).unshift({id: `AUD-${Date.now()}`, event: `${c.name}: ${CHECKS[key].label} verified (${r.data.source || 'self-declared'})`, at: stamp, actor: c.name, workspace: state.currentWorkspace});
  return {};
}

// Manual fallback or badge → admin verification queue.
export function submitManual(state, c, key, files, extra = {}) {
  const need = CHECKS[key].manualDocs;
  if (!need.length) return 'Nothing to upload for this item.';
  for (const [doc, label] of need) { const e = validateUpload(files[doc]); if (e) return `${label}: ${e}`; }
  if (key === 'licence') {
    if (!extra.expiry || new Date(extra.expiry) < today()) return 'Enter a licence expiry date in the future.';
    if (!String(extra.classes || '').trim()) return 'Enter the vehicle classes printed on the licence.';
  }
  const stamp = new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
  c.checks[key] = {status: 'manual_pending', files: Object.fromEntries(need.map(([d]) => [d, files[d].name])), ...(key === 'licence' ? {number: normaliseLicence(extra.number), expiry: extra.expiry, classes: String(extra.classes).split(',').map(x => x.trim().toUpperCase()).filter(Boolean)} : {}), at: stamp};
  const existing = state.verificationQueue.find(v => v.candidateId === c.id && v.check === key);
  const docs = need.map(([, l]) => l);
  if (existing) { existing.status = 'pending'; existing.version += 1; existing.documents = docs; }
  else state.verificationQueue.unshift({id: `VER-${Date.now().toString().slice(-5)}`, kind: 'person', candidateId: c.id, check: key, subject: c.name, capability: `${WORKER_TYPES[c.workerType].label} · ${CHECKS[key].label}`, ownerWorkspace: state.currentWorkspace, documents: docs, version: 1, status: 'pending', submittedAt: stamp, history: []});
  (state.notifications ||= []).unshift({id: `NT-${Date.now()}`, to: 'admin', text: `Manual review: ${c.name} · ${CHECKS[key].label}`, ref: c.id, at: stamp, read: false});
  refresh(c);
  return '';
}

// Admin decision on a manual item.
export function applyWorkerDecision(state, item, status, reason) {
  const c = state.candidates.find(x => x.id === item.candidateId); if (!c) return;
  ensureOnboarding(c);
  const x = c.checks[item.check] || (c.checks[item.check] = {});
  if (status === 'approved') { x.status = 'verified'; x.source = 'Manual review'; if (item.check === 'licence' && !x.expiry) x.expiry = '2030-12-31'; }
  else if (status === 'correction_required') { x.status = 'correction_required'; x.reason = reason; }
  else if (status === 'rejected') { x.status = 'rejected'; x.reason = reason; }
  else if (status === 'suspended') { c.suspended = true; c.suspendReason = reason; }
  if (status === 'approved' && c.suspended) { c.suspended = false; c.suspendReason = ''; }
  refresh(c);
}

// ---------- screens ----------
const head = (title, text, action = '') => `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
export const currentCandidate = state => { const c = state.candidates.find(x => x.id === state.selectedCandidateId); return c ? ensureOnboarding(c) : null; };
export const pendingInvite = state => (state.workerInvites || []).find(i => i.mobile === state.auth?.mobile && i.status === 'pending' && state.currentWorkspace === 'personal');
function levelBar(c) {
  const lv = c ? c.level : 0;
  return `<ol class="onboard-steps" aria-label="Verification level">${LEVELS.map(l => `<li class="${lv >= l.n ? 'done' : lv + 1 === l.n ? 'current' : ''}"><i>${lv >= l.n ? '✓' : l.n}</i><span>${esc(l.name)}<small>${esc(l.unlocks)}</small></span></li>`).join('')}</ol>`;
}
const checkPill = (c, k) => { const s = c.checks?.[k]?.status; return pill(checkOk(c, k) ? 'verified' : s === 'manual_pending' ? 'under_review' : s === 'correction_required' ? 'correction_required' : s === 'rejected' ? 'rejected' : s === 'failed' ? 'needs_upload' : s === 'verified' ? 'expired' : 'to_do'); };
function checkRow(c, k) {
  const x = c.checks?.[k] || {};
  const detail = checkOk(c, k) ? (k === 'licence' ? `${(x.classes || []).join(', ')} · valid until ${x.expiry} · ${x.source}` : k === 'bank' ? `${x.masked} · ${x.ifsc || ''} · ${x.source || ''}` : k === 'aadhaar' ? `${x.masked} · ${x.source || ''}` : k === 'selfie' ? `Face match ${x.score}%` : k === 'emergency' ? `${x.name} · ${x.phone}` : x.source || 'Verified') : x.reason || CHECKS[k].via;
  const action = checkOk(c, k) ? '' : x.status === 'manual_pending' ? '<span class="muted">Waiting for review</span>' : `<button class="button ${x.status ? 'secondary' : 'primary'} compact" data-worker-check="${k}">${x.status === 'failed' || x.status === 'correction_required' || x.status === 'rejected' ? 'Fix' : CHECKS[k].badge ? 'Add' : 'Verify'}</button>`;
  return `<div class="document-row"><span class="document-icon">${checkOk(c, k) ? '✓' : '○'}</span><span class="document-copy"><b>${esc(CHECKS[k].label)}</b><small>${esc(detail)}</small></span>${checkPill(c, k)}${action}</div>`;
}

export function workerDetailsScreen(state) {
  const invite = pendingInvite(state);
  const c = currentCandidate(state) || {workerType: state.workerTypeDraft || invite?.workerType || '', name: state.person?.name || '', locations: [''], availability: 'Available now', workPreference: invite ? 'Monthly' : 'Per trip', expectedPay: invite?.pay || '', skills: []};
  const type = c.workerType;
  return `${head(c.id ? 'Edit work profile' : 'Start working', c.id ? 'Update what businesses see.' : 'Takes about a minute. You can browse jobs right after this; verification comes when you are ready to apply.')}${levelBar(c.id ? c : null)}
  ${invite && !c.id ? `<div class="info-banner"><b>${esc(invite.business)} invited you</b><span>${esc(invite.role)} · ₹${Number(invite.pay).toLocaleString('en-IN')} ${esc(invite.payType)}. We filled in what they told us. You only need to verify your licence and selfie to join them.</span></div>` : ''}
  <form id="candidate-profile-form" class="panel form-panel narrow">
    <fieldset><legend>What work do you want?</legend><div class="service-picker">${Object.entries(WORKER_TYPES).map(([k, w]) => `<label><input type="radio" name="workerType" value="${k}" ${type === k ? 'checked' : ''} data-worker-type><b>${w.icon} ${esc(w.label)}</b><small>${esc(w.summary)}</small></label>`).join('')}</div></fieldset>
    <div class="form-grid two">
      <label class="wide"><span>Full name (as on your ID)</span><input name="name" value="${esc(c.name)}" autocomplete="name"></label>
      <label><span>City or area</span><input name="location" value="${esc(c.locations?.[0] || '')}" placeholder="e.g. Patna"></label>
      <label><span>Available from</span><input name="availability" value="${esc(c.availability || 'Available now')}"></label>
      ${type === 'helper' ? `<fieldset class="wide"><legend>Skills</legend><div class="check-grid">${['Truck Khalasi', 'Loading / unloading', 'Moving helper / packer', 'Warehouse / assembly'].map(s => `<label><input type="checkbox" name="skills" value="${s}" ${(c.skills || []).includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}</div></fieldset>` : ''}
      ${drives(c) ? `<label class="wide"><span>${drives(c) === 'commercial' ? 'Vehicles you can drive' : 'Cars you can drive'} (optional)</span><input name="vehicleTypes" value="${esc((c.vehicleTypes || []).join(', '))}" placeholder="${drives(c) === 'commercial' ? '14-wheel, 22-ft closed' : 'Hatchback, SUV'}"></label><label><span>Driving experience in years (optional)</span><input type="number" min="0" name="experienceYears" value="${esc(c.experienceYears ?? '')}"></label>` : ''}
      <label><span>Work preference</span><select name="workPreference">${['Per trip', 'Hourly', 'Daily', 'Monthly', 'Permanent job'].map(p => `<option ${c.workPreference === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label><span>Expected pay ₹ (optional)</span><input type="number" min="0" name="expectedPay" value="${esc(c.expectedPay ?? '')}"></label>
    </div>
    <p class="mock-hint">🎤 Prefer speaking? Tap Ask MoveAI and say, for example, “I drive trucks in Patna”.</p>
    <p id="candidate-profile-error" class="field-error" hidden></p>
    <div class="form-actions"><button type="button" class="button secondary" data-route="home">Later</button><button class="button primary" type="submit">${c.id ? 'Save' : 'Start browsing jobs'}</button></div>
  </form>`;
}

export function workerStatusScreen(state) {
  const c = currentCandidate(state);
  if (!c) return workerDetailsScreen(state);
  const {l2, l3, badges} = levelChecks(c);
  const invite = pendingInvite(state);
  const next = c.level < 2 ? `Next: ${l2.filter(k => !checkOk(c, k)).map(k => CHECKS[k].label.toLowerCase()).join(' and ')} to apply for work.` : c.level < 3 ? 'Next: become trip-ready to accept paid work.' : 'You can apply, accept paid work and receive payouts.';
  return `${head('Work profile', `${c.name} · ${WORKER_TYPES[c.workerType].label} · ${c.locations?.[0] || ''}`, '<button class="button secondary" data-route="candidateProfile">Edit profile</button>')}${levelBar(c)}
  ${c.suspended ? `<div class="action-warning"><b>Suspended</b><span>${esc(c.suspendReason || 'Contact support to appeal.')}</span></div>` : `<div class="info-banner"><b>Level ${c.level} · ${esc(LEVELS[c.level - 1]?.name || 'Browse')}</b><span>${esc(next)}</span></div>`}
  ${invite && c.level >= 2 ? `<section class="panel attention"><h2>Join ${esc(invite.business)}</h2><p>${esc(invite.role)} · ₹${Number(invite.pay).toLocaleString('en-IN')} ${esc(invite.payType)}. Your employer vouches for you and pays your salary directly.</p><button class="button primary" data-worker-join="${invite.id}">Accept and join</button></section>` : ''}
  <div class="grid two"><section class="panel"><h2>Level 2 · Verified</h2><p class="muted">${esc(LEVELS[1].unlocks)}.</p><div class="document-list">${l2.map(k => checkRow(c, k)).join('')}</div></section>
  <section class="panel"><h2>Level 3 · Trip-ready</h2><p class="muted">${esc(LEVELS[2].unlocks)}.</p><div class="document-list">${l3.map(k => checkRow(c, k)).join('')}</div></section></div>
  <section class="panel"><h2>Badges (optional)</h2><p class="muted">Businesses prefer workers with badges.${c.workerType === 'personalDriver' ? ' Police verification is required for monthly and live-in family jobs.' : ''}</p><div class="document-list">${badges.map(k => checkRow(c, k)).join('')}</div></section>
  <div class="row-actions"><button class="button ${c.level >= 2 ? 'primary' : 'secondary'}" data-worker-find-work>${c.level >= 2 ? 'Find work' : 'Browse jobs'}</button></div>`;
}

export function workerVerifyScreen(state) {
  const c = currentCandidate(state); if (!c) return workerDetailsScreen(state);
  const k = CHECKS[state.workerCheck] ? state.workerCheck : 'licence', x = c.checks?.[k] || {};
  const manual = x.status === 'failed' || x.status === 'correction_required' || x.status === 'rejected' || CHECKS[k].badge;
  const test = TEST_DATA[k] ? `<p class="mock-hint">Prototype test data: ${esc(TEST_DATA[k])}</p>` : '';
  const back = '<button type="button" class="button secondary" data-route="workerStatus">Back</button>';
  let form = '';
  if (k === 'licence') form = `<label><span>Licence number</span><input name="number" value="${esc(x.number || '')}" placeholder="RJ14 20220012345" autocapitalize="characters"></label><label><span>Date of birth (as on licence)</span><input type="date" name="dob" value="${esc(c.dob || '')}"></label>`;
  if (k === 'aadhaar') form = `<label class="wide"><span>Aadhaar number</span><input name="aadhaar" inputmode="numeric" maxlength="14" autocomplete="off"></label><label><span>OTP sent to your Aadhaar-linked mobile</span><input name="otp" inputmode="numeric" maxlength="6"></label><label class="consent-row wide"><input type="checkbox" name="consent"> I allow MoveAI to fetch my Aadhaar details from DigiLocker for verification only. Only the last 4 digits are stored.</label>`;
  if (k === 'bank') form = `<label class="wide"><span>Account holder</span><input value="${esc(c.name)}" disabled></label><label><span>Account number</span><input name="account" inputmode="numeric" autocomplete="off"></label><label><span>Confirm account number</span><input name="confirm" inputmode="numeric" autocomplete="off"></label><label><span>IFSC</span><input name="ifsc" placeholder="SBIN0001234" autocapitalize="characters"></label>`;
  if (k === 'selfie') form = `<label class="wide"><span>Take a live selfie</span><input type="file" name="file" accept="image/*" capture="user"></label><p class="muted wide">Face the camera in good light. We compare it with your ${drives(c) ? 'licence' : 'Aadhaar'} photo.</p>`;
  if (k === 'emergency') form = `<label><span>Name</span><input name="name" value="${esc(x.name || '')}"></label><label><span>Mobile</span><input name="phone" inputmode="tel" value="${esc(x.phone || '')}"></label>`;
  const instant = !CHECKS[k].badge ? `<form class="panel form-panel narrow" data-worker-verify="${k}"><h2>${esc(CHECKS[k].label)}</h2><p class="muted">${esc(CHECKS[k].via)}.</p><div class="form-grid two">${form}</div>${test}<p id="worker-verify-error" class="field-error" hidden></p><div class="form-actions">${back}<button class="button primary" type="submit">${k === 'emergency' ? 'Save' : k === 'selfie' ? 'Match my face' : 'Verify now'}</button></div></form>` : '';
  const upload = manual && CHECKS[k].manualDocs.length ? `<form class="panel form-panel narrow" data-worker-manual="${k}"><h2>${CHECKS[k].badge ? `Add ${esc(CHECKS[k].label)}` : 'Upload for manual review'}</h2>${x.reason ? `<div class="action-warning"><b>Why</b><span>${esc(x.reason)}</span></div>` : ''}<p class="muted">Clear photo or PDF, up to 5 MB each. A reviewer checks it, usually within 24 hours.</p><div class="form-grid two">${k === 'licence' ? `<label><span>Licence number</span><input name="number" value="${esc(x.number || '')}"></label><label><span>Valid until</span><input type="date" name="expiry"></label><label class="wide"><span>Vehicle classes printed on the licence</span><input name="classes" placeholder="${drives(c) === 'commercial' ? 'HMV, TRANS' : 'LMV'}"></label>` : ''}${CHECKS[k].manualDocs.map(([d, l]) => `<label class="wide"><span>${esc(l)}</span><input type="file" name="${d}" accept="image/*,application/pdf" capture="environment"></label>`).join('')}</div><p id="worker-manual-error" class="field-error" hidden></p><div class="form-actions">${CHECKS[k].badge ? back : ''}<button class="button ${CHECKS[k].badge ? 'primary' : 'secondary'}" type="submit">Submit for review</button></div></form>` : '';
  return `${head(CHECKS[k].label, `${c.name} · ${WORKER_TYPES[c.workerType].label}`)}${levelBar(c)}${instant}${upload}`;
}

export const workerDocumentsScreen = workerStatusScreen; // kept for old links

export function workGateBanner(c) {
  const why = canTakeWork(c);
  return why ? `<div class="action-warning"><b>Browsing only</b><span>${esc(why)}</span><button class="button primary" data-route="workerStatus">Get verified</button></div>` : '';
}
export function workGateScreen(state, c, reason) {
  return `${head('Find Work', reason)}${levelBar(c)}<section class="panel"><h2>Set up your work profile</h2><p>${esc(reason)}</p><div class="row-actions"><button class="button primary" data-route="candidateProfile">Start</button></div></section>`;
}

// ---------- actions ----------
function showErr(root, id, msg) { const e = root.querySelector(`#${id}`); if (e) { e.textContent = msg; e.hidden = !msg; } }
export function bindWorkerOnboarding(root, api) {
  const form = root.querySelector('#candidate-profile-form');
  if (form) {
    form.querySelectorAll('[data-worker-type]').forEach(r => r.onchange = () => { const s = api.getState(); const c = currentCandidate(s); if (c && c.level < 2) { c.workerType = r.value; refresh(c); } else if (!c) s.workerTypeDraft = r.value; api.save(); api.render(); });
    form.onsubmit = e => {
      e.preventDefault(); const s = api.getState(); const f = new FormData(form);
      const v = {workerType: f.get('workerType'), name: String(f.get('name') || '').trim(), location: String(f.get('location') || '').trim(), availability: f.get('availability'), vehicleTypes: String(f.get('vehicleTypes') || '').split(',').map(x => x.trim()).filter(Boolean), experienceYears: f.get('experienceYears'), skills: f.getAll('skills'), workPreference: f.get('workPreference'), expectedPay: Number(f.get('expectedPay')) || 0};
      const error = validateQuickStart(v); if (error) return showErr(root, 'candidate-profile-error', error);
      let c = currentCandidate(s);
      if (c && c.level >= 2 && c.workerType !== v.workerType) return showErr(root, 'candidate-profile-error', 'You are verified for this type of work. To change it, contact support so your checks can be redone.');
      if (!c) { const invite = pendingInvite(s); c = {id: `CAND-${Date.now().toString().slice(-5)}`, personId: s.person?.id, mobile: s.auth?.mobile, checks: {}, inviteId: invite?.id || null}; s.candidates.push(c); s.selectedCandidateId = c.id; }
      Object.assign(c, v, {locations: [v.location], capabilities: v.workerType === 'officeStaff' ? ['operations'] : [...new Set([...(WORKER_TYPES[v.workerType].drives ? ['driver'] : []), ...(v.workerType === 'helper' ? ['helper'] : [])])], licences: WORKER_TYPES[v.workerType].drives === 'commercial' ? ['Heavy vehicle'] : WORKER_TYPES[v.workerType].drives ? ['Personal car'] : []});
      refresh(c); api.save();
      if (c.level >= 2) { api.toast('Profile saved'); return api.navigate('work'); }
      api.navigate('workerStatus'); api.toast('You can browse jobs now. Verify when you are ready to apply.');
    };
  }
  root.querySelectorAll('[data-worker-check]').forEach(b => b.onclick = () => { const s = api.getState(); s.workerCheck = b.dataset.workerCheck; api.save(); api.navigate('workerVerify'); });
  root.querySelectorAll('form[data-worker-verify]').forEach(fm => fm.onsubmit = e => {
    e.preventDefault(); const s = api.getState(); const c = currentCandidate(s); const f = new FormData(fm); const key = fm.dataset.workerVerify;
    const input = key === 'selfie' ? {file: f.get('file')} : {...Object.fromEntries(f), consent: Boolean(f.get('consent'))};
    const r = runCheck(s, c, key, input);
    if (r.error) { api.save(); if (r.fallback) { api.render(); api.toast('Automatic check failed — you can upload for manual review below.'); return; } return showErr(root, 'worker-verify-error', r.error); }
    const before = c.level; api.save(); api.navigate('workerStatus');
    api.toast(`${CHECKS[key].label} verified${c.level > before ? ` · Level ${c.level} unlocked: ${LEVELS[c.level - 1].name}` : ''}`);
  });
  root.querySelectorAll('form[data-worker-manual]').forEach(fm => fm.onsubmit = e => {
    e.preventDefault(); const s = api.getState(); const c = currentCandidate(s); const f = new FormData(fm); const key = fm.dataset.workerManual;
    const files = Object.fromEntries(CHECKS[key].manualDocs.map(([d]) => [d, f.get(d)]).filter(([, v]) => v && v.name));
    const err = submitManual(s, c, key, files, {number: f.get('number'), expiry: f.get('expiry'), classes: f.get('classes')});
    if (err) return showErr(root, 'worker-manual-error', err);
    api.save(); api.navigate('workerStatus'); api.toast('Sent for manual review');
  });
  root.querySelector('[data-worker-join]')?.addEventListener('click', ev => {
    const s = api.getState(); const c = currentCandidate(s); const inv = (s.workerInvites || []).find(i => i.id === ev.currentTarget.dataset.workerJoin);
    const why = canTakeWork(c); if (why) return api.toast(why);
    inv.status = 'accepted'; c.employer = inv.business; c.status = 'employed';
    (s.notifications ||= []).unshift({id: `NT-${Date.now()}`, to: inv.fromWs, text: `${c.name} accepted your ${inv.role} invite and passed licence + selfie checks.`, ref: c.id, at: new Date().toLocaleString('en-IN'), read: false});
    (s.audit ||= []).unshift({id: `AUD-${Date.now()}`, event: `${c.name} joined ${inv.business} via invite`, at: new Date().toLocaleString('en-IN'), actor: c.name, workspace: 'personal'});
    api.save(); api.render(); api.toast(`You joined ${inv.business}`);
  });
  root.querySelector('[data-worker-find-work]')?.addEventListener('click', () => api.findWork());
}
