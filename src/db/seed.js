const { createPool } = require("./pool");
const products = require("../data/catalog.json");
const storefront = require("../data/storefront.json");

async function seed(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const product of products) {
      await client.query(
        `INSERT INTO products
        (id, title, brand, category, tags, image, price, original_price, rating, reviews, badge, about, color, stock)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO NOTHING`,
        [
          product.id,
          product.title,
          product.brand,
          product.category,
          product.tags,
          product.image,
          product.price,
          product.originalPrice,
          product.rating,
          product.reviews,
          product.badge,
          JSON.stringify(product.about),
          product.color,
          product.stock,
        ],
      );
    }
    for (const promo of storefront.promos) {
      await client.query(
        `INSERT INTO promos (id, position, title, image, department)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO NOTHING`,
        [promo.id, promo.position, promo.title, promo.image, promo.department],
      );
    }
    for (const category of storefront.categories) {
      await client.query(
        `INSERT INTO categories (id, position, title, department, items)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO NOTHING`,
        [
          category.id,
          category.position,
          category.title,
          category.department,
          JSON.stringify(category.items),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
if (require.main === module) {
  const pool = createPool();
  seed(pool)
    .then(() =>
      console.log("Sample products inserted. Existing products kept."),
    )
    .catch(() => {
      console.error(
        "Product import failed. Run db:migrate and make sure that Postgres is available.",
      );
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { seed };
