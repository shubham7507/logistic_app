# Seller trust, Bihar checks and the payment fix — 1 November 2026

## 1. "Seller can't accept the order" (payment fix)

**What was wrong**
- The UPI link paid the **customer's own UPI ID** (`pa=<customer>`), so the money could never reach MoveAI.
- The order stayed "Payment pending" until the **customer** tapped "Check status" and answered "Did it go through?". Anyone could answer *yes* without paying, and the seller would ship the goods.
- There was no time limit, so stock stayed reserved forever.
- The seller saw no Accept button and no explanation, only internal codes like `not_eligible`.

**Now**
- **Payee.** UPI pays the MoveAI merchant account (`PAYMENT.merchantVpa` in `js/product-orders.js`, a placeholder until your gateway gives you the real one).
- **Who confirms.** Only the bank or gateway can mark an order paid (`bankConfirmPayment`). In the prototype this is a **"Demo: bank confirms / says failed"** button, hidden with `?demo=off`. In production it is the gateway's server webhook. The customer can no longer confirm their own payment.
- **Expiry.** Unpaid UPI orders **expire after 15 minutes**: the order is cancelled, stock is released and nothing is charged.
- **Seller view.** "Waiting for the customer's payment. Don't pack yet — you can accept once the bank confirms. If unpaid, it cancels automatically in N min." Statuses are in plain words ("waiting for customer's bank", "after delivery", "rider not assigned yet").
- **Customer view.** Shows whom to pay, says not to pay twice, and explains what happens if the bank doesn't confirm.

## 2. How seller review works now

**Risk tiers (all states)**
| Risk | When | What happens |
|---|---|---|
| Low | Household or fashion only, every automatic check passed | **Approved automatically** in standard states and goes live **on probation** |
| Medium | Food or electricals | A person reviews each section |
| High | Any automatic check failed, no GST, bank name mismatch, duplicate or blocked identity | A person reviews, and a **video KYC call** is required |

**Automatic checks shown to reviewers**
- GSTIN active, PAN–GSTIN match and ₹1 bank name check.
- **Pincode is in the chosen state**: the new check that would have refused "Noida, 845401, Uttar Pradesh". It is also enforced when the seller saves step 4.
- Store state matches the GSTIN state.
- FSSAI licence found (simulated FoSCoS lookup).
- Duplicate or blocked identity: the same PAN or bank account used by another person.
- Product checks.

**Strict policy per state.** Admin → Seller onboarding review → *Seller verification policy by state*. **Bihar is strict by default.** Setting a state to strict requires a written reason, which goes in the audit log, so the rule rests on data. In strict states:
| Risk | Seller provides | MoveAI does |
|---|---|---|
| Low | Aadhaar via DigiLocker, live selfie matched to the Aadhaar photo, geo-tagged shop photos (signboard, inside, stock) | Video KYC |
| Medium (food, electricals) | + distributor or wholesaler purchase invoices | + field visit (shop, stock, expiry dates) |
| High | + police character certificate | same |

- Sellers complete these in a new step, **"Identity and shop checks"**, right after the store details.
- Strict states are **never auto-approved**.
- The "Identity and shop checks" section can be approved only when every check is marked **Passed**, with a written note of what the reviewer saw.

**Admin review screen**
- **Queue table:** highest risk first, then oldest. Shows state (with a *strict* tag), risk, flags, hours waiting, 72-hour deadline, and "Assign to me".
- **Evidence panel** on every application: automatic checks ✓/✗ and the identity and shop checks, with **Passed / Failed + note** buttons.
- **Approve buttons** are no longer the dominant colour.
- **Overrides:** approving a section whose automatic checks failed **requires a written reason**.
- **No self-review:** a reviewer cannot decide on their own application.
- **New stores on probation:** progress toward the targets, strikes, and "End probation" (ending early needs a reason).

## 3. Probation for new stores
| | Standard state | Strict state (Bihar) |
|---|---|---|
| Products | up to 50 | up to 30 |
| Order value | up to ₹3,000 | up to ₹2,000 |
| Cash on delivery | off | off |
| Extra payout hold | +7 days | +14 days |
| Lifts after | 30 delivered orders + 30 days, no strikes | 50 delivered orders + 30 days, no strikes |

Limits are enforced at listing time and at checkout. Sellers see them on the Seller applications page and in Products and stock.

## 4. Expiry controls (everywhere)
- Packaged food, dairy and bakery listings need **batch, manufacture and expiry dates**. This is required for stores created through onboarding (in step 7, Products and stock, and CSV import). Demo stores may add dates, and the same rules apply when they do.
- FSSAI direction (Nov 2024): food must reach customers with **at least 30% of shelf life or 45 days** left. Batches below that **can't be listed** and are **hidden from customers automatically** as they age. The row shows "N days to expiry" or the reason it is hidden.
- **Customer report:** on a delivered order, "Report an expired or near-expiry item" with a photo. The line is **refunded**, the product is **paused** until the seller re-checks the batch, and the seller gets a **strike**. **3 strikes suspend the store**, which stops taking orders, and admin is notified.

## Tests
| Command | Result |
| --- | --- |
| `node tests/seller-trust.unit.mjs`: screenshot pincode case, auto-approve low risk, medium manual, high + video KYC + override reason, Bihar low/medium/high requirements, policy changes, duplicate PAN, no self-review, probation limits, shelf-life rule, expired report + strikes + suspension, UPI payee / bank-only confirm / 15-min expiry | PASS |
| `node tests/seller-trust.e2e.cjs` (browser): Bihar food seller end to end, pincode guard, expiry on listing, admin queue + evidence + Passed notes, probation (COD refused), seller "waiting for payment" with no Accept, demo bank confirm → Accept appears, expired-item report, `?demo=off` hides demo buttons | PASS |
| Seller onboarding, listing and delivery unit tests; `onboarding-flows.e2e.cjs` | PASS |
| Full suite before vs after | Same 23 pre-existing failures before and after, first error identical; no new failures |

## Still needed on the server
1. **Payment gateway** (Razorpay, Cashfree or PhonePe PG) with a webhook-only "paid" state, merchant VPA, escrow/nodal account and automatic refunds for late payments.
2. **Real providers:** DigiLocker, face-match/liveness, GST portal, FoSCoS, India Post pincode directory, penny-drop; video KYC tooling; a field-agent app with GPS-stamped photos.
3. **Two reviewers** for strict-state approvals; reviewer identity from staff login (not a demo name); full audit trail.
4. **Risk rules from data:** fraud and complaint rates by district and category; blocked-seller list shared across PAN, Aadhaar reference, bank, phone and device.
5. **Picking oldest expiry first** and a packer photo of the expiry date; mystery-shopper audits.
6. **Legal review:** Aadhaar handling (store only the reference and last 4), police certificates, the shelf-life reading, and region-based policies.
