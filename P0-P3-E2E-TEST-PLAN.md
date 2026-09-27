# MoveAI One — End-to-End Test Plan Through Phase 3

Version: Phase 3 complete baseline  
Date: 27 September 2026

## Test package and credentials

- Start route: `/#/home`
- Prototype OTP: `123456`
- Existing account: `9876543210`
- New account: `9123456789`
- Seeded staff invitation: Pankaj Meena, `9876501199`
- Primary owner workspace: Raj Logistics (`transporter`)
- Reset before each major journey: sidebar **Reset demo data**

## Required environments

Test once at desktop width 1440×900 and once at mobile width 390×844. On Netlify, also reload every important hash route directly and use browser Back/Forward.

## P0 — Foundation E2E

| Test | Steps | Expected result |
|---|---|---|
| P0-E2E-01 Role navigation | Switch through Personal, Goods, Transporter, Truck Owner, Movers, Commercial Driver, Personal Driver, Helper, Staff when available and Admin | Workspace title, navigation and Home content change together; no console error |
| P0-E2E-02 Workspace isolation | From Personal open Admin Audit URL; from Admin open Money URL | Access denied; protected content does not render |
| P0-E2E-03 Unknown route | Open `/#/does-not-exist` | Page not found with Home recovery action |
| P0-E2E-04 Mobile navigation | Use 390×844 viewport; open More | Five bottom actions maximum; secondary allowed routes appear in More |
| P0-E2E-05 Direct reload | Open Vehicle → Fleet, reload browser | Fleet remains selected and renders successfully |
| P0-E2E-06 Shared states/reset | Open Screen states, trigger actions, then Reset demo data | Four states work; reset returns to seeded Personal Home |

## P1 — Identity E2E

### New identity

1. Personal Home → **Test signup journey** → **Continue with mobile**.
2. Enter `9123456789` without consent and submit: consent error must appear.
3. Accept consent and submit.
4. Enter a wrong OTP: error must appear and attempts decrease.
5. Enter `123456`.

Expected: one new identity, verified mobile and exactly one Personal workspace.

### Existing identity and duplicate protection

1. Restart signup.
2. Enter `9876543210`, accept consent and use OTP `123456`.
3. Continue to the existing account.

Expected: person `PER-1001`; existing workspaces restored once; no duplicate identity.

### Personal business invitations

1. Personal → Invitations.
2. Accept Raj Logistics and decline SafeMove Packers.
3. Reopen workspace switcher.

Expected: Raj Logistics appears once; SafeMove does not; both actions appear in invitation history. A business workspace cannot deep-link to Personal Invitations.

## P2 — Business onboarding E2E

### Create, submit and approve

1. Personal → Add or continue a business.
2. Legal name: `Sinha Cargo & Movers`.
3. Select Transport, Own Vehicles and Movers.
4. PAN `ABCDE1234F`; GSTIN `09ABCDE1234F1Z5`; address `Sector 62, Noida, Uttar Pradesh`.
5. Use every required sample KYC document.
6. Save default branch.
7. Account number `451278963214`; IFSC `HDFC0001842`.
8. Click **Submit for Admin review**.
9. Switch to Platform Admin → Approvals → open the submitted application → Approve.

Expected: Under review before decision; Approved after decision; one Sinha Cargo & Movers business workspace; masked verified bank.

### Missing-step routing

Reset. Start a business but omit legal, KYC, branch or bank information and click **Submit for Admin review** from Application status after each omission.

Expected: button is always clickable and opens the exact first missing section.

### Correction and rejection

Use the seeded correction application or submit a business application. As Admin request a Bank correction with reason. As owner fix Bank and resubmit. Separately reject another application with reason.

Expected: only affected section reopens; decision version/history increments; rejection grants no business workspace.

### Branch and service safety

1. In an approved business, try disabling a branch with active work.
2. Disable a branch with zero active work.
3. Request one new service from Business.

Expected: active branch blocked; empty branch disabled; common KYC reused for expansion.

## P3 — Full staff invitation lifecycle

### Happy path with one correction

1. Reset → switch to **Raj Logistics** → **People**.
2. Click **Pankaj Meena · Test invitation as staff**.
3. Change the displayed mobile and try submitting.
4. Restore `9876501199`, click **Send OTP**.
5. Enter wrong OTP once, then `123456`.
6. Review invitation and click **Accept invitation**.
7. Click **Use sample**, **Add sample**, **Add sample** for identity, emergency and bank.
8. Click **Submit for owner review**.
9. Verify Joining status shows owner approval pending and Staff ID is not created.
10. Click **Return to owner test view** → **Review joining details**.
11. Select Bank/UPI, reason `Bank proof is unclear`, and **Request correction**.
12. Click **Test correction as staff**.
13. Fix only Bank/UPI and resubmit.
14. Return to owner → Review → set joining date, pay and manager → **Approve and activate**.

Expected final state:

- Invitation history contains invited, mobile verified, accepted, submitted, correction requested, resubmitted and approved.
- Status is Active.
- Staff ID begins `STF-TRA-`.
- Role permissions are assigned without owner-only permissions.
- Identity/bank values remain masked to owner.

### Rejection path

Create another invitation with mobile `9123405678`. Complete OTP and staff information, return to owner, enter a reason and Reject.

Expected: status Rejected, no Staff ID, no active business workspace access, review/audit history retained.

### Duplicate-mobile path

Invite a number already present in staff or candidate mock data.

Expected: invitation links the existing identity/name; a second pending invitation for the same business/mobile is not created.

### Role boundary after activation

1. From active Pankaj profile click **Test staff workspace**.
2. Open Home, My Work, Messages, My Money and My Profile.
3. Directly open `/#/people`, `/#/business`, `/#/branches`, `/#/bank` and `/#/ownerCover`.

Expected: only staff navigation is visible; own profile is visible; every owner route is Access denied.

## P3 — Hiring and worker marketplace

1. Transporter → People → Hiring → Post opening.
2. Test invalid pay range; test fixed-term without end date.
3. Publish Heavy Truck Driver, Jaipur Branch, trip-only, ₹3,000–₹4,500.
4. Switch to Commercial Driver → Profile; publish compatible availability.
5. Work → open matching job → Apply; then withdraw once and apply using a fresh reset.
6. Owner → Applications; progress New → Reviewed → Shortlisted → Interview → Offer → Hired.

Expected: matching considers capability/location/availability; history retains every state; trip-only creates assignment only. Repeat with permanent and fixed-term to confirm a staff relationship is created.

## P3 — Role access, Owner Cover and offboarding

### Role and branch/service scope

Open an active staff member → Access and role. Save without a branch, then with one branch/service.

Expected: missing branch blocked; saved permission set contains the selected role permissions and never `business.ownership`, `bank.change`, `roles.owner` or `business.close`.

### Owner Cover

Choose Ravi Kumar, one branch, 28 Sep–05 Oct and ₹25,000 payment limit.

Expected: active cover record; date/branch/limit retained; owner-only actions listed as blocked; audit event created.

### Safe offboarding

Open Mohan Yadav → Offboard. Try completion before reassignment, then use automatic reassignment and complete.

Expected: first attempt blocked; assignments cleared; status Offboarded; future access stopped; ₹4,500 dues and historical records retained.

## Automated commands

```bash
npm run test:unit
npm run test:static
npm run test:e2e
```

Automated suite mapping:

| Suite | Coverage |
|---|---|
| `config.unit.mjs` | Role, route and navigation registry |
| `p1-identity.unit.mjs` | Mobile, OTP and duplicate identity rules |
| `p2-business.unit.mjs` | Services, KYC, bank, branch and Admin boundaries |
| `p3-people.unit.mjs` | Roles, staff lifecycle, exact-mobile acceptance, review, hiring and offboarding rules |
| `p0-static.integration.mjs` | Shell, DOM contract, routes and Netlify fallback |
| `p2-screens.integration.mjs` | Business/Admin screens and clickable submission |
| `p3-screens.integration.mjs` | Owner, staff lifecycle and independent-worker screens |
| `p0-foundation.e2e.cjs` | All workspace navigation, mobile shell and route guards |
| `p1-identity.e2e.cjs` | New/existing identity and invitation access |
| `p2-business.e2e.cjs` | Business creation through Admin approval |
| `p3-people.e2e.cjs` | OTP staff invite through correction, activation, staff boundary, Owner Cover and offboarding |

## Release checklist

- Unit tests pass.
- Static integration tests pass.
- Browser E2E passes in an environment with Playwright Chromium.
- No JavaScript page or console error.
- Netlify ZIP has `index.html`, `_redirects` and `netlify.toml` at its root.
- Direct route reload works.
- Desktop and mobile manual journeys pass.
- Original v44 reference remains unchanged.

## Story-to-test coverage index

| Phase | E2E scenario IDs covered by this plan |
|---|---|
| P0 | P0-E2E-01, P0-E2E-02, P0-E2E-03, P0-E2E-04, P0-E2E-05, P0-E2E-06 |
| P1 | P1-E2E-01, P1-E2E-02, P1-E2E-03, P1-E2E-04, P1-E2E-05, P1-E2E-06, P1-E2E-07 |
| P2 | P2-E2E-01, P2-E2E-02, P2-E2E-03, P2-E2E-04, P2-E2E-05, P2-E2E-06, P2-E2E-07, P2-E2E-08, P2-E2E-09, P2-E2E-10, P2-E2E-11, P2-E2E-12 |
| P3 | P3-E2E-01, P3-E2E-02, P3-E2E-03, P3-E2E-04, P3-E2E-05, P3-E2E-06, P3-E2E-07, P3-E2E-08, P3-E2E-09, P3-E2E-10, P3-E2E-11, P3-E2E-12, P3-E2E-13, P3-E2E-14, P3-E2E-15, P3-E2E-16, P3-E2E-17, P3-E2E-18, P3-E2E-19, P3-E2E-20 |
