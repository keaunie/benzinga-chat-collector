const { getEnv, assertEnv, REQUIRED_ENV_BY_FEATURE } = require("./env");
const { sanitizeString } = require("./http");

const TABLE_MESSAGES = "benzinga_messages";
const TABLE_REPORTS = "benzinga_reports";

function getBaseUrl() {
  const url = getEnv("SUPABASE_URL");
  if (!url) {
    throw new Error("SUPABASE_URL is not configured");
  }
  return `${url.replace(/\/$/, "")}/rest/v1`;
}

function getServiceRoleKey() {
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return key;
}

async function supabaseFetch(path, init = {}) {
  assertEnv(REQUIRED_ENV_BY_FEATURE.supabase, "supabase");

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      apikey: getServiceRoleKey(),
      Authorization: `Bearer ${getServiceRoleKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch (_err) {
      details = "";
    }
    throw new Error(`Supabase request failed (${response.status}): ${details}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_err) {
    return text;
  }
}

function toSupabaseMessageRow(input) {
  return {
    id: sanitizeString(input.id, 256),
    username: sanitizeString(input.username, 512),
    timestamp_text: sanitizeString(input.timestamp, 128),
    message: sanitizeString(input.message, 8000),
    captured_at: new Date(input.capturedAt).toISOString(),
    source: sanitizeString(input.source || "benzinga-extension", 128),
  };
}

async function upsertMessage(messagePayload) {
  const row = toSupabaseMessageRow(messagePayload);

  if (!row.id || !row.message || Number.isNaN(Date.parse(row.captured_at))) {
    throw new Error("Invalid message payload for upsert");
  }

  return supabaseFetch(`/${TABLE_MESSAGES}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
}

async function getMessagesInWindow(startIso, endIso) {
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;
  const rows = [];

  while (hasMore) {
    const query =
      `/${TABLE_MESSAGES}?select=id,username,timestamp_text,message,captured_at,source` +
      `&captured_at=gte.${encodeURIComponent(startIso)}` +
      `&captured_at=lte.${encodeURIComponent(endIso)}` +
      `&order=captured_at.asc` +
      `&limit=${pageSize}&offset=${offset}`;

    const page = await supabaseFetch(query, { method: "GET" });
    const safePage = Array.isArray(page) ? page : [];

    rows.push(...safePage);

    if (safePage.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }
  }

  return rows;
}

async function getReportById(reportId) {
  const query = `/${TABLE_REPORTS}?select=id,status,created_at&id=eq.${encodeURIComponent(reportId)}&limit=1`;
  const rows = await supabaseFetch(query, { method: "GET" });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function claimReportRun(report) {
  const row = {
    id: sanitizeString(report.id, 128),
    report_type: sanitizeString(report.report_type, 64),
    window_start: new Date(report.window_start).toISOString(),
    window_end: new Date(report.window_end).toISOString(),
    message_count: 0,
    report_text: null,
    status: "processing",
    error: null,
    sent_at: null,
  };

  const data = await supabaseFetch(`/${TABLE_REPORTS}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  });

  return Array.isArray(data) && data.length > 0;
}

async function insertReport(report) {
  const row = {
    id: sanitizeString(report.id, 128),
    report_type: sanitizeString(report.report_type, 64),
    window_start: new Date(report.window_start).toISOString(),
    window_end: new Date(report.window_end).toISOString(),
    message_count: Number(report.message_count || 0),
    report_text: report.report_text || "",
    status: sanitizeString(report.status || "completed", 32),
    error: report.error ? sanitizeString(report.error, 4000) : null,
    sent_at: report.sent_at ? new Date(report.sent_at).toISOString() : null,
  };

  return supabaseFetch(`/${TABLE_REPORTS}`, {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
}

async function updateReportById(reportId, updates) {
  const row = {
    ...updates,
  };

  if (row.window_start) row.window_start = new Date(row.window_start).toISOString();
  if (row.window_end) row.window_end = new Date(row.window_end).toISOString();
  if (row.sent_at) row.sent_at = new Date(row.sent_at).toISOString();
  if (typeof row.error === "string") row.error = sanitizeString(row.error, 4000);
  if (typeof row.status === "string") row.status = sanitizeString(row.status, 32);
  if (typeof row.report_text !== "undefined" && row.report_text !== null) {
    row.report_text = String(row.report_text);
  }

  return supabaseFetch(`/${TABLE_REPORTS}?id=eq.${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
}

module.exports = {
  TABLE_MESSAGES,
  TABLE_REPORTS,
  upsertMessage,
  getMessagesInWindow,
  getReportById,
  claimReportRun,
  insertReport,
  updateReportById,
};
