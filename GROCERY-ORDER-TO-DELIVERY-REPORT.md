# Grocery order to delivery: implementation and test report

Date: 1 October 2026 (UTC). Scope: grocery customer, seller, store picker, delivery partner and admin. The separate freight and movers flows were not changed.

## What changed

| Role and page | Screen or action | Result |
| --- | --- | --- |
| Customer `index.html` | Shop → product card → detail/quantity → Add to cart → added confirmation → keep shopping → cart → address/payment/review → place order | Multiple products can be bought in one checkout; packages split by store with one checkout payment attempt. Cart remains visible on mobile. |
| Customer `index.html#/orders` | Track order → `#/orderTracking` | Per-package milestones: placed, accepted, picking, picked, packed, courier collected, delivered. Shows order items, destination, courier, manually shared checkpoint, delivery code at the appropriate stage, and event history. |
| Seller `seller.html` | Orders | Accept or reject, review picker progress, resolve unavailable items, pack only after every remaining item is confirmed; share pickup code with courier. Products, store profile and settlements remain available. |
| Picker `picker.html` | Home, Pick tasks, Profile | Separate ABC Grocery and Fresh Mart picker workspaces; accept the store's assigned accepted order, start picking, mark each ordered line/quantity picked, undo, mark an item unavailable, complete picking. A picker cannot read the other store's order or seller/courier pages. |
| Delivery `delivery.html` | Deliveries | Accept offered package, see store and customer addresses, verify store pickup code, share manual en route/near destination/at destination checkpoints, verify customer delivery code; handle COD and delivery issue. |
| Admin `admin.html` | Grocery orders, partners, payments, issues | Order history includes picker and checkpoint events; partner view includes the two assigned pickers; existing refund, COD, payout and issue controls remain. |

The handoff ordering follows the documented partner picking stages of received order, picking/packing ready for pickup, rider dispatch and delivery. The specific buttons and roles here are MoveAI mock design, not a claim that another service has identical UI.

## Automated verification

- `npm run test:commerce`: PASS. UI handler test covers opening detail, selecting quantity, adding to cart, confirmation, basket and checkout. The cross-role suite covers prepaid/COD, refunds, reassignment, exceptions and settlement. The multi-item journey places 2 × rice, salt and atta in one cart, totals ₹1,933, creates ABC Grocery ₹1,448 and Fresh Mart ₹485 packages, and runs each through seller accept → assigned picker checks each line → seller pack → courier offer/accept → pickup code → checkpoints → delivery code → invoice. It asserts that pack is blocked before picking, incomplete picking is blocked, and a picker from another store is denied.
- `npm run test:unit`: PASS. Includes 16 role configurations and route access checks.
- `npm run test:static`: PASS. Includes entry pages, routes, mobile role navigation and screened access.
- `npm run test:e2e`: BLOCKED at browser launch. Playwright Chromium is not installed in the workspace. This is not a passing browser run. The other suites execute mock functions and screen/handler assertions in Node.

## How to test on GitHub Pages

Upload the extracted files to the published repository root, including `picker.html`, `css`, `js`, `tests` and `.nojekyll`. Wait for Pages deployment, then use **one browser profile on one origin**. Reset demo data on the customer page before starting. Open these tabs using your actual Pages base URL:

1. `index.html#/search`: open a product card, select 2 units, Add to cart, Continue shopping, add products from the other store, open Cart, check quantities, choose Checkout, enter a delivery address and mock UPI (`test@okaxis`) or COD, then place order. Record the two package IDs under Orders.
2. `seller.html#/shopOrders`: switch between ABC Grocery and Fresh Mart using the workspace switcher, accept only the respective store order. Packing should be disabled until its picker finishes.
3. `picker.html#/pickTasks`: choose the matching store picker, start each accepted order, mark every item picked, complete picking. Verify the other store's order is absent. Test Undo on one item before completing if desired.
4. Return to each seller: confirm picker progress, mark the package packed, read its pickup code.
5. `delivery.html#/deliveryJobs`: accept each offered package, enter its store pickup code, verify addresses, mark an en route/near destination checkpoint, and enter the customer delivery code from Orders/Track order to confirm receipt.
6. `index.html#/orders`: open Track order for each package. Confirm delivery and invoice links. `admin.html#/commerceOrders` shows the full event history; `#/commercePartners`, `#/commercePayments` and `#/commerceIssues` show partner, money and exception status.

Refresh a tab if a cross-tab update is not immediately visible. Reset demo data destroys mock orders. GitHub Pages must publish the five HTML entry points at the same origin/path.

## Remaining limits and risks

- Static `localStorage` only shares data between tabs of the same browser profile and Pages origin. A customer's phone and seller's phone will **not** synchronize. Production needs a server, authenticated role identities, persistent order database, transactions and push/realtime updates. The demo's role switcher, pickup/delivery codes, payment gateway and payouts are mock data, not secure production controls.
- Tracking checkpoints are manually selected by the courier. There is no live GPS, map position, route ETA calculation, background location, notifications to a different device, or proof of delivery photo/signature. The displayed order ETA from the earlier checkout is illustrative.
- Stock is a demo availability flag; there is no stock reservation or concurrent order safety. Product images, taxes, delivery zone checks, merchant operating hours, picker assignment queues, fraud controls, escalation SLA and automated refunds need production design/integration.
- The browser interaction and deployment itself still need a hands-on pass after the new files are pushed to GitHub Pages. No deployed URL was provided for this run.
