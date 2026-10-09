# MoveAI Staff redesign — implementation and test report

Date: 9 October 2026. Scope: static GitHub Pages demo with browser-local mock state. No backend or real payment verification.

## Implemented in this package

| Area | Result |
| --- | --- |
| Guided Staff home | Four primary actions: Add worker, Today's work, Pay workers, Branches & team. Voice text is reviewed and routes to the pay form; it does not disburse money. Manager cannot use the owner invite action. |
| Store Team | Focused on the order-preparation roster. Worker invitation and staff pay are linked from Staff. The owner can still invite a branch manager from this roster. |
| Pay workers | One business/branch-filtered summary reads the shared payroll balance. Each worker opens one detailed history; owner actions live there. Managers can view their branch but cannot pay or approve. |
| Worker My pay | Store staff read the shared payroll history and advance balance, including pending cash/UPI confirmations. Managers can view and confirm their own wage receipts separately from their branch oversight. |
| Cash wages | A cash handover remains pending until the worker confirms receipt. A dispute leaves the amount due. Overpayment and a second payment during a pending handover are blocked. |
| UPI | The existing intent/QR flow remains pending until both sides confirm in the demo. The owner action is checked against the selected business and active employment. |
| Monthly pay | Current-month attendance earnings can be posted from the payroll page. Reopening a draft refreshes its due amounts while preserving holds; repeated preparation uses the same draft. Historical months without a saved run do not create a draft from today's balance. |
| Branches and teams | Store Team branch changes update the shared employment cover and Store HR data. Home branch removal goes through a transfer. Cross-business and inactive team members are rejected. |
| Offboarding | Final exit checks open work, shifts, corrections, pay runs, pending wage confirmations, final balance and advances; shared employment status/history is updated on access removal and completion. |
| Navigation | Staff replaces Staff (easy); duplicate pay entry points are removed from the primary seller navigation. Picker navigation has My tasks, My schedule, My pay and Profile. Legacy detailed routes remain available where linked. |

## Validation performed

- **PASS:** `npm run test:unit` (project unit suite).
- **PASS:** `node tests/staff-redesign.e2e.mjs` (guided routes, branch and team isolation, manager guard, cash acknowledgment, overpayment, worker ledger, offboarding due, and idempotent payroll draft).
- **PASS:** `node tests/demo-release.e2e.mjs` (existing multi-seller, staff onboarding, delivery and two-sided UPI journey, updated to include earned wages before payment).
- **PASS:** `node tests/people-core.unit.mjs`, `node tests/store-hr.unit.mjs`, `node tests/seller-team-all-types.e2e.mjs`.
- **PASS:** syntax check for every `js/*.js` file.

The full `test:commerce` chain still stops at `mixed-marketplace.e2e.mjs:36`. The same assertion fails against the original input ZIP before these changes; it is an existing scenario mismatch. The old `easy-mode.unit`, `ledger-core.unit` and `worker-hub.unit` tests also fail on the original input package. `test:static` invokes a child Node process and this sandbox returned `EPERM`; the individual JavaScript syntax checks passed. No manual browser click-through was possible in this run.

## Validation still required before marking the 82-case workbook complete

The previously delivered workbook remains a planned validation baseline, not a claim that all 82 cases passed. Full voice/Hindi usability, dated cross-branch coverage, notification deep links, richer attendance disputes, failed-payment retries, payroll for all logistics roles, and every old route's visual behavior need further implementation or hands-on review. The backend-later cases require real authentication, cross-device state, and provider callbacks. Do not transfer real money using the demo UPI intent during testing.

## Try it on GitHub Pages

Extract the ZIP contents at the repository's Pages root and push them. Open `index.html` for the customer side, `seller.html` for the seller and manager workspaces, and `picker.html` for the worker. In a seller workspace choose **Staff**. Use the matching role switcher accounts and one browser profile to share mock records. The **Reset demo data** control restores the seed data.

## GIRO payroll restoration (9 October 2026)

The guided redesign hid the earlier bank batch entry in Store Team and omitted `monthlyPayroll` from retail owner route permissions. Owners now see **GIRO payroll** in the sidebar, **Pay workers**, and **Store Team**. Managers cannot submit a batch. The page explicitly shows monthly workers across all branches, bank-ready amount, missing bank details, holds, individual results, and earlier runs. A completed run with remaining dues can prepare a fresh batch; the previous result stays in history. Cash/UPI and advances remain individual actions in Pay workers.

**Validated:** retail owner access and manager denial; failed payout leaves the same due balance; correcting the mock bank account and preparing a second batch pays once; worker history and owner balance agree; previous batch remains visible. `node tests/staff-redesign.e2e.mjs`, `node tests/demo-release.e2e.mjs`, `npm run test:unit`, `node tests/store-hr.unit.mjs`, `node tests/people-core.unit.mjs`, and direct `node --check` across all `js/*.js` passed. The static suite's child-process syntax runner still reports sandbox `EPERM`, so it was not counted as passing. Batch submission remains a simulated bank transfer and requires a verified bank account; it does not initiate actual GIRO or UPI.

## Worker advance and monthly recovery (9 October 2026)

The owner and worker now use one advance balance. A worker can request an amount and monthly repayment, the owner can offer a different plan, and the worker accepts or declines before the owner releases funds. Cash becomes active only after the worker confirms receipt. A UPI handoff stays pending until owner and worker both confirm; the demo opens a UPI intent or QR, but it cannot verify an actual bank transfer. A failed bank transfer leaves the request pending.

The pay screen shows earned wages, this month's repayment, take-home amount, each advance's remaining balance and instalment, and the shared payment history. The owner can pay monthly wages individually by cash, UPI or mock bank transfer, or submit eligible bank payments in a GIRO style batch. Repayment is posted only when the payment succeeds or a cash/UPI handoff is confirmed. An instalment cannot be posted twice for the same advance and month. Failed GIRO lines can be retried in another batch without paying successful lines again. The older logistics payroll also rolls back staged salary accrual and loan repayment on bank failure, and retries the failed line.

| Scenario | Expected result | Result |
| --- | --- | --- |
| Worker asks ₹3,000/₹1,000; owner offers ₹2,400/₹800; worker accepts | Pending owner approval at agreed terms | PASS |
| Owner releases cash advance; worker has not acknowledged | No active debt yet | PASS |
| Worker acknowledges cash and earns ₹10,000 | ₹800 recovery planned; ₹9,200 take-home; ₹2,400 initial debt | PASS |
| Worker says salary cash was not received | ₹10,000 remains due; advance still ₹2,400 | PASS |
| Owner retries and worker confirms cash | Salary due ₹0; advance ₹1,600; one recovery event | PASS |
| Same month's pay is opened again | No second recovery | PASS |
| Mock bank rejects GIRO; owner updates bank and retries | No debt change on failure; ₹9,000 pay and ₹1,000 repayment on retry | PASS |
| UPI advance request before/after account verification | Pending until both confirmations; source and shared ledger agree | PASS |
| Older logistics payroll bank failure and retry | Salary accrual and advance unchanged until successful retry | PASS |
| Another seller views this worker's pay | No cross-seller wages shown | PASS |

**Verification:** `npm run test:unit`, `node tests/advance-repayment.e2e.mjs`, `node tests/staff-redesign.e2e.mjs`, `node tests/demo-release.e2e.mjs`, `node tests/store-hr.unit.mjs`, and `node tests/workforce.unit.mjs` passed. The older `grocery-staff-payments.e2e.mjs` fails in its unrelated product-order stage (`This store action is not available at the current stage`); it is not claimed as passing. The demo is browser-local mock data: it does not transfer funds, check external UPI receipts, persist across devices, or perform real payroll compliance. Use test account values only; bank details in this static prototype are stored in browser state.
