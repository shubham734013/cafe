# Seth Sawariya CafeOS — YouPI-PG UPI Payment Integration

This application integrates **YouPI-PG** (`https://github.com/youpi-pg/YouPI-PG.git`), a self-hosted zero-MDR UPI payment orchestrator built around:

1. **Method C (Server-Authoritative Integration)**: CafeOS calculates exact order totals in paise (`Math.round(total * 100)`) and `"XX.XX"` rupees on the Express server, sends `POST /api/v1/payments` with both `X-Merchant-Id` and `X-Merchant-Key` headers plus an `Idempotency-Key`, and never trusts browser amounts or client "paid" flags.
2. **Honest Two-Stage Confirmation (`OBSERVED_SUCCESS` vs `RECONCILED`)**:
   - `OBSERVED_SUCCESS`: YouPI-PG's Android SMS or Gmail observer matched a bank credit alert (`settlementState: "NOT_RECONCILED"`). CafeOS records the UTR and verification level, holds final `paid` status by default (`YOUPI_CONFIRM_ON_OBSERVER="false"`), and lets a manager click **Verify Bank Credit** (protected by the 4-digit Manager PIN) or wait for the `RECONCILED` bank CSV webhook.
   - `RECONCILED`: Confirmed settled via bank statement CSV reconciliation or staff bank verification — marks the order `paid` and awards CafeOS loyalty points once.
3. **6-Point Webhook Security Verification (`POST /api/webhooks/youpi`)**:
   - Mounted **before** `express.json()` using `express.raw()` to preserve exact bytes.
   - Constant-time HMAC-SHA256 verification supporting `X-Gateway-Signature` and `X-Gateway-Signature-V2` (`${timestamp}.${rawBody}`) with a replay tolerance window.
   - Idempotent deduplication by `X-Gateway-Delivery-Id` / `deliveryId`.
   - Order lookup and duplicate settlement guard.
   - Exact `amountPaise` equality check against the saved order (mismatches automatically flag `manual_review`).
   - Cross-order 12-digit `utr` uniqueness check (duplicate UTRs automatically flag `manual_review`).

---

## 1. Prerequisites & Port Map

- **Node.js**: YouPI-PG requires **Node.js 24 LTS** (`node -v`).
- **CafeOS Port**: `3000` (HTTP + Socket.IO + Vite dev server).

Because YouPI-PG's optional Help Portal defaults to port `3000`, set `HELP_PORTAL_PORT=3001` inside YouPI-PG's `.env` when running both locally:

| Service | Default Port | Purpose |
| :--- | :--- | :--- |
| **CafeOS App & Webhook Receiver** | `3000` | CafeOS frontend + `/api/*` + `/api/webhooks/youpi` |
| **YouPI-PG Help Portal** | `3001` (override from `3000`) | Documentation portal |
| **YouPI-PG Payment API** | `5000` | `POST /api/v1/payments`, `GET /api/v1/payments/:id`, webhooks |
| **YouPI-PG Checkout UI** | `7000` | Hosted QR/UPI page & `POST /api/v1/checkout/:id/cancel` |
| **YouPI-PG Merchant Admin** | `8080` | Merchant registration, API key, CSV upload, simulator |
| **YouPI-PG Observer Service** | `9000` | Android SMS + Gmail alert ingestion |

---

## 2. Running YouPI-PG Locally Alongside CafeOS

### Step 1: Clone and start YouPI-PG

```bash
git clone https://github.com/youpi-pg/YouPI-PG.git
cd YouPI-PG
npm install
cp .env.example .env
```

Edit YouPI-PG's `.env` before initializing the database:

- Set `HELP_PORTAL_PORT=3001` so it does not conflict with CafeOS on `3000`.
- Set `NODE_ENV=development` (or configure `WEBHOOK_SIGNING_SECRET` / `MERCHANT_SECRET`).
- Optional Gmail fallback observer: add `GMAIL_USER` and a 16-character Google **App Password** (`GMAIL_APP_PASSWORD`) if your bank sends email credit alerts.

Initialize the SQLite database and start all YouPI-PG services:

```bash
npm run init-db
npm run dev
```

### Step 2: Register CafeOS in YouPI-PG Merchant Admin

1. Open **YouPI-PG Merchant Admin** at `http://localhost:8080`.
2. Register your merchant account (or use the seeded merchant), set your **Payee UPI VPA** (`sethsawariya@okhdfcbank` or your real business VPA), and set the **Webhook URL** to:
   ```
   http://localhost:3000/api/webhooks/youpi
   ```
3. Copy the **Merchant ID**, **Merchant API Key**, and **Webhook Secret** into CafeOS's `.env` file (never commit `.env` to git):

```bash
YOUPI_API_URL="http://localhost:5000"
YOUPI_CHECKOUT_URL="http://localhost:7000"
YOUPI_MERCHANT_ID="your-merchant-id"
YOUPI_MERCHANT_API_KEY="your-merchant-api-key"
YOUPI_WEBHOOK_SECRET="your-webhook-secret"
YOUPI_PAYEE_VPA="your-vpa@bank"
YOUPI_CONFIRM_ON_OBSERVER="false"
```

> **Note**: Live YouPI-PG `apps/payment-api/src/routes/payments.routes.js` requires **both** `X-Merchant-Id` and `X-Merchant-Key` headers on `POST /api/v1/payments` and `GET /api/v1/payments/:id`. CafeOS sends both automatically.

### Step 3: Set up Android SMS Observer APK (for real UPI tests)

1. Download the official Android observer APK from the YouPI-PG release or Help Portal (`http://localhost:3001`).
2. Verify the APK SHA-256 checksum before installing:
   ```
   959218223e75da4784744c16afaf7bc121cff377dff04f041875237042f51601
   ```
3. Enable SMS read & foreground notification permissions, point the observer to `http://<your-lan-ip>:9000`, and paste your observer token. Keep the Android phone plugged in and connected to Wi-Fi with battery optimization disabled.

### Step 4: Start CafeOS

In the CafeOS workspace root:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. If `YOUPI_*` credentials are omitted in development, CafeOS automatically runs a **Local YouPI Sandbox Simulator** that signs real HMAC-SHA256 webhooks against `/api/webhooks/youpi` so you can test every state without an Android device.

---

## 3. Running Automated Tests

Run the unit + HTTP integration test suite (covering state machine transitions, HMAC-SHA256 v1/v2 signature verification, replay protection, amount tampering, duplicate UTR blocking, idempotent webhooks, Manager PIN bank verification, queue cancellation, and stuck-payment reconciliation):

```bash
npm test
```

---

## 4. Local Testing Checklist (Pre-Launch)

- [ ] **UPI Checkout Session Creation**: Customer Cart -> select `UPI` -> checkout opens `YoupiCheckoutModal` with dynamic QR (`upi://pay?...`) and `5:00` countdown.
- [ ] **Single-Slot Queue Awareness**: Creating two concurrent UPI sessions places the second in `QUEUED` (`Queue Slot #1`) and **Cancel & Free Slot** releases the slot immediately.
- [ ] **Observer Match (`OBSERVED_SUCCESS`)**: Tap **I Have Paid — Verify Now** (or simulate Observer Match) -> Order moves to `observed` (`Alert Matched · Verify`), UTR is shown, and order is **not** falsely marked `paid`.
- [ ] **Staff Bank Verification**: In **Staff -> Orders**, click **Verify Bank Credit**, enter Manager PIN (`1234` default in dev) and 12-digit UTR -> Order moves to `paid` and loyalty points are awarded once.
- [ ] **Tamper & Replay Defense**: Re-sending the same `X-Gateway-Delivery-Id` returns `{ duplicate: true }` with no double points; mismatched `amountPaise` or reused 12-digit UTR moves payment to `manual_review`.
- [ ] **Failed / Expired Retry**: Simulate `FAILED` or `EXPIRED` -> modal shows clear retry UI without duplicating orders.
- [ ] **Customer Payment History**: In **Staff -> CRM & Customers**, click the receipt icon (`View payment history`) to inspect all INR YouPI-PG attempts and UTRs.

---

## 5. Production Go-Live Checklist & Operational Risks

- [ ] **Live Credentials**: Set `NODE_ENV=production`, strong random `SESSION_SECRET`, non-default `STAFF_PIN`, and real `YOUPI_API_URL`, `YOUPI_MERCHANT_ID`, `YOUPI_MERCHANT_API_KEY`, `YOUPI_WEBHOOK_SECRET`, and `YOUPI_PAYEE_VPA`.
- [ ] **HTTPS & Public Webhook URL**: Serve CafeOS behind HTTPS (`https://your-cafe-domain.com`) and configure the YouPI-PG Merchant Admin webhook URL to `https://your-cafe-domain.com/api/webhooks/youpi`.
- [ ] **Two-Stage Settlement Guard**: Keep `YOUPI_CONFIRM_ON_OBSERVER="false"` so forged or misread SMS notifications never auto-settle orders without bank statement CSV reconciliation or Manager PIN verification.
- [ ] **Android Observer Reliability**: Use a dedicated merchant phone on continuous AC power with battery optimization disabled, plus Gmail App Password alerts enabled as a secondary observer.
- [ ] **Backups & Rate Limits**: Back up CafeOS's `.data/cafe-state.json` (or database) and YouPI-PG's SQLite DB (`youpi.db`) on a daily schedule; keep API keys strictly in `.env` / secret manager.
