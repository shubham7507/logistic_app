import assert from 'node:assert/strict';
import * as W from '../js/worker-onboarding.js';
import * as V from '../js/verify-sim.js';
import {SEED} from '../js/mock-data.js';

const past=new Date(Date.now()-5*86400000).toISOString().slice(0,10);
const file=name=>({name,size:1000});
const newState=()=>({verificationQueue:[],candidates:[],audit:[],notifications:[],currentWorkspace:'personal',auth:{mobile:'9876543210'}});

// simulated instant checks
assert.equal(V.licenceLookup({number:'BR01 20190054321',dob:'1990-01-01',name:'S',type:'commercialDriver'}).ok,true);
assert.match(V.licenceLookup({number:'12',dob:'1990-01-01'}).reason,/15-character/);
assert.match(V.licenceLookup({number:'BR01 20190054321',dob:'2012-01-01'}).reason,/18/);
assert.equal(V.licenceLookup({number:'BR01 20190050000',dob:'1990-01-01'}).fallback,true);
assert.match(V.licenceLookup({number:'BR01 20190051111',dob:'1990-01-01',type:'commercialDriver'}).reason,/transport class/);
assert.match(V.licenceLookup({number:'BR01 20190059999',dob:'1990-01-01'}).reason,/expired/);
assert.match(V.aadhaarEkyc({aadhaar:'234567891234',otp:'000000',consent:true}).reason,/OTP/);
assert.equal(V.aadhaarEkyc({aadhaar:'234567891234',otp:'123456',consent:true}).data.masked,'XXXX XXXX 1234');
assert.equal(V.pennyDrop({account:'123456789000',ifsc:'SBIN0001234'}).fallback,true);
assert.equal(V.gstLookup('09AAACR5055K1Z5','Raj').data.pan,'AAACR5055K','PAN is embedded in GSTIN');
assert.equal(V.gstLookup('09AAACR5055K1Z5').data.entityType,'Private Limited','4th PAN char C = company');
assert.match(V.gstLookup('09AAACR5055K1Z9').reason,/cancelled/);
assert.equal(V.rcLookup('BR01 GX 7744').data.insuranceUpto,'2027-05-31');
assert.equal(V.rcLookup('BR01 GX 0000').fallback,true);

// Commercial Driver: browse → verified → trip-ready
const s=newState();const c={id:'C1',name:'Suresh',workerType:'commercialDriver',locations:['Patna'],mobile:'9876543210',checks:{}};s.candidates.push(c);W.ensureOnboarding(c);
assert.equal(c.level,1);assert.match(W.canTakeWork(c),/licence/);
assert.match(W.runCheck(s,c,'selfie',{file:file('me.jpg')}).error,/licence or Aadhaar first/,'selfie needs a reference photo');
assert.equal(W.runCheck(s,c,'licence',{number:'BR01 20190054321',dob:'1990-01-01'}).error,undefined);
assert.equal(c.level,1,'licence alone is not enough');
W.runCheck(s,c,'selfie',{file:file('me.jpg')});assert.equal(c.level,2);assert.equal(W.canTakeWork(c),'');assert.equal(c.status,'available');
assert.match(W.canStartPaidWork(c),/trip-ready/,'cannot accept paid work at level 2');
W.runCheck(s,c,'aadhaar',{aadhaar:'234567891234',otp:'123456',consent:true});
assert.match(W.runCheck(s,c,'bank',{account:'123456789',confirm:'123456788',ifsc:'SBIN0001234'}).error,/do not match/);
W.runCheck(s,c,'bank',{account:'123456789',confirm:'123456789',ifsc:'SBIN0001234'});
assert.match(W.runCheck(s,c,'emergency',{name:'Geeta',phone:'9876543210'}).error,/someone else/);
W.runCheck(s,c,'emergency',{name:'Geeta',phone:'9876500011'});
assert.equal(c.level,3);assert.equal(W.canStartPaidWork(c),'');
c.checks.licence.expiry=past;W.ensureOnboarding(c);assert.equal(c.level,1,'expired licence drops the driver back');

// fallback → admin
const s2=newState();const d={id:'C2',name:'Ravi',workerType:'commercialDriver',checks:{}};s2.candidates.push(d);W.ensureOnboarding(d);
const r=W.runCheck(s2,d,'licence',{number:'BR01 20190050000',dob:'1990-01-01'});assert.equal(r.fallback,true);assert.equal(d.checks.licence.status,'failed');
assert.match(W.submitManual(s2,d,'licence',{dl_front:file('a.jpg')},{expiry:'2030-01-01',classes:'HMV'}),/back/);
assert.equal(W.submitManual(s2,d,'licence',{dl_front:file('a.jpg'),dl_back:file('b.jpg')},{number:'BR01 20190050000',expiry:'2030-01-01',classes:'HMV, TRANS'}),'');
assert.equal(s2.verificationQueue[0].check,'licence');
W.applyWorkerDecision(s2,s2.verificationQueue[0],'correction_required','Blurry');assert.equal(d.checks.licence.status,'correction_required');
W.submitManual(s2,d,'licence',{dl_front:file('a.jpg'),dl_back:file('b.jpg')},{expiry:'2030-01-01',classes:'HMV'});assert.equal(s2.verificationQueue[0].version,2);
W.applyWorkerDecision(s2,s2.verificationQueue[0],'approved','');assert.ok(W.checkOk(d,'licence'));

// helper: Aadhaar + selfie, no licence
const h={id:'H',name:'Ramu',workerType:'helper',skills:['Loading / unloading'],checks:{}};const s3=newState();s3.candidates.push(h);W.ensureOnboarding(h);
assert.ok(!W.levelChecks(h).l2.includes('licence'));
W.runCheck(s3,h,'aadhaar',{aadhaar:'234567891234',otp:'123456',consent:true});W.runCheck(s3,h,'selfie',{file:file('x.png')});assert.equal(h.level,2);

// personal driver monthly family job needs police badge
const p={id:'P',name:'Anil',workerType:'personalDriver',checks:{}};const s4=newState();s4.candidates.push(p);W.ensureOnboarding(p);
W.runCheck(s4,p,'licence',{number:'UP16 20190054321',dob:'1990-01-01'});W.runCheck(s4,p,'selfie',{file:file('x.jpg')});W.runCheck(s4,p,'aadhaar',{aadhaar:'234567891234',otp:'123456',consent:true});W.runCheck(s4,p,'bank',{account:'123456789',confirm:'123456789',ifsc:'HDFC0001842'});W.runCheck(s4,p,'emergency',{name:'A',phone:'9811111111'});
assert.equal(W.canStartPaidWork(p,{payType:'daily'}),'');assert.match(W.canStartPaidWork(p,{payType:'monthly'}),/police/);

// quick start validation, seeded workers stay fully verified
assert.match(W.validateQuickStart({workerType:'helper',name:'A',location:'B',skills:[]}),/skill/);
for(const sc of SEED.candidates){const x=JSON.parse(JSON.stringify(sc));W.ensureOnboarding(x);assert.equal(x.level,3,sc.id)}
console.log(JSON.stringify({status:'PASS',suite:'Worker onboarding levels + instant checks'},null,2));
