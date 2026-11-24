import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Socket } from 'node:net';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createCafeServer } from './src/server/app';
import { CafeStore } from './src/server/store';
import { checkPostgresHealth, closeDbPool } from './src/server/db';
import { validateEnv } from './src/server/env';

// Validate environment variables at startup
const env = validateEnv();
const PORT = env.PORT;
const isProduction = env.NODE_ENV === 'production';
const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const compressedAssetCache = new Map<string, Buffer>();

async function serveCompressedAsset(req: Request, res: Response, next: NextFunction) {
  const assetName = req.params.assetName;
  const acceptsEncoding = req.header('accept-encoding') ?? '';
  const encoding = /\bbr\b/.test(acceptsEncoding)
    ? 'br'
    : /\bgzip\b/.test(acceptsEncoding)
      ? 'gzip'
      : null;

  if (
    !encoding ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(assetName) ||
    !/\.(?:css|js|mjs|json|svg|txt|xml)$/.test(assetName)
  ) {
    next();
    return;
  }

  try {
    const cacheKey = `${encoding}:${assetName}`;
    let compressed = compressedAssetCache.get(cacheKey);
    if (!compressed) {
      const asset = await readFile(path.resolve(process.cwd(), 'dist', 'assets', assetName));
      compressed =
        encoding === 'br'
          ? await compressBrotli(asset, {
              params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
            })
          : await compressGzip(asset, { level: 6 });
      compressedAssetCache.set(cacheKey, compressed);
    }

    res
      .type(assetName)
      .set({
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Encoding': encoding,
        Vary: 'Accept-Encoding',
      })
      .send(compressed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      next();
      return;
    }
    next(error);
  }
}

async function startServer() {
  const store = new CafeStore();
  let closeViteServer: (() => Promise<void>) | undefined;
  let closeSocketServer: (() => Promise<void>) | undefined;

  try {
    // 1. Primary Operational Database: MongoDB
    // MongoDB via CafeStore is the authoritative source of truth for orders, inventory, and transactions.
    await store.connectMongo(
      env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
      env.MONGODB_DB_NAME || 'cafeos'
    );
    console.log('[CafeOS] Primary Database: MongoDB connected (authoritative for orders, inventory, and state).');

    // 2. Check Optional Analytical Database (PostgreSQL)
    const pgHealth = await checkPostgresHealth();
    if (pgHealth.configured) {
      if (pgHealth.connected) {
        console.log('[CafeOS] Analytical Database: PostgreSQL connected for reporting & archival.');
      } else {
        console.warn('[CafeOS] Analytical Database: PostgreSQL configured but unreachable. Primary operations unaffected.');
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
        server: {
          middlewareMode: true,
          hmr:
            process.env.DISABLE_HMR === 'true'
              ? false
              : {
                  server: httpServer,
                  path: '/vite-hmr/',
                },
        },
        appType: 'spa',
      });
      closeViteServer = () => vite.close();
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(process.cwd(), 'dist');
      // Hashed Vite assets are safe to cache for a year, while the HTML shell is
      // always revalidated so a new deploy can point at its new asset hashes.
      app.get('/assets/:assetName', (req, res, next) => {
        void serveCompressedAsset(req, res, next);
      });
      app.use(
        express.static(distDir, {
          index: false,
          maxAge: '1y',
          immutable: true,
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }

    const activeSockets = new Set<Socket>();
    httpServer.on('connection', (socket: Socket) => {
      activeSockets.add(socket);
      socket.on('close', () => activeSockets.delete(socket));
    });

    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`[CafeOS] Received ${signal}, closing server and draining in-flight connections...`);

      // 1. Stop accepting new HTTP requests
      await new Promise<void>((resolve) => {
        httpServer.close((err) => {
          if (err) console.warn('[CafeOS] Error stopping HTTP listener.');
          else console.log('[CafeOS] Stopped accepting new HTTP requests.');
          resolve();
        });
        // 5-second bounded drain timeout
        setTimeout(() => {
          for (const socket of activeSockets) {
            socket.destroy();
          }
          resolve();
        }, 5000).unref();
      });

      // 2. Close Vite dev server if running
      if (closeViteServer) {
        try {
          await closeViteServer();
        } catch (error) {
          console.error('[CafeOS] Failed to close Vite cleanly.');
          process.exitCode = 1;
        }
      }

      // 3. Close Socket.IO cleanly
      if (closeSocketServer) {
        try {
          await closeSocketServer();
        } catch (error) {
          console.error('[CafeOS] Failed to close Socket.IO cleanly.');
          process.exitCode = 1;
        }
      }

      // 4. Flush and close MongoDB
      try {
        await store.closeMongo();
        console.log('[CafeOS] MongoDB connection pool drained and closed.');
      } catch (error) {
        console.error('[CafeOS] Failed to flush MongoDB state during shutdown.');
        process.exitCode = 1;
      }

      // 5. Close PostgreSQL pool if open
      try {
        await closeDbPool();
      } catch (error) {
        console.error('[CafeOS] Failed to close PostgreSQL pool.');
      }
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    httpServer.listen(PORT, () => {
      console.log(`Seth Sawariya CafeOS server listening on http://localhost:${PORT} (http://127.0.0.1:${PORT})`);
    });
  } catch (error) {
    if (closeViteServer) {
      await closeViteServer().catch((closeError) => {
        console.error('[CafeOS] Failed to close Vite after startup error.');
      });
    }
    if (closeSocketServer) {
      await closeSocketServer().catch((closeError) => {
        console.error('[CafeOS] Failed to close Socket.IO after startup error.');
      });
    }
    try {
      await store.closeMongo();
    } catch (closeError) {
      console.error('[CafeOS] Failed to close MongoDB after startup error.');
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
  console.error(
    '[CafeOS] Startup failed:',
    error instanceof Error ? `${error.message}\n${error.stack}` : 'unknown error'
  );
  process.exitCode = 1;
});
