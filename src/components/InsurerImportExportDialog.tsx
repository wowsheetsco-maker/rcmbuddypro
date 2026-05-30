// Import / Export dialog for the TPA / Insurer master data.
// - Export: full master as XLSX or CSV
// - Import: parse → choose merge key → preview diff (insert vs update) → confirm

import { useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  RefreshCw,
  MinusCircle,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  exportProfiles,
  parseImportFile,
  downloadTemplate,
  computeMergePreview,
  type ImportResult,
  type MergeKey,
  type MergePreview,
  type MergePreviewRow,
} from "@/lib/insurerIO";
import type { InsurerProfile } from "@/data/insurerProfiles";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: InsurerProfile[];
  onImport?: (incoming: InsurerProfile[], mergeKey: MergeKey) => void;
}

export default function InsurerImportExportDialog({
  open,
  onOpenChange,
  existing,
  onImport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [mergeKey, setMergeKey] = useState<MergeKey>("id");

  const preview: MergePreview | null = useMemo(
    () => (result ? computeMergePreview(existing, result.parsed, mergeKey) : null),
    [result, existing, mergeKey],
  );

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const r = await parseImportFile(file);
      setResult(r);
    } catch {
      toast.error("Failed to parse file. Ensure it's a valid Excel or CSV.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = () => {
    if (!result || result.parsed.length === 0) return;
    onImport?.(result.parsed, mergeKey);
    const i = preview?.inserts ?? 0;
    const u = preview?.updates ?? 0;
    toast.success(`Merged: ${i} new, ${u} updated`);
    reset();
    onOpenChange(false);
  };

  const reset = () => {
    setResult(null);
    setFileName("");
    setMergeKey("id");
    if (fileRef.current) fileRef.current.value = "";
  };

  const inserts = preview?.rows.filter((r) => r.action === "insert") ?? [];
  const updates = preview?.rows.filter((r) => r.action === "update") ?? [];
  const noops = preview?.rows.filter((r) => r.action === "noop") ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import / Export TPA & Insurers</DialogTitle>
          <DialogDescription>
            Bulk-update provider master data. Preview row-level changes before merging.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-3">
          {/* Export */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Export</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Download the full provider master with all contacts and addresses.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => exportProfiles("xlsx", existing)}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => exportProfiles("csv", existing)}
                >
                  <FileText className="h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Import */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Import</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Upload an .xlsx or .csv file.{" "}
                <button className="underline hover:text-primary" onClick={downloadTemplate}>
                  Download template
                </button>
                .
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button
                size="sm"
                className="w-full gap-1.5"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <Upload className="h-3.5 w-3.5" /> {busy ? "Parsing..." : "Choose file"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Result preview */}
        {result && preview && (
          <Card className="border-primary/30 flex-1 min-h-0 flex flex-col">
            <CardContent className="p-4 space-y-3 flex-1 min-h-0 flex flex-col">
              {/* Header strip */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{fileName}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3 text-accent" /> {result.parsed.length} parsed
                  </Badge>
                  {result.errors.length > 0 && (
                    <Badge className="text-[10px] gap-1 bg-destructive text-destructive-foreground">
                      <AlertCircle className="h-3 w-3" /> {result.errors.length} errors
                    </Badge>
                  )}
                </div>
              </div>

              {/* Merge-key selector + summary */}
              <div className="flex items-center gap-3 flex-wrap rounded-md bg-muted/40 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Match by</span>
                  <Select value={mergeKey} onValueChange={(v) => setMergeKey(v as MergeKey)}>
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="id">ID</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                  <Badge className="text-[10px] gap-1 bg-accent text-accent-foreground">
                    <PlusCircle className="h-3 w-3" /> {preview.inserts} new
                  </Badge>
                  <Badge className="text-[10px] gap-1 bg-warning text-warning-foreground">
                    <RefreshCw className="h-3 w-3" /> {preview.updates} update
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <MinusCircle className="h-3 w-3" /> {preview.noops} unchanged
                  </Badge>
                </div>
              </div>

              {preview.duplicateKeys.length > 0 && (
                <div className="rounded bg-warning/10 border border-warning/30 p-2 text-[11px] text-warning-foreground">
                  ⚠ {preview.duplicateKeys.length} duplicate {mergeKey}(s) in your file — last
                  occurrence wins.
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="max-h-24 overflow-y-auto rounded bg-muted/50 p-2 text-xs space-y-0.5">
                  {result.errors.slice(0, 8).map((e, i) => (
                    <div key={i} className="text-destructive">
                      • {e}
                    </div>
                  ))}
                  {result.errors.length > 8 && (
                    <div className="text-muted-foreground">
                      …and {result.errors.length - 8} more
                    </div>
                  )}
                </div>
              )}

              {/* Tabs: Updates / Inserts / Unchanged */}
              <Tabs defaultValue="updates" className="flex-1 min-h-0 flex flex-col">
                <TabsList className="grid grid-cols-3 h-8">
                  <TabsTrigger value="updates" className="text-xs">
                    Updates ({updates.length})
                  </TabsTrigger>
                  <TabsTrigger value="inserts" className="text-xs">
                    New ({inserts.length})
                  </TabsTrigger>
                  <TabsTrigger value="noops" className="text-xs">
                    Unchanged ({noops.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="updates" className="flex-1 min-h-0 mt-2">
                  <PreviewList rows={updates} emptyLabel="No existing rows will be updated." />
                </TabsContent>
                <TabsContent value="inserts" className="flex-1 min-h-0 mt-2">
                  <PreviewList rows={inserts} emptyLabel="No new rows will be inserted." />
                </TabsContent>
                <TabsContent value="noops" className="flex-1 min-h-0 mt-2">
                  <PreviewList
                    rows={noops}
                    emptyLabel="No identical rows."
                    hideDiffs
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleConfirmImport}
            disabled={!result || result.parsed.length === 0}
          >
            Apply merge
            {preview && ` · +${preview.inserts} / ~${preview.updates}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewList({
  rows,
  emptyLabel,
  hideDiffs,
}: {
  rows: MergePreviewRow[];
  emptyLabel: string;
  hideDiffs?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground border rounded-md">
        {emptyLabel}
      </div>
    );
  }
  return (
    <ScrollArea className="h-[260px] rounded-md border">
      <div className="divide-y">
        {rows.map((r, idx) => (
          <div key={idx} className="px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ActionDot action={r.action} />
                <span className="font-medium truncate">{r.incoming.name}</span>
                <Badge variant="outline" className="text-[9px] uppercase shrink-0">
                  {r.incoming.type}
                </Badge>
              </div>
              {r.existing && (
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  ID {r.existing.id}
                </span>
              )}
            </div>
            {!hideDiffs && r.diffs.length > 0 && (
              <div className="mt-1.5 ml-4 space-y-0.5">
                {r.diffs.slice(0, 5).map((d, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px]">
                    <span className="text-muted-foreground w-28 shrink-0 truncate">
                      {d.field}:
                    </span>
                    <span className="line-through text-muted-foreground truncate max-w-[140px]">
                      {d.before || "—"}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-foreground font-medium truncate">{d.after}</span>
                  </div>
                ))}
                {r.diffs.length > 5 && (
                  <div className="text-[10px] text-muted-foreground ml-1">
                    +{r.diffs.length - 5} more field(s)
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function ActionDot({ action }: { action: MergePreviewRow["action"] }) {
  const cls =
    action === "insert"
      ? "bg-accent"
      : action === "update"
        ? "bg-warning"
        : "bg-muted-foreground/40";
  return <span className={`h-2 w-2 rounded-full shrink-0 ${cls}`} />;
}
