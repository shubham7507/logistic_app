# MoveAI Seller and Store Staff: work schedule, attendance, leave and salary demo

10 October 2026 · UI-only GitHub Pages prototype · mock data and simulated payments

## What was built

- Seller People & pay has **Attendance & leave** with an approval queue, recurring workweek including Saturday/Sunday, shift hours, dated changes, absence decisions and a month-end summary. Owner can simulate month-end in the demo, lock attendance, then post wages and pay in the existing Payroll/Pay workers flow. Branch managers review only their branch; they cannot approve their own attendance/leave or change owner work rules.
- Store Staff **My pay & details** has today's check-in/check-out, leave request (full or half day), a live monthly count, status and history, attendance correction requests, and the existing pay and advance view. Managers can open their own My work & pay view; the Seller app routes them there instead of showing only the wage ledger. Worker notifications are scoped to the selected staff account.
- Worker check-ins remain pending until a store owner or branch manager approves. Owner-marked days notify the worker. Disputed days and pending leave block month lock. Approved paid leave and owner-paid exceptions count as paid days; unpaid leave and confirmed absences do not. Rest days do not count as scheduled days. An owner-recorded shift on a rest day counts as an extra paid shift.
- Monthly base salary uses the worker's scheduled days and approved paid units after the schedule effective date. Per-shift base pay uses paid shifts, without subtracting an absence twice. Existing demo workers without a configured schedule keep the prior calculation until their owner sets one. Month lock is required before earnings post for stores using new schedules. Existing shared advance recovery and cash/UPI/bank payout handling then use the posted ledger.
- Worker mock ID check requires explicit consent and stores only the last four Aadhaar digits in the staff HR record. The owner sees a masked review summary and can confirm a match or request correction. Mock payout changes notify the seller, and the seller screen shows a masked bank destination.

## Worked example

Asha is scheduled Monday–Saturday from 12 October. The worker checks in Monday and the owner approves. Tuesday is approved paid leave; Wednesday is an owner-paid exception; an extra Sunday shift is entered by the owner. At month-end both screens show four paid units (three ordinary paid days plus one extra shift), with the remaining scheduled days unpaid. The owner locks the period, posts earnings, records cash salary, and the worker confirms receipt. The shared balance becomes zero. This is illustrative demo policy, not a production payroll rule.

## Try it after uploading to GitHub Pages

1. Open `seller.html` and select **ABC Grocery**. Go to **People & pay → Attendance & leave**. Choose Asha, choose working days (including Saturday or Sunday if wanted), enter shift hours and save. The default demo workweek is Monday–Friday; change the checkboxes to match the store.
2. Open `picker.html`, select **Asha Picker**, then **My pay & details**. Check the workweek, tap **I'm here today**, or submit a leave request with start/end dates and full/half day.
3. Return to the Seller tab. The attendance or leave appears in **Needs your decision**. Approve it as paid/unpaid or reject it. A branch manager can approve their branch's worker requests. Return to the Staff tab to see the same decision.
4. In Seller, use **Absence decision** for a scheduled day with no approved attendance/leave. A paid exception requires a reason. Review both sides' monthly totals.
5. To test payroll now, use **Advance demo to month end**, resolve pending requests, then **Review and lock month**. Open **Payroll**, post earnings, and use **Pay workers** for mock cash/UPI/bank payment. The worker sees the payslip and payment confirmation in My pay.
6. For masked verification, open a worker's **My pay & details**, enter *test* ID information and consent, then return to Seller **Team by branch** to confirm the mock ID match or request correction. Enter only test payout details; owner sees only the masked destination.

## Automated validation

| Test | Result |
| --- | --- |
| `node tests/staff-attendance-leave.e2e.mjs` | PASS: owner/worker approval, manager branch and self-approval isolation, selected-worker notification isolation, Saturday/Sunday rules, paid and half-day leave, paid absence, extra shift, month lock, salary and cash confirmation, identity review, masked bank change |
| `npm run test:unit` | PASS |
| `node tests/staff-redesign.e2e.mjs` | PASS |
| `node tests/advance-repayment.e2e.mjs` | PASS |
| `node tests/store-hr.unit.mjs` | PASS |
| `node tests/demo-release.e2e.mjs` | PASS |
| `node tests/people-core.unit.mjs` | PASS |
| `node --check` across `js/*.js` | PASS |

The older `grocery-workforce.e2e.mjs` stops at a picker-selection condition in an unrelated order scenario; it is not claimed as passing. The earlier `grocery-staff-payments.e2e.mjs` stops in its order-stage setup. Neither failure was introduced in the new attendance test path, but the broad commerce suite has not been certified as green.

## Production limits

The static apps share only one browser's localStorage. They do not authenticate independent devices or perform real ID verification, Aadhaar OTP, penny drop, notification delivery, bank transfer or compliant payroll. Mock bank inputs may remain in browser state; never use real Aadhaar or bank data. Real deployment needs a shared backend, role-scoped APIs, document vault, payment provider reconciliation, employer-specific leave rules, and a payroll/legal review before real wages are processed. The demo intentionally keeps a locked month immutable; a production correction workflow should create an audited adjustment rather than changing posted wages silently.
