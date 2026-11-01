import assert from 'node:assert/strict';
import * as WH from '../js/workspace-hub.js';
import {PRODUCTS} from '../js/products.js';
import {ROLE_CONFIG} from '../js/config.js';
import {SEED} from '../js/mock-data.js';
import {channelsFor, prefs, mine} from '../js/notify-center.js';
import {OPS_SEED} from '../js/ops-data.js';

const clone = v => JSON.parse(JSON.stringify(v));

// Four apps for people: seller and store staff live in Business, delivery in Partner.
assert.equal(WH.appOf('seller'), 'business');
assert.equal(WH.appOf('picker'), 'business');
assert.equal(WH.appOf('delivery'), 'partner');
assert.equal(WH.appOf('customer'), 'customer');
assert.ok(WH.sameApp('seller', 'business') && !WH.sameApp('seller', 'partner'));
const bizRoles = WH.appRoles('business', PRODUCTS);
for (const ws of ['transporter', 'grocery', 'groceryManager', 'picker', 'personal']) assert.ok(bizRoles.includes(ws), ws);
assert.ok(!bizRoles.includes('deliveryPartner'));
assert.ok(WH.appRoles('partner', PRODUCTS).includes('deliveryPartner'));

// Groups by business with the person's role.
assert.deepEqual(WH.workspaceGroup('groceryManager', ROLE_CONFIG), {key: 'grocery', name: 'ABC Grocery', role: 'Store manager'});
assert.equal(WH.workspaceGroup('pickerFresh', ROLE_CONFIG).role, 'Store staff');
assert.equal(WH.workspaceGroup('grocery', ROLE_CONFIG).role, 'Store owner');
assert.equal(WH.toneOf('grocery'), WH.toneOf('picker'), 'same business keeps one colour');
assert.equal(WH.toneOf('personal'), 0);

// Switcher: current first, then most recently used; search filters; invitations listed.
{
  const s = clone(SEED); s.currentWorkspace = 'transporter';
  WH.recordUse(s, 'grocery', 2000); WH.recordUse(s, 'vehicle', 1000);
  const m = WH.switcherModel(s, 'business', {PRODUCTS, roleConfig: ROLE_CONFIG, unreadFor: ws => ws === 'goods' ? 3 : 0});
  assert.equal(m.groups[0].items[0].ws, 'transporter');
  assert.equal(m.groups[1].key, 'grocery', 'most recently used business next');
  assert.equal(m.groups.flatMap(g => g.items).find(i => i.ws === 'goods').unread, 3);
  assert.ok(m.showSearch, 'search appears with more than five workspaces');
  const f = WH.switcherModel(s, 'business', {PRODUCTS, roleConfig: ROLE_CONFIG, query: 'fresh'});
  assert.ok(f.groups.length && f.groups.every(g => g.items.every(i => /fresh/i.test(`${i.label} ${i.group}`))));
  assert.ok(!WH.switcherModel(s, 'business', {PRODUCTS, roleConfig: ROLE_CONFIG}).groups.flatMap(g => g.items).some(i => i.ws === 'deliveryPartner'));
}

// Switch guard: active delivery blocks, held COD cash warns, an open pick task blocks.
{
  const s = clone(SEED);
  const id = s.deliveryPartners?.deliveryPartner?.id || 'DP-001';
  s.deliveryPartners = {...(s.deliveryPartners || {}), deliveryPartner: {...(s.deliveryPartners?.deliveryPartner || {}), id}};
  s.customerOrders = [{id: 'ORD-1', status: 'out_for_delivery', deliveryAssignment: {partnerId: id, status: 'picked_up'}}];
  assert.equal(WH.switchBlocker(s, 'deliveryPartner', 'personal').level, 'block');
  s.customerOrders = [{id: 'ORD-2', status: 'delivered', deliveryAssignment: {partnerId: id, status: 'delivered'}, codCash: {status: 'collected', partnerId: id}}];
  assert.equal(WH.switchBlocker(s, 'deliveryPartner', 'personal').level, 'warn');
  s.customerOrders = [{id: 'ORD-3', status: 'accepted', pickerId: 'PICK-001', pick: {startedAt: 'now'}}];
  s.activePicker = {picker: 'PICK-001'};
  assert.equal(WH.switchBlocker(s, 'picker', 'grocery').level, 'block');
  s.customerOrders[0].pick.completedAt = 'later';
  assert.equal(WH.switchBlocker(s, 'picker', 'grocery').level, '');
  assert.equal(WH.switchBlocker(s, 'grocery', 'grocery').level, '');
}

// Deep links carry the workspace.
assert.equal(WH.wsFromHash('#/shopOrders?ws=groceryManager'), 'groceryManager');
assert.equal(WH.wsFromHash('#/home'), '');
assert.equal(WH.linkFor('shopOrders', 'grocery'), '#/shopOrders?ws=grocery');

// Business buying profile at checkout.
{
  const s = clone(SEED);
  const list = WH.buyingProfiles(s, ROLE_CONFIG);
  assert.equal(list[0].key, 'personal');
  const goods = list.find(p => p.key === 'goods');
  assert.ok(goods && /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(goods.gstin));
  assert.deepEqual(WH.profileBilling(s, 'goods', ROLE_CONFIG), {name: 'Sharma Foods', gstin: goods.gstin, profile: 'goods'});
  s.workspaces = ['personal'];
  assert.equal(WH.buyingProfiles(s, ROLE_CONFIG).length, 1, 'no business, no profile choice');
}

// Money confirmation names the workspace.
assert.equal(WH.moneyConfirmText({}, 'grocery', ROLE_CONFIG, 'Pay ₹12,000'), 'Pay ₹12,000 from ABC Grocery (store owner)?');

// Shared store device: PIN switch, wrong PIN count, lockout, owner sets PIN.
{
  const s = clone(SEED);
  assert.ok(WH.storeStaff(s, 'grocery').length >= 1);
  const staffId = WH.storeStaff(s, 'grocery')[0].id;
  assert.match(WH.pinSwitch(s, 'grocery', staffId, '0000').error, /Wrong PIN/);
  const ok = WH.pinSwitch(s, 'grocery', staffId, WH.DEMO_STAFF_PIN);
  assert.equal(ok.ws, 'picker'); assert.equal(s.activePicker.picker, staffId); assert.equal(s.sharedDevice.store, 'grocery');
  assert.equal(WH.setStaffPin(s, staffId, '12a4'), 'Use exactly 4 digits.');
  assert.equal(WH.setStaffPin(s, staffId, '4321'), '');
  assert.ok(WH.pinSwitch(s, 'grocery', staffId, '1234').error, 'old demo PIN no longer works');
  for (let i = 0; i < 5; i++) WH.pinSwitch(s, 'grocery', staffId, '0000');
  assert.match(WH.pinSwitch(s, 'grocery', staffId, '4321').error, /Too many/);
  assert.match(WH.pinSwitch(s, 'transporter', staffId, '4321').error, /Choose a staff/);
}

// Muting a workspace stops push/SMS/WhatsApp except urgent and account alerts.
{
  const s = clone(SEED);
  prefs(s, 'picker').muted = true;
  assert.deepEqual(channelsFor(s, 'picker', 'ORD-1: Items ready to pick'), []);
  assert.ok(channelsFor(s, 'picker', 'ORD-1: delivery code 4826').length > 0, 'codes still arrive');
}

// Demo-only tools switch.
assert.equal(WH.demoModeFromUrl('?demo=off', 'on'), 'off');
assert.equal(WH.demoModeFromUrl('', 'off'), 'off');
assert.equal(WH.demoModeFromUrl('?demo=on', 'off'), 'on');
assert.equal(WH.demoModeFromUrl('', null), 'on');


// ---------- round 2: branches, roles, staff memberships, field-job guard, alerts, buying defaults, money ----------
const full = () => ({...clone(SEED), ...clone(OPS_SEED)});
{
  const s = full();
  assert.deepEqual(WH.branchInfo(s, 'grocery').current, {id: 'grocery-B1', name: 'Karol Bagh'});
  assert.equal(WH.branchInfo(s, 'transporter').current.name, 'All branches');
  assert.deepEqual(WH.branchInfo(s, 'transporter').options.map(o => o.name), ['All branches', 'Noida HQ', 'Jaipur Branch']);
  assert.equal(WH.branchInfo(s, 'vehicle').current.name, 'Patna Yard', 'single branch shown by name');
  assert.equal(WH.branchInfo(s, 'vehicle').canChoose, false);
  assert.equal(WH.chooseBranch(s, 'transporter', 'BR-002'), '');
  assert.equal(WH.branchInfo(s, 'transporter').current.name, 'Jaipur Branch');
  assert.equal(WH.chooseBranch(s, 'grocery', 'grocery-B2'), '');
  assert.equal(WH.branchInfo(s, 'grocery').current.name, 'Noida');
  assert.equal(WH.chooseBranch(s, 'transporter', 'BR-999'), 'Branch unavailable.');
  assert.equal(WH.chooseBranch(s, 'personal', 'x'), 'This workspace has no branches to choose.');
  assert.equal(WH.workspaceGroup('transporter', ROLE_CONFIG, s).role, 'Owner · Transporter');
  assert.equal(WH.workspaceGroup('movers', ROLE_CONFIG, s).role, 'Owner · Mover Owner');
  const m = WH.switcherModel(s, 'business', {PRODUCTS, roleConfig: ROLE_CONFIG});
  const tr = m.groups.flatMap(g => g.items).find(i => i.ws === 'transporter');
  assert.equal(tr.branch, 'Jaipur Branch'); assert.equal(tr.branches.length, 3);
  assert.ok(WH.switcherModel(s, 'business', {PRODUCTS, roleConfig: ROLE_CONFIG, query: 'jaipur'}).groups.some(g => g.items.some(i => i.ws === 'transporter')), 'search matches branch');
}
{
  // One person, staff at two businesses
  const s = full();
  s.peopleByWorkspace.vehicle = [...(s.peopleByWorkspace.vehicle || []), {id: 'VSTAFF-9', name: 'Mohan Yadav', mobile: '9876501103', role: 'driver', branchIds: ['BR-020'], status: 'active'}];
  s.staffSession = {ownerWorkspace: 'transporter', memberId: 'WORKER-001', mobile: '9876501103', verified: true}; s.selectedStaffId = 'WORKER-001'; s.workspaces.push('staff');
  const ms = WH.staffMemberships(s);
  assert.deepEqual(ms.map(x => `${x.ownerWorkspace}:${x.member.id}`), ['transporter:WORKER-001', 'vehicle:VSTAFF-9']);
  const rows = WH.switcherModel(s, 'business', {PRODUCTS, roleConfig: ROLE_CONFIG}).groups.flatMap(g => g.items).filter(i => i.ws === 'staff');
  assert.deepEqual(rows.map(r => [r.label, r.role, r.branch]), [['Raj Logistics · Mohan Yadav', 'Driver', 'Noida HQ'], ['Raj Transport · Mohan Yadav', 'Driver', 'Patna Yard']]);
  assert.deepEqual(WH.workspaceGroup('staff', ROLE_CONFIG, s), {key: 'raj-logistics', name: 'Raj Logistics', role: 'Driver'});
  assert.ok(WH.useMembership(s, 'vehicle', 'VSTAFF-9'));
  assert.equal(s.staffSession.ownerWorkspace, 'vehicle'); assert.equal(WH.workspaceGroup('staff', ROLE_CONFIG, s).name, 'Raj Transport');
  assert.equal(WH.useMembership(s, 'goods', 'NOPE'), null);
  // Field-job guard: staff driver on a live trip (TRP-501 is loaded with WORKER-001)
  WH.useMembership(s, 'transporter', 'WORKER-001');
  assert.deepEqual(WH.liveFieldJob(s, 'staff'), {kind: 'Trip', id: 'TRP-501', step: 'loaded'});
  assert.equal(WH.switchBlocker(s, 'staff', 'transporter').level, 'block');
}
{
  const s = full();
  assert.equal(WH.switchBlocker(s, 'commercialDriver', 'personal').level, 'block', 'driver on loaded trip');
  assert.equal(WH.switchBlocker(s, 'helper', 'personal').level, 'block', 'helper on the same trip');
  assert.equal(WH.switchBlocker(s, 'transporter', 'goods').level, '', 'owners are never blocked');
  s.trips.find(t => t.id === 'TRP-501').status = 'delivered';
  assert.equal(WH.switchBlocker(s, 'commercialDriver', 'personal').level, '');
  s.movingJobs[0].status = 'in_transit'; s.movingJobs[0].crew = [{id: 'X', persona: 'helper', accepted: true}];
  assert.match(WH.switchBlocker(s, 'helper', 'personal').reason, /Moving job MOV-601/);
  s.serviceRequests = [{id: 'SR-9', provider: 'personalDriver', status: 'in_progress'}];
  assert.match(WH.switchBlocker(s, 'personalDriver', 'personal').reason, /Job SR-9/);
}
{
  // Branch-aware alerts for staff
  const s = full();
  s.staffSession = {ownerWorkspace: 'transporter', memberId: 'STAFF-001'}; s.selectedStaffId = 'STAFF-001';
  s.notifications = [{id: 'a', to: 'transporter', text: 'TRP-501: loading photo uploaded'}, {id: 'b', to: 'transporter', text: 'TRP-504: delivered with POD'}, {id: 'c', to: 'transporter', text: 'TRP-504: ₹640 payment approved'}, {id: 'd', to: 'transporter', text: 'LD-1: owner-only note'}];
  WH.tagNotificationBranches(s);
  assert.deepEqual(s.notifications.map(n => n.branchId || ''), ['BR-002', 'BR-001', 'BR-001', '']);
  assert.deepEqual(mine(s, 'staff').map(n => n.id), ['b', 'c'], 'manager at Noida HQ sees only Noida HQ work');
  s.selectedStaffId = 'STAFF-002'; s.staffSession.memberId = 'STAFF-002';
  assert.deepEqual(mine(s, 'staff').map(n => n.id), ['c'], 'accountant sees branch money alerts only');
  assert.deepEqual(mine(s, 'transporter').map(n => n.id), ['a', 'b', 'c', 'd'], 'owner still sees everything');
}
{
  // Buying profile defaults and memory
  const s = full();
  assert.deepEqual(WH.buyingDefaults(s, 'transporter', ROLE_CONFIG), {method: 'upi', email: 'accounts@rajlogistics.example'});
  WH.rememberBuying(s, 'transporter', {method: 'card', email: 'ops@raj.example'});
  assert.deepEqual(WH.buyingDefaults(s, 'transporter', ROLE_CONFIG), {method: 'card', email: 'ops@raj.example'});
  assert.deepEqual(WH.buyingDefaults(s, 'personal', ROLE_CONFIG), {method: '', email: ''});
}
{
  // Money confirmation detection and wording
  for (const t of ['Settle ₹4,200', 'Run weekly payouts', 'Record payment', 'Record courier payout', 'Pay seller', 'Pay monthly salary · ₹30,000', 'Pay in cash (staff confirms)', 'Pay ₹500 now', 'Give advance', 'Approve refund', 'Approve payday · ₹12,000', 'Close trip as settled', 'Release']) assert.ok(WH.isMoneyAction(t), t);
  for (const t of ['Pay workers', 'Payroll', 'Payslip', 'Monthly payroll', 'Prepare payroll', 'Save payout account', 'View earnings and payouts', 'Open pay', 'Dispute refund', 'Open khata and pay final settlement']) assert.ok(!WH.isMoneyAction(t), t);
  assert.equal(WH.amountIn('Approve payday · ₹12,000'), '₹12,000');
  assert.equal(WH.moneyConfirm({action: 'Give advance', amount: '₹5,000', from: 'Raj Logistics', to: 'Raj Transport', ref: 'TRP-501'}).text, 'Give advance ₹5,000 from Raj Logistics to Raj Transport for TRP-501?');
  assert.ok(WH.DEMO_ONLY_SELECTORS.includes('[data-action="test-staff-invite"]') && WH.DEMO_ONLY_TEXT.test('Demo: advance 7 days'));
}

console.log(JSON.stringify({status: 'PASS', suite: 'Workspace hub: apps, switcher, branches, staff memberships, field-job guard, branch alerts, buying defaults, money confirm, PIN, mute, demo flag'}));
