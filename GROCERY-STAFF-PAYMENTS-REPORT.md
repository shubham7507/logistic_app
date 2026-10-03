# Grocery staff payments: UI audit and implementation report

3 October 2026. This is a mock GitHub Pages workflow using browser storage; a recorded payment is a manual assertion, not evidence that money was transferred. Staff payouts are separate from customer checkout, store settlement, and COD cash custody.

## Current role and method map

| Recipient | Payer and screen | Basis | Available mock methods | Recipient view | Ledger |
|---|---|---|---|---|---|
| Store picker | Seller owner → Money → Picker Pay + Manager Pay | Daily or monthly plan; shift approval, pay run review/approval | Bank, UPI, cash, external card payout; reference or signed cash receipt note | Picker → Earnings | `picker_wage_payment`, store expense, `outside_app` |
| Store manager | Seller owner → Money → Picker Pay + Manager Pay | Owner enters monthly amount, prepares and approves one pay run per manager/month | Bank, UPI, cash, external card payout; reference or signed cash receipt note | Manager → Profile → My pay history | `manager_wage_payment`, store expense, `outside_app` |
| Grocery delivery partner | Admin → Grocery Payments on a delivered order | ₹35 per completed delivery in demo policy | Simulated bank payout; external UPI, cash, or card payout with reference | Delivery → Earnings | `delivery_earning`, pending then paid/recorded_paid |
| Seller | Admin → Grocery Payments | Customer order seller settlement after completion and reserve period | Simulated payout to registered bank account | Seller → Money | `seller_settlement`; seller is a partner, not store staff |
| Admin operator | No pay screen | Employment/payroll outside grocery flow | None | None | None |

A card **customer payment** is a charge at checkout or the store counter. A card **staff payout** is an external transfer to a supported recipient card if a future provider supports it. The demo merely records the latter method and a reference; it does not ask for or store a card number.

## Example scenarios

1. Asha works a shift with a ₹12,000 monthly plan. The manager or owner approves her submitted shift; the owner prepares and approves the pay run and records UPI reference `PICK-UPI-001`. Asha sees it in Earnings. Admin sees a store expense entry, but it does not reduce customer receipts or seller settlement.
2. Maya has a ₹25,000 monthly amount. The owner prepares and approves the October run. If paid in cash, the owner records a signed cash receipt note. Maya sees the amount and cash method in Profile. Another store cannot alter it; a second October run is rejected.
3. Ravi delivers an online-paid order. Admin records his ₹35 earning via bank, or records an external UPI/cash/card payout reference. He sees the status and reference in Earnings. If the order was COD, admin must first reconcile the full customer cash handover; Ravi cannot keep ₹35 from COD collections.

## Automated verification

`npm run test:unit` and `npm run test:commerce` passed. The new staff payments E2E suite passed nine method scenarios across manager, picker and delivery partner, including approval gates, missing-reference validation, duplicate prevention, role/store isolation, recipient screens and ledger. All `js/*.js` syntax checks and eight static integration scripts passed. Browser automation was not run because Playwright Chromium and the Python Playwright dependency are unavailable in this workspace.

## Browser walkthrough

1. Use one GitHub Pages origin and browser profile for all roles. Open `seller.html` as ABC Grocery. In Team, set a picker pay plan if needed. On `picker.html` record a shift, then as seller/manager approve it. On seller Money → Picker Pay + Manager Pay, prepare and approve the picker run, select UPI/cash/card payout or bank, and enter a reference.
2. On the same seller screen, set Maya Manager's monthly amount, prepare this month's run, approve and record an external payment. On `seller.html`, switch to the ABC Grocery manager workspace and open Profile to inspect Maya's pay history.
3. Complete a customer → seller → picker → Ravi delivery. On `admin.html` → Grocery Payments, select Ravi's payout method and record the ₹35. On `delivery.html` → Earnings, check method, status and reference. For COD, first complete Ravi's cash handover and admin reconciliation.
4. Reset demo data to repeat with Fresh Mart and its picker/manager. Verify cross-store records remain isolated.

## Production handoff

Set up backend-authenticated staff identity, approval authority, pay period cutoffs, pay calculations, recipient payout accounts, actual provider status/webhooks or signed cash acknowledgements, accounting exports and correction/dispute workflows. Validate a provider's available card payout capability before displaying that choice in a production region. These screens are not a payroll or compliance system.
