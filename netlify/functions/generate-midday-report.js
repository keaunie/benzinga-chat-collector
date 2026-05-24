const { jsonResponse } = require("./_lib/http");
const { runScheduledReport } = require("./_lib/report-runner");

exports.handler = async () => {
  try {
    const result = await runScheduledReport({
      reportType: "midday",
      reportName: "Midday",
      endHourPacific: 15,
      scheduledHourPacific: 15,
    });

    return jsonResponse(200, { ok: true, result });
  } catch (error) {
    console.error("generate-midday-report failed", error);
    return jsonResponse(500, {
      ok: false,
      error: error?.message || "report generation failed",
    });
  }
};
