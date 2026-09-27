import assert from 'node:assert/strict';
import {SERVICE_OPTIONS,maskAccount,requiredKyc,canDisableBranch,canReceivePayout,workspaceForServices,applicationProgress,validateServices,validateBank} from '../js/business-rules.js';
import {SEED} from '../js/mock-data.js';
import {canOpen} from '../js/permissions.js';

assert.equal(SERVICE_OPTIONS.length,4);
assert.equal(validateServices('',[]),'Enter the legal business name.');
assert.equal(validateServices('Sinha Cargo',[]),'Select at least one service.');
assert.equal(validateServices('Sinha Cargo',['transport']),'');
assert.deepEqual(requiredKyc(['goods']),['PAN','Business address proof']);
assert.deepEqual(requiredKyc(['transport','movers']),['PAN','Business address proof','GST certificate','Service declaration']);
assert.equal(maskAccount('451278963214'),'•••• 3214');
assert.equal(validateBank({accountNumber:'451278963214',ifsc:'HDFC0001842'}),'');
assert.equal(validateBank({accountNumber:'123',ifsc:'BAD'}),'Enter a valid IFSC code.');
assert.equal(canReceivePayout({verificationStatus:'pending'}),false);
assert.equal(canReceivePayout({verificationStatus:'verified'}),true);
assert.equal(canDisableBranch({activeWork:2}),false);
assert.equal(canDisableBranch({activeWork:0}),true);
assert.equal(workspaceForServices(['goods']),'goods');
assert.equal(workspaceForServices(['movers','goods']),'transporter');
assert.equal(applicationProgress(SEED.businessApplications[1]),100);

assert.equal(canOpen('personal','businessStart','authenticated'),true);
assert.equal(canOpen('goods','businessStart','authenticated'),false);
assert.equal(canOpen('admin','applicationReview','authenticated'),true);
assert.equal(canOpen('personal','applicationReview','authenticated'),false);
assert.ok(SEED.businessApplications.some(x=>x.status==='under_review'));
assert.ok(SEED.businessApplications.some(x=>x.status==='correction_required'));
console.log(JSON.stringify({status:'PASS',services:4,multiServiceKyc:true,bankMasking:true,payoutGuard:true,branchGuard:true,adminBoundary:true,mockApplications:SEED.businessApplications.length},null,2));
