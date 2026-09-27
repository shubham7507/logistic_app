# MoveAI One vNext — Phase P4

Phase P4 adds the goods and opportunity marketplace on the completed P0–P3 application. It also repairs the Commercial Driver availability, matching, application, withdrawal/reapplication and owner hiring pipeline. The v44 reference remains unchanged.

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
