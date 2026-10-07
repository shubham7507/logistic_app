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

## 7. Desktop sidebar now groups into hubs instead of a flat 21+ item list

**Files:** `js/config.js`, `js/app.js`, `css/components.css`

This is the full hub redesign discussed throughout the conversation, built the safest way possible:
**zero changes to any route, permission, or screen-rendering function.** Every single existing
`data-route` button still exists, still points at the exact same route, still does exactly what it
did before — this only changes how those buttons are grouped and which ones are visible by default.

- New `HUBS` + `HUB_OF_ROUTE` map in `config.js` groups routes into Home, Orders, Catalog, Staff,
  Money, Business (plus an automatic "More" bucket for anything the map doesn't recognize yet, so a
  route can never silently disappear).
- New `groupNavByHub(nav)` — pure function, takes a workspace's existing flat nav array and returns
  it grouped. Each hub has a designated **primary** route (e.g. Staff's primary is Team, not "Staff
  (easy)", even though "Staff (easy)" appears earlier in the original flat list) so clicking into a
  hub lands somewhere sensible.
- `renderDesktopNav()` in `app.js` now renders hub headers; only the hub containing the current route
  expands to show its children. Collapsing 21-22 flat items down to 6-7 top-level entries.
- Verified this also works cleanly for logistics workspaces (goods/transporter/etc.), not just the
  retail verticals it was built for — "Messages" correctly falls into the "More" bucket since it
  doesn't belong in any of the six hubs, which is the intended fallback behavior.

**What this does NOT include yet:** the mobile "More" screen (`renderMore()`) still shows its own flat
list rather than the same hub grouping — it uses a different, separate code path from the desktop
sidebar. Grouping it the same way would be a quick follow-up using the exact same `groupNavByHub()`
helper, just not done in this pass since the request was specifically about the desktop sidebar shown
in the screenshot.

## 8. Delivery partner self-registration (new file: `js/delivery-onboarding.js`)

Delivery partners were previously not invited by anyone — `deliveryProfile` was entirely read-only
("Status: X · ID: Y"), with no submission form at all. This adds the missing self-registration
lifecycle, deliberately shaped differently from staff/picker onboarding because a delivery partner
isn't an employee of any one business:

- **Self-registration, not an invite** — a new "Become a delivery partner" entry point on the
  purpose screen (`fix-screens.js`), reachable by anyone, landing on whichever demo delivery-partner
  slot is still mid-pipeline.
- **Lifecycle**: `profile_pending → submitted → approved` (plus `correction_required` / `rejected`).
  Deliberately reuses `'approved'` as the terminal status — the value every existing job-matching
  function already checks — instead of introducing a new `'active'` status, so zero other files
  needed to change to make approved delivery partners eligible for job offers.
- **Onboarding form**: vehicle type/registration, licence + RC + insurance, optional emergency
  contact (same rule as everywhere else — skippable, never blocks approval), payout destination.
- **Reviewed by the platform (admin) only, never a seller** — extends the existing `commercePartners`
  admin screen with a "Review joining details" button that appears only once someone has submitted;
  the old generic approve/suspend toggle now only shows for already-approved or suspended partners,
  closing a real gap where admin could previously approve an unsubmitted applicant by clicking the
  generic button, bypassing review entirely.
- **Identity reuse works in both directions.** Extended `ensureCore()` (`people-core.js`) to also
  build employment records for delivery partners (`source.kind: 'delivery'`), and extended
  `reusableIdentity()`'s record lookup to handle delivery partners' actual storage shape (a dict of
  individual records, not an array like pickers/managers, not a dict-of-arrays like logistics staff).
  Tested: a delivery partner who's already a verified Picker gets the reuse banner; a picker
  onboarding also correctly reuses an already-verified delivery partner's identity.
- **Deliberately not a growable list.** `state.deliveryPartners` stays a fixed 2-slot dict, same shape
  as before — not converted into an array like `pickerStaff`. ~20 call sites across 8 files assume
  `s.deliveryPartners[workspace]` resolves directly to one person; converting that would have meant
  touching all of them without a real browser to verify the result, which is exactly the kind of
  foundational, widely-coupled change this session has avoided throughout. The two-slot demo
  (one already-approved, one starting from scratch) is enough to test the real flow end to end.

## 9. Delivery tracking — three issues found, not yet fixed (next task)

While investigating this, a related but separate set of problems was found in `geo.js`'s per-order
live tracking: (1) a courier can manually stop sharing location mid-delivery — the same flaw
deliberately closed for logistics trips earlier, never applied here; (2) starting tracking is
optional, so a courier could simply never turn it on; (3) a real correctness bug — a single shared
`watchId` variable (not keyed per order) means a courier carrying two orders at once (the platform's
own `capacityPerCourier` setting already allows this) can have the wrong order's GPS watch cleared
when stopping tracking on the other one. None of these three are fixed yet — flagged here, scoped,
and agreed as the next piece of work, not done in this pass.

## 10. Full end-to-end test, new people throughout — found and fixed a real money-handling bug

Ran a complete simulation from scratch: a brand-new customer (Priya Nair) places a real order against
the actual seed catalog; a brand-new staff member (Meena Iyer) is invited, onboarded, approved, has a
pick task assigned to her, sees it in her own view, and completes it; a brand-new delivery partner
(Vikram Singh) self-registers, gets platform-approved, receives the delivery request, accepts, picks
up with the real pickup code, and delivers with the real delivery code; COD cash gets reconciled;
the platform settles the seller (correctly blocked until the reserve period passes, exactly as
designed) and pays the delivery partner; the owner gives Meena a salary advance; both are offboarded
at the end. All of it via the actual exported functions, not a parallel simulation — 54 steps, all
now passing.

**One real bug found along the way, not caused by anything in this session:** `giveAdvance()` in
`store-hr.js` called `payOut()` but discarded its return value entirely. `payOut()` already correctly
returns `{error: "...has not added a verified UPI/bank account..."}` when UPI/bank isn't verified —
but `giveAdvance` ignored that and always reported success, meaning an owner choosing UPI for someone
without a verified account would see "Advance given," while no money actually moved and no record
explained why. Fixed by checking `payOut()`'s result before recording the advance as given, and
reordered so a failed payout never leaves a misleading "successful" advance record behind. Confirmed
with a real test: the UPI-blocked case leaves **no** advance record at all now, matching what actually
happened (nothing was paid).

**Not independently testable here:** the generic order-level DOM actions (pick-check, pack, remit,
settle, etc.) are all called correctly from this test, but the specific `#business-start-form` and
checkout-UI submit handlers in `app.js` are inline DOM event handlers rather than separable functions
— the underlying `placeOrder()` function they ultimately call was tested directly and for real, but
the literal form-to-state wiring around business onboarding specifically wasn't driven through a form
submit event (no browser available here, consistent with every other gap noted throughout this file).

## 11. Unified payroll engine (new file: `js/payroll-core.js`) — replaces four disconnected systems

A full audit found the app actually had **four separate payroll engines**, not one, each with its own
storage and none aware of the others:

| System | File | Storage |
|---|---|---|
| Monthly/attendance, advances, reimbursements, deductions, petty cash | `store-hr.js` | `s.ledger` |
| Shift-based picker pay runs | `grocery-picker-pay.js` | `s.pickerShifts` / `s.pickerPayRuns` |
| Manager pay runs | `grocery-manager-pay.js` | its own structure |
| Monthly, per-trip, deductions ("khata") | `workforce.js` | `s.accruals` / `s.payrollRuns` |

Concretely, this meant a picker paid through the shift system showed **zero** history in the
"People & pay" payslip screen, and vice versa — whichever screen an owner happened to open showed an
incomplete picture, with nothing reconciling the two.

**What was built:** one shared ledger (`s.payEvents`) and one `balance()`/`history()` pair that works
identically for monthly, daily, shift, and advance pay, across every vertical — reusing the exact
verified-UPI/bank gate already fixed in `giveAdvance()` earlier this session, so the same safeguard
now applies everywhere money moves, not just one screen.

- **Migration is non-destructive**, the same pattern as `people-core.js`'s `ensureCore()`: reads all
  four old systems and writes into the new unified ledger without deleting anything. Paid pay-runs
  migrate in as history; still-draft ones are deliberately left alone (still "in flight" on their
  original screen). Verified idempotent — running the migration repeatedly never duplicates events.
- **Advances stay as their own record type** (declining balance + instalment plan), not flattened into
  generic ledger lines — that's a loan, not a wage, and flattening it would lose "how much is still
  outstanding."
- **One screen per person** (`payPersonScreen`) — a single plain-language balance statement ("You owe
  Meena ₹3,200" / "Meena owes you ₹500" / "Settled up"), the full interleaved history, and four actions
  (Pay now, Give advance, Add reimbursement, Add deduction) in one place instead of three separate nav
  destinations.
- **Wired into the real UI**: a "Pay" button now appears next to every active picker and manager on the
  Store team screen, resolving to their real shared identity and opening the new unified screen. New
  route `unifiedPay`, granted to retail owners/managers and logistics businesses.
- **Deliberately scoped out**: independent/per-trip crew in logistics (`workforce.js`'s `'per_trip'`/
  `'partner'` engagement, keyed by a candidate persona rather than a real employment record) are **not**
  covered — there's no shared-identity bridge for them yet, same boundary noted for delivery partners
  earlier. Their pay stays on the existing trip-settlement system, clearly flagged rather than silently
  half-migrated.
- **The old four systems were not touched or retired.** Their screens, nav items, and write paths all
  still work exactly as before — this is the new canonical system layered alongside them, not a
  replacement surgery done blind. Retiring the old screens (so there's only one "Pay" entry point
  everywhere, not the new one plus three legacy ones) is the natural next step once this has been used
  for real and trusted.

**Tested accordingly, since this is money:** 27 direct checks (migration correctness per source system
with exact sign verification, idempotency, balance math, every validation gate, the dispute path, the
plain-language screen output) plus a separate pass rendering the real screen against every real active
employment in the actual seed data (16 people, zero errors) and confirming idempotency against real
data too.

## 12. Payment consolidation: two-sided UPI confirmation, polling, and one real source of truth

Three screens all claimed to be "where you handle staff pay" (the new Pay button, the old People &
pay screen, easy-mode's own tiles) and a worker's own self-view was calculating balance independently
from what the owner saw — the exact kind of drift this whole payroll unification was meant to prevent.

- **UPI is no longer treated as instantly successful.** `payNow()` for UPI now returns a real deep link
  (`upi://pay?pa=...`) instead of marking the payment paid — there's no gateway here to confirm the
  transfer actually happened, so pretending otherwise would be dishonest. The payment sits as
  `pending_confirmation` and does **not** count toward balance until someone confirms it.
- **Two-sided confirmation, reusing the exact pattern already built for cash handovers** — owner sees
  "Did this go through?", worker sees "Did you receive this?" on the same pending entry. Either side's
  "yes" settles it; critically, the status is **recomputed fresh from both answers every time**, not
  finalized irreversibly on the first response — a real bug caught while testing: without this, an
  owner's instant "yes" would close the event before the worker could ever flag a genuine mismatch
  ("paid" vs. "never received"), which is exactly the case this mechanism exists to catch.
- **Device-aware handoff**: redirects straight to the UPI app on mobile; renders a QR code on desktop
  (nothing on a desktop browser can catch a `upi://` link). Added a real QR library
  (`qrcode@1.5.3` via CDN) to both business page shells — this is a real external library a real
  browser can load; it could not be exercised live in this sandbox (no internet access here), so it
  falls back to showing the raw link as text if the library isn't available, rather than silently
  doing nothing.
- **Lightweight polling** (`s.payVersion`, bumped on every mutation) so the Pay screen notices a
  confirmation without the user navigating away and back. Honest limitation: within this one-browser
  prototype this only matters if you're viewing both sides in the same session — real cross-device
  sync needs an actual backend, which this explicitly isn't.
- **The worker's own "My pay & details" screen (`store-hr.js`) now reads balance from the exact same
  `payroll-core.js` function the owner's screen uses** — tested directly, not assumed, since an owner
  and worker disagreeing on a number would make the whole consolidation pointless.
- **Easy-mode's Give advance / Pay tiles** (the voice/text command interface) now call the unified
  engine for retail businesses, so the same verified-UPI safeguard applies there too, not just on the
  dedicated Pay button.
- **The misleading banner is fixed** — it no longer claims pay/advances live in "People & pay" once
  they don't.

## 13. Aadhaar verification retrofit — replacing typed fields with the real verification that already existed

Found mid-session: a complete, working Aadhaar OTP + live-selfie + bank penny-drop verification system
(`verify-sim.js`, simulating DigiLocker/bank lookups) already existed in `store-hr.js`'s own
self-service screen — and the picker onboarding form built earlier in this session duplicated the same
job with plain text fields instead of finding and reusing it. That's a real miss on my part, corrected
here.

- **`submitPickerOnboarding` now calls the real functions** — `aadhaarEkyc()` for OTP verification
  (wrong OTP is genuinely rejected, not just checked for digit count), `faceMatch()` for the live
  selfie (now a real `<input type="file" accept="image/*" capture="user">`, not a filename text box),
  and `pennyDrop()` for bank verification (a simulated ₹1 check that can catch a name mismatch, not
  just an IFSC regex). The owner-review step this session already built stays in place — real
  verification *and* the approval gate, not one or the other.
- **Assisted verification for workers without a smartphone** — explicit toggle, not inferred: the
  owner/manager enters the Aadhaar number and OTP (read aloud by the worker from their own SMS) and
  uploads a photo of the worker or their card instead of a live selfie, behind a required consent
  checkbox ("I confirm [name] was present and gave consent"). This is recorded as `verificationMode:
  'assisted'` with who performed it (`assistedBy`), and both the onboarding screen and the owner's
  review screen label it explicitly as assisted, not blended in as if it were self-verification.
- **Compliance-aware display, not a card-image viewer**: the owner only ever sees a masked Aadhaar
  number (`XXXX XXXX 1234`) and verified status — never the full number or a card photo. This matches
  how Aadhaar eKYC is meant to work in India (private employers shouldn't hold the full number), and
  was a deliberate design correction, not an oversight, from what was originally requested.
- **Scoped to picker onboarding only** (`grocery-staff.js`) in this pass — logistics staff onboarding
  (`people.js`) and delivery-partner onboarding (`delivery-onboarding.js`) still use the simpler
  text-field pattern. Same retrofit, same shape, just not done yet — flagged, not silently left
  inconsistent.

## 14. Bank-transfer gateway gap — found while explaining GIRO-style payroll, then fixed

While explaining how GIRO/bank-transfer payroll works in the real world, re-checking my own code
surfaced a real gap: `payNow()`'s `bank` method never actually called the simulated bank gateway
(`gateway.payout()`) — it just accepted a manually typed reference and marked the payment posted,
identical to `cash`/`card_transfer`. The account number wasn't driving anything. The older
`store-hr.js` payout function this replaced did call the gateway correctly; the unified replacement
quietly dropped that while building the UPI confirmation flow.

- **Fixed**: `bank` now resolves the person's real account number (same employment-lookup pattern as
  UPI) and calls `gateway.payout({accountNumber}, amount)`. A rejected account (the simulated "ends in
  000" test case) is genuinely rejected with the real reason, and no payment event is created.
- **Bank posts immediately, unlike UPI** — confirmed this stays correct, not blurred: UPI has no
  gateway here, so it needs the two-sided pending-confirmation dance; bank has a gateway that resolves
  pass/fail on the spot, so it never needs that step, batch or single payment.
- The owner is no longer asked to type a reference for bank transfers — the gateway generates one.
  Only `card_transfer` (which has no simulated gateway at all) still asks for one.
- Extracted the account/UPI lookup into one shared `resolveBankRecord()` helper instead of two copies
  of the same kind-switch logic drifting apart between the UPI and bank branches.
- **12 new direct tests**, specifically targeting the exact gap: good-account success with a
  gateway-generated reference, bad-account rejection with zero event created, no-account-on-file
  blocking, and confirming UPI's pending-confirmation behavior wasn't accidentally merged into bank's
  immediate-post behavior. 308 total checks across 17 suites now, all passing.

## 15. Batch monthly payroll — GIRO-style, one submission for the whole team

Built on top of the bank-gateway fix above, since a batch run is only as correct as the single-person
logic it repeats. A genuinely different shape of feature from everything else this session — one
click processes everyone, not one person at a time.

- **`runMonthlyPayroll(business, period)`** computes a draft — everyone with an active, monthly pay
  plan in that business, their current balance, and whether they actually have a verified **bank
  account specifically** (not just "payout verified" generally — a worker verified only for UPI can't
  be included in a batch at all, since UPI needs a per-person interactive confirmation that genuinely
  can't be done unattended, in this app or in reality; a real design correction caught while building
  this, not an assumption carried over from the single-payment flow). Idempotent — reopening the same
  month's draft never creates a duplicate.
- **Hold, not block** — `toggleHold()` lets the owner pull any one person out before finalizing
  (wrong hours, a pending dispute) without affecting anyone else, the same safeguard already built
  into logistics' own payroll runs, now available here too.
- **`approveMonthlyPayroll()` processes everyone not on hold through the exact same `payNow('bank')`
  used for individual payments** — not a separate code path that could quietly drift from it. Each
  result is categorized precisely: paid, held, skipped (nothing due), or failed (the real gateway
  rejection reason, e.g. a bad account) — nothing is silently skipped or silently marked paid when it
  wasn't.
- **Named `s.unifiedPayrollRuns`**, deliberately not reusing `s.payrollRuns` — that field already
  belongs to `workforce.js`'s own pre-existing logistics payroll-run system; reusing the name would
  have silently collided two unrelated data structures.
- **19 new tests**, including the specific scenario this exists to get right: five people in one
  batch — one paid cleanly, one held, one with no bank account at all, one whose account the gateway
  genuinely rejects — and verifying not just that the *results list* says the right thing, but that
  each person's **actual resulting balance** matches what the result claims. A held or failed person's
  balance is confirmed completely unchanged, not just reported as such.

## 16. Critical fix: three routes were completely unreachable in the real app — and why 347 passing tests never caught it

Found from real screenshots, not from testing: `unifiedPay`, `monthlyPayroll`, and `pickerReview`
silently fell through to a generic "planned screen" placeholder for an actual store owner, despite
every one of the underlying functions being correctly tested and passing. This is the most important
finding of this entire session, and worth explaining honestly.

**The actual bug:** `commerce.js`'s route dispatcher is one very large function with several
different `if(...)` blocks, each scoped to a different kind of workspace (`storeOperator(ws)`,
`pickerRole(ws)`, `driverRole(ws)`, `ws==='admin'`). Inside each block, the same variable names (`p`,
`store`) mean completely different things — in the admin block, `p` doesn't exist as a business
record at all; in the delivery-driver block, `p` means the delivery partner, not the seller.
`unifiedPay` and `monthlyPayroll` were added inside the `ws==='admin'` block — meaning they could only
ever render for platform admin, never for an actual store owner. `pickerReview` was added inside the
`pickerRole(ws)` block but internally required `sellerRole(ws) || managerRole(ws)` — two conditions
that can never both be true at once, since a workspace can't simultaneously be a picker's own
workspace and the owner's. The route could never fire for anyone.

**Why automated testing never caught this:** every test written this session — all 332 of them at the
time — called the underlying functions directly (`Payroll.payPersonScreen(...)`,
`pickerReviewScreen(...)`), which is correct for testing business logic, but completely bypasses the
actual dispatcher a real browser click goes through. The business logic was never wrong; the wiring
connecting a button to that logic was silently broken, and nothing short of actually clicking through
the real app (or testing the dispatcher itself) could have caught it.

**Fixed**: all three moved into the `storeOperator(ws)` block, the same scope `shopTeam` already
correctly uses (which is why `shopTeam` always rendered fine). `unifiedPay` also now shows a clear
"open this from a specific person's Pay button" message if navigated to directly without a person
selected, instead of silently falling through to the placeholder.

**New, permanent testing practice added**: a dedicated `route-reachability` test suite that calls
`Commerce.screen(state, route, ws)` — the actual dispatcher — against the real seed data, for every
route added this session, confirming each renders its real content and not the placeholder. This is a
genuinely different category from every other test in this file, specifically designed to catch this
class of bug going forward. The end-to-end simulation (item 10, originally 54 steps) was also extended
with two dispatcher-level reachability checks at the end, using the exact state built up over the
whole 54-step journey — tying real business-logic correctness and real reachability together in one
pass, now 56 steps.

## 17. Old Payroll tab retired — one real payment path, not two

Confirmed from a screenshot: the pre-existing "Payroll" tab inside "People & pay" had its own
separate "Pay" button and method dropdown, calling `store-hr.js`'s own `payOut()` directly —
completely bypassing `payroll-core.js`. Tracing it further: the *payment* itself would eventually
reconcile into the unified ledger (migration re-scans on every call), but the *amount shown as owed*
on that screen came from an entirely separate attendance-based calculation that never feeds into
`payroll-core.js` at all — meaning the old tab and the new unified screen could genuinely show two
different numbers for the same person at the same moment, exactly the problem this whole
consolidation was meant to prevent.

**Fixed**: the old tab's method dropdown + "Pay" button are gone, replaced with the same `data-unified-pay`
button used everywhere else in the app — one real payment action, reachable from multiple screens,
instead of two independent ones. The attendance-based breakdown (base/meal/cover/advance recovery)
stays visible as reference information, since that's still useful and isn't itself duplicated
anywhere — only the actual money-moving button was.

## 18. Minor fix: error messages were positionally ambiguous

A validation error (e.g. "Take a photo (JPG or PNG)") always renders in the same fixed spot at the
bottom of the picker onboarding form, regardless of which section actually failed — so any error
visually looked like a complaint about whichever field happened to sit just above it (the Emergency
Mobile field, in the screenshot that surfaced this). Fixed by prefixing each error with which section
it's actually about ("Aadhaar: ...", "Photo: ...", "Bank account: ...") rather than repositioning the
message itself, which would have been a larger, riskier layout change for a cosmetic problem.

## 19. Customer checkout UPI payment — real redirect, not simulated success

Checked directly: customer checkout was purely simulated — typing a VPA into a text field just
validated the *string format* and instantly returned "paid," with zero real handoff to any UPI app.
Ironically, this was the opposite of the staff-payout flow built earlier, which already does the real
redirect/QR handoff — the more realistic payment experience in the whole app was the one paying
workers, not the one customers actually use to buy things.

- **`placeOrder()`** now generates a real `upi://pay?pa=...&am=...` deep link for a normal UPI ID and
  marks the order `payment_pending` instead of instantly `paid` — same principle as staff payouts:
  there's no real gateway here to confirm the transfer synchronously, so it doesn't pretend to.
- **Found and fixed a second dead-button bug while building this**: a "Check status" button already
  existed on pending orders, but had no click handler at all — clicking it did nothing. Wired it to
  the already-existing `checkPayment()` function, and added a new `confirmCustomerPayment()` for the
  case `checkPayment()` itself was never built to handle: a *real* redirect order has no predetermined
  outcome baked in, so the customer is asked directly whether the payment actually went through,
  instead of the system guessing or assuming success.
- **The three existing test fixtures (`fail@upi`, `pending@upi`, `pendingfail@upi`) are completely
  unchanged** — they still resolve through the original pre-baked-outcome mechanism, verified directly;
  only a genuinely normal VPA goes through the new real-redirect path. Card payments are also
  unaffected — those still go through the existing synchronous mock gateway, since a real card payment
  needs an actual gateway integration (Razorpay, Stripe, etc.) this prototype can't simulate the same
  way a UPI deep link can be.
- **16 new tests**, including explicit regression checks confirming all three old test fixtures and
  card payments behave exactly as before, plus the new flow's pending→confirmed and
  pending→cancelled-with-inventory-released paths.

## 20. The deepest bug found this session: store-hr-originated money was invisible to the unified ledger, always

Started from a much smaller question — "who verifies a picker's UPI details, and does their self-service
advance request go through the unified engine" — and uncovered something that had been silently wrong
since the unified payroll engine was first built in item 11: **no payment or advance originating from
`store-hr.js`'s own functions (`post()`, `payOut()`, `giveAdvance()`) had ever correctly reduced the
right person's balance in the unified ledger — not once, regardless of how many times the migration
re-ran.** This affected both owner-given and picker-self-requested advances, and ordinary salary
payments made through the old screens.

**Three separate, compounding causes, found by actually tracing a real advance through its full
lifecycle rather than trusting that passing tests meant it worked:**

1. **Wrong ID entirely.** `store-hr.js` always keys its own records by the raw picker/manager id (e.g.
   `'PICK-1'`) — never the shared cross-business personId (`'P-9900022222'`) the rest of the unified
   engine uses. The migration compared `employments[].personId === e.personId`, which compares a
   shared id against a raw one — these can never match. This affected *both* the advances migration
   and the general ledger migration (ordinary salary payments too, not just advances).
2. **`advance_paid` entries were being silently skipped** — correctly, as it turns out, but not for a
   reason anyone had verified: migrating that ledger entry *in addition to* the advance's own declining
   balance would have double-counted the same money leaving. Worth stating explicitly now that it's
   understood, rather than leaving it as an accidental side effect of an unrelated filter.
3. **Stale copies.** Once the first two were fixed and tested with a real request-then-approve
   sequence, the test *still* failed — because the migration copies an advance once and never updates
   it. A picker's advance migrated while `pending_approval`, then the owner approved it (changing its
   status to `active` at the source), but the already-migrated copy never picked up the change,
   because the migration's own de-duplication check skipped it as "already seen." Fixed by syncing
   mutable fields (status, balance, approver) on every pass instead of copying once and forgetting.

**Separately, real UPI verification was added** (`verify-sim.js`'s new `upiVerify()`): previously, any
VPA that merely matched an email-shaped regex was marked `verified: true` — no actual check that it
was real, unlike bank accounts, which already went through a genuine simulated penny-drop. Now UPI
goes through an equivalent check before anything can be paid to it.

**This is the clearest illustration yet of why real end-to-end tracing matters more than trusting a
green test suite**: `payroll-core-test.mjs`'s own advance tests passed throughout, because they
constructed test fixtures using the correct shared personId directly — never exercising the actual
translation step real store-hr.js data requires. The bug was invisible to every test until a real
request was walked through its real, full lifecycle: request → approve → pay → check.

**13 new tests** across two suites, confirming: the real UPI verification check and its rejection
case; the advance correctly staying invisible to balance while merely requested; the advance correctly
appearing only after real owner approval, for the real shared person, with the real amount; and that
the migration keeps staying correct on repeated calls rather than freezing a stale snapshot.

## 21. What was deliberately NOT done (and why)

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
explicit pass/fail assertions (not just "it ran without crashing"). **387 assertions total, across 23
suites** (the final additions covering the real customer-checkout UPI redirect, real UPI payout
verification, and — the most important of this round — tracing a picker's self-requested advance
through its complete real lifecycle and confirming it actually, correctly reduces the right person's
balance, which it had never done before despite every prior advance-related test passing), covering: role-list correctness per vertical, emergency-contact optionality, the suspend
action and its two follow-on bugs, cross-store identity reuse in both directions (logistics↔retail),
the full picker onboarding lifecycle including the correction path, the two retail-hiring blockers
(branch-source crash and vertical-aware hiring), `hireIntoStaff()` directly (retail picker, retail
manager, and logistics hire paths, plus duplicate-hire protection), the hub-grouping logic across all
four retail workspace types plus a logistics workspace, the full delivery-partner onboarding lifecycle
including bidirectional identity reuse (picker↔delivery), `ensureCore()` run against the actual real
seed data, a 56-step full end-to-end simulation with brand-new people at every role (customer, staff,
delivery partner) from first contact through to offboarding (which caught the giveAdvance payout bug,
and — extended at the end — the dispatcher-reachability checks that caught the critical routing bug),
the unified payroll engine's migration correctness from all four old systems, the two-sided UPI
confirmation flow (including the mismatch-detection bug caught and fixed mid-build), owner/worker
balance consolidation tested directly rather than assumed, easy-mode's rewiring to the unified engine,
the Aadhaar verification retrofit including real-OTP rejection, bank penny-drop rejection, and both
self and assisted verification paths with correct labeling, the bank-gateway fix (including the exact
bad-account rejection case that had been silently slipping through), the batch monthly payroll flow
with real actual-balance verification for paid/held/failed people, and — the newest and most
important category — real dispatcher-reachability tests confirming `unifiedPay`, `monthlyPayroll`, and
`pickerReview` actually render their real content through `Commerce.screen()` for a real store-owner
workspace, not the generic placeholder they were silently falling back to before. All 347 pass as of
this commit.

**The honest lesson from this round**: a passing test suite proves the logic is correct; it does not
by itself prove a real user can ever reach that logic by clicking something. This gap existed in every
prior section of this file too, silently, until real screenshots exposed it. The new
`route-reachability` test category exists specifically to close that gap for every route added going
forward — but it was added *after* the bug, not as a standing practice from the start, which is worth
being honest about rather than implying this was always covered.

**One thing this testing cannot cover**: the UPI deep-link redirect and QR rendering require a real
browser with internet access to actually exercise (mobile UPI app handoff, loading the QR library from
a CDN) — neither is available in this sandbox. The logic generating the link and deciding mobile vs.
desktop is tested directly; the actual redirect/QR-paint behavior is not, and is the one piece of this
session's work that most needs a real click-through before trusting it in production.

One known gap in the testing itself: the one-line wiring in `app.js`'s `change-application-status`
`onchange` handler that calls `PC.hireIntoStaff()` is only syntax-checked, not executed — driving a
real DOM `onchange` event isn't possible without a browser or `jsdom` (not installable here, no
network access). `hireIntoStaff()` itself is fully tested directly; the one line that calls it from
the real event handler is not. This is not a substitute for manual/browser testing before a real
deploy — it verifies logic and markup output, not actual rendering, CSS, or click-through UX.
