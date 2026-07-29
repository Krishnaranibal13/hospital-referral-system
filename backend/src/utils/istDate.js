// The server may run in UTC (most hosting does) while the hospital operates in IST
// (UTC+5:30). Bucketing "today" or a 14-day trend using server-local time can silently
// misclassify referrals made late at night IST into the wrong calendar day. These
// helpers always compute calendar days as they'd appear in India, independent of
// whatever timezone the Node process itself is running in.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// "YYYY-MM-DD" as the date would read on a wall clock in India for the given instant.
export function istDateString(date) {
  const shifted = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

// The UTC instant corresponding to IST midnight, `daysAgo` days before today (IST).
export function startOfIstDay(daysAgo = 0) {
  const now = new Date();
  const shiftedNow = new Date(now.getTime() + IST_OFFSET_MS);
  const y = shiftedNow.getUTCFullYear();
  const m = shiftedNow.getUTCMonth();
  const d = shiftedNow.getUTCDate();
  const istMidnightUtcMs = Date.UTC(y, m, d - daysAgo, 0, 0, 0) - IST_OFFSET_MS;
  return new Date(istMidnightUtcMs);
}
