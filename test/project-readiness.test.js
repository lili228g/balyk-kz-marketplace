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

test("catalog descriptions cover all 31 source products with matching variants", () => {
  const seed = read("database/seed.sql");
  const descriptionUpdates = seed.match(/UPDATE products AS product[\s\S]*?WHERE product\.name = catalog\.name;/)?.[0] || "";
  const updatedProducts = descriptionUpdates.match(/^\s+\('/gm) || [];

  assert.equal(updatedProducts.length, 31);
  assert.match(descriptionUpdates, /'Филе судака без глазури'/);
  assert.match(descriptionUpdates, /'Филе судака'/);
  assert.match(descriptionUpdates, /'Окунь морской 0,3–0,5 кг'/);
  assert.match(descriptionUpdates, /'Тунец холодного копчения'/);
});

test("checkout enforces the 15,000 tenge minimum and product details open at the top on mobile", () => {
  const html = read("public/index.html");
  const app = read("public/app-enhancements.js");
  const database = read("db.js");
  const styles = read("public/styles.css");

  assert.match(html, /id="minimumOrderNotice"/);
  assert.match(app, /checkoutButton\.disabled = total < 15000/);
  assert.match(app, /if \(cartTotal\(\) < 15000\)/);
  assert.match(app, /minimumOrderNotice: "Минимальная сумма заказа — 15 000 ₸/);
  assert.match(database, /if \(total < 15000\) throw validationError\("Минимальная сумма заказа — 15 000 ₸"\)/);
  assert.match(app, /window\.scrollTo\(0,\s*Math\.max\(0,\s*window\.scrollY \+ productView\.getBoundingClientRect\(\)\.top - 132\)\)/);
  assert.match(styles, /\.page-head \.back-link:hover\s*\{[^}]*transform:\s*none/s);
  assert.match(styles, /#view-product\s*\{\s*scroll-margin-top:\s*132px/s);
});

test("hero catalog button scrolls directly to the products section", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");

  assert.match(html, /<a class="primary-link" href="#catalog" data-i18n="goCatalog">/);
  assert.match(html, /<section class="catalog-layout" id="productCatalog">/);
  assert.match(app, /querySelector\('\[data-i18n="goCatalog"\]'\)\?\.addEventListener\("click", \(event\) => \{[\s\S]*event\.preventDefault\(\);[\s\S]*byId\("productCatalog"\)\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});

test("customer-provided photos are mapped to the requested catalog products", () => {
  const seed = read("database/seed.sql");
  const app = read("public/app.js");
  const imageFiles = [
    "pink-salmon-caviar-500g-customer.png",
    "pink-salmon-caviar-250g-customer.png",
    "salmon-smoked-cut-customer.png",
    "smoked-salmon-slab-customer-20261018.png",
    "escolar-smoked-pack-customer.png",
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
    "sea-trout-customer-20261018.png",
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
  assert.match(styles, /@media \(min-width:\s*1101px\) and \(max-width:\s*1360px\)\s*\{[\s\S]*\.topbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(190px,\s*240px\)\s*minmax\(140px,\s*1fr\)\s*auto\s*auto/);
  assert.match(html, /styles\.css\?v=20261018-css-utf8-pill1/);
});

test("mobile header keeps the cart visible and links WhatsApp to the requested chat", () => {
  const html = read("public/index.html");
  const styles = read("public/styles.css");
  const enhancements = read("public/app-enhancements.js");
  assert.match(html, /class="mobile-cart-link" href="#cart" data-view-link="cart"/);
  assert.match(html, /id="mobileCartCount"/);
  assert.match(html, /<a class="mobile-social-icon" href="https:\/\/www\.instagram\.com\/balyk\.kz01\/" aria-label="Instagram" title="Открыть Instagram" target="_blank" rel="noopener noreferrer">/);
  assert.match(html, /<a class="mobile-social-icon" href="https:\/\/wa\.me\/77765208514" aria-label="WhatsApp" title="Открыть чат WhatsApp" target="_blank" rel="noopener noreferrer">/);
  assert.match(styles, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.topbar > \.mobile-quick-actions\s*\{[\s\S]*display:\s*flex/);
  assert.match(styles, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.topbar \.mobile-cart-link,\s*\.topbar \.mobile-menu-toggle\s*\{\s*display:\s*grid/);
  assert.match(enhancements, /byId\("mobileCartCount"\)\.textContent = cartCount/);
});

test("Kazakh portion choices remain legible when hovered or selected", () => {
  const styles = read("public/styles.css");
  const html = read("public/index.html");
  assert.match(styles, /\.portion-picker button\.active,\s*\.portion-picker button\.active:hover/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(html, /src="\.\/images\/balyk-logo-customer\.png\?v=20261012-transparent" alt="Логотип Балык\.kz"/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "balyk-logo-customer.png")));
});

test("mobile navigation has visible button surfaces and a compact inline language selector", () => {
  const html = read("public/index.html");
  const styles = read("public/styles.css");
  const app = read("public/app.js");
  assert.ok(html.indexOf('class="mobile-cart-link"') < html.indexOf('id="mobileMenuToggle"'));
  assert.match(styles, /\.topbar \.header-actions\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.topbar \.header-actions > a,\s*\.topbar \.header-actions \.logout-button\s*\{[^}]*border:\s*1px solid/s);
  assert.match(styles, /\.topbar \.language-options\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styles, /@media \(max-width:\s*380px\)\s*\{[\s\S]*\.topbar \.mobile-social-links\s*\{\s*display:\s*flex/s);
  assert.match(styles, /@media \(max-width:\s*380px\)\s*\{[\s\S]*\.hero h1\s*\{\s*font-size:\s*clamp\(29px,\s*9vw,\s*34px\)/s);
  assert.match(styles, /@keyframes slideProduct \{ from \{ opacity: 0; transform: translateY\(18px\); \} to \{ opacity: 1; transform: translateY\(0\); \} \}/);
  assert.match(styles, /\.service-strip::before\s*\{[^}]*content:\s*"\\0412\\0430\\0436\\043D\\044B\\0435\\000020\\0443\\0441\\043B\\043E\\0432\\0438\\044F\\000020\\0437\\0430\\043A\\0430\\0437\\0430"/s);
  assert.match(html, /styles\.css\?v=20261018-css-utf8-pill1/);
  assert.match(html, /app\.js\?v=20261018-catalog-scroll1/);
  assert.match(app, /byId\("languageCurrent"\)\.setAttribute\("aria-label", language\.querySelector\("span"\)\.textContent\)/);
});

test("seafood package images use supplied photos and catalog prices omit the 'from' prefix", () => {
  const html = read("public/index.html");
  const enhancements = read("public/app-enhancements.js");
  const seed = read("database/seed.sql");

  assert.ok(fs.existsSync(path.join(root, "public", "images", "pink-salmon-caviar-500g-customer.png")));
  assert.ok(fs.existsSync(path.join(root, "public", "images", "pink-salmon-caviar-250g-customer.png")));
  assert.ok(fs.existsSync(path.join(root, "public", "images", "salmon-smoked-cut-customer.png")));
  assert.match(seed, /'Икра горбуши 0\.5 кг'[\s\S]*?'\.\/images\/pink-salmon-caviar-500g-customer\.png'/);
  assert.match(enhancements, /product\.name === "Икра горбуши 0\.5 кг"[\s\S]*?pink-salmon-caviar-500g-customer\.png\?v=20261017-caviar3/);
  assert.match(seed, /'Икра горбуши 250 г'[\s\S]*?'\.\/images\/pink-salmon-caviar-250g-customer\.png'/);
  assert.match(enhancements, /product\.name === "Икра горбуши 250 г"[\s\S]*?pink-salmon-caviar-250g-customer\.png\?v=20261017-caviar2/);
  assert.match(seed, /'Сёмга Х\/К'[\s\S]*?'\.\/images\/salmon-smoked-cut-customer\.png'/);
  assert.match(enhancements, /product\.name === "Сёмга Х\/К"[\s\S]*?salmon-smoked-cut-customer\.png\?v=20261017-salmon1/);
  assert.match(seed, /'Эсколар Х\/К'[\s\S]*?'\.\/images\/escolar-smoked-pack-customer\.png'/);
  assert.match(enhancements, /product\.name === "Эсколар Х\/К"[\s\S]*?escolar-smoked-pack-customer\.png\?v=20261017-escolar1/);
  assert.match(seed, /'Эсколар Х\/К пласт'[\s\S]*?'\.\/images\/escolar-smoked-slab-customer\.png'/);
  assert.match(enhancements, /product\.name === "Эсколар Х\/К пласт"[\s\S]*?escolar-smoked-slab-customer\.png\?v=20261017-escolar-slab1/);
  assert.match(seed, /'Форель слабосолёная'[\s\S]*?'\.\/images\/trout-lightly-salted-customer\.png'/);
  assert.match(enhancements, /product\.name === "Форель слабосолёная"[\s\S]*?trout-lightly-salted-customer\.png\?v=20261017-trout1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "zander-fillet-shared-customer.png")));
  assert.match(enhancements, /filter\(\(product\) => product\.name === "Филе судака" \|\| product\.name === "Филе судака без глазури"\)[\s\S]*?zander-fillet-shared-customer\.png\?v=20261017-zander1/);
  assert.match(seed, /'Креветки Elit'[\s\S]*?'\.\/images\/elite-shrimp-customer-20261010\.png\?v=20261010-photo1'/);
  assert.match(enhancements, /product\.name === "Креветки Elit"[\s\S]*?shrimp-elit-customer-20261009\.png\?v=20261017-elit-shrimp1/);
  assert.match(seed, /'Креветки очищенные Elit'[\s\S]*?'\.\/images\/elite-peeled-shrimp-customer-20261010\.png\?v=20261010-photo1'/);
  assert.match(enhancements, /product\.name === "Креветки очищенные Elit"[\s\S]*?elite-peeled-shrimp-customer-20261010\.png\?v=20261017-peeled-elite-shrimp1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "gilthead-bream-by-weight-customer-20261017.png")));
  assert.match(seed, /'Дорада развесная'[\s\S]*?gilthead-bream-by-weight-customer-20261010\.png/);
  assert.match(enhancements, /product\.name === "Дорада развесная"[\s\S]*?gilthead-bream-by-weight-customer-20261017\.png\?v=20261017-gilthead-bream-weighted1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "trout-steaks-customer-20261017.png")));
  assert.match(seed, /'Форель стейки'[\s\S]*?trout-steaks-customer-20261010\.png/);
  assert.match(enhancements, /product\.name === "Форель стейки"[\s\S]*?trout-steaks-customer-20261017\.png\?v=20261017-trout-steaks1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "smoked-tuna-customer-20261017.png")));
  assert.match(seed, /'Тунец холодного копчения'[\s\S]*?smoked-tuna-customer-20261010\.png/);
  assert.match(enhancements, /product\.name === "Тунец холодного копчения"[\s\S]*?smoked-tuna-customer-20261017\.png\?v=20261017-smoked-tuna1/);
  assert.match(seed, /'Сёмга стейки'[\s\S]*?'\.\/images\/salmon-steaks-customer-20261009\.png'/);
  assert.match(enhancements, /product\.name === "Сёмга стейки"[\s\S]*?salmon-steaks-customer-20261009\.png\?v=20261017-salmon-steaks1/);
  assert.match(seed, /'Сёмга пласт'[\s\S]*?'\.\/images\/salmon-half-customer-20261009\.png'/);
  assert.match(enhancements, /product\.name === "Сёмга пласт"[\s\S]*?salmon-half-customer-20261009\.png\?v=20261017-frozen-salmon-slab1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "salmon-whole-sizes-customer.png")));
  assert.match(enhancements, /filter\(\(product\) => \["Сёмга размер 5–6 кг", "Сёмга размер 6–7 кг", "Сёмга размер 7–8 кг"\]\.includes\(product\.name\)\)[\s\S]*?salmon-whole-sizes-customer\.png\?v=20261017-salmon-whole-sizes1/);
  assert.match(seed, /'Форель морская 5–6 кг'[\s\S]*?'\.\/images\/sea-trout-customer-20261018\.png'/);
  assert.match(enhancements, /product\.name === "Форель морская 5–6 кг"[\s\S]*?sea-trout-customer-20261018\.png\?v=20261018-sea-trout2/);
  assert.match(seed, /'Форель пласт'[\s\S]*?'\.\/images\/trout-half-customer-20261009\.png'/);
  assert.match(enhancements, /product\.name === "Форель пласт"[\s\S]*?trout-half-customer-20261009\.png\?v=20261017-frozen-trout-slab1/);
  assert.match(seed, /'Форель целая'[\s\S]*?'\.\/images\/trout-whole-customer-20261009\.png'/);
  assert.match(enhancements, /product\.name === "Форель целая"[\s\S]*?trout-whole-customer-20261009\.png\?v=20261017-whole-trout1/);
  assert.match(seed, /'Форель радужная'[\s\S]*?'\.\/images\/rainbow-trout-customer-20261010\.png\?v=20261010-photo1'/);
  assert.match(enhancements, /product\.name === "Форель радужная"[\s\S]*?rainbow-trout-customer-20261010\.png\?v=20261017-rainbow-trout1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "sea-perch-shared-customer.png")));
  assert.match(enhancements, /filter\(\(product\) => product\.name === "Окунь морской" \|\| product\.name === "Окунь морской 0,3–0,5 кг"\)[\s\S]*?sea-perch-shared-customer\.png\?v=20261017-sea-perch-shared1/);
  assert.match(html, /app-enhancements\.js\?v=20261018-sea-trout2/);
  assert.match(html, /app\.js\?v=20261018-catalog-scroll1/);
  assert.match(seed, /'Сёмга Х\/К пласт'[\s\S]*?'\.\/images\/smoked-salmon-slab-customer-20261018\.png'/);
  assert.match(enhancements, /product\.name === "Сёмга Х\/К пласт"[\s\S]*?smoked-salmon-slab-customer-20261018\.png\?v=20261018-salmon-slab2/);
  assert.match(seed, /'Сёмга Х\/К'[\s\S]*?'\.\/images\/salmon-smoked-cut-customer\.png'/);
  assert.match(seed, /'Сёмга пласт'[\s\S]*?'\.\/images\/salmon-half-customer-20261009\.png'/);
  assert.match(seed, /'Форель морская 5–6 кг'[\s\S]*?'\.\/images\/sea-trout-customer-20261018\.png'/);
  assert.match(seed, /'Форель целая'[\s\S]*?'\.\/images\/trout-whole-customer-20261009\.png'/);
  assert.match(seed, /'Тунец филе'[\s\S]*?'\.\/images\/tuna-fillet-customer-20261010\.png\?v=20261010-photo1'/);
  assert.match(enhancements, /product\.name === "Тунец филе"[\s\S]*?tuna-fillet-customer-20261010\.png\?v=20261017-tuna-fillet1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "seabass-gutted-customer-20261010.png")));
  assert.match(seed, /'Сибас'[\s\S]*?'\.\/images\/seabass-gutted-customer-20261010\.png\?v=20261010-photo1'/);
  assert.match(enhancements, /product\.name === "Сибас"[\s\S]*?seabass-gutted-customer-20261010\.png\?v=20261017-seabass-gutted1/);
  assert.match(seed, /'Сибас развесной'[\s\S]*?'\.\/images\/seabass-by-weight-customer-20261010\.png\?v=20261010-photo1'/);
  assert.match(enhancements, /product\.name === "Сибас развесной"[\s\S]*?seabass-by-weight-customer-20261010\.png\?v=20261017-seabass-weighted1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "squid-fillet-customer-20261010.png")));
  assert.match(seed, /'Филе кальмара'[\s\S]*?'\.\/images\/squid-fillet-customer-20261010\.png\?v=20261010-photo2'/);
  assert.match(enhancements, /product\.name === "Филе кальмара"[\s\S]*?squid-fillet-customer-20261010\.png\?v=20261017-squid-fillet1/);
  assert.ok(fs.existsSync(path.join(root, "public", "images", "beer-snack-customer-20261009.png")));
  assert.match(seed, /'Пивной набор'[\s\S]*?'\.\/images\/beer-snack-customer-20261009\.png'/);
  assert.match(enhancements, /product\.name === "Пивной набор"[\s\S]*?beer-snack-customer-20261009\.png\?v=20261017-beer-snack1/);
  assert.match(enhancements, /product\?\.name === "Икра горбуши 0\.5 кг"[\s\S]*?backgroundPosition = "center 78%"/);
  assert.match(enhancements, /card\.querySelector\("\.price-row strong"\)\.textContent = formatPrice\(product\.price\)/);
  assert.match(html, /app-enhancements\.js\?v=20261018-sea-trout2/);
  assert.match(enhancements, /product\?\.name === "Филе судака" \|\| product\?\.name === "Филе судака без глазури"[\s\S]*?backgroundPosition = "center 78%"/);
});

test("search stays in the desktop header row and large social controls remain visible at every width", () => {
  const html = read("public/index.html");
  const styles = read("public/styles.css");
  assert.match(styles, /grid-template-columns:\s*minmax\(220px,\s*300px\)\s*minmax\(180px,\s*1fr\)\s*auto\s*auto/);
  assert.match(styles, /\.topbar\s*\{\s*grid-template-columns:\s*minmax\(220px,\s*300px\)\s*minmax\(180px,\s*1fr\)\s*auto\s*auto/s);
  assert.match(styles, /@media \(min-width:\s*1101px\) and \(max-width:\s*1360px\)\s*\{[\s\S]*grid-template-columns:\s*minmax\(190px,\s*240px\)\s*minmax\(140px,\s*1fr\)\s*auto\s*auto;[\s\S]*\.topbar > \.header-actions\s*\{[^}]*flex-wrap:\s*nowrap/s);
  assert.match(styles, /@media \(min-width:\s*761px\) and \(max-width:\s*1100px\)\s*\{[\s\S]*grid-template-areas:[\s\S]*"navigation quick \.";[\s\S]*\.topbar > \.header-actions\s*\{[^}]*width:\s*max-content/s);
  assert.match(styles, /@media \(min-width:\s*761px\) and \(max-width:\s*1100px\)\s*\{[\s\S]*\.topbar > \.mobile-quick-actions\s*\{\s*grid-area:\s*quick;[\s\S]*justify-content:\s*flex-start/s);
  assert.match(styles, /\.mobile-social-icon\s*\{[^}]*width:\s*46px;[^}]*height:\s*46px/s);
  assert.match(html, /id="mobileMenuToggle"/);
  assert.match(styles, /@media \(max-width:\s*380px\)\s*\{[\s\S]*\.topbar \.mobile-social-links\s*\{\s*display:\s*flex/s);
  assert.match(html, /mobile-social-icon" href="https:\/\/www\.instagram\.com\/balyk\.kz01\/" aria-label="Instagram"/);
  assert.match(html, /mobile-social-icon" href="https:\/\/wa\.me\/77765208514" aria-label="WhatsApp"/);
});

test("social links are shown on desktop and recipes render as three responsive product cards", () => {
  const html = read("public/index.html");
  const styles = read("public/styles.css");
  const enhancements = read("public/app-enhancements.js");

  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Manrope/);
  assert.match(styles, /body\s*\{\s*font-family:\s*"Manrope",\s*"Noto Sans"/);
  assert.match(styles, /\.topbar > \.mobile-quick-actions\s*\{\s*display:\s*flex/);
  assert.match(styles, /@media \(min-width:\s*761px\) and \(max-width:\s*1100px\)\s*\{\s*\.topbar > \.mobile-quick-actions\s*\{\s*display:\s*flex/);
  assert.match(enhancements, /function buildProductRecipes\(product\)/);
  assert.match(enhancements, /byId\("productPage"\)\.append\(buildProductRecipes\(product\)\)/);
  assert.match(enhancements, /const productRecipeSets = \{[\s\S]*caviar:[\s\S]*smoked:[\s\S]*shrimp:[\s\S]*squid:[\s\S]*snacks:[\s\S]*fish:/);
  assert.match(styles, /\.product-recipe-grid\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.product-recipe-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("view links reset scroll and mobile product cards align their prices and actions", () => {
  const app = read("public/app.js");
  const styles = read("public/styles.css");
  assert.match(app, /location\.hash = view;[\s\S]*window\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*"instant"\s*\}\)/);
  assert.match(app, /link\.addEventListener\("click", \(event\) => \{\s*event\.preventDefault\(\);\s*setView\(link\.dataset\.viewLink\)/);
  assert.match(styles, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.product-card\s*\{\s*display:\s*flex;[\s\S]*\.product-body\s*\{\s*display:\s*flex;[\s\S]*\.product-card p\s*\{\s*flex:\s*1;[\s\S]*\.price-row\s*\{[^}]*margin-top:\s*auto/s);
});

test("delivery hours and 09:00 order cutoff are prominent and not inside catalog filters", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  const enhancements = read("public/app-enhancements.js");
  const styles = read("public/styles.css");
  const filters = html.match(/<aside class="filters">[\s\S]*?<\/aside>/)?.[0] || "";

  assert.match(html, /class="delivery-cutoff-notice"[\s\S]*data-i18n="deliveryHoursTitle"[\s\S]*data-i18n="deliveryCutoffText"/);
  assert.doesNotMatch(filters, /delivery-note|data-i18n="schedule"/);
  assert.doesNotMatch(app, /10:00|13:00/);
  assert.match(enhancements, /deliveryHoursTitle: "Работаем с понедельника по субботу · 09:00–14:00"/);
  assert.match(enhancements, /deliveryCutoffText: "Если не успели оформить заказ до 09:00, доставка переносится на завтра — на это же время\."/);
  assert.match(enhancements, /footerSchedule: "Пн–Сб · 09:00–14:00/);
  assert.match(enhancements, /deliveryHoursTitle: "Дүйсенбіден сенбіге дейін жұмыс істейміз · 09:00–14:00"/);
  assert.match(enhancements, /deliveryHoursTitle: "Open Monday to Saturday · 09:00–14:00"/);
  assert.doesNotMatch(`${html}\n${enhancements}`, /08:00|08:00-ге дейін/);
  assert.match(styles, /\.delivery-cutoff-notice\s*\{[^}]*border-left:\s*6px solid/s);
});

test("Instagram link, caviar package copy, and mobile prices stay consistent", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  const enhancements = read("public/app-enhancements.js");
  const seed = read("database/seed.sql");
  const descriptionUpdates = seed.match(/UPDATE products AS product[\s\S]*?WHERE product\.name = catalog\.name;/)?.[0] || "";
  const styles = read("public/styles.css");

  assert.match(html, /href="https:\/\/www\.instagram\.com\/balyk\.kz01\/"/);
  assert.doesNotMatch(`${html}\n${app}\n${enhancements}`, /доставкой утром|delivered in the morning|таңертең жеткізіледі/);
  assert.match(app, /name: "Икра горбуши 0\.5 кг"[^}]*description: "Зернистая икра горбуши дальневосточного вылова\."[^}]*details: "Банка 500 г\."/);
  assert.match(app, /name: "Икра горбуши 250 г"[^}]*description: "Зернистая икра горбуши дальневосточного вылова\."[^}]*details: "Банка 250 г\."/);
  assert.match(seed, /'Икра горбуши 0\.5 кг', 'Зернистая икра горбуши дальневосточного вылова\.', 'Банка 500 г\.'/);
  assert.match(seed, /'Икра горбуши 250 г', 'Зернистая икра горбуши дальневосточного вылова\.', 'Банка 250 г\.'/);
  assert.match(descriptionUpdates, /\('Икра горбуши 0\.5 кг', 'Зернистая икра горбуши дальневосточного вылова\.'\)/);
  assert.match(descriptionUpdates, /\('Икра горбуши 250 г', 'Зернистая икра горбуши дальневосточного вылова\.'\)/);
  assert.match(styles, /\.price-row strong\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(styles, /\.checkout-total strong\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(styles, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.price-row strong\s*\{[^}]*font-size:\s*clamp\(17px,\s*5vw,\s*22px\)/);
});

test("product prices have no 'from' prefix and every secondary page has a clear return action", () => {
  const html = read("public/index.html");
  const enhancements = read("public/app-enhancements.js");

  assert.match(enhancements, /card\.querySelector\("\.price-row strong"\)\.textContent = formatPrice\(product\.price\)/);
  assert.match(enhancements, /renderProducts = function \(\) \{[\s\S]*?card\.querySelector\("\.price-row strong"\)\.textContent = formatPrice\(product\.price\)/);

  ["cart", "profile", "admin"].forEach((view) => {
    assert.match(html, new RegExp(`<section class="view" id="view-${view}"[\\s\\S]*?data-back-view="catalog"`));
  });
  assert.match(html, /data-checkout-back[^>]*data-i18n="backToCart"/);
  assert.match(enhancements, /querySelectorAll\("\[data-back-view\]"\)[\s\S]*setView\(button\.dataset\.backView\)/);
  assert.match(enhancements, /querySelector\("\[data-checkout-back\]"\)\.addEventListener[\s\S]*classList\.remove\("open"\)/);
  assert.match(enhancements, /backToCatalog: "← Назад в каталог"/);
  assert.match(enhancements, /backToCatalog: "← Каталогқа оралу"/);
  assert.match(enhancements, /backToCatalog: "← Back to catalog"/);
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

test("footer shows both direct contact phone numbers as callable links", () => {
  const html = read("public/index.html");
  const enhancements = read("public/app-enhancements.js");
  assert.match(html, /data-i18n="footerContacts">Связь<\/strong>/);
  assert.match(html, /href="tel:\+77765208514">8 776 520 85 14<\/a>/);
  assert.match(html, /href="tel:\+77015208560">8 701 520 85 60<\/a>/);
  assert.match(html, /href="tel:\+77172548253"[\s\S]*data-i18n="autoAnswer">Автоответчик/);
  assert.match(enhancements, /footerContacts: "Связь"/);
  assert.match(enhancements, /footerContacts: "Байланыс"/);
  assert.match(enhancements, /footerContacts: "Contact"/);
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

test("orders are copied to the configured mailbox and admin order items include catalog images", () => {
  const server = read("server.js");
  const database = read("db.js");
  const enhancements = read("public/app-enhancements.js");
  const styles = read("public/styles.css");
  const compose = read("docker-compose.yml");
  const readme = read("README.md");

  assert.match(server, /process\.env\.ORDER_NOTIFICATION_EMAIL \|\| "87015240905@mail\.ru"/);
  assert.match(server, /async function sendOrderNotificationEmail\(order\)/);
  assert.match(server, /to: recipient,[\s\S]*subject: `Новый заказ №/);
  assert.match(server, /Адрес доставки: \$\{order\.address\}/);
  assert.match(server, /Order \$\{order\.id\} was saved, but email notification failed/);
  assert.match(server, /await sendOrderNotificationEmail\(order\)/);
  assert.match(server, /sendJson\(res, 201, \{ order: publicOrder \}\)/);
  assert.doesNotMatch(server, /sendJson\(res, 201, \{ order: publicOrder, notification \}\)/);
  assert.match(database, /SELECT id, name, image_url, COALESCE\(package_price, price_per_kg\)/);
  assert.match(database, /imageUrl: product\.image_url/);
  assert.match(database, /'imageUrl', p\.image_url/);
  assert.match(enhancements, /admin-order-product-image/);
  assert.doesNotMatch(enhancements, /Копия на почту не отправлена|The email copy could not be sent|Электрондық поштаға көшірме жіберілмеді/);
  assert.match(enhancements, /Заказ №\$\{result\.order\.id\} принят\./);
  assert.match(styles, /\.admin-order-product-image/);
  assert.match(compose, /ORDER_NOTIFICATION_EMAIL: \$\{ORDER_NOTIFICATION_EMAIL:-87015240905@mail\.ru\}/);
  assert.match(readme, /87015240905@mail\.ru/);
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

test("production deployment uses non-root Node, private PostgreSQL, HTTPS, and optional admin secrets", () => {
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
  assert.match(server, /Production startup requires a working PostgreSQL connection/);
  assert.match(server, /TRUST_PROXY === "true"/);
  assert.match(server, /const ready = databaseReady/);
  assert.match(read("api/auth/[...path].js"), /require\("\.\.\/\.\.\/server"\)\.vercelHandler/);
  assert.match(read("api/admin/[...path].js"), /require\("\.\.\/\.\.\/server"\)\.vercelHandler/);
  assert.match(read("public/app.js"), /window\.parseApiResponse = async function/);
  assert.match(read("public/app-enhancements.js"), /window\.parseApiResponse\(response\)/);
  assert.match(readme, /docker compose up -d --build/);
  assert.match(readme, /docker compose down --volumes/);
});
