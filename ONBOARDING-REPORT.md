# Onboarding update — 1 November 2026

One sign-up, then any role: customer, driver/helper, courier, logistics business, **seller (new)** or staff. Until this update, "Add a business" offered only transport, own vehicles, packers & movers and goods. The four stores were demo data, and nobody could become a grocery or electrical seller. Now anyone can.

This is still a browser-only prototype. GST, bank and licence checks use the simulated providers in `js/verify-sim.js`, and all records stay in browser storage.

## How a person onboards
```
Sign up once (mobile + OTP + consent)
        │
        ▼
"What do you want to do?"  (skippable; only picks the first screen)
   ├─ Use personal services   → customer home (+ "Sell on MoveAI" / "Work with MoveAI")
   ├─ Find work               → Partner app: driver / khalasi / helper profile
   ├─ Become a delivery partner → Partner app: delivery joining
   ├─ Sell products  (NEW)    → Business app: seller application
   ├─ Create a logistics business → Business app: Add your business
   └─ Review invitations      → staff / business invitations
```

## The new seller application (8 short steps)
1. **Seller type and categories.**
   - Types: Individual / home seller, Registered shop, or Brand / chain.
   - Categories: Fresh fruits & vegetables, Packaged food, Home & personal care, Electricals, Fashion.
2. **PAN, GST and bank.**
   - GSTIN is checked live (simulated). PAN must match characters 3–12 of the GSTIN.
   - A GSTIN already registered to another store is refused.
   - Individuals may start **without GST** only for GST-exempt fresh produce, and must verify Aadhaar.
   - Bank: a ₹1 name check. If the name doesn't match, a cancelled cheque is needed and **payouts stay off** until it's checked.
3. **Licences for the chosen categories.**
   - **FSSAI** (14 digits, valid date) for food.
   - **Brand papers** for electricals.
   - Both are optional at this point. Without them, those categories stay **locked** while the rest of the store can go live.
4. **Store and first branch.** Name, address, city, state (must match the GSTIN state), hours, delivery radius. Duplicate store names are refused.
5. **Delivery choice.**
   - MoveAI couriers (only in covered cities: Delhi, Noida, Gurugram, Ghaziabad, Jaipur, Patna)
   - Own delivery
   - Store pickup only (enforced at customer checkout)
6. **Fees and agreement:** commission and payout timing per category; must be accepted.
7. **First products.** At least one. Restricted items (medicines, alcohol, tobacco, firecrackers…) are blocked; price above MRP is blocked; category must be one of the chosen ones.
8. **Review and submit.** Review target: 3–5 working days.

**Status page** (`Seller applications`): every section shows Under review, Approved, Needs correction (with the reviewer's note) or Not provided. Fixing a section sends only that section back to review; approved sections stay locked.

**Admin** (`Admin → Business approvals → Seller onboarding review`): approve, request a correction or reject **each section**. A reason is required for corrections and rejections.
- **Core sections:** type, KYC, store, delivery, agreement and products.
- When all core sections are approved, the store is created, **if at least one category can go live**.
- A later licence approval (e.g. brand papers) unlocks more categories on the live store.
- Rejecting a core section rejects the application.

**What the new store gets:**
- A **store owner workspace** in the Business app switcher, with the store's own colour and branch.
- Its own manager and store-staff workspaces for later team invites.
- Orders, Products and stock, Team, Store setup and settlements screens.
- Approved products in the customer shop; locked categories stay hidden until approved.
- The store survives reloads and keeps working like the demo stores.

## Other changes
- **Entry points:**
  - "Sell on MoveAI" and "Work with MoveAI" cards on the customer home.
  - "Sell products on MoveAI" in Account.
  - A "Want to sell products instead?" banner on Add your business.
- **An approved business adds "Sell products"** from Business → Add service. PAN, GSTIN and bank are reused and KYC is approved automatically; only store, licences, delivery, agreement and products are asked.
- **Switcher:** "Applications in progress" shows seller applications in draft, under review or needing correction.
- **Business app Personal menu:** new "Seller applications" item.
- **Store registry:** hard-coded store lists in `products.js`, `config.js`, `app.js`, `people-core.js`, `people-rules.js`, `store-hr.js`, `grocery-inventory.js` and `grocery-staff.js` now use one store registry (`js/seller-roles.js`), so new stores behave like the built-in ones.
- **Fix:** reloading no longer drops stores that aren't part of the demo data (`js/store.js`).

## Scenarios covered by tests
| # | Scenario | Result in the prototype |
|---|---|---|
| 1 | Customer opens a grocery shop with GST | Store workspace after approval; customer app unchanged |
| 2 | Home seller without GST | Only fresh produce allowed; Aadhaar required; shops and brands can't skip GST |
| 3 | Electricals without brand papers | Store goes live for other categories; electricals locked until papers are approved |
| 4 | Raj Logistics adds "Sell products" | PAN, GST and bank reused, KYC auto-approved |
| 5 | Branch in a different state from the GSTIN | Blocked with a clear message |
| 6 | Grocery and electricals in one store | Both live once licences are approved |
| 7 | Store staff member opens their own shop | Separate store; staff membership untouched |
| 8 | Cancelled GSTIN | Blocked |
| 9 | Bank name mismatch | Cancelled cheque required; payouts stay off |
| 10 | PAN and GSTIN don't match | Blocked |
| 11 | GSTIN already registered by another store | Blocked, with "ask the owner to add you as staff" |
| 12 | FSSAI missing | Food locked, other categories live |
| 13 | FSSAI wrong length or expired | Blocked |
| 14 | Price above MRP | Blocked |
| 15 | Restricted items | Blocked |
| 16 | Submit without products or steps | Refused, listing the missing steps |
| 17 | Correction on one section | Only that section reopens; resubmit; then live |
| 18 | Core section rejected | Application rejected |
| 19 | Outside courier coverage | MoveAI couriers refused; own delivery or pickup offered |
| 20 | Pickup-only store | Home delivery refused at customer checkout |
| 21 | Duplicate store name | Refused |
| 22 | Only food chosen, no FSSAI | Core approved but nothing goes live; reason shown |
| 23 | Reload | New store and its workspaces restored |

## Tests
| Command | Result |
| --- | --- |
| `node tests/seller-onboarding.unit.mjs` (all scenarios above) | PASS |
| `node tests/onboarding-flows.e2e.cjs` (purpose screen, customer, driver/helper, courier, logistics business, full seller journey with validation, correction, resubmission and go-live, locked category, pickup-only checkout, business adds Sell products, mobile) | PASS |
| `npm run test:onboarding` (the two above plus identity `p1`, logistics business `p2` and staff `p3` browser tests) | PASS |
| `test:unit`, `test:static`, `test:damage-claims`, `test:demo`, `test:workspace`, `test:e2e` p1–p4 | PASS |
| `test:commerce`, `test:staff`, `p0-foundation` and 7 Python smoke tests | Same failures as the original code, first error identical; no new failures |

Browser tests need the folder served on port 4177 (`python3 -m http.server 4177`).

## Still needed on the server
1. **Seller applications** stored server-side, with document uploads in encrypted object storage and a review queue for MoveAI staff (with SLA timers).
2. **Real checks:** GST portal (status, state, legal name), PAN–GSTIN match, ₹1 bank name check, FSSAI licence lookup, DigiLocker Aadhaar for individuals.
3. **Stores as database rows**, not runtime workspace keys. A store record owns branches, staff memberships, categories, products and payout settings; per-category locks are enforced by the catalogue service.
4. **Online seller agreement** with version, IP and time recorded; commission and payout hold read from server settings; TCS/TDS handled by the ledger.
5. **Uniqueness enforced on the server:** one GSTIN per business, unique store names per city, and the "request access from the owner" flow.
6. **Delivery mode** enforced by dispatch: no courier offers for own-delivery or pickup-only stores.
7. **Confirm the GST rules for small online sellers, and the restricted-item list, with a CA and a lawyer before launch.**
