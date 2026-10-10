const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("database schema supports protected admin accounts and persistent sessions", () => {
  const schema = read("database/schema.sql");
  assert.match(schema, /role VARCHAR\(20\) NOT NULL DEFAULT 'customer'/);
  assert.match(schema, /ALTER TABLE users ALTER COLUMN phone DROP NOT NULL/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS sessions/);
  assert.match(schema, /idx_sessions_expires_at/);
});

test("seed catalog has 31 products and every local product photo exists", () => {
  const seed = read("database/seed.sql");
  const products = seed.match(/^\s+\(\(SELECT id FROM categories/gm) || [];
  const imagePaths = [...seed.matchAll(/'\.(\/images\/[^']+)'/g)].map((match) => match[1].split("?")[0]);

  assert.equal(products.length, 31);
  assert.equal(imagePaths.length, products.length);
  imagePaths.forEach((imagePath) => {
    assert.ok(fs.existsSync(path.join(root, "public", imagePath.slice(1))), `Missing image: ${imagePath}`);
  });
});

test("customer-provided photos are mapped to the requested catalog products", () => {
  const seed = read("database/seed.sql");
  const app = read("public/app.js");
  const imageFiles = [
    "pink-salmon-caviar-500g-customer.png",
    "pink-salmon-caviar-250g-customer.png",
    "salmon-smoked-cut-customer.png",
    "escolar-smoked-pack-customer.png",
    "salmon-smoked-slab-customer.png",
    "trout-lightly-salted-customer.png",
    "escolar-smoked-slab-customer.png",
    "elite-shrimp-customer-20261010.png",
    "eel-hot-smoked-customer-20261009.png",
    "beer-snack-customer-20261009.png",
    "salmon-steaks-customer-20261009.png",
    "salmon-half-customer-20261009.png",
    "salmon-size-5-6-customer-20261009.png",
    "salmon-size-6-7-customer-20261009.png",
    "salmon-size-7-8-customer-20261009.png",
    "sea-trout-size-5-6-customer-20261009.png",
    "rainbow-trout-customer-20261010.png",
    "seabass-gutted-customer-20261010.png",
    "seabass-by-weight-customer-20261010.png",
    "squid-fillet-customer-20261010.png",
    "gilthead-bream-by-weight-customer-20261010.png",
    "trout-steaks-customer-20261010.png",
    "elite-peeled-shrimp-customer-20261010.png",
    "smoked-tuna-customer-20261010.png",
    "sea-perch-small-customer-20261010.png",
    "tuna-fillet-customer-20261010.png",
    "trout-whole-customer-20261009.png",
    "trout-half-customer-20261009.png",
    "zander-fillet-glazed-customer-20261009.png",
    "zander-fillet-un-glazed-customer-20261009.png"
  ];
  imageFiles.forEach((file) => {
    assert.ok(fs.existsSync(path.join(root, "public", "images", file)), `Missing supplied photo: ${file}`);
    assert.ok(seed.includes(`./images/${file}`), `Seed catalog does not use: ${file}`);
    assert.ok(app.includes(`./images/${file}`), `Fallback catalog does not use: ${file}`);
  });
});

test("Kazakh UI uses a consistent font with extended Cyrillic glyph support", () => {
  const html = read("public/index.html");
  const styles = read("public/styles.css");
  assert.match(html, /family=Noto\+Sans/);
  assert.doesNotMatch(html, /family=DM\+Sans|family=Playfair\+Display/);
  assert.match(styles, /font-family:\s*"Noto Sans", Arial, sans-serif !important/);
  assert.doesNotMatch(styles, /font-family:\s*"DM Sans"|font-family:\s*"Playfair Display"/);
});

test("mobile menu and admin dashboard controls are present", () => {
  const html = read("public/index.html");
  assert.match(html, /id="mobileMenuToggle"[^>]+aria-expanded="false"/);
  assert.match(html, /id="headerNavigation"/);
  assert.match(html, /id="adminOrdersBody"/);
  assert.match(html, /id="adminUsersBody"/);
});

test("catalog categories are displayed only in the left sidebar", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  assert.match(html, /<aside class="filters">[\s\S]*id="categoryFilters"/);
  assert.doesNotMatch(html, /id="categoryGrid"|class="category-grid"/);
  assert.doesNotMatch(app, /byId\("categoryGrid"\)|category-card glow-card/);
});

test("favorites are accessible, persistent, and filterable", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  const enhancements = read("public/app-enhancements.js");
  assert.match(html, /id="favoritesToggle"[^>]+aria-pressed="false"/);
  assert.match(app, /localStorage\.setItem\("balyk-favorites"/);
  assert.match(app, /state\.favoritesOnly \|\| state\.favorites\.includes\(product\.id\)/);
  assert.match(enhancements, /aria-label", t\(active \? "favoriteRemove" : "favoriteAdd"\)/);
  assert.match(enhancements, /state\.favorites = state\.favorites\.includes\(product\.id\)/);
});

test("product-card shine loops across the full card and respects reduced-motion preference", () => {
  const styles = read("public/styles.css");
  const html = read("public/index.html");
  assert.match(styles, /@keyframes product-card-shine/);
  assert.match(styles, /\.product-card::after\s*\{[^}]*width:\s*45%;[^}]*animation:\s*product-card-shine\s+6s\s+ease-in-out\s+infinite/s);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.product-card::after\s*\{\s*animation:\s*none;/);
  assert.match(styles, /@media \(min-width:\s*1101px\) and \(max-width:\s*1360px\)\s*\{[\s\S]*\.topbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(210px,\s*260px\)\s*minmax\(0,\s*1fr\)/);
  assert.match(html, /styles\.css\?v=20261010-profile-reset2/);
});

test("Kazakh portion choices remain legible when hovered or selected", () => {
  const styles = read("public/styles.css");
  const logo = read("public/logo.svg");
  assert.match(styles, /\.portion-picker button\.active,\s*\.portion-picker button\.active:hover/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(logo, /<svg[^>]+viewBox="0 0 128 128"/);
});

test("authenticated users without a phone get an empty personal order history", () => {
  const server = read("server.js");
  assert.match(server, /if \(!session\) \{\s+sendJson\(res, 401, \{ error: "Войдите в аккаунт, чтобы видеть историю заказов" \}\);/);
  assert.match(server, /if \(!session\.id \|\| !session\.phone\) \{\s+sendJson\(res, 200, \{ orders: \[\] \}\);/);
});

test("signed-in checkout uses account identity, structured delivery details, and links orders to the account", () => {
  const html = read("public/index.html");
  const app = read("public/app-enhancements.js");
  const server = read("server.js");
  const database = read("db.js");
  const schema = read("database/schema.sql");
  assert.match(html, /id="checkoutContactFields"/);
  assert.match(html, /name="city"/);
  assert.match(html, /name="district"/);
  assert.match(html, /name="street"/);
  assert.match(html, /name="house"/);
  assert.match(html, /name="apartment"/);
  assert.match(html, /name="comment"/);
  assert.match(app, /const signedIn = Boolean\(state\.profile\?\.id\)/);
  assert.match(app, /const payload = \{ address, comment: data\.comment\.trim\(\), items: state\.cart \}/);
  assert.match(app, /loadOrders = async function/);
  assert.match(server, /createOrder\(payload, session\)/);
  assert.match(server, /getOrders\(session\.id, session\.phone\)/);
  assert.match(database, /INSERT INTO orders \(user_id, customer_name, email, phone, address, comment, total_amount\)/);
  assert.match(database, /o\.user_id = \$1 OR \(o\.user_id IS NULL AND o\.phone = \$2\)/);
  assert.match(schema, /ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users\(id\)/);
  assert.match(html, /href="tel:\+77172548253"/);
  assert.match(html, /\+7 \(7172\) 54-82-53/);
});

test("phone fields do not auto-insert a country code and accept complete Kazakhstan numbers", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  const enhancements = read("public/app-enhancements.js");
  const database = read("db.js");
  assert.doesNotMatch(html, /placeholder="\+7/);
  assert.doesNotMatch(app, /input\[name="phone"\]\)\.oninput/);
  assert.doesNotMatch(enhancements, /formatPhoneInput|input\.oninput = \(\) => formatPhoneInput/);
  assert.match(app, /phone\.length === 10 \? `7\$\{phone\}`/);
  for (const source of [enhancements, database]) {
    assert.match(source, /digits\.length === 10\) digits = `7\$\{digits\}`/);
    assert.match(source, /digits\.length === 11 && digits\.startsWith\("8"\)/);
  }
});

test("registration validates email and Kazakhstan phone input on both client and server", () => {
  const html = read("public/index.html");
  const enhancements = read("public/app-enhancements.js");
  const database = read("db.js");
  assert.equal((html.match(/name="email" type="email"[^>]*maxlength="254"/g) || []).length, 4);
  assert.equal((html.match(/name="phone" type="tel"[^>]*maxlength="18"/g) || []).length, 3);
  assert.match(enhancements, /function sanitizePhoneInput\(input\)[\s\S]*replace\(\/\\D\/g, ""\)\.slice\(0, 11\)/);
  assert.match(enhancements, /function validKzPhone\(value\)[\s\S]*input\.startsWith\("\+"\)[\s\S]*digits\.length === 10/);
  assert.match(enhancements, /function validEmail\(value\)[\s\S]*\@\(\?:\[A-Z0-9\]/);
  assert.match(database, /function validKzPhone\(value\)[\s\S]*input\.startsWith\("\+"\)[\s\S]*digits\.length === 10/);
  assert.match(database, /function validEmail\(value\)[\s\S]*\@\(\?:\[A-Z0-9\]/);
  assert.match(database, /if \(!validKzPhone\(payload\.phone\)\)/);
});

test("password reset stores expiring, single-use hashed codes and invalidates old sessions", () => {
  const schema = read("database/schema.sql");
  const server = read("server.js");
  const database = read("db.js");
  const envExample = read(".env.example");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS password_reset_codes[\s\S]*code_hash CHAR\(64\)[\s\S]*expires_at TIMESTAMPTZ[\s\S]*attempts INTEGER NOT NULL DEFAULT 0/);
  assert.match(server, /password-reset\/request/);
  assert.match(server, /password-reset\/confirm/);
  assert.match(server, /createHmac\("sha256", process\.env\.PASSWORD_RESET_SECRET\)/);
  assert.match(server, /Date\.now\(\) \+ 10 \* 60_000/);
  assert.match(server, /hitBucket\(`password-reset:\$\{email\}`, 3, authWindowMs\)/);
  assert.match(database, /attempts >= 5/);
  assert.match(database, /crypto\.timingSafeEqual\(storedCodeHash, submittedCodeHash\)/);
  assert.match(database, /DELETE FROM sessions WHERE user_id = \$1/);
  assert.match(database, /DELETE FROM password_reset_codes WHERE user_id = \$1/);
  assert.match(envExample, /^SMTP_HOST=$/m);
  assert.match(envExample, /^SMTP_PASSWORD=$/m);
  assert.match(envExample, /^PASSWORD_RESET_SECRET=$/m);
});

test("profile editing is authenticated and verifies the current password before saving", () => {
  const html = read("public/index.html");
  const server = read("server.js");
  const database = read("db.js");
  const enhancements = read("public/app-enhancements.js");
  assert.match(html, /id="editProfileButton"/);
  assert.match(html, /id="profileEditForm"/);
  assert.match(html, /name="currentPassword" type="password" autocomplete="current-password" required/);
  assert.match(server, /url\.pathname === "\/api\/auth\/profile" && req\.method === "POST"[\s\S]*if \(!session\)/);
  assert.match(server, /updateProfile\(session\.id, await readBody\(req\)\)/);
  assert.match(database, /verifyPassword\(currentPassword, storedPassword\)/);
  assert.match(database, /Введите корректный email/);
  assert.match(database, /validKzPhone\(phoneInput\)/);
  assert.match(enhancements, /body: JSON\.stringify\(\{[\s\S]*currentPassword: data\.currentPassword/);
  assert.match(enhancements, /passwordResetForm/);
});

test("personal order history shows translated status and line items and refreshes after checkout", () => {
  const html = read("public/index.html");
  const enhancements = read("public/app-enhancements.js");
  const styles = read("public/styles.css");
  assert.match(html, /id="ordersList" aria-live="polite" aria-busy="false"/);
  assert.match(enhancements, /let ordersRequestId = 0/);
  assert.match(enhancements, /if \(requestId !== ordersRequestId\) return/);
  assert.match(enhancements, /className = "order-row-head"/);
  assert.match(enhancements, /className = `order-status status-/);
  assert.match(enhancements, /className = "order-items"/);
  assert.match(enhancements, /await loadOrders\(\);[\s\S]*alert\(/);
  assert.match(styles, /\.order-status\.status-new/);
  assert.match(styles, /\.order-items li/);
  assert.match(styles, /\.orders-error/);
});

test("admin credentials are documented as environment-only secrets", () => {
  const envExample = read(".env.example");
  const readme = read("README.md");
  assert.match(envExample, /^ADMIN_EMAIL=$/m);
  assert.match(envExample, /^ADMIN_PASSWORD=$/m);
  assert.match(readme, /секретах окружения/);
  assert.match(readme, /не добавлен в коммит/);
});

test("production deployment uses non-root Node, private PostgreSQL, HTTPS, and required secrets", () => {
  const dockerfile = read("Dockerfile");
  const compose = read("docker-compose.yml");
  const caddy = read("Caddyfile");
  const ignore = read(".dockerignore");
  const envExample = read(".env.example");
  const readme = read("README.md");
  const server = read("server.js");
  assert.match(dockerfile, /FROM node:24-alpine/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /postgres_data:\/var\/lib\/postgresql\/data/);
  const appService = compose.match(/  app:[\s\S]*?(?=\n  db:)/)?.[0] || "";
  const databaseService = compose.match(/  db:[\s\S]*?(?=\n  caddy:)/)?.[0] || "";
  assert.ok(appService, "Compose must define the app service");
  assert.ok(databaseService, "Compose must define the database service");
  assert.doesNotMatch(appService, /^\s+ports:/m);
  assert.doesNotMatch(databaseService, /^\s+ports:/m);
  assert.match(compose, /PGUSER: \$\{PGUSER/);
  assert.match(compose, /POSTGRES_USER: \$\{POSTGRES_USER/);
  assert.match(compose, /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD/);
  assert.match(compose, /ADMIN_PASSWORD: \$\{ADMIN_PASSWORD/);
  assert.match(compose, /80:80/);
  assert.match(compose, /443:443/);
  assert.match(caddy, /reverse_proxy app:3000/);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(envExample, /^SITE_ADDRESS=$/m);
  assert.match(server, /Production startup requires ADMIN_EMAIL and ADMIN_PASSWORD/);
  assert.match(server, /Production startup requires a working PostgreSQL connection/);
  assert.match(server, /TRUST_PROXY === "true"/);
  assert.match(readme, /docker compose up -d --build/);
  assert.match(readme, /docker compose down --volumes/);
});
