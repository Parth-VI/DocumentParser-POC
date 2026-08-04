import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, ClipboardPaste } from "lucide-react";
import { FieldSpec, FieldType, newField, readEnum } from "@/lib/extraction-types";

const ALLOWED_TYPES: FieldType[] = [
  "text",
  "number",
  "integer",
  "decimal",
  "boolean",
  "date",
  "time",
  "datetime",
  "list",
  "object",
  "email",
  "phone",
  "currency",
  "enum",
];

function coerceField(raw: unknown, path: string): FieldSpec {
  if (!raw || typeof raw !== "object") throw new Error(`${path}: must be an object`);
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name : "";
  if (!name) throw new Error(`${path}: missing "name"`);
  const type = r.type as FieldType;
  if (!ALLOWED_TYPES.includes(type))
    throw new Error(`${path}.${name}: invalid type "${String(r.type)}"`);
  const out = newField({ name, type });
  if (typeof r.description === "string") out.description = r.description;
  if (typeof r.required === "boolean") out.required = r.required;
  if (typeof r.format === "string") out.format = r.format;
  if (typeof r.currency_code === "string") out.currency_code = r.currency_code;
  // Accepts both enum shapes: the canonical { enum: { value: description } } the
  // service stores, and the legacy enum_values / enum_descriptions pair.
  const { enum_values, enum_descriptions } = readEnum(r);
  if (enum_values) out.enum_values = enum_values;
  if (enum_descriptions) out.enum_descriptions = enum_descriptions;
  if (type === "list") {
    if (!r.item) throw new Error(`${path}.${name}: list requires "item"`);
    out.item = coerceField(r.item, `${path}.${name}.item`);
  }
  if (type === "object") {
    if (!Array.isArray(r.fields) || r.fields.length === 0)
      throw new Error(`${path}.${name}: object requires non-empty "fields"`);
    out.fields = r.fields.map((c, i) => coerceField(c, `${path}.${name}.fields[${i}]`));
  }
  return out;
}

const EXAMPLE = `{
  "fields": [
    { "name": "invoice_number", "type": "text" },
    { "name": "invoice_date", "type": "date" },
    { "name": "total", "type": "currency", "currency_code": "USD" }
  ]
}`;

export function PasteSchemaDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (fields: FieldSpec[]) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : "could not parse"}`);
      return;
    }
    try {
      let arr: unknown;
      if (Array.isArray(parsed)) arr = parsed;
      else if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { fields?: unknown }).fields)
      )
        arr = (parsed as { fields: unknown }).fields;
      else throw new Error(`Expected an array of fields or an object with a "fields" array`);
      const fields = (arr as unknown[]).map((f, i) => coerceField(f, `fields[${i}]`));
      if (fields.length === 0) throw new Error("Schema must contain at least one field");
      onApply(fields);
      onOpenChange(false);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Schema is not in the proper format");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setError(null);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4" /> Paste details as data
          </DialogTitle>
          <DialogDescription>
            For developers — paste the details to capture as JSON. Accepts{" "}
            <code className="font-mono text-xs">{`{ "fields": [...] }`}</code> or a bare array.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          className="font-mono text-xs min-h-[280px]"
          spellCheck={false}
        />

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs px-3 py-2 flex gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>The given JSON is not in the proper format. {error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!text.trim()}>
            Load details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
