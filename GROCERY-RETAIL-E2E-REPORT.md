# Grocery catalogue and walk-in sales: implementation and test report

3 October 2026 · Static GitHub Pages UI with mock state.

## What changed

| Role | Screen | Actions |
| --- | --- | --- |
| Seller owner | Products, In-store sale, Counter delivery, Sales, Orders | Add/edit product and price, set pack-specific count and low-stock level, pause/resume, record stock reason, make counter sales/refunds, create COD delivery, prepare pickup. |
| Active store manager | Products, In-store sale, Counter delivery, Sales, Orders | Adjust stock, pause/resume, sell at counter, record return, prepare pickup; cannot change catalogue price or create product. |
| Picker | Pick tasks | Existing assigned checklist and unavailable-item report for online/pickup/counter-delivery orders. |
| Customer | Shop, Cart, Checkout, Orders, Tracking | See published products and current price; accept changed cart price; choose home delivery or prepaid store pickup; show pickup code; see Collected. Counter-created delivery appears only when explicitly linked to this mock account. |
| Delivery partner | Deliveries | Existing offer, store pickup code/bag verification and customer code for delivery orders. Store pickup creates no courier job. |
| Admin | Partners, Payments, Orders | Read cross-store low-stock and counter sales status, payment records and order history. |

## Inventory rules in this demo

Each product/pack is a separate row. **Available = on hand − committed to open orders − safety buffer**. Online checkout reserves quantities after validation; placing items in a cart does not reserve stock. Delivery or store collection consumes the reservation and on-hand count. Cancellation or failed payment releases it. Counter sale checks availability again and deducts on hand. Store edits cannot lower stock below committed units. Low-stock alerts fire on crossing the product threshold; an estimated days-left value uses recent seven-day mock sales. Price edits affect future purchases; existing orders preserve item names, prices and totals. Cart price changes require the customer to accept the new current price. Counter discounts are kept on the receipt, without changing the catalogue price.

## Tested user journeys

1. Owner publishes a new milk product and changes its price; customer Shop and Cart show the change, checkout asks for review, and the placed order has a price snapshot.
2. Customer chooses store pickup and pays in the mock checkout; stock is committed, manager accepts, picker confirms every item, manager packs, no Ravi job is offered, customer sees pickup code, manager enters it and status becomes Collected. Admin sees the record. A return and sellable restock are tested.
3. Manager creates a walk-in cart and takes mock cash payment; the receipt contains items, discount and total; shared stock decreases. A damaged return records a mock refund without restocking. Another store cannot return this receipt.
4. An online order commits the last units; an oversized counter sale and destructive stock correction are rejected. Cancelling the online order releases stock. Expired-stock adjustment crosses a low-stock threshold and alerts both owner and active manager; receiving stock replenishes it.
5. Manager creates a counter COD delivery. Seller/manager accepts and assigns Asha, picker confirms items, store packs, Ravi accepts and verifies pickup and delivery codes, and admin sees Delivered. An unlinked walk-in customer's order is hidden from the current customer account; an explicitly linked mock order appears there.
6. Route access and visible screens were checked for seller, manager, picker and admin. Simulated UI button clicks for product creation and in-store checkout exercised `Commerce.bind` and saved/rendered state.

## Verification

- `npm run test:commerce`: **PASS**, nine suites including the new `tests/grocery-retail.e2e.mjs`.
- `npm run test:unit`: **PASS**, 17 scripts, 18 roles and 140 routes.
- All `js/*.js` passed individual `node --check`; eight screen/static integration scripts passed individually.
- `npm run test:static` cannot run its child-node syntax wrapper under this sandbox (`spawnSync EPERM`); its individual equivalent checks passed. No interactive browser/device clickthrough was available. Check visual layout and touch interactions in a published browser.

## Manual GitHub Pages check

Upload the ZIP contents with `index.html` in the branch root. Use one origin and browser profile; reset demo data if prior state conflicts. In Seller → Products add a product with 10 units and alert at 3; in Customer → Shop verify price, add two, change the price in Seller, and accept the updated cart total. Place one store-pickup order, complete picker and manager handoff, then make a walk-in sale and a return. Repeat with Counter delivery and Ravi. In Admin → Partners/Payments verify the store summaries and records. Use Fresh Mart to verify store isolation.

## Prototype boundaries

These simulated cash, UPI, card, refunds and settlements do not move funds. Counter delivery in this version is COD only, capped at ₹5,000. Counter returns are full-receipt; exchange is a return followed by a new sale. A barcode can be typed or scanned by a keyboard-style scanner, but there is no camera integration. Store product photos accept a URL, not uploaded bytes. Local storage cannot coordinate different devices or guarantee atomic stock reservations; backend identity, authenticated customer linking, location-specific inventory, transaction locking, payment integration and durable audit are needed before live use.
