import nodemailer from "nodemailer";

export const hasSmtp = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
}

/** Wysyłka przez SMTP skonfigurowany w zmiennych środowiskowych (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) */
export async function sendMail(msg: { to: string; subject: string; html: string; replyTo?: string; attachments?: MailAttachment[] }) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, ...msg });
}
