const { createPool } = require("./pool");
const { migrate } = require("./migrate");
const { seed } = require("./seed");
const pool = createPool();
migrate(pool)
  .then(() => seed(pool))
  .then(() => console.log("Database ready. Existing product data kept."))
  .catch(() => {
    console.error(
      "Database setup failed. Make sure that Postgres and DATABASE_URL are available.",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
