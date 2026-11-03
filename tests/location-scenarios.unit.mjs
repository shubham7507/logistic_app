// Location for home services in Patna (good map data) and Motihari (GPS works, search does not):
// the 8 scenarios — Patna at home, booking from office, Motihari GPS, location link, basic phone (landmark),
// wrong pin, weak network, second visit — plus labels, DIGIPIN, navigation, call prompts, arrival, start check.
import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as LOC from '../js/location.js';
import * as HS from '../js/home-services.js';

// Suresh is the only pro here and has no fixed work area, so he is offered every booking (dispatch is tested in hs-dispatch.unit.mjs).
const fresh = () => { const s = {...JSON.parse(JSON.stringify(SEED)), person: {id: 'PER-1001', name: 'Shubham Kumar'}, currentWorkspace: 'personal'}; s.homePros = s.homePros.filter(p => p.id === 'HP-SURESH'); delete s.homePros[0].base; delete s.homePros[0].coords; return s; };
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const book = (s, address) => HS.createBooking(s, {category: 'electrician', items: [{id: 'fan', qty: 1}], date: day(1), slot: '10', address}).request;
const drive = (s, r, n = 60) => { for (let i = 0; i < n && !r.arrivedAt; i++) HS.demoDrive(s, 'homePro', r.id, 1); };
const go = (s, r) => { assert.equal(HS.acceptJob(s, 'homePro', r.id), ''); assert.equal(HS.onTheWay(s, 'homePro', r.id), ''); };

// DIGIPIN matches India Post's published example (Dak Bhawan, New Delhi)
assert.equal(LOC.digipin(28.622788, 77.213033), '39J-49L-L8T4');
assert.equal(LOC.labelFor('gps', 12), 'exact'); assert.equal(LOC.labelFor('gps', 120), 'approx'); assert.equal(LOC.labelFor('pin'), 'approx'); assert.equal(LOC.labelFor('landmark'), 'area');

// 1. Patna flat, customer at home → GPS → Exact → Navigate to the door → start only within 200 m
{ const s = fresh(), sp = LOC.DEMO_SPOTS.patna;
  const loc = LOC.makeLocation({source: 'gps', lat: sp.at[0], lng: sp.at[1], accuracy: 12, line: 'Flat 3B, Ganga Apartments', pincode: '800001'});
  assert.equal(loc.precision, 'exact'); assert.match(loc.digipin, /^[2-9CFJKLMPT]{3}-[2-9CFJKLMPT]{3}-[2-9CFJKLMPT]{4}$/);
  assert.match(LOC.navUrl(loc), /destination=25\.61.*travelmode=two-wheeler/);
  HS.proOf(s).coords = [25.59, 85.16];
  const r = book(s, loc); go(s, r);
  assert.match(HS.startJob(s, 'homePro', r.id, r.startOtp), /live location/);
  HS.demoDrive(s, 'homePro', r.id); assert.ok(HS.distLeft(r) > 0.2); assert.match(HS.startJob(s, 'homePro', r.id, r.startOtp), /km from the customer/);
  drive(s, r); assert.ok(r.arrivedAt); assert.ok(s.notifications.some(n => n.to === 'personal' && /arriving in about 2 minutes/.test(n.text))); assert.ok(s.notifications.some(n => n.to === 'personal' && /has arrived/.test(n.text)));
  assert.ok(!r.geo.callPrompted, 'no call prompt needed for an exact address');
  assert.equal(HS.startJob(s, 'homePro', r.id, r.startOtp), ''); assert.equal(r.geo.live, false); assert.match(HS.shareLocation(s, 'homePro', r.id, 25.6, 85.1), /only while you are on the way/); }

// 2. Patna, booking from office → search → Approximate → call prompt at 500 m, start within 500 m
{ const s = fresh(), hit = LOC.search('Kankarbagh Patna');
  assert.ok(hit.ok); const loc = LOC.makeLocation({source: 'search', lat: hit.at[0], lng: hit.at[1], line: 'House 22, Road 4', pincode: hit.pincode});
  assert.equal(loc.precision, 'approx'); assert.match(LOC.navUrl(loc), /destination=/);
  HS.proOf(s).coords = [25.62, 85.13]; const r = book(s, loc); go(s, r); drive(s, r);
  assert.ok(r.geo.callPrompted); assert.ok(s.notifications.some(n => n.to === 'homePro' && /call .* now/.test(n.text)));
  assert.equal(HS.startJob(s, 'homePro', r.id, r.startOtp), ''); assert.equal(r.address.precision, 'exact', 'learned from the pro at start'); }

// 3. Motihari, customer at home → search finds nothing, but GPS gives an Exact point
{ const s = fresh(); const q = LOC.search('Chhatauni Motihari'); assert.equal(q.ok, false); assert.equal(q.notOnMap, true);
  const sp = LOC.DEMO_SPOTS.motihari; const loc = LOC.makeLocation({source: 'gps', lat: sp.at[0], lng: sp.at[1], accuracy: 18, line: 'Ram Prasad ji ka ghar', village: 'Pipra', landmark: 'Hanuman mandir ke peeche', pincode: '845401'});
  assert.equal(loc.precision, 'exact'); assert.equal(LOC.pinMismatch(loc), 0); }

// 4. Son in Delhi books for parents' village house → location link → their phone shares an Exact point
{ const s = fresh(); const key = 'hs-addr';
  assert.match(LOC.sendLink(s, key, '12345').error, /10-digit/);
  const {token} = LOC.sendLink(s, key, '9876501234'); assert.ok(s.outbox[0].channels.includes('WhatsApp'));
  const sp = LOC.DEMO_SPOTS.motihari; assert.equal(LOC.fulfilLink(s, token, {lat: sp.at[0], lng: sp.at[1], accuracy: 15}), '');
  Object.assign(LOC.draftOf(s, key), {line: 'Parents\' house', pincode: '845401', village: 'Pipra'});
  const loc = LOC.finalLocation(s, key); assert.equal(loc.source, 'link'); assert.equal(loc.precision, 'exact'); }

// 5. Parent has a basic phone → landmark only → Area only: navigate by landmark search, call at 1 km, no distance check, customer can share live location
{ const s = fresh();
  assert.match(LOC.makeLocation({line: 'Ram Prasad ji ka ghar', pincode: '845401'}).error, /landmark/);
  const loc = LOC.makeLocation({line: 'Ram Prasad ji ka ghar', village: 'Pipra tola', landmark: 'Hanuman mandir ke peeche', postOffice: 'Pipra', pincode: '845401', voiceNote: 'directions.m4a'});
  assert.equal(loc.precision, 'area'); assert.match(LOC.navUrl(loc), /maps\/search\/.*Hanuman/); assert.ok(loc.lat, 'PIN centre used for the rough area');
  const r = book(s, loc); go(s, r); drive(s, r, 80);
  assert.ok(r.geo.callPrompted, 'call prompt at 1 km for area-only');
  assert.equal(HS.startJob(s, 'homePro', r.id, r.startOtp), '', 'no distance check: the start code alone proves arrival');
  const s2 = fresh(), r2 = book(s2, loc); go(s2, r2); const sp = LOC.DEMO_SPOTS.motihari;
  assert.equal(HS.customerShares(s2, r2.id, sp.at[0], sp.at[1]), ''); assert.equal(r2.address.precision, 'exact'); assert.match(LOC.navUrl(r2.address), /destination=26\.67/); }

// 6. Wrong pin: customer pinned at the office, PIN code is home's → "Is this the place where the work is?"
{ const s = fresh(), key = 'hs-addr', sp = LOC.DEMO_SPOTS.noida;
  Object.assign(LOC.draftOf(s, key), {source: 'gps', lat: sp.at[0], lng: sp.at[1], accuracy: 10, line: 'Flat 9', pincode: '800001'});
  assert.ok(LOC.pinMismatch(LOC.makeLocation(LOC.draftOf(s, key))) > 100);
  assert.match(LOC.finalLocation(s, key).error, /Yes, the pin is right/);
  LOC.draftOf(s, key).farOk = true; assert.ok(!LOC.finalLocation(s, key).error); }

// 7. Weak network: customer sees "last seen N min ago"; admin flags no location for 10+ min
{ const s = fresh(), r = book(s, s.savedAddresses[0]); go(s, r); HS.demoDrive(s, 'homePro', r.id);
  r.geo.lastAt -= 3 * 60000; assert.equal(HS.lastSeenMin(r), 3); assert.match(HS.customerScreen(s, r), /Last seen 3 min ago · weak network/);
  r.geo.lastAt -= 8 * 60000; assert.match(HS.adminRows(s).find(x => x.r.id === r.id).flag, /No location for 11 min/); }

// 8. Second visit from the same village house → the point saved at the first visit makes it Exact
{ const s = fresh();
  const loc = LOC.makeLocation({line: 'Ram Prasad ji ka ghar', village: 'Pipra tola', landmark: 'Hanuman mandir ke peeche', pincode: '845401'});
  const first = HS.createBooking(s, {category: 'electrician', items: [{id: 'fan', qty: 1}], date: day(1), slot: '10', address: {...loc, name: 'Parents'}, saveAddress: true}).request;
  const saved = s.savedAddresses.find(a => a.line === 'Ram Prasad ji ka ghar'); assert.equal(saved.precision, 'area');
  go(s, first); drive(s, first, 80); assert.equal(HS.startJob(s, 'homePro', first.id, first.startOtp), '');
  assert.equal(saved.precision, 'exact'); assert.equal(saved.source, 'learned');
  const second = book(s, saved); assert.equal(second.address.precision, 'exact'); }

// fix pin; admin late flag
{ const s = fresh(), r = book(s, s.savedAddresses[0]); go(s, r); drive(s, r);
  assert.equal(HS.fixPin(s, 'homePro', r.id, [28.6270, 77.3735]), ''); assert.equal(r.address.source, 'learned');
  const s2 = fresh(), r2 = book(s2, s2.savedAddresses[0]); HS.acceptJob(s2, 'homePro', r2.id); r2.date = day(-1);
  assert.match(HS.adminRows(s2).find(x => x.r.id === r2.id).flag, /Late/); }

console.log(JSON.stringify({status: 'PASS', suite: 'Location: Patna and Motihari scenarios 1–8, labels, DIGIPIN, navigation, call prompts, arrival, start check, learn, fix pin, weak network, late flag'}));
