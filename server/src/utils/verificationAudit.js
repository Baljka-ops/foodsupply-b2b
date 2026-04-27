const { normalizeSupplierVerificationStatus } = require("./auth");
const { cleanText } = require("./validation");

function toIsoString(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeVerificationHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const fromStatus = normalizeSupplierVerificationStatus(row.fromStatus, "");
      const toStatus = normalizeSupplierVerificationStatus(row.toStatus || row.status, "pending");
      return {
        action: cleanText(row.action, 40),
        fromStatus,
        toStatus,
        status: toStatus,
        note: cleanText(row.note, 500),
        changedBy: cleanText(row.changedBy, 190),
        changedAt: toIsoString(row.changedAt),
      };
    })
    .filter((row) => row.action || row.fromStatus || row.toStatus || row.note || row.changedBy)
    .slice(-25);
}

function buildVerificationHistoryEntry(entry) {
  const fromStatus = normalizeSupplierVerificationStatus(entry?.fromStatus, "");
  const toStatus = normalizeSupplierVerificationStatus(entry?.toStatus || entry?.status, "pending");
  return {
    action: cleanText(entry?.action, 40),
    fromStatus,
    toStatus,
    status: toStatus,
    note: cleanText(entry?.note, 500),
    changedBy: cleanText(entry?.changedBy, 190),
    changedAt: toIsoString(entry?.changedAt),
  };
}

function appendVerificationHistoryEntry(user, entry) {
  user.verificationHistory = [
    ...normalizeVerificationHistory(user?.verificationHistory),
    buildVerificationHistoryEntry(entry),
  ].slice(-25);
}

module.exports = {
  normalizeVerificationHistory,
  buildVerificationHistoryEntry,
  appendVerificationHistoryEntry,
};
