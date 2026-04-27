const express = require("express");
const { User } = require("../models/User");
const { config } = require("../config");
const {
  normalizeRole,
  normalizeEmail,
  normalizeCompany,
  issueAuthToken,
  hashPassword,
  verifyPassword,
  toPublicUser,
} = require("../utils/auth");
const { requireAuth } = require("../utils/accessControl");
const { ApiError, sendSuccess } = require("../utils/http");
const { validateLoginPayload, validateRegisterPayload } = require("../utils/validation");
const { buildVerificationHistoryEntry } = require("../utils/verificationAudit");
const { sanitizeRewardSummary } = require("../utils/rewards");

const router = express.Router();

async function authenticateUser(email, role, password) {
  const user = await User.findOne({ email, role });
  if (!user) return null;

  const checked = verifyPassword(password, user.password);
  if (!checked.ok) return null;

  if (checked.needsRehash) {
    user.password = hashPassword(password);
    await user.save();
  }

  return user;
}

router.post("/register", async (req, res, next) => {
  try {
    const { errors, value } = validateRegisterPayload(req.body);
    if (errors.length > 0) {
      throw new ApiError(400, "Бүртгэлийн мэдээлэл дутуу эсвэл буруу байна.", errors);
    }

    const role = normalizeRole(value.role, "buyer");
    const company = normalizeCompany(value.companyName);
    const email = normalizeEmail(value.email);

    const existing = await User.findOne({ email, role }).lean();
    if (existing) {
      throw new ApiError(409, "Ижил бүртгэл аль хэдийн үүссэн байна.", [
        { field: "email", message: "Тухайн и-мэйл энэ role дээр бүртгэгдсэн байна." },
      ]);
    }

    const last = await User.findOne({}).sort({ id: -1 }).lean();
    const nextId = Math.max(1, Number(last?.id || 0) + 1);
    const nowIso = new Date().toISOString();
    const isSupplier = role === "supplier";

    const user = await User.create({
      id: nextId,
      role,
      company,
      companyName: company,
      registerNumber: isSupplier ? value.registerNumber : "",
      email,
      password: hashPassword(value.password),
      contactName: value.contactName,
      contactPersonName: isSupplier ? value.contactPersonName : value.contactName,
      phone: value.phone,
      contactPersonPhone: isSupplier ? value.contactPersonPhone : value.phone,
      contactPersonEmail: isSupplier ? value.contactPersonEmail : email,
      address: value.address,
      businessType: value.businessType,
      bankName: isSupplier ? value.bankName : "",
      bankAccountName: isSupplier ? value.bankAccountName : "",
      bankAccountNumber: isSupplier ? value.bankAccountNumber : "",
      bankAccount: isSupplier ? value.bankAccount : "",
      qpayReceiverCode: isSupplier ? value.qpayReceiverCode : "",
      supplierAgreementAccepted: isSupplier ? value.supplierAgreementAccepted : false,
      supplierAgreementAcceptedAt: isSupplier && value.supplierAgreementAccepted ? nowIso : "",
      verificationStatus: isSupplier ? "pending" : "",
      verificationNote: "",
      verifiedAt: "",
      verifiedBy: "",
      verificationHistory: isSupplier
        ? [
            buildVerificationHistoryEntry({
              action: "submitted",
              fromStatus: "",
              toStatus: "pending",
              note: "",
              changedBy: value.contactPersonEmail || email || company,
              changedAt: nowIso,
            }),
          ]
        : [],
      ...sanitizeRewardSummary({}),
      createdAt: nowIso,
    });

    const token = issueAuthToken(user, config.authSecret, config.authTokenTtlSec);
    const message = isSupplier
      ? "Таны хүсэлт илгээгдлээ. Админ баталгаажуулсны дараа нийлүүлэгчийн эрх идэвхжинэ."
      : "Бүртгэл амжилттай үүслээ.";

    return sendSuccess(res, {
      status: 201,
      message,
      data: {
        token,
        user: toPublicUser(user),
      },
      extra: {
        token,
        user: toPublicUser(user),
      },
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return next(
        new ApiError(409, "Ижил бүртгэл аль хэдийн үүссэн байна.", [
          { field: "email", message: "Тухайн и-мэйл энэ role дээр бүртгэгдсэн байна." },
        ])
      );
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { errors, value } = validateLoginPayload(req.body);
    if (errors.length > 0) {
      throw new ApiError(400, "Нэвтрэх мэдээлэл дутуу байна.", errors);
    }

    let user = await authenticateUser(value.email, value.role, value.password);
    if (!user && value.role !== "admin") {
      user = await authenticateUser(value.email, "admin", value.password);
    }
    if (!user) {
      throw new ApiError(401, "И-мэйл эсвэл нууц үг буруу байна.");
    }

    const token = issueAuthToken(user, config.authSecret, config.authTokenTtlSec);
    return sendSuccess(res, {
      message: "Амжилттай нэвтэрлээ.",
      data: {
        token,
        user: toPublicUser(user),
      },
      extra: {
        token,
        user: toPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor;
    const user =
      req.actorUser ||
      (await User.findOne({ id: actor.userId, role: actor.role, company: actor.company }).lean());

    if (!user) {
      throw new ApiError(404, "Хэрэглэгч олдсонгүй.");
    }

    return sendSuccess(res, {
      message: "Хэрэглэгчийн мэдээлэл амжилттай уншигдлаа.",
      data: { user: toPublicUser(user) },
      extra: { user: toPublicUser(user) },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { authRouter: router };
