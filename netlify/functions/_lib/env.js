const REQUIRED_ENV_BY_FEATURE = {
  supabase: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  openai: ["OPENAI_API_KEY"],
  twilio: [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "TWILIO_WHATSAPP_TO",
  ],
};

function getEnv(name, fallback = "") {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function assertEnv(keys, context) {
  const missing = keys.filter((key) => !getEnv(key));
  if (missing.length > 0) {
    const scope = context ? ` for ${context}` : "";
    throw new Error(`Missing required env${scope}: ${missing.join(", ")}`);
  }
}

module.exports = {
  REQUIRED_ENV_BY_FEATURE,
  getEnv,
  assertEnv,
};
