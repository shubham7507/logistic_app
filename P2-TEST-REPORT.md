# MoveAI One vNext — Phase P2 Test Report

Date: 27 September 2026  
Scope: Legal business, multiple services, KYC, branches, bank information, Admin approval and service expansion

## Outcome

Phase P2 is implemented on the completed P0/P1 project. The v44 reference remains byte-identical to its source ZIP.

| Gate | Result | Evidence |
|---|---|---|
| Configuration regression | PASS | 9 roles, 28 routes, no duplicate or unknown navigation |
| P1 identity regression | PASS | OTP, mobile validation, duplicate recovery and Personal workspace rules |
| P2 business rules | PASS | 4 services, shared KYC, bank mask, payout guard, branch guard and workspace mapping |
| P2 screen integration | PASS | 6 owner screens, 4 business screens and 2 Admin screens rendered |
| Permission boundaries | PASS | Personal onboarding and Admin review routes reject unauthorized workspaces |
| Bank privacy | PASS | Saved/review screens show only masked account data |
| Admin decisions | PASS | Approve, correction and reject actions exist with versioned audit data |
| Static integration | PASS | 54 visible navigation combinations and Netlify SPA configuration |
| JavaScript syntax | PASS | Application, business UI and business-rule modules checked by Node |
| HTTP asset smoke | PASS | Index, application, P2 modules and CSS returned HTTP 200 |
| Frozen v44 regression | PASS | Extracted v44 ZIP and reference folder have no recursive differences |
| Playwright P2 E2E | NOT RUN | Chromium executable is not installed in this environment |

## Implemented journey

1. **Add business** — enter one legal name and select any combination of Transport, Own Vehicles, Packers & Movers and Goods Business.
2. **Business details** — entity type, PAN, conditional GSTIN and registered address; progress saves between screens.
3. **Business KYC** — service-aware requirements with realistic sample uploads; common KYC is reused.
4. **Branches** — first branch becomes the default; later branch creation is supported; branches with active work cannot be disabled.
5. **Bank information** — validates account/IFSC, masks the saved account and blocks payout until verification.
6. **Application status** — completion checklist, current state and versioned decision timeline.
7. **Admin queue and review** — displays owner, capabilities, documents, branch and masked bank details.
8. **Admin decision** — approve, reject or request a correction against a named section with reason, reviewer, date and version.
9. **Correction resumption** — returns the owner directly to details, KYC, branch or bank; resubmission does not repeat completed sections.
10. **Approved Business** — opens the correct business workspace with Business, Branches, Bank and Add Service screens.
11. **Service expansion** — uses verified common KYC and preserves existing staff, branches, fleet and history.

## Seeded mock applications

| Application | Purpose |
|---|---|
| APP-2001 · Sinha Cargo & Movers | Owner end-to-end draft and submission |
| APP-1988 · Aarav Freight Services | Ready for Admin review; previous correction retained |
| APP-1975 · North Star Movers | Bank correction state and direct resume |

## Browser test ready for CI

`tests/p2-business.e2e.cjs` covers multi-service creation, KYC, branch and bank completion, submission, Admin approval, approved workspace creation, branch-disable safety and cross-role denial. Run `npm run test:e2e` where Playwright Chromium is installed.
