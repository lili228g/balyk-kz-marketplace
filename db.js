const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

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

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  else if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits;
}

function validKzPhone(value) {
  const input = String(value || "").trim();
  if (!/^\+?[\d\s().-]+$/.test(input)) return false;
  const digits = input.replace(/\D/g, "");
  if (input.startsWith("+")) return digits.length === 11 && digits.startsWith("7");
  return (digits.length === 10 && digits.startsWith("7")) ||
    (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8")));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  return value.length <= 254 &&
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/i.test(value);
}

function validPassword(value) {
  return value.length >= 8 && /[A-ZА-ЯӘӨҰҮҚҒІ]/.test(value) && /[a-zа-яәөұүқғі]/.test(value) && /\d/.test(value);
}

async function initDatabase() {
  ensureDriver();
  const schema = fs.readFileSync(path.join(__dirname, "database", "schema.sql"), "utf8");
  const seed = fs.readFileSync(path.join(__dirname, "database", "seed.sql"), "utf8");
  await pool.query(schema);
  await pool.query(seed);
  await provisionAdmin();
}

async function provisionAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!email && !password) return;
  if (!validEmail(email) || password.length < 12 || !validPassword(password)) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD; the admin password must be at least 12 characters with uppercase, lowercase, and a number.");
  }

  const name = cleanText(process.env.ADMIN_NAME || "Администратор", 120);
  const passwordHash = await hashPassword(password);
  const existing = await query("SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1", [email]);
  if (existing.rows.length) {
    await query("UPDATE users SET full_name = $1, password_hash = $2, role = 'admin' WHERE id = $3", [name, passwordHash, existing.rows[0].id]);
    return;
  }
  await query(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
    [name, email, passwordHash]
  );
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

async function createOrder(payload, sessionUser = null) {
  const name = cleanText(sessionUser?.name || payload.name, 120);
  const email = normalizeEmail(sessionUser?.email || payload.email);
  const phoneInput = sessionUser?.phone || payload.phone;
  const phone = normalizePhone(phoneInput);
  const userId = Number.isSafeInteger(Number(sessionUser?.id)) ? Number(sessionUser.id) : null;
  const address = cleanText(payload.address, 600);
  const comment = cleanText(payload.comment, 600);
  if (name.length < 2) throw validationError("Введите имя минимум из 2 символов");
  if (!validEmail(email)) throw validationError("Введите корректный email");
  if (!validKzPhone(phoneInput)) throw validationError("Введите корректный номер Казахстана");
  if (address.length < 6) throw validationError("Введите полный адрес доставки");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 30) : [];
    if (!items.length) throw validationError("Корзина пустая");

    const productIds = items.map((item) => Number(item.id));
    if (productIds.some((id) => !Number.isInteger(id) || id < 1)) {
      throw validationError("Некорректный товар в корзине");
    }
    const productsResult = await client.query(
      `SELECT id, name, image_url, COALESCE(package_price, price_per_kg) AS price, unit_label, COALESCE(package_grams, 1000) AS package_grams FROM products WHERE id = ANY($1::bigint[])`,
      [productIds]
    );
    const productsById = new Map(productsResult.rows.map((product) => [Number(product.id), product]));

    let total = 0;
    const prepared = items.map((item) => {
      const product = productsById.get(Number(item.id));
      if (!product) throw validationError("Товар не найден");
      const isWeighted = product.unit_label === "за кг";
      const isNegotiable = item.isNegotiable === true;
      const grams = Number(item.grams ?? (isWeighted ? 1000 : product.package_grams || 1000));
      const qty = Number(item.qty ?? 1);
      const baseGrams = isWeighted ? 1000 : Number(product.package_grams || 1000);
      if (!Number.isInteger(grams) || grams < 1 || !Number.isInteger(qty) || qty < 1 || qty > 5) {
        throw validationError("Выберите количество от 1 до 5 целых единиц");
      }
      if (isWeighted && (!isNegotiable && (grams < 1000 || grams > 5000 || grams % 1000 !== 0) || qty !== 1)) {
        throw validationError("Вес можно выбрать только от 1 до 5 кг целыми килограммами");
      }
      if (!isWeighted && grams !== baseGrams) throw validationError("Некорректный размер упаковки");
      const price = isNegotiable ? 0 : Number(product.price) * grams / baseGrams;
      total += price * qty;
      return {
        productId: Number(item.id),
        name: product.name,
        imageUrl: product.image_url,
        grams,
        qty,
        price,
        lineTotal: price * qty,
        isNegotiable
      };
    });

    if (total < 15000) throw validationError("Минимальная сумма заказа — 15 000 ₸");

    const orderResult = await client.query(
      `INSERT INTO orders (user_id, customer_name, email, phone, address, comment, total_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, total_amount, created_at`,
      [userId, name, email, phone, address, comment || null, total]
    );

    for (const item of prepared) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, grams, quantity, price_snapshot, is_negotiable)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderResult.rows[0].id, item.productId, item.grams, item.qty, item.price, item.isNegotiable]
      );
    }

    await client.query("COMMIT");
    return {
      ...orderResult.rows[0],
      customerName: name,
      email,
      phone,
      address,
      comment,
      items: prepared
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function registerUser(payload) {
  const name = cleanText(payload.name, 120);
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password || "");
  const address = cleanText(payload.address, 300);
  if (name.length < 2) throw validationError("Введите имя минимум из 2 символов");
  if (!validEmail(email)) throw validationError("Введите корректный email");
  if (!validKzPhone(payload.phone)) throw validationError("Введите корректный номер Казахстана");
  if (!validPassword(password)) throw validationError("Пароль должен содержать 8 символов, заглавную и строчную букву и цифру");
  if (password !== String(payload.confirmPassword || "")) throw validationError("Пароли не совпадают");
  const existing = await query("SELECT full_name, email, phone FROM users WHERE phone = $1 OR LOWER(email) = $2 OR LOWER(full_name) = LOWER($3)", [phone, email, name]);
  if (existing.rows.some((user) => user.phone === phone)) throw validationError("Этот телефон уже зарегистрирован");
  if (existing.rows.some((user) => user.email?.toLowerCase() === email)) throw validationError("Этот email уже зарегистрирован");
  if (existing.rows.some((user) => user.full_name.toLowerCase() === name.toLowerCase())) throw validationError("Этот никнейм уже занят");
  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (full_name, email, phone, password_hash, address) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, full_name AS name, email, phone, address, role`,
    [name, email, phone, passwordHash, address || null]
  );
  return result.rows[0];
}

async function loginUser(payload) {
  const email = normalizeEmail(payload.email || payload.identifier);
  if (!validEmail(email)) throw validationError("Введите корректный email");
  const result = await query(
    `SELECT id, full_name AS name, email, phone, address, role, password_hash
       FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1`,
    [email]
  );
  const user = result.rows[0];
  if (!user || !await verifyPassword(payload.password || "", user.password_hash)) {
    throw validationError("Неверный email или пароль");
  }
  delete user.password_hash;
  return user;
}

async function updateProfile(userId, payload) {
  const id = Number(userId);
  const name = cleanText(payload.name, 120);
  const email = normalizeEmail(payload.email);
  const phoneInput = String(payload.phone || "").trim();
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  const address = cleanText(payload.address, 300);
  const currentPassword = String(payload.currentPassword || "");
  if (!Number.isSafeInteger(id) || id < 1) throw validationError("Не удалось определить аккаунт");
  if (name.length < 2) throw validationError("Введите имя минимум из 2 символов");
  if (!validEmail(email)) throw validationError("Введите корректный email");
  if (!currentPassword) throw validationError("Введите текущий пароль для подтверждения");

  const existing = await query("SELECT password_hash, role FROM users WHERE id = $1", [id]);
  if (existing.rows[0]?.role !== "admin" && !phoneInput) throw validationError("Введите номер телефона Казахстана");
  if (phoneInput && !validKzPhone(phoneInput)) throw validationError("Введите корректный номер Казахстана");
  const storedPassword = existing.rows[0]?.password_hash;
  if (!storedPassword || !await verifyPassword(currentPassword, storedPassword)) {
    throw validationError("Текущий пароль указан неверно", 403);
  }

  try {
    const result = await query(
      `UPDATE users
          SET full_name = $1, email = $2, phone = $3, address = $4
        WHERE id = $5
        RETURNING id, full_name AS name, email, phone, address, role`,
      [name, email, phone, address || null, id]
    );
    if (!result.rows.length) throw validationError("Аккаунт не найден", 404);
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505" && error.constraint === "idx_users_email_lower_unique") {
      throw validationError("Этот email уже зарегистрирован");
    }
    if (error.code === "23505" && error.constraint === "users_phone_key") {
      throw validationError("Этот телефон уже зарегистрирован");
    }
    if (error.code === "23505" && error.constraint === "idx_users_full_name_lower_unique") {
      throw validationError("Это имя уже используется");
    }
    throw error;
  }
}

async function createPasswordReset(email, codeHash, expiresAt) {
  const normalizedEmail = normalizeEmail(email);
  if (!validEmail(normalizedEmail)) throw validationError("Введите корректный email");
  const result = await query(
    `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, attempts)
     SELECT id, $2, $3, 0 FROM users WHERE LOWER(email) = $1
     ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
           attempts = 0, created_at = NOW()
     RETURNING user_id`,
    [normalizedEmail, codeHash, expiresAt]
  );
  return result.rows.length > 0;
}

async function deletePasswordReset(email) {
  await query(
    `DELETE FROM password_reset_codes r
      USING users u
      WHERE r.user_id = u.id AND LOWER(u.email) = $1`,
    [normalizeEmail(email)]
  );
}

async function resetPassword(email, codeHash, newPassword) {
  const normalizedEmail = normalizeEmail(email);
  const password = String(newPassword || "");
  if (!validEmail(normalizedEmail)) throw validationError("Введите корректный email");
  if (!validPassword(password)) throw validationError("Пароль должен содержать 8 символов, заглавную и строчную букву и цифру");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT r.user_id, r.code_hash, r.expires_at, r.attempts
         FROM password_reset_codes r
         JOIN users u ON u.id = r.user_id
        WHERE LOWER(u.email) = $1
        FOR UPDATE OF r`,
      [normalizedEmail]
    );
    const reset = result.rows[0];
    if (!reset) {
      await client.query("COMMIT");
      return false;
    }
    if (new Date(reset.expires_at).getTime() <= Date.now() || reset.attempts >= 5) {
      await client.query("DELETE FROM password_reset_codes WHERE user_id = $1", [reset.user_id]);
      await client.query("COMMIT");
      return false;
    }
    const storedCodeHash = Buffer.from(reset.code_hash, "hex");
    const submittedCodeHash = Buffer.from(codeHash, "hex");
    const codeMatches = storedCodeHash.length === submittedCodeHash.length &&
      crypto.timingSafeEqual(storedCodeHash, submittedCodeHash);
    if (!codeMatches) {
      const attempts = reset.attempts + 1;
      if (attempts >= 5) {
        await client.query("DELETE FROM password_reset_codes WHERE user_id = $1", [reset.user_id]);
      } else {
        await client.query("UPDATE password_reset_codes SET attempts = $1 WHERE user_id = $2", [attempts, reset.user_id]);
      }
      await client.query("COMMIT");
      return false;
    }

    const passwordHash = await hashPassword(password);
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, reset.user_id]);
    await client.query("DELETE FROM password_reset_codes WHERE user_id = $1", [reset.user_id]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [reset.user_id]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) {
    const [, salt, hash] = stored.split("$");
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const actual = await scrypt(String(password), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
  const legacy = crypto.createHash("sha256").update(String(password)).digest("hex");
  const expected = Buffer.from(stored, "hex");
  const actual = Buffer.from(legacy, "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
  await query("UPDATE users SET password_hash = $1 WHERE password_hash = $2", [await hashPassword(password), stored]);
  return true;
}

async function getOrders(userId, phone) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedUserId = Number(userId);
  if (!Number.isSafeInteger(normalizedUserId) || normalizedUserId < 1 ||
      normalizedPhone.length !== 11 || !normalizedPhone.startsWith("7")) {
    throw validationError("Введите корректный номер Казахстана");
  }
  const result = await query(
    `SELECT o.id, o.total_amount, o.status, o.created_at, o.address, o.comment,
      COALESCE(json_agg(json_build_object('name', p.name, 'quantity', oi.quantity, 'grams', oi.grams, 'isNegotiable', oi.is_negotiable)) FILTER (WHERE p.id IS NOT NULL), '[]') AS items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = $1 OR (o.user_id IS NULL AND o.phone = $2)
     GROUP BY o.id ORDER BY o.created_at DESC`,
    [normalizedUserId, normalizedPhone]
  );
  return result.rows;
}

async function getAdminOrders() {
  const result = await query(`
    SELECT o.id, o.customer_name AS "customerName", o.email, o.phone, o.address, o.comment,
      o.status, o.total_amount AS total, o.created_at AS "createdAt",
      COALESCE(
        json_agg(json_build_object(
          'name', p.name,
          'imageUrl', p.image_url,
          'quantity', oi.quantity,
          'grams', oi.grams,
          'price', oi.price_snapshot,
          'isNegotiable', oi.is_negotiable
        )) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    GROUP BY o.id
    ORDER BY o.created_at DESC;
  `);
  return result.rows;
}

async function storeSession(tokenHash, userId, expiresAt) {
  await query("DELETE FROM sessions WHERE expires_at <= NOW()");
  await query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [tokenHash, userId, expiresAt]
  );
}

async function getSessionUser(tokenHash) {
  const result = await query(`
    SELECT u.id, u.full_name AS name, u.email, u.phone, u.address, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > NOW()
    LIMIT 1;
  `, [tokenHash]);
  return result.rows[0] || null;
}

async function deleteSession(tokenHash) {
  await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

async function getAdminUsers() {
  const result = await query(`
    SELECT id, full_name AS name, email, phone, address, role, created_at AS "createdAt"
    FROM users
    ORDER BY created_at DESC;
  `);
  return result.rows;
}

async function updateOrderStatus(orderId, status) {
  const id = Number(orderId);
  const allowedStatuses = ["new", "confirmed", "completed", "cancelled"];
  if (!Number.isSafeInteger(id) || id < 1) throw validationError("Некорректный номер заказа");
  if (!allowedStatuses.includes(status)) throw validationError("Недопустимый статус заказа");
  const result = await query(
    "UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status",
    [status, id]
  );
  if (!result.rows.length) {
    const error = new Error("Заказ не найден");
    error.statusCode = 404;
    throw error;
  }
  return result.rows[0];
}

module.exports = {
  initDatabase,
  getProducts,
  createOrder,
  registerUser,
  loginUser,
  updateProfile,
  createPasswordReset,
  deletePasswordReset,
  resetPassword,
  getOrders,
  getAdminOrders,
  getAdminUsers,
  updateOrderStatus,
  storeSession,
  getSessionUser,
  deleteSession,
  query
};
