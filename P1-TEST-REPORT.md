# MoveAI One vNext — Phase P1 Test Report

Date: 27 September 2026  
Scope: Identity, consent, OTP, duplicate recovery, Personal workspace, switching and invitations

## Outcome

Phase P1 is implemented on the clean P0 project. The v44 reference folder was not edited.

| Gate | Result | Evidence |
|---|---|---|
| Configuration unit test | PASS | 9 roles, 20 routes, no duplicate or unknown navigation |
| P1 identity unit test | PASS | Mobile validation, masking, OTP validity/expiry/lock and resend wait |
| Duplicate identity rule | PASS | Known mobile resolves to the existing person; no second person is created |
| Personal workspace singleton | PASS | New identity starts with exactly `['personal']` |
| Invitation data and boundary | PASS | 2 pending + 1 expired; route allowed only in Personal |
| Static integration | PASS | 54 visible role/route combinations and 9 required shell nodes |
| JavaScript syntax | PASS | `app.js` and `onboarding.js` checked by Node |
| HTTP asset smoke | PASS | Index, app, onboarding, identity and CSS returned HTTP 200 |
| Netlify SPA fallback | PASS (configuration) | `_redirects` and `netlify.toml` send application routes to `index.html` |
| Frozen v44 regression | PASS | Extracted v44 ZIP and reference folder produced no recursive differences |
| Playwright browser suite | NOT RUN | Chromium binary is not installed in this execution environment |

## Implemented screen-by-screen journey

1. **Welcome** — explains one identity and separate workspaces; starts mobile verification.
2. **Mobile signup** — validates a 10-digit Indian mobile and requires consent before OTP.
3. **OTP verification** — 2-minute expiry, 30-second resend wait, 5-attempt lock; prototype OTP is `123456`.
4. **New identity completion** — creates one person and one Personal workspace, then opens Personal Home.
5. **Duplicate recovery** — existing mobile `9876543210` shows the existing identity after OTP and reopens it without duplication.
6. **Personal Home** — surfaces pending invitations and retains the signup test entry.
7. **Pending invitations** — shows business, branch, role, inviter and expiry; supports accept, decline and history.
8. **Workspace switcher** — shows only authorized workspaces; accepted access is added once.
9. **Route guards** — signed-out users stay in onboarding; business workspaces cannot deep-link into Personal invitations.

## Mock data

| Purpose | Value |
|---|---|
| New mobile | `9123456789` |
| Existing mobile | `9876543210` |
| OTP | `123456` |
| Pending invitations | Raj Logistics / Operations Staff; SafeMove Packers / Moving Coordinator |
| Expired invitation | Sharma Foods / Dispatch Staff |

## Browser suite ready for CI

`tests/p1-identity.e2e.cjs` covers the new-user journey, duplicate recovery, invitation acceptance, deduped workspace access and cross-workspace denial. Run `npm run test:e2e` in a CI or local environment with Playwright Chromium installed.
