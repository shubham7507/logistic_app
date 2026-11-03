// MoveAI One — choosing the pro for a home-service job.
// Only eligible pros are offered a job (online, inside their working radius and hours, right skill, free in
// that slot, rating 4.0+ or new). They are ranked by a score out of 100 and the top 3 get it for 60 seconds;
// if several accept, the highest score wins and the others are told at once. Nobody accepts → next 3 and a
// wider area (5 → 10 → 15 km), then admin. Favourite pro first (2 minutes). A pro who cancels hands the job to
// the next-best pro who accepted. Painting / big cleaning: up to 3 pros quote and the customer chooses.
// In production the 60-second timer runs on the server; in the prototype "time passes" is a demo button / tick().
import {clock} from './pay.js';
import {km} from './geo.js';
import * as LOC from './location.js';

const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const notify = (s, to, text, ref, route) => { (s.notifications ||= []).unshift({id: uid('NT'), to, text, ref, route, at: stamp(), read: false}); };
const LABEL = {electrician: 'Electrician', plumber: 'Plumber', carpenter: 'Carpenter', cleaning: 'Home cleaning', painting: 'Painting'};
const SLOT = {'08': '8–10 AM', 10: '10 AM–12 PM', 12: '12–2 PM', 14: '2–4 PM', 16: '4–6 PM', 18: '6–8 PM'};

export const WINDOW_MS = 60 * 1000, FAVOURITE_MS = 2 * 60 * 1000, RADII = [5, 10, 15], MIN_RATING = 4.0, TOP_N = 3;
export const QUOTE_CATS = ['painting'];
export const WEIGHTS = {distance: 35, rating: 20, reliability: 20, skill: 10, fair: 10, favourite: 5};

const pros = s => s.homePros || [];
export const proById = (s, id) => pros(s).find(p => p.id === id) || null;
export const providerOf = p => p.ws || `pro:${p.id}`;
const dest = r => LOC.point(r.address);
export const baseOf = p => p.base || p.coords || null;
export function ratingOf(s, p) {
  const rs = (s.serviceRequests || []).filter(r => r.proId === p.id && r.rating), n = (p.ratingCount || 0) + rs.length;
  return n ? {avg: Math.round((((p.rating || 0) * (p.ratingCount || 0)) + rs.reduce((a, r) => a + r.rating, 0)) / n * 10) / 10, n} : {avg: 0, n: 0};
}
export const stats = p => (p.stats ||= {accepted: 0, cancels: 0, noShows: 0, late: 0, strikes: 0});
const busy = (s, p, r) => (s.serviceRequests || []).some(x => x.id !== r.id && x.type === 'general' && x.proId === p.id && x.date === r.date && x.slot === r.slot && ['accepted', 'on_the_way', 'in_progress'].includes(x.status));
const online = (s, p) => (p.ws ? s.workerStatus?.[p.ws]?.online !== false : p.online !== false);
const works = (p, r) => { const h = p.hours || {days: [0, 1, 2, 3, 4, 5, 6], from: 8, to: 20}, start = Number(r.slot), day = new Date(`${r.date}T12:00:00`).getDay(); return (h.days || []).includes(day) && start >= h.from && start < h.to; };
export const distanceTo = (p, r) => { const a = baseOf(p), b = dest(r); return a && b ? km(a, b) : null; };

// Why a pro can or cannot get this job ('' = eligible).
export function ineligible(s, p, r, radius = 15) {
  if (p.active === false) return 'paused';
  if (!p.verified) return 'not verified';
  if (!(p.skills || []).includes(r.category)) return 'no skill';
  if (!online(s, p)) return 'offline';
  const d = distanceTo(p, r); if (d != null && (d > (p.radiusKm || 10) || d > radius)) return 'outside area';
  if (!works(p, r)) return 'not working then';
  if (busy(s, p, r)) return 'busy in that slot';
  const rt = ratingOf(s, p); if (rt.n && rt.avg < MIN_RATING) return 'rating below 4.0';
  return '';
}
// Score out of 100 with the breakdown shown in "Why this pro".
export function score(s, p, r) {
  const urgent = !!r.urgent, d = distanceTo(p, r), radius = Math.max(p.radiusKm || 10, 1), st = stats(p), rt = ratingOf(s, p);
  const w = urgent ? {...WEIGHTS, distance: 50, rating: 10, reliability: 15} : WEIGHTS;
  const distance = d == null ? w.distance / 2 : Math.max(0, w.distance * (1 - d / radius));
  const rating = rt.n ? Math.max(0, Math.min(w.rating, w.rating * (rt.avg - 3.5) / 1.5)) : w.rating * 0.6;
  const reliability = Math.max(0, w.reliability - 5 * (st.cancels || 0) - 8 * (st.noShows || 0) - 2 * (st.late || 0));
  const skill = (p.trained ? 6 : 0) + ((p.jobTypes || []).some(t => (r.items || []).some(i => i.id === t)) ? 4 : 0);
  const today = (s.serviceRequests || []).filter(x => x.proId === p.id && x.date === r.date && x.status !== 'cancelled' && x.id !== r.id).length;
  const fair = Math.max(0, w.fair - 3 * today);
  const fav = r.favouriteProId === p.id || (s.serviceRequests || []).some(x => x.customer === r.customer && x.proId === p.id && ['paid', 'closed'].includes(x.status) && x.id !== r.id) ? w.favourite : 0;
  const parts = {distance, rating, reliability, skill, fair, favourite: fav};
  return {total: Math.round(Object.values(parts).reduce((a, x) => a + x, 0)), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)])), km: d == null ? null : Math.round(d * 10) / 10};
}
export function ranked(s, r, radius) {
  const d = r.dispatch || {}, offered = new Set(d.offered || []);
  return pros(s).filter(p => !offered.has(p.id) && !ineligible(s, p, r, radius)).map(p => ({p, ...score(s, p, r)})).sort((a, b) => b.total - a.total);
}

// ---------- rounds ----------
function offer(s, r, list, windowMs, why) {
  const d = r.dispatch; d.round += 1; d.current = {ids: list.map(x => x.p.id), at: clock(), windowMs, why}; d.offered.push(...d.current.ids);
  d.log.push({at: stamp(), text: `Round ${d.round}${why ? ` (${why})` : ''}: offered to ${list.map(x => `${x.p.name} (${x.total})`).join(', ')} within ${d.radiusKm} km`});
  const quote = QUOTE_CATS.includes(r.category);
  for (const x of list) {
    if (x.p.ws) notify(s, x.p.ws, `${quote ? 'Quote request' : 'New job'} ${r.id} · ${LABEL[r.category]} · ${r.date} ${SLOT[r.slot] || ''} · ${x.km != null ? `${x.km} km away` : 'near you'}. ${quote ? 'Send your price.' : 'Accept within 60 seconds.'}`, r.id, 'proJobs');
    else if (x.p.demoAnswer) { d.responses[x.p.id] = quote ? (x.p.demoQuote ? 'quote' : 'decline') : x.p.demoAnswer; if (quote && x.p.demoQuote) (r.quotes ||= []).push({proId: x.p.id, amount: x.p.demoQuote, note: x.p.demoQuoteNote || 'Walls and ceiling, 2 coats, paint included', at: stamp()}); }
  }
}
export function start(s, r) {
  r.dispatch = {round: 0, radiusKm: RADII[0], offered: [], responses: {}, log: [], current: null, backups: []};
  if (r.favouriteProId) { const f = proById(s, r.favouriteProId); if (f && !ineligible(s, f, r)) { offer(s, r, [{p: f, ...score(s, f, r)}], FAVOURITE_MS, 'favourite pro first'); return settle(s, r); } }
  return nextRound(s, r);
}
export function nextRound(s, r) {
  const d = r.dispatch;
  for (;;) {
    const list = ranked(s, r, d.radiusKm).slice(0, TOP_N);
    if (list.length) { offer(s, r, list, WINDOW_MS, d.round ? '' : 'top 3 by score'); return settle(s, r); }
    const i = RADII.indexOf(d.radiusKm);
    if (i < RADII.length - 1) { d.radiusKm = RADII[i + 1]; d.widened = true; d.log.push({at: stamp(), text: `Nobody free nearby — area widened to ${d.radiusKm} km`}); continue; }
    d.current = null; d.exhausted = true; d.log.push({at: stamp(), text: 'No eligible pro within 15 km'});
    if (!d.adminTold) { d.adminTold = true; notify(s, 'admin', `${r.id}: no ${LABEL[r.category].toLowerCase()} free within 15 km. Assign by hand or call the customer.`, r.id, 'homeServicesAdmin'); }
    return '';
  }
}
// Resolve the current round if everyone answered (or the window passed).
function settle(s, r, {force = false} = {}) {
  const d = r.dispatch, c = d.current; if (!c || r.status !== 'searching') return '';
  const answered = c.ids.every(id => d.responses[id]), expired = clock() - c.at >= c.windowMs;
  if (QUOTE_CATS.includes(r.category)) { if ((answered || expired || force) && !(r.quotes || []).length) { d.current = null; return nextRound(s, r); } return ''; }
  const yes = c.ids.filter(id => d.responses[id] === 'accept').map(id => proById(s, id)).filter(p => p && !ineligible(s, p, r, d.radiusKm)).map(p => ({p, ...score(s, p, r)})).sort((a, b) => b.total - a.total);
  if (!(answered || expired || force) && !(yes.length && answered)) return '';
  d.current = null;
  if (!yes.length) { d.log.push({at: stamp(), text: expired ? 'Nobody accepted in time' : 'Everyone declined'}); return nextRound(s, r); }
  const [win, ...rest] = yes; d.backups = rest.map(x => x.p.id);
  for (const x of rest) if (x.p.ws) notify(s, x.p.ws, `${r.id}: given to a closer or better-matched pro. You are first in line for the next job nearby.`, r.id, 'proJobs');
  return assign(s, r, win.p, win);
}
export function assign(s, r, p, sc = score(s, p, r)) {
  const prov = providerOf(p); r.dispatch ||= {round: 0, radiusKm: 15, offered: [], responses: {}, log: [], current: null, backups: []};
  Object.assign(r, {status: 'accepted', provider: prov, providerName: p.name, proId: p.id, acceptedAt: stamp(), conversationId: r.conversationId || `CNV-${r.id}`});
  r.dispatch.winner = {proId: p.id, total: sc.total, parts: sc.parts, km: sc.km}; stats(p).accepted = (stats(p).accepted || 0) + 1;
  const conv = (s.conversations ||= []).find(c => c.id === r.conversationId);
  if (conv) conv.participants = ['personal', prov]; else s.conversations.unshift({id: r.conversationId, kind: 'job', ref: r.id, title: `${r.id} · ${LABEL[r.category]} visit`, participants: ['personal', prov], status: 'open', messages: [{id: uid('M'), from: `${p.name} · ${LABEL[r.category]}`, type: 'text', body: `Namaste, I am ${p.name}. I will come on ${r.date}, ${SLOT[r.slot] || ''}.`, at: stamp()}]});
  (r.timeline ||= []).push({at: stamp(), text: `${p.name} accepted (score ${sc.total})`}); r.dispatch.log.push({at: stamp(), text: `Given to ${p.name} · score ${sc.total}`});
  const rt = ratingOf(s, p);
  notify(s, 'personal', `${r.id}: ${p.name} (★${rt.avg || 'New'}, ID verified${p.trained ? ', trained' : ''}) will come on ${r.date}, ${SLOT[r.slot] || ''}.`, r.id, 'serviceDetail');
  if (p.ws) notify(s, p.ws, `${r.id}: the job is yours. Navigate when it is time to go.`, r.id, 'proJob');
  return '';
}
// A pro answers an offer.
export function respond(s, r, p, answer) {
  const d = r.dispatch; if (!d || r.status !== 'searching') return 'This job was given to another pro or cancelled.';
  if (!d.current?.ids.includes(p.id)) return 'This job is no longer offered to you.';
  if (d.responses[p.id]) return '';
  d.responses[p.id] = answer;
  if (answer === 'decline') (r.declinedBy ||= []).push(p.id);
  return settle(s, r);
}
export const offeredTo = (s, r, p) => r.type === 'general' && r.status === 'searching' && r.dispatch?.current?.ids.includes(p.id) && !r.dispatch.responses[p.id];
// Demo / server timer: the round window passes.
export function timePasses(s, r) { const c = r.dispatch?.current; if (!c) return 'No offer is waiting.'; c.at -= c.windowMs; return settle(s, r, {force: true}); }
export function tick(s) { for (const r of s.serviceRequests || []) if (r.type === 'general' && r.status === 'searching' && r.dispatch?.current && clock() - r.dispatch.current.at >= r.dispatch.current.windowMs) settle(s, r); }

// The assigned pro cancels → the next-best pro who accepted, else a new round.
export function proCancel(s, r, p, reason = '') {
  if (r.proId !== p.id || !['accepted', 'on_the_way'].includes(r.status)) return 'You can cancel only an upcoming job.';
  if (String(reason).trim().length < 3) return 'Say why you are cancelling.';
  stats(p).cancels = (stats(p).cancels || 0) + 1;
  r.timeline.push({at: stamp(), text: `${p.name} cancelled: ${String(reason).trim()}`}); r.dispatch.log.push({at: stamp(), text: `${p.name} cancelled — finding the next pro`});
  Object.assign(r, {status: 'searching', provider: null, providerName: null, proId: null}); delete r.track; delete r.geo; delete r.arrivedAt;
  r.dispatch.offered.push(p.id);
  const next = (r.dispatch.backups || []).map(id => proById(s, id)).filter(x => x && !ineligible(s, x, r, r.dispatch.radiusKm)).map(x => ({p: x, ...score(s, x, r)})).sort((a, b) => b.total - a.total)[0];
  if (next) { r.dispatch.backups = r.dispatch.backups.filter(id => id !== next.p.id); assign(s, r, next.p, next); notify(s, 'personal', `${r.id}: ${p.name} had to cancel. ${next.p.name} will come instead.`, r.id, 'serviceDetail'); return ''; }
  notify(s, 'personal', `${r.id}: ${p.name} had to cancel. We are finding another pro now — nothing to do on your side.`, r.id, 'serviceDetail');
  return nextRound(s, r);
}

// ---------- quotes (painting) ----------
export function sendQuote(s, r, p, {amount, note}) {
  if (!QUOTE_CATS.includes(r.category) || r.status !== 'searching') return 'Quotes are closed for this job.';
  if (!r.dispatch?.current?.ids.includes(p.id) && !(r.dispatch?.offered || []).includes(p.id)) return 'This job was not offered to you.';
  const a = Math.round(Number(amount) || 0); if (a < 500) return 'Enter your full price (at least ₹500).';
  if (String(note || '').trim().length < 5) return 'Say what is included (rooms, coats, days, paint).';
  r.quotes = (r.quotes || []).filter(q => q.proId !== p.id); r.quotes.push({proId: p.id, amount: a, note: String(note).trim(), at: stamp()});
  r.dispatch.responses[p.id] = 'quote';
  notify(s, 'personal', `${r.id}: ${p.name} sent a quote of ₹${a.toLocaleString('en-IN')}. Compare and choose.`, r.id, 'serviceDetail');
  return '';
}
export function chooseQuote(s, r, proId) {
  const q = (r.quotes || []).find(x => x.proId === proId), p = proById(s, proId); if (!q || !p || r.status !== 'searching') return 'That quote is no longer available.';
  r.inspectionQuote = {amount: q.amount, note: q.note, status: 'approved', at: stamp(), chosen: true};
  r.quote = {...r.quote, partnerLines: [[`Painting as quoted: ${q.note}`, q.amount]], components: [[`Painting as quoted: ${q.note}`, q.amount]], partnerTotal: q.amount, total: q.amount};
  r.dispatch.current = null; assign(s, r, p);
  for (const o of r.quotes) if (o.proId !== proId) { const op = proById(s, o.proId); if (op?.ws) notify(s, op.ws, `${r.id}: the customer chose another quote.`, r.id, 'proJobs'); }
  return '';
}

// ---------- demo: a pro without a workspace does the next step ----------
export function demoProStep(s, r) {
  if (!String(r.provider || '').startsWith('pro:')) return 'This pro uses their own app.';
  if (r.status === 'accepted') { r.status = 'on_the_way'; r.timeline.push({at: stamp(), text: 'On the way'}); return ''; }
  if (r.status === 'on_the_way') { const to = dest(r); if (to) { (r.track ||= []).push({lat: to[0], lng: to[1], at: Date.now(), src: 'demo'}); r.geo = {live: false, lastAt: Date.now()}; } r.arrivedAt = stamp(); r.status = 'in_progress'; r.timeline.push({at: stamp(), text: 'Work started'}); return ''; }
  if (r.status === 'in_progress') { r.status = 'provider_done'; r.afterPhoto = 'finished-work.jpg'; r.timeline.push({at: stamp(), text: 'Work done'}); notify(s, 'personal', `${r.id}: ${r.providerName} marked the work done. Check it, confirm and pay.`, r.id, 'serviceDetail'); return ''; }
  return 'Nothing to do.';
}
