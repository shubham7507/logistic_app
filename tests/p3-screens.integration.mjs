import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {peopleScreen,addStaffScreen,staffDetailScreen,staffOnboardingScreen,rolesScreen,staffAccessScreen,hiringScreen,postOpeningScreen,findWorkersScreen,openingDetailScreen,applicationsScreen,candidateProfileScreen,candidateWorkScreen,ownerCoverScreen,offboardingScreen} from '../js/people.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const state=clone(SEED);state.currentWorkspace='transporter';state.selectedStaffId='STAFF-001';state.selectedOpeningId='JOB-301';state.selectedCandidateId='CAND-001';
const businessScreens=[peopleScreen(state),addStaffScreen(state),staffDetailScreen(state),staffOnboardingScreen(state),rolesScreen(state),staffAccessScreen(state),hiringScreen(state),postOpeningScreen(state),findWorkersScreen(state),openingDetailScreen(state),applicationsScreen(state),ownerCoverScreen(state),offboardingScreen(state)];
for(const html of businessScreens){assert.ok(html.length>200);assert.ok(!html.includes('undefined'))}
assert.ok(staffDetailScreen(state).includes('+91 ••••••1101'));
assert.ok(!staffDetailScreen(state).includes('9876501101'));
assert.ok(staffOnboardingScreen(state).includes('owner does not upload')||staffOnboardingScreen(state).includes('Only your own information'));
assert.ok(rolesScreen(state).includes('Owner-only actions cannot be delegated'));
assert.ok(offboardingScreen(state).includes('history and dues remain'));

state.currentWorkspace='commercialDriver';state.selectedCandidateId='CAND-001';
for(const html of [candidateProfileScreen(state),candidateWorkScreen(state),openingDetailScreen(state,true)]){assert.ok(html.length>200);assert.ok(!html.includes('undefined'))}
console.log(JSON.stringify({status:'PASS',businessPeopleScreens:13,workerScreens:3,mobileMasked:true,ownerOnlyVisible:true,offboardingHistory:true},null,2));
