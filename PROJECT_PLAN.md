# CafeOS — Master Engineering Upgrade Plan

**Repository Branch:** `phase-0-audit` (branched from `main` baseline `61a158b`)
**Last Updated:** Phase 0 (Audit Complete — Awaiting User Approval)

---

## 1. Architectural Decisions & Section 2 Defaults

| Area | Decision / Default | Notes |
|---|---|---|
| **Money Representation** | Integer **paise** (`1 INR = 100 paise`) | No floating point arithmetic. Single rounding rule (`Math.round` / half-up to nearest paise, optional invoice rupee rounding tracked separately as `roundOffPaise`). |
| **Stock Deduction & Cancellation** | Deduct ingredient stock at order **`CONFIRMED`** via recipe/BOM | On cancellation: restore stock only if line item has **not** reached `PREPARING`. If `PREPARING` or later, keep deducted and log **Wastage**. |
| **Real-Time Updates** | **Server-Sent Events (SSE)** + HTTP polling fallback | Avoids WebSocket dependency across reverse proxies/containers; broadcasts `order.updated`, `kot.updated`, `table.updated`, `stock.updated`. |
| **Payments** | No online payment provider is connected | Payment integrations are out of scope until a replacement is selected and implemented. |
| **Locale & Currency** | `Asia/Kolkata` (**IST**) & **INR (₹)** | Formatted via `Intl.NumberFormat('en-IN')`; timestamps stored UTC in DB, rendered/bucketed in IST. |
| **Taxation (India GST)** | Configurable **CGST + SGST** split (`2.5% + 2.5%` default, item/category override) | Supports tax-inclusive and tax-exclusive pricing, GSTIN/FSSAI receipt metadata, sequential invoice numbering (`INV-FY-XXXX`). |
| **Tenant-Ready Schema** | `outlet_id` foreign key on all core operational tables | Starts with a single seeded cafe (`Seth Sawariya Cafe`), enabling multi-outlet expansion cleanly later. |
| **Privacy (DPDP)** | Explicit consent flags for CRM profile storage & marketing | Supports customer opt-out, JSON/CSV data export, and anonymization/deletion without breaking historical tax invoices. |
| **Design System** | Preserve existing warm-dark CafeOS Material 3 palette & UI patterns | `#17120f` surface, `#ffc174` / `#f59e0b` primary amber, `Plus Jakarta Sans`, responsive desktop sidebar + mobile bottom dock (`src/index.css`, `src/components/AppShell.tsx`). |
| **Cost & Self-Hosting** | Open-source, self-hostable, zero mandatory paid SaaS | Paid channels (WhatsApp Business API, SMS OTP, and online payments) remain unavailable until explicitly configured and validated. |
| **Reference License Rule** | **Zero code copied** from the 4 reference repositories | `nodedr-restaurant-pos` & `elitale/restro` are `AGPL-3.0-only`; `restaurant-pos` & `Cafe-Management-System` have no license (`null`). All features are cleanly engineered in our stack using architectural patterns only. |

---

## 2. Phase 0 Baseline Verification (Recorded on `phase-0-audit`)

- **Git Initialization:** Initialized `main` at commit `61a158b`; created working branch `phase-0-audit`.
- **Typecheck (`npm run lint` -> `tsc --noEmit`):** **PASS** (0 errors). Note: No ESLint runner or backend tests configured yet.
- **Unit Tests (`npx tsx --test src/utils/cafeLogic.test.ts`):** **PASS** (`13/13` tests passed).
- **Production Build (`npm run build` -> `vite build`):** **PASS** (`1.18s`, `dist/assets/index-C1swQarZ.js` `1,232.69 kB`).
  - *Existing warnings:* Bundle chunk > 500 kB (`recharts` + all 19 screens loaded eagerly in `App.tsx`); Vite warning on `__dirname` in `vite.config.ts`.

---

## 3. Existing Application Audit Summary

- **Frontend:** React `19.0.1`, Vite `8.3.0`, TypeScript `7.0.2`, Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react`, `motion`, `recharts` (`package.json`, `src/App.tsx`).
- **Backend / Database:** **None implemented yet.** `express` (`4.21.2`), `dotenv`, and `tsx` are installed, `.env.example` exists, but there is no `server.ts`, no API endpoints, no database, and no migrations.
- **State Persistence:** 100% client-side in-memory `useState` seeded from `src/data/cafeSeedData.ts`. Reloading loses all orders, tables, stock adjustments, customers, and settings.
- **Auth & RBAC:** **Missing.** Mode switching (`customer` vs `staff`) uses URL `?screen=` / React state (`src/App.tsx`). `StaffRolesScreen.tsx` and `cafeSettings.managerPinRequired` are UI-only toggles without sessions, PIN hashing, or server enforcement.
- **UI Stubs / Partial Modules Identified:**
  - `src/components/TableLayoutScreen.tsx`: `Merge` and `Transfer` buttons (lines 299–315) only call `onNotify(...)` toast; no table session PIN, QR generation, or shared table bill settlement.
  - `src/components/InventoryStockScreen.tsx`: `Quick Stock Adjustment` and `Generate Supplier PO` (lines 388–434) and `Create Vendor PO` (line 266) are toast stubs; KPI cards (`Valuation ₹48.2k`, `Daily Burn ₹6.4k`) are hardcoded text; no BOM/recipes or automatic deduction on order confirm.
  - `src/components/CrmCustomersScreen.tsx`: Header count (`887 + customers.length`), `Avg LTV ₹3,420`, `Retention 84.6%`, and segment counts are hardcoded; `Call`, `WhatsApp`, `Promo Broadcast` buttons trigger toasts only; no DPDP consent/delete/export.
  - `src/components/LoyaltyRewardsAdminScreen.tsx`: KPI metrics (`892`, `48,320`, `6,280`, `₹4,832`) are static; `Configure Tiers` (line 349) only triggers toast; POS checkout does not persistently credit/redeem customer wallets.
  - `src/components/OffersCampaignsScreen.tsx`: `Send WhatsApp Broadcast` and `Banner Promotion Preview` trigger toasts; coupons (`CAFE50`, `SAW10`, `CAMPUS15`, `BOGO2025`) are hardcoded inside `src/utils/cafeLogic.ts` rather than read from dynamic campaigns.
  - `src/components/StaffRolesScreen.tsx`: `View Log` triggers toast; no real clock-in/out timecards, PIN verification, or backend RBAC enforcement.
  - `src/components/PosTerminalScreen.tsx`: `tax` is forced to `0` (`isPos ? 0 : Math.round(...)` in `cafeLogic.ts`), auto-applies ₹20 dine-in promo silently, lacks variants/modifiers, hold/resume bill, split payments, and printable GST receipts.
  - `src/components/OrderManagementScreen.tsx` & `src/components/KitchenDisplayScreen.tsx`: Missing cancellation/void flows with wastage logic, server push (SSE), and audio chime synthesis on new tickets.
  - `src/components/ReportsAnalyticsScreen.tsx` & `src/components/AdminDashboardScreen.tsx`: Partial — `dailyTrend` in `cafeLogic.ts` uses baseline synthetic offsets blended with in-memory orders; some report tabs rely on static baselines; no shift cash closing / Z-report.

---

## 4. Reference Repository Audit Summary

| Repo | License | Stack & Architecture | Verified Highlights (with File Paths) | Gaps / Reuse Constraints |
|---|---|---|---|---|
| **1. Rajathtuesday/restaurant-pos** (`qsr`) | **None (`null`)** | Python / Django + PostgreSQL/SQLite, multi-tenant (`tenants/`), Django HTML templates | `orders/models.py` (`DecimalField`, `BillSeries`, `DailyOrderCounter`, `OrderEvent`, `OrderLock`, `OrderItemModifier`); `menu/models.py` (`VatClass`); `inventory/models.py` (`Recipe`, `ModifierRecipe`, `ProductionBatch`, `BarCount`); `printing/models.py` (`PrintJob`). | Unlicensed (pattern study only). `orders/views/order_views.py` does **not** execute automatic stock deduction on confirmation. |
| **2. Raktim94/nodedr-restaurant-pos** (`master`) | **AGPL-3.0-only** | NestJS + Prisma + Socket.IO (`apps/backend`) + Next.js/React (`apps/web`), 98 Prisma models | Atomic order + BOM stock deduction & batch costing (`apps/backend/src/modules/orders/orders.service.ts`, `inventory/stock.service.ts`, `costing-calc.service.ts`); ESC/POS TCP/USB encoders (`orders/escpos-network.ts`, `escpos-usb.ts`); UPI QR (`orders/upi.ts`); RBAC overrides + 2FA (`auth/effective-permissions.ts`, `auth/totp.ts`); `CashClosing`, `Expense`, `AuditLog`. | **AGPL-3.0** (strictly pattern reference — never copy code). Uses Socket.IO (`realtime/realtime.gateway.ts`) rather than SSE; heavy monorepo footprint. |
| **3. ARPITPAL1/Cafe-Management-System** (`main`) | **None (`null`)** | React 19 + Vite (`frontend/`) + Django + DRF + SQLite (`backend/`) | Closest single-cafe India domain flow: `TableSession` + QR token regeneration (`backend/tables/models.py`, `tables/views.py`); order-time stock deduction (`backend/orders/views.py` using `RecipeItem`/`StockAdjustmentLog`); `CashierShift`, `PettyCashExpense`, `Coupon` (`backend/billing/models.py`); `ThermalReceiptModal.jsx` & `ZReportModal.jsx`; `CafeProfile` FSSAI/footer (`backend/core/models.py`). | Unlicensed (pattern study only). Django/DRF backend incompatible with our Express/TS runtime; polling without SSE. |
| **4. elitale/restro** (`main`) | **AGPL-3.0-only** | Next.js 16 + React 19 + Prisma 7 + PostgreSQL + Vitest, 23 Prisma models | Clean tested domain actions (`src/actions/order.actions.ts`, `inventory.actions.ts`, `guest-order.actions.ts` + `*.spec.ts`); line-level prep & void (`fireOrderAction`, `serveLineAction`, `voidLineAction`, `settleTableAction`); `MenuItemVariant`, `ModifierGroup`, `RecipeComponent`, `OtpChallenge`, staff PIN lockout (`prisma/migrations/20260719080712_add_staff_login_lockout`). | **AGPL-3.0** (strictly pattern reference — never copy code). No CRM/Loyalty/Campaigns, no shift cash register, no CGST/SGST tax breakdown. |

---

## 5. Evidence-Based Feature Comparison Table

| Feature | Existing App | Best Reference Repo | Recommended Implementation | Status |
|---|---|---|---|---|
| **UI Design System & Navigation Shell** | `src/index.css`, `AppShell.tsx`, 19 responsive dark-amber screens | Ours (Tailored Material 3 CafeOS aesthetic) | Preserve UI design language; lazy-load secondary admin screens to reduce JS bundle >500kB warning | **Working** |
| **Product Catalog (Variants, Add-ons, 86-list)** | Flat `MenuItem[]` in `cafeSeedData.ts`, category/search filter only | `elitale/restro` (`MenuItemVariant`, `ModifierGroup`) + `nodedr` | DB tables for `menu_categories`, `menu_items`, `variants`, `modifier_groups`, `modifiers`, `is_available` ("86 it") & combo support | **Partial** |
| **Money & GST Calculation Engine** | Float INR `number` in `cafeLogic.ts`; POS hardcodes `tax = 0` | `nodedr` (`pricing.ts`, `settlement.ts`) + `rasova` (`VatClass`, `BillSeries`) | Integer **paise** pure engine (`money.ts` / `tax.ts`), CGST/SGST split, inclusive/exclusive mode, sequential `INV-FY-XXXX` invoices | **Needs architecture change** |
| **Backend Server & Persistent Database** | Client-side React state only (`App.tsx`) | `nodedr` / `restro` (Prisma/SQL) + AI Studio Express `server.ts` | Single Express + Vite `server.ts` on port 3000 + PostgreSQL (Cloud SQL + Drizzle ORM) or SQLite (pending Q1 approval) with migrations & `outlet_id` | **Missing** |
| **Auth, Staff PIN & RBAC** | UI mode toggle & `StaffRolesScreen.tsx` PIN switch (no auth) | `nodedr` (`effective-permissions.ts`) + `restro` (PIN lockout) | Cookie HTTP-only sessions + scrypt/bcrypt staff email/password + 4-digit PIN quick-switch with rate-limit lockout + RBAC middleware | **Missing** |
| **POS Terminal & Billing (Hold, Split, Refund)** | Basic cart, Cash/UPI/Card toggle, 4 hardcoded coupons | `nodedr` (`orders.service.ts`) + `arpit` (`ThermalReceiptModal.jsx`) | DB-backed order creation with `idempotency_key`, hold/resume bills, split payments (equal/item/multi-tender), void/refund with manager PIN & audit log | **Partial** |
| **KOT & Kitchen Display System (KDS)** | Live elapsed timers, item checkoffs, mute toggle (`KitchenDisplayScreen.tsx`) | `nodedr` (`kds.service.ts`, `kot-print.service.ts`) + `restro` (`kitchen.actions.ts`) | Real-time SSE + polling updates, station filtering, audio WebAudio chime, line-level prep status, KOT/thermal print HTML view + ESC/POS queue | **Partial** |
| **Tables, Sessions & QR Self-Ordering** | 18 tables across 3 floors, customer table modal; Merge/Transfer stubbed | `arpit` (`TableSession`, `table_regenerate_token_view`) | Real `Merge`/`Transfer` table APIs, QR code SVG/PNG generator (`qrcode`), rotating table tokens + short session PIN/anti-abuse check, shared table bill | **Partial** |
| **Inventory, Recipes (BOM) & Wastage** | Ingredient list, manual restock, low-stock dashboard card | `nodedr` (`stock.service.ts`) + `arpit` (`RecipeItem`) | Recipe BOM linking menu items/modifiers -> ingredients (`kg/g`, `L/ml`, `pcs`), atomic deduction on `CONFIRMED`, restore vs wastage on cancel, PO & stock audit | **Partial** |
| **CRM, Loyalty & DPDP Compliance** | UI cards & CSV export (`CrmCustomersScreen.tsx`, `LoyaltyRewardsAdminScreen.tsx`) | `arpit` (`customers/models.py`) + `nodedr` (`PointsLedger`, `Campaign`) | Phone-normalized CRM profiles (deduped), live LTV/retention aggregates, atomic point earn/redeem ledger, tier upgrades, DPDP consent/opt-out/export/delete | **Partial** |
| **Dynamic Promotions & Coupons** | 4 coupons hardcoded in `cafeLogic.ts`; UI cards in `OffersCampaignsScreen.tsx` | `arpit` (`Coupon`) + `nodedr` (`Coupon`, `Promotion`) | Server-validated dynamic coupon/promo engine (min spend, validity window, usage caps, stack rules) shared by POS and Customer QR checkout | **Partial** |
| **Cash Register Shifts, Expenses & Z-Report** | Not implemented | `arpit` (`CashierShift`, `PettyCashExpense`, `ZReportModal.jsx`) + `nodedr` (`CashClosing`) | Shift open float, paid-in/paid-out petty cash expenses, blind cash count & variance, printable X/Z-Report | **Missing** |
| **Real-Time Transport (SSE + Polling)** | Not implemented (single-tab React state) | Adapted for runtime constraints (SSE + polling) | `/api/events` Express SSE stream scoped by `outlet_id` + automatic 5s polling fallback for KDS, Live Tracking & Tables | **Missing** |
| **Reports & Daily Revenue Trend** | 7-day Recharts chart & KPI cards (`AdminDashboardScreen.tsx`, `ReportsAnalyticsScreen.tsx`) | `nodedr` (`reports`) + `arpit` (`reports`) | Replace synthetic baseline offsets with SQL-backed IST daily revenue, item/category/channel mix, GST summary, wastage, and CSV export | **Partial** |
| **Automated Test Coverage** | 13 `node:test` specs for pure `cafeLogic.ts` helpers | `restro` (`*.actions.spec.ts`) + `nodedr` (`*.spec.ts`) | Expand `node:test` suite for paise/GST math, BOM deduction/restore/wastage, coupon rules, auth/RBAC, order state transitions, + Playwright E2E checks | **Partial** |

---

## 6. Dependency-Ordered Implementation Plan

### Phase 1: Foundation — Backend Runtime, Database Schema, Money & Auth/RBAC
- **Scope:**
  - Set up Express + Vite `server.ts` on port 3000 (`"dev": "tsx server.ts"`, `"start": "node dist-server/server.js"` or `tsx server.ts`).
  - Provision PostgreSQL / Drizzle ORM schema (or SQLite if chosen in Q1) with `outlet_id` on all operational tables, foreign keys, indexes, and idempotent seed script matching current `Seth Sawariya Cafe` data.
  - Implement integer **paise** currency utilities + India **GST (CGST/SGST)** inclusive/exclusive calculator (`src/shared/money.ts`) with comprehensive `node:test` unit tests.
  - Implement Staff Auth (email/password + 4-digit PIN quick-switch with failed-attempt lockout, HTTP-only signed session cookies) and RBAC guards (`admin`, `manager`, `cashier`, `barista`, `server`, `kitchen`), plus `audit_logs` table.
- **Acceptance Criteria:**
  - `tsc --noEmit`, unit tests, and `npm run build` pass.
  - Unauthenticated requests to `/api/staff/*` return `401`; unauthorized role actions (e.g., Barista issuing refund) return `403`.
  - Server starts cleanly on port 3000 and serves existing React UI + `/api/health`.

### Phase 2: Product Catalog, Modifiers & Dynamic Pricing Engine
- **Scope:**
  - Migrate catalog to DB (`menu_categories`, `menu_items`, `menu_item_variants`, `modifier_groups`, `modifiers`, `gst_rate_bps`, `is_available`).
  - Add Catalog Management modal/view inside Staff workspace (create/edit items, variants, add-on groups, instant "86 it" availability toggle).
  - Upgrade Customer Menu & POS Terminal to select variants (e.g., Regular/Large, Hot/Iced) and add-ons (Oat Milk, Extra Shot) with server-validated pricing.
- **Acceptance Criteria:**
  - Staff toggling "86 it" immediately blocks item ordering on Customer Menu & POS and persists across browser reloads.
  - Cart and server quote totals match down to the exact paise with CGST/SGST breakdown.

### Phase 3: Core Order Engine, POS Order Entry & Thermal Receipts
- **Scope:**
  - Build transactional `/api/orders` lifecycle (`PLACED -> CONFIRMED -> PREPARING -> READY -> SERVED` + `CANCELLED`) with `idempotency_key`, immutable `order_events`, and sequential GST invoice numbers (`INV-YYYY-NNNN`).
  - Upgrade `PosTerminalScreen.tsx`: Hold/Resume orders, Manager PIN verification for voids/manual discounts, and browser-printable 80mm thermal GST Receipt & KOT view. Payment processing, settlement, and refunds remain out of scope until a replacement is selected.
- **Acceptance Criteria:**
  - Duplicate order submissions with same `idempotency_key` never create duplicate orders or double stock deductions.
  - Order cancellations require Manager PIN (when enabled), record an audit trail, and update daily sales cleanly.

### Phase 4: Real-Time SSE + KDS & Live Customer Order Tracking
- **Scope:**
  - Implement `/api/events` SSE hub in Express (`outlet_id` + optional `orderId` stream) with automatic client polling fallback.
  - Upgrade `KitchenDisplayScreen.tsx`: live incoming KOTs without refresh, WebAudio chime alert on new ticket, overdue visual SLA highlights, per-item prep toggle, and station filter.
  - Upgrade `LiveTrackingScreen.tsx`: real-time progress synced to staff KDS transitions, customer guest session lookup by order token.
- **Acceptance Criteria:**
  - Order placed on Customer QR or POS appears on open KDS browser tab within `< 2s` via SSE (and within `< 5s` if SSE disconnected via polling).

### Phase 5: Inventory Recipes (BOM), Atomic Stock Deduction, Wastage & Procurement
- **Scope:**
  - Add `ingredients`, `recipes` (menu item/variant/modifier -> ingredient quantity + unit conversion `kg<->g`, `L<->ml`, `pcs`), `stock_movements`, `wastage_logs`, `suppliers`, `purchase_orders`.
  - Wire atomic DB transactions: stock deducted at `CONFIRMED`; restored only if cancelled before `PREPARING`; otherwise logged to `wastage_logs`.
  - Upgrade `InventoryStockScreen.tsx`: real-time KPI valuation & burn from DB, functional **Quick Stock Adjustment / Wastage** drawer, **Recipe Builder** per dish, and **Generate & Receive PO** workflow.
- **Acceptance Criteria:**
  - Unit & integration tests verify: `CONFIRMED` order deducts exact recipe quantities; cancel before `PREPARING` restores stock; cancel at `PREPARING`/`READY` logs wastage and does NOT restore stock.
  - Receiving a Supplier PO increments stock and updates movement ledger.

### Phase 6: Tables, Sessions, Merge/Transfer & Secure QR Self-Ordering
- **Scope:**
  - Persist `cafe_tables`, `table_sessions` (4-digit table PIN / rotating signed QR token), real `Merge` & `Transfer` table endpoints, cleaning/maintenance statuses, and waiter call / bill request alerts.
  - Add QR Poster Generator modal in `TableLayoutScreen.tsx` (using `qrcode`) generating `?table=T03&token=...` deep links validated on the server when guest submits dine-in order.
- **Acceptance Criteria:**
  - Invalid or rotated table QR token is rejected by `/api/public/orders`.
  - Merging or transferring tables moves open orders atomically and frees source table.

### Phase 7: CRM, Loyalty Wallet, Dynamic Coupons & DPDP Privacy
- **Scope:**
  - Normalize phone numbers (`+91` 10-digit deduplication), link orders to `customers`, compute real LTV/visits/retention from DB.
  - Make `OffersCampaignsScreen.tsx` drive dynamic coupons validated server-side at POS and Customer checkout (min order, active dates, max uses).
  - Real `loyalty_ledger` earn-on-settle & redeem-in-checkout mechanics with tier progression (`Bronze -> Silver -> Gold VIP`).
  - Add DPDP Privacy controls: consent checkboxes at signup/checkout, marketing opt-out toggle, customer data JSON/CSV export, and anonymized "Right to Delete" endpoint.
- **Acceptance Criteria:**
  - Customer checkout redeems loyalty points atomically (cannot go negative under concurrent requests).
  - Deleting a customer anonymizes PII (`Deleted Patron`) while preserving financial invoice integrity.

### Phase 8: Shift Cash Management, Petty Cash Expenses & Live Reports (IST)
- **Scope:**
  - Add `cashier_shifts` (opening float, expected cash, actual blind count, variance) and `petty_cash_expenses` (milk run, ice, supplies paid from drawer) + printable Z-Report summary.
  - Upgrade `AdminDashboardScreen.tsx` and `ReportsAnalyticsScreen.tsx` to query live SQL IST-bucketed revenue trends, category/channel mix, GST tax liability summary, COGS/wastage vs sales, and downloadable CSVs.
- **Acceptance Criteria:**
  - Reconciled Z-Report cash matches `opening_float + cash_sales - cash_refunds - petty_cash_expenses` to the exact paise.

### Phase 9: Bundle Optimization, End-to-End Verification & Hardening
- **Scope:**
  - Code-split heavy admin/chart views (`React.lazy`) to eliminate Vite `>500kB` chunk warning and fix `vite.config.ts` `__dirname` deprecation warning.
  - Full Playwright browser verification across Customer QR flow, POS split settlement, KDS SSE transitions, BOM inventory deduction/wastage, Shift Z-Report, and DPDP export/delete.
- **Acceptance Criteria:**
  - `tsc --noEmit`, ESLint, `node:test` backend + logic suite, `vite build`, and Playwright end-to-end checks all pass with zero console/page errors.

---

## 7. Open Questions for User Approval (Max 5)

1. **Database Engine:** Should we provision **Cloud SQL (PostgreSQL) + Drizzle ORM** (hosted, production relational DB via AI Studio's Cloud SQL setup) OR use local embedded **SQLite (`better-sqlite3` + Drizzle ORM)** for zero-setup single-node self-hosting?
2. **Authentication Model:** Do you prefer **built-in CafeOS Staff Email/Password + 4-digit Quick POS PIN** (self-hostable with zero third-party auth dependency), OR **Firebase Authentication**?
3. **Thermal Receipt / KOT Printing:** Is **formatted 80mm browser print CSS (`window.print()`)** sufficient for MVP, or do you also need **ESC/POS raw TCP/network print queue** support for an on-premise thermal printer?
4. **Default GST Pricing Mode:** Should menu prices default to **Tax-Exclusive (`+5% GST = 2.5% CGST + 2.5% SGST` added at checkout)** or **Tax-Inclusive (MRP includes GST, back-calculated on the bill)**?
5. **Initial Outlet & Data Mode:** Start with **Seth Sawariya Cafe** pre-seeded with realistic demo catalog/tables/ingredients ready for immediate testing, or an **empty production-clean setup wizard**?

---

## 8. How to Run Checks

```bash
# Typecheck
npm run lint

# Pure business logic unit tests
npx tsx --test src/utils/cafeLogic.test.ts

# Production build
npm run build
```

## 9. Phase Status Log

| Phase | Status | Notes |
|---|---|---|
| Phase 0: Audit & Plan | **Completed (Awaiting Approval)** | Baseline clean (`tsc` pass, 13/13 tests pass, `vite build` pass). Branch: `phase-0-audit`. |
| Phase 1–9 | Pending | Blocked on user approval of Phase 0 audit & plan. |
