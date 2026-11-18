import 'dotenv/config';
import crypto from 'node:crypto';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://postgres:postgres@localhost:5432/cafeos';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function generateQrToken(): string {
  return `qr_${crypto.randomBytes(20).toString('hex')}`;
}

export async function seedDatabase(customPool?: Pool) {
  const pool = customPool || new Pool({ connectionString });
  const client = await pool.connect();

  try {
    console.log('[Seed] Starting database seeding...');
    await client.query('BEGIN');

    // 1. Cafe
    const cafeId = 'cafe_main';
    await client.query(
      `
      INSERT INTO cafes (id, name, gst_number)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, gst_number = EXCLUDED.gst_number;
    `,
      [cafeId, 'Seth Sawariya Roastery', '07AAAAA0000A1Z5']
    );
    console.log('✔ Cafe created: Seth Sawariya Roastery');

    // 2. 5 Tables with unique, random QR tokens
    const tables = [
      { id: 'tbl_1', label: 'Table 01' },
      { id: 'tbl_2', label: 'Table 02' },
      { id: 'tbl_3', label: 'Table 03' },
      { id: 'tbl_4', label: 'Table 04' },
      { id: 'tbl_5', label: 'Table 05' },
    ];
    for (const t of tables) {
      await client.query(
        `
        INSERT INTO cafe_tables (id, cafe_id, label, qr_token)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label;
      `,
        [t.id, cafeId, t.label, generateQrToken()]
      );
    }
    console.log(`✔ ${tables.length} Dine-in tables created with secure QR tokens`);

    // 3. Customers
    const customerId = 'cust_101';
    await client.query(
      `
      INSERT INTO customers (id, cafe_id, phone, loyalty_points)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING;
    `,
      [customerId, cafeId, '+919876543210', 120]
    );
    console.log('✔ Sample customer created with loyalty points');

    // 4. Staff (1 Owner account with securely hashed password)
    const ownerId = 'staff_owner_1';
    const ownerPassHash = hashPassword('OwnerSecret123!');
    await client.query(
      `
      INSERT INTO staff (id, cafe_id, name, role, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `,
      [ownerId, cafeId, 'Vikram Seth', 'owner', ownerPassHash]
    );

    const waiterId = 'staff_waiter_1';
    await client.query(
      `
      INSERT INTO staff (id, cafe_id, name, role, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING;
    `,
      [waiterId, cafeId, 'Rohit Verma', 'waiter', hashPassword('Waiter1234!')]
    );
    console.log('✔ Staff accounts created (Owner & Waiter with scrypt hashes)');

    // 5. 2 Categories
    const categories = [
      { id: 'cat_coffee', name: 'Specialty Coffee' },
      { id: 'cat_bakery', name: 'Bakery & Snacks' },
    ];
    for (const c of categories) {
      await client.query(
        `
        INSERT INTO menu_categories (id, cafe_id, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `,
        [c.id, cafeId, c.name]
      );
    }
    console.log(`✔ ${categories.length} Menu categories created`);

    // 6. 6 Raw Ingredients
    const ingredients = [
      { id: 'ing_beans', name: 'Arabica Coffee Beans', stock: 15.0, unit: 'kg', lowLevel: 3.0 },
      { id: 'ing_milk', name: 'Full Cream Milk', stock: 2.2, unit: 'L', lowLevel: 5.0 }, // Intentional low stock for alert test query!
      { id: 'ing_oat_milk', name: 'Barista Oat Milk', stock: 8.0, unit: 'L', lowLevel: 2.0 },
      { id: 'ing_flour', name: 'Organic Wheat Flour', stock: 25.0, unit: 'kg', lowLevel: 5.0 },
      { id: 'ing_paneer', name: 'Fresh Malai Paneer', stock: 1.5, unit: 'kg', lowLevel: 2.0 }, // Intentional low stock for alert test query!
      { id: 'ing_butter', name: 'Farmhouse Butter', stock: 10.0, unit: 'kg', lowLevel: 2.5 },
    ];
    for (const ing of ingredients) {
      await client.query(
        `
        INSERT INTO ingredients (id, cafe_id, name, stock_qty, unit, low_stock_level)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          stock_qty = EXCLUDED.stock_qty,
          low_stock_level = EXCLUDED.low_stock_level;
      `,
        [ing.id, cafeId, ing.name, ing.stock, ing.unit, ing.lowLevel]
      );
    }
    console.log(`✔ ${ingredients.length} Stock ingredients created (with low-stock items for alert testing)`);

    // 7. 8 Menu Items
    const menuItems = [
      { id: 'item_espresso', cat: 'cat_coffee', name: 'Espresso Single', price: 120.0 },
      { id: 'item_cappuccino', cat: 'cat_coffee', name: 'Signature Cappuccino', price: 180.0 },
      { id: 'item_cold_brew', cat: 'cat_coffee', name: 'Nitro Cold Brew', price: 210.0 },
      { id: 'item_flat_white', cat: 'cat_coffee', name: 'Flat White (Oat Milk)', price: 220.0 },
      { id: 'item_croissant', cat: 'cat_bakery', name: 'Butter Croissant', price: 140.0 },
      { id: 'item_paneer_wrap', cat: 'cat_bakery', name: 'Tandoori Paneer Wrap', price: 190.0 },
      { id: 'item_veg_sandwich', cat: 'cat_bakery', name: 'Grilled Veg Sandwich', price: 160.0 },
      { id: 'item_muffin', cat: 'cat_bakery', name: 'Blueberry Muffin', price: 130.0 },
    ];
    for (const item of menuItems) {
      await client.query(
        `
        INSERT INTO menu_items (id, cafe_id, category_id, name, price, available)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, name = EXCLUDED.name;
      `,
        [item.id, cafeId, item.cat, item.name, item.price]
      );
    }
    console.log(`✔ ${menuItems.length} Menu items created across categories`);

    // 8. Recipes (Connecting menu items to ingredients)
    const recipes = [
      { itemId: 'item_espresso', ingId: 'ing_beans', qty: 0.018 },
      { itemId: 'item_cappuccino', ingId: 'ing_beans', qty: 0.02 },
      { itemId: 'item_cappuccino', ingId: 'ing_milk', qty: 0.2 },
      { itemId: 'item_cold_brew', ingId: 'ing_beans', qty: 0.035 },
      { itemId: 'item_flat_white', ingId: 'ing_beans', qty: 0.02 },
      { itemId: 'item_flat_white', ingId: 'ing_oat_milk', qty: 0.18 },
      { itemId: 'item_croissant', ingId: 'ing_flour', qty: 0.1 },
      { itemId: 'item_croissant', ingId: 'ing_butter', qty: 0.04 },
      { itemId: 'item_paneer_wrap', ingId: 'ing_paneer', qty: 0.12 },
      { itemId: 'item_paneer_wrap', ingId: 'ing_flour', qty: 0.08 },
      { itemId: 'item_veg_sandwich', ingId: 'ing_butter', qty: 0.02 },
      { itemId: 'item_muffin', ingId: 'ing_flour', qty: 0.08 },
      { itemId: 'item_muffin', ingId: 'ing_butter', qty: 0.03 },
    ];
    for (const r of recipes) {
      await client.query(
        `
        INSERT INTO recipes (cafe_id, menu_item_id, ingredient_id, qty_used)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (menu_item_id, ingredient_id) DO UPDATE SET qty_used = EXCLUDED.qty_used;
      `,
        [cafeId, r.itemId, r.ingId, r.qty]
      );
    }
    console.log(`✔ ${recipes.length} Recipe mappings linked with composite primary keys`);

    // 9. 3 Sample Orders in Different Lifecycle Statuses
    // Order 1: 'placed' (Customer ordered via Table 1 QR)
    const order1Id = 'ord_sample_01';
    await client.query(
      `
      INSERT INTO orders (id, cafe_id, table_id, customer_id, staff_id, status, total)
      VALUES ($1, $2, $3, $4, NULL, 'placed', 320.00)
      ON CONFLICT (id) DO NOTHING;
    `,
      [order1Id, cafeId, 'tbl_1', customerId]
    );

    await client.query(
      `
      INSERT INTO order_items (id, cafe_id, order_id, menu_item_id, qty, unit_price, notes)
      VALUES
        ('oi_101', $1, $2, 'item_cappuccino', 1, 180.00, 'Extra hot'),
        ('oi_102', $1, $2, 'item_croissant', 1, 140.00, 'Warm up please')
      ON CONFLICT (id) DO NOTHING;
    `,
      [cafeId, order1Id]
    );

    // Order 2: 'preparing' (Kitchen is working on it, waiter Rohit took it at Table 2)
    const order2Id = 'ord_sample_02';
    await client.query(
      `
      INSERT INTO orders (id, cafe_id, table_id, customer_id, staff_id, status, total)
      VALUES ($1, $2, $3, NULL, $4, 'preparing', 410.00)
      ON CONFLICT (id) DO NOTHING;
    `,
      [order2Id, cafeId, 'tbl_2', waiterId]
    );

    await client.query(
      `
      INSERT INTO order_items (id, cafe_id, order_id, menu_item_id, qty, unit_price, notes)
      VALUES
        ('oi_201', $1, $2, 'item_flat_white', 1, 220.00, 'Oat milk'),
        ('oi_202', $1, $2, 'item_paneer_wrap', 1, 190.00, 'Spicy')
      ON CONFLICT (id) DO NOTHING;
    `,
      [cafeId, order2Id]
    );

    // Order 3: 'paid' (Served and paid via UPI at Table 3)
    const order3Id = 'ord_sample_03';
    await client.query(
      `
      INSERT INTO orders (id, cafe_id, table_id, customer_id, staff_id, status, total)
      VALUES ($1, $2, $3, $4, $5, 'paid', 340.00)
      ON CONFLICT (id) DO NOTHING;
    `,
      [order3Id, cafeId, 'tbl_3', customerId, waiterId]
    );

    await client.query(
      `
      INSERT INTO order_items (id, cafe_id, order_id, menu_item_id, qty, unit_price, notes)
      VALUES
        ('oi_301', $1, $2, 'item_cold_brew', 1, 210.00, 'Black, no sugar'),
        ('oi_302', $1, $2, 'item_muffin', 1, 130.00, NULL)
      ON CONFLICT (id) DO NOTHING;
    `,
      [cafeId, order3Id]
    );

    // Payment for Order 3
    const txnRef = 'UPI_UTR_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    await client.query(
      `
      INSERT INTO payments (id, cafe_id, order_id, method, amount, txn_ref, status)
      VALUES ('pay_sample_03', $1, $2, 'upi', 340.00, $3, 'success')
      ON CONFLICT (id) DO NOTHING;
    `,
      [cafeId, order3Id, txnRef]
    );

    await client.query('COMMIT');
    console.log('✔ 3 Sample orders and payments seeded successfully.');
    console.log('[Seed] Seeding completed with 0 errors.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed Error]', err);
    throw err;
  } finally {
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase().catch((err) => {
    console.error('[Seed Failure]', err);
    process.exit(1);
  });
}
