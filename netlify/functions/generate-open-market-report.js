const { jsonResponse } = require("./_lib/http");
const { runScheduledReport } = require("./_lib/report-runner");

exports.handler = async () => {
  try {
    const result = await runScheduledReport({
      reportType: "open_market",
      reportName: "Open Market",
      endHourPacific: 12,
      scheduledHourPacific: 12,
    });

    return jsonResponse(200, { ok: true, result });
  } catch (error) {
    console.error("generate-open-market-report failed", error);
    return jsonResponse(500, {
      ok: false,
      error: error?.message || "report generation failed",
    });
  }
};
