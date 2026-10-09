# MoveAI static demo review — 9 October 2026

## Changes in this package

- Grouped the mobile More menu by Orders, Catalog, Staff, Money, Business, and remaining routes. Existing route buttons and permissions remain in use.
- Added a visible simulated-location start button on delivery tracking, plus the time of the last location update. If browser GPS fails before any fix, the screen returns to a state where the courier can choose the demo option.
- Changed staff UPI payments and advances to wait for both owner and worker confirmation before posting. A mismatch becomes a dispute; an unconfirmed transfer does not reduce the due balance.
- Labeled staff and monthly bank payments as simulated.
- Updated the role and onboarding tests that had assumptions from before the redesigned lifecycle; added a focused cross-role test.

## Checks actually run

| Check | Result | Detail |
|---|---|---|
| `npm run test:unit` | PASS | Existing unit script completes. |
| `npm run test:demo` | PASS | Three-seller COD checkout through delivery; joining approval; mobile grouping; pending, posted and disputed UPI staff payment. This executes model actions in Node, not browser clicks. |
| `npm run test:commerce` | FAIL | The old `mixed-marketplace.e2e.mjs` first stops at seller acceptance because UPI checkout is pending until confirmed. A separate inventory of the legacy scripts found 18 failures, mostly assumptions from earlier payment, joining and tracking rules. These tests must be migrated to the current flow; they were not deleted or skipped. |
| `npm run test:static` | BLOCKED | The test runner's `spawnSync` of Node fails with EPERM in this execution environment. This is an environment limitation, not proof that the static checks pass or fail. |

## What still needs hands-on verification

1. Open the pages on desktop and phone widths. Check More groups, form spacing, invite approval, shift scheduling, task offers, map loading, payment prompts and navigation between the separate role pages.
2. Confirm that GPS permission denial shows the demo-location action and that two simultaneous delivery orders keep independent tracking sessions.
3. Complete a UPI handoff on an actual phone. The browser may open a UPI app, but no bank callback exists, so this is only a UI prototype.
4. Migrate the remaining old commerce scripts, then rerun the complete legacy suite. Do not use the current failing suite as a release pass.

## Static-demo boundary

`localStorage` shares data only among pages in one browser profile. Separate users/devices, real OTP, live dispatch, bank verification, money movement, and server-driven tracking need a backend later.
