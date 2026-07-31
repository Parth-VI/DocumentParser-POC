/**
 * Low-level client for the Document AI service (FastAPI).
 *
 * Every endpoint there is behind `verify_hmac`, so each request carries
 * `X-Timestamp` + `X-Signature`. The canonical string MUST match
 * app/utils/hmac_auth.py exactly:
 *
 *   application/json → body + timestamp
 *   anything else     → METHOD + request path + timestamp   (query string excluded)
 *
 * The signature is rejected after 60s of clock skew, so it is computed per call.
 *
 * Signing uses WebCrypto when it exists and falls back to lib/sha256.ts when it
 * doesn't — `crypto.subtle` is absent outside a secure context, so on a LAN
 * address like http://192.168.1.26:8080 (how everyone else on the network opens
 * the studio) the WebCrypto-only version threw before `fetch` was even called,
 * which looked like "no request in the Network tab".
 */
import { hmacSha256Hex } from "@/lib/sha256";

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000"
)
  .trim()
  .replace(/\/+$/, "");

const HMAC_SECRET = (import.meta.env.VITE_FASTAPI_HMAC_SECRET as string | undefined)?.trim();

export class ApiError extends Error {
  readonly status: number;
  /** FastAPI's `detail` — a string, or a structured object (e.g. a relevance rejection). */
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function signature(stringToSign: string, timestamp: string): Promise<string> {
  if (!HMAC_SECRET) {
    throw new ApiError(
      0,
      "VITE_FASTAPI_HMAC_SECRET is missing — add it to .env and restart the dev server.",
    );
  }
  const message = stringToSign + timestamp;

  // Native path: available on localhost and over https.
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const encoder = new TextEncoder();
    const key = await subtle.importKey(
      "raw",
      encoder.encode(HMAC_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await subtle.sign("HMAC", key, encoder.encode(message));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Insecure context (plain http on a LAN IP): same algorithm, in JS.
  warnOnceAboutFallback();
  return hmacSha256Hex(HMAC_SECRET, message);
}

let fallbackWarned = false;
function warnOnceAboutFallback(): void {
  if (fallbackWarned) return;
  fallbackWarned = true;
  console.info(
    "[ai-api] crypto.subtle is unavailable in this context (not localhost/https) — " +
      "signing requests with the built-in HMAC-SHA256 implementation instead.",
  );
}

type AiRequest = {
  /** Path on the service, e.g. "/api/v1/tenants". */
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** A plain object is sent as JSON; FormData is sent as multipart. */
  body?: FormData | Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
};

/** Send a signed request and return the parsed JSON body. Throws ApiError on failure. */
export async function aiFetch<T = unknown>({
  path,
  method = "GET",
  body,
  query,
}: AiRequest): Promise<T> {
  const url = new URL(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const isForm = body instanceof FormData;
  const jsonBody = body && !isForm ? JSON.stringify(body) : null;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  // JSON signs the exact body string sent; everything else signs METHOD + path.
  const stringToSign = jsonBody !== null ? jsonBody : method.toUpperCase() + url.pathname;

  const headers: Record<string, string> = {
    "X-Timestamp": timestamp,
    "X-Signature": await signature(stringToSign, timestamp),
  };
  // Multipart boundaries must be set by the browser — never set Content-Type for FormData.
  if (jsonBody !== null) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: isForm ? body : (jsonBody ?? undefined),
    });
  } catch (e) {
    throw new ApiError(0, e instanceof Error ? e.message : "Network error");
  }

  const payload: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail;
    throw new ApiError(res.status, detailMessage(detail, res.status), detail);
  }
  return payload as T;
}

/**
 * Signed GET that returns binary — the stored mail documents and attachments come
 * back as PDF/image bytes, not JSON, so they can't go through aiFetch.
 */
export async function aiBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const url = new URL(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const res = await fetch(url.toString(), {
    headers: {
      "X-Timestamp": timestamp,
      "X-Signature": await signature("GET" + url.pathname, timestamp),
    },
  }).catch((e) => {
    throw new ApiError(0, e instanceof Error ? e.message : "Network error");
  });

  if (!res.ok) {
    // Errors still arrive as JSON even on a binary endpoint.
    const payload = await res.json().catch(() => ({}));
    const detail = (payload as { detail?: unknown }).detail;
    throw new ApiError(res.status, detailMessage(detail, res.status), detail);
  }

  // Prefer the server's filename so a download keeps the original name.
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  return {
    blob: await res.blob(),
    filename: match?.[1] ?? url.pathname.split("/").pop() ?? "document",
  };
}

/** Best-effort human message out of FastAPI's `detail` (string, {message}, or list). */
function detailMessage(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const msg = (detail as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (Array.isArray(detail) && detail.length) {
    // Pydantic validation errors: [{loc, msg, type}, ...]
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === "string") return first.msg;
  }
  return `Request failed (${status})`;
}

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}
