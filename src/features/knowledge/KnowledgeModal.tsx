"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Modal } from "@shared/ui/Modal";
import { Button, Field, Input } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";

/** Shared upload-document modal — used by the Knowledge page and inline from the Assistant tab. */
export function KnowledgeModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    setErr(null);
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const contentBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      await api.post("/knowledge", {
        title: title || file.name,
        fileName: file.name,
        mimeType: file.type || "text/plain",
        contentBase64,
      });
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
      setTitle("");
      setFile(null);
      onSaved?.();
      onClose();
      toast.success("Document uploaded");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload document"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={upload} disabled={busy || !file}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title (optional)">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Defaults to file name"
          />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink2">File</span>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-on-accent hover:file:brightness-110"
          />
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Modal>
  );
}
