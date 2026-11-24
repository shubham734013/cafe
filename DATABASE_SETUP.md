# CafeOS database setup

## Runtime storage

MongoDB is the authoritative operational store for orders, inventory, tables, customer/loyalty data, and CafeOS state. The server connects to MongoDB during startup and exits if the primary connection cannot be established. PostgreSQL is optional and is not the source of truth for live operations.

Set `MONGODB_URI` and `MONGODB_DB_NAME` in `.env` for local development or in the deployment secret manager for production. The application defaults to `mongodb://127.0.0.1:27017` and database `cafeos` only outside production. Production requires both values explicitly. Use TLS and a least-privilege MongoDB user in deployed environments. See [ENVIRONMENT.md](./ENVIRONMENT.md) for all settings.

```bash
# Local development only; ensure the MongoDB service is already running.
npm run dev
```

The application has a MongoDB writer lease. Run one CafeOS process per database; a second concurrent writer is rejected. Readiness is available at `GET /health/ready` and `/api/health/ready`; `/health/live` reports process liveness only. Readiness can return `503` when CafeOS persistence is degraded.

## MongoDB backup and restore

Install MongoDB Database Tools (`mongodump` and `mongorestore`) on the operator host. The scripts use `MONGODB_URI` and `MONGODB_DB_NAME`; inspect the active deployment target before every operation.

```bash
# Writes to .data/backups/<timestamp> by default.
npm run db:backup

# Restore a specific dump folder. This is destructive for matching collections.
npm run db:restore -- .data/backups/<timestamp> --confirm --drop
```

The restore command deliberately requires both `--confirm` and `--drop`. Stop CafeOS before restoring, verify the target database and backup contents, and take a fresh backup of the current target first. After restore, start the app and check readiness, staff/customer flows, orders, inventory, and provider-independent operations. A restore can lose writes made after the backup.

The scripts do not provide scheduled backups, encryption, off-site storage, retention, checksum validation, or point-in-time recovery. Establish those protections with the MongoDB operator and regularly rehearse restores in an isolated non-production database. The application-level backup script should not be treated as a complete disaster-recovery service.

## MongoDB persistence integration test

The normal test suite skips the MongoDB persistence test unless `CAFE_TEST_MONGODB_URI` is supplied. The test only accepts loopback MongoDB URIs and creates and drops a unique test database:

```bash
CAFE_TEST_MONGODB_URI=mongodb://127.0.0.1:27017 \
  npx tsx --test src/server/store.mongo.test.ts
```

Run this only against an isolated, non-production local MongoDB service. A passing unit suite without this variable is not live MongoDB integration verification.

## Optional PostgreSQL tools

PostgreSQL is optional and separate from runtime MongoDB. `DATABASE_URL` is canonical for the scripts; `POSTGRES_URL` is a compatibility fallback. These commands do not migrate or seed MongoDB:

```bash
npm run db:migrate
npm run db:seed
```

The SQL schema is for optional relational/analytics/archive tooling. Seed data is sample data and is blocked when `NODE_ENV=production`. Do not run `npm run db:reset` against production; it tears down the PostgreSQL schema before reseeding. The CafeOS server can operate without PostgreSQL, and a PostgreSQL outage does not make PostgreSQL a replacement or recovery source for MongoDB.

## Operational checks

```bash
curl -i https://<cafe-host>/health/live
curl -i https://<cafe-host>/health/ready
curl -i https://<cafe-host>/api/health
```

Expect HTTP 200 from live and ready probes when the process and persistence are healthy. `/api/health` includes the MongoDB persistence health state; do not expose its response or operational logs beyond the intended monitoring audience. See [RUNBOOK_DISASTER_RECOVERY.md](./RUNBOOK_DISASTER_RECOVERY.md) for recovery and rollback procedures.
