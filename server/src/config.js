const dotenv = require("dotenv");

dotenv.config();

const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const port = Number(process.env.PORT || 5000);
const defaultOrigins = [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  "http://localhost",
  "http://127.0.0.1",
];

const allowedOrigins = String(process.env.CORS_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function parseJsonObject(value, fallback = {}) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/foodsupply_b2b",
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 4000),
  bodyLimit: process.env.BODY_LIMIT || "8mb",
  allowedOrigins,
  authSecret: process.env.AUTH_SECRET || "dev-change-me-foodsupply-auth-secret",
  authTokenTtlSec: Number(process.env.AUTH_TOKEN_TTL_SEC || 60 * 60 * 24 * 7),

  seedSystemUsers: String(process.env.SEED_SYSTEM_USERS || "true").trim().toLowerCase() !== "false",
  seedBuyerEmail: String(process.env.SEED_BUYER_EMAIL || "buyer@foodsupply.mn").trim().toLowerCase(),
  seedBuyerPassword: String(process.env.SEED_BUYER_PASSWORD || "Buyer@12345"),
  seedBuyerCompany: String(process.env.SEED_BUYER_COMPANY || "Мини маркет-01").trim(),
  seedBuyerContactName: String(process.env.SEED_BUYER_CONTACT_NAME || "Buyer Owner").trim(),
  seedBuyerPhone: String(process.env.SEED_BUYER_PHONE || "99001122").trim(),
  seedBuyerAddress: String(process.env.SEED_BUYER_ADDRESS || "Улаанбаатар").trim(),

  seedSupplierEmail: String(process.env.SEED_SUPPLIER_EMAIL || "supplier@foodsupply.mn").trim().toLowerCase(),
  seedSupplierPassword: String(process.env.SEED_SUPPLIER_PASSWORD || "Supplier@12345"),
  seedSupplierCompany: String(process.env.SEED_SUPPLIER_COMPANY || "Талх Трейд ХХК").trim(),
  seedSupplierContactName: String(process.env.SEED_SUPPLIER_CONTACT_NAME || "Supplier Manager").trim(),
  seedSupplierPhone: String(process.env.SEED_SUPPLIER_PHONE || "99112233").trim(),
  seedSupplierAddress: String(process.env.SEED_SUPPLIER_ADDRESS || "Улаанбаатар").trim(),
  seedSupplierQPayReceiverCode: String(process.env.SEED_SUPPLIER_QPAY_RECEIVER_CODE || process.env.QPAY_DEFAULT_RECEIVER_CODE || "").trim(),
  seedSupplierBankAccount: String(process.env.SEED_SUPPLIER_BANK_ACCOUNT || "").trim(),

  seedAdminEmail: String(process.env.SEED_ADMIN_EMAIL || "admin@foodsupply.mn").trim().toLowerCase(),
  seedAdminPassword: String(process.env.SEED_ADMIN_PASSWORD || "Admin@12345"),
  seedAdminCompany: String(process.env.SEED_ADMIN_COMPANY || "Систем Админ").trim(),
  seedAdminContactName: String(process.env.SEED_ADMIN_CONTACT_NAME || "System Admin").trim(),
  seedAdminPhone: String(process.env.SEED_ADMIN_PHONE || "00000000").trim(),
  seedAdminAddress: String(process.env.SEED_ADMIN_ADDRESS || "System").trim(),
  seedAdmin2Email: String(process.env.SEED_ADMIN2_EMAIL || "admin@example.com").trim().toLowerCase(),
  seedAdmin2Password: String(process.env.SEED_ADMIN2_PASSWORD || "admin123"),
  seedAdmin2Company: String(process.env.SEED_ADMIN2_COMPANY || "Систем Админ").trim(),
  seedAdmin2ContactName: String(process.env.SEED_ADMIN2_CONTACT_NAME || "System Admin").trim(),
  seedAdmin2Phone: String(process.env.SEED_ADMIN2_PHONE || "00000000").trim(),
  seedAdmin2Address: String(process.env.SEED_ADMIN2_ADDRESS || "System").trim(),

  allowLegacyRoleHeaders: String(process.env.ALLOW_LEGACY_ROLE_HEADERS || "false").trim().toLowerCase() === "true",
  apiRateLimitWindowMs: Math.max(1000, Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000) || 60_000),
  apiRateLimitMax: Math.max(20, Number(process.env.API_RATE_LIMIT_MAX || 240) || 240),
  authRateLimitWindowMs: Math.max(1000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000) || 60_000),
  authRateLimitMax: Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX || 20) || 20),

  qpayMode: String(process.env.QPAY_MODE || "mock").trim().toLowerCase(),
  qpayBaseUrl: String(process.env.QPAY_BASE_URL || "https://merchant.qpay.mn/v2").trim().replace(/\/+$/, ""),
  qpayUsername: String(process.env.QPAY_USERNAME || "").trim(),
  qpayPassword: String(process.env.QPAY_PASSWORD || "").trim(),
  qpayStaticToken: String(process.env.QPAY_STATIC_TOKEN || "").trim(),
  qpayTokenPrefix: String(process.env.QPAY_TOKEN_PREFIX || "Bearer").trim(),
  qpayInvoiceCode: String(process.env.QPAY_INVOICE_CODE || "").trim(),
  qpayCallbackBaseUrl: String(process.env.QPAY_CALLBACK_BASE_URL || `http://localhost:${port}`).trim().replace(/\/+$/, ""),
  qpayCallbackSecret: String(process.env.QPAY_CALLBACK_SECRET || "").trim(),
  qpayDefaultReceiverCode: String(process.env.QPAY_DEFAULT_RECEIVER_CODE || "").trim(),
  qpayPlatformReceiverCode: String(process.env.QPAY_PLATFORM_RECEIVER_CODE || "").trim(),
  qpaySupplierReceiverMap: parseJsonObject(process.env.QPAY_SUPPLIER_RECEIVER_MAP, {}),

  // Был.mn төлбөрийн тохиргоо
  bylmnMode: String(process.env.BYL_MODE || "mock").trim().toLowerCase(),
  bylmnBaseUrl: String(process.env.BYL_BASE_URL || "https://byl.mn/api/v1").trim().replace(/\/+$/, ""),
  bylmnProjectId: String(process.env.BYL_PROJECT_ID || "").trim(),
  bylmnToken: String(process.env.BYL_TOKEN || "").trim(),
  bylmnTokenPrefix: String(process.env.BYL_TOKEN_PREFIX || "Bearer").trim(),
  bylmnMerchantId: String(process.env.BYL_MERCHANT_ID || "").trim(),
  bylmnMcc: String(process.env.BYL_MCC_CODE || "").trim(),
  bylmnCallbackUrl: String(process.env.BYL_CALLBACK_BASE_URL || `http://localhost:${port}`).trim().replace(/\/+$/, "") + "/api/payments/bylo/callback",
  bylmnWebhookSecret: String(process.env.BYL_WEBHOOK_SECRET || "").trim(),
  bylmnSupplierBankAccountMap: parseJsonObject(process.env.BYL_SUPPLIER_BANK_ACCOUNT_MAP, {}),
};

module.exports = { config };
