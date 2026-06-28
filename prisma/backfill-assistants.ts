/**
 * Backfill: multi-assistant migration (M-A1).
 *
 * The model moved from "one assistant per org" (fields on OrgVapiConfig) to N assistants
 * per org (the `Assistant` table) + per-assistant tool/KB selection (join tables). This
 * script seeds one `isDefault` Assistant per existing org from its OrgVapiConfig, then
 * attributes existing Calls, and gives that default assistant the org's currently-synced
 * tools and all its knowledge files (preserving today's behaviour).
 *
 * Idempotent: safe to run repeatedly (keyed on providerAssistantId / unique join rows).
 * Run AFTER applying the schema migration:  tsx prisma/backfill-assistants.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.orgVapiConfig.findMany();
  let createdAssistants = 0;
  let linkedCalls = 0;
  let linkedTools = 0;
  let linkedFiles = 0;

  for (const cfg of configs) {
    // Only orgs that were actually provisioned (have an assistant id) get a default assistant.
    if (!cfg.vapiAssistantId) continue;

    const org = await prisma.organization.findUnique({
      where: { id: cfg.organizationId },
      select: { name: true },
    });

    // 1) Default assistant from the org's single OrgVapiConfig.
    const existing = await prisma.assistant.findUnique({
      where: { providerAssistantId: cfg.vapiAssistantId },
    });
    const assistant =
      existing ??
      (await prisma.assistant.create({
        data: {
          organizationId: cfg.organizationId,
          name: org?.name ?? "Default assistant",
          isDefault: true,
          provider: cfg.provider,
          providerAssistantId: cfg.vapiAssistantId,
          providerPhoneNumberId: cfg.vapiPhoneNumberId,
          providerPhoneNumber: cfg.vapiPhoneNumber,
          providerKnowledgeBaseId: cfg.vapiKnowledgeBaseId,
          greeting: cfg.greeting,
          prompt: cfg.prompt,
          voice: cfg.voice,
          llmModel: cfg.llmModel,
          syncStatus: cfg.syncStatus,
          lastSyncedAt: cfg.lastSyncedAt,
        },
      }));
    if (!existing) createdAssistants++;

    // 2) Attribute existing calls for this assistant.
    const callRes = await prisma.call.updateMany({
      where: {
        organizationId: cfg.organizationId,
        vapiAssistantId: cfg.vapiAssistantId,
        assistantId: null,
      },
      data: { assistantId: assistant.id },
    });
    linkedCalls += callRes.count;

    // 3) Give the default assistant the org's currently-synced tools.
    const tools = await prisma.vapiTool.findMany({
      where: { organizationId: cfg.organizationId, enabled: true },
    });
    for (const tool of tools) {
      const linked = await prisma.assistantTool.findUnique({
        where: { assistantId_toolId: { assistantId: assistant.id, toolId: tool.id } },
      });
      if (!linked) {
        await prisma.assistantTool.create({
          data: {
            organizationId: cfg.organizationId,
            assistantId: assistant.id,
            toolId: tool.id,
          },
        });
        linkedTools++;
      }
    }

    // 4) Give the default assistant the org's existing knowledge files.
    const files = await prisma.knowledgeBaseFile.findMany({
      where: { organizationId: cfg.organizationId },
    });
    for (const file of files) {
      const linked = await prisma.assistantKnowledgeFile.findUnique({
        where: { assistantId_fileId: { assistantId: assistant.id, fileId: file.id } },
      });
      if (!linked) {
        await prisma.assistantKnowledgeFile.create({
          data: {
            organizationId: cfg.organizationId,
            assistantId: assistant.id,
            fileId: file.id,
          },
        });
        linkedFiles++;
      }
    }
  }

  console.log(
    `Backfill done: ${createdAssistants} assistants created, ${linkedCalls} calls linked, ` +
      `${linkedTools} tool selections, ${linkedFiles} knowledge selections.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
