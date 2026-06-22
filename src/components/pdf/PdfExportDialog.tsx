import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2, FileText, Settings2, ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";

type Orientation = "p" | "l";
type PaperSize = "a4" | "letter";

export interface PdfFilterMeta {
  dateFrom?: Date | null;
  dateTo?: Date | null;
  groups?: string[];
  branches?: string[];
  departments?: string[];
  modules?: string[];
  role?: string;
  userName?: string;
  snapshotFrom?: string | null;
  snapshotTo?: string | null;
  totalClaims?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Live DOM node to capture (the dashboard region). */
  sourceRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  fileName: string;
  meta: PdfFilterMeta;
}

interface PageCanvas {
  canvas: HTMLCanvasElement;
}

const PAGE_DIMS: Record<PaperSize, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
};
const MARGIN = 28;
const HEADER_H = 78;
const FOOTER_H = 32;

function fmtDate(d?: Date | null | string) {
  if (!d) return "All time";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Pack child-canvases into A4-sized pages without splitting a child. */
function packIntoPages(items: PageCanvas[], pxPerPage: number, scale: number): PageCanvas[][] {
  const pages: PageCanvas[][] = [];
  let cur: PageCanvas[] = [];
  let used = 0;
  for (const it of items) {
    const h = it.canvas.height / scale; // px in design units
    if (h > pxPerPage) {
      // Item bigger than a page — slice it vertically into page chunks.
      if (cur.length) { pages.push(cur); cur = []; used = 0; }
      const totalDesignH = h;
      let consumed = 0;
      while (consumed < totalDesignH) {
        const sliceH = Math.min(pxPerPage, totalDesignH - consumed);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = it.canvas.width;
        sliceCanvas.height = Math.round(sliceH * scale);
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(
          it.canvas,
          0, Math.round(consumed * scale), it.canvas.width, sliceCanvas.height,
          0, 0, it.canvas.width, sliceCanvas.height,
        );
        pages.push([{ canvas: sliceCanvas }]);
        consumed += sliceH;
      }
      continue;
    }
    if (used + h > pxPerPage && cur.length) {
      pages.push(cur); cur = []; used = 0;
    }
    cur.push(it);
    used += h;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

export default function PdfExportDialog({ open, onOpenChange, sourceRef, title, fileName, meta }: Props) {
  // Two-step flow: 1) options (confirm filters + paper) 2) preview 3) saving
  const [phase, setPhase] = useState<"options" | "rendering" | "ready" | "saving">("options");
  const [progress, setProgress] = useState(0);
  const [pages, setPages] = useState<PageCanvas[][]>([]);
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("p");
  const previewRef = useRef<HTMLDivElement>(null);

  const generatedAt = useMemo(() => new Date(), [open]);

  // Page dims (in pt) — swap W/H for landscape.
  const pageW = orientation === "p" ? PAGE_DIMS[paper].w : PAGE_DIMS[paper].h;
  const pageH = orientation === "p" ? PAGE_DIMS[paper].h : PAGE_DIMS[paper].w;
  const usableW = pageW - MARGIN * 2;
  const usableH = pageH - HEADER_H - FOOTER_H - MARGIN;

  const filterChips: string[] = useMemo(() => {
    const chips: string[] = [];
    chips.push(`Date: ${fmtDate(meta.dateFrom)} → ${fmtDate(meta.dateTo)}`);
    if (meta.branches?.length) chips.push(`Branches: ${meta.branches.length}`);
    else if (meta.groups?.length) chips.push(`Groups: ${meta.groups.length}`);
    else chips.push("Scope: All branches");
    if (meta.departments?.length) chips.push(`Depts: ${meta.departments.join(", ")}`);
    if (meta.modules?.length) chips.push(`Modules: ${meta.modules.join(", ")}`);
    return chips;
  }, [meta]);

  // Reset to the options step every time the dialog closes.
  useEffect(() => {
    if (!open) {
      setPhase("options");
      setProgress(0);
      setPages([]);
    }
  }, [open]);

  async function startRender() {
    setPhase("rendering");
    setProgress(5);
    try {
      const node = sourceRef.current;
      if (!node) throw new Error("Nothing to export");
      const { default: html2canvas } = await import("html2canvas-pro");
      setProgress(15);

      // Capture each direct child as its own canvas so pagination respects
      // element boundaries (no mid-row cuts, no overlapping charts).
      const children = Array.from(node.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el.offsetHeight > 0,
      );
      const sources: HTMLElement[] = children.length ? children : [node];
      const captured: PageCanvas[] = [];
      const scale = 2;
      for (let i = 0; i < sources.length; i++) {
        const c = await html2canvas(sources[i], {
          scale,
          backgroundColor: "#ffffff",
          useCORS: true,
          windowWidth: node.scrollWidth,
        });
        captured.push({ canvas: c });
        setProgress(15 + Math.round(((i + 1) / sources.length) * 65));
      }

      const refW = captured[0]?.canvas.width ?? usableW * scale;
      const pxPerPage = (usableH * refW) / (usableW * scale);
      const packed = packIntoPages(captured, pxPerPage, scale);
      setPages(packed);
      setProgress(100);
      setPhase("ready");
    } catch (err) {
      console.error("PDF preview render failed", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Could not build PDF preview: ${msg}`);
      setPhase("options");
    }
  }

  async function handleConfirmDownload() {
    if (phase !== "ready") return;
    setPhase("saving");
    const tId = toast.loading("Saving PDF…");
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation, unit: "pt", format: paper });
      const totalPages = pages.length;
      const generatedStr = generatedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
      const snapStr = `${fmtDate(meta.snapshotFrom)} → ${fmtDate(meta.snapshotTo)}`;
      const userStr = [meta.userName, meta.role].filter(Boolean).join(" · ") || "—";

      for (let p = 0; p < totalPages; p++) {
        if (p > 0) pdf.addPage();
        // Header
        pdf.setFillColor(15, 23, 42);
        pdf.rect(0, 0, pageW, HEADER_H - 18, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.text(`RCMBuddy — ${title}`, MARGIN, 24);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.text(filterChips.join("   •   "), MARGIN, 40);
        pdf.text(
          `Generated ${generatedStr}` + (meta.totalClaims != null ? `   •   ${meta.totalClaims.toLocaleString("en-IN")} claims` : ""),
          MARGIN, 52,
        );
        pdf.setTextColor(15, 23, 42);

        // Body
        const pageItems = pages[p];
        let y = HEADER_H;
        for (const it of pageItems) {
          const w = usableW;
          const h = (it.canvas.height * w) / it.canvas.width;
          pdf.addImage(it.canvas.toDataURL("image/png"), "PNG", MARGIN, y, w, h, undefined, "FAST");
          y += h;
        }

        // Footer
        const footerY = pageH - FOOTER_H + 8;
        pdf.setDrawColor(220);
        pdf.line(MARGIN, footerY - 6, pageW - MARGIN, footerY - 6);
        pdf.setFontSize(7.5);
        pdf.setTextColor(90);
        pdf.text(`Snapshot: ${snapStr}`, MARGIN, footerY);
        pdf.text(`Prepared for: ${userStr}`, MARGIN, footerY + 10);
        pdf.text(`Generated ${generatedStr}`, pageW / 2, footerY, { align: "center" });
        pdf.text(`Page ${p + 1} of ${totalPages}`, pageW - MARGIN, footerY, { align: "right" });
        pdf.text("Confidential — RCMBuddy", pageW - MARGIN, footerY + 10, { align: "right" });
      }

      pdf.save(fileName);
      toast.success("PDF downloaded", { id: tId });
      onOpenChange(false);
    } catch (err) {
      console.error("PDF save failed", err);
      toast.error("Could not save PDF", { id: tId });
      setPhase("ready");
    }
  }


  return (
    <Dialog open={open} onOpenChange={(o) => { if (phase === "saving") return; onOpenChange(o); }}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            PDF Preview — {title}
          </DialogTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {filterChips.map((c) => (
              <span key={c} className="inline-flex items-center text-[10.5px] font-medium rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {c}
              </span>
            ))}
            {meta.role && (
              <span className="inline-flex items-center text-[10.5px] font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5">
                Role: {meta.role}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/40 p-4">
          {phase !== "ready" ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div className="text-sm font-medium">Rendering preview…</div>
              <div className="w-72"><Progress value={progress} /></div>
              <div className="text-[11px] text-muted-foreground">{progress}%</div>
            </div>
          ) : (
            <div ref={previewRef} className="space-y-4">
              {pages.map((pageItems, idx) => (
                <div
                  key={idx}
                  className="mx-auto bg-white shadow-md ring-1 ring-border overflow-hidden"
                  style={{ width: Math.min(720, A4_W * 1.15), aspectRatio: `${A4_W} / ${A4_H}` }}
                >
                  <div className="bg-slate-900 text-white px-4 py-2">
                    <div className="text-[11px] font-semibold">RCMBuddy — {title}</div>
                    <div className="text-[8.5px] opacity-80 leading-snug">{filterChips.join("  •  ")}</div>
                  </div>
                  <div className="p-3 flex flex-col gap-2" style={{ height: `calc(100% - 70px)` }}>
                    {pageItems.map((it, i) => (
                      <img
                        key={i}
                        src={it.canvas.toDataURL("image/png")}
                        alt=""
                        className="w-full object-contain"
                        style={{ maxHeight: "100%" }}
                      />
                    ))}
                  </div>
                  <div className="border-t px-3 py-1.5 flex justify-between text-[8px] text-muted-foreground">
                    <span>Snapshot: {fmtDate(meta.snapshotFrom)} → {fmtDate(meta.snapshotTo)}</span>
                    <span>Page {idx + 1} of {pages.length}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="text-[11px] text-muted-foreground">
            {phase === "ready" ? `${pages.length} page${pages.length === 1 ? "" : "s"} ready` : "Preparing…"}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={phase === "saving"}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmDownload}
              disabled={phase !== "ready"}
            >
              {phase === "saving" ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
