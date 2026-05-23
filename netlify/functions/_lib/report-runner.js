const { getMessagesInWindow, claimReportRun, updateReportById } = require("./supabase");
const { getPacificWindowUtc } = require("./time");
const { generateReportAnalysis } = require("./openai");
const { sendWhatsAppReport } = require("./whatsapp");

function buildReportId({ reportType, dateKey }) {
  return `${dateKey}-${reportType}`;
}

function buildNoDataReport({ reportType, windowStartIso, windowEndIso, generatedAtIso }) {
  return [
    "BENZINGA INNER CIRCLE REPORT",
    `${reportType.toUpperCase()} | Generated: ${generatedAtIso}`,
    "",
    "MARKET SENTIMENT",
    "No messages available for this window.",
    "",
    "MOST DISCUSSED TICKERS",
    "No data.",
    "",
    "HIGH CONVICTION TRADES",
    "No data.",
    "",
    "MATT MALEY COMMENTARY",
    "Not present in this message window.",
    "",
    "OPTIONS FLOW",
    "No unusual options flow detected from available messages.",
    "",
    "KEY TAKEAWAYS",
    `No Benzinga messages were stored for ${windowStartIso} to ${windowEndIso}.`,
  ].join("\n");
}

async function runScheduledReport({ reportType, endHourPacific, now = new Date() }) {
  const generatedAtIso = now.toISOString();
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

    let reportText;
    if (messages.length === 0) {
      reportText = buildNoDataReport({
        reportType,
        windowStartIso: startIso,
        windowEndIso: endIso,
        generatedAtIso,
      });
    } else {
      reportText = await generateReportAnalysis({
        reportType,
        windowStartIso: startIso,
        windowEndIso: endIso,
        messages,
      });
    }

    const twilioResult = await sendWhatsAppReport(reportText);

    await updateReportById(reportId, {
      message_count: messages.length,
      report_text: reportText,
      status: "sent",
      sent_at: new Date().toISOString(),
      error: null,
    });

    return {
      skipped: false,
      reportId,
      messageCount: messages.length,
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
