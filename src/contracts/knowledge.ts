import { z } from "zod";

export const UploadDocumentRequest = z.object({
  title: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().default("text/plain"),
  /** Base64-encoded file content. */
  contentBase64: z.string().min(1),
});
export type UploadDocumentRequest = z.infer<typeof UploadDocumentRequest>;

export const DocumentDTO = z.object({
  id: z.string(),
  title: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  uploadedAt: z.string(),
  syncStatus: z.enum(["pending", "synced", "failed", "stale"]).nullable(),
  /** The working-copy KnowledgeBaseFile id — what an assistant selects (null if not synced yet). */
  knowledgeFileId: z.string().nullable(),
});
export type DocumentDTO = z.infer<typeof DocumentDTO>;

export const DocumentListResponse = z.object({
  documents: z.array(DocumentDTO),
});
export type DocumentListResponse = z.infer<typeof DocumentListResponse>;
