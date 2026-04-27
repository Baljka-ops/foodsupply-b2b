const crypto = require("crypto");
const { sanitizeRewardSummary } = require("./rewards");

const SUPPORTED_ROLES = new Set(["buyer", "supplier", "admin"]);
const SUPPLIER_VERIFICATION_STATUSES = new Set(["pending", "verified", "rejected", "suspended"]);

function normalizeRole(value, fallback = "buyer") {
  const role = String(value || "").trim().toLowerCase();
  return SUPPORTED_ROLES.has(role) ? role : fallback;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCompany(value) {
  return String(value || "").trim();
}

function normalizeSupplierVerificationStatus(value, fallback = "verified") {
  const status = String(value || "").trim().toLowerCase();
  if (SUPPLIER_VERIFICATION_STATUSES.has(status)) return status;

  const fallbackStatus = String(fallback || "").trim().toLowerCase();
  if (SUPPLIER_VERIFICATION_STATUSES.has(fallbackStatus)) return fallbackStatus;
  return "";
}

function maskBankAccount(value) {
  const clean = String(value || "").replace(/\s+/g, "");
  if (!clean) return "";
  if (clean.length <= 4) return clean;
  return `${"*".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

function encodeBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
}

function signSegment(payloadB64, secret) {
  return encodeBase64Url(crypto.createHmac("sha256", String(secret || "")).update(payloadB64).digest());
}

function safeCompare(a, b) {
  const aBuf = Buffer.from(String(a || ""));
  const bBuf = Buffer.from(String(b || ""));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function issueAuthToken(user, secret, ttlSec = 60 * 60 * 24 * 7) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    uid: Number(user?.id || 0),
    role: normalizeRole(user?.role),
    company: normalizeCompany(user?.company),
    email: normalizeEmail(user?.email),
    iat: now,
    exp: now + Math.max(60, Number(ttlSec || 0) || 0),
  };

  const payloadB64 = encodeBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = signSegment(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

function verifyAuthToken(token, secret) {
  const raw = String(token || "").trim();
  if (!raw || !raw.includes(".")) return null;

  const [payloadB64, signature] = raw.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSignature = signSegment(payloadB64, secret);
  if (!safeCompare(signature, expectedSignature)) return null;

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const exp = Number(payload.exp || 0);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  const role = normalizeRole(payload.role, "guest");
  const company = normalizeCompany(payload.company);
  const email = normalizeEmail(payload.email);
  const uid = Math.max(0, Number(payload.uid || 0) || 0);

  if (!SUPPORTED_ROLES.has(role)) return null;
  if ((role === "buyer" || role === "supplier") && !company) return null;

  return {
    uid,
    role,
    company,
    email,
    exp,
    iat: Number(payload.iat || 0),
  };
}

function getBearerToken(req) {
  const auth = String(req?.get?.("Authorization") || req?.get?.("authorization") || "").trim();
  if (!auth) return "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

function readCompanyFromHeaders(req) {
  const encoded = String(
    req?.get?.("X-B2B-Company-URI") || req?.get?.("x-b2b-company-uri") || ""
  ).trim();
  if (encoded) {
    try {
      return normalizeCompany(decodeURIComponent(encoded));
    } catch {
      // Fallback to raw header value below.
    }
  }
  return normalizeCompany(req?.get?.("X-B2B-Company") || req?.get?.("x-b2b-company") || "");
}

function resolveActorFromRequest(req, { secret, allowLegacyHeaders = true } = {}) {
  const token = getBearerToken(req);
  if (token) {
    const parsed = verifyAuthToken(token, secret);
    if (parsed) {
      return {
        role: parsed.role,
        company: parsed.company,
        userId: parsed.uid,
        email: parsed.email,
        via: "token",
      };
    }
  }

  if (allowLegacyHeaders) {
    const rawRole = String(req?.get?.("X-B2B-Role") || req?.get?.("x-b2b-role") || "guest").trim().toLowerCase();
    const role = SUPPORTED_ROLES.has(rawRole) ? rawRole : "guest";
    const company = readCompanyFromHeaders(req);

    if (role === "admin") return { role, company, userId: 0, email: "", via: "header" };
    if ((role === "buyer" || role === "supplier") && company) {
      return { role, company, userId: 0, email: "", via: "header" };
    }
  }

  return { role: "guest", company: "", userId: 0, email: "", via: "none" };
}

function hashPassword(plainText) {
  const plain = String(plainText || "");
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, 32);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function verifyPassword(plainText, storedHash) {
  const plain = String(plainText || "");
  const stored = String(storedHash || "");

  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return { ok: false, needsRehash: false };

    const saltHex = parts[1];
    const hashHex = parts[2];
    if (!saltHex || !hashHex) return { ok: false, needsRehash: false };

    try {
      const salt = Buffer.from(saltHex, "hex");
      const expected = Buffer.from(hashHex, "hex");
      const actual = crypto.scryptSync(plain, salt, expected.length);
      return {
        ok: expected.length === actual.length && crypto.timingSafeEqual(expected, actual),
        needsRehash: false,
      };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }

  if (stored.startsWith("sha256$")) {
    const expected = stored.slice("sha256$".length).toLowerCase();
    const actual = sha256Hex(plain);
    return {
      ok: safeCompare(expected, actual),
      needsRehash: true,
    };
  }

  return {
    ok: safeCompare(stored, plain),
    needsRehash: true,
  };
}

function toPublicUser(user) {
  const role = normalizeRole(user?.role);
  const rewards = sanitizeRewardSummary(user);
  return {
    id: Number(user?.id || 0),
    role,
    company: normalizeCompany(user?.company),
    companyName: normalizeCompany(user?.companyName || user?.company),
    email: normalizeEmail(user?.email),
    registerNumber: String(user?.registerNumber || "").trim(),
    contactName: String(user?.contactName || "").trim(),
    contactPersonName: String(user?.contactPersonName || user?.contactName || "").trim(),
    phone: String(user?.phone || "").trim(),
    contactPersonPhone: String(user?.contactPersonPhone || "").trim(),
    contactPersonEmail: normalizeEmail(user?.contactPersonEmail || ""),
    address: String(user?.address || "").trim(),
    businessType: String(user?.businessType || "").trim(),
    bankName: String(user?.bankName || "").trim(),
    bankAccountName: String(user?.bankAccountName || "").trim(),
    bankAccountMasked: maskBankAccount(user?.bankAccountNumber),
    qpayReceiverCode: String(user?.qpayReceiverCode || "").trim(),
    supplierAgreementAccepted: Boolean(user?.supplierAgreementAccepted || false),
    supplierAgreementAcceptedAt: String(user?.supplierAgreementAcceptedAt || "").trim(),
    verificationStatus: normalizeSupplierVerificationStatus(
      user?.verificationStatus,
      role === "supplier" ? "verified" : ""
    ),
    verificationNote: String(user?.verificationNote || "").trim(),
    verifiedAt: String(user?.verifiedAt || "").trim(),
    verifiedBy: String(user?.verifiedBy || "").trim(),
    rewardPoints: rewards.rewardPoints,
    totalEarnedPoints: rewards.totalEarnedPoints,
    totalUsedPoints: rewards.totalUsedPoints,
    createdAt: String(user?.createdAt || new Date().toISOString()),
  };
}

module.exports = {
  normalizeRole,
  normalizeEmail,
  normalizeCompany,
  normalizeSupplierVerificationStatus,
  issueAuthToken,
  verifyAuthToken,
  resolveActorFromRequest,
  hashPassword,
  verifyPassword,
  toPublicUser,
};
