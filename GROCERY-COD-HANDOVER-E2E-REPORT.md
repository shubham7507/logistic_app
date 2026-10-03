# COD handover and refund flow: UI demo and test report

3 October 2026. This is a GitHub Pages, browser-storage mock. A button records a claim about cash; it cannot move cash, authenticate a physical cashier, verify a bank transfer, or prove receipt. All roles must use one browser profile and origin to share state.

## Implemented flow

1. Customer chooses COD (up to ₹5,000 in this mock). No charge is made at checkout.
2. Seller accepts and packs, picker confirms items, Ravi accepts and verifies store pickup.
3. Ravi collects the full order total at delivery and enters the customer's delivery code. His COD cash screen shows the amount owed for handover.
4. Ravi enters the amount he says he handed over and the receiving person or desk. This creates a submitted cash-handover ledger entry; it is not reconciled yet. A 24-hour overdue label appears in the courier and admin screens when cash is still collected but not submitted.
5. Admin enters the independent counted amount, receiver and cash receipt reference. A mismatch creates an open discrepancy and blocks both seller and courier payouts. Admin can recount and enter a resolution note. Full counted amount, resolution note after a discrepancy and receipt reference mark the handover verified and cash reconciled.
6. After reconciliation, seller payout follows the existing seven-day reserve and courier earning can be paid. Ravi never deducts ₹35 from customer cash.
7. On an approved COD return, the customer supplies a UPI ID. A `refund_due` ledger record appears to admin. Admin manually records an external transfer reference, moving it to `refund_recorded`. The customer sees both states in My orders. No real refund is sent.

## Example

Order ₹1,420; product commission ₹114; seller amount ₹1,306; courier earning ₹35. Ravi submits ₹1,420 to “MoveAI cash desk”. Admin first counts ₹1,400 and creates a ₹20 discrepancy. Seller and courier payouts remain blocked. Once the missing ₹20 is found and counted, admin enters a reason and a new receipt reference; only then can the order be reconciled. If the approved return occurs afterward, the refund is due to the customer's stated UPI ID and admin records a mock transfer reference.

## Where to test

- `index.html` → Personal → Shop / My orders / Track.
- `seller.html` → Orders to accept and pack. `picker.html` → Pick tasks.
- `delivery.html` → Deliveries → COD cash. Enter the handover amount and receiving desk.
- `admin.html` → Grocery Payments. Count the cash, enter receipt reference, investigate mismatch, then settle/payout. For COD return, record external UPI refund reference.
- Use **Demo: advance 7 days** on Admin → Grocery Payments to expose overdue cash and unlock the settlement reserve. Keep the same browser origin and profile.

## Verification

- `npm run test:unit`: passed.
- `npm run test:commerce`: passed, including the new COD E2E scenario and existing customer/cart/seller/picker/courier tests.
- Direct syntax checks for all `js/*.js`: passed.
- Eight static integration scripts: passed.
- The COD test covers overdue state, required handover details, single submission, admin undercount, discrepancy and payout blocks, resolution, duplicate rejection, seller/courier payouts, COD refund due and manually recorded, and customer/admin screens.
- Browser E2E was not run in this workspace: Playwright Chromium is absent and the Python smoke dependency is not installed. Visual layout and cross-tab interaction need a browser check after deployment.

## Backend requirements

For real operations, add authenticated receiver accounts, signed handover receipts, immutable event history, server time, cash-desk/bank deposit verification, shift closeout, shortage responsibility and resolution policy, and payment-provider or bank confirmation of COD refunds. Browser local storage can be edited and is not financial proof. An overdue badge is calculated when screens load; it is not a background reminder or push notification.
