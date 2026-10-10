# Staff ID and payout review — 10 October 2026

## What changed

- Existing Staff **My pay & details** includes a guided **My ID** form. The Aadhaar path retains the mock OTP `123456`; an alternative ID can use manual review. The form accepts small mock PNG, JPG, WebP or PDF front/back files (one PDF can be selected twice), previews them, and records a version and review history.
- Worker can add or edit bank name, account, IFSC and an optional UPI ID. A bank submission through the UI needs a small mock cancelled cheque/bank proof; UPI supports an optional proof image/PDF. New UI submissions wait for the store owner to approve or request correction.
- Seller **People & pay → Team by branch** has an owner-only review area for ID and payout details. The ordinary row remains masked. The manager cannot see document previews, Aadhaar suffix, account suffix or approval controls. Owner can escalate ID review to platform.
- Platform **Admin → Documents** includes escalated mock staff ID cases. A platform clearance sends the case back for final owner approval; a correction returns it to the worker.
- A pending payout change keeps the worker's last approved destination active. A first bank submission cannot enter the mock monthly bank batch until owner approval. UPI-only approval cannot enter the bank batch. Change and decision history is visible to worker and owner.

## Test results

| Check | Result |
|---|---|
| Existing staff flow suite (`npm run test:staff`) | Passed |
| New ID front/back, owner and platform review, correction, bank and UPI payroll eligibility (`tests/staff-credentials-review.e2e.mjs`) | Passed |
| Owner and manager visibility (`tests/payroll-owner-visibility.e2e.mjs`) | Passed |
| Commerce/admin routes and navigation integration | Passed |
| Direct syntax checks for changed JavaScript | Passed |
| Browser click-through with Playwright | Not run: Playwright is not installed in this runtime |
| Full `test:static` command | Runner blocked by `spawnSync ... node EPERM`; direct syntax, commerce and navigation integration tests passed separately |

## How to test in one browser profile

1. Open `picker.html#/myHR`, choose Asha. Under **My ID**, use a test Aadhaar number (e.g. `234567890123`), OTP `123456`, mock front/back files under 120 KB, DOB, selfie and emergency contact. Submit. Never use real data.
2. Open `seller.html#/storeHR` as ABC Grocery, **Team by branch**. Open Asha's front/back preview. Request correction; return to the Staff app and submit corrected files. Return and confirm the ID. Alternatively escalate it, then open `admin.html#/documents` to clear it before the owner confirms.
3. In Staff **How you get paid**, enter test account `12345678901`, IFSC `SBIN0001234`, a beneficiary name and a mock bank proof. Submit. In the owner team view approve the payout. Open **Money → GIRO payroll**; the bank batch can now recognize the approved bank destination once earnings have been posted.
4. Change the account to another test value. Before owner approval, the last approved bank remains the payable destination; after approval, the new one is used for future payments. Choose UPI and submit a test ID; approve it, then verify that the worker is excluded from a bank-only batch and can use individual UPI pay.
5. Check both worker and owner history. Switch to a manager role and verify the sensitive document controls are absent.

## Demo limits

This is a browser-local prototype. The OTP, ID review, bank validation, UPI check, payroll and platform review are simulated. Files are kept as small data URLs in browser storage; do not upload actual Aadhaar cards, cheques, bank statements or other personal documents. Real deployment needs a backend with private document storage, access logging, retention/deletion, proper consent, real identity and payment verification, and transaction-safe payout destination snapshots.
