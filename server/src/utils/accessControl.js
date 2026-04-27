const { User } = require("../models/User");
const { config } = require("../config");
const {
  normalizeCompany,
  normalizeRole,
  normalizeSupplierVerificationStatus,
  resolveActorFromRequest,
} = require("./auth");
const { ApiError } = require("./http");

function isSameCompany(a, b) {
  return normalizeCompany(a).toLowerCase() === normalizeCompany(b).toLowerCase();
}

async function resolveRequestActor(req, { allowLegacyHeaders = false } = {}) {
  const actor = resolveActorFromRequest(req, {
    secret: config.authSecret,
    allowLegacyHeaders,
  });

  if (!actor || actor.role === "guest") {
    return { actor: null, user: null };
  }

  let user = null;
  if (actor.userId > 0) {
    user = await User.findOne({ id: actor.userId, role: actor.role }).lean();
  } else if (actor.role === "buyer" || actor.role === "supplier") {
    user = await User.findOne({ role: actor.role, company: actor.company }).sort({ createdAt: 1, id: 1 }).lean();
  }

  return {
    actor,
    user,
  };
}

function requireAuth({ allowLegacyHeaders = false } = {}) {
  return async (req, _res, next) => {
    try {
      const { actor, user } = await resolveRequestActor(req, { allowLegacyHeaders });
      if (!actor) {
        throw new ApiError(401, "Нэвтрэх шаардлагатай.");
      }
      req.actor = actor;
      req.actorUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireRole(...roles) {
  const allowed = roles.flat().map((role) => normalizeRole(role, "guest"));
  return (req, _res, next) => {
    try {
      const actor = req.actor;
      if (!actor || actor.role === "guest") {
        throw new ApiError(401, "Нэвтрэх шаардлагатай.");
      }
      if (!allowed.includes(actor.role)) {
        throw new ApiError(403, "Энэ route-д хандах эрх хүрэлцэхгүй.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireVerifiedSupplier(req, _res, next) {
  try {
    const actor = req.actor;
    const user = req.actorUser;
    if (!actor || actor.role !== "supplier") {
      throw new ApiError(403, "Зөвхөн supplier хэрэглэгч ашиглана.");
    }
    const status = normalizeSupplierVerificationStatus(user?.verificationStatus, "verified");
    if (status !== "verified") {
      throw new ApiError(403, "Баталгаажсан supplier эрх шаардлагатай.");
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  isSameCompany,
  resolveRequestActor,
  requireAuth,
  requireRole,
  requireVerifiedSupplier,
};
