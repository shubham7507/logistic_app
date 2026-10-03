# Grocery UI flow and picker pay report

Date: 3 October 2026 (Singapore). This deliverable is a static front-end prototype with mock state. No backend, authentication service, SMS, payment gateway, bank transfer, or payroll processing was added. Freight and movers were not changed.

## Current role screens

| Role | Entry | Current UI flow |
| --- | --- | --- |
| Customer | `index.html` | Shop → product detail and quantity → add to cart → checkout address/payment/review → My orders and tracking → replacement/removal, cancellation, return and receipt. |
| Grocery seller | `seller.html` | Orders → accept → assign picker or self-pick → inspect checklist → pack and hand over; Team → invite/activate picker and set pay plan; Money → store settlement and Picker Pay. |
| Store picker | `picker.html` | Profile → select demo account and accept invitation; Pick tasks → assigned order checklist and unavailable item; Earnings → start/finish shift and see approved/paid records. |
| Delivery partner | `delivery.html` | Deliveries → offer/accept → pickup code and bag count → customer code → delivered; COD cash handover and delivery earnings. |
| Admin | `admin.html` | Orders, Partners, Payments, Issues. Payments includes read-only store-funded picker pay summary separate from customer payment, COD, seller settlement and courier payout. |

## Picker pay UI delivered

- Active seeded staff: Asha Picker at ABC Grocery has a ₹12,000 monthly plan; Imran Picker at Fresh Mart has a ₹500 daily plan. A newly invited picker receives a pay plan from their seller after accepting the invitation.
- Seller Team: select monthly/daily pay and a positive whole-rupee rate. Once a shift or pay run exists in the current month, changing the plan is blocked in the mock to avoid silently changing accrued pay.
- Picker Earnings: start a shift once per day, finish and submit it, view the plan, shift status, pay runs and recorded external payment reference. Picker cannot approve their own time or pay.
- Seller Picker Pay: approve submitted shifts, prepare a run, enter a signed adjustment with reason, approve the amount, and record a payment made outside MoveAI with method and reference. Duplicate runs and repeat payment records are blocked.
- Daily plan: one approved shift for the date creates one daily rate, regardless of number of orders. Monthly plan: approved shift evidence allows one full monthly base in the mock. Any adjustment is separate and visible.
- Removing a picker releases unfinished pick tasks, closes their open shift as submitted for seller review, and retains final pay records. Store access checks prevent another seller from changing the pay record.
- Picker pay never reduces the customer order total, seller settlement amount or delivery earning ledger. The store funds it separately. Admin observes the status but cannot record the store's payment.

## Manual walkthrough after GitHub Pages upload

1. Extract the ZIP at the repository root and push it; ensure `seller.html`, `picker.html`, `admin.html`, `index.html`, `delivery.html`, `css/`, `js/`, and `.nojekyll` stay together. Use one browser profile on the same origin.
2. On `seller.html#/shopTeam`, review Asha's monthly plan or edit it before any shift is recorded. To test a new picker, invite and accept the account on `picker.html#/pickProfile`, then set its plan in Team.
3. On `picker.html#/pickEarnings`, choose Asha, click **Start shift** then **Finish shift**. The record becomes submitted.
4. On `seller.html#/shopPickerPay`, approve Asha's shift, click **Prepare pay**, optionally enter an adjustment and reason, click **Approve**, then enter a bank/UPI/cash reference and **Record payment**. Verify Asha sees the same total and paid status in Earnings and admin sees it in Payments.
5. Reset demo data to test Imran. Choose Fresh Mart in `seller.html` and Imran in `picker.html`, repeat the shift and pay steps. One approved day produces ₹500. Confirm ABC Grocery cannot view or change Fresh Mart's pay run.
6. Separately place a customer order, assign its pick task and complete delivery. The picker pay record must remain distinct from the customer charge, seller settlement and courier earning.

## Automated checks

- `npm run test:commerce`: PASS. Includes customer and multi-store checkout, seller and courier journeys, staff invitation/assignment, and `grocery-picker-pay.e2e.mjs`: monthly/daily plans, shift review, adjustment, payment record, offboarding, UI button bindings and cross-store boundaries.
- `npm run test:unit`: PASS.
- Syntax check of every `js/*.js`: PASS. All eight static integration scripts run individually: PASS. The `npm run test:static` wrapper has previously encountered a sandbox `spawnSync` EPERM, so those scripts were invoked individually.
- Hosted browser click-through and multi-device testing: outstanding.

## Next UI design work and backend contract

The current grocery mock already shows customer, seller, picker, courier and admin order flows. Before production wiring, design the remaining front-end states for failed/pending payment retry, inventory counts and reservation conflicts, pickup/delivery proof, real-time courier consent/ETA, notification preferences, refund timeline, and picker pay corrections/disputes. The current mock uses basic stock flags and manual courier checkpoints.

A future backend should supply authenticated identity/store membership, atomic order assignment and inventory reservation, payment and refund events, courier dispatch/location, notification delivery, and store-owned staff shifts/payroll records. Keep stable IDs (`orderId`, `storeId`, `pickerId`, `shiftId`, `payRunId`), amounts, statuses and event history in the API. Replace mock storage calls behind the same screen actions. A monthly cutoff and location-specific payroll rules must be defined before real pay processing. GitHub Pages by itself cannot synchronize independent devices or move funds.
