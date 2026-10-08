// Delivery partner joining lifecycle: profile_pending -> submitted -> approved (or correction_required
// / rejected). Reviewed by the platform (admin), never by an individual seller — a delivery partner
// isn't tied to one seller, so no seller ever sees or acts on this. 'approved' is reused as the
// terminal status rather than introducing 'active', so the existing job-matching code (which already
// checks status==='approved' everywhere) needs zero changes.
import {esc} from './ops.js';
import * as PC from './people-core.js';
import {aadhaarEkyc, pennyDrop, faceMatch} from './verify-sim.js';

export function currentDeliveryPartner(state, ws) { return state.deliveryPartners?.[ws] || null; }

export function deliveryOnboardingScreen(state, ws, assisted = false) {
  const p = currentDeliveryPartner(state, ws); if (!p) return '';
  const correction = p.status === 'correction_required'
    ? `<div class="action-warning"><b>Correction requested: ${esc((p.correctionSection || '').replaceAll('Status', ''))}</b><span>${esc(p.correctionReason || 'Update the highlighted section and submit again.')}</span></div>`
    : '';
  PC.ensureCore(state); const reuse = PC.reusableIdentity(state, p.mobile, 'platform');
  const reuseBanner = reuse
    ? `<div class="info-banner"><b>Verified details available</b><span>You already have a verified identity and bank profile from ${esc(reuse.businessName)}. Reuse it instead of entering everything again.</span><button type="button" class="button secondary" data-commerce="reuse-delivery-identity">Use my verified details</button></div>`
    : '';
  return `<section class="panel"><h2>Complete your joining details</h2><p>${esc(p.name)} · Reviewed by the platform, not any one seller — once approved you can accept jobs from any seller</p>${correction}${reuseBanner}
  ${!assisted?`<p class="muted">No smartphone? <button type="button" class="button-link" data-commerce="toggle-assisted-delivery-onboarding">Have someone verify this on your behalf instead</button></p>`:`<div class="action-warning"><b>Assisted verification</b><span>Someone else is entering this on ${esc(p.name)}'s behalf, with their consent, because they don't have a smartphone to do this themselves. This gets recorded differently from self-verification.</span></div><button type="button" class="button-link" data-commerce="toggle-assisted-delivery-onboarding">Switch back to self-verification</button>`}
  <form id="delivery-onboarding-form">
    <input type="hidden" name="assisted" value="${assisted?'1':''}">
    <h3>Aadhaar verification <small class="muted">(via OTP — no need to upload a photo of the card)</small></h3>
    <div class="form-grid two">
      <label><span>Aadhaar number</span><input name="aadhaar" inputmode="numeric" maxlength="12" placeholder="12-digit number"></label>
      <label><span>Date of birth</span><input type="date" name="dob" value="${esc(p.identity?.dob||'')}"></label>
    </div>
    <div class="form-grid two">
      <label><span>OTP ${assisted?'(read aloud by them from their SMS)':'(sent to the Aadhaar-linked mobile)'}</span><input name="otp" inputmode="numeric" maxlength="6" placeholder="6-digit OTP"></label>
      <label><span>${assisted?'Photo of them or their Aadhaar card':'Live selfie'}</span><input name="selfie" type="file" accept="image/*" ${assisted?'':'capture="user"'}></label>
    </div>
    <label class="check-row"><input type="checkbox" name="consent" value="1"> ${assisted?`I confirm ${esc(p.name)} was present and gave consent for this verification.`:'I consent to fetching my Aadhaar details for verification.'}</label>
    <p class="mock-hint">Test: any 12-digit Aadhaar starting 2–9, OTP 123456.</p>
    <h3>Vehicle</h3>
    <div class="form-grid two">
      <label><span>Vehicle type</span><select name="vehicleType"><option ${p.vehicle?.type==='two_wheeler'?'selected':''} value="two_wheeler">Two-wheeler</option><option ${p.vehicle?.type==='three_wheeler'?'selected':''} value="three_wheeler">Three-wheeler</option><option ${p.vehicle?.type==='four_wheeler'?'selected':''} value="four_wheeler">Four-wheeler</option></select></label>
      <label><span>Registration number</span><input name="vehicleNumber" value="${esc(p.vehicle?.number||'')}"></label>
    </div>
    <h3>Vehicle documents</h3>
    <div class="form-grid two">
      <label><span>Driving licence number</span><input name="licenceNumber" value="${esc(p.documents?.licence?.number||'')}"></label>
      <label><span>Licence expiry</span><input type="date" name="licenceExpiry" value="${esc(p.documents?.licence?.expiry||'')}"></label>
    </div>
    <div class="form-grid two">
      <label><span>Vehicle RC document</span><input name="rcDocumentName" value="${esc(p.documents?.rc?.documentName||'')}"></label>
      <label><span>Insurance document</span><input name="insuranceDocumentName" value="${esc(p.documents?.insurance?.documentName||'')}"></label>
    </div>
    <h3>Emergency contact <small class="muted">(optional — leave blank to skip, add it later)</small></h3>
    <div class="form-grid two">
      <label><span>Name</span><input name="emergencyName" value="${esc(p.emergency?.name||'')}" placeholder="Optional"></label>
      <label><span>Relationship</span><input name="relationship" value="${esc(p.emergency?.relationship||'')}" placeholder="Optional"></label>
    </div>
    <label><span>Mobile</span><input name="emergencyMobile" maxlength="10" value="${esc(p.emergency?.mobile||'')}" placeholder="Optional"></label>
    <h3>Payout destination <small class="muted">(verified with a ₹1 penny-drop check)</small></h3>
    <div class="form-grid two">
      <label><span>Account holder</span><input name="accountName" value="${esc(p.bank?.accountName||p.name)}"></label>
      <label><span>Account number</span><input name="accountNumber" value="${esc(p.bank?.accountNumber||'')}"></label>
    </div>
    <div class="form-grid two">
      <label><span>IFSC</span><input name="ifsc" value="${esc(p.bank?.ifsc||'')}"></label>
      <label><span>UPI (optional)</span><input name="upi" value="${esc(p.bank?.upi||'')}"></label>
    </div>
    <p id="delivery-onboarding-error" class="field-error" hidden></p>
    <div class="info-banner"><b>The platform only ever sees a masked Aadhaar number and verified status</b><span>The full number is never shown or stored visibly — only "XXXX XXXX 1234" and whether it's verified.</span></div>
    <button class="button primary full">Save and submit for platform review</button>
  </form></section>`;
}

export function deliverySubmittedScreen(p) {
  return `<section class="panel"><h2>${p.status==='correction_required'?'Correction required':'Sent for platform review'}</h2><p>${esc(p.name)}</p>
  <div class="review-checklist">
    <span class="done">✓ Vehicle &amp; documents submitted</span>
    <span class="${p.emergencyStatus==='skipped'?'':'done'}">${p.emergencyStatus==='skipped'?'○ Emergency contact not provided (optional)':'✓ Emergency contact submitted'}</span>
    <span class="done">✓ Payout destination submitted</span>
  </div>
  ${p.status==='correction_required'
    ? `<div class="action-warning"><b>${esc(p.correctionReason)}</b><span>Only the selected section must be corrected.</span></div>`
    : '<p>The platform can approve, reject or return one section for correction. Once approved, you can accept jobs from any seller — not just one.</p>'}
  </section>`;
}

export function deliveryReviewScreen(state, ws) {
  const p = currentDeliveryPartner(state, ws); if (!p) return '';
  const assisted = p.verificationMode === 'assisted';
  return `<section class="panel"><h2>Review new delivery partner</h2><p>${esc(p.name)} · Not tied to any one seller</p>
  ${assisted?`<div class="action-warning"><b>Assisted verification</b><span>This was entered by ${esc(p.assistedBy||'someone else')} on ${esc(p.name)}'s behalf, with their confirmed consent — not self-verified. Review a little more carefully before approving.</span></div>`:''}
  <div class="review-checklist">
    <span class="done">✓ Mobile verified · ••••••${esc(String(p.mobile||'').slice(-4))}</span>
    <span class="done">✓ Aadhaar (OTP) · ${esc(p.identity?.aadhaarMasked||'verified')} · ${assisted?'verified, assisted':'verified, self'}</span>
    <span class="done">✓ Vehicle &amp; documents · masked</span>
    <span class="${p.emergencyStatus==='skipped'?'':'done'}">${p.emergencyStatus==='skipped'?'○ Emergency contact · not provided, optional — does not block approval':'✓ Emergency contact · complete'}</span>
    <span class="done">✓ Payout destination · verified and masked</span>
  </div>
  <form id="delivery-review-form">
    <label><span>Correction section</span><select name="section"><option value="documentsStatus">Vehicle &amp; documents</option><option value="bankStatus">Payout destination</option><option value="emergencyStatus">Emergency contact</option></select></label>
    <label><span>Correction/rejection reason</span><textarea name="reason" placeholder="Required for correction or rejection"></textarea></label>
    <p id="delivery-review-error" class="field-error" hidden></p>
    <div class="form-actions">
      <button type="button" class="button secondary" data-commerce="delivery-review-correction" data-ws="${esc(ws)}">Request correction</button>
      <button type="button" class="button danger" data-commerce="delivery-review-reject" data-ws="${esc(ws)}">Reject</button>
      <button type="button" class="button primary" data-commerce="delivery-review-approve" data-ws="${esc(ws)}">Approve — available platform-wide</button>
    </div>
  </form></section>`;
}

export function submitDeliveryOnboarding(state, ws, v) {
  const p = currentDeliveryPartner(state, ws);
  if (!p || !['profile_pending', 'correction_required'].includes(p.status)) return 'No joining details to submit for this delivery partner.';
  const assisted = v.assisted === '1';
  // Real Aadhaar OTP verification for personal identity — vehicle documents (licence/RC/insurance)
  // stay as typed fields, same as before, since there's no simulated verification for those specifically.
  const kyc = aadhaarEkyc({aadhaar: v.aadhaar, otp: v.otp, consent: v.consent === '1'});
  if (!kyc.ok) return `Aadhaar: ${kyc.reason}`;
  if (!v.dob) return 'Enter the date of birth.';
  if (!v.selfie) return assisted ? 'Upload a photo of them or their Aadhaar card.' : 'Take a live selfie.';
  const fm = faceMatch({name: v.selfie}, assisted ? 'assisted-reference' : kyc.data?.masked);
  if (!fm.ok) return `Photo: ${fm.reason}`;
  if (!v.vehicleNumber || !v.licenceNumber || !v.licenceExpiry || !String(v.rcDocumentName || '').trim() || !String(v.insuranceDocumentName || '').trim()) {
    return 'Vehicle: complete vehicle details, licence, and both document fields.';
  }
  const emergencyProvided = Boolean(String(v.emergencyName || '').trim() || String(v.emergencyMobile || '').trim());
  if (emergencyProvided && !/^[6-9]\d{9}$/.test(String(v.emergencyMobile || '').replace(/\D/g, ''))) {
    return 'Enter a valid 10-digit mobile for the emergency contact, or leave both fields blank to skip it.';
  }
  const bankCheck = pennyDrop({account: v.accountNumber, ifsc: v.ifsc, name: v.accountName});
  if (!bankCheck.ok) return `Bank account: ${bankCheck.reason}`;
  p.vehicle = {type: v.vehicleType, number: String(v.vehicleNumber).trim().toUpperCase()};
  p.documents = {
    licence: {number: String(v.licenceNumber).trim(), expiry: v.licenceExpiry},
    rc: {documentName: String(v.rcDocumentName).trim()},
    insurance: {documentName: String(v.insuranceDocumentName).trim()},
  };
  p.identity = {idType: 'Aadhaar', idLast4: kyc.data.masked.slice(-4), dob: v.dob, address: kyc.data.address, documentName: v.selfie, aadhaarMasked: kyc.data.masked};
  p.bank = {accountName: bankCheck.data.holder, accountNumber: String(v.accountNumber).replace(/\D/g, ''), masked: bankCheck.data.masked, ifsc: bankCheck.data.ifsc, upi: String(v.upi || '').trim()};
  p.emergency = emergencyProvided ? {name: String(v.emergencyName).trim(), relationship: String(v.relationship || '').trim(), mobile: String(v.emergencyMobile).replace(/\D/g, '')} : null;
  p.verificationMode = assisted ? 'assisted' : 'self';
  if (assisted) { p.assistedBy = 'Platform self-service'; p.assistedAt = new Date().toISOString(); }
  p.documentsStatus = 'complete'; p.bankStatus = 'complete'; p.emergencyStatus = emergencyProvided ? 'complete' : 'skipped';
  p.status = 'submitted'; p.correctionSection = null; p.correctionReason = '';
  return '';
}

export function deliveryReviewDecision(state, ws, decision, section = 'documentsStatus', reason = '') {
  const p = currentDeliveryPartner(state, ws);
  if (!p || p.status !== 'submitted') return 'Nothing to review for this delivery partner.';
  if (!['approve', 'correction', 'reject'].includes(decision)) return 'Select a valid review decision.';
  if (decision === 'correction' && !['documentsStatus', 'bankStatus', 'emergencyStatus'].includes(section)) return 'Select the section that needs correction.';
  if (decision !== 'approve' && !String(reason || '').trim()) return 'Add a reason for correction or rejection.';
  if (decision === 'approve') { p.status = 'approved'; p.available = true; }
  else if (decision === 'reject') { p.status = 'rejected'; p.rejectionReason = String(reason).trim(); }
  else { p.status = 'correction_required'; p.correctionSection = section; p.correctionReason = String(reason).trim(); }
  return '';
}
