// Choosing the pro for a home-service job: eligibility, score /100, top 3 for 60 s (best score wins, not the
// fastest tap), nobody accepts → wider area → admin, favourite pro first, cancel → next best, new pros get jobs,
// urgent jobs weigh distance more, painting quotes.
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as HS from '../js/home-services.js';
import * as D from '../js/hs-dispatch.js';
import * as LOC from '../js/location.js';

const fresh = () => ({...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}, currentWorkspace: 'personal'});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const patna = LOC.makeLocation({source: 'gps', lat: LOC.DEMO_SPOTS.patna.at[0], lng: LOC.DEMO_SPOTS.patna.at[1], accuracy: 12, line: 'Flat 3B, Ganga Apartments', pincode: '800001'});
const book = (s, o = {}) => HS.createBooking(s, {category: 'plumber', items: [{id: 'tap', qty: 1}], address: patna, date: day(1), slot: '10', ...o}).request;
const pro = (s, id) => s.homePros.find(p => p.id === id);

// 1. Three pros accept → the highest score wins (not the fastest); the others are backups, no penalty
{ const s = fresh(); const r = book(s);
  assert.equal(r.dispatch.round, 1); assert.equal(r.dispatch.log[0].text.includes('Round 1'), true);
  const offered = r.dispatch.offered; assert.equal(offered.length, 3, 'top 3 are offered');
  const scores = Object.fromEntries(offered.map(id => [id, D.score(s, pro(s, id), r).total]));
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(r.status, 'accepted'); assert.equal(r.proId, best, 'best score wins'); assert.equal(r.provider, `pro:${best}`);
  assert.equal(r.dispatch.backups.length, 2); assert.ok(r.dispatch.winner.total >= Math.max(...Object.values(scores)) - 0.5);
  for (const id of r.dispatch.backups) assert.equal(D.stats(pro(s, id)).cancels, SEED.homePros.find(p => p.id === id).stats.cancels, 'losing an offer is not a penalty');
  assert.ok(s.notifications.some(n => n.to === 'personal' && n.text.includes(pro(s, best).name))); }

// 2. Eligibility: offline, outside hours, rating below 4.0, paused, busy, outside area
{ const s = fresh(), r = book(s, {slot: '18'}); const sunil = pro(s, 'HP-SUNIL');
  sunil.hours = {days: [1, 2, 3, 4, 5, 6, 0], from: 8, to: 17}; assert.equal(D.ineligible(s, sunil, r), 'not working then');
  sunil.hours = null; sunil.online = false; assert.equal(D.ineligible(s, sunil, r), 'offline'); sunil.online = true;
  sunil.rating = 3.6; sunil.ratingCount = 40; assert.equal(D.ineligible(s, sunil, r), 'rating below 4.0'); sunil.rating = 4.3;
  sunil.active = false; assert.equal(D.ineligible(s, sunil, r), 'paused'); sunil.active = true;
  assert.equal(D.ineligible(s, pro(s, 'HP-AMIT'), r), 'no skill');
  assert.equal(D.ineligible(s, pro(s, 'HP-SURESH'), r), 'outside area', 'Noida pro is not offered a Patna job');
  const busyFor = pro(s, r.proId); assert.equal(D.ineligible(s, busyFor, {...r, id: 'X'}), 'busy in that slot'); }

// 3. A new pro (no ratings yet) is eligible and gets an average rating score, so new pros get jobs
{ const s = fresh(), r = {id: 'T', type: 'general', category: 'plumber', items: [{id: 'tap', qty: 1}], address: patna, date: day(1), slot: '10', customer: 'personal'};
  const deepak = pro(s, 'HP-DEEPAK'); assert.equal(D.ineligible(s, deepak, r), '');
  const sc = D.score(s, deepak, r); assert.equal(sc.parts.rating, 12, 'new pro: 60% of the rating points');
  assert.ok(D.ranked(s, r, 5).slice(0, 3).some(x => x.p.id === 'HP-DEEPAK'), 'a close new pro makes the top 3'); }

// 4. Urgent jobs weigh distance more
{ const s = fresh(), r = {id: 'T', type: 'general', category: 'plumber', items: [], address: patna, date: day(1), slot: '10', customer: 'personal'};
  const p = pro(s, 'HP-RAVI'), normal = D.score(s, p, r), urgent = D.score(s, p, {...r, urgent: true});
  assert.ok(urgent.parts.distance > normal.parts.distance); assert.ok(urgent.parts.rating < normal.parts.rating); }

// 5. Nobody accepts → next pros and a wider area (5 → 10 → 15 km) → admin is told
{ const s = fresh(); for (const p of s.homePros) if (p.ws === null) p.active = false; // only Suresh, 5.2 km from Sector 50
  const sector50 = LOC.makeLocation({source: 'search', lat: 28.5714, lng: 77.3637, line: 'C-14', village: 'Sector 50', pincode: '201301'});
  const r = HS.createBooking(s, {category: 'carpenter', items: [{id: 'hinge', qty: 1}], address: sector50, date: day(1), slot: '12'}).request;
  assert.equal(r.dispatch.widened, true); assert.equal(r.dispatch.radiusKm, 10); assert.ok(HS.offersFor(s).some(x => x.id === r.id));
  assert.ok(r.dispatch.log.some(l => /widened to 10 km/.test(l.text)));
  assert.equal(HS.declineJob(s, 'homePro', r.id), ''); assert.equal(r.dispatch.exhausted, true);
  assert.ok(s.notifications.some(n => n.to === 'admin' && n.ref === r.id && /no carpenter free within 15 km/.test(n.text)));
  assert.ok(HS.widened(s).some(x => x.id === r.id)); assert.equal(HS.adminAssign(s, r.id, 'HP-SURESH'), ''); assert.equal(r.provider, 'homePro'); }

// 6. Nobody answers in 60 seconds → the round moves on (server timer; demo button "60 seconds pass")
{ const s = fresh(); const r = HS.createBooking(s, {category: 'electrician', items: [{id: 'fan', qty: 1}], addressId: 'AD-HOME', date: day(1), slot: '10'}).request;
  assert.deepEqual(r.dispatch.current.ids, ['HP-SURESH'], 'only Suresh within 5 km'); assert.equal(D.timePasses(s, r), '');
  assert.equal(r.status, 'accepted'); assert.equal(r.proId, 'HP-AMIT', 'next round (10 km) → Amit'); assert.equal(HS.offersFor(s).some(x => x.id === r.id), false); }

// 7. "Book my pro again": favourite asked first for 2 minutes, then the normal rounds
{ const s = fresh(); const r = HS.createBooking(s, {category: 'electrician', items: [{id: 'fan', qty: 1}], addressId: 'AD-HOME', date: day(1), slot: '14', favouriteProId: 'HP-SURESH'}).request;
  assert.deepEqual(r.dispatch.current.ids, ['HP-SURESH']); assert.equal(r.dispatch.current.windowMs, D.FAVOURITE_MS); assert.match(r.dispatch.log[0].text, /favourite/);
  assert.equal(HS.acceptJob(s, 'homePro', r.id), ''); assert.equal(r.provider, 'homePro'); assert.equal(r.dispatch.winner.parts.favourite, 5); }

// 8. The assigned pro cancels → the next-best pro who accepted gets it; reliability drops; the customer is told
{ const s = fresh(); const r = book(s); const first = pro(s, r.proId), backup = r.dispatch.backups[0];
  assert.match(D.proCancel(s, r, first, ''), /why/); assert.equal(D.proCancel(s, r, first, 'Bike broke down'), '');
  assert.equal(D.stats(first).cancels, 1 + (SEED.homePros.find(p => p.id === first.id).stats.cancels || 0));
  assert.equal(r.status, 'accepted'); assert.notEqual(r.proId, first.id); assert.ok(r.dispatch.backups.length === 1 || r.proId === backup);
  assert.ok(s.notifications.some(n => n.to === 'personal' && /had to cancel/.test(n.text)));
  assert.ok(D.score(s, first, r).parts.reliability < 20, 'reliability points drop'); }
// … and through the pro app (Suresh): job goes to Amit
{ const s = fresh(); const r = HS.createBooking(s, {category: 'electrician', items: [{id: 'fan', qty: 1}], addressId: 'AD-HOME', date: day(2), slot: '10'}).request;
  HS.acceptJob(s, 'homePro', r.id); assert.equal(HS.cancelByPro(s, 'homePro', r.id, 'Family emergency'), ''); assert.equal(r.proId, 'HP-AMIT'); assert.equal(D.stats(pro(s, 'HP-SURESH')).cancels, 1); }

// 9. Painting: several painters quote, customer chooses
{ const s = fresh(); const r = HS.createBooking(s, {category: 'painting', items: [], description: '2 bedrooms and hall', addressId: 'AD-HOME', date: day(3), slot: '10'}).request;
  assert.equal(r.status, 'searching'); assert.equal(r.quotes.length, 2); assert.equal(HS.chooseQuote(s, r.id, 'HP-VINOD'), '');
  assert.equal(r.status, 'accepted'); assert.equal(r.quote.total, 12800); assert.equal(r.inspectionQuote.status, 'approved'); }

// 10. Seeded job SR-706 waits for Suresh; the notify centre lists only offered jobs
{ const s = fresh(); assert.ok(HS.offersFor(s).some(x => x.id === 'SR-706')); }
console.log(JSON.stringify({status: 'PASS', suite: 'Choosing the pro: best score wins, eligibility, new pros, urgent, wider area + admin, 60-second rounds, favourite first, cancel → next best, painting quotes'}));
