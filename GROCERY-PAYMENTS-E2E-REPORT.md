# Grocery payments: mock UI flow and E2E report

3 October 2026. This package is a browser storage prototype for GitHub Pages. Payments, refunds, wage payments, fees and payouts are simulated records. An entered UPI or card terminal reference is a manual assertion that a store received the payment; the application cannot verify it.

## Full flow by scenario

| Scenario | Customer / counter | Seller or manager | Picker | Courier | Admin and ledger |
|---|---|---|---|---|---|
| Home delivery, online UPI/card | Select products, checkout, pay in simulated gateway; see receipt and order tracking | Accept, arrange picking, pack | Confirm items | Accept, verify bag/pickup code, deliver with customer code | `customer_payment` held at order, captured at delivery; seller settlement and ₹35 courier earning pending, then admin payout after reserve period |
| Home delivery, COD | Order shows amount due | Accept, pick and pack | Confirm items | Collect cash at drop-off, hand it over in COD cash | `customer_payment` on delivery, `cash_handover`, `cash_reconciliation`, then seller and courier payouts |
| Store pickup, online UPI/card | Pay in checkout; show pickup code | Accept, pick, pack, verify code and hand over | Confirm items | No courier | Held customer payment captured on collection; seller settlement pending |
| Store pickup, cash/UPI/card at store | Place order without charge; pay at collection and show code | Record cash or external UPI/card reference while handing over | Confirm items | No courier | `customer_payment` recorded only at collection; store retains receipt, platform commission due; admin records fee transfer reference |
| Walk-in purchase | Customer brings products to counter | Build cart, collect cash/UPI/card, record reference and receipt | Optional store work only | None | Direct-store `customer_payment` at sale; full return creates `refund_recorded` and stock condition |
| Walk-in customer wants delivery | Give address; pay cash/UPI/card at counter or choose COD | Create delivery order, pick, pack | Confirm items | Deliver with customer code; collect and hand over cash only for COD | Direct-store payment creates fee due at delivery; COD follows cash reconciliation; ₹35 courier earning pending |
| Picker wages | N/A | Approve shift/pay run; record external bank/UPI/cash payment and reference | See pay history | N/A | `picker_wage_payment` ledger record, separate store staff expense |
| Return/cancellation | Request return or cancel before pickup; see refund status | Inspect returned stock | N/A | Completed delivery earning remains tracked | Online refund initiated; store-collected refund recorded externally; due platform fee waived or already-paid fee flagged for adjustment review |

## Role screens

- Customer: Shop → product/cart → Checkout → My orders and Track. Store pickup displays the pickup code and due amount. Online receipt and refund/credit note appear in My orders.
- Seller: Orders, In-store sale, Counter delivery, Sales, Store money, Picker Pay. Store money shows direct payments, refunds, seller settlement and platform fees.
- Manager: Store sales, stock, order packing and pickup payment collection; financial payout controls remain with seller/admin.
- Picker: Pick tasks and My shifts and earnings. Picking does not collect customer payment.
- Delivery partner: Deliveries, COD cash, Earnings. Online and counter-paid orders do not ask Ravi to collect cash.
- Admin: Grocery Payments lists payment ledger entries and pending payout/COD actions. A platform fee due has a manual transfer reference action.

## Automated checks

`npm run test:unit` passed. `npm run test:commerce` passed, including 12 focused payment scenarios: three store pickup methods with delayed collection/refund/fee adjustment; three in-store counter methods and returns; four counter delivery methods through picker and courier; pending online UPI success and failure with stock release. Existing three-product/two-store customer → seller → courier → customer E2E also passed. Eight static integration scripts passed; syntax checks across `js/*.js` passed.

Browser E2E could not run here because Playwright's Chromium executable is absent. The Python smoke runner could not run because the Python Playwright package is absent. These are environment gaps, not passing test results. Manual browser verification on the published GitHub Pages URL is still required, particularly for visual layout and cross-tab storage events.

## Reproduce in one browser profile

1. Open `index.html` and select Personal. Add two grocery products to cart, choose Home delivery and mock UPI `shubham@okaxis`. Place the order; check My orders and receipt.
2. Open `seller.html` on the same origin, accept each store order, assign a picker or self-pick, pack and confirm bag count. Open `picker.html` for assigned tasks if using a picker.
3. Open `delivery.html` as Ravi, accept, collect at the store using its pickup code, then deliver using the customer's delivery code. Check customer tracking, seller Store money, courier Earnings and `admin.html` → Grocery Payments.
4. Repeat with COD. After delivery, use Ravi → COD cash → hand over, then Admin → Payments → reconcile. Advance demo clock for settlement and pay seller/courier.
5. Repeat with Store pickup and select Cash at store, UPI at store, or Card at store. The seller records the amount at collection with the customer code; enter a reference for UPI/card. Inspect Store money and Admin → Payments. For walk-ins, use Seller → In-store sale or Counter delivery.
6. To reset data, use Reset demo data. All role pages must share one origin and browser profile because state is local storage.

## Backend handoff

Before taking real money: server-owned order/stock/payment state; payment service checkout and verified webhooks; idempotent capture/refund; terminal/UPI reconciliation; authenticated role access and audit; COD cash custody; seller and courier payout accounts, dispute handling and accounting exports. Never treat the manual reference or local storage ledger as proof of a real transaction. The prototype does not perform a real payment, bank settlement or picker payroll.
