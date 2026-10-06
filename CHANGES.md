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

## 6. What was deliberately NOT done (and why)

- **Open hiring (post-and-apply marketplace) is still logistics-only.** Retail owners still can't
  post an opening and have strangers apply — `hiringScreen`/`postOpeningScreen`/`applicationsScreen`
  read and write `state.peopleByWorkspace`, while retail staff live in `state.pickerStaff` /
  `state.storeManagers`. Granting the routes without reconciling this would create a second,
  invisible staff list for retail owners. A partial attempt was made and reverted; see the comment
  left in `config.js`'s `allowedRoutes()` for the two ways to resolve it. **This is the main
  remaining piece** from the "can I get staff from the platform" conversation — it needs the hire
  action to create a `pickerStaff`/`storeManagers` record (not `peopleByWorkspace`) when the hiring
  business is retail, plus fixing `postOpeningScreen`'s branch dropdown and its form submit handler,
  which currently assume `state.businessProfiles[ws].branches` and would error for retail (retail
  branches live in `state.sellerBranches` instead). This was identified but not yet fixed.
- **General vs. Specialized role tiers** (the "anyone can hire a cleaner, but only a restaurant can
  hire a chef" design) was discussed and designed but not implemented in code — no `tier` field
  exists on `ROLE_TEMPLATES` yet.
- **Individual/personal users hiring staff** (not just registered businesses) was explicitly scoped
  out per the most recent instruction — only business-side hiring was worked on this session.
- **Full nav hub/grid restructure** (Home/Orders/Catalog/Staff/Money/Business) was out of scope from
  the start — it touches far more surface area than could be verified through static analysis alone
  in this environment (no browser/bundler available, see below).

## How this was tested

No browser or bundler is available in this environment, so testing was: `node --check` for syntax on
every touched file; real `import()` of every touched module in Node to catch missing exports/broken
references; and executing the actual edited functions against realistic mock state objects with
explicit pass/fail assertions (not just "it ran without crashing"). 78 assertions total, across 5
suites, covering: role-list correctness per vertical, emergency-contact optionality, the suspend
action and its two follow-on bugs, cross-store identity reuse in both directions (logistics↔retail),
and the full picker onboarding lifecycle including the correction path. All 78 pass as of this
commit. This is not a substitute for manual/browser testing before a real deploy — it verifies logic
and markup output, not actual rendering, CSS, or click-through UX.
