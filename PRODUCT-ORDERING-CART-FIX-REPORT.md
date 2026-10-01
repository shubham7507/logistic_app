# Product ordering and cart fix

Date: 1 October 2026. Scope: grocery customer ordering. The screenshots supplied for reference show a product listing, product detail with quantity and Add to cart, an added-to-cart confirmation and basket, then address/payment/review checkout. The implementation follows those stages with MoveAI branding and seeded grocery products.

## Issue and change

The Shop screen previously placed the only Cart button in its page header. Shared mobile CSS hides page-header buttons at narrow widths, so a customer could add an item but had no visible way to open the basket. The action also only showed a short toast, which made it look as if nothing had happened.

The Shop screen now has an always-visible cart toolbar with an item count, category shortcuts and product cards. A product card opens a detail screen with price, stock and quantity. Add to cart from detail or the listing saves the item and opens an explicit confirmation with Go to cart, Proceed to checkout and Continue shopping. The basket retains quantity editing, and checkout presents delivery address, payment method and order review in that order. The existing multi-store order splitting and role fulfilment logic remain in place.

## Verification

| Check | Result |
| --- | --- |
| Detail screen → choose 2 → Add to cart | PASS: cart has quantity 2 and confirmation opens |
| Quick add from listing | PASS: another product is added with quantity 1 |
| Basket subtotal and cart count | PASS: visible cart toolbar, basket total and updated count |
| Cart limits | PASS: attempt to exceed 10 per product is rejected |
| Checkout sections | PASS: address, payment and item review render in sequence |
| Route access | PASS: customer can open detail and confirmation; seller cannot |
| Multi-store fulfilment | PASS: existing three-product, two-store customer → seller → courier journey |
| Regressions | `npm run test:commerce`, `npm run test:unit` and `npm run test:static` passed |

The new interaction assertions are in `tests/shop-ui-flow.integration.mjs` and run with `npm run test:commerce`. Real browser clicking on the user's deployed GitHub Pages URL is still unverified here; no deployed URL was supplied, and the local browser tool cannot open the local server. The static prototype still shares mock order state only within one browser profile and origin.

## Manual check after GitHub Pages update

1. Extract the ZIP and push its contents, including `index.html`, `js/` and `css/`, to the GitHub Pages publishing folder. Refresh the published site.
2. Customer → Shop. Select a product card, choose quantity 2 and tap **Add to cart**. You should see **Added to cart** and an updated count.
3. Tap **Continue shopping**, quick-add another product, then **Go to cart**. Change a quantity and tap **Proceed to checkout**.
4. Enter address, choose mock payment method, review the total and place the order. Open Orders to see separate fulfilment orders when the basket has items from different stores.
