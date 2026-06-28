import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
} from "@server/features/knowledge/knowledge.service";

describe.skipIf(!hasTestDb)("knowledge base (I-KB-01..05)", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("I-KB-01/02: upload stores a master doc + KB file synced via the port", async () => {
    const org = await createOrg();
    await uploadDocument(org.id, {
      title: "Hours",
      fileName: "hours.txt",
      mimeType: "text/plain",
      content: Buffer.from("We are open 9-5."),
    });
    const docs = await prisma.document.findMany({ where: { organizationId: org.id } });
    expect(docs).toHaveLength(1);
    const kb = await prisma.knowledgeBaseFile.findMany({
      where: { organizationId: org.id },
    });
    expect(kb).toHaveLength(1);
    expect(kb[0].vapiFileId).toBeTruthy();
    expect(kb[0].syncStatus).toBe("synced");
  });

  it("I-KB-03: delete removes both the master and the KB-file row", async () => {
    const org = await createOrg();
    const doc = await uploadDocument(org.id, {
      title: "T",
      fileName: "t.txt",
      mimeType: "text/plain",
      content: Buffer.from("x"),
    });
    await deleteDocument(org.id, doc.id);
    expect(await prisma.document.count({ where: { organizationId: org.id } })).toBe(0);
    expect(
      await prisma.knowledgeBaseFile.count({ where: { organizationId: org.id } }),
    ).toBe(0);
  });

  it("I-KB-05: an org lists only its own documents", async () => {
    const a = await createOrg({ slug: `a-${Date.now()}` });
    const b = await createOrg({ slug: `b-${Date.now()}` });
    await uploadDocument(a.id, {
      title: "A doc",
      fileName: "a.txt",
      mimeType: "text/plain",
      content: Buffer.from("a"),
    });
    expect(await listDocuments(b.id)).toHaveLength(0);
    expect(await listDocuments(a.id)).toHaveLength(1);
  });
});
