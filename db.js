const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();
let Pool;
try {
  ({ Pool } = require("pg"));
} catch (error) {
  Pool = null;
}

const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "balykkz",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD
    };

const pool = Pool ? new Pool(config) : null;

function ensureDriver() {
  if (!pool) {
    throw new Error("Пакет pg не установлен. Выполните npm install.");
  }
}

async function query(text, params = []) {
  ensureDriver();
  return pool.query(text, params);
}

async function initDatabase() {
  ensureDriver();
  const schema = fs.readFileSync(path.join(__dirname, "database", "schema.sql"), "utf8");
  const seed = fs.readFileSync(path.join(__dirname, "database", "seed.sql"), "utf8");
  await pool.query(schema);
  await pool.query(seed);
}

async function getProducts() {
  const result = await query(`
    SELECT
      p.id,
      p.name,
      c.name AS category,
      COALESCE(p.package_price, p.price_per_kg) AS price,
      p.unit_label AS unit,
      CASE
        WHEN p.price_per_kg IS NOT NULL THEN trim(to_char(p.price_per_kg, 'FM999G999G999')) || ' ₸/кг'
        ELSE trim(to_char(p.package_price, 'FM999G999G999')) || ' ₸'
      END AS "perUnit",
      COALESCE(p.package_grams, 100) AS "weightStep",
      COALESCE(p.badge, 'Товар') AS badge,
      COALESCE(p.color, '#f05a28') AS color,
      p.image_url AS "imageUrl",
      p.description,
      COALESCE(p.details, '') AS details
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = TRUE
    ORDER BY p.id;
  `);
  return result.rows.map((product) => ({
    ...product,
    price: Number(product.price),
    weightStep: Number(product.weightStep)
  }));
}

async function createOrder(payload) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error("Корзина пустая");

    const productIds = items.map((item) => Number(item.id));
    const productsResult = await client.query(
      `SELECT id, COALESCE(package_price, price_per_kg) AS price, unit_label, COALESCE(package_grams, 1000) AS package_grams FROM products WHERE id = ANY($1::bigint[])`,
      [productIds]
    );
    const productsById = new Map(productsResult.rows.map((product) => [Number(product.id), product]));

    let total = 0;
    const prepared = items.map((item) => {
      const product = productsById.get(Number(item.id));
      if (!product) throw new Error("Товар не найден");
      const grams = Number(item.grams || product.package_grams || 1000);
      const qty = Number(item.qty || 1);
      const baseGrams = product.unit_label === "за кг" ? 1000 : Number(product.package_grams || grams);
      const price = Number(product.price) * grams / baseGrams;
      total += price * qty;
      return { productId: Number(item.id), grams, qty, price };
    });

    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, phone, address, comment, total_amount)
        VALUES ($1, $2, $3, $4, $5)
       RETURNING id, total_amount, created_at`,
            [payload.name, payload.phone, payload.address, payload.comment || null, total]
    );

    for (const item of prepared) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, grams, quantity, price_snapshot)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderResult.rows[0].id, item.productId, item.grams, item.qty, item.price]
      );
    }

    await client.query("COMMIT");
    return orderResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

async function registerUser(payload) {
  const name = String(payload.name || "").trim();
  const phone = String(payload.phone || "").trim();
  const password = String(payload.password || "");
  if (name.length < 2 || !/^\+?7\s?\d{3}\s?\d{3}\s?\d{2}\s?\d{2}$/.test(phone)) throw new Error("Введите корректный номер Казахстана");
  if (password.length < 8 || !/[A-ZА-ЯӘӨҰҮҚҒІ]/.test(password) || !/[a-zа-яәөұүқғі]/.test(password) || !/\d/.test(password)) throw new Error("Пароль должен содержать 8 символов, заглавную и строчную букву и цифру");
  const result = await query(
    `INSERT INTO users (full_name, phone, password_hash, address) VALUES ($1, $2, $3, $4)
     RETURNING id, full_name AS name, phone, address`,
    [name, phone, hashPassword(password), payload.address || null]
  );
  return result.rows[0];
}

async function loginUser(payload) {
  const result = await query(
    `SELECT id, full_name AS name, phone, address FROM users WHERE phone = $1 AND password_hash = $2`,
    [String(payload.phone || "").trim(), hashPassword(payload.password || "")]
  );
  if (!result.rows[0]) throw new Error("Неверный номер телефона или пароль");
  return result.rows[0];
}

async function getOrders(phone) {
  const result = await query(
    `SELECT o.id, o.total_amount, o.status, o.created_at,
       COALESCE(json_agg(json_build_object('name', p.name, 'quantity', oi.quantity, 'grams', oi.grams)) FILTER (WHERE p.id IS NOT NULL), '[]') AS items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.phone = $1 GROUP BY o.id ORDER BY o.created_at DESC`,
    [phone]
  );
  return result.rows;
}

module.exports = {
  initDatabase,
  getProducts,
  createOrder,
  registerUser,
  loginUser,
  getOrders,
  query
};