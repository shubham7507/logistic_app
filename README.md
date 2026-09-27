# MoveAI One vNext — Phase P3

Phase P3 adds the complete People, hiring, role access, Owner Cover and offboarding foundation on the completed P0–P2 application. The v44 reference remains unchanged.

## Run locally

Serve this directory with any static web server and open `index.html`.

## Included

- Mobile signup with consent and Indian-number validation
- OTP expiry, resend wait, attempt limit and mock OTP `123456`
- Duplicate-mobile recovery into one existing identity
- Automatic Personal workspace creation exactly once
- Safe workspace switching and strict route boundaries
- Pending business invitations with accept, decline and history
- Central configuration for 10 workspace contexts and 45 routes
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

## Tests

```bash
npm run test:unit
npm run test:static
npm run test:e2e
```

The browser E2E suite needs a Playwright Chromium binary. Without it, the unit, static integration and HTTP smoke gates still run. Browser suites cover identity, business approval and Phase P3 People journeys when Chromium is available.

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

1. Switch to **Commercial Driver**.
2. Open **Profile** to update licence, documents, availability, preferred routes and rate.
3. Open **Work** to review suitable openings, apply or withdraw.
4. Staff invited into a business sees only the sections, branches and services granted by the owner.

Full traceability and expected results are in `P0-P3-USER-STORIES.md` and `P0-P3-E2E-TEST-PLAN.md`.
