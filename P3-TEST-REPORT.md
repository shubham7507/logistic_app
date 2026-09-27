# MoveAI One vNext — Phase P3 Test Report

Date: 2026-09-27  
Scope: People, hiring, access control, Owner Cover and offboarding on the P0–P2 foundation

## Result

**PASS for deployable static prototype gates.** The Phase P3 rules, screens, route boundaries, mock data and HTTP assets pass. The Playwright journey is included but was not executed because this workspace does not contain a Chromium binary.

## Delivered journeys

| Area | Verified behavior | Result |
|---|---|---|
| P2 regression | Submit for admin review is always clickable; incomplete applications are routed to the exact missing step; complete applications move to Under review | PASS |
| People hub | Team, Hiring, Roles and Owner Cover are separated from daily operations | PASS |
| Staff invitation | Valid mobile, designation, branch and role are required; an existing mobile links to one identity | PASS |
| Staff self-service | Staff supplies own ID, bank, emergency contact and documents; owner reviews and completes onboarding | PASS |
| Role templates | Manager, Operations, Accounts, Driver, Helper, Documents and View-only templates | PASS |
| Scoped access | Branch and service scopes are enforced and owner-only actions remain protected | PASS |
| Candidate marketplace | Drivers, Khalasis, Helpers and staff can publish availability and respond to openings | PASS |
| Vacancy pipeline | Draft/open vacancy, matching candidates, invite/apply/withdraw and applicant status changes | PASS |
| Engagement conversion | Permanent, fixed-term and trip-only hiring paths; trip-only does not create full staff | PASS |
| Owner Cover | Temporary delegate, expiry, reason, branch scope and blocked owner-only actions | PASS |
| Offboarding | Active assignments require reassignment; final dues and retained history are represented | PASS |
| Worker experience | Candidate Profile, Work/Openings and opening detail views | PASS |

## Automated evidence

### Unit tests

Command: `npm run test:unit`

- 9 workspace roles and 41 known routes
- 7 staff role templates
- Duplicate identity and invitation validation
- Branch/service access rules
- Owner Cover restrictions
- 3 employment types
- Offboarding guard
- Candidate matching

Result: **PASS**

### Static integration tests

Command: `npm run test:static`

- 54 navigation/role combinations
- 13 business People screens
- 3 worker screens
- Staff mobile masking
- Owner-only visibility
- Offboarding history retention
- Admin submission remains clickable
- Netlify SPA fallback

Result: **PASS**

### HTTP smoke test

The project root, People JavaScript, People rules and People stylesheet were served and fetched successfully from a local static server.

Result: **PASS**

### Browser E2E

Test file: `tests/p3-people.e2e.cjs`

Coverage included in the suite:

1. Accept a staff invitation.
2. Complete staff self-service details.
3. Finish owner review/onboarding.
4. Save role and branch access.
5. Post an opening.
6. Apply as a commercial Driver.
7. Convert an applicant.
8. Create Owner Cover.
9. Reassign work and offboard safely.

Result: **NOT RUN — ENVIRONMENT LIMITATION**  
Reason: Playwright is installed, but its Chromium executable is absent. This is not reported as a product pass or failure.

## Reference and deployment checks

- Original v44 reference compared against the preserved `moveai-v41` directory: **PASS, unchanged**
- Netlify `_redirects` and `netlify.toml` retained: **PASS**
- JavaScript syntax checks for `app.js`, `people.js` and `people-rules.js`: **PASS**

## Mock data available for testing

- Transporter, Goods Owner, Truck Owner and Mover teams
- Pending staff invitation
- Driver, Khalasi, Helper and operations candidates
- Open driver and helper vacancies
- Applicant pipeline record
- Role-specific permissions and branch assignments
- Owner Cover records
- Staff employment, payment and assignment context

## Recommended deployment validation

After deploying the ZIP to Netlify, perform the Manual P3 owner and worker journeys in `README.md` on both desktop and a narrow mobile viewport. Pay special attention to browser Back, workspace switching and direct reloads of nested routes.
