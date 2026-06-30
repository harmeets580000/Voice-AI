/**
 * Fake EmailProvider — records sends in memory and logs them. Default in dev/tests so the suite
 * never sends real email and can assert what would have been sent (inject via setEmailProvider).
 */

import { logger } from "@server/platform/logging/logger";
import type {
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from "@server/ports/email.port";

export class FakeEmailProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: SendEmailInput[] = [];

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(input);
    logger.info("fake email (not sent)", { to: input.to, subject: input.subject });
    return { id: `fake_${this.sent.length}`, raw: { fake: true } };
  }
}
