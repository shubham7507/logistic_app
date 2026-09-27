import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../js/config.js',import.meta.url),'utf8');
const people=fs.readFileSync(new URL('../js/people.js',import.meta.url),'utf8');
const market=fs.readFileSync(new URL('../js/marketplace.js',import.meta.url),'utf8');
const fixes=fs.readFileSync(new URL('../js/fix-screens.js',import.meta.url),'utf8');

for(const route of ['purpose','consentDetails','recoverySupport','branchEditor','applyOpening','candidateReview','employmentChange','ownVehicleAssignment','sellerSourcing','transportOffer','truckOffer']){
  assert.ok(config.includes(`${route}:{`),`route registered: ${route}`);
  assert.ok(app.includes(`route==='${route}'`),`route rendered: ${route}`);
}
for(const id of ['staff-onboarding-form','apply-opening-form','own-vehicle-form','seller-sourcing-form','transport-offer-form','branch-editor-form']){
  assert.ok(`${people}${market}${fixes}`.includes(`id="${id}"`),`form exists: ${id}`);
  assert.ok(app.includes(`#${id}`),`form handler exists: ${id}`);
}
assert.ok(app.includes('canViewOpportunity(op,state.currentWorkspace)'),'record-level opportunity guard');
assert.ok(people.includes('Account number')&&people.includes('Emergency contact'),'real staff onboarding fields');
assert.ok(market.includes('Derived from the selected requirement'),'load authority is derived');
assert.ok(market.includes('Approved vehicle'),'availability selects Fleet vehicle');
assert.ok(fixes.includes('No nearby-store selection'),'customer store selection removed');
console.log('P1-P4 fix screens: PASS');
