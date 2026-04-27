const express = require("express");
const cors = require("cors");
const path = require("path");
const { config } = require("./config");
const { authRouter } = require("./routes/auth.routes");
const { adminRouter } = require("./routes/admin.routes");
const { stateRouter } = require("./routes/state.routes");
const { paymentsRouter } = require("./routes/payments.routes");
const { commissionsRouter } = require("./routes/commissions.routes");
const { createIpRateLimiter } = require("./utils/rateLimit");
const { fromThrownError, sendError, sendSuccess } = require("./utils/http");

const app = express();
const frontendRoot = path.resolve(__dirname, "..", "..");
const allowedOrigins = new Set(config.allowedOrigins);
const connectSrc = ["'self'", ...allowedOrigins].join(" ");
const apiRateLimiter = createIpRateLimiter({
  windowMs: config.apiRateLimitWindowMs,
  max: config.apiRateLimitMax,
  label: "api",
});
const authRateLimiter = createIpRateLimiter({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  label: "auth",
});

function isSameHostOrigin(origin, req) {
  const rawOrigin = String(origin || "").trim();
  if (!rawOrigin) return true;

  try {
    const originUrl = new URL(rawOrigin);
    const requestHost = String(req.get("x-forwarded-host") || req.get("host") || "")
      .trim()
      .toLowerCase();

    if (!requestHost) return false;
    return originUrl.host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  `connect-src ${connectSrc}`,
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

app.disable("x-powered-by");

app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  next();
});

app.use((req, res, next) => {
  cors((request, callback) => {
    const origin = String(request.get("Origin") || "").trim();
    if (!origin || allowedOrigins.has(origin) || isSameHostOrigin(origin, request)) {
      callback(null, { origin: true });
      return;
    }

    const err = new Error("CORS origin denied");
    err.status = 403;
    callback(err);
  })(req, res, next);
});

app.use(
  express.json({
    limit: config.bodyLimit,
    verify(req, _res, buf) {
      req.rawBody = Buffer.from(buf).toString("utf8");
    },
  })
);
app.use("/api", apiRateLimiter);

app.get("/api/health", (_req, res) => {
  return sendSuccess(res, {
    message: "API хэвийн ажиллаж байна.",
    data: { service: "foodsupply-node-api" },
    extra: { service: "foodsupply-node-api" },
  });
});

app.use("/api/auth", authRateLimiter, authRouter);
app.use("/api/auth/admin", authRateLimiter, adminRouter);
app.use("/api/admin", authRateLimiter, adminRouter);
app.use("/api", stateRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/commissions", commissionsRouter);

app.use(
  express.static(frontendRoot, {
    index: false,
    extensions: ["html"],
  })
);

function sendFrontend(_req, res) {
  res.sendFile(path.join(frontendRoot, "index.html"));
}

app.get("/", sendFrontend);
app.get("/B2B", sendFrontend);
app.get("/B2B/*path", sendFrontend);

app.use((err, _req, res, _next) => {
  const normalized = fromThrownError(err);
  const status = Number(normalized.status || 500);
  if (status >= 500) {
    // Keep server-side details for terminal logs.
    console.error(err);
  }

  return sendError(res, {
    status,
    message: normalized.message,
    errors: normalized.errors,
    extra: {
      code: normalized.code || undefined,
    },
  });
});

module.exports = { app };
