CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(160),
  password_hash TEXT,
  city VARCHAR(80) DEFAULT 'Астана',
  address TEXT,
  bonus_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(140) NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT REFERENCES categories(id),
  name VARCHAR(180) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  details TEXT,
  price_per_kg NUMERIC(12, 2),
  package_price NUMERIC(12, 2),
  package_grams INTEGER,
  unit_label VARCHAR(80) NOT NULL,
  badge VARCHAR(60),
  color VARCHAR(20) DEFAULT '#f05a28',
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  address TEXT NOT NULL,
  comment TEXT,
  status VARCHAR(40) DEFAULT 'new',
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  grams INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_snapshot NUMERIC(12, 2) NOT NULL
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#f05a28';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_name_unique'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_name_unique UNIQUE (name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN (to_tsvector('russian', name || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);