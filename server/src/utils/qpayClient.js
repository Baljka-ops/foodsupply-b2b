const crypto = require("crypto");
const { config } = require("../config");

function normalizeCompany(value) {
  return String(value || "").trim();
}

function normalizeCompanyKey(value) {
  return normalizeCompany(value).toLowerCase();
}

function buildMockQrImageUrl(qrText) {
  const encoded = encodeURIComponent(String(qrText || ""));
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encoded}`;
}

function resolveSupplierReceiverCode(supplierCompany) {
  const company = normalizeCompany(supplierCompany);
  if (!company) return "";
  const map = config.qpaySupplierReceiverMap || {};
  const fromMap = map[company] || map[normalizeCompanyKey(company)];
  return String(fromMap || config.qpayDefaultReceiverCode || "").trim();
}

function resolvePlatformReceiverCode() {
  return String(config.qpayPlatformReceiverCode || config.qpayDefaultReceiverCode || "").trim();
}

function createMockInvoice({
  amount,
  orderId,
  supplierCompany,
  description,
  receiverCode,
}) {
  const invoiceId = `mock-inv-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const invoiceNo = `ORD-${orderId}-${Date.now()}`;
  const qrText = `qpay://invoice/${invoiceId}?amount=${amount}&receiver=${encodeURIComponent(receiverCode || supplierCompany || "supplier")}`;
  return {
    mode: "mock",
    invoiceId,
    invoiceNo,
    qrText,
    qrImage: buildMockQrImageUrl(qrText),
    deepLink: qrText,
    webUrl: qrText,
    amount: Math.max(0, Number(amount || 0)),
    receiverCode: String(receiverCode || ""),
    supplierCompany: normalizeCompany(supplierCompany),
    description: String(description || ""),
    raw: {
      mock: true,
    },
  };
}

function extractToken(payload) {
  const candidates = [
    payload?.access_token,
    payload?.token,
    payload?.auth_token,
    payload?.accessToken,
  ];
  return String(candidates.find((value) => value) || "").trim();
}

async function fetchQPayToken() {
  const staticToken = String(config.qpayStaticToken || "").trim();
  if (staticToken) {
    return staticToken;
  }

  const username = String(config.qpayUsername || "").trim();
  const password = String(config.qpayPassword || "").trim();
  if (!username || !password) {
    throw new Error("QPAY credentials are missing (set QPAY_STATIC_TOKEN or QPAY_USERNAME/QPAY_PASSWORD)");
  }

  const basic = Buffer.from(`${username}:${password}`).toString("base64");
  const tokenUrl = `${config.qpayBaseUrl}/auth/token`;

  // Attempt #1: basic auth without body.
  let response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!response.ok) {
    // Attempt #2: send username/password JSON body.
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = String(payload?.error || payload?.message || response.statusText || "QPay token failed");
    throw new Error(details);
  }

  const token = extractToken(payload);
  if (!token) {
    throw new Error("QPay token missing in response");
  }

  return token;
}

function normalizeInvoiceResponse(payload, fallback = {}) {
  const invoiceId = String(
    payload?.invoice_id ||
      payload?.invoiceId ||
      payload?.id ||
      fallback.invoiceId ||
      ""
  ).trim();
  const invoiceNo = String(payload?.sender_invoice_no || payload?.invoice_no || payload?.invoiceNo || fallback.invoiceNo || "").trim();
  const qrText = String(payload?.qr_text || payload?.qrText || payload?.qrCode || fallback.qrText || "").trim();
  const qrImage = String(payload?.qr_image || payload?.qrImage || payload?.qr_image_url || fallback.qrImage || "").trim();

  const urlCandidates = [];
  if (Array.isArray(payload?.urls)) {
    payload.urls.forEach((row) => {
      if (!row || typeof row !== "object") return;
      if (row.link) urlCandidates.push(String(row.link).trim());
      if (row.url) urlCandidates.push(String(row.url).trim());
    });
  }
  const deepLink = String(payload?.deeplink || payload?.deep_link || payload?.deepLink || urlCandidates[0] || "").trim();
  const webUrl = String(payload?.url || payload?.web_url || payload?.webUrl || urlCandidates[1] || deepLink || "").trim();

  return {
    invoiceId,
    invoiceNo,
    qrText,
    qrImage,
    deepLink,
    webUrl,
  };
}

async function createInvoice({
  amount,
  orderId,
  buyerCompany,
  supplierCompany,
  receiverCode,
  callbackUrl,
  description = "",
}) {
  const safeAmount = Math.max(0, Number(amount || 0));
  const safeOrderId = Math.max(1, Number(orderId || 0) || 1);
  const invoiceNo = `ORD-${safeOrderId}-${Date.now()}`;
  const desc = String(description || `Order #${safeOrderId} from ${buyerCompany || "buyer"} to ${supplierCompany || "supplier"}`).trim();

  if (config.qpayMode !== "live") {
    return createMockInvoice({
      amount: safeAmount,
      orderId: safeOrderId,
      supplierCompany,
      description: desc,
      receiverCode,
    });
  }

  const invoiceCode = String(config.qpayInvoiceCode || "").trim();
  if (!invoiceCode) {
    throw new Error("QPAY_INVOICE_CODE is missing");
  }

  const token = await fetchQPayToken();
  const url = `${config.qpayBaseUrl}/invoice`;
  const body = {
    invoice_code: invoiceCode,
    sender_invoice_no: invoiceNo,
    invoice_receiver_code: String(receiverCode || "").trim(),
    invoice_description: desc,
    amount: safeAmount,
    callback_url: String(callbackUrl || "").trim(),
    allow_partial: false,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `${config.qpayTokenPrefix || "Bearer"} ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = String(payload?.error || payload?.message || response.statusText || "QPay invoice failed");
    throw new Error(details);
  }

  const normalized = normalizeInvoiceResponse(payload, { invoiceNo });
  if (!normalized.invoiceId) {
    throw new Error("QPay invoice id missing");
  }

  return {
    mode: "live",
    ...normalized,
    amount: safeAmount,
    receiverCode: String(receiverCode || "").trim(),
    supplierCompany: normalizeCompany(supplierCompany),
    description: desc,
    raw: payload,
  };
}

function normalizePaymentRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.payments)) return payload.payments;
  if (Array.isArray(payload?.payment_list)) return payload.payment_list;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function isPaidPayload(payload) {
  const rows = normalizePaymentRows(payload);
  if (!rows.length) return false;
  return rows.some((row) => {
    const state = String(row?.payment_status || row?.status || row?.state || "").trim().toLowerCase();
    return state === "paid" || state === "success" || state === "completed";
  });
}

async function checkInvoicePaid(invoiceId) {
  const safeInvoiceId = String(invoiceId || "").trim();
  if (!safeInvoiceId) return { paid: false, mode: config.qpayMode, raw: null };

  if (config.qpayMode !== "live") {
    return {
      paid: false,
      mode: "mock",
      raw: { mock: true, invoice_id: safeInvoiceId },
    };
  }

  const token = await fetchQPayToken();
  const url = `${config.qpayBaseUrl}/payment/check`;
  const body = {
    object_type: "INVOICE",
    object_id: safeInvoiceId,
    offset: {
      page_number: 1,
      page_limit: 100,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `${config.qpayTokenPrefix || "Bearer"} ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = String(payload?.error || payload?.message || response.statusText || "QPay payment check failed");
    throw new Error(details);
  }

  return {
    paid: isPaidPayload(payload),
    mode: "live",
    raw: payload,
  };
}

module.exports = {
  createInvoice,
  checkInvoicePaid,
  resolveSupplierReceiverCode,
  resolvePlatformReceiverCode,
};
