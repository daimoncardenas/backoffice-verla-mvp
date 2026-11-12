interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function readZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")) % 24,
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function utcMilliseconds(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}

function zonedMidnightToUtc(
  year: number,
  month: number,
  timeZone: string,
): Date {
  const desired = utcMilliseconds(year, month, 1, 0, 0, 0);
  let guess = desired;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = readZonedParts(new Date(guess), timeZone);
    const observed = utcMilliseconds(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const difference = desired - observed;

    if (difference === 0) {
      return new Date(guess);
    }

    guess += difference;
  }

  return new Date(guess);
}

export function calculateMonthPeriod(
  year: number,
  month: number,
  timeZone: string,
): { period_start: Date; period_end: Date } {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    period_start: zonedMidnightToUtc(year, month, timeZone),
    period_end: zonedMidnightToUtc(nextYear, nextMonth, timeZone),
  };
}
