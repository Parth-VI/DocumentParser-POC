export type FieldType =
  | "text" | "number" | "integer" | "decimal" | "boolean"
  | "date" | "time" | "datetime"
  | "list" | "object"
  | "email" | "phone" | "currency" | "enum";

export type FieldSpec = {
  id: string;
  name: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  format?: string;
  enum_values?: string[];
  enum_descriptions?: Record<string, string>;
  currency_code?: string;
  item?: FieldSpec;
  fields?: FieldSpec[];
};

export type FieldLocation = {
  path: string;
  value: string | number | boolean | null;
  matched_text: string;
  page: number; // 1-indexed
  bbox: [number, number, number, number]; // absolute units, top-left origin
  bbox_normalized: [number, number, number, number]; // [x0, y0, x1, y1] in 0..1
  page_width: number;
  page_height: number;
  confidence: number; // 0..100
  match_method: "exact" | "fuzzy" | "digit";
};

export type ExtractionResponse = {
  data: Record<string, unknown>;
  model: string;
  used_vision: boolean;
  ocr_engine: "pymupdf-text" | "tesseract" | null;
  page_count: number;
  response_time_ms: number;
  document_type: string | null;
  cost: number | null;
  total_tokens: number | null;
  locations: FieldLocation[] | null;
  /**
   * Stringified JSON containing the FULL payload (e.g. all spreadsheet rows).
   * When present, `data` is a truncated preview (first ~100 rows) and the
   * complete dataset must be downloaded from this field.
   */
  full_payload_json?: string | null;
};

export const FIELD_TYPE_INFO: Record<FieldType, { label: string; desc: string }> = {
  text: { label: "text", desc: "Free-form string" },
  number: { label: "number", desc: "Floating-point number" },
  integer: { label: "integer", desc: "Whole number" },
  decimal: { label: "decimal", desc: "Decimal number" },
  boolean: { label: "boolean", desc: "True / false" },
  date: { label: "date", desc: "Calendar date (ISO 8601)" },
  time: { label: "time", desc: "Time of day" },
  datetime: { label: "datetime", desc: "Date + time (ISO 8601)" },
  email: { label: "email", desc: "Email address" },
  phone: { label: "phone", desc: "Phone number" },
  currency: { label: "currency", desc: "Money amount (numeric)" },
  enum: { label: "enum", desc: "One of a fixed set of strings" },
  list: { label: "list", desc: "Array of items" },
  object: { label: "object", desc: "Nested object with child fields" },
};

let _id = 0;
const newId = () => `f${(_id++).toString(36)}`;

export function newField(partial: Partial<FieldSpec> = {}): FieldSpec {
  return {
    id: newId(),
    name: "",
    type: "text",
    required: true,
    ...partial,
  };
}

/** Types whose spec may carry a `format` hint (the service rejects it elsewhere). */
const FORMAT_TYPES = new Set<FieldType>(["date", "time", "datetime"]);

/**
 * Strip ids + empties for the wire.
 *
 * Emits the canonical shape the extraction service validates against: an `enum`
 * map of `{ value: description }`, and type-scoped hints only — a `format` on a
 * non-date field or a `currency_code` on a non-currency field is rejected by the
 * backend's FieldSpec validator, so those keys are dropped rather than sent.
 */
export function serializeField(f: FieldSpec): Record<string, unknown> {
  const out: Record<string, unknown> = { name: f.name, type: f.type };
  if (f.description) out.description = f.description;
  out.required = f.required !== false;
  if (f.format && FORMAT_TYPES.has(f.type)) out.format = f.format;
  if (f.currency_code && f.type === "currency") out.currency_code = f.currency_code;
  if (f.type === "enum" && f.enum_values && f.enum_values.length) {
    // "" for values with no description — the documented empty-description form.
    out.enum = Object.fromEntries(
      f.enum_values.map((v) => [v, f.enum_descriptions?.[v] ?? ""]),
    );
  }
  if (f.type === "list" && f.item) out.item = serializeField(f.item);
  if (f.type === "object" && f.fields && f.fields.length) {
    out.fields = f.fields.map(serializeField);
  }
  return out;
}

/** Pull `enum_values` + `enum_descriptions` out of either stored enum shape. */
export function readEnum(raw: Record<string, unknown>): Pick<FieldSpec, "enum_values" | "enum_descriptions"> {
  // Canonical: { enum: { value: description } }.
  if (raw.enum && typeof raw.enum === "object" && !Array.isArray(raw.enum)) {
    const entries = Object.entries(raw.enum as Record<string, unknown>);
    const enum_values = entries.map(([v]) => v);
    const enum_descriptions: Record<string, string> = {};
    for (const [v, d] of entries) if (typeof d === "string" && d) enum_descriptions[v] = d;
    return {
      enum_values,
      enum_descriptions: Object.keys(enum_descriptions).length ? enum_descriptions : undefined,
    };
  }
  // Legacy: { enum_values: [...], enum_descriptions: {...} }.
  if (Array.isArray(raw.enum_values)) {
    const enum_values = raw.enum_values.map(String);
    const descs = raw.enum_descriptions;
    const enum_descriptions: Record<string, string> = {};
    if (descs && typeof descs === "object" && !Array.isArray(descs)) {
      for (const [k, v] of Object.entries(descs as Record<string, unknown>)) {
        if (typeof v === "string" && v) enum_descriptions[k] = v;
      }
    }
    return {
      enum_values,
      enum_descriptions: Object.keys(enum_descriptions).length ? enum_descriptions : undefined,
    };
  }
  return {};
}

/**
 * Hydrate a stored/serialized field spec into an editable FieldSpec with fresh ids.
 * Tolerant by design — it loads configs the service already accepted, so an
 * unexpected key is ignored rather than thrown.
 */
export function fieldFromJson(raw: unknown): FieldSpec {
  if (!raw || typeof raw !== "object") return newField();
  const r = raw as Record<string, unknown>;
  const type = (typeof r.type === "string" ? r.type : "text") as FieldType;
  const out = newField({
    name: typeof r.name === "string" ? r.name : "",
    type: FIELD_TYPE_INFO[type] ? type : "text",
    description: typeof r.description === "string" ? r.description : undefined,
    required: typeof r.required === "boolean" ? r.required : true,
    format: typeof r.format === "string" ? r.format : undefined,
    currency_code: typeof r.currency_code === "string" ? r.currency_code : undefined,
    ...readEnum(r),
  });
  if (r.item) out.item = fieldFromJson(r.item);
  if (Array.isArray(r.fields)) out.fields = r.fields.map(fieldFromJson);
  return out;
}

export type ValidationError = { fieldId: string; message: string };

export function validateFields(fields: FieldSpec[], errors: ValidationError[] = []): ValidationError[] {
  const names = new Set<string>();
  for (const f of fields) {
    if (!f.name.trim()) errors.push({ fieldId: f.id, message: "Name is required" });
    else if (names.has(f.name)) errors.push({ fieldId: f.id, message: "Duplicate name" });
    names.add(f.name);
    if (f.type === "enum" && (!f.enum_values || f.enum_values.length === 0))
      errors.push({ fieldId: f.id, message: "Enum needs at least one value" });
    if (f.type === "list") {
      if (!f.item) errors.push({ fieldId: f.id, message: "List needs item schema" });
      else validateFields([f.item], errors);
    }
    if (f.type === "object") {
      if (!f.fields || f.fields.length === 0) errors.push({ fieldId: f.id, message: "Object needs child fields" });
      else validateFields(f.fields, errors);
    }
  }
  return errors;
}
