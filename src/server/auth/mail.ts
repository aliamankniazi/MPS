/**
 * Sends the two emails the app needs: "approve this sign-in" and "reset your
 * password". Settings come from the environment (same names as Quarrybook):
 *
 *   SMTP_URL    smtps://user:pass@host:465
 *   MAIL_FROM   "PumpPal <no-reply@example.com>"
 *
 * On this PC, with no SMTP_URL, the link is printed in the server's console
 * instead so sign-in can be tried without a mail account.
 */
import nodemailer from 'nodemailer';

export type Mail = { to: string; subject: string; text: string; link: string };

export class MailNotConfiguredError extends Error {
  constructor() {
    super('Email is not set up on the server yet, so the link could not be sent.');
  }
}

/** Replaced in tests to capture mail instead of sending it. */
export let deliver = async (mail: Mail): Promise<void> => {
  const smtp = process.env.SMTP_URL;
  if (!smtp) {
    if (process.env.NODE_ENV === 'production') throw new MailNotConfiguredError();
    console.log(`[mail] (not sent, no SMTP_URL) to=${mail.to} subject="${mail.subject}"\n[mail] link: ${mail.link}`);
    return;
  }
  const transport = nodemailer.createTransport(smtp);
  await transport.sendMail({ from: process.env.MAIL_FROM ?? 'PumpPal <no-reply@localhost>', to: mail.to, subject: mail.subject, text: mail.text });
};

export function setDeliverForTests(fn: (mail: Mail) => Promise<void>): void {
  deliver = fn;
}

export function sendMail(mail: Mail): Promise<void> {
  return deliver(mail);
}
