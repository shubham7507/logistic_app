import assert from 'node:assert/strict';
import * as E from '../js/easy-mode.js';
import * as L from '../js/ledger-core.js';
import * as C from '../js/people-core.js';
import * as WF from '../js/workforce.js';
import * as H from '../js/store-hr.js';
import {invitePicker} from '../js/grocery-staff.js';
import {SEED} from '../js/mock-data.js';
const fresh=()=>{const s=structuredClone(SEED);H.people(s,'grocery');C.ensureCore(s);WF.ensureWorkforce(s);globalThis.__moveaiLC=L;globalThis.__moveaiInvitePicker=invitePicker;return s};
let s=fresh();
// voice / typed commands (Hindi + English)
let r=E.parse(s,'transporter','Mohan ko 500 advance diya');assert.equal(r.intent,'advance');assert.equal(r.amount,500);assert.equal(r.row.p.name,'Mohan Yadav');
r=E.parse(s,'transporter','Ramesh aaj present hai');assert.equal(r.intent,'present');
r=E.parse(s,'transporter','Mohan ko do hazaar cash diya');assert.equal(r.intent,'pay');assert.equal(r.amount,2000);assert.equal(r.method,'cash');
r=E.parse(s,'transporter','Sunita ko 1500 UPI se diya');assert.equal(r.method,'upi');
assert.match(E.parse(s,'transporter','advance diya').error,/name and the amount/);
assert.match(E.parse(s,'transporter','hello').error,/present, advance or pay/);
r=E.parse(s,'grocery','Asha aaj hazir');assert.equal(r.intent,'present');
// business-type words
assert.match(E.WORDS.transporter.allowance,/Bata/);assert.match(E.WORDS.store.allowance,/Meal/);
// actions: business present + advance (SMS to confirm cash) + cash pay; store present
const rows=L.rows(s,'transporter'),mohan=rows.find(x=>x.p.name==='Mohan Yadav');
assert.equal(E.markPresent(s,'transporter',mohan),'');assert.match(E.markPresent(s,'transporter',mohan),/Already/);
const ramesh=rows.find(x=>x.p.name==='Ramesh Yadav');assert.match(E.giveAdvance(s,'transporter',mohan,1000,200),/still has/);
assert.equal(E.giveAdvance(s,'transporter',ramesh,3000,500),'');assert.equal(s.peopleByWorkspace.transporter.find(p=>p.id==='WORKER-002').loan.balance,3000);assert.ok(s.outbox.some(m=>/paid you/.test(m.text)));
const m2=L.rows(s,'transporter').find(x=>x.p.name==='Mohan Yadav');if(m2.balance>0)assert.equal(E.pay(s,'transporter',m2,Math.min(200,m2.balance),'cash'),'');
const asha=L.rows(s,'grocery').find(x=>x.p.name==='Asha Picker');assert.equal(E.markPresent(s,'grocery',asha),'');
// add staff for a business and a store
assert.match(E.addStaff(s,'transporter',{name:'Raju',mobile:'12'}),/10-digit/);
assert.equal(E.addStaff(s,'transporter',{name:'Raju Kumar',mobile:'9811133344',role:'helper',payType:'per_trip',rate:1800,branchId:'BR-001'}),'');assert.ok(s.peopleByWorkspace.transporter.some(p=>p.mobile==='9811133344'&&p.status==='invited'));
assert.equal(E.addStaff(s,'grocery',{name:'Kiran',mobile:'9811133355',role:'picker',payType:'per_shift',rate:450,branchId:'grocery-B1'}),'');
assert.match(E.addStaff(s,'groceryManager',{name:'X',mobile:'9811133366',rate:1}),/owner/);
// screen renders with five actions; manager does not see Add/Pay
s.easyAction='balances';let h=E.screen(s,'easyStaff','transporter');assert.match(h,/Staff \(easy\)/);assert.match(h,/Send on WhatsApp/);assert.doesNotMatch(h.replace(/<[^>]+>/g,' '),/\bundefined\b|NaN/);
h=E.screen(s,'easyStaff','groceryManager');assert.doesNotMatch(h,/data-easy-act="add"/);assert.match(h,/data-easy-act="present"/);
assert.ok(E.HI['I received it']&&E.HI['Mark present']);
console.log(JSON.stringify({status:'PASS',suite:'Easy mode: voice/typed commands, five actions, business words, Hindi dictionary'},null,2));
