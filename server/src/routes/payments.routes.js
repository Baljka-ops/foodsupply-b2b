const express = require("express");
const { config } = require("../config");
const { resolveActorFromRequest } = require("../utils/auth");
const { readCurrentState, writeCurrentState } = require("../utils/stateStore");
const { broadcastStateChanged } = require("../utils/stateEvents");
const {
  createInvoice,
  checkInvoicePaid,
  resolveSupplierReceiverCode,
} = require("../utils/qpayClient");
const {
  createInvoice: createBylmnInvoice,
  checkInvoicePaid: checkBylmnInvoicePaid,
  verifyWebhookSignature: verifyBylmnSignature,
  extractWebhookInvoiceId: extractBylmnInvoiceId,
  isWebhookPaymentSuccess: isBylmnPaymentSuccess,
} = require("../utils/bylmnClient");

const router = express.Router();

function normalizeCompany(value) {
  return String(value || "").trim();
}

function isSameCompany(a, b) {
  return normalizeCompany(a).toLowerCase() === normalizeCompany(b).toLowerCase();
}

function resolveActor(req) {
  return resolveActorFromRequest(req, {
    secret: config.authSecret,
    allowLegacyHeaders: true,
  });
}

function ensureAuth(actor, allowedRoles) {
  if (!actor || actor.role === "guest") {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }
  if (!allowedRoles.includes(actor.role)) {
    const error = new Error("Forbidden");
    error.status = 403;
    throw error;
  }
}

function isOrderPaidStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return false;
  return value.includes("төлөгдсөн") || value.includes("paid") || value.includes("шилжүүлсэн");
}

function markOrderPaidFromQPay(order, meta = {}) {
  if (!order || typeof order !== "object") return false;
  const wasPaid = isOrderPaidStatus(order.paymentStatus);
  order.paymentStatus = "Төлөгдсөн";
  order.paymentConfirmedAt = new Date().toISOString();
  order.paymentMethod = "supplier_qpay";
  order.payoutStatus = "Шууд нийлүүлэгч рүү төлсөн";
  order.qpayStatus = "PAID";
  order.qpayPaidAt = new Date().toISOString();
  order.qpayPaidMeta = {
    ...(order.qpayPaidMeta && typeof order.qpayPaidMeta === "object" ? order.qpayPaidMeta : {}),
    ...meta,
    confirmedAt: new Date().toISOString(),
  };
  return !wasPaid;
}

function sanitizeInvoiceSummary(invoice) {
  return {
    invoiceId: String(invoice.invoiceId || "").trim(),
    invoiceNo: String(invoice.invoiceNo || "").trim(),
    qrText: String(invoice.qrText || "").trim(),
    qrImage: String(invoice.qrImage || "").trim(),
    deepLink: String(invoice.deepLink || "").trim(),
    webUrl: String(invoice.webUrl || "").trim(),
    amount: Math.max(0, Number(invoice.amount || 0)),
    receiverCode: String(invoice.receiverCode || "").trim(),
    mode: String(invoice.mode || config.qpayMode || "mock"),
  };
}

function getOrderPayableAmount(order) {
  return Math.max(0, Number(order?.finalAmount ?? order?.totalAmount ?? order?.total ?? 0));
}

function resolveOrderSupplierReceiverCode(state, order) {
  const supplierCompany = normalizeCompany(order?.supplierCompany);
  if (!supplierCompany) return "";

  const stateUsers = Array.isArray(state?.users) ? state.users : [];
  const supplierUser = stateUsers.find(
    (row) => String(row?.role || "").trim().toLowerCase() === "supplier" && isSameCompany(row?.company, supplierCompany)
  );

  const fromUser = String(supplierUser?.qpayReceiverCode || "").trim();
  if (fromUser) return fromUser;

  return resolveSupplierReceiverCode(supplierCompany);
}

function applyInvoiceToOrder(order, invoice) {
  const summary = sanitizeInvoiceSummary(invoice);
  order.paymentMethod = "supplier_qpay";
  order.qpayInvoiceId = summary.invoiceId;
  order.qpayInvoiceNo = summary.invoiceNo;
  order.qpayQrText = summary.qrText;
  order.qpayQrImage = summary.qrImage;
  order.qpayDeepLink = summary.deepLink;
  order.qpayWebUrl = summary.webUrl;
  order.qpayReceiverCode = summary.receiverCode;
  order.qpayStatus = "PENDING";
  order.qpayMode = summary.mode;
  order.paymentRequestedAt = new Date().toISOString();
  return summary;
}

function markOrderPaidFromBylo(order, meta = {}) {
  if (!order || typeof order !== "object") return false;
  const wasPaid = isOrderPaidStatus(order.paymentStatus);
  order.paymentStatus = "Төлөгдсөн";
  order.paymentConfirmedAt = new Date().toISOString();
  order.paymentMethod = "supplier_bylo";
  order.payoutStatus = "Шууд нийлүүлэгч рүү төлсөн";
  order.bylnStatus = "PAID";
  order.bylnPaidAt = new Date().toISOString();
  order.bylnPaidMeta = {
    ...(order.bylnPaidMeta && typeof order.bylnPaidMeta === "object" ? order.bylnPaidMeta : {}),
    ...meta,
    confirmedAt: new Date().toISOString(),
  };
  return !wasPaid;
}

function sanitizeBylnInvoiceSummary(invoice) {
  return {
    invoiceId: String(invoice.invoiceId || "").trim(),
    invoiceNo: String(invoice.invoiceNo || "").trim(),
    invoiceUrl: String(invoice.invoiceUrl || invoice.webUrl || "").trim(),
    qrText: String(invoice.qrText || "").trim(),
    qrImage: String(invoice.qrImage || "").trim(),
    deepLink: String(invoice.deepLink || "").trim(),
    webUrl: String(invoice.invoiceUrl || invoice.webUrl || "").trim(),
    amount: Math.max(0, Number(invoice.amount || 0)),
    mode: String(invoice.mode || config.bylmnMode || "mock"),
    provider: "byl",
  };
}

function resolveOrderSupplierBankAccount(state, order) {
  const supplierCompany = normalizeCompany(order?.supplierCompany);
  if (!supplierCompany) return "";

  const stateUsers = Array.isArray(state?.users) ? state.users : [];
  const supplierUser = stateUsers.find(
    (row) => String(row?.role || "").trim().toLowerCase() === "supplier" && isSameCompany(row?.company, supplierCompany)
  );

  const fromUser = String(supplierUser?.bankAccount || "").trim();
  if (fromUser) return fromUser;

  const map = config.bylmnSupplierBankAccountMap || {};
  return String(map[supplierCompany] || map[normalizeCompany(supplierCompany).toLowerCase()] || "").trim();
}

// Bank account шаардлагагүй бол был.mn нэхэмжлэх үүсгэхэд хялбар байна
function canCreateBylInvoice() {
  if (config.bylmnMode === "mock") return true;
  return Boolean(config.bylmnProjectId && config.bylmnToken);
}

function applyBylnInvoiceToOrder(order, invoice) {
  const summary = sanitizeBylnInvoiceSummary(invoice);
  order.paymentMethod = "supplier_byl";
  order.bylnInvoiceId = summary.invoiceId;
  order.bylnInvoiceNo = summary.invoiceNo;
  order.bylnInvoiceUrl = summary.invoiceUrl;
  order.bylnQrText = summary.qrText;
  order.bylnQrImage = summary.qrImage;
  order.bylnDeepLink = summary.deepLink;
  order.bylnWebUrl = summary.webUrl;
  order.bylnStatus = "PENDING";
  order.bylnMode = summary.mode;
  order.paymentRequestedAt = new Date().toISOString();
  return summary;
}

router.post("/qpay/invoice", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["buyer", "admin"]);

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = Math.max(1, Number(payload.orderId || 0) || 0);
    if (!orderId) {
      return res.status(422).json({ ok: false, error: "orderId is required" });
    }

    const state = await readCurrentState();
    const order = (state.orders || []).find((row) => Number(row?.id || 0) === orderId);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    if (actor.role === "buyer" && !isSameCompany(order.buyerCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Order access denied" });
    }

    if (isOrderPaidStatus(order.paymentStatus)) {
      return res.json({
        ok: true,
        alreadyPaid: true,
        invoice: sanitizeInvoiceSummary({
          invoiceId: order.qpayInvoiceId,
          invoiceNo: order.qpayInvoiceNo,
          qrText: order.qpayQrText,
          qrImage: order.qpayQrImage,
          deepLink: order.qpayDeepLink,
          webUrl: order.qpayWebUrl,
          amount: getOrderPayableAmount(order),
          receiverCode: order.qpayReceiverCode,
          mode: order.qpayMode || config.qpayMode,
        }),
        order: {
          id: order.id,
          paymentStatus: order.paymentStatus,
        },
      });
    }

    const receiverCode = resolveOrderSupplierReceiverCode(state, order);
    if (!receiverCode) {
      return res.status(422).json({
        ok: false,
        error: "Supplier QPay receiver code is not configured. Update supplier profile first.",
      });
    }

    const callbackUrl = `${config.qpayCallbackBaseUrl}/api/payments/qpay/callback`;
    const invoice = await createInvoice({
      amount: getOrderPayableAmount(order),
      orderId: order.id,
      buyerCompany: order.buyerCompany,
      supplierCompany: order.supplierCompany,
      receiverCode,
      callbackUrl,
      description: `FoodSupply order #${order.id} - ${order.supplierCompany}`,
    });

    const summary = applyInvoiceToOrder(order, invoice);
    await writeCurrentState(state);
    broadcastStateChanged({
      actor: actor.role,
      company: actor.company,
      updatedAt: new Date().toISOString(),
      reason: "qpay_invoice_created",
    });

    return res.status(201).json({
      ok: true,
      invoice: summary,
      order: {
        id: order.id,
        total: getOrderPayableAmount(order),
        supplierCompany: order.supplierCompany,
        paymentStatus: order.paymentStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/qpay/invoice/:invoiceId/status", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["buyer", "supplier", "admin"]);

    const invoiceId = String(req.params.invoiceId || "").trim();
    if (!invoiceId) {
      return res.status(422).json({ ok: false, error: "invoiceId is required" });
    }

    const state = await readCurrentState();
    const order = (state.orders || []).find((row) => String(row?.qpayInvoiceId || "").trim() === invoiceId);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }

    if (actor.role === "buyer" && !isSameCompany(order.buyerCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Invoice access denied" });
    }
    if (actor.role === "supplier" && !isSameCompany(order.supplierCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Invoice access denied" });
    }

    const check = await checkInvoicePaid(invoiceId);
    let changed = false;
    if (check.paid) {
      changed = markOrderPaidFromQPay(order, {
        source: "status-check",
      });
    } else {
      order.qpayStatus = "PENDING";
    }

    if (changed) {
      await writeCurrentState(state);
      broadcastStateChanged({
        actor: actor.role,
        company: actor.company,
        updatedAt: new Date().toISOString(),
        reason: "qpay_payment_paid",
      });
    }

    return res.json({
      ok: true,
      paid: check.paid || isOrderPaidStatus(order.paymentStatus),
      order: {
        id: order.id,
        paymentStatus: order.paymentStatus,
        qpayStatus: order.qpayStatus || (check.paid ? "PAID" : "PENDING"),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/qpay/callback", async (req, res, next) => {
  try {
    const callbackSecret = String(config.qpayCallbackSecret || "").trim();
    if (callbackSecret) {
      const provided = String(req.get("x-callback-secret") || req.get("X-Callback-Secret") || "").trim();
      if (!provided || provided !== callbackSecret) {
        return res.status(401).json({ ok: false, error: "Invalid callback secret" });
      }
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const invoiceId = String(
      payload.invoice_id ||
        payload.invoiceId ||
        payload.object_id ||
        payload.objectId ||
        payload.data?.invoice_id ||
        ""
    ).trim();

    if (!invoiceId) {
      return res.status(202).json({ ok: true, ignored: true, reason: "invoice_id missing" });
    }

    const state = await readCurrentState();
    const order = (state.orders || []).find((row) => String(row?.qpayInvoiceId || "").trim() === invoiceId);
    if (!order) {
      return res.status(202).json({ ok: true, ignored: true, reason: "order not found" });
    }

    const statusRaw = String(
      payload.payment_status ||
        payload.status ||
        payload.state ||
        payload.data?.payment_status ||
        ""
    )
      .trim()
      .toLowerCase();
    const paidFromPayload = statusRaw === "paid" || statusRaw === "success" || statusRaw === "completed";

    let paid = paidFromPayload;
    if (!paid) {
      const checked = await checkInvoicePaid(invoiceId);
      paid = Boolean(checked.paid);
    }

    if (paid) {
      const changed = markOrderPaidFromQPay(order, {
        source: "callback",
      });
      if (changed) {
        await writeCurrentState(state);
        broadcastStateChanged({
          actor: "system",
          company: order.supplierCompany,
          updatedAt: new Date().toISOString(),
          reason: "qpay_callback_paid",
        });
      }
    }

    return res.json({ ok: true, paid });
  } catch (error) {
    next(error);
  }
});

router.post("/qpay/invoice/:invoiceId/mock-pay", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["buyer", "admin"]);

    if (config.qpayMode === "live") {
      return res.status(403).json({ ok: false, error: "Mock pay is disabled in live mode" });
    }

    const invoiceId = String(req.params.invoiceId || "").trim();
    if (!invoiceId) {
      return res.status(422).json({ ok: false, error: "invoiceId is required" });
    }

    const state = await readCurrentState();
    const order = (state.orders || []).find((row) => String(row?.qpayInvoiceId || "").trim() === invoiceId);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }
    if (actor.role === "buyer" && !isSameCompany(order.buyerCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Invoice access denied" });
    }

    const changed = markOrderPaidFromQPay(order, {
      source: "mock-pay",
    });
    if (changed) {
      await writeCurrentState(state);
      broadcastStateChanged({
        actor: actor.role,
        company: actor.company,
        updatedAt: new Date().toISOString(),
        reason: "qpay_mock_paid",
      });
    }

    return res.json({
      ok: true,
      paid: true,
      order: {
        id: order.id,
        paymentStatus: order.paymentStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

// =================== Был.mn төлбөрийн маршрутүүд ===================

router.post("/bylo/invoice", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["buyer", "admin"]);

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = Math.max(1, Number(payload.orderId || 0) || 0);
    if (!orderId) {
      return res.status(422).json({ ok: false, error: "orderId is required" });
    }

    const state = await readCurrentState();
    const order = (state.orders || []).find((row) => Number(row?.id || 0) === orderId);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    if (actor.role === "buyer" && !isSameCompany(order.buyerCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Order access denied" });
    }

    if (isOrderPaidStatus(order.paymentStatus)) {
      return res.json({
        ok: true,
        alreadyPaid: true,
        invoice: sanitizeBylnInvoiceSummary({
          invoiceId: order.bylnInvoiceId,
          invoiceNo: order.bylnInvoiceNo,
          invoiceUrl: order.bylnInvoiceUrl,
          qrText: order.bylnQrText,
          qrImage: order.bylnQrImage,
          deepLink: order.bylnDeepLink,
          webUrl: order.bylnWebUrl,
          amount: getOrderPayableAmount(order),
          mode: order.bylnMode || config.bylmnMode,
        }),
        order: {
          id: order.id,
          paymentStatus: order.paymentStatus,
        },
      });
    }

    if (!canCreateBylInvoice()) {
      return res.status(422).json({
        ok: false,
        error: "Byl.mn тохиргоо дутуу байна. BYL_PROJECT_ID болон BYL_TOKEN-г .env файлд тохируулна уу.",
      });
    }

    const invoice = await createBylmnInvoice({
      amount: getOrderPayableAmount(order),
      orderId: order.id,
      description: `FoodSupply захиалга #${order.id} - ${order.supplierCompany}`,
    });

    const summary = applyBylnInvoiceToOrder(order, invoice);
    await writeCurrentState(state);
    broadcastStateChanged({
      actor: actor.role,
      company: actor.company,
      updatedAt: new Date().toISOString(),
      reason: "bylo_invoice_created",
    });

    return res.status(201).json({
      ok: true,
      invoice: summary,
      order: {
        id: order.id,
        total: getOrderPayableAmount(order),
        supplierCompany: order.supplierCompany,
        paymentStatus: order.paymentStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/bylo/invoice/:invoiceId/status", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["buyer", "supplier", "admin"]);

    const invoiceId = String(req.params.invoiceId || "").trim();
    if (!invoiceId) {
      return res.status(422).json({ ok: false, error: "invoiceId is required" });
    }

    const state = await readCurrentState();
    const order = (state.orders || []).find((row) => String(row?.bylnInvoiceId || "").trim() === invoiceId);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }

    if (actor.role === "buyer" && !isSameCompany(order.buyerCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Invoice access denied" });
    }
    if (actor.role === "supplier" && !isSameCompany(order.supplierCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Invoice access denied" });
    }

    const check = await checkBylmnInvoicePaid(invoiceId);
    let changed = false;
    if (check.paid) {
      changed = markOrderPaidFromBylo(order, {
        source: "status-check",
      });
    } else {
      order.bylnStatus = "PENDING";
    }

    if (changed) {
      await writeCurrentState(state);
      broadcastStateChanged({
        actor: actor.role,
        company: actor.company,
        updatedAt: new Date().toISOString(),
        reason: "bylo_payment_paid",
      });
    }

    return res.json({
      ok: true,
      paid: check.paid || isOrderPaidStatus(order.paymentStatus),
      order: {
        id: order.id,
        paymentStatus: order.paymentStatus,
        bylnStatus: order.bylnStatus || (check.paid ? "PAID" : "PENDING"),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/bylo/callback", async (req, res, next) => {
  try {
    // Byl.mn webhook гарын үсэг шалгах (Byl-Signature header)
    const webhookSecret = String(config.bylmnWebhookSecret || "").trim();
    if (webhookSecret) {
      const signature = String(
        req.get("Byl-Signature") || req.get("byl-signature") || ""
      ).trim();
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const valid = verifyBylmnSignature(rawBody, signature, webhookSecret);
      if (!valid) {
        return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
      }
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};

    // Был.mn invoice.paid event-с invoice ID гаргана
    // { type: "invoice.paid", data: { object: { id, status, ... } } }
    const invoiceId = extractBylmnInvoiceId(payload);

    if (!invoiceId) {
      return res.status(202).json({ ok: true, ignored: true, reason: "invoice_id missing" });
    }

    const state = await readCurrentState();
    const order = (state.orders || []).find((row) => String(row?.bylnInvoiceId || "").trim() === invoiceId);
    if (!order) {
      return res.status(202).json({ ok: true, ignored: true, reason: "order not found" });
    }

    // payload-с эсвэл API-с төлөв шалгана
    const paid = isBylmnPaymentSuccess(payload) || Boolean((await checkBylmnInvoicePaid(invoiceId)).paid);

    if (paid) {
      const changed = markOrderPaidFromBylo(order, { source: "webhook" });
      if (changed) {
        await writeCurrentState(state);
        broadcastStateChanged({
          actor: "system",
          company: order.supplierCompany,
          updatedAt: new Date().toISOString(),
          reason: "byl_webhook_paid",
        });
      }
    }

    // Был.mn HTTP/200 хариу хүлээнэ
    return res.json({ ok: true, paid });
  } catch (error) {
    next(error);
  }
});

router.post("/bylo/invoice/:invoiceId/mock-pay", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["buyer", "admin"]);

    if (config.bylmnMode === "live") {
      return res.status(403).json({ ok: false, error: "Mock pay is disabled in live mode" });
    }

    const invoiceId = String(req.params.invoiceId || "").trim();
    if (!invoiceId) {
      return res.status(422).json({ ok: false, error: "invoiceId is required" });
    }

    const state = await readCurrentState();
    const order = (state.orders || []).find((row) => String(row?.bylnInvoiceId || "").trim() === invoiceId);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }
    if (actor.role === "buyer" && !isSameCompany(order.buyerCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Invoice access denied" });
    }

    const changed = markOrderPaidFromBylo(order, {
      source: "mock-pay",
    });
    if (changed) {
      await writeCurrentState(state);
      broadcastStateChanged({
        actor: actor.role,
        company: actor.company,
        updatedAt: new Date().toISOString(),
        reason: "bylo_mock_paid",
      });
    }

    return res.json({
      ok: true,
      paid: true,
      order: {
        id: order.id,
        paymentStatus: order.paymentStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { paymentsRouter: router };
