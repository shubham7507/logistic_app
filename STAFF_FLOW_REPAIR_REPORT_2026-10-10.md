# MoveAI staff flow repair — 10 October 2026

## Scope

This is the GitHub Pages UI and browser-local mock workflow. No server, payroll provider, bank, real notification delivery, or cross-device sync is connected.

## Problems reproduced and fixes

| Area | What failed or confused the user | Change |
| --- | --- | --- |
| Leave | Existing demo staff had no workweek, so a leave request could say there were no scheduled workdays. | The staff screen creates a visible Monday–Saturday demo workweek from the current demo date. Owner can replace the template with an effective-dated rule. Leave defaults to the next workday and shows pending/approved history. |
| Attendance | Worker check-in and owner marking looked disconnected. | A worker check-in creates a pending day for the owner. The owner sees pending attendance and leave in Attendance & leave; this tab opens by default when action is waiting. Owner-marked attendance notifies the worker. Rest days and duplicates still show explicit errors. |
| Shifts | The publish selector could show staff from other branches. | Schedule page is scoped to the selected branch, shows a three-step guide and empty-state route to branch staff setup, and publishes a worker notification. |
| Cover | Request had no clear next step; replacement selector could include an ineligible person. | Request alerts the seller; worker sees waiting status; manager selects an active person assigned to the branch without a conflicting shift and publishes the replacement. |
| Branches | A flat list did not explain branch context or next actions. | Branch cards show address, service area, open orders, home team, cover team, selected/paused state, and actions to view shifts/manage team. Add-branch form explains the required fields. |
| Teams | New team form required users to invent a name and type. | Quick templates for morning preparation, evening preparation, counter team, and dispatch team, plus custom teams. Duplicate names within one branch are rejected. Dated cover requests reject past dates and duplicates. |
| GIRO | Device month and simulated payroll month could disagree. There was little guidance when nothing was bank ready. | Monthly bank payroll uses the demo clock consistently. Three-step guide links to Attendance & leave, posting earnings, bank readiness, and mock batch submission. A zero-ready explanation points to bank details or individual UPI/cash pay. Month selector no longer runs the generic commerce handler first. |

## How to test in the app

1. Open `seller.html` and choose **ABC Grocery**. Open **Staff → Branches & team**. Add a team using **Morning preparation**; add Asha to the team. Open **Branches**, add a branch, select it, and use **Branches & team** to grant Asha dated cover. Return to **Schedule** and check Asha is available only after that branch assignment.
2. Open `picker.html`, select **Asha Picker**, then **My work & pay**. Click **I'm here today** on a scheduled day. If it is Sunday, use a scheduled day in the mock scenario or let the owner record an extra shift. Request leave on the next workday.
3. Return to `seller.html`, **People & pay → Attendance & leave**. Approve the pending attendance. Approve paid or unpaid leave and inspect the month summary. The worker sees the decision in **My work & pay**.
4. In the seller **Schedule**, choose the selected branch, worker, date and times, then **Publish and notify worker**. In the worker **My schedule**, click **Request cover**. Return to seller **Schedule** and approve an eligible replacement. If none is available, assign another active worker to this branch first.
5. At month end in the demo, use **Advance demo to month end** in **Attendance & leave**, resolve pending requests, **Review and lock month**, then **Pay workers → GIRO monthly payroll → Post earnings**. The worker must save a verified bank account in **My work & pay** for the bank batch. Submit the mock batch and review each result. UPI and cash payments remain individual Pay workers actions.
6. Repeat for Fresh Mart, Sharma Electricals and City Fashion by switching seller and matching staff account. Each seller has its own branches and team.

## Automated validation

- `npm run test:unit`: passed.
- `npm run test:staff`: passed, including new `staff-flow-repair.e2e.mjs` with leave, attendance approval, branch creation, team template, cover, shift and mock GIRO.
- `node tests/grocery-workforce.e2e.mjs`: passed after updating its mock scenario to complete onboarding, share location before courier pickup, and settle final pay before offboarding.
- `node tests/seller-branches.e2e.mjs` and `node tests/people-core.unit.mjs`: passed.
- Every `js/*.js` file passed direct `node --check`.
- Individual static route/screen integration checks passed after updating two expectations for the current privacy text and picker navigation.
- The wrapper `npm run test:static` could not start its child `node --check` process in this sandbox (`spawnSync EPERM`). Its direct syntax equivalent and the individual integration scripts were run instead.

The automated tests exercise rendered screen HTML and the same action functions used by the UI. A real browser click-through on the published GitHub Pages link was not available in this workspace. Do the numbered manual walkthrough after pushing.

## Demo limits and next backend work

- Data is in browser localStorage. Seller and worker roles need to be tested in the **same browser profile and origin**. Other devices or incognito sessions will not share changes.
- GIRO is a simulated bank batch. No bank transfer or bank verification happens.
- Notifications are in-app mock records. No push/SMS is sent.
- The demo workweek starts when the upgraded staff screen is first opened; it does not rewrite earlier attendance. The owner should review the template and change working days where needed before payroll.
- A published shift is separate from the recurring workweek used for attendance/payroll. The owner must review both when pay depends on scheduled days.
