const { jsonResponse } = require("./_lib/http");
const { runScheduledReport } = require("./_lib/report-runner");

exports.handler = async () => {
  try {
    const result = await runScheduledReport({
      reportType: "3pm",
      endHourPacific: 15,
    });

    return jsonResponse(200, { ok: true, result });
  } catch (error) {
    console.error("generate-3pm-report failed", error);
    return jsonResponse(500, {
      ok: false,
      error: error?.message || "report generation failed",
    });
  }
};
