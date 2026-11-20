# CafeOS Performance & Resilience State (PERF_STATE.md)

**Branch**: `perf/hardening`  
**Current Iteration**: Iteration 0 (Audit & Backlog Setup Completed)  
**Status Values**: FIXED AND VERIFIED | IMPLEMENTED, NOT FULLY VERIFIED | PARTIALLY IMPLEMENTED | NOT IMPLEMENTED | NOT APPLICABLE | HUMAN-REQUIRED

---

## Current Status Summary

| Metric | Current Value | Target |
| :--- | :--- | :--- |
| **Active Branch** | `perf/hardening` | `perf/hardening` |
| **Automated Tests** | 78/78 Passing | 100% Passing |
| **Vite Production Build** | Passing (~350ms) | Passing (< 1s) |
| **Primary Database** | MongoDB Atlas / Native Driver | Production-hardened pool & indices |
| **Task Progress** | 0 / 21 Tasks Completed | All Validated Tasks Completed |

---

## Backlog (Reordered by Priority & Dependency)

| # | Task | Category | Severity / Priority | Status | Depends On | Files To Change |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **3** | Graceful shutdown (stop accepting requests, drain, close DB/sockets) | Correctness | High / P0 | NOT IMPLEMENTED | None | `server.ts` |
| **1** | Idempotency keys for order creation and payment/webhook handling | Correctness | High / P0 | NOT IMPLEMENTED | None | `src/server/app.ts`, `src/server/store.ts` |
| **4** | Env var validation at startup with Zod schema | Correctness | High / P0 | NOT IMPLEMENTED | None | `src/server/env.ts`, `server.ts` |
| **5** | Connection pool settings + connection budget vs Atlas tier limit | Database | High / P1 | NOT IMPLEMENTED | 4 | `src/server/store.ts`, `src/server/db.ts` |
| **2** | Mongo atomic ops for inventory deduction; fix race conditions | Correctness | High / P1 | NOT IMPLEMENTED | 1 | `src/server/store.ts` |
| **10** | `/health/live` and `/health/ready` (cheap, no secrets exposed) | Observability | Medium / P1 | NOT IMPLEMENTED | 3 | `src/server/app.ts` |
| **6** | Indexes from real query patterns, validated with explain(); remove redundant ones | Database | Medium / P2 | NOT IMPLEMENTED | 5 | `src/server/store.ts` |
| **7** | Pagination: default/max page size, sort allowlists, projections on all list endpoints | Database | Medium / P2 | NOT IMPLEMENTED | None | `src/server/app.ts` |
| **9** | Pino structured logs, request latency, event-loop lag | Observability | Medium / P2 | NOT IMPLEMENTED | 4 | `src/server/logger.ts`, `src/server/app.ts` |
| **11** | Timeouts + bounded retries with backoff/jitter (transient, idempotent calls only) | Resilience | Medium / P2 | NOT IMPLEMENTED | None | `src/server/cashfreeGateway.ts`, `src/server/brevo.ts` |
| **12** | Circuit breaker for external calls only (payment gateway, email) | Resilience | Medium / P2 | NOT IMPLEMENTED | 11 | `src/server/circuitBreaker.ts` |
| **13** | Graceful degradation: analytics/email/report failure must not block POS | Resilience | Medium / P2 | NOT IMPLEMENTED | 12 | `src/server/app.ts` |
| **14** | Socket.IO reconnect recovers state via REST APIs | Resilience | Medium / P2 | NOT IMPLEMENTED | None | `src/store/useCafeStore.ts` |
| **8** | Fix N+1 and slow aggregations | Database | Low / P2 | NOT IMPLEMENTED | 6 | `src/server/store.ts` |
| **15** | Redis cache for menu/categories (TTL, invalidation, fallback) | Scale / Cache | Low / P3 | NOT IMPLEMENTED | Evidence Gate | `src/server/cache.ts` |
| **16** | Redis-backed rate limiting (needed only with 2+ instances) | Scale | Low / P3 | NOT IMPLEMENTED | Evidence Gate | `src/server/rateLimit.ts` |
| **17** | BullMQ for slow jobs (reports, exports, email) with retry, DLQ | Scale / Queue | Low / P3 | NOT IMPLEMENTED | Evidence Gate | `src/server/queue.ts` |
| **18** | Socket.IO Redis adapter (only with 2+ instances) | Scale | Low / P3 | NOT IMPLEMENTED | Evidence Gate | `src/server/app.ts` |
| **19** | k6 suite (login, menu, order create, POS concurrency) baseline & peak | Proof | High / P4 | NOT IMPLEMENTED | 1, 2, 5 | `scripts/k6/` |
| **20** | Concurrency tests: simultaneous orders, inventory updates, duplicate payments | Proof | High / P4 | NOT IMPLEMENTED | 1, 2 | `src/server/concurrency.test.ts` |
| **21** | Backup/restore + DR runbook, capacity plan, cost estimate | SRE / DR | High / P4 | HUMAN-REQUIRED | None | `RUNBOOK_DISASTER_RECOVERY.md` |

---

## Next Task
**Task 3**: Graceful shutdown (stop accepting HTTP requests, drain in-flight requests with bounded timeout, close Vite and Socket.IO, flush `CafeStore` to MongoDB, close PostgreSQL pool).
