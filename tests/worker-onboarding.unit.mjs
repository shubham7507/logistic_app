import assert from 'node:assert/strict';
import * as W from '../js/worker-onboarding.js';
import {SEED} from '../js/mock-data.js';

const future=new Date(Date.now()+400*86400000).toISOString().slice(0,10);
const soon=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
const past=new Date(Date.now()-5*86400000).toISOString().slice(0,10);
const base={workerType:'commercialDriver',name:'Mohan',location:'Patna',licenceNumber:'BR01 20180012345',licenceExpiry:future,licenceClasses:['HMV','TRANS'],experienceYears:6,emergencyName:'Sita',emergencyPhone:'9812345678'};

// details validation
assert.equal(W.validateWorkerDetails(base),'');
assert.match(W.validateWorkerDetails({...base,licenceNumber:'12345'}),/15-character/);
assert.match(W.validateWorkerDetails({...base,licenceExpiry:past}),/expired/);
assert.match(W.validateWorkerDetails({...base,licenceExpiry:soon}),/30 days/);
assert.match(W.validateWorkerDetails({...base,licenceClasses:['LMV']}),/transport class/,'personal LMV licence cannot onboard as Commercial Driver');
assert.equal(W.validateWorkerDetails({...base,workerType:'personalDriver',licenceClasses:['LMV']}),'');
assert.match(W.validateWorkerDetails({...base,emergencyPhone:'123'}),/emergency/);
assert.match(W.validateWorkerDetails({...base,emergencyPhone:'9812345678'},'9812345678'),/someone else/);
assert.equal(W.validateWorkerDetails({workerType:'helper',name:'Ramesh',location:'Noida',emergencyName:'A',emergencyPhone:'9811111111'}),'','helper needs no licence');

// documents: all required before submit, then verification before work
const c={id:'C1',...base,documents:{},onboarding:'documents'};
assert.deepEqual(W.requiredDocs('commercialDriver').required,['dl_front','dl_back','id_proof','photo','address_proof','bank']);
assert.ok(!W.requiredDocs('helper').required.includes('dl_front'),'helper does not upload a licence');
assert.match(W.canSubmitForVerification(c),/6 more required/);
assert.match(W.canTakeWork(c),/Finish your documents/);
for(const k of W.requiredDocs('commercialDriver').required)c.documents[k]={file:`${k}.jpg`,status:'uploaded'};
assert.equal(W.canSubmitForVerification(c),'');
assert.match(W.validateUpload({name:'a.exe',size:10}),/photo/);
assert.match(W.validateUpload({name:'a.jpg',size:9e6}),/5 MB/);
const state={verificationQueue:[],candidates:[c],audit:[],currentWorkspace:'personal'};
assert.equal(W.submitForVerification(state,c),'');
assert.equal(c.onboarding,'under_verification');assert.equal(state.verificationQueue.length,1);
assert.match(W.canTakeWork(c),/Finish your documents/,'still blocked while under verification');
W.applyWorkerDecision(state,state.verificationQueue[0],'correction_required','Licence photo blurry');
assert.equal(c.onboarding,'correction_required');assert.equal(c.documents.dl_front.status,'correction_required');
c.documents.dl_front={file:'dl2.jpg',status:'uploaded'};Object.values(c.documents).forEach(d=>{if(d.status==='correction_required')d.status='uploaded'});
assert.equal(W.submitForVerification(state,c),'');assert.equal(state.verificationQueue[0].version,2);
W.applyWorkerDecision(state,state.verificationQueue[0],'approved','');
assert.equal(W.canTakeWork(c),'');assert.equal(c.status,'available');
c.licenceExpiry=past;assert.match(W.canTakeWork(c),/expired/);

// seeded verified workers stay verified
const seeded=JSON.parse(JSON.stringify(SEED.candidates[0]));W.ensureOnboarding(seeded);assert.equal(W.canTakeWork(seeded),'');
console.log(JSON.stringify({status:'PASS',suite:'Worker onboarding (documents first)'},null,2));
