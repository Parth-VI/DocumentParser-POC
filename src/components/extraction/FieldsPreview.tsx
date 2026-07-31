import { FieldSpec, FieldType, ValidationError } from "@/lib/extraction-types";
import { Button } from "@/components/ui/button";
import {
  AtSign, Braces, Calendar, CalendarClock, Clock, DollarSign, Hash, List,
  Pencil, Phone, ToggleLeft, Trash2, Type, Tag, AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TYPE_ICON: Record<FieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  integer: Hash,
  decimal: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  time: Clock,
  datetime: CalendarClock,
  email: AtSign,
  phone: Phone,
  currency: DollarSign,
  enum: Tag,
  list: List,
  object: Braces,
};

type Props = {
  fields: FieldSpec[];
  errors: ValidationError[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

export function FieldsPreview({ fields, errors, onEdit, onDelete }: Props) {
  if (fields.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed p-10 text-center text-sm text-muted-foreground">
        No fields defined yet. Add a field in the Field Schema section.
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card divide-y">
      {fields.map((f) => (
        <FieldRow
          key={f.id}
          field={f}
          errors={errors}
          depth={0}
          showActions
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

type RowProps = {
  field: FieldSpec;
  errors: ValidationError[];
  depth: number;
  showActions: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};

function FieldRow({ field, errors, depth, showActions, onEdit, onDelete }: RowProps) {
  const Icon = TYPE_ICON[field.type] ?? Type;
  const fieldErrors = errors.filter((e) => e.fieldId === field.id);
  const hasError = fieldErrors.length > 0;

  const children: FieldSpec[] | null =
    field.type === "object" ? field.fields ?? null
      : field.type === "list" && field.item ? [field.item]
      : null;

  return (
    <div>
      <div className={`flex items-start gap-3 px-3 py-2.5 ${hasError ? "bg-rose-50/40 dark:bg-rose-500/10" : ""}`}>
        <Icon className={`h-4 w-4 mt-1 shrink-0 ${hasError ? "text-rose-500 dark:text-rose-400" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {field.name || <span className="italic text-muted-foreground">unnamed</span>}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80 border rounded px-1 font-mono">
              {field.type}
            </span>
            {field.required === false && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1">optional</span>
            )}
            {field.type === "enum" && field.enum_values && field.enum_values.length > 0 && (
              <span className="text-[10px] text-muted-foreground">· {field.enum_values.join(" | ")}</span>
            )}
            {field.type === "currency" && field.currency_code && (
              <span className="text-[10px] text-muted-foreground">· {field.currency_code}</span>
            )}
            {field.format && (
              <span className="text-[10px] text-muted-foreground font-mono">· {field.format}</span>
            )}
          </div>
          {field.description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug whitespace-pre-wrap break-words">
              <span className="text-muted-foreground/60 mr-1">↳</span>{field.description}
            </p>
          )}
          {field.type === "enum" && field.enum_descriptions && field.enum_values && (
            <ul className="mt-1 space-y-0.5">
              {field.enum_values
                .filter((v) => field.enum_descriptions?.[v])
                .map((v) => (
                  <li key={v} className="text-xs text-muted-foreground leading-snug flex gap-1.5">
                    <span className="text-muted-foreground/60">↳</span>
                    <span className="font-mono text-foreground/80 shrink-0">{v}</span>
                    <span className="text-muted-foreground/60">—</span>
                    <span className="break-words">{field.enum_descriptions![v]}</span>
                  </li>
                ))}
            </ul>
          )}
          {hasError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {fieldErrors.map((e) => e.message).join(" · ")}
            </p>
          )}
        </div>
        {showActions && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:text-primary"
              onClick={() => onEdit?.(field.id)}
              aria-label={`Edit ${field.name || "field"}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              onClick={() => {
                if (confirm(`Delete field "${field.name || "(unnamed)"}"?`)) onDelete?.(field.id);
              }}
              aria-label={`Delete ${field.name || "field"}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {children && children.length > 0 && (
        <div
          className="border-l-2 border-muted my-1 divide-y"
          style={{ marginLeft: `${1.5 + depth * 0.75}rem` }}
        >
          {children.map((c) => (
            <FieldRow
              key={c.id}
              field={c}
              errors={errors}
              depth={depth + 1}
              showActions={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
