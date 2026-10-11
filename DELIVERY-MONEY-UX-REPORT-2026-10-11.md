# Delivery partner Money screen update — 11 October 2026

## What changed

- Ravi and Sana now have Home, Deliveries, Money, COD cash, and Profile in their delivery workspace. The duplicate My work & pay navigation entry is removed.
- Money shows delivery earnings, wallet available, earnings waiting for COD review, instant withdrawal, and payout history. COD collections remain a separate action and are never counted as driver earnings.
- Profile retains verification and payout details and links to Money. A legacy direct link to My work & pay now points the delivery partner to Money.
- The generic worker hub no longer counts the synthetic platform employment as a second delivery job. It looks up a delivery partner's wallet and payout history by partner ID.
- Raw order status `wallet_credited` is presented as “Credited to wallet.”

## Mock scenarios checked

| Scenario | Result |
| --- | --- |
| Ravi and Sana navigation and separate money views | Passed |
| ₹37 prepaid earning available for Ravi | Passed |
| ₹500 COD cash with ₹35 delivery earning held before reconciliation | Passed |
| COD handover and admin reconciliation unlock ₹35 | Passed |
| ₹72 wallet instant withdrawal, ₹10 fee, ₹62 payout | Passed |
| ₹40 free scheduled mock payout and payout history | Passed |
| Delivery payout control binding and Sana onboarding | Passed |
| Seller, delivery and admin screen integration | Passed |

Run `node tests/delivery-money-flow.e2e.mjs`, `node tests/delivery-wallet-onboarding.e2e.mjs`, and `node tests/commerce-screens.integration.mjs` from the package root.

## Existing unrelated test failures

These same assertions failed in the immediately preceding package as well: `worker-hub.unit.mjs` expects a prior final settlement balance of ₹0 but gets ₹2,700; `grocery-cod-handover.e2e.mjs` now requires a shared location before pickup; `grocery-multi-item-journey.e2e.mjs` expects a paid order while the mock stays `payment_pending`. They should be repaired separately before claiming the entire legacy suite passes. The `syntax.static.mjs` harness cannot spawn its nested Node process in this sandbox; direct `node --check` for the changed modules passed.

This is a browser-local mock. Wallet payouts and COD reconciliation are simulated and do not transfer real funds.
