const { jsonResponse } = require("./_lib/http");
const { runScheduledReport } = require("./_lib/report-runner");

exports.handler = async () => {
  try {
    const result = await runScheduledReport({
      reportType: "end_of_day",
      reportName: "End of Day",
      endHourPacific: 19,
      scheduledHourPacific: 19,
    });

    return jsonResponse(200, { ok: true, result });
  } catch (error) {
    console.error("generate-endofday-report failed", error);
    return jsonResponse(500, {
      ok: false,
      error: error?.message || "report generation failed",
    });
  }
};
