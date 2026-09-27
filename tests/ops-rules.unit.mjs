import assert from 'node:assert/strict';
import * as R from '../js/ops-rules.js';

// 03/05 trip milestones: dharamkata only when selected, strict order, proof, crew acceptance
const withDk=R.buildMilestones(true),noDk=R.buildMilestones(false);
assert.ok(withDk.some(m=>m.key==='dharamkata'));assert.ok(!noDk.some(m=>m.key==='dharamkata'));
const trip={id:'T1',status:'pending',milestones:R.buildMilestones(true),crew:[{id:'D',role:'driver',persona:'commercialDriver',accepted:false}],vehicleId:'V1',gps:{consent:true,status:'not_started'},quantity:10,window:{from:'2026-10-01T06:00',to:'2026-10-02T18:00'}};
assert.match(R.canAdvanceMilestone(trip,'loaded',{role:'transporter'}),/first/);
assert.equal(R.advanceMilestone(trip,'terms_confirmed',{role:'goods'}).error,undefined);
assert.equal(R.advanceMilestone(trip,'vehicle_assigned',{role:'transporter'}).error,undefined);
assert.match(R.canAdvanceMilestone(trip,'crew_accepted',{role:'transporter'}),/Waiting/);
trip.crew[0].accepted=true;R.advanceMilestone(trip,'crew_accepted',{role:'commercialDriver'});
R.advanceMilestone(trip,'pickup_reached',{role:'commercialDriver'});
assert.match(R.canAdvanceMilestone(trip,'loaded',{role:'commercialDriver'}),/Loading photo/);
assert.match(R.canAdvanceMilestone(trip,'loaded',{role:'personal',proof:'x'}),/role cannot/);
R.advanceMilestone(trip,'loaded',{role:'commercialDriver',proof:'photo.jpg'});
assert.match(R.canAdvanceMilestone(trip,'in_transit',{role:'commercialDriver'}),/Dharamkata/);
R.advanceMilestone(trip,'dharamkata',{role:'commercialDriver',proof:'slip.jpg'});
R.advanceMilestone(trip,'in_transit',{role:'commercialDriver'});assert.equal(trip.gps.status,'active');
assert.equal(R.gpsAllowed(trip,'commercialDriver'),'');assert.match(R.gpsAllowed(trip,'goods'),/Driver device/);
R.advanceMilestone(trip,'delivered',{role:'commercialDriver',proof:'pod.jpg'});assert.equal(trip.gps.status,'stopped');
assert.match(R.gpsAllowed(trip,'commercialDriver'),/stopped/);
trip.hold='Breakdown';assert.match(R.canAdvanceMilestone(trip,'received',{role:'goods'}),/on hold/);trip.hold=null;
R.advanceMilestone(trip,'received',{role:'goods'});R.advanceMilestone(trip,'settled',{role:'transporter'});
assert.equal(trip.status,'closed');assert.equal(R.tripProgress(trip),100);
assert.match(R.canAdvanceMilestone(trip,'settled',{role:'transporter'}),/closed/);

// 06/07 calendar & assignment: overlaps blocked, docs, capacity, licence
const bookings=[{resourceId:'V1',ref:'MOV-603',label:'MOV-603 move',from:'2026-10-02T08:00',to:'2026-10-02T18:00',service:'movers'}];
const v={id:'V1',registration:'HR55',documents:'approved',documentExpiry:'2027-01-01',capacity:12};
assert.match(R.validateAssignment({trip:{id:'T2',quantity:10,window:{from:'2026-10-02T06:00',to:'2026-10-03T06:00'}},vehicle:v,crew:[{id:'D',role:'driver'}],bookings,workers:[{id:'D',name:'Mohan',capabilities:['driver'],licences:['Heavy vehicle']}]}),/already booked/);
assert.match(R.validateAssignment({trip:{id:'T2',quantity:20,window:{from:'2026-10-05T06:00',to:'2026-10-06T06:00'}},vehicle:v,crew:[],bookings}),/carries 12/);
assert.match(R.validateAssignment({trip:{id:'T2',quantity:5,window:{from:'2026-10-05T06:00',to:'2026-10-06T06:00'}},vehicle:{...v,documentExpiry:'2026-09-01'},crew:[],bookings}),/expired/);
assert.match(R.crewEligible({name:'Anil',capabilities:['driver'],licences:['Light motor vehicle']},'driver'),/personal licence/);
assert.equal(R.validateAssignment({trip:{id:'T2',quantity:5,window:{from:'2026-10-05T06:00',to:'2026-10-06T06:00'}},vehicle:v,crew:[{id:'D',role:'driver'}],bookings,workers:[{id:'D',name:'Mohan',capabilities:['driver'],licences:['Heavy vehicle'],status:'available'}]}),'');

// 02 customer pricing
const q=R.quoteMoving({size:'2 BHK',pkg:'standard'});assert.ok(q.total>0&&q.components.length>1);
const d=R.quoteDriver({hireType:'daily',duration:2});assert.ok(d.total>=2400);
assert.ok(R.quoteGeneral({category:'plumber'}).total>0);
assert.equal(R.assignMoverBranch({from:'Sector 62 Noida'},[{id:'A',coverage:['Delhi'],openJobs:0},{id:'B',coverage:['Noida'],openJobs:3},{id:'C',coverage:['Noida'],openJobs:1}]).id,'C');
assert.equal(R.assignMoverBranch({from:'Pune'},[{id:'A',coverage:['Noida']}]),null);

// 08/16 moving job
const job={status:'auto_assigned',inventory:[{item:'Bed',packed:false}],customerOtp:'4826',crew:[],vehicle:null};
assert.equal(R.canMoveJob(job,'slot_confirmed'),'');job.status='slot_confirmed';
assert.match(R.canMoveJob(job,'resources_allocated'),/Allocate/);job.vehicle={id:'V'};job.crew=[{id:'H'}];job.status='resources_allocated';
assert.match(R.canMoveJob(job,'packed'),/inventory/);job.inventory[0].packed=true;job.status='packed';
assert.match(R.canMoveJob(job,'loaded'),/proof/);job.status='unloaded';
assert.match(R.canMoveJob(job,'otp_verified',{otp:'1111'}),/OTP/);assert.equal(R.canMoveJob(job,'otp_verified',{otp:'4826'}),'');
assert.match(R.canMoveJob(job,'closed'),/first/);

// 17 money
assert.match(R.validatePayment({type:'advance',payer:'transporter',payee:'vehicle',amount:5000,method:'upi',reference:''}).error,/UTR/);
assert.match(R.validatePayment({type:'advance',payer:'transporter',payee:'transporter',amount:5,method:'platform'}).error,/same/);
const ledger=[{id:'PAY-1',type:'advance',payee:'vehicle',amount:5000,reference:'U1',status:'paid'}];
assert.equal(R.validatePayment({type:'advance',payer:'transporter',payee:'vehicle',amount:5000,method:'upi',reference:'U1'},ledger).duplicateOf,'PAY-1');
assert.equal(R.validatePayment({type:'advance',payer:'transporter',payee:'vehicle',amount:50000,method:'platform'},[],{approvalLimit:25000}).needsApproval,true);
const e={status:'pending_approval',history:[]};
assert.match(R.applyMoneyAction(e,'pay').error,/Cannot pay/);
R.applyMoneyAction(e,'approve');R.applyMoneyAction(e,'pay');R.applyMoneyAction(e,'confirm');assert.equal(e.status,'confirmed');
assert.match(R.applyMoneyAction(e,'reverse').error,/reason/);R.applyMoneyAction(e,'reverse',{reason:'Duplicate'});assert.equal(e.status,'reversed');assert.equal(e.history.length,4);
const s=R.earningsSummary([{payee:'commercialDriver',type:'salary',amount:3500,status:'paid'},{payee:'commercialDriver',type:'advance',amount:1000,status:'paid'},{payee:'commercialDriver',type:'reimbursement',amount:400,status:'paid'},{type:'platform_fee',amount:299,forWorker:'commercialDriver',payer:'transporter',payee:'platform',status:'paid'}],'commercialDriver');
assert.deepEqual([s.earnings,s.advances,s.reimbursements,s.platformFeesPaidByOthers],[3500,1000,400,299],'reimbursement and platform fee never count as earnings');

// 18 messages & voice
const convs=[{kind:'internal',owner:'transporter',participants:['transporter']},{kind:'job',ref:'TRP-1',participants:['goods','transporter']}];
assert.equal(R.visibleConversations(convs,'goods').length,1);assert.equal(R.visibleConversations(convs,'transporter').length,2);
assert.equal(R.parseVoiceCommand('record advance 5000 to Raj Transport for TRP-501').intent,'payment');
assert.equal(R.parseVoiceCommand('record advance 5000 to Raj Transport for TRP-501').critical,true);
assert.equal(R.parseVoiceCommand('reached dharamkata').key,'dharamkata');
assert.equal(R.parseVoiceCommand('truck broke down near Agra').type,'breakdown');
assert.equal(R.parseVoiceCommand('move 2 BHK from Noida to Gurugram on 4 October').intent,'fill_moving');
assert.equal(R.parseVoiceCommand('summarize TRP-501').ref,'TRP-501');

// 19 admin
assert.match(R.validateAdminDecision({status:'pending'},'reject',''),/reason/);
assert.equal(R.validateAdminDecision({status:'pending'},'approve',''),'');
assert.match(R.validateAdminDecision({status:'pending'},'restore','ok'),/Only suspended/);
assert.equal(R.adminResultStatus('correction'),'correction_required');

// 20 exceptions
assert.match(R.validateException({type:'breakdown',ref:'T',reason:'Tyre'}),/proof/);
assert.equal(R.validateException({type:'gps_failure',ref:'T',reason:'No network'}),'');
assert.deepEqual(R.affectedParties({parties:['goods','transporter'],crew:[{persona:'commercialDriver'},{persona:null}]}),['goods','transporter','commercialDriver']);
assert.deepEqual(R.recalcDues([{amount:10000,type:'freight',status:'approved'}],1500),{original:10000,adjustment:1500,revised:8500});

// 05/06 next load, 13 leave
assert.equal(R.nextLoadsNear('Delhi NCR',[{pickup:'Delhi, Okhla'},{pickup:'Jaipur'}]).length,1);
assert.match(R.validateLeave({memberId:'x',from:'2026-10-05',to:'2026-10-01'}),/valid leave/);
console.log(JSON.stringify({status:'PASS',suite:'P5-P8 operations rules'},null,2));
