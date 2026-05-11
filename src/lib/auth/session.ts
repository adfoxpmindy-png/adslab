import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";

export type SessionData = {
  userId?: string;
  email?: string;
  name?: string;
};

function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password) {
    throw new Error("SESSION_SECRET is not set in environment");
  }
  return {
    password,
    cookieName: "adslab_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      // 30 days
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

export async function requireSession(): Promise<
  IronSession<SessionData> & { userId: string; email: string }
> {
  const session = await getSession();
  if (!session.userId || !session.email) {
    redirect("/login");
  }
  return session as IronSession<SessionData> & { userId: string; email: string };
}

export async function clearSession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
