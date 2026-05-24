const { getEnv, assertEnv, REQUIRED_ENV_BY_FEATURE } = require("./env");

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

function truncate(str, limit) {
  const value = String(str || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 3)}...`;
}

function buildPriorityDigest(snapshot) {
  const priority = [];

  const combined = [
    ...snapshot.matt_messages,
    ...snapshot.high_conviction_trades,
    ...snapshot.options_flow.slice(-20),
    ...snapshot.macro_messages.slice(-20),
  ];

  const seen = new Set();

  for (const row of combined) {
    if (!row || !row.id || seen.has(row.id)) continue;
    seen.add(row.id);

    priority.push(
      `[${row.captured_at}] ${row.username} | type=${row.message_type} | sentiment=${row.sentiment} | signal=${row.signal_strength} | tickers=${(row.mentioned_tickers || []).join(",") || "none"} | ${truncate(row.message, 220)}`,
    );

    if (priority.length >= 250) {
      break;
    }
  }

  return priority.join("\n");
}

function buildPrompt({ reportType, windowStartIso, windowEndIso, snapshot }) {
  const sentiment = snapshot.sentiment;
  const topTickersCompact = snapshot.top_tickers.slice(0, 15).map((ticker) => ({
    ticker: ticker.ticker,
    mentions: ticker.mentions,
    sentiment: ticker.dominant_sentiment,
    conviction: ticker.conviction,
  }));

  const contextPayload = {
    report_type: reportType,
    window_start_utc: windowStartIso,
    window_end_utc: windowEndIso,
    totals: snapshot.totals,
    sentiment,
    top_tickers: topTickersCompact,
    macro_themes: snapshot.macro_themes,
    matt_message_count: snapshot.matt_messages.length,
    high_conviction_count: snapshot.high_conviction_trades.length,
    options_flow_count: snapshot.options_flow.length,
    notable_contributors: snapshot.notable_contributors,
  };

  return [
    "You are an institutional trading intelligence analyst.",
    "Produce a high-signal report from Benzinga Inner Circle chat.",
    "",
    "Output must use these exact section headers:",
    "BENZINGA MARKET INTELLIGENCE REPORT",
    "DATE + TIME",
    "MARKET SENTIMENT",
    "TOP TICKERS",
    "MATT MALEY COMMENTARY",
    "HIGH CONVICTION TRADES",
    "OPTIONS FLOW",
    "MACRO THEMES",
    "KEY TAKEAWAYS",
    "",
    "Requirements:",
    "- Prioritize actionable trade intelligence over general commentary.",
    "- Include MMaley commentary even if sparse; explicitly mention if absent.",
    "- Include mentions/sentiment/conviction for top tickers.",
    "- Filter out low-value chatter unless directly market-relevant.",
    "- Keep concise, concrete, and trade-desk ready.",
    "",
    "Structured context JSON:",
    JSON.stringify(contextPayload, null, 2),
    "",
    "Priority message digest:",
    buildPriorityDigest(snapshot),
  ].join("\n");
}

async function generateMarketIntelligenceReport({ reportType, windowStartIso, windowEndIso, snapshot }) {
  assertEnv(REQUIRED_ENV_BY_FEATURE.openai, "openai");

  const model = getEnv("OPENAI_MODEL", "gpt-5");
  const prompt = buildPrompt({ reportType, windowStartIso, windowEndIso, snapshot });

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
      max_output_tokens: 2600,
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
  generateMarketIntelligenceReport,
};
