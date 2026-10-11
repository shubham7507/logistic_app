# Delivery wallet and onboarding check — 10 October 2026

## What the current demo does
- A prepaid delivery credits the assigned delivery partner's wallet after the customer confirms receipt.
- COD delivery records cash in the partner's possession. The partner hands over the full COD amount; admin reconciles it. Only then is the delivery earning credited to the wallet.
- On Profile, **Available to transfer** is wallet money, while **Waiting for COD handover and review** lists separate orders not yet in the wallet. Matching ₹37 values do not by themselves mean double credit.
- The partner chooses the saved bank account or UPI ID for an instant payout. Example: ₹37 wallet, ₹10 instant fee, ₹27 recorded as paid, wallet becomes ₹0. A payout reference appears in Wallet activity. Admin can run a free weekly mock payout from Payments. This is a manual demo action, not an automatic Monday job.
- Ravi (Delivery Partner 1) starts preapproved. Switch the Delivery app's account menu to **Delivery Partner 2 — Sana**, then open Profile to see the joining form. Enter test Aadhaar `234567890123`, consent, choose **Verify Aadhaar**, enter demo OTP `123456`, birth date and mock selfie. Finish licence, vehicle, payout and submit. Admin → Partners reviews background and training and approves before Sana receives offers.

## Fixes made
- Fixed the instant payout button, whose handler was previously overwritten by the general action handler and could not transfer from Ravi's screen.
- Added bank or UPI destination choice, confirmation with net amount and fee, COD order breakdown, and wallet activity with payout status and reference.
- Replaced the misleading promise of an automatic Monday payout with the actual admin-run weekly mock payout description.

## Verification
- `node tests/delivery-wallet-onboarding.e2e.mjs` — passed: profile balances and separate COD entry, actual button handler, bank payout ₹27 plus ₹10 fee, zero remaining balance, payout history, UPI choice, weekly payout, Sana OTP onboarding, and COD cash handover → admin reconciliation → ₹35 wallet credit → ₹25 instant bank payout.
- `node tests/delivery-joining-map.e2e.mjs` — passed.
- `node tests/commerce-screens.integration.mjs` — passed.
- `node --check js/commerce.js` — passed.
- `node tests/syntax.static.mjs` — environment could not spawn a child Node process (`EPERM`); direct syntax check succeeded.

## Demo limitations
- GitHub Pages stores state in one browser profile. No actual money moves, no bank or UPI network is contacted, and the Aadhaar demo does not contact UIDAI or send a real OTP. Avoid entering real identity or bank details.
- The screenshot alone cannot show whether Ravi's two ₹37 amounts refer to different deliveries. The updated order and wallet breakdown makes that visible after installing this build and using the same browser profile. The new build is not live until you upload it to GitHub Pages.
