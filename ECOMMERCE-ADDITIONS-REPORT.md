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

## GPS tracking for deliveries (phase 1, prototype)
`js/geo.js`. Checkout has a **map pin** (area list or "Use my current location") and checks each store's **delivery radius** (12 km). Orders store real coordinates; route distance and courier pay come from them. The courier screen shows a map, **Navigate** (Google Maps), **Share live location** (browser GPS with permission, only during the job, stops on delivery) and demo buttons (**move 400 m**, **auto-drive**). The system marks **arrived at store** (100 m), **arriving** (500 m, customer notified) and **arrived** (100 m) automatically, blocks pickup more than 300 m from the store and failed-delivery reports more than 200 m from the customer's pin, and saves the delivery location and distance driven. The customer's **Track order** shows a live map with ETA and a share link; admin **Commerce reports** shows live deliveries with late / no-update flags. Maps are simple drawings for now (no tile provider chosen). Live tracking between different phones needs a backend.

## Notification centre
`js/notify-center.js`. **Needs your action** pinned (rate, approve extras, confirm work and pay, accept fixed quote, return pickup code, replacements; for stores: new orders, courier arriving, return disputes; couriers: offers and return pickups; admin: approvals, claims, delivery problems), then **Active** (one card per order or booking with progress, ETA and Track), **Updates** grouped per order ("3 earlier updates"), **Past orders** (receipt, help, buy again), **Payments & refunds** and opt-in **Offers**. The bell counts orders and actions, not every event.

Tests: `tests/geo-notify.unit.mjs` (in `npm run test:commerce`), `tests/geo-notify.smoke.py` (courier drives in one tab while the customer watches in another). `grocery-enhancements.e2e.mjs` updated for the new tracking text.

## Final prototype round (everything except the backend)

**Phase 1 — fixes.** Old P0 and P3-hiring tests pass (P3-hiring was not a bug; P0 now checks the product-specific menus). Product orders are paid to stores only through seller settlement (the old wallet release was removed). Cash driver jobs: MoveAI's booking fee becomes the driver's wallet debt. Seed orders get map pins.

**Phase 2 — everyday shopping.** Cancel one item before packing (refund for online payments; stock released). Items unavailable after ordering are counted per store; 3 in 30 days alerts admin and shows in fraud flags. Coupons have expiry, total budget and uses per customer. Courier incentives: peak-hour bonus per delivery (18:00–22:00 IST by default) and a daily-target bonus. Seller payout statement by month (print/PDF) with TCS/TDS certificate view by quarter. Customer monthly statement (Account → Monthly statement).

**Phase 3 — notifications everywhere.** Needs-action items for transporters (trips needing a vehicle, payments to approve, freight charges, offers, joining reviews), movers (new jobs), drivers and helpers (work offers, nearby requests) and admin (verifications); an Active list of trips and moving jobs for business and partner apps. Notification settings per type (orders, payments, offers, account) and channel (push, SMS, WhatsApp) with quiet hours — urgent alerts still go out. The simulated outbox follows the settings.

**Phase 4 — maps and GPS.** Real street maps (OpenStreetMap via Leaflet from cdnjs) with a sketch fallback when offline; drag the home pin to the exact gate at checkout. Store delivery areas as a radius or a drawn shape (admin → Commerce settings → Maps and delivery areas). Couriers save entrance notes ("Gate 2, Tower B") reused for later orders to the same spot. GPS for truck trips and moving jobs: map, Navigate, live sharing or demo moves, automatic "reached pickup" (trip milestone completed), waiting time at loading, "reached drop" and route-deviation alerts. Late and no-update deliveries notify admin.

**Phase 5 — bigger money flows.** Claims for moves, driver bookings and home services (damage, overcharge, incomplete, behaviour) → admin decision → refund to wallet or original method and recovery from the partner's wallet. Freight **protected payment**: payer funds the invoice; advance released when loaded, balance after delivery proof, disputed amounts held until resolved (returned to the payer if the deduction is accepted). **Debit / credit notes** after an e-invoice (approved charges and accepted deductions). **Early payment** against delivery proof from a simulated lending partner (1.5% fee). **Fuel card** per trip (load, record spends; business expense, not khata). Platform helpers and drivers are paid into their **MoveAI wallet** from the khata. **Payslips** (print/PDF) and **PF / ESI export files** from payroll.

Tests: `tests/phase2.unit.mjs`, `tests/phase345.unit.mjs` (in `npm run test:commerce`), `tests/phases.smoke.py`. Changed assertions: `product-orders.unit.mjs` (no wallet release for products), `gst.unit.mjs` (charge after IRN becomes a debit note), `p0-foundation.e2e.cjs` (menus).

**Still needs the backend / real services:** shared database and logins, real payments, maps provider keys for production volume (Google or Mappls), phone apps for background GPS, real SMS/WhatsApp/push, government and bank services, CA and legal reviews.
