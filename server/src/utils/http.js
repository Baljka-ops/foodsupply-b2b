class ApiError extends Error {
  constructor(status, message, errors = [], code = "") {
    super(String(message || "Request failed"));
    this.name = "ApiError";
    this.status = Math.max(400, Number(status || 500) || 500);
    this.errors = Array.isArray(errors) ? errors.filter(Boolean) : [];
    this.code = String(code || "").trim();
  }
}

function normalizeErrors(errors) {
  if (!Array.isArray(errors)) return [];
  return errors
    .filter(Boolean)
    .map((row) => {
      if (typeof row === "string") {
        return { field: "", message: row };
      }
      if (row && typeof row === "object") {
        return {
          field: String(row.field || "").trim(),
          message: String(row.message || "").trim(),
        };
      }
      return null;
    })
    .filter((row) => row && row.message);
}

function sendSuccess(res, { status = 200, message = "OK", data = {}, extra = {} } = {}) {
  const payload = {
    success: true,
    ok: true,
    message: String(message || "OK"),
    data: data && typeof data === "object" ? data : {},
    ...(extra && typeof extra === "object" ? extra : {}),
  };
  return res.status(status).json(payload);
}

function sendError(res, { status = 400, message = "Request failed", errors = [], extra = {} } = {}) {
  const normalized = normalizeErrors(errors);
  const payload = {
    success: false,
    ok: false,
    message: String(message || "Request failed"),
    error: String(message || "Request failed"),
    errors: normalized,
    ...(extra && typeof extra === "object" ? extra : {}),
  };
  return res.status(Math.max(400, Number(status || 400) || 400)).json(payload);
}

function fromThrownError(error) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      message: error.message,
      errors: normalizeErrors(error.errors),
      code: error.code,
    };
  }

  const status = Math.max(400, Number(error?.status || 500) || 500);
  return {
    status,
    message: status >= 500 ? "Server error" : String(error?.message || "Request failed"),
    errors: normalizeErrors(error?.errors),
    code: String(error?.code || "").trim(),
  };
}

module.exports = {
  ApiError,
  normalizeErrors,
  sendSuccess,
  sendError,
  fromThrownError,
};
