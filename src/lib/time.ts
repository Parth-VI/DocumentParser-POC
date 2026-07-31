/**
 * Timestamp handling for values coming from the service.
 *
 * The API sends ISO strings carrying the backend's APP_TIMEZONE offset, e.g.
 * "2026-07-30T10:03:56+00:00". Two rules follow from that:
 *
 *  1. Parse the offset. A zone-less string is read by JavaScript as *local*
 *     time, which is what made a just-processed email display as "6h ago" on an
 *     IST machine against a UTC backend — exactly the 5.5h offset.
 *  2. Display in the backend's zone, not the viewer's. Everyone then sees the
 *     same clock time as the database, the logs, and each other, and absolute
 *     times are labelled with the zone so there's nothing to infer.
 *
 * Relative labels ("just now", "5m ago") are zone-independent once the instant
 * is right — they're a difference between two instants.
 */

/** Minutes east of UTC declared by the string, or null when it says nothing. */
function offsetMinutes(iso: string): number | null {
  if (/[zZ]$/.test(iso)) return 0;
  const match = /([+-])(\d{2}):?(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * Parse a service timestamp into an exact instant.
 *
 * A string with no offset is treated as UTC rather than local: rows written
 * before the API started sending offsets came from a UTC-configured backend, so
 * this keeps them reading correctly instead of drifting by the viewer's offset.
 */
function parseServerTime(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const normalized = offsetMinutes(iso) === null ? `${iso}Z` : iso;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Wall-clock parts of an instant as seen in the offset the string declared. */
function partsInOriginZone(iso: string): { date: Date; offset: number } | null {
  const instant = parseServerTime(iso);
  if (!instant) return null;
  const offset = offsetMinutes(iso) ?? 0;
  // Shift by the offset, then read the UTC fields: those equal the wall clock
  // in that zone, without needing a named-timezone formatter.
  return { date: new Date(instant.getTime() + offset * 60_000), offset };
}

/** "UTC" or "UTC+5:30" — makes an absolute time unambiguous at a glance. */
function zoneLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const offset = offsetMinutes(iso) ?? 0;
  if (offset === 0) return "UTC";
  const sign = offset > 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "15:31" in the backend's zone. */
export function formatTime(iso: string | null | undefined, withZone = false): string {
  if (!iso) return "—";
  const parts = partsInOriginZone(iso);
  if (!parts) return "—";
  const time = `${pad(parts.date.getUTCHours())}:${pad(parts.date.getUTCMinutes())}`;
  return withZone ? `${time} ${zoneLabel(iso)}` : time;
}

/** "30 Jul 2026, 15:31 UTC" in the backend's zone. */
export function formatDateTime(iso: string | null | undefined, withZone = true): string {
  if (!iso) return "—";
  const parts = partsInOriginZone(iso);
  if (!parts) return "—";
  const d = parts.date;
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const stamp =
    `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}, ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withZone ? `${stamp} ${zoneLabel(iso)}` : stamp;
}

/** "just now" / "12m ago" / "3h ago", then falls back to the date. */
export function formatRelative(iso: string | null | undefined): string {
  const instant = parseServerTime(iso);
  if (!instant) return "—";
  const seconds = Math.round((Date.now() - instant.getTime()) / 1000);
  // Small negative values happen when the server clock is a shade ahead;
  // "just now" is truer than "in 2 seconds".
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(iso, false);
}

/** Whole seconds between now and a server timestamp (negative = in the future). */
export function secondsSince(iso: string | null | undefined): number | null {
  const instant = parseServerTime(iso);
  if (!instant) return null;
  return Math.round((Date.now() - instant.getTime()) / 1000);
}
