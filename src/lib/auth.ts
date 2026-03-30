import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "./auth/constants";

export type UserRole = "admin" | "super-admin";

interface AuthUser {
  username: string;
  password: string;
  role: UserRole;
  name: string;
}

interface SessionPayload {
  username: string;
  role: UserRole;
  name: string;
  exp: number;
}

export interface AuthSession {
  username: string;
  role: UserRole;
  name: string;
}

const SESSION_DURATION_SECONDS = 60 * 60 * 12;
const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

function getSessionSecret(): string {
  return process.env.MOORINGS_SESSION_SECRET?.trim() || "moorings-ms-dev-secret-change-me";
}

function configuredUsers(): AuthUser[] {
  const adminUser = process.env.MOORINGS_AUTH_ADMIN_USERNAME?.trim() || "admin";
  const adminPassword = process.env.MOORINGS_AUTH_ADMIN_PASSWORD?.trim() || "admin123";
  const adminName = process.env.MOORINGS_AUTH_ADMIN_NAME?.trim() || "Admin";

  const superAdminUser = process.env.MOORINGS_AUTH_SUPER_ADMIN_USERNAME?.trim() || "superadmin";
  const superAdminPassword = process.env.MOORINGS_AUTH_SUPER_ADMIN_PASSWORD?.trim() || "super123";
  const superAdminName = process.env.MOORINGS_AUTH_SUPER_ADMIN_NAME?.trim() || "Super Admin";

  return [
    {
      username: adminUser,
      password: adminPassword,
      role: "admin",
      name: adminName,
    },
    {
      username: superAdminUser,
      password: superAdminPassword,
      role: "super-admin",
      name: superAdminName,
    },
  ];
}

function safeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function encodeSession(payload: SessionPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function decodeSession(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEquals(expectedSignature, signature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed?.username || !parsed?.role || !parsed?.name || !parsed?.exp) {
      return null;
    }
    if (parsed.exp <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  if (trimmed.startsWith("/login")) {
    return fallback;
  }

  return trimmed;
}

export function getQueryValue(
  query: string | string[] | undefined,
  fallback = "",
): string {
  if (typeof query === "string") {
    return query;
  }
  if (Array.isArray(query)) {
    return query[0] ?? fallback;
  }
  return fallback;
}

export function authenticateUser(
  usernameRaw: string,
  passwordRaw: string,
): AuthSession | null {
  const username = usernameRaw.trim();
  const password = passwordRaw;
  if (!username || !password) {
    return null;
  }

  for (const user of configuredUsers()) {
    if (safeEquals(user.username.toLowerCase(), username.toLowerCase()) && safeEquals(user.password, password)) {
      return {
        username: user.username,
        role: user.role,
        name: user.name,
      };
    }
  }

  return null;
}

export async function createSession(session: AuthSession): Promise<void> {
  const payload: SessionPayload = {
    username: session.username,
    role: session.role,
    name: session.name,
    exp: Date.now() + SESSION_DURATION_MS,
  };

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const payload = decodeSession(token);
  if (!payload) {
    return null;
  }

  return {
    username: payload.username,
    role: payload.role,
    name: payload.name,
  };
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
