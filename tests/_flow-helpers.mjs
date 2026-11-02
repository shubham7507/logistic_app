// Shared steps for older end-to-end tests, matching rules added later:
// UPI and card payments wait for the bank's confirmation, and riders share live location before pickup.
import * as PO from '../js/product-orders.js';
import * as Geo from '../js/geo.js';
export const confirmPaid = (s, o) => { if (o?.status === 'payment_pending') { const e = PO.bankConfirmPayment(s, o, true); if (e && typeof e === 'string') throw new Error(e); } return o; };
export const shareLocation = (s, o) => { if (!o?.geo?.everStarted || !o?.geo?.live) Geo.startDemoLocation(s, o); return o; };
// Riders must be near the customer's pin before reporting a failed delivery.
export const reachCustomer = (s, o) => { shareLocation(s, o); for (let n = 0; n < 80 && !o.geo?.arrivedDoorAt; n++) Geo.demoStep(s, o); return o; };
// Sana (second rider) starts the demo mid-joining; older tests that need two approved riders approve her first.
export const approveSecondRider = s => { const a = s.deliveryPartners.deliveryPartner, b = s.deliveryPartners.deliveryPartner2; Object.assign(b, {...structuredClone(a), id: 'DP-002', name: b.name, mobile: b.mobile}); return s; };
