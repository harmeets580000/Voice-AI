/**
 * Knowledge feature: upload a master document (our source of truth), push a working copy to
 * the voice provider's knowledge base via the PORT, and mirror its file id locally
 * (KnowledgeBaseFile). Delete removes both. Files are kept lean (<~300KB, Research §3.2).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { tenantDb } from "@server/platform/db/scoped";
import { prisma } from "@server/platform/db/client";
import { AppError } from "@server/platform/http/errors";
import { getVoiceProvider } from "@server/config/providers";

export const MAX_FILE_BYTES = 300 * 1024; // ~300KB

/** Pure size guard (test U-KB-06). */
export function assertFileSize(bytes: number): void {
  if (bytes <= 0) throw AppError.badRequest("Empty file");
  if (bytes > MAX_FILE_BYTES) {
    throw AppError.badRequest(
      `File too large (${bytes} bytes; max ${MAX_FILE_BYTES}).`,
    );
  }
}

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

async function storeMaster(
  orgId: string,
  docId: string,
  fileName: string,
  content: Buffer,
): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, orgId);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${docId}-${fileName}`);
  await fs.writeFile(dest, content);
  return dest;
}

export interface UploadInput {
  title: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export async function uploadDocument(orgId: string, input: UploadInput) {
  assertFileSize(input.content.byteLength);
  const db = tenantDb(orgId);

  // 1) Master copy (source of truth).
  const doc = await db.document.create({
    data: {
      organizationId: orgId,
      title: input.title,
      storagePath: "",
      mimeType: input.mimeType,
      sizeBytes: input.content.byteLength,
    },
  });
  const storagePath = await storeMaster(orgId, doc.id, input.fileName, input.content);
  await db.document.update({
    where: { id: doc.id },
    data: { storagePath },
  });

  // 2) Push working copy to the provider KB via the port; mirror the file id.
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
    select: { vapiKnowledgeBaseId: true, vapiAssistantId: true },
  });

  const kbFile = await db.knowledgeBaseFile.create({
    data: {
      organizationId: orgId,
      documentId: doc.id,
      sizeBytes: input.content.byteLength,
      syncStatus: "pending",
    },
  });

  try {
    const result = await getVoiceProvider().uploadKnowledgeFile({
      organizationId: orgId,
      knowledgeBaseId: cfg?.vapiKnowledgeBaseId ?? undefined,
      assistantId: cfg?.vapiAssistantId ?? undefined,
      fileName: input.fileName,
      content: input.content,
      mimeType: input.mimeType,
    });
    await db.knowledgeBaseFile.update({
      where: { id: kbFile.id },
      data: {
        vapiFileId: result.fileId,
        vapiKnowledgeBaseId: result.knowledgeBaseId ?? null,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
      },
    });
  } catch (e) {
    await db.knowledgeBaseFile.update({
      where: { id: kbFile.id },
      data: {
        syncStatus: "failed",
        syncError: e instanceof Error ? e.message : String(e),
      },
    });
  }

  return getDocument(orgId, doc.id);
}

export async function listDocuments(orgId: string) {
  return tenantDb(orgId).document.findMany({
    orderBy: { uploadedAt: "desc" },
    include: { kbFiles: true },
  });
}

export async function getDocument(orgId: string, docId: string) {
  const doc = await tenantDb(orgId).document.findFirst({
    where: { id: docId },
    include: { kbFiles: true },
  });
  if (!doc) throw AppError.notFound("Document not found");
  return doc;
}

export async function deleteDocument(orgId: string, docId: string) {
  const db = tenantDb(orgId);
  const doc = await getDocument(orgId, docId);

  // Remove provider working copies via the port.
  for (const kb of doc.kbFiles) {
    if (kb.vapiFileId) {
      try {
        await getVoiceProvider().deleteKnowledgeFile({
          organizationId: orgId,
          fileId: kb.vapiFileId,
          knowledgeBaseId: kb.vapiKnowledgeBaseId ?? undefined,
        });
      } catch {
        /* best-effort; row removal still proceeds */
      }
    }
  }
  await db.knowledgeBaseFile.deleteMany({ where: { documentId: docId } });
  await db.document.deleteMany({ where: { id: docId } });
  if (doc.storagePath) await fs.rm(doc.storagePath).catch(() => {});
  return { deleted: true };
}
