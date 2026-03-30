"use server";

import { redirect } from "next/navigation";

import {
  authenticateUser,
  clearSession,
  createSession,
  normalizeNextPath,
} from "@/lib/auth";

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextPath = normalizeNextPath(String(formData.get("next") ?? "/"), "/");

  const session = authenticateUser(username, password);
  if (!session) {
    redirect(`/login?error=invalid&next=${encodeURIComponent(nextPath)}`);
  }

  await createSession(session);
  redirect(nextPath);
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login?signed_out=1");
}
