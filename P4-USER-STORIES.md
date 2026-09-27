# MoveAI One — Phase 4 User Stories

Version: Phase 4 marketplace baseline  
Date: 27 September 2026  
Dependency: P0–P3 regression must remain green.

## Phase 4 — Goods and opportunity marketplace

| ID | Actor | User story | Acceptance criteria | Screen/route | E2E |
|---|---|---|---|---|---|
| P4-US-01 | Goods Buyer or Seller | I can create a commercial goods order before arranging transport | Buyer/seller, goods, quantity, goods price and transport responsibility are stored separately from freight | Goods order | P4-E2E-01 |
| P4-US-02 | Goods Buyer or Seller | I can create a transport requirement for confirmed goods | Route, dates, vehicle, capacity, Dharamkata and payment terms are required and linked to one goods order | Transport requirement | P4-E2E-02 |
| P4-US-03 | Goods Buyer or Seller | I can use my vehicle, selected Transporters or the eligible network | Selected mode controls visibility; selected mode requires at least one Transporter | Transport arrangement | P4-E2E-03 |
| P4-US-04 | Goods Buyer | I can ask a Transporter to source goods and arrange delivery | Goods budget and transport budget remain separate; Buyer approval precedes confirmed goods/load | Buy goods with delivery | P4-E2E-04 |
| P4-US-05 | Transporter | I can source verified Sellers for a Buyer request | Seller, goods price, freight and service fee remain explicit; Transporter is never represented as Seller | Goods requirements | P4-E2E-05 |
| P4-US-06 | Authorized Transporter | I can publish a confirmed load needing a truck | An authorized published requirement is required; duplicate open post is blocked; Goods Owner identity stays masked | Post available load | P4-E2E-06 |
| P4-US-07 | Transporter | I can publish that a truck/capacity is looking for loads | Route, date, truck, capacity and accepted goods are shown; the post is not a confirmed Load | Post load requirement | P4-E2E-07 |
| P4-US-08 | Goods Owner | I can respond to a Transporter looking for loads | Response creates an opportunity; it creates no Load before confirmation | Transporter requirements | P4-E2E-08 |
| P4-US-09 | Transporter | I can work with another authorized Transporter | Primary/operating party, authorization and separate settlement responsibilities remain visible | Opportunity details | P4-E2E-09 |
| P4-US-10 | Vehicle Owner or Transporter | I can publish an available approved truck | Registration, location, date, vehicle/capacity, destination preference, crew and approved documents are required | Post available truck | P4-E2E-10 |
| P4-US-11 | Vehicle Owner or Transporter | I can see route-compatible next-load recommendations | Matching checks route, vehicle, capacity, availability, documents and crew | Route opportunities | P4-E2E-11 |
| P4-US-12 | Matched businesses | We can message or send a voice note before confirming | Conversation is opportunity-scoped, phone details can remain masked and history survives conversion | Opportunity conversation | P4-E2E-12 |

## Phase gate

Phase 4 is releasable only when all 57 P0–P4 story mappings are present, unit/static suites pass, the repaired Commercial Driver hiring journey passes browser UAT, and every opportunity converts to at most one canonical Load.

