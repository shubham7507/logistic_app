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

Use `index.html` for customer orders, `seller.html` for the two mock grocery stores, `picker.html` for the two assigned store pickers, `delivery.html` for the two mock delivery partners, and `admin.html#/commerceOps` for oversight. They share mock order state on the same browser origin. See `GROCERY-ORDER-TO-DELIVERY-REPORT.md` for the latest walkthrough, automated results and demo limits. Run `npm run test:commerce`, `npm run test:unit` and `npm run test:static` from this folder.

### Role navigation on mobile

- Customer: **Home, Shop, Orders, Account, More**. The cart button is on Shop; More contains Book, My bookings and Messages.
- Seller: **Home, Orders, Products, Money, More**. Store profile is in More.
- Delivery partner: **Home, Deliveries, Earnings, Profile, More**. COD cash is linked from Earnings and shown as a Home alert when handover is due; its detailed page is also in More.
- Admin: **Overview, Orders, Partners, Payments, More**. More includes Grocery Issues and the existing platform administration screens. The former `#/commerceOps` link remains an overview with links to the four grocery sections.

On GitHub Pages, publish from the branch root with `index.html` at the top level. Use the same browser profile and origin to test all five entry pages: local storage cannot synchronize orders between separate devices.

`npm run test:commerce` also runs the three-product/two-store customer → seller → courier → customer tracking journey. The courier job shows the mock store pickup and customer drop-off addresses with directions links. See `GROCERY-MULTI-ITEM-E2E-REPORT.md` for results and remaining demo gaps.

The grocery Shop has a visible mobile Cart button, product detail and quantity screen, added-to-cart confirmation, basket and address → payment → review checkout. See `PRODUCT-ORDERING-CART-FIX-REPORT.md` for the cart issue, checks and GitHub Pages walkthrough.

The latest grocery enhancements add optional seller self-picking, targeted order notifications with order links, customer-approved same-store replacements, sealed-bag verification, courier offer reassignments, clearer tracking and exception/payment views. See `GROCERY-PRIORITIES-1-8-REPORT.md` for the full manual walkthrough, test results and static-demo limits.
