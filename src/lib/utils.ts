import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Turn a stored field/key name into something a non-technical client can read:
 * "HospitalName" → "Hospital Name", "charges_to_date" → "Charges To Date".
 * Short all-caps tokens (acronyms) are left intact.
 */
export function humanizeKey(raw: string): string {
  if (!raw) return "";
  const spaced = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.replace(/\S+/g, (w) =>
    w.length > 1 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1),
  );
}
