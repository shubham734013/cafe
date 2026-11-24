/**
 * Database Architecture & Connection Management
 *
 * Primary Application Database: MongoDB
 * CafeStore owns the live application state, customer orders, real-time inventory,
 * staff attendance, and primary operational transactions.
 *
 * PostgreSQL Integration:
 * Optional relational ledger and analytical archive. Used for historical SQL reporting
 * and offline business intelligence when DATABASE_URL is configured.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import 'dotenv/config';

let poolInstance: Pool | null = null;
let postgresHealthy = false;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function getDbPool(): Pool {
  if (!poolInstance) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('PostgreSQL is optional and is not configured.');
    }

    poolInstance = new Pool({
      connectionString,
      max: Number(process.env.PG_MAX_POOL || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    poolInstance.on('error', () => {
      console.error('[PostgreSQL] Connection pool error.');
      postgresHealthy = false;
    });
  }

  return poolInstance;
}

export async function checkPostgresHealth(): Promise<{ configured: boolean; connected: boolean; error?: string }> {
  if (!isPostgresConfigured()) {
    return { configured: false, connected: false };
  }
  try {
    const pool = getDbPool();
    const res = await pool.query('SELECT 1 AS check_alive');
    postgresHealthy = res.rows.length > 0;
    return { configured: true, connected: true };
  } catch {
    postgresHealthy = false;
    return { configured: true, connected: false, error: 'PostgreSQL connection failed.' };
  }
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getDbPool();
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function recordPostgresFinancialRow(order: {
  id: string;
  total: number;
  subtotal: number;
  tax: number;
  discount: number;
  paymentMode: string;
  paymentStatus: string;
  serviceMode: string;
}): Promise<boolean> {
  if (!isPostgresConfigured() || !postgresHealthy) {
    return false;
  }
  try {
    await query(
      `INSERT INTO orders (id, cafe_id, total_amount, subtotal_amount, tax_amount, discount_amount, payment_mode, payment_status, service_mode)
       VALUES ($1, 'seth-sawariya-main', $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         payment_status = EXCLUDED.payment_status,
         updated_at = NOW()`,
      [
        order.id,
        order.total,
        order.subtotal,
        order.tax,
        order.discount,
        order.paymentMode,
        order.paymentStatus,
        order.serviceMode,
      ]
    );
    return true;
  } catch {
    return false;
  }
}

export async function closeDbPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    postgresHealthy = false;
  }
}
