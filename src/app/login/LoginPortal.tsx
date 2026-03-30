"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getFirebaseClientAuth } from "@/lib/firebase/client";

import styles from "./login.module.css";

type LoginMode = "signin" | "signup";

interface LoginPortalProps {
  nextPath: string;
  signedOut: boolean;
}

export function LoginPortal({ nextPath, signedOut }: LoginPortalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        throw new Error("Please enter your email address.");
      }
      if (!password.trim()) {
        throw new Error("Please enter your password.");
      }

      if (mode === "signup") {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
      }

      const auth = getFirebaseClientAuth();
      const credential =
        mode === "signup"
          ? await createUserWithEmailAndPassword(auth, normalizedEmail, password)
          : await signInWithEmailAndPassword(auth, normalizedEmail, password);

      const idToken = await credential.user.getIdToken();
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(result?.message || "Unable to create server session.");
      }

      await signOut(auth).catch(() => {
        // Server cookie controls app auth; this sign-out only clears client SDK state.
      });

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setErrorMessage(readableAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {signedOut ? <p className={`${styles.notice} ${styles.noticeInfo}`}>You have been signed out successfully.</p> : null}
      {errorMessage ? <p className={`${styles.notice} ${styles.noticeError}`}>{errorMessage}</p> : null}

      <div className={styles.modeSwitch} role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          className={mode === "signin" ? `${styles.modeButton} ${styles.modeButtonActive}` : styles.modeButton}
          onClick={() => setMode("signin")}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={mode === "signup" ? `${styles.modeButton} ${styles.modeButtonActive}` : styles.modeButton}
          onClick={() => setMode("signup")}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} className={styles.loginForm}>
        <label className={styles.field}>
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            required
            className={styles.input}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="••••••••"
            required
            className={styles.input}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {mode === "signup" ? (
          <label className={styles.field}>
            <span>Confirm Password</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
              className={styles.input}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        ) : null}

        <button type="submit" className={styles.submitButton} disabled={submitting}>
          {submitting ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}
        </button>

        <p className={styles.helperText}>
          New users are automatically assigned as <strong>Viewer</strong>. Promote to Admin or Super Admin by email
          from your management side.
        </p>
      </form>
    </>
  );
}

function readableAuthError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes("auth/invalid-credential")) {
      return "Invalid email or password.";
    }
    if (message.includes("auth/email-already-in-use")) {
      return "An account with this email already exists. Please sign in instead.";
    }
    if (message.includes("auth/weak-password")) {
      return "Password is too weak. Please use a stronger password.";
    }
    if (message.includes("auth/user-not-found")) {
      return "No account found for this email.";
    }
    if (message.includes("auth/wrong-password")) {
      return "Incorrect password.";
    }
    return message;
  }
  return "Unable to authenticate right now. Please try again.";
}
