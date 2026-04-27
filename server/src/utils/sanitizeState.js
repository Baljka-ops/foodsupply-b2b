const { normalizeSupplierVerificationStatus } = require("./auth");
const { normalizeVerificationHistory: normalizeVerificationHistoryEntries } = require("./verificationAudit");
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
  normalizeCouponRecord,
} = require("./coupons");

const KNOWN_ROLES = new Set(["buyer", "supplier", "admin"]);

function maxId(rows) {
  return rows.reduce((acc, row) => Math.max(acc, Number(row?.id || 0)), 0);
}

function toIsoString(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

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

function normalizeCompanyKey(value) {
  return normalizeCompany(value).toLowerCase();
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

function maskBankAccount(value) {
  const clean = String(value || "").replace(/\s+/g, "");
  if (!clean) return "";
  if (clean.length <= 4) return clean;
  return `${"*".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

function resolveSupplierVerificationFallback(row, role) {
  if (role !== "supplier") return "";
  if (String(row?.verificationStatus || "").trim()) return "pending";
  if (row?.verifiedAt || row?.verifiedBy) return "verified";
  if (Array.isArray(row?.verificationHistory) && row.verificationHistory.length > 0) return "verified";
  if (row?.supplierAgreementAccepted || row?.registerNumber || row?.bankName || row?.qpayReceiverCode) {
    return "verified";
  }
  return "pending";
}

function sanitizeVerificationHistory(history, context = {}) {
  const clean = normalizeVerificationHistoryEntries(history).map((row) => ({
    action: clampText(row.action, 40),
    fromStatus: normalizeSupplierVerificationStatus(row.fromStatus, ""),
    toStatus: normalizeSupplierVerificationStatus(row.toStatus || row.status, context.verificationStatus || "pending"),
    status: normalizeSupplierVerificationStatus(row.toStatus || row.status, context.verificationStatus || "pending"),
    note: clampText(row.note, 500),
    changedBy: clampText(row.changedBy, 190),
    changedAt: toIsoString(row.changedAt || context.verifiedAt || context.createdAt),
  }));

  if (clean.length > 0) {
    return clean.slice(-25);
  }

  if (context.role !== "supplier") return [];

  const status = normalizeSupplierVerificationStatus(context.verificationStatus, "pending");
  if (!status) return [];
  if (status === "pending" && !context.supplierAgreementAccepted) return [];

  const action =
    status === "verified"
      ? "verify"
      : status === "rejected"
        ? "reject"
        : status === "suspended"
          ? "suspend"
          : "submitted";

  return [
    {
      action,
      fromStatus: "",
      toStatus: status,
      status,
      note: clampText(context.verificationNote, 500),
      changedBy: clampText(
        context.verifiedBy || context.contactPersonEmail || context.email || context.companyName || context.company,
        190
      ),
      changedAt: toIsoString(
        context.verifiedAt || context.supplierAgreementAcceptedAt || context.createdAt || new Date().toISOString()
      ),
    },
  ];
}

function sanitizeUsers(input) {
  if (!Array.isArray(input)) return [];

  const clean = input
    .filter((row) => row && typeof row === "object")
    .map((row, index) => {
      const role = normalizeRole(row.role);
      const company = normalizeCompany(row.company);
      const companyName = clampText(row.companyName, 190, company);
      const email = normalizeEmail(row.email);
      const verificationStatus = normalizeSupplierVerificationStatus(
        row.verificationStatus,
        resolveSupplierVerificationFallback(row, role)
      );
      const supplierAgreementAccepted = Boolean(row.supplierAgreementAccepted || false);
      const createdAt = toIsoString(row.createdAt);

      return {
        id: Math.max(1, Number(row.id || index + 1)),
        role,
        company,
        companyName,
        registerNumber: clampText(row.registerNumber, 80),
        email,
        password: String(row.password || ""),
        contactName: clampText(row.contactName, 190),
        contactPersonName: clampText(row.contactPersonName, 190, clampText(row.contactName, 190)),
        phone: clampText(row.phone, 40),
        contactPersonPhone: clampText(row.contactPersonPhone, 40, clampText(row.phone, 40)),
        contactPersonEmail: normalizeEmail(row.contactPersonEmail || email),
        address: clampText(row.address, 255),
        businessType: clampText(row.businessType, 80),
        bankName: clampText(row.bankName, 120),
        bankAccountName: clampText(row.bankAccountName, 190),
        bankAccountNumber: clampText(row.bankAccountNumber, 80),
        bankAccount: clampText(row.bankAccount, 120),
        qpayReceiverCode: clampText(row.qpayReceiverCode, 120),
        bankAccountMasked: clampText(row.bankAccountMasked, 80, maskBankAccount(row.bankAccountNumber)),
        supplierAgreementAccepted,
        supplierAgreementAcceptedAt: row.supplierAgreementAcceptedAt
          ? toIsoString(row.supplierAgreementAcceptedAt)
          : "",
        verificationStatus,
        verificationNote: clampText(row.verificationNote, 500),
        verifiedAt: row.verifiedAt ? toIsoString(row.verifiedAt) : "",
        verifiedBy: clampText(row.verifiedBy, 190),
        rewardPoints: normalizePointValue(row.rewardPoints, 0),
        totalEarnedPoints: normalizePointValue(row.totalEarnedPoints, row.rewardPoints || 0),
        totalUsedPoints: normalizePointValue(row.totalUsedPoints, 0),
        verificationHistory: sanitizeVerificationHistory(row.verificationHistory, {
          role,
          company,
          companyName,
          email,
          contactPersonEmail: row.contactPersonEmail || email,
          supplierAgreementAccepted,
          supplierAgreementAcceptedAt: row.supplierAgreementAcceptedAt,
          verificationStatus,
          verificationNote: row.verificationNote,
          verifiedAt: row.verifiedAt,
          verifiedBy: row.verifiedBy,
          createdAt,
        }),
        createdAt,
      };
    });

  const byId = new Map();
  clean.forEach((row) => byId.set(row.id, row));
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

function buildUserLookups(users) {
  const supplierIdByKey = new Map();
  const buyerIdByKey = new Map();
  const supplierNameById = new Map();
  const buyerNameById = new Map();

  users.forEach((user) => {
    const key = normalizeCompanyKey(user.companyName || user.company);
    if (!key) return;

    if (user.role === "supplier") {
      supplierIdByKey.set(key, Number(user.id || 0));
      supplierNameById.set(Number(user.id || 0), clampText(user.companyName || user.company, 190));
    }

    if (user.role === "buyer") {
      buyerIdByKey.set(key, Number(user.id || 0));
      buyerNameById.set(Number(user.id || 0), clampText(user.companyName || user.company, 190));
    }
  });

  return {
    supplierIdByKey,
    buyerIdByKey,
    supplierNameById,
    buyerNameById,
  };
}

function sanitizeProducts(input, userLookups) {
  if (!Array.isArray(input)) return [];

  const clean = input
    .filter((row) => row && typeof row === "object")
    .map((row, index) => {
      const id = Math.max(1, Number(row.id || index + 1));
      const supplierNameRaw = clampText(row.supplierName || row.supplierCompany || row.supplier, 190);
      const supplierIdRaw = Math.max(0, Number(row.supplierId || 0) || 0);
      const supplierId = supplierIdRaw || userLookups.supplierIdByKey.get(normalizeCompanyKey(supplierNameRaw)) || 0;
      const supplierName =
        supplierNameRaw || clampText(userLookups.supplierNameById.get(supplierId), 190, "Нийлүүлэгч");
      const createdAt = toIsoString(row.createdAt);
      const updatedAt = toIsoString(row.updatedAt || row.createdAt);

      return {
        id,
        supplierId,
        supplierName,
        supplierCompany: supplierName,
        name: clampText(row.name, 190, "Product"),
        category: clampText(String(row.category || "").toLowerCase(), 80, "other"),
        price: Math.max(0, Number(row.price || 0)),
        stock: Math.max(0, Number(row.stock || 0)),
        description: clampText(row.description, 1000),
        image: clampText(row.image, 2000),
        isActive: row.isActive === undefined ? true : Boolean(row.isActive),
        unit: clampText(row.unit, 30, "pcs"),
        minOrder: Math.max(1, Number(row.minOrder || 1)),
        createdAt,
        updatedAt,
      };
    });

  const byId = new Map();
  clean.forEach((row) => byId.set(row.id, row));
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

function buildProductLookups(products) {
  const byId = new Map();
  products.forEach((product) => {
    byId.set(Number(product.id || 0), product);
  });
  return { byId };
}

function sanitizeOrderItems(items, context = {}, productLookups = { byId: new Map() }) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const productId = Math.max(1, Number(row.productId || 0) || 1);
      const product = productLookups.byId.get(productId);
      const productName = clampText(row.productName || row.name, 190, clampText(product?.name, 190, "Product"));
      const quantity = Math.max(1, Number(row.quantity || row.qty || 1) || 1);
      const unitPrice = Math.max(0, Number(row.unitPrice ?? row.price ?? product?.price ?? 0));
      const lineTotal = Math.max(0, Number(row.lineTotal ?? row.subtotal ?? unitPrice * quantity));
      const supplierId =
        Math.max(0, Number(row.supplierId || 0) || 0) ||
        Math.max(0, Number(context.supplierId || 0) || 0) ||
        Math.max(0, Number(product?.supplierId || 0) || 0);
      const supplierName = clampText(
        row.supplierName || row.supplierCompany,
        190,
        clampText(context.supplierName || product?.supplierName || product?.supplierCompany, 190)
      );
      const unit = clampText(row.unit, 30, clampText(product?.unit, 30, "pcs"));

      return {
        productId,
        productName,
        name: productName,
        quantity,
        qty: quantity,
        unitPrice,
        price: unitPrice,
        lineTotal,
        subtotal: lineTotal,
        unit,
        supplierId,
        supplierName,
        supplierCompany: supplierName,
      };
    });
}

function sanitizeOrders(input, userLookups, productLookups) {
  if (!Array.isArray(input)) return [];

  const clean = input
    .filter((row) => row && typeof row === "object")
    .map((row, index) => {
      const id = Math.max(1, Number(row.id || index + 1));
      const buyerNameRaw = clampText(row.buyerName || row.buyerCompany, 190);
      const buyerIdRaw = Math.max(0, Number(row.buyerId || 0) || 0);
      const buyerId = buyerIdRaw || userLookups.buyerIdByKey.get(normalizeCompanyKey(buyerNameRaw)) || 0;
      const buyerName = buyerNameRaw || clampText(userLookups.buyerNameById.get(buyerId), 190, "Buyer");

      const supplierNameRaw = clampText(row.supplierName || row.supplierCompany, 190);
      const supplierIdRaw = Math.max(0, Number(row.supplierId || 0) || 0);
      const supplierId =
        supplierIdRaw || userLookups.supplierIdByKey.get(normalizeCompanyKey(supplierNameRaw)) || 0;

      const items = sanitizeOrderItems(
        row.items,
        {
          supplierId,
          supplierName: supplierNameRaw,
        },
        productLookups
      );

      if (items.length === 0) return null;

      const resolvedSupplierId = Math.max(
        0,
        supplierId || Number(items[0]?.supplierId || 0) || 0
      );
      const resolvedSupplierName =
        supplierNameRaw ||
        clampText(items[0]?.supplierName, 190) ||
        clampText(userLookups.supplierNameById.get(resolvedSupplierId), 190, "Supplier");

      const totalAmount = Math.max(
        0,
        Number(row.totalAmount ?? row.total ?? items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0))
      );
      const subtotal = Math.max(0, Number(row.subtotal ?? totalAmount));
      const discountAmount = Math.max(0, Math.min(subtotal, Number(row.discountAmount || 0)));
      const usedPoints = Math.max(0, Math.min(subtotal - discountAmount, Number(row.usedPoints || 0)));
      const finalAmount = Math.max(0, Number(row.finalAmount ?? subtotal - discountAmount - usedPoints));
      const earnedPoints = normalizePointValue(row.earnedPoints, calculateEarnedPoints(finalAmount));
      const normalizedStatus = normalizeOrderStatus(row.status, "Шинэ");
      const normalizedPaymentStatus = normalizePaymentStatus(row.paymentStatus, "Төлөгдөөгүй");
      const createdAt = toIsoString(row.createdAt);
      const updatedAt = toIsoString(
        row.updatedAt ||
          row.statusUpdatedAt ||
          row.paymentConfirmedAt ||
          row.payoutTransferredAt ||
          row.receivedAt ||
          row.shippedAt ||
          row.supplierAcceptedAt ||
          row.createdAt
      );

      return {
        id,
        buyerId,
        buyerName,
        buyerCompany: buyerName,
        supplierId: resolvedSupplierId,
        supplierName: resolvedSupplierName,
        supplierCompany: resolvedSupplierName,
        items,
        subtotal,
        discountAmount,
        usedPoints,
        earnedPoints,
        finalAmount,
        rewardStatus: normalizeRewardStatus(row.rewardStatus, "pending"),
        appliedCouponCode: normalizeCouponCode(row.appliedCouponCode),
        pickupDate: normalizePickupDate(row.pickupDate),
        pickupTimeSlot: normalizePickupTimeSlot(row.pickupTimeSlot),
        pickupNote: clampText(row.pickupNote, 500),
        deliveryAddress: clampText(row.deliveryAddress, 255),
        locationNote: clampText(row.locationNote, 500),
        contactPhone: clampText(row.contactPhone, 40),
        latitude: normalizeNullableNumber(row.latitude),
        longitude: normalizeNullableNumber(row.longitude),
        mapUrl: normalizeExternalUrl(row.mapUrl),
        totalAmount,
        total: totalAmount,
        status: normalizedStatus,
        paymentStatus: normalizedPaymentStatus,
        deliveryStatus: clampText(
          normalizeDeliveryStatus(row.deliveryStatus, normalizedStatus, normalizedPaymentStatus),
          64,
          "Хүлээгдэж байна"
        ),
        platformFeeRate: Math.max(0, Number(row.platformFeeRate || 0)),
        platformFeeAmount: Math.max(0, Number(row.platformFeeAmount || 0)),
        supplierPayoutAmount: Math.max(
          0,
          Number(row.supplierPayoutAmount || totalAmount - Number(row.platformFeeAmount || 0))
        ),
        payoutStatus: clampText(normalizePayoutStatus(row.payoutStatus, "Хүлээгдэж байна"), 64, "Хүлээгдэж байна"),
        payoutTransferredAt: row.payoutTransferredAt ? toIsoString(row.payoutTransferredAt) : "",
        paymentMethod: clampText(row.paymentMethod, 64, "supplier_qpay"),
        paymentRequestedAt: row.paymentRequestedAt ? toIsoString(row.paymentRequestedAt) : "",
        paymentConfirmedAt: row.paymentConfirmedAt ? toIsoString(row.paymentConfirmedAt) : "",
        statusUpdatedAt: row.statusUpdatedAt ? toIsoString(row.statusUpdatedAt) : "",
        supplierAcceptedAt: row.supplierAcceptedAt ? toIsoString(row.supplierAcceptedAt) : "",
        shippedAt: row.shippedAt ? toIsoString(row.shippedAt) : "",
        receivedAt: row.receivedAt ? toIsoString(row.receivedAt) : "",
        qpayInvoiceId: clampText(row.qpayInvoiceId, 120),
        qpayInvoiceNo: clampText(row.qpayInvoiceNo, 120),
        qpayQrText: clampText(row.qpayQrText, 500),
        qpayQrImage: clampText(row.qpayQrImage, 500),
        qpayDeepLink: clampText(row.qpayDeepLink, 500),
        qpayWebUrl: clampText(row.qpayWebUrl, 500),
        qpayReceiverCode: clampText(row.qpayReceiverCode, 120),
        qpayStatus: clampText(row.qpayStatus, 64, "PENDING"),
        qpayMode: clampText(row.qpayMode, 32, "mock"),
        qpayPaidAt: row.qpayPaidAt ? toIsoString(row.qpayPaidAt) : "",
        createdAt,
        updatedAt,
      };
    })
    .filter(Boolean);

  const byId = new Map();
  clean.forEach((row) => byId.set(row.id, row));
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

function sanitizeAnnouncements(input) {
  if (!Array.isArray(input)) return [];

  return input
    .filter((row) => row && typeof row === "object")
    .map((row, index) => ({
      id: Math.max(1, Number(row.id || index + 1)),
      text: clampText(row.text, 1000),
      createdAt: toIsoString(row.createdAt),
    }));
}

function sanitizeCoupons(input) {
  if (!Array.isArray(input)) return [];

  const clean = input
    .filter((row) => row && typeof row === "object")
    .map((row, index) => normalizeCouponRecord(row, Number(row.id || index + 1)))
    .filter((row) => row.code);

  const byCode = new Map();
  clean.forEach((row) => {
    byCode.set(row.code, row);
  });
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function sanitizeStateInput(input) {
  const users = sanitizeUsers(input?.users);
  const userLookups = buildUserLookups(users);
  const products = sanitizeProducts(input?.products, userLookups);
  const productLookups = buildProductLookups(products);
  const orders = sanitizeOrders(input?.orders, userLookups, productLookups);
  const announcements = sanitizeAnnouncements(input?.announcements);
  const coupons = sanitizeCoupons(input?.coupons);
  const nextUserId = Math.max(1, Number(input?.nextUserId || 1), maxId(users) + 1);

  const state = {
    products,
    orders,
    coupons,
    carts: input?.carts && typeof input.carts === "object" ? input.carts : {},
    meta: input?.meta && typeof input.meta === "object" ? input.meta : {},
    announcements,
    nextProductId: Math.max(1, Number(input?.nextProductId || 1), maxId(products) + 1),
    nextOrderId: Math.max(1, Number(input?.nextOrderId || 1), maxId(orders) + 1),
    nextNoticeId: Math.max(1, Number(input?.nextNoticeId || 1), maxId(announcements) + 1),
    nextCouponId: Math.max(1, Number(input?.nextCouponId || 1), maxId(coupons) + 1),
    users,
    nextUserId,
    session: null,
  };

  if (state.products.length > 10000 || state.orders.length > 50000 || users.length > 20000) {
    const error = new Error("State too large");
    error.status = 413;
    throw error;
  }

  return state;
}

module.exports = {
  sanitizeStateInput,
  sanitizeUsers,
  sanitizeProducts,
  sanitizeOrders,
  sanitizeOrderItems,
  sanitizeCoupons,
  sanitizeVerificationHistory,
  maxId,
};
