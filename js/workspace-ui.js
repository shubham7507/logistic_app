// MoveAI One — workspace switcher, staff PIN sheet and cross-workspace notice (markup only).
import * as WH from './workspace-hub.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));

// ctx: {product, PRODUCTS, roleConfig, persona(ws), unreadFor(ws), demo, query}
export function switcherHtml(state, ctx) {
  const m = WH.switcherModel(state, ctx.product, {PRODUCTS: ctx.PRODUCTS, roleConfig: ctx.roleConfig, unreadFor: ctx.unreadFor, query: ctx.query});
  const app = WH.appOf(ctx.product);
  const search = m.showSearch ? `<label class="ws-search"><span class="sr-only">Search workspaces</span><input id="ws-search" type="search" placeholder="Search businesses and roles" value="${esc(ctx.query || '')}" autocomplete="off"></label>` : '';
  const invites = app === 'business' && m.pending.length ? `<section class="ws-section"><p class="ws-section-title">Invitations</p><button type="button" class="workspace-option invitation-entry" data-workspace-action="invitations"><span class="workspace-icon">✉</span><span class="workspace-copy"><b>${m.pending.length} pending invitation${m.pending.length > 1 ? 's' : ''}</b><small>Review before you get access</small></span><span class="status-pill info">${m.pending.length}</span></button></section>` : '';
  const row = it => {
    const p = it.staffOwner ? null : ctx.persona(it.ws);
    const where = [it.role, it.branch].filter(Boolean).join(' · ');
    const who = it.staffOwner ? where : ctx.demo ? `${where}${p?.name && p.name !== it.label ? ` · test as ${p.name}` : ''}` : `${where}${p?.name && p.name !== it.label ? ` · ${p.name}` : ''}`;
    const badge = it.current ? '<span class="status-pill">Current</span>' : it.unread ? `<span class="ws-badge" aria-label="${it.unread} unread">${it.unread > 99 ? '99+' : it.unread}</span>` : '<span aria-hidden="true">›</span>';
    const staffAttrs = it.staffOwner ? ` data-staff-owner="${esc(it.staffOwner)}" data-staff-member="${esc(it.staffMember)}"` : '';
    const chips = (it.branches || []).length ? `<div class="ws-branches" role="group" aria-label="${esc(it.label)} branches">${it.branches.map(b => `<button type="button" class="ws-branch-chip ${it.current && b.id === it.branchCurrent ? 'active' : ''}" data-ws-branch="${esc(it.ws)}" data-branch-id="${esc(b.id)}">${esc(b.name)}</button>`).join('')}</div>` : '';
    return `<div class="ws-row"><button type="button" class="workspace-option ws-tone-${it.tone} ${it.current ? 'current' : ''}" data-workspace="${esc(it.ws)}"${staffAttrs} aria-current="${it.current ? 'true' : 'false'}"><span class="workspace-icon">${esc(ctx.roleConfig[it.ws]?.icon || it.label[0])}</span><span class="workspace-copy"><b>${esc(it.label)}</b><small>${esc(who)}${it.muted ? ' · <span class="ws-muted">muted</span>' : ''}</small></span>${badge}</button>${chips}</div>`;
  };
  const groups = m.groups.map(g => `<section class="ws-section ws-tone-${g.tone}"><p class="ws-section-title"><span class="ws-dot" aria-hidden="true"></span>${esc(g.name)}</p>${g.items.map(row).join('')}</section>`).join('') || `<p class="muted">No workspace matches “${esc(ctx.query)}”.</p>`;
  const staff = WH.storeStaff(state, state.currentWorkspace);
  const shared = staff.length && !/^picker/.test(state.currentWorkspace)
    ? `<section class="ws-section"><p class="ws-section-title">Shared store device</p><button type="button" class="workspace-option" data-ws-pin-open><span class="workspace-icon">#</span><span class="workspace-copy"><b>Switch to store staff with PIN</b><small>${staff.length} active staff · the store stays signed in</small></span><span aria-hidden="true">›</span></button></section>` : '';
  const add = app === 'business' ? `<button type="button" class="workspace-option add-business-entry" data-workspace-action="add-business"><span class="workspace-icon">+</span><span class="workspace-copy"><b>Add a business</b><small>One business can enable several services</small></span><span aria-hidden="true">›</span></button>` : '';
  return search + invites + `<div id="ws-groups">${groups}</div>` + shared + add;
}

export function pinSheetHtml(state, error = '') {
  const staff = WH.storeStaff(state, state.currentWorkspace);
  return `<form id="ws-pin-form" class="ws-pin" autocomplete="off"><p class="muted">Each staff member taps their name and enters their 4-digit PIN. The store stays signed in; the device locks back to the store after 5 minutes without use.</p>
  <fieldset class="ws-pin-people"><legend>Who is using this device?</legend>${staff.map((p, i) => `<label class="ws-pin-person"><input type="radio" name="staff" value="${esc(p.id)}" ${i === 0 ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}</fieldset>
  <label class="field-label" for="ws-pin">PIN</label><input id="ws-pin" name="pin" class="otp-input" inputmode="numeric" maxlength="4" pattern="\\d{4}" placeholder="• • • •" required>
  <p id="ws-pin-error" class="field-error" ${error ? '' : 'hidden'}>${esc(error)}</p>
  <div class="row-actions"><button class="button primary" type="submit">Unlock</button><button class="button secondary" type="button" data-ws-pin-cancel>Back</button></div>
  <p class="mock-hint"><b>Prototype PIN</b><span>1234 unless the owner set one below</span></p></form>
  ${WH.isOwnerWorkspace(state.currentWorkspace) ? `<details class="panel ws-pin-admin"><summary><b>Owner: set a staff PIN</b></summary><form id="ws-pin-set" class="form-grid"><label><span>Staff member</span><select name="staff">${staff.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label><span>New 4-digit PIN</span><input name="pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></label><button class="button secondary compact">Save PIN</button></form></details>` : ''}`;
}

// Shown at the top of Notifications: unread items waiting in the person's other workspaces.
export function elsewhereHtml(list) {
  if (!list.length) return '';
  return `<section class="panel ws-elsewhere"><h2>In your other workspaces</h2>${list.map(x => `<div class="ws-elsewhere-row"><span><b>${esc(x.label)}</b><small>${x.unread} unread${x.latest ? ` · ${esc(String(x.latest.text).slice(0, 90))}` : ''}${x.muted ? ' · muted' : ''}</small></span><button type="button" class="button secondary compact" data-ws-open="${esc(x.ws)}">Open</button></div>`).join('')}</section>`;
}

// Banner on money pages so the payer is never ambiguous.
export function moneyBanner(group) {
  return `<div class="info-banner ws-money-banner ws-tone-${group.tone}"><b>Money actions here are for ${esc(group.name)}</b><span>${esc(group.role)}. Payments, refunds and payouts on this page come from or go to this workspace only.</span></div>`;
}

export function muteToggleHtml(state, ws, label) {
  const on = WH.isMuted(state, ws);
  return `<label class="consent-row ws-mute"><input type="checkbox" data-ws-mute="${esc(ws)}" ${on ? 'checked' : ''}><span><b>Mute ${esc(label)}</b> — no push, SMS or WhatsApp from this workspace (for example when off shift). Codes, safety alerts and in-app items still arrive.</span></label>`;
}

// One reusable confirm sheet for money actions and switch blocks.
export function confirmHtml({title, rows = [], message = '', primary = 'Confirm', secondary = 'Cancel', danger = false}) {
  return `<header class="dialog-header"><div><h2 id="ws-confirm-heading">${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ''}</div></header>
  <div class="ws-confirm-body">${rows.length ? `<dl class="ws-confirm-rows">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
  <div class="row-actions"><button type="button" class="button ${danger ? 'secondary' : 'primary'}" data-ws-confirm-yes>${esc(primary)}</button><button type="button" class="button ${danger ? 'primary' : 'secondary'}" data-ws-confirm-no>${esc(secondary)}</button></div></div>`;
}
