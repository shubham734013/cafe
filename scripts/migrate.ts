import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function createPool(): Pool {
  if (!connectionString) {
    throw new Error('Set DATABASE_URL or POSTGRES_URL to use the optional PostgreSQL tools.');
  }
  return new Pool({ connectionString });
}

export async function runMigrations(customPool?: Pool) {
  const pool = customPool || createPool();
  const client = await pool.connect();

  try {
    console.log('[Migration] Ensuring schema_migrations tracking table exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(128) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migration] No migrations directory found.');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql') && !file.includes('.down.'))
      .sort();

    const { rows } = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations'
    );
    const applied = new Set(rows.map((r) => r.version));

    let count = 0;
    for (const file of files) {
      if (!applied.has(file)) {
        console.log(`[Migration] Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`[Migration] Successfully applied: ${file}`);
          count++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[Migration] Failed applying ${file}:`, err);
          throw err;
        }
      } else {
        console.log(`[Migration] Already applied: ${file} (skipped)`);
      }
    }

    if (count === 0) {
      console.log('[Migration] Schema is up to date.');
    } else {
      console.log(`[Migration] Successfully applied ${count} migration(s).`);
    }
  } finally {
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }
}

export async function rollbackMigrations(customPool?: Pool) {
  const pool = customPool || createPool();
  const client = await pool.connect();

  try {
    console.log('[Migration] Rolling back all migrations...');
    const downPath = path.resolve(process.cwd(), 'migrations/001_initial_schema.down.sql');
    if (fs.existsSync(downPath)) {
      const sql = fs.readFileSync(downPath, 'utf-8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE;');
      await client.query('COMMIT');
      console.log('[Migration] Rollback completed successfully.');
    } else {
      console.warn('[Migration] Down migration file not found.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration] Rollback failed:', err);
    throw err;
  } finally {
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const isDown = process.argv.includes('down') || process.argv.includes('--down');
  const action = isDown ? rollbackMigrations() : runMigrations();
  action.catch((err) => {
    console.error('[Migration Error]', err);
    process.exit(1);
  });
}
