import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {peopleScreen,addStaffScreen,staffDetailScreen,staffInviteScreen,staffOtpScreen,staffOnboardingScreen,staffSubmissionScreen,staffReviewScreen,staffSelfProfileScreen,rolesScreen,staffAccessScreen,hiringScreen,postOpeningScreen,findWorkersScreen,openingDetailScreen,applicationsScreen,candidateProfileScreen,candidateWorkScreen,ownerCoverScreen,offboardingScreen} from '../js/people.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const state=clone(SEED);state.currentWorkspace='transporter';state.selectedStaffId='STAFF-001';state.selectedOpeningId='JOB-301';state.selectedCandidateId='CAND-001';
const businessScreens=[peopleScreen(state),addStaffScreen(state),staffDetailScreen(state),staffOnboardingScreen(state),rolesScreen(state),staffAccessScreen(state),hiringScreen(state),postOpeningScreen(state),findWorkersScreen(state),openingDetailScreen(state),applicationsScreen(state),ownerCoverScreen(state),offboardingScreen(state)];
for(const html of businessScreens){assert.ok(html.length>200);assert.ok(!html.includes('undefined'))}
assert.ok(staffDetailScreen(state).includes('+91 ••••••1101'));
assert.ok(!staffDetailScreen(state).includes('9876501101'));
assert.ok(staffOnboardingScreen(state).includes('You enter your own private information'));
assert.ok(rolesScreen(state).includes('Owner-only actions cannot be delegated'));
assert.ok(offboardingScreen(state).includes('history and dues remain'));

state.staffSession={inviteId:'SINV-501',ownerWorkspace:'transporter',mobile:'9876501199',verified:false};
state.currentWorkspace='staff';state.selectedStaffId='STAFF-001';
for(const html of [staffInviteScreen(state),staffOtpScreen(state),staffOnboardingScreen(state),staffSubmissionScreen(state),staffReviewScreen({...state,currentWorkspace:'transporter'}),staffSelfProfileScreen(state)]){assert.ok(html.length>200);assert.ok(!html.includes('undefined'))}
assert.ok(staffInviteScreen(state).includes('Send OTP'));
assert.ok(staffOtpScreen(state).includes('123456'));
assert.ok(staffReviewScreen({...state,currentWorkspace:'transporter'}).includes('Approve and activate'));

state.currentWorkspace='commercialDriver';state.selectedCandidateId='CAND-001';
for(const html of [candidateProfileScreen(state),candidateWorkScreen(state),openingDetailScreen(state,true)]){assert.ok(html.length>200);assert.ok(!html.includes('undefined'))}
assert.ok(openingDetailScreen(state,true).includes('Apply with profile'),'Reset state must expose Apply for the seeded Commercial Driver');
assert.ok(candidateWorkScreen(state).includes('Matching jobs (1)'));
assert.ok(hiringScreen({...state,currentWorkspace:'transporter'}).includes('Open Commercial Driver profile'));
console.log(JSON.stringify({status:'PASS',businessPeopleScreens:14,staffLifecycleScreens:6,workerScreens:3,driverApplyPath:true,mobileMasked:true,ownerOnlyVisible:true,offboardingHistory:true},null,2));
