-- ============================================================================
-- Migration 001: Initial Multi-Cafe Relational Schema (UP)
-- Stack: PostgreSQL 14+
-- Features: Multi-tenant SaaS with cafe_id scoping, Enums, Foreign Keys,
--           Financial audit safety (ON DELETE SET NULL), Indexes & CHECK constraints.
-- ============================================================================

-- 1. Create Custom Enum Types
CREATE TYPE order_status_enum AS ENUM (
  'placed',
  'accepted',
  'preparing',
  'ready',
  'served',
  'paid',
  'cancelled'
);

CREATE TYPE staff_role_enum AS ENUM (
  'owner',
  'manager',
  'waiter',
  'kitchen'
);

CREATE TYPE payment_method_enum AS ENUM (
  'cash',
  'upi',
  'card'
);

CREATE TYPE payment_status_enum AS ENUM (
  'pending',
  'success',
  'failed'
);

-- 2. Cafes (Tenants)
CREATE TABLE IF NOT EXISTS cafes (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  gst_number VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Cafe Tables (Dine-In with QR Code Token)
CREATE TABLE IF NOT EXISTS cafe_tables (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  label VARCHAR(64) NOT NULL,
  qr_token VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cafe_tables_cafe_label UNIQUE (cafe_id, label)
);

CREATE INDEX IF NOT EXISTS idx_cafe_tables_cafe_id ON cafe_tables(cafe_id);
CREATE INDEX IF NOT EXISTS idx_cafe_tables_qr_token ON cafe_tables(qr_token);

-- 4. Customers (Loyalty & Identification)
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  phone VARCHAR(32) NOT NULL,
  loyalty_points INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customers_cafe_phone UNIQUE (cafe_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_cafe_id ON customers(cafe_id);
CREATE INDEX IF NOT EXISTS idx_customers_cafe_phone ON customers(cafe_id, phone);

-- 5. Staff (Employees with Secure Hashed Passwords)
CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  role staff_role_enum NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_cafe_id ON staff(cafe_id);
CREATE INDEX IF NOT EXISTS idx_staff_cafe_role ON staff(cafe_id, role);

-- 6. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_menu_categories_cafe_name UNIQUE (cafe_id, name)
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_cafe_id ON menu_categories(cafe_id);

-- 7. Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  category_id VARCHAR(64) REFERENCES menu_categories(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_cafe_id ON menu_items(cafe_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_cafe_avail ON menu_items(cafe_id, available);

-- 8. Orders (Dine-In / Counter Orders)
-- Safety: Never cascade-delete orders when tables, customers, or staff are deleted.
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  table_id VARCHAR(64) REFERENCES cafe_tables(id) ON DELETE SET NULL,
  customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
  staff_id VARCHAR(64) REFERENCES staff(id) ON DELETE SET NULL,
  status order_status_enum NOT NULL DEFAULT 'placed',
  total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_cafe_id ON orders(cafe_id);
CREATE INDEX IF NOT EXISTS idx_orders_cafe_status_created ON orders(cafe_id, status, created_at DESC);

-- 9. Order Items (Lines per Order)
CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id VARCHAR(64) NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_cafe_id ON order_items(cafe_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- 10. Payments (Transactions)
-- Safety: Payments are protected from cascade deletion.
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  method payment_method_enum NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  txn_ref VARCHAR(255) NOT NULL UNIQUE,
  status payment_status_enum NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_cafe_id ON payments(cafe_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_txn_ref ON payments(txn_ref);

-- 11. Ingredients (Inventory Stock)
CREATE TABLE IF NOT EXISTS ingredients (
  id VARCHAR(64) PRIMARY KEY,
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  stock_qty NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (stock_qty >= 0),
  unit VARCHAR(32) NOT NULL,
  low_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (low_stock_level >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ingredients_cafe_name UNIQUE (cafe_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ingredients_cafe_id ON ingredients(cafe_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_cafe_stock ON ingredients(cafe_id, stock_qty, low_stock_level);

-- 12. Recipes (Bill of Materials with Composite Primary Key)
CREATE TABLE IF NOT EXISTS recipes (
  cafe_id VARCHAR(64) NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  menu_item_id VARCHAR(64) NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id VARCHAR(64) NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  qty_used NUMERIC(12, 3) NOT NULL CHECK (qty_used > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (menu_item_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipes_cafe_id ON recipes(cafe_id);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient ON recipes(ingredient_id);
