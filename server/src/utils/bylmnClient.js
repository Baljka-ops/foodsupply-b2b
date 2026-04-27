const crypto = require("crypto");
const { config } = require("../config");

// =====================================================================
// Был.mn API client
// Docs: https://byl.mn/docs/api/
// Base URL: https://byl.mn/api/v1
// Auth: Authorization: Bearer {BYL_TOKEN}
// Create invoice: POST /api/v1/projects/{PROJECT_ID}/invoices
// Get invoice:    GET  /api/v1/projects/{PROJECT_ID}/invoices/{id}
// Webhook events: invoice.paid, checkout.completed
// Signature:      Byl-Signature header — hash_hmac('sha256', rawBody, secret)
// =====================================================================

function buildAuthHeader() {
  const token = String(config.bylmnToken || "").trim();
  const prefix = String(config.bylmnTokenPrefix || "Bearer").trim();
  if (!token) throw new Error("BYL_TOKEN is not configured");
  return `${prefix} ${token}`;
}

function buildProjectUrl(path) {
  const projectId = String(config.bylmnProjectId || "").trim();
  if (!projectId) throw new Error("BYL_PROJECT_ID is not configured");
  const base = String(config.bylmnBaseUrl || "https://byl.mn/api/v1").trim().replace(/\/+$/, "");
  return `${base}/projects/${projectId}${path}`;
}

// ──────────────────────────────────────────────
// Mock invoice үүсгэх (live mode байхгүй үед)
// ──────────────────────────────────────────────
function createMockInvoice({ amount, orderId, description }) {
  const invoiceId = `byl-mock-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const invoiceNo = `MOCK-ORD${orderId}`;
  const mockUrl = `https://byl.mn/h/invoice/mock-${orderId}/preview`;

  return {
    mode: "mock",
    provider: "byl",
    invoiceId,
    invoiceNo,
    invoiceUrl: mockUrl,
    webUrl: mockUrl,
    qrText: mockUrl,
    qrImage: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(mockUrl)}`,
    deepLink: mockUrl,
    amount: Math.max(0, Number(amount || 0)),
    description: String(description || ""),
    status: "open",
    raw: { mock: true },
  };
}

// ──────────────────────────────────────────────
// Нэхэмжлэх үүсгэх  (live)
// POST /api/v1/projects/{id}/invoices
// Body: { amount, description, auto_advance }
// Response: { data: { id, url, status, number, ... } }
// ──────────────────────────────────────────────
async function createInvoice({ amount, orderId, description }) {
  const mode = String(config.bylmnMode || "mock").trim().toLowerCase();

  if (mode === "mock") {
    return createMockInvoice({ amount, orderId, description });
  }

  try {
    const url = buildProjectUrl("/invoices");
    const body = {
      amount: Math.max(1, Math.round(Number(amount || 0))),
      description: String(description || `FoodSupply захиалга #${orderId}`),
      auto_advance: true,
      merchant_id: config.bylmnMerchantId,
      mcc_code: config.bylmnMcc
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: buildAuthHeader(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      console.error("[bylmn] Invoice үүсгэх алдаа:", response.status, errText);
      // Алдаа гарвал mock-руу унах
      return createMockInvoice({ amount, orderId, description });
    }

    const payload = await response.json();
    const data = payload?.data || payload || {};

    const invoiceId = String(data.id || "").trim();
    const invoiceNo = String(data.number || "").trim();
    const invoiceUrl = String(data.url || data.checkout_url || "").trim();
    // Byl.mn банкны QR код буцаасан бол тэрийг авна, үгүй бол веб линк ашиглана
    const qrText = String(data.qr_string || data.qr_text || data.qr_code || invoiceUrl).trim();

    return {
      mode: "live",
      provider: "byl",
      invoiceId,
      invoiceNo,
      invoiceUrl,
      webUrl: invoiceUrl,
      qrText: qrText,
      qrImage: qrText
        ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrText)}`
        : "",
      deepLink: invoiceUrl,
      amount: Math.max(0, Number(amount || 0)),
      description: String(description || ""),
      status: String(data.status || "open").trim().toLowerCase(),
      raw: data,
    };
  } catch (err) {
    console.error("[bylmn] createInvoice exception:", err.message);
    return createMockInvoice({ amount, orderId, description });
  }
}

// ──────────────────────────────────────────────
// Нэхэмжлэхийн төлөв шалгах (live)
// GET /api/v1/projects/{id}/invoices/{invoiceId}
// Response: { data: { id, status, ... } }
// status === "paid" => төлөгдсөн
// ──────────────────────────────────────────────
async function checkInvoicePaid(invoiceId) {
  const mode = String(config.bylmnMode || "mock").trim().toLowerCase();

  if (mode === "mock") {
    return { paid: false, status: "open" };
  }

  try {
    const url = buildProjectUrl(`/invoices/${encodeURIComponent(invoiceId)}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: buildAuthHeader(),
      },
    });

    if (!response.ok) {
      console.error("[bylmn] Invoice шалгах алдаа:", response.status);
      return { paid: false, status: "unknown" };
    }

    const payload = await response.json();
    const data = payload?.data || payload || {};
    const status = String(data.status || "").trim().toLowerCase();
    const paid = status === "paid";

    return {
      paid,
      status,
      invoiceUrl: String(data.url || "").trim(),
      amount: Number(data.amount || 0),
      raw: data,
    };
  } catch (err) {
    console.error("[bylmn] checkInvoicePaid exception:", err.message);
    return { paid: false, status: "error" };
  }
}

// ──────────────────────────────────────────────
// Webhook гарын үсэг баталгаажуулах
// Byl-Signature header = hash_hmac('sha256', rawBody, secret)
// ──────────────────────────────────────────────
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret) {
    console.warn("[bylmn] BYL_WEBHOOK_SECRET тохируулаагүй байна");
    return true; // secret байхгүй бол шалгалтгүй дамжуулна
  }
  if (!signature) return false;

  try {
    const body = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    const computed = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return computed === signature;
  } catch (err) {
    console.error("[bylmn] verifyWebhookSignature exception:", err.message);
    return false;
  }
}

// ──────────────────────────────────────────────
// Webhook payload-с нэхэмжлэх ID гаргах
// Webhook event: invoice.paid
// { type: "invoice.paid", data: { object: { id, status, ... } } }
// ──────────────────────────────────────────────
function extractWebhookInvoiceId(payload) {
  if (!payload || typeof payload !== "object") return "";

  // invoice.paid event
  const invoiceObj = payload?.data?.object;
  if (invoiceObj && invoiceObj.id) {
    return String(invoiceObj.id).trim();
  }

  // Fallback
  return String(payload?.invoice_id || payload?.id || "").trim();
}

function isWebhookPaymentSuccess(payload) {
  if (!payload || typeof payload !== "object") return false;
  const type = String(payload?.type || "").trim().toLowerCase();
  if (type === "invoice.paid" || type === "checkout.completed") return true;

  // Fallback: data.object.status шалгах
  const status = String(payload?.data?.object?.status || "").trim().toLowerCase();
  return status === "paid" || status === "complete" || status === "completed";
}

module.exports = {
  createInvoice,
  checkInvoicePaid,
  verifyWebhookSignature,
  extractWebhookInvoiceId,
  isWebhookPaymentSuccess,
};
