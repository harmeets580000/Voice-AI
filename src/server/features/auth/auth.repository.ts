import { prisma } from "@server/platform/db/client";

/** Auth reads users by email/id from the raw client (users aren't org-scoped data). */
export const authRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
};
