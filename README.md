# Seth Sawariya CafeOS

CafeOS is a cafe management application for customer ordering, staff/POS workflows, kitchen operations, inventory, customer records, loyalty, campaigns, and reporting.

## Local setup

Requirements: Node.js 22 or newer, npm, and a reachable MongoDB instance. MongoDB is the authoritative runtime store.

```bash
npm ci
cp .env.example .env
# Set MONGODB_URI and MONGODB_DB_NAME if using a non-default local MongoDB.
npm run dev
```

The development server serves the frontend and API at `http://localhost:3000`. Set distinct 4-digit local values for `CAFE_ADMIN_PIN` and `CAFE_KITCHEN_PIN` in `.env`; production additionally rejects weak/default PINs. For production settings and the exact variable list, see [ENVIRONMENT.md](./ENVIRONMENT.md).

## Production deployment

1. Provision MongoDB and an HTTPS public origin. Configure production variables in the hosting provider's secret/configuration manager, not in source control.
2. Build the client with `npm ci && npm run build`. Any `VITE_*` values are public browser configuration and must be available at build time.
3. Run one CafeOS server instance per MongoDB database with `NODE_ENV=production npm start`. Production startup fails unless MongoDB, staff PINs, `CAFE_AUTH_SECRET`, `APP_PUBLIC_URL` (or legacy `APP_URL`), and matching `CORS_ORIGIN` are configured.
4. Put the server behind an HTTPS reverse proxy. Set `TRUST_PROXY_HOPS` only to the exact trusted proxy count, and prevent clients from reaching the app directly when proxy trust is enabled. Preserve WebSocket upgrades.
5. Check `GET /health/live` and `GET /health/ready` and complete the deploy checklist in [RUNBOOK_DISASTER_RECOVERY.md](./RUNBOOK_DISASTER_RECOVERY.md).

Do not run multiple application instances against the same database: the MongoDB lease is intended to prevent concurrent writers. PostgreSQL is optional and is not required for CafeOS runtime operations.

## Integrations

Payment gateways, Brevo email, Supabase/Google customer authentication, and CAPTCHA are optional and have not been verified against production accounts. Missing credentials keep the associated provider unavailable; they do not enable a simulated live provider. Use only provider sandboxes until the separate live go-live checks are complete. Payment status is based on server-side provider verification and validated webhook signatures, never a browser success signal. See [ENVIRONMENT.md](./ENVIRONMENT.md).

Google sign-in does not guarantee a phone number. Phone data is only available when the user has granted the applicable Google People API permission; otherwise collect it through the app's phone-entry flow.

## Data, backup, and recovery

MongoDB stores operational state. PostgreSQL migrations and sample seeding are separate optional tools; they do not create or migrate the runtime MongoDB store. Follow [DATABASE_SETUP.md](./DATABASE_SETUP.md) for the MongoDB model and optional PostgreSQL commands, and [RUNBOOK_DISASTER_RECOVERY.md](./RUNBOOK_DISASTER_RECOVERY.md) for backup, restore, monitoring, deploy, and rollback steps.

The provided MongoDB backup script requires MongoDB Database Tools (`mongodump` / `mongorestore`). It does not provide scheduling, encryption, off-site replication, checksums, retention, or point-in-time recovery. Configure and test those separately with the database operator.

## Checks

```bash
npm run lint
npm test
npm run build
```

The MongoDB persistence integration test is skipped unless `CAFE_TEST_MONGODB_URI` points to a reachable loopback MongoDB service. It uses a unique temporary database and refuses non-loopback hosts.

## Routes

Customer pages use `/customer`, `/customer/menu`, `/customer/cart`, `/customer/tracking`, and `/customer/rewards`. Staff pages are `/admin/...` and `/kitchen/...`; the server enforces staff roles and customer order ownership.
