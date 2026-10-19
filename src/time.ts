/**
 * Local wall-clock times to ISO 8601 with the zone's offset on that date,
 * so "18:10" on 2026-10-20 in Europe/Vienna becomes 2026-10-20T18:10:00+02:00.
 */

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date(utcMs));
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * @param date YYYY-MM-DD, the event's local date
 * @param time HH:MM (or H:MM) local time
 * @param addDays days to add, for agenda items after midnight
 */
export function zonedIso(date: string, time: string, timeZone: string, addDays = 0): string {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2})[:.](\d{2})$/.exec(time.trim());
  if (!dm || !tm) throw new Error(`Cannot read date "${date}" or time "${time}"`);
  const naive = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]) + addDays, Number(tm[1]), Number(tm[2]));
  let off = offsetMinutes(naive, timeZone);
  const second = offsetMinutes(naive - off * 60_000, timeZone);
  if (second !== off) off = second;
  const local = new Date(naive);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Minutes since local midnight for "HH:MM". */
export function minutesOf(time: string): number {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(time.trim());
  if (!m) throw new Error(`Cannot read time "${time}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}
