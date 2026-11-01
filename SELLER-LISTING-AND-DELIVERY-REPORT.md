# Seller listing and delivery — 1 November 2026

Two changes: **(1)** new sellers can list products (bug fix plus marketplace listing checks), and **(2)** step 5 "How orders reach customers" is redesigned after comparing Amazon, Grab and Lazada.

# Part 1 — Product listing by new sellers

## The bug
A seller who joined through "Sell products" got a live store, but **Products and stock** had no "Add product" form and no CSV import. Saving a product was refused with "Store owner access required".

**Cause:** the catalogue module (`js/grocery-inventory.js`) decided who is a store owner using a fixed list of the four demo stores (`grocery`, `groceryFresh`, `electrical`, `fashion`). Stores created at runtime (`shopXXXXX`) were never treated as owners. The category rules were tied to the same four names. Two more fixed lists had the same problem: store tools in `js/commerce-plus.js`, and branches and hiring in `js/people-core.js`.

**Fix:** all three now use the live store registry in `js/seller-roles.js`, so any store created through onboarding is treated exactly like a built-in one.

## How listing works now (new seller)
1. Store owner → **Products and stock**.
2. A banner shows **"You can list in: …"** with the approved categories, and **"Locked until approved: …"** with a link to Seller applications to add the missing licence.
3. **Add product:** name, pack size, category (only approved categories are offered), dietary label, **MRP on pack**, selling price, stock at this branch and low-stock alert. Optional details: brand, description, SKU and photo.
4. Checks:
   - **MRP is required** for packaged goods; loose fresh produce has no printed MRP.
   - **Price must not be above MRP.**
   - **Restricted items** are blocked (medicines, alcohol, tobacco, firecrackers…). This is the same list used during onboarding, now shared in `grocery-categories.js`.
   - **Duplicate** name + pack size is refused.
   - Saving as a draft is allowed.
5. Published products in approved categories go **live for customers immediately**. Onboarding products in a locked category show **"locked — awaiting category approval"**.
6. **CSV import** works for the new store. The template uses one of the store's approved categories and has an optional `mrp` column. Old files without `mrp` still import (new stores still need MRP for packaged goods).
7. When brand papers or FSSAI are approved later, the store can list in those categories straight away.

Demo stores keep their old behaviour (MRP optional, same category rules).

## Tests
| Command | Result |
| --- | --- |
| `node tests/seller-listing.unit.mjs` (8 scenarios: the bug, approved categories only, MRP/price/restricted/duplicate checks, fresh produce, editing, CSV import, unlock after licence approval, demo stores unchanged) | PASS |
| `node tests/onboarding-flows.e2e.cjs` (now also: new store adds a product in the browser, price above MRP refused, new product visible in the customer shop) | PASS |
| Full suite compared before and after this change | Same 23 pre-existing failures before and after, first error identical; no new failures |

## Still needed on the server
1. A **catalogue service** with a listing review queue: automatic checks first (restricted words, MRP, images, duplicates against a master catalogue), with human review only for flagged items.
2. A **master catalogue match** ("this product already exists — sell yours"), like Amazon's listing match, so customers see one product page with several sellers.
3. **Photo upload** to object storage with image checks, replacing the photo URL field.
4. **Request a new category** after going live (for example a grocery store asking to add electricals), with the licence upload.
5. Legal Metrology fields for packaged goods: manufacturer/packer, net quantity, country of origin, best-before. Confirm with a lawyer.
6. HSN code and GST rate per product for invoices.

# Part 2 — Delivery settings (step 5 and Store setup → Delivery)

## Before
- Three bare labels (MoveAI couriers, own delivery, store pickup) with "MoveAI couriers" effectively the default, and only one could be chosen.
- No cost, COD, pickup time, packaging or coverage information.
- Coverage checked by city name.
- Step chips read 1, 2, 4, 5… when the licence step was hidden.
- The header said "Register a business · Business setup".

## Now
**Option cards** for each mode, each showing who packs, who delivers, the cost to the seller (worked example from the rate card) and how COD works. **Nothing is preselected.**

**Several modes at once:**
- Own delivery up to N km, with MoveAI couriers beyond that (N must be below the delivery area).
- Store pickup can be switched on alongside either.

**Details asked for each mode chosen:**
| Mode | Asked |
|---|---|
| MoveAI couriers | Rider pickup or drop-off at the nearest MoveAI hub (Lazada-style); pickup windows; largest parcel; COD on/off with limit and fee example; packaging confirmation; open-box check for electricals |
| Own delivery | Distance, customer fee, free-delivery threshold, minimum order, promised time, whether staff collect COD |
| Store pickup | Preparation time (Grab-style), customer instructions |

**Coverage by pincode.** Step 4 now asks for the store pincode. Step 5 shows whether couriers cover it, the delivery speed (same day / next day) and the nearest hub.

**Category rules:**
- Fresh food needs same-day delivery, so couriers are refused where only next-day is available and the store sells only fresh food.
- Electricals get a tip about couriers, plus the open-box check.

**Store setup → Delivery** (after going live):
- Shows the current settings.
- The seller sends a change; MoveAI approves or declines it with a reason in **Admin → Seller onboarding review → Delivery change requests**.
- The seller is notified either way. Demo stores can set up delivery here too.

**Checkout follows the settings:**
- Home delivery is refused for pickup-only stores.
- Pickup is refused when the store turned pickup off.
- COD is refused when no chosen mode accepts cash.

**Also fixed:**
- Step chips and the header count only the steps shown ("Step 3 of 7").
- The workspace header reads **Sell on MoveAI · Seller application** on seller pages.
- Demo labels ("Mock user", "Reset demo data") are hidden with `?demo=off`. Share the deployed link with `?demo=off` for real demos.

**Related clean-up:**
- One product category grouping is now shared by the catalogue and Store setup (`productGroup` in `grocery-categories.js`). This fixes dry fruits counting as "fresh" and shoe care counting as "fashion".
- The onboarding fresh category is now "Fresh food (fruit, vegetables, dairy, bakery)". Sellers without GST may list only loose fruit and vegetables.

## New files
- `js/seller-delivery.js`: the rules (coverage, rate card, validation, summary), the form, Store setup panel and admin review.
- `tests/seller-delivery.unit.mjs`: coverage, rate card, every validation rule, combined modes, category rules, checkout rules, step numbering, and change requests with review.

## Tests
| Command | Result |
| --- | --- |
| `node tests/seller-delivery.unit.mjs` | PASS |
| `node tests/seller-listing.unit.mjs`, `node tests/seller-onboarding.unit.mjs` | PASS |
| `node tests/onboarding-flows.e2e.cjs` (now also: step 5 header and numbering, nothing preselected, validation, details open per mode; Store setup change → admin approval → home delivery allowed at checkout; chips 1–7 when no licence step) | PASS |
| Full suite before vs after | Same 23 pre-existing failures, first error identical; no new failures |

## Still needed on the server
1. Pincode serviceability, rates and hub lists from the **dispatch/pricing service**, not constants.
2. Dispatch honours the plan: own-delivery zone first, couriers beyond, no courier offers for pickup-only stores, and pickup slots booked against rider capacity.
3. COD float limits per seller and settlement timing in the ledger.
4. Late-handover tracking and seller performance scores (Lazada-style penalties, if wanted).
5. Customer-distance check at checkout once addresses are geocoded (own-delivery radius, minimum order, delivery fee).
