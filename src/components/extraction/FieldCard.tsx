import {
  FieldSpec,
  FieldType,
  FIELD_TYPE_INFO,
  newField,
  ValidationError,
} from "@/lib/extraction-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EnumValuesEditor } from "./EnumValuesEditor";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Trash2 } from "lucide-react";
import { useId, useState } from "react";

type Props = {
  field: FieldSpec;
  onChange: (f: FieldSpec) => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  depth: number;
  errors: ValidationError[];
  hideHeaderActions?: boolean;
  title?: string;
};

const TYPES_NEEDING_FORMAT: FieldType[] = ["date", "time", "datetime"];

/**
 * Plain-language names for each value kind. The keys stay technical (they're
 * what the reader speaks), but nothing here reads as jargon to a business user.
 */
const FRIENDLY: Record<FieldType, { label: string; desc: string }> = {
  text: { label: "Text", desc: "Words, names, or codes" },
  number: { label: "Number", desc: "Any number" },
  integer: { label: "Whole number", desc: "No decimals" },
  decimal: { label: "Decimal", desc: "A number with decimals" },
  boolean: { label: "Yes / No", desc: "A yes-or-no answer" },
  date: { label: "Date", desc: "A calendar date" },
  time: { label: "Time", desc: "A time of day" },
  datetime: { label: "Date & time", desc: "A date with a time" },
  email: { label: "Email", desc: "An email address" },
  phone: { label: "Phone", desc: "A phone number" },
  currency: { label: "Money", desc: "An amount of money" },
  enum: { label: "Choose from a list", desc: "One of a set list of options" },
  list: { label: "List", desc: "One row per item" },
  object: { label: "Group", desc: "A set of related details" },
};

function friendly(t: FieldType) {
  return FRIENDLY[t] ?? FIELD_TYPE_INFO[t] ?? { label: t, desc: "" };
}

/**
 * Turn a stored field name into something a non-technical client can read:
 * "ReferenceNumber" → "Reference Number", "charges_to_date" → "Charges To Date".
 * Only the *display* label changes — the underlying name (the key the reader
 * speaks) is left untouched.
 */
function humanize(raw: string): string {
  if (!raw) return "";
  const spaced = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.replace(/\S+/g, (w) =>
    // keep short all-caps acronyms as-is; title-case the rest
    w.length > 1 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1),
  );
}

export function FieldCard(props: Props) {
  const {
    field,
    onChange,
    onRemove,
    onDuplicate,
    onMoveUp,
    onMoveDown,
    depth,
    errors,
    hideHeaderActions,
    title,
  } = props;
  // Collapse saved/named details to a tidy one-line row; auto-open only the
  // ones still being filled in (a freshly added detail has no name yet), so a
  // loaded schema with many details doesn't become an overwhelming wall.
  const [open, setOpen] = useState(() => !(title ?? field.name ?? "").trim());
  const reqId = useId();
  const displayName = humanize(title ?? field.name ?? "");
  const myErrors = errors.filter((e) => e.fieldId === field.id);

  const update = (patch: Partial<FieldSpec>) => onChange({ ...field, ...patch });

  const onTypeChange = (t: FieldType) => {
    const next: FieldSpec = { ...field, type: t };
    if (t !== "list") delete next.item;
    if (t !== "object") delete next.fields;
    if (t !== "enum") {
      delete next.enum_values;
      delete next.enum_descriptions;
    }
    if (!TYPES_NEEDING_FORMAT.includes(t)) delete next.format;
    if (t !== "currency") delete next.currency_code;
    if (t === "list" && !next.item) next.item = newField({ name: "item" });
    if (t === "object" && !next.fields) next.fields = [newField()];
    if (t === "enum" && !next.enum_values) next.enum_values = [];
    onChange(next);
  };

  // Rendered as one row inside the shared list box (NestedFieldList draws the
  // border around the whole list) — collapsed rows stack tightly, and the
  // editor unfolds beneath the row when it's opened.
  return (
    <div className={cn(myErrors.length && "border-l-2 border-l-destructive")}>
      <div className="group flex items-center gap-2.5 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-faint transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="shrink-0 rounded-full border border-line bg-wash px-2 py-0.5 text-[11px] text-muted-foreground">
            {friendly(field.type).label}
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px]">
            {displayName || <span className="italic text-faint">Untitled detail</span>}
          </span>
          {field.required !== false && displayName && (
            <span className="shrink-0 text-highlight" title="Always needed">
              ★
            </span>
          )}
        </button>
        {!hideHeaderActions && (
          <div
            className={cn(
              "flex items-center gap-0.5 transition-opacity",
              // Quiet until the row is hovered (or open) so a long list reads clean.
              !open && "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
            )}
          >
            {/* First/last rows keep a placeholder so every row's ★ lines up. */}
            {onMoveUp ? (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-faint" onClick={onMoveUp}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <span aria-hidden className="h-7 w-7" />
            )}
            {onMoveDown ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-faint"
                onClick={onMoveDown}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <span aria-hidden className="h-7 w-7" />
            )}
            {onDuplicate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-faint"
                onClick={onDuplicate}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-faint hover:text-destructive"
                onClick={() => {
                  if (confirm("Remove this detail?")) onRemove();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-line-soft bg-wash/50 p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[12px] text-faint">What to call it</Label>
              <Input
                value={field.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. Total amount"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-[12px] text-faint">Kind of value</Label>
              <Select value={field.type} onValueChange={(v) => onTypeChange(v as FieldType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(FIELD_TYPE_INFO).map((key) => {
                    const f = friendly(key as FieldType);
                    return (
                      <SelectItem key={key} value={key}>
                        <span>{f.label}</span>
                        <span className="ml-2 text-xs text-faint">— {f.desc}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[12px] text-faint">Hint (optional)</Label>
            <Textarea
              value={field.description ?? ""}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="A short note to help us find the right value — e.g. “the final amount owed, including tax”."
              className="mt-1.5 min-h-16"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={field.required !== false}
              onCheckedChange={(v) => update({ required: v })}
              id={reqId}
            />
            <Label htmlFor={reqId} className="text-[13.5px]">
              Always needed
            </Label>
            <span className="text-[12px] text-faint">
              If off, we'll leave it blank when it isn't on the page.
            </span>
          </div>

          {TYPES_NEEDING_FORMAT.includes(field.type) && (
            <div>
              <Label className="text-[12px] text-faint">Format (optional)</Label>
              <Input
                value={field.format ?? ""}
                onChange={(e) => update({ format: e.target.value })}
                placeholder="e.g. day / month / year"
                className="mt-1.5 font-mono"
              />
            </div>
          )}

          {field.type === "currency" && (
            <div>
              <Label className="text-[12px] text-faint">Currency</Label>
              <Input
                value={field.currency_code ?? ""}
                onChange={(e) => update({ currency_code: e.target.value })}
                placeholder="USD"
                className="mt-1.5 max-w-32 font-mono"
              />
            </div>
          )}

          {field.type === "enum" && (
            <div>
              <Label className="text-[12px] text-faint">The options</Label>
              <p className="mt-0.5 text-[12px] text-faint">
                List the choices we should pick from. A short note per choice can help.
              </p>
              <div className="mt-1.5">
                <EnumValuesEditor
                  values={field.enum_values ?? []}
                  descriptions={field.enum_descriptions ?? {}}
                  onChange={(enum_values, enum_descriptions) =>
                    update({
                      enum_values,
                      enum_descriptions: Object.keys(enum_descriptions).length
                        ? enum_descriptions
                        : undefined,
                    })
                  }
                />
              </div>
            </div>
          )}

          {field.type === "list" && field.item && (
            <div className="space-y-2">
              <Label className="text-[12px] text-faint">Each item has</Label>
              <div className="overflow-hidden rounded-md border border-line bg-surface">
                <FieldCard
                  field={field.item}
                  onChange={(item) => update({ item })}
                  depth={depth + 1}
                  errors={errors}
                  hideHeaderActions
                  title="Item"
                />
              </div>
            </div>
          )}

          {field.type === "object" && (
            <div className="space-y-2">
              <Label className="text-[12px] text-faint">Details in this group</Label>
              <NestedFieldList
                fields={field.fields ?? []}
                onChange={(fields) => update({ fields })}
                depth={depth + 1}
                errors={errors}
              />
            </div>
          )}

          {myErrors.length > 0 && (
            <div className="text-[12px] text-destructive">
              {myErrors.map((e, i) => (
                <div key={i}>• {e.message}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NestedFieldList({
  fields,
  onChange,
  depth,
  errors,
}: {
  fields: FieldSpec[];
  onChange: (f: FieldSpec[]) => void;
  depth: number;
  errors: ValidationError[];
}) {
  const update = (i: number, f: FieldSpec) => {
    const next = [...fields];
    next[i] = f;
    onChange(next);
  };
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const dup = (i: number) => {
    const copy = JSON.parse(JSON.stringify(fields[i])) as FieldSpec;
    const reId = (f: FieldSpec) => {
      f.id = newField().id;
      if (f.item) reId(f.item);
      if (f.fields) f.fields.forEach(reId);
    };
    reId(copy);
    copy.name = copy.name + "_copy";
    onChange([...fields.slice(0, i + 1), copy, ...fields.slice(i + 1)]);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  // One contained box: every detail is a row divided by hairlines, with
  // "+ Add a detail" as the last row — instead of a tall stack of cards.
  return (
    <div className="space-y-2">
      {depth >= 5 && (
        <div className="px-1 text-[12px] text-flag">
          Very deep nesting can make reading less accurate.
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="divide-y divide-line-soft">
          {fields.map((f, i) => (
            <FieldCard
              key={f.id}
              field={f}
              onChange={(nf) => update(i, nf)}
              onRemove={() => remove(i)}
              onDuplicate={() => dup(i)}
              onMoveUp={i > 0 ? () => move(i, -1) : undefined}
              onMoveDown={i < fields.length - 1 ? () => move(i, 1) : undefined}
              depth={depth}
              errors={errors}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange([...fields, newField()])}
          className={cn(
            "flex w-full items-center gap-1.5 px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-wash hover:text-ink",
            fields.length > 0 && "border-t border-line-soft",
          )}
        >
          + Add a detail
        </button>
      </div>
    </div>
  );
}
