// MoveAI One — expiry and shelf-life rules for food listings (used everywhere, not only in strict states).
// FSSAI directed e-commerce food businesses (Nov 2024) to deliver food with a minimum shelf life of
// "30% or 45 days before expiry". Read here as: at least 30% of the total shelf life left, or at least
// 45 days left. Confirm the exact reading with a food-law adviser before launch.
export const MIN_SHARE = 0.3, MIN_DAYS = 45;
const DAY = 86400000;
const day = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; };

// Categories whose packs carry manufacture and expiry dates (packaged food, dairy, bakery).
// Loose fruit and vegetables have neither.
export function needsDates(category) {
  return !!category && !/^Fresh (vegetables|fruits)$/.test(category) && /rice|pulses|flour|oil|spice|dairy|bakery|pasta|canned|sauce|biscuit|chocolate|tea|beverage|nuts|breakfast|organic|baking/i.test(category);
}
export function remaining(p, now = Date.now()) {
  const exp = day(p?.expiryDate); if (!Number.isFinite(exp)) return null;
  const days = Math.floor((exp - now) / DAY), mfg = day(p?.mfgDate), total = Number.isFinite(mfg) ? Math.max(1, Math.round((exp - mfg) / DAY)) : null;
  return {days, total, share: total ? Math.max(0, days) / total : null};
}
// True when the item may still be sold online. Products without dates (older listings, non-food) pass.
export function sellable(p, now = Date.now()) {
  const r = remaining(p, now); if (!r) return true;
  if (r.days < 0) return false;
  return r.days >= MIN_DAYS || (r.share !== null && r.share >= MIN_SHARE);
}
export function shelfNote(p, now = Date.now()) {
  const r = remaining(p, now); if (!r) return '';
  if (r.days < 0) return 'Expired — hidden from customers';
  if (!sellable(p, now)) return `Only ${r.days} day(s) of shelf life left — hidden from customers (needs ${MIN_DAYS} days or ${Math.round(MIN_SHARE * 100)}% of shelf life)`;
  return `${r.days} days to expiry`;
}
// Validate dates entered by a seller. Returns '' or an error.
export function checkDates({category, batch, mfgDate, expiryDate}, now = Date.now()) {
  if (!needsDates(category)) return '';
  if (!String(batch || '').trim()) return 'Enter the batch or lot number printed on the pack.';
  const mfg = day(mfgDate), exp = day(expiryDate);
  if (!Number.isFinite(mfg) || !Number.isFinite(exp)) return 'Enter the manufacture date and the expiry or best-before date from the pack.';
  if (mfg > now) return 'Manufacture date cannot be in the future.';
  if (exp <= mfg) return 'Expiry date must be after the manufacture date.';
  if (!sellable({mfgDate, expiryDate}, now)) return `This batch is too close to expiry to sell online (needs ${MIN_DAYS} days or ${Math.round(MIN_SHARE * 100)}% of its shelf life left).`;
  return '';
}
