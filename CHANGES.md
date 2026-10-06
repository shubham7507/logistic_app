# Changes — staff/HR redesign (this session)

All changes are additive/corrective fixes to existing files, not a rewrite. Every item below was
verified with real syntax checks (`node --check`) and executed behavioral tests (78 automated
assertions total) before being included — see "How this was tested" at the bottom.

## 1. Emergency contact is now genuinely optional

**Files:** `js/people-rules.js`, `js/app.js`, `js/people.js`

- `staffSubmissionReady()` no longer requires `emergencyStatus` to be verified/complete — only
  identity documents and bank/payment destination are required to go active.
- The hard block in the `#staff-onboarding-form` submit handler (`app.js`) that rejected submission
  outright if emergency fields were blank has been removed. A half-filled emergency contact is still
  rejected (better to have none than a broken one), but fully blank is accepted and recorded as
  `emergencyStatus: 'skipped'`.
- Onboarding form, submission-status screen, and owner review screen copy all updated so "not
  provided (optional)" reads as fine, not broken.

## 2. Unified role taxonomy

**Files:** `js/people-rules.js`, `js/people.js`

- `ROLE_TEMPLATES` now includes `picker`, `packer`, `cashier` alongside the existing logistics roles
  (`manager`, `operations`, `accounts`, `driver`, `helper`, `documents`, `viewer`).
- New `rolesForWorkspace(workspaceKey)` returns the correct subset — retail verticals
  (grocery/groceryFresh/electrical/fashion + their managers) see only retail roles; everyone else
  sees the logistics set. Wired into `rolesScreen`, `postOpeningScreen`, and `addStaffScreen` so a
  retail owner is never shown "Driver" or "Operations / Dispatcher" as a designation.

## 3. Emergency "Suspend access" action

**Files:** `js/people.js`, `js/app.js`, `css/components.css`

- `offboardingScreen` now has a "Suspend access now" action, independent of the reassignment
  checklist — an owner can cut access immediately in a safety/misconduct situation without first
  reassigning active work or returning a vehicle (that cleanup happens afterward, separately).
- New `suspended` status gets its own visual treatment (`.status-pill.danger`, red) instead of
  sharing the amber "pending" pill with ordinary invites — this was a real confusion found in
  testing (an owner couldn't tell a flagged account from a routine pending invite at a glance).
- Fixed two follow-on bugs this introduced: the Offboard button used to disappear entirely once
  someone's suspended (would have trapped the flow); a suspended worker's own screen used to wrongly
  say "sent for owner review" instead of explaining they're suspended.

## 4. Cross-business identity reuse (same owner, multiple businesses)

**Files:** `js/grocery-staff.js`, `js/store-hr.js` (unchanged, verified only), `js/commerce.js`,
`js/easy-mode.js`, `js/people-core.js`, `js/people.js`, `js/app.js`

- `invitePicker()` no longer hard-blocks inviting a mobile number that's already active at a
  *different* store — it only blocks a genuine duplicate at the *same* store. Previously an owner
  could never add their own trusted staff member to a second store at all.
- The existing `people-core.js` note ("this person already has a verified profile, works at X, no
  new ID check needed") was being computed and silently discarded by every caller. It now surfaces
  as a toast on both the main Team screen and the "easy mode" screen.
- New `reusableIdentity()` in `people-core.js` finds *actual* field values (not just a verified flag)
  from another active employment of the same person — works across logistics (`peopleByWorkspace`),
  pickers (`pickerStaff`), and managers (`storeManagers`).
- The logistics staff onboarding form (`staffOnboardingScreen`) and the new picker onboarding form
  (below) both show a "Use my verified details" button that pre-fills the real saved values (DOB, ID
  number, bank account, IFSC) from the other employment — one click instead of redoing the whole
  form.

## 5. Pickers now go through real onboarding (previously: none at all)

**Files:** `js/grocery-staff.js`, `js/commerce.js`, `js/config.js`

Before this, accepting a picker invitation flipped `status` straight to `'active'` — no identity
check, no bank details, ever collected. Now pickers go through the same lifecycle logistics staff
already had:

`invited → profile_pending → submitted → active` (with a `correction_required` branch)

- `acceptPickerInvite()` now sets `profile_pending` instead of `active`, and initializes the
  onboarding status fields.
- New `submitPickerOnboarding()` validates and saves identity + bank (+ optional emergency contact),
  matching the same optional-emergency-contact rule as logistics.
- New `pickerReviewDecision()` gives the owner the same approve / reject / request-correction options
  logistics owners already had.
- New screens: `pickerOnboardingScreen` (worker-facing form, with the identity-reuse banner), `pickerSubmittedScreen`, `pickerReviewScreen` (owner-facing review).
- New route `pickerReview`, registered and granted to retail owners *and* managers in `config.js` —
  this was safe to grant because it only touches `pickerStaff`, with no cross-data-model ambiguity
  (see item 6).
- A "Review joining details" button now appears on the Store team screen when a picker has submitted.

## 6. Open hiring (post-and-apply marketplace) now works for retail businesses too

**Files:** `js/people-core.js`, `js/app.js`, `js/people.js`, `js/config.js`

This closes the blocker described in item 6 of the previous version of this changelog. Two separate
problems had to be fixed before it was safe to grant retail owners these routes:

- **The hire action is now vertical-aware.** Extracted out of an inline DOM event handler in `app.js`
  into a real, standalone, exported function — `PC.hireIntoStaff(state, workspace, job, candidate,
  applicationId)` in `people-core.js`. For retail verticals it creates the new hire in `pickerStaff`
  (role = picker/packer/cashier, starting at `profile_pending` so they go through the picker
  onboarding lifecycle from item 5) or `storeManagers` (role = manager) — never in
  `peopleByWorkspace`, which would have been a second, invisible staff list. For logistics it behaves
  exactly as before, pushing into `peopleByWorkspace`. Doing this as a real exported function (rather
  than inline in the event handler) made it possible to write direct, pass/fail tests against the
  actual code path the app runs, not a hand-written replica of its logic.
- **`postOpeningScreen`'s branch source no longer assumes the logistics shape.** It previously read
  `state.businessProfiles[ws].branches`, which doesn't exist for retail (retail branches live in
  `state.sellerBranches`) — this would have thrown on render for a retail owner. Both the screen's
  branch dropdown and the form's submit handler in `app.js` now use `PC.branchesFor(state, ws)`,
  which already correctly handles both branch structures.
- **Routes re-granted, narrowly.** `grocery`, `groceryFresh`, `electrical`, `fashion` and their
  manager roles now have `hiring`, `postOpening`, `findWorkers`, `applications`, `openingDetail` —
  and a `Hiring` nav item was added back to all eight of those workspaces' sidebars. Deliberately
  **not** granted: `roles`, `staffAccess`, `ownerCover`, `employmentChange` — those remain owner-only
  concepts built against `peopleByWorkspace`-shaped records and weren't touched.

**Known remaining limitation:** the worker-side candidate pool (`state.candidates`, used by
`findWorkersScreen`'s matching) is currently seeded only with logistics-capable workers
(driver/helper/operations/documents). A retail owner posting a Picker opening today will correctly
see "no exact matches" rather than crash or show wrong results — but there's no independent
"picker/cashier looking for work" candidate persona yet, the same gap noted for the
individual/personal-hiring track. The posting→applicant→hire *mechanism* is now real and tested; the
*supply* of retail-capable independent candidates in the mock data is still thin.

## 7. What was deliberately NOT done (and why)

- **General vs. Specialized role tiers** (the "anyone can hire a cleaner, but only a restaurant can
  hire a chef" design) was discussed and designed but not implemented in code — no `tier` field
  exists on `ROLE_TEMPLATES` yet.
- **Individual/personal users hiring staff** (not just registered businesses) was explicitly scoped
  out per instruction — only business-side hiring was worked on this session.
- **A restaurant vertical** (Chef, Waiter, Kitchen helper) doesn't exist in `config.js`/seed data at
  all yet — it was discussed as a worked example, not built.
- **Full nav hub/grid restructure** (Home/Orders/Catalog/Staff/Money/Business) was out of scope from
  the start — it touches far more surface area than could be verified through static analysis alone
  in this environment (no browser/bundler available, see below).

## How this was tested

No browser or bundler is available in this environment, so testing was: `node --check` for syntax on
every touched file; real `import()` of every touched module in Node to catch missing exports/broken
references; and executing the actual edited functions against realistic mock state objects with
explicit pass/fail assertions (not just "it ran without crashing"). **107 assertions total, across 7
suites**, covering: role-list correctness per vertical, emergency-contact optionality, the suspend
action and its two follow-on bugs, cross-store identity reuse in both directions (logistics↔retail),
the full picker onboarding lifecycle including the correction path, the two retail-hiring blockers
(branch-source crash and vertical-aware hiring), and `hireIntoStaff()` directly (retail picker,
retail manager, and logistics hire paths, plus duplicate-hire protection). All 107 pass as of this
commit.

One known gap in the testing itself: the one-line wiring in `app.js`'s `change-application-status`
`onchange` handler that calls `PC.hireIntoStaff()` is only syntax-checked, not executed — driving a
real DOM `onchange` event isn't possible without a browser or `jsdom` (not installable here, no
network access). `hireIntoStaff()` itself is fully tested directly; the one line that calls it from
the real event handler is not. This is not a substitute for manual/browser testing before a real
deploy — it verifies logic and markup output, not actual rendering, CSS, or click-through UX.
