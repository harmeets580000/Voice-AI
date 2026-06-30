/**
 * Email PORT — the interface any email vendor (SendGrid now, Resend/SMTP later) must satisfy,
 * in our own terms. Feature code depends ONLY on this; concrete SDKs live in
 * `src/server/adapters/email/<vendor>/` behind it (doc 03 rule 7). The fake adapter is used in
 * dev/tests so no real email is sent without a configured key.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  /** HTML body (preferred). */
  html?: string;
  /** Plain-text fallback. */
  text?: string;
}

export interface SendEmailResult {
  id?: string;
  raw?: unknown;
}

export interface EmailProvider {
  readonly name: string;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
