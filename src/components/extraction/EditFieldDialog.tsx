import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldCard } from "./FieldCard";
import { FieldSpec, ValidationError, validateFields } from "@/lib/extraction-types";
import { AlertCircle, Pencil } from "lucide-react";

type Props = {
  open: boolean;
  field: FieldSpec | null;
  /** Sibling names to detect duplicates while editing (excludes the field being edited). */
  siblingNames?: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (field: FieldSpec) => void;
};

export function EditFieldDialog({ open, field, siblingNames = [], onOpenChange, onSave }: Props) {
  const [draft, setDraft] = useState<FieldSpec | null>(field);

  useEffect(() => {
    if (open) setDraft(field ? JSON.parse(JSON.stringify(field)) as FieldSpec : null);
  }, [open, field]);

  const errors: ValidationError[] = draft ? validateFields([draft]) : [];
  const dupName = !!draft && siblingNames.includes(draft.name.trim());
  const dupError: ValidationError[] = dupName
    ? [{ fieldId: draft!.id, message: "Duplicate name" }]
    : [];
  const allErrors = [...errors, ...dupError];

  const canSave = !!draft && allErrors.length === 0;

  const save = () => {
    if (!canSave || !draft) return;
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> Edit field</DialogTitle>
          <DialogDescription>
            Update the field definition. Changes are validated and sync with the Field Schema list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {draft && (
            <FieldCard
              field={draft}
              onChange={setDraft}
              depth={0}
              errors={allErrors}
              hideHeaderActions
            />
          )}

          {allErrors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs px-3 py-2 flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Please fix the following before saving:</div>
                <ul className="mt-1 list-disc pl-4">
                  {allErrors.map((e, i) => <li key={i}>{e.message}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
