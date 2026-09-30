// MoveAI One — simulated connection to the government GST systems through a GST Suvidha Provider (GSP).
// E-way bills: Part A (goods) by consignor/consignee or transporter, Part B (vehicle) by transporter,
// automatic vehicle update when a truck is replaced, validity by distance, extension near expiry,
// cancellation within 24 hours, Transporter ID (TRANSIN) for unregistered transporters, consolidated
// e-way bills for part loads. E-invoice: IRN + signed QR, invoice locked after registration, IRN cancel
// within 24 hours. Realistic portal errors, including an outage switch for testing.
// Rules (thresholds, validity, exemptions) are settings with placeholder defaults — confirm with a CA.
import {esc, pill, inr, opsCtx} from './ops.js';

const H = 3600000, DAY = 24 * H;
const now = () => Date.now() + ((globalThis.__moveaiClockOffset || 0) * DAY);
const stamp = t => new Date(t ?? now()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const head = (title, text, action = '') => `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
export const GST_RULES = {ewbThreshold: 50000, kmPerDay: 200, extendWindowH: 8, cancelWindowH: 24, einvoiceTurnover: 50000000};
export const HSN = {Rice: '1006', Wheat: '1001', Sugar: '1701', FMCG: '2106', 'Packaging material': '4819'};
export const hsnFor = g => { const k = Object.keys(HSN).find(x => String(g || '').toLowerCase().includes(x.toLowerCase())); return k ? HSN[k] : ''; };
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const CANCELLED_GSTINS = ['09AAACR5055K1Z9'];

// ---------- portal simulator ----------
function portal(state) {
  state.gstPortal ||= {down: false, log: []};
  return {
    call(kind, payload) {
      state.gstPortal.log.unshift({kind, at: stamp(), ok: !state.gstPortal.down});
      if (state.gstPortal.down) return {ok: false, code: 'GSP-503', reason: 'The government portal is not responding. Nothing was created. Try again in a few minutes, or create it on the portal and enter the number here.'};
      for (const g of payload.gstins || []) {
        if (!g) continue;
        if (!GSTIN_RE.test(g)) return {ok: false, code: 'EWB-238', reason: `GSTIN ${g} is not valid. Check the 15 characters.`};
        if (CANCELLED_GSTINS.includes(g)) return {ok: false, code: 'EWB-209', reason: `GSTIN ${g} is cancelled on the GST portal. The e-way bill cannot be generated for it.`};
      }
      for (const p of payload.pins || []) if (!/^[1-9]\d{5}$/.test(String(p || ''))) return {ok: false, code: 'EWB-702', reason: `PIN code ${p || '(blank)'} is not valid.`};
      return {ok: true};
    },
  };
}
const num12 = () => String(Math.floor(1e11 + Math.random() * 9e11));
const hex = n => Array.from({length: n}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

// ---------- e-way bills ----------
export function ensureGst(state) {
  state.ewbs ||= [];
  state.gstPortal ||= {down: false, log: []};
  state.transporterIds ||= {};
  syncVehicles(state);
  return state;
}
export const ewbsForTrip = (state, tripId) => ensureGst(state).ewbs.filter(e => e.tripId === tripId && e.status !== 'cancelled');
export const validityDays = km => Math.max(1, Math.ceil(Number(km || 1) / GST_RULES.kmPerDay));
export function ewbStatus(e) {
  if (e.status === 'cancelled') return {status: 'cancelled', label: 'Cancelled'};
  if (!e.partB?.vehicle) return {status: 'part_a_only', label: 'Waiting for truck number (Part B)'};
  const left = e.validUntil - now();
  if (left <= 0) return {status: 'expired', label: `Expired ${stamp(e.validUntil)}`, hoursLeft: 0};
  const h = Math.floor(left / H);
  return {status: h < GST_RULES.extendWindowH ? 'expiring' : 'active', label: h < 48 ? `Valid for ${h} h` : `Valid until ${stamp(e.validUntil)}`, hoursLeft: h};
}
export function transporterIdOf(state, ws) { const set = state.freightSettings?.[ws]; return set?.gstin || state.transporterIds[ws] || ''; }
export function enrolTransporter(state, ws, v) {
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(String(v.pan || '').toUpperCase())) return {error: 'Enter the PAN of the business owner.'};
  if (!String(v.name || '').trim()) return {error: 'Enter the business name.'};
  if (state.transporterIds[ws]) return {error: 'Already enrolled.'};
  const r = portal(state).call('ENR-01', {}); if (!r.ok) return {error: r.reason};
  state.transporterIds[ws] = `${String(v.stateCode || '10').padStart(2, '0')}${String(v.pan).toUpperCase()}${hex(3).toUpperCase()}`;
  return {ok: true, id: state.transporterIds[ws]};
}
export function prefillFromTrip(state, t) {
  const order = (state.goodsOrders || []).find(o => o.id === t.goodsOrderId);
  const fs = state.freightSettings || {};
  const consignor = t.goodsRole === 'buyer' ? null : 'goods', consignee = t.goodsRole === 'buyer' ? 'goods' : null;
  return {invoiceNo: order ? `SF/${order.id}` : '', invoiceDate: new Date(now()).toISOString().slice(0, 10), value: order?.goodsPrice || t.goodsValue || 0, goods: t.goods || order?.goods || '', hsn: hsnFor(t.goods) || hsnFor(order?.goods) || '', fromGstin: consignor ? fs.goods?.gstin : '', toGstin: consignee ? fs.goods?.gstin : '', fromPin: t.fromPin || '800001', toPin: t.toPin || '110020', distanceKm: t.distanceKm || 1000, vehicle: t.registration || '', transporterId: transporterIdOf(state, t.owner === 'goods' ? 'goods' : 'transporter')};
}
export function generateEwb(state, t, v, byWs) {
  ensureGst(state);
  if (Number(v.value) <= GST_RULES.ewbThreshold) return {error: `Goods value ${inr(v.value)} is not above ${inr(GST_RULES.ewbThreshold)}, so an e-way bill is usually not needed (some states differ).`};
  if (!String(v.invoiceNo || '').trim() || !v.invoiceDate) return {error: 'Enter the goods invoice number and date from the sender.'};
  if (!/^\d{4,8}$/.test(String(v.hsn || ''))) return {error: 'Enter the HSN code of the goods (4–8 digits).'};
  if (!(Number(v.distanceKm) > 0)) return {error: 'Enter the approximate distance in km.'};
  if (ewbsForTrip(state, t.id).length) return {error: 'This trip already has an e-way bill. Update or cancel it instead.'};
  const r = portal(state).call('GENEWAYBILL', {gstins: [v.fromGstin, v.toGstin, v.transporterId && !v.transporterId.includes('TRANSIN') ? v.transporterId : null].filter(Boolean), pins: [v.fromPin, v.toPin]}); if (!r.ok) return {error: `${r.reason} (${r.code})`};
  const withB = Boolean(v.vehicle && String(v.vehicle).trim());
  const e = {no: num12(), tripId: t.id, generatedBy: byWs, generatedAt: now(), partA: {invoiceNo: v.invoiceNo, invoiceDate: v.invoiceDate, value: Number(v.value), goods: v.goods, hsn: v.hsn, fromGstin: v.fromGstin || 'URP', toGstin: v.toGstin || 'URP', fromPin: v.fromPin, toPin: v.toPin, distanceKm: Number(v.distanceKm)}, transporterId: v.transporterId || '', partB: withB ? {vehicle: String(v.vehicle).toUpperCase(), at: now(), by: byWs} : null, validUntil: withB ? now() + validityDays(v.distanceKm) * DAY : null, history: [{at: stamp(), text: `Generated by ${byWs}${withB ? ` with vehicle ${String(v.vehicle).toUpperCase()}` : ' (Part A only)'}`}], status: 'active'};
  state.ewbs.unshift(e);
  return {ok: true, ewb: e};
}
export function updatePartB(state, e, vehicle, reason, byWs) {
  if (e.status !== 'active') return {error: 'This e-way bill is not active.'};
  if (byWs !== 'goods' && e.transporterId && transporterIdOf(state, byWs) !== e.transporterId && !(e.transferredTo === byWs)) return {error: 'Only the assigned transporter can update the vehicle.'};
  if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(String(vehicle || '').toUpperCase().replace(/\s/g, ''))) return {error: 'Enter a valid vehicle number.'};
  const r = portal(state).call('VEHEWB', {}); if (!r.ok) return {error: `${r.reason} (${r.code})`};
  const first = !e.partB; const old = e.partB?.vehicle;
  e.partB = {vehicle: String(vehicle).toUpperCase(), at: now(), by: byWs};
  if (first) e.validUntil = now() + validityDays(e.partA.distanceKm) * DAY;
  e.history.push({at: stamp(), text: first ? `Vehicle ${e.partB.vehicle} added (Part B) · valid ${validityDays(e.partA.distanceKm)} day(s)` : `Vehicle changed ${old} → ${e.partB.vehicle} · ${reason || 'transshipment'}`});
  return {ok: true};
}
// When a trip's truck changes anywhere in the app, update Part B automatically.
export function syncVehicles(state) {
  for (const e of state.ewbs || []) {
    if (e.status !== 'active' || !e.partB) continue;
    const t = state.trips.find(x => x.id === e.tripId);
    const reg = t?.registration && String(t.registration).toUpperCase();
    if (reg && reg !== e.partB.vehicle && !e.pendingVehicle) {
      const r = updatePartB(state, e, reg, t.previousVehicles?.length ? 'Replacement truck assigned (breakdown / transshipment)' : 'Vehicle reassigned', t.owner);
      if (!r.ok) { e.pendingVehicle = reg; e.syncError = r.error; }
    }
  }
}
export function retrySync(state, e) { const reg = e.pendingVehicle; e.pendingVehicle = null; e.syncError = ''; const t = state.trips.find(x => x.id === e.tripId); return updatePartB(state, e, reg, 'Replacement truck (retried)', t?.owner); }
export function extendEwb(state, e, v, byWs) {
  const st = ewbStatus(e);
  const left = (e.validUntil - now()) / H;
  if (left > GST_RULES.extendWindowH || left < -GST_RULES.extendWindowH) return {error: `Extension is allowed only from ${GST_RULES.extendWindowH} hours before to ${GST_RULES.extendWindowH} hours after expiry. ${st.label}.`};
  if (!(Number(v.remainingKm) > 0)) return {error: 'Enter the remaining distance.'};
  if (!String(v.reason || '').trim()) return {error: 'Choose a reason (breakdown, accident, traffic, weather…).'};
  const r = portal(state).call('EXTENDVALIDITY', {}); if (!r.ok) return {error: `${r.reason} (${r.code})`};
  e.validUntil = Math.max(e.validUntil, now()) + validityDays(v.remainingKm) * DAY; e.extensions = (e.extensions || 0) + 1;
  e.history.push({at: stamp(), text: `Extended by ${validityDays(v.remainingKm)} day(s) · ${v.reason} · ${v.remainingKm} km left`});
  return {ok: true};
}
export function cancelEwb(state, e, reason, byWs) {
  if (e.status !== 'active') return {error: 'Already cancelled.'};
  if (now() - e.generatedAt > GST_RULES.cancelWindowH * H) return {error: 'E-way bills can be cancelled only within 24 hours of generation.'};
  if (!String(reason || '').trim()) return {error: 'Give a reason (trip cancelled, wrong details, duplicate).'};
  const r = portal(state).call('CANEWB', {}); if (!r.ok) return {error: `${r.reason} (${r.code})`};
  e.status = 'cancelled'; e.history.push({at: stamp(), text: `Cancelled by ${byWs}: ${reason}`});
  return {ok: true};
}
export function transferEwb(state, e, toWs) {
  const id = transporterIdOf(state, toWs); if (!id) return {error: `${toWs} has no GSTIN or Transporter ID. They must enrol first.`};
  const r = portal(state).call('UPDATETRANSPORTER', {}); if (!r.ok) return {error: `${r.reason} (${r.code})`};
  e.transporterId = id; e.transferredTo = toWs; e.history.push({at: stamp(), text: `Transporter changed to ${id}`});
  return {ok: true};
}
export function consolidate(state, nos, byWs) {
  const list = state.ewbs.filter(e => nos.includes(e.no));
  if (list.length < 2) return {error: 'Select at least two e-way bills.'};
  if (list.some(e => ewbStatus(e).status !== 'active' && ewbStatus(e).status !== 'expiring')) return {error: 'Only active e-way bills with a vehicle can be consolidated.'};
  if (new Set(list.map(e => e.partB.vehicle)).size > 1) return {error: 'All e-way bills must be on the same truck.'};
  const r = portal(state).call('GENCEWB', {}); if (!r.ok) return {error: `${r.reason} (${r.code})`};
  const c = {no: `C${num12().slice(1)}`, vehicle: list[0].partB.vehicle, ewbs: list.map(e => e.no), at: stamp(), by: byWs};
  (state.cewbs ||= []).unshift(c); list.forEach(e => { e.consolidatedIn = c.no; e.history.push({at: stamp(), text: `Included in consolidated e-way bill ${c.no}`}); });
  return {ok: true, cewb: c};
}
export function recordManualEwb(state, t, no) {
  if (!/^\d{12}$/.test(String(no || ''))) return {error: 'E-way bill numbers have 12 digits.'};
  ensureGst(state).ewbs.unshift({no: String(no), tripId: t.id, generatedBy: 'manual', generatedAt: now(), partA: {value: 0, distanceKm: 0}, partB: t.registration ? {vehicle: t.registration, at: now(), by: 'manual'} : null, validUntil: null, manual: true, history: [{at: stamp(), text: 'Created on the government portal and entered manually. MoveAI cannot track its validity.'}], status: 'active'});
  return {ok: true};
}
export function ewbAlerts(state, ws) {
  ensureGst(state);
  const trips = state.trips.filter(t => t.owner === ws || (t.parties || []).includes(ws) || (t.crew || []).some(c => c.persona === ws));
  return trips.flatMap(t => ewbsForTrip(state, t.id).filter(e => !e.manual).map(e => ({t, e, s: ewbStatus(e)})).filter(x => ['expiring', 'expired', 'part_a_only'].includes(x.s.status) || x.e.pendingVehicle))
    .concat(trips.filter(t => needsEwb(state, t) && !ewbsForTrip(state, t.id).length && !['closed', 'delivered'].includes(t.status)).map(t => ({t, e: null, s: {status: 'missing', label: 'No e-way bill yet'}})));
}
export function needsEwb(state, t) { const order = (state.goodsOrders || []).find(o => o.id === t.goodsOrderId); return Number(order?.goodsPrice || t.goodsValue || 0) > GST_RULES.ewbThreshold; }

// ---------- e-invoice ----------
export function einvoiceRequired(state, inv) {
  const set = state.freightSettings?.[inv.issuer] || {};
  if (!set.einvoice) return {required: false, reason: 'Turnover below the e-invoicing limit (setting).'};
  if (set.gtaExempt) return {required: false, reason: 'Goods transport agency services are generally exempt from e-invoicing (setting — confirm with your CA).'};
  return {required: true, reason: 'Turnover above the e-invoicing limit: register the invoice to get the IRN and QR code.'};
}
export function registerIrn(state, inv, amountsFn) {
  if (inv.irn) return {error: 'Already registered.'};
  const buyer = state.freightSettings?.[inv.billTo]?.gstin;
  if (!buyer) return {error: 'The buyer has no GSTIN; e-invoice applies to business-to-business invoices.'};
  const r = portal(state).call('GENIRN', {gstins: [state.freightSettings?.[inv.issuer]?.gstin, buyer]}); if (!r.ok) return {error: `${r.reason} (${r.code})`};
  inv.irn = hex(64); inv.ackNo = num12() + String(Math.floor(Math.random() * 1000)).padStart(3, '0'); inv.ackAt = now(); inv.irnTotal = amountsFn(state, inv).total; inv.locked = true;
  inv.history.push({at: stamp(), text: `E-invoice registered · IRN ${inv.irn.slice(0, 12)}… · Ack ${inv.ackNo}`});
  return {ok: true};
}
export function cancelIrn(state, inv, reason) {
  if (!inv.irn || inv.irnCancelled) return {error: 'No active IRN.'};
  if (now() - inv.ackAt > GST_RULES.cancelWindowH * H) return {error: 'An IRN can be cancelled only within 24 hours. Issue a credit note instead.'};
  if (!String(reason || '').trim()) return {error: 'Give a reason.'};
  const r = portal(state).call('CANIRN', {}); if (!r.ok) return {error: `${r.reason} (${r.code})`};
  inv.irnCancelled = true; inv.locked = false; inv.status = 'cancelled'; inv.history.push({at: stamp(), text: `IRN cancelled: ${reason}. Issue a fresh invoice.`});
  return {ok: true};
}
// Deterministic QR-like pattern from the IRN (visual stand-in for the signed QR).
export function qrSvg(seed, size = 120) {
  const n = 21, cell = size / n; let bits = ''; for (const ch of seed) bits += parseInt(ch, 16).toString(2).padStart(4, '0');
  let rects = ''; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); const on = finder ? (x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5) || (x > 13 && (x - 14) % 6 === 0)) : bits[(y * n + x) % bits.length] === '1'; if (on) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`; }
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Signed QR code (simulated)"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
}

// ---------- screens ----------
const statusPill = s => pill({active: 'active', expiring: 'expiring_soon', expired: 'expired', part_a_only: 'waiting', cancelled: 'cancelled', missing: 'missing'}[s.status] || s.status);
export function tripEwbPanel(state, t) {
  ensureGst(state);
  const ws = opsCtx(state).ownerWs, cur = opsCtx(state).ws;
  const list = ewbsForTrip(state, t.id);
  const driver = ['commercialDriver', 'helper'].includes(cur);
  if (driver) return list.length ? list.map(e => { const s = ewbStatus(e); return `<section class="panel ewb-card ${s.status}"><h2>E-way bill</h2><b class="ewb-no">${e.no.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')}</b>${statusPill(s)}<p>${esc(s.label)} · Vehicle ${esc(e.partB?.vehicle || '—')}</p><p class="muted">Show this to officers at checkpoints. ${s.status === 'expiring' || s.status === 'expired' ? 'Call your transporter to extend it now.' : ''}</p></section>`; }).join('') : (needsEwb(state, t) ? '<div class="action-warning"><b>No e-way bill yet</b><span>Do not start the trip without it. Ask your transporter.</span></div>' : '');
  const canAct = ['goods', 'transporter', 'vehicle', 'staff'].includes(cur);
  if (!canAct) return '';
  const pre = prefillFromTrip(state, t);
  return `<section class="panel ewb-panel"><div class="panel-header"><div><h2>E-way bill</h2><p>${needsEwb(state, t) ? `Goods value above ${inr(GST_RULES.ewbThreshold)} — needed before the truck moves.` : 'Needed only when goods value is above the limit.'}</p></div><button class="button text compact" data-gst-down>${state.gstPortal.down ? 'Prototype: portal is DOWN — switch on' : 'Prototype: simulate portal down'}</button></div>
  ${list.map(e => { const s = ewbStatus(e); return `<div class="ewb-row"><div><b class="ewb-no">${e.no.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')}</b> ${statusPill(s)}<small class="block muted">${esc(s.label)} · Vehicle ${esc(e.partB?.vehicle || 'not added')} · Transporter ${esc(e.transporterId || '—')}${e.consolidatedIn ? ` · in ${esc(e.consolidatedIn)}` : ''}${e.manual ? ' · entered manually' : ''}</small>${e.syncError ? `<div class="action-warning"><b>Vehicle update failed</b><span>${esc(e.syncError)}</span><button class="button secondary compact" data-gst-retry="${e.no}">Retry update to ${esc(e.pendingVehicle)}</button></div>` : ''}</div>
    ${e.manual || e.status !== 'active' ? '' : `<div class="row-actions">${!e.partB ? `<form class="inline-form" data-gst-form="partb" data-no="${e.no}"><input name="vehicle" value="${esc(t.registration || '')}" placeholder="Vehicle no."><button class="button primary compact">Add truck (Part B)</button></form>` : ''}${['expiring', 'expired'].includes(s.status) ? `<form class="inline-form" data-gst-form="extend" data-no="${e.no}"><input name="remainingKm" type="number" placeholder="Km left"><select name="reason"><option value="">Reason</option><option>Breakdown</option><option>Traffic / road block</option><option>Accident</option><option>Weather</option><option>Transshipment</option></select><button class="button primary compact">Extend validity</button></form>` : ''}${ws === 'transporter' ? `<button class="button secondary compact" data-gst-transfer="${e.no}">Pass to Truck Owner</button>` : ''}<details><summary class="button text compact">Cancel</summary><form class="inline-form" data-gst-form="cancel" data-no="${e.no}"><input name="reason" placeholder="Reason"><button class="button secondary compact">Cancel e-way bill</button></form></details></div>`}
    <details class="ewb-history"><summary>History</summary>${e.history.map(h => `<small class="block">${esc(h.at)} · ${esc(h.text)}</small>`).join('')}</details>`; }).join('')}
  ${!list.length ? `<form class="form-grid two" data-gst-form="generate"><label><span>Goods invoice no. (from sender)</span><input name="invoiceNo" value="${esc(pre.invoiceNo)}"></label><label><span>Invoice date</span><input type="date" name="invoiceDate" value="${esc(pre.invoiceDate)}"></label><label><span>Goods value (₹)</span><input type="number" name="value" value="${esc(pre.value)}"></label><label><span>HSN</span><input name="hsn" value="${esc(pre.hsn)}"></label><label><span>Sender GSTIN</span><input name="fromGstin" value="${esc(pre.fromGstin)}"></label><label><span>Receiver GSTIN (blank if unregistered)</span><input name="toGstin" value="${esc(pre.toGstin)}"></label><label><span>From PIN</span><input name="fromPin" value="${esc(pre.fromPin)}"></label><label><span>To PIN</span><input name="toPin" value="${esc(pre.toPin)}"></label><label><span>Distance (km)</span><input type="number" name="distanceKm" value="${esc(pre.distanceKm)}"></label><label><span>Transporter ID / GSTIN</span><input name="transporterId" value="${esc(pre.transporterId)}"></label><label><span>Vehicle (Part B)${cur === 'goods' ? ' — leave blank for the transporter to add' : ''}</span><input name="vehicle" value="${esc(cur === 'goods' ? '' : pre.vehicle)}"></label><p id="gst-error" class="field-error wide" hidden></p><div class="row-actions wide"><button class="button primary" type="submit">${cur === 'goods' ? 'Generate e-way bill' : 'Generate using the sender’s invoice'}</button></div><p class="mock-hint wide">Prototype test data: a GSTIN like 09AAACR5055K1Z9 is “cancelled”; a malformed GSTIN or PIN is rejected; the outage switch above makes every call fail.</p></form>
  <details><summary class="button text compact">Already created it on the government portal?</summary><form class="inline-form" data-gst-form="manual"><input name="no" placeholder="12-digit number" inputmode="numeric"><button class="button secondary compact">Save number</button></form></details>` : ''}<p id="gst-error" class="field-error" hidden></p></section>`;
}
export function ewbListScreen(state) {
  ensureGst(state);
  const ws = opsCtx(state).ownerWs;
  const mine = state.ewbs.filter(e => { const t = state.trips.find(x => x.id === e.tripId); return t && (t.owner === ws || (t.parties || []).includes(ws)); });
  const tid = transporterIdOf(state, ws);
  return `${head('E-way bills', 'Generated through MoveAI’s GST connection (simulated). Validity, vehicle changes and consolidation in one place.')}
  <div class="metrics"><div class="metric"><span>Active</span><b>${mine.filter(e => ewbStatus(e).status === 'active').length}</b><small>Valid now</small></div><div class="metric"><span>Expiring / expired</span><b class="${mine.some(e => ['expiring', 'expired'].includes(ewbStatus(e).status)) ? 'amount out' : ''}">${mine.filter(e => ['expiring', 'expired'].includes(ewbStatus(e).status)).length}</b><small>Extend within 8 hours of expiry</small></div><div class="metric"><span>Waiting for Part B</span><b>${mine.filter(e => ewbStatus(e).status === 'part_a_only').length}</b><small>Truck number needed</small></div><div class="metric"><span>Your Transporter ID</span><b class="small-b">${esc(tid || 'None')}</b><small>${tid ? (state.freightSettings?.[ws]?.gstin ? 'GSTIN' : 'TRANSIN') : 'Enrol below'}</small></div></div>
  ${!tid ? `<section class="panel"><h2>Enrol for a Transporter ID</h2><p class="muted">Unregistered transporters and truck owners get a Transporter ID (form ENR-01) so they can be assigned e-way bills and update vehicles.</p><form class="inline-form" data-gst-form="enrol"><input name="name" placeholder="Business name" value="${esc(state.freightSettings?.[ws]?.legalName || '')}"><input name="pan" placeholder="PAN" value="${esc(state.freightSettings?.[ws]?.pan || '')}"><input name="stateCode" placeholder="State code" value="10"><button class="button primary compact">Enrol</button></form><p id="gst-error" class="field-error" hidden></p></section>` : ''}
  <section class="panel"><form data-gst-form="consolidate"><div class="table-scroll"><table class="data-table"><thead><tr><th></th><th>E-way bill</th><th>Trip</th><th>Vehicle</th><th>Status</th><th>Value</th></tr></thead><tbody>${mine.map(e => { const s = ewbStatus(e); return `<tr><td>${['active', 'expiring'].includes(s.status) && !e.consolidatedIn ? `<input type="checkbox" name="nos" value="${e.no}">` : ''}</td><td><b>${e.no}</b>${e.consolidatedIn ? `<small class="block muted">in ${esc(e.consolidatedIn)}</small>` : ''}</td><td>${esc(e.tripId)}</td><td>${esc(e.partB?.vehicle || '—')}</td><td>${statusPill(s)}<small class="block muted">${esc(s.label)}</small></td><td>${e.partA.value ? inr(e.partA.value) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="6">No e-way bills yet. Generate one from a trip.</td></tr>'}</tbody></table></div><p id="gst-error" class="field-error" hidden></p><button class="button secondary" type="submit">Consolidate selected (same truck, part loads)</button></form></section>
  ${(state.cewbs || []).length ? `<section class="panel"><h2>Consolidated e-way bills</h2>${state.cewbs.map(c => `<div class="ledger-row static"><span><b>${esc(c.no)}</b><small>${esc(c.vehicle)} · ${c.ewbs.length} e-way bills · ${esc(c.at)}</small></span></div>`).join('')}</section>` : ''}`;
}
export function invoiceEinvoicePanel(state, inv, amountsFn) {
  const req = einvoiceRequired(state, inv), isIssuer = opsCtx(state).ownerWs === inv.issuer;
  if (inv.irn) return `<section class="panel einv"><h2>E-invoice ${inv.irnCancelled ? pill('cancelled') : pill('registered')}</h2><div class="einv-grid">${qrSvg(inv.irn)}<div><small class="block muted">IRN</small><code class="irn">${esc(inv.irn)}</code><small class="block muted">Ack no. ${esc(inv.ackNo)} · ${stamp(inv.ackAt)}</small><small class="block muted">Registered total ${inr(inv.irnTotal)}. The invoice is locked: changes need a credit or debit note.</small></div></div>${isIssuer && !inv.irnCancelled ? `<details><summary class="button text compact">Cancel IRN (within 24 h)</summary><form class="inline-form" data-gst-form="cancelirn"><input name="reason" placeholder="Reason"><button class="button secondary compact">Cancel IRN</button></form></details>` : ''}<p id="gst-error" class="field-error" hidden></p></section>`;
  return `<section class="panel einv"><h2>E-invoice</h2><p class="muted">${esc(req.reason)}</p>${req.required && isIssuer && inv.status !== 'cancelled' ? '<button class="button primary" data-gst-irn>Register e-invoice (get IRN + QR)</button>' : ''}<p id="gst-error" class="field-error" hidden></p></section>`;
}

// ---------- bindings ----------
function err(root, msg) { const e = root.querySelector('#gst-error:not([hidden])') || [...root.querySelectorAll('#gst-error')].at(-1); if (e) { e.textContent = msg; e.hidden = !msg; } }
export function bindGst(root, api) {
  const S = () => api.getState(), ws = () => opsCtx(S()).ownerWs, trip = () => S().trips.find(t => t.id === S().selectedTripId), find = no => S().ewbs.find(e => e.no === no);
  const done = m => { api.save(); api.render(); if (m) api.toast(m); };
  root.querySelector('[data-gst-down]')?.addEventListener('click', () => { S().gstPortal.down = !S().gstPortal.down; done(S().gstPortal.down ? 'Portal outage simulated — every call will fail' : 'Portal back up'); });
  root.querySelectorAll('[data-gst-retry]').forEach(b => b.onclick = () => { const r = retrySync(S(), find(b.dataset.gstRetry)); if (r.error) { find(b.dataset.gstRetry).pendingVehicle = trip()?.registration; find(b.dataset.gstRetry).syncError = r.error; } done(r.error || 'Vehicle updated on the e-way bill'); });
  root.querySelectorAll('[data-gst-transfer]').forEach(b => b.onclick = () => { const r = transferEwb(S(), find(b.dataset.gstTransfer), 'vehicle'); done(r.error || 'Passed to Raj Transport — they can now update the vehicle'); });
  root.querySelector('[data-gst-irn]')?.addEventListener('click', () => { const s = S(), inv = s.freightInvoices.find(i => i.id === s.selectedInvoiceId); const r = registerIrn(s, inv, api.amounts); if (r.error) return err(root, r.error); done('E-invoice registered · IRN and QR added'); });
  root.querySelectorAll('form[data-gst-form]').forEach(f => f.onsubmit = e => {
    e.preventDefault(); const s = S(), fd = new FormData(f), k = f.dataset.gstForm; let r;
    if (k === 'generate') r = generateEwb(s, trip(), Object.fromEntries(fd), opsCtx(s).ws === 'staff' ? ws() : opsCtx(s).ws);
    if (k === 'partb') r = updatePartB(s, find(f.dataset.no), fd.get('vehicle'), 'Part B', ws());
    if (k === 'extend') r = extendEwb(s, find(f.dataset.no), Object.fromEntries(fd), ws());
    if (k === 'cancel') r = cancelEwb(s, find(f.dataset.no), fd.get('reason'), ws());
    if (k === 'manual') r = recordManualEwb(s, trip(), String(fd.get('no') || '').replace(/\D/g, ''));
    if (k === 'enrol') r = enrolTransporter(s, ws(), Object.fromEntries(fd));
    if (k === 'consolidate') r = consolidate(s, fd.getAll('nos'), ws());
    if (k === 'cancelirn') { const inv = s.freightInvoices.find(i => i.id === s.selectedInvoiceId); r = cancelIrn(s, inv, fd.get('reason')); }
    if (r?.error) return err(root, r.error);
    done({generate: `E-way bill ${r.ewb?.no || ''} generated`, partb: 'Truck added — e-way bill is now valid', extend: 'Validity extended', cancel: 'E-way bill cancelled', manual: 'Number saved', enrol: `Transporter ID ${r.id || ''} issued`, consolidate: `Consolidated e-way bill ${r.cewb?.no || ''} created`, cancelirn: 'IRN cancelled'}[k]);
  });
}
