const { sanitizeString } = require("./_lib/http");
const { upsertMessage } = require("./_lib/supabase");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
      }),
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Method Not Allowed",
      }),
    };
  }

  let payload;

  try {
    payload = JSON.parse(event.body);
  } catch (_error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "Invalid JSON body",
      }),
    };
  }

  const validated = validatePayload(payload);

  if (typeof validated === "string") {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: validated,
      }),
    };
  }

  try {
    console.log("Incoming message:", validated);
    await upsertMessage(validated);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: validated.id,
      }),
    };
  } catch (error) {
    console.error("Failed to persist benzinga message", {
      error: error?.message || String(error),
      id: validated.id,
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error?.message || "Failed to persist message",
      }),
    };
  }
};
