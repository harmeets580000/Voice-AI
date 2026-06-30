/**
 * SendGrid EmailProvider — the ONLY place allowed to import the SendGrid SDK (doc 03 rule 7 /
 * the sdk-isolation architecture test). Translates our neutral SendEmailInput into a SendGrid
 * payload. Requires SENDGRID_API_KEY + EMAIL_FROM; the fake adapter is used when the key is unset.
 */

import sgMail from "@sendgrid/mail";
import { env } from "@server/config/env";
import type {
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from "@server/ports/email.port";

export class SendGridEmailProvider implements EmailProvider {
  readonly name = "sendgrid";

  constructor() {
    if (env.SENDGRID_API_KEY) sgMail.setApiKey(env.SENDGRID_API_KEY);
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const [res] = await sgMail.send({
      to: input.to,
      from: env.EMAIL_FROM,
      subject: input.subject,
      text: input.text ?? "",
      ...(input.html ? { html: input.html } : {}),
    });
    const messageId =
      (res?.headers as Record<string, string> | undefined)?.["x-message-id"];
    return { id: messageId, raw: res };
  }
}
