// MoveAI One — staff invitation links (draw.io 13 / 14).
// Owner sends an invite → gets a link (#/join/<token>) to share by WhatsApp or SMS.
// The invited person opens it (any tab/device) → verifies the invited mobile by OTP →
// new account is created, or their existing account is used → accepts → fills their own joining details →
// owner reviews → Staff ID. The join session lives in sessionStorage, so it is separate from whoever
// is signed in to the main app in that browser.
import {esc, pill} from './ops.js';
import {ROLE_TEMPLATES} from './people-rules.js';
import {levelOf} from './worker-onboarding.js';

export const OWNER_MOBILES = {goods: '9811000101', transporter: '9811000102', vehicle: '9811000103', movers: '9811000104'};
const DAY = 86400000, OTP = '123456', MAX_OTP = 5, LOCK_MS = 10 * 60 * 1000;
const now = () => Date.now();
const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
export const newToken = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const joinLink = inv => { const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname.replace(/[^/]*$/, '')}` : 'https://moveai.example/'; return `${base}business.html#/join/${inv.token}`; };
const mask = m => `+91 ••••••${String(m).slice(-4)}`;
const hist = (inv, status, actor) => (inv.history ||= []).push({status, at: stamp(), actor});

// ---------- rules ----------
export function prepareInvite(state, inv) {
  inv.token = inv.token || newToken();
  inv.createdAt = inv.createdAt || now();
  inv.expiresAt = inv.expiresAt || now() + 7 * DAY;
  inv.expires = new Date(inv.expiresAt).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'});
  return inv;
}
export function validateNewInvite(state, inv) {
  const owner = state.businessProfiles?.[inv.workspace]?.ownerMobile || OWNER_MOBILES[inv.workspace];
  if (owner && inv.mobile === owner) return {error: 'You cannot invite your own mobile. Owners already have full access.'};
  const active = state.staffInvitations.find(x => x.workspace === inv.workspace && x.mobile === inv.mobile && !['declined', 'cancelled', 'rejected', 'replaced'].includes(x.status) && !isExpired(x) && x.status !== 'approved');
  if (active) return {error: `${active.name} was already invited on ${new Date(active.createdAt || now()).toLocaleDateString('en-IN')}. Resend the link instead.`, duplicate: active};
  const member = (state.peopleByWorkspace[inv.workspace] || []).find(p => p.mobile === inv.mobile && !['offboarded', 'rejected'].includes(p.status));
  if (member) return {error: `${member.name} is already in your team.`};
  return {};
}
export const isExpired = inv => Boolean(inv?.expiresAt && inv.expiresAt < now() && ['pending', 'mobile_verified'].includes(inv.status));
export function inviteState(state, token) {
  const inv = state.staffInvitations.find(x => x.token === token);
  if (!inv) { const old = state.staffInvitations.find(x => (x.oldTokens || []).includes(token)); return old ? {inv: old, blocked: 'replaced'} : {blocked: 'not_found'}; }
  if (inv.status === 'cancelled') return {inv, blocked: 'cancelled'};
  if (inv.status === 'declined') return {inv, blocked: 'declined'};
  if (isExpired(inv)) return {inv, blocked: 'expired'};
  return {inv};
}
export const identityFor = (state, mobile) => (state.knownIdentities || []).find(k => k.mobile === mobile);
export const memberFor = (state, inv) => (state.peopleByWorkspace[inv.workspace] || []).find(p => p.sourceInviteId === inv.id || p.mobile === inv.mobile);
export function otherBusinesses(state, inv) {
  return Object.entries(state.peopleByWorkspace).filter(([ws, list]) => ws !== inv.workspace && list.some(p => p.mobile === inv.mobile && p.status === 'active')).map(([ws]) => state.businessProfiles[ws]?.legalName || ws);
}
export function partnerProfile(state, mobile) {
  const c = (state.candidates || []).find(x => x.mobile === mobile && x.checks);
  return c && levelOf(c) >= 3 ? c : null;
}

export function checkMobile(session, inv, mobile) {
  const m = String(mobile || '').replace(/\D/g, '').slice(-10);
  if (m !== inv.mobile) return `This invitation is for the mobile ending ${inv.mobile.slice(-4)}. Only that number can accept it.`;
  return '';
}
export function checkOtp(session, otp) {
  if (session.lockedUntil && session.lockedUntil > now()) return {error: `Too many wrong attempts. Try again after ${new Date(session.lockedUntil).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'})}.`};
  if (String(otp).trim() === OTP) { session.verified = true; session.attempts = 0; return {}; }
  session.attempts = (session.attempts || 0) + 1;
  if (session.attempts >= MAX_OTP) { session.lockedUntil = now() + LOCK_MS; session.attempts = 0; return {error: 'Too many wrong attempts. Locked for 10 minutes.', locked: true}; }
  return {error: `Incorrect OTP. ${MAX_OTP - session.attempts} attempt(s) left.`};
}

// Creates the account if needed and links the session to it.
export function establishIdentity(state, session, inv, name, consent) {
  const existing = identityFor(state, inv.mobile);
  if (existing) { session.personId = existing.personId; session.name = existing.name; return ''; }
  if (!String(name || '').trim()) return 'Enter your full name.';
  if (!consent) return 'Please accept the terms and privacy notice to create your account.';
  const personId = `PER-${Date.now().toString().slice(-5)}`;
  (state.knownIdentities ||= []).push({mobile: inv.mobile, personId, name: name.trim(), workspaces: ['personal'], createdVia: `Staff invite ${inv.id}`, consentAt: new Date().toISOString()});
  session.personId = personId; session.name = name.trim(); session.created = true;
  (state.audit ||= []).unshift({id: `AUD-${Date.now()}`, event: `New MoveAI account created for ${name.trim()} via staff invitation`, at: stamp(), actor: name.trim(), workspace: 'personal'});
  return '';
}

export function acceptInvite(state, session, inv) {
  if (!session.verified || !session.personId) return 'Verify your mobile first.';
  if (!['pending', 'mobile_verified'].includes(inv.status)) return 'This invitation can no longer be accepted.';
  const identity = identityFor(state, inv.mobile);
  let m = memberFor(state, inv);
  if (!m) {
    m = {id: `PERSON-${Date.now().toString().slice(-4)}`, personId: identity.personId, staffId: null, sourceInviteId: inv.id, name: identity.name, mobile: inv.mobile, role: inv.role, designation: ROLE_TEMPLATES[inv.role].label, branchIds: [inv.branchId], services: state.businessProfiles[inv.workspace]?.services || [], payType: inv.payType, payAmount: 0, status: 'profile_pending', documentsStatus: 'pending_staff', bankStatus: 'pending_staff', emergencyStatus: 'pending_staff', activeAssignments: [], vehicleAssignments: [], dues: 0, employmentType: inv.employmentType, reviewHistory: []};
    (state.peopleByWorkspace[inv.workspace] ||= []).push(m);
  }
  if (!identity.workspaces.includes('staff')) identity.workspaces.push('staff');
  inv.status = 'accepted'; inv.acceptedAt = now(); hist(inv, 'accepted', identity.name);
  notifyOwner(state, inv, `${identity.name} accepted your invitation. Joining details come next.`);
  return '';
}
export function declineInvite(state, session, inv, reason) {
  inv.status = 'declined'; inv.declineReason = String(reason || '').trim(); hist(inv, 'declined', session.name || inv.name);
  notifyOwner(state, inv, `${inv.name} declined the invitation${inv.declineReason ? `: ${inv.declineReason}` : ''}. You can invite them again later.`);
}
export function validateJoining(v) {
  if (!v.dob || !String(v.address || '').trim()) return 'Enter your date of birth and address.';
  if (!/^\d{4}$/.test(String(v.idLast4 || ''))) return 'Enter the last 4 digits of your ID.';
  if (!v.reused && !String(v.documentName || '').trim()) return 'Upload your ID document.';
  if (!String(v.emergencyName || '').trim() || !/^[6-9]\d{9}$/.test(String(v.emergencyMobile || '').replace(/\D/g, ''))) return 'Add an emergency contact with a valid 10-digit mobile.';
  if (String(v.emergencyMobile).replace(/\D/g, '') === v.ownMobile) return 'The emergency contact must be someone else.';
  if (!v.reused && (!String(v.accountName || '').trim() || String(v.accountNumber || '').replace(/\D/g, '').length < 9 || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(v.ifsc || '').toUpperCase()))) return 'Enter a valid account holder, account number and IFSC.';
  return '';
}
export function submitJoining(state, inv, m, v, partner) {
  const account = String(v.accountNumber || '').replace(/\D/g, '');
  m.identity = {dob: v.dob, address: String(v.address).trim(), idType: v.idType || (partner ? 'Aadhaar (verified)' : 'Aadhaar'), idLast4: v.idLast4, documentName: v.reused ? 'Reused: verified MoveAI Partner Aadhaar' : String(v.documentName).trim(), version: (m.identity?.version || 0) + 1};
  m.emergency = {name: String(v.emergencyName).trim(), relationship: String(v.relationship || '').trim(), mobile: String(v.emergencyMobile).replace(/\D/g, '')};
  m.bank = v.reused ? {accountName: m.name, masked: partner.checks.bank.masked, ifsc: partner.checks.bank.ifsc, verified: true, source: 'Reused from MoveAI Partner'} : {accountName: String(v.accountName).trim(), accountNumber: account, masked: `••••${account.slice(-4)}`, ifsc: String(v.ifsc).toUpperCase(), upi: String(v.upi || '').trim()};
  m.documentsStatus = 'complete'; m.emergencyStatus = 'complete'; m.bankStatus = 'complete';
  m.status = 'submitted'; m.submittedAt = new Date().toISOString(); m.correctionSection = null; m.correctionReason = '';
  inv.status = 'submitted'; hist(inv, 'submitted', m.name);
  notifyOwner(state, inv, `${m.name} submitted joining details for review.`);
  (state.audit ||= []).unshift({id: `AUD-${Date.now()}`, event: `Staff self-service submitted via invite link: ${m.id}`, at: stamp(), actor: m.name, workspace: inv.workspace});
}
function notifyOwner(state, inv, text) { (state.notifications ||= []).unshift({id: `NT-${Date.now()}${Math.random().toString(36).slice(2, 4)}`, to: inv.workspace, text, ref: inv.id, at: stamp(), read: false}); }

// Owner actions
export function resendInvite(state, inv) {
  (inv.oldTokens ||= []).push(inv.token); inv.token = newToken(); inv.expiresAt = now() + 7 * DAY; inv.createdAt = inv.createdAt || now();
  inv.expires = new Date(inv.expiresAt).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'});
  if (['declined', 'cancelled'].includes(inv.status) || isExpired(inv)) inv.status = 'pending';
  inv.openedAt = null; hist(inv, 'resent', 'Owner');
}
export function cancelInvite(inv) { inv.status = 'cancelled'; hist(inv, 'cancelled', 'Owner'); }

// ---------- owner panel ----------
const STEP_LABEL = {pending: 'Sent', mobile_verified: 'Mobile verified', accepted: 'Accepted', submitted: 'Details submitted', correction_required: 'Correction requested', approved: 'Approved', rejected: 'Rejected', declined: 'Declined', cancelled: 'Cancelled'};
export function inviteLabel(inv) { if (isExpired(inv)) return 'Expired'; if (inv.status === 'pending' && inv.openedAt) return 'Opened'; return STEP_LABEL[inv.status] || inv.status; }
export function ownerInvitesPanel(state) {
  const list = state.staffInvitations.filter(x => x.workspace === state.currentWorkspace && x.status !== 'approved' && x.status !== 'replaced');
  if (!list.length) return '';
  return `<section class="panel"><div class="panel-header"><div><h2>Invitations</h2><p>Share the link by WhatsApp or SMS. The person creates or uses their own MoveAI account.</p></div></div><div class="document-list">${list.map(inv => {
    prepareInvite(state, inv);
    const open = ['pending', 'mobile_verified'].includes(inv.status) && !isExpired(inv);
    const text = encodeURIComponent(`${state.businessProfiles[inv.workspace]?.legalName || 'A business'} invited you to join as ${ROLE_TEMPLATES[inv.role].label} on MoveAI Business: ${joinLink(inv)}`);
    return `<div class="document-row invite-row"><span class="avatar">${esc(inv.name.split(' ').map(n => n[0]).join('').slice(0, 2))}</span><span class="document-copy"><b>${esc(inv.name)} · ${mask(inv.mobile)}</b><small>${esc(ROLE_TEMPLATES[inv.role].label)} · ${open ? `link expires ${esc(inv.expires)}` : esc(inv.declineReason || '')}</small></span>${pill(inviteLabel(inv).toLowerCase().replace(/ /g, '_'))}
      <span class="row-actions">${open ? `<button class="button secondary compact" data-invite-copy="${inv.id}">Copy link</button><a class="button secondary compact" target="_blank" rel="noopener" href="https://wa.me/91${inv.mobile}?text=${text}">WhatsApp</a><a class="button secondary compact" href="sms:+91${inv.mobile}?body=${text}">SMS</a><a class="button primary compact" target="_blank" rel="noopener" href="${esc(joinLink(inv))}" data-invite-open="${inv.id}">Open link (new tab)</a>` : ''}
      ${['pending', 'mobile_verified', 'declined', 'cancelled'].includes(inv.status) || isExpired(inv) ? `<button class="button secondary compact" data-invite-resend="${inv.id}">Resend</button>` : ''}${open ? `<button class="button secondary compact" data-invite-cancel="${inv.id}">Cancel</button><button class="button text compact" data-invite-expire="${inv.id}" title="Prototype only">Simulate expiry</button>` : ''}${['accepted', 'submitted', 'correction_required'].includes(inv.status) ? `<button class="button secondary compact" data-invite-member="${inv.id}">Open</button>` : ''}</span></div>`;
  }).join('')}</div></section>`;
}
export function inviteSentScreen(state) {
  const inv = state.staffInvitations.find(x => x.id === state.selectedInviteId);
  if (!inv) return '';
  prepareInvite(state, inv);
  const text = encodeURIComponent(`${state.businessProfiles[inv.workspace]?.legalName || 'A business'} invited you to join as ${ROLE_TEMPLATES[inv.role].label} on MoveAI Business: ${joinLink(inv)}`);
  return `<div class="page-header"><div><h1>Invitation ready</h1><p>${esc(inv.name)} · ${mask(inv.mobile)} · ${esc(ROLE_TEMPLATES[inv.role].label)}</p></div></div>
  <section class="panel form-panel narrow"><h2>Share this link</h2><p class="muted">Only the invited mobile can accept it. It expires on ${esc(inv.expires)}.</p>
  <div class="inline-add"><input id="invite-link" readonly value="${esc(joinLink(inv))}"><button class="button secondary" data-invite-copy="${inv.id}">Copy</button></div>
  <div class="row-actions"><a class="button primary" target="_blank" rel="noopener" href="https://wa.me/91${inv.mobile}?text=${text}">Send on WhatsApp</a><a class="button secondary" href="sms:+91${inv.mobile}?body=${text}">Send SMS</a><a class="button secondary" target="_blank" rel="noopener" href="${esc(joinLink(inv))}">Open link in a new tab (test as ${esc(inv.name.split(' ')[0])})</a></div>
  <div class="info-banner"><b>What ${esc(inv.name.split(' ')[0])} will do</b><span>Verify this mobile → create or use their MoveAI account → accept → add their own ID, emergency contact and bank → you review and approve.</span></div>
  <div class="form-actions"><button class="button secondary" data-route="people">Back to People</button></div></section>`;
}

// ---------- invitee screens (join mode) ----------
const shell = (inner, inv, state) => `<section class="join-shell"><header class="join-brand"><span class="brand-mark">B</span><b>MoveAI Business</b>${inv ? `<small>Invitation from ${esc(state.businessProfiles[inv.workspace]?.legalName || inv.workspace)}</small>` : ''}</header>${inner}<p class="join-foot muted">This page is the invited person’s own session. It is separate from anyone signed in to MoveAI in this browser.</p></section>`;
const card = (title, body) => `<section class="panel form-panel narrow join-card"><h1>${esc(title)}</h1>${body}</section>`;
const step = (n, of = 5) => `<span class="phase-tag">Step ${n} of ${of}</span>`;

export function joinScreen(state, session, token, signedIn) {
  const {inv, blocked} = inviteState(state, token);
  const biz = inv ? (state.businessProfiles[inv.workspace]?.legalName || inv.workspace) : '';
  if (blocked === 'not_found') return shell(card('Invitation not found', '<p>This link is not valid. Check the message or ask the business to send it again.</p>'), null, state);
  if (blocked === 'replaced') return shell(card('This link was replaced', `<p>${esc(biz)} sent a newer invitation link. Open the latest message from them.</p>`), inv, state);
  if (blocked === 'cancelled') return shell(card('Invitation cancelled', `<p>${esc(biz)} cancelled this invitation. Contact them if you think this is a mistake.</p>`), inv, state);
  if (blocked === 'declined') return shell(card('You declined this invitation', `<p>${esc(biz)} has been told. They can invite you again.</p>`), inv, state);
  if (blocked === 'expired') return shell(card('Invitation expired', `<p>This invitation expired on ${esc(inv.expires)}. Ask ${esc(biz)} to resend it; the new link will work for 7 days.</p>`), inv, state);
  if (!inv.openedAt && inv.status === 'pending') { inv.openedAt = now(); hist(inv, 'opened', inv.name); }
  const m = memberFor(state, inv);
  // Already past acceptance → status views (need mobile verification to see details)
  if (['accepted', 'submitted', 'correction_required', 'approved', 'rejected'].includes(inv.status) && session.verified && session.inviteId === inv.id) return shell(statusView(state, session, inv, m), inv, state);
  if (['accepted', 'submitted', 'correction_required', 'approved', 'rejected'].includes(inv.status) && !session.verified) return shell(card('You already accepted this invitation', `<p>Verify ${mask(inv.mobile)} to see your joining status.</p>${session.otpSent && session.inviteId === inv.id ? otpForm(session) : mobileForm(inv, session)}`), inv, state);
  const role = ROLE_TEMPLATES[inv.role];
  const facts = `<div class="staff-facts"><div><span>Business</span><b>${esc(biz)}</b></div><div><span>Role</span><b>${esc(role.label)}</b></div><div><span>Branch</span><b>${esc((state.businessProfiles[inv.workspace]?.branches || []).find(b => b.id === inv.branchId)?.name || inv.branchId)}</b></div><div><span>Pay</span><b>${esc(String(inv.payType).replace('_', ' '))} · ${esc(String(inv.employmentType).replace('_', ' '))}</b></div><div><span>Invited by</span><b>${esc(inv.invitedBy || 'Owner')}</b></div><div><span>Expires</span><b>${esc(inv.expires)}</b></div></div>`;
  if (!session.verified || session.inviteId !== inv.id) {
    const other = signedIn && signedIn.mobile !== inv.mobile ? `<div class="action-warning"><b>You are signed in as ${esc(signedIn.name)} (${mask(signedIn.mobile)})</b><span>This invitation is for ${mask(inv.mobile)}. Continue only if you own that number — you will verify it by OTP.</span></div>` : '';
    return shell(card(`Join ${biz}`, `${step(1)}<p>You have been invited as <b>${esc(role.label)}</b>. First, confirm it is you.</p>${facts}${other}${session.otpSent && session.inviteId === inv.id ? otpForm(session) : mobileForm(inv, session)}`), inv, state);
  }
  if (!session.personId) {
    const existing = identityFor(state, inv.mobile);
    return shell(card(existing ? `Welcome back, ${existing.name.split(' ')[0]}` : 'Create your MoveAI account', existing
      ? `${step(3)}<p>${mask(inv.mobile)} already has a MoveAI account. We will add <b>${esc(biz)}</b> to it — no new account, no second password.</p><form data-join-form="identity"><div class="form-actions"><button class="button primary" type="submit">Continue as ${esc(existing.name)}</button></div></form>`
      : `${step(3)}<p>One account works across all MoveAI apps. Your personal space stays private from ${esc(biz)}.</p><form data-join-form="identity" class="form-grid"><label><span>Full name (as on your ID)</span><input name="name" value="${esc(inv.name)}" autocomplete="name"></label><label class="consent-row"><input type="checkbox" name="consent"> I agree to the MoveAI terms and privacy notice.</label><p id="join-error" class="field-error" hidden></p><div class="form-actions"><button class="button primary" type="submit">Create account</button></div></form>`), inv, state);
  }
  if (['pending', 'mobile_verified'].includes(inv.status)) {
    const others = otherBusinesses(state, inv);
    return shell(card(`Accept ${biz}'s invitation?`, `${step(4)}${facts}<h3>What you will be able to do</h3><div class="chip-row">${role.permissions.map(p => `<span class="chip">${esc(p.replace('.', ' · '))}</span>`).join('')}</div>${others.length ? `<div class="info-banner"><b>You also work with ${esc(others.join(', '))}</b><span>Each business is a separate staff workspace. Neither sees the other’s work or your personal account.</span></div>` : ''}<form data-join-form="decision"><label><span>Reason if declining (optional)</span><input name="reason"></label><p id="join-error" class="field-error" hidden></p><div class="form-actions"><button class="button secondary" type="submit" name="decision" value="decline">Decline</button><button class="button primary" type="submit" name="decision" value="accept">Accept and continue</button></div></form>`), inv, state);
  }
  return shell(statusView(state, session, inv, m), inv, state);
}
function mobileForm(inv) { return `<form data-join-form="mobile"><label class="field-label">Your mobile number</label><div class="phone-field"><span>+91</span><input name="mobile" inputmode="numeric" maxlength="10" placeholder="10-digit mobile"></div><p id="join-error" class="field-error" hidden></p><button class="button primary full" type="submit">Send OTP</button></form>`; }
function otpForm(session) {
  const locked = session.lockedUntil && session.lockedUntil > now();
  return `<form data-join-form="otp">${step(2)}<label class="field-label">Enter the 6-digit OTP sent to your mobile</label><input class="otp-input" name="otp" inputmode="numeric" maxlength="6" ${locked ? 'disabled' : ''}><p id="join-error" class="field-error" ${locked ? '' : 'hidden'}>${locked ? 'Too many wrong attempts. Locked for 10 minutes.' : ''}</p><button class="button primary full" type="submit" ${locked ? 'disabled' : ''}>Verify</button><div class="row-actions"><button class="button text" type="button" data-join-change>Change number</button>${locked ? '<button class="button text" type="button" data-join-unlock>Prototype: skip the wait</button>' : ''}</div><div class="mock-hint"><b>Prototype OTP</b><span>123456 · 5 attempts, then a 10-minute lock</span></div></form>`;
}
function statusView(state, session, inv, m) {
  if (!m) return card('Something went wrong', '<p>Your staff record was not found. Ask the business to resend the invitation.</p>');
  const biz = state.businessProfiles[inv.workspace]?.legalName || inv.workspace;
  if (m.status === 'profile_pending' || m.status === 'correction_required') {
    const partner = partnerProfile(state, inv.mobile);
    const fix = m.status === 'correction_required' ? `<div class="action-warning"><b>${esc(biz)} asked for a correction${m.correctionSection ? ` · ${esc(m.correctionSection.replace('Status', ''))}` : ''}</b><span>${esc(m.correctionReason || '')}</span></div>` : '';
    const id = m.identity || {}, em = m.emergency || {}, bk = m.bank || {};
    return card(m.status === 'correction_required' ? 'Fix your joining details' : 'Your joining details', `${step(5)}${fix}<p class="muted">Only you enter these. ${esc(biz)} sees masked details for payroll and safety.</p>
    ${partner ? '<div class="info-banner"><b>Reusing your verified MoveAI Partner checks</b><span>Aadhaar and bank were verified in MoveAI Partner, so you do not upload them again.</span></div>' : ''}
    <form data-join-form="joining" class="form-grid two"><input type="hidden" name="reused" value="${partner ? '1' : ''}">
      <label><span>Date of birth</span><input type="date" name="dob" value="${esc(id.dob || partner?.dob || '')}"></label>
      <label><span>ID last 4 digits</span><input name="idLast4" maxlength="4" inputmode="numeric" value="${esc(id.idLast4 || (partner ? String(partner.checks.aadhaar.masked).slice(-4) : ''))}" ${partner ? 'readonly' : ''}></label>
      <label class="wide"><span>Current address</span><textarea name="address" rows="2">${esc(id.address || '')}</textarea></label>
      ${partner ? '' : `<label class="wide"><span>ID document photo</span><input type="file" name="idFile" accept="image/*,application/pdf" capture="environment"></label>`}
      <label><span>Emergency contact name</span><input name="emergencyName" value="${esc(em.name || '')}"></label>
      <label><span>Relationship</span><input name="relationship" value="${esc(em.relationship || '')}"></label>
      <label><span>Emergency mobile</span><input name="emergencyMobile" inputmode="numeric" value="${esc(em.mobile || '')}"></label>
      ${partner ? `<label class="wide"><span>Salary account</span><input value="${esc(partner.checks.bank.masked)} · ${esc(partner.checks.bank.ifsc)} (verified)" readonly></label>` : `<label><span>Account holder</span><input name="accountName" value="${esc(bk.accountName || m.name)}"></label><label><span>Account number</span><input name="accountNumber" inputmode="numeric" value="${esc(bk.accountNumber || '')}"></label><label><span>IFSC</span><input name="ifsc" value="${esc(bk.ifsc || '')}"></label><label><span>UPI (optional)</span><input name="upi" value="${esc(bk.upi || '')}"></label>`}
      <p id="join-error" class="field-error wide" hidden></p><div class="form-actions wide"><button class="button primary" type="submit">Submit to ${esc(biz)}</button></div></form>`);
  }
  if (m.status === 'submitted') return card('Waiting for review', `<p>${esc(biz)} is reviewing your details. You will get a message when they decide.</p><p class="muted">Submitted ${esc(new Date(m.submittedAt).toLocaleString('en-IN'))}</p><button class="button secondary" data-join-refresh>Check again</button>`);
  if (m.status === 'rejected') return card('Not approved', `<p>${esc(biz)} did not approve your joining${m.rejectionReason ? `: ${esc(m.rejectionReason)}` : '.'}</p><p class="muted">Your personal MoveAI account stays active.</p>`);
  if (m.status === 'active') return card(`Welcome to ${biz}`, `<p>You are approved. Staff ID <b>${esc(m.staffId)}</b> · ${esc(ROLE_TEMPLATES[m.role].label)}.</p><button class="button primary" data-join-open-staff="${m.id}">Open my staff workspace</button>`);
  return card('Invitation status', `<p>${pill(inv.status)}</p>`);
}

// ---------- bindings ----------
function showErr(root, msg) { const e = root.querySelector('#join-error'); if (e) { e.textContent = msg; e.hidden = !msg; } }
export function bindJoin(root, api) {
  const token = api.token, s = () => api.getState(), sess = api.session;
  const ctx = () => inviteState(s(), token).inv;
  root.querySelectorAll('form[data-join-form]').forEach(f => f.onsubmit = e => {
    e.preventDefault(); const kind = f.dataset.joinForm, inv = ctx(), fd = new FormData(f), st = s(), session = sess();
    if (!inv) return;
    if (kind === 'mobile') { const err = checkMobile(session, inv, fd.get('mobile')); if (err) return showErr(root, err); session.inviteId = inv.id; session.otpSent = true; session.verified = false; api.saveSession(); return api.rerender(); }
    if (kind === 'otp') { const r = checkOtp(session, fd.get('otp')); api.saveSession(); if (r.error) { if (r.locked) return api.rerender(); return showErr(root, r.error); } if (inv.status === 'pending') { inv.status = 'mobile_verified'; hist(inv, 'mobile_verified', inv.name); } const existing = identityFor(st, inv.mobile); if (existing && ['accepted', 'submitted', 'correction_required', 'approved', 'rejected'].includes(inv.status)) { session.personId = existing.personId; session.name = existing.name; } api.save(); api.saveSession(); return api.rerender(); }
    if (kind === 'identity') { const err = establishIdentity(st, session, inv, fd.get('name'), fd.get('consent')); if (err) return showErr(root, err); api.save(); api.saveSession(); api.toast(session.created ? 'Account created' : 'Signed in to your existing account'); return api.rerender(); }
    if (kind === 'decision') { const choice = e.submitter?.value || 'accept'; if (choice === 'decline') { declineInvite(st, session, inv, fd.get('reason')); api.save(); return api.rerender(); } const err = acceptInvite(st, session, inv); if (err) return showErr(root, err); api.save(); api.toast('Invitation accepted'); return api.rerender(); }
    if (kind === 'joining') {
      const m = memberFor(st, inv); const partner = partnerProfile(st, inv.mobile); const file = fd.get('idFile');
      const v = {...Object.fromEntries(fd), reused: Boolean(fd.get('reused')), documentName: file?.name || (m.identity?.documentName || ''), ownMobile: inv.mobile};
      const err = validateJoining(v); if (err) return showErr(root, err);
      submitJoining(st, inv, m, v, partner); api.save(); api.toast('Sent for review'); return api.rerender();
    }
  });
  root.querySelector('[data-join-change]')?.addEventListener('click', () => { const x = sess(); x.otpSent = false; api.saveSession(); api.rerender(); });
  root.querySelector('[data-join-unlock]')?.addEventListener('click', () => { const x = sess(); x.lockedUntil = 0; x.attempts = 0; api.saveSession(); api.rerender(); });
  root.querySelector('[data-join-refresh]')?.addEventListener('click', () => api.reload());
  root.querySelector('[data-join-open-staff]')?.addEventListener('click', ev => api.openStaff(ev.currentTarget.dataset.joinOpenStaff, ctx()));
}
export function bindOwnerInvites(root, api) {
  if (root.querySelector('[data-invite-copy], [data-invite-open]')) api.save(); // persist lazily created link tokens so links work in other tabs
  const find = id => api.getState().staffInvitations.find(x => x.id === id);
  root.querySelectorAll('[data-invite-copy]').forEach(b => b.onclick = async () => { const inv = find(b.dataset.inviteCopy); try { await navigator.clipboard.writeText(joinLink(inv)); api.toast('Link copied'); } catch { api.toast(joinLink(inv)); } });
  root.querySelectorAll('[data-invite-resend]').forEach(b => b.onclick = () => { const inv = find(b.dataset.inviteResend); resendInvite(api.getState(), inv); api.save(); api.getState().selectedInviteId = inv.id; api.save(); api.navigate('inviteSent'); api.toast('New link created. The old link no longer works.'); });
  root.querySelectorAll('[data-invite-cancel]').forEach(b => b.onclick = () => { cancelInvite(find(b.dataset.inviteCancel)); api.save(); api.render(); api.toast('Invitation cancelled'); });
  root.querySelectorAll('[data-invite-expire]').forEach(b => b.onclick = () => { const inv = find(b.dataset.inviteExpire); inv.expiresAt = now() - 1000; inv.expires = new Date(inv.expiresAt).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}); api.save(); api.render(); api.toast('Invitation marked expired (prototype)'); });
  root.querySelectorAll('[data-invite-member]').forEach(b => b.onclick = () => { const inv = find(b.dataset.inviteMember); const m = memberFor(api.getState(), inv); if (m) { api.getState().selectedStaffId = m.id; api.save(); api.navigate('staffDetail'); } });
}
