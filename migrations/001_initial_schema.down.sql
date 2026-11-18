-- ============================================================================
-- Migration 001: Initial Multi-Cafe Relational Schema (DOWN / ROLLBACK)
-- Drops tables and types in reverse dependency order.
-- ============================================================================

DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS ingredients CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS menu_categories CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS cafe_tables CASCADE;
DROP TABLE IF EXISTS cafes CASCADE;

DROP TYPE IF EXISTS payment_status_enum;
DROP TYPE IF EXISTS payment_method_enum;
DROP TYPE IF EXISTS staff_role_enum;
DROP TYPE IF EXISTS order_status_enum;
