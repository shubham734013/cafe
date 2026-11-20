import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { newDb } from 'pg-mem';

test('PostgreSQL migration 001 creates all 11 tables with enums, constraints, and audit columns', async () => {
  const db = newDb();

  // Register now()
  db.public.registerFunction({
    name: 'now',
    returns: (db.public as any).getType('timestamp with time zone'),
    implementation: () => new Date(),
  });

  const sqlPath = path.resolve(process.cwd(), 'migrations/001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // Execute UP migration
  db.public.none(sql);

  // 1. Verify all 11 tables exist
  const expectedTables = [
    'cafes',
    'cafe_tables',
    'customers',
    'staff',
    'menu_categories',
    'menu_items',
    'orders',
    'order_items',
    'payments',
    'ingredients',
    'recipes',
  ];

  for (const tableName of expectedTables) {
    const table = db.public.getTable(tableName);
    assert.ok(table, `Table "${tableName}" should exist in the schema`);

    // Every table except cafes must have a cafe_id column
    if (tableName !== 'cafes') {
      const columnIds = (table as any).columns.map((c: any) => c.id);
      assert.ok(
        columnIds.includes('cafe_id'),
        `Table "${tableName}" must have a "cafe_id" column for multi-tenant SaaS scoping`
      );
    }
  }

  // 2. Insert Cafe
  db.public.none(`
    INSERT INTO cafes (id, name, gst_number)
    VALUES ('cafe_main', 'Seth Sawariya Roastery', '07AAAAA0000A1Z5');
  `);

  // 3. Insert Tables with random qr_token
  db.public.none(`
    INSERT INTO cafe_tables (id, cafe_id, label, qr_token)
    VALUES ('tbl_1', 'cafe_main', 'Table 01', 'qr_token_sample_12345');
  `);

  // 4. Insert Customer
  db.public.none(`
    INSERT INTO customers (id, cafe_id, phone, loyalty_points)
    VALUES ('cust_1', 'cafe_main', '+919876543210', 50);
  `);

  // 5. Insert Staff with password_hash
  db.public.none(`
    INSERT INTO staff (id, cafe_id, name, role, password_hash)
    VALUES ('staff_1', 'cafe_main', 'Vikram Seth', 'admin', 'scrypt:salt:hash123');
  `);

  // 6. Insert Category & Menu Item
  db.public.none(`
    INSERT INTO menu_categories (id, cafe_id, name)
    VALUES ('cat_coffee', 'cafe_main', 'Specialty Coffee');

    INSERT INTO menu_items (id, cafe_id, category_id, name, price, available)
    VALUES ('item_cappuccino', 'cafe_main', 'cat_coffee', 'Cappuccino', 180.00, true);
  `);

  // 7. Insert Ingredients & Recipe (Composite PK test)
  db.public.none(`
    INSERT INTO ingredients (id, cafe_id, name, stock_qty, unit, low_stock_level)
    VALUES
      ('ing_beans', 'cafe_main', 'Arabica Beans', 10.000, 'kg', 2.000),
      ('ing_milk', 'cafe_main', 'Full Cream Milk', 1.500, 'L', 3.000);

    INSERT INTO recipes (cafe_id, menu_item_id, ingredient_id, qty_used)
    VALUES
      ('cafe_main', 'item_cappuccino', 'ing_beans', 0.020),
      ('cafe_main', 'item_cappuccino', 'ing_milk', 0.200);
  `);

  // 8. Insert Order & Order Items
  db.public.none(`
    INSERT INTO orders (id, cafe_id, table_id, customer_id, staff_id, status, total)
    VALUES ('ord_1', 'cafe_main', 'tbl_1', 'cust_1', 'staff_1', 'placed', 180.00);

    INSERT INTO order_items (id, cafe_id, order_id, menu_item_id, qty, unit_price, notes)
    VALUES ('oi_1', 'cafe_main', 'ord_1', 'item_cappuccino', 1, 180.00, 'Extra hot');
  `);

  // 9. Insert Payment
  db.public.none(`
    INSERT INTO payments (id, cafe_id, order_id, method, amount, txn_ref, status)
    VALUES ('pay_1', 'cafe_main', 'ord_1', 'upi', 180.00, 'UPI_REF_987654', 'success');
  `);

  // Verify relations and join
  const orderDetails = db.public.many(`
    SELECT o.id, o.status, o.total, t.label as table_label, c.phone as customer_phone, s.name as staff_name, oi.unit_price, p.txn_ref
    FROM orders o
    LEFT JOIN cafe_tables t ON o.table_id = t.id
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN staff s ON o.staff_id = s.id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN payments p ON p.order_id = o.id
    WHERE o.cafe_id = 'cafe_main'
  `);

  assert.equal(orderDetails.length, 1);
  assert.equal(orderDetails[0].table_label, 'Table 01');
  assert.equal(orderDetails[0].customer_phone, '+919876543210');
  assert.equal(orderDetails[0].staff_name, 'Vikram Seth');
  assert.equal(orderDetails[0].txn_ref, 'UPI_REF_987654');

  // Verify financial audit safety: Deleting table sets orders.table_id to NULL, order is NOT deleted!
  db.public.none(`DELETE FROM cafe_tables WHERE id = 'tbl_1';`);
  const preservedOrder = db.public.many(`SELECT id, table_id FROM orders WHERE id = 'ord_1';`);
  assert.equal(preservedOrder.length, 1, 'Order must NOT be deleted when table is removed');
  assert.equal(preservedOrder[0].table_id, null, 'table_id must be SET NULL for audit safety');

  // Verify check constraint on price
  assert.throws(() => {
    db.public.none(`
      INSERT INTO menu_items (id, cafe_id, name, price)
      VALUES ('bad_item', 'cafe_main', 'Negative Price', -10.00);
    `);
  }, /check|constraint/i);

  // Verify check constraint on qty
  assert.throws(() => {
    db.public.none(`
      INSERT INTO order_items (id, cafe_id, order_id, menu_item_id, qty, unit_price)
      VALUES ('bad_oi', 'cafe_main', 'ord_1', 'item_cappuccino', 0, 180.00);
    `);
  }, /check|constraint/i);

  // 10. Execute DOWN rollback migration
  const downSqlPath = path.resolve(process.cwd(), 'migrations/001_initial_schema.down.sql');
  const downSql = fs.readFileSync(downSqlPath, 'utf-8');
  db.public.none(downSql);

  for (const tableName of expectedTables) {
    const table = db.public.getTable(tableName, true);
    assert.equal(table, null, `Table "${tableName}" should be removed after rollback`);
  }
});
