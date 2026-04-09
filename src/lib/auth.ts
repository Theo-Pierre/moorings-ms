import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "./auth/constants";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebase/admin";

export type UserRole = "viewer" | "admin" | "super-admin";

const SESSION_DURATION_SECONDS = 60 * 60 * 12;
const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;
const USER_ROLES_COLLECTION = process.env.MOORINGS_USER_ROLES_COLLECTION?.trim() || "user_roles";
const BACKEND_TIMEOUT_MS = clampMs(
  Number(process.env.MOORINGS_BACKEND_TIMEOUT_MS || "2500"),
  500,
  10000,
);
const BOOTSTRAP_SUPER_ADMIN_EMAILS = [
  "bludotads.tm@gmail.com",
  "theo-pierre@bludotads.co.za",
  "adriaan.labuschagne@travelopia.com",
];

function parseEmailList(value: string | undefined): Set<string> {
  if (!value) {
    return new Set<string>();
  }

  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

const superAdminEmailAllowlist = parseEmailList(process.env.MOORINGS_SUPER_ADMIN_EMAILS);
for (const email of BOOTSTRAP_SUPER_ADMIN_EMAILS) {
  superAdminEmailAllowlist.add(email);
}
const adminEmailAllowlist = parseEmailList(process.env.MOORINGS_ADMIN_EMAILS);

export interface AuthSession {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
}

function isUserRole(value: unknown): value is UserRole {
  return value === "viewer" || value === "admin" || value === "super-admin";
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  if (!local) {
    return email;
  }
  return local
    .split(/[.\-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveName(email: string, preferredName?: string | null): string {
  const trimmed = preferredName?.trim();
  if (trimmed) {
    return trimmed;
  }
  return displayNameFromEmail(email);
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

export function getQueryValue(query: string | string[] | undefined, fallback = ""): string {
  if (typeof query === "string") {
    return query;
  }
  if (Array.isArray(query)) {
    return query[0] ?? fallback;
  }
  return fallback;
}

async function resolveRole(uid: string, email: string, tokenRole?: unknown): Promise<UserRole> {
  const normalizedEmail = email.toLowerCase();
  const fallbackRole = resolveRoleByAllowlist(
    normalizedEmail,
    isUserRole(tokenRole) ? tokenRole : "viewer",
  );

  try {
    const db = getFirebaseAdminDb();
    const roleRef = db.collection(USER_ROLES_COLLECTION).doc(uid);
    const roleDoc = await withTimeout(roleRef.get(), BACKEND_TIMEOUT_MS, "Role read timeout");

    if (roleDoc.exists) {
      const storedRole = roleDoc.data()?.role;
      const resolvedRole = resolveRoleByAllowlist(
        normalizedEmail,
        isUserRole(storedRole) ? storedRole : fallbackRole,
      );

      if (isUserRole(storedRole) && storedRole === resolvedRole) {
        return storedRole;
      }

      await withTimeout(
        roleRef.set(
          {
            uid,
            email: normalizedEmail,
            role: resolvedRole,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
        BACKEND_TIMEOUT_MS,
        "Role write timeout",
      );
      return resolvedRole;
    }

    await withTimeout(
      roleRef.set(
        {
          uid,
          email: normalizedEmail,
          role: fallbackRole,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
      BACKEND_TIMEOUT_MS,
      "Role bootstrap write timeout",
    );
    return fallbackRole;
  } catch (error) {
    console.warn(
      "[moorings.ms] Firestore role lookup unavailable, using token/default role.",
      error,
    );
    return fallbackRole;
  }
}

function resolveRoleByAllowlist(email: string, fallbackRole: UserRole): UserRole {
  if (superAdminEmailAllowlist.has(email)) {
    return "super-admin";
  }
  if (adminEmailAllowlist.has(email)) {
    return fallbackRole === "super-admin" ? "super-admin" : "admin";
  }
  return fallbackRole;
}

export async function createSessionFromIdToken(idTokenRaw: string): Promise<AuthSession> {
  const idToken = idTokenRaw.trim();
  if (!idToken) {
    throw new Error("Missing Firebase ID token.");
  }

  const auth = getFirebaseAdminAuth();
  const decoded = await withTimeout(
    auth.verifyIdToken(idToken),
    BACKEND_TIMEOUT_MS,
    "Verify ID token timeout",
  );

  const email = decoded.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("Authenticated user does not have an email address.");
  }

  const role = await resolveRole(decoded.uid, email, decoded.role);
  const sessionCookie = await withTimeout(
    auth.createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    }),
    BACKEND_TIMEOUT_MS,
    "Create session cookie timeout",
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });

  return {
    uid: decoded.uid,
    email,
    name: resolveName(email, decoded.name),
    role,
  };
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const auth = getFirebaseAdminAuth();
    const decoded = await withTimeout(
      auth.verifySessionCookie(sessionCookie, true),
      BACKEND_TIMEOUT_MS,
      "Verify session cookie timeout",
    );
    const email = decoded.email?.trim().toLowerCase();
    if (!email) {
      return null;
    }

    const role = await resolveRole(decoded.uid, email, decoded.role);
    return {
      uid: decoded.uid,
      email,
      name: resolveName(email, typeof decoded.name === "string" ? decoded.name : null),
      role,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

function clampMs(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}
