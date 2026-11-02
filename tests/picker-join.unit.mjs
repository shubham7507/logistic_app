// Store staff invite links and "checked in counts as on shift".
import assert from 'node:assert/strict';
import * as PJ from '../js/picker-join.js';
import * as G from '../js/grocery-staff.js';
import {SEED} from '../js/mock-data.js';
import * as IDV from '../js/id-verify.js';
const s = {...JSON.parse(JSON.stringify(SEED)), person: {id: 'P1', name: 'Owner'}};
assert.equal(G.invitePicker(s, 'electrical', 'Arjun Kumar', '9876512345'), '');
const p = s.pickerStaff.find(x => x.mobile === '9876512345');
assert.match(p.inviteToken, /^pk/); assert.match(s.outbox[0].text, /pickJoin\/pk/); assert.deepEqual(s.outbox[0].channels, ['SMS', 'WhatsApp']);
assert.match(PJ.confirmJoin(s, p.inviteToken, {mobile: '9000000000', otp: '123456', consent: true}).error, /ending 2345/);
assert.match(PJ.confirmJoin(s, p.inviteToken, {mobile: '9876512345', otp: '123456', consent: true}).error, /Send OTP first/, 'OTP must be sent first');
assert.ok(IDV.sendPhoneOtp(s, '9876512345').ok);
assert.match(PJ.confirmJoin(s, p.inviteToken, {mobile: '9876512345', otp: '1', consent: true}).error, /OTP is incorrect/);
assert.match(PJ.confirmJoin(s, p.inviteToken, {mobile: '9876512345', otp: '123456', consent: false}).error, /Agree/);
const r = PJ.confirmJoin(s, p.inviteToken, {mobile: '9876512345', otp: '123456', consent: true});
assert.ok(r.ok); assert.equal(r.worker, 'pickerElectrical'); assert.equal(s.activePicker.pickerElectrical, p.id); assert.ok(s.workspaces.includes('pickerElectrical'));
assert.match(PJ.joinState(s, 'nope').error, /not valid/);
p.inviteExpiresAt = Date.now() - 1; assert.match(PJ.joinState(s, p.inviteToken).error, /expired/);
// A worker checked in from My work & pay (not left) is available for orders.
p.status = 'active'; const day = new Date().toISOString().slice(0, 10), br = p.branchIds[0];
assert.ok(!G.availablePickers(s, 'electrical', new Date(), br).some(x => x.id === p.id));
(s.staffDays ||= []).push({store: 'electrical', personId: p.id, date: day, branchId: br, status: 'pending'});
assert.ok(G.availablePickers(s, 'electrical', new Date(), br).some(x => x.id === p.id));
s.staffDays.at(-1).leftAt = 'now'; assert.ok(!G.availablePickers(s, 'electrical', new Date(), br).some(x => x.id === p.id), 'left for the day');
console.log(JSON.stringify({status: 'PASS', suite: 'Picker join link: token, SMS/WhatsApp, mobile/OTP/consent, expiry; check-in counts as on shift'}));
