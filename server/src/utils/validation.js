const SUPPLIER_BUSINESS_TYPES = new Set(["manufacturer", "importer", "wholesaler"]);
const COUPON_DISCOUNT_TYPES = new Set(["fixed", "percent"]);
const PICKUP_TIME_SLOTS = new Set(["09:00–12:00", "12:00–15:00", "15:00–18:00", "09:00-12:00", "12:00-15:00", "15:00-18:00"]);

function cleanText(value, maxLen = 255, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.slice(0, maxLen);
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function pushError(errors, field, message) {
  errors.push({
    field: String(field || "").trim(),
    message: String(message || "").trim(),
  });
}

function validateRegisterPayload(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const role = cleanText(body.role, 40, "buyer").toLowerCase();
  const companyName = cleanText(body.companyName || body.company, 190);
  const email = cleanEmail(body.email);
  const password = String(body.password || "");
  const contactName = cleanText(body.contactName || body.contactPersonName, 190);
  const phone = cleanText(body.phone || body.contactPersonPhone, 40);
  const address = cleanText(body.address, 255);
  const businessType = cleanText(body.businessType, 80).toLowerCase();
  const registerNumber = cleanText(body.registerNumber, 80);
  const contactPersonName = cleanText(body.contactPersonName || body.contactName, 190);
  const contactPersonPhone = cleanText(body.contactPersonPhone || body.phone, 40);
  const contactPersonEmail = cleanEmail(body.contactPersonEmail || body.email);
  const bankName = cleanText(body.bankName, 120);
  const bankAccountName = cleanText(body.bankAccountName, 190);
  const bankAccountNumber = cleanText(body.bankAccountNumber, 80);
  const bankAccount = cleanText(body.bankAccount, 120);
  const qpayReceiverCode = cleanText(body.qpayReceiverCode, 120);
  const supplierAgreementAccepted = Boolean(body.supplierAgreementAccepted);
  const errors = [];

  if (role !== "buyer" && role !== "supplier") {
    pushError(errors, "role", "Зөвхөн buyer эсвэл supplier бүртгэл боломжтой.");
  }
  if (!companyName) pushError(errors, "companyName", "Байгууллагын нэр шаардлагатай.");
  if (!email) pushError(errors, "email", "И-мэйл шаардлагатай.");
  if (!password) pushError(errors, "password", "Нууц үг шаардлагатай.");
  if (password && password.length < 8) {
    pushError(errors, "password", "Нууц үг дор хаяж 8 тэмдэгт байна.");
  }
  if (!contactName) pushError(errors, "contactName", "Холбоо барих нэр шаардлагатай.");
  if (!phone) pushError(errors, "phone", "Утасны дугаар шаардлагатай.");
  if (!address) pushError(errors, "address", "Хаяг шаардлагатай.");

  if (role === "supplier") {
    if (!SUPPLIER_BUSINESS_TYPES.has(businessType)) {
      pushError(errors, "businessType", "businessType нь manufacturer, importer, wholesaler-ийн аль нэг байна.");
    }
    if (!registerNumber) pushError(errors, "registerNumber", "Регистрийн дугаар шаардлагатай.");
    if (!contactPersonName) pushError(errors, "contactPersonName", "Хариуцсан ажилтны нэр шаардлагатай.");
    if (!contactPersonPhone) pushError(errors, "contactPersonPhone", "Хариуцсан ажилтны утас шаардлагатай.");
    if (!contactPersonEmail) pushError(errors, "contactPersonEmail", "Хариуцсан ажилтны и-мэйл шаардлагатай.");
    if (!bankName) pushError(errors, "bankName", "Банкны нэр шаардлагатай.");
    if (!bankAccountName) pushError(errors, "bankAccountName", "Дансны нэр шаардлагатай.");
    if (!bankAccountNumber) pushError(errors, "bankAccountNumber", "Дансны дугаар шаардлагатай.");
    if (bankAccountNumber && bankAccountNumber.replace(/\D/g, "").length < 6) {
      pushError(errors, "bankAccountNumber", "Банкны дансны дугаар буруу байна.");
    }
    if (!qpayReceiverCode) pushError(errors, "qpayReceiverCode", "QPay receiver code шаардлагатай.");
    if (!supplierAgreementAccepted) {
      pushError(errors, "supplierAgreementAccepted", "Нийлүүлэгчийн гэрээ зөвшөөрсөн байх шаардлагатай.");
    }
  }

  return {
    errors,
    value: {
      role,
      companyName,
      email,
      password,
      contactName,
      phone,
      address,
      businessType,
      registerNumber,
      contactPersonName,
      contactPersonPhone,
      contactPersonEmail,
      bankName,
      bankAccountName,
      bankAccountNumber,
      bankAccount,
      qpayReceiverCode,
      supplierAgreementAccepted,
    },
  };
}

function validateLoginPayload(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const email = cleanEmail(body.email);
  const password = String(body.password || "");
  const role = cleanText(body.role, 40, "buyer").toLowerCase();
  const errors = [];

  if (!email) pushError(errors, "email", "И-мэйл шаардлагатай.");
  if (!password) pushError(errors, "password", "Нууц үг шаардлагатай.");

  return {
    errors,
    value: { email, password, role },
  };
}

function validateVerificationDecisionPayload(payload, { noteRequired = false } = {}) {
  const body = payload && typeof payload === "object" ? payload : {};
  const note = cleanText(body.note, 500);
  const errors = [];

  if (noteRequired && !note) {
    pushError(errors, "note", "Тайлбар оруулах шаардлагатай.");
  }

  return { errors, value: { note } };
}

function validateSupplierProductPayload(product, index = 0) {
  const row = product && typeof product === "object" ? product : {};
  const errors = [];
  const prefix = `products[${index}]`;

  if (!cleanText(row.name, 190)) pushError(errors, `${prefix}.name`, "Барааны нэр шаардлагатай.");
  if (!cleanText(row.category, 80)) pushError(errors, `${prefix}.category`, "Ангилал шаардлагатай.");
  if (!Number.isFinite(Number(row.price)) || Number(row.price) < 0) {
    pushError(errors, `${prefix}.price`, "Үнэ 0 эсвэл түүнээс их тоо байна.");
  }
  if (!Number.isFinite(Number(row.stock)) || Number(row.stock) < 0) {
    pushError(errors, `${prefix}.stock`, "Нөөц 0 эсвэл түүнээс их тоо байна.");
  }
  if (row.description !== undefined && typeof row.description !== "string") {
    pushError(errors, `${prefix}.description`, "Тайлбар text байна.");
  }
  if (row.image !== undefined && typeof row.image !== "string") {
    pushError(errors, `${prefix}.image`, "Зургийн утга string байна.");
  }
  if (row.isActive !== undefined && typeof row.isActive !== "boolean") {
    pushError(errors, `${prefix}.isActive`, "isActive boolean байна.");
  }

  return errors;
}

function validateBuyerOrderPayload(order, index = 0) {
  const row = order && typeof order === "object" ? order : {};
  const errors = [];
  const prefix = `orders[${index}]`;
  const items = Array.isArray(row.items) ? row.items : [];
  const pickupDate = cleanText(row.pickupDate, 20);
  const pickupTimeSlot = cleanText(row.pickupTimeSlot, 40);
  const deliveryAddress = cleanText(row.deliveryAddress, 255);
  const contactPhone = cleanText(row.contactPhone, 40);
  const mapUrl = cleanText(row.mapUrl, 2000);

  if (items.length === 0) {
    pushError(errors, `${prefix}.items`, "Захиалгын мөр хоосон байна.");
  }

  items.forEach((item, itemIndex) => {
    const itemPrefix = `${prefix}.items[${itemIndex}]`;
    if (!Number.isFinite(Number(item?.productId)) || Number(item.productId) < 1) {
      pushError(errors, `${itemPrefix}.productId`, "productId буруу байна.");
    }
    const quantity = toNumber(item?.quantity ?? item?.qty, 0);
    if (!Number.isFinite(quantity) || quantity < 1) {
      pushError(errors, `${itemPrefix}.quantity`, "Тоо ширхэг 1-с их байна.");
    }
    const unitPrice = toNumber(item?.unitPrice ?? item?.price, NaN);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      pushError(errors, `${itemPrefix}.unitPrice`, "Нэгж үнэ 0 эсвэл түүнээс их байна.");
    }
  });

  if (row.totalAmount !== undefined && (!Number.isFinite(Number(row.totalAmount)) || Number(row.totalAmount) < 0)) {
    pushError(errors, `${prefix}.totalAmount`, "Нийт дүн буруу байна.");
  }
  if (row.total !== undefined && (!Number.isFinite(Number(row.total)) || Number(row.total) < 0)) {
    pushError(errors, `${prefix}.total`, "Нийт дүн буруу байна.");
  }
  if (row.subtotal !== undefined && (!Number.isFinite(Number(row.subtotal)) || Number(row.subtotal) < 0)) {
    pushError(errors, `${prefix}.subtotal`, "subtotal буруу байна.");
  }
  if (row.discountAmount !== undefined && (!Number.isFinite(Number(row.discountAmount)) || Number(row.discountAmount) < 0)) {
    pushError(errors, `${prefix}.discountAmount`, "discountAmount буруу байна.");
  }
  if (row.usedPoints !== undefined && (!Number.isFinite(Number(row.usedPoints)) || Number(row.usedPoints) < 0)) {
    pushError(errors, `${prefix}.usedPoints`, "usedPoints буруу байна.");
  }
  if (row.earnedPoints !== undefined && (!Number.isFinite(Number(row.earnedPoints)) || Number(row.earnedPoints) < 0)) {
    pushError(errors, `${prefix}.earnedPoints`, "earnedPoints буруу байна.");
  }
  if (row.finalAmount !== undefined && (!Number.isFinite(Number(row.finalAmount)) || Number(row.finalAmount) < 0)) {
    pushError(errors, `${prefix}.finalAmount`, "finalAmount буруу байна.");
  }
  if (!cleanText(row.supplierName || row.supplierCompany, 190)) {
    pushError(errors, `${prefix}.supplierName`, "Нийлүүлэгчийн нэр шаардлагатай.");
  }
  if (!pickupDate) {
    pushError(errors, `${prefix}.pickupDate`, "Хүлээн авах огноо шаардлагатай.");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
    pushError(errors, `${prefix}.pickupDate`, "pickupDate формат буруу байна.");
  } else if (pickupDate < getTodayDateString()) {
    pushError(errors, `${prefix}.pickupDate`, "Өнгөрсөн огноо сонгох боломжгүй.");
  }
  if (!pickupTimeSlot) {
    pushError(errors, `${prefix}.pickupTimeSlot`, "Хүлээн авах цагийн интервал шаардлагатай.");
  } else if (!PICKUP_TIME_SLOTS.has(pickupTimeSlot)) {
    pushError(errors, `${prefix}.pickupTimeSlot`, "pickupTimeSlot буруу байна.");
  }
  if (!deliveryAddress) {
    pushError(errors, `${prefix}.deliveryAddress`, "Хаяг шаардлагатай.");
  }
  if (!contactPhone) {
    pushError(errors, `${prefix}.contactPhone`, "Холбоо барих утас шаардлагатай.");
  }
  if (row.locationNote !== undefined && typeof row.locationNote !== "string") {
    pushError(errors, `${prefix}.locationNote`, "locationNote string байна.");
  }
  if (row.pickupNote !== undefined && typeof row.pickupNote !== "string") {
    pushError(errors, `${prefix}.pickupNote`, "pickupNote string байна.");
  }
  if (row.latitude !== undefined && row.latitude !== null && !Number.isFinite(Number(row.latitude))) {
    pushError(errors, `${prefix}.latitude`, "latitude тоон утга байна.");
  }
  if (row.longitude !== undefined && row.longitude !== null && !Number.isFinite(Number(row.longitude))) {
    pushError(errors, `${prefix}.longitude`, "longitude тоон утга байна.");
  }
  if (mapUrl && !isValidHttpUrl(mapUrl)) {
    pushError(errors, `${prefix}.mapUrl`, "mapUrl буруу байна.");
  }

  return errors;
}

function validateCouponPayload(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const code = cleanText(body.code, 40).toUpperCase().replace(/\s+/g, "");
  const discountType = cleanText(body.discountType, 20, "fixed").toLowerCase();
  const discountValue = Number(body.discountValue);
  const minOrderAmount = Number(body.minOrderAmount ?? 0);
  const maxDiscountAmount = Number(body.maxDiscountAmount ?? 0);
  const usageLimit = Number(body.usageLimit ?? 0);
  const validFrom = cleanText(body.validFrom, 80);
  const validTo = cleanText(body.validTo, 80);
  const errors = [];

  if (!code) pushError(errors, "code", "Coupon code шаардлагатай.");
  if (!COUPON_DISCOUNT_TYPES.has(discountType)) {
    pushError(errors, "discountType", "discountType нь fixed эсвэл percent байна.");
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    pushError(errors, "discountValue", "discountValue 0-с их байна.");
  }
  if (discountType === "percent" && Number.isFinite(discountValue) && discountValue > 100) {
    pushError(errors, "discountValue", "Percent coupon 100%-аас их байж болохгүй.");
  }
  if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
    pushError(errors, "minOrderAmount", "minOrderAmount 0 эсвэл түүнээс их байна.");
  }
  if (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount < 0) {
    pushError(errors, "maxDiscountAmount", "maxDiscountAmount 0 эсвэл түүнээс их байна.");
  }
  if (!Number.isFinite(usageLimit) || usageLimit < 0) {
    pushError(errors, "usageLimit", "usageLimit 0 эсвэл түүнээс их байна.");
  }
  if (validFrom && Number.isNaN(new Date(validFrom).getTime())) {
    pushError(errors, "validFrom", "validFrom огноо буруу байна.");
  }
  if (validTo && Number.isNaN(new Date(validTo).getTime())) {
    pushError(errors, "validTo", "validTo огноо буруу байна.");
  }
  if (
    validFrom &&
    validTo &&
    !Number.isNaN(new Date(validFrom).getTime()) &&
    !Number.isNaN(new Date(validTo).getTime()) &&
    new Date(validTo).getTime() < new Date(validFrom).getTime()
  ) {
    pushError(errors, "validTo", "validTo нь validFrom-оос хойш байна.");
  }

  return {
    errors,
    value: {
      code,
      discountType,
      discountValue: Number.isFinite(discountValue) ? discountValue : 0,
      minOrderAmount: Number.isFinite(minOrderAmount) ? minOrderAmount : 0,
      maxDiscountAmount: Number.isFinite(maxDiscountAmount) ? maxDiscountAmount : 0,
      validFrom,
      validTo,
      usageLimit: Number.isFinite(usageLimit) ? Math.floor(usageLimit) : 0,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    },
  };
}

module.exports = {
  SUPPLIER_BUSINESS_TYPES,
  cleanText,
  cleanEmail,
  toNumber,
  pushError,
  validateRegisterPayload,
  validateLoginPayload,
  validateVerificationDecisionPayload,
  validateSupplierProductPayload,
  validateBuyerOrderPayload,
  validateCouponPayload,
};
