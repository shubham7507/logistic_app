// One "Verify my ID" step: every scenario from the plan (normal path, wrong OTP + lock, expiry, resend too
// fast / too often, mobile not linked, DigiLocker down, consent missing, name mismatch, under 18, VID,
// verified once → reused in another role, manual upload → admin approve / correction, mobile OTP).
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as IDV from '../js/id-verify.js';
import * as WO from '../js/worker-onboarding.js';
import * as SO from '../js/seller-onboarding.js';
import * as WX from '../js/work-extras.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}});
const M = '9876543210', A = '234567890123';
const later = ms => { globalThis.__moveaiClockOffset = (globalThis.__moveaiClockOffset || 0) + ms / 86400000; };
const resetClock = () => { globalThis.__moveaiClockOffset = 0; };

// normal path
{ resetClock(); const s = fresh();
  assert.match(IDV.verify(s, M, {aadhaar: A, otp: '123456', consent: '1'}).reason, /Send OTP first/, 'OTP needs Send first');
  const r = IDV.sendOtp(s, M, {aadhaar: A, consent: true});
  assert.ok(r.ok); assert.match(r.message, /\+91 ••••••3210/); assert.match(r.message, /5 minutes/);
  const v = IDV.verify(s, M, {aadhaar: A, otp: '123456', consent: '1'}, {name: 'Sunita', purpose: 'Work profile'});
  assert.ok(v.ok); assert.equal(v.data.masked, 'XXXX XXXX 0123');
  const rec = IDV.recordOf(s, '+91 98765 43210');
  assert.equal(rec.status, 'verified'); assert.equal(rec.last4, '0123'); assert.ok(!JSON.stringify(s.identityChecks).includes(A), 'full Aadhaar never stored');
  assert.ok(!IDV.challengeOf(s, M), 'challenge cleared'); }

// consent, bad number, VID
{ resetClock(); const s = fresh();
  assert.match(IDV.sendOtp(s, M, {aadhaar: A}).reason, /consent/);
  assert.match(IDV.sendOtp(s, M, {aadhaar: '123456789012', consent: true}).reason, /12-digit/, 'cannot start with 1');
  assert.match(IDV.sendOtp(s, M, {aadhaar: '23456', consent: true}).reason, /12-digit/);
  assert.ok(IDV.sendOtp(s, M, {aadhaar: '1234 5678 9012 3456', consent: true}).ok, '16-digit VID accepted');
  assert.equal(IDV.verify(s, M, {aadhaar: '1234567890123456', otp: '123456', consent: true}).ok, true); }

// wrong OTP x3 → locked 30 min, fallback offered; unlocks after
{ resetClock(); const s = fresh(); IDV.sendOtp(s, M, {aadhaar: A, consent: true});
  assert.match(IDV.verify(s, M, {aadhaar: A, otp: '111111', consent: true}).reason, /2 tries left/);
  assert.match(IDV.verify(s, M, {aadhaar: A, otp: '111111', consent: true}).reason, /1 try left/);
  const third = IDV.verify(s, M, {aadhaar: A, otp: '111111', consent: true});
  assert.equal(third.fallback, true); assert.match(third.reason, /Too many wrong OTPs/);
  assert.match(IDV.sendOtp(s, M, {aadhaar: A, consent: true}).reason, /Too many wrong OTPs/, 'cannot resend while locked');
  later(31 * 60 * 1000);
  assert.ok(IDV.sendOtp(s, M, {aadhaar: A, consent: true}).ok, 'unlocked after 30 minutes'); resetClock(); }

// expiry and resend rules
{ resetClock(); const s = fresh(); IDV.sendOtp(s, M, {aadhaar: A, consent: true});
  assert.match(IDV.sendOtp(s, M, {aadhaar: A, consent: true}).reason, /Wait \d+ seconds/, 'resend too fast');
  later(31 * 1000); assert.ok(IDV.sendOtp(s, M, {aadhaar: A, consent: true}).ok, 'resend 1');
  later(31 * 1000); assert.ok(IDV.resendOtp(s, M).ok, 'resend 2 (no number needed)');
  later(31 * 1000); assert.ok(IDV.sendOtp(s, M, {aadhaar: A, consent: true}).ok, 'resend 3');
  later(31 * 1000); const r = IDV.sendOtp(s, M, {aadhaar: A, consent: true}); assert.equal(r.fallback, true); assert.match(r.reason, /4 times/);
  later(6 * 60 * 1000); assert.match(IDV.verify(s, M, {aadhaar: A, otp: '123456', consent: true}).reason, /expired/); resetClock(); }

// provider branches
{ resetClock(); const s = fresh();
  const down = IDV.sendOtp(s, M, {aadhaar: '234567890000', consent: true}); assert.equal(down.fallback, true); assert.match(down.reason, /DigiLocker is not responding/);
  const nolink = IDV.sendOtp(s, M, {aadhaar: '234567899999', consent: true}); assert.equal(nolink.fallback, true); assert.match(nolink.reason, /No mobile number is linked/);
  IDV.sendOtp(s, M, {aadhaar: '234567892222', consent: true});
  const mm = IDV.verify(s, M, {aadhaar: '234567892222', otp: '123456', consent: true}); assert.equal(mm.fallback, true); assert.match(mm.reason, /name on your Aadhaar does not match/);
  assert.equal(IDV.recordOf(s, M).status, 'needs_correction');
  const s2 = fresh(); IDV.sendOtp(s2, M, {aadhaar: '234567891717', consent: true});
  const kid = IDV.verify(s2, M, {aadhaar: '234567891717', otp: '123456', consent: true}); assert.ok(!kid.ok); assert.ok(!kid.fallback, 'under 18 has no fallback'); assert.match(kid.reason, /under 18/); }

// verified once → reused in other roles (worker → seller); resubmit with same number skips OTP
{ resetClock(); const s = fresh(); s.auth = {mobile: M};
  IDV.sendOtp(s, M, {aadhaar: A, consent: true}); assert.ok(IDV.verify(s, M, {aadhaar: A, otp: '123456', consent: true}, {purpose: 'Store picker'}).ok);
  assert.ok(IDV.verify(s, M, {aadhaar: A, consent: true}).reused, 'same Aadhaar resubmitted after fixing another field');
  const html = IDV.idBlock(s, {key: M}); assert.match(html, /Already verified/); assert.match(html, /name="idReuse"/);
  const r = IDV.verify(s, M, {idReuse: '1'}, {purpose: 'Seller'}); assert.ok(r.reused); assert.deepEqual(IDV.recordOf(s, M).usedFor, ['Store picker', 'Seller']);
  // worker check uses the same record
  const c = {id: 'CAND-T', name: 'Test', mobile: M, workerType: 'helper', checks: {}}; s.candidates.push(c);
  assert.deepEqual(WO.runCheck(s, c, 'aadhaar', {idReuse: '1'}), {}); assert.equal(c.checks.aadhaar.status, 'verified');
  // "use a different Aadhaar" shows the full form again
  s.idvRedo = {[M]: true}; assert.match(IDV.idBlock(s, {key: M}), /data-idv="send"/); }

// fresh form: consent never pre-ticked, Send OTP present, test data visible
{ const html = IDV.idBlock(fresh(), {key: M});
  assert.match(html, /data-idv="send"[^>]*>Send OTP/); assert.match(html, /name="consent" value="1">/); assert.ok(!/name="consent"[^>]*checked/.test(html)); assert.match(html, /123456/); }

// seller without GST verifies through the same step
{ resetClock(); const s = fresh(); s.auth = {mobile: M}; const a = SO.startApplication(s, {});
  a.sellerType = 'individual'; a.categories = ['fresh']; a.legalName = 'Sunita Devi';
  const base = {pan: 'ABCDE1234F', nonGst: true, aadhaar: A, consent: '1', otp: '123456', account: '123456789012', ifsc: 'SBIN0001234'};
  assert.match(SO.saveKyc(s, a, base), /Send OTP first/);
  IDV.sendOtp(s, M, {aadhaar: A, consent: true}); assert.equal(SO.saveKyc(s, a, base), ''); assert.equal(a.kyc.aadhaarLast4, '0123'); }

// manual upload → one admin queue → approve / correction
{ resetClock(); const s = fresh();
  IDV.markInReview(s, M, {last4: '4321', method: 'ID upload', name: 'Ramesh', purpose: 'Work profile'});
  assert.equal(IDV.recordOf(s, M).status, 'in_review');
  assert.match(IDV.idChecksScreen(s), /Waiting for review \(1\)/);
  assert.match(IDV.review(s, M, 'correct', ''), /Say what/);
  assert.equal(IDV.review(s, M, 'correct', 'Photo is blurred'), ''); assert.equal(IDV.recordOf(s, M).status, 'needs_correction');
  IDV.markInReview(s, M, {last4: '4321'}); assert.equal(IDV.review(s, M, 'approve'), ''); assert.equal(IDV.recordOf(s, M).status, 'verified'); }

// shared status words
{ assert.equal(IDV.normStatus('manual_pending'), 'in_review'); assert.equal(IDV.normStatus('correction_required'), 'needs_correction');
  assert.equal(IDV.normStatus('demo_verified'), 'verified'); assert.equal(IDV.normStatus(''), 'not_started'); assert.equal(IDV.normStatus('expired'), 'expired');
  assert.match(IDV.statusChip('submitted'), />In review</); }

// mobile OTP (in-person joining) needs Send OTP, follows the same expiry/lock rules
{ resetClock(); const s = fresh(); s.currentWorkspace = 'transporter';
  const v = {name: 'Sunita Devi', mobile: '9876500011', otp: '123456', idType: 'voter', idLast4: 'AB12', sawOriginal: true, photo: 'p.jpg', role: 'helper'};
  assert.match(WX.joinInPerson(s, 'transporter', v).error, /Send OTP first/);
  assert.ok(IDV.sendPhoneOtp(s, '9876500011').ok);
  assert.match(IDV.sendPhoneOtp(s, '9876500011').reason, /Wait/);
  assert.ok(WX.joinInPerson(s, 'transporter', v).member, 'joined after Send OTP');
  assert.equal(IDV.recordOf(s, '9876500011').status, 'in_review', 'in-person ID check goes to the admin queue');
  assert.ok(IDV.sendPhoneOtp(s, '9876500022').ok);
  for (let i = 0; i < 3; i++) IDV.checkPhoneOtp(s, '9876500022', '000000');
  assert.match(IDV.checkPhoneOtp(s, '9876500022', '123456'), /Too many wrong/); }

resetClock();
console.log('id-verify unit: all scenarios pass');
