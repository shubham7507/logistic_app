# MoveAI One — Mock Persona E2E Map

Use this actor map in every manual test, screenshot, defect report and automated test. Always write the person's name and exact role; do not use the generic term “business user.”

| Workspace being opened | Mock user | Role under test | Primary E2E responsibility |
|---|---|---|---|
| Personal | Shubham Kumar | General Customer | Signup, personal activity and invitations |
| Sharma Foods | Vijay Sharma | Goods Owner | Goods orders, loads, owned vehicles, staff and freight payments |
| Raj Logistics | Amit Raj | Transporter | Find goods, arrange trucks/crew, trips, branches and settlements |
| Raj Transport | Rajesh Kumar | Truck Owner | Multiple trucks, documents, drivers/Khalasis, offers and advances |
| SafeMove Packers | Neha Singh | Mover Owner | Moving requests, branch allocation, crew, partner vehicles and payouts |
| Commercial Driver | Mohan Yadav | Commercial Driver | Publish availability, apply for work and complete assigned trips |
| Personal Driver | Anil Kumar | Personal Driver | Publish availability and accept general-customer driving work |
| Khalasi & Helper | Ramesh Yadav | Khalasi / Helper | Publish availability and complete trip or moving assignments |
| Staff workspace | Pankaj Meena | Operations Staff | Accept invitation, submit documents and perform only assigned operations |
| Platform Admin | Admin Neha | Platform Admin | Review businesses, documents, approvals, safety and audit history |

## Naming rule

- Business name: the workspace, branch and business records.
- Person name: the actor performing the test.
- Role: the permissions being validated.
- Test-case title format: `Actor — Role — Action`.
- Example: `Rajesh Kumar — Truck Owner — Publish idle truck BR01 GX 4421`.
- Example: `Vijay Sharma — Goods Owner — Send transport requirement to Raj Logistics`.
- Example: `Amit Raj — Transporter — Convert matched opportunity into one load`.

## Shared-person exception

If one real person owns several businesses, keep one login identity but test each workspace separately. The header must still state the active role. A person acting in Raj Transport is tested as **Truck Owner**; the same person acting in Sharma Foods is tested as **Goods Owner**. Permissions and data must never leak across those workspaces.
