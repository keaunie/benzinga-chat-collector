function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Collector-Token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function sanitizeString(value, maxLength = 4000) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseJsonBody(event) {
  if (!event || typeof event.body !== "string" || event.body.length === 0) {
    return null;
  }

  try {
    return JSON.parse(event.body);
  } catch (_err) {
    return null;
  }
}

module.exports = {
  jsonResponse,
  corsHeaders,
  sanitizeString,
  parseJsonBody,
};
