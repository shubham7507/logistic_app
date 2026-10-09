import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as PC from '../js/people-core.js';
import * as HR from '../js/store-hr.js';
import * as Easy from '../js/easy-mode.js';
import * as Pay from '../js/payroll-core.js';
import * as StaffPay from '../js/staff-pay.js';
import * as Branches from '../js/seller-branches.js';
import * as Commerce from '../js/commerce.js';
import * as Workforce from '../js/grocery-workforce.js';
import {canOpen} from '../js/permissions.js';

const s=structuredClone(SEED);HR.people(s,'grocery');PC.ensureCore(s);Pay.ensurePayrollCore(s);
const pooja=s.pickerStaff.find(p=>p.store==='fashion'&&p.name.startsWith('Pooja'));
assert.ok(pooja,'Fashion staff mock persona exists');
const emp=s.employments.find(e=>e.source.id===pooja.id&&e.business==='fashion');
assert.ok(emp);
assert.match(Easy.screen(s,'easyStaff','fashion'),/Add worker/);
assert.match(Easy.screen(s,'easyStaff','fashion'),/Pay workers/);
assert.match(Easy.screen(s,'easyStaff','fashionManager'),/Ask the owner/);
assert.ok(canOpen('fashion','staffPay')&&canOpen('fashionManager','staffPay')&&!canOpen('pickerFashion','staffPay'));
assert.ok(canOpen('fashionManager','myHR'));
assert.match(StaffPay.screen(s,'staffPay','fashion'),/Pooja/);
assert.doesNotMatch(Pay.payPersonScreen(s,emp.personId,'fashion','manager'),/data-payroll-action/);
assert.match(Easy.giveAdvance(s,'fashionManager',{e:emp},500,100),/Only the owner/);

// Store Team's branch toggle and People & pay operate on the same employment record.
assert.equal(Branches.assignStaffBranch(s,'fashion',pooja.id,'fashion-B2',true),'');
assert.ok(emp.cover.includes('fashion-B2'));
assert.ok(s.staffHR?.[pooja.id]?.cover.includes('fashion-B2') || !s.staffHR?.[pooja.id]);
assert.equal(Branches.assignStaffBranch(s,'fashion',pooja.id,'fashion-B1',false).includes('Transfer the home'),true);
assert.equal(HR.setBranches(s,'fashion',pooja.id,'fashion-B2',['fashion-B1'],'New home'), '');
assert.equal(emp.homeBranch,'fashion-B2');
assert.equal(pooja.branchIds[0],'fashion-B2');

// No temporary team can recruit someone employed by another seller.
const team={id:'TEAM-FASHION-TEMP',business:'fashion',branchId:'fashion-B2',kind:'temporary',members:[],until:'2099-01-01',name:'Evening'};s.teams.push(team);
const grocer=s.employments.find(e=>e.business==='grocery'&&e.status==='active');assert.ok(grocer);
assert.match(PC.teamMember(s,'fashion',team.id,grocer.id,'add'),/another business/);
assert.equal(team.members.length,0);

// One ledger: a cash handover stays due until the worker acknowledges it.
const before=Pay.balance(s,emp.personId);
HR.post(s,{store:'fashion',personId:pooja.id,branchId:'fashion-B2',type:'earning',amount:1500,note:'October work',status:'posted'});Pay.ensurePayrollCore(s);
const due=Pay.balance(s,emp.personId);assert.equal(due,before+1500);
assert.equal(Pay.payNow(s,'fashion',emp.personId,500,'cash',''),'');
const cash=s.payEvents.findLast(e=>e.personId===emp.personId&&e.method==='cash'&&e.source==='manual');
assert.equal(cash.status,'pending_ack');assert.equal(Pay.balance(s,emp.personId),due);
assert.match(Pay.payPersonScreen(s,emp.personId,'fashion','worker'),/Confirm cash pay/);
assert.equal(Pay.confirmCashPayment(s,cash.id,emp.personId,true),'');
assert.equal(Pay.balance(s,emp.personId),due-500);
assert.equal(Pay.confirmCashPayment(s,cash.id,emp.personId,true).includes('No pending'),true);
assert.match(Pay.payNow(s,'fashion',emp.personId,due,'cash',''),/Balance due is only/);
assert.equal(Workforce.planPickerOffboarding(s,'fashion',pooja.id,new Date().toISOString().slice(0,10),'Seasonal work ended'),'');
assert.match(Workforce.finalizePickerOffboarding(s,'fashion',pooja.id),/final dues/);
assert.equal(emp.status,'active');
assert.match(HR.screen(s,'myHR','pickerFashion'),/History/);
assert.match(Commerce.screen(s,'shopTeam','fashion'),/Order preparation team/);
assert.doesNotMatch(Commerce.screen(s,'shopTeam','fashion'),/data-commerce="invite-picker"/);
// Prepare monthly pay from attendance without creating a second payable on repeat.
const monthly=structuredClone(SEED);HR.people(monthly,'fashion');PC.ensureCore(monthly);
const day=new Date().toISOString().slice(0,10),period=day.slice(0,7);
assert.equal(HR.markDay(monthly,'fashion','PICK-004',day,'fashion-B1'),'');
assert.equal(HR.postEarnings(monthly,'fashion'),'');Pay.ensurePayrollCore(monthly);
const first=Pay.runMonthlyPayroll(monthly,'fashion',period);
const pLine=first.lines.find(x=>x.personId===monthly.employments.find(e=>e.source.id==='PICK-004').personId);
assert.ok(pLine.amount>0);
assert.equal(HR.postEarnings(monthly,'fashion'),'');
assert.equal(Pay.runMonthlyPayroll(monthly,'fashion',period).id,first.id);
assert.equal(Pay.runMonthlyPayroll(monthly,'fashion',period).lines.find(x=>x.personId===pLine.personId).amount,pLine.amount);
console.log('PASS staff redesign: guided navigation, seller isolation, branch sync, manager guard, cash acknowledgment, worker ledger');
