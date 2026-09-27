# MoveAI One vNext — Phase P2

Phase P2 adds legal business, multi-service, branch, KYC, bank and Admin approval flows on the completed P0/P1 foundation. The v44 reference remains unchanged.

## Run locally

Serve this directory with any static web server and open `index.html`.

## Included

- Mobile signup with consent and Indian-number validation
- OTP expiry, resend wait, attempt limit and mock OTP `123456`
- Duplicate-mobile recovery into one existing identity
- Automatic Personal workspace creation exactly once
- Safe workspace switching and strict route boundaries
- Pending business invitations with accept, decline and history
- Central configuration for 9 workspace contexts and 20 routes
- Desktop sidebar, mobile bottom navigation and Netlify SPA routing
- Resettable mock data and a complete signup demo from Personal Home
- One legal business with Transport, Own Vehicles, Movers and Goods services
- Save-and-resume legal details, service-aware KYC and a default branch
- Masked bank destination with verification and payout guard
- Admin approve, request correction or reject with versioned history
- Section-specific correction and resubmission
- Later service expansion that reuses common KYC

## Tests

```bash
npm run test:unit
npm run test:static
npm run test:e2e
```

The browser E2E suite needs a Playwright Chromium binary. Without it, the unit, static integration and HTTP smoke gates still run. The included P1 browser suite covers new identity, duplicate recovery, invitations and workspace boundaries.

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
