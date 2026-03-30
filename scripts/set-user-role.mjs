#!/usr/bin/env node

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const ALLOWED_ROLES = new Set(["viewer", "admin", "super-admin"]);
const ROLE_COLLECTION = process.env.MOORINGS_USER_ROLES_COLLECTION?.trim() || "user_roles";

const email = readArg("--email");
const role = readArg("--role");

if (!email) {
  fail('Missing --email. Example: npm run set-role -- --email user@company.com --role admin');
}

if (!ALLOWED_ROLES.has(role)) {
  fail('Invalid --role. Use one of: viewer, admin, super-admin');
}

const app = initializeFirebaseAdminApp();
const auth = getAuth(app);
const db = getFirestore(app);

try {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await auth.getUserByEmail(normalizedEmail);

  await db
    .collection(ROLE_COLLECTION)
    .doc(user.uid)
    .set(
      {
        uid: user.uid,
        email: normalizedEmail,
        role,
        updatedAt: FieldValue.serverTimestamp(),
        promotedBy: process.env.USER || process.env.USERNAME || "operator",
      },
      { merge: true },
    );

  await auth.setCustomUserClaims(user.uid, { role });

  console.log(
    `Updated role for ${normalizedEmail} -> ${role}. User UID: ${user.uid}. Collection: ${ROLE_COLLECTION}`,
  );
  process.exit(0);
} catch (error) {
  console.error("Unable to update user role:", error instanceof Error ? error.message : error);
  process.exit(1);
}

function initializeFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  if (!projectId) {
    fail("Missing FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID).");
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
      projectId,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }
  return process.argv[index + 1]?.trim() || "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
