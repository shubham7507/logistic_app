// MoveAI One — joining a store as staff from an invite link (any store, including ones created through
// "Sell products"). The owner invites → the worker gets an SMS/WhatsApp link → opens it on their phone →
// confirms the invited mobile with an OTP → lands in that store's staff workspace, where they accept and
// complete joining details (Aadhaar, selfie, bank) → the owner reviews → active and can take orders.
import * as IDV from './id-verify.js';
import {WORKER_BY_STORE} from './seller-roles.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
export const newPickToken = () => `pk${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
export const pickJoinLink = token => { const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname.replace(/[^/]*$/, '')}` : 'https://moveai.example/'; return `${base}business.html#/pickJoin/${token}`; };
export const pickerByToken = (state, token) => (state.pickerStaff || []).find(p => p.inviteToken === token);
const INVITE_DAYS = 7;

// Called when an invite is created: token, expiry, and the SMS/WhatsApp message.
export function issueInvite(state, p) {
  p.inviteToken = newPickToken(); p.inviteExpiresAt = Date.now() + INVITE_DAYS * 86400000;
  const store = state.shopPartners?.[p.store]?.name || 'the store';
  (state.outbox ||= []).unshift({to: p.mobile, channels: ['SMS', 'WhatsApp'], at: new Date().toLocaleString('en-IN'),
    text: `${store} invited ${p.name} to join as store staff on MoveAI. Open ${pickJoinLink(p.inviteToken)} and confirm with the OTP sent to this number. Link valid ${INVITE_DAYS} days.`});
  return p.inviteToken;
}
export function joinState(state, token) {
  const p = pickerByToken(state, token);
  if (!p) return {error: 'This invitation link is not valid. Ask the store owner to send a new one.'};
  if (p.status === 'removed') return {error: 'This invitation was cancelled by the store.'};
  if (p.status === 'invited' && p.inviteExpiresAt && p.inviteExpiresAt < Date.now()) return {error: 'This invitation has expired. Ask the store owner to resend it.'};
  return {p, store: state.shopPartners?.[p.store], worker: WORKER_BY_STORE[p.store]};
}
// Prototype OTP 123456 (sent to the invited mobile in production). Opens the store's staff workspace.
export function confirmJoin(state, token, {mobile, otp, consent}) {
  const j = joinState(state, token); if (j.error) return {error: j.error};
  if (String(mobile || '').replace(/\D/g, '') !== j.p.mobile) return {error: `Enter the mobile number the invitation was sent to (ending ${j.p.mobile.slice(-4)}).`};
  if (!consent) return {error: 'Agree to share your name and mobile with the store to continue.'};
  if (!j.worker) return {error: 'This store is not set up for staff yet.'};
  const otpErr = IDV.checkPhoneOtp(state, mobile, otp); if (otpErr) return {error: otpErr};
  if (!(state.workspaces ||= []).includes(j.worker)) state.workspaces.push(j.worker);
  (state.activePicker ||= {})[j.worker] = j.p.id; j.p.linkOpenedAt = new Date().toISOString(); j.p.mobileVerified = true;
  return {ok: true, worker: j.worker, picker: j.p};
}
export function joinScreen(state, token, error = '') {
  const j = joinState(state, token);
  if (j.error) return `<section class="panel form-panel narrow"><h1>Store staff invitation</h1><div class="info-banner warning"><b>Can't open this invitation</b><span>${esc(j.error)}</span></div></section>`;
  const done = j.p.status !== 'invited';
  return `<section class="panel form-panel narrow pick-join"><p class="muted">MoveAI · Store staff invitation</p><h1>${esc(j.store?.name || 'Store')} invited you</h1>
   <p><b>${esc(j.p.name)}</b> · ${esc(j.p.role === 'fulfilment' ? 'Order preparation (fulfilment)' : 'Picker')} · ${esc((state.sellerBranches?.[j.p.store] || [])[0]?.name?.split(' · ').pop() || 'Main branch')}</p>
   <ol class="pick-join-steps"><li>Confirm your mobile with an OTP</li><li>Accept the invitation</li><li>Verify your ID (Aadhaar), take a selfie and add bank/UPI for pay</li><li>The owner checks your details — then you can take orders</li></ol>
   ${done ? `<div class="info-banner"><b>Already accepted</b><span>Continue in the staff app.</span></div><button class="button primary" data-pick-continue="${esc(token)}">Open staff app</button>` : `<form class="form-grid" data-pick-join="${esc(token)}" novalidate><label><span>Mobile number</span><input name="mobile" inputmode="numeric" maxlength="10" placeholder="Ending ${esc(j.p.mobile.slice(-4))}"></label>${IDV.phoneOtpBlock({keyFrom: 'mobile', label: 'OTP'})}<label class="consent-row"><input type="checkbox" name="consent"><span>Share my name and mobile with ${esc(j.store?.name || 'the store')} so they can add me as staff.</span></label><p class="mock-hint"><b>Prototype</b><span>Use the invited mobile, tap Send OTP, then enter 123456.</span></p><p class="field-error pick-join-error" ${error ? '' : 'hidden'}>${esc(error)}</p><button class="button primary">Confirm and continue</button></form>`}</section>`;
}
