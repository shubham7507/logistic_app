# Monthly payroll: bank, UPI and cash — 11 October 2026

## Implemented
- Seller owners see **Monthly payroll** in Money → Pay workers. For each monthly worker they can choose Bank, UPI or Cash, review earnings and planned advance recovery, and Hold a worker.
- One **Approve payday** action processes mock bank payments and creates waiting items for UPI and cash. The summary separates approved, paid and waiting amounts; skipped, failed and held workers remain visible.
- The owner opens each UPI payment after approval. The app presents the existing mobile UPI deep link or desktop QR. Owner and worker confirmations are both needed before it counts as paid. Approving the batch does not launch multiple payment apps or claim to transfer funds.
- The owner marks cash as physically handed over only after an explicit confirmation. The worker's **My pay & details** confirmation finalizes it. A negative response stays due and is flagged for review.
- An advance instalment reduces the advance balance only after the corresponding salary is confirmed, including cash and UPI. A pending handover blocks a duplicate batch; once resolved, failed or skipped dues can be retried.
- Missing bank details are now shown as **skipped**, matching the actual result, rather than contradictory failed/skipped wording.
- An optional **Load sample payday (3 mock workers)** button adds ₹10,000 bank, ₹8,000 UPI and ₹6,000 cash examples to the current store and month. It is idempotent and is not offered after a payroll has been approved.

## How to test in the UI
1. Open `seller.html` and choose an owner workspace, for example ABC Grocery.
2. Open **Money → Pay workers → Monthly payroll**. Select the current demo month and click **Load sample payday (3 mock workers)**. Do not use Reset demo data after this until testing is finished.
3. Confirm the three demo rows. Choose **Cash** for Demo Cash Worker. Leave the others as Bank and UPI. Click **Approve payday**.
4. The bank line is mock paid. The UPI line shows **Open UPI payment** and the cash line shows **I handed over cash**. The totals distinguish paid from waiting.
5. Click **Open UPI payment**, then open that worker's pay page to mark **Yes, paid**. Switch to the corresponding Store Staff mock account in the same browser profile, open **My pay & details**, and confirm **Yes, received**. Use test details only; the deep link can open a real UPI app.
6. For cash, click **I handed over cash** only after the mock handover. In that worker's Store Staff view, confirm **I received it**. Return to Monthly payroll to see paid ₹24,000 and waiting ₹0.
7. To test missing details, select Bank for the UPI-only worker before approval. That worker is skipped, remains due, and can be paid in a later batch after correction. Hold/resume is available before approval.

## Tests run
- `node tests/mixed-monthly-payroll.e2e.mjs` — passed: mixed approval, status totals, actual cash button binding, no duplicate handover, owner and worker UPI confirmation, worker cash receipt, advance recovery after cash receipt, sample seeding.
- `node tests/staff-redesign.e2e.mjs`, `node tests/staff-flow-repair.e2e.mjs`, `node tests/advance-repayment.e2e.mjs`, `node tests/staff-credentials-review.e2e.mjs`, `node tests/payroll-owner-visibility.e2e.mjs`, `node tests/commerce-screens.integration.mjs` — passed.
- Direct Node syntax checks for `js/app.js`, `js/commerce.js`, and `js/payroll-core.js` — passed.

## Scope and limitation
This is browser-local mock data. No bank batch, bank verification, UPI transfer, or cash movement is executed by MoveAI. The UPI link may launch an external app, but returning from it does not prove the transfer succeeded. Real implementation needs a backend, secure worker payout credentials, a payment provider/bank integration, idempotency keys, asynchronous per-worker results, and reconciliation.
