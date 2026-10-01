# Grocery multi-item journey: end-to-end mock test

Date: 1 October 2026. Scope: grocery customer, two sellers, delivery partner and grocery admin. Logistics and movers were not changed.

## Executed journey

| Step | Test input / expected result | Result |
| --- | --- | --- |
| Customer cart | 2 × India Gate Rice (₹1,420), 1 × Tata Salt (₹28), 1 × Fortune Atta (₹485) | PASS: three lines, ₹1,933 total, free delivery |
| Checkout | One mock UPI attempt, delivery to 42 MG Road, Delhi | PASS: one checkout and gateway reference; cart cleared |
| Split fulfilment | ABC Grocery gets rice + salt; Fresh Mart gets atta | PASS: two independently tracked orders, ₹1,448 and ₹485; each seller sees only its own order |
| Seller work | Each seller accepts and packs its order | PASS: status advances to ready for pickup and a courier offer is created |
| Courier offer | Assigned delivery partner sees each request and accepts | PASS: other delivery partner cannot view or act on those assignments |
| Pickup | Wrong pickup code rejected; store code accepted | PASS: order advances to out for delivery |
| Tracking | Courier posts En route, then Near destination | PASS: customer order card shows the last update and history |
| Delivery | Wrong customer code rejected; correct code accepted | PASS: both orders delivered, invoices created; seller and driver payouts pending |
| Addresses | Courier can see store pickup and customer drop-off addresses | PASS after fix: two mock store pickup addresses, customer drop-off, directions links |
| Admin | Grocery Orders displays order history; Payments handles later settlement and payouts | PASS in the existing cross-role mock scenario suite |

The two generated order IDs vary each run. The assertions are in `tests/grocery-multi-item-journey.e2e.mjs`, included by `npm run test:commerce`.

## Issue found and fixed

The delivery partner's job card originally omitted the pickup and customer delivery addresses. The test showed neither address in the rendered job. The job card now shows both addresses and directions links. Mock store pickup addresses were added to the two seeded stores. Loading a previously saved demo merges these new defaults without erasing that demo's store data.

## Verification

- `npm run test:commerce`: PASS, including the new three-product, two-store journey and 13 existing cross-role scenarios.
- `npm run test:unit`: PASS.
- `npm run test:static`: PASS, including route access and rendered screen checks.
- Real-browser clicking: NOT VERIFIED. The browser tool could not open the local server (`ERR_BLOCKED_BY_CLIENT`), and no Playwright browser executable is installed in this environment. Test the published GitHub Pages URL manually before treating the UI as browser verified.

## Remaining demo limits and issues

1. GitHub Pages uses local browser storage for shared state. Separate devices, browser profiles, or domains do not see the same orders. A backend, authentication and database are needed for real cross-device handoff.
2. Courier matching offers both packages to the first available approved courier without capacity, distance or route checks. The mock can assign two simultaneous orders to one partner.
3. Tracking is a manually selected checkpoint, not live GPS. The displayed ETA is a fixed mock value and does not react to courier progress. Directions links open a map search; the demo does not verify arrival at either address.
4. Pickup and delivery codes are present in the relevant mock pages and are enforced in state transitions, but there is no server-side secret storage, expiring code, secure notification or proof photo.
5. UPI, COD remittance, invoices, bank settlement and refunds use mock records. No real money moves.

## How to check in GitHub Pages

Open the customer, seller, delivery and admin pages in tabs of the same browser profile and origin. Reset demo data from the customer page. In Shop, add the three products and set rice to quantity 2. Checkout, then use Seller → Orders for both seller workspaces, Delivery → Deliveries for pickup/delivery and checkpoint actions, Customer → Orders for status and delivery code, and Admin → Orders/Payments for oversight. The store pickup code appears on the seller order after packing. The customer delivery code appears when the package is out for delivery.
