// MoveAI One — guided tours ("Show me") and the testing panel.
// A tour plays a real journey inside the real app: it moves between the customer, business and admin
// apps, highlights each control, fills it in and explains what is happening. The same tours are recorded
// into the videos on guide.html (tests/tour-journeys.e2e.cjs), so the guide always matches the app.
// Everything here is demo-only: hidden with ?demo=off and never part of a real user flow.
import {JOURNEYS, TEST_DATA} from './tour-journeys.js';

const KEY = 'moveai-tour', esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = t => { try { t ? sessionStorage.setItem(KEY, JSON.stringify(t)) : sessionStorage.removeItem(KEY); } catch {} };
const STATE_KEY = 'moveai-vnext-p1';
const SPEED = {slow: {act: 1500, read: 4200}, normal: {act: 900, read: 2800}, fast: {act: 550, read: 1700}};

// Helpers journeys can use in their steps.
export const ctx = {
  state: () => window.MoveAIVNextTest?.state() || JSON.parse(localStorage.getItem(STATE_KEY) || '{}'),
  patch(fn) { const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); const r = fn(s); localStorage.setItem(STATE_KEY, JSON.stringify(s)); return r; },
  async patchAsync(fn) { const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); const r = await fn(s); localStorage.setItem(STATE_KEY, JSON.stringify(s)); return r; },
  vars: () => read()?.vars || {},
  set(k, v) { const t = read(); if (t) { (t.vars ||= {})[k] = v; write(t); } },
  iso: d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10),
};
const val = v => typeof v === 'function' ? v(ctx) : v;
const here = () => `${(location.pathname.split('/').pop() || 'index.html')}#${(location.hash.replace(/^#/, '').split('?')[0] || '/home')}`;
const target = at => { const [file, hash = '/home'] = String(at).split('#'); return {file: file || 'index.html', route: hash.split('?')[0], full: String(at)}; };

async function waitFor(sel, ms = 7000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const el = document.querySelector(sel); if (el && (el.offsetParent || el.getClientRects().length || el.type === 'file')) return el; await sleep(120); }
  throw new Error(`Couldn't find “${sel}” on this screen.`);
}
function highlight(el) {
  document.querySelectorAll('.tour-focus').forEach(x => x.classList.remove('tour-focus'));
  if (!el) return; const box = el.type === 'file' || el.type === 'checkbox' || el.type === 'radio' ? (el.closest('label') || el) : el;
  box.classList.add('tour-focus'); box.scrollIntoView({block: 'center', behavior: 'smooth'});
}
async function confirmIfAsked() { await sleep(250); const yes = document.querySelector('[data-ws-confirm-yes]'); if (yes && yes.offsetParent) { highlight(yes); await sleep(600); yes.click(); } }
function setFile(el, name) { const dt = new DataTransfer(); dt.items.add(new File(['demo'], name, {type: /\.pdf$/i.test(name) ? 'application/pdf' : /\.(zip|xml)$/i.test(name) ? 'application/zip' : 'image/jpeg'})); el.files = dt.files; el.dispatchEvent(new Event('change', {bubbles: true})); }
function typeInto(el, v) { el.focus(); el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }

async function runAction(a, pace) {
  if (a.patch) { await (a.async ? ctx.patchAsync(a.patch) : ctx.patch(a.patch)); return 'reload'; }
  if (a.run) { await a.run(ctx); return a.reload ? 'reload' : ''; }
  if (a.wait) { await sleep(a.wait); return ''; }
  const sel = val(a.click || a.fill || a.check || a.uncheck || a.select || a.file || a.submit || a.see || a.clickAll);
  if (a.clickAll) { let guard = 0; while (document.querySelector(sel) && guard++ < 20) { const el = document.querySelector(sel); highlight(el); await sleep(pace / 2); el.click(); await sleep(pace / 2); } return ''; }
  const el = await waitFor(sel, a.timeout);
  highlight(el); await sleep(pace / 2);
  if (a.click) { el.click(); await confirmIfAsked(); }
  else if (a.fill) typeInto(el, String(val(a.value)));
  else if (a.check) { if (!el.checked) el.click(); }
  else if (a.uncheck) { if (el.checked) el.click(); }
  else if (a.select) { el.value = String(val(a.value)); el.dispatchEvent(new Event('change', {bubbles: true})); }
  else if (a.file) setFile(el, val(a.value));
  else if (a.submit) { el.requestSubmit ? el.requestSubmit() : el.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true})); await confirmIfAsked(); }
  await sleep(pace / 2);
  return '';
}

// ---------- the caption panel ----------
function panel(t, j, step, status = '') {
  let box = document.getElementById('tour-panel');
  if (!box) { box = document.createElement('aside'); box.id = 'tour-panel'; box.className = 'tour-panel'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const n = j.steps.length, done = t.i >= n;
  box.innerHTML = done
    ? `<div class="tour-head"><span class="tour-role">${esc(j.title)}</span><button type="button" class="tour-x" data-tour="exit" aria-label="Close">✕</button></div><h3>Journey complete ✓</h3><p>${esc(j.done || 'That is the whole flow.')}</p><div class="tour-actions"><button type="button" class="button primary compact" data-tour="replay">Play again</button><a class="button secondary compact" href="guide.html">Back to the guide</a><button type="button" class="button secondary compact" data-tour="exit">Explore on my own</button></div>`
    : `<div class="tour-head"><span class="tour-role">${esc(step.role || j.title)}</span><span class="tour-count">Step ${t.i + 1} of ${n}</span><button type="button" class="tour-x" data-tour="exit" aria-label="Close">✕</button></div>
       <div class="tour-bar"><span style="width:${Math.round((t.i / n) * 100)}%"></span></div>
       <h3>${esc(step.title)}</h3><p>${esc(val(step.say) || '')}</p>${status ? `<p class="tour-status">${esc(status)}</p>` : ''}
       <div class="tour-actions">${t.auto ? `<button type="button" class="button secondary compact" data-tour="pause">${t.paused ? '▶ Play' : '❚❚ Pause'}</button>` : `<button type="button" class="button primary compact" data-tour="do">Do it for me</button>`}<button type="button" class="button ${t.auto ? 'secondary' : 'secondary'} compact" data-tour="next">${t.auto ? 'Skip ›' : 'Next ›'}</button><select data-tour="speed" aria-label="Speed">${Object.keys(SPEED).map(k => `<option ${t.speed === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`;
  box.querySelectorAll('[data-tour]').forEach(b => {
    const k = b.dataset.tour;
    if (k === 'speed') b.onchange = () => { const x = read(); x.speed = b.value; write(x); };
    else b.onclick = () => control(k);
  });
}
let running = false;
async function control(k) {
  const t = read(); if (!t) return;
  if (k === 'exit') { write(null); document.getElementById('tour-panel')?.remove(); document.querySelectorAll('.tour-focus').forEach(x => x.classList.remove('tour-focus')); return; }
  if (k === 'replay') { start(t.id, {auto: true, speed: t.speed}); return; }
  if (k === 'pause') { t.paused = !t.paused; write(t); if (!t.paused) play(); else panel(t, JOURNEYS[t.id], JOURNEYS[t.id].steps[t.i]); return; }
  if (k === 'next') { t.i += 1; t.ran = false; write(t); play(true); return; }
  if (k === 'do') { t.doNow = true; write(t); play(true); }
}

export function start(id, {auto = true, speed = 'normal'} = {}) {
  const j = JOURNEYS[id]; if (!j) return;
  try { localStorage.setItem('moveai-demo-mode', 'on'); } catch {}
  write({id, i: 0, ran: false, auto, speed, vars: {}, startedAt: Date.now()});
  window.__tourDone = false; window.__tourError = '';
  play(true);
}

async function play(force = false) {
  if (running && !force) return; running = true;
  try {
    for (;;) {
      const t = read(); if (!t) return;
      const j = JOURNEYS[t.id]; if (!j) { write(null); return; }
      if (t.i >= j.steps.length) { panel(t, j); window.__tourDone = true; document.querySelectorAll('.tour-focus').forEach(x => x.classList.remove('tour-focus')); return; }
      const step = j.steps[t.i], pace = SPEED[t.speed]?.act || 900;
      const at = step.at ? target(val(step.at)) : null;
      // Go to the right app and screen first (a full page load when the app changes).
      if (at && (here().split('#')[0] !== at.file || t.reload)) {
        const sameFile = here().split('#')[0] === at.file; t.reload = false; write(t); panel(t, j, step, 'Opening…');
        if (sameFile) { history.replaceState(null, '', `${location.pathname}#${at.full.split('#')[1] || '/home'}`); location.reload(); } else location.href = at.full;
        return;
      }
      if (at && here().split('#')[1] !== at.route) { location.hash = at.full.split('#')[1]; await sleep(700); }
      panel(t, j, step);
      if (t.paused) return;
      if (!t.auto && !t.doNow && !t.ran) { if (step.focus) { try { highlight(await waitFor(val(step.focus), 3000)); } catch {} } return; }
      if (!t.ran) {
        let reload = false;
        try { for (const a of step.do || []) { if ((await runAction(a, pace)) === 'reload') reload = true; } }
        catch (e) { window.__tourError = `${step.title}: ${e.message}`; panel(t, j, step, `${e.message} You can do this step yourself, then press Next.`); return; }
        const x = read(); if (!x) return; x.ran = true; x.doNow = false; x.reload = reload; write(x);
        if (step.focus) { try { highlight(await waitFor(val(step.focus), 3000)); } catch {} }
      }
      if (!read()?.auto) { panel(read(), j, step, 'Done. Press Next to continue.'); return; }
      await sleep(SPEED[read()?.speed]?.read || 2800);
      const y = read(); if (!y || y.paused) return; y.i += 1; y.ran = false; write(y);
    }
  } finally { running = false; }
}

// ---------- testing panel (demo only) ----------
function testerHtml() {
  const s = ctx.state(), ws = s.workspaces || [];
  const label = k => window.MoveAIRoleLabel?.(k) || k;
  return `<div class="tour-head"><b>Tours &amp; testing</b><button type="button" class="tour-x" data-tt="close" aria-label="Close">✕</button></div>
   <p class="muted">Demo only. Everything runs in this browser; nothing is sent anywhere.</p>
   <h4>Watch a journey</h4><ul class="tt-list">${Object.entries(JOURNEYS).map(([id, j]) => `<li><span><b>${esc(j.title)}</b><small>${esc(j.who)}</small></span><span class="row-actions"><button type="button" class="button primary compact" data-tt-play="${id}">▶ Show me</button><button type="button" class="button secondary compact" data-tt-step="${id}">Step by step</button></span></li>`).join('')}</ul>
   <h4>Test it yourself</h4><div class="row-actions"><button type="button" class="button secondary compact" data-tt="fresh">Start fresh as a new user</button><button type="button" class="button secondary compact" data-tt="admin">Open admin console (testing)</button><button type="button" class="button secondary compact" data-tt="full">Restore full demo</button></div>
   ${ws.length ? `<h4>Switch role</h4><div class="tt-roles">${ws.map(k => `<button type="button" class="button text compact" data-tt-ws="${esc(k)}">${esc(label(k))}</button>`).join('')}</div>` : ''}
   <details><summary><b>Test data</b></summary><dl class="tt-data">${TEST_DATA.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></details>
   <p><a href="guide.html">Open the full guide — every role, flows and videos</a></p>`;
}
function openTester() {
  let box = document.getElementById('tour-tester');
  if (!box) { box = document.createElement('aside'); box.id = 'tour-tester'; box.className = 'tour-tester'; document.body.appendChild(box); }
  box.hidden = false; box.innerHTML = testerHtml();
  box.querySelector('[data-tt="close"]').onclick = () => { box.hidden = true; };
  box.querySelectorAll('[data-tt-play]').forEach(b => b.onclick = () => { box.hidden = true; start(b.dataset.ttPlay, {auto: true}); });
  box.querySelectorAll('[data-tt-step]').forEach(b => b.onclick = () => { box.hidden = true; start(b.dataset.ttStep, {auto: false}); });
  box.querySelectorAll('[data-tt-ws]').forEach(b => b.onclick = () => { const k = b.dataset.ttWs; const app = window.MoveAIProductFor?.(k) || 'business'; const file = {customer: 'index.html', partner: 'partner.html', business: 'business.html', admin: 'admin.html'}[app] || 'business.html'; location.href = `${file}#/home?ws=${encodeURIComponent(k)}`; });
  box.querySelector('[data-tt="fresh"]').onclick = () => { window.MoveAIVNextTest?.startSignup(); location.href = 'index.html#/welcome'; };
  box.querySelector('[data-tt="full"]').onclick = () => { window.MoveAIVNextTest?.reset(); location.href = 'index.html#/home'; };
  box.querySelector('[data-tt="admin"]').onclick = () => { ctx.patch(s => { s.workspaces ||= []; if (!s.workspaces.includes('admin')) s.workspaces.push('admin'); }); location.href = 'admin.html#/sellerReview?ws=admin'; };
}

export function init({demo = true} = {}) {
  if (!demo) return;
  const q = new URLSearchParams(location.search);
  if (!document.getElementById('tour-fab')) {
    const fab = document.createElement('button'); fab.id = 'tour-fab'; fab.type = 'button'; fab.className = 'tour-fab demo-only'; fab.textContent = '▶ Tours & testing'; fab.onclick = openTester; document.body.appendChild(fab);
  }
  if (q.get('tour') && JOURNEYS[q.get('tour')] && !read()) {
    const speed = SPEED[q.get('speed')] ? q.get('speed') : 'normal';
    history.replaceState(null, '', location.pathname + location.hash);
    start(q.get('tour'), {auto: q.get('mode') !== 'step', speed}); return;
  }
  if (read()) setTimeout(() => play(), 400);
}
