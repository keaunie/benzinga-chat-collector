const COMMON_TICKERS = new Set([
  "AAPL",
  "AMD",
  "AMZN",
  "ARKK",
  "BAC",
  "DIA",
  "GLD",
  "GOOGL",
  "IWM",
  "META",
  "MSFT",
  "NVDA",
  "QQQ",
  "RKLB",
  "SLV",
  "SMH",
  "SOXL",
  "SPX",
  "SPY",
  "TLT",
  "TSLA",
  "TQQQ",
  "UVXY",
  "VIX",
  "XLE",
  "XLF",
  "XLI",
  "XLK",
  "XLP",
  "XLU",
  "XLV",
  "XLY",
]);

const NON_TICKER_WORDS = new Set([
  "A",
  "AI",
  "ALL",
  "AND",
  "ARE",
  "AS",
  "AT",
  "BE",
  "BUT",
  "BUY",
  "CPI",
  "DTE",
  "EDT",
  "EST",
  "ETF",
  "FED",
  "FOR",
  "GDP",
  "GTC",
  "HAS",
  "HAVE",
  "HOLD",
  "HOW",
  "I",
  "IF",
  "IN",
  "IS",
  "IT",
  "LOL",
  "MACD",
  "MAY",
  "MY",
  "NO",
  "NOW",
  "OIL",
  "OR",
  "PM",
  "PNL",
  "PT",
  "PUT",
  "PUTS",
  "RSI",
  "SO",
  "THE",
  "TO",
  "USA",
  "VWAP",
  "WE",
  "WILL",
  "WITH",
  "YOU",
]);

const TRADE_CONTEXT_REGEX =
  /\b(call|calls|put|puts|long|short|entry|stop|target|breakout|breakdown|resistance|support|lotto|sweep|sweeper|0dte|dte|option|options)\b/i;

function normalizeTicker(candidate) {
  return String(candidate || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .trim();
}

function isLikelyTicker(token, hasTradeContext) {
  if (!token || token.length < 2 || token.length > 5) return false;
  if (NON_TICKER_WORDS.has(token)) return false;

  if (COMMON_TICKERS.has(token)) {
    return true;
  }

  return hasTradeContext;
}

function extractOptionTickers(message) {
  const tickers = [];
  const optionPattern = /\b([A-Za-z]{1,5})\s*(?:\d{1,2}\s*)?(?:dte\s*)?\d{1,5}(?:\.\d+)?\s*[cp]\b/gi;
  let match;

  while ((match = optionPattern.exec(message)) !== null) {
    const ticker = normalizeTicker(match[1]);
    if (ticker.length >= 2 && ticker.length <= 5) {
      tickers.push(ticker);
    }
  }

  return tickers;
}

function extractMentionedTickers(message) {
  const text = String(message || "");
  const hasTradeContext = TRADE_CONTEXT_REGEX.test(text);
  const found = new Set();

  const optionTickers = extractOptionTickers(text);
  for (const ticker of optionTickers) {
    found.add(ticker);
  }

  const dollarPattern = /\$([A-Za-z]{1,5})\b/g;
  let dollarMatch;
  while ((dollarMatch = dollarPattern.exec(text)) !== null) {
    const ticker = normalizeTicker(dollarMatch[1]);
    if (isLikelyTicker(ticker, true)) {
      found.add(ticker);
    }
  }

  const tokenPattern = /\b([A-Za-z]{2,5})\b/g;
  let tokenMatch;
  while ((tokenMatch = tokenPattern.exec(text)) !== null) {
    const raw = tokenMatch[1];
    const ticker = normalizeTicker(raw);
    if (!ticker) continue;

    const wasAllCaps = raw === raw.toUpperCase();
    if (!wasAllCaps && !COMMON_TICKERS.has(ticker)) {
      continue;
    }

    if (isLikelyTicker(ticker, hasTradeContext)) {
      found.add(ticker);
    }
  }

  return Array.from(found).sort();
}

module.exports = {
  extractMentionedTickers,
  COMMON_TICKERS,
};
