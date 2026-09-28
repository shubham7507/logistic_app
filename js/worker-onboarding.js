// MoveAI One — worker onboarding (draw.io pages 09, 10, 11, 12).
// A Driver, Khalasi/Helper or office worker must finish details AND upload every required document,
// then pass admin verification, before they can be matched, apply, or accept any work.
import {esc, pill} from './ops.js';

export const WORKER_TYPES = {
  commercialDriver: {label: 'Commercial Driver', icon: '🚚', drives: 'commercial', summary: 'Trucks, tempos and goods vehicles'},
  personalDriver: {label: 'Personal Driver', icon: '🚗', drives: 'personal', summary: 'Cars for families and companies'},
  helper: {label: 'Khalasi / Helper', icon: '📦', drives: null, summary: 'Loading, packing, moving and warehouse work'},
  officeStaff: {label: 'Office staff', icon: '🗂', drives: null, summary: 'Operations, dispatch, accounts or documents'},
};

const DOC = {
  dl_front: {label: 'Driving licence — front', hint: 'Photo with number and name clearly visible'},
  dl_back: {label: 'Driving licence — back', hint: 'Shows vehicle classes and validity'},
  id_proof: {label: 'Aadhaar or other government ID', hint: 'Mask the first 8 Aadhaar digits'},
  photo: {label: 'Live photo (selfie)', hint: 'Face clearly visible, no sunglasses'},
  address_proof: {label: 'Address proof', hint: 'Utility bill, rent agreement or voter ID'},
  bank: {label: 'Bank passbook or cancelled cheque', hint: 'Account must be in your own name'},
  police: {label: 'Police verification certificate', hint: 'Recommended — many businesses ask for it'},
  medical: {label: 'Medical fitness certificate', hint: 'Recommended for heavy vehicle drivers'},
  hazardous: {label: 'Hazardous goods training certificate', hint: 'Only if you carry chemicals, gas or fuel'},
};

export function requiredDocs(type) {
  if (type === 'commercialDriver') return {required: ['dl_front', 'dl_back', 'id_proof', 'photo', 'address_proof', 'bank'], optional: ['police', 'medical', 'hazardous']};
  if (type === 'personalDriver') return {required: ['dl_front', 'dl_back', 'id_proof', 'photo', 'address_proof', 'bank'], optional: ['police']};
  if (type === 'helper') return {required: ['id_proof', 'photo', 'bank'], optional: ['police', 'address_proof']};
  return {required: ['id_proof', 'photo', 'bank'], optional: ['address_proof']};
}
export const docLabel = key => DOC[key]?.label || key;

const COMMERCIAL_CLASSES = ['HMV', 'HGMV', 'HPMV', 'HTV', 'MGV', 'LGV', 'TRANS', 'TRANSPORT'];
const PERSONAL_CLASSES = ['LMV', 'LMV-NT', 'MCWG', ...COMMERCIAL_CLASSES];
export const normaliseLicence = v => String(v || '').toUpperCase().replace(/[\s-]/g, '');
const today = () => new Date(new Date().toISOString().slice(0, 10));
const daysUntil = date => Math.floor((new Date(date) - today()) / 86400000);

export function inferWorkerType(c) {
  if (c.workerType) return c.workerType;
  const caps = c.capabilities || [];
  if (caps.includes('driver')) return (c.licences || []).some(l => /personal|car/i.test(l)) ? 'personalDriver' : 'commercialDriver';
  if (caps.includes('helper')) return 'helper';
  return 'officeStaff';
}

// Seeded, already-verified workers get their documents marked verified so the demo stays consistent.
export function ensureOnboarding(c) {
  if (!c || c.onboarding) return c;
  const type = inferWorkerType(c);
  c.workerType = type;
  const {required} = requiredDocs(type);
  c.documents = c.documents || Object.fromEntries(required.map(k => [k, c.verified ? {file: `${k}.jpg`, status: 'verified', at: 'Before 27 Sep 2026'} : null]).filter(([, v]) => v));
  if (WORKER_TYPES[type].drives) {
    c.licenceNumber = c.licenceNumber || (type === 'commercialDriver' ? 'RJ14 20220012345' : 'UP16 20190054321');
    c.licenceClasses = c.licenceClasses || (type === 'commercialDriver' ? ['HMV', 'TRANS'] : ['LMV']);
    c.licenceExpiry = c.licenceExpiry || '2029-06-30';
  }
  c.experienceYears = c.experienceYears ?? 4;
  c.emergencyName = c.emergencyName || 'Family contact';
  c.emergencyPhone = c.emergencyPhone || '9811100000';
  c.onboarding = c.verified ? 'verified' : 'details';
  return c;
}

export function validateWorkerDetails(v, ownMobile = '') {
  if (!WORKER_TYPES[v.workerType]) return 'Choose the kind of work you want.';
  if (!String(v.name || '').trim()) return 'Enter your full name.';
  if (!String(v.location || '').trim()) return 'Enter where you want to work.';
  const drives = WORKER_TYPES[v.workerType].drives;
  if (drives) {
    const dl = normaliseLicence(v.licenceNumber);
    if (!/^[A-Z]{2}\d{2}\d{4}\d{7}$/.test(dl)) return 'Enter the 15-character licence number, e.g. RJ14 20220012345.';
    if (!v.licenceExpiry) return 'Enter the licence expiry date.';
    const left = daysUntil(v.licenceExpiry);
    if (left < 0) return 'This licence has expired. Renew it before onboarding.';
    if (left < 30) return 'Your licence expires within 30 days. Renew it first so work is not stopped mid-trip.';
    const classes = (v.licenceClasses || []).map(x => String(x).toUpperCase().trim()).filter(Boolean);
    if (!classes.length) return 'Enter the vehicle classes printed on your licence.';
    if (drives === 'commercial' && !classes.some(c => COMMERCIAL_CLASSES.includes(c))) return 'A Commercial Driver needs a transport class (HMV, HGMV, HPMV, MGV, LGV or TRANS). A personal LMV licence is not enough.';
    if (drives === 'personal' && !classes.some(c => PERSONAL_CLASSES.includes(c))) return 'Enter a valid class such as LMV.';
    if (!(Number(v.experienceYears) >= 0)) return 'Enter your driving experience in years.';
  }
  const ep = String(v.emergencyPhone || '').replace(/\D/g, '');
  if (!String(v.emergencyName || '').trim() || !/^[6-9]\d{9}$/.test(ep)) return 'Add an emergency contact with a valid 10-digit mobile.';
  if (ownMobile && ep === String(ownMobile).replace(/\D/g, '').slice(-10)) return 'The emergency contact must be someone else’s number.';
  return '';
}

export function docChecklist(c) {
  const {required, optional} = requiredDocs(inferWorkerType(c));
  const row = (key, isRequired) => ({key, label: docLabel(key), hint: DOC[key]?.hint || '', required: isRequired, ...(c.documents?.[key] || {status: 'missing'})});
  return [...required.map(k => row(k, true)), ...optional.map(k => row(k, false))];
}
export function missingRequired(c) { return docChecklist(c).filter(d => d.required && !['uploaded', 'verified'].includes(d.status)); }

export function validateUpload(file) {
  if (!file || !file.name) return 'Choose a file.';
  if (!/\.(jpe?g|png|webp|heic|pdf)$/i.test(file.name)) return 'Upload a photo (JPG, PNG, WEBP, HEIC) or a PDF.';
  if (file.size > 5 * 1024 * 1024) return 'The file is larger than 5 MB. Take a smaller photo.';
  return '';
}

export function canSubmitForVerification(c) {
  const d = validateWorkerDetails(c); if (d) return d;
  const m = missingRequired(c); if (m.length) return `Upload ${m.length} more required document${m.length > 1 ? 's' : ''}: ${m.map(x => x.label).join(', ')}.`;
  if (['under_verification', 'verified'].includes(c.onboarding)) return 'Already submitted.';
  return '';
}

// The single gate used by Find Work, applications, business search and offers.
export function canTakeWork(c) {
  if (!c) return 'Create your work profile first.';
  ensureOnboarding(c);
  if (c.onboarding === 'suspended') return 'Your work profile is suspended. Open verification status for the reason and appeal.';
  if (c.onboarding !== 'verified') return 'Finish your documents and verification before you can receive or accept work.';
  if (WORKER_TYPES[c.workerType]?.drives && c.licenceExpiry && daysUntil(c.licenceExpiry) < 0) return 'Your licence has expired. Upload the renewed licence to continue.';
  return '';
}

export const ONBOARDING_STEPS = [['details', 'Your details'], ['documents', 'Upload documents'], ['under_verification', 'Verification'], ['verified', 'Ready for work']];
function stepIndex(c) { return {details: 0, documents: 1, correction_required: 1, under_verification: 2, verified: 3, rejected: 2, suspended: 2}[c.onboarding] ?? 0; }

// ---------- screens ----------
const head = (title, text, action = '') => `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
export const currentCandidate = state => {
  const c = state.candidates.find(x => x.id === state.selectedCandidateId);
  return c ? ensureOnboarding(c) : null;
};
function stepper(c) {
  const i = c ? stepIndex(c) : 0;
  return `<ol class="onboard-steps" aria-label="Onboarding progress">${ONBOARDING_STEPS.map(([k, l], n) => `<li class="${n < i || (n === 3 && i === 3) ? 'done' : n === i ? 'current' : ''}"><i>${n + 1}</i><span>${esc(l)}</span></li>`).join('')}</ol>`;
}

export function workerDetailsScreen(state) {
  const c = currentCandidate(state) || {workerType: state.workerTypeDraft || '', name: state.person?.name || '', locations: [''], availability: 'Available now', workPreference: 'Per trip', expectedPay: 3500, licenceClasses: [], experienceYears: '', emergencyName: '', emergencyPhone: '', onboarding: 'details'};
  const type = c.workerType || inferWorkerType(c);
  const drives = WORKER_TYPES[type]?.drives;
  const locked = c.onboarding === 'under_verification';
  return `${head('Work profile', 'Step 1 of 3 · Tell businesses what work you can do. Documents come next.')}${stepper(c)}
  ${locked ? '<div class="info-banner"><b>Under verification</b><span>Changing your licence details will withdraw the submission and restart verification.</span></div>' : ''}
  <form id="candidate-profile-form" class="panel form-panel narrow">
    <fieldset><legend>What work do you want?</legend><div class="service-picker">${Object.entries(WORKER_TYPES).map(([k, w]) => `<label><input type="radio" name="workerType" value="${k}" ${type === k ? 'checked' : ''} data-worker-type><b>${w.icon} ${esc(w.label)}</b><small>${esc(w.summary)}</small></label>`).join('')}</div></fieldset>
    <div class="form-grid two">
      <label class="wide"><span>Full name (as on ID)</span><input name="name" value="${esc(c.name)}" autocomplete="name"></label>
      <label><span>Where do you want to work?</span><input name="location" value="${esc(c.locations?.[0] || '')}" placeholder="City or area"></label>
      <label><span>Available from</span><input name="availability" value="${esc(c.availability || 'Available now')}"></label>
      ${drives ? `<label><span>Licence number</span><input name="licenceNumber" value="${esc(c.licenceNumber || '')}" placeholder="RJ14 20220012345" autocapitalize="characters"></label>
      <label><span>Licence valid until</span><input type="date" name="licenceExpiry" value="${esc(c.licenceExpiry || '')}"></label>
      <label><span>Vehicle classes on licence</span><input name="licenceClasses" value="${esc((c.licenceClasses || []).join(', '))}" placeholder="${drives === 'commercial' ? 'HMV, TRANS' : 'LMV'}"></label>
      <label><span>Driving experience (years)</span><input type="number" min="0" name="experienceYears" value="${esc(c.experienceYears ?? '')}"></label>
      <label class="wide"><span>${drives === 'commercial' ? 'Vehicles you can drive' : 'Cars you can drive'}</span><input name="vehicleTypes" value="${esc((c.vehicleTypes || (drives === 'commercial' ? ['14-wheel', '22-ft closed'] : ['Hatchback', 'Sedan', 'SUV'])).join(', '))}"></label>` : ''}
      ${type === 'helper' ? `<fieldset class="wide"><legend>Skills</legend><div class="check-grid">${['Truck Khalasi', 'Loading / unloading', 'Moving helper / packer', 'Warehouse / assembly'].map(s => `<label><input type="checkbox" name="skills" value="${s}" ${(c.skills || []).includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}</div></fieldset>` : ''}
      <label><span>Work preference</span><select name="workPreference">${['Per trip', 'Hourly', 'Daily', 'Monthly', 'Permanent job'].map(p => `<option ${c.workPreference === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label><span>Expected pay (₹)</span><input type="number" min="0" name="expectedPay" value="${esc(c.expectedPay ?? '')}"></label>
      <label><span>Emergency contact name</span><input name="emergencyName" value="${esc(c.emergencyName || '')}"></label>
      <label><span>Emergency contact mobile</span><input name="emergencyPhone" inputmode="tel" value="${esc(c.emergencyPhone || '')}"></label>
    </div>
    <p id="candidate-profile-error" class="field-error" hidden></p>
    <div class="form-actions"><button type="button" class="button secondary" data-route="home">Save later</button><button class="button primary" type="submit">${c.onboarding === 'verified' ? 'Save profile' : 'Continue to documents'}</button></div>
  </form>`;
}

export function workerDocumentsScreen(state) {
  const c = currentCandidate(state);
  if (!c) return workerDetailsScreen(state);
  const list = docChecklist(c), missing = missingRequired(c);
  const done = list.filter(d => d.required).length - missing.length, total = list.filter(d => d.required).length;
  const locked = ['under_verification'].includes(c.onboarding);
  return `${head('Upload documents', `Step 2 of 3 · ${WORKER_TYPES[c.workerType].label}. You cannot receive work until every required document is uploaded and verified.`)}${stepper(c)}
  ${c.onboarding === 'correction_required' ? `<div class="action-warning"><b>Correction requested</b><span>${esc(c.correctionReason || 'Please re-upload the flagged documents.')}</span></div>` : ''}
  <section class="panel"><div class="panel-header"><div><h2>Required · ${done} of ${total} uploaded</h2><p>Clear photos or PDFs, up to 5 MB each. Only verification staff and businesses you apply to (with your consent) can see them.</p></div></div>
    <span class="progress wide-progress"><i style="width:${Math.round(done / total * 100)}%"></i></span>
    <div class="document-list">${list.filter(d => d.required).map(d => docRow(d, locked)).join('')}</div></section>
  <section class="panel"><h2>Optional</h2><p class="muted">These help you get more offers.</p><div class="document-list">${list.filter(d => !d.required).map(d => docRow(d, locked)).join('')}</div></section>
  <p id="worker-docs-error" class="field-error" hidden></p>
  <div class="form-actions"><button class="button secondary" data-route="candidateProfile">Back to details</button>${locked ? '<button class="button secondary" data-route="workerStatus">View status</button>' : `<button class="button primary" data-worker-submit ${missing.length ? 'disabled' : ''}>Submit for verification</button>`}</div>
  ${missing.length && !locked ? `<p class="mock-hint">Still needed: ${esc(missing.map(m => m.label).join(', '))}.</p>` : ''}`;
}
function docRow(d, locked) {
  const status = d.status === 'missing' ? (d.required ? 'required' : 'optional') : d.status;
  return `<div class="document-row"><span class="document-icon">${d.status === 'missing' ? '○' : '▣'}</span><span class="document-copy"><b>${esc(d.label)}</b><small>${d.file ? `${esc(d.file)} · ${esc(d.at || '')}` : esc(d.hint)}${d.reason ? ` · ${esc(d.reason)}` : ''}</small></span>${pill(status)}${locked || d.status === 'verified' ? '' : `<label class="upload-label button secondary compact">${d.file ? 'Replace' : 'Upload'}<input type="file" accept="image/*,application/pdf" capture="environment" data-worker-doc="${d.key}"></label>`}</div>`;
}

export function workerStatusScreen(state) {
  const c = currentCandidate(state);
  if (!c) return workerDetailsScreen(state);
  const item = state.verificationQueue.find(v => v.candidateId === c.id);
  const msg = {
    details: ['Finish your details', 'Add your work details, then upload documents.', 'candidateProfile', 'Continue'],
    documents: ['Upload your documents', `${missingRequired(c).length} required document(s) still missing.`, 'workerDocuments', 'Upload documents'],
    correction_required: ['Correction needed', c.correctionReason || 'Re-upload the flagged documents.', 'workerDocuments', 'Fix documents'],
    under_verification: ['Documents under verification', 'Usually within 24 hours. You can still use personal services meanwhile.', 'home', 'Go to Home'],
    verified: ['You are verified', 'You can now post availability, apply to openings and accept offers.', 'work', 'Find work'],
    rejected: ['Application not approved', c.correctionReason || 'See the reason below. You can appeal with new documents.', 'workerDocuments', 'Upload new documents'],
    suspended: ['Work profile suspended', c.correctionReason || 'Contact support to appeal.', 'home', 'Go to Home'],
  }[c.onboarding] || ['Status', '', 'home', 'Home'];
  return `${head('Verification status', `${c.name} · ${WORKER_TYPES[c.workerType].label}`)}${stepper(c)}
  <section class="panel"><h2>${esc(msg[0])}</h2><p>${esc(msg[1])}</p>${item ? `<p class="muted">Reference ${esc(item.id)} · version ${esc(item.version)} · ${pill(item.status)}</p>` : ''}
  <div class="row-actions"><button class="button primary" ${msg[2] === 'work' ? 'data-worker-find-work' : `data-route="${msg[2]}"`}>${esc(msg[3])}</button></div></section>
  <section class="panel"><h2>Documents</h2><div class="document-list">${docChecklist(c).filter(d => d.required || d.file).map(d => docRow(d, true)).join('')}</div></section>`;
}

export function workGateScreen(state, c, reason) {
  return `${head('Find Work', reason)}${stepper(c)}<section class="panel"><h2>Complete onboarding first</h2><p>${esc(reason)}</p><div class="row-actions"><button class="button primary" data-route="${c && ['documents', 'correction_required', 'rejected'].includes(c.onboarding) ? 'workerDocuments' : c && ['under_verification', 'suspended'].includes(c.onboarding) ? 'workerStatus' : 'candidateProfile'}">Continue onboarding</button></div></section>`;
}

// ---------- actions ----------
const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
function showErr(root, id, msg) { const e = root.querySelector(`#${id}`); if (e) { e.textContent = msg; e.hidden = !msg; } }

export function submitForVerification(state, c) {
  const e = canSubmitForVerification(c); if (e) return e;
  const existing = state.verificationQueue.find(v => v.candidateId === c.id);
  const docs = docChecklist(c).filter(d => d.file).map(d => d.label);
  if (existing) { existing.status = 'pending'; existing.version += 1; existing.documents = docs; existing.appeal = c.onboarding === 'rejected' ? 'Resubmitted with new documents' : existing.appeal; }
  else state.verificationQueue.unshift({id: `VER-${Date.now().toString().slice(-5)}`, kind: 'person', candidateId: c.id, subject: c.name, capability: WORKER_TYPES[c.workerType].label, ownerWorkspace: state.currentWorkspace, documents: docs, version: 1, status: 'pending', submittedAt: stamp(), history: []});
  Object.values(c.documents || {}).forEach(d => { if (d.status === 'uploaded' || d.status === 'correction_required') d.status = 'under_review'; });
  c.onboarding = 'under_verification'; c.status = 'pending_verification'; c.verified = false;
  (state.audit ||= []).unshift({id: `AUD-${Date.now()}`, event: `${c.name} submitted ${WORKER_TYPES[c.workerType].label} documents for verification`, at: stamp(), actor: c.name, workspace: state.currentWorkspace});
  return '';
}

// Called from the admin decision handler.
export function applyWorkerDecision(state, item, status, reason) {
  const c = state.candidates.find(x => x.id === item.candidateId); if (!c) return;
  ensureOnboarding(c);
  const map = {approved: 'verified', correction_required: 'correction_required', rejected: 'rejected', suspended: 'suspended', escalated: c.onboarding};
  c.onboarding = map[status] || c.onboarding; c.correctionReason = reason || '';
  c.verified = c.onboarding === 'verified';
  c.status = c.verified ? 'available' : c.onboarding === 'suspended' ? 'suspended' : 'pending_verification';
  Object.values(c.documents || {}).forEach(d => { if (d.status === 'under_review') d.status = c.verified ? 'verified' : status === 'correction_required' ? 'correction_required' : d.status; });
}

export function bindWorkerOnboarding(root, api) {
  const form = root.querySelector('#candidate-profile-form');
  if (form) {
    form.querySelectorAll('[data-worker-type]').forEach(r => r.onchange = () => { const s = api.getState(); const c = currentCandidate(s); if (c && c.onboarding !== 'verified') c.workerType = r.value; else s.workerTypeDraft = r.value; api.save(); api.render(); });
    form.onsubmit = e => {
      e.preventDefault(); const s = api.getState(); const f = new FormData(form);
      const v = {workerType: f.get('workerType'), name: String(f.get('name') || '').trim(), location: String(f.get('location') || '').trim(), availability: f.get('availability'), licenceNumber: String(f.get('licenceNumber') || '').trim().toUpperCase(), licenceExpiry: f.get('licenceExpiry'), licenceClasses: String(f.get('licenceClasses') || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean), experienceYears: f.get('experienceYears'), vehicleTypes: String(f.get('vehicleTypes') || '').split(',').map(x => x.trim()).filter(Boolean), skills: f.getAll('skills'), workPreference: f.get('workPreference'), expectedPay: Number(f.get('expectedPay')), emergencyName: String(f.get('emergencyName') || '').trim(), emergencyPhone: String(f.get('emergencyPhone') || '').replace(/\D/g, '')};
      let c = currentCandidate(s);
      const error = validateWorkerDetails(v, c?.mobile || s.auth?.mobile); if (error) return showErr(root, 'candidate-profile-error', error);
      if (v.workerType === 'helper' && !v.skills.length) return showErr(root, 'candidate-profile-error', 'Select at least one skill.');
      if (!c) { c = {id: `CAND-${Date.now().toString().slice(-5)}`, personId: s.person?.id, mobile: s.auth?.mobile, verified: false, status: 'draft', documents: {}, onboarding: 'details', capabilities: []}; s.candidates.push(c); s.selectedCandidateId = c.id; }
      const licenceChanged = c.onboarding !== 'details' && WORKER_TYPES[v.workerType].drives && (normaliseLicence(c.licenceNumber) !== normaliseLicence(v.licenceNumber) || c.licenceExpiry !== v.licenceExpiry || c.workerType !== v.workerType);
      Object.assign(c, v, {locations: [v.location], capabilities: v.workerType === 'officeStaff' ? (c.capabilities?.length ? c.capabilities : ['operations']) : [...new Set([...(WORKER_TYPES[v.workerType].drives ? ['driver'] : []), ...(v.workerType === 'helper' || v.skills.length ? ['helper'] : [])])], licences: WORKER_TYPES[v.workerType].drives ? [WORKER_TYPES[v.workerType].drives === 'commercial' ? 'Heavy vehicle' : 'Personal car'] : []});
      if (licenceChanged) { ['dl_front', 'dl_back'].forEach(k => { if (c.documents?.[k]) c.documents[k] = {...c.documents[k], status: 'correction_required', reason: 'Licence details changed — upload the matching licence'}; }); c.onboarding = 'documents'; c.verified = false; c.status = 'pending_verification'; }
      if (c.onboarding === 'verified') { api.save(); api.toast('Profile updated'); return api.navigate('work'); }
      if (c.onboarding === 'details') c.onboarding = 'documents';
      api.save(); api.navigate('workerDocuments'); api.toast(licenceChanged ? 'Licence changed — upload the new licence photos' : 'Details saved. Now upload your documents.');
    };
  }
  root.querySelectorAll('[data-worker-doc]').forEach(input => input.onchange = () => {
    const s = api.getState(); const c = currentCandidate(s); const file = input.files?.[0];
    const e = validateUpload(file); if (e) { showErr(root, 'worker-docs-error', e); input.value = ''; return; }
    c.documents = c.documents || {}; c.documents[input.dataset.workerDoc] = {file: file.name, size: file.size, status: 'uploaded', at: stamp()};
    if (c.onboarding === 'details') c.onboarding = 'documents';
    api.save(); api.render(); api.toast(`${docLabel(input.dataset.workerDoc)} uploaded`);
  });
  root.querySelector('[data-worker-submit]')?.addEventListener('click', () => {
    const s = api.getState(); const c = currentCandidate(s); const e = submitForVerification(s, c);
    if (e) return showErr(root, 'worker-docs-error', e);
    (s.notifications ||= []).unshift({id: `NT-${Date.now()}`, to: 'admin', text: `New ${WORKER_TYPES[c.workerType].label} verification: ${c.name}`, ref: c.id, at: stamp(), read: false});
    api.save(); api.navigate('workerStatus'); api.toast('Submitted for verification');
  });
  root.querySelector('[data-worker-find-work]')?.addEventListener('click', () => api.findWork());
}
