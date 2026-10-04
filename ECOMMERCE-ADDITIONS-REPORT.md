# E-commerce additions (October 2026)

Frontend prototype only — no backend. All state stays in browser storage like the rest of the demo.
Code: `js/commerce-plus.js`, with small hooks in `commerce.js`, `product-orders.js`, `grocery-inventory.js`, `customer-billing.js`, `commerce-notifications.js`, `app.js` and `config.js`.

## What was added

| Area | Added |
|---|---|
| Catalogue | MRP and % off, brand, HSN, GST rate, multiple image links, category details (food: ingredients, allergens, best-before, FSSAI; electricals: model, wattage, warranty; fashion: fabric, fit, size chart, wash care), variants (rice 5 kg / 1 kg, shirt S/M/L), aisle, sold-by-weight |
| Listing approval | New or changed listings wait for MoveAI review; checks for price above MRP, required details, restricted items, duplicates and category approval. Not live until approved. |
| Stock | Bulk CSV upload, stock received in batches with expiry, oldest expiry sold first, expired batches written off automatically, alerts 3 days before expiry |
| Search | Hindi/Hinglish words (chawal, doodh, tamatar, aloo…), small spelling mistakes, filters (brand, max price, rating, veg, 10%+ off), sort (price, discount, rating), one card per variant group |
| Product page | MRP, % off, tax note, variant chips, delivery estimate, details table, return policy, ratings and reviews (verified purchases only), wishlist |
| Customer | Wishlist, buy again, saved lists, repeat orders (daily / weekly), MoveAI wallet |
| Checkout | Coupons (first order, minimum, card-only, store-funded), tip for the courier, express estimate or delivery slots, repeat order, store pause/hours check, COD blocked after repeated refusals, weight-item notice |
| Picking | Barcode must match the ordered item, weight entry for sold-by-weight items (up to +10%; difference back to the wallet when lighter), aisle-ordered pick list, packing photo for orders ≥ ₹2,000 or electrical/fashion ≥ ₹1,000 |
| Delivery | Nearest courier within capacity (2 orders) with same-store batching, distance pay + tips, masked phone number, proof-of-delivery photo when left at door / with guard, automatic reattempt then return to store on the second failure, COD refusal count |
| After delivery | "Help with this order" with category rules: fresh = claims only (small claims auto-refunded to the wallet); packaged food / household = damaged, wrong or expired; electricals = replacement with serial number, then warranty; fashion = return or size exchange with tags. Item-level, return pickup with door condition check, refund to wallet or original method (credit note), store dispute and admin decision, ratings for product, store and delivery. |
| Money | Commission and payout hold per category (admin settings), seller- vs platform-funded discounts, TCS/TDS settings, refund recovered from the seller (minus commission), HSN / MRP / GST on order invoices |
| Seller | Listings & stock, Returns, Analytics (sales, AOV, cancellation and return rates, rating, payouts, TCS/TDS), Store setup (GST/PAN/bank/FSSAI verification, category requests, hours, pause, busy) |
| Admin | Listing approvals and seller verification, returns & claims centre, commerce settings (commission, hold, TCS/TDS, limits, coupons), reports (GMV, commission, claims, late deliveries, fraud flags, notification outbox) |

## Defaults
Commission 8% and payout hold 7 days for every category, TCS/TDS 0% and no extra hold for new sellers — today's behaviour — until an admin changes them. Commerce settings shows recommended values (e.g. fashion 18%, fresh payout after 3 days; TCS 0.5% and TDS 0.1% once a CA confirms).

## Tests
`node tests/commerce-plus.unit.mjs` (added to `npm run test:commerce`) and `python3 tests/commerce-plus.smoke.py`. All 17 existing commerce tests pass. Six existing assertions changed because the rules changed on purpose: automatic reattempt after a failed delivery (`commerce-flow`, `grocery-enhancements`), barcode scan when picking (`grocery-picker-team`), distance-based courier pay (`grocery-payments`), and the extra 1 kg rice pack in voice ordering (`grocery-voice-allocation`, two checks). `customer-billing.smoke.py` and `customer-services.smoke.py` now use the cart flow; the billing test runs the real seller pick (with barcode) → pack → courier pickup → delivery.

## Try it (same browser profile)
1. Customer: Shop → search “chawal” or “tamatar” → filters → product page (MRP, variants, reviews, wishlist) → add to cart → checkout: coupon `SAVE10` / `FIRST50`, tip, slot.
2. Seller (`seller.html`) or store staff (`picker.html`): accept → pick: tap **Demo: simulate scan** (or type the barcode shown on the item), weigh tomatoes → pack (photo for big orders). Listings & stock, Store setup, Analytics, Returns.
3. Delivery (`delivery.html`): Deliveries shows distance, pay incl. tip, masked number, proof of delivery and return pickups.
4. Customer: Orders → Help with this order → claim or return → watch the wallet / refund; rate the items.
5. Admin (`admin.html`): Listing approvals, Returns & claims, Commerce settings, Commerce reports.

## Not included (needs a backend)
Server-side orders/stock/payments, real logins, live GPS and maps, camera barcode scanning, image uploads, real SMS/WhatsApp/push, real refunds and payouts, server-generated codes.

## Parked (separate note)
Old tests `p0-foundation.e2e.cjs` (customer menu changed in v4) and `p3-hiring.e2e.cjs` (Apply button not visible on a job opening — needs checking) still fail; products should use only v4's 7-day seller settlement, not the older wallet release in `product-orders.js`.
