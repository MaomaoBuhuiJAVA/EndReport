import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
};

/** Public interactions intentionally do not require an account. The hidden
 * technical actor keeps the existing relational schema intact while the UI
 * remains anonymous and open to every visitor. */
export const PUBLIC_ACTOR: SessionUser = {
  id: "public-participant",
  email: "public-participant@local.invalid",
  name: "参与者",
  role: "USER",
};

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
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-secret-change-before-production",
);

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
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

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, secret);
    const payload = verified.payload as SessionUser;

    if (!payload.id || !payload.email || !payload.role) {
      return null;
    }

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
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

export async function getFreshSessionUser() {
  const session = await getSessionUser();

  if (!session) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true },
  });
}
