# Security Audit Report — CafeOS SaaS Platform

> **Historical snapshot, not a current audit result.** This report predates later repository changes; findings, routes, and implementation details may be stale. Reassess the current source and regression tests before using it for security or deployment decisions.

**Date:** 2026-11-20  
**Branch:** `security-hardening`  
**Auditor:** Senior Application Security Engineer  
**Status:** Stage 1 Audit Complete — Awaiting Client Review  

---

## 1. Application Context & Architecture Overview

| Dimension | Implementation Details |
| :--- | :--- |
| **Stack** | Node.js (v22), Express.js (v4.21.2), TypeScript (v7/tsx), React 19, Vite 8, Socket.IO (v4.8.4), TailwindCSS v4 |
| **Primary Database** | MongoDB (v7.9.0 via `CafeStore` in-memory authoritative state cache with persistent collections) |
| **Analytical Database** | Optional PostgreSQL (v8.23.1 via `pg` pool, analytical schema migration `001_initial_schema.sql`) |
| **Multi-Tenancy** | Single-outlet operational state in MongoDB (`cafeId: 'seth-sawariya-main'`). Multi-tenant SaaS columns (`cafe_id`) defined in PostgreSQL schema, but MongoDB collections currently lack multi-tenant scoping. |
| **Authentication** | **Staff:** 4-digit PIN authenticated against role scrypt hashes, signed HMAC-SHA256 session cookie (`cafeos_staff_session`).<br>**Customer:** Supabase OAuth / phone OTP Bearer token mapped to CRM identity, signed customer session cookie (`cafeos_customer_session`). |
| **Roles & RBAC** | Staff roles: `admin`, `kitchen`. Customer roles: Guest, Authenticated Customer, CRM Profile. |
| **Payments & Webhooks** | **UPI Gateway:** Server-to-server HMAC-SHA256 signed webhook (`x-signature`).<br>**Cashfree:** REST API + HMAC-SHA256 signed webhook (`x-webhook-signature`, `x-webhook-timestamp`).<br>**Counter Settlement:** Cash, Card swipe, Counter UPI. |
| **File Storage & Uploads**| No server-side multipart file uploads (no `multer`/`busboy`). Client-side ExcelJS & PDFKit export generation. |
| **Hosting & Instances** | Node.js HTTP + WebSocket server listening on port 3000 (configurable via `PORT`). Single instance stateful in-memory cache with MongoDB singleton lease lock (`MONGO_LEASE_ID`). |

---

## 2. Complete API Routes & Authorization Matrix

Below is the comprehensive audit of all API endpoints registered in `src/server/app.ts`:

| # | HTTP Method | Path | Auth Required? | Role Required | Tenant-Scoped? (Y/N) | Notes / Security Status |
| :---: | :---: | :--- | :---: | :---: | :---: | :--- |
| 1 | `POST` | `/api/webhooks/upi-gateway` | Yes (HMAC Signature) | None (Webhook) | N | Verified via raw body HMAC-SHA256 signature (`x-signature`). |
| 2 | `POST` | `/api/webhooks/cashfree` | Yes (HMAC Signature) | None (Webhook) | N | Verified via raw body HMAC-SHA256 signature (`x-webhook-signature`). Deduplicates payment events. |
| 3 | `GET` | `/api/orders/:id/cashfree-checkout` | **No** (Public) | None | N | **Vulnerable to Reflected Script Breakout** via unescaped `JSON.stringify(session)`. |
| 4 | `GET` | `/api/orders/:id/cashfree-return` | **No** (Public) | None | N | Public return redirect after payment completion. |
| 5 | `GET` | `/api/cashfree-mock/checkout` | **No** (Public) | None | N | **Development mock checkout exposed without environment check.** |
| 6 | `POST` | `/api/cashfree-mock/pay` | **No** (Public) | None | N | **CRITICAL: Unauthenticated endpoint marks any order as 'paid'.** |
| 7 | `GET` | `/api/openapi.json` | Prod: Yes / Dev: No | `admin` (Prod) | N | Protected by `docsGuard` in production. |
| 8 | `GET` | `/api/docs` | Prod: Yes / Dev: No | `admin` (Prod) | N | Swagger UI documentation, guarded in production. |
| 9 | `GET` | `/api/health` | **No** (Public) | None | N | Health check returning DB status, client counts, timestamp. |
| 10 | `GET` | `/api/audit` | Yes | `admin` | N | Requires admin role PIN session. Returns audit log. |
| 11 | `GET` | `/api/bootstrap` | **No** (Public) | None | N | **HIGH: Parameter `?screen=kitchen-display-system` forges kitchen role and leaks all orders/stock.** |
| 12 | `GET` | `/api/auth/session` | **No** (Optional) | None | N | Returns current staff session if cookie present. |
| 13 | `POST` | `/api/customer/identity` | Yes (Bearer Token) | None (Customer) | N | Validates Supabase JWT and binds verified phone to CRM ID. |
| 14 | `DELETE` | `/api/customer/identity` | **No** (Public) | None | N | Clears customer CRM session cookie. |
| 15 | `POST` | `/api/auth/pin` | **No** (Public) | None | N | Rate-limited PIN login (10 req/min). Signs staff session. |
| 16 | `POST` | `/api/auth/logout` | **No** (Public) | None | N | Clears staff session cookie. |
| 17 | `POST` | `/api/auth/brevo-confirmation` | **No** (Public) | None | N | **HIGH: Unauthenticated email sender (spam relay/quota exhaustion). Returns OTP code in response.** |
| 18 | `GET` | `/api/orders` | Yes | `admin`, `kitchen` | N | Returns all orders for admin; scoped tickets for kitchen. |
| 19 | `POST` | `/api/orders` | Optional (Guest/Staff) | `admin` for POS | N | Table rate-limited (10 req/min). Server enforces catalog prices. |
| 20 | `POST` | `/api/orders/:id/payment-session` | Yes (Customer / Staff) | `admin` or Order Owner | N | Initiates UPI/Cashfree payment session for valid order owner. |
| 21 | `GET` | `/api/orders/:id/payment-status` | Yes (Customer / Staff) | `admin` or Order Owner | N | Polls payment gateway status for order owner. |
| 22 | `POST` | `/api/orders/:id/pay-counter` | Yes | `admin` | N | Settles order at counter (Cash/Card/UPI). |
| 23 | `POST` | `/api/orders/:id/refund` | Yes | `admin` | N | Issues full order refund and restores stock. |
| 24 | `POST` | `/api/orders/:id/cancel-item` | Yes | `admin`, `kitchen` | N | Cancels order item, recalculates refund, restores recipe stock. |
| 25 | `GET` | `/api/activity-log` | Yes | `admin` | N | Returns operational audit timeline. |
| 26 | `GET` | `/api/orders/:id` | Yes (Customer / Staff) | `admin` or Order Owner | N | IDOR protected via `getAccessibleOrder`. |
| 27 | `POST` | `/api/orders/:id/status` | Yes | `admin`, `kitchen` | N | Transitions order lifecycle status. |
| 28 | `POST` | `/api/orders/:id/transition` | Yes | `admin`, `kitchen` | N | Alias for order status transition. |
| 29 | `PATCH` | `/api/orders/:id/status` | Yes | `admin`, `kitchen` | N | Updates order status. |
| 30 | `POST` | `/api/orders/:id/advance` | Yes | `admin`, `kitchen` | N | Advances order status sequentially. |
| 31 | `POST` | `/api/orders/:id/toggle-item` | Yes | `admin`, `kitchen` | N | Toggles preparation checklist item on KOT. |
| 32 | `POST` | `/api/orders/:id/feedback` | **No** (Bypassable) | None | N | **HIGH: Logic flaw `!staff && customer && !canAccess` lets unauthenticated callers rate any order & farm points.** |
| 33 | `POST` | `/api/customer-feedback` | **No** (Public) | None | N | Rate-limited (5 req/min) customer review submission. |
| 34 | `POST` | `/api/menu/:id/toggle-availability` | Yes | `admin`, `kitchen` | N | 86-item toggle (in stock / out of stock). |
| 35 | `POST` | `/api/menu/items` | Yes | `admin` | N | Creates new menu item. |
| 36 | `POST` | `/api/tables/reserve` | **No** (Public) | None | N | **MEDIUM: Unauthenticated & un-rate-limited table reservation allows floor plan denial-of-service.** |
| 37 | `POST` | `/api/tables` | Yes | `admin` | N | Adds new table to floor layout. |
| 38 | `POST` | `/api/tables/:id/check-in` | Yes | `admin` | N | Checks in diner party to table. |
| 39 | `POST` | `/api/tables/transfer` | Yes | `admin` | N | Transfers order from one table to another. |
| 40 | `POST` | `/api/tables/merge` | Yes | `admin` | N | Merges two tables. |
| 41 | `POST` | `/api/inventory` | Yes | `admin` | N | Adds new raw ingredient. |
| 42 | `POST` | `/api/inventory/:id/restock` | Yes | `admin`, `kitchen` | N | Restocks raw ingredient inventory. |
| 43 | `POST` | `/api/inventory/receive` | Yes | `admin` | N | Records formal stock receipt with batch & expiry. |
| 44 | `POST` | `/api/inventory/waste` | Yes | `admin`, `kitchen` | N | Records stock shrinkage/spoilage. |
| 45 | `POST` | `/api/inventory/transfer` | Yes | `admin`, `kitchen` | N | Transfers stock between storage stations. |
| 46 | `POST` | `/api/inventory/count` | Yes | `admin` | N | Initiates physical inventory audit count. |
| 47 | `POST` | `/api/inventory/count/:id/approve` | Yes | `admin` | N | Approves inventory variance reconciliation. |
| 48 | `POST` | `/api/inventory/purchase-orders` | Yes | `admin` | N | Generates procurement purchase order. |
| 49 | `POST` | `/api/inventory/purchase-orders/receive` | Yes | `admin` | N | Receives purchase order goods into inventory. |
| 50 | `POST` | `/api/inventory/request-reorder` | Yes | `admin`, `kitchen` | N | Raises kitchen ingredient reorder alert. |
| 51 | `POST` | `/api/customers` | Yes | `admin` | N | Creates CRM customer record. |
| 52 | `GET` | `/api/customers/:id/export` | Yes (Customer / Staff) | `admin` or Matching Customer | N | Exports DPDP PII record. IDOR protected. |
| 53 | `POST` | `/api/loyalty/rules` | Yes | `admin` | N | Creates loyalty reward rule. |
| 54 | `POST` | `/api/campaigns` | Yes | `admin` | N | Creates marketing campaign offer. |
| 55 | `POST` | `/api/campaigns/:id/toggle` | Yes | `admin` | N | Activates/pauses/expires campaign offer. |
| 56 | `POST` | `/api/staff` | Yes | `admin` | N | Adds staff member to roster. |
| 57 | `POST` | `/api/staff/:id/toggle-duty` | Yes | `admin` | N | Toggles clock-in / clock-out duty status. |
| 58 | `PUT` | `/api/settings` | Yes | `admin` | N | Updates cafe profile and hardware configuration. |
| 59 | `POST` | `/api/settings/reset` | Yes | `admin` | N | Resets cafe settings to initial seed defaults. |
| 60 | `WS` | `/socket.io` | **No** (Spoofable) | None enforced | N | **CRITICAL: Query parameter `?scope=kitchen` or `Referer` bypasses auth and joins internal staff/kitchen event channels.** |

---

## 3. Vulnerability Findings & Severity Classification

### [CRITICAL] FINDING 1: Unauthenticated Payment Settlement via Exposed Mock Payment Endpoint
- **Severity:** `Critical` (CVSS 9.8)
- **File & Endpoint:** `src/server/app.ts` (`POST /api/cashfree-mock/pay` & `GET /api/cashfree-mock/checkout`)
- **Description:**  
  The endpoint `POST /api/cashfree-mock/pay` processes payment simulations without checking the user's role or `NODE_ENV`. It takes an arbitrary `orderId` in the body and calls `upiGateway.simulateMockPayment()` followed by `store.attachGatewayPayment(..., 'paid', ...)`.
- **Exploit Scenario:**  
  An attacker places an online or dine-in order for ₹5,000. Without opening any gateway or paying any money, the attacker sends:
  ```bash
  curl -X POST http://target/api/cashfree-mock/pay -d "orderId=<ORDER_ID>"
  ```
  The order status is instantly mutated to `paid`, stock is deducted, kitchen tickets print, and the order is marked settled, resulting in complete financial loss and unpaid food theft.
- **Recommended Fix:**  
  Completely disable `/api/cashfree-mock/*` routes in production:
  ```ts
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Endpoint not available in production' });
  }
  ```

---

### [CRITICAL] FINDING 2: WebSocket Authentication Bypass via Spoofed Query Parameters and Referer Header
- **Severity:** `Critical` (CVSS 9.1)
- **File & Endpoint:** `src/server/app.ts` (Lines 174–194, 209–232 in Socket.IO handlers)
- **Description:**  
  WebSocket room authorization evaluates client-controlled handshake data:
  ```ts
  const isKitchenStation = queryScope === 'kitchen' || socket.handshake.query.station === 'kitchen' || referer.includes('/kitchen');
  const isStaffStation = queryScope === 'staff' || referer.includes('/admin') || referer.includes('/pos');
  if (isKitchenStation) {
    void socket.join(KITCHEN_ROOM);
    void socket.join(STAFF_ROOM);
  }
  ```
  The server places the socket into `STAFF_ROOM` and `KITCHEN_ROOM` without checking or validating the `cafeos_staff_session` cookie.
- **Exploit Scenario:**  
  An unauthenticated attacker connects a WebSocket client:
  ```js
  const socket = io('https://cafe.example.com', { query: { scope: 'kitchen' } });
  socket.onAny((event, data) => console.log('Stolen Internal Event:', event, data));
  ```
  The attacker receives all real-time order tickets, customer phone numbers, dine-in table bills, cashier activities, and inventory movement updates.
- **Recommended Fix:**  
  Enforce strict cookie-based cryptographic session verification before joining privileged rooms:
  ```ts
  if (staffSession && hasStaffRole(staffSession, ['admin', 'kitchen'])) {
    socket.join(KITCHEN_ROOM);
    if (staffSession.role === 'admin') socket.join(STAFF_ROOM);
  }
  ```
  Never authorize socket privileges based on query parameters or `Referer` headers.

---

### [HIGH] FINDING 3: Kitchen Operational State Disclosure to Unauthenticated Visitors via Bootstrap Query
- **Severity:** `High` (CVSS 8.2)
- **File & Endpoint:** `src/server/store.ts` (Lines 1085–1098) & `src/server/app.ts` (`GET /api/bootstrap`)
- **Description:**  
  In `store.getRouteData()`, requesting a kitchen screen triggers automatic synthesis of a staff session:
  ```ts
  if (kitchenRoute || ['kitchen-display-system', 'pos-orders', 'kitchen-tables'].includes(screen)) {
    return this.getBootstrap({
      staffSession: { role: 'kitchen', staffName: 'Kitchen Terminal', ... },
      customerSession: null,
    });
  }
  ```
  `GET /api/bootstrap?screen=kitchen-display-system` requires no authentication and returns full operational data: all active and past orders, customer names, table assignments, and inventory stock.
- **Exploit Scenario:**  
  An attacker issues:
  ```bash
  curl "https://cafe.example.com/api/bootstrap?screen=kitchen-display-system"
  ```
  The API returns all internal orders, pending KOT tickets, table numbers, guest identities, and stock counts.
- **Recommended Fix:**  
  Require an active, verified `staffSession` in `req` before returning kitchen route data. If the user is unauthenticated or has a customer session, return strictly public customer catalog data.

---

### [HIGH] FINDING 4: Authorization Logic Flaw on Order Feedback Endpoint (IDOR & Point Farming)
- **Severity:** `High` (CVSS 7.5)
- **File & Endpoint:** `src/server/app.ts` (Line 1442 on `POST /api/orders/:id/feedback`)
- **Description:**  
  The endpoint verifies authorization using:
  ```ts
  if (!staffSession && customerSession && !canCustomerAccessOrder(customerSession, orderId)) {
    return res.status(403)...
  }
  ```
  If an attacker sends a request with **no cookie at all** (`customerSession` is `null`), `!staffSession && customerSession` is `false`, bypassing the check entirely.
- **Exploit Scenario:**  
  An attacker iterates through order IDs and sends requests without cookies to submit fake reviews, degrade rating metrics, overwrite customer feedback comments, and trigger loyalty point awards (`pointsAwarded = 25`).
- **Recommended Fix:**  
  Enforce that the caller must possess valid authorization:
  ```ts
  const isAuthorized = staffSession
    ? hasStaffRole(staffSession, ['admin'])
    : customerSession && canCustomerAccessOrder(customerSession, orderId);

  if (!isAuthorized) {
    return res.status(403).json({ error: 'You do not have permission to leave feedback for this order.' });
  }
  ```

---

### [HIGH] FINDING 5: Reflected Script Breakout / XSS in Cashfree Checkout Template
- **Severity:** `High` (CVSS 7.2)
- **File & Endpoint:** `src/server/app.ts` (Lines 651–655 in `GET /api/orders/:id/cashfree-checkout`)
- **Description:**  
  The server constructs an inline HTML page containing:
  ```html
  <script>
    const session = ${JSON.stringify(session)};
    const mode = ${JSON.stringify(mode)};
  </script>
  ```
  `JSON.stringify` does not escape `</script>` sequences. Supplying `</script><script>alert(document.domain)</script>` in the `session` query parameter breaks out of the string literal and executes arbitrary JavaScript in the victim's browser.
- **Exploit Scenario:**  
  An attacker distributes a phishing link to cafe customers or staff:
  `https://cafe.example.com/api/orders/order-1/cashfree-checkout?session=</script><script>/*payload*/</script>`
  Opening the link executes the injected script with the origins' privileges, stealing session cookies or capturing card details.
- **Recommended Fix:**  
  Escape HTML entities in JSON serialization (`replace(/</g, '\\u003c')`) or serve checkout via a clean static HTML file that fetches session data through an API endpoint.

---

### [HIGH] FINDING 6: Unauthenticated Transactional Email Relay (Spam & Quota Exhaustion)
- **Severity:** `High` (CVSS 7.5)
- **File & Endpoint:** `src/server/app.ts` (`POST /api/auth/brevo-confirmation`)
- **Description:**  
  `POST /api/auth/brevo-confirmation` is an unauthenticated, un-rate-limited endpoint that invokes the external Brevo API to send verification emails to any target email address specified in `req.body.email`. It also echoes the generated verification `code` back to the client in the HTTP response.
- **Exploit Scenario:**  
  A script sends 10,000 requests targeting third-party email addresses. The cafe's Brevo account is suspended for sending spam, API quotas are exhausted, and the business domain is blacklisted on spam filters.
- **Recommended Fix:**  
  Apply strict IP and target-email rate limiting, require CAPTCHA verification, restrict to logged-in sessions or authenticated checkout, and do not reflect the secret code in production API responses.

---

### [MEDIUM] FINDING 7: Denial of Service via Table Reservation Flooding
- **Severity:** `Medium` (CVSS 6.5)
- **File & Endpoint:** `src/server/app.ts` (`POST /api/tables/reserve`)
- **Description:**  
  `POST /api/tables/reserve` accepts reservations from unauthenticated users with no rate limiting.
- **Exploit Scenario:**  
  An attacker invokes the endpoint in a quick loop for all table IDs (`T1` through `T12`). Every table transitions to `reserved` status, preventing POS operators and waitstaff from assigning tables to walk-in diners.
- **Recommended Fix:**  
  Apply rate limiting, require customer phone/session verification, and implement maximum party size validation.

---

### [MEDIUM] FINDING 8: Rate Limiter Evasion via Spoofed X-Forwarded-For Header
- **Severity:** `Medium` (CVSS 6.3)
- **File & Endpoint:** `src/server/rateLimit.ts` (Line 27 in `getTrustedClientIp`)
- **Description:**  
  `getTrustedClientIp` inspects `req.headers['x-forwarded-for']` and returns `parts[0]` (the leftmost IP). In an HTTP forward chain, `parts[0]` is the client-provided header value, which can be spoofed by the client.
- **Exploit Scenario:**  
  An attacker brute-forces the 4-digit staff PIN on `/api/auth/pin` by sending a different `X-Forwarded-For` header with each request, bypassing the 10 request/minute limit.
- **Recommended Fix:**  
  Rely on Express's native `req.ip` configured with trusted reverse proxy CIDRs (`app.set('trust proxy', ...)`), or take the rightmost IP provided by the immediate proxy.

---

### [MEDIUM] FINDING 9: Absence of Tenant Scoping in MongoDB State Layer
- **Severity:** `Medium` (CVSS 5.4)
- **File & Endpoint:** `src/server/store.ts` (Data Access Layer)
- **Description:**  
  MongoDB collections store state globally under a single outlet key (`seth-sawariya-main`). The PostgreSQL database migration includes `cafe_id` foreign keys, but MongoDB operations do not isolate documents by tenant.
- **Exploit Scenario:**  
  If the platform is onboarded as a multi-tenant SaaS hosting multiple cafes on a single MongoDB cluster, data queries will bleed across tenants due to the lack of tenant isolation in the data layer.
- **Recommended Fix:**  
  Scope all queries, mutations, indexes, and cache lookups by `tenantId` / `cafeId` throughout the data access layer.

---

### [MEDIUM] FINDING 10: Missing Security Headers (CSP, HSTS, Permissions-Policy)
- **Severity:** `Medium` (CVSS 5.0)
- **File & Endpoint:** `src/server/app.ts` (Lines 789–794)
- **Description:**  
  The server sets `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`, but lacks Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), and Permissions-Policy headers.
- **Recommended Fix:**  
  Add `helmet` middleware or configure standard security headers:
  - `Content-Security-Policy-Report-Only` (transitioning to enforcing mode).
  - `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`).
  - `Permissions-Policy` (`camera=(), microphone=(), geolocation=()`).

---

### [MEDIUM] FINDING 11: Missing Express CORS & Anti-CSRF Token Validation
- **Severity:** `Medium` (CVSS 5.3)
- **File & Endpoint:** `src/server/app.ts`
- **Description:**  
  While Socket.IO configures CORS with origin validation, Express REST endpoints lack a global CORS middleware. State-changing POST/PUT requests rely solely on cookie `SameSite=Lax` without anti-CSRF token verification or `Origin` header checking.
- **Recommended Fix:**  
  Attach Express `cors` middleware with explicit allowlist and enforce `Origin` / `Sec-Fetch-Site` header checks on mutating requests.

---

### [LOW] FINDING 12: 4-Digit Staff PIN Search Space
- **Severity:** `Low` (CVSS 3.7)
- **File & Endpoint:** `src/server/auth.ts`
- **Description:**  
  Staff PINs are 4 digits (0000–9999). Without account lockout or progressive delays per role, distributed attacks could guess the PIN over time.
- **Recommended Fix:**  
  Implement progressive lockout (e.g. 5 failed attempts per role locks the role for 5 minutes), and support alpha-numeric passcodes for administrator roles.

---

### [LOW] FINDING 13: Transitive Dependency Audit Warnings
- **Severity:** `Low` (CVSS 3.3)
- **File & Endpoint:** `package.json` / `npm audit`
- **Description:**  
  `npm audit` reports 6 moderate vulnerabilities in transitive packages (`minimatch` via `@ts-morph/common`, `uuid` via `exceljs`).
- **Recommended Fix:**  
  Update dependencies in a separate commit after verifying breaking change impacts.

---

## 4. Threat Summary Matrix

| Severity | Count | Key Focus Areas |
| :--- | :---: | :--- |
| **Critical** | 2 | Mock payment order settlement exploit, WebSocket unauthenticated channel snooping |
| **High** | 4 | Kitchen data disclosure in bootstrap, IDOR review bypass, XSS in checkout, Brevo spam relay |
| **Medium** | 5 | Table reservation DoS, rate limit IP spoofing, tenant scoping, missing CSP/HSTS, missing CORS/CSRF |
| **Low** | 2 | 4-digit PIN space, transitive dependency audit warnings |

---

## 5. Next Steps (Stage 2–7 Plan)

1. **STAGE 2: ACCESS CONTROL**
   - Eliminate unauthenticated mock payment routes in production.
   - Fix WebSocket authentication so only verified staff sessions join staff/kitchen rooms.
   - Enforce authentication on kitchen bootstrap routes.
   - Fix IDOR check on `/api/orders/:id/feedback`.
2. **STAGE 3: INPUT, QUERIES & ABUSE PROTECTION**
   - Add rate limiting and CAPTCHA protection to `/api/tables/reserve` and `/api/auth/brevo-confirmation`.
   - Fix IP extraction in `rateLimit.ts` to prevent header spoofing.
3. **STAGE 4: AUTH LIFECYCLE & TRANSPORT**
   - Implement CSP (report-only), HSTS, and Permissions-Policy headers.
   - Add Express CORS middleware and CSRF protection on mutating endpoints.
   - Escape JSON in HTML templates to remediate XSS.
4. **STAGE 5: OPERATIONS & SECRETS**
   - Enforce environment variable validation and audit log protections.
   - Upgrade transitive dependencies via `npm audit`.
5. **STAGE 6: SECURITY TESTS**
   - Write comprehensive automated tests verifying all fixes.
6. **STAGE 7: FINAL REPORT**
   - Document full verification diff and deployment checklist.

---

**STOP.** Stage 1 Audit is complete. Please review `SECURITY_AUDIT.md` before we proceed to Stage 2 remediations.
