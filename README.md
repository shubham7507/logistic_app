# MoveAI One vNext — Phases P5–P8 (complete application flow)

Phase P4 adds the goods and opportunity marketplace on the completed P0–P3 application. It also repairs the Commercial Driver availability, matching, application, withdrawal/reapplication and owner hiring pipeline. The v44 reference remains unchanged.

## Four apps (option C)

Open `/` for the customer app, `/partner` for drivers and helpers, `/business` for businesses and staff, and `/admin` for the admin console (locally: `index.html`, `partner.html`, `business.html`, `admin.html`). They share one login and one set of demo data. The workspace switcher lists only the current app's roles, with links to the other apps underneath.

## P5–P8: complete draw.io application flow

P5–P8 implement every page of `MoveAI_One_All_Users_Complete_Application_Flow.drawio` that was not yet in P0–P4. See `P5-P8-USER-STORIES.md` for the page-by-page traceability map.

- **P5 Trips and fleet** — trips created once from confirmed loads or own-vehicle assignment; ordered milestones with proof (loading photo, weighbridge slip only when Dharamkata is selected, signed POD); buyer receipt with quantity/condition; settlement and next load near drop; vehicle source (own fleet, external owner offer, posted truck) and crew source (staff, platform); document, capacity, licence and overlap checks; one shared fleet calendar; add vehicle → staff uploads → owner review → admin approval.
- **P6 Customers, movers and workers** — book moving, personal driver, products or general services by typing or voice; full price before booking; automatic Mover branch assignment; inventory, loading proof, customer OTP and payouts; driver/helper invites, one-trip offers and assigned jobs; personal driver jobs and upgrade to commercial.
- **P7 Messages, money and notifications** — job, internal and direct conversations with text, audio, proof and location; GPS only with Driver consent and stopped at closure; ledger with payer/payee/responsible, method and reference, approval limits, duplicate detection, payee confirmation, hold and reversal with audit; reimbursements and platform fees never counted as earnings; notification bell.
- **P8 Admin, exceptions, staff events and AI** — verification queue for people, vehicles and businesses with reasons, notification, suspension, escalation and appeal/restore; seven exception types that hold work, notify only affected parties and recalculate dues without deleting; leave/unavailability with reassignment and rehire; "Ask MoveAI" assistant with voice, read-back confirmation for critical actions and no permission bypass.

### Demo journeys

1. **Personal → Book a service** → Review price → Book move. Switch to **SafeMove Packers → Moving jobs** to see it auto-assigned. Completion OTP for the seeded job MOV-601 is `4826`.
2. **Raj Logistics → Trips → TRP-503 → Assign**: choosing UP16 RT 2201 is blocked by the MOV-603 moving booking on 2 Oct (see Fleet calendar).
3. **Commercial Driver → My Jobs → TRP-501**: Dharamkata needs a weighbridge slip; then start transit, send location, deliver with POD.
4. **Sharma Foods → Trips → TRP-502**: confirm received quantity and condition.
5. **Raj Logistics → Money**: approve and pay; switch to **Raj Transport** to confirm receipt.
6. **Ask MoveAI**: "summarize TRP-501" or "record advance 5000 to Raj Transport for TRP-501" (read back, then saved for approval only).
7. **Platform Admin → Verification**: enter security code `246810` first; reject without a reason is refused; suspend and restore after appeal.
8. **Sharma Foods → Trips → TRP-502**: confirm receipt → Pay seller → approve and pay → Close order (GO-403).
9. **Raj Logistics → People → open an active staff member → open their workspace → My Work**: assigned tasks, check in; the owner sees attendance under Leave, attendance & rehire.
10. **Personal → Work profile**: pick Commercial Driver + city → browse jobs (Level 1) → verify licence `BR01 20190054321` and a selfie (Level 2) → Aadhaar (OTP 123456), bank, emergency contact (Level 3). Raj Transport's invite appears for joining. Test data is shown on each form.

### Tests

`npm run test:unit` and `npm run test:static` include `tests/ops-rules.unit.mjs` and `tests/ops-screens.integration.mjs`. `npm run test:smoke` runs `tests/p5-p8-ops.smoke.py` (Python Playwright): every allowed route for every workspace plus the journeys above.

## Run locally

Serve this directory with any static web server and open `index.html`.

## Included

- Mobile signup with consent and Indian-number validation
- OTP expiry, resend wait, attempt limit and mock OTP `123456`
- Duplicate-mobile recovery into one existing identity
- Automatic Personal workspace creation exactly once
- Safe workspace switching and strict route boundaries
- Pending business invitations with accept, decline and history
- Central configuration for 10 workspace contexts and 57 routes
- Desktop sidebar, mobile bottom navigation and Netlify SPA routing
- Resettable mock data and a complete signup demo from Personal Home
- One legal business with Transport, Own Vehicles, Movers and Goods services
- Save-and-resume legal details, service-aware KYC and a default branch
- Masked bank destination with verification and payout guard
- Admin approve, request correction or reject with versioned history
- Section-specific correction and resubmission
- Later service expansion that reuses common KYC
- A dedicated People hub for team, hiring, roles and temporary Owner Cover
- Simple staff invitations with duplicate-mobile identity linking
- Exact invited-mobile OTP verification before staff acceptance
- Staff self-service for personal ID, bank, emergency contact and required documents
- Separate owner review with correction, rejection and approval decisions
- Permanent Staff ID creation only after owner approval
- Seven plain-language role templates with branch and service scope
- Strict staff visibility: each staff member sees only assigned work and permitted sections
- Vacancy posting and candidate discovery for Drivers, Khalasis, Helpers and other staff
- Candidate self-registration, availability and job application flows
- Hiring pipeline with permanent, fixed-term and trip-only engagement choices
- Owner Cover with expiry, reason, branch scope and owner-only restrictions
- Safe offboarding with truck/task reassignment, retained history and outstanding-dues checks
- Goods orders separated from transport requirements and freight money
- Own vehicle, selected Transporters and eligible-network arrangement choices
- Buyer goods-with-delivery requests and Transporter Seller sourcing
- Available-load and looking-for-load posts with authority and privacy checks
- Approved available-truck posts and route-compatible next-load suggestions
- Goods Owner, Vehicle Owner and Transporter opportunity responses
- Opportunity-scoped text and voice-note conversations
- Idempotent conversion from opportunity to one canonical Load

## Mock personas for end-to-end testing

The workspace is the business or activity context. The mock user is the person whose permissions and journey are being tested. The switcher, page header and profile card always show both.

| Workspace | Test as | Exact role |
|---|---|---|
| Personal | Shubham Kumar | General Customer |
| Sharma Foods | Vijay Sharma | Goods Owner |
| Raj Logistics | Amit Raj | Transporter |
| Raj Transport | Rajesh Kumar | Truck Owner |
| SafeMove Packers | Neha Singh | Mover Owner |
| Commercial Driver | Mohan Yadav | Commercial Driver |
| Personal Driver | Anil Kumar | Personal Driver |
| Khalasi & Helper | Ramesh Yadav | Khalasi / Helper |
| Staff workspace | Pankaj Meena (or the selected invited staff member) | Operations Staff or assigned role |
| Platform Admin | Admin Neha | Platform Admin |

Example: **Raj Transport** is the business workspace; **Rajesh Kumar · Truck Owner** is the mock user. Never refer to Rajesh as a generic “commercial owner” during a test.

## Tests

```bash
npm run test:unit
npm run test:static
npm run test:e2e
```

The browser E2E suite needs a Playwright Chromium binary. Without it, browser status remains **NOT RUN**. Browser suites cover identity, business approval, People/hiring and the Phase P4 marketplace when Chromium is available.

## Manual P1 journey

1. Open Personal Home and select **Test signup journey**.
2. New identity: use `9123456789`, accept consent, then enter OTP `123456`.
3. Existing identity: restart the journey, use `9876543210`, OTP `123456`, then continue to the existing account.
4. Open **Invitations**, accept Raj Logistics, and confirm the workspace appears once in the switcher.

## Manual P2 journey

1. From Personal Home select **Add or continue a business**, or open the workspace switcher and choose **Add business profile**.
2. Complete services, legal details, sample KYC, the default branch and bank information.
3. Submit the application, switch to **Platform Admin**, and open **Approvals**.
4. Approve it, or request a correction and select the affected section.
5. Return to Personal → Application status to fix and resubmit.
6. After approval, open the business workspace. Use **Business** for services, branches, bank and expansion.

## Manual P3 owner journey

1. Switch to **Raj Logistics** and open **People**.
2. Select **Pankaj Meena · Test invitation as staff**.
3. Confirm mobile `9876501199`, send OTP and enter `123456`.
4. Accept the invitation and complete identity, emergency and Bank/UPI sections.
5. Submit for owner review and choose **Return to owner test view**.
6. Request one correction, return as staff, fix only that section and resubmit.
7. Approve and activate. Confirm a `STF-TRA-` Staff ID is created.
8. Open the worker and choose **Access** to apply a role template plus branch/service scope.
9. Use **Hiring** to post an opening, find a commercial Driver/Khalasi/Helper and move the application through the pipeline.
10. Convert the selected candidate as permanent, fixed-term or trip-only. Trip-only workers do not become full staff.
11. Use **Owner Cover** to delegate operations temporarily. Ownership, owner bank changes and business closure remain owner-only.
12. Open a worker and choose **Offboard**. Reassign active trucks/tasks and record final dues before completion.

## Manual P3 worker journey

1. Reset demo data, switch to **Commercial Driver**, then open **Profile**.
2. Keep Driver, Jaipur, Immediate and Per trip; select **Save availability**.
3. Work shows **Heavy Truck Driver**. Open it, apply, then withdraw. **Apply again** must appear.
4. Reset, repeat Profile → Work → Apply, then switch to **Raj Logistics**.
5. People → Hiring → Applicants: move Amit Singh through New, Reviewed, Shortlisted, Interview, Offer and Hired.
6. The trip-only opening creates one assignment and no full staff access.
7. Staff invited into a business sees only the sections, branches and services granted by the owner.

## Manual P4 journey

1. Sharma Foods → Loads → **Create goods order**.
2. Save the goods agreement, create its transport requirement and choose **Selected Transporters → Raj Logistics**.
3. Raj Logistics → Work → **Post load** and publish the authorized requirement.
4. Raj Logistics → **Looking for load** and publish Jaipur → Delhi capacity.
5. Sharma Foods → **Transporters need loads** → respond with goods.
6. Open the opportunity conversation, send text or a voice note and review responsibility.
7. Confirm terms. Exactly one canonical Load is created even if confirmation is selected twice.
8. Raj Transport → Work → **Next load** to see the compatible Jaipur → Delhi recommendation.

Full P0–P3 traceability is in `P0-P3-USER-STORIES.md` and `P0-P3-E2E-TEST-PLAN.md`. Phase 4 is in `P4-USER-STORIES.md` and `P4-E2E-TEST-PLAN.md`.

## Product shopping flow

Customer product search, mixed-store cart and checkout are available in `index.html#/search`. One checkout creates separate store orders and tracking in `#/orders`. See `COMMERCE-E2E-TEST-REPORT.md` for the current coverage and prototype limits.

## Grocery commerce across roles

Use `index.html` for customer orders, `seller.html` for the two mock grocery stores, `picker.html` for store picker accounts, `delivery.html` for the two mock delivery partners, and `admin.html#/commerceOps` for oversight. In Seller → Team, invite a picker by name and mobile. On the corresponding Picker → Profile, select the invited demo account and accept. Seller → Orders can assign an accepted order to that active picker or use **Pick items myself**. Reassignment clears partial checklist progress, and removing access releases unfinished tasks. Admin → Partners shows each staff picker and status. These screens share mock order state on the same browser origin. See `GROCERY-PICKER-TEAM-REPORT.md` for the current walkthrough, tests and demo limits. Run `npm run test:commerce`, `npm run test:unit` and `npm run test:static` from this folder.

The UI prototype now includes **Seller → Team** pay plans, **Seller → Money → Picker Pay**, **Picker → Earnings**, and a read-only picker pay summary in **Admin → Payments**. Asha has a sample ₹12,000 monthly plan and Imran a ₹500 daily plan. Pickers submit a shift; sellers approve it, prepare a pay run, optionally adjust it with a reason, approve it, and record an external payment reference. No actual payout takes place. See `GROCERY-UI-FLOW-AND-PICKER-PAY-REPORT.md` for the current front-end scope and walkthrough.

### Role navigation on mobile

- Customer: **Home, Shop, Orders, Account, More**. The cart button is on Shop; More contains Book, My bookings and Messages.
- Seller: **Home, Orders, Products, Money, More**. Store profile is in More.
- Delivery partner: **Home, Deliveries, Earnings, Profile, More**. COD cash is linked from Earnings and shown as a Home alert when handover is due; its detailed page is also in More.
- Admin: **Overview, Orders, Partners, Payments, More**. More includes Grocery Issues and the existing platform administration screens. The former `#/commerceOps` link remains an overview with links to the four grocery sections.

On GitHub Pages, publish from the branch root with `index.html` at the top level. Use the same browser profile and origin to test all five entry pages: local storage cannot synchronize orders between separate devices.

`npm run test:commerce` also runs the three-product/two-store customer → seller → courier → customer tracking journey. The courier job shows the mock store pickup and customer drop-off addresses with directions links. See `GROCERY-MULTI-ITEM-E2E-REPORT.md` for results and remaining demo gaps.

The grocery Shop has a visible mobile Cart button, product detail and quantity screen, added-to-cart confirmation, basket and address → payment → review checkout. See `PRODUCT-ORDERING-CART-FIX-REPORT.md` for the cart issue, checks and GitHub Pages walkthrough.

The latest grocery enhancements add optional seller self-picking, targeted order notifications with order links, customer-approved same-store replacements, sealed-bag verification, courier offer reassignments, clearer tracking and exception/payment views. See `GROCERY-PRIORITIES-1-8-REPORT.md` for the full manual walkthrough, test results and static-demo limits.

### Grocery manager, shifts and picker exit demo

The same `seller.html` now offers separate **Store owner** and **Store manager** workspaces for each grocery store. The owner invites a manager in Team. Switch to the matching manager workspace, open Profile, select the invited demo account and accept it. Managers can accept and pack store orders, assign active pickers, publish shifts, approve cover requests and corrected timecards. They cannot change pay rates, record wages or offboard pickers. The owner retains those controls in Team, Picker Pay and Offboarding. The picker sees Schedule alongside Pick tasks and Earnings. Admin Partners shows manager and picker statuses.

Try a complete workforce journey: Owner → Team invites a picker and manager; each selects and accepts in their corresponding workspace; owner sets the picker pay plan; manager publishes a shift; picker confirms or requests cover; manager assigns a replacement; picker starts/ends a shift and requests a time correction; manager resolves the correction and approves the shift; owner prepares and records the mock final pay; owner sets the last day or immediately revokes access, reassigns unfinished tasks, then completes the exit. The exit screen blocks finalization while tasks, shifts, corrections or final pay remain. `npm run test:commerce` covers this journey with a customer order, store manager acceptance, picker checklist, courier code handoff, delivery, customer tracking and admin visibility.

All accounts, invitations, shifts, timecards, orders and payments are simulated in browser storage. Open the role pages on the same GitHub Pages origin and browser profile. Invitation acceptance has no real SMS verification, shift times use the browser's UTC date in this mock, and payment recording does not transfer funds. Read `GROCERY-WORKFORCE-E2E-REPORT.md` for the screen map, test results and remaining backend work.

### Grocery catalogue, stock and walk-in sales

Seller → Products now adds/edits store products, prices, pack sizes, quantities, descriptions, SKU/barcode, and optional photo URL. Owner controls product details and price. An active manager can adjust stock, pause products and run counter sales. Products shows low-stock and sold-out filters, reasons and history; Seller Home has a low-stock count. The customer Shop shows published products, current price and availability. Cart prices are reviewed again if the seller changed a rate; placed order lines retain their price snapshot. Online checkout commits quantity, counter sales consume it, cancellations release it, and completed delivery/pickup consumes the commitment.

Seller → In-store sale lets an owner or manager find a product by name or barcode text, build a counter cart, record a mock cash/UPI/card sale, view a receipt and record a full return as sellable or damaged. Seller → Counter delivery creates a mock COD delivery for a customer at the store, then uses the existing picker/packing/Ravi handoff. Optional demo-account linking makes that order appear in the current mock customer's My orders; otherwise it stays visible only to store and admin. Customer checkout now offers Store pickup with mock online payment. After picking and packing, the seller or manager enters the customer's pickup code, marks it Collected and records a mock settlement. Seller → Sales and Admin → Partners/Payments distinguish online, pickup and counter activity. Run `npm run test:commerce` for the new cross-role suite. See `GROCERY-RETAIL-E2E-REPORT.md` for the walkthrough, checks and limits.

This remains a one-browser UI prototype. Barcode text can be typed or supplied by a keyboard-wedge scanner; camera scanning, uploads, shared live inventory, real payment/refund transfer and authenticating a walk-in customer need backend/device integration.

### Grocery payment demo (October 2026)

Customer checkout supports simulated UPI/card online payment and cash on delivery. Store pickup also offers pay at store by cash, UPI or card; the seller or manager records the payment at collection after checking the pickup code. The in-store counter supports cash/UPI/card with a reference for electronic payment, plus counter-created doorstep delivery paid at the counter or COD to the courier. All of these write mock ledger entries when payment is recorded, with customer receipts, seller money, courier COD cash/earnings, picker pay, and admin payment records in their respective role screens. Direct-store receipts create a platform fee due on completion; admin can record a store transfer reference. Returns record refunds, and a returned order waives a due platform fee or flags an already recorded fee for review. No real charges, transfer, or refund occurs.

Run `npm run test:commerce` for method and ledger scenarios. Read `GROCERY-PAYMENTS-E2E-REPORT.md` for the role walkthrough, test coverage, and remaining backend tasks.

### COD cash custody and refunds

COD cash is collected by the courier at delivery. Delivery Partner → COD cash submits a stated amount and receiver, then Admin → Grocery Payments independently enters the amount counted and receipt reference. A mismatch remains disputed and blocks seller/courier payouts until a full count and resolution note. Cash collected but not submitted for 24 hours is flagged overdue when the screen is opened. Approved COD returns create a manual UPI refund due; admin records the external transfer reference and the customer sees the recorded state. Everything remains simulated. Read `GROCERY-COD-HANDOVER-E2E-REPORT.md` and run `npm run test:commerce`.

### Grocery staff payment methods

Seller → Money → Picker Pay + Manager Pay: the store owner approves picker shifts and pay runs or sets a manager monthly amount and approves a manager pay run. After making payment externally, the owner records bank, UPI, cash or card payout with a reference or signed cash receipt note. Picker → Earnings and Manager → Profile show their own history. Admin → Grocery Payments can inspect the store expense ledger entries. Admin records courier ₹35 per completed order using a simulated bank payout or externally recorded UPI, cash or card payout; Ravi → Earnings shows its method, status and reference. Cash collected from a customer for COD stays separate and must be reconciled before courier payout. A card payout record means an external payout to an eligible card through a future provider, not charging the worker's card. No card number is collected. These are mock accounting records, not payroll or fund transfer. See `GROCERY-STAFF-PAYMENTS-REPORT.md`.

### Walk-in counter checkout and shift cash

Seller/manager → In-store sale now supports editing/removing cart lines, up to two different tenders (cash, UPI, card), applied total and cash-change preview, a manual payment review/confirm or void step, item-quantity partial returns, and cash drawer shift reconciliation with counted/expected variance. The review step reserves stock; confirmation consumes stock and writes per-tender ledger entries, while void releases reservations. A later-day refund belongs to the shift in which it was recorded. UPI/card references and cash counts are unverified mock inputs. See `GROCERY-COUNTER-CHECKOUT-E2E-REPORT.md`; run `npm run test:commerce`.
