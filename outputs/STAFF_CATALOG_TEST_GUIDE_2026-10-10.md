# MoveAI staff and catalogue demo — test guide

Date: 10 October 2026. This is a browser-local GitHub Pages prototype. No live bank transfer, CSV server job, identity verification, notification delivery, or cross-device account sync occurs.

## Start here

1. Push the files in the ZIP to your GitHub Pages repository. Open `seller.html` in the same browser profile you will use for the staff and manager screens. The ZIP is a replacement site package, not a Git commit.
2. Choose **ABC Grocery**, **Fresh Mart**, **Sharma Electricals**, or **City Fashion** from the account selector. Open **Staff** and click **Load sample for [store]** once. You can load each seller independently. If you tested an earlier version and have unexpected records, use **Reset demo data** first; it clears the browser demo data.
3. Stay in that browser profile. Open `picker.html` for Store Staff and `seller.html` for Store Manager using their matching account choices. Each role uses the same local browser data. Private/incognito windows and another device have separate data.
4. Return to **Staff** on the seller screen for the step-by-step guide and the same worker's pay link.

## What the sample creates per seller

| Seller | Existing worker | Existing manager | New cover worker | Products added at main branch |
| --- | --- | --- | --- | --- |
| ABC Grocery | Asha Picker | Maya Manager | Kiran Cover | Moong Dal (12), Atta (2, low), Cumin Powder (0) |
| Fresh Mart | Imran Picker | Farah Manager | Neha Cover | Apples (12), Paneer (2, low), Tomatoes (0) |
| Sharma Electricals | Amit Store Staff | Nisha Manager | Deepa Cover | LED Bulb (12), Extension Board (2, low), Screwdriver Set (0) |
| City Fashion | Pooja Store Staff | Ritu Manager | Tara Cover | Cotton T-shirt (12), Linen Shirt (2, low), Denim Jeans (0) |

Each sample also creates a pending worker attendance entry on a recent workday, a pending leave request on a future workday, a published shift, and a manager-submitted ₹1,000 advance request for the existing worker with a ₹250 monthly instalment. The cover worker has a simulated verified bank destination. Existing product records remain in place.

## Role walkthrough

| Role | Screen | Try this | Expected result |
| --- | --- | --- | --- |
| Owner | Staff → Today's work / Attendance & leave | Approve the pending attendance. Approve leave as paid or unpaid. | Worker sees the decision in My work & pay; month summary changes. |
| Manager | Staff, Schedule, Timecards | Review assigned branch worker, published shift, attendance/leave and advance request. | Manager sees branch work; owner controls final payroll and product publishing. |
| Worker | Store Staff → My schedule | Confirm the published shift or Request cover. | Owner/manager Schedule shows the updated shift/cover request. |
| Owner | Schedule | Assign the new cover worker to a requested shift. | Both branch schedule and worker schedule reflect the reassignment. |
| Worker | My work & pay | Check attendance, leave, advance, earnings and payout details. | Same person and amounts are visible from seller Staff / Pay workers. |
| Owner | Pay workers | Review the ₹1,000 advance request and approve or counteroffer. At month end lock attendance, post earnings, review net pay and simulated GIRO/cash/UPI flow. | ₹250 per month is deducted per the approved advance; ledger and worker view match. |
| Owner | Products and stock | Edit one sample price and quantity, pause/resume, filter low stock and sold out. | Product and branch stock update; active in-stock products become available to customers. |
| Owner | Products and stock → Import products from CSV | Download template, edit SKU/name/category/price/quantity, choose CSV, Preview, then Confirm import. | Preview changes nothing; import creates new SKU or updates matching SKU for the selected branch. |
| Manager | Products and stock | Review catalogue and adjust branch stock where the manager has permission. | Product description/price and CSV publishing remain owner-only. |

For GIRO, use **Advance demo to month end** on the owner's Attendance & leave screen, resolve outstanding entries, lock the month, then use Pay workers → Monthly bank payroll. It records simulated statuses only.

## CSV rules

The template's columns are `sku,name,size,category,subcategory,veg_status,price,quantity,low_stock_at,brand,status`. Save UTF-8 CSV. The header order must match; categories must match the app's available seller categories. Status is `draft` or `active`. A quoted field can contain commas or doubled quotes. A new SKU creates a product; a matching SKU updates that store's product. The selected branch receives the quantity. At most 100 rows and 100 KB per file. An invalid row rejects the entire preview/import; importing after switching branches requires another preview. Manual **Publish product** and **Save draft** remain available for a single item.

## Automated checks run

- `npm run test:staff`: passed; attendance, leave, payroll, advance recovery, bank retry, manager scope, branch and shift flows.
- `node tests/staff-catalog-demo.e2e.mjs`: passed; all four seller samples, owner/manager boundaries, cover workers, pending decisions, low/sold-out stock, CSV quoted values, new/update SKU, branch isolation, validation, atomic rollback.
- Focused commerce tests `grouped-seller-cart`, `seller-branches`, `store-operations-enhancements`, `seller-team-all-types`, `commerce-screens.integration`: passed.
- Changed JavaScript files passed `node --check`.
- Full `npm run test:static` did not run to completion: this environment returned `EPERM` when its test runner spawned the Node binary. This is a runner permission issue, not an application assertion.
- Full `npm run test:commerce` stopped at `tests/mixed-marketplace.e2e.mjs:36`, where `pickerAction(...,'start')` returned “This store action is not available at the current stage.” The preceding four commerce tests passed. This existing mixed-order flow needs separate investigation; do not interpret the full commerce suite as green.

## Comparison with established seller tools

Amazon Seller Central supports a direct Add Products path and spreadsheet bulk uploads for many offers; Shopify documents CSV import/export for products and inventory with location-specific stock management. MoveAI follows that familiar pattern at demo scale: owner-friendly single product form, a downloadable CSV template, review before import, and branch stock. Unlike production marketplaces, this package has no server-side import job, processing report, external catalogue matching, or real seller approval pipeline. The 100-row limit is a deliberate browser-demo boundary.
