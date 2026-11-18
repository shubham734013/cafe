import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createCafeServer } from './src/server/app';
import { CafeStore } from './src/server/store';
import { checkPostgresHealth, closeDbPool } from './src/server/db';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function assertProductionEnvironment(): void {
  if (!isProduction) return;

  const required = [
    'MONGODB_URI',
    'CORS_ORIGIN',
    'CASHFREE_APP_ID',
    'CASHFREE_SECRET_KEY',
    'CASHFREE_WEBHOOK_SECRET',
    'CAFE_AUTH_SECRET',
    'CAFE_OWNER_PIN',
    'CAFE_MANAGER_PIN',
    'CAFE_CASHIER_PIN',
    'CAFE_BARISTA_PIN',
    'CAFE_SERVER_PIN',
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}.`);
  }

  if (process.env.CASHFREE_ENVIRONMENT !== 'PRODUCTION') {
    throw new Error('CASHFREE_ENVIRONMENT must be PRODUCTION for a production deployment.');
  }
  if (/^(CF_SANDBOX|dev_)|TEST_APP/i.test(process.env.CASHFREE_APP_ID!)) {
    throw new Error('Sandbox or mock Cashfree credentials cannot be used in production.');
  }
  if (process.env.CASHFREE_WEBHOOK_SECRET === process.env.CASHFREE_SECRET_KEY) {
    throw new Error('Use a dedicated CASHFREE_WEBHOOK_SECRET, separate from the API secret key.');
  }
  const mongoUri = process.env.MONGODB_URI!;
  if (/localhost|127\.0\.0\.1/i.test(mongoUri)) {
    throw new Error('MONGODB_URI must point to a production MongoDB deployment, not localhost.');
  }
  if (!mongoUri.startsWith('mongodb+srv://') && !/[?&](tls|ssl)=true(?:&|$)/i.test(mongoUri)) {
    throw new Error('Production MONGODB_URI must use TLS (mongodb+srv:// or tls=true).');
  }

  const origins = process.env.CORS_ORIGIN!.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => {
    try {
      return new URL(origin).protocol !== 'https:';
    } catch {
      return true;
    }
  })) {
    throw new Error('CORS_ORIGIN must contain one or more valid HTTPS origins in production.');
  }
}

async function startServer() {
  assertProductionEnvironment();
  const store = new CafeStore();
  let closeViteServer: (() => Promise<void>) | undefined;
  let closeSocketServer: (() => Promise<void>) | undefined;

  try {
    // 1. Primary Operational Database: MongoDB
    // MongoDB via CafeStore is the authoritative source of truth for orders, inventory, and transactions.
    await store.connectMongo(
      process.env.MONGODB_URI!,
      process.env.MONGODB_DB_NAME || 'cafeos'
    );
    console.log('[CafeOS] Primary Database: MongoDB connected (authoritative for orders, inventory, and state).');

    // 2. Check Optional Analytical Database (PostgreSQL)
    const pgHealth = await checkPostgresHealth();
    if (pgHealth.configured) {
      if (pgHealth.connected) {
        console.log('[CafeOS] Analytical Database: PostgreSQL connected for reporting & archival.');
      } else {
        console.warn(`[CafeOS] Analytical Database: PostgreSQL configured but unreachable (${pgHealth.error}). Primary operations unaffected.`);
      }
    } else {
      console.log('[CafeOS] Analytical Database: PostgreSQL not configured. MongoDB serving as all-in-one store of record.');
    }

    const server = createCafeServer(store);
    const { app, httpServer } = server;
    closeSocketServer = () => server.io.close();

    if (!isProduction) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      closeViteServer = () => vite.close();
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }

    const shutdown = async (signal: string) => {
      console.log(`[CafeOS] Received ${signal}, closing the server and flushing database state...`);
      if (closeViteServer) {
        try {
          await closeViteServer();
        } catch (error) {
          console.error('[CafeOS] Failed to close Vite cleanly:', error);
          process.exitCode = 1;
        }
      }
      if (closeSocketServer) {
        try {
          await closeSocketServer();
        } catch (error) {
          console.error('[CafeOS] Failed to close Socket.IO cleanly:', error);
          process.exitCode = 1;
        }
      }
      try {
        await store.closeMongo();
      } catch (error) {
        console.error('[CafeOS] Failed to flush MongoDB state during shutdown:', error);
        process.exitCode = 1;
      }
      try {
        await closeDbPool();
      } catch (error) {
        console.error('[CafeOS] Failed to close PostgreSQL pool:', error);
      }
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Seth Sawariya CafeOS server listening on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    if (closeViteServer) {
      await closeViteServer().catch((closeError) => {
        console.error('[CafeOS] Failed to close Vite after startup error:', closeError);
      });
    }
    if (closeSocketServer) {
      await closeSocketServer().catch((closeError) => {
        console.error('[CafeOS] Failed to close Socket.IO after startup error:', closeError);
      });
    }
    try {
      await store.closeMongo();
    } catch (closeError) {
      console.error('[CafeOS] Failed to close MongoDB after startup error:', closeError);
    }
    try {
      await closeDbPool();
    } catch {
      // ignore
    }
    throw error;
  }
}

void startServer().catch((error) => {
  console.error('[CafeOS] Startup failed:', error);
  process.exitCode = 1;
});
