const express = require("express");
const { User } = require("../models/User");
const { normalizeSupplierVerificationStatus, toPublicUser } = require("../utils/auth");
const { requireAuth, requireRole } = require("../utils/accessControl");
const { ApiError, sendSuccess } = require("../utils/http");
const { cleanText, validateCouponPayload, validateVerificationDecisionPayload } = require("../utils/validation");
const {
  appendVerificationHistoryEntry,
  normalizeVerificationHistory,
} = require("../utils/verificationAudit");
const { readCurrentState, writeCurrentState } = require("../utils/stateStore");
const { broadcastStateChanged } = require("../utils/stateEvents");
const { normalizeCouponCode, normalizeCouponRecord } = require("../utils/coupons");

const router = express.Router();

function toAdminSupplierView(user) {
  const publicUser = toPublicUser(user);
  return {
    ...publicUser,
    companyName: cleanText(user?.companyName || user?.company || publicUser.companyName, 190),
    registerNumber: cleanText(user?.registerNumber || publicUser.registerNumber, 80),
    contactPersonName: cleanText(user?.contactPersonName || user?.contactName || publicUser.contactPersonName, 190),
    contactPersonPhone: cleanText(user?.contactPersonPhone || user?.phone || publicUser.contactPersonPhone, 40),
    contactPersonEmail: cleanText(user?.contactPersonEmail || user?.email || publicUser.contactPersonEmail, 190).toLowerCase(),
    bankName: cleanText(user?.bankName || publicUser.bankName, 120),
    bankAccountName: cleanText(user?.bankAccountName || publicUser.bankAccountName, 190),
    bankAccountNumber: cleanText(user?.bankAccountNumber || "", 80),
    bankAccount: cleanText(user?.bankAccount || "", 120),
    qpayReceiverCode: cleanText(user?.qpayReceiverCode || publicUser.qpayReceiverCode, 120),
    supplierAgreementAccepted: Boolean(user?.supplierAgreementAccepted || publicUser.supplierAgreementAccepted || false),
    supplierAgreementAcceptedAt: cleanText(user?.supplierAgreementAcceptedAt || publicUser.supplierAgreementAcceptedAt, 80),
    verificationStatus: normalizeSupplierVerificationStatus(user?.verificationStatus, "pending"),
    verificationNote: cleanText(user?.verificationNote, 500),
    verifiedAt: cleanText(user?.verifiedAt, 80),
    verifiedBy: cleanText(user?.verifiedBy, 190),
    verificationHistory: normalizeVerificationHistory(user?.verificationHistory),
  };
}

function summarizeSuppliers(suppliers) {
  const summary = {
    total: suppliers.length,
    pending: 0,
    verified: 0,
    rejected: 0,
    suspended: 0,
  };

  suppliers.forEach((supplier) => {
    const status = normalizeSupplierVerificationStatus(supplier.verificationStatus, "pending");
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }
  });

  return summary;
}

function summarizeCoupons(coupons) {
  const normalized = Array.isArray(coupons) ? coupons : [];
  const active = normalized.filter((coupon) => coupon.isActive).length;
  return {
    total: normalized.length,
    active,
    inactive: normalized.length - active,
    used: normalized.reduce((sum, coupon) => sum + Math.max(0, Number(coupon.usedCount || 0)), 0),
  };
}

router.use(requireAuth());
router.use(requireRole("admin"));

router.get("/suppliers", async (req, res, next) => {
  try {
    const statusFilterRaw = String(req.query.status || "all").trim().toLowerCase();
    const statusFilter = statusFilterRaw === "all" ? "" : normalizeSupplierVerificationStatus(statusFilterRaw, "pending");

    const suppliers = await User.find({ role: "supplier" }).sort({ createdAt: -1, id: -1 }).lean();
    const normalized = suppliers.map(toAdminSupplierView);
    const filtered = statusFilter ? normalized.filter((supplier) => supplier.verificationStatus === statusFilter) : normalized;

    return sendSuccess(res, {
      message: "Нийлүүлэгчдийн жагсаалт амжилттай уншигдлаа.",
      data: {
        suppliers: filtered,
        summary: summarizeSuppliers(normalized),
      },
      extra: {
        suppliers: filtered,
        summary: summarizeSuppliers(normalized),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/suppliers/:supplierId", async (req, res, next) => {
  try {
    const supplierId = Math.max(1, Number(req.params.supplierId || 0) || 0);
    if (!supplierId) {
      throw new ApiError(400, "supplierId буруу байна.", [{ field: "supplierId", message: "supplierId шаардлагатай." }]);
    }

    const supplier = await User.findOne({ id: supplierId, role: "supplier" }).lean();
    if (!supplier) {
      throw new ApiError(404, "Нийлүүлэгч олдсонгүй.");
    }

    return sendSuccess(res, {
      message: "Нийлүүлэгчийн дэлгэрэнгүй амжилттай уншигдлаа.",
      data: { supplier: toAdminSupplierView(supplier) },
      extra: { supplier: toAdminSupplierView(supplier) },
    });
  } catch (error) {
    next(error);
  }
});

async function changeSupplierVerification(req, res, nextStatus, { noteRequired = false } = {}) {
  const supplierId = Math.max(1, Number(req.params.supplierId || 0) || 0);
  if (!supplierId) {
    throw new ApiError(400, "supplierId буруу байна.", [{ field: "supplierId", message: "supplierId шаардлагатай." }]);
  }

  const decision = validateVerificationDecisionPayload(req.body, { noteRequired });
  if (decision.errors.length > 0) {
    throw new ApiError(400, "Тайлбарын мэдээлэл буруу байна.", decision.errors);
  }

  const supplier = await User.findOne({ id: supplierId, role: "supplier" });
  if (!supplier) {
    throw new ApiError(404, "Нийлүүлэгч олдсонгүй.");
  }

  const fromStatus = normalizeSupplierVerificationStatus(supplier.verificationStatus, "pending");
  const toStatus = normalizeSupplierVerificationStatus(nextStatus, "pending");
  const nowIso = new Date().toISOString();
  const changedBy = cleanText(
    req.actorUser?.companyName || req.actorUser?.company || req.actorUser?.email || req.actor?.email || "admin",
    190
  );

  supplier.verificationStatus = toStatus;
  supplier.verificationNote = toStatus === "verified" ? "" : decision.value.note;
  supplier.verifiedBy = changedBy;
  supplier.verifiedAt = toStatus === "verified" ? nowIso : "";

  appendVerificationHistoryEntry(supplier, {
    action: toStatus === "verified" ? "verify" : toStatus === "rejected" ? "reject" : "suspend",
    fromStatus,
    toStatus,
    note: supplier.verificationNote,
    changedBy,
    changedAt: nowIso,
  });

  await supplier.save();

  const nextState = await readCurrentState();
  await writeCurrentState(nextState);

  broadcastStateChanged({
    actor: req.actor?.role || "admin",
    company: req.actor?.company || "",
    action: "supplier-verification",
    supplierId,
    status: supplier.verificationStatus,
    updatedAt: nowIso,
  });

  return sendSuccess(res, {
    message:
      toStatus === "verified"
        ? "Нийлүүлэгч амжилттай баталгаажлаа."
        : toStatus === "rejected"
          ? "Нийлүүлэгчийн хүсэлт татгалзагдлаа."
          : "Нийлүүлэгч түр түдгэлзлээ.",
    data: {
      supplier: toAdminSupplierView(supplier),
      updatedAt: nowIso,
    },
    extra: {
      supplier: toAdminSupplierView(supplier),
      updatedAt: nowIso,
    },
  });
}

router.patch("/suppliers/:supplierId/verify", async (req, res, next) => {
  try {
    return await changeSupplierVerification(req, res, "verified", { noteRequired: false });
  } catch (error) {
    next(error);
  }
});

router.patch("/suppliers/:supplierId/reject", async (req, res, next) => {
  try {
    return await changeSupplierVerification(req, res, "rejected", { noteRequired: true });
  } catch (error) {
    next(error);
  }
});

router.patch("/suppliers/:supplierId/suspend", async (req, res, next) => {
  try {
    return await changeSupplierVerification(req, res, "suspended", { noteRequired: true });
  } catch (error) {
    next(error);
  }
});

router.post("/suppliers/:supplierId/verify", async (req, res, next) => {
  try {
    return await changeSupplierVerification(req, res, "verified", { noteRequired: false });
  } catch (error) {
    next(error);
  }
});

router.post("/suppliers/:supplierId/reject", async (req, res, next) => {
  try {
    return await changeSupplierVerification(req, res, "rejected", { noteRequired: true });
  } catch (error) {
    next(error);
  }
});

router.post("/suppliers/:supplierId/suspend", async (req, res, next) => {
  try {
    return await changeSupplierVerification(req, res, "suspended", { noteRequired: true });
  } catch (error) {
    next(error);
  }
});

router.get("/coupons", async (_req, res, next) => {
  try {
    const state = await readCurrentState();
    const coupons = Array.isArray(state.coupons) ? state.coupons : [];
    return sendSuccess(res, {
      message: "Coupon жагсаалт амжилттай уншигдлаа.",
      data: {
        coupons,
        summary: summarizeCoupons(coupons),
      },
      extra: {
        coupons,
        summary: summarizeCoupons(coupons),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/coupons", async (req, res, next) => {
  try {
    const { errors, value } = validateCouponPayload(req.body);
    if (errors.length > 0) {
      throw new ApiError(400, "Coupon мэдээлэл буруу байна.", errors);
    }

    const state = await readCurrentState();
    const coupons = Array.isArray(state.coupons) ? state.coupons : [];
    const code = normalizeCouponCode(value.code);
    const existing = coupons.find((coupon) => normalizeCouponCode(coupon.code) === code);
    if (existing) {
      throw new ApiError(409, "Ижил coupon code аль хэдийн үүссэн байна.", [
        { field: "code", message: "Тухайн code давхардсан байна." },
      ]);
    }

    const nextCouponId = Math.max(1, Number(state.nextCouponId || 1));
    const actorLabel = cleanText(
      req.actorUser?.companyName || req.actorUser?.company || req.actorUser?.email || req.actor?.email || "admin",
      190
    );
    const coupon = normalizeCouponRecord(
      {
        ...value,
        code,
        createdBy: actorLabel,
        isActive: value.isActive,
        usedCount: 0,
      },
      nextCouponId
    );

    state.coupons = [...coupons, coupon];
    state.nextCouponId = nextCouponId + 1;
    await writeCurrentState(state);

    broadcastStateChanged({
      actor: req.actor?.role || "admin",
      company: req.actor?.company || "",
      action: "coupon-created",
      couponCode: coupon.code,
      updatedAt: new Date().toISOString(),
    });

    return sendSuccess(res, {
      status: 201,
      message: "Coupon амжилттай үүслээ.",
      data: { coupon },
      extra: { coupon },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/coupons/:couponId/deactivate", async (req, res, next) => {
  try {
    const couponId = Math.max(1, Number(req.params.couponId || 0) || 0);
    if (!couponId) {
      throw new ApiError(400, "couponId буруу байна.", [
        { field: "couponId", message: "couponId шаардлагатай." },
      ]);
    }

    const state = await readCurrentState();
    const coupons = Array.isArray(state.coupons) ? state.coupons : [];
    const couponIndex = coupons.findIndex((coupon) => Number(coupon.id || 0) === couponId);
    if (couponIndex < 0) {
      throw new ApiError(404, "Coupon олдсонгүй.");
    }

    const existingCoupon = coupons[couponIndex];
    const updatedCoupon = normalizeCouponRecord(
      {
        ...existingCoupon,
        isActive: false,
        createdAt: existingCoupon.createdAt,
        createdBy: existingCoupon.createdBy,
        usedCount: existingCoupon.usedCount,
      },
      existingCoupon.id,
      existingCoupon
    );

    coupons[couponIndex] = updatedCoupon;
    state.coupons = coupons;
    await writeCurrentState(state);

    broadcastStateChanged({
      actor: req.actor?.role || "admin",
      company: req.actor?.company || "",
      action: "coupon-deactivated",
      couponCode: updatedCoupon.code,
      updatedAt: new Date().toISOString(),
    });

    return sendSuccess(res, {
      message: "Coupon идэвхгүй боллоо.",
      data: { coupon: updatedCoupon },
      extra: { coupon: updatedCoupon },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { adminRouter: router };
