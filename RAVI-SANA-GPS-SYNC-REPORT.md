# Ravi, Sana and GPS sync review — 10 October 2026

## Fixes
- Ravi's seeded approved profile now uses the same verification fields and payout account model as Sana. Existing browser-local Ravi data is migrated on load. Sana stays pending until the platform reviews her application.
- Admin → Partners → View verification works for both partners. A submitted Sana application shows review controls; approved Ravi is read-only.
- Both delivery profiles show masked ID, licence/vehicle dates, payout and platform review. The partner home screen explains when offers are blocked.
- Sana's approved bank/UPI payout account is synced to the same wallet payout records used by Ravi. Expired or incomplete documents block new offers and pickup actions.
- Assigned delivery cards display the route to store, then customer. GPS handlers check that the active role owns the order. Switching roles pauses sharing; after a reload an old browser GPS flag is cleared. Pickup requires an active location session.
- Walk-in delivery orders no longer inherit a different customer's pin. The counter screen can set an approximate area pin; without one the delivery screen warns the driver and retains directions from the written address.

## Tests run
Passed: `delivery-joining-map.e2e.mjs`, `geo-notify.unit.mjs`, `grocery-retail.e2e.mjs`, `commerce-screens.integration.mjs`, `phase345.unit.mjs`, `commerce-plus.unit.mjs`, and seven direct static/screen integration modules. The new delivery test covers Sana onboarding/approval, Ravi and Sana receiving separate jobs, GPS destination changes, pickup and delivery, cross-partner visibility, payout sync, expiry gate, walk-in pin handling, and stale GPS session cleanup.

Two older suites, `grocery-enhancements.e2e.mjs` and `commerce-flow.e2e.mjs`, still stop at their old store packing setup before reaching delivery. They are not evidence that the whole historical commerce suite passes. `npm run test:static` could not spawn a child Node process in this environment (`EPERM`); its integration modules were run directly and passed. No live-browser test was available.

## Test in the demo
1. Reset demo data. Delivery Partner 1 → Profile shows Ravi's completed mock review. Delivery Partner 2 → Profile shows Sana's joining steps.
2. Complete Sana's joining with test Aadhaar `234567890123` and OTP `123456`, then Admin → Partners → Review joining details. Check background and training, approve, and open View verification.
3. Create or prepare two store orders, assign one to each partner, and switch between their Delivery workspaces. Each sees only their own order. Accept → Use demo location (or browser GPS) → enter store pickup code → Confirm pickup → Navigate to customer → enter delivery code.
4. For a counter delivery, choose an approximate map area and check the written address. If no pin is chosen, the driver sees a warning instead of a misleading customer map pin.

## Demo limits
Browser-local state shares changes only in the same browser profile. GPS and map tiles require browser/network support; demo movement is simulated. The area pin is approximate and written address directions should be checked. Verification, document files and payouts are simulated; files are stored only as filenames. No backend, real Aadhaar check, secure document upload or actual payment is connected.
