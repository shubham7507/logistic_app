// MoveAI One — truck driver safeguards on business trips.
// 1. Document expiry: licence, police check, medical (and vehicle papers) — reminders 30 days before, work
//    blocked once expired, renew by uploading the new document.
// 2. Driving hours: continuous driving is timed from "In transit"; after 4 hours the driver and the business
//    are told to take a 30-minute break.
// 3. Waiting time: 2 free hours at pickup and at drop, then detention at ₹200 an hour, shown to both sides.
// 4. Delivery code: the receiver gets a 4-digit code; "Delivered" needs it as well as the signed POD.
import {clock} from './pay.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const todayIso = () => new Date(clock()).toISOString().slice(0, 10);
const notify = (s, to, text, ref, route) => { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, route, at: stamp(), read: false}); };
const HOUR = 3600000;
export const DRIVE_LIMIT_H = 4, BREAK_MIN = 30, FREE_WAIT_H = 2, DETENTION_RATE = 200, WARN_DAYS = 30;
export const DOC_LABELS = {licence: 'Driving licence', police: 'Police verification', medical: 'Medical fitness', rc: 'Vehicle RC', insurance: 'Vehicle insurance', fitness: 'Vehicle fitness', puc: 'Pollution (PUC)'};

// ---------- 1. documents ----------
const daysTo = d => Math.floor((Date.parse(`${d}T23:59:59`) - clock()) / 86400000);
export function docStatus(docs = {}) {
  return Object.entries(docs).map(([k, d]) => ({key: k, label: DOC_LABELS[k] || k, expiry: d, days: daysTo(d)})).map(x => ({...x, state: x.days < 0 ? 'expired' : x.days <= WARN_DAYS ? 'soon' : 'ok'})).sort((a, b) => a.days - b.days);
}
export const workerOf = (s, ws) => (s.driverPros || []).find(p => p.ws === ws) || (s.ownerDrivers || []).find(p => p.ws === ws) || (s.platformWorkers || []).find(w => w.persona === ws) || null;
export function expiryBlock(s, ws) { const w = workerOf(s, ws); const x = docStatus(w?.docs).find(d => d.state === 'expired'); return x ? `Your ${x.label.toLowerCase()} expired on ${x.expiry}. Renew it to take work.` : ''; }
export function renew(s, ws, key, file) {
  const w = workerOf(s, ws); if (!w?.docs?.[key]) return 'Document not found.'; if (!file) return 'Upload the new document.';
  const next = new Date(clock()); next.setFullYear(next.getFullYear() + (key === 'medical' ? 1 : key === 'police' ? 2 : 5));
  w.docs[key] = next.toISOString().slice(0, 10); w.docsExpired = false; (w.renewals ||= []).push({key, file, at: stamp()});
  notify(s, 'admin', `${w.name} uploaded a renewed ${DOC_LABELS[key].toLowerCase()} (${file}). Check it.`, w.id, 'verification'); return '';
}
export function docsPanel(s, ws) {
  const w = workerOf(s, ws), list = docStatus(w?.docs).filter(d => d.state !== 'ok'); if (!list.length) return '';
  return `<section class="panel ${list.some(d => d.state === 'expired') ? 'attention' : ''}" data-tx-docs><h2>Documents</h2>${list.map(d => `<div class="document-row"><span class="document-icon">${d.state === 'expired' ? '⛔' : '⏳'}</span><span class="document-copy"><b>${esc(d.label)} ${d.state === 'expired' ? `expired on ${esc(d.expiry)}` : `expires in ${d.days} day${d.days === 1 ? '' : 's'}`}</b><small>${d.state === 'expired' ? 'You can\'t accept new work until it is renewed.' : 'Renew it now so your work is not stopped.'}</small></span><form class="inline-form" data-tx-renew="${d.key}"><input type="file" name="file" accept="image/*,application/pdf" aria-label="New ${esc(d.label)}"><button class="button secondary compact">Upload renewed</button></form></div>`).join('')}</section>`;
}

// ---------- 2. driving hours ----------
export function startDriving(t) { if (!t.drive) t.drive = {since: clock(), breaks: [], warned: false}; }
export const drivingHours = t => (t.drive && !t.drive.onBreak ? (clock() - t.drive.since) / HOUR : 0);
export function breakStep(s, t, on) {
  if (!t.drive) return 'Driving time starts at "In transit".';
  if (on) { if (t.drive.onBreak) return 'Already on a break.'; t.drive.onBreak = clock(); return ''; }
  if (!t.drive.onBreak) return 'Not on a break.'; const mins = Math.round((clock() - t.drive.onBreak) / 60000);
  t.drive.breaks.push({mins, at: stamp()}); delete t.drive.onBreak; if (mins >= BREAK_MIN) { t.drive.since = clock(); t.drive.warned = false; } return mins >= BREAK_MIN ? '' : `Break was ${mins} min. Rest at least ${BREAK_MIN} min to reset the driving time.`;
}
export function checkDriving(s, t) {
  const h = drivingHours(t); if (h < DRIVE_LIMIT_H || t.drive.warned) return false;
  t.drive.warned = true; const drv = (t.crew || []).find(c => c.role === 'driver')?.persona || 'commercialDriver';
  notify(s, drv, `${t.id}: you have driven ${h.toFixed(1)} hours without a break. Stop for ${BREAK_MIN} minutes at a safe place.`, t.id, 'myJobs');
  if (t.owner) notify(s, t.owner, `${t.id}: driver has driven ${h.toFixed(1)} hours without a break. Ask him to rest.`, t.id, 'trips'); return true;
}
export function demoDriving(t, h = 4) { if (!t.drive) return 'Driving time starts at "In transit".'; t.drive.since -= h * HOUR; return ''; }

// ---------- 3. waiting time ----------
const at = (t, key) => t.milestones?.find(m => m.key === key && m.status === 'done')?.atMs || null;
export function stampMilestone(t, key) { const m = t.milestones?.find(x => x.key === key); if (m && !m.atMs) m.atMs = clock(); }
export function waiting(t) {
  const calc = (a, b) => { if (!a) return null; const h = ((b || clock()) - a) / HOUR; const overMin = Math.max(0, Math.round((h - FREE_WAIT_H) * 60)); return {hours: Math.round(h * 10) / 10, charge: Math.ceil(overMin / 60) * DETENTION_RATE, running: !b}; };
  const pickup = calc(at(t, 'pickup_reached'), at(t, 'loaded')), drop = calc(t.dropReachedAtMs, at(t, 'delivered'));
  return {pickup, drop, total: (pickup?.charge || 0) + (drop?.charge || 0)};
}
export function reachedDrop(s, t) { if (!at(t, 'in_transit')) return 'Start the trip first.'; if (t.dropReachedAtMs) return 'Already marked.'; t.dropReachedAtMs = clock(); notify(s, t.owner, `${t.id}: truck reached the drop. Free waiting time ${FREE_WAIT_H} h, then ${inr(DETENTION_RATE)}/h.`, t.id, 'trips'); return ''; }
export function demoWait(t, where = 'pickup', h = 3) { if (where === 'pickup') { const m = t.milestones.find(x => x.key === 'pickup_reached'); if (!m?.atMs) return 'Mark "Reached pickup" first.'; m.atMs -= h * HOUR; } else { if (!t.dropReachedAtMs) return 'Mark "Reached drop" first.'; t.dropReachedAtMs -= h * HOUR; } return ''; }

// ---------- 4. delivery code ----------
export function ensureCode(t) { t.deliveryOtp ||= String(1000 + Math.floor(Math.random() * 9000)); return t.deliveryOtp; }
export function checkCode(t, code) { ensureCode(t); return String(code || '').trim() === t.deliveryOtp ? '' : 'Enter the receiver\'s 4-digit delivery code. They see it in their MoveAI app.'; }

// ---------- trip screen panel ----------
export function tripPanel(s, t, ws) {
  const driver = ['commercialDriver', 'helper', 'staff'].includes(ws), cm = t.milestones?.find(m => m.status !== 'done'), w = waiting(t), done = k => !!at(t, k);
  checkDriving(s, t);
  const drive = t.drive && !done('delivered') ? `<div class="${drivingHours(t) >= DRIVE_LIMIT_H ? 'action-warning' : 'info-banner'}" data-tx-drive><b>${t.drive.onBreak ? `On a break for ${Math.round((clock() - t.drive.onBreak) / 60000)} min` : `Driving ${drivingHours(t).toFixed(1)} h without a break`}</b><span>${drivingHours(t) >= DRIVE_LIMIT_H ? `Stop for ${BREAK_MIN} minutes at a safe place.` : `A ${BREAK_MIN}-minute break is due every ${DRIVE_LIMIT_H} hours.`}</span>${driver ? `<span class="row-actions"><button class="button secondary compact" data-tx="${t.drive.onBreak ? 'break-end' : 'break-start'}" data-id="${t.id}">${t.drive.onBreak ? 'End break' : 'Start break'}</button><button class="button text compact" data-tx="drive-demo" data-id="${t.id}">Demo: 4 hours pass</button></span>` : ''}</div>` : '';
  const wait = (w.pickup || w.drop) ? `<div class="drv-wait" data-tx-wait>${w.pickup ? `<p class="price-line"><span>Waiting at pickup${w.pickup.running ? ' (running)' : ''} · ${w.pickup.hours} h</span><b>${w.pickup.charge ? inr(w.pickup.charge) : 'free'}</b></p>` : ''}${w.drop ? `<p class="price-line"><span>Waiting at drop${w.drop.running ? ' (running)' : ''} · ${w.drop.hours} h</span><b>${w.drop.charge ? inr(w.drop.charge) : 'free'}</b></p>` : ''}<small class="muted">${FREE_WAIT_H} h free at each end, then ${inr(DETENTION_RATE)}/h detention, added to the trip bill.</small>${driver && w.pickup?.running ? `<button class="button text compact" data-tx="wait-demo" data-id="${t.id}">Demo: waited 3 h</button>` : ''}</div>` : '';
  const drop = driver && done('in_transit') && !t.dropReachedAtMs && !done('delivered') ? `<button class="button secondary" data-tx="reached-drop" data-id="${t.id}">Reached drop</button>` : '';
  const code = ws === 'goods' && !done('delivered') ? `<div class="otp-share" data-tx-code><small>Delivery code · give it to the driver only after checking the goods</small><b>${esc(ensureCode(t))}</b></div>` : '';
  return drive || wait || drop || code ? `<section class="panel" data-tx-panel><h2>On the road</h2>${drive}${wait}${drop}${code}</section>` : '';
}
// The input shown with the "Delivered" milestone.
export const codeInput = (t, cm) => (cm?.key === 'delivered' ? '<label><span>Receiver\'s delivery code</span><input id="delivery-code" inputmode="numeric" maxlength="4" autocomplete="off"></label>' : '');
export function bind(root, api) {
  const S = () => api.getState(), trip = id => (S().trips || []).find(t => t.id === id);
  root.querySelectorAll('[data-tx]').forEach(b => b.onclick = () => {
    const t = trip(b.dataset.id), k = b.dataset.tx; if (!t) return;
    const e = k === 'break-start' ? breakStep(S(), t, true) : k === 'break-end' ? breakStep(S(), t, false) : k === 'drive-demo' ? demoDriving(t) : k === 'wait-demo' ? demoWait(t) : k === 'reached-drop' ? reachedDrop(S(), t) : '';
    api.save(); api.render(); api.toast(e || {'break-start': 'Break started', 'break-end': 'Break over — drive safe', 'drive-demo': '4 hours passed (demo)', 'wait-demo': 'Waited 3 hours (demo)', 'reached-drop': 'Reached drop — waiting time starts'}[k]);
  });
  root.querySelectorAll('[data-tx-renew]').forEach(f => f.onsubmit = e => { e.preventDefault(); const er = renew(S(), S().currentWorkspace, f.dataset.txRenew, f.querySelector('[name=file]')?.files?.[0]?.name || ''); if (er) return api.toast(er); api.save(); api.render(); api.toast('Renewed document uploaded — MoveAI checks it'); });
}
