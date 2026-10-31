const fs = require("node:fs/promises");
const path = require("node:path");
const { createPool } = require("./pool");

async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(714021)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = path.join(__dirname, "migrations");
    const files = (await fs.readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (applied.rowCount) continue;
      await client.query(await fs.readFile(path.join(directory, name), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        name,
      ]);
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
  migrate(pool)
    .then(() => console.log("Database migrations completed."))
    .catch(() => {
      console.error(
        "Database migration failed. Make sure that DATABASE_URL is correct and Postgres is available.",
      );
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { migrate };
