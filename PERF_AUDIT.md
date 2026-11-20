# CafeOS Performance, Reliability & SRE Audit (PERF_AUDIT.md)

**Audit Date**: 2026-11-20  
**Auditor**: Senior Backend / SRE Engineer  
**Scope**: Node.js/Express backend (`src/server/`), MongoDB driver integration (`src/server/store.ts`), Socket.IO, PostgreSQL optional ledger (`src/server/db.ts`), HTTP pipeline, lifecycle & deployment.

---

## 1. System & Architecture Overview

- **Architecture**: Modular Monolith in Node.js/TypeScript + Express 4.21.
- **Primary Data Store**: MongoDB Atlas / local MongoDB (authoritative single source of truth for orders, inventory, customers, state, and audit logs).
- **Secondary / Analytical Store**: PostgreSQL optional connection pool (`pg`) for offline financial reporting.
- **Real-Time Layer**: Socket.IO 4.8 with in-memory adapter.
- **In-Memory Replica State**: `CafeStore` (`src/server/store.ts`) keeps fast in-memory lookup maps (`ordersById`, `menuById`, `tablesById`, `customersById`) and flushes coalesced normalized snapshots to MongoDB across 12 collections (`cafe_orders`, `cafe_tables`, `cafe_inventory`, etc.).
- **Branch**: `perf/hardening`

---

## 2. Findings Log

### Finding 1: Incomplete HTTP Server Graceful Shutdown Drain
- **Problem**: In `server.ts`, the SIGINT/SIGTERM shutdown handler closes Vite and Socket.IO, flushes MongoDB, and closes PostgreSQL pool, but **never calls `httpServer.close()`**. In-flight HTTP requests are abruptly terminated, and new connections are accepted while DB is closing.
- **Module**: `server.ts` / Process Lifecycle
- **Impact**: Dropped client requests during deployments, corrupted in-flight writes, 502/504 spikes on Render during restarts.
- **Severity**: High
- **Fix**: Call `httpServer.close()` first to stop accepting new traffic, wait for active connections to drain with a bounded timeout (e.g., 5s), then close Socket.IO, flush `CafeStore`, and terminate DB pools.
- **Priority**: P0 (Correctness / Reliability)

---

### Finding 2: Missing HTTP Header Idempotency for Order Creation & Duplicate Payment Handling
- **Problem**: `POST /api/orders` checks `input.idempotencyKey` only if supplied within the JSON body; it ignores standard `Idempotency-Key` or `X-Idempotency-Key` HTTP headers sent by web clients and POS terminals. Furthermore, `/api/webhooks/upi-gateway` does not deduplicate processed payment events (unlike Cashfree webhook).
- **Module**: `src/server/app.ts` (`POST /api/orders`, `/api/webhooks/upi-gateway`), `src/server/store.ts`
- **Impact**: Duplicate order generation under network retries, double charges, ghost orders.
- **Severity**: High
- **Fix**: Bind `req.header('idempotency-key') || req.header('x-idempotency-key')` to order creation input; enforce `store.hasProcessedPaymentEvent()` on all webhook routes.
- **Priority**: P0 (Correctness / Financial Integrity)

---

### Finding 3: Missing Startup Environment Variable Validation Schema
- **Problem**: Environment variables are checked ad-hoc throughout the codebase with fallback defaults (e.g. `mongodb://127.0.0.1:27017`). Misconfigurations, missing secrets in production, or invalid ports fail late during runtime.
- **Module**: `server.ts`, `src/server/auth.ts`, `src/server/app.ts`
- **Impact**: Silent fallback to insecure dev defaults in production, unexpected crash loops during traffic.
- **Severity**: High
- **Fix**: Implement strict Zod schema validator for environment variables at boot in `server.ts` before any server initialization or database connection.
- **Priority**: P0 (Reliability)

---

### Finding 4: Unbounded MongoDB Connection Pool Settings vs Atlas Limits
- **Problem**: `store.connectMongo()` instantiates `MongoClient(uri, { serverSelectionTimeoutMS: 5000 })` without setting `maxPoolSize`, `minPoolSize`, or `maxIdleTimeMS`. The driver defaults to 100 connections per instance.
- **Module**: `src/server/store.ts`
- **Impact**: On MongoDB Atlas M0/M2/M5 tiers (connection limit 100–500), connection exhaustion occurs rapidly, starving other services or subsequent instances.
- **Severity**: High
- **Fix**: Configure bounded pool: `maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20)`, `minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2)`, `maxIdleTimeMS: 30000`.
- **Priority**: P1 (Database / Stability)

---

### Finding 5: Race Condition & Non-Atomic Operations in Inventory Deduction
- **Problem**: Recipe ingredient stock deduction (`store.deductStockForOrder`) performs in-memory read-modify-write across `this.state.inventory` arrays before persisting. Concurrent order placement could race or decrement below zero.
- **Module**: `src/server/store.ts` (`createOrder`, `deductStockForOrder`)
- **Impact**: Inventory inconsistency, negative stock, overselling out-of-stock items under concurrency.
- **Severity**: High
- **Fix**: Use atomic stock verification and deduplication guards; prevent double-burn with transactional locking or atomic checks.
- **Priority**: P1 (Correctness & Consistency)

---

### Finding 6: Missing Dedicated `/health/live` and `/health/ready` Endpoints
- **Problem**: Only `/api/health` exists. Container orchestrators (Kubernetes, Render, Docker) distinguish between liveness (process alive, non-blocking) and readiness (ready to serve traffic with DB healthy).
- **Module**: `src/server/app.ts`
- **Impact**: Heavy health checks can cause false restart loops; conversely, deadlocked instances continue receiving traffic.
- **Severity**: Medium
- **Fix**: Add lightweight `/health/live` (200 OK immediately) and `/health/ready` (evaluates MongoDB persistence & memory pressure without exposing secrets).
- **Priority**: P1 (Observability / Orchestration)

---

### Finding 7: Missing Compound & Operational MongoDB Indexes
- **Problem**: Only `{ revision: 1 }` exists on revision collections and `{ createdAt: -1 }` on audit logs. Operational collections like `cafe_orders` lack indexes on `customerId`, `status`, and `createdAt`. `cafeos_locks` lacks a TTL index on `expiresAt`.
- **Module**: `src/server/store.ts`
- **Impact**: Collection scans (`COLLSCAN`) during audit queries, state recovery, and historical analytics.
- **Severity**: Medium
- **Fix**: Create compound indexes: `{ 'value.customerId': 1, 'value.createdAt': -1 }`, `{ 'value.status': 1 }`, and TTL index on `cafeos_locks.expiresAt`.
- **Priority**: P2 (Database Performance)

---

### Finding 8: Missing List Endpoint Pagination, Sorting Allowlists, & Projections
- **Problem**: Endpoints like `/api/audit`, `/api/activity-log`, and historical orders return unbounded arrays.
- **Module**: `src/server/app.ts`, `src/server/store.ts`
- **Impact**: Large payload serialization overhead, high memory spikes on client & server.
- **Severity**: Medium
- **Fix**: Enforce default `limit=50`, `maxLimit=200`, validate `sortBy` against allowlist, and use projections where possible.
- **Priority**: P2 (Performance)

---

### Finding 9: Lack of Structured JSON Logging (Pino) & Request Latency Tracing
- **Problem**: Ad-hoc `console.log` and `console.error` are unstructured and lack correlation/request IDs, timestamps, and latency tracking.
- **Module**: Whole server (`server.ts`, `app.ts`)
- **Impact**: Inability to parse logs with datadog/cloudwatch, hard to debug latency spikes in production.
- **Severity**: Medium
- **Fix**: Introduce structured logger (Pino) with correlation IDs and HTTP request logging middleware.
- **Priority**: P2 (Observability)

---

### Finding 10: External Call Resilience (Timeouts & Circuit Breaker)
- **Problem**: Outbound calls to Cashfree / Brevo email use standard `fetch` without configured timeout limits or circuit breakers.
- **Module**: `src/server/cashfreeGateway.ts`, `src/server/brevo.ts`
- **Impact**: A hanging external API hangs Express request workers, cascading into thread starvation.
- **Severity**: Medium
- **Fix**: Implement `AbortSignal.timeout(5000)` and bounded backoff retries with graceful fallbacks.
- **Priority**: P2 (Resilience)
