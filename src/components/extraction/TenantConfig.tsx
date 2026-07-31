import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, RefreshCw, X, AlertCircle, Database, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FieldSpec } from "@/lib/extraction-types";
import { errorMessage } from "@/lib/ai-api";
import { fetchTenants, fetchTenantSchema, type Tenant, type TenantSchema } from "@/lib/document-ai";

export type { Tenant };

type SchemaState = "idle" | "loading" | "loaded" | "empty" | "error";

export interface TenantSelectProps {
  selected: Tenant | null;
  onChange: (tenant: Tenant | null) => void;
  /**
   * Called after the schema fetch completes for the chosen tenant. `config` is
   * null when the tenant has no saved parser config yet.
   */
  onLoad: (fields: FieldSpec[], hasRemote: boolean, config: TenantSchema | null) => void;
}

export function TenantSelect({ selected, onChange, onLoad }: TenantSelectProps) {
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [schemaState, setSchemaState] = useState<SchemaState>("idle");
  const switchSeq = useRef(0);

  const loadTenants = useCallback(async () => {
    setTenantsLoading(true);
    setTenantsError(null);
    try {
      setTenants(await fetchTenants());
    } catch (e) {
      setTenantsError(errorMessage(e, "Failed to load tenants"));
    } finally {
      setTenantsLoading(false);
    }
  }, []);

  useEffect(() => { void loadTenants(); }, [loadTenants]);

  const handleSelect = useCallback((tenant: Tenant) => {
    setOpen(false);
    if (selected?.id === tenant.id) return;
    onChange(tenant);
    const seq = ++switchSeq.current;
    setSchemaState("loading");
    window.setTimeout(async () => {
      try {
        const config = await fetchTenantSchema(tenant.id);
        if (switchSeq.current !== seq) return;
        if (!config) {
          setSchemaState("empty");
          onLoad([], false, null);
          return;
        }
        setSchemaState("loaded");
        onLoad(config.fields, true, config);
        toast.success(`Loaded schema for ${tenant.name}`);
      } catch (e) {
        if (switchSeq.current !== seq) return;
        setSchemaState("error");
        toast.error(errorMessage(e, "Failed to load schema"));
      }
    }, 150);
  }, [selected?.id, onChange, onLoad]);

  const clearSelection = useCallback(() => {
    switchSeq.current++;
    setSchemaState("idle");
    onChange(null);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Tenant</Label>
        {tenantsError && (
          <Button variant="ghost" size="sm" onClick={loadTenants} className="h-6 text-xs">
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        )}
      </div>
      {tenantsLoading && tenants.length === 0 ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <div className="flex gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="flex-1 justify-between font-normal"
              >
                <span className={cn("truncate", !selected && "text-muted-foreground")}>
                  {selected ? selected.name : "Select tenant…"}
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
              <Command>
                <CommandInput placeholder="Search tenants…" />
                <CommandList>
                  <CommandEmpty>
                    {tenantsError ? (
                      <div className="text-xs text-destructive py-2">{tenantsError}</div>
                    ) : tenantsLoading ? (
                      <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground py-3">No tenants found.</div>
                    )}
                  </CommandEmpty>
                  {tenants.length > 0 && (
                    <CommandGroup>
                      {tenants.map((t) => (
                        <CommandItem
                          key={t.id}
                          value={`${t.name} ${t.id}`}
                          onSelect={() => handleSelect(t)}
                        >
                          <Check className={cn("h-4 w-4", selected?.id === t.id ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{t.name}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground font-mono">{t.id}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selected && (
            <Button variant="ghost" size="icon" onClick={clearSelection} title="Clear selection">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {selected && (
        <div className="text-xs">
          {schemaState === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching schema…
            </div>
          )}
          {schemaState === "loaded" && (
            <Badge variant="secondary" className="gap-1.5">
              <Database className="h-3 w-3" /> Schema loaded from database
            </Badge>
          )}
          {schemaState === "empty" && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FilePlus2 className="h-3.5 w-3.5" /> No saved schema — define fields below and save.
            </div>
          )}
          {schemaState === "error" && (
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" /> Couldn't load tenant schema.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
