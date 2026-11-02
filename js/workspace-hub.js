// MoveAI One — workspace hub: how a signed-in person moves between their workspaces.
// Modelled on Grab/Uber (separate apps per job, business = a payment profile at checkout) and
// Slack/Instagram (one login, a switcher showing every membership with unread badges).
//
// Pure functions only, so they can be unit-tested and later moved to the server unchanged.
// PROTOTYPE LIMIT: membership, PINs and switch guards are checked in the browser here. In production
// the server must issue a new token per workspace switch and enforce every rule below.
import {SELLER_WORKSPACES, MANAGER_BY_STORE, WORKER_BY_STORE, STORE_BY_MANAGER, STORE_BY_WORKER} from './seller-roles.js';
import {branchesFor, selectedBranch, staffBranches} from './seller-branches.js';
import {ROLE_TEMPLATES} from './people-rules.js';

// ---------- apps: three apps for people plus an internal admin console ----------
// Internal "products" keep their own menus and home screens, but people see only four apps.
export const APPS = {
  customer: {main: 'customer', products: ['customer'], label: 'MoveAI', file: 'index.html'},
  partner: {main: 'partner', products: ['partner', 'delivery'], label: 'MoveAI Partner', file: 'partner.html'},
  business: {main: 'business', products: ['business', 'seller', 'picker'], label: 'MoveAI Business', file: 'business.html'},
  admin: {main: 'admin', products: ['admin'], label: 'MoveAI Admin', file: 'admin.html'},
};
export function appOf(product) {
  return Object.keys(APPS).find(k => APPS[k].products.includes(product)) || 'customer';
}
export const sameApp = (a, b) => appOf(a) === appOf(b);
export function appRoles(product, PRODUCTS) {
  const out = [];
  for (const p of APPS[appOf(product)].products) for (const r of PRODUCTS[p]?.roles || []) if (!out.includes(r)) out.push(r);
  return out;
}

// ---------- which business a workspace belongs to, and the person's role there ----------
const STORE_NAMES = {grocery: 'ABC Grocery', groceryFresh: 'Fresh Mart', electrical: 'Sharma Electricals', fashion: 'City Fashion'};
const OTHER_GROUPS = {
  goods: ['sharma-foods', 'Sharma Foods', 'Owner'],
  transporter: ['raj-logistics', 'Raj Logistics', 'Owner'],
  vehicle: ['raj-transport', 'Raj Transport', 'Owner'],
  movers: ['safemove', 'SafeMove Packers', 'Owner'],
  staff: ['employer', 'Employer workspace', 'Staff'],
  commercialDriver: ['independent', 'My partner work', 'Commercial driver'],
  personalDriver: ['independent', 'My partner work', 'Personal driver'],
  helper: ['independent', 'My partner work', 'Khalasi / helper'],
  deliveryPartner: ['deliveries', 'Store deliveries', 'Delivery partner'],
  deliveryPartner2: ['deliveries', 'Store deliveries', 'Delivery partner'],
  admin: ['platform', 'MoveAI platform', 'Admin'],
  personal: ['personal', 'Personal', 'Me'],
};
export function storeOf(ws) {
  if (SELLER_WORKSPACES.includes(ws)) return ws;
  return STORE_BY_MANAGER[ws] || STORE_BY_WORKER[ws] || null;
}
export const LOGISTICS = ['goods', 'transporter', 'vehicle', 'movers'];
export function workspaceGroup(ws, roleConfig = {}, state = null) {
  const store = storeOf(ws);
  if (store) {
    const role = SELLER_WORKSPACES.includes(ws) ? 'Store owner' : STORE_BY_MANAGER[ws] ? 'Store manager' : 'Store staff';
    return {key: store, name: STORE_NAMES[store] || roleConfig[store]?.label || store, role};
  }
  const g = OTHER_GROUPS[ws];
  if (ws === 'staff' && state) {
    const m = currentMembership(state);
    if (m) { const og = workspaceGroup(m.ownerWorkspace, roleConfig); return {key: og.key, name: og.name, role: ROLE_TEMPLATES[m.member.role]?.label || m.member.designation || 'Staff'}; }
  }
  if (g && LOGISTICS.includes(ws) && state?.mockUsers?.[ws]?.role) return {key: g[0], name: g[1], role: `Owner · ${state.mockUsers[ws].role}`};
  if (g) return {key: g[0], name: g[1], role: g[2]};
  return {key: ws, name: roleConfig[ws]?.label || ws, role: roleConfig[ws]?.subtitle || ''};
}

// A stable colour per business so the current workspace is obvious at a glance (6 tones in CSS).
export function toneOf(ws) {
  const key = workspaceGroup(ws).key;
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return key === 'personal' ? 0 : 1 + (h % 6);
}

// ---------- the switcher list ----------
export function recordUse(state, ws, now = Date.now()) { (state.workspaceLastUsed ||= {})[ws] = now; }
export function isMuted(state, ws) { return !!state.notifyPrefs?.[ws]?.muted; }

// unreadFor(ws) -> number. Returns business groups, current workspace first, then most recently used.
export function switcherModel(state, product, {PRODUCTS, roleConfig = {}, unreadFor = () => 0, query = ''} = {}) {
  const roles = appRoles(product, PRODUCTS);
  const q = String(query || '').trim().toLowerCase();
  const used = state.workspaceLastUsed || {};
  const items = [];
  for (const ws of (state.workspaces || []).filter(w => roles.includes(w) && roleConfig[w])) {
    if (ws === 'staff') {
      for (const m of staffMemberships(state)) {
        const og = workspaceGroup(m.ownerWorkspace, roleConfig), key = `staff:${m.ownerWorkspace}:${m.member.id}`;
        const b = staffBranchNames(state, m);
        items.push({ws, staffOwner: m.ownerWorkspace, staffMember: m.member.id, label: `${og.name} · ${m.member.name}`, group: og.name, groupKey: og.key,
          role: ROLE_TEMPLATES[m.member.role]?.label || m.member.designation || 'Staff', branch: b.join(', '),
          current: state.currentWorkspace === 'staff' && state.staffSession?.ownerWorkspace === m.ownerWorkspace && state.selectedStaffId === m.member.id,
          unread: unreadFor(ws), muted: isMuted(state, ws), lastUsed: used[key] || used[ws] || 0, tone: toneOf(m.ownerWorkspace), branches: []});
      }
      continue;
    }
    const g = workspaceGroup(ws, roleConfig, state), label = roleConfig[ws].label, br = branchInfo(state, ws);
    items.push({ws, label, group: g.name, groupKey: g.key, role: g.role, branch: br.current?.name || '', branches: br.canChoose ? br.options : [], branchCurrent: br.current?.id || '',
      current: ws === state.currentWorkspace, unread: unreadFor(ws), muted: isMuted(state, ws), lastUsed: used[ws] || 0, tone: toneOf(ws)});
  }
  const filtered = items.filter(x => !q || `${x.label} ${x.group} ${x.role} ${x.branch}`.toLowerCase().includes(q));
  filtered.sort((a, b) => (b.current - a.current) || (b.lastUsed - a.lastUsed) || a.label.localeCompare(b.label));
  const groups = [];
  for (const it of filtered) {
    let g = groups.find(x => x.key === it.groupKey);
    if (!g) groups.push(g = {key: it.groupKey, name: it.group, tone: it.tone, items: []});
    g.items.push(it);
  }
  const pending = (state.invitations || []).filter(x => x.status === 'pending');
  return {groups, total: filtered.length, showSearch: (state.workspaces || []).filter(ws => roles.includes(ws)).length > 5, pending};
}

// ---------- switch guard (like Uber's driver app during a trip) ----------
const ACTIVE_DELIVERY = ['accepted', 'picked_up', 'out_for_delivery'];
export function switchBlocker(state, from, to) {
  if (!from || from === to) return {level: '', reason: ''};
  const courierId = state.deliveryPartners?.[from]?.id;
  if (courierId) {
    const live = (state.customerOrders || []).find(o => o.deliveryAssignment?.partnerId === courierId && ACTIVE_DELIVERY.includes(o.deliveryAssignment?.status) && !['delivered', 'cancelled', 'returned'].includes(o.status));
    if (live) return {level: 'block', reason: `Finish or hand back delivery ${live.id} before switching. Your location sharing stays on during an active delivery.`};
    const cash = (state.customerOrders || []).filter(o => o.codCash?.status === 'collected' && o.codCash.partnerId === courierId);
    if (cash.length) return {level: 'warn', reason: `You still hold COD cash for ${cash.length} order${cash.length > 1 ? 's' : ''}. Hand it over from Earnings → COD cash.`};
  }
  const job = liveFieldJob(state, from);
  if (job) return {level: 'block', reason: `${job.kind} ${job.id} is in progress (${job.step}). Finish it or ask the office to reassign before switching. GPS sharing stays on.`};
  if (STORE_BY_WORKER[from]) {
    const me = state.activePicker?.[from];
    const task = (state.customerOrders || []).find(o => me && o.pickerId === me && o.pick?.startedAt && !o.pick.completedAt);
    if (task) return {level: 'block', reason: `Finish picking ${task.id} (or ask your manager to reassign it) before switching.`};
  }
  return {level: '', reason: ''};
}

// ---------- notifications that belong to another workspace ----------
// mineFor(ws) -> notifications for that workspace. Lists unread items outside the current workspace.
export function elsewhere(state, product, {PRODUCTS, roleConfig = {}, mineFor}) {
  const roles = appRoles(product, PRODUCTS);
  return (state.workspaces || []).filter(ws => ws !== state.currentWorkspace && roles.includes(ws) && roleConfig[ws]).map(ws => {
    const unread = (mineFor(ws) || []).filter(n => !n.read);
    return {ws, label: roleConfig[ws].label, unread: unread.length, latest: unread[0] || null, muted: isMuted(state, ws)};
  }).filter(x => x.unread > 0);
}
// Deep links and push notifications carry the workspace: "#/shopOrders?ws=grocery".
export function wsFromHash(hash) {
  const q = String(hash || '').split('?')[1] || '';
  return new URLSearchParams(q).get('ws') || '';
}
export const linkFor = (route, ws) => `#/${route}?ws=${encodeURIComponent(ws)}`;

// ---------- buying for a business at checkout (Grab/Uber business profile) ----------
const DEMO_GSTIN = {goods: '09AAACS4410K1Z2', transporter: '09AAEFA7821K1Z8', vehicle: '09AAKFR9921L1Z4', movers: '09AAJFS3318M1Z6', grocery: '09AAACA5512G1Z1', groceryFresh: '09AAHFF2101F1Z3', electrical: '09AAGFS7704E1Z5', fashion: '09AABFC6620C1Z7'};
const OWNED = ['goods', 'transporter', 'vehicle', 'movers', ...SELLER_WORKSPACES];
export function buyingProfiles(state, roleConfig = {}) {
  const me = {key: 'personal', label: 'Personal', name: state.person?.name || '', gstin: '', note: 'Receipt in your name'};
  const biz = (state.workspaces || []).filter(ws => OWNED.includes(ws) && roleConfig[ws]).map(ws => ({
    key: ws, label: roleConfig[ws].label, name: roleConfig[ws].label,
    gstin: state.businessGstin?.[ws] ?? DEMO_GSTIN[ws] ?? '', note: 'GST invoice to the business'}));
  return [me, ...biz];
}
export function profileBilling(state, key, roleConfig = {}) {
  const p = buyingProfiles(state, roleConfig).find(x => x.key === key) || buyingProfiles(state, roleConfig)[0];
  return {name: p.name, gstin: p.gstin, profile: p.key};
}

// ---------- money confirmations always name the workspace ----------
export function moneyConfirmText(state, ws, roleConfig, what) {
  const g = workspaceGroup(ws, roleConfig);
  return `${what} from ${g.name}${g.role && g.key !== 'personal' ? ` (${g.role.toLowerCase()})` : ''}?`;
}

// ---------- shared store device: staff switch with a PIN ----------
// Stores often share one phone at the counter. Staff tap their name and enter a 4-digit PIN; the
// business stays signed in. Demo PIN for every picker is 1234 unless the owner set one.
export const DEMO_STAFF_PIN = '1234';
export function storeStaff(state, ws) {
  const store = storeOf(ws);
  if (!store) return [];
  return (state.pickerStaff || []).filter(p => p.store === store && p.status === 'active');
}
export function pinSwitch(state, fromWs, staffId, pin) {
  const store = storeOf(fromWs), staff = storeStaff(state, fromWs).find(p => p.id === staffId);
  if (!store || !staff) return {error: 'Choose a staff member of this store.'};
  const tries = (state.pinAttempts ||= {})[staffId] || 0;
  if (tries >= 5) return {error: 'Too many wrong PINs. Ask the store owner to reset it.'};
  if (String(pin || '') !== String(staff.pin || DEMO_STAFF_PIN)) { state.pinAttempts[staffId] = tries + 1; return {error: `Wrong PIN. ${4 - tries} attempt${4 - tries === 1 ? '' : 's'} left.`}; }
  state.pinAttempts[staffId] = 0;
  const ws = WORKER_BY_STORE[store];
  (state.activePicker ||= {})[ws] = staffId;
  state.sharedDevice = {store, ownerWs: SELLER_WORKSPACES.includes(fromWs) ? fromWs : store, since: Date.now()};
  if (!(state.workspaces || []).includes(ws)) (state.workspaces ||= []).push(ws);
  return {ws, staff};
}
export function setStaffPin(state, staffId, pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) return 'Use exactly 4 digits.';
  const p = (state.pickerStaff || []).find(x => x.id === staffId);
  if (!p) return 'Staff member not found.';
  p.pin = String(pin); (state.pinAttempts ||= {})[staffId] = 0; return '';
}
export const SHARED_DEVICE_LOCK_MS = 5 * 60 * 1000;
export const managerFor = store => MANAGER_BY_STORE[store];
export const isOwnerWorkspace = ws => SELLER_WORKSPACES.includes(ws);


// ---------- branches ----------
// Stores keep branch records in sellerBranches; logistics businesses in businessProfiles[ws].branches.
const shortBranch = (name, biz) => String(name || '').replace(new RegExp(`^${String(biz || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*·\\s*`), '');
export function branchInfo(state, ws) {
  const store = storeOf(ws);
  if (store) {
    const all = branchesFor(state, store).filter(b => b.status === 'active');
    const opts = all.map(b => ({id: b.id, name: shortBranch(b.name, STORE_NAMES[store])}));
    if (STORE_BY_WORKER[ws]) {
      const p = (state.pickerStaff || []).find(x => x.id === state.activePicker?.[ws]);
      const ids = p ? staffBranches(state, p) : [];
      return {current: {id: ids[0] || '', name: opts.filter(o => ids.includes(o.id)).map(o => o.name).join(', ')}, options: [], canChoose: false};
    }
    const id = selectedBranch(state, store);
    return {current: opts.find(o => o.id === id) || opts[0] || null, options: opts, canChoose: opts.length > 1};
  }
  if (LOGISTICS.includes(ws)) {
    const opts = (state.businessProfiles?.[ws]?.branches || []).filter(b => b.status !== 'closed').map(b => ({id: b.id, name: b.name}));
    const f = state.branchFilter?.[ws] || 'all';
    const all = {id: 'all', name: 'All branches'};
    if (opts.length === 1) return {current: opts[0], options: opts, canChoose: false};
    return {current: f === 'all' ? all : opts.find(o => o.id === f) || all, options: [all, ...opts], canChoose: opts.length > 1};
  }
  return {current: null, options: [], canChoose: false};
}
// Choose a branch from the switcher. Store owners/managers use the store's branch picker; logistics
// owners set the branch filter. Remembered per workspace.
export function chooseBranch(state, ws, id) {
  const store = storeOf(ws);
  if (store && !STORE_BY_WORKER[ws]) {
    const b = branchesFor(state, store).find(x => x.id === id && x.status === 'active');
    if (!b) return 'Branch unavailable.';
    if (STORE_BY_MANAGER[ws]) {
      const m = (state.storeManagers || []).find(x => x.id === state.activeStoreManager?.[ws] && x.status === 'active');
      if (m && m.branchIds?.length && !m.branchIds.includes(id)) return 'This manager is not assigned to that branch.';
    }
    (state.activeSellerBranch ||= {})[store] = id; return '';
  }
  if (LOGISTICS.includes(ws)) {
    const ok = id === 'all' || (state.businessProfiles?.[ws]?.branches || []).some(b => b.id === id);
    if (!ok) return 'Branch unavailable.';
    state.branchFilter = {...(state.branchFilter || {}), [ws]: id}; return '';
  }
  return 'This workspace has no branches to choose.';
}

// ---------- staff memberships (one person can be staff at several businesses) ----------
export function staffMemberships(state) {
  const sess = state.staffSession;
  if (!sess?.ownerWorkspace || !sess.memberId) return [];
  const me = (state.peopleByWorkspace?.[sess.ownerWorkspace] || []).find(x => x.id === sess.memberId);
  if (!me) return [];
  const out = [];
  for (const [owner, list] of Object.entries(state.peopleByWorkspace || {})) for (const m of list || [])
    if ((m.id === me.id && owner === sess.ownerWorkspace) || (m.mobile && m.mobile === me.mobile && ['active', 'correction_required', 'invited', 'submitted'].includes(m.status)))
      if (!out.some(x => x.ownerWorkspace === owner && x.member.id === m.id)) out.push({ownerWorkspace: owner, member: m});
  return out;
}
export function currentMembership(state) {
  return staffMemberships(state).find(m => m.ownerWorkspace === state.staffSession?.ownerWorkspace && m.member.id === state.selectedStaffId) || null;
}
export function staffBranchNames(state, m) {
  const list = state.businessProfiles?.[m.ownerWorkspace]?.branches || [];
  return (m.member.branchIds || []).map(id => list.find(b => b.id === id)?.name).filter(Boolean);
}
// Point the staff workspace at one membership (the server would issue a token for it).
export function useMembership(state, ownerWorkspace, memberId) {
  const m = staffMemberships(state).find(x => x.ownerWorkspace === ownerWorkspace && x.member.id === memberId);
  if (!m) return null;
  state.staffSession = {...(state.staffSession || {}), ownerWorkspace, memberId, mobile: m.member.mobile, verified: true};
  state.selectedStaffId = memberId;
  state.workspaceOverrides = {...(state.workspaceOverrides || {}), staff: {label: m.member.name, subtitle: `${ROLE_TEMPLATES[m.member.role]?.label || 'Staff'} · ${workspaceGroup(ownerWorkspace).name}`}};
  recordUse(state, `staff:${ownerWorkspace}:${memberId}`);
  return m;
}

// ---------- live field work: trips, moving jobs, personal-driver jobs ----------
export const LIVE_TRIP = ['pickup_reached', 'loaded', 'dharamkata', 'in_transit'];
export const LIVE_MOVE = ['packed', 'loaded', 'in_transit', 'unloaded'];
const STEP_LABEL = {pickup_reached: 'at pickup', loaded: 'loaded', dharamkata: 'at weighbridge', in_transit: 'in transit', packed: 'packing done', unloaded: 'unloading', in_progress: 'in progress'};
export function liveFieldJob(state, ws) {
  const memberId = ws === 'staff' ? state.selectedStaffId : null;
  const onCrew = j => (j.crew || []).some(c => (memberId ? c.id === memberId : c.persona === ws) && c.accepted !== false);
  if (!['commercialDriver', 'personalDriver', 'helper', 'staff'].includes(ws)) return null;
  const t = (state.trips || []).find(x => LIVE_TRIP.includes(x.status) && onCrew(x));
  if (t) return {kind: 'Trip', id: t.id, step: STEP_LABEL[t.status] || t.status};
  const mv = (state.movingJobs || []).find(x => LIVE_MOVE.includes(x.status) && onCrew(x));
  if (mv) return {kind: 'Moving job', id: mv.id, step: STEP_LABEL[mv.status] || mv.status};
  const sr = !memberId && (state.serviceRequests || []).find(x => x.provider === ws && x.status === 'in_progress');
  if (sr) return {kind: 'Job', id: sr.id, step: 'in progress'};
  return null;
}

// ---------- notifications by business and branch ----------
// Trip, load and moving-job alerts inherit the record's branch so branch staff only see their branch.
export function tagNotificationBranches(state) {
  const byRef = {};
  for (const x of [...(state.trips || []), ...(state.movingJobs || []), ...(state.loads || [])]) if (x?.id && x.branchId) byRef[x.id] = x.branchId;
  for (const n of state.notifications || []) {
    if (n.branchId) continue;
    const ref = n.ref || (String(n.text || '').match(/^([A-Z]{2,4}-[A-Z0-9-]+):/) || [])[1];
    if (ref && byRef[ref]) n.branchId = byRef[ref];
  }
}
const OPS_ROLES = ['manager', 'operations', 'dispatcher'];
// Owner-workspace alerts a branch staff member may see (managers/dispatchers: work; accountants: money).
export function staffSeesOwnerAlert(member, n, kind) {
  if (!member || !n.branchId || !(member.branchIds || []).includes(n.branchId)) return false;
  if (OPS_ROLES.includes(member.role)) return kind !== 'payments' || member.role === 'manager';
  if (member.role === 'accounts') return kind === 'payments';
  return false;
}

// ---------- buying profile defaults: payment method and receipt email per business ----------
const slug = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export function buyingDefaults(state, key, roleConfig = {}) {
  if (key === 'personal') return {method: state.buyingDefaults?.personal?.method || '', email: state.buyingDefaults?.personal?.email || ''};
  const saved = state.buyingDefaults?.[key] || {};
  return {method: saved.method || 'upi', email: saved.email ?? `accounts@${slug(roleConfig[key]?.label || key)}.example`};
}
export function rememberBuying(state, key, {method, email} = {}) {
  if (!key) return;
  (state.buyingDefaults ||= {})[key] = {method: method || '', email: email || ''};
}

// ---------- money confirmation (payer and payee named) ----------
const MONEY_ACTION = /^(\+\s*)?(pay\s+(₹|in cash|monthly salary|final settlement|seller|now|by upi)|settle\b|run (weekly |monthly )?payouts?|record (a )?(payment|helper payments|courier payout|cod refund|payout|refund|advance|salary)|give advance|approve (refund|payday|pay ?run|payout|salary|advance)|accept and pay|close trip as settled|release( payout| payment| hold)?$|issue refund|refund ₹|transfer ₹|disburse|mark (as )?paid)/i;
const MONEY_VERB_WITH_AMOUNT = /\b(pay|settle|refund|transfer|release|approve|disburse)\b[^]*₹|₹[^]*\b(pay|settle|refund|payout)\b/i;
const NOT_MONEY = /\b(view|open|history|details?|back|filter|show|hide|edit|settings?|print|download|receipt|payslip|statement|close khata|plan|method|explain|why|preview|search|add bank|change bank|request|review|workers|dispute|prepare|save)\b/i;
export function isMoneyAction(label) { const t = String(label || '').replace(/\s+/g, ' ').trim(); if (!t || NOT_MONEY.test(t)) return false; return MONEY_ACTION.test(t) || MONEY_VERB_WITH_AMOUNT.test(t); }
export function amountIn(text) { const m = String(text || '').match(/₹\s?([\d,]+(?:\.\d+)?)/); return m ? `₹${m[1]}` : ''; }
export function moneyConfirm({action, amount, from, to, ref}) {
  const a = String(action || 'Confirm payment').replace(/\s+/g, ' ').trim();
  return {title: `${a}${amount ? ` · ${amount}` : ''}`, from: from || 'this workspace', to: to || 'the person or business on this card', ref: ref || '',
    text: `${a}${amount ? ` ${amount}` : ''} from ${from || 'this workspace'} to ${to || 'the person or business on this card'}${ref ? ` for ${ref}` : ''}?`};
}

// Elements that exist only for testing; hidden with ?demo=off.
export const DEMO_ONLY_SELECTORS = ['.demo-only', '[data-action="test-staff-invite"]', '[data-leave-tab]', '.tab-view', '[data-picker-account]', '[data-commerce="select-picker"]', '[data-manager-account]', '[data-commerce="select-manager"]', '[data-easy-demo]', '[data-plus-demo-scan]', '[data-route="states"]'];
export const DEMO_ONLY_TEXT = /^(Demo|Prototype)\b|demo (manager|store staff) account|Use demo location/i;

// ---------- demo-only tools ----------
// Persona labels, test hints and "Reset demo" help testing but must not ship. Turn them off with
// ?demo=off (and back on with ?demo=on); the choice is remembered on this device.
export function demoModeFromUrl(search, stored) {
  const q = new URLSearchParams(String(search || '')), v = q.get('demo');
  if (v === 'off' || v === 'on') return v;
  // Opening a tour link always turns demo mode back on (otherwise the tour could never start).
  if (q.get('tour')) return 'on';
  return stored === 'off' ? 'off' : 'on';
}
