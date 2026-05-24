const { extractMentionedTickers } = require("./ticker-extractor");

const NOTABLE_CONTRIBUTORS = ["MMaley", "MissNazo", "Sparky", "ColinMcRae"];
const NOTABLE_CONTRIBUTOR_KEYS = new Set(NOTABLE_CONTRIBUTORS.map((name) => name.toLowerCase()));
const MATT_KEYS = new Set(["mmaley", "matt", "mattmaley", "matt maley"]);

const MESSAGE_TYPE_ORDER = [
  "conviction_trade",
  "trade_call",
  "options_flow",
  "macro_analysis",
  "technical_analysis",
  "market_sentiment",
  "education",
  "question",
  "humor",
  "noise",
];

const MESSAGE_TYPE_RULES = {
  conviction_trade:
    /\b(high conviction|conviction|must|will push|will break|all in|very confident|strong setup|loaded)\b/i,
  trade_call:
    /\b(entry|entries|trim|trimmed|buy|bought|sell|sold|short|long|starter|position|setup|target|stop|scalp|swing)\b/i,
  options_flow:
    /\b(option|options|call|calls|put|puts|0dte|dte|sweep|sweeper|flow|unusual|straddle|strangle)\b/i,
  macro_analysis:
    /\b(fed|fomc|rates|yield|treasury|inflation|cpi|ppi|geopolitical|iran|oil|dxy|macro|economy|risk[- ]off|risk[- ]on)\b/i,
  technical_analysis:
    /\b(breakout|breakdown|resistance|support|trendline|fibonacci|fib|ema|sma|rsi|macd|channel|higher high|lower low)\b/i,
  market_sentiment:
    /\b(bullish|bearish|risk[- ]on|risk[- ]off|sentiment|bounce|selloff|squeeze|capitulation)\b/i,
  education: /\b(lesson|learn|education|explainer|because|means|definition|ratio|fibonacci)\b/i,
  question: /\?|\b(any thoughts|what do you think|thoughts\?)\b/i,
  humor: /\b(lol|lmao|haha|joke|meme|birthday|shawarma|food chat)\b/i,
};

const NOISE_PATTERNS = [/\b(birthday|shawarma|lunch|dinner|happy birthday|off topic|weekend plans)\b/i];

const BULLISH_PATTERNS = [
  /\b(bullish|long|buy|bought|breakout|rip|squeeze|upside|calls|support holding|higher high)\b/i,
];

const BEARISH_PATTERNS = [
  /\b(bearish|short|sell|sold|breakdown|downside|puts|hedge|resistance|lower low|risk off|dump)\b/i,
];

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}

function isMattMessage(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;

  if (MATT_KEYS.has(normalized)) return true;

  const compact = normalized.replace(/\s+/g, "");
  return MATT_KEYS.has(compact);
}

function isNotableContributor(username) {
  return NOTABLE_CONTRIBUTOR_KEYS.has(normalizeUsername(username));
}

function classifyMessageType(message, tickers) {
  const text = String(message || "");

  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(text)) return "noise";
  }

  for (const type of MESSAGE_TYPE_ORDER) {
    const rule = MESSAGE_TYPE_RULES[type];
    if (rule && rule.test(text)) {
      return type;
    }
  }

  if (tickers.length > 0) {
    return "market_sentiment";
  }

  return "noise";
}

function classifySentiment(message) {
  const text = String(message || "");

  let bullishScore = 0;
  let bearishScore = 0;

  for (const pattern of BULLISH_PATTERNS) {
    if (pattern.test(text)) bullishScore += 1;
  }

  for (const pattern of BEARISH_PATTERNS) {
    if (pattern.test(text)) bearishScore += 1;
  }

  if (bullishScore > bearishScore) return "bullish";
  if (bearishScore > bullishScore) return "bearish";
  return "neutral";
}

function computeSignalStrength({ messageType, isMatt, tickers, message, notableContributor }) {
  let score = 1;
  const text = String(message || "");

  if (messageType === "trade_call" || messageType === "options_flow") {
    score = Math.max(score, 5);
  }

  if (messageType === "conviction_trade") {
    score = Math.max(score, 8);
  }

  if (tickers.length >= 2) {
    score = Math.max(score, 6);
  }

  if (/\b(high conviction|must|strong setup|loaded|all in|aggressive)\b/i.test(text)) {
    score = Math.max(score, 9);
  }

  if (isMatt) {
    score = 10;
  } else if (notableContributor && score < 8) {
    score += 1;
  }

  if (messageType === "noise" || messageType === "humor") {
    score = Math.min(score, 2);
  }

  if (score > 10) return 10;
  if (score < 1) return 1;
  return score;
}

function toPacificTradingDay(capturedAtIso) {
  if (!capturedAtIso) return null;

  const date = new Date(capturedAtIso);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function buildAiSummary({ username, messageType, sentiment, tickers, signalStrength, isMatt }) {
  const tickerText = tickers.length > 0 ? tickers.join(", ") : "none";
  const priority = isMatt ? "highest-priority" : `signal-${signalStrength}`;
  return `${username || "Unknown"} | ${messageType} | ${sentiment} | tickers=${tickerText} | ${priority}`;
}

function classifyMessage(input) {
  const username = String(input.username || "Unknown").trim() || "Unknown";
  const message = String(input.message || "");
  const tickers = extractMentionedTickers(message);

  const matt = isMattMessage(username);
  const notable = isNotableContributor(username);
  const messageType = classifyMessageType(message, tickers);
  const sentiment = classifySentiment(message);
  const signalStrength = computeSignalStrength({
    messageType,
    isMatt: matt,
    tickers,
    message,
    notableContributor: notable,
  });

  return {
    message_type: messageType,
    sentiment,
    mentioned_tickers: tickers,
    is_matt_message: matt,
    signal_strength: signalStrength,
    ai_summary: buildAiSummary({
      username,
      messageType,
      sentiment,
      tickers,
      signalStrength,
      isMatt: matt,
    }),
    trading_day: toPacificTradingDay(input.capturedAt),
    contributor_priority: matt ? "matt" : notable ? "notable" : "standard",
  };
}

module.exports = {
  NOTABLE_CONTRIBUTORS,
  classifyMessage,
  extractMentionedTickers,
};
