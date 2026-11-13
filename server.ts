import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createCafeServer } from './src/server/app';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const { app, httpServer, store } = createCafeServer();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const shutdown = (signal: string) => {
    console.log(`[CafeOS] Received ${signal}, flushing store to disk...`);
    store.flushToDiskSync();
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Seth Sawariya CafeOS server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
