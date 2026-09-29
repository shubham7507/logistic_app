# P5–P8 user stories and draw.io traceability

Every page of `MoveAI_One_All_Users_Complete_Application_Flow.drawio` is mapped to the routes, rules and tests that implement it. Pages already covered in P0–P4 are marked as such.

| Draw.io page | User story | Routes | Rules / modules | Tests |
|---|---|---|---|---|
| 00 Actor map | Every actor has its own workspace, navigation and route boundary. | all workspaces | `config.js`, `permissions.js` | p0-static, ops-screens |
| 01 Universal signup | One mobile identity, OTP, Personal workspace (P1). | welcome, signup, otp, recover | `identity.js` | p1 suites |
| 02 General customer | As a customer I choose a service, describe it by text or voice, see the full price, book, track, message, confirm, pay and rate. | book, bookingReview, services, serviceDetail, movingJob | `quoteMoving`, `quoteDriver`, `quoteGeneral`, `assignMoverBranch`, `parseVoiceCommand` | ops-rules, smoke journey 1 |
| 03 Goods seller | As a seller I confirm terms, get vehicle and crew, track pickup, Dharamkata (if selected), GPS and POD, then settle; one order can have many loads; the buyer may arrange transport. | work, trips, tripDetail, arrangement | `buildMilestones`, `canAdvanceMilestone`, `createTripFromLoad`, `createTripFromRequirement`, counterparty mode | ops-rules, smoke journey 3 |
| 04 Goods buyer | As a buyer I see inbound goods, confirm quantity and condition, pay or dispute, and close. | trips, tripDetail (receipt form), money, exceptions | `advanceMilestone('received')` | ops-screens |
| 05 Transporter | As a Transporter I accept/reject/counter, pick a vehicle source and crew source, pass validation, run the trip with GPS and chat, settle and see the next load near drop. | trips, assignTrip, vehicleOffer, tripDetail | `validateAssignment`, `crewEligible`, `findConflict`, `nextLoadsNear` | ops-rules, smoke journey 2 |
| 06 Truck owner | As a Truck Owner I add a vehicle; staff upload RC, insurance, permit, fitness and pollution; I review; Admin approves; I use it for own work, post availability, answer offers or join a Mover; I pay advances and final dues. | fleet, addVehicle, vehicleDetail, vehicleOffer, money | `docsValid`, `DOC_TYPES` | ops-screens |
| 07 Multi-service business | As a business with several services I see one fleet calendar and overlaps are blocked. | fleet | `overlaps`, `findConflict` | ops-rules, smoke |
| 08 / 16 Packers & Movers | As a Mover I receive auto-assigned jobs, confirm slot and price, allocate owned/partner/platform crew, approve new vehicle owners, pack inventory, upload loading proof, track GPS, unload, verify the customer OTP and release payouts. | work (queue), movingJob, fleet | `MOVING_STEPS`, `canMoveJob` | ops-rules, smoke journey 1 |
| 09 Commercial driver | As a Driver I see invites, one-trip offers and assigned trips, accept, run milestones and receive settlement. | myJobs, tripDetail, money | `gpsAllowed`, `earningsSummary` | ops-rules, smoke journey 3 |
| 10 Personal driver | As a personal Driver I accept customer requests, chat, complete, get paid and rated, and can upgrade to commercial. | myJobs, driverJob, upgradeDriver | `crewEligible` (licence) | ops-screens |
| 11 Khalasi / helper | As a helper I record multiple capabilities and engagement types and accept work. | myJobs, profile | helper-skills form | ops-screens |
| 12 Hiring | Openings, applications, hiring pipeline (P3). | hiring and related | `people-rules.js` | p3 suites |
| 13 Staff lifecycle | As an owner I mark leave/unavailability, reassign active work, and rehire former staff. | staffEvents | `validateLeave` | ops-rules |
| 14 Roles | Role templates and staff scope (P3); every action is also permission-checked. | roles, staffAccess | `can()` in `ops.js` | p3 suites, ops-screens |
| 15 Shared trip views | Each party sees only its own view of the same trip. | tripDetail | `visibleTrips` | ops-screens |
| 17 Money | Payment types; payer, payee and responsible party; method, reference and proof; limits and duplicate check; pay or record outside; payee confirms; ledger; reversal with audit; reimbursements and platform fees separate from earnings. | money, payment, paymentDetail | `validatePayment`, `applyMoneyAction`, `earningsSummary`, `visibleLedger` | ops-rules, smoke journey 5 |
| 18 Messages, GPS, voice AI | Job/internal/direct chats; text, audio, proof, location; GPS consent, stop at closure; voice → transcript → read back critical actions → execute with audit; AI never bypasses permissions. | messages, conversation, Ask MoveAI dialog | `visibleConversations`, `gpsAllowed`, `parseVoiceCommand`, `runAssistant`, `executeAssistant` | ops-rules, smoke journey 6 |
| 19 Admin | Verification queue for people, vehicles and businesses; approve, correction, reject, suspend, escalate with reason; notify; immutable audit; appeal and restore. | verification, verificationItem, cases, audit | `validateAdminDecision`, `adminResultStatus` | ops-rules, smoke journey 7 |
| 20 Exceptions | Seven exception types; notify affected parties only; capture reason, location, proof and responsible party; repair, replace, reassign, manual milestone or hold; recalculate dues without deleting; resume or close. | exceptions, exceptionDetail | `EXCEPTION_TYPES`, `validateException`, `affectedParties`, `recalcDues` | ops-rules, ops-screens |

## Prototype limits

This is a front-end prototype with local mock data. Server-side enforcement, real payments, real GPS, real SMS/OTP and real speech transcription (the browser Web Speech API is used where available, with typed fallback) are simulated and must be built on the backend before production.

## Gap audit against draw.io (second pass)

Every node on pages 00–20 was checked against the running app. These were missing or wrong and are now fixed:

| Page | Gap found | Fix |
|---|---|---|
| 04 Goods Buyer | After "Receive goods" there was no "Pay / dispute" or "Close order" step. | Trip close-out panel with Pay seller (pre-filled, shortage deducted), Raise dispute and Close order. An order closes only after every load is received, disputes are resolved and the seller payment is paid or recorded. |
| 03 Goods Seller | Order aggregate showed quantity only, not conversations and money. | Aggregate row shows loads, delivered quantity, conversation count and money total, and closes once every load is settled. |
| 03 / 04 | Two different orders shared the ID `GO-402` in seed data. | Inbound wheat order renamed `GO-403`; demo revision bumped so old browser data resets. |
| 13 Staff Lifecycle | No attendance; staff "My Work" showed bare IDs; Leave/rehire screen had no link. | Staff My Work lists assigned trips and moving jobs, attendance check-in/out and own pay. Owner sees today's attendance. People has a "Leave, attendance & rehire" tab. |
| 07 Multi-service | Staff did not see "My assigned tasks" across transport and moving. | Same unified task list on staff My Work. |
| 14 Roles and permissions | No per-person payment approval limit; restricted permissions were ignored by operations; template names differed. | Approval limit field in Staff access, enforced on approval; saved permissions now drive every operations check; roles named Business / Branch Manager, Operations / Dispatcher, Accountant, Viewer / Auditor. |
| 06 Truck Owner | Document staff could not open Fleet to upload RC, insurance, permit, fitness and pollution. | Staff with document or fleet permissions can open Fleet and Add vehicle; others are denied. |
| 16 Shared Moving Job | Customer could not enter inventory; vehicle partner could not see moving jobs on its trucks. | Inventory field in the moving booking (shown on the price review and used as the packing checklist); vehicle partner sees moving jobs on its trucks in Trips. |
| 19 Platform Admin | No strong authentication before the verification queue. | Security-code step-up (prototype code `246810`), valid 30 minutes, required again for decisions; failures are audited. |
| 09 Commercial Driver | Offers did not show the vehicle to review. | Offer rows show route, vehicle, pay, advance and who pays the platform fee. |
| 01 Choose purpose | Personal services text mentioned products only. | Mentions moving, personal Driver, products and home services. |

## Onboarding by levels (chosen design: step-by-step levels + instant checks + invites + voice help)

Instant checks are simulated in `js/verify-sim.js`; production would call DigiLocker, Sarathi, Vahan, the GST portal and a bank penny-drop provider. Every form shows its prototype test data.

**Workers** (`#/candidateProfile` → `#/workerStatus` → `#/workerVerify`)

| Level | Needs | Unlocks |
|---|---|---|
| 1 Browse | Work type, name, city (helpers: at least one skill) | See jobs and pay |
| 2 Verified | Drivers: licence (Sarathi via DigiLocker; transport class required for Commercial) + live selfie matched to the licence photo. Helpers / office: Aadhaar e-KYC + selfie | Apply, receive offers, appear in business searches, join an inviting employer |
| 3 Trip-ready | Drivers: Aadhaar + bank penny-drop + emergency contact. Others: bank + emergency contact | Accept paid work and receive payouts |
| Badges | Police verification, medical fitness, hazardous goods (upload → admin) | Better offers; police verification required for Personal Driver monthly/live-in jobs |

When an instant check fails (record not found, name mismatch, DigiLocker down) the person uploads documents for manual review; the admin can approve, request correction (resubmits as a new version), reject or suspend. An expired licence drops the driver back to Level 1.

**Invite path:** a business invite to the person's mobile pre-fills the work type and pay; after Level 2 they can accept and join. Demo: Raj Transport invites Shubham (`9876543210`).

**Businesses:** GST lookup fills PAN (embedded in the GSTIN), entity type and address; bank details are confirmed by ₹1 penny-drop; the application status screen shows what is possible now vs after approval. **Vehicles:** RC lookup on Vahan fills capacity and the insurance, fitness, permit and PUC dates, so the vehicle is ready without five uploads; expired insurance puts it on hold.

**Customers** book with OTP and name only. **Staff** join by invite only. **Admin** has no signup; strong authentication is required.

Tests: `tests/worker-onboarding.unit.mjs`, journeys 9 and 10 in `tests/p5-p8-ops.smoke.py`.

## Option C — four products, one login

| Product | Entry | Roles shown | Personal workspace means |
|---|---|---|---|
| MoveAI (customer) | `/` (`index.html`) | Personal only | Customer: Home · Book · My bookings · Messages · Account |
| MoveAI Partner | `/partner` (`partner.html`) | Commercial Driver, Personal Driver, Khalasi/Helper | Your own partner onboarding: Home (work profile) · Find work · Verification · Messages · Profile |
| MoveAI Business | `/business` (`business.html`) | Goods, Transporter, Truck Owner, Packers & Movers, Staff | Register a business: setup · application · invitations |
| MoveAI Admin | `/admin` (`admin.html`) | Platform Admin | — |

The customer app never shows work, invitations or business items. Payments happen inside bookings; receipts, orders and product search sit in Account, which also links to the Partner and Business apps. A link to another product's screen (for example `index.html#/workerStatus`) opens that product, like a deep link. All four pages share one codebase and the same saved data; `tests/p0-static.integration.mjs` keeps them in sync, and journey 11 in the smoke test checks each product's menus.

## Staff invitation link (draw.io 13 / 14)

Owner: **Business app → People → + Add staff** → *Invitation ready* screen with the link (`business.html#/join/<token>`), Copy, WhatsApp, SMS and "Open link in a new tab". People lists every invitation with its status (Sent, Opened, Mobile verified, Accepted, Details submitted, Correction requested, Declined, Cancelled, Expired) and Resend / Cancel.

Invitee (separate session in that tab): landing with business, role, branch, pay and expiry → confirm the invited mobile → OTP → create account (name + consent) or continue with the existing account → accept (permissions shown) or decline with a reason → own joining details (ID, address, emergency contact, bank; a verified MoveAI Partner reuses Aadhaar and bank) → waiting for review → correction loop → approved with Staff ID → open staff workspace.

| # | Scenario | Result |
|---|---|---|
| 1 | No account | Account created after OTP and consent |
| 2 | Existing account | "Welcome back"; role added to the same account; verified partner checks reused |
| 3 | Someone else opens it | Warning; only the invited mobile can pass OTP |
| 4 | Expired | Expired page; owner resends → new link; old link shows "replaced" |
| 5 | Cancelled | Cancelled page |
| 6 | Already accepted | Verify mobile → current status |
| 7 | Declined | Owner notified; can invite again |
| 8 | 5 wrong OTPs | Locked 10 minutes (prototype button to skip) |
| 9 | Duplicate invite | Blocked with "Resend the link instead" |
| 10 | Owner's own mobile | Blocked |
| 11 | Staff elsewhere | Allowed, shown as a separate business |
| 12 | Correction | Reason shown, details pre-filled, resubmit |
| 13 | Rejected | Access ends; personal account stays |

Tests: `tests/staff-join.unit.mjs`, `tests/staff-invite.smoke.py`.

Note: the older P3 Playwright test `tests/p3-people.e2e.cjs` expected the previous in-app "Test invite" flow; the People "invite" rows now open the link flow instead.

## Workforce and worker money (W4 + P4)

**People › Workforce** — one list of everyone who works for the business: office staff and field crew; engagement tag Permanent, Temporary, Per-trip (platform), Partner crew (paid by their Truck Owner) or Contractor-supplied; today's duty; pay basis; khata balance (money columns only for owners and accounts). "Make permanent" turns a per-trip or temporary worker into a staff invitation.

**People › Duty board** — field crew for today and the next two days: Free, On trip / job, On leave, Resting after a long haul (24h+ trip ended within 10 hours). Free crew can be sent straight to a waiting trip.

**Trip › Crew settlement** — per crew member: trip wage (per-trip workers), bata = days × rate, approved receipts (FASTag tolls are the business's cost, not reimbursed), minus advances paid for the trip → due to worker or to be returned. Every receipt must be approved or rejected before posting to the khata. Partner crew shows "paid by their Truck Owner" with no amounts.

**Khata** — each worker's running balance: earned + reimbursements − deductions − payments + cash returned. Deductions need a reason, an explanation and evidence; amounts above the cap (₹5,000) need owner override; vehicle-paper fines cannot be deducted. The worker sees the same khata under My Money and can dispute a deduction; disputed amounts are not counted until the owner upholds or waives them. Owners pay the balance or record unspent advance returned.

**People › Payroll** — monthly run: attendance (present / leave / absent) → gross → optional PF, ESI, PT (simplified, off by default) → salary advance instalment → carried khata balance → net. Draft → Prepared → Approved → Paid; a line can be held; staff approvers are limited by their approval limit and cannot approve a run they prepared. Paying posts salary to each khata and creates the payments; payslips appear in My Money.

Tests: `tests/workforce.unit.mjs`, `tests/workforce.smoke.py`.

## MoveAI Pay — one payments service (option E, step 1)

`js/pay.js` is the single payments module every screen calls, mirroring a separate payments service. It sits on the existing ledger and talks to a **simulated licensed payment aggregator** (collect, hold, release, refund, payout). In production this is Razorpay / Cashfree / PayU; MoveAI never holds customer money in its own account.

Consumer jobs (collect and pay out):
- Booking amount at checkout: moving 20% (min ₹500) by UPI or card; drivers and home services pay after the work. Failed payments book nothing.
- Money is **held** until the job is done. Moving: customer pays the balance after sharing the completion OTP (or pays the crew in cash); everything held is **released** to the Mover's wallet minus 10% commission when the job closes. Drivers 12%, home services 15%, released when the customer pays after confirming completion.
- Cancellation: free before crew/driver is assigned; after that 10% (min ₹299, max ₹1,500) kept for the partner; not allowed once the job has started (raise a problem instead). Partner no-show: full refund and ₹500 penalty. Refunds go to the original method.
- Cash jobs: commission becomes wallet debt; above ₹2,000 owed the partner cannot confirm new slots or accept requests until they pay it.

Partner wallet (Money for Packers & Movers and Personal Driver): available balance, money held for jobs in progress, cash commission, weekly payout every Monday, instant payout (₹10 fee), payout account, failed payout with retry.

Business → worker payments (khata settlement, payroll) now go through the aggregator payout call and can fail visibly.

Admin → **MoveAI Pay**: money held for customers, refunds, commission, partner wallets, failed payouts, and "Run weekly payouts".

Test data (shown on every payment form): UPI `fail@upi` or a card ending `0002` fails; a payout account ending `000` or `fail@upi` fails.

Tests: `tests/pay.unit.mjs`, `tests/pay.smoke.py`, plus `tests/syntax.static.mjs`, which now checks that every module parses.

Next steps for option E: freight milestones (protected advance at loading, balance after POD, holds on disputes) and B2B credit terms with invoices, GST and TDS.

## Freight billing — phase 1 (records, invoices, credit, GST, TDS)

Business app → **Billing** (Goods, Transporter, Truck Owner; staff with money access). Money still moves by the businesses' own bank transfers; MoveAI keeps both sides in step.

- **Invoices from trips**: issuer (Transporter → Goods owner, Truck Owner → Transporter) picks a trip; freight is pre-filled from the trip terms. Invoice numbers follow the Indian financial year (`RL/26-27/0001`). Both GSTINs, SAC 996511, printable / save as PDF.
- **GST mode per invoice**: reverse charge (recipient pays; shown as a note), forward charge (added to the invoice) or none. Rates are settings with placeholder defaults.
- **TDS (section 194C)**: calculated on the amount excluding GST; 1% for proprietors/individuals, 2% for firms and companies; exempt when the transporter declared ≤10 trucks with PAN (Raj Transport); thresholds are settings. The payer records TDS with the payment; certificate status (pending → issued → received).
- **Terms tied to milestones**: advance becomes due when the trip is loaded; balance after the delivery proof plus credit days. Or full amount on credit (e.g. 30 days).
- **Extra charges** (detention, extra drop, loading) proposed by the issuer with evidence and approved by the payer → invoice revision. **Shortage** from the receipt is added as a proposed deduction; the issuer accepts or disputes; a disputed amount is held (not demanded) until settled.
- **Part payments**: the payer records amount, method and UTR; the receiver confirms it arrived. Outstanding, due now, overdue days.
- **Reminders** 7 days and 1 day before, on the due date, and 3 / 10 days overdue, plus "Send reminder".
- **Credit control per customer**: credit days, credit limit, and "pause new trips after N overdue days"; warnings on Billing and the trip.
- **E-way bill** check when goods value is above ₹50,000 (enter the 12-digit number).
- **Export for Tally (CSV)**: sales/purchase, receipts/payments and TDS journal rows.

Demo: Raj Logistics has an overdue invoice to Sharma Foods (credit rule shows "new trips paused"), an advance-and-balance invoice for TRP-501, and Raj Transport has a TDS-exempt invoice to Raj Logistics.

Tests: `tests/freight.unit.mjs`, `tests/freight.smoke.py`.

Not in phase 1: holding the shipper's money (phase 2, protected payment), early payment against delivery proof and fuel cards (phase 3), e-invoice IRN and e-way bill API connections.
