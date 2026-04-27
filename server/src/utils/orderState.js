function clean(value) {
  return String(value || "").trim();
}

function normalizeOrderStatus(value, fallback = "Шинэ") {
  const original = clean(value);
  if (!original) return fallback;
  const normalized = original.toLowerCase();

  if (normalized.includes("нийлүүлэгч") && normalized.includes("хүлээн")) return "Нийлүүлэгч хүлээн авсан";
  if (normalized.includes("баталга")) return "Нийлүүлэгч хүлээн авсан";
  if (normalized.includes("хүргэлт") || normalized.includes("замд") || normalized.includes("ship")) {
    return "Хүргэлтэд гарсан";
  }
  if (normalized.includes("худалдан") && normalized.includes("хүлээн")) return "Худалдан авагч хүлээн авсан";
  if (normalized.includes("дуус")) return "Худалдан авагч хүлээн авсан";
  if (normalized.includes("cancel") || normalized.includes("цуц")) return "Цуцлагдсан";
  if (normalized.includes("шинэ") || normalized.includes("new")) return "Шинэ";
  return fallback || original;
}

function normalizePaymentStatus(value, fallback = "Төлөгдөөгүй") {
  const original = clean(value);
  if (!original) return fallback;
  const normalized = original.toLowerCase();

  if (normalized.includes("нийлүүлэгч") && normalized.includes("шилж")) return "Нийлүүлэгчид шилжүүлсэн";
  if (normalized.includes("эскроу")) return "Эскроу төлөгдсөн";
  if (normalized.includes("төлөгдсөн") || normalized.includes("paid") || normalized.includes("success")) {
    return "Төлөгдсөн";
  }
  if (normalized.includes("unpaid") || normalized.includes("хүлээгд") || normalized.includes("төлөгдөөгүй")) {
    return "Төлөгдөөгүй";
  }
  return fallback || original;
}

function normalizePayoutStatus(value, fallback = "Хүлээгдэж байна") {
  const original = clean(value);
  if (!original) return fallback;
  const normalized = original.toLowerCase();
  if (normalized.includes("шилж")) return "Шилжүүлсэн";
  if (normalized.includes("pending") || normalized.includes("хүлээгд")) return "Хүлээгдэж байна";
  return fallback || original;
}

function normalizeDeliveryStatus(value, orderStatus = "Шинэ", paymentStatus = "Төлөгдөөгүй") {
  const original = clean(value);
  const normalizedOrder = normalizeOrderStatus(orderStatus, "Шинэ");
  const normalizedPayment = normalizePaymentStatus(paymentStatus, "Төлөгдөөгүй");

  if (normalizedOrder === "Худалдан авагч хүлээн авсан") return "Хүлээн авсан";
  if (normalizedOrder === "Хүргэлтэд гарсан") return "Замд";
  if (normalizedOrder === "Нийлүүлэгч хүлээн авсан") return "Бэлтгэж байна";
  if (normalizedPayment !== "Төлөгдөөгүй") return "Төлбөр баталгаажсан";

  if (!original) return "Хүлээгдэж байна";
  const normalized = original.toLowerCase();
  if (normalized.includes("хүлээн")) return "Хүлээн авсан";
  if (normalized.includes("зам") || normalized.includes("хүргэлт")) return "Замд";
  if (normalized.includes("бэлтг")) return "Бэлтгэж байна";
  if (normalized.includes("төлбөр")) return "Төлбөр баталгаажсан";
  return original;
}

module.exports = {
  normalizeOrderStatus,
  normalizePaymentStatus,
  normalizePayoutStatus,
  normalizeDeliveryStatus,
};
