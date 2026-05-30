import { useEffect, useRef, useState, useCallback } from "react";
import { Upload, Loader2, Download, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ClaimDocument {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
}

const BUCKET = "claim-documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTS = ["pdf", "jpg", "jpeg", "png", "docx"] as const;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ACCEPT = ALLOWED_EXTS.map((e) => `.${e}`).join(",");

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extOk = (ALLOWED_EXTS as readonly string[]).includes(ext);
  const mimeOk = !file.type || ALLOWED_MIME.has(file.type);
  if (!extOk || !mimeOk) {
    return `Unsupported file type. Allowed: ${ALLOWED_EXTS.join(", ").toUpperCase()}`;
  }
  if (file.size <= 0) return "File is empty.";
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${formatSize(file.size)}). Max ${formatSize(MAX_FILE_SIZE)}.`;
  }
  return null;
}

/**
 * Upload via a signed upload URL so we can wire real progress events from XHR.
 * Supabase's storage SDK doesn't expose upload progress directly, so we
 * mint a one-shot signed URL and PUT to it ourselves.
 */
async function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (signErr || !signed?.signedUrl) {
    throw signErr ?? new Error("Could not create upload URL");
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.signedUrl, true);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.send(file);
  });
}

export function ClaimDocumentsPanel({ claimId }: { claimId: string }) {
  const { userId, orgId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<ClaimDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("claim_documents" as never)
      .select("id, file_path, file_name, file_size, uploaded_by, uploader_name, created_at")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      toast.error("Failed to load documents");
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as ClaimDocument[];

    // Single batched lookup for any rows whose uploader_name isn't denormalized.
    // Avoids per-row queries and the per-upload lookup at insert time.
    const missingIds = Array.from(
      new Set(rows.filter((r) => r.uploaded_by && !r.uploader_name).map((r) => r.uploaded_by!)),
    );
    if (missingIds.length > 0) {
      const { data: users } = await supabase
        .from("app_users")
        .select("auth_user_id, name")
        .in("auth_user_id", missingIds);
      const nameMap = new Map<string, string>(
        (users ?? []).map((u) => [u.auth_user_id as string, u.name as string]),
      );
      for (const r of rows) {
        if (r.uploaded_by && !r.uploader_name) {
          r.uploader_name = nameMap.get(r.uploaded_by) ?? null;
        }
      }
    }

    setDocs(rows);
    setLoading(false);
  }, [claimId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFile = async (file: File) => {
    const reason = validateFile(file);
    if (reason) {
      toast.error(reason);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!orgId) {
      toast.error("No organization context — please sign in again.");
      return;
    }
    setUploading(true);
    setProgress(0);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${claimId}/${Date.now()}_${safeName}`;
    try {
      await uploadWithProgress(path, file, setProgress);

      const { error: insErr } = await supabase.from("claim_documents" as never).insert({
        claim_id: claimId,
        org_id: orgId,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_by: userId,
        // uploader_name resolved on read via batched join — no per-upload lookup.
      } as never);
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
      toast.success("Document uploaded");
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (doc: ClaimDocument) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Could not generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (doc: ClaimDocument) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      const { error: dbErr } = await supabase
        .from("claim_documents" as never)
        .delete()
        .eq("id", doc.id);
      if (dbErr) throw dbErr;
      const { error: stErr } = await supabase.storage.from(BUCKET).remove([doc.file_path]);
      if (stErr) console.warn("Storage delete warning:", stErr);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success("Document deleted");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (uploading) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    if (files.length > 1) {
      toast.error("Please drop one file at a time.");
      return;
    }
    void handleFile(files[0]);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = uploading ? "none" : "copy";
  };

  return (
    <div
      className="space-y-4"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          PDF, JPG, PNG, or DOCX · max {formatSize(MAX_FILE_SIZE)}. Files are private to your organization.
        </p>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          Upload Document
        </Button>
      </div>

      {uploading && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-[11px] text-muted-foreground tabular-nums">
            Uploading… {progress}%
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-md transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30 hover:bg-muted/50"
          }`}
        >
          <Upload className={`h-10 w-10 mb-3 ${isDragging ? "text-primary" : "text-muted-foreground/40"}`} />
          <p className="text-sm text-muted-foreground">
            {isDragging ? "Drop file to upload" : "Drag & drop a file here, or click to browse"}
          </p>
        </button>
      ) : isDragging ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-primary rounded-md bg-primary/5">
          <Upload className="h-10 w-10 text-primary mb-3" />
          <p className="text-sm text-primary font-medium">Drop file to upload</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
            >
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{d.file_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatSize(d.file_size)} ·{" "}
                  {new Date(d.created_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {d.uploader_name ? ` · ${d.uploader_name}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDownload(d)}
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={deletingId === d.id}
                onClick={() => handleDelete(d)}
                aria-label="Delete"
              >
                {deletingId === d.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
