import { Resend } from "resend";

const globalForResend = globalThis as unknown as {
  resend: Resend | undefined;
};

function createResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in environment");
  }
  return new Resend(apiKey);
}

export const resend = globalForResend.resend ?? createResendClient();

if (process.env.NODE_ENV !== "production") {
  globalForResend.resend = resend;
}
