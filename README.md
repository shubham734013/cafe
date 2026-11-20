# Seth Sawariya CafeOS

CafeOS is a cafe management application with customer ordering, staff portals, POS order entry, kitchen workflows, inventory, customer records, loyalty, campaigns, and reporting.

## Run locally

Requirements: Node.js and MongoDB.

```bash
npm install
cp .env.example .env
npm run dev
```

Before starting the app, replace every `CAFE_*_PIN` placeholder in `.env` with a unique 4-digit PIN. Configure `MONGODB_URI` and `MONGODB_DB_NAME` for the MongoDB instance to use. CafeOS exits with a startup error if it cannot connect to MongoDB.

The server and Vite frontend run together. The default local URL is `http://localhost:3000`. Admin and Kitchen PINs use `CAFE_ADMIN_PIN` and `CAFE_KITCHEN_PIN`; the session signing secret uses `CAFE_AUTH_SECRET`. Replace development values before deploying.

## Payments

CafeOS can connect to [UPI Gateway](https://github.com/mynkdev-21/upi-gateway) using its authenticated server API. The Laravel gateway is a separate application; CafeOS does not install or host it.

1. Deploy UPI Gateway separately using its installation and production security guides. It requires PHP 8.2+, MySQL, HTTPS, and merchant payment-provider configuration.
2. Set `UPI_GATEWAY_API_URL` to the gateway origin (without `/api/v1`), then set its live `UPI_GATEWAY_API_KEY` and `UPI_GATEWAY_API_SECRET` in CafeOS's server environment.
3. Configure the gateway's live webhook URL as `https://<your-cafe-domain>/api/webhooks/upi-gateway` and set the matching live signing secret in `UPI_GATEWAY_WEBHOOK_SECRET`. Use an explicit webhook secret; CafeOS does not fall back to the API secret.
4. Restart CafeOS. Customer checkout opens the gateway's hosted payment page, then CafeOS checks the gateway's API for the result. Signed webhook notifications trigger the same authoritative status check; webhook contents alone never mark an order paid.

Keep all gateway credentials server-side and out of source control. The integration currently accepts live gateway orders only. No payment is simulated, and automated tests use a fake gateway rather than initiating a real payment. Complete provider- and hosting-specific testing before accepting live payments.

## Tests and checks

```bash
npm test
npm run lint
npm run build
```

## Workspace routes

Customer pages use `/customer`, `/customer/menu`, `/customer/cart`, `/customer/tracking`, and `/customer/rewards`. The customer interface does not link to staff portals.

Staff pages require a staff PIN session. The app has three role workspaces: Customer, Admin, and Kitchen. Admin modules live under `/admin/...`, customer ordering under `/customer/...`, and kitchen operations under `/kitchen/...`.

| Role | Default route |
|---|---|
| Admin | `/admin` |
| Customer | `/customer` |
| Kitchen | `/kitchen` |

Navigation is filtered by role, and server APIs enforce role checks. Customer orders use a server-issued customer identity and a signed browser session.
