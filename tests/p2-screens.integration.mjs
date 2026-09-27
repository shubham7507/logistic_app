import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {businessStartScreen,businessDetailsScreen,businessKycScreen,branchesScreen,bankScreen,applicationStatusScreen,businessDashboardScreen,serviceExpansionScreen,adminApprovalsScreen,applicationReviewScreen} from '../js/business.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const state=clone(SEED);
const ownerScreens=[businessStartScreen(state),businessDetailsScreen(state),businessKycScreen(state),branchesScreen(state),bankScreen(state),applicationStatusScreen(state)];
for(const html of ownerScreens){assert.ok(html.length>300);assert.ok(!html.includes('undefined'));assert.ok(!html.includes('451278963214'),'full bank account must not appear outside its entry form')}
const readyState=clone(SEED),ready=readyState.businessApplications.find(x=>x.id==='APP-2001');
ready.services=['transport'];ready.details={entityType:'Proprietorship',pan:'ABCDE1234F',gstin:'09ABCDE1234F1Z5',address:'Sector 62, Noida'};ready.documents=[{type:'PAN',name:'pan.pdf'},{type:'Business address proof',name:'address.pdf'},{type:'GST certificate',name:'gst.pdf'}];ready.branches=[{id:'BR-X',name:'Main',activeWork:0}];ready.bank={accountNumber:'451278963214',ifsc:'HDFC0001842'};
const readyStatus=applicationStatusScreen(readyState);
assert.ok(readyStatus.includes('data-action="submit-business-application"'));
assert.ok(!readyStatus.includes('data-action="submit-business-application" disabled'),'Admin submission must remain clickable');

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
console.log(JSON.stringify({status:'PASS',ownerScreens:6,businessScreens:4,adminScreens:2,bankMasked:true,decisionActions:3,adminSubmitClickable:true},null,2));
