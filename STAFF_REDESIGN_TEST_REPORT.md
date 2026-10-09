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
