// MoveAI One — simulated instant checks. In production these call licensed providers:
// DigiLocker (Aadhaar, licence), Sarathi (licence), Vahan (vehicle RC), GST portal, bank penny-drop.
// Each returns {ok, data} or {ok:false, reason, fallback:true} when the person should upload manually.
// Prototype test data is deliberately visible in the UI so testers can reach every branch.

export const TEST_DATA = {
  licence: 'Any valid number works. Ends 0000 → not found (manual upload). Ends 1111 → only LMV on record. Ends 2222 → name mismatch. Ends 9999 → expired.',
  aadhaar: 'Any 12 digits starting 2–9, OTP 123456. Ends 0000 → DigiLocker unavailable (manual upload).',
  bank: 'Any account + valid IFSC. Account ending 000 → name mismatch (upload cancelled cheque).',
  gstin: 'Any valid GSTIN, e.g. 09AAACR5055K1Z5. Ending 9 → GSTIN cancelled.',
  rc: 'Any registration. Ending 0000 → not found on Vahan (enter details manually). Ending 1111 → insurance expired.',
};

const tail = (v, n) => String(v).slice(-n);
export const normaliseLicence = v => String(v || '').toUpperCase().replace(/[\s-]/g, '');
export const maskTail = (v, keep = 4) => `${'X'.repeat(Math.max(0, String(v).length - keep))}${tail(v, keep)}`.replace(/(.{4})/g, '$1 ').trim();
const age = dob => Math.floor((Date.now() - new Date(dob)) / (365.25 * 86400000));

export function licenceLookup({number, dob, name, type}) {
  const dl = normaliseLicence(number);
  if (!/^[A-Z]{2}\d{2}\d{4}\d{7}$/.test(dl)) return {ok: false, reason: 'Enter the 15-character licence number, e.g. RJ14 20220012345.'};
  if (!dob) return {ok: false, reason: 'Enter your date of birth exactly as on the licence.'};
  if (age(dob) < 18) return {ok: false, reason: 'You must be at least 18 to drive for work.'};
  if (dl.endsWith('0000')) return {ok: false, fallback: true, reason: 'Licence not found on Sarathi. Upload photos of your licence for manual review.'};
  if (dl.endsWith('9999')) return {ok: false, reason: 'Sarathi shows this licence as expired. Renew it at the RTO, then verify again.'};
  if (dl.endsWith('2222')) return {ok: false, fallback: true, reason: 'The name on the licence does not match your profile. Upload photos for manual review.'};
  const classes = dl.endsWith('1111') ? ['LMV'] : type === 'commercialDriver' ? ['LMV', 'HMV', 'TRANS'] : ['LMV'];
  if (type === 'commercialDriver' && !classes.some(c => ['HMV', 'HGMV', 'HPMV', 'MGV', 'LGV', 'TRANS'].includes(c))) return {ok: false, reason: 'Sarathi shows only LMV (car) on this licence. Commercial trucks need a transport class. Choose Personal Driver instead, or add a transport class at the RTO.'};
  return {ok: true, data: {number: dl, name, classes, expiry: '2031-03-31', issuedBy: `RTO ${dl.slice(0, 4)}`, source: 'Sarathi via DigiLocker'}};
}

export function aadhaarEkyc({aadhaar, otp, consent}) {
  const a = String(aadhaar || '').replace(/\D/g, '');
  if (!consent) return {ok: false, reason: 'Give consent to fetch your Aadhaar from DigiLocker.'};
  if (!/^[2-9]\d{11}$/.test(a)) return {ok: false, reason: 'Enter the 12-digit Aadhaar number.'};
  if (a.endsWith('0000')) return {ok: false, fallback: true, reason: 'DigiLocker is not responding. Upload your ID and address proof for manual review.'};
  if (String(otp || '').trim() !== '123456') return {ok: false, reason: 'OTP is incorrect. (Prototype OTP: 123456)'};
  return {ok: true, data: {masked: `XXXX XXXX ${tail(a, 4)}`, address: 'Address fetched from Aadhaar', source: 'DigiLocker'}};
}

export function pennyDrop({account, ifsc, name}) {
  const acc = String(account || '').replace(/\D/g, ''), code = String(ifsc || '').toUpperCase().trim();
  if (!/^\d{9,18}$/.test(acc)) return {ok: false, reason: 'Account number must be 9 to 18 digits.'};
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) return {ok: false, reason: 'Enter a valid IFSC, e.g. SBIN0001234.'};
  if (acc.endsWith('000')) return {ok: false, fallback: true, reason: 'The bank returned a different account holder name. Upload a cancelled cheque or passbook for manual review.'};
  return {ok: true, data: {masked: maskTail(acc), ifsc: code, bankName: code.slice(0, 4), holder: name, source: '₹1 penny-drop'}};
}

// A real NPCI-style "verify VPA" check, equivalent in spirit to pennyDrop() for bank accounts — not
// just a format check. Previously setPayout() marked any VPA that merely *looked* like an email as
// instantly "verified", with no check it was real or belonged to that person at all.
export function upiVerify({vpa, name}) {
  const v = String(vpa || '').trim();
  if (!/^[\w.-]+@[a-z]{2,}$/i.test(v)) return {ok: false, reason: 'Enter a valid UPI ID, e.g. name@okaxis.'};
  if (/^unknown@/i.test(v)) return {ok: false, reason: 'This UPI ID could not be found. Check it and try again, or use a bank account instead.'};
  const [handlePart] = v.split('@');
  return {ok: true, data: {masked: `${handlePart.slice(0, 2)}***@${v.split('@')[1]}`, holder: name}};
}

export function faceMatch(file, reference) {
  if (!reference) return {ok: false, reason: 'Verify your licence or Aadhaar first so we have a photo to match.'};
  if (!file?.name) return {ok: false, reason: 'Take a live selfie.'};
  if (!/\.(jpe?g|png|webp|heic)$/i.test(file.name)) return {ok: false, reason: 'Take a photo (JPG or PNG).'};
  return {ok: true, data: {score: 94, against: reference, source: 'Face match'}};
}

const STATES = {'07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '06': 'Haryana', '27': 'Maharashtra', '29': 'Karnataka', '24': 'Gujarat', '19': 'West Bengal', '33': 'Tamil Nadu'};
const ENTITY_BY_PAN = {P: 'Proprietorship', F: 'Partnership', C: 'Private Limited'};
export function gstLookup(gstin, legalName) {
  const g = String(gstin || '').toUpperCase().trim();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return {ok: false, reason: 'Enter a valid 15-character GSTIN, e.g. 09AAACR5055K1Z5.'};
  if (g.endsWith('9')) return {ok: false, reason: 'The GST portal shows this GSTIN as cancelled. Use an active GSTIN.'};
  const pan = g.slice(2, 12), state = STATES[g.slice(0, 2)] || 'India';
  return {ok: true, data: {gstin: g, pan, state, entityType: ENTITY_BY_PAN[pan[3]] || 'Private Limited', legalName, address: `Registered principal place of business, ${state} (fetched from GST)`, status: 'Active', source: 'GST portal'}};
}

export function rcLookup(registration) {
  const r = String(registration || '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(r)) return {ok: false, reason: 'Enter the registration as on the RC, e.g. BR01 GX 7744.'};
  if (r.endsWith('0000')) return {ok: false, fallback: true, reason: 'Not found on Vahan. Enter the details and upload the RC for review.'};
  const expired = r.endsWith('1111');
  return {ok: true, data: {registration: r.replace(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/, '$1$2 $3 $4').replace(/\s+/g, ' '), truckType: '14-wheel open', capacity: 16, fuel: 'Diesel', insuranceUpto: expired ? '2026-08-31' : '2027-05-31', fitnessUpto: '2027-11-30', permitUpto: '2028-03-31', pucUpto: '2027-01-15', source: 'Vahan'}};
}
