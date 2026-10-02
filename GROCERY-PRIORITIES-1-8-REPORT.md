# Grocery priorities 1–8: implementation and test report

Date: 2 October 2026 (Singapore). Scope: grocery customer, seller, picker, delivery partner and admin. Freight and movers were not changed.

## Delivered in this GitHub Pages mock

| Priority | Implemented behavior | Test evidence |
| --- | --- | --- |
| 1. Optional picker | Seller can **Pick items myself** on Store Orders or let the store picker use the separate Picker page. Both paths require a per-item checklist before packing. A picker cannot take over the seller's self-pick task. | `grocery-enhancements.e2e.mjs` self-pick and ownership checks; multi-item journey still covers staff picker. |
| 2. Notifications | Role-specific important/action alerts replace the old broadcast of every history event. Repeated checkpoint values are rejected. The **Open** button routes an order alert to the customer order, seller order/money, picker task, courier job/earnings, or admin issue/payments as applicable. Existing noisy order alerts from the previous demo format are filtered on load. | Self-pick, recipient filtering, duplicate suppression and actual `notif-open` click tested. |
| 3. Next action | Store, picker and courier order cards show the next step at their current stage. | Screen assertions and end-to-end transitions. |
| 4. Unavailable item | Store or picker marks an item unavailable. Seller may suggest an in-stock product from the same store at the same/lower unit price. Customer approves the suggested replacement, removes the item, or cancels. The revised total, commission and mock partial refund/COD adjustment are recorded. Added an alternate rice product to exercise the scenario. | Replacement permission, wrong-store denial, customer approval, revised ₹678 order and ₹60 partial refund checked. Existing removal/cancel tests still pass. |
| 5. Courier offer and handover | Offer card shows bags, item quantity, earnings and COD/prepaid status with pickup/drop-off addresses. Seller enters 1–10 sealed bags. Courier must confirm matching bag count and store pickup code. Decline offers go to another available partner; admin can reoffer an unanswered offer after a 10-minute demo window. | Wrong and matching bag count; acceptance, decline, expiry/reoffer checked. |
| 6. Customer tracking | Track Order shows status, last update time, bag count, manual checkpoint, distinct customer delivery code and payment state. A fixed, misleading delivery time was removed for new orders. Full history remains below the concise status. | Multi-item route and delivered milestones, manual checkpoint, no-live-ETA screen checks. |
| 7. Exceptions | Courier chooses customer unavailable, wrong address, damaged package or other. Admin can approve a reattempt or cancel after pickup with mock prepaid refund; COD is marked not charged. No courier, timed-out offer, unavailable item and return requests appear in admin Issues. | Delivery issue reason, admin issue view, failed-delivery full refund and payout guard checked; existing return/COD scenarios pass. |
| 8. Money and reconciliation | Admin Payments shows each order's customer payment, refund, seller settlement, courier earning and adjustment entries with amounts, statuses and references. Existing COD handover/reconciliation, reserve period, payout and return adjustment controls remain. | Prepaid, COD, payout, refund, return and settlement regression suite; admin payment record assertion. |

## Automated runs

- `npm run test:commerce`: **PASS** — product detail/cart handler, 13 cross-role scenarios, two-store three-product journey, and the new enhancement scenarios.
- `npm run test:unit`: **PASS**.
- `npm run test:static`: **PASS**.
- `npm run test:smoke`: **BLOCKED** — Python Playwright module is unavailable here. `npm run test:e2e` also cannot launch because Playwright Chromium is not installed. These are not browser passes.

## Manual walkthrough after uploading to GitHub Pages

Publish the extracted ZIP contents at the repository root. Keep all five HTML pages (`index.html`, `seller.html`, `picker.html`, `delivery.html`, `admin.html`) and the `css` and `js` directories together. Use one browser profile and origin for this mock.

1. Customer: Shop → open rice → choose quantity → Add to cart → continue shopping → add salt and Fresh Mart atta → Cart → Checkout → place order. Orders contains separate packages for each store.
2. ABC Grocery seller: accept its order, select **Pick items myself**, mark every item, complete picking, enter bag count and pack. Fresh Mart can instead use its assigned picker on `picker.html` before the seller packs.
3. Test an unavailable item on a new ABC Grocery order with rice and salt: picker or seller flags rice; seller suggests Everyday Basmati Rice; customer opens Orders and approves it or removes the item. Confirm revised total and refund status.
4. Ravi: open Deliveries, review offer, accept, verify store pickup code and bag count, share En route and Near destination. Repeating En route should not create another alert. Get the customer delivery code from Orders and confirm delivery. Customer Track Order and admin Orders show delivery.
5. Notifications: customer sees the meaningful updates, and Open should go to the correct order. Seller, picker, courier and admin see their respective tasks without the customer receiving internal picking/offer events.
6. Failure path: on a separate order, courier reports Customer unavailable; admin Issues can approve reattempt or cancel/refund. Admin Payments displays ledger status and references. Test COD cash handover and reconciliation separately.

## Important limits

This is a static demo. `localStorage` shares orders only between tabs in the same browser profile and origin. Separate customer, store and courier devices cannot synchronize. The OTPs, payments, partial refunds, payouts, stock flags, 10-minute expiry check and delivery codes are mock mechanisms; they do not provide production security or settlement. The expiry is evaluated when admin presses the reoffer action, not by a background scheduler. Checkpoints are manually selected; there is no live GPS, calculated ETA, push delivery, inventory reservation, capacity-aware dispatch, or photo/signature proof of delivery.

Before a real launch, implement authenticated role accounts, a transactional order and inventory backend, payment gateway/webhooks, idempotent event delivery, a dispatch/timeout worker, push notifications, location consent and collection, and operational monitoring. A live browser and multi-device test on the deployed URL remains necessary.
