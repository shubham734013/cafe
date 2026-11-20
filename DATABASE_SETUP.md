# CafeOS PostgreSQL Database Setup & Operations Guide

This guide explains how to set up, migrate, seed, and verify the relational PostgreSQL database for your multi-cafe SaaS system.

---

## 1. Quick Start Commands

All commands run using your project's npm scripts:

| Goal | Command | What it does |
| :--- | :--- | :--- |
| **Run Migrations (UP)** | `npm run db:migrate` | Applies all pending migrations, creating/updating tables, enums, FKs, and indexes. |
| **Seed Sample Data** | `npm run db:seed` | Populates 1 cafe, 5 QR tables, 2 categories, 8 items, 6 ingredients, recipes, Admin and Kitchen staff (hashed passwords), and 3 orders. |
| **Reset Database** | `npm run db:reset` | Tears down all tables (DOWN migration), re-applies schema, and re-seeds fresh data. |
| **Run Test Suite** | `npm test` | Runs all 49 automated unit and integration tests across the database and APIs. |

---

## 2. PostgreSQL Connection Configuration

In your `.env` file, set your connection string:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cafeos"
```

If creating the database from scratch in PostgreSQL:
```bash
createdb cafeos
```
Then run:
```bash
npm run db:migrate
npm run db:seed
```

---

## 3. Database Architecture & Rules

1. **Multi-Tenant SaaS**: Every table has `cafe_id` with foreign key indexes for lightning-fast queries per cafe.
2. **Financial Data Protection (`ON DELETE`)**:
   * Deleting a table, customer, or staff sets `orders.table_id = NULL` (`ON DELETE SET NULL`), so financial records and bills are never deleted.
   * `order_items` cascade if the parent order is deleted, but `menu_items` cannot be deleted if past orders reference them (`ON DELETE RESTRICT`).
3. **Strict Money Values**: All price, total, and payment amount columns use `NUMERIC(10, 2)` (never floating point).
4. **Atomic Transactions**: Orders, line items, and recipe-based ingredient stock deductions run inside a single `BEGIN ... COMMIT` block.

---

## 4. 5 Verification Queries

Run these queries in `psql` or any database GUI (pgAdmin, DBeaver, TablePlus) to confirm the system works:

### Query 1: List Today's Orders with Table, Customer, Staff & Items
Shows all orders with their assigned table, ordering customer, attending staff, line items, and unit prices.

```sql
SELECT
  o.id AS order_id,
  t.label AS table_label,
  c.phone AS customer_phone,
  s.name AS staff_name,
  o.status,
  o.total,
  oi.qty,
  m.name AS item_name,
  oi.unit_price,
  oi.notes
FROM orders o
LEFT JOIN cafe_tables t ON o.table_id = t.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN staff s ON o.staff_id = s.id
JOIN order_items oi ON oi.order_id = o.id
JOIN menu_items m ON oi.menu_item_id = m.id
WHERE o.cafe_id = 'cafe_main'
ORDER BY o.created_at DESC, oi.id;
```

---

### Query 2: Low-Stock Ingredients Alert
Finds raw ingredients where the current stock has dropped below the threshold and needs reordering.

```sql
SELECT
  id,
  name,
  stock_qty,
  low_stock_level,
  unit,
  (low_stock_level - stock_qty) AS deficit_needed
FROM ingredients
WHERE cafe_id = 'cafe_main'
  AND stock_qty <= low_stock_level
ORDER BY deficit_needed DESC;
```
*(Expected: Full Cream Milk and Fresh Malai Paneer appear as critical).*

---

### Query 3: Recipe Bill of Materials for a Menu Item
Inspects which raw ingredients and exact quantities are burned when an item (e.g. Signature Cappuccino) is accepted.

```sql
SELECT
  m.name AS menu_item,
  m.price,
  i.name AS ingredient_used,
  r.qty_used,
  i.unit
FROM recipes r
JOIN menu_items m ON r.menu_item_id = m.id
JOIN ingredients i ON r.ingredient_id = i.id
WHERE r.cafe_id = 'cafe_main'
  AND r.menu_item_id = 'item_cappuccino'
ORDER BY i.name;
```

---

### Query 4: Daily Settled Revenue by Payment Method
Aggregates paid orders by method (Cash, UPI, Card) for the daily financial report.

```sql
SELECT
  p.method,
  COUNT(p.id) AS total_successful_payments,
  SUM(p.amount) AS total_settled_amount
FROM payments p
WHERE p.cafe_id = 'cafe_main'
  AND p.status = 'success'
GROUP BY p.method;
```

---

### Query 5: Resolve Table & Cafe from Customer QR Token
Simulates what happens when a guest scans a QR code: resolves the table and cafe without requiring login.

```sql
SELECT
  t.id AS table_id,
  t.label,
  c.name AS cafe_name,
  c.gst_number,
  t.qr_token
FROM cafe_tables t
JOIN cafes c ON t.cafe_id = c.id
WHERE t.qr_token = 'qr_tok_8f9a2c1d3e4b5a6f';
```
