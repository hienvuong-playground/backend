const { createPool } = require("./db/pool");
const { createApp } = require("./app");
const logger = require("./logger");
const pool = createPool();
pool.on("error", (error) =>
  logger.error({ code: error.code }, "database connection failed"),
);
for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, (error) => {
    logger.fatal({ err: error }, event);
    process.exit(1);
  });
}
const port = process.env.PORT || 3001;
const server = createApp(pool).listen(port, () =>
  logger.info({ port }, "backend started"),
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
