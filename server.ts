import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createCafeServer } from './src/server/app';
import { CafeStore } from './src/server/store';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const store = new CafeStore();
  let closeViteServer: (() => Promise<void>) | undefined;
  let closeSocketServer: (() => Promise<void>) | undefined;

  try {
    await store.connectMongo(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
      process.env.MONGODB_DB_NAME || 'cafeos'
    );
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
      console.log(`[CafeOS] Received ${signal}, closing the server and flushing MongoDB state...`);
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
    throw error;
  }
}

void startServer().catch((error) => {
  console.error('[CafeOS] Startup failed:', error);
  process.exitCode = 1;
});
