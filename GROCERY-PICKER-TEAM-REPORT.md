# Grocery picker team: implementation and test report

Date: 2 October 2026 (Singapore). Scope: grocery seller, store picker, customer order and admin. Freight and movers were not changed.

## Implemented

| Step | Seller / picker action | Rule and visible result |
| --- | --- | --- |
| Store team | Seller opens **Team**, enters picker name and 10-digit mobile, sends invitation. | Approved store required. Duplicate active or pending mobile across grocery stores is blocked. Invitation belongs to that store. Asha at ABC Grocery and Imran at Fresh Mart remain active seed accounts. |
| Join | Picker opens **Profile**, selects their demo account and accepts the invitation. | Invitation becomes active only at its associated, approved store. The selected identity and store appear in the picker page. The invitation and acceptance appear in role notifications and audit history. |
| Accept order | Seller accepts a customer order. | Seller sees **Assign a picker or pick items in store**. Customer sees its normal confirmation. The order does not appear on a picker task list until assigned. |
| Assign | Seller chooses an active staff picker on that order. | The picker sees only assigned orders from their store. Order history and admin Partners show the person and task count. Assigning a picker from another store or a pending/removed picker fails. |
| Pick | Assigned picker starts, confirms every item and quantity, and completes. | Seller sees checklist progress, then enters sealed bag count and packs. Existing unavailable item and customer replacement/removal flow remains available. |
| Reassign | Seller selects another active picker on an unfinished order. | Previous partial checks are cleared, so the new picker rechecks everything. Both picker accounts get targeted alerts; only the current assignee can open and act on the order. Completed picks cannot be reassigned. |
| Remove access | Seller removes a team member. | The picker loses task access. Unfinished assigned orders return to unassigned; seller assigns another picker or self-picks. Completed checklist/order history remains intact. |
| Self-pick | Seller chooses **Pick items myself** on an unassigned order. | Same item checklist and bag packing rules; an already assigned order cannot be self-picked until its assignment is released or the seller uses another order. |
| Oversight | Admin opens **Partners** and **Orders**. | All grocery picker staff statuses, store association, active task counts, assigned person and order history are visible. |

## Tested

- `npm run test:commerce`: PASS. Includes `grocery-picker-team.e2e.mjs` invitation, duplicate and wrong-store rejection, activation, assignment access, cross-store isolation, reassignment and checklist reset, completed pick guard, removal, self-pick, targeted alerts, actual UI button bindings, and customer order → courier pickup → delivered. Existing 13 commerce scenarios, cart, two-store checkout, and enhancement tests also pass.
- `npm run test:unit`: PASS.
- JavaScript syntax: PASS by running `node --check` over all `js/*.js` files. The `npm run test:static` wrapper is blocked in this sandbox because its child-process `spawnSync` returns EPERM; all eight static integration scripts ran individually and PASS.
- Browser click-through on a hosted page: not run in this environment. Test the published pages manually as below.

## Manual GitHub Pages walkthrough

Extract the ZIP into the repository root with `index.html`, all role pages, `css/`, `js/` and `.nojekyll`. Use the same browser profile on the same GitHub Pages origin; the app stores demo state in browser storage.

1. Open `seller.html#/shopTeam` as ABC Grocery. Invite **Priya Sharma**, mobile **9876501555**. See her status **invited**. A repeated invite to the same mobile should show a duplicate error.
2. Open `picker.html#/pickProfile` as ABC Grocery picker. Select Priya, click **Switch picker**, then **Accept store invitation**. Return to Seller → Team to see **active**.
3. In `index.html`, open Shop, add rice and salt to the cart and place a prepaid order. In `seller.html#/shopOrders`, accept the new order and assign Priya. Confirm Picker → Pick tasks shows the order only when Priya is selected. Switching to Asha should hide it.
4. Switch back to Priya, start picking and mark one item. In Seller → Orders, reassign to Asha. Confirm Priya loses access and Asha must start again and confirm both item lines. Asha completes the pick; seller enters two sealed bags and marks ready for pickup.
5. In `delivery.html#/deliveryJobs`, Ravi accepts, enters the store pickup code and two bags, then confirms pickup. Use the customer delivery code from `index.html#/orders` to complete delivery. Customer tracking and Admin → Orders should show **Delivered**.
6. For a second accepted order, assign Asha and then remove Asha in Seller → Team. The unfinished order becomes unassigned, and seller can self-pick or assign Priya. Review Admin → Partners for the removed status. The removed account cannot work an old task.

## Demo limits and production requirements

The invite does not send SMS, and choosing a picker in Profile simulates signing into that person's account. It is deliberately open for one-browser mock testing, not authentication. Identity selection is saved in the shared browser demo state, so use one picker persona at a time. The static app cannot synchronize separate devices, protect staff data, or safely arbitrate simultaneous updates. Before production use, add verified mobile login, signed invite tokens with expiry, store-owner approval, server-enforced tenant permissions, order assignment transactions/version checks, audit storage, and push notification delivery. Browser testing on the deployed GitHub Pages URL and across devices remains outstanding.
