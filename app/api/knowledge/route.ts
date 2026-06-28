import { handleRoute, ok, created } from "@server/platform/http/responses";
import {
  UploadDocumentRequest,
  type DocumentDTO,
  type DocumentListResponse,
} from "@contracts/knowledge";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import {
  listDocuments,
  uploadDocument,
} from "@server/features/knowledge/knowledge.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDTO(doc: any): DocumentDTO {
  return {
    id: doc.id,
    title: doc.title,
    mimeType: doc.mimeType ?? null,
    sizeBytes: doc.sizeBytes ?? null,
    uploadedAt: doc.uploadedAt.toISOString(),
    syncStatus: doc.kbFiles?.[0]?.syncStatus ?? null,
  };
}

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  const docs = await listDocuments(organizationId);
  const res: DocumentListResponse = { documents: docs.map(toDTO) };
  return ok(res);
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = UploadDocumentRequest.parse(await req.json());
  const doc = await uploadDocument(organizationId, {
    title: body.title,
    fileName: body.fileName,
    mimeType: body.mimeType,
    content: Buffer.from(body.contentBase64, "base64"),
  });
  return created({ document: toDTO(doc) });
});
