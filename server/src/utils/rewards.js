const REWARD_POINT_STEP_AMOUNT = 10000;
const REWARD_POINTS_PER_STEP = 100;
const REWARD_STATUSES = new Set(["pending", "earned", "skipped", "cancelled"]);

function normalizePointValue(value, fallback = 0) {
  const numeric = Math.floor(Number(value));
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const fallbackValue = Math.floor(Number(fallback));
  return Number.isFinite(fallbackValue) && fallbackValue >= 0 ? fallbackValue : 0;
}

function normalizeRewardStatus(value, fallback = "pending") {
  const status = String(value || "").trim().toLowerCase();
  if (REWARD_STATUSES.has(status)) return status;

  const fallbackStatus = String(fallback || "").trim().toLowerCase();
  if (REWARD_STATUSES.has(fallbackStatus)) return fallbackStatus;
  return "pending";
}

function calculateEarnedPoints(amount) {
  const eligibleAmount = Math.max(0, Number(amount || 0));
  return Math.floor(eligibleAmount / REWARD_POINT_STEP_AMOUNT) * REWARD_POINTS_PER_STEP;
}

function sanitizeRewardSummary(user = {}) {
  const rewardPoints = normalizePointValue(user.rewardPoints, 0);
  const totalEarnedPoints = Math.max(rewardPoints, normalizePointValue(user.totalEarnedPoints, rewardPoints));
  const totalUsedPoints = normalizePointValue(user.totalUsedPoints, 0);
  return {
    rewardPoints,
    totalEarnedPoints,
    totalUsedPoints,
  };
}

module.exports = {
  REWARD_POINT_STEP_AMOUNT,
  REWARD_POINTS_PER_STEP,
  normalizePointValue,
  normalizeRewardStatus,
  calculateEarnedPoints,
  sanitizeRewardSummary,
};
