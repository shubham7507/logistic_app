# Mixed-category marketplace demo and test report

## Implemented

- Seeded Sharma Electricals (LED Bulb 9 W) and City Fashion (Cotton Shirt) as approved seller workspaces alongside grocery stores. Their product catalogue is visible to customers, and sellers can publish or edit products within their assigned categories. Existing grocery picker roles remain specific to grocery stores.
- A single cart and checkout groups products by seller. Every seller gets an independently accepted, packed, tracked, delivered, cancelled, and settled order linked by a shared checkout ID. Each seller package gets its own delivery charge: ₹40 if its item subtotal is under ₹499, otherwise free in this demo. The checkout and cart show this breakdown before payment.
- The seller workspace supports acceptance, seller-led item checks for electrical/clothing orders, packing, and handoff. Delivery partners receive distinct offers with store addresses, pickup codes, customer delivery codes, COD collection and handover. The admin sees all orders and ledger entries. The customer sees an aggregate checkout summary plus individual package tracking.
- Store pickup is limited to a single seller per checkout. Online UPI/card payment is simulated once at checkout and allocated into seller-order ledger records. COD amounts are owed per delivered package.

## Tested

| Journey | Result |
| --- | --- |
| Add rice, bulb, shirt; preview charges and place one checkout | Pass: three seller orders, total ₹1,669 = ₹710 + ₹160 + ₹799 |
| Try mixed-store pickup | Pass: blocked with clear single-seller message |
| Each seller sees only its own order and checks, packs independently | Pass |
| Grocery self-pick and merchant self-check; courier accepts and collects each package | Pass |
| Verify wrong codes fail and correct codes complete delivery | Pass in existing commerce suites; new mixed test covers correct codes |
| Track each package, verify inventory consumed and COD amount per package | Pass |
| Merchant category restriction and publishing a clothing product | Pass |
| Existing grocery commerce and payments workflows | Pass: `npm run test:commerce` |
| General unit suite and route/static integration | Pass: `npm run test:unit`, commerce screens, foundation static integration, direct JS syntax checks |

Run locally from this folder with `npm run test:commerce` and `npm run test:unit`.

## Manual GitHub Pages walkthrough

1. Upload the **contents** of this folder to the publishing root, including `.nojekyll`; open `index.html#/search`.
2. Add **India Gate Basmati Rice**, **LED Bulb 9 W**, and **Cotton Shirt**. Open Cart, inspect each seller's package and delivery amount, then pay using the demo UPI ID shown at checkout or choose COD. Open My Orders.
3. Open `seller.html` in another tab on the **same origin and browser profile**. Switch among ABC Grocery, Sharma Electricals, and City Fashion. For each new order, accept, start checking, mark every item, complete checking, and pack.
4. Open `delivery.html` as Ravi. For each offer, accept and collect using the store pickup code shown on that seller order; then use the customer delivery code shown under My Orders to confirm delivery.
5. Return to My Orders to see each package marked Delivered; inspect `admin.html` for the order and mock payment records. For COD, use Ravi's COD cash screen and the admin cash reconciliation controls.

## Limits

This remains a browser-storage UI demo. Use the same browser and GitHub Pages origin across role tabs; other devices do not share state. It has no backend seller verification, live courier GPS, real charges, real refunds or payouts. The three packages travel as three separate delivery jobs; automated multi-store consolidation and promised arrival windows have not been built. The light bulb and shirt are mock inventory examples, and larger goods need their own delivery rules before being offered.
