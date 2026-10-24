import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  /** Legacy internal identifier; never used for interactive sign-in. */
  email?: string;
  phone?: string | null;
  username?: string | null;
  accountType?: "PARENT" | "TEACHER" | null;
  identityVerified?: boolean;
  sessionVersion?: number;
  name: string;
  avatarKey?: string | null;
  role: "USER" | "ADMIN";
};

/** Public interactions intentionally do not require an account. The hidden
 * technical actor keeps the existing relational schema intact while the UI
 * remains anonymous and open to every visitor. */
export const PUBLIC_ACTOR = {
  id: "public-participant",
  email: "public-participant@local.invalid",
  name: "参与者",
  role: "USER",
} satisfies SessionUser;

export async function getPublicActor(): Promise<SessionUser> {
  try {
    const actor = await prisma.user.upsert({
      where: { email: PUBLIC_ACTOR.email },
      update: { name: PUBLIC_ACTOR.name, role: PUBLIC_ACTOR.role },
      create: {
        id: PUBLIC_ACTOR.id,
        email: PUBLIC_ACTOR.email,
        name: PUBLIC_ACTOR.name,
        role: PUBLIC_ACTOR.role,
        passwordHash: "public-interaction-disabled",
      },
    });
    return actor;
  } catch {
    // The caller will return a service-unavailable response if the database
    // itself is unavailable; keeping this helper non-throwing preserves that
    // route-level error handling.
  }
  return PUBLIC_ACTOR;
}

const cookieName = "gk_session";
const adminCookieName = "gk_admin_session";
export const ADMIN_PHONE = "13967719299";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-secret-change-before-production",
);
const hasSecureAdminSecret = () => process.env.NODE_ENV !== "production"
  || typeof process.env.AUTH_SECRET === "string" && Buffer.byteLength(process.env.AUTH_SECRET) >= 32;

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({...user, sessionVersion: user.sessionVersion ?? 0})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function createAdminSmsSession(userId: string) {
  if (!hasSecureAdminSecret()) throw new Error("Secure administrator session signing is unavailable");
  const token = await new SignJWT({kind: "admin-sms"})
    .setProtectedHeader({alg: "HS256"})
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
  const cookieStore = await cookies();
  cookieStore.set(adminCookieName, token, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 15,
  });
}

export async function clearAdminSmsSession() {
  const cookieStore = await cookies();
  cookieStore.delete(adminCookieName);
}

export async function getAdminSmsSession(): Promise<SessionUser | null> {
  try {
    if (!hasSecureAdminSecret()) return null;
    const token = (await cookies()).get(adminCookieName)?.value;
    if (!token) return null;
    const {payload} = await jwtVerify(token, secret);
    if (payload.kind !== "admin-sms" || typeof payload.sub !== "string") return null;
    const current = await prisma.user.findUnique({where: {id: payload.sub}, select: {id: true, name: true, phone: true, role: true}});
    if (!current || current.role !== "ADMIN" || current.phone !== ADMIN_PHONE) return null;
    return current;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, secret);
    const payload = verified.payload as SessionUser;

    if (typeof payload.id !== "string" || !["USER", "ADMIN"].includes(payload.role)) {
      return null;
    }

    const current = await prisma.user.findUnique({where: {id: payload.id}, select: {id: true, username: true, phone: true, accountType: true, identityVerified: true, name: true, avatarKey: true, role: true, sessionVersion: true}});
    if (!current || current.sessionVersion !== (payload.sessionVersion ?? 0)) return null;
    return current;
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const user = await getSessionUser();

  if (!user || user.role !== "ADMIN") {
    return null;
  }

  return user;
}

export async function getFreshSessionUser(): Promise<SessionUser | null> {
  return getSessionUser();
}
