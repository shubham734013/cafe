# CafeOS — Dependency & Integration Audit

**Project:** Seth Sawariya CafeOS (`react ^19.0.1`, `vite ^8.3.0`, `tailwindcss ^4.3.3`, `express ^4.21.2`, `typescript ^7.0.2`, `tsx ^4.21.0`)
**Date:** Phase 0 -> Integration Upgrade
**Goal:** Maximize mature, open-source, zero/low-cost reusable libraries compatible with the existing stack while preserving CafeOS UI design (`#17120f`, `#ffc174`, `#f59e0b`, `Plus Jakarta Sans`) and avoiding redundant installs or AGPL/unlicensed code copying.

---

## 1. Existing Dependencies Audit (Reused In-Place)

| Package | Installed Version | License | Current Usage | Integration Action |
|---|---|---|---|---|
| `react` / `react-dom` | `^19.0.1` | MIT | SPA runtime | Keep; verify all new UI/PDF/form libraries support React 19. |
| `tailwindcss` / `@tailwindcss/vite` | `^4.3.3` | MIT | Warm-dark Material 3 `@theme` tokens (`src/index.css`) | Keep and preserve custom tokens when initializing `shadcn/ui`. |
| `recharts` | `^3.10.1` | MIT | `AdminDashboardScreen.tsx` 7-day trend | **Reuse**; also upgrade `ReportsAnalyticsScreen.tsx` static SVG bar chart to interactive Recharts `BarChart`. |
| `lucide-react` | `^0.546.0` | ISC | Icons & `shadcn/ui` peer icon set | Keep; do not install duplicate icon packs. |
| `motion` | `^12.23.24` | MIT | UI transitions | Keep; do not install redundant animation libs. |
| `express` / `dotenv` / `tsx` | `^4.21.2` / `^17.2.3` / `^4.21.0` | MIT / BSD-2 | Installed in `package.json`, currently unused | **Wire up** `server.ts` on port 3000 with `vite.middlewares` + REST APIs + Socket.IO. |

---

## 2. Reference Repository Inspection (Pattern Study Only — Zero Code Copied)

| Repository | License | Stack & Key Dependencies Observed | Verified Architecture Findings |
|---|---|---|---|
| `Rajathtuesday/restaurant-pos` (`qsr`) | **None (`null`)** | Python/Django + PostgreSQL + Celery/Redis + `qrcode==8.2` + `openpyxl` + `weasyprint` + `sentry-sdk` | Multi-tenant bill series, recipe BOM models, print queue separation. Unlicensed -> patterns only. |
| `Raktim94/nodedr-restaurant-pos` (`master`) | **AGPL-3.0-only** | NestJS + Socket.IO `4.8.3` + `@nestjs/swagger` + `zod 4.6.6` + `exceljs 4.4.0` + `qrcode 1.5.4` + Next.js (`react-hook-form`, `@tanstack/react-query`, `@tanstack/react-table 8.21.3`, `sonner`, `shadcn`, `recharts`) | Confirms industry-standard Node/React POS combo (`zod` + `react-hook-form` + `tanstack` + `exceljs` + `qrcode` + `socket.io` + `sonner`). AGPL -> zero code copied. |
| `ARPITPAL1/Cafe-Management-System` (`main`) | **None (`null`)** | React 19 + Vite 8 + `react-router-dom` + Django/DRF (`db.sqlite3`) | Confirms India single-cafe table QR sessions, shift float, and 80mm receipt patterns. Unlicensed -> zero code copied. |
| `elitale/restro` (`main`) | **AGPL-3.0-only** | Next.js 16 + React 19 + Prisma 7 + `@tanstack/react-table 8.21.3` + `qrcode 1.5.4` + `sonner 2.0.7` + `shadcn` + `zod 4.4.3` | Clean line-level prep/void & `@tanstack/react-table` data table patterns. AGPL -> zero code copied. |

---

## 3. Preferred Tools Evaluation (19 Requested Tools)

| Tool / Feature | Selected Package & Verified Version | License | React 19 / Stack Compat | Cost / Infra | Verdict & Integration Scope |
|---|---|---|---|---|---|
| **1. Form State** | `react-hook-form` `7.92.0` + `@hookform/resolvers` `7.0.6` | MIT | `react ^16.8 \|\| ^19` (Verified) | Free | **ADOPT NOW** — Migrate modal/settings forms (`TableLayout`, `InventoryStock`, `CrmCustomers`, `LoyaltyRewardsAdmin`, `OffersCampaigns`, `StaffRoles`, `SettingsProfile`). |
| **2. Validation** | `zod` `4.6.7` | MIT | Pure TS/ESM (Verified) | Free | **ADOPT NOW** — Single source of truth schemas (`src/shared/schemas.ts`) shared between RHF forms & Express API routes. |
| **3. Server State** | `@tanstack/react-query` `5.107.1` | MIT | `react ^18 \|\| ^19` (Verified) | Free | **ADOPT NOW** — Replace client-only `useState` arrays with `/api/bootstrap` queries, optimistic/invalidated mutations & Socket.IO sync. |
| **4. Client State** | `zustand` `5.1.0` | MIT | `react >=18.0.0` (Verified) | Free | **ADOPT NOW** — Move UI navigation, service mode, selected table, carts, coupon/payment state out of `App.tsx` (`src/store/useCafeStore.ts`) with `localStorage` cart persistence. |
| **5. Reusable UI** | `shadcn/ui` (`clsx`, `tailwind-merge`, `cva`, Radix/Base primitives) | MIT | Tailwind v4 + React 19 | Free | **ADOPT NOW** — Initialize with `npx shadcn@latest init --defaults`, preserve CafeOS warm-dark `@theme` tokens, use accessible `Dialog`, `Button`, `Badge`, `Tabs`, `Switch`, `Table`. |
| **6. Data Tables** | `@tanstack/react-table` `8.21.3` (LTS v8) | MIT | `react >=16.8` (Verified) | Free | **ADOPT NOW** — Add sortable, searchable, paginated table views (with card/table toggle) in `OrderManagementScreen`, `InventoryStockScreen`, and `CrmCustomersScreen`. |
| **7. Notifications** | `sonner` `2.0.8` | MIT | `react ^18 \|\| ^19` (Verified) | Free | **ADOPT NOW** — Replace custom `toastMsg` + `setTimeout` in `App.tsx` with `<Toaster />` and `toast.success/info/error`. |
| **8. QR Codes** | `qrcode` `1.5.4` + `@types/qrcode` `1.5.6` | MIT | Universal Node/Browser | Free | **ADOPT NOW** — Real scannable QR codes for Table Self-Ordering deep links (`TableLayoutScreen`) and dynamic `upi://pay` payment QRs (`PosTerminalScreen`). |
| **9. Excel Export** | `exceljs` `4.4.0` | MIT | Browser/Node ESM | Free | **ADOPT NOW** — Real formatted `.xlsx` workbook exports (styled headers, INR formatting, auto column widths) for Orders, Inventory, Customers, and Loyalty Ledger (keeping CSV working alongside). |
| **10. PDF Invoices & Reports** | `@react-pdf/renderer` `4.9.0` | MIT | `react ^16.8 .. ^19` (Verified) | Free | **ADOPT NOW (Lazy-Loaded)** — Downloadable GST Tax Invoice PDFs (`LiveTrackingScreen`, `OrderManagementScreen`) & Sales Summary PDF (`ReportsAnalyticsScreen`). |
| **11. Real-Time Updates** | `socket.io` `4.8.4` + `socket.io-client` `4.8.4` | MIT | Express 4 HTTP server | Free | **ADOPT NOW** — Attached to Express on port 3000 (`server.ts`), pushing live `order:created`, `order:updated`, `table:updated`, `inventory:updated` across all browser tabs with TanStack Query polling fallback. |
| **12. API Docs** | `swagger-ui-express` `5.0.1` + `@types/swagger-ui-express` `4.1.8` | MIT | `express >=4.0.0` (Verified) | Free | **ADOPT NOW** — OpenAPI 3.0.3 JSON spec (`/api/openapi.json`) & interactive Swagger UI (`/api/docs`). |
| **13. Analytics Charts** | `recharts` `^3.10.1` (Already Installed) | MIT | React 19 | Free | **REUSE** — Keep in `AdminDashboardScreen`; extend to `ReportsAnalyticsScreen` interactive bar chart. |
| **14. Authentication** | `better-auth` `1.7.22` vs Built-in Staff PIN Session | MIT | Requires DB adapter (`pg`/`drizzle`/`prisma`/`sqlite`) | Free | **LIGHTWEIGHT BUILT-IN NOW / BETTER-AUTH READY** — Current container has no provisioned SQL DB; adding `better-auth` without a DB forces in-memory sessions or extra DB drivers. Implemented lightweight HMAC-SHA256 HTTP-only cookie + `scryptSync` Staff PIN guard (`/api/auth/*`) compatible with existing Customer/Staff switching, cleanly swappable to `better-auth` when PostgreSQL/Cloud SQL is provisioned. |
| **15. Background Jobs** | `bullmq` `6.7.6` | MIT | Requires Redis `>=5.0` | Redis hosting | **DEFER (No Redis in Runtime)** — Not installed because Redis is unavailable in the container; server persistence and event broadcasts run asynchronously in-process with modular job interfaces. |
| **16. Transactional Email** | `resend` `6.38.0` | MIT | Node SDK | Free tier (3k/mo) + API key | **DEFER / ENV-GUARDED** — Requires `RESEND_API_KEY` + verified domain; core receipts use PDF/print without external SaaS failure points. |
| **17. File Uploads** | `better-upload` `2.0.3` + `@aws-sdk/client-s3` | MIT | Requires S3/R2 bucket | S3/R2 storage | **DEFER** — Existing cafe menu uses local/curated static assets; no user file-upload workflow exists yet. |
| **18. Payment Gateway** | `razorpay` `2.9.8` | MIT | Node SDK | ~2% txn fee + KYC keys | **DEFER (Phase 2/3)** — Per Section 2 defaults, POS records manual Cash/Card/UPI (augmented by zero-fee dynamic `upi://pay` QR codes). |
| **19. Error Monitoring** | `@sentry/react` / `@sentry/node` `11.12.0` | MIT | React 19 / Express | Free tier + `SENTRY_DSN` | **DEFER** — No `SENTRY_DSN` configured; Express centralized error handler + React error handling cover local reliability without external telemetry bloat. |

---

## 4. Incremental Implementation Plan

1. **Backend & Real-Time Foundation (`server.ts`, `src/server/*`, `src/shared/schemas.ts`)**:
   - Unified Express + Vite (`vite.middlewares`) + Socket.IO server on port 3000 (`npm run dev` -> `tsx server.ts`).
   - JSON file-backed authoritative store (`.data/cafe-state.json`) so orders, tables, inventory, customers, loyalty rules, campaigns, staff, and settings survive reloads and sync across tabs.
   - Zod-validated REST API (`/api/bootstrap`, `/api/orders`, `/api/tables`, `/api/inventory`, `/api/customers`, `/api/loyalty`, `/api/campaigns`, `/api/staff`, `/api/settings`, `/api/auth/*`), Swagger UI (`/api/docs`), and Socket.IO broadcasts.
2. **Client State & UI Foundation (`src/store/useCafeStore.ts`, `src/hooks/useCafeApi.ts`, `shadcn/ui`, `sonner`)**:
   - Install `shadcn/ui` preserving CafeOS warm-dark `@theme` tokens.
   - Replace `toastMsg` in `App.tsx` with `Sonner`; extract client state to Zustand and server state to TanStack Query + Socket.IO live sync.
3. **Validated Forms & Data Tables (`react-hook-form` + `zod` + `@tanstack/react-table`)**:
   - Convert all 7 modal/settings forms to RHF + Zod + `shadcn/ui` `Dialog`/`Switch` with real inline validation messages.
   - Add sortable/searchable `@tanstack/react-table` views inside `OrderManagementScreen`, `InventoryStockScreen`, and `CrmCustomersScreen` alongside existing card layouts.
4. **QR Codes, ExcelJS, React PDF & Recharts Reuse**:
   - Add Table Self-Order QR modal (`TableLayoutScreen`) and Dynamic UPI Payment QR modal (`PosTerminalScreen`) using `qrcode`.
   - Implement real `.xlsx` workbook generation (`src/utils/exporters.ts` with `exceljs`) and lazy-loaded GST Invoice / Sales Report PDFs (`src/components/CafePdfDocuments.tsx` with `@react-pdf/renderer`).
   - Upgrade `ReportsAnalyticsScreen` bar chart to Recharts and lazy-load heavy admin screens in `App.tsx` to optimize bundle size.
