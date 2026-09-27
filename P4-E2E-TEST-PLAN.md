# MoveAI One — Phase 4 E2E Test Plan

Date: 27 September 2026  
Reset before every major journey: **Reset demo data**.

## P4 — Goods and opportunity marketplace

| Test | Journey | Expected result |
|---|---|---|
| P4-E2E-01 | Sharma Foods → Loads → Create goods order; save Sell, Metro Retail, Rice bags, 20 tonnes, ₹7,60,000, Seller arranges transport | One confirmed goods order; no freight is included in goods price |
| P4-E2E-02 | Continue to transport requirement; save Patna → Delhi, 30 Sep, 14-wheel, 20 t, Dharamkata required and advance terms | Requirement is linked to the goods order and remains separate from the goods agreement |
| P4-E2E-03 | Choose selected Transporters and Raj Logistics; repeat validation with no selected Transporter | Raj Logistics alone receives the requirement; missing selection is blocked |
| P4-E2E-04 | Buy goods with delivery; publish Premium rice, 15 t, Noida, separate goods/transport budgets | One sourcing request is visible to the selected/eligible Transporter; budgets remain separate |
| P4-E2E-05 | Raj Logistics → Work → Source goods; open Metro Retail request | Buyer, Seller-not-selected, goods and transport budgets are explicit; Transporter is not Seller |
| P4-E2E-06 | Raj Logistics → Post load; select the newly published authorized requirement and submit twice | First creates a masked available-load post; second duplicate is blocked |
| P4-E2E-07 | Raj Logistics → Looking for load; publish Jaipur → Delhi, 1 Oct, 22-ft, 12 t | Open load-requirement post is created; canonical Loads remain unchanged |
| P4-E2E-08 | Sharma Foods → Transporters need loads; respond to the new requirement | Opportunity is created with status Discussion; no Load exists yet |
| P4-E2E-09 | Open opportunity details and inspect responsibility | Primary/operating business, goods authorization and separate settlement are visible |
| P4-E2E-10 | Raj Transport → Post available truck; publish BR01 GX 4421 with approved documents and crew | Availability is published; expired/unapproved documents are blocked |
| P4-E2E-11 | Raj Transport → Work → Next load | Jaipur → Delhi compatible requirement shows 92% match; incompatible truck type is excluded |
| P4-E2E-12 | Open scoped conversation; send text and voice note; confirm terms twice | Messages and voice transcript persist; exactly one canonical Load is created; second confirmation is idempotent |

## Cross-role denial checks

- Commercial Driver cannot open Goods order, Post load or Truck availability routes.
- Goods Business cannot open Post available load.
- Vehicle Owner cannot open Goods order.
- Unmatched businesses cannot enter an opportunity conversation.
- Available-load cards show “Verified Goods Business” before authorization, not the private Goods Owner mobile.

## Automated coverage

- `p4-marketplace.unit.mjs`: validation, matching, privacy, idempotency and route boundaries.
- `p4-screens.integration.mjs`: all Phase 4 screen contracts and mock data.
- `p4-marketplace.e2e.cjs`: goods order → requirement → selected Transporter → load post → opportunity → canonical Load → chat → next load.
- `p3-hiring.e2e.cjs`: repaired Commercial Driver availability/application/withdrawal/reset/owner pipeline.

