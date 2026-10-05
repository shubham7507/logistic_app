import assert from 'node:assert/strict';
import * as W from '../js/worker-hub.js';
import * as C from '../js/people-core.js';
import * as WF from '../js/workforce.js';
import * as H from '../js/store-hr.js';
import {ensurePlus} from '../js/commerce-plus.js';
import {SEED} from '../js/mock-data.js';
const fresh=()=>{const s=structuredClone(SEED);ensurePlus(s);H.people(s,'grocery');WF.ensureWorkforce(s);W.ensureHub(s);return s};
let s=fresh();
// Sanju: one profile, past store job + current transporter job with role history
const sanju=C.findPerson(s,'9876507001');assert.equal(sanju.name,'Sanju Kumar');
let j=W.jobs(s,sanju);const cur=j.filter(x=>x.kind==='employment'&&x.e.status==='active'),past=j.filter(x=>x.kind==='employment'&&x.e.status==='ended');
assert.equal(cur.length,1);assert.equal(cur[0].employer,'Raj Logistics');assert.equal(past.length,1);assert.equal(past[0].employer,'ABC Grocery');
assert.equal(cur[0].money.balance,2700,'trip wage + bata in khata');assert.ok(cur[0].e.history.some(h=>/Khalasi/.test(h.text)));
assert.equal(past[0].money.balance,0,'final settlement paid');
// yearly statement includes the ABC final settlement
const y=W.yearly(s,sanju);assert.equal(y[2026]['ABC Grocery'],11220);
assert.equal(W.historyLines(s,sanju).length,2);
// whoAmI for each kind of worker screen
assert.equal(W.whoAmI(s,'commercialDriver').name,'Mohan Yadav');assert.equal(W.whoAmI(s,'helper').name,'Ramesh Yadav');
assert.equal(W.whoAmI(s,'picker').name,'Asha Picker');assert.equal(W.whoAmI(s,'deliveryPartner').name,'Ravi Delivery');assert.equal(W.whoAmI(s,'personalDriver').name,'Anil Kumar');
// delivery partner is a MoveAI role with the wallet, not an employment
const dp=W.jobs(s,W.whoAmI(s,'deliveryPartner'));assert.equal(dp[0].kind,'partner');assert.equal(dp[0].employer,'MoveAI Delivery');
// same person at two employers: switcher shows both current jobs
s.pickerStaff.push({id:'PICK-M2',store:'groceryFresh',name:'Mohan Yadav',mobile:'9876501103',status:'active'});C.ensureCore(s);
assert.equal(W.jobs(s,C.findPerson(s,'9876501103')).filter(x=>x.kind==='employment'&&x.e.status==='active').length,2);
// offboarding in the old screens ends the employment and moves it to past work
s.peopleByWorkspace.transporter.find(p=>p.id==='WORKER-002').status='offboarded';W.ensureHub(s);assert.equal(s.employments.find(e=>e.source.id==='WORKER-002').status,'ended');
// screens render for every worker workspace and for "view as"
for(const ws of ['commercialDriver','helper','personalDriver','picker','deliveryPartner']){const h=W.screen(s,'myWork',ws);assert.ok(h.includes('My work &amp; pay'),ws);assert.doesNotMatch(h.replace(/<[^>]+>/g,' '),/\bundefined\b|NaN/,ws);}
s.hubViewAs=sanju.id;s.hubViewAsWs='helper';const h=W.screen(s,'myWork','helper');assert.match(h,/Sanju Kumar/);assert.match(h,/Past work/);assert.match(h,/ABC Grocery/);assert.match(h,/Khalasi/);
console.log(JSON.stringify({status:'PASS',suite:'Worker hub: my work & pay across employers, past work, statement, history'},null,2));
