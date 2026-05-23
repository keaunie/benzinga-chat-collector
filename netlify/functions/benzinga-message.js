const { jsonResponse, corsHeaders, sanitizeString, parseJsonBody } = require("./_lib/http");
const { upsertMessage } = require("./_lib/supabase");
const { getEnv } = require("./_lib/env");

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Invalid JSON payload";
  }

  const id = sanitizeString(payload.id, 256);
  const username = sanitizeString(payload.username, 512);
  const timestamp = sanitizeString(payload.timestamp, 128);
  const message = sanitizeString(payload.message, 8000);
  const capturedAt = sanitizeString(payload.capturedAt, 64);

  if (!id) return "Field 'id' is required";
  if (!message) return "Field 'message' is required";
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
    return "Field 'capturedAt' must be an ISO date";
  }

  return {
    id,
    username: username || "Unknown",
    timestamp: timestamp || "",
    message,
    capturedAt: new Date(capturedAt).toISOString(),
    source: "benzinga-extension",
  };
}

function isAuthorized(event) {
  const expectedToken = getEnv("COLLECTOR_INGEST_TOKEN", "");
  if (!expectedToken) return true;

  const headerToken =
    event?.headers?.["x-collector-token"] ||
    event?.headers?.["X-Collector-Token"] ||
    event?.headers?.["x_collector_token"];

  return sanitizeString(headerToken, 512) === expectedToken;
}

exports.handler = async (event) => {
  const cors = corsHeaders();

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: cors,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(
      405,
      {
        ok: false,
        error: "Method not allowed",
      },
      cors,
    );
  }

  if (!isAuthorized(event)) {
    return jsonResponse(
      401,
      {
        ok: false,
        error: "Unauthorized",
      },
      cors,
    );
  }

  const payload = parseJsonBody(event);
  const validated = validatePayload(payload);

  if (typeof validated === "string") {
    return jsonResponse(
      400,
      {
        ok: false,
        error: validated,
      },
      cors,
    );
  }

  try {
    await upsertMessage(validated);

    return jsonResponse(
      200,
      {
        ok: true,
        id: validated.id,
      },
      cors,
    );
  } catch (error) {
    console.error("Failed to persist benzinga message", {
      error: error?.message || String(error),
      id: validated.id,
    });

    return jsonResponse(
      500,
      {
        ok: false,
        error: "Failed to persist message",
      },
      cors,
    );
  }
};
