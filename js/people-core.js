// MoveAI One — shared people core (step 1 of the unified staff & pay system; prototype, no backend).
// PERSON: one profile per mobile, owned by the worker (ID check, selfie, emergency contact, UPI/bank, documents).
// EMPLOYMENT: one per person per business (role, type, status, home branch, cover branches, teams, pay plan, history).
// BRANCHES for every business type (transporter, goods owner, truck owner, movers, stores) and TEAMS under branches
// (permanent shift/function/crew teams and temporary teams for one job), cover requests between branches, dated
// transfers, approver fallback to the owner, and trips / moving jobs assigned to a team.
// Built on top of the existing records (peopleByWorkspace, pickerStaff, storeManagers) without changing them.
import {esc, pill} from './ops.js';
import {clock} from './pay.js';
import {ROLE_TEMPLATES} from './people-rules.js';

const today = () => new Date(clock()).toISOString().slice(0, 10);
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
export const BUSINESS = ['transporter', 'goods', 'vehicle', 'movers'];
export const STORES = ['grocery', 'groceryFresh', 'electrical', 'fashion'];
const MANAGER_STORE = {groceryManager: 'grocery', groceryFreshManager: 'groceryFresh', electricalManager: 'electrical', fashionManager: 'fashion'};
export const TEAM_KINDS = {shift: 'Shift team', function: 'Department / desk', crew: 'Crew', temporary: 'Temporary (one job or day)'};
export const EMP_TYPES = {permanent: 'Permanent', temporary: 'Temporary', one_job: 'One trip / job only', contractor: 'Through a contractor'};
export const bizName = (s, b) => s.shopPartners?.[b]?.name || s.businessProfiles?.[b]?.legalName || ({transporter: 'Raj Logistics', goods: 'Sharma Foods', vehicle: 'Raj Transport', movers: 'SafeMove Packers'}[b]) || b;

// ---------- branches for every business type ----------
export function branchesFor(s, b) {
  if (STORES.includes(b)) return (s.sellerBranches?.[b] || []).map(x => ({id: x.id, name: x.name.split(' · ').pop(), open: x.open !== false, raw: x}));
  return (s.businessProfiles?.[b]?.branches || []).map(x => ({id: x.id, name: x.name, open: x.status !== 'disabled', raw: x}));
}
const brName = (s, b, id) => branchesFor(s, b).find(x => x.id === id)?.name || id || '—';

// ---------- build persons and employments from existing records ----------
export function ensureCore(s) {
  s.persons ||= {}; s.employments ||= []; s.teams ||= []; s.coverRequests ||= [];
  const seen = new Set(s.employments.map(e => `${e.source.kind}:${e.source.id}`));
  const person = (mobile, name) => { const id = `P-${mobile}`; s.persons[id] ||= {id, mobile, name, kyc: 'pending', createdAt: today(), documents: {}, consentWorkHistory: false}; return s.persons[id]; };
  const add = (b, kind, rec, role) => {
    if (!rec?.mobile || seen.has(`${kind}:${rec.id}`)) return; seen.add(`${kind}:${rec.id}`);
    const p = person(rec.mobile, rec.name), hr = s.staffHR?.[rec.id];
    // Delivery partners use 'approved' as their terminal status instead of 'active' (that vocabulary
    // predates this shared model and matching logic elsewhere already depends on it — not changed here).
    const terminal = ['active', 'approved'].includes(rec.status);
    if (terminal && p.kyc !== 'verified') p.kyc = rec.documentsStatus === 'verified' || hr?.kyc?.status === 'verified' || kind !== 'people' ? 'verified' : p.kyc;
    if (rec.bankStatus === 'verified' || hr?.payout?.verified) p.payoutVerified = true;
    const ids = rec.branchIds?.length ? rec.branchIds : [branchesFor(s, b)[0]?.id];
    s.employments.push({id: `EMP-${rec.id}`, personId: p.id, business: b, role: role || rec.role, designation: rec.designation || '', type: rec.employmentType || 'permanent', status: terminal ? 'active' : rec.status === 'offboarded' ? 'ended' : rec.status || 'invited', start: rec.joinedAt || rec.startDate || today(), end: null, homeBranch: hr?.homeBranch || ids[0], cover: hr?.cover || ids.slice(1), payPlan: rec.payPlan || (rec.payType ? {type: rec.payType, rate: rec.payAmount} : null), source: {kind, id: rec.id}, history: [{at: today(), text: 'Linked to shared profile'}]});
  };
  for (const b of BUSINESS) for (const r of s.peopleByWorkspace?.[b] || []) add(b, 'people', r);
  for (const r of s.pickerStaff || []) add(r.store, 'picker', r, s.staffHR?.[r.id]?.role || 'picker');
  for (const r of s.storeManagers || []) add(r.store, 'manager', r, 'manager');
  // Delivery partners are platform-wide, not tied to one seller — 'platform' is a nominal business tag,
  // not a real seller lookup, so reusableIdentity() below shows its own label rather than bizName(s,...).
  for (const r of Object.values(s.deliveryPartners || {})) add('platform', 'delivery', r, 'delivery');
  for(const e of s.employments){
    const rec=e.source.kind==='people'?(s.peopleByWorkspace?.[e.business]||[]).find(x=>x.id===e.source.id):e.source.kind==='picker'?(s.pickerStaff||[]).find(x=>x.id===e.source.id):e.source.kind==='manager'?(s.storeManagers||[]).find(x=>x.id===e.source.id):null;
    if(rec&&['active','approved'].includes(rec.status)&&['invited','submitted','pending'].includes(e.status))e.status='active';
  }
  if (!s.teamsSeeded) { s.teamsSeeded = true; seedTeams(s); }
  return s;
}
const emp = (s, id) => s.employments.find(e => e.id === id);
const empBySource = (s, kind, id) => s.employments.find(e => e.source.kind === kind && e.source.id === id);
function seedTeams(s) {
  const t = (business, branchId, name, kind, members, lead, extra = {}) => s.teams.push({id: uid('TEAM'), business, branchId, name, kind, members: members.filter(Boolean), lead: lead || members[0] || null, ...extra});
  const E = (k, id) => empBySource(s, k, id)?.id;
  t('transporter', 'BR-001', 'Dispatch', 'function', [E('people', 'STAFF-001')]);
  t('transporter', 'BR-001', 'Accounts', 'function', [E('people', 'STAFF-002')]);
  t('transporter', 'BR-001', 'Fleet crew A', 'crew', [E('people', 'WORKER-001'), E('people', 'WORKER-002')], E('people', 'WORKER-001'));
  t('goods', 'BR-010', 'Loading team (morning)', 'shift', [E('people', 'STAFF-010')]);
  t('vehicle', 'BR-020', 'Truck crew BR01 GX 5522', 'crew', [E('people', 'WORKER-020')]);
  t('movers', 'BR-030', 'Crew Alpha', 'crew', [E('people', 'STAFF-030')]);
  t('grocery', 'grocery-B1', 'Morning shift', 'shift', [E('picker', 'PICK-001'), E('manager', 'MGR-001')], E('picker', 'PICK-001'));
}

// ---------- who is acting ----------
export function scopeOf(s, ws) {
  if (BUSINESS.includes(ws) || STORES.includes(ws)) return {business: ws, kind: 'owner', branch: null};
  if (MANAGER_STORE[ws]) { const b = MANAGER_STORE[ws], m = (s.storeManagers || []).find(x => x.id === s.activeStoreManager?.[ws] && x.store === b) || (s.storeManagers || []).find(x => x.store === b && x.status === 'active'); const e = m && empBySource(s, 'manager', m.id); return {business: b, kind: 'manager', branch: e?.homeBranch || null, empId: e?.id}; }
  if (ws === 'staff') { const own = s.staffSession?.ownerWorkspace, m = (s.peopleByWorkspace?.[own] || []).find(x => x.id === s.selectedStaffId), e = m && empBySource(s, 'people', m.id); return own && e ? {business: own, kind: e.role === 'manager' ? 'manager' : 'member', branch: e.homeBranch, empId: e.id} : null; }
  return null;
}
const canManage = (sc, e) => sc.kind === 'owner' || (sc.kind === 'manager' && (e.homeBranch === sc.branch || e.cover.includes(sc.branch)));
export function approverFor(s, b, branchId) {
  const mgr = s.employments.find(e => e.business === b && e.status === 'active' && e.role === 'manager' && e.homeBranch === branchId);
  return mgr ? {kind: 'manager', empId: mgr.id, name: s.persons[mgr.personId]?.name} : {kind: 'owner', name: `${bizName(s, b)} owner`, note: 'No branch manager — the owner approves'};
}

// ---------- actions ----------
export function findPerson(s, mobile) { return s.persons?.[`P-${String(mobile).replace(/\D/g, '')}`] || null; }
// Finds actual reusable field values (not just a verified/true flag) from another active employment
// of this same person — only 'people' (peopleByWorkspace) records carry real identity/bank data today;
// picker/manager records have no onboarding form at all, so there is nothing to reuse from those.
// Returns null if nothing complete and reusable is found.
// Each source kind has its own storage shape: peopleByWorkspace is a dict of arrays (one per
// business), pickerStaff/storeManagers are flat arrays, deliveryPartners is a dict of individual
// records (one per demo slot, not an array) — findRecord() resolves each correctly.
function findRecord(s, kind, business, id) {
  if (kind === 'people') return (s.peopleByWorkspace?.[business] || []).find(x => x.id === id);
  if (kind === 'picker') return (s.pickerStaff || []).find(x => x.id === id);
  if (kind === 'manager') return (s.storeManagers || []).find(x => x.id === id);
  if (kind === 'delivery') return Object.values(s.deliveryPartners || {}).find(x => x.id === id);
  return null;
}
export function reusableIdentity(s, mobile, excludeBusiness) {
  const p = findPerson(s, mobile); if (!p) return null;
  const candidates = s.employments.filter(e => e.personId === p.id && e.business !== excludeBusiness && e.status === 'active');
  for (const e of candidates) {
    const rec = findRecord(s, e.source.kind, e.business, e.source.id);
    if (rec?.identity && rec?.bank && ['verified', 'complete'].includes(rec.documentsStatus) && ['verified', 'complete'].includes(rec.bankStatus)) {
      const businessName = e.source.kind === 'delivery' ? 'delivery partner work' : bizName(s, e.business);
      return {business: e.business, businessName, identity: rec.identity, bank: rec.bank, emergency: rec.emergency || null};
    }
  }
  return null;
}
// Vertical-aware hire: creates the new staff record in whichever array that business's own screens
// actually read (pickerStaff/storeManagers for retail, peopleByWorkspace for logistics) — extracted
// out of app.js's inline DOM handler so this decision is unit-testable on its own, not only reachable
// by driving a real click event. Returns true if a record was created, false if one already existed.
const RETAIL_HIRE_VERTICALS = ['grocery', 'groceryFresh', 'electrical', 'fashion'];
export function hireIntoStaff(s, ws, job, candidate, applicationId) {
  if (RETAIL_HIRE_VERTICALS.includes(ws)) {
    if (job.role === 'manager') {
      if ((s.storeManagers || []).some(m => m.store === ws && m.mobile === candidate.mobile && m.status !== 'removed')) return false;
      (s.storeManagers ||= []).push({id: `MGR-${Date.now().toString().slice(-4)}`, store: ws, name: candidate.name, mobile: candidate.mobile, branchIds: [job.branchId], status: 'invited', permissions: ['orders', 'schedule', 'timecards'], invitedAt: new Date().toISOString(), sourceApplicationId: applicationId});
      return true;
    }
    if ((s.pickerStaff || []).some(p => p.store === ws && p.mobile === candidate.mobile && p.status !== 'removed')) return false;
    (s.pickerStaff ||= []).push({id: `PICK-${Date.now().toString().slice(-4)}`, store: ws, name: candidate.name, mobile: candidate.mobile, role: job.role, branchIds: [job.branchId], status: 'profile_pending', documentsStatus: 'pending_staff', bankStatus: 'pending_staff', emergencyStatus: 'pending_staff', invitedAt: new Date().toISOString(), sourceApplicationId: applicationId});
    return true;
  }
  const ownerPeople = (s.peopleByWorkspace ||= {})[ws] ||= [];
  if (ownerPeople.some(x => x.mobile === candidate.mobile)) return false;
  ownerPeople.push({id: `STAFF-${Date.now().toString().slice(-4)}`, staffId: null, name: candidate.name, mobile: candidate.mobile, role: job.role, designation: ROLE_TEMPLATES[job.role]?.label || job.role, branchIds: [job.branchId], services: s.businessProfiles?.[ws]?.services || [], payType: job.payType, payAmount: candidate.expectedPay, status: 'profile_pending', documentsStatus: 'pending_staff', bankStatus: 'pending_staff', emergencyStatus: 'pending_staff', activeAssignments: [], vehicleAssignments: [], dues: 0, sourceApplicationId: applicationId});
  return true;
}
export function inviteNote(s, mobile, b) {
  const p = findPerson(s, mobile); if (!p) return 'New to MoveAI — they will create a profile with an OTP and verify once.';
  const active = s.employments.filter(e => e.personId === p.id && e.status === 'active');
  if (active.some(e => e.business === b)) return 'Already on your team.';
  return `${p.name} already has a MoveAI profile${p.kyc === 'verified' ? ' (ID verified)' : ''}${active.length ? ` and works at ${active.map(e => bizName(s, e.business)).join(', ')}` : ''}. They only need to accept — no new ID check or UPI setup.`;
}
export function transfer(s, ws, empId, v) {
  const sc = scopeOf(s, ws), e = emp(s, empId); if (!e || !sc || e.business !== sc.business) return 'Not found.';
  if (!canManage(sc, e)) return 'You can change only your branch staff.';
  const brs = branchesFor(s, e.business).map(b => b.id); if (!brs.includes(v.home)) return 'Choose a home branch.';
  if (v.home !== e.homeBranch && sc.kind !== 'owner') return 'Only the owner transfers staff to another branch.';
  const changes = [];
  if (v.home !== e.homeBranch) changes.push(`Home ${brName(s, e.business, e.homeBranch)} → ${brName(s, e.business, v.home)} from ${v.from || today()}${v.reason ? ` (${v.reason})` : ''}`);
  if (v.role && v.role !== e.role) { if (sc.kind !== 'owner') return 'Only the owner changes roles.'; changes.push(`Role ${e.role} → ${v.role}`); e.role = v.role; }
  if (v.type && v.type !== e.type) { changes.push(`Type ${EMP_TYPES[e.type] || e.type} → ${EMP_TYPES[v.type]}`); e.type = v.type; }
  e.homeBranch = v.home; e.cover = [].concat(v.cover || []).filter(x => x && x !== v.home && brs.includes(x));
  for (const t of s.teams.filter(t => t.business === e.business && t.members.includes(e.id) && t.branchId !== e.homeBranch && t.kind !== 'temporary' && !e.cover.includes(t.branchId))) { t.members = t.members.filter(x => x !== e.id); if (t.lead === e.id) t.lead = t.members[0] || null; changes.push(`Left ${t.name} (other branch)`); }
  if (changes.length) e.history.push({at: stamp(), text: changes.join(' · ')});
  syncSource(s, e); return '';
}
function syncSource(s, e) {
  const ids = [e.homeBranch, ...e.cover];
  const rec = e.source.kind === 'people' ? (s.peopleByWorkspace?.[e.business] || []).find(x => x.id === e.source.id) : e.source.kind === 'picker' ? (s.pickerStaff || []).find(x => x.id === e.source.id) : (s.storeManagers || []).find(x => x.id === e.source.id);
  if (rec) { rec.branchIds = ids; if (e.source.kind === 'people') { rec.employmentType = e.type; rec.role = e.role; } }
  if (s.staffHR?.[e.source.id]) { s.staffHR[e.source.id].homeBranch = e.homeBranch; s.staffHR[e.source.id].cover = e.cover; }
}
export function createTeam(s, ws, v) {
  const sc = scopeOf(s, ws); if (!sc || !['owner', 'manager'].includes(sc.kind)) return 'Not allowed.';
  if (!String(v.name || '').trim()) return 'Name the team.'; if (!TEAM_KINDS[v.kind]) return 'Choose a team type.';
  const branchId = sc.kind === 'manager' ? sc.branch : v.branchId; if (!branchesFor(s, sc.business).some(b => b.id === branchId)) return 'Choose a branch.';
  if (v.kind === 'temporary' && !v.until) return 'A temporary team needs an end date.';
  s.teams.push({id: uid('TEAM'), business: sc.business, branchId, name: v.name.trim(), kind: v.kind, members: [], lead: null, until: v.until || null, createdBy: sc.kind}); return '';
}
export function teamMember(s, ws, teamId, empId, action) {
  const sc = scopeOf(s, ws), t = s.teams.find(x => x.id === teamId), e = emp(s, empId); if (!t || !e || !sc || t.business !== sc.business) return 'Not found.';
  if (sc.kind === 'manager' && t.branchId !== sc.branch) return 'You manage only your branch teams.';
  if (action === 'add') { if(e.business!==t.business)return 'This person belongs to another business.';if(e.status!=='active')return 'Only active staff can join a team.';if(t.ended||t.until&&t.until<today())return 'This team has ended.';if(t.members.includes(empId)) return 'Already in this team.'; if (t.kind !== 'temporary' && ![e.homeBranch, ...e.cover].includes(t.branchId)) return `${s.persons[e.personId].name} is not assigned to ${brName(s, t.business, t.branchId)}. Add it as a cover branch or use a temporary team.`; t.members.push(empId); if (!t.lead) t.lead = empId; e.history.push({at: stamp(), text: `Joined ${t.name}`}); return ''; }
  if (action === 'remove') { t.members = t.members.filter(x => x !== empId); if (t.lead === empId) t.lead = t.members[0] || null; e.history.push({at: stamp(), text: `Left ${t.name}`}); return ''; }
  if (action === 'lead') { if (!t.members.includes(empId)) return 'Add them to the team first.'; t.lead = empId; return ''; }
  return 'Unknown action.';
}
export function requestCover(s, ws, v) {
  const sc = scopeOf(s, ws); if (!sc || !['owner', 'manager'].includes(sc.kind)) return 'Not allowed.';
  const toBranch = sc.kind === 'manager' ? sc.branch : v.toBranch, e = emp(s, v.empId);
  if (!e || e.business !== sc.business) return 'Choose a person.'; if (e.homeBranch === toBranch) return 'They already work at that branch.'; if (!v.date) return 'Choose the date.';
  const approver = approverFor(s, sc.business, e.homeBranch);
  const r = {id: uid('COV'), business: sc.business, empId: e.id, fromBranch: e.homeBranch, toBranch, date: v.date, reason: String(v.reason || '').trim(), status: 'requested', approver, requestedBy: sc.kind, at: stamp()};
  if (sc.kind === 'owner') { r.status = 'approved'; applyCover(s, r); }
  s.coverRequests.unshift(r);
  (s.notifications ||= []).unshift({id: uid('NT'), to: sc.business, text: `Cover ${r.status === 'approved' ? 'approved' : 'requested'}: ${s.persons[e.personId].name} at ${brName(s, sc.business, toBranch)} on ${v.date}${r.status === 'approved' ? '' : ` — ${approver.name} to approve`}`, at: stamp(), read: false});
  return '';
}
export function decideCover(s, ws, id, ok) {
  const sc = scopeOf(s, ws), r = s.coverRequests.find(x => x.id === id); if (!r || r.status !== 'requested') return 'Nothing to decide.';
  const allowed = sc.kind === 'owner' || (sc.kind === 'manager' && r.approver.kind === 'manager' && sc.empId === r.approver.empId);
  if (!allowed) return `Only ${r.approver.name} can decide this.`;
  r.status = ok ? 'approved' : 'declined'; r.decidedAt = stamp(); if (ok) applyCover(s, r); return '';
}
function applyCover(s, r) {
  const e = emp(s, r.empId); if (!e.cover.includes(r.toBranch)) { e.cover.push(r.toBranch); r.addedCoverBranch = true; }
  let t = s.teams.find(x => x.business === r.business && x.branchId === r.toBranch && x.kind === 'temporary' && x.until === r.date && x.name.startsWith('Cover'));
  if (!t) { t = {id: uid('TEAM'), business: r.business, branchId: r.toBranch, name: `Cover ${r.date}`, kind: 'temporary', members: [], lead: null, until: r.date}; s.teams.push(t); }
  if (!t.members.includes(e.id)) t.members.push(e.id);
  e.history.push({at: stamp(), text: `Cover at ${brName(s, r.business, r.toBranch)} on ${r.date}`}); syncSource(s, e);
}
export function expireTemporary(s) {
  for (const t of s.teams.filter(t => t.kind === 'temporary' && t.until && t.until < today() && !t.ended)) t.ended = true;
  for (const r of s.coverRequests.filter(r => r.status === 'approved' && r.date < today() && r.addedCoverBranch && !r.cleared)) { const e = emp(s, r.empId); if (e) { e.cover = e.cover.filter(x => x !== r.toBranch); syncSource(s, e); } r.cleared = true; }
}
export function assignWork(s, ws, kind, workId, teamId) {
  const sc = scopeOf(s, ws), t = s.teams.find(x => x.id === teamId); if (!t || !sc || t.business !== sc.business) return 'Choose a team.';
  const w = kind === 'trip' ? (s.trips || []).find(x => x.id === workId) : (s.movingJobs || []).find(x => x.id === workId);
  if (!w) return 'Work not found.'; if (w.branchId && w.branchId !== t.branchId && t.kind !== 'temporary') return `This ${kind} belongs to ${brName(s, sc.business, w.branchId)}. Use that branch's team or a temporary team.`;
  if (sc.kind === 'manager' && t.branchId !== sc.branch) return 'You manage only your branch.';
  w.teamId = t.id; w.branchId ||= t.branchId; (w.history ||= []).push({at: stamp(), by: 'People', status: `Assigned to team ${t.name}`}); return '';
}
export function branchCloseCheck(s, b, branchId) { const n = s.employments.filter(e => e.business === b && e.status === 'active' && e.homeBranch === branchId).length; return n ? `${n} staff have this as their home branch. Transfer them first.` : ''; }

// ---------- screens ----------
export function screen(s, route, ws) {
  if (route !== 'branchesTeams') return '';
  const sc = scopeOf(s, ws); if (!sc || !['owner', 'manager'].includes(sc.kind)) return '';
  ensureCore(s); expireTemporary(s);
  const brs = branchesFor(s, sc.business).filter(b => sc.kind === 'owner' || b.id === sc.branch);
  const emps = s.employments.filter(e => e.business === sc.business && e.status !== 'ended');
  const name = e => s.persons[e.personId]?.name || '—';
  const pendingCover = s.coverRequests.filter(r => r.business === sc.business && r.status === 'requested');
  const work = [...(s.trips || []).filter(t => t.owner === sc.business && !['closed', 'cancelled'].includes(t.status)).map(t => ({kind: 'trip', id: t.id, label: `${t.id} · ${t.title}`, branchId: t.branchId, teamId: t.teamId})), ...(s.movingJobs || []).filter(j => j.owner === sc.business && !['closed', 'cancelled'].includes(j.status)).map(j => ({kind: 'job', id: j.id, label: `${j.id} · ${j.size || ''} move`, branchId: j.branchId, teamId: j.teamId}))];
  return `${head('Branches & teams', `${bizName(s, sc.business)}${sc.kind === 'manager' ? ` · you manage ${brName(s, sc.business, sc.branch)}` : ''} · every person has one MoveAI profile and a home branch`)}
  ${pendingCover.length ? `<section class="panel nc-actions"><h2>Cover requests</h2>${pendingCover.map(r => `<div class="ledger-row static"><span><b>${esc(name(emp(s, r.empId)))} → ${esc(brName(s, r.business, r.toBranch))} on ${esc(r.date)}</b><small>Home ${esc(brName(s, r.business, r.fromBranch))} · ${esc(r.reason || 'No reason given')} · approver: ${esc(r.approver.name)}${r.approver.note ? ` (${esc(r.approver.note)})` : ''}</small></span><span class="row-actions"><button class="button primary compact" data-pc="cover-ok" data-id="${r.id}">Approve</button><button class="button secondary compact" data-pc="cover-no" data-id="${r.id}">Decline</button></span></div>`).join('')}</section>` : ''}
  ${brs.map(b => { const home = emps.filter(e => e.homeBranch === b.id), covers = emps.filter(e => e.cover.includes(b.id)), teams = s.teams.filter(t => t.business === sc.business && t.branchId === b.id && !t.ended), ap = approverFor(s, sc.business, b.id);
    return `<section class="panel"><h2>${esc(b.name)} · ${home.filter(e => e.status === 'active').length} staff · ${ap.kind === 'manager' ? `Manager: ${esc(ap.name)}` : 'No manager — owner approves'}</h2>
    ${home.map(e => personRow(s, sc, e)).join('') || '<p class="muted">No one has this as their home branch.</p>'}${covers.length ? `<small class="muted">Can cover here: ${covers.map(e => esc(name(e))).join(', ')}</small>` : ''}
    <h3>Teams</h3>${teams.map(t => `<div class="claim-row"><b>${esc(t.name)}</b> <small class="muted">${esc(TEAM_KINDS[t.kind])}${t.until ? ` · until ${esc(t.until)}` : ''} · lead: ${esc(t.lead ? name(emp(s, t.lead)) : 'none')}</small><div class="chip-row">${t.members.map(id => `<span class="chip">${esc(name(emp(s, id)))}${t.lead === id ? ' ★' : ''} <button class="button text compact" data-pc="team-remove" data-team="${t.id}" data-id="${id}" title="Remove">✕</button>${t.lead === id ? '' : `<button class="button text compact" data-pc="team-lead" data-team="${t.id}" data-id="${id}" title="Make lead">★</button>`}</span>`).join('') || '<small class="muted">No members</small>'}</div><form class="inline-form" data-pc-form="team-add" data-team="${t.id}"><select name="empId">${emps.filter(e => e.business===sc.business&&e.status==='active'&&!t.members.includes(e.id) && (t.kind === 'temporary' || [e.homeBranch, ...e.cover].includes(b.id))).map(e => `<option value="${e.id}">${esc(name(e))}</option>`).join('')}</select><button class="button secondary compact">Add to team</button></form></div>`).join('') || '<p class="muted">No teams yet.</p>'}
    <form class="inline-form" data-pc-form="team-new" data-branch="${b.id}"><input name="name" placeholder="New team (e.g. Evening shift, Crew B, Loading desk)"><select name="kind">${Object.entries(TEAM_KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input name="until" type="date" title="End date (temporary teams)"><button class="button secondary compact">Create team</button></form>
    <form class="inline-form" data-pc-form="cover" data-branch="${b.id}"><b>Request cover at ${esc(b.name)}</b><select name="empId">${emps.filter(e => e.status === 'active' && e.homeBranch !== b.id).map(e => `<option value="${e.id}">${esc(name(e))} (home ${esc(brName(s, sc.business, e.homeBranch))})</option>`).join('')}</select><input name="date" type="date" value="${today()}"><input name="reason" placeholder="Reason"><button class="button secondary compact">Request</button></form></section>`; }).join('')}
  ${work.length ? `<section class="panel"><h2>Assign work to a team</h2>${work.map(w => `<form class="inline-form" data-pc-form="assign" data-kind="${w.kind}" data-id="${w.id}"><span><b>${esc(w.label)}</b> <small class="muted">${esc(brName(s, sc.business, w.branchId))}${w.teamId ? ` · team ${esc(s.teams.find(t => t.id === w.teamId)?.name || '')}` : ''}</small></span><select name="teamId">${s.teams.filter(t => t.business === sc.business && !t.ended && (sc.kind === 'owner' || t.branchId === sc.branch)).map(t => `<option value="${t.id}" ${t.id === w.teamId ? 'selected' : ''}>${esc(t.name)} · ${esc(brName(s, sc.business, t.branchId))}</option>`).join('')}</select><button class="button secondary compact">Assign</button></form>`).join('')}</section>` : ''}<p class="pc-error field-error" hidden></p>`;
}
function personRow(s, sc, e) {
  const p = s.persons[e.personId], other = s.employments.filter(x => x.personId === p.id && x.id !== e.id && x.status === 'active'), brs = branchesFor(s, e.business);
  return `<div class="ledger-row static hr-person"><span><b>${esc(p.name)}</b> <small class="muted">${esc(e.designation || e.role)} · ${esc(EMP_TYPES[e.type] || e.type)} · ${esc(p.mobile)}</small><small class="block">Home: <b>${esc(brName(s, e.business, e.homeBranch))}</b>${e.cover.length ? ` · Also covers: ${e.cover.map(c => esc(brName(s, e.business, c))).join(', ')}` : ''} · Teams: ${s.teams.filter(t => t.members.includes(e.id) && !t.ended).map(t => esc(t.name)).join(', ') || 'none'}</small><small class="block">${pill(e.status)} Profile ${pill(p.kyc)}${p.payoutVerified ? ` ${pill('payout_verified')}` : ''}${other.length ? ` · also works at ${other.map(x => esc(bizName(s, x.business))).join(', ')}` : ''}</small>${e.history.length > 1 ? `<details><summary class="muted">History</summary>${e.history.slice().reverse().map(h => `<small class="block muted">${esc(h.at)} · ${esc(h.text)}</small>`).join('')}</details>` : ''}</span>
  ${canManage(sc, e) ? `<details><summary class="button secondary compact">Change</summary><form class="inline-form" data-pc-form="transfer" data-id="${e.id}"><label>Home <select name="home" ${sc.kind === 'owner' ? '' : 'disabled'}>${brs.map(b => `<option value="${b.id}" ${b.id === e.homeBranch ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>${brs.map(b => `<label><input type="checkbox" name="cover" value="${b.id}" ${e.cover.includes(b.id) ? 'checked' : ''}> covers ${esc(b.name)}</label>`).join('')}${sc.kind === 'owner' ? `<select name="type">${Object.entries(EMP_TYPES).map(([k, l]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${l}</option>`).join('')}</select><input name="from" type="date" value="${today()}" title="Effective from">` : ''}<input name="reason" placeholder="Reason"><button class="button primary compact">Save</button></form></details>` : ''}</div>`;
}
export function bind(root, api) {
  const S = () => api.getState(), ws = () => S().currentWorkspace, err = m => { const e = root.querySelector('.pc-error'); if (e) { e.textContent = m; e.hidden = !m; } else api.toast(m); };
  const done = (e, ok) => { if (e) return err(e); api.save(); api.render(); if (ok) api.toast(ok); };
  root.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { const s = S(), k = b.dataset.pc;
    if (k === 'cover-ok' || k === 'cover-no') return done(decideCover(s, ws(), b.dataset.id, k === 'cover-ok'), k === 'cover-ok' ? 'Cover approved' : 'Cover declined');
    if (k === 'team-remove') return done(teamMember(s, ws(), b.dataset.team, b.dataset.id, 'remove'), 'Removed from team');
    if (k === 'team-lead') return done(teamMember(s, ws(), b.dataset.team, b.dataset.id, 'lead'), 'Team lead changed'); });
  root.querySelectorAll('form[data-pc-form]').forEach(f => f.onsubmit = e => { e.preventDefault(); const s = S(), fd = new FormData(f), v = Object.fromEntries(fd), k = f.dataset.pcForm;
    if (k === 'transfer') { const cur = s.employments.find(x => x.id === f.dataset.id); return done(transfer(s, ws(), f.dataset.id, {...v, home: v.home || cur.homeBranch, cover: fd.getAll('cover')}), 'Saved'); }
    if (k === 'team-new') return done(createTeam(s, ws(), {...v, branchId: f.dataset.branch}), 'Team created');
    if (k === 'team-add') return done(teamMember(s, ws(), f.dataset.team, v.empId, 'add'), 'Added to team');
    if (k === 'cover') return done(requestCover(s, ws(), {...v, toBranch: f.dataset.branch}), 'Cover request saved');
    if (k === 'assign') return done(assignWork(s, ws(), f.dataset.kind, f.dataset.id, v.teamId), 'Assigned');
  });
}
