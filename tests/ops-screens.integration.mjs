import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as OPS from '../js/ops.js';
import {ROLE_CONFIG,allowedRoutes} from '../js/config.js';
import {canOpen} from '../js/permissions.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const MAP={book:'bookScreen',bookingReview:'bookingReviewScreen',services:'servicesScreen',serviceDetail:'serviceDetailScreen',trips:'tripsScreen',tripDetail:'tripDetailScreen',assignTrip:'assignTripScreen',vehicleOffer:'vehicleOfferScreen',vehicleDetail:'vehicleDetailScreen',addVehicle:'addVehicleScreen',movingJob:'movingJobScreen',myJobs:'myJobsScreen',driverJob:'driverJobScreen',upgradeDriver:'upgradeDriverScreen',conversation:'conversationScreen',payment:'paymentFormScreen',paymentDetail:'paymentDetailScreen',exceptions:'exceptionsScreen',exceptionDetail:'exceptionDetailScreen',verification:'verificationScreen',verificationItem:'verificationItemScreen',cases:'casesScreen',staffEvents:'staffEventsScreen',notifications:'notificationsScreen',messages:'messagesScreen',money:'moneyScreen'};
let rendered=0;
function stateFor(role){const s=clone(SEED);s.currentWorkspace=role;if(role==='staff'){s.staffSession={ownerWorkspace:'transporter',verified:true};const m=(s.peopleByWorkspace.transporter||[]).find(p=>p.status==='active');s.selectedStaffId=m?.id}return s}
for(const role of Object.keys(ROLE_CONFIG)){
  const allowed=allowedRoutes(role);
  for(const [route,fn] of Object.entries(MAP)){
    if(!allowed.has(route))continue;
    const s=stateFor(role);
    let html;
    try{html=OPS[fn](s)}catch(e){throw new Error(`${role}/${route} threw: ${e.stack}`)}
    assert.equal(typeof html,'string',`${role}/${route}`);
    assert.ok(html.length>120,`${role}/${route} too short`);
    assert.ok(!/\bundefined\b|\bNaN\b|\[object Object\]/.test(html.replace(/<[^>]+>/g,' ')),`${role}/${route} leaks undefined/NaN: ${html.replace(/<[^>]+>/g,' ').match(/.{40}(undefined|NaN|\[object Object\]).{40}/)?.[0]}`);
    rendered++;
  }
  if(['goods','transporter','vehicle','movers'].includes(role)){const s=stateFor(role);assert.ok(OPS.fleetScreen(s).includes('calendar'),`${role} fleet calendar`)}
}
const movers=stateFor('movers');assert.ok(OPS.movingQueueScreen(movers).length>200);

// boundaries
assert.equal(canOpen('personal','assignTrip'),false,'customer cannot assign crew');
assert.equal(canOpen('helper','verification'),false,'helper cannot open admin verification');
assert.equal(canOpen('personalDriver','tripDetail'),false,'personal driver has no truck trips');
assert.equal(canOpen('goods','movingJob'),false);
assert.equal(canOpen('admin','book'),false);
// scoped data
const cd=stateFor('commercialDriver');assert.ok(OPS.visibleTrips(cd).every(t=>t.crew.some(c=>c.persona==='commercialDriver')));
const buyer=stateFor('goods');assert.ok(OPS.visibleTrips(buyer).length>0);
const internalHidden=stateFor('goods');assert.ok(!OPS.messagesScreen(internalHidden).includes('Raj Logistics · Operations team'),'goods never sees transporter internal chat');
const tr=stateFor('transporter');assert.ok(OPS.messagesScreen(tr).includes('Raj Logistics · Operations team'));
console.log(JSON.stringify({status:'PASS',renderedScreens:rendered},null,2));
