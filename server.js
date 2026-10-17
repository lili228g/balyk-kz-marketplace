const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const {
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
  deleteSession
} = require("./db");

const root = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const trustProxy = process.env.TRUST_PROXY === "true" || Boolean(process.env.VERCEL);
let databaseReady = false;
let databaseInitialization = null;
const bodyLimit = Number(process.env.BODY_LIMIT_BYTES || 100_000);
const apiWindowMs = Number(process.env.API_RATE_WINDOW_MS || 60_000);
const apiMaxRequests = Number(process.env.API_RATE_MAX || 120);
const burstWindowMs = Number(process.env.BURST_RATE_WINDOW_MS || 10_000);
const burstMaxRequests = Number(process.env.BURST_RATE_MAX || 45);
const authWindowMs = Number(process.env.AUTH_RATE_WINDOW_MS || 15 * 60_000);
const authMaxRequests = Number(process.env.AUTH_RATE_MAX || 12);
const rateBuckets = new Map();
const sessionTtlMs = Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60_000);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://flagcdn.com",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join("; ")
  };
}

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function initializeDatabase() {
  if (!databaseInitialization) {
    databaseInitialization = initDatabase()
      .then(() => {
        databaseReady = true;
      })
      .catch((error) => {
        databaseReady = false;
        databaseInitialization = null;
        throw error;
      });
  }
  return databaseInitialization;
}

function clientIp(req) {
  if (trustProxy && req.headers["x-forwarded-for"]) {
    return String(req.headers["x-forwarded-for"]).split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    if (index === -1) return ["", ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

async function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await storeSession(tokenHash, user.id, new Date(Date.now() + sessionTtlMs));
  return token;
}

function resetMailConfigured() {
  const username = process.env.SMTP_USER || "";
  const password = process.env.SMTP_PASSWORD || "";
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    resetSecretConfigured() &&
    Boolean(username) === Boolean(password)
  );
}

function resetSecretConfigured() {
  return (process.env.PASSWORD_RESET_SECRET || "").length >= 32;
}

function orderMailConfigured() {
  const username = process.env.SMTP_USER || "";
  const password = process.env.SMTP_PASSWORD || "";
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    Boolean(username) === Boolean(password)
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatOrderAmount(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₸`;
}

async function sendOrderNotificationEmail(order) {
  if (!orderMailConfigured()) {
    console.warn("Order notification email is not configured; order was saved without email delivery.");
    return { sent: false, reason: "not_configured" };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...(process.env.SMTP_USER ? {
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    } : {})
  });
  const recipient = process.env.ORDER_NOTIFICATION_EMAIL || "87015240905@mail.ru";
  const items = order.items.map((item) => {
    const amount = item.grams ? `${Number(item.grams).toLocaleString("ru-RU")} г` : "—";
    const total = item.isNegotiable ? "Цена уточняется" : formatOrderAmount(item.lineTotal);
    return `${item.name} — ${amount} × ${item.qty}; ${total}`;
  });
  const rows = order.items.map((item) => (
    `<tr><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(item.name)}</td>` +
    `<td style="padding:8px;border-bottom:1px solid #ddd">${item.grams ? `${Number(item.grams).toLocaleString("ru-RU")} г` : "—"} × ${Number(item.qty)}</td>` +
    `<td style="padding:8px;border-bottom:1px solid #ddd">${item.isNegotiable ? "Цена уточняется" : formatOrderAmount(item.lineTotal)}</td></tr>`
  )).join("");
  const details = [
    `Заказ №${order.id}`,
    `Имя: ${order.customerName}`,
    `Телефон: ${order.phone}`,
    `Email: ${order.email || "не указан"}`,
    `Адрес доставки: ${order.address}`,
    `Комментарий: ${order.comment || "нет"}`,
    "",
    "Состав заказа:",
    ...items,
    "",
    `Итого: ${formatOrderAmount(order.total_amount)}`
  ].join("\n");
  const html = `<h2>Новый заказ №${escapeHtml(order.id)}</h2>` +
    `<p><strong>Имя:</strong> ${escapeHtml(order.customerName)}<br>` +
    `<strong>Телефон:</strong> ${escapeHtml(order.phone)}<br>` +
    `<strong>Email:</strong> ${escapeHtml(order.email || "не указан")}<br>` +
    `<strong>Адрес доставки:</strong> ${escapeHtml(order.address)}<br>` +
    `<strong>Комментарий:</strong> ${escapeHtml(order.comment || "нет")}</p>` +
    `<table style="border-collapse:collapse;text-align:left"><thead><tr><th style="padding:8px">Товар</th>` +
    `<th style="padding:8px">Количество</th><th style="padding:8px">Сумма</th></tr></thead>` +
    `<tbody>${rows}</tbody></table><p><strong>Итого: ${formatOrderAmount(order.total_amount)}</strong></p>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipient,
    subject: `Новый заказ №${order.id} — Балык.kz`,
    text: details,
    html
  });
  return { sent: true };
}

async function sendPasswordResetEmail(email, code) {
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    ...(process.env.SMTP_USER ? {
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    } : {})
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Код для восстановления пароля Балык.kz",
    text: `Ваш код для восстановления пароля: ${code}\nКод действует 10 минут. Если вы не запрашивали сброс, проигнорируйте это письмо.`
  });
}

function hashResetCode(email, code) {
  return crypto.createHmac("sha256", process.env.PASSWORD_RESET_SECRET)
    .update(`${email}\n${code}`)
    .digest("hex");
}

function sessionCookie(token) {
  const maxAge = Math.floor(sessionTtlMs / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `balyk_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

async function currentSession(req) {
  const token = parseCookies(req).balyk_session;
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return getSessionUser(tokenHash);
}

function hitBucket(key, limit, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (rateBuckets.size > 2000) {
    for (const [entryKey, entry] of rateBuckets) {
      if (entry.resetAt <= now) rateBuckets.delete(entryKey);
    }
  }
  return bucket.count <= limit;
}

function rateLimit(req, res, url) {
  const ip = clientIp(req);
  const group = url.pathname.startsWith("/api/auth/") ? "auth" : url.pathname.startsWith("/api/") ? "api" : "page";
  const allowed =
    hitBucket(`burst:${ip}`, burstMaxRequests, burstWindowMs) &&
    hitBucket(`${group}:${ip}`, group === "auth" ? authMaxRequests : apiMaxRequests, group === "auth" ? authWindowMs : apiWindowMs);
  if (allowed) return false;
  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 429, { error: "Слишком много запросов. Попробуйте позже." });
    return true;
  }
  res.writeHead(429, { ...securityHeaders(), "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" });
  res.end("Too many requests");
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.includes("application/json")) {
      reject(validationError("Ожидается JSON-запрос", 415));
      return;
    }
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > bodyLimit) {
        req.destroy();
        reject(validationError("Слишком большой запрос", 413));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(validationError("Некорректный JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  try {
    if (!["GET", "POST", "HEAD"].includes(req.method)) {
      sendJson(res, 405, { error: "Method not allowed" });
      return true;
    }

    if (url.pathname === "/api/health") {
      const adminConfigured = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
      const ready = databaseReady;
      sendJson(res, ready ? 200 : 503, {
        ok: ready,
        database: databaseReady ? "connected" : "unavailable",
        adminConfigured
      });
      return true;
    }

    if (url.pathname === "/api/auth/session" && req.method === "GET") {
      const user = await currentSession(req);
      sendJson(res, 200, { user });
      return true;
    }

    if (url.pathname === "/api/products" && req.method === "GET") {
      const products = await getProducts();
      sendJson(res, 200, { products });
      return true;
    }

    if (url.pathname === "/api/orders" && req.method === "POST") {
      const payload = await readBody(req);
      const session = await currentSession(req);
      const order = await createOrder(payload, session);
      let notification;
      try {
        notification = await sendOrderNotificationEmail(order);
      } catch (error) {
        console.error(`Order ${order.id} was saved, but email notification failed:`, error.code || error.message);
        notification = { sent: false, reason: "delivery_failed" };
      }
      const { items, customerName, email, phone, address, comment, ...publicOrder } = order;
      sendJson(res, 201, { order: publicOrder, notification });
      return true;
    }

    if (url.pathname === "/api/auth/password-reset/request" && req.method === "POST") {
      if (!resetMailConfigured()) {
        sendJson(res, 503, { error: "Восстановление пароля пока не настроено: добавьте SMTP-параметры и секрет в .env." });
        return true;
      }
      const payload = await readBody(req);
      const email = String(payload.email || "").trim().toLowerCase();
      if (!hitBucket(`password-reset:${email}`, 3, authWindowMs)) {
        sendJson(res, 429, { error: "Слишком много запросов. Попробуйте позже." });
        return true;
      }
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      const codeHash = hashResetCode(email, code);
      const accountExists = await createPasswordReset(email, codeHash, expiresAt);
      if (accountExists) {
        try {
          await sendPasswordResetEmail(email, code);
        } catch (error) {
          await deletePasswordReset(email);
          console.error("Password reset email delivery failed:", error.code || error.name);
        }
      }
      sendJson(res, 200, { message: "Запрос на восстановление принят. Если аккаунт существует, код придёт на почту; при проблемах доставки попробуйте позже." });
      return true;
    }

    if (url.pathname === "/api/auth/password-reset/confirm" && req.method === "POST") {
      if (!resetSecretConfigured()) {
        sendJson(res, 503, { error: "Восстановление пароля пока не настроено: добавьте секрет PASSWORD_RESET_SECRET в .env." });
        return true;
      }
      const payload = await readBody(req);
      const email = String(payload.email || "").trim().toLowerCase();
      const code = String(payload.code || "");
      if (!/^\d{6}$/.test(code)) {
        sendJson(res, 400, { error: "Введите шестизначный код из письма." });
        return true;
      }
      const changed = await resetPassword(email, hashResetCode(email, code), payload.newPassword);
      if (!changed) {
        sendJson(res, 400, { error: "Код неверный или истёк. Запросите новый код." });
        return true;
      }
      sendJson(res, 200, { message: "Пароль изменён. Войдите с новым паролем." });
      return true;
    }

    if (url.pathname === "/api/auth/profile" && req.method === "POST") {
      const session = await currentSession(req);
      if (!session) {
        sendJson(res, 401, { error: "Войдите в аккаунт, чтобы изменить данные профиля." });
        return true;
      }
      const user = await updateProfile(session.id, await readBody(req));
      sendJson(res, 200, { user });
      return true;
    }

    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      const user = await registerUser(await readBody(req));
      const token = await createSession(user);
      sendJson(res, 201, { user }, { "Set-Cookie": sessionCookie(token) });
      return true;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const user = await loginUser(await readBody(req));
      const token = await createSession(user);
      sendJson(res, 200, { user }, { "Set-Cookie": sessionCookie(token) });
      return true;
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const token = parseCookies(req).balyk_session;
      if (token) {
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        await deleteSession(tokenHash);
      }
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      sendJson(res, 200, { ok: true }, {
        "Set-Cookie": `balyk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
      });
      return true;
    }

    if (url.pathname === "/api/orders" && req.method === "GET") {
      const session = await currentSession(req);
      if (!session) {
        sendJson(res, 401, { error: "Войдите в аккаунт, чтобы видеть историю заказов" });
        return true;
      }
      if (!session.id || !session.phone) {
        sendJson(res, 200, { orders: [] });
        return true;
      }
      sendJson(res, 200, { orders: await getOrders(session.id, session.phone) });
      return true;
    }

    if (url.pathname.startsWith("/api/admin/")) {
      const session = await currentSession(req);
      if (!session) {
        sendJson(res, 401, { error: "Войдите в аккаунт администратора" });
        return true;
      }
      if (session.role !== "admin") {
        sendJson(res, 403, { error: "Недостаточно прав" });
        return true;
      }
      if (url.pathname === "/api/admin/orders" && req.method === "GET") {
        sendJson(res, 200, { orders: await getAdminOrders() });
        return true;
      }
      if (url.pathname === "/api/admin/users" && req.method === "GET") {
        sendJson(res, 200, { users: await getAdminUsers() });
        return true;
      }
      const statusRoute = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/status$/);
      if (statusRoute && req.method === "POST") {
        const payload = await readBody(req);
        sendJson(res, 200, { order: await updateOrderStatus(statusRoute[1], payload.status) });
        return true;
      }
      sendJson(res, 404, { error: "Admin route not found" });
      return true;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "API route not found" });
      return true;
    }
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Внутренняя ошибка сервера" });
    return true;
  }

  return false;
}

async function handleRequest(req, res) {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch (error) {
    res.writeHead(400, securityHeaders());
    res.end("Bad request");
    return;
  }
  if (rateLimit(req, res, url)) return;
  if (url.pathname.startsWith("/api/") && !databaseReady) {
    try {
      await initializeDatabase();
    } catch (error) {
      console.error(`PostgreSQL is not ready: ${error.message}`);
      sendJson(res, 503, { error: "Сервис временно недоступен: проверьте секреты и подключение к базе данных." });
      return;
    }
  }
  if (await handleApi(req, res, url)) return;

  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, securityHeaders());
    res.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    res.writeHead(400, securityHeaders());
    res.end("Bad request");
    return;
  }

  let filePath = path.resolve(root, `.${pathname}`);

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403, securityHeaders());
    res.end("Forbidden");
    return;
  }

  if (url.pathname === "/" || !path.extname(filePath)) {
    filePath = path.join(root, "index.html");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { ...securityHeaders(), "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=86400"
    });
    res.end(req.method === "HEAD" ? undefined : content);
  });
}

const server = http.createServer(handleRequest);

server.maxConnections = Number(process.env.MAX_CONNECTIONS || 600);
server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 10_000);
server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 20_000);
server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5_000);

async function start() {
  try {
    await initializeDatabase();
    console.log("PostgreSQL connected: balykkz");
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Production startup requires a working PostgreSQL connection: ${error.message}`, { cause: error });
    }
    console.warn(`PostgreSQL is not ready: ${error.message}`);
  }

  server.listen(port, host, () => {
    console.log(`Balyk marketplace is running: http://${host}:${port}`);
  });
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Set PORT to another value.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

if (require.main === module) {
  start().catch((error) => {
    console.error(`Balyk marketplace startup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { handleRequest, vercelHandler: handleRequest };
