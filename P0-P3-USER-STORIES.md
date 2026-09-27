# MoveAI One — Implemented User Stories Through Phase 3

Version: Phase 3 complete baseline  
Date: 27 September 2026  
Source of truth: this file maps every implemented story to a screen and E2E scenario.

## Definition of Done

Every story below must have:

1. A reachable screen or enforced system behavior.
2. Realistic resettable mock data.
3. Role and direct-link permission checks.
4. A positive E2E scenario and an important failure scenario.
5. Regression coverage for all earlier phases.

## Phase 0 — Application foundation

| ID | Actor | User story | Acceptance criteria | Screen/route | E2E |
|---|---|---|---|---|---|
| P0-US-01 | Any user | I can see a simple role-specific home and navigation | Current workspace name, allowed navigation and mock activity render together | Home | P0-E2E-01 |
| P0-US-02 | Multi-role user | I can switch between personal, business, worker and Admin workspaces | One switcher; current workspace is highlighted; route/navigation refresh together | Workspace switcher | P0-E2E-02 |
| P0-US-03 | Mobile user | I get a compact bottom navigation | Maximum four primary actions plus More; remaining allowed routes appear in More | Mobile shell | P0-E2E-03 |
| P0-US-04 | Any user | I receive a safe response for unknown or forbidden links | Unknown route shows Page not found; forbidden route shows Access denied without loading information | Error states | P0-E2E-04 |
| P0-US-05 | Tester | I can inspect loading, empty, error and pending-sync patterns | Four shared state examples are visible and test actions respond | Screen states | P0-E2E-05 |
| P0-US-06 | Tester | I can reset the prototype | Reset restores the original authenticated Personal workspace and seeded mock data | Sidebar reset | P0-E2E-06 |

## Phase 1 — Identity and workspace access

| ID | Actor | User story | Acceptance criteria | Screen/route | E2E |
|---|---|---|---|---|---|
| P1-US-01 | New user | I can start with my Indian mobile number | Valid 10-digit mobile and consent are required before OTP | Mobile signup | P1-E2E-01 |
| P1-US-02 | New user | I can verify my mobile securely | Prototype OTP 123456 works; wrong, expired and attempt-limit states are handled | Verify mobile | P1-E2E-02 |
| P1-US-03 | New user | I automatically receive one Personal workspace | Successful OTP creates one identity and exactly one Personal workspace | Personal Home | P1-E2E-03 |
| P1-US-04 | Existing user | I return to my existing identity instead of creating a duplicate | Known mobile recovery preserves one identity and unique workspaces | Account recovery | P1-E2E-04 |
| P1-US-05 | Invited user | I can review business invitations linked to my verified mobile | Business, branch, role, inviter and expiry are displayed | Invitations | P1-E2E-05 |
| P1-US-06 | Invited user | I can accept or decline an invitation | Accept adds authorized workspace once; decline adds no access; history is retained | Invitations | P1-E2E-06 |
| P1-US-07 | Business user | I cannot open Personal invitation screens | Direct link is denied from a business workspace | Route guard | P1-E2E-07 |

## Phase 2 — Business onboarding and Admin approval

| ID | Actor | User story | Acceptance criteria | Screen/route | E2E |
|---|---|---|---|---|---|
| P2-US-01 | Business owner | I can enable several services under one legal business | Transport, Own Vehicles, Movers and Goods can be selected without separate legal profiles | Add business | P2-E2E-01 |
| P2-US-02 | Business owner | I can provide legal details with service-aware validation | PAN is validated; Transport/Fleet requires GSTIN; address is required | Business details | P2-E2E-02 |
| P2-US-03 | Business owner | I can upload the required KYC set | Required documents change with services; missing items block continuation | Business KYC | P2-E2E-03 |
| P2-US-04 | Business owner | I can create the default operating branch | Branch name, full address, service area and manager are retained | Branches | P2-E2E-04 |
| P2-US-05 | Business owner | I can add a payout destination safely | Account and IFSC validation apply; stored display is masked | Bank information | P2-E2E-05 |
| P2-US-06 | Business owner | I can submit for Admin review | Button always responds; incomplete application opens the exact missing step; complete application becomes Under review | Application status | P2-E2E-06 |
| P2-US-07 | Platform Admin | I can approve, reject or request a section correction | Reason is mandatory for negative decisions; versioned decision history is retained | Approvals/review | P2-E2E-07 |
| P2-US-08 | Business owner | I can fix only the requested section | Resume opens the affected section; resubmission preserves completed information | Correction flow | P2-E2E-08 |
| P2-US-09 | Approved owner | I receive one approved business workspace | Approval creates one workspace with services, branches and verified masked bank | Workspace switcher | P2-E2E-09 |
| P2-US-10 | Approved owner | I can add services later without repeating common KYC | Expansion reuses verified common information and sends only new capability for review | Business | P2-E2E-10 |
| P2-US-11 | Branch owner | I cannot disable a branch with active work | Active work blocks disable; clear branches can be disabled | Branches | P2-E2E-11 |
| P2-US-12 | Non-Admin | I cannot open Admin application review | Direct link is denied and no application data is rendered | Route guard | P2-E2E-12 |

## Phase 3 — People, hiring and controlled delegation

| ID | Actor | User story | Acceptance criteria | Screen/route | E2E |
|---|---|---|---|---|---|
| P3-US-01 | Owner | I have one People hub for team, hiring, roles and Owner Cover | Active staff, invitations, owner reviews and openings are visible as counts | People | P3-E2E-01 |
| P3-US-02 | Owner | I can invite staff by mobile with role, branch and employment type | Valid mobile, role, branch and pay type required; duplicate pending invitation is blocked | Add staff | P3-E2E-02 |
| P3-US-03 | Existing worker | My known mobile is linked instead of duplicated | Invitation records linked person ID and uses the existing name | Add staff | P3-E2E-03 |
| P3-US-04 | Invited staff | I can verify that the invitation belongs to my mobile | Only exact invited mobile proceeds; OTP 123456, expiry and attempt rules apply | Staff invitation/OTP | P3-E2E-04 |
| P3-US-05 | Invited staff | I can accept or decline after verification | Accept creates profile-pending staff access; decline grants no business access; history retained | Staff invitation | P3-E2E-05 |
| P3-US-06 | Staff | I enter my own identity, emergency and payment information | All three sections are required; owner does not upload them; sensitive values are masked | Staff onboarding | P3-E2E-06 |
| P3-US-07 | Staff | I can submit my joining profile to the owner | Status becomes Submitted and no permanent Staff ID exists before approval | Joining status | P3-E2E-07 |
| P3-US-08 | Owner | I can request correction of one section | Reason and section required; only chosen section becomes Correction required | Staff review | P3-E2E-08 |
| P3-US-09 | Staff | I can fix only the returned section | Other completed sections remain verified; resubmission returns status to Submitted | Staff onboarding | P3-E2E-09 |
| P3-US-10 | Owner | I can approve and activate staff | Staff ID, joining date, pay, manager and role permissions are created on approval | Staff review | P3-E2E-10 |
| P3-US-11 | Owner | I can reject an onboarding submission | Reason required; status becomes Rejected and no active access/Staff ID is granted | Staff review | P3-E2E-11 |
| P3-US-12 | Staff | I see only my role-specific workspace | Own Home, Work, Messages, Money and Profile; People and Business direct links denied | Staff workspace | P3-E2E-12 |
| P3-US-13 | Owner | I can apply a simple role template and branch/service scope | Seven templates; at least one branch; owner-only permissions never included | Roles/access | P3-E2E-13 |
| P3-US-14 | Owner | I can post a permanent, fixed-term or trip-only opening | Valid pay range; fixed-term requires end date; branch and requirements retained | Hiring | P3-E2E-14 |
| P3-US-15 | Driver/Helper/Staff candidate | I can publish availability and apply for matching work | Capability, location and availability matching; apply and withdraw supported | Work/Profile | P3-E2E-15 |
| P3-US-16 | Business hiring staff | I can move an applicant through the pipeline | New, reviewed, shortlisted, interview, offer, hired and rejected states retained | Applicants | P3-E2E-16 |
| P3-US-17 | Business hiring staff | Hiring creates the correct relationship | Permanent/fixed-term creates staff; trip-only creates assignment only | Applicants | P3-E2E-17 |
| P3-US-18 | Owner | I can appoint temporary Owner Cover | Delegate, date range, branch and payment limit required; access expires and stays audited | Owner Cover | P3-E2E-18 |
| P3-US-19 | Owner Cover | I cannot perform owner-only actions | Ownership, owner bank changes, owner role and business closure remain blocked | Permission guard | P3-E2E-19 |
| P3-US-20 | Owner | I can offboard staff safely | Active work/vehicles must be reassigned; access stops; dues, documents, messages and audit history remain | Offboarding | P3-E2E-20 |

## Phase gate

Phase 3 is releasable only when all P0–P3 automated unit/static suites pass, the deployment ZIP passes extraction tests, and the manual browser scenarios in `P0-P3-E2E-TEST-PLAN.md` pass on desktop and mobile.
