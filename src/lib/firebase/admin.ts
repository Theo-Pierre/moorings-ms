import "server-only";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";

function requiredProjectId(): string {
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  if (!projectId) {
    throw new Error(
      "Firebase project ID is missing. Set FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID).",
    );
  }
  return projectId;
}

function resolveRealtimeDatabaseUrl(projectId: string): string {
  const explicitUrl =
    process.env.FIREBASE_DATABASE_URL?.trim() ||
    process.env.MOORINGS_REALTIME_DATABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const instanceName = process.env.MOORINGS_REALTIME_DATABASE_INSTANCE?.trim() || `${projectId}-default-rtdb`;
  return `https://${instanceName}.firebaseio.com`;
}

function initializeFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId = requiredProjectId();
  const databaseURL = resolveRealtimeDatabaseUrl(projectId);
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (clientEmail && privateKeyRaw) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
          privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
      }),
      projectId,
      databaseURL,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
    databaseURL,
  });
}

export function getFirebaseAdminAuth() {
  return getAuth(initializeFirebaseAdminApp());
}

export function getFirebaseAdminDb() {
  return getFirestore(initializeFirebaseAdminApp());
}

export function getFirebaseAdminRealtimeDb() {
  return getDatabase(initializeFirebaseAdminApp());
}
