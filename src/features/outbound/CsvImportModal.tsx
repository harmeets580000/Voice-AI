"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Modal } from "@shared/ui/Modal";
import { Button, Select, Field } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import type { ImportSummaryDTO } from "@contracts/outbound-contacts";

export interface CsvField {
  key: string;
  label: string;
  required?: boolean;
}

export interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The target fields a CSV column can map to. */
  fields: CsvField[];
  /** Shape mapped rows + POST them; returns the server summary. */
  onImport: (args: {
    filename: string;
    mapping: Record<string, string>;
    parsedRows: Record<string, string>[];
  }) => Promise<ImportSummaryDTO>;
  /** Invalidate lists after a successful import. */
  onDone?: () => void;
}

/** Guess a column for a field by matching key/label against the CSV headers. */
function autoMap(fields: CsvField[], headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields) {
    const hit = headers.find((h) => {
      const n = h.toLowerCase().replace(/[^a-z]/g, "");
      return n === f.key.toLowerCase() || n.includes(f.key.toLowerCase());
    });
    if (hit) map[f.key] = hit;
  }
  return map;
}

export function CsvImportModal({
  open,
  onClose,
  title,
  fields,
  onImport,
  onDone,
}: CsvImportModalProps) {
  const toast = useToast();
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummaryDTO | null>(null);

  function reset() {
    setFilename("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setSummary(null);
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  function onFile(file: File | null) {
    if (!file) return;
    setSummary(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = (res.meta.fields ?? []).filter(Boolean);
        setHeaders(cols);
        setRows(res.data);
        setFilename(file.name);
        setMapping(autoMap(fields, cols));
      },
      error: () => toast.error("Could not parse the CSV file"),
    });
  }

  async function runImport() {
    const missing = fields.filter((f) => f.required && !mapping[f.key]);
    if (missing.length > 0) {
      toast.error(`Map a column for: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setBusy(true);
    try {
      const result = await onImport({ filename, mapping, parsedRows: rows });
      setSummary(result);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="lg"
      footer={
        summary ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={runImport} disabled={busy || rows.length === 0}>
              {busy ? "Importing…" : `Import ${rows.length || ""}`.trim()}
            </Button>
          </>
        )
      }
    >
      {summary ? (
        <div className="space-y-2 text-sm">
          <p className="text-text">
            Imported <strong>{summary.imported}</strong> · Skipped{" "}
            <strong>{summary.skipped}</strong> of {summary.total} rows.
          </p>
          {summary.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2 text-xs text-muted">
              {summary.errors.slice(0, 100).map((e, i) => (
                <div key={i}>
                  Row {e.row}: {e.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Upload a CSV with a header row. You&apos;ll map its columns next.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:text-on-accent hover:file:brightness-110"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {rows.length} rows from <strong>{filename}</strong>. Map columns:
          </p>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                required={f.required}
              >
                <Select
                  value={mapping[f.key] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => {
                      const next = { ...m };
                      if (e.target.value) next[f.key] = e.target.value;
                      else delete next[f.key];
                      return next;
                    })
                  }
                >
                  <option value="">— none —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
