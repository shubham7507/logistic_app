// Home-service pro set-up after ID + selfie: activation (bank carried over, last workspace remembered),
// Trained badge (video + per-trade quiz), work area + radius, working days/hours (used by dispatch), bank / UPI,
// job wording on the worker profile, hardware & paint seller categories with starter items.
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as HS from '../js/home-services.js';
import * as D from '../js/hs-dispatch.js';
import * as LOC from '../js/location.js';
import * as WO from '../js/worker-onboarding.js';
import * as SO from '../js/seller-onboarding.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Raju'}, currentWorkspace: 'personal'});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// activation + set-up gaps
{ const s = fresh(); const c = {id: 'CAND-9', workerType: 'homePro', name: 'Raju Electric', mobile: '9000000001', level: 2, skills: ['Electrician', 'Plumber'], locations: ['Patna'], checks: {bank: {status: 'verified', masked: 'XXXX1842'}}};
  assert.equal(HS.activatePro(s, c), ''); const p = HS.proOf(s); assert.equal(p.bank.masked, 'XXXX1842', 'verified bank carried over'); assert.equal(s.lastWorkspace, 'homePro');
  assert.deepEqual(HS.setupGaps(p).map(x => x[0]), ['train', 'area', 'hours']);
  // training: video + all answers right
  const qs = HS.quizFor(p); assert.equal(qs.length, 5, '2 electrician + 2 plumber + parts rule');
  assert.match(HS.submitTraining(s, p, {watched: false, answers: qs.map(q => q[2])}), /video/);
  assert.match(HS.submitTraining(s, p, {watched: true, answers: qs.map(() => 1)}), /0 of 5 right/);
  assert.equal(HS.submitTraining(s, p, {watched: true, answers: qs.map(q => q[2])}), ''); assert.equal(p.trained, true);
  // work area via the location picker + radius
  assert.match(HS.saveArea(s, p, {error: 'Choose a place'}, 10), /Choose a place/);
  const loc = LOC.makeLocation({source: 'gps', lat: LOC.DEMO_SPOTS.patna.at[0], lng: LOC.DEMO_SPOTS.patna.at[1], accuracy: 12, line: 'Kankarbagh', pincode: '800001'});
  assert.match(HS.saveArea(s, p, loc, 7), /how far/); assert.equal(HS.saveArea(s, p, loc, 5), ''); assert.deepEqual(p.base, LOC.DEMO_SPOTS.patna.at); assert.equal(p.radiusKm, 5);
  // hours
  assert.match(HS.saveHours(s, p, {days: [], from: 9, to: 18}), /day/); assert.match(HS.saveHours(s, p, {days: [1], from: 18, to: 9}), /after/);
  assert.equal(HS.saveHours(s, p, {days: ['1', '2', '3', '4', '5', '6'], from: '9', to: '18'}), ''); assert.equal(HS.hoursText(p), 'Mon, Tue, Wed, Thu, Fri, Sat · 9:00–18:00');
  assert.equal(HS.setupGaps(p).length, 0);
  // dispatch uses the area and hours
  const r = {id: 'T', type: 'general', category: 'electrician', items: [], address: loc, date: day(1), slot: '18', customer: 'personal'};
  assert.equal(D.ineligible(s, p, r), 'not working then'); assert.equal(D.ineligible(s, p, {...r, slot: '10'}), '');
  assert.equal(D.score(s, p, {...r, slot: '10'}).parts.skill, 6, 'trained badge counts in the score'); }

// bank / UPI validation
{ const s = fresh(), p = HS.proOf(s); delete p.bank;
  assert.match(HS.saveBank(s, p, {upi: 'bad'}), /UPI/); assert.match(HS.saveBank(s, p, {account: '123', ifsc: 'X'}), /IFSC/);
  assert.equal(HS.saveBank(s, p, {account: '123456789012', ifsc: 'sbin0001234'}), ''); assert.equal(p.bank.masked, 'XXXX9012');
  assert.equal(HS.saveBank(s, p, {upi: 'suresh@okaxis'}), ''); assert.equal(p.bank.kind, 'upi'); }

// job wording for home-service pros
{ const c = {workerType: 'homePro'}; assert.equal(WO.levelsOf(c)[2].name, 'Job-ready'); assert.match(WO.viaOf(c, 'emergency'), /during a job/); assert.match(WO.viaOf(c, 'selfie'), /Aadhaar photo/);
  assert.equal(WO.levelsOf({workerType: 'commercialDriver'})[2].name, 'Trip-ready'); }

// hardware & paint shops onboard like any seller, with one-tap starter items
{ assert.equal(SO.CATEGORIES.hardware.productCategory, 'Hardware & sanitary'); assert.equal(SO.CATEGORIES.paint.productCategory, 'Paint & hardware');
  const s = fresh(); const a = SO.startApplication(s, {}); a.categories = ['hardware', 'paint'];
  assert.equal(SO.addStarters(s, a, 'hardware'), ''); assert.equal(a.products.length, SO.STARTERS.hardware.length);
  assert.match(SO.addStarters(s, a, 'hardware'), /already/); assert.equal(SO.addStarters(s, a, 'paint'), ''); assert.match(SO.addStarters(s, a, 'fresh'), /category first/);
  assert.ok(a.products.every(p => p.price <= p.mrp)); }
console.log(JSON.stringify({status: 'PASS', suite: 'Pro set-up: activation, Trained badge quiz, work area + radius, hours, bank/UPI, job wording, hardware & paint sellers'}));
