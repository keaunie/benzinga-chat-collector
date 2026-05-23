const { getEnv, assertEnv, REQUIRED_ENV_BY_FEATURE } = require("./env");

function buildMessageDigest(messages) {
  const maxMessages = 1200;
  const selected = messages.slice(-maxMessages);

  return selected
    .map((row) => {
      const at = row.captured_at || "";
      const user = row.username || "Unknown";
      const timestamp = row.timestamp_text || "";
      const msg = row.message || "";
      return `[${at}] ${user} (${timestamp}): ${msg}`;
    })
    .join("\n");
}

function buildPrompt({ reportType, windowStartIso, windowEndIso, messages }) {
  const digest = buildMessageDigest(messages);

  return [
    "You are an institutional-grade market intelligence analyst.",
    "Summarize Benzinga Inner Circle chat messages into actionable trading intelligence.",
    "Avoid generic language. Focus on conviction, theme repetition, and sentiment shifts.",
    "Output plain text markdown sections with exactly these headers:",
    "1) BENZINGA INNER CIRCLE REPORT",
    "2) MARKET SENTIMENT",
    "3) MOST DISCUSSED TICKERS",
    "4) HIGH CONVICTION TRADES",
    "5) MATT MALEY COMMENTARY",
    "6) OPTIONS FLOW",
    "7) KEY TAKEAWAYS",
    "",
    `Report type: ${reportType}`,
    `Window UTC: ${windowStartIso} to ${windowEndIso}`,
    `Total messages: ${messages.length}`,
    "",
    "Include:",
    "- Bullish and bearish sentiment overview with confidence language",
    "- Most discussed tickers with mention count and sentiment",
    "- Unusual calls/puts and options flow clues from chat",
    "- Macro/risk appetite discussions",
    "- Matt Maley commentary summary if present, otherwise explicitly state not present",
    "- Repeated market themes and possible tactical setups",
    "",
    "Message digest:",
    digest,
  ].join("\n");
}

function extractTextFromResponse(json) {
  if (typeof json?.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }

  if (Array.isArray(json?.output)) {
    const chunks = [];

    for (const outputItem of json.output) {
      if (!Array.isArray(outputItem?.content)) continue;

      for (const contentItem of outputItem.content) {
        if (contentItem?.type === "output_text" && contentItem?.text) {
          chunks.push(contentItem.text);
        }
      }
    }

    if (chunks.length > 0) {
      return chunks.join("\n").trim();
    }
  }

  return "";
}

async function generateReportAnalysis({ reportType, windowStartIso, windowEndIso, messages }) {
  assertEnv(REQUIRED_ENV_BY_FEATURE.openai, "openai");

  const model = getEnv("OPENAI_MODEL", "gpt-5");
  const prompt = buildPrompt({ reportType, windowStartIso, windowEndIso, messages });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
      max_output_tokens: 2500,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${details}`);
  }

  const json = await response.json();
  const text = extractTextFromResponse(json);

  if (!text) {
    throw new Error("OpenAI response did not include report text");
  }

  return text;
}

module.exports = {
  generateReportAnalysis,
};
