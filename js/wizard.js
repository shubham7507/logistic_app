// MoveAI One — step-by-step booking screens (one question per screen, running price, Next).
// Used by moving (Where → What → Vehicle → Help → When) and home services (Job → Address → Time → Review).
import {SLOTS, slotError, todayIso} from './home-services.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export const addDays = (date, n) => new Date(new Date(`${date}T12:00:00`).getTime() + n * 86400000).toISOString().slice(0, 10);

// Progress bar + one-line summaries of finished steps (tap to change).
export function head(steps, cur, summaries = {}) {
  return `<div class="wiz-head" data-wiz-head><div class="wiz-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${steps.length}" aria-valuenow="${cur}" aria-label="Step ${cur} of ${steps.length}"><span style="width:${Math.round(cur / steps.length * 100)}%"></span></div>
  <p class="wiz-count">Step ${cur} of ${steps.length} · <b>${esc(steps[cur - 1])}</b></p>
  ${steps.slice(0, cur - 1).map((t, i) => summaries[i + 1] ? `<button type="button" class="wiz-done" data-wiz-go="${i + 1}"><span>✓ ${esc(t)}</span><small>${esc(summaries[i + 1])}</small><b aria-hidden="true">✎</b><span class="sr-only">Change</span></button>` : '').join('')}</div>`;
}
// Fixed bottom bar: running total, Back and Next.
export function bar({total = null, totalNote = '', cur = 1, next = 'Next', backRoute = 'home'} = {}) {
  return `<div class="wiz-bar" data-wiz-bar><div class="wiz-total">${total == null ? `<small class="muted">${esc(totalNote || 'Price appears as you choose')}</small>` : `<small>Total</small><b data-wiz-total>${inr(total)}</b>${totalNote ? `<small class="muted">${esc(totalNote)}</small>` : ''}`}</div>
  <div class="wiz-actions">${cur > 1 ? '<button type="button" class="button secondary" data-wiz="back">Back</button>' : `<button type="button" class="button secondary" data-route="${esc(backRoute)}">Cancel</button>`}<button class="button primary" data-wiz-next>${esc(next)} →</button></div></div>`;
}
// Date chips (Today / Tomorrow / Day after / Pick date) and only the slots still open.
export function whenHtml(date, slot, {days = 14} = {}) {
  const t = todayIso(), opts = [[t, 'Today'], [addDays(t, 1), 'Tomorrow'], [addDays(t, 2), 'Day after']];
  const known = opts.some(([v]) => v === date), open = SLOTS.filter(([k]) => !slotError(date, k));
  const pretty = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric', month: 'short'});
  return `<fieldset><legend>Date</legend><div class="chip-choices">${opts.map(([v, l]) => `<label class="choice-chip"><input type="radio" name="date" value="${v}" ${date === v ? 'checked' : ''} data-wiz-field><span><b>${l}</b><small>${pretty(v)}</small></span></label>`).join('')}
    <label class="choice-chip"><input type="radio" name="date" value="other" ${!known && date ? 'checked' : ''} data-wiz-field><span><b>Pick date</b><small>${!known && date ? pretty(date) : 'Up to ' + days + ' days'}</small></span></label></div>
    ${!known && date ? `<label class="wiz-date"><span>Choose the date</span><input type="date" name="dateOther" value="${esc(date)}" min="${t}" max="${addDays(t, days)}" data-wiz-field></label>` : ''}</fieldset>
  <fieldset><legend>Time</legend>${open.length ? `<div class="slot-grid" role="radiogroup" aria-label="Time slot">${open.map(([k, l]) => `<label class="slot-chip"><input type="radio" name="slot" value="${k}" ${slot === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>` : '<p class="muted">No slots left on this day. Choose another date.</p>'}</fieldset>`;
}
// First open date: today if a slot is still open, otherwise tomorrow.
export const defaultDate = () => (SLOTS.some(([k]) => !slotError(todayIso(), k)) ? todayIso() : addDays(todayIso(), 1));
// Reads the date chips (handles "Pick date").
export function readDate(f, prev) {
  const v = f.get('date'); if (!v) return prev;
  if (v === 'other') return f.get('dateOther') || (prev && prev !== todayIso() ? prev : addDays(todayIso(), 3));
  return v;
}
