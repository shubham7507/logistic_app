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
