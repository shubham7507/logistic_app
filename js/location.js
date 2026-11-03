// MoveAI One — one location picker for home services and moving, built for both Patna (good map data)
// and places like Motihari (GPS works, but address search often finds nothing).
//
// Order of preference: 1) "I'm at the place" (phone GPS)  2) move the pin on the map (street / satellite)
// 3) search the address  4) send a location link to someone at the place  5) landmark details.
// Every address gets a label — Exact, Approximate or Area only — and the electrician / driver experience
// adapts to it (navigation target, when to call, how strict the arrival check is). When the pro starts the
// job, their GPS point is saved back to the address ("learned"), so the next booking is Exact.
import {km, roadKm} from './geo.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const uid = p => `${p}-${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`;

// ---------- labels ----------
export const LABELS = {
  exact: {text: 'Exact', hint: 'Phone location, within about 30 m', tone: 'success', arriveKm: 0.2, callKm: 0},
  approx: {text: 'Approximate', hint: 'Pin moved on the map or address found by search', tone: 'info', arriveKm: 0.5, callKm: 0.5},
  area: {text: 'Area only', hint: 'PIN code, village and landmark only', tone: 'warning', arriveKm: null, callKm: 1},
};
export function labelFor(source, accuracy) {
  if (['gps', 'link', 'learned', 'live'].includes(source)) return Number(accuracy || 0) <= 50 ? 'exact' : 'approx';
  if (['pin', 'search'].includes(source)) return 'approx';
  return 'area';
}
export const labelChip = loc => { const l = LABELS[loc?.precision] || LABELS.area; return `<span class="status-pill loc-label ${l.tone}" data-loc-label="${loc?.precision || 'area'}" title="${esc(l.hint)}">📍 ${l.text}</span>`; };

// ---------- demo map data (production: Google Maps / Mappls / Ola Maps geocoding) ----------
// "mapped" places return street-level results; others (small towns) are not on the map.
export const PLACES = [
  ['Boring Road, Patna', [25.6174, 85.1170], '800001'], ['Kankarbagh, Patna', [25.5949, 85.1606], '800020'], ['Patliputra Colony, Patna', [25.6262, 85.1063], '800013'],
  ['Rajendra Nagar, Patna', [25.6024, 85.1614], '800016'], ['Bailey Road, Patna', [25.6105, 85.0950], '800014'], ['Gandhi Maidan, Patna', [25.6195, 85.1446], '800001'],
  ['Sector 62, Noida', [28.6270, 77.3727], '201309'], ['Sector 50, Noida', [28.5714, 77.3637], '201301'], ['Sector 21, Noida', [28.5823, 77.3263], '201301'],
  ['DLF Phase 3, Gurugram', [28.4945, 77.0937], '122002'], ['Sector 45, Gurugram', [28.4440, 77.0645], '122003'], ['Sohna Road, Gurugram', [28.4102, 77.0425], '122018'],
  ['Karol Bagh, Delhi', [28.6519, 77.1909], '110005'], ['Lajpat Nagar, Delhi', [28.5677, 77.2433], '110024'], ['Rajendra Place, Delhi', [28.6420, 77.1780], '110008'],
];
export const PIN_CENTRES = {
  '800001': [25.6120, 85.1400, 'Patna'], '800013': [25.6262, 85.1063, 'Patna'], '800014': [25.6105, 85.0950, 'Patna'], '800016': [25.6024, 85.1614, 'Patna'], '800020': [25.5949, 85.1606, 'Patna'],
  '201301': [28.5800, 77.3300, 'Noida'], '201309': [28.6230, 77.3700, 'Noida'], '122002': [28.4945, 77.0937, 'Gurugram'], '122003': [28.4440, 77.0645, 'Gurugram'], '122018': [28.4102, 77.0425, 'Gurugram'],
  '110005': [28.6519, 77.1909, 'Delhi'], '110008': [28.6420, 77.1780, 'Delhi'], '110024': [28.5677, 77.2433, 'Delhi'],
  '845401': [26.6470, 84.9089, 'Motihari'], '845437': [26.7000, 84.9500, 'Motihari (rural)'], '845305': [26.8500, 84.8700, 'Raxaul side'],
};
// Places the demo "I'm at the place" / location-link buttons can stand in for.
export const DEMO_SPOTS = {
  patna: {name: 'Flat in Boring Road, Patna', at: [25.6119, 85.1310], pincode: '800001', city: 'Patna', accuracy: 12},
  motihari: {name: 'House in Pipra village, Motihari', at: [26.6702, 84.8811], pincode: '845401', city: 'Motihari', accuracy: 18},
  noida: {name: 'Flat in Sector 62, Noida', at: [28.6268, 77.3731], pincode: '201309', city: 'Noida', accuracy: 10},
};
const unmapped = q => /motihari|chhatauni|pipra|raxaul|turkaulia|chakia|\b845\d{3}\b/i.test(q);
export function search(q) {
  const t = String(q || '').trim().toLowerCase(); if (t.length < 3) return {ok: false, reason: 'Type at least 3 letters of the area.'};
  if (unmapped(t)) return {ok: false, notOnMap: true, reason: 'This address is not on the map yet. Use "I\'m at the place now", send a location link to someone there, or fill in a landmark below.'};
  const words = t.split(/[\s,]+/).filter(w => w.length > 1);
  const hit = PLACES.find(([n]) => words.every(w => n.toLowerCase().includes(w))) || PLACES.find(([n]) => words.some(w => w.length > 3 && n.toLowerCase().includes(w)));
  return hit ? {ok: true, name: hit[0], at: hit[1], pincode: hit[2], city: hit[0].split(', ').pop()} : {ok: false, reason: 'No match on the map. Try the area name, or use your location.'};
}

// ---------- DIGIPIN (India Post): 4×4 grid, 10 levels, XXX-XXX-XXXX, about 4 m precision ----------
const DGRID = [['F', 'C', '9', '8'], ['J', '3', '2', '7'], ['K', '4', '5', '6'], ['L', 'M', 'P', 'T']];
export function digipin(lat, lng) {
  if (!(lat >= 2.5 && lat <= 38.5 && lng >= 63.5 && lng <= 99.5)) return '';
  let minLat = 2.5, maxLat = 38.5, minLon = 63.5, maxLon = 99.5, code = '';
  for (let level = 1; level <= 10; level++) {
    const latStep = (maxLat - minLat) / 4, lonStep = (maxLon - minLon) / 4;
    const row = Math.min(3, Math.max(0, 3 - Math.floor((lat - minLat) / latStep))), col = Math.min(3, Math.max(0, Math.floor((lng - minLon) / lonStep)));
    code += DGRID[row][col]; if (level === 3 || level === 6) code += '-';
    maxLat = minLat + latStep * (4 - row); minLat = minLat + latStep * (3 - row); minLon = minLon + lonStep * col; maxLon = minLon + lonStep;
  }
  return code;
}

// ---------- building a location ----------
// v: {source, lat, lng, accuracy, line, landmark, village, postOffice, pincode, city, voiceNote}
export function makeLocation(v = {}) {
  const line = String(v.line || '').trim(), pincode = String(v.pincode || '').trim();
  if (line.length < 3) return {error: 'Add the house: flat / house number or the owner\'s name ("Ram Prasad ji ka ghar").'};
  if (!/^\d{6}$/.test(pincode)) return {error: 'Add the 6-digit PIN code.'};
  let lat = Number(v.lat), lng = Number(v.lng), source = v.source || '';
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && lat && lng && source && source !== 'landmark';
  if (!hasPoint) {
    if (String(v.landmark || '').trim().length < 3 || String(v.village || '').trim().length < 2) return {error: 'No map point yet. Use "I\'m at the place now", move the pin, send a location link, or add the village / mohalla and a landmark.'};
    const c = PIN_CENTRES[pincode]; source = 'landmark'; lat = c ? c[0] : null; lng = c ? c[1] : null;
  }
  const precision = hasPoint ? labelFor(source, v.accuracy) : 'area';
  return {line, landmark: String(v.landmark || '').trim(), village: String(v.village || '').trim(), postOffice: String(v.postOffice || '').trim(), pincode, city: String(v.city || PIN_CENTRES[pincode]?.[2] || '').trim(),
    voiceNote: v.voiceNote || '', lat, lng, accuracy: Number(v.accuracy) || null, source, precision, digipin: lat != null && lat ? digipin(lat, lng) : ''};
}
// Pin far from its PIN code → "Is this the place where the work is?"
export function pinMismatch(loc) {
  const c = PIN_CENTRES[loc?.pincode]; if (!c || !loc?.lat || loc.source === 'landmark') return 0;
  const d = km([loc.lat, loc.lng], [c[0], c[1]]); return d > 10 ? Math.round(d) : 0;
}
export const point = loc => (loc && loc.lat && loc.lng ? [loc.lat, loc.lng] : null);
export const oneLine = loc => [loc?.line, loc?.village, loc?.landmark && `near ${loc.landmark}`, loc?.city, loc?.pincode].filter(Boolean).join(', ');
// Navigation: Google Maps app. Exact/approximate → the point; area only → search the landmark text.
export function navUrl(loc, mode = 'two-wheeler') {
  if (loc?.lat && loc.precision !== 'area') return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}&travelmode=${mode}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc?.landmark, loc?.village, loc?.city, loc?.pincode].filter(Boolean).join(', '))}`;
}
export const distanceKm = (a, b) => (point(a) && point(b) ? Math.max(1, Math.round(roadKm(point(a), point(b)))) : null);

// ---------- location links: someone at the place shares their phone location ----------
export function sendLink(s, key, phone) {
  const m = String(phone || '').replace(/\D/g, '').slice(-10); if (!/^[6-9]\d{9}$/.test(m)) return {error: 'Enter the 10-digit mobile of the person at the place.'};
  const token = uid('LL'); (s.locationLinks ||= {})[token] = {key, phone: m, status: 'sent', at: Date.now()};
  draftOf(s, key).link = token;
  (s.outbox ||= []).unshift({id: uid('MSG'), to: m, channels: ['SMS', 'WhatsApp'], text: `MoveAI: please share the location for the visit. Tap: ${typeof location !== 'undefined' ? location.origin : ''}/index.html#/shareLocation/${token}`, at: new Date().toISOString()});
  return {token};
}
// The person at the place opens the link and their phone sends its GPS point (demo: a sample spot).
export function fulfilLink(s, token, {lat, lng, accuracy = 15} = {}) {
  const l = s.locationLinks?.[token]; if (!l) return 'This link is not valid.'; if (l.status === 'done') return '';
  Object.assign(l, {status: 'done', lat, lng, accuracy, doneAt: Date.now()});
  Object.assign(draftOf(s, l.key), {source: 'link', lat, lng, accuracy});
  return '';
}

// ---------- learn the address from the pro's GPS at job start ----------
export function learn(s, loc, at) {
  if (!loc || !at) return loc;
  Object.assign(loc, {lat: at[0], lng: at[1], accuracy: 15, source: 'learned', precision: 'exact', digipin: digipin(at[0], at[1]), learnedAt: new Date().toISOString()});
  for (const a of s.savedAddresses || []) if (a.line === loc.line && a.pincode === loc.pincode) Object.assign(a, {lat: loc.lat, lng: loc.lng, accuracy: 15, source: 'learned', precision: 'exact', digipin: loc.digipin});
  return loc;
}

// ---------- picker UI ----------
export const draftOf = (s, key) => ((s.locDrafts ||= {})[key] ||= {});
export function pickerHtml(s, key, {title = 'Address', demo = true} = {}) {
  const d = draftOf(s, key), pt = d.lat && d.lng && d.source !== 'landmark' ? [d.lat, d.lng] : null;
  const preview = d.line || d.pincode || pt || d.landmark ? makeLocation({...d}) : null, loc = preview && !preview.error ? preview : null;
  const far = loc ? pinMismatch(loc) : 0, link = d.link && s.locationLinks?.[d.link];
  const sourceText = {gps: 'Your phone location', pin: 'Pin moved on the map', search: 'Found on the map', link: 'Shared from the phone at the place', learned: 'Saved from an earlier visit'}[d.source] || '';
  return `<fieldset class="wide loc-picker" data-loc-picker="${esc(key)}"><legend>${esc(title)}</legend>
  <div class="loc-ways"><button type="button" class="button primary" data-loc="gps" data-key="${esc(key)}">📍 I'm at the place now — use my location</button>
    <div class="loc-search"><input name="${esc(key)}-q" placeholder="Search area, e.g. Boring Road Patna" value="${esc(d.q || '')}" aria-label="Search the address"><button type="button" class="button secondary" data-loc="search" data-key="${esc(key)}">Search</button></div></div>
  <p class="loc-msg ${d.msgBad ? 'field-error' : 'muted'}" data-loc-msg="${esc(key)}" ${d.msg ? '' : 'hidden'}>${esc(d.msg || '')}</p>
  ${pt ? `<div class="loc-map" data-loc-map="${esc(key)}"><div class="geo-map-wrap" data-geo-map="${esc(JSON.stringify({pts: [{at: pt, icon: '🏠', label: 'Work here'}], path: [], plan: null, drag: true, dragKey: key, satellite: true}))}">${pinSketch(pt)}</div><small class="muted">${esc(sourceText)}${d.accuracy ? ` · accurate to about ${Math.round(d.accuracy)} m` : ''}. Drag 🏠 to the exact gate; switch to Satellite to find your roof.</small></div>` : ''}
  <details class="loc-link" ${link ? 'open' : ''}><summary>Not at the place? Send a location link to someone there</summary>
    <div class="inline-form"><input name="${esc(key)}-phone" inputmode="numeric" maxlength="10" placeholder="Their mobile, e.g. father's phone"><button type="button" class="button secondary compact" data-loc="link" data-key="${esc(key)}">Send link by SMS / WhatsApp</button></div>
    ${link ? `<p class="${link.status === 'done' ? 'avail-chip' : 'muted'}">${link.status === 'done' ? '✓ Location received from their phone' : `Link sent to ••••••${esc(link.phone.slice(-4))}. Waiting for them to tap it.`}</p>${link.status !== 'done' && demo ? `<button type="button" class="button text compact" data-loc="link-demo" data-key="${esc(key)}">Demo: open the link as the person at the place</button>` : ''}` : ''}</details>
  <div class="form-grid two">
    <label class="wide"><span>House / flat number or owner's name</span><input name="${esc(key)}-line" value="${esc(d.line || '')}" placeholder="Flat 12, Shanti Apartments / Ram Prasad ji ka ghar"></label>
    <label><span>Mohalla / tola / village</span><input name="${esc(key)}-village" value="${esc(d.village || '')}" placeholder="Pipra tola"></label>
    <label><span>Landmark</span><input name="${esc(key)}-landmark" value="${esc(d.landmark || '')}" placeholder="Hanuman mandir ke peeche"></label>
    <label><span>Post office</span><input name="${esc(key)}-postOffice" value="${esc(d.postOffice || '')}"></label>
    <label><span>PIN code</span><input name="${esc(key)}-pincode" inputmode="numeric" maxlength="6" value="${esc(d.pincode || '')}"></label>
    <label><span>City / town</span><input name="${esc(key)}-city" value="${esc(d.city || '')}"></label>
    <label><span>Voice note of directions (optional)</span><input type="file" name="${esc(key)}-voice" accept="audio/*" capture></label>
  </div>
  ${(() => { const prec = loc ? loc.precision : pt ? labelFor(d.source, d.accuracy) : null, dp = pt ? digipin(pt[0], pt[1]) : loc?.digipin; return prec ? `<div class="loc-summary">${labelChip({precision: prec})} <small class="muted">${esc(LABELS[prec].hint)}${dp ? ` · DIGIPIN <b>${esc(dp)}</b>` : ''}</small></div>` : ''; })()}
  ${far ? `<div class="action-warning" data-loc-far="${esc(key)}"><b>Is this the place where the work is?</b><span>The pin is about ${far} km from PIN code ${esc(loc.pincode)}.</span><label class="check-inline"><input type="checkbox" name="${esc(key)}-farOk" ${d.farOk ? 'checked' : ''}> Yes, the pin is right</label></div>` : ''}
  ${demo ? `<p class="mock-hint">Demo location: <button type="button" class="button text compact" data-loc="demo" data-spot="patna" data-key="${esc(key)}">Patna flat</button> · <button type="button" class="button text compact" data-loc="demo" data-spot="motihari" data-key="${esc(key)}">Motihari village house</button> · <button type="button" class="button text compact" data-loc="demo" data-spot="noida" data-key="${esc(key)}">Noida flat</button>. Search knows Patna, Noida, Gurugram and Delhi areas; Motihari addresses are "not on the map".</p>` : ''}
  </fieldset>`;
}
function pinSketch(pt) { return `<svg class="geo-map" viewBox="0 0 360 160" role="img" aria-label="Map pin"><rect width="360" height="160" rx="12" fill="#eef4f1"/><circle cx="180" cy="80" r="14" fill="#fff" stroke="#0b6655" stroke-width="2"/><text x="180" y="86" text-anchor="middle" font-size="15">🏠</text><text x="180" y="120" text-anchor="middle" font-size="11" fill="#5b6b65">${pt[0].toFixed(4)}, ${pt[1].toFixed(4)}</text></svg>`; }
// Read typed fields into the draft (call before validating or re-rendering).
export function readPicker(root, s, key) {
  const d = draftOf(s, key), f = n => root.querySelector(`[name="${key}-${n}"]`);
  for (const n of ['line', 'village', 'landmark', 'postOffice', 'pincode', 'city', 'q']) if (f(n)) d[n] = f(n).value;
  if (f('farOk')) d.farOk = f('farOk').checked;
  const v = f('voice')?.files?.[0]?.name; if (v) d.voiceNote = v;
  return d;
}
// Final location from the draft, with the far-pin confirmation.
export function finalLocation(s, key) {
  const d = draftOf(s, key), loc = makeLocation(d); if (loc.error) return loc;
  if (pinMismatch(loc) && !d.farOk) return {error: `The pin is about ${pinMismatch(loc)} km from PIN code ${loc.pincode}. Tick "Yes, the pin is right" or move the pin.`};
  return loc;
}
export function bind(root, api, {onChange} = {}) {
  const S = () => api.getState();
  const msg = (key, text, bad) => { const d = draftOf(S(), key); d.msg = text; d.msgBad = !!bad; };
  const rerender = () => { api.save(); onChange ? onChange() : api.render(); };
  root.querySelectorAll('[data-loc]').forEach(b => b.onclick = () => {
    const s = S(), key = b.dataset.key, k = b.dataset.loc; root.querySelectorAll('[data-loc-picker]').forEach(el => readPicker(root, s, el.dataset.locPicker)); const d = draftOf(s, key);
    if (k === 'demo') { const sp = DEMO_SPOTS[b.dataset.spot]; Object.assign(d, {source: 'gps', lat: sp.at[0], lng: sp.at[1], accuracy: sp.accuracy, pincode: d.pincode || sp.pincode, city: d.city || sp.city}); msg(key, `Location found: ${sp.name} (demo).`); return rerender(); }
    if (k === 'search') { const r = search(d.q); if (!r.ok) { msg(key, r.reason, true); return rerender(); } Object.assign(d, {source: 'search', lat: r.at[0], lng: r.at[1], accuracy: null, pincode: d.pincode || r.pincode, city: d.city || r.city}); msg(key, `Found: ${r.name}. Drag the pin to the exact gate if you can.`); return rerender(); }
    if (k === 'link') { const r = sendLink(s, key, root.querySelector(`[name="${key}-phone"]`)?.value); if (r.error) { msg(key, r.error, true); return rerender(); } msg(key, 'Location link sent by SMS and WhatsApp.'); return rerender(); }
    if (k === 'link-demo') { const sp = /^845/.test(d.pincode || '') ? DEMO_SPOTS.motihari : d.pincode && /^80/.test(d.pincode) ? DEMO_SPOTS.patna : DEMO_SPOTS.motihari; fulfilLink(s, d.link, {lat: sp.at[0], lng: sp.at[1], accuracy: sp.accuracy}); d.pincode ||= sp.pincode; d.city ||= sp.city; msg(key, 'Location received from their phone.'); return rerender(); }
    if (k === 'gps') {
      if (!navigator.geolocation) { msg(key, 'This phone cannot share location here. Search, send a link, or add a landmark.', true); return rerender(); }
      msg(key, 'Asking for location permission…'); const el = root.querySelector(`[data-loc-msg="${key}"]`); if (el) { el.hidden = false; el.textContent = 'Asking for location permission…'; }
      navigator.geolocation.getCurrentPosition(p => { const s2 = S(), d2 = draftOf(s2, key); Object.assign(d2, {source: 'gps', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy}); msg(key, `Location found${p.coords.accuracy > 50 ? ` (only about ${Math.round(p.coords.accuracy)} m accurate — drag the pin to your gate)` : ''}.`); rerender(); },
        e => { msg(key, `Could not get your location (${e.message || 'permission denied'}). Search the area, send a link, or add a landmark.`, true); rerender(); }, {enableHighAccuracy: true, timeout: 10000, maximumAge: 30000});
    }
  });
}
// Called by geo.js when the 🏠 pin is dragged on a location-picker map.
export function pinDragged(s, key, lat, lng) { Object.assign(draftOf(s, key), {source: 'pin', lat, lng, accuracy: null, msg: 'Pin moved. This is now an approximate location.', msgBad: false}); }
