# MoveAI damage, returns, help and refund update

Date: 12 October 2026. This is a browser-local GitHub Pages prototype. Payments, refunds, delivery pickups and ledger entries in this package are simulated; a real backend and payment provider are still required.

## Implemented

- My orders and package tracking use one contextual **Help with this order** entry. Before receipt it offers general order help; after delivery/collection it shows item-specific claims and the matching policy. The separate duplicate general customer button was removed.
- Contextual Help Desk reasons change with the package stage. Choosing another reason retains the package reference. A pre-delivery item damage claim is rejected.
- A claim identifies item and quantity, saves small mock photo evidence in the browser profile, and stays visible to customer, seller and admin. Existing pickup and claim appeal actions remain available.
- Refund initiation no longer changes the store payout automatically. Admin sees customer and store evidence and must record whether store packing, delivery handling, or the platform funded the remedy, with a written reason.
- A seller-funded refund reduces a pending seller payout or creates a next-payout recovery after settlement. The seller can dispute the adjustment; when upheld, the deduction is reversed once. Courier/platform-funded refunds leave the seller payout alone.
- An exchange or replacement does not charge the seller for the entire item's sale value as though it were a refund. Its actual cost policy would need a backend configuration.
- Claim funding and adjustments appear in seller Returns & claims, seller Money, admin Claims and admin payment records. The customer monthly statement counts completed claim refunds, not initiated transfers.
- An existing whole-order return cannot be opened alongside an active item claim. The older whole-order return path remains for its existing legacy test flows; it is no longer a second customer claim button.

## Manual walkthrough in one browser profile

1. Open `index.html`, select a mock customer, add a grocery product, checkout and open **My orders**. Open Help before delivery: only order-stage issues should appear.
2. In Seller, accept and pick/pack the order. In Delivery, accept, collect, and deliver. Reopen the delivered package in Customer: the item claim form and category policy now appear under **Help with this order**.
3. Submit one damaged item with a photo. Open Seller → Catalog → Returns (or Returns & claims) to inspect the customer evidence and add packing evidence. Open Delivery for an assigned return pickup if required. Enter the customer return code and complete the check.
4. Open Admin → Returns & claims. Confirm the mock external refund if applicable. Record a funding decision and reason: first try **Delivery handling** and see that the seller payout does not decrease.
5. Reset demo data and repeat with **Store stock or packing**. The seller sees an adjustment in Returns & claims and Money. Seller can dispute; Admin can uphold it and reverse the adjustment.
6. For fresh food, test a small missing-item claim: mock wallet credit is immediate while funding stays pending until Admin decides. The same customer and seller must use the same browser profile because localStorage is the shared demo state.

## Test results

- `npm run test:damage-claims`: PASS (customer, seller, driver, admin, photos, help case, pickup exceptions, refund, liability and appeal).
- `npm run test:unit`: PASS.
- `node --check` on four edited modules: PASS.
- `node tests/commerce-screens.integration.mjs`: PASS.
- `npm run test:commerce`: NOT FULLY PASSING. It stops at the existing `tests/commerce-flow.e2e.mjs` pack step with “This store action is not available at the current stage.” This failure was present in the previous package and is outside the new claim path. Do not present the entire checkout-to-delivery suite as passing.
- `npm run test:static`: could not run in this sandbox because its syntax harness attempts a restricted child-process spawn (`EPERM`). Direct syntax checks and the relevant screen integration test passed.

## Remaining before production

The current prototype has no shared account backend, payment gateway confirmation, real refund transaction, identity-backed evidence storage or server-enforced authorization. The refund amounts and seller adjustment simplify tax, coupon and delivery-fee allocation; these must be specified per market and product before moving real money. The older full-order return module should eventually migrate to the single item-level case model. A failed gateway refund and a courier-fault recovery are represented as design states, not real payment integrations.
