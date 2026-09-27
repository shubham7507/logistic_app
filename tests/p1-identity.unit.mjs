import assert from 'node:assert/strict';
import {normalizeMobile,validateMobile,maskMobile,isKnownMobile,otpStatus,canResend,OTP_VALID_MS,RESEND_WAIT_MS} from '../js/identity.js';
import {SEED} from '../js/mock-data.js';
import {canOpen} from '../js/permissions.js';

assert.equal(normalizeMobile('+91 98765-43210'),'9876543210');
assert.equal(validateMobile('9876543210'),true);
assert.equal(validateMobile('1234567890'),false);
assert.equal(validateMobile('98765'),false);
assert.equal(maskMobile('9876543210'),'+91 ••••••3210');
assert.equal(isKnownMobile('9876543210',SEED.knownIdentities),true);
assert.equal(isKnownMobile('9123456789',SEED.knownIdentities),false);

const sentAt=1_000_000;
assert.equal(otpStatus({entered:'123456',sentAt,now:sentAt+1000,attempts:0}),'valid');
assert.equal(otpStatus({entered:'000000',sentAt,now:sentAt+1000,attempts:0}),'invalid');
assert.equal(otpStatus({entered:'123456',sentAt,now:sentAt+OTP_VALID_MS+1,attempts:0}),'expired');
assert.equal(otpStatus({entered:'123456',sentAt,now:sentAt+1000,attempts:5}),'locked');
assert.equal(canResend(sentAt,sentAt+RESEND_WAIT_MS-1),false);
assert.equal(canResend(sentAt,sentAt+RESEND_WAIT_MS),true);

assert.equal(canOpen('personal','home','signed-out'),false);
assert.equal(canOpen('personal','signup','signed-out'),true);
assert.equal(canOpen('personal','invitations','authenticated'),true);
assert.equal(canOpen('goods','invitations','authenticated'),false);

assert.equal(SEED.workspaces.filter(x=>x==='personal').length,1);
assert.equal(SEED.invitations.filter(x=>x.status==='pending').length,2);
console.log(JSON.stringify({status:'PASS',mobileValidation:true,otpExpiry:true,otpAttemptLimit:true,duplicateIdentity:true,publicRouteGuard:true,personalWorkspaceSingleton:true,invitations:SEED.invitations.length},null,2));
