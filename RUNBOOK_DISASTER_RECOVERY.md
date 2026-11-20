# CafeOS Disaster Recovery Runbook & Operations Manual (SRE)

**System**: Seth Sawariya CafeOS  
**Service Tier**: Tier 1 (Mission-Critical Retail POS & Kitchen Operations)  
**Target RPO (Recovery Point Objective)**: < 1 Minute  
**Target RTO (Recovery Time Objective)**: < 15 Minutes  

---

## 1. System Architecture & Authoritative Storage

- **Authoritative Database**: **MongoDB Atlas / Replica Set**
  - All orders, KOT state transitions, live inventory counts, customer points ledger, and transactions reside strictly in MongoDB.
  - In-memory coalesced persistence flushes dirty state with atomic revisions (`cafeos_state` & `cafeos_locks`).
- **Analytical Database (Secondary)**: **PostgreSQL**
  - Used for immutable historical reporting, financial ledger archival, and external BI tools.
  - Failure of PostgreSQL does NOT impair customer ordering, KOT printing, or POS checkouts.
- **Cache / Ephemeral Layer**:
  - In-memory rate limiting and token revocation blocklists (optional distributed Redis).
  - No orders, payments, or inventory state are ever stored in cache.

---

## 2. Recovery Objectives & SLA

| Failure Scenario | Target RPO | Target RTO | Strategy |
| :--- | :--- | :--- | :--- |
| **App Node Crash / OOM** | 0s (Zero data loss) | < 30s | Container orchestrator restart; state reloads from MongoDB |
| **Transient DB Network Partition** | 0s | < 5s | Auto-reconnect with connection pooling & 5s retry backoff |
| **Database Corruption / Accidental Drop** | < 1 hr (Periodic) / < 1m (Atlas PITR) | < 10 mins | Point-in-Time Restore via Atlas or snapshot restore script |
| **Primary Region Outage** | < 5 mins | < 15 mins | DNS failover to standby container pointing to multi-region Atlas replica |

---

## 3. Step-by-Step Incident Response & Failover Runbook

### Phase A: Incident Detection & Triage
1. **Check System Health Probes**:
   ```bash
   curl -i http://localhost:3000/health/live
   curl -i http://localhost:3000/health/ready
   ```
   - If `/health/ready` returns `HTTP 503 Service Unavailable`, inspect database connectivity.
2. **Review Application Logs**:
   ```bash
   # Filter for fatal errors or database reconnect logs
   grep -E "Fatal|Mongo|CircuitBreaker" /var/log/cafeos.log
   ```

### Phase B: Backup Creation (Manual Snapshot)
Before executing database modifications, trigger an on-demand snapshot:
```bash
npm run db:backup
```
Snapshots are cryptographically checksummed and stored under `.data/backups/`.

### Phase C: Restoration Procedure
1. Identify the target snapshot timestamp in `.data/backups/`.
2. Stop the application server or place into maintenance mode:
   ```bash
   # Stops receiving customer traffic
   kill -SIGTERM <cafeos-pid>
   ```
3. Run restore command:
   ```bash
   npm run db:restore
   ```
4. Verify schema constraints and indexes:
   ```bash
   npm run db:migrate
   ```
5. Run automated verification suite:
   ```bash
   npm test
   ```
6. Start CafeOS and verify `/health/ready`:
   ```bash
   PORT=3000 npm run start
   curl -s http://localhost:3000/health/ready | grep '"status":"ready"'
   ```

---

## 4. Connection Pool & Capacity Planning

### Atlas Tier Connection Limits
| MongoDB Atlas Tier | Max Connections | CafeOS Max Pool Size (`MONGODB_MAX_POOL_SIZE`) | Min Pool Size |
| :--- | :--- | :--- | :--- |
| **M0 (Shared Sandbox)** | 500 (Throttled) | 10 | 2 |
| **M10 (Production Starter)** | 1,500 | 25 per instance | 5 |
| **M20 (High-Volume Multi-Branch)** | 3,000 | 50 per instance | 10 |

### Recommended Production Connection Formula
$$\text{Max Connection Budget} = \frac{\text{Atlas Max Connections} \times 0.7}{\text{Number of App Instances}}$$
- Set `MONGODB_MAX_POOL_SIZE=20` to guarantee total connections remain well below 70% of cluster capacity during horizontal autoscaling.

---

## 5. Third-Party Failure Degradation

1. **Cashfree Payment Gateway Outage**:
   - `cashfreeCircuitBreaker` automatically trips to `OPEN` after 3 consecutive timeouts.
   - Fast-fails external payment attempts immediately with descriptive customer error.
   - POS terminal seamlessly prompts cashier for Cash or Offline Card payment without locking UI.
2. **Brevo Email Outage**:
   - `brevoCircuitBreaker` trips to `OPEN` on failure.
   - Order receipt and account confirmations fall back to internal activity logs and SMS simulation without stalling customer checkout.
