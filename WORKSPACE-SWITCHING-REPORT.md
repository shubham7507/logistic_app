# Workspace switching update — 1 November 2026 (two rounds)

This update changes how a signed-in person moves between their roles and businesses. It follows patterns from Grab and Uber (separate apps by job, "business" as a payment profile at checkout) and Slack and Instagram (one login, a switcher listing every membership with unread badges).

This is still a browser-only prototype. Everything below runs in the browser for demonstration. Before launch, the server must enforce the same rules (see **Still needed on the server**).

## What changed

### 1. Four apps instead of seven entry pages
| App | Entry page | Roles it now shows |
| --- | --- | --- |
| MoveAI (customer) | `index.html` | Personal shopping, bookings, help |
| MoveAI Partner | `partner.html` | Commercial/personal drivers, khalasi/helper, **store delivery partners** |
| MoveAI Business | `business.html` | Goods, transporter, truck owner, movers, staff, **store owners, store managers and store staff (pickers)** |
| MoveAI Admin | `admin.html` | Platform admin (internal) |

- In `business.html`, the switcher lists ABC Grocery, Fresh Mart, Sharma Electricals and City Fashion (owner, manager and staff roles) next to the logistics businesses. Picking one switches **in place**: the brand stays "MoveAI Business", and the store menus and home screens load.
- In `partner.html`, the delivery partners appear alongside driver and helper work.
- `seller.html`, `picker.html` and `delivery.html` still work as **aliases** (same code), now branded as Business or Partner. `_redirects` keeps `/seller`, `/picker` and `/delivery` working.
- "Other MoveAI apps" now lists only the other three apps.

### 2. New workspace switcher
- **Grouped by business**, with the person's role on each row: "Store owner", "Store manager", "Store staff", "Owner", "Delivery partner".
- **Current workspace first, then most recently used.** Each app remembers its last workspace across reloads.
- **Unread badge per workspace**, so you can see work waiting elsewhere without switching.
- **Invitations section at the top** (Business app). "Add a business" sits at the bottom.
- **Search box** when someone has more than five workspaces.
- **Colour per business**: a strip on the top bar, plus a coloured icon in the sidebar and switcher, so the current context is obvious.
- **Tap the page title on mobile** (e.g. "Home · ABC Grocery ⌄") to open the switcher. Previously, mobile users had to open the side menu first.

### 3. Switch guard (like Uber's driver app)
- A delivery partner with an **active delivery** (accepted, picked up or out for delivery) can't switch away. A message explains why, and location sharing stays on.
- A delivery partner holding **COD cash** that hasn't been handed over can switch, but gets a reminder.
- A store staff member with an **unfinished pick task** can't switch away until it's finished or reassigned.
- The guard applies to switches made by the person (switcher, notification links, deep links). Internal and test calls are unaffected.

### 4. Notifications and deep links know their workspace
- Links can carry a workspace, e.g. `business.html#/shopOrders?ws=groceryManager`. Opening one switches to that workspace (if the person belongs to it and isn't mid-job), shows "Switched to …", and opens the page.
- The Notifications page has a new **"In your other workspaces"** panel listing unread items elsewhere, each with an **Open** button.
- **Mute this workspace** (on the Notifications page): no push, SMS or WhatsApp from that workspace, for example when off shift. Codes, safety alerts and account/security messages still arrive, and in-app items are kept.

### 5. Business buying profile at checkout (like Grab/Uber Business)
- Checkout has a new **"Buying for"** choice: Personal, or any business the person owns.
- Choosing a business fills the receipt name and **GSTIN** for a GST invoice. The choice is saved to the order's billing (`billing.profile`) and remembered for next time.
- No workspace switch is needed to buy supplies for a business.

### 6. Money pages name the workspace
On Money, Pay workers, Monthly payroll, Store earnings, Sales, Delivery earnings and COD cash, Picker earnings, Invoices and Payment detail, a banner states: **"Money actions here are for ABC Grocery · Store owner"**.

### 7. Shared store device with staff PIN
- From a store owner or manager workspace, the switcher offers **"Switch to store staff with PIN"**. Staff tap their name and enter a 4-digit PIN; the store stays signed in.
- 5 wrong PINs lock that staff member until the owner resets the PIN.
- Owners can **set a staff PIN** from the same sheet.
- The device **locks back to the store after 5 minutes** without use (unless a pick task is in progress) and asks for a PIN again.
- Prototype PIN: `1234` unless the owner sets one.

### 8. Demo-only tools can be switched off
Open any page with `?demo=off` to hide:
- the "Test as …" persona text and "Mock user" labels
- test hints
- "Reset demo data"
- "Open full demo"

`?demo=on` brings them back. The choice is remembered on the device. Use `?demo=off` to preview what real users will see.

## Files
- **New:** `js/workspace-hub.js` (all rules as pure, testable functions), `js/workspace-ui.js` (switcher, PIN sheet, banners), `tests/workspace-hub.unit.mjs`, `tests/workspace-switch.e2e.cjs`, this report.
- **Changed:**
  - `js/app.js`: switcher, guard, deep links, notifications panel, money banner, header trigger, store-device lock, demo flag.
  - `js/products.js`: app taglines and comments.
  - `js/product-screens.js`: other-apps list.
  - `js/product-orders.js`: buying profile.
  - `js/notify-center.js`: mute.
  - `css/components.css`: styles.
  - `seller.html`, `picker.html`, `delivery.html`: alias branding.
  - `_redirects`, `package.json`.
- The four main entry pages (`index`, `partner`, `business`, `admin`) are **unchanged**, so the existing static check that they stay identical still passes.

## Tests
| Command | Result |
| --- | --- |
| `npm run test:unit` (now includes `workspace-hub.unit.mjs`) | PASS |
| `npm run test:static` | PASS |
| `npm run test:damage-claims` | PASS |
| `npm run test:demo` | PASS |
| `npm run test:workspace` (unit + browser journey; serve the folder on port 4177 first) | PASS |
| `npm run test:e2e` (with the folder served on port 4177) | p1–p4 PASS; `p0-foundation` fails at "navigation for admin", **same as before this change** |
| `npm run test:commerce`, `npm run test:staff` | Same files fail as before this change (`commerce-flow`, several grocery journeys, `phase2`, `store-hr`, `worker-hub`, `easy-mode`); no new failures |
| Python smoke tests checked (`p5-p8-ops`, `geo-notify`, `customer-billing`, `commerce-plus`, `worker-hub`, `easy-mode`, `store-hr`) | Fail at the **same line** before and after this change; no new failures |

The pre-existing failures should be fixed before development starts, as noted in the earlier review.


## Round 2 — branches, logistics businesses, staff, money confirmations

### 1. Branch on every switcher row
- Rows read **"Owner · Transporter · Jaipur Branch"**, **"Store manager · Karol Bagh"**, **"Driver · Noida HQ"**.
- Businesses with more than one branch show **branch chips** under their row:
  - stores: Karol Bagh / Noida
  - Raj Logistics: All branches / Noida HQ / Jaipur Branch
  - Sharma Foods: All branches / Patna Warehouse / Bihta Plant
  - SafeMove Packers: All branches / Noida / Gurugram
- Tapping a chip switches to that business (if needed) and sets the branch. Each business remembers its branch.
- Raj Transport (one branch) simply shows "Patna Yard".
- Search also matches branch names. The top-bar branch button now shows the branch **name** instead of its ID.

### 2. Correct role names
Logistics owners show their actual role: "Owner · Goods Owner", "Owner · Transporter", "Owner · Truck Owner", "Owner · Mover Owner". Staff show their role template: Branch manager, Operations/Dispatcher, Accountant, Driver, Khalasi/Helper, Document staff, Viewer.

### 3. Staff: business name, and several businesses per person
- The staff workspace header now shows the **business** (e.g. "Raj Logistics"), with "Mohan Yadav · Driver" underneath. It no longer shows the person's name as the workspace.
- If the same mobile number is active staff at more than one business, the switcher shows **one row per business**, each under that business's group. Switching between them changes the employer, role, branch and permissions.

### 4. No switching during a trip or move
- **Commercial drivers, helpers and staff drivers** on a trip that is at pickup, loaded, at the weighbridge or in transit are blocked from switching. For example, seed trip TRP-501 is loaded with Mohan and Ramesh.
- **Mover crews** on a job that is packed, loaded, in transit or unloading are blocked.
- **Personal drivers** with a job in progress are blocked.
- Owners and office staff are never blocked.
- With `?demo=off` the block is final. In demo mode, a dialog explains the block and offers **"Switch anyway (demo only)"**, so testers can still move between personas.

### 5. Confirmations name payer and payee
- Before a money action runs, a confirmation shows **From**, **To**, **For** (trip, order or job ID) and **Amount**, e.g. "Approve payment · ₹640 — From Raj Logistics — To Mohan Yadav (Commercial Driver) — For TRP-501".
- Covers payment approvals, releases and reversals in Money, plus buttons such as:
  - Settle ₹…, Pay ₹…, Pay seller, Pay monthly salary, Pay final settlement, Pay in cash
  - Give advance, Run weekly payouts
  - Record payment / courier payout / helper payments / COD refund
  - Approve refund, Approve payday, Close trip as settled
- Navigation buttons such as "Pay workers", "Payroll" or "Open pay" are not interrupted. Cancel does nothing; Confirm runs the original action.
- Customers (Personal workspace) are not interrupted.
- Automated browser runs skip this dialog unless `localStorage['moveai-money-confirm']='on'`, so older tests are unaffected. The new journey test turns it on.

### 6. Notifications by business and branch
- Trip, load and moving-job alerts take the branch of their record.
- **Branch managers and dispatchers** see their branch's work alerts for the business.
- **Accountants** see only their branch's money alerts.
- Owners still see everything.
- Example: Ravi (Noida HQ manager) sees TRP-504 alerts, but not TRP-501 (Jaipur Branch).

### 7. Payment method and receipt email per buying profile
- Each "Buying for" option shows and applies its own default payment method and receipt email (demo default: UPI, accounts@<business>.example).
- What you use at checkout is remembered for that profile next time.

### 8. Remaining demo screens hidden with `?demo=off`
Also hidden:
- the staff "test invitation" buttons and the "signed in as staff in this tab" banner
- the "Demo store staff/manager account" pickers
- "Use demo location", "Demo: …" and "Prototype: …" buttons
- the "Screen states" test page link

### Round 2 files
`js/workspace-hub.js`, `js/workspace-ui.js`, `js/app.js`, `js/notify-center.js`, `js/product-orders.js`, `css/components.css`, `tests/workspace-hub.unit.mjs`, `tests/workspace-switch.e2e.cjs`, and `tests/p3-people.e2e.cjs`. The last one is updated because the staff header now names the business, with the person underneath.

### Round 2 tests
| Command | Result |
| --- | --- |
| `node tests/workspace-hub.unit.mjs` (now covers branches, roles, memberships, trip/move/job guard, branch alerts, buying defaults, money detection) | PASS |
| `node tests/workspace-switch.e2e.cjs` (now covers branch chips, two staff memberships, trip guard, money confirm with cancel/confirm, checkout email/method, demo-off cleanup) | PASS |
| `test:unit`, `test:static`, `test:damage-claims`, `test:demo`; `test:e2e` p1–p4 | PASS |
| `test:commerce`, `test:staff`, `p0-foundation` and the 7 Python smoke tests | Same failures at the same lines as before any of these changes; no new failures |

## Still needed on the server (cannot be done in a browser-only prototype)
1. **New token per workspace switch.** The server checks membership and role, and removing a membership revokes access immediately.
2. **Enforce the switch guard on the server** (active delivery, unfinished pick task). The phone only displays the result.
3. **Store PINs hashed on the server**, with attempt limits per staff member and per device, and owner reset with an audit entry.
4. **Push notifications carry `workspace_id`** and use the `?ws=` deep-link format. Mute settings are stored per person and workspace on the server.
5. **Buying profile:** the server validates that the buyer is an owner or authorised staff of that business, and takes the GSTIN from verified business KYC, not from the form.
6. **Real login:** server OTP, sessions and admin SSO, as listed in the earlier login review.
7. **Branch scope:** branch filters and branch alerts are checked on the server per membership. Staff can't widen their branch by changing the filter.
8. **Multi-business staff:** a membership table (person × business × role × branches). Each staff row in the switcher maps to one membership token.
9. **Field-job guard** (trips, moves, driver jobs) comes from server job state, and GPS consent and stop rules are enforced there.
10. **Money confirmations:** every money endpoint requires an explicit confirmation with payer, payee, amount and reference, plus an idempotency key. The client dialog is only the visible part, and the prototype's label matching should become explicit per-action confirmations.
11. **Buying defaults** (payment method token, receipt email) are stored per business on the server, and only owners or accountants can change them.
