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
| Aadhaar e-KYC with consent | DigiLocker (via an authorised partner) or UIDAI-licensed KUA | `js/id-verify.js` `sendOtp` / `verify` (test OTP 123456). Keep its rules server-side: OTP 5 min, resend after 30 s (max 3), lock 30 min after 3 wrong OTPs, one result per person reused across roles |
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


## Maps and location (home services and moving)
| Need | Prototype | Live app |
|---|---|---|
| Pro / driver navigation | "Navigate" opens the Google Maps app (`/maps/dir/?api=1&destination=lat,lng&travelmode=two-wheeler`), landmark search for area-only addresses | Same deep link (free). Optional later: Google Navigation SDK inside a native app |
| Map display (pin picker, live tracking) | Leaflet + OpenStreetMap tiles, Esri satellite layer, SVG sketch fallback | Google Maps JavaScript API (India pricing: free monthly calls per SKU), or Mappls (MapmyIndia) / Ola Maps. OSM's public tile servers are not for production traffic |
| Address search | Small demo list (Patna, Noida, Gurugram, Delhi); Motihari "not on the map" | Places Autocomplete + Geocoding (Google / Mappls / Ola) |
| Distance and arrival time | Straight line × 1.3, 22 km/h | Routes / Distance Matrix API |
| Live location | `navigator.geolocation.watchPosition` or demo drive, stored on the job | Native background location every 10–15 s while "On the way" only; store on the server; stop at job start |
| Location link | Demo token in state | SMS / WhatsApp link to a page that reads GPS once and posts it |
| DIGIPIN | Encoded in the browser (`js/location.js`, India Post algorithm) | Same, or India Post API |


## Home services: choosing the pro and spare parts
| Need | Server work |
|---|---|
| Choosing the pro | Run the eligibility check and score on the server. It needs live online status and the last GPS fix, each pro's area and hours, and stats (cancels, no-shows, late, strikes). Offer to 3 pros by push. A 60-second timer per round (a queue or scheduled job) settles the round: the highest score among those who accepted wins. Widen the area 5 → 10 → 15 km, then raise an ops alert. Lock the job row so two accepts can't both win. |
| Favourite / cancel | 2-minute favourite window; when a pro cancels, reassign to the next backup and lower their reliability. |
| Quotes | Collect up to 3 quotes per painting job and close the others when one is chosen. |
| Part catalogue | Search shop products near the job: the shop's location index plus a category→trade map. The price and MRP always come from the catalogue, never from the pro's app. |
| Part orders | A part order is a normal seller order with a pro as the buyer: notify the shop, pick up by a delivery partner, track to delivery, ETA from the courier. |
| Market bills | Store bill and MRP photos (OCR optional). Enforce price ≤ MRP; flag prices more than 25% above the median catalogue price; ₹30–50 pickup charge only when no shop is within 15 km. |
| Settlement | Customer pays one bill. Labour goes to the pro minus the commission; the part amount goes to the shop's settlement (seller commission applies there) with a GST invoice from the shop; reverse it from the pro's wallet when the pro was paid it. |
| Report price | Ops queue with the bill, MRP and shop price side by side; refund the difference to the customer, recover it from the pro, record a strike, and pause the pro automatically after 3 strikes. |
| Pro set-up | Training content (video + question bank per trade) with results stored. Work area as a point and radius. Working hours. Bank or UPI checked by penny drop. Remember the last workspace for each person. |


## Drivers
| Need | Server work |
|---|---|
| Driver matching | Same engine as home services, with two pools (personal drivers, drivers with their own vehicle). Eligibility adds car skills (manual or automatic, body type), vehicle type, documents in date, and an overlapping-time check. 60 s / 2 min timers in the queue. |
| Daily selfie | Face match against the licence photo before the first acceptance each day. The account is blocked on a mismatch until reviewed. |
| Trip time and billing | Server timestamps at start and end (never the phone clock). Extra hours and the night charge are computed on the server and sent to the customer for approval. Car photos and odometer readings are kept for disputes (S3, 180 days). |
| Safety | An SOS goes to the safety desk with the last location. Long-stop detection runs on the server from location gaps. Share-trip links are signed and expire at trip end. |
| Monthly drivers | Attendance, leave and extra-hour records; a monthly salary computation; the salary is collected from the customer and paid to the driver's wallet; notice period and replacement bookings. |
| Document expiry | Nightly job: reminders at 30, 7 and 1 days; the driver is blocked at expiry; renewed documents go to the review queue. Vehicle papers checked through VAHAN and licences through Sarathi (licensed API providers). |
| Truck trips | Driving-hour timer from "In transit", with break events; waiting time at pickup and drop with detention billed to the goods owner; a delivery code generated for the receiver and checked on "Delivered". |
