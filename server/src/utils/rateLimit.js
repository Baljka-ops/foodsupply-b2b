function resolveClientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = String(req?.headers?.["x-real-ip"] || "").trim();
  if (realIp) return realIp;

  return String(req?.ip || req?.socket?.remoteAddress || "unknown").trim();
}

function createIpRateLimiter({ windowMs, max, label = "api" }) {
  const buckets = new Map();
  const limit = Math.max(1, Number(max || 1));
  const windowSizeMs = Math.max(1000, Number(windowMs || 60_000));

  return function ipRateLimiter(req, res, next) {
    const now = Date.now();
    const ip = resolveClientIp(req);
    const key = `${label}:${ip}`;

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowSizeMs };
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 20_000) {
      for (const [storedKey, storedBucket] of buckets) {
        if (now >= storedBucket.resetAt) {
          buckets.delete(storedKey);
        }
      }
    }

    const remaining = Math.max(0, limit - bucket.count);
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > limit) {
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        ok: false,
        error: "Too many requests. Please try again shortly.",
      });
    }

    return next();
  };
}

module.exports = {
  createIpRateLimiter,
};

