# Grocery voice ordering, vegetarian catalogue and automatic picker allocation

3 October 2026 · GitHub Pages browser-storage demo

## Implemented

| Role | Screen | Change |
| --- | --- | --- |
| Customer | Shop products | Speak or type a multi-item list, inspect transcript, disambiguate brand/pack, set quantities, and add reviewed items to cart. Existing checkout confirms fulfilment, total and payment before ordering. |
| Seller | Products and stock | Speak or type a new product and review populated name, size, price, stock, threshold, category, subcategory and dietary status before draft/publish. Speak a price/stock change and choose the exact product before applying. Duplicate pack detection. |
| Seller/manager | In-store sale | Speak or type a walk-in list, review exact SKU and quantity, then add to existing counter cart. Payment review and receipt remain separate. |
| Seller/manager | Store orders | On acceptance, offer the task to the lowest-load on-shift picker at that store (three unfinished tasks maximum). Reassignment remains available; seller may take back an unstarted task for self-picking. |
| Picker | Pick tasks, Home | Accept or decline automatic offer, start checklist after acceptance, toggle break on Home. Two-minute expired offers can be reoffered by store; another available picker receives a decline. |
| Delivery/admin | Existing screens | Existing bag pickup, delivery code, COD and payment records work with the automatically assigned picker flow. |

The catalogue defines vegetarian grocery and household categories and subcategories. Frozen, egg, meat, chicken, fish, seafood and gelatin words are excluded from newly published products; food requires a confirmed vegetarian status, and household items use non-food status. Legacy safe sample SKUs migrate to the new categories. Older custom products without a verified label become drafts for seller review; excluded old products are paused. Existing orders retain their line-item snapshots. Pet care is limited to accessories and supplies rather than pet food in this demo.

## Test results

- `npm run test:unit`: PASS (17 scripts).
- `npm run test:commerce`: PASS (14 scripts), including new `grocery-voice-allocation.e2e.mjs`.
- Syntax check for every `js/*.js`: PASS.
- Eight static integration scripts executed directly: PASS.
- `npm run test:static` wrapper: blocked by sandbox `spawnSync EPERM`; its syntax and eight integration steps were run directly and passed.

The new E2E scenario covers: product draft extraction; required vegetarian confirmation; duplicate/excluded product rejection; voice price and stock updates; ambiguous rice choice; Hindi common-product input; multi-item customer cart and COD; no on-shift picker alert; two on-shift pickers and least-load assignment; offer decline and rerouting; acceptance required before picking; offer expiry and manual reoffer; picker break; full picker → seller → Ravi → customer delivered flow; and a walk-in voice list held for review before cart changes. Existing payment, return, COD and multi-store tests also passed.

## Manual test on GitHub Pages

1. Put the ZIP contents at the root of your GitHub Pages branch, so `index.html` is at the root. Use one normal browser profile and origin for all role tabs; incognito is a separate data set. Reset demo data if an earlier version stored incompatible records.
2. Seller `seller.html` → ABC Grocery → Products and stock → speak or type `Add Amul Milk 1 litre at ₹70 stock 20 low-stock alert 5` → Prepare product draft. Check the fields, select **Dairy & paneer**, **Milk**, and **Verified vegetarian**, then Publish. Review price and stock using `Change Amul Milk price to 72`.
3. Customer `index.html` → Shop → Order by voice → say `two Tata Salt and one rice`. Choose the exact rice pack, add reviewed items to cart, check total and place a COD order. Test typing the same text if microphone permission or browser recognition is unavailable.
4. Seller → Orders → Accept. With no picker working a shift, see the no-available-picker alert. For automatic assignment, Picker `picker.html` → Earnings/Schedule → Start shift (and confirm today's published schedule if one exists), then place/accept another order. Picker → Pick tasks → Accept task → Start picking → check every item → Complete.
5. Seller packs, Ravi accepts, verifies pickup code and bag count, then enters customer delivery code. Check customer tracking and Admin → Grocery Orders/Payments. Repeat a walk-in list in Seller → In-store sale → Walk-in order by voice, then review cart and payment separately.

## Boundaries and follow-up

- Browser speech recognition is optional and support varies. English India and Hindi language choices are exposed, with a small set of Hindi product aliases; this is not a general multilingual natural-language model. Typed entry always works. Test real microphone permission, accents and mobile browsers on the published HTTPS page.
- The input recognizer and match rules cannot establish ingredient truth. The seller must check packaged labels before selecting vegetarian status. New catalogue categories do not auto-create hundreds of products; stores add real SKU, size, price and stock themselves.
- All order, roster and cash state is local browser storage. Auto allocation and the two-minute expiry are evaluated by actions and screen loads, with no background scheduler or cross-device sync. A server, identity, shared orders/stock and event processing are required for production. Payment and payouts remain mock records.
- An end-to-end browser clickthrough and actual microphone test were not available in this execution environment; the scripted mock-data journeys and rendered screen checks above passed.
