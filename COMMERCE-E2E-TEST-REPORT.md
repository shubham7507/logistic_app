# Commerce flow implementation and test report

Date: 1 October 2026
Base: MoveAI_One_P5-P8_Complete_Flow_Netlify (14).zip, plus the shopping-flow update.

## Delivered mock flows

- **Customer (`index.html`)**: product search, mixed-store cart, one checkout/payment attempt, separate store orders, address, substitution preference, UPI/card/COD, order history, delivery code and location checkpoints, cancellation, return request, payment/refund and invoice views.
- **Grocery seller (`seller.html`)**: separate ABC Grocery and Fresh Mart mock workspaces; scoped products, stock availability, own orders, acceptance/rejection, unavailable-item handling, packing, pickup code, and store settlement breakdown.
- **Delivery partner (`delivery.html`)**: two separate mock partner workspaces; available/offline, assigned offers, acceptance/decline, pickup code, location checkpoint, delivery code, delivery issue, COD cash handover and own earnings.
- **Admin (`admin.html#/commerceOps`)**: cross-role order/status view, seller and delivery profile approval/suspension, reassignment, delivery reattempt, return review, COD reconciliation, store bank settlement and delivery-partner payout. Every commerce transition writes an actor/time history and scoped notifications.
- **Platform logic**: seller orders split from one mixed-store checkout; shared order state and payment allocation; automatic offer to an available approved mock courier; payment, fulfilment and settlement tracked independently; simulated seven-day store settlement reserve.

## Grocery role navigation update

The customer desktop menu now includes **Shop** and **Orders**. The mobile menu shows Home, Shop, Orders, Account and More; the earlier Book, My bookings and Messages destinations remain in More. Seller mobile shows Home, Orders, Products, Money and More (Store is in More). Delivery mobile shows Home, Deliveries, Earnings, Profile and More; COD cash is linked from Earnings, appears as a Home alert when collected, and remains in More. Admin mobile shows Overview, Orders, Partners, Payments and More; Issues and the existing non-grocery admin pages remain in More. `#/commerceOps` remains a valid overview link.

Admin Orders shows order history and actions, Partners holds grocery seller and courier approval, Payments holds COD/settlement/payout actions, and Issues lists returns and delivery exceptions. No logistics or movers screens were changed for this update.

## Example money path

For a ₹710 product paid online: one mock gateway payment of ₹710; seller accepts and hands over; courier verifies delivery; the order records ₹57 product commission, ₹653 store payable, and ₹35 delivery earning. Store settlement waits until the seven-day demo reserve elapses and an admin triggers its mock bank payout. The delivery earning has its own admin payout. A COD order requires the partner's cash handover and admin reconciliation before either payout.

This is a **demonstration policy**, not a claim that Amazon uses 8% or these exact charges. The customer-facing ₹40 delivery fee below ₹499 is accounted separately from the product commission.

## Automated results

| Suite | Command | Result |
| --- | --- | --- |
| Cross-role commerce scenarios | `npm run test:commerce` | PASS: 13 scenarios including prepaid, COD, mixed stores, scoped access, wrong codes, declines, refunds, cash reconciliation, payouts, failed bank payout, unavailable items and delivery issue. |
| Existing unit regression | `npm run test:unit` | PASS |
| Syntax and screen integration | `npm run test:static` | PASS, including role-specific mobile tab mappings, every desktop destination in More, grocery admin sections and route access checks. |
| Browser smoke | `python3 tests/shop-flow.smoke.py` | **Not executed in this environment.** Python Playwright is absent; the Chromium download returned an invalid archive. The script is included for a machine with Playwright and Chromium. |

These results verify the mock state transitions and rendered screen markup. They do not establish that the full UI works in a real browser here. Complete the manual walkthrough below before calling the demo browser-verified.

## Manual end-to-end walkthrough

Open the unzipped folder through a local static server (or deploy its contents to Netlify). The four entry pages share browser storage on the same origin. Use one browser profile. **Reset demo data** from `index.html` first. The workspace switcher lets you switch between the two mock stores or the two mock delivery partners. Other apps are also linked from the customer Account screen.

### A. Prepaid order through all four roles

1. Customer: `index.html#/search`. Search **rice**; add India Gate Rice. Search **salt**; add Tata Salt. Cart: set rice quantity to 2. Checkout total should be **₹1,448**, delivery free. Use address `42 MG Road, Delhi 110001` and UPI `shubham@okaxis`. Place the order; note its `ORD-...` number in My orders.
2. Seller: `seller.html#/shopOrders`, ABC Grocery. Find that order, **Accept**, then **Packed · ready for pickup**. Note its four-digit pickup code.
3. Delivery: `delivery.html#/deliveryJobs`, Delivery Partner 1. **Accept job**, enter the store pickup code, then **Confirm pickup**. Optionally share **Near destination**. Customer My orders now shows the four-digit delivery code. Enter it in the delivery workspace and **Confirm delivery**.
4. Admin: `admin.html#/commerceOrders` to verify Delivered, Paid, Pending settlement, courier payout Pending. Open **Payments** (`#/commercePayments`). Attempt **Settle** before the reserve ends: it is blocked. Click **Demo: advance 7 days**, then **Settle** and **Pay delivery partner**. Verify both payout statuses become Paid.
5. Customer: My orders shows Delivered, the history, receipt and tax invoice. The store's Money view shows its own payout; the delivery partner's Earnings view shows its separate payout.

### B. One checkout, two stores

1. Reset. Customer adds India Gate Rice (ABC Grocery) and Fortune Atta (Fresh Mart); places one ₹1,195 UPI checkout.
2. My orders shows two order IDs with the same checkout ID. ABC Grocery sees only the rice order; switch the Seller app workspace to Fresh Mart to see only the atta order. Each package can progress independently. One gateway reference is allocated across the two store orders.

### C. COD, refund and failure paths

1. Reset. Buy one Fortune Atta for **₹525** including delivery; choose Cash on delivery. Fresh Mart accepts and packs it. Delivery Partner 1 declines the offer, and Delivery Partner 2 receives it.
2. Partner 2 verifies pickup/delivery codes, collects ₹525, and taps **Hand over COD**. Admin cannot settle while cash is un-reconciled; after **Reconcile cash** and advancing seven demo days, admin can settle the store and pay the delivery partner.
3. Customer requests a return with a reason and a valid refund UPI ID. Admin approves; a refund record appears and, if the store has already been paid, a future-settlement adjustment is recorded.
4. Check guards: wrong pickup/delivery code, seller attempting another store's order, an unassigned courier attempting a job, cancellation after pickup, duplicate settlement, and suspension of a profile with active orders must all be rejected. A seller can mark a multi-item order's item unavailable; the customer either removes it and receives a partial refund or, when selected at checkout, the app automatically removes and refunds it.

## Remaining production integrations and limits

- Payment collection, bank payout, COD remittance and refunds use deterministic mock gateway/ledger records. No money moves. Real webhooks, idempotency keys, reconciliation and bank return handling are still required.
- Stock is a simple availability flag, not a quantity reservation under concurrent orders. Store/partner applications and document verification are represented by mock approved profiles and admin status controls, not a complete real onboarding service.
- Courier matching is a mock approved/available match. Location updates are manual checkpoints, not continuous GPS, and delivery codes are visible in the relevant demo workspace. A production system needs server-side access control, tokenized codes, secure notifications, location consent, routing and proof storage.
- The static prototype uses shared browser local storage. It cannot provide production identity, tenant isolation, multi-device synchronization or tamper-proof audit. Browser tests were not runnable in this environment.
