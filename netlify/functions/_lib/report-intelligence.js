const { classifyMessage, NOTABLE_CONTRIBUTORS } = require("./classification");

const NOISE_TYPES = new Set(["noise", "humor"]);

function toIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeRow(row) {
  const capturedAt = toIso(row.captured_at || row.capturedAt || new Date().toISOString());
  const message = String(row.message || "").trim();
  const username = String(row.username || "Unknown").trim() || "Unknown";

  const hasClassification =
    row.message_type && row.sentiment && typeof row.signal_strength !== "undefined";

  if (hasClassification) {
    return {
      id: row.id,
      username,
      timestamp_text: row.timestamp_text || row.timestamp || "",
      message,
      captured_at: capturedAt,
      source: row.source || "benzinga-extension",
      message_type: row.message_type,
      sentiment: row.sentiment,
      mentioned_tickers: Array.isArray(row.mentioned_tickers) ? row.mentioned_tickers : [],
      is_matt_message: Boolean(row.is_matt_message),
      signal_strength: Number(row.signal_strength || 1),
      ai_summary: row.ai_summary || "",
      trading_day: row.trading_day || null,
    };
  }

  const classification = classifyMessage({
    username,
    message,
    capturedAt,
  });

  return {
    id: row.id,
    username,
    timestamp_text: row.timestamp_text || row.timestamp || "",
    message,
    captured_at: capturedAt,
    source: row.source || "benzinga-extension",
    ...classification,
  };
}

function buildTickerStats(messages) {
  const byTicker = new Map();

  for (const row of messages) {
    const tickers = Array.isArray(row.mentioned_tickers) ? row.mentioned_tickers : [];
    for (const ticker of tickers) {
      if (!byTicker.has(ticker)) {
        byTicker.set(ticker, {
          ticker,
          mentions: 0,
          bullish: 0,
          bearish: 0,
          neutral: 0,
          conviction: 0,
        });
      }

      const entry = byTicker.get(ticker);
      entry.mentions += 1;
      entry.conviction += Number(row.signal_strength || 1);
      if (row.sentiment === "bullish") entry.bullish += 1;
      else if (row.sentiment === "bearish") entry.bearish += 1;
      else entry.neutral += 1;
    }
  }

  const ranked = Array.from(byTicker.values())
    .sort((a, b) => b.mentions - a.mentions || b.conviction - a.conviction)
    .slice(0, 20)
    .map((item) => ({
      ...item,
      dominant_sentiment:
        item.bullish > item.bearish
          ? "bullish"
          : item.bearish > item.bullish
            ? "bearish"
            : "neutral",
    }));

  return ranked;
}

function buildSentimentCounts(messages) {
  const counts = {
    bullish: 0,
    bearish: 0,
    neutral: 0,
  };

  for (const row of messages) {
    const sentiment = row.sentiment || "neutral";
    if (counts[sentiment] === undefined) counts[sentiment] = 0;
    counts[sentiment] += 1;
  }

  return counts;
}

function buildMacroThemeCounts(messages) {
  const buckets = {
    rates: 0,
    oil: 0,
    geopolitics: 0,
    fed: 0,
    risk_appetite: 0,
  };

  for (const row of messages) {
    const text = String(row.message || "").toLowerCase();
    if (/\b(yield|treasury|rates|tlt)\b/.test(text)) buckets.rates += 1;
    if (/\b(oil|crude|wti|brent|energy)\b/.test(text)) buckets.oil += 1;
    if (/\b(iran|war|geopolitic|middle east|china|tariff)\b/.test(text)) buckets.geopolitics += 1;
    if (/\b(fed|fomc|powell|cpi|ppi|inflation)\b/.test(text)) buckets.fed += 1;
    if (/\b(risk on|risk-off|risk off|hedge|de-risk|de risk)\b/.test(text)) {
      buckets.risk_appetite += 1;
    }
  }

  return buckets;
}

function buildSnapshot(messages) {
  const normalized = messages.map(normalizeRow).filter((row) => row.message.length > 0);

  const nonNoise = normalized.filter(
    (row) => !NOISE_TYPES.has(String(row.message_type || "").toLowerCase()) || row.is_matt_message,
  );

  const mattMessages = nonNoise.filter((row) => row.is_matt_message);

  const highConvictionTrades = nonNoise
    .filter(
      (row) =>
        row.signal_strength >= 8 ||
        row.message_type === "conviction_trade" ||
        row.message_type === "trade_call",
    )
    .sort((a, b) => Number(b.signal_strength || 0) - Number(a.signal_strength || 0))
    .slice(0, 40);

  const optionsFlow = nonNoise
    .filter(
      (row) =>
        row.message_type === "options_flow" || /\b(call|calls|put|puts|0dte|dte|sweep)\b/i.test(row.message),
    )
    .slice(-60);

  const macroMessages = nonNoise
    .filter(
      (row) => row.message_type === "macro_analysis" || /\b(fed|rates|yield|iran|oil|inflation)\b/i.test(row.message),
    )
    .slice(-60);

  const notableMessages = nonNoise.filter((row) =>
    NOTABLE_CONTRIBUTORS.map((item) => item.toLowerCase()).includes(row.username.toLowerCase()),
  );

  return {
    totals: {
      raw_messages: normalized.length,
      analyzed_messages: nonNoise.length,
      matt_messages: mattMessages.length,
    },
    sentiment: buildSentimentCounts(nonNoise),
    top_tickers: buildTickerStats(nonNoise),
    macro_themes: buildMacroThemeCounts(nonNoise),
    notable_contributors: NOTABLE_CONTRIBUTORS,
    matt_messages: mattMessages,
    high_conviction_trades: highConvictionTrades,
    options_flow: optionsFlow,
    macro_messages: macroMessages,
    analyzed_messages: nonNoise,
    notable_messages: notableMessages,
  };
}

module.exports = {
  buildSnapshot,
  normalizeRow,
};
