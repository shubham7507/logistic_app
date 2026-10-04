# Branch, staff, product and pay demo report

## Delivered

- Seller and manager **Branches** tabs for ABC Grocery, Fresh Mart, Sharma Electricals and City Fashion. Each has Karol Bagh/Delhi and Noida sample branches. Owners can add branches, switch branches and close a branch to new orders.
- Seller **Team** assigns fulfilment workers and managers to branches. Worker **Profile** chooses an assigned branch for shifts. **Orders** shows named staff at the routed branch, with direct assignment and on-shift automatic offers. Sellers may prepare an order themselves.
- **Products** shows branch stock, low-stock counts, price, brand, SKU and description. Sellers can publish drafts, edit prices/details and adjust stock for the selected branch. Category and dietary fields adapt to electrical and clothing products. Customer orders route to one open branch per seller that can fulfil all of its lines. The delivery job shows that branch's pickup address.
- **Staff pay** gives a step-by-step path: set daily/monthly rate, worker submits shift, seller/manager approves, owner prepares pay, reviews adjustments, approves, and records payment proof. Pay runs show branch allocations. Mock ledger records confirmed external cash, UPI, bank or card payout references. No payment is sent by this static app.
- Demo guide includes branch setup and staff pay walkthrough.

## Checks run

| Check | Result |
|---|---|
| JavaScript syntax, all `js/*.js` | Passed |
| `npm run test:unit` | Passed |
| `npm run test:commerce` | Passed, including new four-seller branch test and existing order-to-delivery, COD, inventory, staff and payment scenarios |
| Screen integration tests (eight scripts) | Passed |
| `npm run test:static` | Blocked at its subprocess based syntax check (`spawnSync node EPERM` in this environment); equivalent direct syntax checks and remaining screen scripts passed |
| `npm run test:e2e` Playwright browser suite | Not run successfully: Chromium headless shell executable is missing in this environment |
| Manual browser click-through of modified files | Unavailable: browser rejected local file navigation and local HTTP listener was denied by sandbox |

The automated mock role tests do not prove that real bank/UPI/card transfers, notifications across devices, concurrent inventory updates or secure account isolation work. Those require a backend. The GitHub Pages demo persists to browser local storage in one profile.

## Try it after copying the package to GitHub Pages

1. Use one browser profile and select **Seller → Sharma Electricals → Branches → Noida**. In **Products**, publish an electrical item and set Noida stock. In **Team**, attach the named worker to Noida.
2. As Customer, add the product to cart and check out with a Noida address. Return to Seller **Orders** in the Noida branch, accept, and assign the worker.
3. Switch to the matching **Store Staff** role; select the invited/assigned account, accept its task, confirm each item and complete picking. Seller packs.
4. Switch to **Delivery** as Ravi, accept, enter seller pickup code, collect, and enter customer delivery code. Check **My orders** and Admin **Orders/Payments**.
5. For pay: set a plan in Seller **Team**, start and submit a worker shift in **Earnings**, approve in Seller **Staff pay**, prepare and approve pay, then record an external reference. Check the staff pay history and admin ledger.

## Follow-up for production

A server needs authenticated role/branch membership, transactional stock reservations, distributed event notifications, audited payroll and payment integrations, verified webhooks, refunds and reconciliation. The current UI is a mock prototype.

## Seller-grouped cart update (4 October 2026)

- Customer cart now displays one card for each seller, containing that seller's product quantities, item subtotal, delivery fee and package total. A separate summary displays one combined checkout amount and package count. The layout stacks cards and summary on smaller screens.
- Checkout repeats each seller's items, delivery charge and package total before the single payment action.
- After checkout, My orders shows a shared checkout summary with a separate order card for every seller. Each card and tracking screen labels its seller and its position among the packages. Sellers still see only their own order.
- The screenshot example was checked with Fortune Chakki Atta (₹485 + ₹40 delivery), LED Bulb 9 W (₹120 + ₹40) and Everyday Basmati Rice (₹650 + free delivery): one ₹1,335 checkout, three seller orders, and separate tracking.
- Tests: `node tests/grouped-seller-cart.e2e.mjs`, `npm run test:commerce`, `npm run test:unit`, all JavaScript syntax checks, and seller/delivery/admin screen integration passed.
- Live browser click-through remains unverified in this execution environment because its browser runner is unavailable. Payments and cross-device sync remain simulated pending a backend.
