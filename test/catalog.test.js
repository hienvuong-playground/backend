const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { createApp } = require("../src/app");
const { migrate } = require("../src/db/migrate");
const { seed } = require("../src/db/seed");
const sample = require("../src/data/catalog.json");

test("catalog API uses Postgres", async (t) => {
  assert.ok(
    process.env.TEST_DATABASE_URL,
    "Set TEST_DATABASE_URL to a disposable Postgres database before npm test.",
  );
  const schema = `catalog_test_${process.pid}_${Date.now()}`;
  const connectionString = process.env.TEST_DATABASE_URL;
  const ssl =
    process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true };
  const admin = new Pool({ connectionString, ssl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({
    connectionString,
    ssl,
    options: `-c search_path=${schema}`,
  });
  const server = createApp(pool, {
    origins: "https://storefront.example",
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path) => {
    const response = await fetch(`${base}${path}`);
    return { status: response.status, body: await response.json() };
  };
  try {
    await t.test(
      "health distinguishes missing schema from process health",
      async () => {
        assert.equal((await get("/livez")).status, 200);
        assert.equal((await get("/readyz")).status, 503);
      },
    );
    await t.test("migration and import can run twice", async () => {
      await Promise.all([migrate(pool), migrate(pool)]);
      await seed(pool);
      await seed(pool);
      assert.equal(
        (await pool.query("SELECT count(*)::integer AS count FROM products"))
          .rows[0].count,
        sample.length,
      );
      assert.equal((await get("/readyz")).status, 200);
    });
    await t.test(
      "snapshot preserves numeric price and product details",
      async () => {
        const { status, body } = await get("/api/catalog");
        assert.equal(status, 200);
        assert.equal(body.products.length, sample.length);
        assert.deepEqual(body.products[0], sample[0]);
        assert.deepEqual(
          new Set(body.departments),
          new Set(sample.map((product) => product.category)),
        );
      },
    );
    await t.test(
      "search combines words, department, rating, price, and deals",
      async () => {
        const expected = sample
          .filter(
            (product) =>
              product.category === "Electronics" &&
              product.rating >= 4 &&
              product.price <= 100 &&
              product.originalPrice > product.price &&
              `${product.title} ${product.tags}`
                .toLowerCase()
                .includes("wireless") &&
              `${product.title} ${product.tags}`
                .toLowerCase()
                .includes("headphones"),
          )
          .sort((a, b) => b.price - a.price || a.id - b.id);
        const { body } = await get(
          "/api/products?k=wireless%20headphones&department=Electronics&rating=4&price=100&deals=1&sort=price-desc&limit=100",
        );
        assert.deepEqual(
          body.products.map((product) => product.id),
          expected.map((product) => product.id),
        );
        assert.equal(body.total, expected.length);
        const rated = (await get("/api/products?sort=rating&limit=100")).body
          .products;
        assert.ok(
          rated.every(
            (product, i) => i === 0 || rated[i - 1].rating >= product.rating,
          ),
        );
        const ascending = (await get("/api/products?sort=price-asc&limit=100"))
          .body.products;
        assert.ok(
          ascending.every(
            (product, i) => i === 0 || ascending[i - 1].price <= product.price,
          ),
        );
      },
    );
    await t.test(
      "pagination has stable order and total past the last page",
      async () => {
        const first = (await get("/api/products?limit=10")).body;
        const second = (await get("/api/products?limit=10&offset=10")).body;
        assert.deepEqual(
          first.products.map((product) => product.id),
          sample.slice(0, 10).map((product) => product.id),
        );
        assert.deepEqual(
          second.products.map((product) => product.id),
          sample.slice(10, 20).map((product) => product.id),
        );
        const empty = (await get("/api/products?offset=100")).body;
        assert.equal(empty.total, sample.length);
        assert.equal(empty.products.length, 0);
      },
    );
    await t.test(
      "invalid parameters and literal SQL-like text are safe",
      async () => {
        for (const query of [
          "limit=101",
          "limit=-1",
          "offset=0.5",
          "price=NaN",
          "rating=6",
          "sort=DROP%20TABLE%20products",
          "deals=yes",
          "k=a&k=b",
        ]) {
          assert.equal(
            (await get(`/api/products?${query}`)).status,
            400,
            query,
          );
        }
        for (const keyword of ["%", "_", "' OR 1=1 --", "no-such-product"]) {
          assert.equal(
            (await get(`/api/products?k=${encodeURIComponent(keyword)}`)).body
              .total,
            0,
          );
        }
        for (const id of ["0", "-1", "1abc", "99999999999999999999", "99999"]) {
          assert.equal((await get(`/api/products/${id}`)).status, 404);
        }
        assert.equal((await get("/api/unknown")).status, 404);
      },
    );
    await t.test(
      "product changes come from the database and seed keeps them",
      async () => {
        await pool.query(
          "UPDATE products SET price = 12.34, stock = false, title = $1 WHERE id = 1",
          ["Postgres source proof"],
        );
        await seed(pool);
        const { body } = await get("/api/products/1");
        assert.equal(body.product.price, 12.34);
        assert.equal(body.product.stock, false);
        assert.equal(body.product.title, "Postgres source proof");
        assert.equal(
          (await get("/api/products?k=Postgres%20source")).body.products[0].id,
          1,
        );
      },
    );
    await t.test(
      "CORS only permits configured browser origins and hello hides secrets",
      async () => {
        const allowed = await fetch(`${base}/api/catalog`, {
          headers: { Origin: "https://storefront.example" },
        });
        assert.equal(
          allowed.headers.get("access-control-allow-origin"),
          "https://storefront.example",
        );
        const denied = await fetch(`${base}/api/catalog`, {
          headers: { Origin: "https://unlisted.example" },
        });
        assert.equal(denied.headers.get("access-control-allow-origin"), null);
        assert.deepEqual((await get("/api/hello")).body, {
          message: "Hello from backend!",
        });
      },
    );
    await t.test(
      "database outage returns an API error and failed readiness",
      async () => {
        await pool.end();
        assert.equal((await get("/api/products")).status, 503);
        assert.equal((await get("/readyz")).status, 503);
        assert.equal((await get("/livez")).status, 200);
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (!pool.ended) await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
