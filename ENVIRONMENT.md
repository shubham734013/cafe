# Environment configuration

Copy `.env.example` for local development. Keep `.env` and all provider credentials out of Git, logs, browser bundles, and support tickets. Production values belong in the deployment platform's secret manager. CafeOS validates the production-required configuration before opening its listener.

## Required in production

| Variable | Purpose and requirements |
| --- | --- |
| `NODE_ENV` | Set to `production`. |
| `MONGODB_URI` | Required connection URI for the authoritative operational database. Use the provider's TLS-enabled URI and a least-privilege database user. |
| `MONGODB_DB_NAME` | Required operational database name. |
| `CAFE_AUTH_SECRET` | Required session-signing secret, at least 32 characters, randomly generated and unique to this deployment. |
| `CAFE_ADMIN_PIN`, `CAFE_KITCHEN_PIN` | Required, distinct, non-default four-digit PINs. Deliver them to staff securely; never use the development defaults. |
| `APP_PUBLIC_URL` | Canonical public HTTPS origin, for example `https://cafe.example.com`. `APP_URL` is accepted as a compatibility fallback; migrate to `APP_PUBLIC_URL`. |
| `CORS_ORIGIN` | Comma-separated HTTPS origins. Must include the origin used by `APP_PUBLIC_URL` / `APP_URL`; do not use `*`. |

MongoDB is not optional for a running CafeOS deployment. Startup without a successful primary MongoDB connection fails.

## Server and database tuning

| Variable | Behavior |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000`. |
| `MONGODB_MAX_POOL_SIZE` | Maximum MongoDB pool size per server process; defaults to `20`. |
| `MONGODB_MIN_POOL_SIZE` | Minimum MongoDB pool size per server process; defaults to `5`. |
| `TRUST_PROXY_HOPS` | Number of known proxy hops to trust; defaults to `0`. Set only to the actual fixed topology. Restrict direct access to the CafeOS listener when non-zero. |
| `TRUST_PROXY` | Legacy compatibility setting: when `TRUST_PROXY_HOPS` is absent, `"true"` means one trusted hop. Prefer `TRUST_PROXY_HOPS`. |
| `DATABASE_URL` / `POSTGRES_URL` | Optional PostgreSQL connection for separate migration/reporting/archive tooling. MongoDB remains authoritative; PostgreSQL is not required for runtime operations. |
| `PG_MAX_POOL` | Optional PostgreSQL pool size; defaults to `10`. |

The current application uses a MongoDB writer lease; run only one CafeOS process against a given operational database.

## Optional integrations

Configure each provider only after testing with its sandbox or non-production account. If the required credentials are incomplete, the integration must be treated as unavailable.

| Integration | Variables | Notes |
| --- | --- | --- |
| UPI Gateway | `UPI_GATEWAY_API_URL`, `UPI_GATEWAY_API_KEY`, `UPI_GATEWAY_API_SECRET`, `UPI_GATEWAY_WEBHOOK_SECRET` | Set the gateway base origin; CafeOS appends `/api/v1`. Use server-side credentials and the explicit webhook signing secret; payment status must be verified server-side. |
| Cashfree | `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_API_VERSION`, `CASHFREE_ENVIRONMENT` | Use `SANDBOX` during validation. Never put secrets in `VITE_*` variables. Configure and verify the provider's webhook independently. |
| Brevo | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Email sending is unavailable without the server API key and sender address. Tests do not send real email. |
| Supabase customer auth | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser `VITE_*` values are public. Use only the anon key in the browser; never expose a service-role key. Configure Supabase policies and redirect URLs separately. |
| Google OAuth | `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID` | Client ID is public configuration, not a client secret. Phone numbers are not guaranteed by basic Google sign-in; People API access depends on granted permission and available account data. |
| CAPTCHA | `ENABLE_CAPTCHA_VERIFICATION`, `CAPTCHA_SECRET_KEY`, `CAPTCHA_VERIFY_URL` | Disabled by default. When enabled, provide a server-side secret; verification fails closed if credentials or provider verification are unavailable. The default verification URL is Cloudflare Turnstile. |
| Redis | None in CafeOS | CafeOS does not currently use Redis; rate limits and revocation state are process-local. If separately deploying the PHP UPI Gateway subproject, configure Redis in that service's own environment, not this CafeOS file. |

Provider credentials do not constitute production verification. Obtain and validate the merchant, sender, OAuth, and CAPTCHA accounts separately before enabling a live integration.

## Development and test-only variables

| Variable | Purpose |
| --- | --- |
| `CAFE_TEST_MONGODB_URI` | Enables the persistence integration test only. The test refuses non-loopback hosts and creates/drops a unique temporary database. Do not point it at production or shared data. |
| `DISABLE_HMR` | Development-only Vite hot-module-reload toggle. |
| `DEV_GATEWAY_PORT` | Port for the optional local development gateway script. |

## Secret generation and deployment

Generate a signing secret using a secure local random generator, for example `openssl rand -hex 32`. Do not paste it into source files or commit it. Set production variables in the platform's secret manager, build the frontend after setting only intended public `VITE_*` values, then start with `NODE_ENV=production npm start`. See [README.md](./README.md) and [RUNBOOK_DISASTER_RECOVERY.md](./RUNBOOK_DISASTER_RECOVERY.md) for deployment checks.
