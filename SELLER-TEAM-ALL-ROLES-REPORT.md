# Seller teams across grocery, electrical and fashion stores

## What changed

The seller selector in `seller.html` now has a Team, Schedule and Offboarding route for Sharma Electricals and City Fashion as well as the grocery stores. Their owner can invite order-preparation staff and managers, set daily or monthly staff pay plans, review shifts and mock pay, and remove access. The manager has a separate workspace for store orders, team overview, shifts and timecards. The worker uses `picker.html` under the matching store staff workspace for invitation acceptance, tasks, shifts and earnings. Each worker and manager is scoped to one store. The admin's partner and payment views can see their status and mock staff pay records.

An accepted electrical or fashion order now offers its item checklist to an available on-shift worker. The worker accepts, verifies each line and quantity, then the owner or manager packs and releases the package to Ravi. If no worker is available, the owner can prepare it. The seller order copy says store worker and preparation instead of telling an electrical store to invite a grocery picker. Existing saved demo data is migrated to include the new role workspaces and seeded accounts without clearing existing orders.

## Walkthrough in one browser profile

1. Open `seller.html`, select **Sharma Electricals**, then **Team**. Invite a worker with a demo name and 10-digit mobile. Set their pay plan after acceptance. Invite a manager if needed.
2. Open `picker.html`, select **Sharma Electricals staff**, then **Profile**. Select the invited account and accept. In `seller.html`, select **Sharma Electricals manager** to see the manager's own Team, Orders and Schedule tabs. The owner can publish a shift too; the worker confirms it, starts the shift and stays available.
3. Open `index.html`, add the LED bulb to the cart and place an order. In `seller.html` as Sharma Electricals manager, accept the order. An available worker receives the offer automatically; otherwise the owner may assign one in Orders or prepare the items personally.
4. In `picker.html` as the electrical worker, accept the offer, mark the item checked, then complete the checklist. Back in the seller workspace, enter the sealed package count and choose **Pack and ready for pickup**.
5. In `delivery.html` as Ravi, accept the delivery, enter the store pickup code when collecting, and enter the customer delivery code on delivery. The customer sees Delivered in `index.html#/orders`; admin sees the order and associated records in `admin.html`.
6. End the worker shift, approve it in the manager or owner workspace, then review the mock pay in Seller → Staff pay. Offboarding is in Seller → Offboarding. Repeat with **City Fashion** and its own staff workspace; electrical staff cannot see fashion tasks.

Use the same browser profile and origin for these role switches. GitHub Pages stores demo data in localStorage; separate devices or incognito profiles do not share orders or staff. Reset demo data clears the local state. Invitations, notifications, payments and delivery checkpoints are simulated; no SMS, bank transfer, real-time location or backend account security exists.

## Verification on 3 October 2026

- `npm run test:unit`: passed, including 24 mock roles and navigation checks.
- `npm run test:commerce`: passed, including a new electrical and fashion journey for invitation, manager and worker permissions, shift, automatic offer, item checklist, packing, delivery, notifications, pay approval and removal. Existing grocery, mixed checkout, payments and COD suites passed.
- JavaScript syntax checks and eight static screen/integration scripts: passed.
- `npm run test:static` could not start its syntax wrapper because nested Node process spawning returned EPERM in this environment. Its checks were run directly as above.
- `npm run test:e2e` could not launch because the Playwright Chromium binary is not installed here. `npm run test:smoke` could not start because the Python Playwright package is absent. Browser click-through remains to be verified on the deployed GitHub Pages URL.

## Scope to carry into backend work

These are front-end demo roles and local rules, not authenticated user accounts. A production service needs server-enforced store membership, permissions and order state transitions, a persistent shared database, invitation verification, real notification delivery, secure pickup/delivery codes, inventory reservation and payment provider reconciliation.
