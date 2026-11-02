# What MoveAI needs before real launch: the server

Today MoveAI One is a **prototype that runs entirely in the browser**. Every person, order, payment and document lives in that browser's storage, and every outside check (bank, DigiLocker, Sarathi, GST, payment gateway, SMS) is simulated. That is right for demos and testing, but nothing is shared between phones, nothing is safe from someone editing their own browser, and no real money or identity check happens.

This document lists what a real backend must provide, in the order it is needed, with what the app already does for each so the work is clear.

## 1. Accounts and sign-in

| Needed | Why | Prototype today |
|---|---|---|
| Phone number + OTP sign-in through an SMS provider (MSG91, Gupshup, Twilio India) with rate limits | Every role signs in with one mobile number | OTP is always 123456 |
| Sessions/tokens per device, logout everywhere | A lost phone must not keep access | Browser storage only |
| Roles checked **on the server** for every request | Today a user could edit their browser and open any screen | Role checks run in the browser (`js/permissions.js`) |
| Admin accounts with strong sign-in (second factor) and an audit log nobody can edit | Admin decisions move money and approve sellers | Audit list kept in the browser |

## 2. One shared database

All data that is in `localStorage` today moves to a database (PostgreSQL recommended), with the same shapes the app already uses, so screens change little:

- people, businesses, branches, roles and employments (`persons`, `employments`, `peopleByWorkspace`, `pickerStaff`, `storeManagers`)
- products, batches with expiry dates, stock per branch (`products`, `branchStock`, `batches`)
- orders, packages, delivery assignments and tracking (`customerOrders`, `trips`, `movingJobs`, `serviceRequests`)
- the money ledger (`ledger`, `payEvents`, `payAdvances`, `pickerPayRuns`) — **append-only**, never edited in place
- work and hiring (`availabilityPosts`, `workOffers`, `workRatings`, `candidates`, `vacancies`)
- notifications, cases, exceptions, audit

Rules that must move to the server (they exist in the app's JavaScript today and should be reused as the reference): order state changes, picking expiry check (`pickBatch`), delivery codes, settlement reserve, COD reconciliation, strikes after no-shows, probation limits for new sellers.

## 3. Real outside checks

| Check | Provider | Prototype today |
|---|---|---|
| Aadhaar e-KYC with consent | DigiLocker (via an authorised partner) or UIDAI-licensed KUA | `aadhaarEkyc` accepts test numbers |
| Driving licence and vehicle RC | Sarathi / Vahan (via partner APIs) | `licenceLookup` returns demo results |
| PAN and GSTIN | NSDL/Protean PAN, GST portal | Pattern checks only |
| Bank account name match (₹1 penny drop) | Razorpay/Cashfree/Decentro | `pennyDrop` simulated |
| Face match for selfies and daily selfie check | Face-match API with liveness | `faceMatch` simulated |
| Police verification certificate | Manual upload + reviewer, optional partner | Upload + reviewer flow exists |

Store only what is needed: masked Aadhaar (last 4), document file references, and the check result. Raw ID numbers stay with the provider.

## 4. Money

| Needed | Why | Prototype today |
|---|---|---|
| Payment gateway (UPI collect/intent, cards) with **webhooks** | Only the bank/gateway may mark an order paid | "Demo: bank confirmed" button; screens now say it is a demo payment |
| A real merchant UPI ID and settlement account | Customers currently see `moveai.orders@example` | Placeholder |
| Payouts to sellers, drivers, helpers and delivery partners | Weekly and instant payouts | Wallet and payout rules simulated (`js/pay.js`) |
| Reconciliation with bank statements | COD cash and payouts must match the bank | Manual reconciliation screens exist |
| GST invoices with legal numbering, TDS/TCS | Tax compliance | Invoice numbering simulated |

## 5. Files and messages

- File storage (S3-compatible, private by default) for documents, proof photos (dharamkata slip, loading photo, proof of delivery) and receipts, with expiring links.
- SMS and WhatsApp (Business API) for invites, OTPs, offer alerts and "cash received?" confirmations.
- Push notifications for offers (drivers, helpers, riders, pickers) — offers today appear only when the app is open.
- Masked calling (Exotel/Knowlarity) for "Call via MoveAI", so customer and worker numbers stay hidden.

## 6. Location

- Live location from the rider/driver phone sent to the server every few seconds while on a job, kept for the job only.
- Maps and distance (Google Maps Platform or MapmyIndia) for ETA, route checks ("you are 1.6 km from the customer"), and pickup radius.
- SOS: the server calls the emergency contact and alerts the operations team, not just a list in the browser.

## 7. Operations and safety

- Backups, monitoring and alerts; separate test and live environments.
- Data protection under India's DPDP Act 2023: consent records, data export and deletion on request, purpose limits.
- Gig-worker compliance: platform registration of workers (e-Shram) and state rules (for example Rajasthan and Karnataka) — the app already keeps verified worker records.
- Hosting in India (data residency) recommended.

## Suggested order of work

1. Accounts + database + server-side role checks (nothing else is safe without these).
2. Payment gateway with webhooks and a real merchant account.
3. KYC partners (DigiLocker/Aadhaar, PAN, GST, bank penny drop, licence/RC).
4. File storage, SMS/WhatsApp, push notifications, masked calling.
5. Live location and maps.
6. Payouts, reconciliation and tax invoices.

The guided tours and the 111 automated tests in `tests/ci-list.txt` describe the expected behaviour of every flow; they can be pointed at the real backend as acceptance tests.
