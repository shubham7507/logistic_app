// MoveAI One — choosing a driver (personal drivers, and drivers with their own vehicle).
// Same rules as home services: only eligible drivers are asked, ranked by a score out of 100
// (distance 35, rating 20, reliability 20, skill fit 10, fair share 10, favourite 5; urgent → distance 50),
// top 3 for 60 seconds, best score among those who accept wins, nobody → wider area 5 → 10 → 15 km → admin,
// favourite first for 2 minutes, a driver who cancels hands the job to the next-best who accepted.
// One engine, two pools: `pools.personal` (s.driverPros) and `pools.owner` (s.ownerDrivers).
import {clock} from './pay.js';
import {km} from './geo.js';
import * as LOC from './location.js';

const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const notify = (s, to, text, ref, route) => { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, route, at: stamp(), read: false}); };

export const WINDOW_MS = 60 * 1000, FAVOURITE_MS = 2 * 60 * 1000, RADII = [5, 10, 15], MIN_RATING = 4.0, TOP_N = 3;
export const WEIGHTS = {distance: 35, rating: 20, reliability: 20, skill: 10, fair: 10, favourite: 5};
const HOUR = 3600000;

// When the job runs, as [start ms, end ms].
export function windowOf(r) {
  const start = Date.parse(`${r.date}T${r.startTime || '09:00'}:00`);
  const hours = r.kind === 'owner' ? 4 : ({hourly: Number(r.duration) || 4, daily: 10 * (Number(r.duration) || 1), oneway: 6, outstation: 24 * (Number(r.duration) || 1), monthly: 9}[r.hireType] || 4);
  return [start, start + hours * HOUR];
}
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];
export const statsOf = p => (p.stats ||= {accepted: 0, cancels: 0, noShows: 0, late: 0, strikes: 0});
export function ratingOf(s, p) {
  const rs = (s.serviceRequests || []).filter(r => r.driverId === p.id && r.rating), n = (p.ratingCount || 0) + rs.length;
  return n ? {avg: Math.round((((p.rating || 0) * (p.ratingCount || 0)) + rs.reduce((a, r) => a + r.rating, 0)) / n * 10) / 10, n} : {avg: 0, n: 0};
}
const pointOf = r => LOC.point(r.pickup || r.fromLoc) || null;
export const distanceTo = (p, r) => { const a = p.base, b = pointOf(r); return a && b ? km(a, b) : null; };
const online = (s, p) => (p.ws ? s.workerStatus?.[p.ws]?.online !== false : p.online !== false);
const busy = (s, p, r) => (s.serviceRequests || []).some(x => x.id !== r.id && x.driverId === p.id && ['accepted', 'on_the_way', 'in_progress', 'loading', 'in_transit'].includes(x.status) && overlaps(windowOf(x), windowOf(r)));
const works = (p, r) => { const h = p.hours || {days: [0, 1, 2, 3, 4, 5, 6], from: 6, to: 23}, t = Date.parse(`${r.date}T${r.startTime || '09:00'}:00`), d = new Date(t); const hr = Number((r.startTime || '09:00').slice(0, 2)); return (h.days || []).includes(d.getDay()) && hr >= h.from && hr < h.to; };

// What each pool checks on top of the shared rules.
export const pools = {
  personal: {key: 'driverPros', label: 'driver', skill(p, r) {
    const c = r.car || {}; if (c.transmission === 'automatic' && !(p.transmissions || ['manual']).includes('automatic')) return 'cannot drive automatic';
    if (c.transmission === 'manual' && !(p.transmissions || ['manual']).includes('manual')) return 'cannot drive manual';
    if (!(p.bodies || ['hatchback', 'sedan']).includes(c.body || 'hatchback')) return `does not drive ${c.body}`;
    if (r.hireType === 'outstation' && !p.outstation) return 'no outstation trips'; if (r.hireType === 'monthly') return 'monthly drivers are chosen by the customer';
    return ''; },
    fit: (p, r) => (p.policeVerified ? 5 : 0) + (p.trained ? 3 : 0) + ((p.bodies || []).includes('luxury') && r.car?.body === 'luxury' ? 2 : 0)},
  owner: {key: 'ownerDrivers', label: 'vehicle driver', skill(p, r) { return p.vehicleId === r.vehicleId ? '' : `has a ${p.vehicleId}, job needs ${r.vehicleId}`; },
    fit: (p, r) => (p.trained ? 5 : 0) + (p.helpsLoad && r.help === 'driver' ? 5 : 0)},
};
const poolOf = r => pools[r.kind === 'owner' ? 'owner' : 'personal'];
const list = (s, r) => s[poolOf(r).key] || [];
export const byId = (s, r, id) => list(s, r).find(p => p.id === id) || null;
export const providerOf = (p, r) => p.ws || `${r.kind === 'owner' ? 'owner' : 'drv'}:${p.id}`;

export function ineligible(s, p, r, radius = 15) {
  if (p.active === false) return 'paused';
  if (!p.verified) return 'not verified';
  if (p.docsExpired || Object.values(p.docs || {}).some(d => d < new Date(clock()).toISOString().slice(0, 10))) return 'documents expired';
  const sk = poolOf(r).skill(p, r); if (sk) return sk;
  if (!online(s, p)) return 'offline';
  const d = distanceTo(p, r); if (d != null && (d > (p.radiusKm || 10) || d > radius)) return 'outside area';
  if (!works(p, r)) return 'not working then';
  if (busy(s, p, r)) return 'busy then';
  const rt = ratingOf(s, p); if (rt.n && rt.avg < MIN_RATING) return 'rating below 4.0';
  return '';
}
export function score(s, p, r) {
  const urgent = !!r.urgent, d = distanceTo(p, r), radius = Math.max(p.radiusKm || 10, 1), st = statsOf(p), rt = ratingOf(s, p);
  const w = urgent ? {...WEIGHTS, distance: 50, rating: 10, reliability: 15} : WEIGHTS;
  const distance = d == null ? w.distance / 2 : Math.max(0, w.distance * (1 - d / radius));
  const rating = rt.n ? Math.max(0, Math.min(w.rating, w.rating * (rt.avg - 3.5) / 1.5)) : w.rating * 0.6;
  const reliability = Math.max(0, w.reliability - 5 * (st.cancels || 0) - 8 * (st.noShows || 0) - 2 * (st.late || 0));
  const skill = Math.min(10, poolOf(r).fit(p, r));
  const today = (s.serviceRequests || []).filter(x => x.driverId === p.id && x.date === r.date && x.id !== r.id && x.status !== 'cancelled').length;
  const fair = Math.max(0, w.fair - 3 * today);
  const fav = r.favouriteDriverId === p.id || (s.serviceRequests || []).some(x => x.customer === r.customer && x.driverId === p.id && ['paid', 'closed'].includes(x.status) && x.id !== r.id) ? w.favourite : 0;
  const parts = {distance, rating, reliability, skill, fair, favourite: fav};
  return {total: Math.round(Object.values(parts).reduce((a, x) => a + x, 0)), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)])), km: d == null ? null : Math.round(d * 10) / 10};
}
export function ranked(s, r, radius) {
  const offered = new Set(r.dispatch?.offered || []);
  return list(s, r).filter(p => !offered.has(p.id) && !ineligible(s, p, r, radius)).map(p => ({p, ...score(s, p, r)})).sort((a, b) => b.total - a.total);
}
function offer(s, r, picks, windowMs, why) {
  const d = r.dispatch; d.round += 1; d.current = {ids: picks.map(x => x.p.id), at: clock(), windowMs, why}; d.offered.push(...d.current.ids);
  d.log.push({at: stamp(), text: `Round ${d.round}${why ? ` (${why})` : ''}: offered to ${picks.map(x => `${x.p.name} (${x.total})`).join(', ')} within ${d.radiusKm} km`});
  for (const x of picks) {
    if (x.p.ws) notify(s, x.p.ws, `New ${r.kind === 'owner' ? 'vehicle' : 'driver'} job ${r.id} · ${r.date} ${r.startTime || ''} · ${x.km != null ? `${x.km} km away` : 'near you'}. Accept within ${Math.round(windowMs / 60000)} min.`, r.id, 'myJobs');
    else if (x.p.demoAnswer) d.responses[x.p.id] = x.p.demoAnswer;
  }
}
export function start(s, r) {
  r.dispatch = {round: 0, radiusKm: RADII[0], offered: [], responses: {}, log: [], current: null, backups: []};
  if (r.favouriteDriverId) { const f = byId(s, r, r.favouriteDriverId); if (f && !ineligible(s, f, r)) { offer(s, r, [{p: f, ...score(s, f, r)}], FAVOURITE_MS, 'favourite driver first'); return settle(s, r); } }
  return nextRound(s, r);
}
export function nextRound(s, r) {
  const d = r.dispatch;
  for (;;) {
    const picks = ranked(s, r, d.radiusKm).slice(0, TOP_N);
    if (picks.length) { offer(s, r, picks, WINDOW_MS, d.round ? '' : 'top 3 by score'); return settle(s, r); }
    const i = RADII.indexOf(d.radiusKm);
    if (i < RADII.length - 1) { d.radiusKm = RADII[i + 1]; d.widened = true; d.log.push({at: stamp(), text: `Nobody free nearby — area widened to ${d.radiusKm} km`}); continue; }
    d.current = null; d.exhausted = true; d.log.push({at: stamp(), text: 'No eligible driver within 15 km'});
    if (!d.adminTold) { d.adminTold = true; notify(s, 'admin', `${r.id}: no ${poolOf(r).label} free within 15 km. Assign by hand or call the customer.`, r.id, 'driversAdmin'); notify(s, r.customer || 'personal', `${r.id}: no driver is free near you right now. Our team will call you; you can also change the time or cancel for free.`, r.id, 'serviceDetail'); }
    return '';
  }
}
function settle(s, r, {force = false} = {}) {
  const d = r.dispatch, c = d.current; if (!c || r.status !== 'searching') return '';
  const answered = c.ids.every(id => d.responses[id]), expired = clock() - c.at >= c.windowMs;
  if (!(answered || expired || force)) return '';
  const yes = c.ids.filter(id => d.responses[id] === 'accept').map(id => byId(s, r, id)).filter(p => p && !ineligible(s, p, r, d.radiusKm)).map(p => ({p, ...score(s, p, r)})).sort((a, b) => b.total - a.total);
  d.current = null;
  if (!yes.length) { d.log.push({at: stamp(), text: expired ? 'Nobody accepted in time' : 'Everyone declined'}); return nextRound(s, r); }
  const [win, ...rest] = yes; d.backups = rest.map(x => x.p.id);
  for (const x of rest) if (x.p.ws) notify(s, x.p.ws, `${r.id}: given to a closer or better-matched driver. No penalty — you are first in line for the next job.`, r.id, 'myJobs');
  return assign(s, r, win.p, win);
}
export function assign(s, r, p, sc = score(s, p, r)) {
  r.dispatch ||= {round: 0, radiusKm: 15, offered: [], responses: {}, log: [], current: null, backups: []};
  const prov = providerOf(p, r);
  Object.assign(r, {status: 'accepted', provider: prov, providerName: p.name, driverId: p.id, acceptedAt: stamp(), conversationId: r.conversationId || `CNV-${r.id}`});
  r.dispatch.winner = {id: p.id, total: sc.total, parts: sc.parts, km: sc.km}; statsOf(p).accepted = (statsOf(p).accepted || 0) + 1;
  const conv = (s.conversations ||= []).find(x => x.id === r.conversationId);
  if (conv) conv.participants = [r.customer || 'personal', prov]; else s.conversations.unshift({id: r.conversationId, kind: 'job', ref: r.id, title: `${r.id} · ${r.kind === 'owner' ? 'Vehicle' : 'Driver'} booking`, participants: [r.customer || 'personal', prov], status: 'open', messages: [{id: uid('M'), from: p.name, type: 'text', body: `Namaste, I am ${p.name}. See you on ${r.date} at ${r.startTime}.`, at: stamp()}]});
  (r.timeline ||= []).push({at: stamp(), text: `${p.name} accepted (score ${sc.total})`}); r.dispatch.log.push({at: stamp(), text: `Given to ${p.name} · score ${sc.total}`});
  const rt = ratingOf(s, p);
  notify(s, r.customer || 'personal', `${r.id}: ${p.name} (★${rt.avg || 'New'}, licence and ID verified${p.policeVerified ? ', police verified' : ''}) will come on ${r.date} at ${r.startTime}.`, r.id, 'serviceDetail');
  if (p.ws) notify(s, p.ws, `${r.id}: the job is yours. Navigate when it is time to go.`, r.id, 'driverJob');
  return '';
}
export function respond(s, r, p, answer) {
  const d = r.dispatch; if (!d || r.status !== 'searching') return 'This job was given to another driver or cancelled.';
  if (!d.current?.ids.includes(p.id)) return 'This job is no longer offered to you.';
  if (d.responses[p.id]) return '';
  d.responses[p.id] = answer; if (answer === 'decline') (r.declinedBy ||= []).push(p.id);
  return settle(s, r);
}
export const offeredTo = (r, p) => r.status === 'searching' && r.dispatch?.current?.ids.includes(p.id) && !r.dispatch.responses[p.id];
export function timePasses(s, r) { const c = r.dispatch?.current; if (!c) return 'No offer is waiting.'; c.at -= c.windowMs; return settle(s, r, {force: true}); }
export function tick(s) { let n = 0; for (const r of s.serviceRequests || []) if (r.dispatch && r.status === 'searching' && r.dispatch.current && clock() - r.dispatch.current.at >= r.dispatch.current.windowMs && ['driver', 'moving'].includes(r.type)) { settle(s, r); n++; } return n; }
export function cancelByDriver(s, r, p, reason = '') {
  if (r.driverId !== p.id || !['accepted', 'on_the_way'].includes(r.status)) return 'You can cancel only an upcoming job.';
  if (String(reason).trim().length < 3) return 'Say why you are cancelling.';
  statsOf(p).cancels = (statsOf(p).cancels || 0) + 1;
  r.timeline.push({at: stamp(), text: `${p.name} cancelled: ${String(reason).trim()}`}); r.dispatch.log.push({at: stamp(), text: `${p.name} cancelled — finding the next driver`});
  Object.assign(r, {status: 'searching', provider: null, providerName: null, driverId: null}); delete r.track; delete r.geo; delete r.arrivedAt; r.dispatch.offered.push(p.id);
  const next = (r.dispatch.backups || []).map(id => byId(s, r, id)).filter(x => x && !ineligible(s, x, r, r.dispatch.radiusKm)).map(x => ({p: x, ...score(s, x, r)})).sort((a, b) => b.total - a.total)[0];
  if (next) { r.dispatch.backups = r.dispatch.backups.filter(id => id !== next.p.id); assign(s, r, next.p, next); notify(s, r.customer || 'personal', `${r.id}: ${p.name} had to cancel. ${next.p.name} will come instead.`, r.id, 'serviceDetail'); return ''; }
  notify(s, r.customer || 'personal', `${r.id}: ${p.name} had to cancel. We are finding another driver now — nothing to do on your side.`, r.id, 'serviceDetail');
  return nextRound(s, r);
}
