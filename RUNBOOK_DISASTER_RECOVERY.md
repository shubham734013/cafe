# CafeOS deployment and disaster-recovery runbook

This runbook describes the behavior implemented in the repository. It does not define an availability SLA: RPO/RTO, backup frequency, retention, off-site replication, and restore time must be set and tested by the service and database operators.

## Architecture and operating limits

- MongoDB is the authoritative operational store. PostgreSQL is optional and is not a backup or source of truth for live CafeOS state.
- CafeOS runs as a single writer per MongoDB database. Its MongoDB lease rejects a second concurrent writer; do not horizontally scale multiple application processes against the same database.
- Rate limiting and session-revocation state are process-local. `REDIS_URL` does not currently make these controls distributed.
- Production startup requires MongoDB, production staff PINs, a strong `CAFE_AUTH_SECRET`, an HTTPS public URL, and matching HTTPS CORS origins.
- Payment gateways, Brevo, Supabase/Google OAuth, and CAPTCHA have not been verified against production accounts. A configured variable is not proof of provider readiness.
- The provided dump script is manual and does not add encryption, scheduling, checksum validation, retention, off-site storage, or point-in-time recovery.

## Deploy procedure

1. Provision MongoDB, TLS, backups, and monitoring. Create a least-privilege application database user. Define a tested restore process before accepting real orders.
2. Set production variables using the platform secret manager; use [ENVIRONMENT.md](./ENVIRONMENT.md) as the exact variable reference. Use unique staff PINs and generate `CAFE_AUTH_SECRET` with a secure random generator.
3. Configure an HTTPS reverse proxy and restrict direct access to the application port. Set `TRUST_PROXY_HOPS` to the actual trusted hop count, or leave it at `0`. Preserve WebSocket upgrades.
4. Build and deploy a single server instance:

   ```bash
   npm ci
   npm run lint
   npm test
   npm run build
   NODE_ENV=production npm start
   ```

   Build-time `VITE_*` values are public browser configuration; do not provide secrets under those names.
5. Verify the public origin, customer ordering, staff PIN login, role boundaries, persistence, and operational workflows with non-production data before opening traffic.
6. Confirm the deployment does not expose credentials, tokens, OTPs, payment references, or customer data in logs or client responses. Apply the operator's access, retention, and alerting policies to logs and backups.

## Monitoring and incident triage

```bash
curl -i https://<cafe-host>/health/live
curl -i https://<cafe-host>/health/ready
curl -i https://<cafe-host>/api/health
```

- `/health/live` is process liveness and returns HTTP 200 while the handler is available; it is not a database check.
- `/health/ready` and `/api/health/ready` report the CafeOS persistence health flag. HTTP 503 means the instance is not ready for writes.
- `/api/health` reports MongoDB persistence health and related application state. Restrict its response to authorized monitoring.
- On a readiness failure, stop accepting new traffic, inspect sanitized application and MongoDB service logs, confirm MongoDB reachability and lease ownership, and preserve the current database before attempting recovery.
- Do not log request bodies, authorization headers, cookies, OTPs, provider secrets, webhook payloads, or customer/payment details while diagnosing an incident.

## Manual MongoDB backup

Install MongoDB Database Tools on an operator-controlled host. Load the intended `MONGODB_URI` and `MONGODB_DB_NAME` from the secret manager without printing either value. Schedule or run:

```bash
npm run db:backup
```

By default the dump is written under `.data/backups/<timestamp>`. Restrict filesystem access and transfer/store backups only through approved encrypted storage. The script does not check consistency with an application-level maintenance window, encrypt output, validate a checksum, upload off-site, or apply retention. Monitor the backup command's exit status and periodically restore a copy in an isolated non-production database.

## Restore procedure

Restoring drops matching collections in the target database. Treat this as a destructive operation:

1. Declare the incident and prevent customer/staff writes. Stop the CafeOS process cleanly so in-flight writes can flush.
2. Identify the exact MongoDB target and dump folder. Verify the dump contains the expected database directory and has a successful backup record.
3. Take a new backup of the current target if it is reachable. Preserve this alongside the incident record.
4. Obtain the database owner's approval for data replacement. Restore into an isolated database first when time and capacity permit.
5. Run the destructive command only after rechecking the target and backup:

   ```bash
   npm run db:restore -- .data/backups/<timestamp> --confirm --drop
   ```

6. Start one CafeOS instance. Verify `/health/ready`, inspect order/inventory state, and test staff and customer flows with the incident lead. Reconcile payment statuses against provider records before reopening online payments.
7. Record the backup identifier, target database, restore time, validation results, and any known data loss. A dump restore loses changes made after its snapshot.

## Application rollback

1. Stop or drain the current app instance. Keep the MongoDB database unchanged unless a separate data-recovery decision is approved.
2. Redeploy the last known-good application artifact and its matching production configuration.
3. Start one instance and verify liveness/readiness, staff role access, customer order isolation, and recent order/inventory state.
4. Do not automatically restore MongoDB just because an application release is rolled back. Restore only when data corruption is confirmed, after taking a current snapshot and documenting the expected loss window.
5. If the previous application version cannot read state written by the new version, keep traffic stopped and use the approved restore/recovery procedure. Do not improvise destructive database changes.

## External-provider go-live gates

Keep integrations unavailable or in sandbox until each owner verifies the actual provider account, network access, callback URLs, and secret rotation:

- **Payments:** perform sandbox checkout, server-side status verification, webhook signature and replay tests, duplicate-event handling, refund reconciliation, and failure/timeout drills. Before live traffic, verify the live merchant account and webhook secret. Never treat a client redirect as payment proof.
- **Email:** verify Brevo sender/domain and deliverability with an approved test recipient. Confirm no secrets or recipient content appear in logs.
- **Customer identity:** verify Supabase policies/redirect URLs and Google OAuth consent/scopes with test accounts. Google phone data is permission- and account-dependent; it is not guaranteed by sign-in.
- **CAPTCHA:** enable only after server secret configuration and successful provider verification tests. If enabled but misconfigured, verification fails closed.
- **PostgreSQL:** configure only if the optional reporting/archive workload is required. Test its backup separately; it does not recover MongoDB operational state.

## Release checklist

- [ ] Production environment validation succeeds without fallback credentials.
- [ ] HTTPS and trusted-proxy topology are verified; app port is not directly public.
- [ ] Exactly one CafeOS process is active for the MongoDB database.
- [ ] MongoDB backup and isolated restore have been demonstrated; retention/off-site controls are operational.
- [ ] `/health/live` and `/health/ready` are monitored and alert on failure.
- [ ] `npm run lint`, `npm test`, and `npm run build` pass for the release artifact.
- [ ] Sandbox tests and independent live go-live approvals are complete for each enabled provider.
- [ ] Rollback artifact, operator, and data-recovery decision path are identified.

For detailed database commands, see [DATABASE_SETUP.md](./DATABASE_SETUP.md); for variable names and semantics, see [ENVIRONMENT.md](./ENVIRONMENT.md).
