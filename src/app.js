const express = require("express");
const cors = require("cors");
const pinoHttp = require("pino-http");
const logger = require("./logger");
const { searchCatalog, productFromRow, InputError } = require("./catalog");

function createApp(
  pool,
  {
    origins = process.env.CORS_ORIGINS ||
      "http://127.0.0.1:5173,http://localhost:5173",
  } = {},
) {
  const allowed = new Set(
    origins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || allowed.has(origin)),
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/livez", (req, res) => res.json({ status: "ok" }));
  app.get("/readyz", async (req, res) => {
    try {
      await pool.query("SELECT id FROM products LIMIT 1");
      res.json({ status: "ok" });
    } catch {
      res
        .status(503)
        .json({ error: "Database is unavailable or migrations are missing." });
    }
  });
  app.get("/api/hello", (req, res) => {
    req.log.info("hello called");
    res.json({ message: "Hello from backend!" });
  });
  app.get("/api/error", () => {
    throw new Error("test error");
  });
  app.get("/api/catalog", async (req, res) => {
    // Full snapshot for the small demo: home and local cart lookups.
    const rows = await pool.query("SELECT * FROM products ORDER BY id");
    const products = rows.rows.map(productFromRow);
    res.json({
      products,
      departments: [...new Set(products.map((product) => product.category))],
    });
  });
  app.get("/api/products", async (req, res) =>
    res.json(await searchCatalog(pool, req.query)),
  );
  app.get("/api/products/:id", async (req, res) => {
    if (
      !/^[1-9]\d*$/.test(req.params.id) ||
      Number(req.params.id) > 2147483647
    ) {
      return res.status(404).json({ error: "Product not found." });
    }
    const result = await pool.query("SELECT * FROM products WHERE id = $1", [
      req.params.id,
    ]);
    if (!result.rowCount)
      return res.status(404).json({ error: "Product not found." });
    res.json({ product: productFromRow(result.rows[0]) });
  });
  app.use((req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof InputError)
      return res.status(400).json({ error: error.message });
    req.log.error(
      { code: error.code, errorType: error.name },
      "request failed",
    );
    res.status(503).json({ error: "Service is unavailable. Try again." });
  });
  return app;
}
module.exports = { createApp };
