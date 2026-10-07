// MoveAI One — step 4: easy for first-time users.
// "Staff (easy)": five big actions for any owner — add staff, mark present, give advance, pay, see balances — in the
// words of their business (bata / meal allowance / job pay). Voice or typed commands in Hindi or English
// ("Raju ko 500 advance diya", "Priya aaj present", "Mohan ko 2000 cash diya") fill the form; the owner confirms.
// A हिंदी / English switch translates the people and pay screens. Balances and payslips can be sent on WhatsApp;
// cash payments send the worker an SMS confirmation link (simulated) for basic phones.
import {esc, inr} from './ops.js';
import {record} from './pay.js';
import * as PC from './people-core.js';
import * as LC from './ledger-core.js';
import * as Payroll from './payroll-core.js';
import * as HR from './store-hr.js';

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const uid = p => `${p}-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const isStore = b => PC.STORES.includes(b);

// ---------- words per business type ----------
export const WORDS = {
  transporter: {allowance: 'Bata (daily allowance)', unit: 'trip', roles: [['driver', 'Driver'], ['helper', 'Khalasi'], ['operations', 'Dispatcher'], ['accounts', 'Accountant']], pay: [['per_trip', 'Per trip'], ['monthly', 'Monthly']]},
  vehicle: {allowance: 'Bata (daily allowance)', unit: 'trip', roles: [['driver', 'Driver'], ['helper', 'Khalasi']], pay: [['per_trip', 'Per trip'], ['monthly', 'Monthly']]},
  goods: {allowance: 'Daily allowance', unit: 'day', roles: [['helper', 'Loader / helper'], ['operations', 'Dispatch'], ['accounts', 'Accountant']], pay: [['per_day', 'Per day'], ['monthly', 'Monthly']]},
  movers: {allowance: 'Job allowance', unit: 'job', roles: [['helper', 'Packer / helper'], ['driver', 'Driver'], ['operations', 'Crew lead']], pay: [['per_job', 'Per job'], ['per_day', 'Per day']]},
  store: {allowance: 'Meal allowance', unit: 'shift', roles: [['picker', 'Picker'], ['packer', 'Packer'], ['cashier', 'Cashier']], pay: [['per_shift', 'Per shift'], ['monthly', 'Monthly'], ['per_order', 'Per order']]},
};
const words = b => WORDS[isStore(b) ? 'store' : b] || WORDS.goods;

// ---------- Hindi ----------
export const HI = {
  'Staff (easy)': 'स्टाफ़ (आसान)', 'Add staff': 'स्टाफ़ जोड़ें', 'Mark present': 'हाज़िरी लगाएँ', 'Give advance': 'एडवांस दें', 'Pay': 'भुगतान करें', 'See balances': 'बकाया देखें',
  'Balance due': 'बकाया', 'Balance due to you': 'आपका बकाया', 'Advance left': 'बचा एडवांस', 'Cash to confirm': 'पुष्टि के लिए नकद', 'I received it': 'मुझे मिल गया', 'Not received': 'नहीं मिला',
  'My work & pay': 'मेरा काम और वेतन', 'My work': 'मेरा काम', 'Past work': 'पिछला काम', 'Earnings statement': 'कमाई का विवरण', 'Work history': 'काम का इतिहास', 'Profile & documents': 'प्रोफ़ाइल और दस्तावेज़',
  'Pay & ledgers': 'वेतन और खाता', 'Branches & teams': 'शाखाएँ और टीमें', 'People & pay': 'लोग और वेतन', 'Staff balances': 'स्टाफ़ बकाया', 'Approvals': 'मंज़ूरी', 'Petty cash': 'छोटा नकद खाता', 'Payroll register': 'वेतन रजिस्टर',
  'Approve': 'मंज़ूर करें', 'Reject': 'अस्वीकार करें', 'Save': 'सेव करें', 'Confirm': 'पक्का करें', 'Cancel': 'रद्द करें', 'Name': 'नाम', 'Mobile': 'मोबाइल', 'Role': 'काम', 'Amount': 'रकम', 'Branch': 'शाखा',
  'Speak or type': 'बोलें या लिखें', 'Present today': 'आज हाज़िर', 'Repay per month': 'हर महीने वापसी', 'Cash': 'नकद', 'Send on WhatsApp': 'WhatsApp पर भेजें', 'More options': 'और विकल्प', 'Open work': 'काम खोलें', 'Pay & khata': 'वेतन और खाता',
  'Home': 'होम', 'Work': 'काम', 'Trips': 'ट्रिप', 'Fleet': 'गाड़ियाँ', 'People': 'लोग', 'Billing': 'बिलिंग', 'Business': 'व्यवसाय', 'Orders': 'ऑर्डर', 'My Jobs': 'मेरे काम', 'Find Work': 'काम खोजें', '🎤 Speak': '🎤 बोलें', 'Understand': 'समझें', 'owes': 'देना है', 'Reset demo data': 'डेमो डेटा रीसेट करें', 'Messages': 'संदेश', 'Money': 'पैसे', 'My Money': 'मेरे पैसे', 'Profile': 'प्रोफ़ाइल', 'Notifications': 'सूचनाएँ', 'Mark all read': 'सब पढ़ा हुआ',
};
export function translate(root, s) {
  if (s.lang !== 'hi' || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) { const t = n.nodeValue.trim(); if (t && HI[t]) n.nodeValue = n.nodeValue.replace(t, HI[t]); }
  root.querySelectorAll('input[placeholder]').forEach(i => { if (HI[i.placeholder]) i.placeholder = HI[i.placeholder]; });
}
export function langButton(s) { return `<button class="button secondary compact lang-toggle" data-easy-lang>${s.lang === 'hi' ? 'English' : 'हिंदी'}</button>`; }

// ---------- people of a business, in simple form ----------
function team(s, ws) { return LC.rows(s, ws); }
const byName = (list, name) => { const n = String(name || '').toLowerCase().trim(); if (!n) return null; return list.find(r => r.p.name.toLowerCase().split(' ')[0] === n) || list.find(r => r.p.name.toLowerCase().includes(n)) || null; };

// ---------- voice / typed commands ----------
const NUM_WORDS = {ek: 1, do: 2, teen: 3, char: 4, paanch: 5, sau: 100, hazaar: 1000, hazar: 1000, one: 1, two: 2, five: 5, hundred: 100, thousand: 1000};
function amountIn(t) {
  const m = t.match(/(\d[\d,]*)\s*(hazaar|hazar|thousand|k)?/i); if (m) { const v = Number(m[1].replace(/,/g, '')); return /hazaar|hazar|thousand|k/i.test(m[2] || '') ? v * 1000 : v; }
  const w = t.toLowerCase().split(/\s+/); let v = 0, cur = 0; for (const x of w) { if (!(x in NUM_WORDS)) continue; const n = NUM_WORDS[x]; if (n >= 100) { cur = (cur || 1) * n; if (n === 1000) { v += cur; cur = 0; } } else cur += n; } return v + cur || null;
}
export function parse(s, ws, text) {
  const t = String(text || '').trim(), low = t.toLowerCase(), list = team(s, ws); if (!t) return {error: 'Say or type something like “Raju ko 500 advance diya”.'};
  const who = list.find(r => low.includes(r.p.name.toLowerCase().split(' ')[0]));
  if (/present|haazir|hazir|हाज़िर|हाजिर|aaya|aayi|attendance/.test(low)) return who ? {intent: 'present', row: who, text: `${who.p.name} — present today`} : {error: 'Which person? Say their first name.'};
  const amt = amountIn(low);
  if (/advance|udhaar|udhar|एडवांस|उधार/.test(low)) return who && amt ? {intent: 'advance', row: who, amount: amt, instalment: Math.max(100, Math.round(amt / 5 / 100) * 100), text: `${inr(amt)} advance to ${who.p.name}`} : {error: 'Say the name and the amount, e.g. “Raju ko 500 advance diya”.'};
  if (/diya|diye|paid|pay|cash|salary|tankhwah|तनख्वाह|दिया|भुगतान/.test(low)) return who && amt ? {intent: 'pay', row: who, amount: amt, method: /upi|online/.test(low) ? 'upi' : 'cash', text: `Pay ${inr(amt)} to ${who.p.name} in ${/upi|online/.test(low) ? 'UPI' : 'cash'}`} : {error: 'Say the name and the amount, e.g. “Mohan ko 2000 cash diya”.'};
  return {error: 'I understood present, advance or pay. Try “Priya aaj present” or “Raju ko 500 advance diya”.'};
}

// ---------- the five actions ----------
// Returns {error, note}. 'note' was previously computed by HR.invite() (the "already has a verified
// MoveAI profile, works at X, no re-verification needed" message) and then silently discarded by every
// caller — it never reached the owner. Both branches below now return it instead of a bare string.
export function addStaff(s, ws, v) {
  const sc = PC.scopeOf(s, ws); if (sc?.kind !== 'owner') return {error: 'Only the owner adds staff here.'};
  const name = String(v.name || '').trim(), mobile = String(v.mobile || '').replace(/\D/g, ''); if (!name || !/^[6-9]\d{9}$/.test(mobile)) return {error: 'Enter the name and a 10-digit mobile.'};
  if (!(Number(v.rate) > 0)) return {error: 'Enter the pay.'};
  const home = v.branchId || PC.branchesFor(s, sc.business)[0]?.id;
  if (isStore(sc.business)) { const r = HR.invite(s, sc.business, {name, mobile, role: v.role || 'picker', homeBranch: home, payType: v.payType, rate: v.rate, freq: 'weekly'}, globalThis.__moveaiInvitePicker); return {error: r.error || '', note: r.note}; }
  const list = (s.peopleByWorkspace[sc.business] ||= []); if (list.some(p => p.mobile === mobile && p.status !== 'offboarded')) return {error: 'Already on your team.'};
  PC.ensureCore(s); const note = PC.inviteNote(s, mobile, sc.business);
  list.push({id: uid('STAFF'), name, mobile, role: v.role || 'helper', designation: words(sc.business).roles.find(r => r[0] === v.role)?.[1] || '', branchIds: [home], status: 'invited', employmentType: 'permanent', payType: v.payType, payAmount: Number(v.rate), invitedAt: today()});
  (s.outbox ||= []).unshift({to: mobile, text: `${PC.bizName(s, sc.business)} invited you to join MoveAI as ${name}. Open the link to accept.`, channels: ['SMS', 'WhatsApp'], at: stamp()});
  return {error: '', note};
}
export function markPresent(s, ws, row, date = today()) {
  if (isStore(row.e.business)) return HR.markDay(s, ws, row.key, date, row.e.homeBranch);
  s.attendance ||= []; if (s.attendance.some(a => a.memberId === row.e.source.id && a.date === date)) return 'Already marked present today.';
  s.attendance.push({id: uid('ATT'), memberId: row.e.source.id, workspace: row.e.business, date, branchId: row.e.homeBranch, checkIn: '09:00', source: 'easy'}); return '';
}
export function giveAdvance(s, ws, row, amount, instalment) {
  amount = Math.round(Number(amount)); instalment = Math.round(Number(instalment)); if (!(amount > 0) || !(instalment > 0)) return 'Enter the advance and how much to repay each month.';
  // Retail: goes through the unified payroll engine now, not store-hr.js's own ledger directly — same
  // balance an owner sees on the "Pay" button and a worker sees on their own "My pay" screen.
  if (isStore(row.e.business)) return Payroll.giveAdvance(s, row.e.business, row.e.personId, {amount, instalment, reason: 'Advance (easy)', method: 'cash'});
  const m = (s.peopleByWorkspace[row.e.business] || []).find(x => x.id === row.e.source.id); if (!m) return 'Not found.';
  if (m.loan?.balance) return `${m.name} still has ${inr(m.loan.balance)} advance left.`;
  m.loan = {total: amount, balance: amount, installment: instalment, reason: 'Advance (easy)', givenAt: today()};
  record(s, {owner: row.e.business, sourceType: 'khata', sourceId: row.key, type: 'advance', direction: 'payable', payer: row.e.business, payee: row.key, responsible: row.e.business, amount, method: 'cash', reference: `ADV-${Date.now().toString().slice(-6)}`, status: 'paid', ack: 'pending', loan: true, note: `Advance · ${m.name}`}, 'Owner');
  smsConfirm(s, row, amount); return '';
}
export function pay(s, ws, row, amount, method) {
  amount = Math.round(Number(amount)); if (!(amount > 0)) return 'Enter the amount.';
  if (method === 'cash') { const e = LC.payCash(s, ws, row, amount); if (!e) smsConfirm(s, row, amount); return e; }
  if (amount > row.balance) return `Balance due is only ${inr(row.balance)}.`;
  if (!s.persons[row.e.personId]?.payoutVerified) return `${row.p.name} has not added a verified UPI. Pay in cash or ask them to add UPI.`;
  // Retail UPI payments go through the same two-sided confirmation flow as the owner's "Pay" button —
  // easy-mode's voice/text command shortcut shouldn't quietly skip that safeguard just because it's a
  // faster way to get there.
  if (isStore(row.e.business)) { const r = Payroll.payNow(s, row.e.business, row.e.personId, amount, 'upi', ''); return typeof r === 'string' ? r : ''; }
  record(s, {owner: row.e.business, sourceType: 'khata', sourceId: row.key, type: 'salary', direction: 'payable', payer: row.e.business, payee: row.key, responsible: row.e.business, amount, method: 'upi', reference: `UPI-${Date.now().toString().slice(-6)}`, status: 'paid', note: `Paid by UPI · ${row.p.name}`}, 'Owner'); return '';
}
function smsConfirm(s, row, amount) { (s.outbox ||= []).unshift({to: row.p.mobile, text: `MoveAI: ${PC.bizName(s, row.e.business)} paid you ${inr(amount)} in cash. Reply 1 if received, 2 if not, or tap the link.`, channels: ['SMS'], at: stamp()}); }
export const waLink = (row, s) => `https://wa.me/91${row.p.mobile}?text=${encodeURIComponent(`${PC.bizName(s, row.e.business)} — ${row.p.name}: balance due ${inr(row.balance)}, advance left ${inr(row.advance)} (MoveAI)`)}`;

// ---------- screen ----------
export function screen(s, route, ws) {
  if (route !== 'easyStaff') return ''; const sc = PC.scopeOf(s, ws); if (!sc || !['owner', 'manager'].includes(sc.kind)) return '';
  const b = sc.business, W = words(b), list = team(s, ws), act = s.easyAction || '', pend = s.easyPending;
  const sel = (n, opts) => `<select name="${n}" class="big">${opts.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`;
  const people = `<select name="who" class="big">${list.map(r => `<option value="${r.e.id}">${esc(r.p.name)}</option>`).join('')}</select>`;
  const forms = {
    add: `<form class="easy-form" data-easy-form="add"><label>Name<input name="name" class="big"></label><label>Mobile<input name="mobile" class="big" inputmode="numeric"></label><label>Role${sel('role', W.roles)}</label><label>Pay${sel('payType', W.pay)}</label><label>Amount ₹<input name="rate" class="big" type="number"></label><label>Branch${sel('branchId', PC.branchesFor(s, b).map(x => [x.id, x.name]))}</label><button class="button primary big">Add staff</button></form>`,
    present: `<form class="easy-form" data-easy-form="present">${list.map(r => `<label class="easy-check"><input type="checkbox" name="who" value="${r.e.id}"> ${esc(r.p.name)}</label>`).join('')}<button class="button primary big">Present today</button></form>`,
    advance: `<form class="easy-form" data-easy-form="advance"><label>Who${people}</label><label>Amount ₹<input name="amount" class="big" type="number"></label><label>Repay per month ₹<input name="instalment" class="big" type="number"></label><button class="button primary big">Give advance</button></form>`,
    pay: `<form class="easy-form" data-easy-form="pay"><label>Who${people}</label><label>Amount ₹<input name="amount" class="big" type="number"></label><label>How${sel('method', [['cash', 'Cash'], ['upi', 'UPI']])}</label><button class="button primary big">Pay</button></form>`,
    balances: list.map(r => `<div class="easy-balance"><span><b>${esc(r.p.name)}</b><small><span>Advance left</span> ${inr(r.advance)}</small></span><b class="big-amount">${r.balance < 0 ? `<span>owes</span> ${inr(-r.balance)}` : inr(r.balance)}</b><a class="button secondary compact" target="_blank" rel="noopener" href="${waLink(r, s)}">Send on WhatsApp</a></div>`).join('') || '<p class="muted">No staff yet.</p>',
  };
  return `<div class="page-header"><div><h1>Staff (easy)</h1><p>${esc(PC.bizName(s, b))} · ${esc(W.allowance)} and pay per ${esc(W.unit)} are set up for your business</p></div><span class="row-actions">${langButton(s)}<button class="button text compact" data-route="payLedgers">More options</button></span></div>
  <section class="panel easy-voice"><form data-easy-form="voice" class="easy-form"><label>Speak or type<input name="text" class="big" placeholder="Raju ko 500 advance diya · Priya aaj present · Mohan ko 2000 cash diya" value="${esc(s.easyText || '')}"></label><span class="row-actions"><button type="button" class="button secondary big" data-easy-mic>🎤 Speak</button><button class="button primary big">Understand</button></span></form>
  ${pend ? `<div class="easy-confirm"><b>${esc(pend.text)}</b><span class="row-actions"><button class="button primary big" data-easy="confirm">Confirm</button><button class="button secondary big" data-easy="cancel">Cancel</button></span></div>` : ''}<p class="easy-msg muted" ${s.easyMsg ? '' : 'hidden'}>${esc(s.easyMsg || '')}</p></section>
  <div class="easy-grid">${[['add', '➕', 'Add staff'], ['present', '✅', 'Mark present'], ['advance', '💵', 'Give advance'], ['pay', '₹', 'Pay'], ['balances', '📒', 'See balances']].filter(([k]) => sc.kind === 'owner' || !['add', 'pay'].includes(k)).map(([k, i, l]) => `<button class="easy-tile ${act === k ? 'active' : ''}" data-easy-act="${k}"><span>${i}</span>${l}</button>`).join('')}</div>
  ${act ? `<section class="panel">${forms[act]}</section>` : ''}<p class="easy-err field-error" hidden></p>`;
}
export function bind(root, api) {
  const S = () => api.getState(), ws = () => S().currentWorkspace, err = m => { const e = root.querySelector('.easy-err'); if (e) { e.textContent = m; e.hidden = !m; } else api.toast(m); };
  const done = (e, ok) => { if (e) return err(e); api.save(); api.render(); if (ok) api.toast(ok); };
  const rowOf = id => team(S(), ws()).find(r => r.e.id === id);
  root.querySelectorAll('[data-easy-lang]').forEach(b => b.onclick = () => { S().lang = S().lang === 'hi' ? 'en' : 'hi'; done(''); });
  root.querySelectorAll('[data-easy-act]').forEach(b => b.onclick = () => { S().easyAction = S().easyAction === b.dataset.easyAct ? '' : b.dataset.easyAct; done(''); });
  root.querySelector('[data-easy-mic]')?.addEventListener('click', () => { const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return api.toast('Voice is not supported in this browser — type instead.'); const r = new R(); r.lang = S().lang === 'hi' ? 'hi-IN' : 'en-IN'; r.onresult = e => { const t = e.results[0][0].transcript; const i = root.querySelector('[data-easy-form="voice"] [name=text]'); if (i) i.value = t; }; r.onerror = () => api.toast('Could not hear — please type.'); r.start(); api.toast('Listening…'); });
  root.querySelectorAll('[data-easy]').forEach(b => b.onclick = () => { const s = S(), p = s.easyPending; if (b.dataset.easy === 'cancel' || !p) { s.easyPending = null; return done(''); }
    const row = rowOf(p.empId); let e = 'Person not found.';
    if (row) e = p.intent === 'present' ? markPresent(s, ws(), row) : p.intent === 'advance' ? giveAdvance(s, ws(), row, p.amount, p.instalment) : pay(s, ws(), row, p.amount, p.method);
    if (!e) { s.easyPending = null; s.easyText = ''; s.easyMsg = `Done: ${p.text}${p.intent !== 'present' && p.method !== 'upi' ? ' — the worker gets an SMS to confirm the cash' : ''}`; }
    done(e, e ? '' : 'Done'); });
  root.querySelectorAll('form[data-easy-form]').forEach(f => f.onsubmit = e => { e.preventDefault(); const s = S(), fd = new FormData(f), v = Object.fromEntries(fd), k = f.dataset.easyForm;
    if (k === 'voice') { s.easyText = v.text; const r = parse(s, ws(), v.text); if (r.error) { s.easyPending = null; s.easyMsg = r.error; return done(''); } s.easyPending = {intent: r.intent, empId: r.row.e.id, amount: r.amount, instalment: r.instalment, method: r.method, text: r.text}; s.easyMsg = 'Check and confirm:'; return done(''); }
    if (k === 'add') { const r = addStaff(s, ws(), v); return done(r.error, r.note || `${v.name} added — invite sent by SMS/WhatsApp`); }
    if (k === 'present') { const ids = fd.getAll('who'); if (!ids.length) return err('Tick at least one person.'); for (const id of ids) { const x = markPresent(s, ws(), rowOf(id)); if (x && !/Already/.test(x)) return err(x); } return done('', `${ids.length} marked present`); }
    if (k === 'advance') return done(giveAdvance(s, ws(), rowOf(v.who), v.amount, v.instalment), 'Advance given');
    if (k === 'pay') return done(pay(s, ws(), rowOf(v.who), v.amount, v.method), v.method === 'cash' ? 'Paid in cash — SMS sent to confirm' : 'Paid by UPI');
  });
}
