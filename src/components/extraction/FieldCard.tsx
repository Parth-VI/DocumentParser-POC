import { FieldSpec, FieldType, FIELD_TYPE_INFO, newField, ValidationError } from "@/lib/extraction-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

export function FieldCard(props: Props) {
  const { field, onChange, onRemove, onDuplicate, onMoveUp, onMoveDown, depth, errors, hideHeaderActions, title } = props;
  const [open, setOpen] = useState(true);
  const reqId = useId();
  const myErrors = errors.filter((e) => e.fieldId === field.id);

  const update = (patch: Partial<FieldSpec>) => onChange({ ...field, ...patch });

  const onTypeChange = (t: FieldType) => {
    const next: FieldSpec = { ...field, type: t };
    if (t !== "list") delete next.item;
    if (t !== "object") delete next.fields;
    if (t !== "enum") { delete next.enum_values; delete next.enum_descriptions; }
    if (!TYPES_NEEDING_FORMAT.includes(t)) delete next.format;
    if (t !== "currency") delete next.currency_code;
    if (t === "list" && !next.item) next.item = newField({ name: "item" });
    if (t === "object" && !next.fields) next.fields = [newField()];
    if (t === "enum" && !next.enum_values) next.enum_values = [];
    onChange(next);
  };

  const borderClass = depth > 0 ? "border-l-2 border-l-primary/40 pl-3" : "";

  return (
    <div className={borderClass}>
      <div className={`rounded-xl border bg-card shadow-sm transition-shadow ${myErrors.length ? "border-rose-400 dark:border-rose-500/60" : ""}`}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
          </button>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-accent text-accent-foreground">{field.type}</span>
          <span className="text-sm font-medium truncate flex-1">{title ?? field.name ?? <span className="text-muted-foreground italic">unnamed</span>}</span>
          {!hideHeaderActions && (
            <div className="flex items-center gap-0.5">
              {onMoveUp && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp}><ArrowUp className="h-3.5 w-3.5" /></Button>}
              {onMoveDown && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown}><ArrowDown className="h-3.5 w-3.5" /></Button>}
              {onDuplicate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>}
              {onRemove && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => {
                  if (confirm("Delete this field?")) onRemove();
                }}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          )}
        </div>

        {open && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={field.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="field_name"
                  className="font-mono mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={field.type} onValueChange={(v) => onTypeChange(v as FieldType)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <span className="font-mono">{info.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">— {info.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={field.description ?? ""}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Tell the AI what this field means. The more specific, the better the extraction."
                className="mt-1 min-h-16"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={field.required !== false}
                onCheckedChange={(v) => update({ required: v })}
                id={reqId}
              />
              <Label htmlFor={reqId} className="text-sm">Required</Label>
              <span className="text-xs text-muted-foreground">If OFF, the AI may return null when not found.</span>
            </div>

            {TYPES_NEEDING_FORMAT.includes(field.type) && (
              <div>
                <Label className="text-xs">Format</Label>
                <Input
                  value={field.format ?? ""}
                  onChange={(e) => update({ format: e.target.value })}
                  placeholder="YYYY-MM-DD / HH:MM:SS / ISO 8601"
                  className="font-mono mt-1"
                />
              </div>
            )}

            {field.type === "currency" && (
              <div>
                <Label className="text-xs">Currency Code</Label>
                <Input
                  value={field.currency_code ?? ""}
                  onChange={(e) => update({ currency_code: e.target.value })}
                  placeholder="USD"
                  className="font-mono mt-1 max-w-32"
                />
              </div>
            )}

            {field.type === "enum" && (
              <div>
                <Label className="text-xs">Allowed Values</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add an optional description per value to help the AI pick the right one.
                </p>
                <div className="mt-1">
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
                <Label className="text-xs">Item Schema</Label>
                <FieldCard
                  field={field.item}
                  onChange={(item) => update({ item })}
                  depth={depth + 1}
                  errors={errors}
                  hideHeaderActions
                  title="Item"
                />
              </div>
            )}

            {field.type === "object" && (
              <div className="space-y-2">
                <Label className="text-xs">Child Fields</Label>
                <NestedFieldList
                  fields={field.fields ?? []}
                  onChange={(fields) => update({ fields })}
                  depth={depth + 1}
                  errors={errors}
                />
              </div>
            )}

            {myErrors.length > 0 && (
              <div className="text-xs text-rose-600 dark:text-rose-400">
                {myErrors.map((e, i) => <div key={i}>• {e.message}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function NestedFieldList({
  fields, onChange, depth, errors,
}: { fields: FieldSpec[]; onChange: (f: FieldSpec[]) => void; depth: number; errors: ValidationError[] }) {
  const update = (i: number, f: FieldSpec) => {
    const next = [...fields]; next[i] = f; onChange(next);
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

  return (
    <div className="space-y-2">
      {depth >= 5 && (
        <div className="text-xs text-amber-600 dark:text-amber-400 px-1">Deep nesting may reduce extraction accuracy.</div>
      )}
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
      <Button variant="outline" size="sm" onClick={() => onChange([...fields, newField()])}>
        + Add Field
      </Button>
    </div>
  );
}
