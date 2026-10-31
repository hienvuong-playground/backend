const fs = require("node:fs");
const { Pool } = require("pg");
const { DefaultAzureCredential } = require("@azure/identity");
const { readSecret } = require("../secrets");

const ENTRA_SCOPE = "https://ossrdbms-aad.database.windows.net/.default";

function connectionConfig() {
  // PGHOST set: Azure Postgres with Entra token as password (workload identity).
  if (process.env.PGHOST) {
    const credential = new DefaultAzureCredential();
    return {
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      database: process.env.PGDATABASE,
      password: async () => (await credential.getToken(ENTRA_SCOPE)).token,
    };
  }
  const url = new URL(readSecret("DATABASE_URL"));
  // Configure TLS here so URI flags cannot disable certificate verification in pg.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    if (url.searchParams.has(key)) {
      throw new Error(
        "Set PGSSLMODE and PGSSLROOTCERT instead of TLS flags in DATABASE_URL",
      );
    }
  }
  return { connectionString: url.toString() };
}

function createPool() {
  const mode = process.env.PGSSLMODE || "verify-full";
  if (!["disable", "verify-full"].includes(mode)) {
    throw new Error("PGSSLMODE must be disable (local only) or verify-full");
  }
  return new Pool({
    ...connectionConfig(),
    ssl:
      mode === "disable"
        ? false
        : {
            rejectUnauthorized: true,
            ...(process.env.PGSSLROOTCERT
              ? { ca: fs.readFileSync(process.env.PGSSLROOTCERT, "utf8") }
              : {}),
          },
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
  });
}
module.exports = { createPool };
