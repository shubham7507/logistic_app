// MoveAI One — screens that differ by product (option C).
import {esc, pill, inr} from './ops.js';
import {PRODUCTS, productLink} from './products.js';

const head = (title, text, action = '') => `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
const SERVICES = [
  ['moving', '🚚', 'Packers & movers', 'Home or office shifting with a clear price'],
  ['driver', '🧑‍✈️', 'Hire a driver', 'By the hour, day or month for your car'],
  ['products', '🛒', 'Buy products', 'Search and order; we pick the store'],
  ['general', '🛠', 'Home services', 'Plumber, electrician, carpenter and more'],
];
const icon = t => ({moving: '🚚', driver: '🧑‍✈️', general: '🛠'}[t] || '▦');

export function customerHomeScreen(state) {
  const name = (state.person?.name || 'there').split(' ')[0];
  const bookings = state.serviceRequests.filter(r => r.customer === 'personal');
  const active = bookings.filter(r => !['closed', 'cancelled', 'rated'].includes(r.status));
  const due = state.ledger.filter(x => x.payer === 'personal' && ['approved', 'pending_approval', 'due'].includes(x.status));
  return `${head(`Hi ${name}`, 'What do you need today?')}
  <section class="service-tiles" aria-label="Services">${SERVICES.map(([k, i, t, d]) => `<button class="service-tile" data-customer-service="${k}"><span aria-hidden="true">${i}</span><b>${esc(t)}</b><small>${esc(d)}</small></button>`).join('')}</section>
  <div class="grid two"><section class="panel"><div class="panel-header"><div><h2>Your bookings</h2><p>${active.length ? `${active.length} in progress` : 'Nothing in progress'}</p></div><button class="button secondary" data-route="services">All bookings</button></div>
    ${active.slice(0, 3).map(r => `<article class="market-row"><span class="market-icon">${icon(r.type)}</span><span><b>${esc(r.title)}</b><small>${esc(r.id)} · ${esc(r.date || '')}</small></span>${pill(r.status)}<button class="button secondary" data-op="open-service" data-id="${r.id}">Open</button></article>`).join('') || '<div class="empty-inline"><b>No active bookings</b><small>Pick a service above to get a price in under a minute.</small></div>'}</section>
  <section class="panel"><h2>Payments</h2>${due.length ? due.slice(0, 3).map(x => `<article class="market-row"><span class="market-icon">₹</span><span><b>${inr(x.amount)}</b><small>${esc(x.note || x.type)}</small></span>${pill(x.status)}<button class="button secondary" data-op="open-payment" data-id="${x.id}">Pay</button></article>`).join('') : '<div class="empty-inline"><b>Nothing to pay</b><small>You pay inside each booking once the work is done.</small></div>'}<button class="button secondary full" data-route="account">Receipts and account</button></section></div>`;
}

export function accountScreen(state) {
  const p = state.person || {}; const mobile = state.auth?.mobile || '';
  const receipts = state.ledger.filter(x => (x.payer === 'personal' || (x.payee === 'personal' && x.type === 'refund')) && x.status !== 'reversed');
  return `${head('Account', `${p.name || 'You'} · +91 ${mobile.replace(/(\d{5})(\d{5})/, '$1 $2')}`)}
  <div class="grid two"><section class="panel"><h2>Payments and receipts</h2>${receipts.slice(0, 4).map(x => `<article class="market-row"><span class="market-icon">🧾</span><span><b>${inr(x.amount)}</b><small>${esc(x.id)} · ${esc(x.note || x.type)}</small></span>${pill(x.status)}<button class="button secondary" data-bill-doc="${x.type === 'refund' ? 'credit' : 'receipt'}" data-id="${x.id}">${x.type === 'refund' ? 'Credit note' : 'Receipt'}</button></article>`).join('') || '<div class="empty-inline"><b>No payments yet</b></div>'}<button class="button secondary full" data-route="money">All payments and bills</button></section>
  <section class="panel"><h2>Your account</h2><div class="document-list">
    <button class="document-row as-button" data-route="orders"><span class="document-icon">▥</span><span class="document-copy"><b>Product orders</b><small>Track and reorder</small></span><span>›</span></button>
    <button class="document-row as-button" data-route="search"><span class="document-icon">⌕</span><span class="document-copy"><b>Search products</b><small>Find what you need</small></span><span>›</span></button>
    <button class="document-row as-button" data-route="notifications"><span class="document-icon">🔔</span><span class="document-copy"><b>Notifications</b><small>Booking updates</small></span><span>›</span></button>
    <button class="document-row as-button" data-route="consentDetails"><span class="document-icon">🔒</span><span class="document-copy"><b>Privacy and consent</b><small>What we store and why</small></span><span>›</span></button>
  </div></section></div>
  <section class="panel other-apps"><h2>More from MoveAI</h2><p class="muted">Same login. Each opens its own app.</p><div class="grid two">
    <a class="app-card" href="${productLink('partner')}"><span class="brand-mark">P</span><span><b>Earn with MoveAI Partner</b><small>Drive trucks or cars, or work as a helper. Start browsing jobs in a minute.</small></span></a>
    <a class="app-card" href="${productLink('business')}"><span class="brand-mark">B</span><span><b>Register your business on MoveAI Business</b><small>Goods, transport, trucks or packers & movers. Business invitations open there too.</small></span></a>
  </div></section>`;
}

export function otherAppsHtml(active) {
  return `<div class="other-apps-list"><p class="muted">Other MoveAI apps (same login)</p>${Object.entries(PRODUCTS).filter(([k]) => k !== active).map(([k, p]) => `<a class="workspace-option" href="${productLink(k)}"><span class="workspace-icon">${p.mark}</span><span class="workspace-copy"><b>${esc(p.name)}</b><small>${esc(k === 'admin' ? 'Demo only — in production this is an internal console' : p.tagline)}</small></span><span>↗</span></a>`).join('')}</div>`;
}
