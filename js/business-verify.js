// MoveAI One — instant checks inside business onboarding and fleet (recommendation D).
// GST lookup auto-fills PAN, entity type and address; bank penny-drop verifies the payout account;
// Vahan RC lookup fills vehicle details and document expiry dates. All simulated in the prototype.
import {gstLookup, pennyDrop, rcLookup, TEST_DATA} from './verify-sim.js';
import {esc} from './ops.js';

export const gstHint = () => `<p class="mock-hint">Prototype test data: ${esc(TEST_DATA.gstin)}</p>`;
export const bankHint = () => `<p class="mock-hint">Prototype test data: ${esc(TEST_DATA.bank)}</p>`;
export const rcHint = () => `<p class="mock-hint">Prototype test data: ${esc(TEST_DATA.rc)}</p>`;

export const BUSINESS_UNLOCKS = [
  ['Now, while in review', 'Explore your workspace, add branches, add vehicles with instant RC lookup, invite staff and prepare draft loads.'],
  ['After approval', 'Publish loads to the network, send or receive money, hire from the platform and accept customer jobs.'],
];

function note(root, id, html, ok) { const el = root.querySelector(`#${id}`); if (el) { el.innerHTML = html; el.hidden = false; el.className = ok ? 'verify-note ok' : 'verify-note bad'; } }

export function bindBusinessVerify(root, api) {
  root.querySelector('[data-gst-fetch]')?.addEventListener('click', () => {
    const form = root.querySelector('#business-details-form'); const s = api.getState();
    const a = s.businessApplications?.find?.(x => x.id === s.currentApplicationId) || null;
    const r = gstLookup(form.gstin.value, a?.legalName);
    if (!r.ok) return note(root, 'gst-note', esc(r.reason), false);
    form.pan.value = r.data.pan; if (form.entityType) form.entityType.value = r.data.entityType;
    if (!form.address.value.trim()) form.address.value = r.data.address;
    note(root, 'gst-note', `✓ GSTIN active · ${esc(r.data.state)} · PAN ${esc(r.data.pan)} and entity type filled from GST`, true);
  });
  root.querySelector('[data-penny-drop]')?.addEventListener('click', () => {
    const form = root.querySelector('#bank-form');
    const r = pennyDrop({account: form.accountNumber.value, ifsc: form.ifsc.value, name: form.accountName.value});
    if (!r.ok) { form.querySelector('[name="bankCheck"]').value = r.fallback ? 'manual' : ''; return note(root, 'bank-note', `${esc(r.reason)}${r.fallback ? ' You can still save; an admin will review the cancelled cheque from your KYC.' : ''}`, false); }
    form.querySelector('[name="bankCheck"]').value = 'verified';
    note(root, 'bank-note', `✓ ₹1 sent and returned · holder name matched · ${esc(r.data.masked)}`, true);
  });
  root.querySelector('[data-rc-fetch]')?.addEventListener('click', () => {
    const form = root.querySelector('form[data-op-form="add-vehicle"]');
    const r = rcLookup(form.registration.value);
    if (!r.ok) { form.rcSource.value = ''; return note(root, 'rc-note', esc(r.reason), false); }
    const d = r.data; form.registration.value = d.registration; form.capacity.value = d.capacity;
    if ([...form.truckType.options].some(o => o.value === d.truckType)) form.truckType.value = d.truckType;
    form.rcSource.value = JSON.stringify({insurance: d.insuranceUpto, fitness: d.fitnessUpto, permit: d.permitUpto, pollution: d.pucUpto});
    const expired = new Date(d.insuranceUpto) < new Date();
    note(root, 'rc-note', `✓ Found on Vahan · ${esc(d.fuel)} · insurance until ${esc(d.insuranceUpto)}${expired ? ' <b>(expired — renew before use)</b>' : ''} · fitness ${esc(d.fitnessUpto)} · permit ${esc(d.permitUpto)} · PUC ${esc(d.pucUpto)}`, !expired);
  });
}

// ---------- draft mode while the business application is in review ----------
import {prepareInvite} from './staff-join.js';
import {ROLE_TEMPLATES} from './people-rules.js';
export function draftPanel(state, app) {
  if (!app || app.status === 'approved') return '';
  const v = app.draftVehicles || [], inv = app.draftInvites || [];
  return `<section class="panel draft-panel"><h2>Prepare while you wait</h2><p class="muted">Set things up now. They switch on automatically the moment your business is approved — nothing is published or paid before that.</p>
  <div class="grid two"><div><h3>Vehicles (${v.length})</h3>${v.map(x => `<div class="ledger-row static"><span><b>${esc(x.registration)}</b><small>${esc(x.truckType)} · ${x.capacity} t · insurance ${esc(x.insuranceUpto)}</small></span></div>`).join('')}
  <form class="inline-form" data-draft-form="vehicle"><input name="registration" placeholder="RC no., e.g. BR01 GX 7744"><button class="button secondary compact">Look up on Vahan and add</button></form></div>
  <div><h3>Staff to invite (${inv.length})</h3>${inv.map(x => `<div class="ledger-row static"><span><b>${esc(x.name)}</b><small>${esc(ROLE_TEMPLATES[x.role]?.label || x.role)} · +91 ••••${esc(String(x.mobile).slice(-4))}</small></span></div>`).join('')}
  <form class="inline-form" data-draft-form="invite"><input name="name" placeholder="Name"><input name="mobile" placeholder="Mobile" inputmode="numeric"><select name="role">${Object.entries(ROLE_TEMPLATES).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('')}</select><button class="button secondary compact">Add</button></form></div></div>
  <p id="draft-error" class="field-error" hidden></p><p class="mock-hint">${esc(TEST_DATA.rc)}</p></section>`;
}
export function activateDrafts(state, app, ws) {
  const out = {vehicles: 0, invites: 0};
  for (const d of app.draftVehicles || []) {
    const id = `VEH-D${Date.now().toString().slice(-4)}${out.vehicles}`;
    ((state.ownedVehicles ||= {})[ws] ||= []).push({id, registration: d.registration, truckType: d.truckType, capacity: d.capacity, status: 'idle', documents: 'approved', documentExpiry: d.insuranceUpto, owner: ws, branchId: app.branches?.[0]?.id});
    (state.vehicleDocs ||= {})[id] = [['RC', '2035-12-31'], ['Insurance', d.insuranceUpto], ['Permit', d.permitUpto], ['Fitness', d.fitnessUpto], ['Pollution', d.pucUpto]].map(([type, expiry]) => ({type, status: 'approved', file: 'Vahan record', expiry, source: 'Vahan'}));
    out.vehicles += 1;
  }
  for (const d of app.draftInvites || []) {
    const inv = {id: `SINV-${Date.now().toString().slice(-4)}${out.invites}`, workspace: ws, name: d.name, mobile: d.mobile, role: d.role, branchId: app.branches?.[0]?.id, responsibilities: [], payType: 'monthly', employmentType: 'permanent', status: 'pending', invitedBy: app.legalName, history: [{status: 'invited', at: new Date().toLocaleString('en-IN'), actor: app.legalName, note: 'Prepared during review'}]};
    prepareInvite(state, inv); (state.staffInvitations ||= []).push(inv); out.invites += 1;
  }
  app.draftVehicles = []; app.draftInvites = []; app.draftsActivated = out;
  return out;
}
export function bindDrafts(root, api) {
  root.querySelectorAll('form[data-draft-form]').forEach(f => f.onsubmit = e => {
    e.preventDefault(); const s = api.getState(), app = api.app(), fd = new FormData(f), el = root.querySelector('#draft-error');
    const fail = m => { el.textContent = m; el.hidden = false; };
    if (f.dataset.draftForm === 'vehicle') { const r = rcLookup(fd.get('registration')); if (!r.ok) return fail(r.reason); if ((app.draftVehicles ||= []).some(x => x.registration === r.data.registration)) return fail('Already added.'); app.draftVehicles.push(r.data); }
    if (f.dataset.draftForm === 'invite') { const m = String(fd.get('mobile') || '').replace(/\D/g, ''); if (!String(fd.get('name') || '').trim() || !/^[6-9]\d{9}$/.test(m)) return fail('Enter a name and a valid 10-digit mobile.'); if (m === s.auth?.mobile) return fail('You cannot invite yourself.'); (app.draftInvites ||= []).push({name: String(fd.get('name')).trim(), mobile: m, role: fd.get('role')}); }
    api.save(); api.render(); api.toast('Saved as a draft. It switches on after approval.');
  });
}
