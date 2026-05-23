const { jsonResponse } = require("./_lib/http");
const { runScheduledReport } = require("./_lib/report-runner");

exports.handler = async () => {
  try {
    const result = await runScheduledReport({
      reportType: "12pm",
      endHourPacific: 12,
    });

    return jsonResponse(200, { ok: true, result });
  } catch (error) {
    console.error("generate-12pm-report failed", error);
    return jsonResponse(500, {
      ok: false,
      error: error?.message || "report generation failed",
    });
  }
};
