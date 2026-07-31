import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  values: string[];
  descriptions: Record<string, string>;
  onChange: (values: string[], descriptions: Record<string, string>) => void;
  placeholder?: string;
};

export function EnumValuesEditor({ values, descriptions, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v], descriptions);
    setDraft("");
  };

  const removeValue = (v: string) => {
    const next = { ...descriptions };
    delete next[v];
    onChange(values.filter((x) => x !== v), next);
  };

  const updateDescription = (v: string, desc: string) => {
    const next = { ...descriptions };
    if (desc) next[v] = desc;
    else delete next[v];
    onChange(values, next);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="rounded-md border bg-background p-2 space-y-2">
      {values.length > 0 && (
        <div className="space-y-1.5">
          {values.map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span
                className="font-mono text-xs px-2 py-1 rounded bg-accent text-accent-foreground shrink-0 truncate max-w-40"
                title={v}
              >
                {v}
              </span>
              <Input
                value={descriptions[v] ?? ""}
                onChange={(e) => updateDescription(v, e.target.value)}
                placeholder="Optional description for this value"
                className="h-7 text-xs flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                onClick={() => removeValue(v)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={placeholder ?? "Add value and press Enter"}
        className="h-7 text-xs"
      />
    </div>
  );
}
