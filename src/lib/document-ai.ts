/**
 * Typed calls against the Document AI service.
 *
 * Tenants and their saved schemas come from the DB via /api/v1/tenants…; the
 * extraction itself goes through POST /api/v1/extract-document in `is_test`
 * mode, which extracts synchronously and returns the result (plus per-field
 * source locations) inline instead of 202 + webhook dispatch.
 */
import { ApiError, aiFetch } from "@/lib/ai-api";
import {
  ExtractionResponse,
  FieldLocation,
  FieldSpec,
  fieldFromJson,
  serializeField,
} from "@/lib/extraction-types";

export type ExtractionModel = "claude" | "openai";

export type Tenant = { id: string; name: string };

/** The tenant's stored parser config. */
export type TenantSchema = {
  fields: FieldSpec[];
  /** Stored as the Laravel enum's value ("Claude" | "OpenAI"); null when unset. */
  model: ExtractionModel | null;
  skipRelevanceCheck: boolean;
};

// Trace attribution for studio runs. The service uses these for Langfuse only;
// `role: super-admin` is what unlocks cost/token numbers in the response.
const STUDIO_ROLE = "super-admin";
const STUDIO_USER_ID = "577";

/** Active tenants, straight from the DB, for the picker. */
export async function fetchTenants(): Promise<Tenant[]> {
  const res = await aiFetch<{ tenants?: Array<{ id: number | string; name: string }> }>({
    path: "/api/v1/tenants",
  });
  return (res.tenants ?? [])
    .filter((t) => t?.id != null && t?.name != null)
    .map((t) => ({ id: String(t.id), name: String(t.name) }));
}

function toModel(raw: unknown): ExtractionModel | null {
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (key === "claude") return "claude";
  if (key === "openai" || key === "chatgpt" || key === "gpt") return "openai";
  return null;
}

/**
 * The tenant's saved schema, or `null` when it has none yet (the service answers
 * 404, which is an empty state here — not an error).
 */
export async function fetchTenantSchema(tenantId: string): Promise<TenantSchema | null> {
  let res: {
    fields?: unknown;
    model?: unknown;
    is_relevance_check_skipped?: unknown;
  };
  try {
    res = await aiFetch({ path: `/api/v1/tenants/${encodeURIComponent(tenantId)}/schema` });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
  const raw = Array.isArray(res.fields) ? res.fields : [];
  if (raw.length === 0) return null;
  return {
    fields: raw.map(fieldFromJson),
    model: toModel(res.model),
    skipRelevanceCheck: res.is_relevance_check_skipped === true,
  };
}

/** Create or update the tenant's schema. POST creates, PUT updates — both upsert. */
export async function saveTenantSchema({
  tenantId,
  fields,
  model,
  skipRelevanceCheck,
  update,
}: {
  tenantId: string;
  fields: FieldSpec[];
  model: ExtractionModel;
  skipRelevanceCheck: boolean;
  update: boolean;
}): Promise<{ message?: string }> {
  return aiFetch<{ message?: string }>({
    path: `/api/v1/tenants/${encodeURIComponent(tenantId)}/schema`,
    method: update ? "PUT" : "POST",
    body: {
      tenant_id: Number(tenantId),
      fields: fields.map(serializeField),
      model,
      is_relevance_check_skipped: skipRelevanceCheck,
    },
  });
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toLocations(value: unknown): FieldLocation[] | null {
  if (!Array.isArray(value)) return null;
  const out = value
    .map((raw) => {
      const l = (raw ?? {}) as Record<string, unknown>;
      const bbox = Array.isArray(l.bbox) ? l.bbox.map((v) => num(v)) : [0, 0, 0, 0];
      const norm = Array.isArray(l.bbox_normalized)
        ? l.bbox_normalized.map((v) => num(v))
        : [0, 0, 0, 0];
      return {
        path: String(l.path ?? ""),
        value: (l.value ?? null) as FieldLocation["value"],
        matched_text: String(l.matched_text ?? ""),
        page: num(l.page, 1),
        bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
        bbox_normalized: [norm[0], norm[1], norm[2], norm[3]],
        page_width: num(l.page_width),
        page_height: num(l.page_height),
        confidence: num(l.confidence),
        match_method: (l.match_method ?? "exact") as FieldLocation["match_method"],
      } satisfies FieldLocation;
    })
    .filter((l) => l.path);
  return out.length ? out : null;
}

/**
 * Normalize both response shapes into ExtractionResponse:
 *   PDF/image (is_test)  → { extracted_data, mode, locations, … }
 *   spreadsheet          → { data, model, locations, full_payload_json, … }
 */
function mapExtractionResponse(raw: unknown, requestedModel: string): ExtractionResponse {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const extracted = body.extracted_data ?? body.data;
  const data =
    extracted && typeof extracted === "object" && !Array.isArray(extracted)
      ? (extracted as Record<string, unknown>)
      : {};
  const model = body.model ?? body.mode;
  const ocr = body.ocr_engine;
  return {
    data,
    model: typeof model === "string" && model ? model : requestedModel,
    used_vision: body.used_vision === true,
    ocr_engine: (typeof ocr === "string" ? ocr : null) as ExtractionResponse["ocr_engine"],
    page_count: num(body.page_count, 1),
    response_time_ms: num(body.response_time_ms),
    document_type: typeof body.document_type === "string" ? body.document_type : null,
    cost: body.cost == null ? null : num(body.cost),
    total_tokens: body.total_tokens == null ? null : num(body.total_tokens),
    locations: toLocations(body.locations),
    full_payload_json: typeof body.full_payload_json === "string" ? body.full_payload_json : null,
  };
}

/**
 * Extract one document. `is_test` keeps the run synchronous: the service loads the
 * tenant's stored schema, extracts, and returns the data + locations inline (no
 * document_extractions row, no webhooks).
 */
export async function extractDocument({
  file,
  tenantId,
  model,
  docType,
  docContext,
  skipRelevanceCheck,
}: {
  file: File;
  /** Omitted for spreadsheets, which don't use a tenant schema. */
  tenantId?: string | null;
  model: ExtractionModel;
  docType?: string;
  docContext?: string;
  skipRelevanceCheck?: boolean;
}): Promise<ExtractionResponse> {
  const fd = new FormData();
  fd.append("is_test", "true");
  fd.append("file", file, file.name);
  fd.append("model", model);
  fd.append("role", STUDIO_ROLE);
  fd.append("user_id", STUDIO_USER_ID);
  if (tenantId) fd.append("tenant_id", tenantId);
  if (docType) fd.append("document_type", docType);
  if (docContext) {
    // The service feeds `source_message` to the prompt as document context.
    fd.append("source_message", docContext);
    fd.append("document_context", docContext);
  }
  fd.append("skip_relevance_check", skipRelevanceCheck ? "true" : "false");

  const raw = await aiFetch({ path: "/api/v1/extract-document", method: "POST", body: fd });
  return mapExtractionResponse(raw, model);
}
