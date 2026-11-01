// Aadhaar through DigiLocker (consent flow) and its fallbacks, plus per-item verification.
import assert from 'node:assert/strict';
import * as SO from '../js/seller-onboarding.js';
import * as T from '../js/seller-trust.js';
import {SEED} from '../js/mock-data.js';

const iso = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const BR = {storeName: 'Patna Bazaar', branchName: 'Boring Road', address: '4 Boring Road, Patna', city: 'Patna', pincode: '800001', stateCode: '10', open: '00:00', close: '23:59', radiusKm: 5};
function app(name = 'Ravi Kumar') {
  const s = {...JSON.parse(JSON.stringify(SEED)), person: {id: 'P-DL', name}}, a = SO.startApplication(s, {});
  SO.saveType(s, a, {sellerType: 'shop', categories: ['household'], legalName: 'Ravi Kumar Traders'});
  SO.saveKyc(s, a, {pan: 'ABCDE1234F', gstin: '10ABCDE1234F1Z5', account: '123456789012', ifsc: 'SBIN0001234'});
  assert.equal(SO.saveStore(s, a, BR), ''); return {s, a};
}

// Happy path: start → Send OTP → OTP → Allow → verified card with matches; masked number only.
{
  const {s, a} = app();
  assert.match(T.dlSendOtp(s, a, '9876543210'), /Start DigiLocker/, 'must start first');
  T.dlStart(s, a); assert.match(T.dlSheetHtml(a), /Send OTP/);
  assert.match(T.dlSendOtp(s, a, '12345'), /10-digit/);
  assert.equal(T.dlSendOtp(s, a, '9876543210'), ''); assert.match(T.dlSheetHtml(a), /OTP sent to ••••••3210/);
  assert.match(T.dlVerifyOtp(s, a, '111111'), /2 attempt\(s\) left/);
  assert.equal(T.dlVerifyOtp(s, a, '123456'), ''); assert.match(T.dlSheetHtml(a), /requesting access[\s\S]*Allow[\s\S]*Deny/);
  assert.equal(T.dlConsent(s, a, true), ''); assert.equal(a.trust.dl, undefined, 'window closed');
  const it = a.trust.items.digilocker; assert.equal(it.status, 'verified'); assert.equal(it.source, 'DigiLocker');
  assert.deepEqual(it.matches, {name: true, age: true, address: true}); assert.match(it.profile.masked, /^XXXX-XXXX-\d{4}$/);
  assert.ok(!JSON.stringify(a).match(/\b\d{12}\b/), 'no full Aadhaar number stored');
  assert.match(T.trustFormHtml(s, a), /Name matches your PAN \/ bank name[\s\S]*Age 18 or over[\s\S]*Address district matches/);
}
// Edge cases: OTP expiry, too many tries, no account, consent denied, name/district mismatch, under 18.
{
  const {s, a} = app(); T.dlStart(s, a); T.dlSendOtp(s, a, '9876543210');
  assert.match(T.dlVerifyOtp(s, a, '123456', Date.now() + 11 * 60000), /expired/); assert.equal(a.trust.dl.step, 'mobile');
  T.dlSendOtp(s, a, '9876543210'); T.dlVerifyOtp(s, a, '1'); T.dlVerifyOtp(s, a, '2'); assert.match(T.dlVerifyOtp(s, a, '3'), /Too many wrong OTPs/);
  assert.match(T.dlSendOtp(s, a, '9876540000'), /No DigiLocker account/); assert.ok(a.trust.dl.noAccount);
  T.dlSendOtp(s, a, '9876543210'); T.dlVerifyOtp(s, a, '123456'); assert.match(T.dlConsent(s, a, false), /chose not to share/);
  assert.equal(a.trust.items.digilocker.status, 'consent_denied'); assert.match(T.trustFormHtml(s, a), /<details class="dl-fallback" open>/);
  const m = (mobile) => { const x = app(); T.dlStart(x.s, x.a); T.dlSendOtp(x.s, x.a, mobile); T.dlVerifyOtp(x.s, x.a, '123456'); return [T.dlConsent(x.s, x.a, true), x]; };
  let [e, x] = m('9876541111'); assert.equal(e, ''); assert.equal(x.a.trust.items.digilocker.matches.name, false);
  assert.ok(T.risk(x.s, x.a).flags.includes('Name on Aadhaar differs from PAN/bank name')); assert.equal(T.risk(x.s, x.a).level, 'high');
  assert.ok(T.requirements(x.s, x.a).includes('policeCert'), 'mismatch raises the checks');
  [e, x] = m('9876542222'); assert.equal(x.a.trust.items.digilocker.matches.address, false);
  [e, x] = m('9876543333'); assert.match(e, /under 18/); assert.equal(x.a.trust.items.digilocker.status, 'failed'); assert.match(SO.saveTrust(x.s, x.a, {}), /under 18/);
}
// Fallback C: Aadhaar secure QR or offline XML (share code, freshness, signature).
{
  const {s, a} = app();
  assert.match(T.dlOffline(s, a, {file: ''}), /Choose the Aadhaar QR/);
  assert.match(T.dlOffline(s, a, {file: 'aadhaar.pdf'}), /QR code, or the ZIP\/XML/);
  assert.match(T.dlOffline(s, a, {file: 'offline.zip', shareCode: ''}), /share code/);
  assert.match(T.dlOffline(s, a, {file: 'offline-old.zip', shareCode: '1234'}), /more than 3 days old/);
  assert.match(T.dlOffline(s, a, {file: 'edited.xml', shareCode: '1234'}), /signature/);
  assert.equal(T.dlOffline(s, a, {file: 'offline.zip', shareCode: '1234'}), ''); assert.equal(a.trust.items.digilocker.source, 'Offline Aadhaar XML');
  const b = app().a; assert.equal(T.dlOffline(app().s, b, {file: 'qr.jpg'}), ''); assert.equal(b.trust.items.digilocker.source, 'Aadhaar secure QR');
}
// Fallback D: assisted check on the video call — seller can continue; reviewer must pass it.
{
  const {s, a} = app(); assert.equal(T.dlAssisted(s, a), ''); assert.ok(T.trustDone(a, 'digilocker'));
  assert.ok(T.trustBlockers(s, a).includes('Aadhaar via DigiLocker'), 'still needs the reviewer');
  assert.equal(T.recordTrust(s, a, 'digilocker', 'verified', 'Scanned Aadhaar QR on call, face matches'), '');
  assert.ok(!T.trustBlockers(s, a).includes('Aadhaar via DigiLocker'));
}
// Per-item Verify: selfie needs Aadhaar first and a real image; photos need all three.
{
  const {s, a} = app();
  assert.match(T.trustItem(s, a, 'selfie', {selfie: 'me.jpg'}), /Verify Aadhaar first/);
  T.dlOffline(s, a, {file: 'qr.png'});
  assert.match(T.trustItem(s, a, 'selfie', {selfie: 'me.pdf'}), /JPG or PNG/);
  assert.equal(T.trustItem(s, a, 'selfie', {selfie: 'me.jpg'}), ''); assert.equal(a.trust.items.selfie.status, 'verified');
  assert.match(T.trustItem(s, a, 'shopPhotos', {photoSignboard: 'a.jpg'}), /all three/);
  assert.equal(T.trustItem(s, a, 'shopPhotos', {photoSignboard: 'a.jpg', photoInside: 'b.jpg', photoStock: 'c.jpg'}), '');
  SO.refreshTrust(s, a); assert.equal(SO.saveTrust(s, a, {}), '', 'everything verified → continue');
}
console.log(JSON.stringify({status: 'PASS', suite: 'DigiLocker: consent flow, OTP expiry/tries, no account, denied, mismatches, under 18, offline QR/XML, assisted, per-item verify'}));
