const { getEnv, assertEnv, REQUIRED_ENV_BY_FEATURE } = require("./env");

const MAX_TWILIO_CHARS = 1400;
const MAX_ATTEMPTS = 3;

function splitLongMessage(message, maxChars = MAX_TWILIO_CHARS) {
  if (message.length <= maxChars) {
    return [message];
  }

  const paragraphs = message.split("\n\n");
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    let remainder = paragraph;
    while (remainder.length > maxChars) {
      const slice = remainder.slice(0, maxChars);
      const breakAt = slice.lastIndexOf(" ");
      const splitIndex = breakAt > maxChars * 0.6 ? breakAt : maxChars;
      chunks.push(remainder.slice(0, splitIndex).trim());
      remainder = remainder.slice(splitIndex).trim();
    }

    current = remainder;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function twilioEndpoint(accountSid) {
  return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
}

async function sendChunk(accountSid, authToken, from, to, body) {
  const basicToken = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const formData = new URLSearchParams({
    From: from,
    To: to,
    Body: body,
  });

  const response = await fetch(twilioEndpoint(accountSid), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Twilio send failed (${response.status}): ${details}`);
  }

  return response.json();
}

async function sendWithRetry(accountSid, authToken, from, to, body) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await sendChunk(accountSid, authToken, from, to, body);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        const delayMs = 500 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

async function sendWhatsAppReport(reportText) {
  assertEnv(REQUIRED_ENV_BY_FEATURE.twilio, "twilio");

  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const from = getEnv("TWILIO_WHATSAPP_FROM");
  const to = getEnv("TWILIO_WHATSAPP_TO");

  const chunks = splitLongMessage(reportText);

  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `[${i + 1}/${chunks.length}]\n` : "";
    const body = `${prefix}${chunks[i]}`;
    const result = await sendWithRetry(accountSid, authToken, from, to, body);
    results.push(result.sid);
  }

  return {
    chunks: chunks.length,
    messageSids: results,
  };
}

module.exports = {
  sendWhatsAppReport,
  splitLongMessage,
};
