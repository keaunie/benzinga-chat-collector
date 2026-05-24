const { getMessagesInWindow, claimReportRun, updateReportById } = require("./supabase");
const { getPacificWindowUtc, shouldRunAtPacificSchedule } = require("./time");
const { generateMarketIntelligenceReport } = require("./openai");
const { sendWhatsAppReport } = require("./whatsapp");
const { buildSnapshot } = require("./report-intelligence");

function buildReportId({ reportType, dateKey }) {
  return `${dateKey}-${reportType}`;
}

function topSentimentLabel(sentiment) {
  if (sentiment.bullish > sentiment.bearish) return "bullish";
  if (sentiment.bearish > sentiment.bullish) return "bearish";
  return "neutral";
}

function buildFallbackReport({ reportName, generatedAtIso, snapshot }) {
  const topTickers = snapshot.top_tickers.slice(0, 8);
  const highConviction = snapshot.high_conviction_trades.slice(0, 8);
  const matt = snapshot.matt_messages.slice(0, 8);
  const optionsFlow = snapshot.options_flow.slice(0, 8);
  const macroThemes = snapshot.macro_themes;

  return [
    "BENZINGA MARKET INTELLIGENCE REPORT",
    "",
    "DATE + TIME",
    `${reportName} | Generated: ${generatedAtIso}`,
    "",
    "MARKET SENTIMENT",
    `Overall: ${topSentimentLabel(snapshot.sentiment)} (bullish=${snapshot.sentiment.bullish}, bearish=${snapshot.sentiment.bearish}, neutral=${snapshot.sentiment.neutral})`,
    "",
    "TOP TICKERS",
    ...(topTickers.length
      ? topTickers.map(
          (row) =>
            `- ${row.ticker}: mentions=${row.mentions}, sentiment=${row.dominant_sentiment}, conviction=${row.conviction}`,
        )
      : ["- No high-signal ticker concentration detected."]),
    "",
    "MATT MALEY COMMENTARY",
    ...(matt.length
      ? matt.map((row) => `- ${row.message}`)
      : ["- No MMaley messages in this window."]),
    "",
    "HIGH CONVICTION TRADES",
    ...(highConviction.length
      ? highConviction.map(
          (row) =>
            `- ${row.username} | signal=${row.signal_strength} | tickers=${(row.mentioned_tickers || []).join(",") || "none"} | ${row.message}`,
        )
      : ["- No high conviction trades identified."]),
    "",
    "OPTIONS FLOW",
    ...(optionsFlow.length
      ? optionsFlow.map(
          (row) =>
            `- ${row.username} | ${row.sentiment} | tickers=${(row.mentioned_tickers || []).join(",") || "none"} | ${row.message}`,
        )
      : ["- No unusual options flow detected."]),
    "",
    "MACRO THEMES",
    `- Rates: ${macroThemes.rates}`,
    `- Oil: ${macroThemes.oil}`,
    `- Geopolitics: ${macroThemes.geopolitics}`,
    `- Fed: ${macroThemes.fed}`,
    `- Risk Appetite: ${macroThemes.risk_appetite}`,
    "",
    "KEY TAKEAWAYS",
    `- Actionable messages: ${snapshot.totals.analyzed_messages} out of ${snapshot.totals.raw_messages}`,
    `- Matt messages: ${snapshot.totals.matt_messages}`,
    "- Use this fallback report only when AI generation is unavailable.",
  ].join("\n");
}

function buildNoDataReport({ reportName, generatedAtIso, windowStartIso, windowEndIso }) {
  return [
    "BENZINGA MARKET INTELLIGENCE REPORT",
    "",
    "DATE + TIME",
    `${reportName} | Generated: ${generatedAtIso}`,
    "",
    "MARKET SENTIMENT",
    "No messages available for this report window.",
    "",
    "TOP TICKERS",
    "No data.",
    "",
    "MATT MALEY COMMENTARY",
    "No MMaley messages in this report window.",
    "",
    "HIGH CONVICTION TRADES",
    "No high conviction setups found.",
    "",
    "OPTIONS FLOW",
    "No options flow signals found.",
    "",
    "MACRO THEMES",
    "No macro themes detected.",
    "",
    "KEY TAKEAWAYS",
    `No messages were stored from ${windowStartIso} to ${windowEndIso}.`,
  ].join("\n");
}

async function runScheduledReport({
  reportType,
  reportName,
  endHourPacific,
  scheduledHourPacific,
  now = new Date(),
}) {
  const generatedAtIso = now.toISOString();

  if (typeof scheduledHourPacific === "number") {
    const scheduleCheck = shouldRunAtPacificSchedule({
      now,
      targetHour: scheduledHourPacific,
      targetMinute: 5,
      minuteTolerance: 15,
    });

    if (!scheduleCheck.ok) {
      return {
        skipped: true,
        reason: "schedule_guard",
        details: scheduleCheck.reason,
        pacific: scheduleCheck.pacific,
      };
    }
  }

  const { startIso, endIso, dateKey } = getPacificWindowUtc(now, 5, endHourPacific);
  const reportId = buildReportId({ reportType, dateKey });

  const claimed = await claimReportRun({
    id: reportId,
    report_type: reportType,
    window_start: startIso,
    window_end: endIso,
  });

  if (!claimed) {
    return {
      skipped: true,
      reason: "already_generated",
      reportId,
      startIso,
      endIso,
    };
  }

  try {
    const messages = await getMessagesInWindow(startIso, endIso);
    const snapshot = buildSnapshot(messages);

    let reportText;
    let reportMode = "ai";

    if (snapshot.totals.raw_messages === 0) {
      reportText = buildNoDataReport({
        reportName,
        generatedAtIso,
        windowStartIso: startIso,
        windowEndIso: endIso,
      });
      reportMode = "no_data";
    } else {
      try {
        reportText = await generateMarketIntelligenceReport({
          reportType,
          windowStartIso: startIso,
          windowEndIso: endIso,
          snapshot,
        });
      } catch (error) {
        console.error("AI report generation failed, using fallback report", error);
        reportText = buildFallbackReport({
          reportName,
          generatedAtIso,
          snapshot,
        });
        reportMode = "fallback";
      }
    }

    const twilioResult = await sendWhatsAppReport(reportText);

    await updateReportById(reportId, {
      message_count: snapshot.totals.raw_messages,
      report_text: reportText,
      status: "sent",
      sent_at: new Date().toISOString(),
      error: null,
    });

    return {
      skipped: false,
      reportId,
      reportMode,
      messageCount: snapshot.totals.raw_messages,
      analyzedCount: snapshot.totals.analyzed_messages,
      mattCount: snapshot.totals.matt_messages,
      startIso,
      endIso,
      twilio: twilioResult,
    };
  } catch (error) {
    await updateReportById(reportId, {
      status: "failed",
      error: error?.message || "report run failed",
    });
    throw error;
  }
}

module.exports = {
  runScheduledReport,
};
