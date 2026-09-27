# MoveAI One — P0–P3 Test Report

Date: 27 September 2026  
Build: Phase 3 complete staff lifecycle

## Overall result

**PASS for unit, static integration, traceability, syntax, HTTP and deployment-package gates.**

The Playwright browser suites are included but were not executed in this workspace because no Chromium executable is installed. This is reported as an environment limitation, not a browser pass.

## Delivered correction to Phase 3

The earlier owner-side invitation shortcut has been replaced by a testable separation of responsibilities:

1. Owner creates invitation.
2. Staff confirms the exact invited mobile.
3. Staff verifies OTP `123456`.
4. Staff accepts or declines.
5. Staff supplies identity, emergency and Bank/UPI information.
6. Submission waits for owner review without a Staff ID.
7. Owner can request one-section correction, reject or approve.
8. Staff fixes only the returned section and resubmits.
9. Approval generates `STF-TRA-*`, pay/joining information and role permissions.
10. Active staff receives a restricted staff workspace; owner screens remain blocked.

## Automated results

| Gate | Result | Evidence |
|---|---|---|
| JavaScript syntax | PASS | App, config, mock data, People screens/rules and P3 E2E syntax |
| Unit tests | PASS | 10 roles, 45 routes, identity, business, staff lifecycle and permissions |
| Static integration | PASS | 59 navigation entries, 14 business People screens, 6 staff lifecycle screens and 3 worker screens |
| Story/test traceability | PASS | 45 P0–P3 user stories mapped to 45 unique E2E scenario IDs |
| P2 regression | PASS | Submit for Admin review remains clickable and missing-step aware |
| Privacy | PASS | Mobile masking and owner-only action exclusions |
| Netlify SPA contract | PASS | `index.html`, `_redirects` and `netlify.toml` |
| Original v44 reference | PASS | Preserved unchanged |
| Playwright browser execution | NOT RUN | Chromium executable absent in this workspace |

## Phase coverage

| Phase | Covered capabilities |
|---|---|
| P0 | Shell, workspaces, navigation, mobile More, route guards, shared states and reset |
| P1 | Mobile consent, OTP rules, duplicate identity recovery, Personal workspace and business invitations |
| P2 | Multi-service business, legal/KYC/branch/bank, Admin decisions, correction/resubmission and expansion |
| P3 | People, staff OTP invitation, self-service, owner review, Staff ID, scopes, hiring, Owner Cover and offboarding |

## Browser suite included

`tests/p3-people.e2e.cjs` covers:

- Invitation opening as the invited staff member
- Exact-mobile OTP verification
- Invitation acceptance
- Three-section self-service submission
- One-section Bank/UPI correction
- Resubmission
- Owner approval and Staff ID creation
- Staff direct-link denial for People and Business
- Own-profile access
- Branch/service access save
- Owner Cover limits
- Safe offboarding with retained dues

Run in an environment with Playwright Chromium:

```bash
npm run test:e2e
```

## Manual UAT

Use `P0-P3-E2E-TEST-PLAN.md`. It contains test data, exact clicks, expected results, negative scenarios, desktop/mobile requirements and the 45-story coverage index.
