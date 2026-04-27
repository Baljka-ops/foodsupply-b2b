const express = require("express");
const { config } = require("../config");
const { CommissionStatement } = require("../models/CommissionStatement");
const { resolveActorFromRequest } = require("../utils/auth");
const { readCurrentState } = require("../utils/stateStore");
const {
  createInvoice,
  checkInvoicePaid,
  resolvePlatformReceiverCode,
} = require("../utils/qpayClient");

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

function parseMonth(value = "") {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthRange(month) {
  const [year, monthPart] = String(month).split("-").map((part) => Number(part));
  const start = new Date(Date.UTC(year, monthPart - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthPart, 1, 0, 0, 0));
  return { start, end };
}

function isOrderPaid(status) {
  const value = String(status || "").trim().toLowerCase();
  return value.includes("төлөгдсөн") || value.includes("paid") || value.includes("шилжүүлсэн");
}

function toIsoDate(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function inRange(value, start, end) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date < end;
}

function statementToPublic(doc) {
  return {
    id: String(doc._id),
    month: doc.month,
    supplierCompany: doc.supplierCompany,
    currency: doc.currency,
    grossAmount: Number(doc.grossAmount || 0),
    commissionRate: Number(doc.commissionRate || 0),
    commissionAmount: Number(doc.commissionAmount || 0),
    netAmount: Number(doc.netAmount || 0),
    orderCount: Number(doc.orderCount || 0),
    orderIds: Array.isArray(doc.orderIds) ? doc.orderIds : [],
    status: doc.status,
    generatedBy: doc.generatedBy || "",
    generatedAt: doc.generatedAt || "",
    commissionInvoice: doc.commissionInvoice || {},
    updatedAt: toIsoDate(doc.updatedAt),
    createdAt: toIsoDate(doc.createdAt),
  };
}

router.post("/statements/generate", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["admin"]);

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const month = parseMonth(payload.month);
    const { start, end } = monthRange(month);

    const state = await readCurrentState();
    const paidOrders = (state.orders || []).filter((order) => {
      if (!isOrderPaid(order.paymentStatus)) return false;
      const dateValue = order.paymentConfirmedAt || order.qpayPaidAt || order.createdAt;
      return inRange(dateValue, start, end);
    });

    const bySupplier = new Map();
    paidOrders.forEach((order) => {
      const key = normalizeCompany(order.supplierCompany);
      if (!key) return;
      if (!bySupplier.has(key)) {
        bySupplier.set(key, {
          supplierCompany: key,
          grossAmount: 0,
          commissionAmount: 0,
          netAmount: 0,
          orderCount: 0,
          orderIds: [],
          commissionRateSum: 0,
          commissionRateCount: 0,
        });
      }
      const row = bySupplier.get(key);
      const total = Math.max(0, Number(order.total || 0));
      const rate = Math.max(0, Number(order.platformFeeRate || 0));
      const fee = Math.max(
        0,
        Number(
          order.platformFeeAmount ||
            (rate > 0 ? Math.round(total * rate) : 0)
        )
      );
      row.grossAmount += total;
      row.commissionAmount += fee;
      row.netAmount += Math.max(0, total - fee);
      row.orderCount += 1;
      row.orderIds.push(Number(order.id || 0));
      if (rate > 0) {
        row.commissionRateSum += rate;
        row.commissionRateCount += 1;
      }
    });

    const statements = [];
    for (const row of bySupplier.values()) {
      const commissionRate =
        row.commissionRateCount > 0 ? row.commissionRateSum / row.commissionRateCount : 0;

      const updated = await CommissionStatement.findOneAndUpdate(
        {
          month,
          supplierCompany: row.supplierCompany,
        },
        {
          $set: {
            month,
            supplierCompany: row.supplierCompany,
            currency: "MNT",
            grossAmount: row.grossAmount,
            commissionRate,
            commissionAmount: row.commissionAmount,
            netAmount: row.netAmount,
            orderCount: row.orderCount,
            orderIds: row.orderIds.filter((id) => id > 0),
            status: "draft",
            generatedBy: actor.company || "admin",
            generatedAt: new Date().toISOString(),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      ).lean();

      statements.push(statementToPublic(updated));
    }

    return res.json({
      ok: true,
      month,
      count: statements.length,
      statements,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/statements", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["supplier", "admin"]);

    const month = parseMonth(req.query.month);
    const filter = { month };
    if (actor.role === "supplier") {
      filter.supplierCompany = actor.company;
    }

    const rows = await CommissionStatement.find(filter).sort({ supplierCompany: 1 }).lean();
    return res.json({
      ok: true,
      month,
      statements: rows.map(statementToPublic),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/statements/:statementId/invoice", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["admin"]);

    const statementId = String(req.params.statementId || "").trim();
    if (!statementId) {
      return res.status(422).json({ ok: false, error: "statementId is required" });
    }

    const statement = await CommissionStatement.findById(statementId);
    if (!statement) {
      return res.status(404).json({ ok: false, error: "Statement not found" });
    }

    const commissionAmount = Math.max(0, Number(statement.commissionAmount || 0));
    if (commissionAmount <= 0) {
      return res.status(422).json({ ok: false, error: "Commission amount is zero" });
    }

    const receiverCode = resolvePlatformReceiverCode();
    if (!receiverCode) {
      return res.status(422).json({ ok: false, error: "Platform receiver code is not configured" });
    }

    const callbackUrl = `${config.qpayCallbackBaseUrl}/api/commissions/statements/${statementId}/invoice/callback`;
    const invoice = await createInvoice({
      amount: commissionAmount,
      orderId: Date.now(),
      buyerCompany: statement.supplierCompany,
      supplierCompany: "FoodSupply Platform",
      receiverCode,
      callbackUrl,
      description: `Monthly commission ${statement.month} - ${statement.supplierCompany}`,
    });

    statement.status = "invoiced";
    statement.commissionInvoice = {
      invoiceId: String(invoice.invoiceId || ""),
      invoiceNo: String(invoice.invoiceNo || ""),
      qrText: String(invoice.qrText || ""),
      qrImage: String(invoice.qrImage || ""),
      deepLink: String(invoice.deepLink || ""),
      webUrl: String(invoice.webUrl || ""),
      status: "unpaid",
      issuedAt: new Date().toISOString(),
      paidAt: "",
      receiverCode: String(invoice.receiverCode || ""),
      mode: String(invoice.mode || config.qpayMode || "mock"),
    };
    await statement.save();

    return res.status(201).json({
      ok: true,
      statement: statementToPublic(statement.toObject()),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/statements/:statementId/invoice/status", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["supplier", "admin"]);

    const statementId = String(req.params.statementId || "").trim();
    if (!statementId) {
      return res.status(422).json({ ok: false, error: "statementId is required" });
    }

    const statement = await CommissionStatement.findById(statementId);
    if (!statement) {
      return res.status(404).json({ ok: false, error: "Statement not found" });
    }

    if (actor.role === "supplier" && !isSameCompany(statement.supplierCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Statement access denied" });
    }

    const invoiceId = String(statement.commissionInvoice?.invoiceId || "").trim();
    if (!invoiceId) {
      return res.status(422).json({ ok: false, error: "Commission invoice not created" });
    }

    const checked = await checkInvoicePaid(invoiceId);
    if (checked.paid) {
      statement.status = "paid";
      statement.commissionInvoice.status = "paid";
      statement.commissionInvoice.paidAt = new Date().toISOString();
      await statement.save();
    }

    return res.json({
      ok: true,
      paid: Boolean(checked.paid || statement.commissionInvoice?.status === "paid"),
      statement: statementToPublic(statement.toObject()),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/statements/:statementId/invoice/callback", async (req, res, next) => {
  try {
    const callbackSecret = String(config.qpayCallbackSecret || "").trim();
    if (callbackSecret) {
      const provided = String(req.get("x-callback-secret") || req.get("X-Callback-Secret") || "").trim();
      if (!provided || provided !== callbackSecret) {
        return res.status(401).json({ ok: false, error: "Invalid callback secret" });
      }
    }

    const statementId = String(req.params.statementId || "").trim();
    const statement = await CommissionStatement.findById(statementId);
    if (!statement) {
      return res.status(202).json({ ok: true, ignored: true, reason: "statement not found" });
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};
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
      const invoiceId = String(statement.commissionInvoice?.invoiceId || "").trim();
      if (invoiceId) {
        const checked = await checkInvoicePaid(invoiceId);
        paid = Boolean(checked.paid);
      }
    }

    if (paid) {
      statement.status = "paid";
      statement.commissionInvoice.status = "paid";
      statement.commissionInvoice.paidAt = new Date().toISOString();
      await statement.save();
    }

    return res.json({ ok: true, paid });
  } catch (error) {
    next(error);
  }
});

router.post("/statements/:statementId/invoice/mock-pay", async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    ensureAuth(actor, ["supplier", "admin"]);

    if (config.qpayMode === "live") {
      return res.status(403).json({ ok: false, error: "Mock pay is disabled in live mode" });
    }

    const statementId = String(req.params.statementId || "").trim();
    const statement = await CommissionStatement.findById(statementId);
    if (!statement) {
      return res.status(404).json({ ok: false, error: "Statement not found" });
    }
    if (actor.role === "supplier" && !isSameCompany(statement.supplierCompany, actor.company)) {
      return res.status(403).json({ ok: false, error: "Statement access denied" });
    }

    statement.status = "paid";
    statement.commissionInvoice.status = "paid";
    statement.commissionInvoice.paidAt = new Date().toISOString();
    await statement.save();

    return res.json({
      ok: true,
      paid: true,
      statement: statementToPublic(statement.toObject()),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { commissionsRouter: router };
