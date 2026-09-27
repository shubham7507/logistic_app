import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {businessStartScreen,businessDetailsScreen,businessKycScreen,branchesScreen,bankScreen,applicationStatusScreen,businessDashboardScreen,serviceExpansionScreen,adminApprovalsScreen,applicationReviewScreen} from '../js/business.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const state=clone(SEED);
const ownerScreens=[businessStartScreen(state),businessDetailsScreen(state),businessKycScreen(state),branchesScreen(state),bankScreen(state),applicationStatusScreen(state)];
for(const html of ownerScreens){assert.ok(html.length>300);assert.ok(!html.includes('undefined'));assert.ok(!html.includes('451278963214'),'full bank account must not appear outside its entry form')}

state.currentWorkspace='transporter';
for(const html of [businessDashboardScreen(state),branchesScreen(state),bankScreen(state),serviceExpansionScreen(state)]){assert.ok(html.length>250);assert.ok(!html.includes('undefined'))}
assert.ok(bankScreen(state).includes('•••• 3214'));
assert.ok(!bankScreen(state).includes('451278963214'));

state.currentWorkspace='admin';state.selectedApplicationId='APP-1988';
const queue=adminApprovalsScreen(state),review=applicationReviewScreen(state);
assert.ok(queue.includes('Aarav Freight Services'));
assert.ok(review.includes('data-decision="approved"'));
assert.ok(review.includes('data-decision="correction_required"'));
assert.ok(review.includes('data-decision="rejected"'));
assert.ok(!review.includes('451278963214'));
console.log(JSON.stringify({status:'PASS',ownerScreens:6,businessScreens:4,adminScreens:2,bankMasked:true,decisionActions:3},null,2));
