// MoveAI One — one "Verify my ID" step used by every joining flow (workers, store pickers, logistics
// staff, delivery partners, sellers without GST, in-person joining, store staff My ID).
//
// Flow: consent (never pre-ticked) → Aadhaar number or 16-digit VID → Send OTP → enter OTP → verified.
// The result is saved once per person (keyed by mobile), so a person who verified in one role sees
// "Already verified ✓" everywhere else. Production: swap sendOtp/verify for a licensed KUA / DigiLocker
// partner; nothing else changes.
//
// Prototype test data (shown in the UI): OTP 123456. Aadhaar ending 0000 → DigiLocker not responding,
// 9999 → no mobile linked, 2222 → name does not match, 1717 → under 18.
import {clock} from './pay.js';

export const OTP_VALID_MS = 5 * 60 * 1000;
export const RESEND_AFTER_MS = 30 * 1000;
export const MAX_RESENDS = 3;
export const MAX_WRONG = 3;
export const LOCK_MS = 30 * 60 * 1000;
export const TEST_HINT = 'Prototype test data: any 12 digits starting 2–9 (or a 16-digit VID), OTP 123456. Ends 0000 → DigiLocker not responding · 9999 → no mobile linked · 2222 → name mismatch · 1717 → under 18.';

// One status list for every check (ID, licence, PAN, GST, bank, selfie, police, vehicle).
export const STATUS = {
  not_started: {label: 'Not started', tone: ''},
  waiting: {label: 'Waiting for you', tone: 'warning'},
  in_review: {label: 'In review', tone: 'info'},
  verified: {label: 'Verified', tone: 'success'},
  needs_correction: {label: 'Needs correction', tone: 'warning'},
  expired: {label: 'Expired', tone: 'warning'},
};
// Maps the many older status words used across modules onto the six shared ones.
export function normStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s || ['to_do', 'todo', 'not_started', 'none', 'missing'].includes(s)) return 'not_started';
  if (['verified', 'approved', 'demo_verified', 'demo_checked', 'complete', 'completed', 'active', 'cleared', 'not_applicable'].includes(s)) return 'verified';
  if (['in_review', 'under_review', 'manual_pending', 'manual_review', 'submitted', 'pending_review', 'platform_pending', 'review'].includes(s)) return 'in_review';
  if (['needs_correction', 'correction_required', 'rejected', 'failed', 'needs_upload', 'mismatch'].includes(s)) return 'needs_correction';
  if (['expired', 'lapsed'].includes(s)) return 'expired';
  return 'waiting';
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const statusChip = raw => { const k = normStatus(raw); return `<span class="status-pill idv-status ${STATUS[k].tone}" data-status="${k}">${STATUS[k].label}</span>`; };

// ---------- keys and records ----------
export const keyOf = v => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : String(v || '').trim(); };
const book = s => (s.identityChecks ||= {});
const entry = (s, key) => { const k = keyOf(key); if (!k) return null; return (book(s)[k] ||= {history: []}); };
export const recordOf = (s, key) => { const k = keyOf(key); return k ? s.identityChecks?.[k]?.record || null : null; };
export const isVerified = (s, key) => recordOf(s, key)?.status === 'verified';
export const challengeOf = (s, key) => { const k = keyOf(key); return k ? s.identityChecks?.[k]?.challenge || null : null; };
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const maskMobile = key => /^\d{10}$/.test(keyOf(key)) ? `+91 ••••••${keyOf(key).slice(-4)}` : 'your Aadhaar-linked mobile';

export function parseId(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (/^[2-9]\d{11}$/.test(d)) return {ok: true, kind: 'Aadhaar', digits: d, last4: d.slice(-4)};
  if (/^\d{16}$/.test(d)) return {ok: true, kind: 'VID', digits: d, last4: d.slice(-4)};
  return {ok: false, reason: 'Enter your 12-digit Aadhaar number (starts with 2–9) or 16-digit Virtual ID.'};
}
const locked = (e, now) => e?.lockedUntil && e.lockedUntil > now;
const lockText = e => `Too many wrong OTPs. Try again after ${new Date(e.lockedUntil).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'})}, or upload your ID for review.`;

// Step 1 — Send OTP (also used for Resend).
export function sendOtp(s, key, {aadhaar, consent} = {}) {
  const now = clock(), e = entry(s, key);
  if (!e) return {ok: false, reason: 'Add your mobile number first.'};
  if (!(consent === true || consent === '1' || consent === 'on')) return {ok: false, reason: 'Tick the consent box first.'};
  const id = parseId(aadhaar); if (!id.ok) return id;
  if (locked(e, now)) return {ok: false, fallback: true, reason: lockText(e)};
  if (e.lockedUntil && e.lockedUntil <= now) { delete e.lockedUntil; e.sends = 0; }
  if (id.last4 === '0000') return {ok: false, fallback: true, reason: 'DigiLocker is not responding right now. Try again later or upload your ID for review.'};
  if (id.last4 === '9999') return {ok: false, fallback: true, reason: 'No mobile number is linked to this Aadhaar, so no OTP can be sent. Link it at an Aadhaar centre, or upload your ID for review.'};
  const c = e.challenge;
  if (c && c.last4 === id.last4) {
    const wait = Math.ceil((c.at + RESEND_AFTER_MS - now) / 1000);
    if (wait > 0) return {ok: false, reason: `Wait ${wait} seconds before asking for a new OTP.`};
    if ((c.resends || 0) >= MAX_RESENDS) return {ok: false, fallback: true, reason: 'You have asked for the OTP 4 times. Try again later or upload your ID for review.'};
  }
  const resends = c && c.last4 === id.last4 ? (c.resends || 0) + 1 : 0;
  e.challenge = {last4: id.last4, kind: id.kind, at: now, resends, wrong: c && c.last4 === id.last4 ? c.wrong || 0 : 0};
  return {ok: true, message: `OTP sent to ${maskMobile(key)}. It is valid for 5 minutes.`};
}

// Resend for the Aadhaar already entered (hosts that do not keep the full number on screen).
export function resendOtp(s, key) {
  const now = clock(), e = s.identityChecks?.[keyOf(key)], c = e?.challenge;
  if (!c) return {ok: false, reason: 'Enter your Aadhaar number and tap Send OTP.'};
  if (locked(e, now)) return {ok: false, fallback: true, reason: lockText(e)};
  const wait = Math.ceil((c.at + RESEND_AFTER_MS - now) / 1000);
  if (wait > 0) return {ok: false, reason: `Wait ${wait} seconds before asking for a new OTP.`};
  if ((c.resends || 0) >= MAX_RESENDS) return {ok: false, fallback: true, reason: 'You have asked for the OTP 4 times. Try again later or upload your ID for review.'};
  Object.assign(c, {at: now, resends: (c.resends || 0) + 1});
  return {ok: true, message: `New OTP sent to ${maskMobile(key)}. It is valid for 5 minutes.`};
}
export const clearChallenge = (s, key) => { const e = s.identityChecks?.[keyOf(key)]; if (e) delete e.challenge; };

// Step 2 — check the OTP. Same result shape as verify-sim aadhaarEkyc: {ok, data} or {ok:false, reason, fallback}.
export function verify(s, key, input = {}, {name = '', purpose = ''} = {}) {
  const now = clock(), e = entry(s, key);
  if (!e) return {ok: false, reason: 'Add your mobile number first.'};
  if ((input.idReuse === '1' || input.idReuse === true) && e.record?.status === 'verified') {
    const r = e.record; (r.usedFor ||= []).includes(purpose) || !purpose || r.usedFor.push(purpose);
    return {ok: true, reused: true, data: {masked: r.masked, address: r.address, source: r.source, last4: r.last4}};
  }
  if (!(input.consent === true || input.consent === '1' || input.consent === 'on')) return {ok: false, reason: 'Tick the consent box first.'};
  const id = parseId(input.aadhaar); if (!id.ok) return id;
  // Same person, same Aadhaar, already verified (e.g. the form was resubmitted after fixing another field).
  if (e.record?.status === 'verified' && e.record.last4 === id.last4 && !e.challenge) return {ok: true, reused: true, data: {masked: e.record.masked, address: e.record.address, source: e.record.source, last4: e.record.last4}};
  if (locked(e, now)) return {ok: false, fallback: true, reason: lockText(e)};
  const c = e.challenge;
  if (!c || c.last4 !== id.last4) return {ok: false, reason: 'Tap Send OTP first.'};
  if (now - c.at > OTP_VALID_MS) return {ok: false, reason: 'This OTP has expired. Tap Resend OTP.'};
  if (String(input.otp || '').trim() !== '123456') {
    c.wrong = (c.wrong || 0) + 1;
    if (c.wrong >= MAX_WRONG) { e.lockedUntil = now + LOCK_MS; delete e.challenge; e.history.unshift({at: stamp(), event: 'Locked after 3 wrong OTPs'}); return {ok: false, fallback: true, reason: lockText(e)}; }
    return {ok: false, reason: `OTP is incorrect. ${MAX_WRONG - c.wrong} ${MAX_WRONG - c.wrong === 1 ? 'try' : 'tries'} left.`};
  }
  if (id.last4 === '1717') { delete e.challenge; return {ok: false, reason: 'Aadhaar shows you are under 18. You must be 18 or older to work.'}; }
  if (id.last4 === '2222') { delete e.challenge; e.record = {status: 'needs_correction', last4: id.last4, reason: 'Name on Aadhaar does not match the name you gave.', at: stamp()}; return {ok: false, fallback: true, reason: 'The name on your Aadhaar does not match the name you gave. Correct your name, or upload your ID for review.'}; }
  delete e.challenge;
  e.record = {status: 'verified', method: 'Aadhaar OTP', kind: id.kind, source: 'DigiLocker', last4: id.last4, masked: `XXXX XXXX ${id.last4}`, address: 'Address fetched from Aadhaar', name: String(name || '').trim(), at: stamp(), usedFor: purpose ? [purpose] : []};
  e.history.unshift({at: stamp(), event: `Verified by Aadhaar OTP${purpose ? ` · ${purpose}` : ''}`});
  return {ok: true, data: {masked: e.record.masked, address: e.record.address, source: 'DigiLocker', last4: id.last4}};
}

// A host's own manual path (document upload, QR, offline XML) records here too, for the one admin queue.
export function markInReview(s, key, {last4 = '', method = 'Document upload', name = '', purpose = ''} = {}) {
  const e = entry(s, key); if (!e || e.record?.status === 'verified') return;
  e.record = {status: 'in_review', method, last4: String(last4 || '').slice(-4), masked: last4 ? `XXXX XXXX ${String(last4).slice(-4)}` : '', name, purpose, at: stamp()};
  e.history.unshift({at: stamp(), event: `${method} sent for review${purpose ? ` · ${purpose}` : ''}`});
}
export function markVerified(s, key, {last4 = '', method = 'Reviewed', name = '', purpose = '', source = 'Manual review'} = {}) {
  const e = entry(s, key); if (!e) return;
  const prev = e.record || {}; last4 = last4 || prev.last4 || ''; e.record = {status: 'verified', method, source, last4: String(last4).slice(-4), masked: last4 ? `XXXX XXXX ${String(last4).slice(-4)}` : 'on file', name, at: stamp(), usedFor: purpose ? [purpose] : []};
  e.history.unshift({at: stamp(), event: `${method} · verified${purpose ? ` · ${purpose}` : ''}`});
}
export function review(s, key, decision, reason = '') {
  const e = s.identityChecks?.[keyOf(key)]; if (!e?.record || e.record.status !== 'in_review') return 'Nothing is waiting for review.';
  if (decision === 'approve') { e.record.status = 'verified'; e.record.source = 'Manual review'; e.history.unshift({at: stamp(), event: 'Approved by MoveAI review'}); return ''; }
  if (!String(reason).trim()) return 'Say what needs correcting.';
  e.record.status = 'needs_correction'; e.record.reason = String(reason).trim(); e.history.unshift({at: stamp(), event: `Needs correction: ${e.record.reason}`});
  return '';
}

// ---------- mobile-number OTP (proves the phone belongs to the person; used by in-person joining) ----------
export function sendPhoneOtp(s, mobile) {
  const m = keyOf(mobile), now = clock();
  if (!/^[6-9]\d{9}$/.test(m)) return {ok: false, reason: 'Enter a valid 10-digit mobile number first.'};
  const o = (s.phoneOtps ||= {})[m];
  if (o?.lockedUntil > now) return {ok: false, reason: 'Too many wrong OTPs for this number. Try again in 30 minutes.'};
  if (o && now - o.at < RESEND_AFTER_MS) return {ok: false, reason: `Wait ${Math.ceil((o.at + RESEND_AFTER_MS - now) / 1000)} seconds before asking for a new OTP.`};
  if (o && (o.resends || 0) >= MAX_RESENDS && !(o.lockedUntil <= now)) return {ok: false, reason: 'OTP asked 4 times. Try again later.'};
  s.phoneOtps[m] = {at: now, resends: o && !o.lockedUntil ? (o.resends || 0) + 1 : 0, wrong: 0};
  return {ok: true, message: `OTP sent to +91 ••••••${m.slice(-4)}. Valid for 5 minutes.`};
}
export function checkPhoneOtp(s, mobile, otp) {
  const m = keyOf(mobile), o = s.phoneOtps?.[m], now = clock();
  if (!o || o.used) return 'Tap Send OTP first.';
  if (o.lockedUntil > now) return 'Too many wrong OTPs for this number. Try again in 30 minutes.';
  if (now - o.at > OTP_VALID_MS) return 'This OTP has expired. Tap Resend OTP.';
  if (String(otp || '').trim() !== '123456') { o.wrong = (o.wrong || 0) + 1; if (o.wrong >= MAX_WRONG) { o.lockedUntil = now + LOCK_MS; return 'Too many wrong OTPs for this number. Try again in 30 minutes.'; } return `OTP is incorrect. ${MAX_WRONG - o.wrong} ${MAX_WRONG - o.wrong === 1 ? 'try' : 'tries'} left.`; }
  o.used = true; return '';
}
export const phoneOtpBlock = ({keyFrom = 'mobile', label = 'OTP sent to that mobile'} = {}) => `<div class="idv-phone" data-idv-phone data-idv-key-from="${esc(keyFrom)}"><button type="button" class="button secondary" data-idv-phone-send>Send OTP</button><p class="idv-msg muted" data-idv-msg role="status" aria-live="polite" hidden></p><label><span>${esc(label)}</span><input name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 digits"></label><p class="mock-hint">Prototype OTP: 123456</p></div>`;

// ---------- UI ----------
// Renders inside the host's <form>; keeps the field names aadhaar / otp / consent so host submit code is unchanged.
// opts.key = the person's mobile; opts.keyFrom = name of a form field that holds the mobile (in-person joining).
export function idBlock(s, {key = '', keyFrom = '', assisted = false, title = ''} = {}) {
  const rec = key ? recordOf(s, key) : null, ch = key ? challengeOf(s, key) : null, e = key ? s.identityChecks?.[keyOf(key)] : null;
  const attrs = `data-idv data-idv-key="${esc(keyOf(key))}"${keyFrom ? ` data-idv-key-from="${esc(keyFrom)}"` : ''}`;
  const head = title ? `<h3 class="idv-title">${esc(title)}</h3>` : '';
  if (rec?.status === 'verified' && !s.idvRedo?.[keyOf(key)]) return `<div class="idv wide" ${attrs}>${head}<div class="idv-done"><b>✓ Already verified</b><span>Aadhaar ${esc(rec.masked)} · ${esc(rec.method)} via ${esc(rec.source)} · ${esc(rec.at)}. No need to do it again.</span><input type="hidden" name="idReuse" value="1"><button type="button" class="button text compact" data-idv="redo">Use a different Aadhaar</button></div></div>`;
  const live = ch && clock() - ch.at <= OTP_VALID_MS;
  const lockedNow = e && locked(e, clock());
  const msg = lockedNow ? lockText(e) : live ? `OTP sent to ${maskMobile(key)} for Aadhaar ending ${ch.last4}. Valid for 5 minutes.` : rec?.status === 'needs_correction' ? rec.reason : rec?.status === 'in_review' ? 'Your ID is with our review team. You can still verify instantly with OTP.' : '';
  return `<div class="idv wide" ${attrs}>${head}
  <label class="consent-row"><input type="checkbox" name="consent" value="1"> ${assisted ? 'I confirm the worker is here with me and agrees that MoveAI may check their Aadhaar. They read the OTP from their own phone.' : 'I allow MoveAI to check my Aadhaar through DigiLocker for verification only. Only the last 4 digits are stored.'}</label>
  <div class="idv-row"><label><span>Aadhaar number or 16-digit VID</span><input name="aadhaar" inputmode="numeric" maxlength="19" autocomplete="off" placeholder="12-digit Aadhaar"></label><button type="button" class="button secondary" data-idv="send">${live ? 'Resend OTP' : 'Send OTP'}</button></div>
  <p class="idv-msg ${lockedNow || rec?.status === 'needs_correction' ? 'field-error' : 'muted'}" data-idv-msg role="status" aria-live="polite" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
  <label class="idv-otp"><span>${assisted ? 'OTP (the worker reads it from their SMS)' : 'OTP from SMS'}</span><input name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 digits"></label>
  <p class="mock-hint">${esc(TEST_HINT)}</p></div>`;
}

// One binder for every page: Send / Resend OTP and "use a different Aadhaar".
export function bind(root, api) {
  root.querySelectorAll('[data-idv]').forEach(box => {
    const msgEl = box.querySelector('[data-idv-msg]');
    const show = (text, bad) => { if (!msgEl) return api.toast?.(text); msgEl.textContent = text; msgEl.hidden = !text; msgEl.classList.toggle('field-error', !!bad); msgEl.classList.toggle('muted', !bad); };
    const keyNow = () => { const from = box.dataset.idvKeyFrom; const f = from && box.closest('form')?.querySelector(`[name="${from}"]`); return f ? f.value : box.dataset.idvKey; };
    box.querySelector('[data-idv="send"]')?.addEventListener('click', ev => {
      const s = api.getState(), key = keyNow();
      if (!keyOf(key)) return show('Enter the mobile number first.', true);
      const r = sendOtp(s, key, {aadhaar: box.querySelector('[name="aadhaar"]')?.value, consent: box.querySelector('[name="consent"]')?.checked});
      api.save?.();
      if (!r.ok) { show(r.reason + (r.fallback ? ' ' : ''), true); return; }
      show(r.message, false); ev.currentTarget.textContent = 'Resend OTP';
      box.querySelector('[name="otp"]')?.focus?.();
    });
    box.querySelector('[data-idv="redo"]')?.addEventListener('click', () => { const s = api.getState(); (s.idvRedo ||= {})[keyOf(keyNow())] = true; api.save?.(); api.render?.(); });
  });
  root.querySelectorAll('[data-idv-phone]').forEach(box => box.querySelector('[data-idv-phone-send]')?.addEventListener('click', ev => {
    const msgEl = box.querySelector('[data-idv-msg]'), f = box.closest('form')?.querySelector(`[name="${box.dataset.idvKeyFrom}"]`);
    const r = sendPhoneOtp(api.getState(), f?.value); api.save?.();
    msgEl.hidden = false; msgEl.textContent = r.ok ? r.message : r.reason; msgEl.classList.toggle('field-error', !r.ok); msgEl.classList.toggle('muted', r.ok);
    if (r.ok) { ev.currentTarget.textContent = 'Resend OTP'; box.querySelector('[name="otp"]')?.focus?.(); }
  }));
  root.querySelectorAll('[data-idv-review]').forEach(b => b.addEventListener('click', () => {
    const s = api.getState(), [key, decision] = b.dataset.idvReview.split('|');
    const reason = decision === 'approve' ? '' : (b.closest('[data-idv-item]')?.querySelector('[name="reason"]')?.value || '');
    const err = review(s, key, decision, reason); if (err) return api.toast?.(err);
    api.save?.(); api.render?.(); api.toast?.(decision === 'approve' ? 'ID approved' : 'Sent back for correction');
  }));
}
// After a successful host submit, clear the "use a different Aadhaar" flag.
export const doneRedo = (s, key) => { if (s.idvRedo) delete s.idvRedo[keyOf(key)]; };

// Admin: one queue for every ID that is not instantly verified.
export function idChecksScreen(s) {
  const rows = Object.entries(s.identityChecks || {}).filter(([, e]) => e.record);
  const waiting = rows.filter(([, e]) => e.record.status === 'in_review'), rest = rows.filter(([, e]) => e.record.status !== 'in_review');
  const item = ([k, e]) => `<div class="document-row" data-idv-item="${esc(k)}"><span class="document-icon">${e.record.status === 'verified' ? '✓' : '○'}</span><span class="document-copy"><b>${esc(e.record.name || 'Person')} · +91 ••••••${esc(k.slice(-4))}</b><small>${esc([e.record.masked && `Aadhaar ${e.record.masked}`, e.record.method, e.record.purpose || (e.record.usedFor || []).join(', '), e.record.at].filter(Boolean).join(' · '))}${e.record.reason ? ` · ${esc(e.record.reason)}` : ''}</small></span>${statusChip(e.record.status)}${e.record.status === 'in_review' ? `<input name="reason" class="text-field compact" placeholder="What to correct"><button class="button primary compact" data-idv-review="${esc(k)}|approve">Approve</button><button class="button secondary compact" data-idv-review="${esc(k)}|correct">Needs correction</button>` : ''}</div>`;
  return `<section class="page-header"><div><h1>ID checks</h1><p>Every Aadhaar check across workers, pickers, staff, delivery partners and sellers. Instant OTP checks verify themselves; uploads wait here.</p></div></section>
  <section class="panel"><h2>Waiting for review (${waiting.length})</h2>${waiting.length ? `<div class="document-list">${waiting.map(item).join('')}</div>` : '<p class="muted">Nothing waiting.</p>'}</section>
  <section class="panel"><h2>All ID records (${rest.length})</h2>${rest.length ? `<div class="document-list">${rest.map(item).join('')}</div>` : '<p class="muted">No ID checks yet.</p>'}</section>`;
}
