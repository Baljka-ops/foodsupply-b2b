const { sanitizeStateInput, maxId } = require("./sanitizeState");
const { normalizeSupplierVerificationStatus } = require("./auth");
const { ApiError } = require("./http");
const { validateBuyerOrderPayload, validateSupplierProductPayload } = require("./validation");
const {
  normalizeOrderStatus,
  normalizePaymentStatus,
  normalizePayoutStatus,
  normalizeDeliveryStatus,
} = require("./orderState");
const {
  calculateEarnedPoints,
  normalizePointValue,
  normalizeRewardStatus,
} = require("./rewards");
const {
  normalizeCouponCode,
} = require("./coupons");

const KNOWN_ROLES = new Set(["buyer", "supplier", "admin"]);

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return KNOWN_ROLES.has(role) ? role : "buyer";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCompany(value) {
  return String(value || "").trim();
}

function maskBankAccount(value) {
  const clean = String(value || "").replace(/\s+/g, "");
  if (!clean) return "";
  if (clean.length <= 4) return clean;
  return `${"*".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

function toIsoString(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function clampText(value, maxLen, fallback = "") {
  const clean = String(value ?? "").trim();
  if (!clean) return fallback;
  return clean.slice(0, maxLen);
}

const PICKUP_TIME_SLOT_MAP = new Map([
  ["09:00-12:00", "09:00–12:00"],
  ["09:00–12:00", "09:00–12:00"],
  ["12:00-15:00", "12:00–15:00"],
  ["12:00–15:00", "12:00–15:00"],
  ["15:00-18:00", "15:00–18:00"],
  ["15:00–18:00", "15:00–18:00"],
]);

function normalizePickupDate(value) {
  const clean = clampText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : "";
}

function normalizePickupTimeSlot(value) {
  const clean = clampText(value, 40);
  return PICKUP_TIME_SLOT_MAP.get(clean) || "";
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeExternalUrl(value) {
  const clean = clampText(value, 2000);
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeCompanyKey(value) {
  return normalizeCompany(value).toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeUsersForState(users, { includeSensitive = false } = {}) {
  if (!Array.isArray(users)) return [];

  return users
    .filter((u) => u && typeof u === "object")
    .map((u) => ({
      id: Math.max(1, Number(u.id || 0) || 1),
      role: normalizeRole(u.role),
      company: normalizeCompany(u.company),
      companyName: clampText(u.companyName, 190, normalizeCompany(u.company)),
      registerNumber: clampText(u.registerNumber, 80),
      email: normalizeEmail(u.email),
      password: String(u.password || ""),
      contactName: clampText(u.contactName, 190),
      contactPersonName: clampText(u.contactPersonName, 190, clampText(u.contactName, 190)),
      phone: clampText(u.phone, 40),
      contactPersonPhone: clampText(u.contactPersonPhone, 40),
      contactPersonEmail: normalizeEmail(u.contactPersonEmail || ""),
      address: clampText(u.address, 255),
      businessType: clampText(u.businessType, 80),
      bankName: clampText(u.bankName, 120),
      bankAccountName: clampText(u.bankAccountName, 190),
      bankAccountNumber: includeSensitive ? clampText(u.bankAccountNumber, 80) : "",
      bankAccount: includeSensitive ? clampText(u.bankAccount, 120) : "",
      qpayReceiverCode: includeSensitive ? clampText(u.qpayReceiverCode, 120) : "",
      bankAccountMasked: clampText(u.bankAccountMasked, 80, maskBankAccount(u.bankAccountNumber)),
      supplierAgreementAccepted: Boolean(u.supplierAgreementAccepted || false),
      supplierAgreementAcceptedAt: u?.supplierAgreementAcceptedAt ? toIsoString(u.supplierAgreementAcceptedAt) : "",
      verificationStatus: normalizeSupplierVerificationStatus(
        u?.verificationStatus,
        normalizeRole(u.role) === "supplier" ? "verified" : ""
      ),
      verificationNote: clampText(u.verificationNote, 500),
      verifiedAt: u?.verifiedAt ? toIsoString(u.verifiedAt) : "",
      verifiedBy: clampText(u.verifiedBy, 190),
      rewardPoints: normalizePointValue(u.rewardPoints, 0),
      totalEarnedPoints: normalizePointValue(u.totalEarnedPoints, u.rewardPoints || 0),
      totalUsedPoints: normalizePointValue(u.totalUsedPoints, 0),
      verificationHistory: require("./sanitizeState").sanitizeVerificationHistory(u.verificationHistory, {
        role: normalizeRole(u.role),
        company: normalizeCompany(u.company),
        companyName: clampText(u.companyName, 190, normalizeCompany(u.company)),
        email: normalizeEmail(u.email),
        contactPersonEmail: normalizeEmail(u.contactPersonEmail || ""),
        supplierAgreementAccepted: Boolean(u.supplierAgreementAccepted || false),
        supplierAgreementAcceptedAt: u?.supplierAgreementAcceptedAt ? toIsoString(u.supplierAgreementAcceptedAt) : "",
        verificationStatus: normalizeSupplierVerificationStatus(
          u?.verificationStatus,
          normalizeRole(u.role) === "supplier" ? "verified" : ""
        ),
        verificationNote: clampText(u.verificationNote, 500),
        verifiedAt: u?.verifiedAt ? toIsoString(u.verifiedAt) : "",
        verifiedBy: clampText(u.verifiedBy, 190),
        createdAt: toIsoString(u.createdAt),
      }),
      createdAt: toIsoString(u.createdAt),
    }));
}

function recomputeStateMeta(state) {
  const next = clone(state);
  next.products = Array.isArray(next.products) ? next.products : [];
  next.orders = Array.isArray(next.orders) ? next.orders : [];
  next.coupons = Array.isArray(next.coupons) ? next.coupons : [];
  next.announcements = Array.isArray(next.announcements) ? next.announcements : [];
  next.users = Array.isArray(next.users) ? next.users : [];
  next.carts = next.carts && typeof next.carts === "object" ? next.carts : {};
  next.meta = next.meta && typeof next.meta === "object" ? { ...next.meta } : {};

  const buyerRewardSummaryByCompany = new Map();
  next.orders.forEach((row) => {
    const companyKey = normalizeCompanyKey(row?.buyerCompany || row?.buyerName);
    if (!companyKey) return;

    const rewardStatus = normalizeRewardStatus(row?.rewardStatus, "pending");
    const summary = buyerRewardSummaryByCompany.get(companyKey) || { earned: 0, used: 0 };
    if (rewardStatus !== "cancelled") {
      summary.used += normalizePointValue(row?.usedPoints, 0);
    }
    if (rewardStatus === "earned") {
      summary.earned += normalizePointValue(
        row?.earnedPoints,
        calculateEarnedPoints(Number(row?.finalAmount ?? row?.totalAmount ?? row?.total ?? 0))
      );
    }
    buyerRewardSummaryByCompany.set(companyKey, summary);
  });

  next.users = next.users.map((user) => {
    if (normalizeRole(user?.role) !== "buyer") return user;
    const summary = buyerRewardSummaryByCompany.get(normalizeCompanyKey(user?.companyName || user?.company)) || {
      earned: 0,
      used: 0,
    };
    const storedRewardPoints = normalizePointValue(user?.rewardPoints, 0);
    const storedEarnedPoints = normalizePointValue(user?.totalEarnedPoints, storedRewardPoints);
    const storedUsedPoints = normalizePointValue(user?.totalUsedPoints, 0);
    const storedBalanceFromTotals = Math.max(0, storedEarnedPoints - storedUsedPoints);
    const legacyCarryPoints = Math.max(0, storedRewardPoints - storedBalanceFromTotals);
    const totalEarnedPoints = summary.earned + legacyCarryPoints;
    const totalUsedPoints = summary.used;
    return {
      ...user,
      totalEarnedPoints,
      totalUsedPoints,
      rewardPoints: Math.max(0, totalEarnedPoints - totalUsedPoints),
    };
  });

  next.nextProductId = Math.max(1, Number(next.nextProductId || 1), maxId(next.products) + 1);
  next.nextOrderId = Math.max(1, Number(next.nextOrderId || 1), maxId(next.orders) + 1);
  next.nextCouponId = Math.max(1, Number(next.nextCouponId || 1), maxId(next.coupons) + 1);
  next.nextNoticeId = Math.max(1, Number(next.nextNoticeId || 1), maxId(next.announcements) + 1);
  next.nextUserId = Math.max(1, Number(next.nextUserId || 1), maxId(next.users) + 1);
  next.session = null;
  return next;
}

function sanitizeCartLines(lines) {
  if (!Array.isArray(lines)) return [];

  const compact = [];
  const byProductId = new Map();
  for (const row of lines) {
    if (!row || typeof row !== "object") continue;
    const productId = Math.max(1, Number(row.productId || 0) || 1);
    const qty = Math.max(1, Number(row.qty || row.quantity || 1) || 1);
    byProductId.set(productId, { productId, qty });
  }
  byProductId.forEach((row) => compact.push(row));
  return compact;
}

function buildProductLookup(products = []) {
  const byId = new Map();
  for (const row of products) {
    const id = Number(row?.id || 0);
    if (id > 0) byId.set(id, row);
  }
  return byId;
}

function sanitizeOrderItems(items, productLookup = new Map(), defaults = {}) {
  if (!Array.isArray(items)) return [];

  const out = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const productId = Math.max(1, Number(row.productId || 0) || 1);
    const product = productLookup.get(productId);
    const quantity = Math.max(1, Number(row.quantity ?? row.qty ?? 1) || 1);
    const unitPrice = Math.max(0, Number(row.unitPrice ?? row.price ?? product?.price ?? 0));
    const lineTotal = Math.max(0, Number(row.lineTotal ?? row.subtotal ?? unitPrice * quantity));
    const supplierId =
      Math.max(0, Number(row.supplierId || 0) || 0) ||
      Math.max(0, Number(defaults.supplierId || 0) || 0) ||
      Math.max(0, Number(product?.supplierId || 0) || 0);
    const supplierName = clampText(
      row.supplierName || row.supplierCompany,
      190,
      clampText(defaults.supplierName || product?.supplierName || product?.supplierCompany, 190)
    );
    const productName = clampText(row.productName || row.name || product?.name, 190, "Product");

    out.push({
      productId,
      productName,
      name: productName,
      quantity,
      qty: quantity,
      unitPrice,
      price: unitPrice,
      lineTotal,
      subtotal: lineTotal,
      unit: clampText(row.unit, 30, clampText(product?.unit, 30, "pcs")),
      supplierId,
      supplierName,
      supplierCompany: supplierName,
    });
  }
  return out;
}

function findActorUser(users, actor) {
  const rows = Array.isArray(users) ? users : [];
  const role = normalizeRole(actor?.role);
  const company = normalizeCompany(actor?.company);
  const email = normalizeEmail(actor?.email);
  const userId = Math.max(0, Number(actor?.userId || 0) || 0);

  if (userId > 0) {
    const byId = rows.find((row) => Number(row?.id || 0) === userId && normalizeRole(row?.role) === role);
    if (byId) return byId;
  }

  if (email) {
    const byEmail = rows.find((row) => normalizeEmail(row?.email) === email && normalizeRole(row?.role) === role);
    if (byEmail) return byEmail;
  }

  if (company) {
    return rows.find((row) => normalizeCompany(row?.company) === company && normalizeRole(row?.role) === role) || null;
  }

  return null;
}

function isVerifiedSupplierUser(user) {
  return normalizeSupplierVerificationStatus(user?.verificationStatus, "verified") === "verified";
}

function serializeOwnProducts(rows = [], company = "") {
  return JSON.stringify(
    rows
      .filter((row) => normalizeCompany(row?.supplierCompany || row?.supplierName) === company)
      .map((row) => ({
        id: Math.max(1, Number(row?.id || 0) || 1),
        name: clampText(row?.name, 190),
        category: clampText(row?.category, 80),
        price: Math.max(0, Number(row?.price || 0)),
        stock: Math.max(0, Number(row?.stock || 0)),
        description: clampText(row?.description, 1000),
        image: clampText(row?.image, 2000),
        isActive: row?.isActive === undefined ? true : Boolean(row?.isActive),
      }))
      .sort((left, right) => left.id - right.id)
  );
}

function serializeOwnSupplierOrders(rows = [], company = "") {
  return JSON.stringify(
    rows
      .filter((row) => normalizeCompany(row?.supplierCompany || row?.supplierName) === company)
      .map((row) => ({
        id: Math.max(1, Number(row?.id || 0) || 1),
        status: normalizeOrderStatus(row?.status, "Шинэ"),
        paymentStatus: normalizePaymentStatus(row?.paymentStatus, "Төлөгдөөгүй"),
        deliveryStatus: normalizeDeliveryStatus(row?.deliveryStatus, row?.status, row?.paymentStatus),
        payoutStatus: normalizePayoutStatus(row?.payoutStatus, "Хүлээгдэж байна"),
        payoutTransferredAt: row?.payoutTransferredAt ? toIsoString(row.payoutTransferredAt) : "",
      }))
      .sort((left, right) => left.id - right.id)
  );
}

function sanitizeBuyerOrder(input, buyer, fallbackId, productLookup = new Map()) {
  const supplierName = normalizeCompany(input?.supplierName || input?.supplierCompany);
  const items = sanitizeOrderItems(input?.items, productLookup, {
    supplierName,
  });
  if (items.length === 0) return null;

  const totalFromItems = items.reduce((sum, row) => sum + Number(row.lineTotal || 0), 0);
  const totalAmount = Math.max(0, Number(input?.totalAmount ?? input?.total ?? totalFromItems));
  const subtotal = Math.max(0, Number(input?.subtotal ?? totalAmount));
  const discountAmount = Math.max(0, Math.min(subtotal, Number(input?.discountAmount || 0)));
  const usedPoints = Math.max(0, Math.min(subtotal - discountAmount, Number(input?.usedPoints || 0)));
  const finalAmount = Math.max(0, Number(input?.finalAmount ?? subtotal - discountAmount - usedPoints));
  const earnedPoints = normalizePointValue(input?.earnedPoints, calculateEarnedPoints(finalAmount));
  const platformFeeRate = Math.max(0, Number(input?.platformFeeRate || 0));
  const platformFeeAmount = Math.max(0, Number(input?.platformFeeAmount || 0));
  const supplierPayoutAmount = Math.max(0, Number(input?.supplierPayoutAmount || totalAmount - platformFeeAmount));
  const resolvedSupplierId = Math.max(0, Number(input?.supplierId || items[0]?.supplierId || 0) || 0);
  const nowIso = new Date().toISOString();
  const normalizedStatus = normalizeOrderStatus(input?.status, "Шинэ");
  const normalizedPaymentStatus = normalizePaymentStatus(input?.paymentStatus, "Төлөгдөөгүй");

  return {
    id: Math.max(1, Number(input?.id || fallbackId) || fallbackId),
    buyerId: Math.max(0, Number(buyer?.id || 0) || 0),
    buyerName: normalizeCompany(buyer?.companyName || buyer?.company),
    buyerCompany: normalizeCompany(buyer?.companyName || buyer?.company),
    supplierId: resolvedSupplierId,
    supplierName,
    supplierCompany: supplierName,
    items,
    subtotal,
    discountAmount,
    usedPoints,
    earnedPoints,
    finalAmount,
    rewardStatus: normalizeRewardStatus(input?.rewardStatus, "pending"),
    appliedCouponCode: normalizeCouponCode(input?.appliedCouponCode),
    pickupDate: normalizePickupDate(input?.pickupDate),
    pickupTimeSlot: normalizePickupTimeSlot(input?.pickupTimeSlot),
    pickupNote: clampText(input?.pickupNote, 500),
    deliveryAddress: clampText(input?.deliveryAddress, 255),
    locationNote: clampText(input?.locationNote, 500),
    contactPhone: clampText(input?.contactPhone, 40),
    latitude: normalizeNullableNumber(input?.latitude),
    longitude: normalizeNullableNumber(input?.longitude),
    mapUrl: normalizeExternalUrl(input?.mapUrl),
    totalAmount,
    total: totalAmount,
    status: normalizedStatus,
    paymentStatus: normalizedPaymentStatus,
    deliveryStatus: normalizeDeliveryStatus(input?.deliveryStatus, normalizedStatus, normalizedPaymentStatus),
    platformFeeRate,
    platformFeeAmount,
    supplierPayoutAmount,
    payoutStatus: normalizePayoutStatus(input?.payoutStatus, "Хүлээгдэж байна"),
    payoutTransferredAt: input?.payoutTransferredAt ? toIsoString(input.payoutTransferredAt) : "",
    paymentMethod: clampText(input?.paymentMethod, 64, "supplier_qpay"),
    paymentRequestedAt: input?.paymentRequestedAt ? toIsoString(input.paymentRequestedAt) : "",
    paymentConfirmedAt: input?.paymentConfirmedAt ? toIsoString(input.paymentConfirmedAt) : "",
    statusUpdatedAt: input?.statusUpdatedAt ? toIsoString(input.statusUpdatedAt) : "",
    supplierAcceptedAt: input?.supplierAcceptedAt ? toIsoString(input.supplierAcceptedAt) : "",
    shippedAt: input?.shippedAt ? toIsoString(input.shippedAt) : "",
    receivedAt: input?.receivedAt ? toIsoString(input.receivedAt) : "",
    qpayInvoiceId: clampText(input?.qpayInvoiceId, 120),
    qpayInvoiceNo: clampText(input?.qpayInvoiceNo, 120),
    qpayQrText: clampText(input?.qpayQrText, 500),
    qpayQrImage: clampText(input?.qpayQrImage, 500),
    qpayDeepLink: clampText(input?.qpayDeepLink, 500),
    qpayWebUrl: clampText(input?.qpayWebUrl, 500),
    qpayReceiverCode: clampText(input?.qpayReceiverCode, 120),
    qpayStatus: clampText(input?.qpayStatus, 64, "PENDING"),
    qpayMode: clampText(input?.qpayMode, 32, "mock"),
    qpayPaidAt: input?.qpayPaidAt ? toIsoString(input.qpayPaidAt) : "",
    createdAt: input?.createdAt ? toIsoString(input.createdAt) : nowIso,
    updatedAt: nowIso,
  };
}

function sanitizeSupplierProduct(input, supplier, assignedId, existingProduct = null) {
  const categoryRaw = String(input?.category || "").trim().toLowerCase().replace(/\s+/g, "-");
  const nowIso = new Date().toISOString();
  return {
    id: Math.max(1, Number(assignedId || input?.id || 1)),
    supplierId: Math.max(0, Number(supplier?.id || 0) || 0),
    supplierName: normalizeCompany(supplier?.companyName || supplier?.company),
    supplierCompany: normalizeCompany(supplier?.companyName || supplier?.company),
    name: clampText(input?.name, 190, "Product"),
    category: categoryRaw || "other",
    price: Math.max(0, Number(input?.price || 0)),
    unit: clampText(input?.unit, 30, existingProduct?.unit || "pcs"),
    minOrder: Math.max(1, Number(input?.minOrder || existingProduct?.minOrder || 1)),
    stock: Math.max(0, Number(input?.stock || 0)),
    description: clampText(input?.description, 1000),
    image: clampText(input?.image, 2000),
    isActive: input?.isActive === undefined ? Boolean(existingProduct?.isActive ?? true) : Boolean(input.isActive),
    createdAt: existingProduct?.createdAt ? toIsoString(existingProduct.createdAt) : nowIso,
    updatedAt: nowIso,
  };
}

function mergeBuyerState(current, incoming, actor) {
  const buyer = findActorUser(current.users, actor);
  if (!buyer) {
    throw new ApiError(401, "Хэрэглэгчийн төлөв олдсонгүй.");
  }

  const company = normalizeCompany(buyer.companyName || buyer.company);
  const merged = clone(current);
  const productLookup = buildProductLookup(current.products);

  const incomingCarts = incoming.carts && typeof incoming.carts === "object" ? incoming.carts : {};
  merged.carts = {
    ...(current.carts && typeof current.carts === "object" ? current.carts : {}),
    [company]: sanitizeCartLines(incomingCarts[company]),
  };

  const existingOrders = Array.isArray(current.orders) ? current.orders : [];
  const existingIds = new Set(existingOrders.map((row) => Number(row?.id || 0)).filter((id) => id > 0));
  let nextOrderId = Math.max(1, Number(current.nextOrderId || 1), maxId(existingOrders) + 1);

  const additions = [];
  const incomingOrders = Array.isArray(incoming.orders) ? incoming.orders : [];
  incomingOrders.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    if (normalizeCompany(row.buyerCompany || row.buyerName) !== company) return;
    const requestedId = Number(row.id || 0);
    if (Number.isFinite(requestedId) && requestedId > 0 && existingIds.has(requestedId)) {
      return;
    }

    const errors = validateBuyerOrderPayload(row, index);
    if (errors.length > 0) {
      throw new ApiError(400, "Захиалгын мэдээлэл буруу байна.", errors);
    }

    const fallbackId =
      !Number.isFinite(requestedId) || requestedId < 1 || existingIds.has(requestedId) ? nextOrderId++ : requestedId;
    if (existingIds.has(fallbackId)) return;

    const cleanOrder = sanitizeBuyerOrder(row, buyer, fallbackId, productLookup);
    if (!cleanOrder) return;

    cleanOrder.id = fallbackId;
    existingIds.add(fallbackId);
    additions.push(cleanOrder);
  });

  const incomingBuyerOrders = new Map();
  for (const row of incomingOrders) {
    if (!row || typeof row !== "object") continue;
    if (normalizeCompany(row.buyerCompany || row.buyerName) !== company) continue;
    const id = Number(row.id || 0);
    if (!Number.isFinite(id) || id < 1) continue;
    incomingBuyerOrders.set(id, row);
  }

  const updatedExistingOrders = existingOrders.map((order) => {
    if (normalizeCompany(order?.buyerCompany || order?.buyerName) !== company) return order;
    const patch = incomingBuyerOrders.get(Number(order?.id || 0));
    if (!patch) return order;

    const nextPaymentStatus = normalizePaymentStatus(
      patch.paymentStatus ?? order.paymentStatus,
      order.paymentStatus || "Төлөгдөөгүй"
    );
    const nextStatus =
      normalizeOrderStatus(patch.status, order.status || "Шинэ") === "Худалдан авагч хүлээн авсан"
        ? "Худалдан авагч хүлээн авсан"
        : order.status;

    return {
      ...order,
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
      deliveryStatus: normalizeDeliveryStatus(
        patch.deliveryStatus ?? order.deliveryStatus,
        nextStatus,
        nextPaymentStatus
      ),
      rewardStatus: normalizeRewardStatus(patch.rewardStatus ?? order.rewardStatus, order.rewardStatus || "pending"),
      paymentMethod: clampText(patch.paymentMethod, 64, String(order?.paymentMethod || "")),
      paymentRequestedAt: patch?.paymentRequestedAt ? toIsoString(patch.paymentRequestedAt) : String(order?.paymentRequestedAt || ""),
      paymentConfirmedAt: patch?.paymentConfirmedAt ? toIsoString(patch.paymentConfirmedAt) : String(order?.paymentConfirmedAt || ""),
      statusUpdatedAt: patch?.statusUpdatedAt ? toIsoString(patch.statusUpdatedAt) : String(order?.statusUpdatedAt || ""),
      receivedAt: patch?.receivedAt ? toIsoString(patch.receivedAt) : String(order?.receivedAt || ""),
      qpayInvoiceId: clampText(patch.qpayInvoiceId, 120, String(order?.qpayInvoiceId || "")),
      qpayInvoiceNo: clampText(patch.qpayInvoiceNo, 120, String(order?.qpayInvoiceNo || "")),
      qpayQrText: clampText(patch.qpayQrText, 500, String(order?.qpayQrText || "")),
      qpayQrImage: clampText(patch.qpayQrImage, 500, String(order?.qpayQrImage || "")),
      qpayDeepLink: clampText(patch.qpayDeepLink, 500, String(order?.qpayDeepLink || "")),
      qpayWebUrl: clampText(patch.qpayWebUrl, 500, String(order?.qpayWebUrl || "")),
      qpayReceiverCode: clampText(patch.qpayReceiverCode, 120, String(order?.qpayReceiverCode || "")),
      qpayStatus: clampText(patch.qpayStatus, 64, String(order?.qpayStatus || "")),
      qpayMode: clampText(patch.qpayMode, 32, String(order?.qpayMode || "")),
      qpayPaidAt: patch?.qpayPaidAt ? toIsoString(patch.qpayPaidAt) : String(order?.qpayPaidAt || ""),
      updatedAt: new Date().toISOString(),
    };
  });

  merged.orders = [...updatedExistingOrders, ...additions];
  return recomputeStateMeta(merged);
}

function mergeSupplierState(current, incoming, actor) {
  const supplier = findActorUser(current.users, actor);
  if (!supplier) {
    throw new ApiError(401, "Нийлүүлэгчийн төлөв олдсонгүй.");
  }

  const company = normalizeCompany(supplier.companyName || supplier.company);
  const verified = isVerifiedSupplierUser(supplier);
  const merged = clone(current);

  const currentProducts = Array.isArray(current.products) ? current.products : [];
  const currentOwnProducts = currentProducts.filter(
    (row) => normalizeCompany(row?.supplierCompany || row?.supplierName) === company
  );
  const otherProducts = currentProducts.filter(
    (row) => normalizeCompany(row?.supplierCompany || row?.supplierName) !== company
  );
  const incomingOwnProducts = (Array.isArray(incoming.products) ? incoming.products : []).filter(
    (row) => normalizeCompany(row?.supplierCompany || row?.supplierName) === company
  );

  const currentOrders = Array.isArray(current.orders) ? current.orders : [];
  const incomingOwnOrderRows = (Array.isArray(incoming.orders) ? incoming.orders : []).filter(
    (row) => normalizeCompany(row?.supplierCompany || row?.supplierName) === company
  );

  const productStateChanged = serializeOwnProducts(currentOwnProducts, company) !== serializeOwnProducts(incomingOwnProducts, company);
  const orderStateChanged = serializeOwnSupplierOrders(currentOrders, company) !== serializeOwnSupplierOrders(incomingOwnOrderRows, company);

  if (!verified && (productStateChanged || orderStateChanged)) {
    throw new ApiError(403, "Баталгаажаагүй supplier бараа эсвэл захиалгын action хийх эрхгүй.");
  }

  const productErrors = [];
  incomingOwnProducts.forEach((row, index) => {
    productErrors.push(...validateSupplierProductPayload(row, index));
  });
  if (productErrors.length > 0) {
    throw new ApiError(400, "Барааны мэдээлэл буруу байна.", productErrors);
  }

  const currentOwnProductById = new Map();
  currentOwnProducts.forEach((row) => currentOwnProductById.set(Number(row?.id || 0), row));

  const reservedIds = new Set(otherProducts.map((row) => Number(row?.id || 0)).filter((id) => id > 0));
  const usedOwnIds = new Set();
  let nextProductId = Math.max(1, maxId(currentProducts) + 1);

  const ownProducts = [];
  for (const row of incomingOwnProducts) {
    let id = Number(row?.id || 0);
    if (!Number.isFinite(id) || id < 1 || reservedIds.has(id) || usedOwnIds.has(id)) {
      while (reservedIds.has(nextProductId) || usedOwnIds.has(nextProductId)) {
        nextProductId += 1;
      }
      id = nextProductId;
      nextProductId += 1;
    }

    usedOwnIds.add(id);
    ownProducts.push(sanitizeSupplierProduct(row, supplier, id, currentOwnProductById.get(id)));
  }

  merged.products = [...otherProducts, ...ownProducts];

  const incomingSupplierOrders = new Map();
  for (const row of incomingOwnOrderRows) {
    const id = Number(row.id || 0);
    if (!Number.isFinite(id) || id < 1) continue;
    incomingSupplierOrders.set(id, row);
  }

  merged.orders = currentOrders.map((order) => {
    if (normalizeCompany(order?.supplierCompany || order?.supplierName) !== company) return order;
    const patch = incomingSupplierOrders.get(Number(order?.id || 0));
    if (!patch) return order;

    const nextStatus = normalizeOrderStatus(patch.status ?? order.status, order.status || "Шинэ");
    const nextPaymentStatus = normalizePaymentStatus(
      patch.paymentStatus ?? order.paymentStatus,
      order.paymentStatus || "Төлөгдөөгүй"
    );
    return {
      ...order,
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
      deliveryStatus: normalizeDeliveryStatus(
        patch.deliveryStatus ?? order.deliveryStatus,
        nextStatus,
        nextPaymentStatus
      ),
      payoutStatus: normalizePayoutStatus(patch.payoutStatus ?? order.payoutStatus, order.payoutStatus || "Хүлээгдэж байна"),
      payoutTransferredAt: patch?.payoutTransferredAt ? toIsoString(patch.payoutTransferredAt) : String(order?.payoutTransferredAt || ""),
      supplierAcceptedAt: patch?.supplierAcceptedAt ? toIsoString(patch.supplierAcceptedAt) : String(order?.supplierAcceptedAt || ""),
      shippedAt: patch?.shippedAt ? toIsoString(patch.shippedAt) : String(order?.shippedAt || ""),
      receivedAt: patch?.receivedAt ? toIsoString(patch.receivedAt) : String(order?.receivedAt || ""),
      statusUpdatedAt: patch?.statusUpdatedAt ? toIsoString(patch.statusUpdatedAt) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  return recomputeStateMeta(merged);
}

function mergeStateByRole(current, incoming, actor) {
  if (actor.role === "admin") {
    return recomputeStateMeta(clone(incoming));
  }

  if (actor.role === "buyer") {
    return mergeBuyerState(current, incoming, actor);
  }

  if (actor.role === "supplier") {
    return mergeSupplierState(current, incoming, actor);
  }

  throw new ApiError(401, "Нэвтрэх шаардлагатай.");
}

function userLoginKey(user) {
  return `${normalizeEmail(user?.email)}::${normalizeRole(user?.role)}`;
}

function ensureUniqueUserIds(users) {
  const out = [];
  const used = new Set();
  let nextId = Math.max(1, maxId(users) + 1);

  for (const row of users) {
    if (!row || typeof row !== "object") continue;
    let id = Number(row.id || 0);
    if (!Number.isFinite(id) || id < 1 || used.has(id)) {
      while (used.has(nextId)) nextId += 1;
      id = nextId;
      nextId += 1;
    }

    used.add(id);
    out.push({ ...row, id });
  }

  return out.sort((a, b) => a.id - b.id);
}

function mergeUsersByRole(currentUsers, incomingUsers, actor) {
  const baseUsers = normalizeUsersForState(currentUsers, { includeSensitive: true });
  const nextUsers = normalizeUsersForState(incomingUsers, { includeSensitive: true });

  if (actor.role === "admin") {
    const byLogin = new Map(baseUsers.map((u) => [userLoginKey(u), u]));
    nextUsers.forEach((row) => {
      const key = userLoginKey(row);
      const existing = byLogin.get(key);
      if (!existing) {
        byLogin.set(key, row);
        return;
      }
      byLogin.set(key, {
        ...row,
        bankAccountNumber: clampText(row.bankAccountNumber, 80, existing.bankAccountNumber || ""),
        bankAccount: clampText(row.bankAccount, 120, existing.bankAccount || ""),
        qpayReceiverCode: clampText(row.qpayReceiverCode, 120, existing.qpayReceiverCode || ""),
        bankAccountMasked: clampText(
          row.bankAccountMasked,
          80,
          existing.bankAccountMasked || maskBankAccount(existing.bankAccountNumber)
        ),
        supplierAgreementAccepted: Boolean(row.supplierAgreementAccepted ?? existing.supplierAgreementAccepted ?? false),
        supplierAgreementAcceptedAt: row?.supplierAgreementAcceptedAt
          ? toIsoString(row.supplierAgreementAcceptedAt)
          : String(existing.supplierAgreementAcceptedAt || ""),
        companyName: clampText(row.companyName, 190, existing.companyName || existing.company || ""),
        registerNumber: clampText(row.registerNumber, 80, existing.registerNumber || ""),
        contactPersonName: clampText(row.contactPersonName, 190, existing.contactPersonName || existing.contactName || ""),
        contactPersonPhone: clampText(row.contactPersonPhone, 40, existing.contactPersonPhone || existing.phone || ""),
        contactPersonEmail: normalizeEmail(row.contactPersonEmail || existing.contactPersonEmail || ""),
        verificationStatus: normalizeSupplierVerificationStatus(
          row.verificationStatus ?? existing.verificationStatus,
          normalizeRole(existing.role) === "supplier" ? "verified" : ""
        ),
        verificationNote: clampText(row.verificationNote, 500, existing.verificationNote || ""),
        verifiedAt: row?.verifiedAt ? toIsoString(row.verifiedAt) : String(existing.verifiedAt || ""),
        verifiedBy: clampText(row.verifiedBy, 190, existing.verifiedBy || ""),
        verificationHistory:
          Array.isArray(row.verificationHistory) && row.verificationHistory.length > 0
            ? row.verificationHistory
            : Array.isArray(existing.verificationHistory)
              ? existing.verificationHistory
              : [],
        rewardPoints: normalizePointValue(row.rewardPoints, existing.rewardPoints || 0),
        totalEarnedPoints: normalizePointValue(row.totalEarnedPoints, existing.totalEarnedPoints || existing.rewardPoints || 0),
        totalUsedPoints: normalizePointValue(row.totalUsedPoints, existing.totalUsedPoints || 0),
      });
    });
    return ensureUniqueUserIds(Array.from(byLogin.values()));
  }

  if (actor.role !== "buyer" && actor.role !== "supplier") {
    return ensureUniqueUserIds(baseUsers);
  }

  const role = actor.role;
  const company = actor.company;
  const byLogin = new Map(baseUsers.map((u) => [userLoginKey(u), u]));
  const usedIds = new Set(baseUsers.map((u) => Number(u.id || 0)).filter((id) => id > 0));
  let nextUserId = Math.max(1, maxId(baseUsers) + 1);

  for (const row of nextUsers) {
    if (normalizeRole(row.role) !== role) continue;
    if (normalizeCompany(row.company) !== company) continue;

    const email = normalizeEmail(row.email);
    if (!email) continue;

    const key = `${email}::${role}`;
    const existing = byLogin.get(key);

    if (existing) {
      byLogin.set(key, {
        ...existing,
        company,
        password: String(row.password || existing.password || ""),
        contactName: clampText(row.contactName, 190, existing.contactName || ""),
        phone: clampText(row.phone, 40, existing.phone || ""),
        address: clampText(row.address, 255, existing.address || ""),
        businessType: clampText(row.businessType, 80, existing.businessType || ""),
        bankName: clampText(row.bankName, 120, existing.bankName || ""),
        bankAccountName: clampText(row.bankAccountName, 190, existing.bankAccountName || ""),
        bankAccountNumber: clampText(row.bankAccountNumber, 80, existing.bankAccountNumber || ""),
        bankAccount: clampText(row.bankAccount, 120, existing.bankAccount || ""),
        qpayReceiverCode: clampText(row.qpayReceiverCode, 120, existing.qpayReceiverCode || ""),
        bankAccountMasked: clampText(
          row.bankAccountMasked,
          80,
          existing.bankAccountMasked || maskBankAccount(existing.bankAccountNumber)
        ),
        supplierAgreementAccepted: Boolean(row.supplierAgreementAccepted ?? existing.supplierAgreementAccepted ?? false),
        supplierAgreementAcceptedAt: row?.supplierAgreementAcceptedAt
          ? toIsoString(row.supplierAgreementAcceptedAt)
          : String(existing.supplierAgreementAcceptedAt || ""),
        companyName: clampText(row.companyName, 190, existing.companyName || existing.company || ""),
        registerNumber: clampText(row.registerNumber, 80, existing.registerNumber || ""),
        contactPersonName: clampText(row.contactPersonName, 190, existing.contactPersonName || existing.contactName || ""),
        contactPersonPhone: clampText(row.contactPersonPhone, 40, existing.contactPersonPhone || existing.phone || ""),
        contactPersonEmail: normalizeEmail(row.contactPersonEmail || existing.contactPersonEmail || ""),
        verificationStatus: existing.verificationStatus || (role === "supplier" ? "verified" : ""),
        verificationNote: existing.verificationNote || "",
        verifiedAt: existing.verifiedAt || "",
        verifiedBy: existing.verifiedBy || "",
        verificationHistory: Array.isArray(existing.verificationHistory) ? existing.verificationHistory : [],
        rewardPoints: role === "buyer" ? normalizePointValue(row.rewardPoints, existing.rewardPoints || 0) : normalizePointValue(existing.rewardPoints, 0),
        totalEarnedPoints: role === "buyer" ? normalizePointValue(row.totalEarnedPoints, existing.totalEarnedPoints || existing.rewardPoints || 0) : normalizePointValue(existing.totalEarnedPoints, existing.rewardPoints || 0),
        totalUsedPoints: role === "buyer" ? normalizePointValue(row.totalUsedPoints, existing.totalUsedPoints || 0) : normalizePointValue(existing.totalUsedPoints, 0),
      });
      continue;
    }

    let id = Number(row.id || 0);
    if (!Number.isFinite(id) || id < 1 || usedIds.has(id)) {
      while (usedIds.has(nextUserId)) nextUserId += 1;
      id = nextUserId;
      nextUserId += 1;
    }

    usedIds.add(id);
    byLogin.set(key, {
      id,
      role,
      company,
      email,
      password: String(row.password || ""),
      contactName: clampText(row.contactName, 190),
      contactPersonName: clampText(row.contactPersonName, 190, clampText(row.contactName, 190)),
      phone: clampText(row.phone, 40),
      contactPersonPhone: clampText(row.contactPersonPhone, 40),
      contactPersonEmail: normalizeEmail(row.contactPersonEmail || ""),
      address: clampText(row.address, 255),
      businessType: clampText(row.businessType, 80),
      bankName: clampText(row.bankName, 120),
      bankAccountName: clampText(row.bankAccountName, 190),
      bankAccountNumber: clampText(row.bankAccountNumber, 80),
      bankAccount: clampText(row.bankAccount, 120),
      qpayReceiverCode: clampText(row.qpayReceiverCode, 120),
      bankAccountMasked: clampText(row.bankAccountMasked, 80, maskBankAccount(row.bankAccountNumber)),
      supplierAgreementAccepted: Boolean(row.supplierAgreementAccepted || false),
      supplierAgreementAcceptedAt: row?.supplierAgreementAcceptedAt ? toIsoString(row.supplierAgreementAcceptedAt) : "",
      companyName: clampText(row.companyName, 190, company),
      registerNumber: clampText(row.registerNumber, 80),
      verificationStatus: role === "supplier" ? "pending" : "",
      verificationNote: "",
      verifiedAt: "",
      verifiedBy: "",
      verificationHistory: Array.isArray(row.verificationHistory) ? row.verificationHistory : [],
      rewardPoints: role === "buyer" ? normalizePointValue(row.rewardPoints, 0) : 0,
      totalEarnedPoints: role === "buyer" ? normalizePointValue(row.totalEarnedPoints, row.rewardPoints || 0) : 0,
      totalUsedPoints: role === "buyer" ? normalizePointValue(row.totalUsedPoints, 0) : 0,
      createdAt: toIsoString(row.createdAt),
    });
  }

  return ensureUniqueUserIds(Array.from(byLogin.values()));
}

function buildCurrentState(stateDoc, users, { includeSensitiveUsers = false } = {}) {
  const normalizedUsers = normalizeUsersForState(users, { includeSensitive: includeSensitiveUsers });
  const rawState = stateDoc?.state && typeof stateDoc.state === "object" ? stateDoc.state : {};

  return sanitizeStateInput({
    ...rawState,
    users: normalizedUsers,
    nextUserId: Math.max(Number(rawState?.nextUserId || 1), maxId(normalizedUsers) + 1),
  });
}

module.exports = {
  mergeStateByRole,
  mergeUsersByRole,
  normalizeUsersForState,
  buildCurrentState,
  recomputeStateMeta,
};
