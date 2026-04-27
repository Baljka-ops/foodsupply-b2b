const COUPON_DISCOUNT_TYPES = new Set(["fixed", "percent"]);

function normalizeCouponCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function clampText(value, maxLen, fallback = "") {
  const clean = String(value ?? "").trim();
  if (!clean) return fallback;
  return clean.slice(0, maxLen);
}

function toIsoString(value, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function normalizeCouponDiscountType(value, fallback = "fixed") {
  const type = String(value || "").trim().toLowerCase();
  if (COUPON_DISCOUNT_TYPES.has(type)) return type;
  const fallbackType = String(fallback || "").trim().toLowerCase();
  return COUPON_DISCOUNT_TYPES.has(fallbackType) ? fallbackType : "fixed";
}

function normalizeCouponRecord(input = {}, assignedId = 0, existingCoupon = null) {
  const nowIso = new Date().toISOString();
  const discountType = normalizeCouponDiscountType(input.discountType, existingCoupon?.discountType || "fixed");
  const discountValue = Math.max(0, Number(input.discountValue ?? existingCoupon?.discountValue ?? 0));
  const minOrderAmount = Math.max(0, Number(input.minOrderAmount ?? existingCoupon?.minOrderAmount ?? 0));
  const maxDiscountAmount = Math.max(0, Number(input.maxDiscountAmount ?? existingCoupon?.maxDiscountAmount ?? 0));
  const usageLimitRaw = Number(input.usageLimit ?? existingCoupon?.usageLimit ?? 0);
  const usageLimit = Number.isFinite(usageLimitRaw) && usageLimitRaw > 0 ? Math.floor(usageLimitRaw) : 0;
  const usedCountRaw = Number(input.usedCount ?? existingCoupon?.usedCount ?? 0);
  const usedCount = Number.isFinite(usedCountRaw) && usedCountRaw > 0 ? Math.floor(usedCountRaw) : 0;

  return {
    id: Math.max(1, Number(assignedId || input.id || existingCoupon?.id || 1) || 1),
    code: normalizeCouponCode(input.code || existingCoupon?.code || ""),
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount,
    validFrom: toIsoString(input.validFrom, existingCoupon?.validFrom || ""),
    validTo: toIsoString(input.validTo, existingCoupon?.validTo || ""),
    usageLimit,
    usedCount,
    isActive: input.isActive === undefined ? Boolean(existingCoupon?.isActive ?? true) : Boolean(input.isActive),
    createdAt: toIsoString(existingCoupon?.createdAt || input.createdAt, nowIso),
    createdBy: clampText(input.createdBy, 190, clampText(existingCoupon?.createdBy, 190)),
    updatedAt: nowIso,
  };
}

function computeCouponDiscount(coupon, subtotal) {
  const amount = Math.max(0, Number(subtotal || 0));
  if (!coupon || amount <= 0) return 0;

  let discount = 0;
  if (normalizeCouponDiscountType(coupon.discountType) === "percent") {
    discount = Math.round(amount * (Math.max(0, Number(coupon.discountValue || 0)) / 100));
  } else {
    discount = Math.round(Math.max(0, Number(coupon.discountValue || 0)));
  }

  if (Number(coupon.maxDiscountAmount || 0) > 0) {
    discount = Math.min(discount, Math.round(Number(coupon.maxDiscountAmount || 0)));
  }

  return Math.max(0, Math.min(discount, amount));
}

function validateCouponForCheckout(coupon, subtotal, now = new Date()) {
  const amount = Math.max(0, Number(subtotal || 0));
  if (!coupon) {
    return { ok: false, message: "Coupon олдсонгүй.", discountAmount: 0 };
  }
  if (!coupon.isActive) {
    return { ok: false, message: "Coupon идэвхгүй байна.", discountAmount: 0 };
  }

  const nowTime = new Date(now).getTime();
  const fromTime = coupon.validFrom ? new Date(coupon.validFrom).getTime() : 0;
  const toTime = coupon.validTo ? new Date(coupon.validTo).getTime() : 0;
  if (fromTime && Number.isFinite(fromTime) && nowTime < fromTime) {
    return { ok: false, message: "Coupon хараахан идэвхжээгүй байна.", discountAmount: 0 };
  }
  if (toTime && Number.isFinite(toTime) && nowTime > toTime) {
    return { ok: false, message: "Coupon-ийн хугацаа дууссан байна.", discountAmount: 0 };
  }
  if (amount < Math.max(0, Number(coupon.minOrderAmount || 0))) {
    return { ok: false, message: "Захиалгын дүн coupon-ийн доод нөхцөлийг хангахгүй байна.", discountAmount: 0 };
  }
  if (Number(coupon.usageLimit || 0) > 0 && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit || 0)) {
    return { ok: false, message: "Coupon ашиглалтын хязгаарт хүрсэн байна.", discountAmount: 0 };
  }

  return {
    ok: true,
    message: "Coupon хүчинтэй байна.",
    discountAmount: computeCouponDiscount(coupon, amount),
  };
}

module.exports = {
  COUPON_DISCOUNT_TYPES,
  normalizeCouponCode,
  normalizeCouponDiscountType,
  normalizeCouponRecord,
  computeCouponDiscount,
  validateCouponForCheckout,
};
