# Grocery workforce UI and end-to-end test report

Date: 3 October 2026. Scope: static GitHub Pages prototype, mock data, same browser origin. No mover or freight changes.

## Implemented role screens

| Role | Entry and screens | Main actions |
| --- | --- | --- |
| Customer | `index.html` → Shop, Cart, Orders, Tracking | Select multiple products, checkout, see receipt, order and delivery updates. |
| Store owner | `seller.html` → Team, Schedule, Orders, Picker Pay, Offboarding | Invite managers/pickers, set pay plan, publish shifts, manage tasks, pack and record external picker pay, revoke/finalize staff exit. |
| Store manager | `seller.html` → choose ABC Grocery manager or Fresh Mart manager → Profile, Orders, Schedule, Timecards | Accept invitation, handle that store's orders and picker assignment, approve shift cover/corrections/timecards. No owner pay or exit access. |
| Picker | `picker.html` → Profile, Schedule, Pick tasks, Earnings | Accept invite, confirm/request cover, clock shift, correct time, check every item, view own wages. |
| Delivery partner | `delivery.html` → Deliveries, COD cash, Earnings | Accept offered job, verify store pickup code and bag count, share manual checkpoint, verify customer delivery code. |
| Admin | `admin.html` → Orders, Partners, Payments, Issues | See cross-store order history, manager and picker status, mock settlements and exceptions. |

## Typical journey

1. Owner invites a manager and picker by name and demo mobile in Seller → Team. Each selects the invited account and accepts in Profile. Owner sets the picker's monthly or daily pay plan.
2. Owner or active manager publishes a shift. Picker confirms or requests cover in Schedule. A cover request can be reassigned only to an active picker at the same store without a same-day shift.
3. Picker starts and submits a shift in Earnings. If time is wrong, picker requests a correction with new times and a reason. Owner or manager approves/declines it, then approves the submitted timecard. Owner creates a pay run, reviews an adjustment, approves it and records an external bank/UPI/cash reference.
4. Customer adds multiple products to the cart, checks out, and sees separate store orders. Owner or manager accepts an order, assigns an active store picker, and packs only after every item is confirmed. Ravi accepts the delivery offer, verifies store pickup code and bag count, then enters the customer's delivery code at handoff. Customer sees Delivered and order history; admin sees the same order.
5. Owner sets the last day or removes access immediately in Offboarding. Open tasks are released for reassignment; future roster entries are cancelled. Finalization waits for open work, submitted shifts, pending corrections, approved shifts without a pay run, and unpaid runs. An active manager's removal immediately removes order/schedule authority.

## Tests and findings

- `npm run test:commerce`: **PASS**. Eight suites, including the new manager/roster/time correction/final-pay/offboarding and full order-to-delivery role journey. Earlier suites also cover three cart products across two stores, replacement/refund, COD and failed delivery paths.
- `npm run test:unit`: **PASS**. 17 unit scripts, 18 roles and 137 known routes.
- `node --check js/*.js` individually and eight screen/static integration scripts: **PASS** after updating the picker mobile tab expectation.
- `npm run test:static`: the syntax wrapper cannot spawn its child Node executable in this sandbox (`spawnSync EPERM`). Its equivalent individual syntax checks and the eight following integration scripts passed. This is an environment limitation, not a syntax failure.
- No interactive browser clickthrough was available in this workspace. The tests exercise rendered screen HTML and role mutations with mock state, but do not prove visual layout or touch behavior on a device. Open the pages on the same browser profile for final manual review.

## Known prototype boundaries

Local storage is per origin/browser; separate devices cannot share orders. Invites and acceptance do not send SMS or authenticate a real employee. Times use the browser UTC date; there is no production roster timezone/overlap engine or recurring shifts. Payment, payout and refund values are simulated and no money moves. A backend will need identities, scoped permissions, store/team membership, audit records, notification delivery, atomic order and shift transitions, timestamps and payment integration before production use.

## Manual check after publishing

Publish all root files together to GitHub Pages. In one browser profile, reset demo data if prior state is inconsistent; then open `index.html`, `seller.html`, `picker.html`, `delivery.html` and `admin.html` on the same origin. Check owner Team invitation, manager Profile acceptance, manager Schedule and Timecards, picker Schedule and Earnings, customer Cart and Orders, courier pickup/delivery codes, owner Offboarding and admin Partners/Payments. Use another tab on the same origin to see storage updates.
