import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { newDb } from 'pg-mem';

test('Seed script populates full cafe dataset and answers all 5 verification queries', async () => {
  const db = newDb();

  db.public.registerFunction({
    name: 'now',
    returns: (db.public as any).getType('timestamp with time zone'),
    implementation: () => new Date(),
  });

  // 1. Run Schema Migration
  const sqlPath = path.resolve(process.cwd(), 'migrations/001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  db.public.none(sql);

  // 2. Insert Seed Data
  db.public.none(`
    -- Cafe
    INSERT INTO cafes (id, name, gst_number)
    VALUES ('cafe_main', 'Seth Sawariya Roastery', '07AAAAA0000A1Z5');

    -- 5 Tables with secure QR tokens
    INSERT INTO cafe_tables (id, cafe_id, label, qr_token)
    VALUES
      ('tbl_1', 'cafe_main', 'Table 01', 'qr_tok_8f9a2c1d3e4b5a6f'),
      ('tbl_2', 'cafe_main', 'Table 02', 'qr_tok_7e6d5c4b3a2f1e0d'),
      ('tbl_3', 'cafe_main', 'Table 03', 'qr_tok_1a2b3c4d5e6f7a8b'),
      ('tbl_4', 'cafe_main', 'Table 04', 'qr_tok_9c8b7a6f5e4d3c2b'),
      ('tbl_5', 'cafe_main', 'Table 05', 'qr_tok_5f4e3d2c1b0a9f8e');

    -- Customer
    INSERT INTO customers (id, cafe_id, phone, loyalty_points)
    VALUES ('cust_101', 'cafe_main', '+919876543210', 120);

    -- Staff (Owner & Waiter with scrypt hashes)
    INSERT INTO staff (id, cafe_id, name, role, password_hash)
    VALUES
      ('staff_owner_1', 'cafe_main', 'Vikram Seth', 'owner', 'scrypt:salt:owner_secret_hash'),
      ('staff_waiter_1', 'cafe_main', 'Rohit Verma', 'waiter', 'scrypt:salt:waiter_secret_hash');

    -- 2 Categories
    INSERT INTO menu_categories (id, cafe_id, name)
    VALUES
      ('cat_coffee', 'cafe_main', 'Specialty Coffee'),
      ('cat_bakery', 'cafe_main', 'Bakery & Snacks');

    -- 6 Ingredients
    INSERT INTO ingredients (id, cafe_id, name, stock_qty, unit, low_stock_level)
    VALUES
      ('ing_beans', 'cafe_main', 'Arabica Coffee Beans', 15.0, 'kg', 3.0),
      ('ing_milk', 'cafe_main', 'Full Cream Milk', 2.2, 'L', 5.0),
      ('ing_oat_milk', 'cafe_main', 'Barista Oat Milk', 8.0, 'L', 2.0),
      ('ing_flour', 'cafe_main', 'Organic Wheat Flour', 25.0, 'kg', 5.0),
      ('ing_paneer', 'cafe_main', 'Fresh Malai Paneer', 1.5, 'kg', 2.0),
      ('ing_butter', 'cafe_main', 'Farmhouse Butter', 10.0, 'kg', 2.5);

    -- 8 Menu Items
    INSERT INTO menu_items (id, cafe_id, category_id, name, price, available)
    VALUES
      ('item_espresso', 'cafe_main', 'cat_coffee', 'Espresso Single', 120.00, true),
      ('item_cappuccino', 'cafe_main', 'cat_coffee', 'Signature Cappuccino', 180.00, true),
      ('item_cold_brew', 'cafe_main', 'cat_coffee', 'Nitro Cold Brew', 210.00, true),
      ('item_flat_white', 'cafe_main', 'cat_coffee', 'Flat White (Oat Milk)', 220.00, true),
      ('item_croissant', 'cafe_main', 'cat_bakery', 'Butter Croissant', 140.00, true),
      ('item_paneer_wrap', 'cafe_main', 'cat_bakery', 'Tandoori Paneer Wrap', 190.00, true),
      ('item_veg_sandwich', 'cafe_main', 'cat_bakery', 'Grilled Veg Sandwich', 160.00, true),
      ('item_muffin', 'cafe_main', 'cat_bakery', 'Blueberry Muffin', 130.00, true);

    -- Recipes
    INSERT INTO recipes (cafe_id, menu_item_id, ingredient_id, qty_used)
    VALUES
      ('cafe_main', 'item_espresso', 'ing_beans', 0.018),
      ('cafe_main', 'item_cappuccino', 'ing_beans', 0.020),
      ('cafe_main', 'item_cappuccino', 'ing_milk', 0.200),
      ('cafe_main', 'item_cold_brew', 'ing_beans', 0.035),
      ('cafe_main', 'item_flat_white', 'ing_beans', 0.020),
      ('cafe_main', 'item_flat_white', 'ing_oat_milk', 0.180),
      ('cafe_main', 'item_croissant', 'ing_flour', 0.100),
      ('cafe_main', 'item_croissant', 'ing_butter', 0.040),
      ('cafe_main', 'item_paneer_wrap', 'ing_paneer', 0.120),
      ('cafe_main', 'item_paneer_wrap', 'ing_flour', 0.080),
      ('cafe_main', 'item_veg_sandwich', 'ing_butter', 0.020),
      ('cafe_main', 'item_muffin', 'ing_flour', 0.080),
      ('cafe_main', 'item_muffin', 'ing_butter', 0.030);

    -- 3 Sample Orders
    INSERT INTO orders (id, cafe_id, table_id, customer_id, staff_id, status, total)
    VALUES
      ('ord_sample_01', 'cafe_main', 'tbl_1', 'cust_101', NULL, 'placed', 320.00),
      ('ord_sample_02', 'cafe_main', 'tbl_2', NULL, 'staff_waiter_1', 'preparing', 410.00),
      ('ord_sample_03', 'cafe_main', 'tbl_3', 'cust_101', 'staff_waiter_1', 'paid', 340.00);

    INSERT INTO order_items (id, cafe_id, order_id, menu_item_id, qty, unit_price, notes)
    VALUES
      ('oi_101', 'cafe_main', 'ord_sample_01', 'item_cappuccino', 1, 180.00, 'Extra hot'),
      ('oi_102', 'cafe_main', 'ord_sample_01', 'item_croissant', 1, 140.00, 'Warm up please'),
      ('oi_201', 'cafe_main', 'ord_sample_02', 'item_flat_white', 1, 220.00, 'Oat milk'),
      ('oi_202', 'cafe_main', 'ord_sample_02', 'item_paneer_wrap', 1, 190.00, 'Spicy'),
      ('oi_301', 'cafe_main', 'ord_sample_03', 'item_cold_brew', 1, 210.00, 'Black, no sugar'),
      ('oi_302', 'cafe_main', 'ord_sample_03', 'item_muffin', 1, 130.00, NULL);

    INSERT INTO payments (id, cafe_id, order_id, method, amount, txn_ref, status)
    VALUES ('pay_sample_03', 'cafe_main', 'ord_sample_03', 'upi', 340.00, 'UPI_UTR_A1B2C3D4', 'success');
  `);

  // =========================================================================
  // Test Query 1: List today's orders with table, customer, staff, and line items
  // =========================================================================
  const q1 = db.public.many(`
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
    ORDER BY o.id, oi.id;
  `);
  assert.equal(q1.length, 6, 'Total 6 line items across the 3 orders');
  assert.equal(q1[0].order_id, 'ord_sample_01');
  assert.equal(q1[0].table_label, 'Table 01');

  // =========================================================================
  // Test Query 2: Low-stock ingredient alerts (stock_qty <= low_stock_level)
  // =========================================================================
  const q2 = db.public.many(`
    SELECT
      id,
      name,
      stock_qty,
      low_stock_level,
      unit,
      (low_stock_level - stock_qty) AS deficit
    FROM ingredients
    WHERE cafe_id = 'cafe_main' AND stock_qty <= low_stock_level
    ORDER BY deficit DESC;
  `);
  assert.equal(q2.length, 2, 'Milk and Paneer should trigger low-stock alerts');
  assert.equal(q2[0].name, 'Full Cream Milk');
  assert.equal(q2[1].name, 'Fresh Malai Paneer');

  // =========================================================================
  // Test Query 3: Recipe Bill of Materials for a Menu Item
  // =========================================================================
  const q3 = db.public.many(`
    SELECT
      m.name AS menu_item,
      m.price,
      i.name AS ingredient_used,
      r.qty_used,
      i.unit
    FROM recipes r
    JOIN menu_items m ON r.menu_item_id = m.id
    JOIN ingredients i ON r.ingredient_id = i.id
    WHERE r.cafe_id = 'cafe_main' AND r.menu_item_id = 'item_cappuccino'
    ORDER BY i.name;
  `);
  assert.equal(q3.length, 2);
  assert.equal(q3[0].ingredient_used, 'Arabica Coffee Beans');
  assert.equal(q3[1].ingredient_used, 'Full Cream Milk');

  // =========================================================================
  // Test Query 4: Daily Settled Revenue by Payment Method
  // =========================================================================
  const q4 = db.public.many(`
    SELECT
      p.method,
      COUNT(p.id) AS total_txns,
      SUM(p.amount) AS total_settled
    FROM payments p
    WHERE p.cafe_id = 'cafe_main' AND p.status = 'success'
    GROUP BY p.method;
  `);
  assert.equal(q4.length, 1);
  assert.equal(q4[0].method, 'upi');
  assert.equal(q4[0].total_settled, 340.0);

  // =========================================================================
  // Test Query 5: Resolve Dine-In Table by QR Token (Customer QR Scan)
  // =========================================================================
  const q5 = db.public.many(`
    SELECT
      t.id AS table_id,
      t.label,
      c.name AS cafe_name,
      t.qr_token
    FROM cafe_tables t
    JOIN cafes c ON t.cafe_id = c.id
    WHERE t.qr_token = 'qr_tok_8f9a2c1d3e4b5a6f';
  `);
  assert.equal(q5.length, 1);
  assert.equal(q5[0].label, 'Table 01');
  assert.equal(q5[0].cafe_name, 'Seth Sawariya Roastery');
});
