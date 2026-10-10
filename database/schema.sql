CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) UNIQUE,
  email VARCHAR(254),
  password_hash TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
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
  email VARCHAR(160),
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
  price_snapshot NUMERIC(12, 2) NOT NULL,
  is_negotiable BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#f05a28';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(254);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email VARCHAR(160);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_negotiable BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_full_name_lower_unique ON users (LOWER(full_name));
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'admin'));
  END IF;
END $$;
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
