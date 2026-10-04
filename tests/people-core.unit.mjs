import assert from 'node:assert/strict';
import * as C from '../js/people-core.js';
import {SEED} from '../js/mock-data.js';
const fresh=()=>{const s=structuredClone(SEED);C.ensureCore(s);return s};
let s=fresh();
// one person per mobile; the old 9876501101 clash is gone
const mobiles=Object.values(s.persons).map(p=>p.mobile);assert.equal(new Set(mobiles).size,mobiles.length);
assert.equal(C.findPerson(s,'9876501101').name,'Ravi Kumar');assert.equal(C.findPerson(s,'9876505101').name,'Asha Picker');
assert.ok(s.employments.length>=9,'business staff, pickers and store managers all linked');
assert.equal(C.ensureCore(s).employments.length,s.employments.length,'idempotent');
// branches exist for every business type
for(const b of [...C.BUSINESS,...C.STORES.slice(0,2)])assert.ok(C.branchesFor(s,b).length>=1,b);
// same person at two businesses: one profile, two employments, invite note says no new KYC
s.pickerStaff.push({id:'PICK-X',store:'grocery',name:'Mohan Yadav',mobile:'9876501103',status:'active'});C.ensureCore(s);
const mohan=C.findPerson(s,'9876501103');assert.equal(s.employments.filter(e=>e.personId===mohan.id).length,2);
assert.match(C.inviteNote(s,'9876501103','movers'),/already has a MoveAI profile.*Raj Logistics|ABC Grocery/);assert.match(C.inviteNote(s,'9999999999','movers'),/New to MoveAI/);
// transfer: owner only, dated history, teams on the old branch left
const sunita=s.employments.find(e=>e.source.id==='STAFF-002');
assert.match(C.transfer(s,'groceryManager',sunita.id,{home:'BR-002'}),/Not found/);
const ravi=s.employments.find(e=>e.source.id==='STAFF-001');assert.equal(C.transfer(s,'transporter',ravi.id,{home:'BR-002',cover:['BR-001'],reason:'Jaipur expansion'}),'');
assert.equal(ravi.homeBranch,'BR-002');assert.match(ravi.history.at(-1).text,/Noida HQ → Jaipur Branch/);assert.deepEqual(s.peopleByWorkspace.transporter.find(p=>p.id==='STAFF-001').branchIds,['BR-002','BR-001']);
// teams: permanent teams need the branch; temporary teams need an end date
assert.match(C.createTeam(s,'transporter',{name:'Crew X',kind:'temporary',branchId:'BR-002'}),/end date/);
assert.equal(C.createTeam(s,'transporter',{name:'Fleet crew B',kind:'crew',branchId:'BR-002'}),'');
const crewB=s.teams.find(t=>t.name==='Fleet crew B');const mohanT=s.employments.find(e=>e.source.id==='WORKER-001');
assert.match(C.teamMember(s,'transporter',crewB.id,mohanT.id,'add'),/not assigned to Jaipur/);
// cover request: Jaipur has no other manager → owner approves; adds a dated temporary team and cover branch
const pend=C.requestCover(s,'transporter',{empId:mohanT.id,toBranch:'BR-002',date:'2099-01-05',reason:'Big load'});assert.equal(pend,'');
const cov=s.coverRequests[0];assert.equal(cov.status,'approved');assert.ok(mohanT.cover.includes('BR-002'));assert.ok(s.teams.some(t=>t.kind==='temporary'&&t.until==='2099-01-05'&&t.members.includes(mohanT.id)));
assert.equal(C.teamMember(s,'transporter',crewB.id,mohanT.id,'add'),'');
// approver fallback: branch without a manager → owner
assert.equal(C.approverFor(s,'movers','BR-031').kind,'owner');assert.equal(C.approverFor(s,'movers','BR-030').kind,'manager');
// store manager scope: only their branch; cannot transfer
const asha=s.employments.find(e=>e.source.id==='PICK-001');assert.match(C.transfer(s,'groceryManager',asha.id,{home:'grocery-B2'}),/Only the owner/);
assert.equal(C.transfer(s,'groceryManager',asha.id,{home:asha.homeBranch,cover:['grocery-B2']}),'');assert.ok(asha.cover.includes('grocery-B2'));
// work belongs to a branch: a Jaipur trip can only go to a Jaipur team (or temporary)
const dispatch=s.teams.find(t=>t.business==='transporter'&&t.name==='Dispatch');assert.match(C.assignWork(s,'transporter','trip','TRP-501',dispatch.id),/belongs to Jaipur/);
assert.equal(C.assignWork(s,'transporter','trip','TRP-501',crewB.id),'');assert.equal(s.trips.find(t=>t.id==='TRP-501').teamId,crewB.id);
// closing a branch blocked while staff call it home
assert.match(C.branchCloseCheck(s,'transporter','BR-001'),/Transfer them first/);
// expired cover is cleaned up
cov.date='2000-01-01';C.expireTemporary(s);assert.ok(!mohanT.cover.includes('BR-002'));
// screens render for owner and manager
for(const ws of ['transporter','goods','vehicle','movers','grocery','groceryManager']){const h=C.screen(s,'branchesTeams',ws);assert.ok(h.length>300,ws);assert.doesNotMatch(h.replace(/<[^>]+>/g,' '),/\bundefined\b|NaN/,ws);}
console.log(JSON.stringify({status:'PASS',suite:'Shared people core: profiles, employments, branches, teams, cover, transfers'},null,2));
