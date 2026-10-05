// MoveAI One — worker hub (step 3): one "My work & pay" for every worker, whatever apps they use.
// Current jobs (switcher when there are several), money per employer (balance, advance left, cash to confirm),
// MoveAI partner roles (delivery partner, personal driver) with the MoveAI wallet, past work with final settlement,
// role history (branch / role / team changes), yearly earnings statement across employers and the wallet,
// work history the worker can share, and the shared profile and documents.
import {esc, pill, inr, opsCtx} from './ops.js';
import * as PC from './people-core.js';
import * as WF from './workforce.js';
import * as HR from './store-hr.js';
import * as Pay from './pay.js';

const roleName = r => ({picker: 'Picker', packer: 'Packer', cashier: 'Cashier', manager: 'Manager', helper: 'Khalasi / helper', driver: 'Driver', accounts: 'Accounts', operations: 'Operations'})[r] || r;
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const yearOf = t => { const d = typeof t === 'number' ? new Date(t) : new Date(Date.parse(t) || Date.now()); return isNaN(d) ? new Date().getFullYear() : d.getFullYear(); };
export const WORKER_WS = ['commercialDriver', 'personalDriver', 'helper', 'staff', 'picker', 'pickerFresh', 'pickerElectrical', 'pickerFashion', 'deliveryPartner', 'deliveryPartner2'];
const ROLE_HOME = {picker: 'pickTasks', driver: 'myJobs', helper: 'myJobs', delivery: 'deliveryJobs', staff: 'work'};

// ---------- demo person: Sanju (picker → office staff → khalasi; past job at ABC Grocery) ----------
export function ensureHub(s) {
  PC.ensureCore(s);
  Object.values(s.deliveryPartners || {}).forEach((d, i) => { d.mobile ||= `98765060${String(i + 1).padStart(2, '0')}`; const id = `P-${d.mobile}`; s.persons[id] ||= {id, mobile: d.mobile, name: d.name, kyc: d.status === 'approved' ? 'verified' : 'pending', payoutVerified: true, documents: {'Driving licence': {status: 'verified', expiry: '2031-05-31'}, 'Vehicle RC': {status: 'verified', expiry: '2034-01-31'}, Insurance: {status: 'verified', expiry: '2027-03-31'}}, createdAt: '2026-06-01'}; });
  const anil = (s.candidates || []).find(c => c.id === 'CAND-004'); if (anil) { const id = `P-${anil.mobile}`; s.persons[id] ||= {id, mobile: anil.mobile, name: anil.name, kyc: 'verified', payoutVerified: true, documents: {'Driving licence': {status: 'verified', expiry: '2030-08-31'}}, createdAt: '2026-05-01'}; }
  if (!s.sanjuSeeded) {
    s.sanjuSeeded = true; const mob = '9876507001';
    (s.pickerStaff ||= []).push({id: 'PICK-SANJU', store: 'grocery', name: 'Sanju Kumar', mobile: mob, status: 'offboarded', branchIds: ['grocery-B1'], joinedAt: '2026-01-02', offboardedAt: '2026-01-31'});
    (s.staffLedger ||= []).push({id: 'SL-SJ1', store: 'grocery', personId: 'PICK-SANJU', branchId: 'grocery-B1', type: 'earning', amount: 9900, note: 'Shift pay · 22 shifts at Karol Bagh', status: 'posted', at: '31 Jan 2026', ts: Date.parse('2026-01-31'), period: '2026-01'}, {id: 'SL-SJ2', store: 'grocery', personId: 'PICK-SANJU', branchId: 'grocery-B1', type: 'allowance', amount: 1320, note: 'Meal allowance · 22 shifts', status: 'posted', at: '31 Jan 2026', ts: Date.parse('2026-01-31'), period: '2026-01'}, {id: 'SL-SJ3', store: 'grocery', personId: 'PICK-SANJU', branchId: 'grocery-B1', type: 'payment', amount: 11220, note: 'Final settlement', method: 'upi', status: 'posted', at: '31 Jan 2026', ts: Date.parse('2026-01-31')});
    (s.peopleByWorkspace.transporter ||= []).push({id: 'WORKER-003', name: 'Sanju Kumar', mobile: mob, role: 'helper', designation: 'Khalasi', branchIds: ['BR-002'], status: 'active', employmentType: 'permanent', payType: 'per_trip', payAmount: 1800, joinedAt: '2026-02-01', documentsStatus: 'verified', bankStatus: 'verified'});
    PC.ensureCore(s);
    const e = s.employments.find(x => x.source.id === 'WORKER-003'); if (e) { e.role = 'helper'; e.designation = 'Khalasi'; e.start = '2026-02-01'; e.history = [{at: '01 Feb 2026', text: 'Joined as Operations staff · Noida HQ · Dispatch team'}, {at: '01 Aug 2026', text: 'Role Operations staff → Khalasi · Home Noida HQ → Jaipur Branch'}, {at: '01 Aug 2026', text: 'Joined Fleet crew (Jaipur)'}]; }
    const old = s.employments.find(x => x.source.id === 'PICK-SANJU'); if (old) { old.status = 'ended'; old.start = '2026-01-02'; old.end = '2026-01-31'; old.history = [{at: '02 Jan 2026', text: 'Joined as Picker · Karol Bagh · Morning shift'}, {at: '31 Jan 2026', text: 'Left · final settlement ₹11,220 paid by UPI'}]; }
    s.persons[`P-${mob}`].kyc = 'verified'; s.persons[`P-${mob}`].createdAt = '2026-01-02'; s.persons[`P-${mob}`].payoutVerified = true; s.persons[`P-${mob}`].documents = {PAN: {status: 'verified'}};
    WF.ensureWorkforce?.(s); (s.accruals ||= []).push({id: 'ACR-SJ1', workspace: 'transporter', workerKey: 'staff:WORKER-003', type: 'wage', amount: 1800, note: 'Trip wage · TRP-503', status: 'posted', at: '02 Oct 2026', ref: 'TRP-503'}, {id: 'ACR-SJ2', workspace: 'transporter', workerKey: 'staff:WORKER-003', type: 'bata', amount: 900, note: 'Bata 3 days · TRP-503', status: 'posted', at: '02 Oct 2026', ref: 'TRP-503'});
  }
  // keep employment status in step with the source records (offboarding elsewhere ends the employment)
  for (const e of s.employments) { const src = e.source.kind === 'people' ? (s.peopleByWorkspace?.[e.business] || []).find(x => x.id === e.source.id) : e.source.kind === 'picker' ? (s.pickerStaff || []).find(x => x.id === e.source.id) : (s.storeManagers || []).find(x => x.id === e.source.id); if (src && ['offboarded', 'removed'].includes(src.status) && e.status !== 'ended') { e.status = 'ended'; e.end ||= src.offboardedAt || new Date().toISOString().slice(0, 10); e.history.push({at: e.end, text: 'Left'}); } }
  return s;
}

// ---------- who is the worker on this screen ----------
export function whoAmI(s, ws) {
  ensureHub(s);
  if (s.hubViewAs && s.hubViewAsWs === ws && s.persons[s.hubViewAs]) return s.persons[s.hubViewAs];
  if (ws === 'staff') { const {member} = opsCtx(s); return member?.mobile ? PC.findPerson(s, member.mobile) : null; }
  if (['commercialDriver', 'helper'].includes(ws)) for (const b of PC.BUSINESS) { const w = WF.workforceOf(s, b).find(v => v.kind === 'team' && v.keys.includes(ws)); const m = w && (s.peopleByWorkspace?.[b] || []).find(x => x.id === w.id || `staff:${x.id}` === w.key); if (m) return PC.findPerson(s, m.mobile); }
  if (ws === 'personalDriver') { const c = (s.candidates || []).find(x => x.id === 'CAND-004'); return c ? PC.findPerson(s, c.mobile) : null; }
  if (s.deliveryPartners?.[ws]) return PC.findPerson(s, s.deliveryPartners[ws].mobile);
  const a = HR.actor(s, ws); if (a?.kind === 'staff' && a.person) return PC.findPerson(s, a.person.mobile);
  return null;
}

// ---------- jobs, money, partner roles ----------
export function jobs(s, person) {
  const emps = s.employments.filter(e => e.personId === person.id).map(e => {
    let money;
    if (PC.STORES.includes(e.business)) money = {balance: HR.balance(s, e.source.id), advance: HR.advanceLeft(s, e.source.id), cashToConfirm: (s.staffLedger || []).filter(x => x.personId === e.source.id && x.status === 'pending_ack')};
    else { const w = WF.workforceOf(s, e.business).find(v => v.id === e.source.id || v.key === `staff:${e.source.id}` || (v.keys || []).includes(`staff:${e.source.id}`)); const k = w ? WF.khata(s, e.business, w) : {balance: 0}; const loan = (s.peopleByWorkspace?.[e.business] || []).find(m => m.id === e.source.id)?.loan; money = {balance: k.balance, advance: loan?.balance || 0, cashToConfirm: (s.ledger || []).filter(x => x.ack === 'pending' && w && (w.keys || [w.key]).includes(x.payee))}; }
    return {kind: 'employment', e, employer: PC.bizName(s, e.business), branch: PC.branchesFor(s, e.business).find(b => b.id === e.homeBranch)?.name || '', teams: (s.teams || []).filter(t => t.members.includes(e.id) && !t.ended).map(t => t.name), money, home: e.role === 'picker' || e.source.kind === 'picker' ? 'pickTasks' : ['driver', 'helper'].includes(e.role) ? 'myJobs' : 'work'};
  });
  const dp = Object.entries(s.deliveryPartners || {}).find(([, d]) => d.mobile === person.mobile);
  if (dp) emps.push({kind: 'partner', role: 'Delivery partner', employer: 'MoveAI Delivery', status: dp[1].status === 'approved' ? 'active' : dp[1].status, ws: dp[0], money: {wallet: Pay.wallet(s, dp[0])?.balance ?? 0}, home: 'deliveryJobs'});
  const pd = (s.candidates || []).find(c => c.id === 'CAND-004' && c.mobile === person.mobile);
  if (pd) emps.push({kind: 'partner', role: 'Personal driver', employer: 'MoveAI customers', status: 'active', ws: 'personalDriver', money: {wallet: Pay.wallet(s, 'personalDriver')?.balance ?? 0}, home: 'myJobs'});
  return emps;
}
export function yearly(s, person) {
  const out = {}; const add = (y, who, amt) => { out[y] ||= {}; out[y][who] = (out[y][who] || 0) + amt; };
  for (const e of s.employments.filter(x => x.personId === person.id)) {
    const who = PC.bizName(s, e.business);
    if (PC.STORES.includes(e.business)) for (const x of (s.staffLedger || []).filter(x => x.personId === e.source.id && x.type === 'payment' && x.status !== 'not_received')) add(yearOf(x.ts || x.at), who, x.amount);
    else for (const x of (s.ledger || []).filter(x => x.owner === e.business && x.payee === `staff:${e.source.id}` && ['salary'].includes(x.type) && x.ack !== 'not_received')) add(yearOf(x.createdAt || x.history?.[0]?.at), who, Number(x.amount));
  }
  for (const j of jobs(s, person).filter(j => j.kind === 'partner')) for (const x of (s.ledger || []).filter(x => x.type === 'payout' && x.payee === j.ws && x.status === 'paid')) add(yearOf(x.createdAt), j.employer, Number(x.amount));
  return out;
}
export function historyLines(s, person) {
  return s.employments.filter(e => e.personId === person.id).sort((a, b) => String(b.start).localeCompare(String(a.start))).map(e => `${e.start?.slice(0, 7) || ''} – ${e.end ? e.end.slice(0, 7) : 'now'} · ${e.designation || roleName(e.role)} · ${PC.bizName(s, e.business)}${e.status === 'ended' ? '' : ' (current)'}`);
}

// ---------- screen ----------
export function screen(s, route, ws) {
  if (route !== 'myWork' || !WORKER_WS.includes(ws) && !s.deliveryPartners?.[ws]) return '';
  const person = whoAmI(s, ws); if (!person) return `${head('My work & pay', 'No worker profile on this account yet.')}`;
  const all = jobs(s, person), active = all.filter(j => j.kind === 'partner' ? j.status === 'active' : j.e.status === 'active'), past = all.filter(j => j.kind === 'employment' && j.e.status === 'ended');
  const pick = active.find(j => (j.kind === 'partner' ? j.ws : j.e.id) === s.hubJob) || active[0], yrs = yearly(s, person);
  const card = j => j.kind === 'partner'
    ? `<section class="panel"><h2>${esc(j.employer)} · ${esc(j.role)}</h2><p>MoveAI wallet <b>${inr(j.money.wallet)}</b> · weekly payout or instant withdrawal</p><button class="button primary compact" data-route="${j.home}">Open ${esc(j.role.toLowerCase())} work</button></section>`
    : `<section class="panel"><h2>${esc(j.employer)} · ${esc(j.e.designation || roleName(j.e.role))}</h2><p>${esc(j.branch)}${j.teams.length ? ` · ${esc(j.teams.join(', '))}` : ''} · ${esc(PC.EMP_TYPES[j.e.type] || j.e.type)}</p><div class="metrics"><div class="metric"><span>Balance due to you</span><b>${inr(j.money.balance)}</b></div><div class="metric"><span>Advance left</span><b>${inr(j.money.advance)}</b></div><div class="metric"><span>Cash to confirm</span><b>${j.money.cashToConfirm.length}</b></div></div>${j.money.cashToConfirm.length ? `<p class="action-warning">You have cash payments to confirm — open ${PC.STORES.includes(j.e.business) ? 'My pay' : 'Money'}.</p>` : ''}<div class="row-actions"><button class="button primary compact" data-route="${j.home}">Open work</button><button class="button secondary compact" data-route="${PC.STORES.includes(j.e.business) ? 'myHR' : 'money'}">Pay & khata</button></div>${j.e.history.length > 1 ? `<details><summary class="muted">Role & branch history</summary>${j.e.history.map(h => `<small class="block muted">${esc(h.at)} · ${esc(h.text)}</small>`).join('')}</details>` : ''}</section>`;
  const persons = Object.values(s.persons).filter(p => s.employments.some(e => e.personId === p.id) || Object.values(s.deliveryPartners || {}).some(d => d.mobile === p.mobile));
  return `${head('My work & pay', `${person.name} · ${person.mobile} · one MoveAI profile for every job`)}
  <form class="inline-form demo-viewas" data-hub-form="viewas"><small class="muted">Prototype: view as</small><select name="pid"><option value="">This account</option>${persons.map(p => `<option value="${p.id}" ${s.hubViewAs === p.id && s.hubViewAsWs === ws ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="button text compact">Switch</button></form>
  <section class="panel"><h2>My work · ${active.length} current job${active.length === 1 ? '' : 's'}</h2>${active.length > 1 ? `<div class="chip-row">${active.map(j => { const id = j.kind === 'partner' ? j.ws : j.e.id; return `<button class="chip ${pick && (pick.kind === 'partner' ? pick.ws : pick.e.id) === id ? 'active' : ''}" data-hub-job="${esc(id)}">${esc(j.employer)}</button>`; }).join('')}</div>` : ''}${active.length ? '' : '<p class="muted">No current job. Past work and your profile stay here.</p>'}</section>
  ${pick ? card(pick) : ''}
  <section class="panel"><h2>Past work</h2>${past.map(j => `<div class="ledger-row static"><span><b>${esc(j.employer)} · ${esc(j.e.designation || roleName(j.e.role))}</b><small>${esc(j.e.start || '')} – ${esc(j.e.end || '')} · ${esc(j.branch)} · balance at exit ${inr(j.money.balance)}</small></span><details><summary class="button text compact">History</summary>${j.e.history.map(h => `<small class="block muted">${esc(h.at)} · ${esc(h.text)}</small>`).join('')}</details></div>`).join('') || '<p class="muted">Nothing yet.</p>'}</section>
  <section class="panel"><div class="panel-header"><div><h2>Earnings statement</h2><p>Money received from every employer and the MoveAI wallet, by year</p></div><button class="button secondary compact" data-hub="print">Print / PDF</button></div>${Object.entries(yrs).sort((a, b) => b[0] - a[0]).map(([y, m]) => `<h3>${y} · ${inr(Object.values(m).reduce((a, x) => a + x, 0))}</h3>${Object.entries(m).map(([who, amt]) => `<div class="ledger-row static"><span>${esc(who)}</span><span class="amount">${inr(amt)}</span></div>`).join('')}`).join('') || '<p class="muted">No payments yet.</p>'}<p class="mock-hint">Useful as income proof for a loan or rent agreement. Only payments you confirmed are counted.</p></section>
  <section class="panel"><h2>Work history</h2>${historyLines(s, person).map(l => `<small class="block">${esc(l)}</small>`).join('') || '<p class="muted">No work yet.</p>'}<label class="consent-row"><input type="checkbox" data-hub-consent ${person.consentWorkHistory ? 'checked' : ''}> Let new employers see this work history (roles and dates only — never pay)</label><button class="button secondary compact" data-hub="share">Copy work history</button></section>
  <section class="panel"><h2>Profile & documents</h2><p>ID check ${pill(person.kyc)} · Payout ${pill(person.payoutVerified ? 'verified' : 'pending')} · on MoveAI since ${esc(person.createdAt || '')}</p>${Object.entries(person.documents || {}).map(([k, d]) => `<div class="ledger-row static"><span><b>${esc(k)}</b><small>${d.expiry ? `expires ${esc(d.expiry)}` : 'no expiry'}</small></span>${pill(d.expiry && d.expiry < new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) ? 'renew_soon' : d.status)}</div>`).join('') || '<p class="muted">Documents you add (PAN, driving licence, vehicle RC) are reused by every employer.</p>'}</section>`;
}
export function bind(root, api) {
  const S = () => api.getState(), done = m => { api.save(); api.render(); if (m) api.toast(m); };
  root.querySelector('form[data-hub-form="viewas"]')?.addEventListener('submit', e => { e.preventDefault(); S().hubViewAs = new FormData(e.target).get('pid') || null; S().hubViewAsWs = S().currentWorkspace; S().hubJob = null; done(''); });
  root.querySelectorAll('[data-hub-job]').forEach(b => b.onclick = () => { S().hubJob = b.dataset.hubJob; done(''); });
  root.querySelector('[data-hub-consent]')?.addEventListener('change', e => { const p = whoAmI(S(), S().currentWorkspace); if (p) p.consentWorkHistory = e.target.checked; done(e.target.checked ? 'New employers can see your work history' : 'Work history is private'); });
  root.querySelectorAll('[data-hub]').forEach(b => b.onclick = async () => { if (b.dataset.hub === 'print') return window.print(); const p = whoAmI(S(), S().currentWorkspace); const txt = `${p.name} — work history (MoveAI)\n${historyLines(S(), p).join('\n')}`; try { await navigator.clipboard.writeText(txt); api.toast('Work history copied'); } catch { api.toast(txt); } });
}
