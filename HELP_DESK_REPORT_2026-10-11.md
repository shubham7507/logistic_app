# MoveAI Help Desk · UI demo and scenario validation

## Delivered

A shared Help page is available in every role menu. Customers can also open Help from each package in My orders and tracking; sellers and couriers can open it from their package cards. The Admin menu now distinguishes **Help Desk** from the earlier **Operations cases** area.

A case stores a number, requester, issue type, linked visible record, support owner, priority, status, reply thread, event history and optional **filename only**. The browser demo does not upload or retain file bytes. Speech input uses browser speech recognition where supported, otherwise users type. Admin has filters, linked order/payment summary, assignment, private investigation notes and a decision form. Staff employment issues route to the relevant seller owner/manager (or the logistics business owner); platform handles payouts, delivery disputes and access issues. Safety reports are in a separate urgent queue with clear advice to contact local emergency services for immediate danger.

The requester can appeal a resolved or rejected case. A duplicate active case from the same requester and issue opens the existing case; different reports about the same incident are linked for Admin while their private details remain role scoped. Cases without a timely response escalate on the next app load (15 minutes urgent, 30 minutes time-sensitive, 24 hours normal in this demo). Admin's **Demo: check after 25 hours** exercises this without waiting.

Courier **Report problem** at pickup creates a linked Help Desk case for store delay, missing package, oversized load or blocked route. Resolving the route problem resolves that case. An unresolved delivery issue after a failed attempt also opens a case. Automatic reattempts that have already resumed delivery do not create a support case. Case decisions only record the support outcome; refunds, COD reconciliation, salary corrections and order changes still require their existing dedicated actions.

## Scenarios and owners

| Situation | Route | Expected visible outcome |
| --- | --- | --- |
| Customer missing/wrong/damaged item | Exact package → Help | Platform case; relevant store can supply picking evidence; other stores cannot see it |
| Delivered but not received, late or disputed | Exact package → Help | Platform review; direct courier chat remains closed after completion |
| Seller courier pickup delay | Seller order → Help | Delivery operations case linked to package |
| Courier missing package, delay, oversized, blocked route | Report problem on active delivery | Automatic case and Admin alert; package pickup stays blocked until route issue is resolved |
| Customer unreachable, wrong address, COD refusal, damage | Courier delivery issue | Existing reattempt or failed-delivery action; unresolved issue creates support case |
| Picker attendance, shift, leave, advance or pay | Staff → Help | Store owner/manager case; unrelated stores and workers cannot see it |
| Logistics staff salary or work | Business Staff → Help | Owning business case |
| Courier COD, wallet or payout | Delivery → Help | Platform payments case; another courier cannot see it |
| Seller catalog, stock, CSV, branch or payout | Seller → Help | Catalog or platform support case |
| Safety, threat, accident, compromised account | Help → urgent safety option | Urgent case and explicit immediate-danger instruction |
| Decision disputed | Case → Appeal | Platform escalation with requester reason and earlier history |
| No response | Reopen app later or use Admin demo time check | Overdue case moves to platform review; safety stays in safety queue |
| No matching order/payment ID | Account/payment/general category | Case can be filed without a record; order-specific issues require selection to avoid wrong-package action |
| Unable to log in | Existing sign-in/account recovery screen | Help Desk requires an authenticated demo workspace; no unverified public case is created |

## Try it yourself

1. In **Admin → Help Desk**, select **Load mock help cases** once. This creates customer, seller product, picker attendance, courier COD and safety examples. Open each case to inspect its linked record and history.
2. In the customer app, use **Orders → Get help with this package**. Choose a problem, describe it and submit. Switch to **Seller → Help** to add evidence for that store's item complaint, then **Admin → Help Desk** to review and resolve it. Return to the customer case to appeal or reply.
3. In Store Staff, open **Help** for a shift, attendance, leave, advance or salary problem. The corresponding seller owner/manager sees it in Help and can respond. A different store does not.
4. In Delivery, report a pickup problem on an accepted package. Admin sees the linked case and route issue; resolving the route issue closes the support case. **Delivery → Help** also supports a mock COD payout dispute.
5. In Admin, filter urgent or escalated cases, save an internal note, assign a team, request information or record a decision. Try **Demo: check after 25 hours** to escalate open cases.

Use one browser profile for all role switching. Separate devices or incognito profiles do not share local mock state. Do not upload real IDs, bank details or sensitive documents. The file picker stores a filename only, speech input depends on browser support, and real agents, calls, notifications, refunds and evidence storage require a backend.

## Verification

Passed with mock state: `tests/help-desk.e2e.mjs` (navigation across 24 roles, record selection, role privacy, duplicate and linked cases, store evidence, staff and courier routing, safety, filters, assignment, internal notes, decisions, appeals and no money mutation), `tests/delivery-route-contact.e2e.mjs`, `tests/config.unit.mjs`, `tests/p0-static.integration.mjs`, `tests/p2-screens.integration.mjs`, `tests/p4-screens.integration.mjs`, `tests/commerce-screens.integration.mjs`, `tests/grouped-seller-cart.e2e.mjs`, `tests/shop-ui-flow.integration.mjs`, `tests/geo-notify.unit.mjs`, `tests/delivery-money-flow.e2e.mjs`, and `tests/delivery-wallet-onboarding.e2e.mjs`. Direct syntax checks passed for the edited JS modules.

This was state and HTML-render integration testing, not a live browser click-through on the deployed GitHub Pages site. The older `commerce-flow.e2e.mjs` is still stale against the current seller picking/packing workflow, and the sandbox blocks the child process used by `syntax.static.mjs`; direct `node --check` succeeded instead. The package is ready to push, but the GitHub Pages link updates only after you push and Pages finishes deploying.
