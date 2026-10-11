# Damage claim flow — implementation and test report

Date: 11 October 2026. Scope: GitHub Pages browser-local MoveAI demo. No backend or real payment transfer.

## What changed

| Role | Action and status |
| --- | --- |
| Customer | Delivered package → Report a problem or view claims. Submit an affected item, quantity, reason and a JPG/PNG/WebP photo. The claim card shows a full timeline, next action, pickup partner and return code. The customer can appeal a rejection or failed pickup with a reason and open a Help Desk case linked to the CLM number. |
| Seller and manager | Returns shows the actual customer image, item, original picking checklist summary, packing record, claim timeline and return status. Submit a written response and optional packing photo. A new claim appears in the seller's action list and notification stream. A completed refund can be disputed. |
| Delivery partner | Deliveries → Return pickups shows the customer image and an offer to accept or decline. Only the assigned partner who accepted can collect with the customer code and condition checklist. A declined offer goes to another eligible available partner or waits for platform reassignment. |
| Platform admin | Returns & claims shows customer and seller evidence, timeline, pickup status and review queue. The admin can approve, reject with a reason, arrange another pickup on appeal, reoffer a waiting pickup and confirm a simulated external refund. |
| Help Desk | A case opened from a CLM number links back to that claim. The customer, relevant seller and admin can view the saved small mock attachment in this browser profile. Help Desk case decisions remain separate from refund and pickup actions. |

Small images are kept as data in browser storage so the other role workspaces in the **same browser profile** can open them. Images over 350 KB are resized in the browser; the input limit is 8 MB. PDFs in Help Desk are limited to 350 KB. Existing claims that saved only a filename cannot recover their old image.

## Example: damaged salt package

1. Customer submits damage photo and receives `CLM-...` with **Pickup offered**.
2. Seller opens Returns, views the image, checks the preparation record and adds a response/photo.
3. Ravi opens Deliveries → Return pickups and accepts. He checks the returned item and enters the customer return code.
4. Passing checks changes the claim to **Refund started** for an external payment method, with a mock ledger entry `refund_initiated`.
5. Admin uses **Demo: confirm external refund**; the claim and ledger then say **Refund completed**. A MoveAI wallet refund completes immediately in this mock.
6. If Ravi declines, another eligible available partner can receive an offer. If none is available, the admin sees a waiting claim and can reoffer it later.
7. If the pickup check fails, the customer can appeal; admin can approve, reject with a written reason, or request a new pickup. The claim timeline records these steps.

## Test evidence

- `npm run test:damage-claims`: PASS. Covers role views, image evidence, linked Help Desk case, seller response, wrong-partner denial, decline/reassignment, pickup code and checks, failed-check appeal, refund started/completed and ledger state.
- `npm run test:unit`: PASS.
- `node tests/commerce-screens.integration.mjs`, `node tests/product-orders.unit.mjs`, `node tests/grouped-seller-cart.e2e.mjs`, and `node tests/geo-notify.unit.mjs`: PASS.
- Syntax checks for modified JavaScript: PASS.
- `npm run test:commerce`: an older `commerce-flow.e2e.mjs` stops while packing a store order. The identical failure occurs in the prior `MoveAI-help-desk-2026-10-11.zip` baseline, before these edits. This suite cannot be reported as passing.
- `npm run test:static`: its Node child-process invocation fails with `EPERM` in this workspace; direct screen integration and modified-file syntax checks passed.
- Browser smoke test did not run because Python Playwright and a browser binary are unavailable here. UI interactions were checked through rendered screen assertions and flow-level tests, not an interactive browser session.

## Demo limits and remaining production work

The app remains browser-local. Photos, status changes, Help Desk messages and refund records only sync between role workspaces in the same browser profile. A real launch needs authenticated storage, media access controls, server-side case transitions, courier dispatch, payment-provider refund webhooks and audit records. This package does not process payments, send notifications externally or perform a real image upload.
