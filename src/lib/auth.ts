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
  const db = getFirebaseAdminDb();
  const roleRef = db.collection(USER_ROLES_COLLECTION).doc(uid);
  const roleDoc = await roleRef.get();

  if (roleDoc.exists) {
    const role = roleDoc.data()?.role;
    if (isUserRole(role)) {
      return role;
    }
  }

  const fallbackRole = isUserRole(tokenRole) ? tokenRole : "viewer";
  await roleRef.set(
    {
      uid,
      email: email.toLowerCase(),
      role: fallbackRole,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return fallbackRole;
}

export async function createSessionFromIdToken(idTokenRaw: string): Promise<AuthSession> {
  const idToken = idTokenRaw.trim();
  if (!idToken) {
    throw new Error("Missing Firebase ID token.");
  }

  const auth = getFirebaseAdminAuth();
  const decoded = await auth.verifyIdToken(idToken);

  const email = decoded.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("Authenticated user does not have an email address.");
  }

  const role = await resolveRole(decoded.uid, email, decoded.role);
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION_MS,
  });

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
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
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
