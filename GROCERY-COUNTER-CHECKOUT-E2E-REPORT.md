# Walk-in counter checkout: all five improvements

3 October 2026. GitHub Pages browser-storage prototype. All cash, UPI, card, refunds and shift counts are manually recorded mock entries. No actual payment, terminal verification, cash transfer or refund occurs. All role tabs must share one origin and browser profile.

## What changed

| Improvement | Current UI flow | Ledger and stock effect |
|---|---|---|
| Editable cart | Seller/manager can adjust each line quantity or remove it before payment; clear cart is available. | No stock or payment record until review and confirmation. |
| Payment review and confirmation | Cashier selects one or two tenders, enters amounts and UPI/terminal references, then clicks Review payment. The sale is `awaiting_confirmation`; cashier checks actual cash/terminal outside the app and explicitly confirms, or voids with a reason. | Stock is reserved while pending. Confirm consumes it and writes one `customer_payment` entry per tender; void releases it without a payment record. |
| Partial return | On a paid receipt, choose a remaining item/quantity, sellable or damaged, and cash/UPI/card refund with reference for electronic methods. | Refund only that item's allocated paid value. Sellable units return to stock; damaged units do not. Multiple returns cannot exceed the receipt total. |
| Split tender and change | Up to two different methods, e.g. ₹500 cash + ₹266 UPI; cash handed over may exceed the applied cash share and the app displays change. | Applied amounts must equal the discounted total. Each tender has its own ledger entry; change is not revenue. |
| End-of-shift reconciliation | Seller/manager opens a drawer with an opening float, sees expected cash, UPI/card tenders and refunds, then enters counted cash. A difference requires a note. | `counter_shift_reconciliation` entry shows expected, counted and difference. Refunds on later days belong to their current shift. |

The previous single-method `completeCounterSale` function remains for older demo journeys and tests; the visible counter screen uses the new review/confirm path.

## Example to test

1. Open `seller.html` → ABC Grocery → **In-store sale**. Open a shift with ₹2,000 opening cash. Add two rice packs and one salt. Adjust/remove a cart line, then add it back.
2. Choose ₹500 cash and the remaining amount UPI. Enter ₹600 cash handed over and a mock UPI reference. The review screen shows **₹100 change**. Before confirmation, stock is reserved and the sale has no payment ledger entries.
3. Click **Manually confirm payment** after pretending to check the external UPI transaction. The sale becomes paid, the receipt lists both tenders, stock is consumed, and two payment entries appear in seller Sales and admin Grocery Payments.
4. Return only the salt as sellable by UPI with a refund reference. The refund is for salt only and salt stock rises. Return one rice pack as damaged by cash; its stock stays reduced. A second return above the remaining quantity is rejected.
5. Close the shift with a counted cash value ₹20 below expected. Enter a reason; the shift is `closed_with_difference` and the counted/expected values appear in the counter screen and admin ledger.
6. For a decline, make a new card sale, open Review payment, then **Void pending sale** with a reason. The reservation releases and no customer payment entry is created.

## Checks

`npm run test:unit` and `npm run test:commerce` passed. The new counter E2E test covers cart editing, invalid tender sums, split cash/UPI and cash/card, change, reservation, manual confirmation, void, partial item returns, discount rounding, later-shift refund attribution, cash shortage reason and rendered button bindings. Direct syntax checks for every `js/*.js` file and eight static integration scripts passed.

Browser E2E could not run here because the Playwright Chromium executable and Python Playwright package are missing. Check the actual layout and browser storage sync after pushing the package to GitHub Pages.

## Important mock boundary

A typed UPI/card reference and a cashier's Confirm click do not verify payment. In production, use a server-side transaction and terminal/payment-provider confirmation, idempotent sale/refund processing, authenticated cashier and shift identities, real receipt numbering, cash custody, and secure audit records. A void after real funds were collected would need an actual reversal/refund outside this demo. Partial refunds on real split tenders must follow the chosen provider's rules.
