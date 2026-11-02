// MoveAI One — guided tours ("Show me") and the testing panel.
// A tour plays a real journey inside the real app: it moves between the customer, business and admin
// apps, highlights each control, fills it in and explains what is happening. The same tours are recorded
// into the videos on guide.html (tests/tour-journeys.e2e.cjs), so the guide always matches the app.
// Everything here is demo-only: hidden with ?demo=off and never part of a real user flow.
import {JOURNEYS, TEST_DATA, ROLES} from './tour-journeys.js';
import {TOUR_HI, TOUR_UI_HI} from './tour-hindi.js';

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
// Hindi captions follow the app's हिंदी switch (state.lang), or the panel's own switch.
const tourLang = () => { const x = read(); if (x?.lang) return x.lang; try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}').lang === 'hi' ? 'hi' : 'en'; } catch { return 'en'; } };
const H = text => tourLang() === 'hi' ? (TOUR_HI[text] || TOUR_UI_HI[text] || text) : text;
function setTourLang(lang) { const x = read(); if (x) { x.lang = lang; write(x); } if (window.MoveAIVNextTest?.setLang) { window.MoveAIVNextTest.setLang(lang); return; } try { const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); s.lang = lang; localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} }
function panel(t, j, step, status = '') {
  let box = document.getElementById('tour-panel');
  if (!box) { box = document.createElement('aside'); box.id = 'tour-panel'; box.className = 'tour-panel'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const n = j.steps.length, done = t.i >= n;
  box.innerHTML = done
    ? `<div class="tour-head"><span class="tour-role">${esc(H(j.title))}</span><button type="button" class="tour-lang" data-tour="lang">${tourLang() === 'hi' ? 'English' : 'हिंदी'}</button><button type="button" class="tour-x" data-tour="exit" aria-label="Close">✕</button></div><h3>${esc(H('Journey complete'))} ✓</h3><p>${esc(H(j.done || 'That is the whole flow.'))}</p><div class="tour-actions"><button type="button" class="button primary compact" data-tour="replay">${esc(H('Play again'))}</button><a class="button secondary compact" href="guide.html">Back to the guide</a><button type="button" class="button secondary compact" data-tour="exit">Explore on my own</button></div>`
    : `<div class="tour-head"><span class="tour-role">${esc(H(step.role || j.title))}</span><span class="tour-count">${tourLang() === 'hi' ? `चरण ${t.i + 1} / ${n}` : `Step ${t.i + 1} of ${n}`}</span><button type="button" class="tour-lang" data-tour="lang">${tourLang() === 'hi' ? 'English' : 'हिंदी'}</button><button type="button" class="tour-x" data-tour="exit" aria-label="Close">✕</button></div>
       <div class="tour-bar"><span style="width:${Math.round((t.i / n) * 100)}%"></span></div>
       <h3>${esc(H(step.title))}</h3><p>${esc(H(val(step.say) || ''))}</p>${status ? `<p class="tour-status">${esc(status)}</p>` : ''}
       <div class="tour-actions">${t.auto ? `<button type="button" class="button secondary compact" data-tour="pause">${t.paused ? '▶ ' + H('Resume') : '❚❚ ' + H('Pause')}</button>` : `<button type="button" class="button primary compact" data-tour="do">${esc(H('Do it for me'))}</button>`}<button type="button" class="button ${t.auto ? 'secondary' : 'secondary'} compact" data-tour="next">${t.auto ? H('Skip') + ' ›' : H('Next') + ' ›'}</button><select data-tour="speed" aria-label="Speed">${Object.keys(SPEED).map(k => `<option ${t.speed === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`;
  box.querySelectorAll('[data-tour]').forEach(b => {
    const k = b.dataset.tour;
    if (k === 'speed') b.onchange = () => { const x = read(); x.speed = b.value; write(x); };
    else b.onclick = () => control(k);
  });
}
let running = false;
async function control(k) {
  const t = read(); if (!t) return;
  if (k === 'lang') { setTourLang(tourLang() === 'hi' ? 'en' : 'hi'); panel(t, JOURNEYS[t.id], JOURNEYS[t.id].steps[t.i]); return; }
  if (k === 'exit') { write(null); document.getElementById('tour-panel')?.remove(); document.querySelectorAll('.tour-focus').forEach(x => x.classList.remove('tour-focus')); return; }
  if (k === 'replay') { start(t.id, {auto: true, speed: t.speed}); return; }
  if (k === 'pause') { t.paused = !t.paused; write(t); if (!t.paused) play(); else panel(t, JOURNEYS[t.id], JOURNEYS[t.id].steps[t.i]); return; }
  if (k === 'next') { t.i += 1; t.ran = false; write(t); play(true); return; }
  if (k === 'do') { t.doNow = true; write(t); play(true); }
}

export function start(id, {auto = true, speed = 'normal', lang: langOpt} = {}) {
  const j = JOURNEYS[id]; if (!j) return;
  try { localStorage.setItem('moveai-demo-mode', 'on'); localStorage.setItem('moveai-welcome-seen', '1'); } catch {}
  document.body.classList.remove('demo-off'); document.getElementById('tour-welcome')?.remove();
  const q = new URLSearchParams(location.search), lang = langOpt || (q.get('lang') === 'hi' || q.get('lang') === 'en' ? q.get('lang') : null) || (read()?.lang || (window.MoveAIVNextTest?.state()?.lang === 'hi' ? 'hi' : undefined));
  write({id, i: 0, ran: false, auto, speed, vars: {}, startedAt: Date.now(), ...(lang ? {lang} : {})});
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
      if (at) { await sleep(150); const m = document.querySelector('main')?.textContent || ''; if (/Access denied|Page not found/.test(m)) { window.__tourError = `${step.title}: this screen is not available for this role (${at.route}).`; panel(t, j, step, 'This screen could not be opened for this role. Press Next to skip it.'); return; } }
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
let DEMO = true;
const roleList = () => `<ul class="tt-list">${ROLES.map(r => `<li><span><b>${esc(r.label)}</b><small>${esc(r.app)}${r.soon ? ' · ' + esc(r.soon) : ''}</small></span><span class="row-actions">${r.around ? `<button type="button" class="button primary compact" data-tt-play="${r.around}">▶ Show me around</button>` : ''}${(r.tasks || []).map(id => JOURNEYS[id] ? `<button type="button" class="button secondary compact" data-tt-play="${id}">${esc(JOURNEYS[id].title)}</button>` : '').join('')}</span></li>`).join('')}</ul>`;
function testerHtml() {
  const s = ctx.state(), ws = s.workspaces || [];
  const label = k => window.MoveAIRoleLabel?.(k) || k;
  return `<div class="tour-head"><b>Tours${DEMO ? ' &amp; testing' : ''}</b><button type="button" class="tour-x" data-tt="close" aria-label="Close">✕</button></div>
   <p class="muted">Pick a role. <b>Show me around</b> visits every screen of that role; the other buttons play a task from start to finish. Tours run in this browser only.</p>
   <label class="tt-mode"><input type="checkbox" data-tt-stepmode> Step by step (I press Next)</label>
   ${roleList()}
   ${DEMO ? `<h4>Test it yourself</h4><div class="row-actions"><button type="button" class="button secondary compact" data-tt="fresh">Start fresh as a new user</button><button type="button" class="button secondary compact" data-tt="admin">Open admin console (testing)</button><button type="button" class="button secondary compact" data-tt="full">Restore full demo</button></div>
   ${ws.length ? `<h4>Switch role</h4><div class="tt-roles">${ws.map(k => `<button type="button" class="button text compact" data-tt-ws="${esc(k)}">${esc(label(k))}</button>`).join('')}</div>` : ''}
   <details><summary><b>Test data</b></summary><dl class="tt-data">${TEST_DATA.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></details>` : ''}
   <p><a href="guide.html">Open the full guide — every role, flows and videos</a></p>`;
}
function openTester() {
  let box = document.getElementById('tour-tester');
  if (!box) { box = document.createElement('aside'); box.id = 'tour-tester'; box.className = 'tour-tester'; document.body.appendChild(box); }
  box.hidden = false; box.innerHTML = testerHtml();
  box.querySelector('[data-tt="close"]').onclick = () => { box.hidden = true; };
  box.querySelectorAll('[data-tt-play]').forEach(b => b.onclick = () => { box.hidden = true; start(b.dataset.ttPlay, {auto: !box.querySelector('[data-tt-stepmode]')?.checked}); });
  box.querySelectorAll('[data-tt-ws]').forEach(b => b.onclick = () => { const k = b.dataset.ttWs; const app = window.MoveAIProductFor?.(k) || 'business'; const file = {customer: 'index.html', partner: 'partner.html', business: 'business.html', admin: 'admin.html'}[app] || 'business.html'; location.href = `${file}#/home?ws=${encodeURIComponent(k)}`; });
  if (!DEMO) return;
  box.querySelector('[data-tt="fresh"]').onclick = () => { window.MoveAIVNextTest?.startSignup(); location.href = 'index.html#/welcome'; };
  box.querySelector('[data-tt="full"]').onclick = () => { window.MoveAIVNextTest?.reset(); location.href = 'index.html#/home'; };
  box.querySelector('[data-tt="admin"]').onclick = () => { ctx.patch(s => { s.workspaces ||= []; if (!s.workspaces.includes('admin')) s.workspaces.push('admin'); }); location.href = 'admin.html#/sellerReview?ws=admin'; };
}

// First visit: ask which role to see (everyone, including the clean ?demo=off link). Skipped in automated tests.
function welcome() {
  if (document.getElementById('tour-welcome') || read()) return;
  try { if (localStorage.getItem('moveai-welcome-seen') || (navigator.webdriver && localStorage.getItem('moveai-welcome') !== 'force')) return; } catch { return; }
  const box = document.createElement('div'); box.id = 'tour-welcome'; box.className = 'tour-welcome-overlay'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'tw-title');
  box.innerHTML = `<section class="tour-welcome"><h2 id="tw-title">Welcome to MoveAI</h2><p>Which role would you like to see? A guided tour shows every screen of that role, with plain-language captions. You can stop at any time.</p>
    <div class="tw-roles">${ROLES.filter(r => r.around || r.tasks?.length).map(r => `<button type="button" class="tw-role" data-tw="${r.around || r.tasks[0]}"><b>${esc(r.label)}</b><small>${esc(r.app)}</small></button>`).join('')}</div>
    <div class="tour-actions"><a class="button secondary compact" href="guide.html">Read the guide instead</a><button type="button" class="button text compact" data-tw-skip>Skip — I'll explore myself</button></div></section>`;
  document.body.appendChild(box);
  const done = () => { try { localStorage.setItem('moveai-welcome-seen', '1'); } catch {} box.remove(); };
  box.querySelector('[data-tw-skip]').onclick = done;
  box.querySelectorAll('[data-tw]').forEach(b => b.onclick = () => { done(); start(b.dataset.tw, {auto: true}); });
}
export function init({demo = true} = {}) {
  DEMO = demo;
  const q = new URLSearchParams(location.search);
  if (!document.getElementById('tour-fab')) {
    const fab = document.createElement('button'); fab.id = 'tour-fab'; fab.type = 'button'; fab.className = 'tour-fab'; fab.textContent = demo ? '▶ Tours & testing' : '▶ Guided tours'; fab.onclick = openTester; document.body.appendChild(fab);
  }
  const side = document.getElementById('sidebar');
  if (side && !side.querySelector('.nav-guide-link')) { const a = document.createElement('a'); a.className = 'nav-guide-link'; a.href = 'guide.html'; a.textContent = '📘 Product guide & tours'; (document.getElementById('reset-demo') || side.lastElementChild)?.insertAdjacentElement('beforebegin', a); }
  // The ?tour= link is removed as soon as a tour starts, so seeing it means the person just chose this tour:
  // always start it, even if an earlier (finished) tour is still remembered in this tab.
  if (q.get('tour') && JOURNEYS[q.get('tour')]) {
    const speed = SPEED[q.get('speed')] ? q.get('speed') : 'normal';
    history.replaceState(null, '', location.pathname + location.hash);
    start(q.get('tour'), {auto: q.get('mode') !== 'step', speed, lang: ['hi', 'en'].includes(q.get('lang')) ? q.get('lang') : undefined}); return;
  }
  if (read()) setTimeout(() => play(), 400); else welcome();
}
