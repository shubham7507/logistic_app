# Delivery partner map and joining demo — 10 October 2026

## What changed
- The active delivery card now includes its map, store/customer addresses, phase-specific navigation, live GPS/demo controls, and entrance note. The separate details section retains proof of delivery and earnings without repeating the map.
- New delivery partner joining has five short steps: Aadhaar number → demo OTP or manual front/back/selfie, licence, vehicle documents, payout, then submit. Platform admin reviews background and training before offers are enabled.
- Expired licence, insurance or PUC blocks a newly onboarded partner from going online, accepting or being offered a job. Ravi, the existing approved mock account, remains usable for the delivery demo.

## Tested
- `node tests/delivery-joining-map.e2e.mjs` — pass: OTP error/success, manual fallback, borrowed vehicle permission, payout, admin checks, expiry gate, and map destination changes.
- `node tests/geo-notify.unit.mjs` — pass.
- `node tests/commerce-screens.integration.mjs` — pass.
- `node tests/phase345.unit.mjs` — pass.
- `node tests/commerce-plus.unit.mjs` — pass.

## Try it
1. On Delivery Partner 1 (Ravi), open Deliveries and accept an offer. The map and **Navigate to store** appear in the order card. Use **Use demo location** if browser GPS is unavailable. Enter the seller's pickup code and confirm bags at the store.
2. The navigation button changes to **Navigate to customer**. Enter the customer's delivery code to complete delivery.
3. For onboarding, switch to Delivery Partner 2 (Sana), open Profile, enter test Aadhaar `234567890123`, click Verify Aadhaar, use demo OTP `123456`, and fill the following steps. Submit, switch to Admin → Partners, review Sana, tick background and training, and approve.

## Demo limits
- The inline route is a map preview; the navigation button opens Google Maps for actual turn-by-turn directions. When network tiles fail, the SVG preview remains.
- GPS uses browser permission or simulated movement and is shared between roles only in the same browser profile. The app has no backend, server dispatch, secure document storage, live government check, bank verification, or production background screening. Files are represented by filenames; use only mock documents.
- The map pin depends on the customer's selected location. For counter delivery, verify the written address against the pin before dispatching; the demo may use a default pin.
