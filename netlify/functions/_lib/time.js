const PACIFIC_TIME_ZONE = "America/Los_Angeles";

function getPacificDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const byType = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      byType[part.type] = part.value;
    }
  }

  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
  };
}

function getUtcIsoForPacificTime(year, month, day, hour, minute = 0, second = 0) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  const pacificSameMoment = getPacificDateParts(utcGuess);

  const guessAsMinutes =
    (((pacificSameMoment.year * 12 + pacificSameMoment.month) * 31 + pacificSameMoment.day) * 24 +
      pacificSameMoment.hour) *
      60 +
    pacificSameMoment.minute;

  const targetAsMinutes =
    (((year * 12 + month) * 31 + day) * 24 + hour) * 60 + minute;

  const deltaMinutes = targetAsMinutes - guessAsMinutes;
  const adjusted = new Date(utcGuess.getTime() + deltaMinutes * 60 * 1000);

  return adjusted.toISOString();
}

function getPacificWindowUtc(date, startHour, endHour) {
  const pacific = getPacificDateParts(date);

  const startIso = getUtcIsoForPacificTime(
    pacific.year,
    pacific.month,
    pacific.day,
    startHour,
    0,
    0,
  );

  const endIso = getUtcIsoForPacificTime(
    pacific.year,
    pacific.month,
    pacific.day,
    endHour,
    0,
    0,
  );

  return {
    startIso,
    endIso,
    dateKey: `${pacific.year}-${String(pacific.month).padStart(2, "0")}-${String(
      pacific.day,
    ).padStart(2, "0")}`,
    pacific,
  };
}

module.exports = {
  PACIFIC_TIME_ZONE,
  getPacificDateParts,
  getPacificWindowUtc,
};
