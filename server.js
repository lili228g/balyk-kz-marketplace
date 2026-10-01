const http = require("http");
const fs = require("fs");
const path = require("path");
const { initDatabase, getProducts, createOrder, registerUser, loginUser, getOrders } = require("./db");

const root = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
let databaseReady = false;
let databaseError = null;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Слишком большой запрос"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Некорректный JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/health") {
      sendJson(res, databaseReady ? 200 : 503, {
        ok: databaseReady,
        database: process.env.PGDATABASE || "balykkz",
        error: databaseError ? databaseError.message : null
      });
      return true;
    }

    if (url.pathname === "/api/products" && req.method === "GET") {
      const products = await getProducts();
      sendJson(res, 200, { products });
      return true;
    }

    if (url.pathname === "/api/orders" && req.method === "POST") {
      const payload = await readBody(req);
      const order = await createOrder(payload);
      sendJson(res, 201, { order });
      return true;
    }

    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      sendJson(res, 201, { user: await registerUser(await readBody(req)) });
      return true;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      sendJson(res, 200, { user: await loginUser(await readBody(req)) });
      return true;
    }

    if (url.pathname === "/api/orders" && req.method === "GET") {
      sendJson(res, 200, { orders: await getOrders(url.searchParams.get("phone") || "") });
      return true;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "API route not found" });
      return true;
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (await handleApi(req, res, url)) return;

  let filePath = path.join(root, decodeURIComponent(url.pathname));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (url.pathname === "/" || !path.extname(filePath)) {
    filePath = path.join(root, "index.html");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream"
    });
    res.end(content);
  });
});

async function start() {
  try {
    await initDatabase();
    databaseReady = true;
    console.log("PostgreSQL connected: balykkz");
  } catch (error) {
    databaseError = error;
    console.warn(`PostgreSQL is not ready: ${error.message}`);
  }

  server.listen(port, () => {
    console.log(`Balyk marketplace is running: http://localhost:${port}`);
  });
}

start();