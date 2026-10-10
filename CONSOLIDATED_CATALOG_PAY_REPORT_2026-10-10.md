# Seller catalogue and staff pay consolidation · 10 October 2026

## Delivered

| Area | Seller-facing result | Shared mock record |
| --- | --- | --- |
| Catalogue | One **Products** entry for grocery, fresh grocery, electrical and fashion sellers and managers. The old `#/plusListings` bookmark opens `#/shopCatalog`. | One `products` array and each product's `branchStock`. |
| Add and import | Add or draft one product, use voice draft, or download a CSV template and preview its changes before confirmation. The old second, text-box CSV uploader is removed from the seller flow. | SKU matching and selected branch are checked by the existing CSV preview/commit code. |
| Listing details | Product choices in the same Products screen expose MRP, tax, category details, images and approval status. Owner edits use the existing listing workflow; products marked pending or needing changes are visible to admin. Managers can view details. | Existing listing approval and product record. |
| Stock | Basic counts, adjustments, low stock and dated batch receiving share the selected branch. Receiving and expiry write-off update the branch and overall totals and add a movement record. | `branchStock`, `quantity`, `batches`, `stockMovements`. |
| Worker pay | Store money now opens **Pay workers**. The old `#/shopPickerPay` bookmark opens `#/staffPay`. **Staff → Pay workers** and **People & pay** use the existing employment and payroll records. | `employments`, advance requests, pay events and payroll ledger. |
| Usability | Product shortcuts, readable entry fields, product selection cards and a branch-specific receive form. | All changes persist in the same browser profile's demo state. |

The old helper modules remain in the code for existing compatibility tests, but the seller-facing entry points use the consolidated screens. This package is a browser-local prototype; there is no backend, real payment transfer, or cross-device sync.

## Try it with mock data

1. Open `seller.html` after serving or publishing the package. Use the role switcher for **ABC Grocery**, **Fresh Mart**, **Sharma Electricals** or **City Fashion**. In **Staff**, click **Load sample** once. This creates sample staff, attendance, leave, advance and three products for that seller.
2. Open **Products**. Choose a branch under **Branches**. Change a product price or stock; open the customer workspace in the same browser profile to see its current listing. Return to **Products** and use **Listing details** for MRP, attributes and approval status. For grocery, use **Receive dated stock** and check that only that branch's stock rises. Try CSV template → choose file → Preview → Confirm.
3. Open **Staff → Pay workers** and the worker's details. Review the sample advance request in **People & pay**. Record a mock payout and view its history in the worker workspace. **Money → Pay workers** reaches the same screen. The GIRO batch is simulated.
4. To test old bookmarks, navigate to `seller.html#/plusListings` and `seller.html#/shopPickerPay`; both should switch to the new routes for seller workspaces. Reset demo data in the sidebar if starting over.

## Verification

| Check | Result |
| --- | --- |
| Focused consolidated catalogue/pay test across four sellers | Pass |
| Staff and catalogue mock data, CSV preview/add/update and branch isolation | Pass |
| Staff redesign, ledger, cash acknowledgment and monthly payroll retry | Pass |
| Commerce Plus catalogue, checkout, claims and admin unit scenarios | Pass |
| Seller/delivery/admin route integration | Pass |
| Syntax checks for changed JavaScript files | Pass |
| Full staff suite | Pass |

`npm run test:commerce` still stops in `mixed-marketplace.e2e.mjs`: its old checkout helper expects an online order to be accepted immediately, while the current gateway demo leaves that order `payment_pending` until the customer confirms payment. The same failure reproduces in the prior ZIP before this work. Other old commerce tests also contain outdated route labels or payment assumptions. `npm run test:static` cannot run its first child-process syntax runner in this sandbox (`spawnSync ... EPERM`), so the changed files were checked directly with `node --check` and the seller screen integration test ran separately. These are **unresolved test-suite limitations**, not claims of a full green end-to-end suite.

## Deploy

Copy the extracted contents into the repository's GitHub Pages publishing directory, commit and push. Keep the `js`, `css`, and HTML files together. Open the published `seller.html` in the same browser profile as customer and worker workspaces when checking shared mock state. A fresh browser or another device starts with its own demo data.
