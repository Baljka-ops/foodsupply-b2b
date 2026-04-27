const { app } = require("./app");
const { config } = require("./config");
const { connectDb } = require("./db");
const { ensureSystemUsers, pruneLegacyOrdersToFive } = require("./bootstrap/ensureSystemUsers");

async function bootstrap() {
  try {
    if (config.isProduction && (!config.authSecret || config.authSecret.includes("dev-change-me"))) {
      throw new Error("AUTH_SECRET must be set to a strong value in production");
    }

    await connectDb();
    await ensureSystemUsers();
    await pruneLegacyOrdersToFive();
    app.listen(config.port, () => {
      console.log(`[foodsupply-api] listening on http://localhost:${config.port}`);
      console.log(`[foodsupply-web] open http://localhost:${config.port}/`);
    });
  } catch (error) {
    console.error("[foodsupply-api] failed to start", error);
    process.exit(1);
  }
}

bootstrap();

// trigger nodemon restart

// load fresh env

// load fresh env for 401

// reload for mcc and merchant id
