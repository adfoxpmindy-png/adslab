import { resend } from "./client";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.MAIL_FROM;
  if (!from) {
    return { ok: false, error: "MAIL_FROM is not set in environment" };
  }

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.id) {
    return { ok: false, error: "Email API did not return an ID" };
  }
  return { ok: true, id: data.id };
}
